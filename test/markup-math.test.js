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
  const { html } = buildHTML({ title: "t", theme: "sinal", slides: [{ layout: "statement", text: "Kirpich: $t_c = 57 (L^3/H)^{0,385}$" }] });
  assert.match(html, /\.katex\{/);
});
