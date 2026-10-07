// Buscador com chave (fase 3): Brave Search API. Só entra na cadeia com BRAVE_SEARCH_KEY
// (sem chave, é pulado em silêncio — nunca trava a pesquisa por falta de configuração).
export async function searchBrave(query, { limit = 8, timeoutMs = 12000, key = process.env.BRAVE_SEARCH_KEY } = {}) {
  if (!key) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(limit, 20)}&text_decorations=0`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "X-Subscription-Token": key, "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Brave respondeu HTTP ${res.status}`);
  const j = await res.json();
  return ((j.web && j.web.results) || []).slice(0, limit)
    .map((r) => ({ title: String(r.title || r.url), url: String(r.url || ""), snippet: String(r.description || "").slice(0, 300), date: String(r.age || "") }))
    .filter((r) => /^https?:\/\//.test(r.url));
}
