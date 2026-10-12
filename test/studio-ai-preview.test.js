import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import JSZip from "jszip";
import { startStudio, browserOrSkip, newPage } from "./helpers.js";
import { startMockLLM } from "./mock-llm.js";

const reply = (req) => /Troque o título da capa/.test(req.lastUser)
  ? '```yaml\nedit:\n  1: {title: Capa da Ana}\n```'
  : "Podemos conversar sobre a apresentação.";

test("chat de modelo em prévia no multiusuário conversa sem arquivo e salva a edição numa única cópia", { timeout: 90000 }, async () => {
  const llm = await startMockLLM(reply);
  const studio = await startStudio(null, { llmUrl: llm.url, multiuser: true });
  const call = async (route, body, user = "ana") => (await fetch(studio.url + route, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-sagadeck-user": user, "x-sagadeck-workspace": "previa" },
    body: body ? JSON.stringify(body) : undefined,
  })).json();
  try {
    await call("/api/library/decks/model-preview", { key: "lavanda" });
    const before = await call("/api/deck");
    assert.equal(before.file, null);
    const talk = await call("/api/ai/chat", { message: "Vamos conversar", spec: before.spec, targetSlide: null });
    assert.equal(talk.mode, "llm", talk.reply);
    assert.equal(talk.talk, true);
    assert.equal((await call("/api/library")).decks.length, 0, "conversa não cria uma cópia");
    const edit = await call("/api/ai/chat", { message: "Troque o título da capa", spec: before.spec, targetSlide: null });
    assert.equal(edit.mode, "llm", edit.reply);
    const after = await call("/api/deck");
    assert.ok(after.file, "a aba passa a usar o arquivo criado");
    assert.equal(after.preview, null);
    assert.equal(YAML.parse(fs.readFileSync(after.file, "utf8")).slides[0].title, "Capa da Ana");
    assert.equal(edit.materialized.file, after.file);
    assert.equal((await call("/api/library")).decks.length, 1);
    assert.equal((await call("/api/library", null, "bia")).decks.length, 0, "outra pessoa não recebe a cópia");
    await call("/api/ai/chat", { message: "Vamos conversar", spec: after.spec, targetSlide: null });
    assert.equal((await call("/api/deck")).file, after.file);
    assert.equal((await call("/api/library")).decks.length, 1, "pedido seguinte usa a mesma cópia");
    await call("/api/library/decks/model-preview", { key: "lavanda" });
    assert.equal((await call("/api/deck")).spec.slides[0].title, before.spec.slides[0].title, "modelo de fábrica preservado");
  } finally { await studio.close(); await llm.close(); }
});

test("Assistente na prévia atualiza o endereço e mantém a edição depois de recarregar", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const llm = await startMockLLM(reply);
  const studio = await startStudio(null, { llmUrl: llm.url, multiuser: true });
  try {
    const { page, errors } = await newPage(browser);
    await page.setExtraHTTPHeaders({ "x-sagadeck-user": "ana" });
    await page.goto(studio.url + "/editor?model=lavanda", { waitUntil: "networkidle" });
    await page.waitForSelector('.thumb-card[data-idx="0"]');
    await page.click("#tab-btn-chat");
    await page.fill("#chat-input", "Troque o título da capa");
    await page.click("#chat-send");
    await page.waitForFunction(() => !document.querySelector(".ai-working") && /Capa da Ana/.test(document.querySelector("#rendered-slide-container")?.textContent || ""), null, { timeout: 60000 });
    assert.match(page.url(), /[?&]deck=/);
    assert.ok(await page.isHidden("#preview-banner"));
    const saved = await page.evaluate(async () => (await (await fetch("api/deck")).json()));
    assert.equal(YAML.parse(fs.readFileSync(saved.file, "utf8")).slides[0].title, "Capa da Ana");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => /Capa da Ana/.test(document.querySelector("#rendered-slide-container")?.textContent || ""));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); await llm.close(); }
});

test("documento anexado ao modelo em prévia fica na cópia pessoal", { timeout: 90000 }, async () => {
  const llm = await startMockLLM(reply);
  const studio = await startStudio(null, { llmUrl: llm.url, multiuser: true });
  const call = async (route, body) => (await fetch(studio.url + route, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-sagadeck-user": "ana" },
    body: body ? JSON.stringify(body) : undefined,
  })).json();
  try {
    await call("/api/library/decks/model-preview", { key: "lavanda" });
    const doc = await new JSZip().file("word/document.xml",
      "<w:document><w:body><w:p><w:r><w:t>Relatório: 40% em 2025.</w:t></w:r></w:p></w:body></w:document>").generateAsync({ type: "nodebuffer" });
    const uploaded = await call("/api/ai/context", { name: "relatorio.docx",
      dataUrl: "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," + doc.toString("base64") });
    assert.ok(uploaded.id, JSON.stringify(uploaded));
    const spec = (await call("/api/deck")).spec;
    const result = await call("/api/ai/chat", { message: "Vamos conversar", spec, targetSlide: null,
      attachments: [{ type: "doc", id: uploaded.id }] });
    assert.equal(result.mode, "llm", result.reply);
    const saved = await call("/api/deck");
    assert.equal(result.materialized.file, saved.file);
    const { storedDocumentMaterials } = await import("../src/ai/document-materials.js");
    assert.match(storedDocumentMaterials(path.dirname(saved.file))[0].text, /40% em 2025/);
    assert.ok(llm.requests.some(r => /MATERIAL ANEXADO/.test(r.lastUser) && /40% em 2025/.test(r.lastUser)));
    assert.equal((await call("/api/library")).decks.length, 1);
  } finally { await studio.close(); await llm.close(); }
});

test("imagem gerada na prévia usa a pasta da cópia e fica referenciada no deck salvo", { timeout: 90000 }, async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const llm = await startMockLLM(req => /^Generate an image:/.test(req.lastUser)
    ? { image: "data:image/png;base64," + png.toString("base64") }
    : '```yaml\nedit:\n  1:\n    figure: {image_prompt: "uma paisagem com árvores"}\n```');
  const studio = await startStudio(null, { llmUrl: llm.url, multiuser: true });
  const call = async (route, body) => (await fetch(studio.url + route, {
    method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-sagadeck-user": "ana" },
    body: body ? JSON.stringify(body) : undefined,
  })).json();
  try {
    const preview = await call("/api/library/decks/model-preview", { key: "lavanda" });
    const result = await call("/api/ai/chat", { message: "Crie uma imagem para a capa", spec: preview.spec, targetSlide: null });
    assert.equal(result.mode, "llm", result.reply);
    const saved = await call("/api/deck");
    const figure = YAML.parse(fs.readFileSync(saved.file, "utf8")).slides[0].figure;
    assert.match(figure.image, /^imagens\/ia-.*\.png$/);
    assert.deepEqual(fs.readFileSync(path.resolve(path.dirname(saved.file), figure.image)), png);
    assert.equal(result.materialized.file, saved.file);
    assert.equal((await call("/api/library")).decks.length, 1);
  } finally { await studio.close(); await llm.close(); }
});
