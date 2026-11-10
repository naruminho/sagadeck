// Votação da plateia pela rede (enquete com live: true; src/vote.js, src/studio/vote-routes.js e o runtime).
// O aluno abre o endereço do QR code no celular e vota; as barras do slide sobem ao vivo. Aqui: o motor, as rotas
// (com a segurança), o voto de verdade por HTTP conferido no slide, e o slide sem rede e sem servidor de votos.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import YAML from "yaml";
import jsQR from "jsqr";
import { buildHTML } from "../src/build.js";
import { livePolls, voteKey } from "../src/vote.js";
import { voteURL } from "../src/studio/vote-routes.js";
import { newPage, startStudio, tempDeck } from "./helpers.js";

const DECK = { title: "Aula de Estatística", theme: "sinal", slides: [
  { layout: "statement", text: "Abertura da aula", notes: "SEGREDO DO APRESENTADOR" },
  { layout: "poll", id: "antes", live: true, question: "A média resume bem os salários?", options: ["Sim", "Não", "Depende"], notes: "NOTA SECRETA DA ENQUETE" },
  { layout: "poll", id: "depois", live: true, compare: "antes", question: "E agora, depois do exemplo?", options: ["Sim", "Não", "Depende"] },
  { layout: "poll", id: "digitada", question: "Só digitada", options: ["Um", "Dois"] },
] };
const ID = "Aulas/Aula 1/Aula 1.yaml";
const ANA = { "X-Sagadeck-User": "ana" };
const device = (n) => `aparelho-de-teste-${String(n).padStart(4, "0")}`;

function raw(url, { method = "GET", headers = {}, body, text } = {}) {
  const u = new URL(url);
  const payload = text ?? (body === undefined ? undefined : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const data = Buffer.concat(chunks).toString("utf8"); resolve({ status: res.statusCode, headers: res.headers, body: data, json: () => JSON.parse(data) }); });
    });
    req.on("error", reject);
    req.end(payload);
  });
}
const dataOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="sagadeck-data">([\s\S]*?)<\/script>/)[1]);

// servidor multiusuário com o deck na biblioteca da Ana, aberto, e um link público de compartilhamento
async function classroom(opts = {}) {
  const studio = await startStudio(null, { multiuser: true, ...opts });
  const file = path.join(studio.library, "usuarios", "ana", ...ID.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify(DECK));
  assert.equal((await raw(`${studio.url}/api/library/open`, { method: "POST", headers: ANA, body: { id: ID } })).status, 200);
  const link = (await raw(`${studio.url}/api/share`, { method: "POST", headers: ANA, body: { publico: true } })).json().link;
  const view = await raw(`${studio.url}/${link.path}`);
  assert.equal(view.status, 200);
  const vote = dataOf(view.body).vote;
  assert.ok(vote, "o link de compartilhamento leva o endereço da sala de votos");
  const code = vote.url.split("/").pop();
  const base = `${studio.url}/voto/${code}`;
  const cast = (poll, o, n, extra = {}) => raw(`${base}/${poll}`, { method: "POST", body: { o, d: device(n) }, ...extra });
  const result = async () => (await raw(`${base}/resultado`, { headers: { "X-Voto-Chave": vote.key } })).json();
  return { studio, file, link, view, vote, code, base, cast, result };
}

