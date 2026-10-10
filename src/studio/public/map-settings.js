// Tela "Configurar mapa": os serviços do mapa desta máquina (~/.sagadeck/mapa.json; a chave nunca volta inteira),
// o estado de cada um ("funcionando", "não usado", "bloqueado: 403 às 10h12") e "Tentar de novo". Sem nada preenchido,
// valem os serviços públicos gratuitos (OpenStreetMap e companhia). No servidor, só o estado (quem administra configura).
window.SagaMapSettings = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const FIELDS = [
    ["tiles", "Mapa de fundo (tiles)", "Endereço com {z}/{x}/{y}; padrão: OpenStreetMap. Use o servidor de mapas da empresa se houver.", ["url", "attribution"]],
    ["satelite", "Satélite (opcional)", "Provedor de imagens de satélite com {z}/{x}/{y} (costuma pedir chave na própria URL).", ["url", "attribution"]],
    ["geocoder", "Endereço e coordenada", "Padrão: Nominatim (1 endereço por segundo). Para planilhas grandes, um provedor com chave.", ["url", "key", "porSegundo"]],
    ["busca", "Busca de lugares", "Padrão: Overpass (OpenStreetMap).", ["url"]],
    ["rotas", "Rotas e área alcançável", "Padrão: OSRM público; OpenRouteService com chave dá rotas a pé, de carro e de bicicleta e isócronas.", ["provedor", "url", "key"]],
  ];
  const LABEL = { url: "Endereço", attribution: "Atribuição (aparece no mapa)", key: "Chave", porSegundo: "Pedidos por segundo", provedor: "Provedor" };
  let dialog;
  // o visual: a caixa do Configurar IA (ai-settings.js) e os blocos de cada serviço; vale no editor e na biblioteca
  const CSS = `.map-cfg .ms-svc{border:1px solid var(--border,#c9ced6);border-radius:10px;padding:8px 12px 10px;margin:10px 0}.map-cfg .ms-svc legend{font-weight:600;padding:0 4px;display:flex;align-items:center;gap:8px}
.map-cfg .ms-svc label{display:block;margin-top:6px;font-size:12px;font-weight:600}.map-cfg .ms-st{font-weight:400;font-size:12px;color:var(--text-3,#777)}.map-cfg .ms-st.ok{color:#15803d}.map-cfg .ms-st.err{color:#b91c1c}
.map-cfg .ms-rec{background:var(--selected,#eef);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12.5px}.map-cfg .ms-rec .btn{margin-top:6px}`;
  function ensureStyle() {
    window.SagaAISettings?.ensureStyle?.();
    if (!document.getElementById("map-cfg-style")) { const st = document.createElement("style"); st.id = "map-cfg-style"; st.textContent = CSS; document.head.append(st); }
  }

  function status(s) {
    if (!s || s.status === "não usado") return '<span class="ms-st">ainda não usado</span>';
    if (s.status === "ok") return '<span class="ms-st ok">funcionando</span>';
    return `<span class="ms-st err">${esc(s.motivo || "bloqueado")}</span>`;
  }

  async function render() {
    const info = await (await fetch("api/mapa")).json();
    const cfg = info.config || {};
    const st = info.services || {};
    const row = ([k, title, hint, fields]) => {
      const c = cfg[k] || {};
      const svc = st[k] ? `${status(st[k])}${st[k].status === "bloqueado" ? ` <button type="button" class="btn btn-small" data-retry="${k}">Tentar de novo</button>` : ""}` : "";
      const inputs = info.editable ? fields.map((f) => `<label>${LABEL[f]}<input data-k="${k}" data-f="${f}" ${f === "key" ? `type="password" placeholder="${c.keySet ? `configurada (${esc(c.keyHint)}${c.keyFrom === "variável" ? `, da variável ${esc(c.keyEnv)}` : ""}); em branco mantém` : "opcional"}"` : `value="${esc(c[f] ?? "")}"`} spellcheck="false"></label>`).join("") : "";
      // rotas: a recomendação (chave gratuita do OpenRouteService) e o Testar, como no Configurar IA
      const extra = info.editable && k === "rotas" ? `<div class="ms-rec">Para rotas a pé, de carro e de bicicleta e área alcançável: chave gratuita do <a href="https://openrouteservice.org" target="_blank" rel="noopener">OpenRouteService</a> (crie a conta, gere o token no painel e cole aqui). Opcional: sem ela, as rotas usam o servidor público de demonstração. <button type="button" class="btn btn-small" data-ors>Usar o OpenRouteService</button> <button type="button" class="btn btn-small" data-test>Testar</button></div>` : "";
      return `<fieldset class="ms-svc"><legend>${esc(title)} ${svc}</legend><small>${esc(hint)}</small>${inputs}${extra}</fieldset>`;
    };
    dialog.innerHTML = `<h2>Configurar mapa</h2>
      ${info.editable ? `<p>Os serviços do mapa desta máquina, guardados em <code>${esc(info.file)}</code>. Em branco, valem os serviços públicos gratuitos.</p>` : '<p class="warn">Neste servidor, quem configura os serviços do mapa é quem administra.</p>'}
      ${FIELDS.map(row).join("")}
      <div data-status role="status"></div>
      <div class="row"><button type="button" data-close>Fechar</button>${info.editable ? '<button type="button" class="primary" data-save>Salvar</button>' : ""}</div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    dialog.querySelector("[data-ors]")?.addEventListener("click", () => {
      dialog.querySelector('[data-k="rotas"][data-f="provedor"]').value = "openrouteservice";
      dialog.querySelector('[data-k="rotas"][data-f="url"]').value = "https://api.openrouteservice.org";
      const key = dialog.querySelector('[data-k="rotas"][data-f="key"]'); key.focus();
      const st = dialog.querySelector("[data-status]"); st.className = ""; st.textContent = "Preenchido. Cole a chave, salve e clique em Testar.";
    });
    dialog.querySelector("[data-test]")?.addEventListener("click", async () => {
      const st = dialog.querySelector("[data-status]"); st.className = ""; st.textContent = "Testando uma rota curta (salve antes, se mudou algo)…";
      const r = await (await fetch("api/mapa/testar", { method: "POST" })).json().catch(() => ({ ok: false, error: "sem resposta" }));
      if (r.ok) { st.className = "ok"; st.textContent = `Funcionou: uma rota a pé de ${r.distancia} m (${r.minutos} min) em ${(r.ms / 1000).toFixed(1)} s.`; }
      else { st.className = "err"; st.textContent = `Não funcionou: ${r.error}`; }
    });
    dialog.querySelectorAll("[data-retry]").forEach((b) => (b.onclick = async () => { await fetch("api/mapa/tentar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service: b.dataset.retry }) }); try { sessionStorage.removeItem("sagadeck.mapa.fundo"); } catch { /* sem armazenamento */ } render(); }));
    dialog.querySelector("[data-save]")?.addEventListener("click", async () => {
      const body = {};
      dialog.querySelectorAll("[data-k]").forEach((i) => { const k = i.dataset.k; (body[k] ||= {})[i.dataset.f] = i.dataset.f === "porSegundo" ? Number(i.value) || undefined : i.value.trim(); });
      // serviço todo em branco: volta ao padrão (satélite em branco: sem satélite)
      for (const [k, v] of Object.entries(body)) if (!v.url) body[k] = k === "satelite" ? null : {};
      const st = dialog.querySelector("[data-status]");
      try {
        const r = await fetch("api/mapa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        try { sessionStorage.removeItem("sagadeck.mapa.fundo"); } catch { /* sem armazenamento */ }
        st.className = "ok"; st.textContent = "Salvo. Os mapas abertos usam a configuração nova ao serem redesenhados.";
      } catch (e) { st.className = "err"; st.textContent = `Não salvou: ${e.message}`; }
    });
  }

  return {
    async open() {
      ensureStyle();
      if (!dialog) { dialog = document.createElement("dialog"); dialog.className = "ai-cfg map-cfg"; dialog.id = "map-settings-dialog"; document.body.append(dialog); }
      await render();
      if (!dialog.open) dialog.showModal();
    },
  };
})();
