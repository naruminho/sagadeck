// Buscador sem chave (fase 3): Wikipedia via OpenSearch. Cobre o caso "referência estável"
// quando o LLM e o DuckDuckGo falham; sem snippet longo, mas com URL exata e descrição curta.
export async function searchWikipedia(query, { limit = 5, lang = "pt", timeoutMs = 10000 } = {}) {
  const attempt = async (wiki) => {
    const url = `https://${wiki}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&namespace=0&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "sagadeck/1.0 (pesquisa para apresentação)" } });
    if (!res.ok) throw new Error(`Wikipedia (${wiki}) respondeu HTTP ${res.status}`);
    const [, titles = [], descs = [], links = []] = await res.json();
    return titles.map((title, i) => ({ title, url: links[i] || "", snippet: (descs[i] || "").slice(0, 300), date: "" })).filter((r) => /^https?:\/\//.test(r.url));
  };
  const pt = await attempt(lang).catch(() => []);
  if (pt.length || lang === "en") return pt.slice(0, limit);
  const en = await attempt("en").catch(() => []);
  return [...pt, ...en].slice(0, limit);
}
