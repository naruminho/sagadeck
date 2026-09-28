// Materiais de contexto: extração de texto (arquivos e links) sem navegador.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import JSZip from "jszip";
import {
  extractDocText, materialsBlock, pastedUrls, hostBlocked, checkUrl, fetchUrlText, htmlToText,
} from "../src/ai/context.js";

const docx = async (body) => new JSZip().file("word/document.xml", body).generateAsync({ type: "nodebuffer" });

test("docx: parágrafos viram linhas", async () => {
  const buf = await docx(`<w:document><w:body><w:p><w:r><w:t>Olá </w:t></w:r><w:r><w:t>mundo</w:t></w:r></w:p><w:p><w:r><w:t>Segunda linha</w:t></w:r></w:p></w:body></w:document>`);
  const r = await extractDocText("relatorio.docx", buf);
  assert.equal(r.text, "Olá mundo\nSegunda linha");
  assert.equal(r.detail, "docx");
});

test("xlsx: strings compartilhadas, números e texto inline", async () => {
  const zip = new JSZip();
  zip.file("xl/sharedStrings.xml", `<sst><si><t>Nome</t></si><si><t>Valor</t></si></sst>`);
  zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData>
    <row><c t="s"><v>0</v></c><c><v>42</v></c></row>
    <row><c t="inlineStr"><is><t>total</t></is></c></row>
  </sheetData></worksheet>`);
  const r = await extractDocText("dados.xlsx", await zip.generateAsync({ type: "nodebuffer" }));
  assert.match(r.text, /Nome \| 42/);
  assert.match(r.text, /total/);
  assert.match(r.detail, /xlsx/);
});

test("pptx: textos por slide, numerados", async () => {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", `<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>Capa</a:t></a:r></a:p><a:p><a:r><a:t>Subtítulo</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>`);
  const r = await extractDocText("deck.pptx", await zip.generateAsync({ type: "nodebuffer" }));
  assert.match(r.text, /── slide 1 ──/);
  assert.match(r.text, /Capa/);
  assert.match(r.text, /Subtítulo/);
});

test("txt e csv passam direto; tipo desconhecido recusa", async () => {
  assert.equal((await extractDocText("a.txt", Buffer.from("linha1\nlinha2"))).text, "linha1\nlinha2");
  await assert.rejects(extractDocText("a.exe", Buffer.from("x")), /não suportado/);
});

// PDF mínimo de uma página, montado à mão (sem dependência de escrita).
function minPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objs.length; i++) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `).join("\n") + `\ntrailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

test("pdf: texto da página é extraído", async () => {
  const r = await extractDocText("rel.pdf", minPdf("Fraudes: 40 por cento"));
  assert.match(r.text, /Fraudes: 40 por cento/);
  assert.match(r.detail, /pdf \(1 página/);
});

test("htmlToText: tira script e decodifica entidades", () => {
  assert.equal(htmlToText("<h1>Banco</h1><p>Golpe &amp; fraude<script>var x=1;</script></p>"), "Banco\n\nGolpe & fraude");
});

test("pastedUrls: até 2 links, sem pontuação final", () => {
  assert.deepEqual(pastedUrls("veja https://exemplo.com/a, e http://x.com/b. fim"), ["https://exemplo.com/a", "http://x.com/b"]);
  assert.equal(pastedUrls("um https://a.com/x dois https://b.com/y três https://c.com/z").length, 2);
  assert.deepEqual(pastedUrls("sem link"), []);
});

test("anti-SSRF: rede local e esquemas estranhos bloqueiam sem DNS", async () => {
  assert.ok(hostBlocked("localhost"));
  assert.ok(hostBlocked("127.0.0.1"));
  assert.ok(hostBlocked("169.254.169.254"));
  assert.ok(!hostBlocked("example.com"));
  await assert.rejects(checkUrl("ftp://x.com/a"), /http\(s\)/);
  await assert.rejects(checkUrl("http://127.0.0.1/a"), /rede local/);
});

test("fetchUrlText: página local com permissão de teste", async (t) => {
  const old = process.env.SAGADECK_CONTEXT_ALLOW_LOCAL;
  process.env.SAGADECK_CONTEXT_ALLOW_LOCAL = "1";
  t.after(() => { process.env.SAGADECK_CONTEXT_ALLOW_LOCAL = old; });
  const srv = http.createServer((req, res) => {
    if (req.url === "/grande") { res.writeHead(200, { "Content-Type": "text/html", "Content-Length": 3 * 1024 * 1024 }); res.end("x"); return; }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body><h1>Banco Central</h1><p>Golpe do pix cresceu.</p></body></html>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  const port = srv.address().port;
  const r = await fetchUrlText(`http://127.0.0.1:${port}/noticia`);
  assert.match(r.text, /Banco Central/);
  assert.match(r.text, /Golpe do pix cresceu/);
  await assert.rejects(fetchUrlText(`http://127.0.0.1:${port}/grande`), /grande demais/);
});

test("fetchUrlText: sem permissão, localhost é barrado", async () => {
  const old = process.env.SAGADECK_CONTEXT_ALLOW_LOCAL;
  delete process.env.SAGADECK_CONTEXT_ALLOW_LOCAL;
  try {
    await assert.rejects(fetchUrlText("http://127.0.0.1:9/x"), /rede local/);
  } finally { process.env.SAGADECK_CONTEXT_ALLOW_LOCAL = old; }
});

test("materialsBlock: rotula, trunca e ignora vazio", () => {
  assert.equal(materialsBlock([]), "");
  assert.equal(materialsBlock([{ name: "x", text: "" }]), "");
  const b = materialsBlock([{ name: "rel.pdf", text: "abc".repeat(5000), detail: "pdf" }]);
  assert.match(b, /MATERIAL ANEXADO/);
  assert.match(b, /rel\.pdf/);
  assert.ok(b.length < 15000, "truncado");
  assert.match(b, /truncado/);
});
