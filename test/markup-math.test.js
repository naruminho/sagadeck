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

test("a IA escreve fórmula e tabela de outros jeitos: \\( \\), \\[ \\], \\\\frac (barra dobrada) e tabela numa linha só", () => {
  // \( … \) e \[ … \] (o jeito do LaTeX) valem como $…$ e $$…$$
  const paren = md(String.raw`Aplicar \( P = \frac{m}{N+1} \) e \[ TR = \frac{1}{P} \] com N = 8.`);
  assert.equal((paren.match(/class="katex"/g) || []).length, 2, paren.slice(0, 200));
  assert.match(paren, /katex-display/);
  assert.doesNotMatch(paren, /\\\(|\\\[/);
  // \\frac (barra dobrada, de YAML em bloco): em LaTeX \\ é quebra de linha e saía "TR =" e "frac1P"
  const dbl = md(String.raw`$$TR = \\frac{1}{P}$$ e $s_{\\log x}$`);
  assert.match(dbl, /<mfrac>/, "a fração desenhada");
  assert.doesNotMatch(dbl, /frac1P|>frac</);
  assert.match(md(String.raw`$a \\ b$`), /class="katex"/, "a quebra de linha de verdade (\\ seguido de espaço) continua");
  // tabela que a IA escreveu numa linha só (o YAML juntou as linhas)
  const one = md("Analisar a série.\n| Ano | Q máx (m³/s) | |-----|-------------| | 1984 | 1796.8 | | 1985 | 1492.0 | | 1986 | 1565.0 |\n**Entregar por email.**");
  assert.match(one, /<thead><tr><th[^>]*>Ano<\/th><th[^>]*>Q máx \(m³\/s\)<\/th><\/tr><\/thead>/);
  assert.equal((one.match(/<tr class="">/g) || []).length, 3, "3 linhas de dados");
  assert.match(one, /<\/table><\/div><b>Entregar por email\.<\/b>$/);
});

test("número sozinho entre cifrões é fórmula ($2$, $10^3$), dinheiro com espaço continua texto", () => {
  assert.match(md("$K_c > 1{,}5$ a $2$ alongada"), /^<span class="katex">[\s\S]*a <span class="katex">[\s\S]*alongada$/);
  assert.doesNotMatch(md("$K_c > 1{,}5$ a $2$"), /\$/, "nenhum cifrão sobra");
  assert.match(md("entre $10^3$ e"), /class="katex"/);
  assert.equal(md("Custa R$ 10 e $5 ou $6"), "Custa R$ 10 e $5 ou $6");
  assert.equal(md("de $5 a $10 por mês"), "de $5 a $10 por mês");
});
