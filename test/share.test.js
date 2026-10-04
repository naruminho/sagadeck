// Link de ver, só leitura (Arquivo › Compartilhar link; src/studio/share-routes.js): quem abre vê a apresentação
// pronta, sem o editor e sem as notas; o link pode ser revogado. No servidor (multiusuário): "ver" só para quem entrou
// no portal (o nginx manda o usuário), "público" para qualquer um, e ninguém revoga o link de outra pessoa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import vm from 'node:vm';
import { browserOrSkip, newPage, startStudio } from "./helpers.js";

const DECK = { title: "Manejo de Águas Pluviais", theme: "sinal", slides: [
  { layout: "statement", text: "A chuva que vira enchente", notes: "SEGREDO DO APRESENTADOR: contar a história da enchente de 2011" },
  { layout: "statement", text: "Tempo de concentração" },
] };
function libraryWithDeck(root) {
  const file = path.join(root, "Aulas", "Aula 1", "Aula 1.yaml");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify(DECK));
  return file;
}
async function raw(url, { method = "GET", headers = {}, body } = {}) {
  const http = await import("node:http");
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const buf = Buffer.concat(chunks), data = buf.toString("utf8"); resolve({ status: res.statusCode, headers: res.headers, body: data, buf, json: () => JSON.parse(data) }); });
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

test('link compartilhado não injeta controles dentro do JavaScript do Mermaid', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'saga-share-diagram-'));
  const file = libraryWithDeck(root);
  fs.writeFileSync(file,YAML.stringify({title:'Diagrama',slides:[{layout:'diagram',title:'Fluxo',mermaid:'flowchart LR\n A --> B'}]}));
  const studio = await startStudio(file,{library:root});
  try {
    const shared = await raw(studio.url+'/api/share',{method:'POST',body:{}});
    const data = shared.json();
    assert.equal(shared.status,200);
    const view = await raw(new URL(data.link.path,studio.url+'/').href);
    assert.equal(view.status,200);
    const html = view.body;
    assert.ok([...html.matchAll(/<script/gi)].length > 5);
    for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/application\/json/.test(script[1])) assert.doesNotThrow(()=>new vm.Script(script[2]));
    }
  } finally {await studio.close();fs.rmSync(root,{recursive:true,force:true});}
});

test("Studio: Arquivo › Compartilhar link cria um link só de leitura (sem as notas, sem indexar), copia e revoga", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const library = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-share-"));
  const file = libraryWithDeck(library);
  const studio = await startStudio(file, { library });
  try {
    const { page, errors } = await newPage(browser, `${studio.url}/editor`);
    await page.click("#btn-export-menu");
    await page.click("#menu-share");
    await page.waitForSelector("#modal-share:not(.hidden)");
    assert.equal(await page.isVisible("#share-who"), false, "no Studio local não há portal: sem a escolha de quem vê");
    await page.click("#share-create");
    await page.waitForSelector("#share-list .share-item");
    const url = await page.inputValue("#share-list .share-url");
    assert.match(url, new RegExp(`^${studio.url}/ver/[A-Za-z0-9_-]{24}$`));
    const view = await raw(url);
    assert.equal(view.status, 200);
    assert.match(view.body, /A chuva que vira enchente/);
    assert.doesNotMatch(view.body, /SEGREDO DO APRESENTADOR/, "as notas do apresentador não vão");
    assert.match(view.headers["x-robots-tag"], /noindex/);
    assert.match(view.body, /<meta name="robots" content="noindex,nofollow">/);
    assert.equal(view.headers["referrer-policy"], "no-referrer");
    // a página que a pessoa abre é a apresentação, sem o editor
    const p2 = await browser.newPage();
    await p2.goto(url);
    await p2.waitForFunction(() => window.sagadeck && window.sagadeck.n === 2);
    assert.equal(await p2.locator("#btn-export-menu").count(), 0);
    await p2.close();
    // com as notas: é outro link
    await page.check("#share-notas");
    await page.click("#share-create");
    await page.waitForFunction(() => document.querySelectorAll("#share-list .share-item").length === 2);
    const saved = JSON.parse(fs.readFileSync(path.join(library, ".compartilhados.json"), "utf8")).links;
    assert.equal(saved.length, 2);
    assert.equal(saved[0].id, "Aulas/Aula 1/Aula 1.yaml");
    assert.match((await raw(`${studio.url}/ver/${saved.find((l) => l.notas).token}`)).body, /SEGREDO DO APRESENTADOR/);
    // revogar: para de funcionar na hora
    await page.click(`#share-list .share-item[data-token="${saved[0].token}"] .share-revoke`);
    await page.waitForFunction(() => document.querySelectorAll("#share-list .share-item").length === 1);
    assert.equal((await raw(url)).status, 404);
    assert.equal((await raw(`${studio.url}/ver/naoexisteessecodigoaqui`)).status, 404);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await studio.close(); await browser.close(); fs.rmSync(library, { recursive: true, force: true }); }
});

