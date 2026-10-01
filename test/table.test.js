// Tabela de verdade (src/table.js): layout `table` e elemento `table` — cores do tema, números à direita, destaque,
// total, estilos; no Studio: Novo slide › Tabela, grade que aceita colar do Excel, Inserir › Tabela.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { tableModel, tableHTML } from "../src/table.js";
import { renderSlide } from "../src/build.js";
import { browserOrSkip, newPage, startStudio, tempDeck, novoSlide } from "./helpers.js";

test("tabela: cabeçalho, números à direita, destaque, total e as formas de dar os dados", () => {
  const h = tableHTML({ head: ["Ano", "Vazão (m³/s)", "Situação"], rows: [["1984", "2.218,0", "cheia"], ["1985", "R$ 1.980,5", "normal"], ["Total", "4.198,5", ""]], highlight: { row: 1 }, total: true, color: "c2" });
  assert.match(h, /<thead><tr><th class="num">Ano<\/th><th class="num">Vazão \(m³\/s\)<\/th><th class="">Situação<\/th>/);
  assert.match(h, /<tr class="hl">/);
  assert.match(h, /<tr class=" tot">/);
  assert.match(h, /--tb-c:var\(--c-c2\)/);
  // objetos: as chaves viram o cabeçalho; csv colado do Excel; lista de listas no elemento
  assert.deepEqual(tableModel({ rows: [{ a: 1, b: 2 }, { a: 3 }] }), { head: ["a", "b"], rows: [[1, 2], [3, ""]], n: 2 });
  assert.deepEqual(tableModel({ csv: "x\ty\n1\t2" }).head, ["x", "y"]);
  const el = { layout: "canvas", elements: [{ table: [["A", "B"], ["1", "2"]], x: 0, y: 0, w: 600 }] };
  const he = renderSlide(el, 0, { slides: [el] }).html;
  assert.match(he, /class="tbl"[^>]*data-vkey=/, "objeto ajustável no Studio");
  assert.match(he, /<thead><tr><th class="num">A<\/th>/, "a 1ª linha da lista é o cabeçalho");
  // estilos
  for (const style of ["zebra", "linhas", "colunas", "cartao"]) assert.match(tableHTML({ head: ["a"], rows: [["1"]], style }), new RegExp(`tb-${style}`));
  assert.throws(() => tableHTML({}), /tabela vazia/);
  const s = { layout: "table", title: "Vazões", head: ["Ano", "Q"], rows: [["1984", "2218"]], side: "A maior ==cheia==", source: "ANA" };
  assert.match(renderSlide(s, 0, { slides: [s] }).html, /L-table with-side[\s\S]*dtable[\s\S]*tb-side[\s\S]*ANA/);
});

test("Studio: Novo slide › Tabela, colar do Excel na grade, Inserir › Tabela — tudo no deck salvo", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  const studio = await startStudio(deck.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deck.file, "utf8"));
    const n0 = saved().slides.length;
    await novoSlide(p, "table");
    await p.waitForTimeout(900);
    const s = saved().slides.find((x) => x.layout === "table");
    assert.ok(s && s.rows.length >= 2, "o slide de tabela nasceu com o exemplo");
    assert.equal(saved().slides.length, n0 + 1);
    // colar do Excel na primeira célula de dados: preenche linhas e colunas
    await p.click("#tab-btn-props");
    const cell = p.locator('[data-tcell="1,0"]');
    await cell.waitFor();
    await cell.evaluate((el) => { const dt = new DataTransfer(); dt.setData("text/plain", "2001\t10,5\t1\t2,0\n2002\t20,0\t2\t1,5"); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
    await p.waitForTimeout(900);
    const rows = saved().slides.find((x) => x.layout === "table").rows;
    assert.deepEqual(rows.slice(0, 2).map((r) => r.slice(0, 2)), [["2001", "10,5"], ["2002", "20,0"]]);
    await p.locator("#rendered-slide-container .dtable td", { hasText: "10,5" }).first().waitFor();
    // Inserir › Tabela num slide qualquer
    await p.click('.thumb-card[data-idx="0"]');
    await p.click('.ribbon-tab[data-tab="inserir"]');
    await p.getByRole("button", { name: "Tabela", exact: true }).click();
    await p.waitForTimeout(900);
    const first = saved().slides[0];
    const list = first.layout === "canvas" ? first.elements : [].concat(first.add || []);
    assert.ok(list.some((e) => e?.table?.head), JSON.stringify(first).slice(0, 300));
    await p.locator('#rendered-slide-container .slide .dtable').first().waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
