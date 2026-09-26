// Biblioteca no Studio, de ponta a ponta (Chrome), e o modo multiusuário (uma biblioteca por usuário).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio } from "./helpers.js";
import { packDeck } from "../src/package.js";

test("biblioteca no Studio", { timeout: 240000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null); // sem deck: "/" é a biblioteca
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const lib = () => p.evaluate(async () => (await (await fetch("/api/library")).json()));
    const settle = (ms = 500) => p.waitForTimeout(ms);
    const dlgOk = async (value) => { await p.fill("#dlg-name", value); await p.click("#dlg-ok"); await settle(700); };

    await t.test("biblioteca vazia explica o que fazer e mostra onde fica a pasta", async () => {
      assert.match(await p.innerText("#main"), /Sua biblioteca está vazia/);
      assert.match(await p.innerText("#side"), new RegExp(path.basename(studio.library)));
      assert.equal(await p.isVisible("#user"), false, "sem multiusuário, sem o chip de usuário");
    });

    await t.test("criar tópico (nome + cor) vira uma pasta de verdade", async () => {
      await p.click("[data-empty-topic]");
      await p.click('.sw[data-c="#0f6cbd"]');
      await dlgOk("Palestras");
      const l = await lib();
      assert.deepEqual(l.topics.map((x) => [x.name, x.color]), [["Palestras", "#0f6cbd"]]);
      assert.ok(fs.existsSync(path.join(studio.library, "Palestras")));
      assert.match(await p.innerText("#main"), /Nenhuma apresentação em Palestras/);
    });

    await t.test("nova em branco abre no editor e salva na pasta da biblioteca", async () => {
      await p.click("[data-empty-new]");
      await p.click('[data-new="blank"]');
      await Promise.all([p.waitForURL(/\/editor\?deck=/), dlgOk("Minha palestra")]);
      await p.waitForSelector("#rendered-slide-container .slide");
      assert.equal(await p.inputValue("#deck-title-input"), "Minha palestra");
      const file = path.join(studio.library, "Palestras", "Minha palestra", "Minha palestra.yaml");
      assert.ok(fs.existsSync(file));
      // editar no editor salva no arquivo da biblioteca
      await p.fill("#deck-title-input", "Minha palestra v2");
      await p.press("#deck-title-input", "Tab");
      await settle(1200);
      assert.match(fs.readFileSync(file, "utf8"), /title: Minha palestra v2/);
    });

    await t.test("voltar à biblioteca pelo ícone: cartão com capa de verdade", async () => {
      await Promise.all([p.waitForURL((u) => u.pathname === "/biblioteca"), p.click("#btn-library")]);
      await p.click('[data-view="recentes"]');
      await p.waitForSelector(".card[data-id] img");
      await p.waitForFunction(() => { const i = document.querySelector(".card[data-id] img"); return i && i.complete && i.naturalWidth > 100; }, null, { timeout: 30000 });
      assert.match(await p.innerText(".card[data-id] .name"), /Minha palestra v2/);
    });

    await t.test("renomear, duplicar e mover (arrastando para outro tópico)", async () => {
      await p.click("#new-topic"); await dlgOk("Trabalho");
      await p.click('[data-view="Palestras"]');
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="rename"]'); await dlgOk("Palestra final");
      assert.ok((await lib()).decks.some((d) => d.title === "Palestra final"));
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="dup"]'); await settle(700);
      assert.equal((await lib()).decks.length, 2);
      await p.dragAndDrop('.card[data-id]:not(.new-card) >> nth=0', '.nav[data-topic="Trabalho"]');
      await settle(900);
      const l = await lib();
      assert.deepEqual(l.topics.map((x) => [x.name, x.count]).sort(), [["Palestras", 1], ["Trabalho", 1]]);
    });

    await t.test("lixeira: excluir e restaurar", async () => {
      await p.click('[data-view="Trabalho"]');
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="trash"]'); await settle(700);
      assert.equal((await lib()).trash.length, 1);
      await p.click('[data-view="lixeira"]');
      await p.click("[data-restore]"); await settle(700);
      const l = await lib();
      assert.equal(l.trash.length, 0);
      assert.equal(l.decks.filter((d) => d.topic === "Trabalho").length, 1);
    });

    await t.test("baixar .sagadeck pelo menu do cartão e importar de volta", async () => {
      await p.click('[data-view="Trabalho"]');
      await p.click(".card[data-id] [data-more]");
      const [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-dl="sagadeck"]')]);
      assert.match(dl.suggestedFilename(), /\.sagadeck$/);
      const file = path.join(studio.library, "..", `baixado-${Date.now()}.sagadeck`);
      await dl.saveAs(file);
      await p.click("#btn-new"); await p.click('[data-new="import"]').catch(() => {});
      await p.setInputFiles("#import-input", file);
      await p.waitForFunction(() => document.querySelectorAll(".card[data-id]").length >= 2, null, { timeout: 10000 });
      assert.equal((await lib()).decks.filter((d) => d.topic === "Trabalho").length, 2);
    });

    await t.test("busca por título", async () => {
      await p.click('[data-view="todas"]');
      await p.fill("#q", "final");
      assert.ok((await p.locator(".card[data-id]").count()) >= 1);
      await p.fill("#q", "não existe nada assim");
      assert.match(await p.innerText("#main"), /Nada encontrado/);
      await p.fill("#q", "");
    });

    await t.test("Apresentar pelo cartão abre o editor já no modo apresentação", async () => {
      await p.click('[data-view="Palestras"]');
      await p.hover(".card[data-id]:not(.new-card)");
      await Promise.all([p.waitForURL(/\/editor\?deck=/), p.click(".card[data-id]:not(.new-card) [data-present]")]);
      await p.waitForSelector("#presentation-modal:not(.hidden)", { timeout: 15000 });
      await p.keyboard.press("Escape");
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
  }
});