test("motor: live: true marca a enquete para a rede; sem o servidor de votos o HTML não leva endereço nem biblioteca de QR", () => {
  const plain = buildHTML(structuredClone(DECK));
  // (sem assert.match no HTML inteiro: a falha despejaria a página toda)
  assert.ok(/data-poll="antes"[^>]*data-net="antes"/.test(plain.html));
  assert.ok(plain.html.includes('class="po-net"'));
  assert.ok(!/data-poll="digitada"[^>]*data-net/.test(plain.html), "enquete sem live fica como sempre");
  assert.equal(plain.meta.vote, undefined);
  assert.ok(!plain.html.includes("QR Code Generator for JavaScript"), "sem sala de votos, a biblioteca do QR não entra");
  const served = buildHTML({ ...structuredClone(DECK), _vote: { url: "../voto/abc234", key: "chave" } });
  assert.deepEqual(dataOf(served.html).vote, { url: "../voto/abc234", key: "chave" });
  assert.ok(served.html.includes("QR Code Generator for JavaScript"));
  // deck sem enquete ao vivo não ganha nada, mesmo servido pelo Studio
  const none = buildHTML({ title: "Sem voto", slides: [DECK.slides[3]], _vote: { url: "voto/x", key: "k" } });
  assert.equal(dataOf(none.html).vote, undefined);
  assert.ok(!/class="po-net"|QR Code Generator/.test(none.html));

  const polls = livePolls({ slides: [...DECK.slides,
    { layout: "poll", id: "Decisão Final", live: true, manual: true, question: "Reunião", options: ["A", "B"] },
    { layout: "blocks", title: "Dentro de blocos", content: [{ poll: "No Bloco!", live: true, options: ["**Sim**", { label: "Não" }] }] }] });
  assert.deepEqual([...polls.keys()], ["antes", "depois", "no-bloco"], "só as com live; a de decisão (manual) não vota pela rede");
  assert.deepEqual(polls.get("no-bloco"), { question: "Dentro de blocos", options: ["Sim", "Não"] }, "texto puro, sem marcação");
  assert.equal(voteKey("Opinião #1 (antes)"), "opiniao-1-antes");
  // o endereço da sala é relativo à página que mostra a apresentação (o Studio não conhece o prefixo do proxy)
  assert.equal(voteURL("/preview", "abc"), "voto/abc");
  assert.equal(voteURL("/publico/tok", "abc"), "../voto/abc");
  assert.equal(voteURL("/ver/tok/", "abc"), "../../voto/abc");
});

