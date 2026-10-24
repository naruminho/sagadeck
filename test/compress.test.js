// Respostas do Studio comprimidas (src/studio/compress.js): pelo portal nada saía comprimido, e cada troca de slide
// baixava ~170 kB. Comprime texto a partir de 1 kB quando o navegador aceita; nunca o que chega aos poucos (resposta
// ao vivo da IA, eventos), que o gzip seguraria.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { installCompression } from "../src/studio/compress.js";
import { installErrorResponses } from "../src/studio/errors.js";

async function serve(handler) {
  const server = http.createServer((req, res) => { installCompression(req, res); installErrorResponses(res); handler(req, res); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
// pede e devolve { status, headers, body (já descomprimido), raw (bytes que vieram), chunks (pedaços na ordem que chegaram) }
function get(url, { gzip = true, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: gzip ? { "Accept-Encoding": "gzip, deflate, br" } : {} }, (res) => {
      const parts = [], chunks = [];
      res.on("data", (c) => { parts.push(c); chunks.push({ at: Date.now(), size: c.length }); });
      res.on("end", () => {
        const raw = Buffer.concat(parts);
        const body = res.headers["content-encoding"] === "gzip" ? zlib.gunzipSync(raw).toString() : raw.toString();
        resolve({ status: res.statusCode, headers: res.headers, body, raw, chunks });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("compressão: JSON, HTML, JS e CSS grandes vão em gzip; pequeno, sem aceite e HEAD vão como sempre", async () => {
  const big = JSON.stringify({ baseCSS: ".a{color:red}".repeat(4000) });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sgd-gz-")), "app.js");
  fs.writeFileSync(file, "console.log('x');\n".repeat(2000));
  const s = await serve((req, res) => {
    if (req.url === "/grande") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(big); }
    else if (req.url === "/pequeno") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); }
    else if (req.url === "/arquivo") { res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Content-Length": fs.statSync(file).size }); fs.createReadStream(file).pipe(res); }
    else if (req.url === "/imagem") { res.writeHead(200, { "Content-Type": "image/jpeg" }); res.end(Buffer.alloc(5000, 7)); }
    else if (req.url === "/sem-writehead") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end("<p>".repeat(1000)); }
    else if (req.url === "/erro") { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "x".repeat(2000) })); }
  });
  try {
    const g = await get(`${s.url}/grande`);
    assert.equal(g.headers["content-encoding"], "gzip");
    assert.match(String(g.headers.vary), /Accept-Encoding/);
    assert.equal(g.body, big);
    assert.ok(g.raw.length < big.length / 10, `comprimiu de ${big.length} para ${g.raw.length} bytes`);
    const plain = await get(`${s.url}/grande`, { gzip: false });
    assert.equal(plain.headers["content-encoding"], undefined, "navegador que não aceita gzip recebe sem");
    assert.equal(plain.body, big);
    const small = await get(`${s.url}/pequeno`);
    assert.equal(small.headers["content-encoding"], undefined, "abaixo de 1 kB não vale comprimir");
    assert.equal(small.body, '{"ok":true}');
    const js = await get(`${s.url}/arquivo`);
    assert.equal(js.headers["content-encoding"], "gzip");
    assert.equal(js.headers["content-length"], undefined, "o tamanho original não pode ir com o corpo comprimido");
    assert.equal(js.body, fs.readFileSync(file, "utf8"));
    assert.equal((await get(`${s.url}/imagem`)).headers["content-encoding"], undefined, "imagem já é comprimida");
    const html = await get(`${s.url}/sem-writehead`);
    assert.equal(html.headers["content-encoding"], "gzip");
    assert.equal(html.body, "<p>".repeat(1000));
    const err = await get(`${s.url}/erro`);
    assert.equal(err.status, 400);
    assert.ok(JSON.parse(err.body).diagnostic, "a resposta de erro continua ganhando o diagnóstico (errors.js)");
    const head = await get(`${s.url}/grande`, { method: "HEAD" });
    assert.equal(head.headers["content-encoding"], undefined);
  } finally { await s.close(); fs.rmSync(path.dirname(file), { recursive: true, force: true }); }
});

test("compressão: o que chega aos poucos (resposta ao vivo da IA, eventos) não é segurado", async () => {
  const s = await serve((req, res) => {
    const type = req.url === "/ndjson" ? "application/x-ndjson; charset=utf-8" : "text/event-stream; charset=utf-8";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.write(`${"a".repeat(2000)}\n`);
    setTimeout(() => res.end(`${"b".repeat(2000)}\n`), 300);
  });
  try {
    for (const kind of ["ndjson", "eventos"]) {
      const r = await get(`${s.url}/${kind}`);
      assert.equal(r.headers["content-encoding"], undefined, `${kind}: sem gzip`);
      assert.ok(r.chunks.length >= 2 && r.chunks.at(-1).at - r.chunks[0].at >= 200, `${kind}: o primeiro pedaço chegou antes do fim`);
      assert.equal(r.body, `${"a".repeat(2000)}\n${"b".repeat(2000)}\n`);
    }
  } finally { await s.close(); }
});

// Cada abertura do editor baixava ~1,3 MB de novo (o katex.css sozinho tem 924 kB): nada ia para o cache do navegador.
// Arquivo da página ganha ETag; na visita seguinte, o navegador pergunta e recebe 304, sem corpo. Mudou, desce o novo.
test("cache: arquivo da página responde 304 sem corpo quando não mudou; mudou ou é /api/, vem inteiro", async () => {
  let css = ".katex{font:x}".repeat(3000);
  const s = await serve((req, res) => {
    if (req.url === "/katex.css") { res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" }); res.end(css); }
    else if (req.url === "/fonts.css") { res.writeHead(200, { "Content-Type": "text/css", "Cache-Control": "max-age=86400" }); res.end(css); }
    else { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ css })); }
  });
  const ask = (u, etag) => new Promise((resolve, reject) => http.get(`${s.url}${u}`, { headers: { "Accept-Encoding": "gzip", ...(etag ? { "If-None-Match": etag } : {}) } }, (res) => {
    let n = 0; res.on("data", (c) => (n += c.length)); res.on("end", () => resolve({ status: res.statusCode, etag: res.headers.etag, cache: res.headers["cache-control"], bytes: n }));
  }).on("error", reject));
  try {
    const first = await ask("/katex.css");
    assert.equal(first.status, 200);
    assert.ok(first.etag, "arquivo da página tem ETag");
    assert.equal(first.cache, "no-cache", "sem prazo próprio: sempre pergunta (versão nova chega na hora)");
    const again = await ask("/katex.css", first.etag);
    assert.equal(again.status, 304);
    assert.equal(again.bytes, 0, "não mudou: nada desce");
    css += ".nova{}";
    const changed = await ask("/katex.css", first.etag);
    assert.equal(changed.status, 200, "mudou: desce o novo");
    assert.notEqual(changed.etag, first.etag);
    assert.equal((await ask("/fonts.css")).cache, "max-age=86400", "quem já tem prazo de cache mantém o dele");
    assert.equal((await ask("/api/coisa")).etag, undefined, "resposta de /api/ não ganha ETag");
  } finally { await s.close(); }
});
