// sagadeck · Pesquisa Web via DuckDuckGo (HTML / Lite)
// Projetado especificamente para agentes e IDEs agênticos (Cursor, Claude Code, Cline):
// Não é bloqueado por CAPTCHAs como o Google bot detection, não requer navegador headless
// e devolve resultados estruturados com títulos, URLs reais e snippets para enriquecer apresentações.

function unwrapDDGUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const full = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const u = new URL(full, "https://duckduckgo.com");
    if (u.searchParams.has("uddg")) {
      return decodeURIComponent(u.searchParams.get("uddg"));
    }
    return full;
  } catch {
    return rawUrl;
  }
}

export async function searchDuckDuckGo(query, { limit = 5, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo retornou status HTTP ${res.status}`);
    }

    const html = await res.text();
    const results = [];

    const titleRegex =
      /<h2 class="result__title">[\s\S]*?<a class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;

    const titles = [];
    let m;
    while ((m = titleRegex.exec(html)) && titles.length < limit * 2) {
      const rawHref = m[1];
      const rawTitle = m[2].replace(/<[^>]*>/g, "").trim();
      titles.push({ url: unwrapDDGUrl(rawHref), title: rawTitle });
    }

    const snippets = [];
    let ms;
    while ((ms = snippetRegex.exec(html)) && snippets.length < limit * 2) {
      snippets.push(ms[1].replace(/<[^>]*>/g, "").trim());
    }

    for (let i = 0; i < Math.min(titles.length, limit); i++) {
      results.push({
        title: titles[i].title,
        url: titles[i].url,
        snippet: snippets[i] || "",
      });
    }

    return results;
  } finally {
    clearTimeout(timer);
  }
}
