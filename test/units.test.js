// Unidades na conferência das contas: conversão para o SI, dimensão da conta e a fórmula do slide que não fecha.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnit, dimensionOf, dimText } from "../src/ai/units.js";
import { evaluateUnits, auditMath } from "../src/ai/math-check.js";

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test("unidades: fator para o SI e dimensão das que aparecem em aula e relatório", () => {
  assert.ok(close(parseUnit("kN/m²").factor, 1000));
  assert.deepEqual(parseUnit("kN/m²").dim, parseUnit("Pa").dim);
  assert.ok(close(parseUnit("L/s").factor, 1e-3));
  assert.deepEqual(parseUnit("L/s").dim, parseUnit("m³/s").dim);
  assert.ok(close(parseUnit("cm").factor, 0.01));
  assert.ok(close(parseUnit("km/h").factor, 1000 / 3600));
  assert.ok(close(parseUnit("m/s^2").factor, 1));
  assert.deepEqual(parseUnit("m/s²").dim, parseUnit("N/kg").dim);
  assert.deepEqual(parseUnit("kN/m³").dim, parseUnit("N/m^3").dim);
  assert.deepEqual(parseUnit("mH₂O").dim, parseUnit("m").dim, "carga em coluna de água é altura");
  assert.deepEqual(parseUnit("m.c.a.").dim, parseUnit("m").dim);
  assert.ok(close(parseUnit("%").factor, 0.01));
  assert.deepEqual(parseUnit("").dim, [0, 0, 0, 0, 0, 0, 0]);
  assert.ok(close(parseUnit("\\mathrm{m^3/s}").factor, 1));
  assert.ok(close(parseUnit("mm").factor, 1e-3) && close(parseUnit("min").factor, 60) && close(parseUnit("MPa").factor, 1e6));
  assert.equal(parseUnit("furlong"), null, "desconhecida: confere sem unidades");
  assert.equal(dimText(parseUnit("m/s").dim), "m·s^-1");
  assert.equal(dimText(parseUnit("").dim), "adimensional");
});

test("dimensão de uma conta sem árvore: escala as grandezas e vê como o resultado muda", () => {
  // v = sqrt(2 g h): comprimento ^1 e tempo ^-1
  const g = parseUnit("m/s²"), h = parseUnit("m");
  const k = (sc, dim) => dim.reduce((p, e, i) => p * sc[i] ** e, 1);
  const v = dimensionOf((sc) => Math.sqrt(2 * 9.81 * k(sc, g.dim) * 5 * k(sc, h.dim)));
  assert.deepEqual(v.dim, parseUnit("m/s").dim);
  // metro + pascal não é potência de nada
  const mix = dimensionOf((sc) => 5 * k(sc, h.dim) + 100 * k(sc, parseUnit("Pa").dim));
  assert.equal(mix.mixed, true);
});

test("conta com unidades: converte para o SI e volta para a unidade do resultado", () => {
  // vazão em L/s e diâmetro em cm, resposta em m/s: sem conversão daria 100 vezes errado
  const u = evaluateUnits({ vars: { Q: 30, D: 25 }, unidades: { Q: "L/s", D: "cm" }, unidade: "m/s" }, "4*Q/(pi*D^2)");
  assert.ok(close(u.value, 4 * 0.03 / (Math.PI * 0.25 ** 2), 1e-9), String(u.value));
  assert.equal(u.dimOk, true);
  // resultado pedido em cm de uma conta em m
  const cm = evaluateUnits({ vars: { a: 2.73, j: 0.01 }, unidades: { a: "m", j: "" }, unidade: "cm" }, "a/j");
  assert.ok(close(cm.value, 27300));
  // conta que sai em m quando o resultado é m/s
  const errada = evaluateUnits({ vars: { Q: 30, D: 0.25 }, unidades: { Q: "L/s", D: "m" }, unidade: "m/s" }, "Q/D");
  assert.equal(errada.dimOk, false);
  assert.equal(evaluateUnits({ vars: { x: 1 }, unidades: { x: "furlong" }, unidade: "m" }, "x"), null, "unidade desconhecida: sem unidades");
});

