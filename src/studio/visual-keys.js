// Ajustes visuais (visualEdits) presos ao objeto certo, venha a mudança de onde vier (a pessoa, o formulário, a IA):
//   - migração: chave antiga (grupo-N, pela ordem) vira a chave pelo conteúdo (grupo~impressão), deck antigo sem perda
//   - continuidade: o texto de um objeto mudou (a chave pelo conteúdo muda junto): se no grupo sumiu exatamente um
//     objeto e apareceu exatamente um, o ajuste passa para ele. Inserir ou apagar OUTRO objeto não mexe em nada.
import { renderSlide } from "../build.js";

const LEGACY = /^[\w-]+-\d+$/;
function keysOf(slide, i, spec) {
  try {
    const { html } = renderSlide(slide, i, spec);
    return [...html.matchAll(/data-vkey="([^"]+)"(?: data-vkey-old="([^"]+)")?/g)].map((m) => ({ key: m[1], old: m[2] || null }));
  } catch { return null; }
}
const groupOf = (k) => String(k).split("~")[0];
const content = (s) => { if (!s || typeof s !== "object") return ""; const { visualEdits, uid, review, ...rest } = s; return JSON.stringify(rest); };

export function migrateLegacyKeys(spec) {
  let moved = 0;
  (spec?.slides || []).forEach((s, i) => {
    const ve = s?.visualEdits;
    if (!ve || !Object.keys(ve).some((k) => LEGACY.test(k) && !k.includes("~"))) return;
    const keys = keysOf(s, i, spec);
    if (!keys) return;
    const next = { ...ve };
    for (const { key, old } of keys) if (old && next[old] && !next[key]) { next[key] = next[old]; delete next[old]; moved++; }
    s.visualEdits = next;
  });
  return moved;
}

export function carryVisualEdits(prev, next) {
  let carried = 0;
  const before = new Map((prev?.slides || []).filter((s) => s?.uid).map((s, i) => [s.uid, { s, i }]));
  (next?.slides || []).forEach((s, i) => {
    const ve = s?.visualEdits;
    const p = s?.uid && before.get(s.uid);
    if (!ve || !p || content(p.s) === content(s)) return;
    const a = keysOf(p.s, p.i, prev), b = keysOf(s, i, next);
    if (!a || !b) return;
    const nowKeys = new Set(b.map((x) => x.key)), wasKeys = new Set(a.map((x) => x.key));
    const out = { ...ve };
    for (const k of Object.keys(ve)) {
      if (nowKeys.has(k) || !k.includes("~")) continue;
      const g = groupOf(k);
      const gone = [...wasKeys].filter((x) => groupOf(x) === g && !nowKeys.has(x));
      const came = [...nowKeys].filter((x) => groupOf(x) === g && !wasKeys.has(x));
      if (gone.length === 1 && came.length === 1 && gone[0] === k && !out[came[0]]) { out[came[0]] = out[k]; delete out[k]; carried++; }
    }
    s.visualEdits = out;
  });
  return carried;
}
