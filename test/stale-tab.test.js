// Abas atuais têm contextos independentes. Clientes antigos sem escopo continuam protegidos
// por expectFile: uma gravação nunca pode ir para a apresentação errada.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio } from "./helpers.js";

function lib() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-stale-"));
  const mk = (name, text) => {
    const f = path.join(root, "Aulas", name, `${name}.yaml`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, YAML.stringify({ title: name, theme: "sinal", slides: [{ layout: "statement", text }] }));
    return f;
  };
  return { root, a: mk("Aula A", "texto da A"), b: mk("Aula B", "texto da B") };
}
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("servidor: salvar, YAML e chat de uma aba que ficou noutra apresentação são recusados (409), sem gravar nada", async () => {
  const L = lib();
  const studio = await startStudio(L.a, { library: L.root });
  try {
    const specA = (await (await fetch(`${studio.url}/api/deck`)).json()).spec;
    // outra aba abriu a B
    assert.equal((await post(`${studio.url}/api/library/open`, { id: "Aulas/Aula B/Aula B.yaml" })).status, 200);
    const stale = { ...specA, slides: [{ layout: "statement", text: "A editada na aba antiga" }] };
    const r1 = await post(`${studio.url}/api/deck`, { spec: stale, expectFile: L.a });
    assert.equal(r1.status, 409);
    assert.match((await r1.json()).error, /Recarregue/);
    const r2 = await post(`${studio.url}/api/deck`, { yaml: YAML.stringify(stale), expectFile: L.a });
    assert.equal(r2.status, 409);
    const r3 = await post(`${studio.url}/api/ai/chat`, { message: "melhore", spec: specA, expectFile: L.a });
    assert.equal(r3.status, 409);
    assert.deepEqual(YAML.parse(fs.readFileSync(L.b, "utf8")).slides.map((s) => s.text), ["texto da B"], "a B não recebeu nada da aba antiga");
    // a aba que está na B grava normalmente; sem expectFile (outros fluxos), como antes
    assert.equal((await post(`${studio.url}/api/deck`, { spec: { title: "Aula B", theme: "sinal", slides: [{ layout: "statement", text: "B editada" }] }, expectFile: L.b })).status, 200);
    assert.deepEqual(YAML.parse(fs.readFileSync(L.b, "utf8")).slides.map((s) => s.text), ["B editada"]);
  } finally { await studio.close(); fs.rmSync(L.root, { recursive: true, force: true }); }
});

test("Studio: abrir outra apresentação não impede a aba original de salvar seu próprio arquivo", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const L = lib();
  const studio = await startStudio(L.a, { library: L.root });
  try {
    const { page, errors } = await newPage(browser, `${studio.url}/editor`);
    await page.waitForFunction(() => document.body.innerText.includes("texto da A"));
    await post(`${studio.url}/api/library/open`, { id: "Aulas/Aula B/Aula B.yaml" }); // outra aba/aparelho
    // a pessoa mexe na aba antiga (a A): o Studio tenta salvar
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/deck" && r.request().method() === "POST");
    const campo = page.locator('#slide-fields-form .sf-field:has(.sf-label:text-is("Frase")) textarea, #slide-fields-form .sf-field:has(.sf-label:text-is("Frase")) input').first();
    await campo.fill("texto da A mudado na aba antiga");
    const res = await saved;
    assert.equal(res.status(), 200);
    assert.equal(YAML.parse(fs.readFileSync(L.a, "utf8")).slides[0].text, "texto da A mudado na aba antiga");
    assert.deepEqual(YAML.parse(fs.readFileSync(L.b, "utf8")).slides.map((s) => s.text), ["texto da B"]);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await studio.close(); await browser.close(); fs.rmSync(L.root, { recursive: true, force: true }); }
});