test("link de ver: quem abre baixa nos formatos (PDF, PowerPoint, HTML, estudo, .sagadeck) e as notas só vão no link com as notas", { timeout: 240000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const library = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-share-dl-"));
  const file = libraryWithDeck(library);
  const studio = await startStudio(file, { library });
  const JSZip = (await import("jszip")).default;
  const unzipText = async (buf) => { const z = await JSZip.loadAsync(buf); let all = ""; for (const f of Object.values(z.files)) if (!f.dir && /\.(xml|yaml|json|html)$/.test(f.name)) all += await f.async("string"); return all; };
  try {
    const sem = (await raw(`${studio.url}/api/share`, { method: "POST", body: {} })).json().link;
    const com = (await raw(`${studio.url}/api/share`, { method: "POST", body: { notas: true } })).json().link;
    // o botão Baixar está na página, com os formatos; o roteiro só no link com as notas
    const pageSem = (await raw(`${studio.url}/${sem.path}`)).body;
    for (const k of ["pdf", "pptx", "html", "estudo", "estudo-html", "sagadeck"]) assert.match(pageSem, new RegExp(`data-kind="${k}"`), k);
    assert.doesNotMatch(pageSem, /data-kind="roteiro"/);
    assert.match((await raw(`${studio.url}/${com.path}`)).body, /data-kind="roteiro"/);
    const get = (l, k) => raw(`${studio.url}/${l.path}/baixar/${k}`);
    const pdf = await get(sem, "pdf");
    assert.equal(pdf.status, 200); assert.equal(pdf.buf.subarray(0, 4).toString(), "%PDF");
    assert.match(pdf.headers["x-robots-tag"], /noindex/);
    const pptx = await get(sem, "pptx");
    assert.equal(pptx.status, 200);
    const pptxText = await unzipText(pptx.buf);
    assert.match(pptxText, /A chuva que vira enchente/);
    assert.doesNotMatch(pptxText, /SEGREDO DO APRESENTADOR/, "PowerPoint do link sem notas não leva as notas");
    assert.match(await unzipText((await get(com, "pptx")).buf), /SEGREDO DO APRESENTADOR/, "no link com as notas, leva");
    const html = await get(sem, "html");
    assert.match(html.headers["content-disposition"], /attachment/);
    assert.match(html.body, /A chuva que vira enchente/); assert.doesNotMatch(html.body, /SEGREDO DO APRESENTADOR/);
    const pack = await get(sem, "sagadeck");
    assert.equal(pack.status, 200);
    const packText = await unzipText(pack.buf);
    assert.match(packText, /Tempo de concentração/); assert.doesNotMatch(packText, /SEGREDO DO APRESENTADOR/);
    assert.equal((await get(sem, "estudo-html")).status, 200);
    assert.equal((await get(sem, "roteiro")).status, 404, "roteiro é feito das notas: não no link sem as notas");
    assert.equal((await get(com, "roteiro")).buf.subarray(0, 4).toString(), "%PDF");
    assert.equal((await get(sem, "exe")).status, 404);
    // revogado: o download para junto
    await raw(`${studio.url}/api/share/revoke`, { method: "POST", body: { token: sem.token } });
    assert.equal((await get(sem, "pdf")).status, 404);
    // a página com o botão funciona no navegador, sem erro, e o clique no botão não passa o slide
    const p = await browser.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(`${studio.url}/${com.path}`);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.n === 2);
    await p.click("#sd-dl > button");
    assert.ok(await p.isVisible('#sd-dl a[data-kind="pdf"]'));
    assert.equal(await p.evaluate(() => window.sagadeck.cur), 0, "abrir o menu não avançou o slide");
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click('#sd-dl a[data-kind="html"]')]);
    assert.match(dl.suggestedFilename(), /\.html$/);
    assert.deepEqual(errs, []);
    await p.close();
  } finally { await studio.close(); await browser.close(); fs.rmSync(library, { recursive: true, force: true }); }
});

