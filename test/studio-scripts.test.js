// Scripts do Studio: todo <script src> das páginas é entregue, inclusive módulo que passou a existir DEPOIS que o
// Studio subiu. Antes a lista de scripts era fixa na memória do servidor: um Studio aberto antes de atualizar o
// código recebia o app.js novo, mas dava 404 nos módulos novos (header-footer.js), o app.js quebrava e nenhum slide
// abria.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, FIXTURE, tempDeck, startStudio } from "./helpers.js";

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
