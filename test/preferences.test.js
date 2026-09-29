// Preferências (~/.sagadeck/preferencias.json): padrões, faixa aceita, gravação parcial e efeito no motor.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPreferences, savePreferences, preferencesFile } from "../src/preferences.js";
import { buildHTML, setFitDefaults, fitDefaults } from "../src/build.js";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-prefs-")), "preferencias.json");

test("preferências: sem arquivo valem os padrões; gravar é parcial, respeita a faixa e sobrevive a arquivo quebrado", () => {
  const f = tmp();
  assert.equal(preferencesFile({ SAGADECK_PREFERENCIAS: f }), f);
  assert.equal(preferencesFile({}, "C:/casa"), path.join("C:/casa", ".sagadeck", "preferencias.json"));
  assert.deepEqual(loadPreferences(f).texto, { minCodePt: 10, minTextPt: 6, wrapCode: true });
  savePreferences({ texto: { minCodePt: 12 } }, f);
  assert.deepEqual(loadPreferences(f).texto, { minCodePt: 12, minTextPt: 6, wrapCode: true }, "só o que mudou");
  savePreferences({ texto: { minCodePt: 99, wrapCode: false, inventada: 1 } }, f);
  const p = loadPreferences(f);
  assert.equal(p.texto.minCodePt, 24, "fora da faixa volta para o limite");
  assert.equal(p.texto.wrapCode, false);
  assert.equal("inventada" in p.texto, false, "chave desconhecida não entra");
  fs.writeFileSync(f, "{ quebrado");
  assert.equal(loadPreferences(f).texto.minCodePt, 10, "arquivo quebrado: padrões, sem derrubar o Studio");
});

test("preferências no motor: o mínimo de código e de texto vai para cada slide; o do deck (fit:) vence", () => {
  const antes = fitDefaults();
  try {
    setFitDefaults({ minCodePt: 12, minTextPt: 11, wrapCode: false });
    const html = buildHTML({ slides: [{ layout: "statement", text: "x" }] }).html;
    assert.match(html, /data-min-code="24" data-min-text="22" data-code-wrap="0"/);
    const doDeck = buildHTML({ fit: { minCodePt: 8 }, slides: [{ layout: "statement", text: "x" }] }).html;
    assert.match(doDeck, /data-min-code="16"/, "o deck vence a preferência");
  } finally { setFitDefaults(antes); }
});