test("rotas: votar, trocar o voto, contar e zerar; quem só vota não vê o deck, as notas nem a contagem", async () => {
  const c = await classroom();
  const { studio, base, vote, code, link } = c;
  try {
    // a mesma sala no Apresentar do Studio e no link; o HTML baixado não leva a votação
    const preview = await raw(`${studio.url}/preview`, { headers: ANA });
    assert.deepEqual(dataOf(preview.body).vote, { url: `voto/${code}`, key: vote.key });
    assert.equal(vote.url, `../voto/${code}`);
    const baixado = await raw(`${studio.url}/${link.path}/baixar/html`);
    assert.equal(dataOf(baixado.body).vote, undefined);
    assert.ok(!baixado.body.includes("QR Code Generator"));

    // a página do celular: só a pergunta e as opções desta enquete
    const page = await raw(`${base}/antes`);
    assert.equal(page.status, 200);
    assert.ok(page.body.includes("A média resume bem os salários?"));
    for (const o of ["Sim", "Não", "Depende"]) assert.ok(page.body.includes(`<span>${o}</span>`));
    for (const leak of ["SEGREDO", "NOTA SECRETA", "Abertura da aula", "E agora", "Aula de Estatística", link.token, vote.key]) assert.ok(!page.body.includes(leak), `a página de voto não mostra "${leak}"`);
    assert.ok(!/https?:\/\/|@import|url\(|<link|src=/i.test(page.body), "nada de fora: sem CDN, sem fonte da web");
    assert.match(page.headers["content-security-policy"], /default-src 'none'.*frame-ancestors 'none'/);
    assert.match(page.headers["x-robots-tag"], /noindex/);
    assert.equal(page.headers["cache-control"], "no-store");
    assert.equal(page.headers["referrer-policy"], "no-referrer");
    assert.equal(page.headers["set-cookie"], undefined, "sem cookie");

    // o que não existe não aparece, e do código de voto não se chega a mais nada
    for (const p of [`${base}/digitada`, `${base}/nao-existe`, `${studio.url}/voto/zzzzzzzzzz/antes`, `${studio.url}/voto`, `${studio.url}/voto/`, base, `${base}/antes/zerar`, `${base}/../../api/deck`]) {
      const r = await raw(p);
      assert.ok([401, 404].includes(r.status), `${p}: ${r.status}`);
      assert.ok(!r.body.includes("SEGREDO") && !r.body.includes("Abertura da aula"));
    }
    // o código de voto não abre a apresentação (não é um código de link)
    assert.ok([401, 404].includes((await raw(`${studio.url}/publico/${code}`)).status));
    assert.ok(!(await raw(`${studio.url}/ver/${code}`, { headers: ANA })).body.includes("Abertura da aula"));

    // a contagem é só de quem apresenta (a chave vai no HTML da apresentação, não no QR)
    assert.equal((await raw(`${base}/resultado`)).status, 403);
    assert.equal((await raw(`${base}/resultado`, { headers: { "X-Voto-Chave": "x".repeat(vote.key.length) } })).status, 403);
    assert.deepEqual(await c.result(), { publico: true, polls: {} });

    // votar; o mesmo aparelho troca o voto em vez de somar
    assert.deepEqual((await c.cast("antes", 1, 1)).json(), { ok: true, o: 1 });
    await c.cast("antes", 1, 2);
    await c.cast("antes", 2, 3);
    assert.deepEqual((await c.result()).polls.antes.votos, [0, 2, 1]);
    await c.cast("antes", 0, 3);
    assert.deepEqual((await c.result()).polls.antes.votos, [1, 2, 0], "trocou, não somou");
    await c.cast("depois", 2, 1);
    const both = (await c.result()).polls;
    assert.deepEqual(both.depois.votos, [0, 0, 1], "cada enquete conta à parte");
    assert.ok(both.antes.rodada && both.antes.rodada !== both.depois.rodada);

    // entrada inválida
    const bad = (o, d, extra) => raw(`${base}/antes`, { method: "POST", body: { o, d }, ...extra });
    assert.equal((await bad(3, device(9))).status, 400, "opção que não existe");
    assert.equal((await bad(-1, device(9))).status, 400);
    assert.equal((await bad("1", device(9))).status, 400);
    assert.equal((await bad(1.5, device(9))).status, 400);
    assert.equal((await bad(1, "curto")).status, 400);
    assert.equal((await bad(1, "<script>alert(1)</script>")).status, 400);
    assert.equal((await raw(`${base}/antes`, { method: "POST", text: "não é json" })).status, 400);
    assert.equal((await raw(`${base}/antes`, { method: "POST", text: "[1,2]" })).status, 400);
    assert.equal((await raw(`${base}/antes`, { method: "POST", text: JSON.stringify({ o: 1, d: device(9), lixo: "x".repeat(3000) }) })).status, 413, "corpo grande demais");
    assert.equal((await raw(`${base}/antes`, { method: "PUT", body: { o: 1, d: device(9) } })).status, 405);
    assert.equal((await raw(`${base}/antes`, { method: "DELETE" })).status, 405);
    assert.equal((await raw(`${base}/digitada`, { method: "POST", body: { o: 0, d: device(9) } })).status, 404, "enquete sem live não recebe voto");
    assert.equal((await bad(1, device(9), { headers: { Origin: "http://malicioso.exemplo" } })).status, 403, "outro site não vota pelo navegador de ninguém");
    assert.deepEqual((await c.result()).polls.antes.votos, [1, 2, 0], "nada disso contou");

    // sem a entrada pública no proxy, o pedido chega com o usuário do portal: a plateia não entraria
    assert.deepEqual((await raw(`${base}/resultado`, { headers: { "X-Voto-Chave": vote.key, ...ANA } })).json(), { publico: false });

    // em disco: hash do aparelho e a opção; nenhum identificador, nenhum IP
    await new Promise((r) => setTimeout(r, 1300));
    const disk = fs.readFileSync(path.join(studio.library, ".votos.json"), "utf8");
    assert.ok(!disk.includes("aparelho-de-teste") && !disk.includes("127.0.0.1") && !/\bip\b/i.test(disk));
    const saved = JSON.parse(disk).salas[0];
    assert.equal(saved.code, code);
    assert.deepEqual(Object.values(saved.polls.antes.votos).sort(), [0, 1, 1]);

    // zerar: só com a chave
    assert.equal((await raw(`${base}/antes/zerar`, { method: "POST" })).status, 403);
    assert.equal((await raw(`${base}/antes/zerar`, { method: "POST", headers: { "X-Voto-Chave": vote.key } })).status, 200);
    const after = (await c.result()).polls;
    assert.equal(after.antes, undefined);
    assert.deepEqual(after.depois.votos, [0, 0, 1], "a outra enquete fica");
  } finally { await studio.close(); }
});

test("rotas: os votos somem 12 horas depois do último; a sala e os votos sobrevivem a reiniciar o servidor", async () => {
  let clock = Date.now();
  const c = await classroom({ voteNow: () => clock });
  let again = null;
  try {
    await c.cast("antes", 0, 1);
    clock += 11 * 60 * 60e3;
    await c.cast("antes", 1, 2);
    clock += 11 * 60 * 60e3;
    assert.deepEqual((await c.result()).polls.antes.votos, [1, 1, 0], "11 h depois do último voto ainda vale");
    // reinicia: mesma biblioteca, mesma sala, mesmos votos
    const library = c.studio.library;
    await c.studio.close();
    again = await startStudio(null, { multiuser: true, library, voteNow: () => clock });
    const base = `${again.url}/voto/${c.code}`;
    const result = async () => (await raw(`${base}/resultado`, { headers: { "X-Voto-Chave": c.vote.key } })).json();
    assert.deepEqual((await result()).polls.antes.votos, [1, 1, 0]);
    assert.equal((await raw(`${base}/antes`)).status, 200, "o QR code impresso continua valendo");
    clock += 2 * 60 * 60e3;
    assert.deepEqual((await result()).polls, {}, "13 h depois do último voto: sumiram");
  } finally { await (again || c.studio).close(); }
});

test("rotas: limite de pedidos por IP e por sala, e de aparelhos por enquete", async () => {
  const c = await classroom({ voteLimits: { perIp: 4, perRoom: 9, devices: 2 } });
  const { base, vote } = c;
  try {
    const from = (ip) => ({ headers: { "X-Real-IP": ip } });
    assert.equal((await c.cast("antes", 0, 1, from("10.0.0.1"))).status, 200);
    assert.equal((await c.cast("antes", 1, 2, from("10.0.0.1"))).status, 200);
    const full = await c.cast("antes", 1, 3, from("10.0.0.1"));
    assert.equal(full.status, 429, "enquete cheia");
    assert.equal((await c.cast("antes", 2, 1, from("10.0.0.1"))).status, 200, "quem já votou ainda troca");
    const blocked = await c.cast("antes", 0, 1, from("10.0.0.1"));
    assert.equal(blocked.status, 429, "quinto pedido do mesmo IP no minuto");
    assert.equal(blocked.headers["retry-after"], "30");
    assert.equal((await raw(`${base}/antes`, from("10.0.0.1"))).status, 429, "a página também conta");
    assert.equal((await raw(`${base}/antes`, from("10.0.0.2"))).status, 200, "outro IP segue");
    // a sala inteira tem teto (segura quem troca de IP)
    let last = 200;
    for (let i = 0; i < 6 && last === 200; i++) last = (await raw(`${base}/antes`, from(`10.0.1.${i}`))).status;
    assert.equal(last, 429);
    // quem apresenta (com a chave) consulta a cada 2 s e não entra no limite
    for (let i = 0; i < 12; i++) assert.equal((await raw(`${base}/resultado`, { headers: { "X-Voto-Chave": vote.key, "X-Real-IP": "10.0.0.1" } })).status, 200);
    assert.deepEqual((await c.result()).polls.antes.votos, [0, 1, 1]);
  } finally { await c.studio.close(); }
});

// O Chrome com um nome de servidor de mentira apontando para esta máquina: em 127.0.0.1 o slide (com razão) não mostra
// o QR code, porque a plateia não alcançaria.
async function browserAt(t, host) {
  const { findBrowser } = await import("../src/export/browser.js");
  let exe;
  try { exe = findBrowser(); } catch { t.skip("sem Chrome/Edge — defina SAGADECK_BROWSER"); return null; }
  const { chromium } = await import("playwright-core");
  return chromium.launch({ executablePath: exe, args: [`--host-resolver-rules=MAP ${host} 127.0.0.1`] });
}
// lê o QR code do slide como um celular leria: desenha o SVG num canvas e decodifica os pixels
async function readQR(page, selector) {
  const px = await page.evaluate(async (sel) => {
    const svg = document.querySelector(sel);
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await img.decode();
    const cv = document.createElement("canvas"); cv.width = cv.height = 420;
    const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 420, 420);
    return Array.from(g.getImageData(0, 0, 420, 420).data);
  }, selector);
  return jsQR(Uint8ClampedArray.from(px), 420, 420)?.data;
}
const bars = (page, id) => page.evaluate((id) => [...document.querySelectorAll(`.poll[data-poll="${id}"] .po-row`)].map((r) => [r.querySelector(".po-val").textContent, r.querySelector(".po-fill").style.width]), id);

