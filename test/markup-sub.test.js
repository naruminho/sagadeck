// Índice e expoente no meio do texto, como no Pandoc: t~c~ (t com c embaixo), m^2^ (m ao quadrado).
// A IA usa esse jeito sozinha ("Tempo de Concentração (t~c~)") e aparecia o til.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { md, plain } from "../src/markup.js";

test("~x~ é índice e ^x^ é expoente; ~~riscado~~ e ^^ênfase^^ continuam", () => {
  assert.equal(md("Tempo de Concentração (t~c~)"), "Tempo de Concentração (t<sub>c</sub>)");
  assert.equal(md("H~2~O e 10 m^3^/s"), "H<sub>2</sub>O e 10 m<sup>3</sup>/s");
  assert.equal(md("~~velho~~ e ^^novo^^"), '<s>velho</s> e <span class="em">novo</span>');
  assert.equal(md("cerca de ~5 km e ~10 m"), "cerca de ~5 km e ~10 m", "til de 'cerca de' com espaço depois não vira índice");
  assert.equal(plain("t~c~ e m^2^"), "tc e m2");
});
