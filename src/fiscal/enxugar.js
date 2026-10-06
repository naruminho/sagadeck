// enxugar: relatório de palavras por slide contra o limite do material
// (a mesma conta e o mesmo limite do fiscal anti-sono do autofix).
// Base para `sagadeck enxugar deck.yaml [--fix]`.
import { countSlideWords } from "./autofix.js";
import { wordLimit } from "../purpose.js";

export function enxugarReport(spec = {}) {
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  return slides.map((s, i) => {
    const words = countSlideWords(s || {});
    const limit = wordLimit(s || {}, spec);
    return { index: i, layout: s?.layout || "blocks", title: s?.title || "", words, limit, over: Math.max(0, words - limit) };
  });
}

export function formatEnxugar(rows) {
  const over = rows.filter((r) => r.over > 0);
  if (!over.length) return `ok: ${rows.length} slide(s), todos dentro do limite.`;
  return [`${over.length} de ${rows.length} slide(s) acima do limite:`,
    ...over.map((r) => `  slide ${r.index + 1}${r.title ? ` "${r.title}"` : ""} [${r.layout}]: ${r.words} palavras (limite ${r.limit}, +${r.over})`),
  ].join("\n");
}