test("o aluno vota pelo endereço do QR code e as barras do slide sobem ao vivo; compare com votos da rede; zerar; servidor fora do ar", async (t) => {
  const HOST = "aula.exemplo";
  const browser = await browserAt(t, HOST); if (!browser) return;
  const c = await classroom();
  const port = new URL(c.studio.url).port, site = `http://${HOST}:${port}`;
  let closed = false;
  try {
    const { page: slide, errors } = await newPage(browser, `${site}/${c.link.path}#2`, { width: 1440, height: 900 });
    await slide.waitForSelector('.slide.current .poll[data-net="antes"].net-on');
    assert.equal(await slide.locator(".slide.current .po-note").isHidden(), true, "com a votação aberta, sem aviso");
    assert.equal(await slide.locator(".slide.current .po-count").textContent(), "0 votos");
    const box = await slide.locator(".slide.current .po-qr svg").boundingBox();
    assert.ok(box.width > 150 && Math.abs(box.width - box.height) < 2, "QR code quadrado e grande o bastante para a câmera");

    // o endereço que a câmera lê é o de voto desta enquete, no endereço público, e não o do link da apresentação
    const address = await readQR(slide, ".slide.current .po-qr svg");
    assert.equal(address, `${site}/voto/${c.code}/antes`);
    assert.ok(!address.includes(c.link.token));
    assert.equal(await slide.locator(".slide.current .po-url").innerText(), address.replace("http://", ""));

    // o celular: abre o endereço, toca numa opção
    const phone = await browser.newPage({ viewport: { width: 390, height: 780 } });
    const phoneErrors = [];
    phone.on("pageerror", (e) => phoneErrors.push(e.message));
    phone.on("console", (m) => m.type() === "error" && phoneErrors.push(m.text()));
    await phone.goto(address);
    assert.equal(await phone.locator("h1").innerText(), "A média resume bem os salários?");
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "cabe na tela do celular");
    await phone.locator(".op", { hasText: "Não" }).click();
    await phone.waitForFunction(() => /Voto registrado: B/.test(document.getElementById("st").textContent));
    await slide.waitForFunction(() => document.querySelector(".slide.current .po-count").textContent === "1 voto");
    assert.deepEqual(await bars(slide, "antes"), [["0%", "0%"], ["100%", "100%"], ["0%", "0%"]]);

    // mais dois aparelhos, direto por HTTP
    await c.cast("antes", 1, 2);
    await c.cast("antes", 2, 3);
    await slide.waitForFunction(() => document.querySelector(".slide.current .po-count").textContent === "3 votos");
    assert.deepEqual((await bars(slide, "antes")).map((b) => b[0]), ["0%", "67%", "33%"]);
    // o mesmo celular troca o voto: recarrega (lembra o que votou) e toca em outra opção
    await phone.reload();
    assert.equal(await phone.locator('.op[aria-pressed="true"]').innerText(), "B\nNão");
    await phone.locator(".op", { hasText: "Sim" }).click();
    await phone.waitForFunction(() => /Voto registrado: A/.test(document.getElementById("st").textContent));
    await slide.waitForFunction(() => document.querySelector('.slide.current .po-row[data-i="0"] .po-val').textContent === "33%");
    assert.deepEqual((await c.result()).polls.antes.votos, [1, 1, 1], "três aparelhos, três votos");

    // segunda enquete, com compare: a diferença para a primeira aparece com os votos vindos da rede
    await slide.keyboard.press("ArrowRight");
    await slide.waitForSelector('.slide.current .poll[data-net="depois"].net-on');
    assert.equal(await readQR(slide, ".slide.current .po-qr svg"), `${site}/voto/${c.code}/depois`);
    await c.cast("depois", 2, 1);
    await c.cast("depois", 2, 2);
    await slide.waitForFunction(() => document.querySelector(".slide.current .po-count").textContent === "2 votos");
    const third = slide.locator('.slide.current .po-row[data-i="2"]');
    assert.match(await third.locator(".po-val").innerText(), /100%\s*\+67 pts/);
    assert.equal(await third.locator(".po-ghost").evaluate((g) => g.style.opacity), "1");

    // Zerar votos pede confirmação (dois cliques) e limpa no servidor e no slide
    const reset = slide.locator(".slide.current .po-reset");
    await reset.click();
    assert.equal(await reset.textContent(), "Zerar mesmo?");
    assert.deepEqual((await c.result()).polls.depois.votos, [0, 0, 2], "um clique só não zera");
    await reset.click();
    await slide.waitForFunction(() => document.querySelector(".slide.current .po-count").textContent === "0 votos");
    assert.deepEqual((await bars(slide, "depois")).map((b) => b[0]), ["—", "—", "—"]);
    assert.equal((await c.result()).polls.depois, undefined);
    assert.deepEqual(errors, []);
    assert.deepEqual(phoneErrors, []);

    // o servidor cai no meio da aula: o QR code sai, o slide avisa e a digitação segue valendo
    closed = true;
    await c.studio.close();
    await slide.waitForFunction(() => !document.querySelector(".slide.current .poll").classList.contains("net-on") && /Sem resposta do servidor de votos/.test(document.querySelector(".slide.current .po-note").textContent), null, { timeout: 20000 });
    assert.equal(await slide.locator(".slide.current .po-net").isVisible(), false);
    await slide.locator('.slide.current .po-row[data-i="0"] .po-val').click();
    await slide.keyboard.type("5");
    await slide.keyboard.press("Enter");
    assert.deepEqual((await bars(slide, "depois")).map((b) => b[0].replace(/[+-]?\d+ pts/, "")), ["100%", "0%", "0%"]);
  } finally { await browser.close(); if (!closed) await c.studio.close(); }
});

