// Peças de tela para mostrar o problema acontecendo, em vez de descrevê-lo: o diff do que a IA mudou, a árvore do
// projeto (onde ficam as regras e as skills) e o navegador com o DevTools aberto (a chave exposta). Vieram do deck
// "Vibe coding sem as obviedades" (15/11/2026), em que a IA não tinha como mostrar nada disso e escreveu em texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderSlide, buildHTML } from "../src/build.js";
import { lineDiff } from "../src/figures/mocks.js";
import { browserOrSkip } from "./helpers.js";

const html = (slide) => renderSlide(slide, 0, { title: "t", theme: "terminal-pro" }).html.replace(/\s+/g, " ");

test("lineDiff: linhas iguais, tiradas e postas, na ordem", () => {
  const d = lineDiff("function total(g) {\n  return soma(g);\n}", "function total(g) {\n  return { total: soma(g), moeda: 'BRL' };\n}");
  assert.deepEqual(d.map((x) => x.op), [" ", "-", "+", " "]);
  assert.equal(d[1].text, "  return soma(g);");
  assert.deepEqual(lineDiff("a\nb", "a\nb").map((x) => x.op), [" ", " "]);
  assert.deepEqual(lineDiff("", "x").map((x) => x.op), ["+"]);
});

test("mock: diff — antes e depois viram linhas com - e +, a mudança pode entrar num clique", () => {
  const out = html({ layout: "split", title: "Ela mudou o retorno", figure: { mock: "diff", file: "total.js", language: "javascript", step: 1,
    before: "function total(g) {\n  return soma(g);\n}", after: "function total(g) {\n  return { total: soma(g), moeda: 'BRL' };\n}", note: "quebrou 3 telas" } });
  assert.match(out, /<div class="mk mk-diff"/);
  assert.match(out, /mk-diff-file">total\.js</);
  assert.match(out, /<div class="mk-dl mk-del" data-step="1"><span class="mk-sign">-<\/span>/);
  assert.match(out, /<div class="mk-dl mk-add" data-step="1"><span class="mk-sign">\+<\/span>/);
  assert.match(out, /<div class="mk-dl mk-ctx"><span class="mk-sign"> <\/span><code>[\s\S]*tok-keyword">function/, "contexto sem clique, com realce");
  assert.match(out, /mk-diff-note"[^>]*>quebrou 3 telas</);
  // lines escritas à mão também valem
  const manual = html({ layout: "blocks", content: [{ mock: "diff", lines: ["  a", "- b", "+ c"] }] });
  assert.deepEqual([...manual.matchAll(/mk-dl (mk-\w+)/g)].map((m) => m[1]), ["mk-ctx", "mk-del", "mk-add"]);
});

test("mock: files — caminhos viram uma árvore com pastas, e a linha marcada acende no clique", () => {
  const out = html({ layout: "split", title: "Ensine uma vez", figure: { mock: "files", title: "meu-app", files: [
    "src/app.js", "src/telas/login.js", { path: "CLAUDE.md", mark: true, note: "regras do projeto", step: 1 }, { path: ".claude/skills/revisar-pr/SKILL.md", mark: true, step: 2 }] } });
  assert.match(out, /<div class="mk mk-files"/);
  const rows = [...out.matchAll(/<div class="mk-fl( mk-dir)?( mk-marked)?"[^>]*style="--lv:(\d)"[^>]*>[\s\S]*?<span class="mk-fname">([^<]+)</g)].map((m) => [m[4], +m[3], !!m[1]]);
  assert.deepEqual(rows, [
    [".claude", 0, true], ["skills", 1, true], ["revisar-pr", 2, true], ["SKILL.md", 3, false],
    ["src", 0, true], ["telas", 1, true], ["login.js", 2, false], ["app.js", 1, false],
    ["CLAUDE.md", 0, false],
  ], "pastas antes dos arquivos, cada nível recuado");
  assert.match(out, /<i class="mk-hl" data-step="1"><\/i>[\s\S]*?CLAUDE\.md[\s\S]*?mk-fnote" data-step="1">regras do projeto</);
});

test("mock: browser — barra de endereço, página e DevTools com a linha que entrega o segredo", () => {
  const out = html({ layout: "split", title: "Funciona não é seguro", figure: { mock: "browser", url: "meuapp.com/painel", title: "Painel de gastos",
    lines: [80, 60], devtools: { tab: "Network", lines: ["GET /api/gastos 200", { text: "Authorization: Bearer sk-live-...", mark: true, step: 1 }] } } });
  assert.match(out, /<div class="mk mk-browser"/);
  assert.match(out, /mk-url">meuapp\.com\/painel</);
  assert.match(out, /mk-page[\s\S]*mk-title">Painel de gastos</);
  assert.match(out, /mk-devtools[\s\S]*mk-dt-tab mk-on">Network</);
  assert.match(out, /<div class="mk-dt-line mk-marked"><i class="mk-hl" data-step="1"><\/i><span>Authorization: Bearer sk-live-\.\.\.<\/span>/);
});

test("diff, files e browser na apresentação: cabem no slide e sem erro de JavaScript", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-mocks-"));
  try {
    const file = path.join(dir, "d.html");
    const slides = [
      { layout: "split", title: "Ela mudou o retorno", figure: { mock: "diff", file: "total.js", language: "javascript", before: "export function total(gastos) {\n  return gastos.reduce((a, g) => a + g.valor, 0);\n}", after: "export function total(gastos) {\n  const soma = gastos.reduce((a, g) => a + g.valor, 0);\n  return { total: soma, moeda: 'BRL' };\n}" } },
      { layout: "split", title: "Ensine uma vez", figure: { mock: "files", title: "meu-app", files: ["CLAUDE.md", ".claude/skills/revisar-pr/SKILL.md", ".claude/skills/nova-tela/SKILL.md", "src/app.js", "src/telas/login.js", "src/telas/gastos.js", "package.json"] } },
      { layout: "split", title: "Funciona não é seguro", figure: { mock: "browser", url: "meuapp.com", title: "Painel", lines: [80, 60, 70], devtools: { tab: "Network", lines: ["GET /api/gastos 200", { text: "Authorization: Bearer sk-live-51Hx…", mark: true }] } } },
    ];
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "terminal-pro", slides }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    for (let n = 1; n <= slides.length; n++) {
      await page.goto(`file://${file.replace(/\\/g, "/")}?export#${n}`); await page.waitForTimeout(500);
      const r = await page.evaluate((i) => {
        const slide = document.querySelectorAll(".slide")[i], safe = slide.querySelector(".safe").getBoundingClientRect();
        const mk = slide.querySelector(".mk").getBoundingClientRect();
        const wide = [...slide.querySelectorAll(".mk *")].filter((e) => e.clientWidth && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== "hidden").map((e) => e.className);
        return { inside: mk.left >= safe.left - 2 && mk.right <= safe.right + 2 && mk.top >= safe.top - 2 && mk.bottom <= safe.bottom + 2, wide, shrink: slide.dataset.shrink || "1", h: mk.height };
      }, n - 1);
      assert.ok(r.inside, `slide ${n}: a peça cabe na área útil`);
      assert.deepEqual(r.wide, [], `slide ${n}: nada vaza pela direita`);
      assert.ok(r.h > 300, `slide ${n}: a peça não saiu miúda (${r.h})`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
