// Idioma dos números do deck (`lang`, padrão pt-BR): contador, gráficos e mapas formatavam sempre em português, e um
// deck em inglês mostrava "1.403" (mil quatrocentos e três) e "0,93". A renderização é síncrona, slide a slide: quem
// monta o deck (build.js) define o idioma antes e os desenhos leem daqui.
let current = "pt-BR";

export function normalizeLocale(lang) {
  const l = String(lang || "").trim();
  if (!l) return "pt-BR";
  if (/^pt/i.test(l)) return "pt-BR";
  if (/^en/i.test(l)) return /^en-GB/i.test(l) ? "en-GB" : "en-US";
  try { return Intl.getCanonicalLocales(l)[0]; } catch { return "pt-BR"; }
}

export function setDeckLocale(lang) { current = normalizeLocale(lang); return current; }
export const deckLocale = () => current;
export const formatNumber = (v, opts) => Number(v).toLocaleString(current, opts);
// separador decimal do idioma atual ("," em pt-BR, "." em en-US)
export const decimalSeparator = (locale = current) => (1.5).toLocaleString(locale).replace(/\d/g, "")[0] || ",";
