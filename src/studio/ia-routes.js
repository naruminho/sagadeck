// Tela "Configurar IA" do Studio: ler (a chave nunca sai inteira), salvar e testar a configuração da IA desta máquina
// (src/ai/ia-config.js). No multiusuário quem configura é quem administra o servidor (arquivo ou variáveis), não a tela.
import { PROVIDERS, ROLES, RECOMMENDED, iaFile, loadIA, saveIA, maskedIA, keyOf } from "../ai/ia-config.js";
import { chat, llmConfig, llmAvailable } from "../ai/llm.js";

const json = (res, status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };

// o que veio da tela; a chave em branco mantém a que já está gravada
function draft(body, current) {
  const provider = String(body.provider || "");
  const preset = PROVIDERS[provider];
  return {
    provider: preset ? provider : "outro",
    url: String(body.url || preset?.url || "").trim(),
    key: String(body.key || "").trim() || current?.key || "",
    keyEnv: body.key ? "" : String(body.keyEnv ?? current?.keyEnv ?? preset?.keyEnv ?? ""),
    models: Object.fromEntries(ROLES.map((r) => [r, String(body.models?.[r] || "").trim()])),
    ...(current?.headers ? { headers: current.headers } : {}),
    ...(current?.adaptador ? { adaptador: current.adaptador } : {}),
  };
}

export async function iaRoutes({ req, res, pathname, opts, readJSON }) {
  if (pathname === "/api/ia" && req.method === "GET") {
    const cfg = llmConfig();
    json(res, 200, { config: maskedIA(loadIA()), file: iaFile(), source: cfg.source, configured: !!(cfg.url || cfg.adaptador), providers: PROVIDERS, roles: ROLES, recommended: RECOMMENDED, editable: !opts.multiuser });
    return true;
  }
  if ((pathname === "/api/ia" || pathname === "/api/ia/test") && req.method === "POST") {
    if (opts.multiuser) { json(res, 403, { error: "No servidor multiusuário, a IA é configurada por quem administra." }); return true; }
    const body = await readJSON(req);
    const next = draft(body, loadIA());
    if (!next.url) { json(res, 400, { error: "Falta o endereço do provedor." }); return true; }
    if (!next.models.text) { json(res, 400, { error: "Falta o modelo de texto." }); return true; }
    if (pathname === "/api/ia") {
      try { const saved = saveIA(next); await llmAvailable({ force: true }); json(res, 200, { ok: true, config: maskedIA(saved) }); }
      catch (e) { json(res, 400, { error: e.message }); }
      return true;
    }
    // testar: uma pergunta curta com o que está na tela (antes de salvar)
    const base = llmConfig();
    const cfg = { ...base, url: next.url.replace(/\/+$/, ""), key: keyOf(next), headers: next.headers || {}, adaptador: next.adaptador || "",
      textModel: next.models.text, visionModel: next.models.vision || next.models.text, imageModel: next.models.image || "image", searchModel: next.models.search || "",
      timeoutMs: 60_000, firstTimeoutMs: 60_000 };
    const t0 = Date.now();
    try {
      const r = await chat([{ role: "user", content: "Responda só com a palavra: ok" }], { cfg, maxTokens: 200, think: false, allowTruncated: true, retries: 0 });
      json(res, 200, { ok: true, text: String(r.text || "").trim().slice(0, 80), model: r.model || cfg.textModel, ms: Date.now() - t0 });
    } catch (e) { json(res, 200, { ok: false, error: e.message, ms: Date.now() - t0 }); }
    return true;
  }
  return false;
}