test("conta que converte na mão para a unidade do resultado (*1000 para L/s, *100 para cm) não é convertida de novo", () => {
  // em produção: "107 L/s, a conta dá 106.400" e "120 cm, a conta dá 12.000" (o modelo já tinha multiplicado)
  assert.equal(evaluateUnits({ vars: { A: 0.0707, v: 1.505 }, unidades: { A: "m²", v: "m/s" }, unidade: "L/s" }, "A*v*1000"), null);
  assert.equal(evaluateUnits({ vars: { p: 1.2 }, unidades: { p: "m" }, unidade: "cm" }, "p*100"), null);
  // sem converter na mão, o código converte: A*v em m³/s sai em L/s
  const ok = evaluateUnits({ vars: { A: 0.0707, v: 1.505 }, unidades: { A: "m²", v: "m/s" }, unidade: "L/s" }, "A*v");
  assert.ok(Math.abs(ok.value - 106.4) < 0.1, String(ok.value));
});

test("conta que já converte na mão (Q/1000 com Q em L/s) não é convertida de novo; resultado sem unidade fica no SI", () => {
  // o modelo real escreveu "(Q/1000)/(pi*(D/2)^2)" com Q em L/s: converter de novo dava 0,0019 m/s e acusava um
  // gabarito certo (1,91 m/s)
  assert.equal(evaluateUnits({ vars: { Q: 15, D: 0.1 }, unidades: { Q: "L/s", D: "m" }, unidade: "m/s" }, "(Q/1000)/(pi*(D/2)^2)"), null, "vale a conta como escrita");
  assert.equal(evaluateUnits({ vars: { t: 2 }, unidades: { t: "h" }, unidade: "s" }, "t*3600"), null);
  const semConversao = evaluateUnits({ vars: { Q: 15, D: 0.1 }, unidades: { Q: "L/s", D: "m" }, unidade: "m/s" }, "Q/(pi*(D/2)^2)");
  assert.ok(Math.abs(semConversao.value - 1.9099) < 1e-3);
  // o modelo esqueceu a unidade do resultado: o número no SI, sem acusar a dimensão
  const semUnidade = evaluateUnits({ vars: { V: 12, Q: 0.05 }, unidades: { V: "m³", Q: "m³/s" }, unidade: "" }, "V/Q");
  assert.equal(semUnidade.value, 240);
  assert.equal(semUnidade.dimOk, true);
});

test("fórmula do slide que soma metro com pressão vira conta que não bate (unidades), com o motivo", async () => {
  const spec = { slides: [{ layout: "solution", title: "Ex.", steps: [{ latex: "h = 9{,}45 - p/\\gamma = 2{,}7\\ m" }], answer: { text: "h ≈ 2,7 m" } }] };
  const complete = async () => ({ text: JSON.stringify({ contas: [
    { slide: 1, o_que: "altura disponível", afirmado: "2,7", unidade: "m", vars: { ha: 9.45, p: 66.7, gama: 9.81 }, unidades: { ha: "m", p: "kN/m²", gama: "kN/m³" },
      fn: "ha - p/gama", fn_slide: "ha - p" },
  ] }) });
  const r = await auditMath(spec, [0], { complete });
  assert.equal(r.checked.length, 1, "o valor bate");
  assert.equal(r.divergent.length, 1);
  assert.equal(r.divergent[0].kind, "unidades");
  assert.match(r.divergent[0].motivo, /soma grandezas de unidades diferentes/);
});

test("fórmula do slide só é acusada quando a conta da própria IA fecha em unidades", async () => {
  // a IA deixou um número com unidade solto na fórmula (7.5 m): a conta dela não fecha, e aí não dá para culpar o slide
  const spec = { slides: [{ layout: "solution", title: "Ex.", answer: { text: "v ≈ 1,5 m/s" } }] };
  const complete = async () => ({ text: JSON.stringify({ contas: [
    { slide: 1, o_que: "velocidade", afirmado: "1,5", unidade: "m/s", vars: { g: 9.81, D: 0.3, f: 0.026, L: 750 }, unidades: { g: "m/s²", D: "m", f: "", L: "m" },
      fn: "sqrt(2*g*7.5*D/(f*L))", fn_slide: "sqrt(2*g*D/(f*L))" },
  ] }) });
  const r = await auditMath(spec, [0], { complete });
  assert.equal(r.checked.length, 1, "o número confere (literal no SI)");
  assert.equal(r.divergent.length, 0);
  assert.match(r.checked[0].unidadesDaConta, /sai em/);
});
