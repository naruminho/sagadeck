// Link de ver, só leitura (Arquivo › Compartilhar link; src/studio/share-routes.js): quem abre vê a apresentação
// pronta, sem o editor e sem as notas; o link pode ser revogado. No servidor (multiusuário): "ver" só para quem entrou
// no portal (o nginx manda o usuário), "público" para qualquer um, e ninguém revoga o link de outra pessoa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
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
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data, json: () => JSON.parse(data) }));
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

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
  } finally { await studio.close(); }
});
