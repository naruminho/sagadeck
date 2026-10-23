// O roteiro dos testes com o modelo de verdade na CI (scripts/ai-live-ci.mjs): acha as falhas no resumo do node --test,
// repete cada uma pelo nome exato, separa instável de quebrado e escreve o resumo. Sem IA configurada, avisa e passa.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { failedTests, exactPattern, summary, failureReason, liveRelease } from "../scripts/ai-live-ci.mjs";
import { ROOT } from "./helpers.js";

const SAIDA = `✔ conversa (não mexe): "o que você acha da capa?" (11758.1ms)
✖ refinamento: conversa e depois 'pode fazer' aplica o combinado (16368.79ms)
✖ conferência das contas: o modelo acha a conta errada e a correção chega ao slide (240 s, não 600 s) (24433.4ms)
ℹ tests 27
ℹ pass 25
ℹ fail 2

✖ failing tests:

test at test\\ai-live.test.js:47:1
✖ refinamento: conversa e depois 'pode fazer' aplica o combinado (16368.79ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /40%/. Input:
    actual: '{"layout":"statement"}',

test at test\\ai-live.test.js:206:1
✖ conferência das contas: o modelo acha a conta errada e a correção chega ao slide (240 s, não 600 s) (24433.4ms)
  AssertionError [ERR_ASSERTION]: a resposta foi corrigida
`;

test("roteiro dos testes ao vivo: acha as falhas pelo resumo e monta o nome exato para repetir", () => {
  const names = failedTests(SAIDA);
  assert.deepEqual(names, ["refinamento: conversa e depois 'pode fazer' aplica o combinado",
    "conferência das contas: o modelo acha a conta errada e a correção chega ao slide (240 s, não 600 s)"]);
  // parênteses, aspas e "+" do nome não viram expressão regular: casa só aquele teste
  for (const n of [...names, "versões: 6+ slides? (sim)"]) {
    const re = new RegExp(exactPattern(n));
    assert.ok(re.test(n), n);
    assert.ok(!re.test(`${n} outro`), "nome exato, sem pegar outro teste que comece igual");
  }
  assert.match(failureReason(SAIDA, names[0]), /did not match the regular expression \/40%\//);
  assert.deepEqual(failedTests("ℹ tests 3\nℹ pass 3\n"), [], "sem falha, nada a repetir");
});

test("roteiro dos testes ao vivo: resumo separa instável (passou na repetição) de quebrado (falhou duas vezes)", () => {
  const text = summary({ total: 27, passed: 25, flaky: ["refinamento"], broken: [{ name: "contas", reason: "AssertionError: a resposta foi corrigida" }], seconds: 1900 });
  assert.match(text, /25 de 27 passaram de primeira em 32 min/);
  assert.match(text, /\*\*Instáveis\*\*[^]*- refinamento/);
  assert.match(text, /\*\*Falharam duas vezes\*\*[^]*- contas[^]*a resposta foi corrigida/);
  assert.match(summary({ total: 27, passed: 27, flaky: [], broken: [], seconds: 60 }), /Nenhuma falha/);
});

test("roteiro dos testes ao vivo: sem IA configurada, avisa e termina sem erro (o workflow fica verde)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-ia-ci-"));
  try {
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "ai-live-ci.mjs")], { cwd: ROOT, encoding: "utf8",
      env: { ...process.env, SAGADECK_IA: path.join(dir, "nao-existe.json") } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /IA não configurada[^]*não rodaram/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("testes ao vivo a cada 3 versões: só nas versões cujo último número é múltiplo de 3", () => {
  // rodar a cada release custava demais e agendado rodava à toa: a cada três releases cobre o que entrou no intervalo
  for (const v of ["1.11.3", "1.11.6", "1.12.0", "2.0.9"]) assert.equal(liveRelease(v), true, v);
  for (const v of ["1.11.2", "1.11.4", "1.11.5", "1.12.1", "", "x"]) assert.equal(liveRelease(v), false, v);
  // --na-release lê a versão do package.json: numa que não é múltipla de 3, avisa a próxima e não roda nada
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  if (!liveRelease(version)) {
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "ai-live-ci.mjs"), "--na-release"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /rodam só antes das versões múltiplas de 3 \(a próxima: \d+\.\d+\.\d+\)/);
  }
});
