// Preferências do sagadeck nesta máquina: ~/.sagadeck/preferencias.json (ou SAGADECK_PREFERENCIAS), ao lado do
// ambientes.yaml e do identidades.yaml. Valem para o Studio inteiro; o deck (fit:, author…) vence quando define.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Cada preferência: padrão e, para número, a faixa aceita (fora dela volta para o limite)
export const PREF_SCHEMA = {
  texto: {
    minCodePt: { def: 10, min: 6, max: 24 },   // código encolhe até aqui (pt, como no PowerPoint; 1 pt = 2 px no slide)
    minTextPt: { def: 6, min: 6, max: 30 },    // texto que "encolhe para caber" não passa daqui (6 pt: quase sem limite)
    wrapCode: { def: true },                    // linha longa de código quebra em vez de encolher tudo
  },
};

export function preferencesFile(env = process.env, home = os.homedir()) {
  return env.SAGADECK_PREFERENCIAS || path.join(home, ".sagadeck", "preferencias.json");
}

const defaults = () => Object.fromEntries(Object.entries(PREF_SCHEMA).map(([sec, items]) => [sec, Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.def]))]));

// só as chaves conhecidas, cada uma no tipo e na faixa certos (arquivo editado à mão não quebra o Studio)
function clean(raw) {
  const out = defaults();
  for (const [sec, items] of Object.entries(PREF_SCHEMA)) {
    for (const [k, rule] of Object.entries(items)) {
      const v = raw?.[sec]?.[k];
      if (v === undefined || v === null || v === "") continue;
      if (typeof rule.def === "boolean") out[sec][k] = v === true || v === "true";
      else if (typeof rule.def === "number") { const n = Number(v); if (Number.isFinite(n)) out[sec][k] = Math.min(rule.max, Math.max(rule.min, n)); }
      else out[sec][k] = String(v).slice(0, 200);
    }
  }
  return out;
}

export function loadPreferences(file = preferencesFile()) {
  try { return clean(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return defaults(); }
}

// patch: { texto: { minCodePt: 12 } } — junta com o que já está salvo e grava de forma atômica
export function savePreferences(patch, file = preferencesFile()) {
  const cur = loadPreferences(file);
  const merged = Object.fromEntries(Object.keys(PREF_SCHEMA).map((sec) => [sec, { ...cur[sec], ...(patch?.[sec] || {}) }]));
  const out = clean(merged);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
  return out;
}