test("multiusuário: cada usuário vê só a sua biblioteca; sem o cabeçalho do proxy, nada", async () => {
  const studio = await startStudio(null, { multiuser: true });
  try {
    const as = (user, p, body) => fetch(studio.url + p, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(user ? { "X-Sagadeck-User": user } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await as(null, "/api/library")).status, 401, "sem usuário: 401");
    assert.equal((await as(null, "/api/deck")).status, 401);
    await as("ana", "/api/library/topics", { name: "Aulas" });
    await as("ana", "/api/library/decks", { topic: "Aulas", title: "Da Ana" });
    await as("bia", "/api/library/decks", { topic: "", title: "Da Bia" });
    const ana = await (await as("ana", "/api/library")).json(), bia = await (await as("bia", "/api/library")).json();
    assert.deepEqual(ana.decks.map((d) => d.title), ["Da Ana"]);
    assert.deepEqual(bia.decks.map((d) => d.title), ["Da Bia"]);
    assert.equal(ana.user, "ana");
    assert.ok(fs.existsSync(path.join(studio.library, "usuarios", "ana", "Aulas", "Da Ana")));
    // o deck aberto também é por usuário
    await as("ana", "/api/library/open", { id: ana.decks[0].id });
    await as("bia", "/api/library/open", { id: bia.decks[0].id });
    assert.equal((await (await as("ana", "/api/deck")).json()).spec.title, "Da Ana");
    assert.equal((await (await as("bia", "/api/deck")).json()).spec.title, "Da Bia");
    // a Bia não abre o deck da Ana nem pelo id
    const r = await as("bia", "/api/library/open", { id: ana.decks[0].id });
    assert.equal(r.status, 400);
  } finally {
    await studio.close();
  }
});