test("servidor: 'ver' só com o usuário do portal; 'público' sem login só se foi criado assim; ninguém revoga o de outro", async () => {
  const studio = await startStudio(null, { multiuser: true });
  const ana = { "X-Sagadeck-User": "ana" }, mary = { "X-Sagadeck-User": "mary" };
  try {
    libraryWithDeck(path.join(studio.library, "usuarios", "ana"));
    assert.equal((await raw(`${studio.url}/api/library/open`, { method: "POST", headers: ana, body: { id: "Aulas/Aula 1/Aula 1.yaml" } })).status, 200);
    const made = (await raw(`${studio.url}/api/share`, { method: "POST", headers: ana, body: {} })).json();
    assert.equal(made.multiuser, true);
    assert.match(made.link.path, /^ver\//);
    const tok = made.link.token;
    assert.equal((await raw(`${studio.url}/ver/${tok}`)).status, 401, "sem o usuário do portal, não");
    const asMary = await raw(`${studio.url}/ver/${tok}`, { headers: mary });
    assert.equal(asMary.status, 200, "a Mary (logada) vê a apresentação da Ana");
    assert.match(asMary.body, /A chuva que vira enchente/);
    assert.equal((await raw(`${studio.url}/publico/${tok}`)).status, 404, "link de portal não abre pelo caminho público");
    const pub = (await raw(`${studio.url}/api/share`, { method: "POST", headers: ana, body: { publico: true } })).json();
    assert.match(pub.link.path, /^publico\//);
    assert.equal((await raw(`${studio.url}/publico/${pub.link.token}`)).status, 200, "público: sem login");
    // a Mary não vê nem revoga os links da Ana
    assert.deepEqual((await raw(`${studio.url}/api/share`, { headers: mary })).json().links, []);
    assert.equal((await raw(`${studio.url}/api/share/revoke`, { method: "POST", headers: mary, body: { token: tok } })).status, 404);
    assert.equal((await raw(`${studio.url}/ver/${tok}`, { headers: mary })).status, 200);
    assert.equal((await raw(`${studio.url}/api/share/revoke`, { method: "POST", headers: ana, body: { token: tok } })).status, 200);
    assert.equal((await raw(`${studio.url}/ver/${tok}`, { headers: mary })).status, 404);
    assert.equal((await raw(`${studio.url}/api/share`, { headers: ana })).json().links.length, 1, "sobrou o público");
    // baixar segue as mesmas regras do link
    assert.equal((await raw(`${studio.url}/publico/${pub.link.token}/baixar/html`)).status, 200, "público baixa sem login");
    const portal = (await raw(`${studio.url}/api/share`, { method: "POST", headers: ana, body: {} })).json().link;
    assert.equal((await raw(`${studio.url}/ver/${portal.token}/baixar/html`)).status, 401, "sem o usuário do portal, não baixa");
    assert.equal((await raw(`${studio.url}/ver/${portal.token}/baixar/html`, { headers: mary })).status, 200);
    assert.equal((await raw(`${studio.url}/publico/${portal.token}/baixar/html`)).status, 404, "link de portal não baixa pelo caminho público");
  } finally { await studio.close(); }
});
