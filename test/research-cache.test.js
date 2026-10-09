// Cache de busca + pesquisa no pack + checagem de links: a pesquisa não se paga duas vezes.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { cachedWeb } from "../src/research/research.js";
import { checkLinks, formatLinks, linksOfDeck } from "../src/research/links.js";
import { packDeck, unpackDeck } from "../src/package.js";

test("cache: segunda busca igual não chama o buscador; expirada chama de novo", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saga-cache-"));
  try {
    let calls = 0;
    const web = { search: async (q) => { calls++; return [{ url: `https://x/${q}`, title: q }]; } };
    const w = cachedWeb(web, dir);
    assert.deepEqual(await w.search("marte"), [{ url: "https://x/marte", title: "marte" }]);
    assert.deepEqual(await w.search("marte"), [{ url: "https://x/marte", title: "marte" }]);
    assert.equal(calls, 1);
    assert.deepEqual(await w.search("venus"), [{ url: "https://x/venus", title: "venus" }]);
    assert.equal(calls, 2);
    // expira o cache na marra: TTL padrão é 7 dias
    const f = path.join(dir, "contexto", "pesquisa", "busca-cache.json");
    const c = JSON.parse(fs.readFileSync(f, "utf8"));
    c["web:marte"].quando = Date.now() - 8 * 864e5;
    fs.writeFileSync(f, JSON.stringify(c));
    await w.search("marte");
    assert.equal(calls, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pack: leva a pesquisa junto; unpack devolve", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saga-pack-"));
  try {
    const spec = { title: "T", slides: [{ layout: "title", title: "Oi" }] };
    fs.mkdirSync(path.join(dir, "contexto", "pesquisa"), { recursive: true });
    fs.writeFileSync(path.join(dir, "deck.yaml"), "title: T\nslides:\n  - layout: title\n    title: Oi\n");
    fs.writeFileSync(path.join(dir, "contexto", "pesquisa", "fontes.json"), JSON.stringify({ fontes: [{ id: "F1", url: "https://exemplo/fonte" }] }));
    fs.writeFileSync(path.join(dir, "contexto", "pesquisa", "notas.md"), "# Pesquisa\n");
    const { files } = await packDeck(spec, { baseDir: dir, name: "deck" });
    assert.ok(files.includes("contexto/pesquisa/fontes.json"), JSON.stringify(files));
    assert.ok(files.includes("contexto/pesquisa/notas.md"));
    const dest = path.join(dir, "extraido");
    const { file } = await unpackDeck(await (await packDeck(spec, { baseDir: dir, name: "deck" })).zip, dest);
    assert.ok(fs.existsSync(path.join(path.dirname(file), "contexto", "pesquisa", "fontes.json")));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("links: 200 ok, 404 quebrou; linksOfDeck lê as fontes do deck", async () => {
  const srv = http.createServer((req, res) => { res.statusCode = req.url === "/ok" ? 200 : 404; res.end("x"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const rows = await checkLinks([`${base}/ok`, `${base}/sumiu`]);
    assert.deepEqual(rows.map((r) => [r.status, r.ok]), [[200, true], [404, false]]);
    const txt = formatLinks(rows);
    assert.ok(txt.includes("1 de 2") && txt.includes("QUEBROU"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saga-links-"));
    try {
      assert.deepEqual(linksOfDeck(dir), []);
      fs.mkdirSync(path.join(dir, "contexto", "pesquisa"), { recursive: true });
      fs.writeFileSync(path.join(dir, "contexto", "pesquisa", "fontes.json"), JSON.stringify({ fontes: [{ url: `${base}/ok` }, { url: "nota" }] }));
      assert.deepEqual(linksOfDeck(dir), [`${base}/ok`]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } finally { srv.close(); }
});
