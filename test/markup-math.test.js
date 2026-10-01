// Fórmula no meio do texto ($…$ e $$…$$) em qualquer campo de texto; dinheiro continua texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { md } from "../src/markup.js";
import { buildHTML } from "../src/build.js";

test("$fórmula$ vira matemática desenhada; R$ 10, $5 e $6 continuam texto; o CSS da fórmula entra no HTML", () => {
  const h = md(String.raw`A segurança é $S = \left(1 - \frac{1}{TR}\right)^n$ no período`);
  assert.match(h, /class="katex"/);
  assert.doesNotMatch(h, /katex-error/);
  assert.match(h, /<mfrac>/, "a fração desenhada");
  assert.match(md("Use $$Q = C i A$$ assim"), /katex-display/);
  assert.equal(md("Custa R$ 10 e $5 ou $6"), "Custa R$ 10 e $5 ou $6");
  assert.match(md("**forte** com $x^2$ e ==marca=="), /<b>forte<\/b> com <span class="katex">[\s\S]*<mark>marca<\/mark>/);
  // fórmula quebrada (chave a mais): aparece a própria fórmula, marcada, e não "undefined"
  const bad = md(String.raw`antes $$ S_1 = \frac{a}}{L} $$ depois`);
  assert.doesNotMatch(bad, /undefined/);
  assert.match(bad, /class="f-mono tex-error"[^>]*>S_1 = \\frac\{a\}\}\{L\}</);
  const { html } = buildHTML({ title: "t", theme: "sinal", slides: [{ layout: "statement", text: "Kirpich: $t_c = 57 (L^3/H)^{0,385}$" }] });
  assert.match(html, /\.katex\{/);
});

test("a IA recebe de volta a fórmula que não compila (validateSlides)", async () => {
  const { validateSlides } = await import("../src/ai/deck-ai.js");
  assert.throws(() => validateSlides({ slides: [{ layout: "statement", text: String.raw`S = $\frac{a}}{L}$ ok` }] }), /fórmula que não compila: \$\\frac\{a\}\}\{L\}\$/);
  validateSlides({ slides: [{ layout: "statement", text: String.raw`S = $\frac{a}{L}$ ok` }] });
});

test("tabela em markdown no meio do texto vira tabela de verdade; barra solta continua texto", () => {
  const h = md("Veja:\n| Classe | f |\n|---|---|\n| 150 a 155 | 0,01 |\n| 155 a 160 | 0,03 |\nE pronto.");
  assert.match(h, /^Veja:<div class="dtable-wrap[^"]*md-table"/);
  assert.match(h, /<thead><tr><th class="">Classe<\/th><th class="num">f<\/th><\/tr><\/thead>/);
  assert.match(h, /<td class="num">0,03<\/td><\/tr><\/tbody><\/table><\/div>E pronto\.$/);
  assert.doesNotMatch(md("| a | b |\n| 1 | 2 |"), /<thead>/, "sem a linha |---| não há cabeçalho");
  assert.equal(md("x | y"), "x | y");
});