test("sem rede e sem servidor de votos o slide é a enquete de sempre: avisa, não mostra QR code e aceita os votos digitados", async (t) => {
  const { browserOrSkip } = await import("./helpers.js");
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-voto-"));
  const deck = tempDeck();
  fs.writeFileSync(deck.file, YAML.stringify(DECK));
  const studio = await startStudio(deck.file);
  try {
    const typed = async (page) => {
      await page.locator('.slide.current .po-row[data-i="1"] .po-val').click();
      await page.keyboard.type("7");
      await page.keyboard.press("Enter");
      return (await bars(page, "antes")).map((b) => b[0]);
    };
    // 1. HTML exportado, aberto do disco: nenhum pedido de rede
    const file = path.join(dir, "aula.html");
    fs.writeFileSync(file, buildHTML(structuredClone(DECK)).html);
    const { page: offline, errors: offErrors } = await newPage(browser, null);
    const requests = [];
    offline.on("request", (r) => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    await offline.goto(`file:///${file.replace(/\\/g, "/")}#2`);
    await offline.waitForSelector(".slide.current .poll[data-net]");
    await offline.waitForTimeout(2600); // mais que um ciclo de consulta
    assert.match(await offline.locator(".slide.current .po-note").innerText(), /só com a apresentação aberta pelo Studio de um servidor.*digitar o resultado/);
    assert.equal(await offline.locator(".slide.current .po-net").isVisible(), false, "sem QR code");
    assert.equal(await offline.locator(".slide.current .poll").evaluate((p) => p.classList.contains("net-on")), false);
    assert.deepEqual(await typed(offline), ["0%", "100%", "0%"]);
    assert.deepEqual(requests, [], "nenhum pedido de rede");
    assert.deepEqual(offErrors, []);

    // 2. Studio deste computador (127.0.0.1): a plateia não alcança; avisa e não consulta o servidor
    const { page: local, errors } = await newPage(browser, null);
    const votes = [];
    local.on("request", (r) => { if (r.url().includes("/voto/")) votes.push(r.url()); });
    await local.goto(`${studio.url}/preview#2`);
    await local.waitForSelector(".slide.current .poll[data-net]");
    await local.waitForTimeout(2600);
    assert.ok(await local.evaluate(() => !!JSON.parse(document.getElementById("sagadeck-data").textContent).vote), "a sala existe (vale para o Studio aberto para a rede)");
    assert.match(await local.locator(".slide.current .po-note").innerText(), /A plateia não alcança este computador/);
    assert.equal(await local.locator(".slide.current .po-net").isVisible(), false);
    assert.deepEqual(await typed(local), ["0%", "100%", "0%"]);
    assert.deepEqual(votes, [], "em 127.0.0.1 nem consulta");
    // a enquete sem live não ganha aviso nenhum
    await local.keyboard.press("ArrowRight");
    await local.keyboard.press("ArrowRight");
    await local.waitForSelector('.slide.current .poll[data-poll="digitada"]');
    assert.equal(await local.locator(".slide.current .po-note").count(), 0);
    // exportação (PDF): sem aviso e sem QR code
    await local.goto(`${studio.url}/preview?export=1`);
    await local.waitForSelector(".poll[data-net]", { state: "attached" });
    assert.equal(await local.locator('.poll[data-net="antes"] .po-note').isHidden(), true);
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deck.cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});
