// Tela "Configurar IA" (editor e biblioteca): provedor, chave e modelos desta máquina, com Testar antes de salvar.
// A chave fica só nesta máquina (~/.sagadeck/ia.json) e nunca volta inteira para a página.
window.SagaAISettings = (() => {
  const css = `.ai-cfg{max-width:min(560px,calc(100vw - 32px));width:100%;border:1px solid var(--border,#c9ced6);border-radius:12px;padding:18px 20px;background:var(--panel,var(--bg,#fff));color:var(--text,#1d2433);font:14px/1.45 system-ui,sans-serif}
.ai-cfg::backdrop{background:rgba(0,0,0,.35)}.ai-cfg h2{margin:0 0 6px;font-size:18px}.ai-cfg p{margin:4px 0 10px;color:var(--text-2,#555)}
.ai-cfg label{display:block;margin:10px 0 3px;font-weight:600;font-size:12px}.ai-cfg input,.ai-cfg select{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border,#c9ced6);border-radius:8px;background:var(--bg,#fff);color:inherit;font:inherit}
.ai-cfg .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.ai-cfg small{color:var(--text-3,#777);font-size:12px}.ai-cfg .warn{background:#fef3c7;color:#78350f;border-radius:8px;padding:8px 10px}
.ai-cfg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}.ai-cfg button{padding:7px 14px;border-radius:8px;border:1px solid var(--border,#c9ced6);background:transparent;color:inherit;cursor:pointer;font:inherit}
.ai-cfg .rec{background:var(--selected,#eef);border-radius:8px;padding:8px 10px;margin:6px 0 4px}.ai-cfg .rec button{margin-top:6px;display:block}
.ai-cfg button.primary{background:var(--brand,#5b4bdb);border-color:var(--brand,#5b4bdb);color:#fff}.ai-cfg [data-status]{margin-top:10px;min-height:1.4em}.ai-cfg [data-status].ok{color:#15803d}.ai-cfg [data-status].err{color:#b91c1c}`;
  const LABEL = { text: "Modelo de texto", vision: "Modelo que vê imagens", image: "Modelo de imagem", search: "Modelo de busca na web" };
  const HINT = { text: "obrigatório", vision: "opcional; vazio = o de texto", image: "opcional; para gerar ilustrações", search: "opcional; no OpenRouter, um modelo :online" };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let dialog, info, onSaved = () => {};

  function build() {
    if (!document.getElementById("ai-cfg-style")) { const st = document.createElement("style"); st.id = "ai-cfg-style"; st.textContent = css; document.head.append(st); }
    dialog = document.createElement("dialog");
    dialog.className = "ai-cfg";
    dialog.id = "ai-settings-dialog";
    document.body.append(dialog);
  }

  function form() {
    const c = info.config || {}, providers = info.providers || {};
    const provider = c.provider && (providers[c.provider] || c.provider === "outro") ? c.provider : (c.url ? "outro" : "openrouter");
    dialog.innerHTML = `<h2>Configurar IA</h2>
      <p>O sagadeck fala direto com o provedor que você escolher. A chave fica só nesta máquina, em <code>${esc(info.file)}</code>.</p>
      ${info.source === "variável" ? '<p class="warn">As variáveis SAGADECK_LLM_URL / SAGADECK_LLM_KEY estão definidas e valem por cima desta tela.</p>' : ""}
      ${info.editable ? "" : '<p class="warn">Neste servidor, quem configura a IA é quem administra.</p>'}
      ${info.recommended ? `<div class="rec"><b>Recomendado para começar:</b> ${esc(providers[info.recommended.provider]?.label || info.recommended.provider)}, com ${esc(info.recommended.models.text)} (texto e visão), ${esc(info.recommended.models.image)} (imagem) e ${esc(info.recommended.models.search)} (busca). Se a IA não responder nem com isso, o problema é a rede ou a chave, não o modelo. Depois, troque pelo modelo que quiser. <button type="button" data-rec>Usar a recomendação</button></div>` : ""}
      <label for="ai-cfg-provider">Provedor</label>
      <select id="ai-cfg-provider" data-f="provider">${Object.entries(providers).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}<option value="outro">Outro compatível com a API da OpenAI</option></select>
      <label for="ai-cfg-url">Endereço da API</label>
      <input id="ai-cfg-url" data-f="url" placeholder="https://…/v1" spellcheck="false">
      <label for="ai-cfg-key">Chave</label>
      <input id="ai-cfg-key" data-f="key" type="password" autocomplete="off" spellcheck="false" placeholder="${c.keySet ? `configurada (${esc(c.keyHint)}${c.keyFrom === "variável" ? `, da variável ${esc(c.keyEnv)}` : ""}); em branco mantém` : "cole a chave do provedor"}">
      <div class="grid">${(info.roles || []).map((r) => `<div><label for="ai-cfg-${r}">${LABEL[r] || r}</label><input id="ai-cfg-${r}" data-model="${r}" value="${esc(c.models?.[r])}" placeholder="${info.recommended?.models?.[r] ? `ex.: ${esc(info.recommended.models[r])}` : ""}" spellcheck="false"><small>${HINT[r] || ""}</small></div>`).join("")}</div>
      <p><small>Texto e visão funcionam em qualquer provedor compatível com a API da OpenAI. Gerar imagem e buscar na web dependem do provedor: funcionam no OpenRouter com modelos de imagem e modelos <code>:online</code>; em outros, a pesquisa usa buscadores diretos e a imagem pode não sair.</small></p>
      <div data-status role="status"></div>
      <div class="row"><button type="button" data-close>Fechar</button><button type="button" data-test>Testar</button><button type="button" class="primary" data-save>Salvar</button></div>`;
    const sel = dialog.querySelector('[data-f="provider"]'), url = dialog.querySelector('[data-f="url"]');
    sel.value = provider;
    url.value = c.url || providers[provider]?.url || "";
    const sync = () => { const p = providers[sel.value]; if (p) url.value = p.url; url.readOnly = !!p; };
    sync();
    sel.onchange = sync;
    if (!info.editable) dialog.querySelectorAll("input,select,[data-save],[data-test]").forEach((el) => (el.disabled = true));
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    const rec = dialog.querySelector("[data-rec]");
    if (rec) rec.onclick = () => {
      sel.value = info.recommended.provider; sync();
      for (const [r, m] of Object.entries(info.recommended.models)) { const el = dialog.querySelector(`[data-model="${r}"]`); if (el) el.value = m; }
      const st = dialog.querySelector("[data-status]"); st.className = ""; st.textContent = info.config?.keySet ? "Preenchido. Clique em Testar." : "Preenchido. Cole a chave do OpenRouter e clique em Testar.";
      dialog.querySelector('[data-f="key"]').focus();
    };
    dialog.querySelector("[data-test]").onclick = () => submit("api/ia/test");
    dialog.querySelector("[data-save]").onclick = () => submit("api/ia");
  }

  async function submit(endpoint) {
    const status = dialog.querySelector("[data-status]");
    const body = { provider: dialog.querySelector('[data-f="provider"]').value, url: dialog.querySelector('[data-f="url"]').value, key: dialog.querySelector('[data-f="key"]').value,
      models: Object.fromEntries([...dialog.querySelectorAll("[data-model]")].map((el) => [el.dataset.model, el.value])) };
    status.className = ""; status.textContent = endpoint.endsWith("test") ? "Testando…" : "Salvando…";
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      if (endpoint.endsWith("test")) { status.className = "ok"; status.textContent = `Funcionou: o modelo ${j.model} respondeu "${j.text}" em ${(j.ms / 1000).toFixed(1)} s.`; return; }
      info.config = j.config;
      status.className = "ok"; status.textContent = "Salvo.";
      onSaved(j.config);
    } catch (e) { status.className = "err"; status.textContent = (endpoint.endsWith("test") ? "Não funcionou: " : "Não salvou: ") + e.message; }
  }

  return {
    async open(saved) {
      onSaved = typeof saved === "function" ? saved : () => {};
      if (!dialog) build();
      info = await (await fetch("api/ia")).json();
      form();
      if (!dialog.open) dialog.showModal();
    },
  };
})();
