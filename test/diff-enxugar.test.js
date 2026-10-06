// diff por uid + relatório anti-sono: o que entrou/saiu/mudou/andou e quem estoura o limite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffDecks, formatDiff } from "../src/diff.js";
import { enxugarReport, formatEnxugar } from "../src/fiscal/enxugar.js";

const deckA = { purpose: "palestra", slides: [
  { uid: "u1", layout: "title", title: "Capa" },
  { uid: "u2", layout: "bullets", title: "Meio", bullets: ["a", "b"] },
  { uid: "u3", layout: "title", title: "Fim" },
] };
const deckB = { purpose: "palestra", slides: [
  { uid: "u1", layout: "title", title: "Capa" },
  { uid: "u3", layout: "title", title: "Fim!" },
  { uid: "u4", layout: "title", title: "Novo" },
] };

test("diff: removido, adicionado, mudado e movido", () => {
  const d = diffDecks(deckA, deckB);
  assert.equal(d.same, false);
  assert.deepEqual(d.removed.map((r) => r.title), ["Meio"]);
  assert.deepEqual(d.added.map((a) => a.title), ["Novo"]);
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].title, "Fim!");
  assert.ok(d.changed[0].fields.includes("title"));
  assert.deepEqual(d.moved.map((m) => [m.from, m.to]), [[2, 1]]);
  const txt = formatDiff(d, { aName: "a.yaml", bName: "b.yaml" });
  assert.ok(txt.includes("Meio") && txt.includes("Novo") && txt.includes("andou"));
});

test("diff: decks iguais", () => {
  const d = diffDecks(deckA, JSON.parse(JSON.stringify(deckA)));
  assert.equal(d.same, true);
  assert.equal(formatDiff(d), "iguais: nenhum slide entrou, saiu, mudou ou andou.");
});

test("enxugar: aponta o slide acima do limite do material", () => {
  const spec = { purpose: "palestra", slides: [
    { layout: "bullets", title: "Curto", bullets: ["um", "dois"] },
    { layout: "bullets", title: "Longo", body: Array(30).fill("palavra de enchimento para teste").join(" ") },
  ] };
  const rows = enxugarReport(spec);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].over, 0);
  assert.ok(rows[1].over > 0 && rows[1].limit === 40);
  const txt = formatEnxugar(rows);
  assert.ok(txt.includes("slide 2") && txt.includes("+"));
});

test("enxugar: tudo dentro do limite", () => {
  const rows = enxugarReport({ purpose: "consulta", slides: [{ layout: "title", title: "Oi" }] });
  assert.equal(rows[0].over, 0);
  assert.ok(formatEnxugar(rows).startsWith("ok:"));
});