// Um modelrelay local com a tela de configuração (só o que o Studio consulta).
async function fakeRelay({ console = true } = {}) {
  const http = await import("node:http");
  const server = http.createServer((req, res) => {
    if (console && req.url === "/api/console/config") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{}"); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test("botão modelrelay: abre a tela de configuração do modelrelay local; some quando não há tela ou no multiusuário", { timeout: 60000 }, async (t) => {
  const relay = await fakeRelay(), old = await fakeRelay({ console: false });
  try {
    const setup = async (llmUrl, opts = {}) => {
      const studio = await startStudio(null, { llmUrl, ...opts });
      try {
        const r = await fetch(studio.url + "/api/ai/setup", { headers: opts.multiuser ? { "X-Sagadeck-User": "ana" } : {} });
        return (await r.json()).url;
      } finally { await studio.close(); }
    };
    assert.equal(await setup(relay.url + "/v1"), relay.url + "/");
    assert.equal(await setup(old.url + "/v1"), null, "modelrelay antigo, sem tela");
    assert.equal(await setup("http://127.0.0.1:9/v1"), null, "fora do ar");
    assert.equal(await setup(relay.url + "/v1", { multiuser: true }), null, "no servidor, a configuração é do admin");

    const browser = await browserOrSkip(t);
    if (!browser) return;
    const studio = await startStudio(null, { llmUrl: relay.url + "/v1" });
    try {
      const { page: p, errors } = await newPage(browser, studio.url);
      await p.waitForSelector("#btn-ai:not([hidden])");
      assert.equal(await p.getAttribute("#btn-ai", "href"), relay.url + "/");
      assert.equal(await p.getAttribute("#btn-ai", "target"), "_blank");
      assert.equal((await p.innerText("#btn-ai")).trim(), "modelrelay");
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await studio.close();
    }
  } finally {
    relay.close(); old.close();
  }
});

// No BabsDeck o Studio fica em https://portal/apresentacoes/ (o nginx tira o prefixo). Tudo tem que
// funcionar sob um prefixo: nenhum endereço absoluto ("/api/...") no front.
test("atrás de um proxy com prefixo (/apresentacoes/): biblioteca e editor sem nenhum pedido quebrado", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const http = await import("node:http");
  const studio = await startStudio(null, { multiuser: true });
  const target = new URL(studio.url);
  const proxy = http.createServer((req, res) => {
    if (!req.url.startsWith("/apresentacoes/")) { res.writeHead(404); return res.end("fora do prefixo: " + req.url); }
    const up = http.request({ host: target.hostname, port: target.port, method: req.method, path: req.url.slice("/apresentacoes".length),
      headers: { ...req.headers, "x-sagadeck-user": "ana" } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(up);
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${proxy.address().port}/apresentacoes/`;
  try {
    const { page: p, errors } = await newPage(browser, base);
    const bad = [];
    p.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    p.on("requestfailed", (r) => bad.push(`falhou ${r.url()}`));
    await p.waitForSelector("[data-empty-new]");
    await p.click("[data-empty-new]");
    await p.click('[data-new="blank"]');
    await Promise.all([p.waitForURL(/\/apresentacoes\/editor\?deck=/), (async () => { await p.fill("#dlg-name", "Sob prefixo"); await p.click("#dlg-ok"); })()]);
    await p.waitForSelector("#rendered-slide-container .slide");
    await Promise.all([p.waitForURL((u) => u.pathname === "/apresentacoes/biblioteca"), p.click("#btn-library")]);
    await p.waitForFunction(() => { const i = document.querySelector(".card[data-id] img"); return i && i.complete && i.naturalWidth > 100; }, null, { timeout: 30000 });
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  } finally {
    proxy.close();
    await browser.close();
    await studio.close();
  }
});

test("sem tópico: a pasta 'Sem tópico' e os .yaml soltos na raiz não aparecem com o mesmo nome; soltar ali não mexe na estrutura", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null);
  try {
    const post = (p, b) => fetch(studio.url + "/" + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    await post("api/library/decks", { topic: "", title: "Sem tópico escolhido" });
    fs.writeFileSync(path.join(studio.library, "solta.yaml"), "title: Solta\nslides:\n  - layout: statement\n    text: oi\n");
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.waitForSelector(".nav[data-view='Sem tópico']");
    const names = await p.$$eval("#side .nav .name", (els) => els.map((e) => e.textContent));
    assert.equal(names.filter((n) => n === "Sem tópico").length, 1, `nomes: ${names}`);
    assert.ok(names.includes("Soltas na pasta"), `nomes: ${names}`);
    assert.equal(await p.$(".nav[data-view=''][data-topic]"), null, "a entrada dos soltos não recebe cartões arrastados");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
  }
});

// Quem nunca viu um slide api precisa de um exemplo que funcione sem configurar nada: o deck de ensaio,
// executando na API de mentira do ambiente embutido ENSAIO (sem ~/.sagadeck/ambientes.yaml, sem VPN).
test("Nova → Exemplo: aula de APIs ao vivo cria o deck (com o arquivo do upload) e ele executa no ambiente ENSAIO", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  fs.rmSync(process.env.SAGADECK_AMBIENTES, { force: true }); // ninguém configurou ambiente nenhum
  const studio = await startStudio(null);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click("#btn-new");
    assert.match(await p.innerText("#new-menu"), /Exemplo: aula de APIs ao vivo/);
    await Promise.all([p.waitForURL(/\/editor\?deck=/), p.click('[data-new="example-api"]')]);
    await p.waitForSelector("#rendered-slide-container .slide");

    // o deck salvo na biblioteca: os slides api do exemplo e, ao lado, o arquivo que o upload envia
    const yamls = fs.readdirSync(studio.library, { recursive: true }).filter((f) => f.endsWith(".yaml"));
    assert.equal(yamls.length, 1, yamls.join(", "));
    const file = path.join(studio.library, yamls[0]);
    const saved = YAML.parse(fs.readFileSync(file, "utf8"));
    assert.ok(saved.slides.filter((s) => s.layout === "api").length >= 10);
    assert.ok(fs.existsSync(path.join(path.dirname(file), "contrato.txt")));
    assert.equal(fs.existsSync(process.env.SAGADECK_AMBIENTES), false, "o ENSAIO não grava nada no arquivo de ambientes");

    // apresentando: ENSAIO no selo, e o Executar funciona de verdade (token → LLM → upload → OCR)
    const { page: pv, errors: pvErrors } = await newPage(browser, `${studio.url}/preview`, { width: 1920, height: 1080 });
    await pv.waitForFunction(() => window.sagadeckApi && window.sagadeckApi.state.live);
    const idx = (id) => saved.slides.findIndex((s) => s.id === id);
    const run = async (id) => {
      const s = `.slide[data-idx="${idx(id)}"]`;
      await pv.evaluate((n) => window.sagadeck.goto(n, 0), idx(id));
      await pv.click(`${s} [data-api-run]`);
      await pv.waitForFunction((sel) => !document.querySelector(`${sel} .L-api`).classList.contains("running"), s, { timeout: 20000 });
      return s;
    };
    let s = await run("identity");
    assert.equal((await pv.innerText(`${s} .api-env-name`)).trim(), "ENSAIO");
    assert.match(await pv.innerText(`${s} .api-res`), /token JWT gerado/i);
    s = await run("llm");
    assert.match(await pv.innerText(`${s} .api-answer`), /eco: O que é RAG, em uma frase\?/);
    s = await run("upload");
    assert.match(await pv.innerText(`${s} .api-saved`), /\{\{path_id\}\} = store\/contrato\.txt/);
    s = await run("ocr");
    assert.match(await pv.innerText(`${s} .api-answer`), /Cláusula 1: prazo de 30 dias/);
    assert.ok(fs.existsSync(file.replace(/\.yaml$/, ".respostas.json")), "a gravação fica ao lado do deck");
    assert.deepEqual(pvErrors, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
  }
});
