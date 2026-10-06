// Checagem de links das fontes da pesquisa: a URL continua de pé?
// Base para `sagadeck links deck.yaml` (lê contexto/pesquisa/fontes.json ao lado do deck).
import fs from "node:fs";
import path from "node:path";

export function linksOfDeck(deckDir) {
  try {
    const report = JSON.parse(fs.readFileSync(path.join(deckDir, "contexto", "pesquisa", "fontes.json"), "utf8"));
    const urls = [...new Set((report.fontes || []).map((f) => f?.url).filter((u) => typeof u === "string" && /^https?:/i.test(u)))];
    return urls;
  } catch { return []; }
}

export async function checkLinks(urls, { fetchFn = fetch, timeoutMs = 15000 } = {}) {
  const out = [];
  for (const url of urls || []) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetchFn(url, { redirect: "follow", signal: ctrl.signal });
        out.push({ url, ok: !!r.ok, status: r.status });
      } finally { clearTimeout(t); }
    } catch (e) {
      out.push({ url, ok: false, status: 0, erro: e?.name === "AbortError" ? "tempo esgotado" : String(e?.message || e).slice(0, 120) });
    }
  }
  return out;
}

export function formatLinks(rows) {
  if (!rows.length) return "sem links para conferir.";
  const bad = rows.filter((r) => !r.ok);
  return [`${rows.length - bad.length} de ${rows.length} links respondendo:`,
    ...rows.map((r) => `  ${r.ok ? "ok " : "QUEBROU"} ${r.status || "-"} ${r.url}${r.erro ? ` (${r.erro})` : ""}`),
  ].join("\n");
}
