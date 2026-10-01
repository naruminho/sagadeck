// Travas de qualidade que não dependem de ferramenta externa:
//  - os três arquivos grandes do Studio não podem crescer mais (código novo vai para um módulo próprio: history.js,
//    visual-keys.js, instance.js, table.js…). Diminuiu? Baixe o limite junto.
//  - todo ajuste visual que o motor entende (src/visual-edits.js) está na lista da referência (a IA e o
//    inspetor falam a mesma língua).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers.js";

const LIMITS = { // bytes
  "src/studio/public/app.js": 274_000,
  "src/studio/server.js": 112_000,
  "src/studio/public/slide-form.js": 110_000,
};

test("monolitos do Studio não crescem (o novo vai para um módulo próprio)", () => {
  for (const [file, max] of Object.entries(LIMITS)) {
    const size = fs.statSync(path.join(ROOT, file)).size;
    assert.ok(size <= max, `${file}: ${size} bytes (limite ${max}). Tire uma parte para um módulo novo em vez de aumentar o limite.`);
  }
});

test("todo ajuste visual do motor está na referência", () => {
  const code = fs.readFileSync(path.join(ROOT, "src", "visual-edits.js"), "utf8");
  const keys = [...new Set([...code.matchAll(/\be\.([a-zA-Z]+)/g)].map((m) => m[1]))];
  const ref = fs.readFileSync(path.join(ROOT, "docs", "REFERENCIA.md"), "utf8");
  const list = ref.match(/Os ajustes de objeto ficam em `visualEdits` \(`([^`]+)`\)/)?.[1] || "";
  const documented = new Set(list.split(/[,\s:|]+/).filter(Boolean));
  assert.deepEqual(keys.filter((k) => !documented.has(k)), []);
});
