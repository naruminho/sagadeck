// A divisão da suíte em partes para a CI (scripts/test-parte.mjs): todo arquivo de teste cai em exatamente uma parte,
// os pesados ficam separados e as partes terminam perto uma da outra. Arquivo esquecido fora das partes nunca rodaria
// na CI, e ninguém perceberia.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { splitTests, parseParte, PESOS, PESO_PADRAO } from "../scripts/test-parte.mjs";
import { ROOT } from "./helpers.js";

const FILES = fs.readdirSync(path.join(ROOT, "test")).filter((f) => f.endsWith(".test.js"));

test("partes da CI: todo arquivo de teste roda em exatamente uma parte, e as partes ficam equilibradas", () => {
  for (const total of [1, 2, 3, 4]) {
    const parts = splitTests(FILES, total);
    const all = parts.flatMap((p) => p.files);
    assert.equal(all.length, FILES.length, `${total} partes: nenhum arquivo some nem repete`);
    assert.deepEqual([...all].sort(), [...FILES].sort());
    const weights = parts.map((p) => p.weight), heaviest = Math.max(...FILES.map((f) => PESOS[f] ?? PESO_PADRAO));
    // a diferença entre a parte mais pesada e a mais leve não passa do maior arquivo (o guloso garante isso)
    assert.ok(Math.max(...weights) - Math.min(...weights) <= heaviest, `${total} partes: ${weights.join(" / ")}`);
  }
  const [a, b, c] = splitTests(FILES, 3);
  const where = (f) => [a, b, c].findIndex((p) => p.files.includes(f));
  assert.notEqual(where("studio.test.js"), where("transform.test.js"), "os dois mais pesados não caem juntos");
  assert.deepEqual(splitTests(FILES, 3), splitTests([...FILES].reverse(), 3), "a divisão não depende da ordem da listagem");
  // a tabela de pesos só fala de arquivos que existem (renomeou ou apagou um teste: tire da tabela)
  for (const f of Object.keys(PESOS)) assert.ok(FILES.includes(f), `${f} está nos pesos mas não existe em test/`);
});

test("partes da CI: N/M válido, e --listar mostra os arquivos sem rodar", () => {
  assert.deepEqual(parseParte("2/3"), { index: 2, total: 3 });
  for (const bad of ["0/3", "4/3", "2", "", "a/b"]) assert.throws(() => parseParte(bad), /Parte inválida/);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "test-parte.mjs"), "1/3", "--listar"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Parte 1\/3: \d+ de \d+ arquivos/);
  assert.ok(r.stdout.split(/\r?\n/).some((l) => FILES.includes(l)));
});
