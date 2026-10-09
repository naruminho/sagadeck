// Scripts do Studio: todo <script src> das páginas é entregue, inclusive módulo que passou a existir DEPOIS que o
// Studio subiu. Antes a lista de scripts era fixa na memória do servidor: um Studio aberto antes de atualizar o
// código recebia o app.js novo, mas dava 404 nos módulos novos (header-footer.js), o app.js quebrava e nenhum slide
// abria.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, FIXTURE, tempDeck, startStudio, browserOrSkip, newPage } from "./helpers.js";

const PUBLIC = path.join(ROOT, "src", "studio", "public");

test("todo script das páginas do Studio é entregue, inclusive módulo criado depois que o Studio subiu", async () => {
  const deck = tempDeck(FIXTURE);
  const studio = await startStudio(deck.file);
  const novo = path.join(PUBLIC, `zz-modulo-novo-${process.pid}.js`);
  try {
    for (const page of ["index.html", "library.html"]) {
      const html = fs.readFileSync(path.join(PUBLIC, page), "utf8");
      for (const [, src] of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
        const r = await fetch(`${studio.url}/${src}`);
        assert.equal(r.status, 200, `${page}: ${src}`);
      }
    }
    fs.writeFileSync(novo, "window.ModuloNovo = 1;\n");
    const r = await fetch(`${studio.url}/${path.basename(novo)}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /javascript/);
    assert.equal(await r.text(), "window.ModuloNovo = 1;\n");
    // só nome simples de arquivo da pasta public: nada de subir de pasta nem outro arquivo do servidor
    for (const bad of ["/..%2Fserver.js", "/%2e%2e/server.js", "/nao-existe.js", "/library.html.js"]) assert.notEqual((await fetch(`${studio.url}${bad}`)).status, 200, bad);
  } finally {
    fs.rmSync(novo, { force: true });
    await studio.close();
    deck.cleanup();
  }
});

// O código mudou no disco (git pull, npm update) com o Studio aberto: a página avisa para reiniciar, em vez de
// quebrar em silêncio com o servidor velho e os arquivos novos.
test("código atualizado com o Studio aberto: editor e biblioteca avisam para reiniciar", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deck = tempDeck(FIXTURE);
  // o "código" deste Studio é uma pasta temporária: mexer nele não acende o aviso num Studio de verdade aberto ao lado
  const codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-codigo-"));
  const touched = path.join(codeRoot, "server.js");
  fs.writeFileSync(touched, "// servidor");
  const before = fs.statSync(touched);
  const studio = await startStudio(deck.file, { codeRoot });
  try {
    const { page, errors } = await newPage(browser, `${studio.url}/editor`);
    const { page: lib, errors: libErrors } = await newPage(browser, studio.url);
    await page.waitForFunction(() => window.SagaUpdateNotice);
    assert.equal(await page.locator(".update-notice").count(), 0, "nada mudou: sem aviso");
    assert.equal((await (await fetch(`${studio.url}/api/code-version`)).json()).changed, false);
    // "atualiza" um arquivo do código (só a data) e espera o servidor recalcular a impressão
    fs.utimesSync(touched, before.atime, new Date(before.mtimeMs + 60_000));
    await new Promise((r) => setTimeout(r, 3200));
    for (const p of [page, lib]) {
      await p.evaluate(() => window.SagaUpdateNotice.check());
      await p.locator(".update-notice").waitFor();
      assert.match(await p.locator(".update-notice").innerText(), /atualizado.*Feche e abra o Studio/s);
    }
    await page.click(".update-notice button");
    assert.equal(await page.locator(".update-notice").count(), 0, "o aviso fecha");
    assert.deepEqual(errors, []);
    assert.deepEqual(libErrors, []);
  } finally {
    fs.rmSync(codeRoot, { recursive: true, force: true });
    await browser.close();
    await studio.close();
    deck.cleanup();
  }
});

// No servidor (multiusuário) os slides de API não executam: o botão Ambientes não aparece. Antes abria a janela com
// "O serviço recusou o acesso…", que parecia defeito ou falta de permissão.
test("servidor multiusuário: o botão Ambientes não aparece; no Studio local, aparece", async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deck = tempDeck(FIXTURE);
  const multi = await startStudio(deck.file, { multiuser: true });
  const local = await startStudio(deck.file);
  try {
    const p = await browser.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.setExtraHTTPHeaders({ "x-sagadeck-user": "ana" });
    await p.goto(`${multi.url}/editor`, { waitUntil: "networkidle" });
    await p.waitForFunction(() => document.getElementById("btn-api-envs")?.hasAttribute("hidden"));
    const { page: lp } = await newPage(browser, `${local.url}/editor`);
    await lp.waitForTimeout(500);
    assert.equal(await lp.locator("#btn-api-envs").getAttribute("hidden"), null, "no Studio local o botão fica");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await multi.close(); await local.close(); deck.cleanup(); }
});
