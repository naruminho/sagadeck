// Preferências (tela única, com busca): as desta máquina ficam em ~/.sagadeck/preferencias.json (servidor); as do
// editor, neste navegador. Cada linha diz o que faz; gravar é automático.
// Saiu do app.js pela trava de tamanho dos monolitos; o comportamento é o mesmo.
window.SagaPrefs = function ({ dom, store, escHtml, escAttr, fold, setAppTheme, renderCurrentSlide, renderThumbnails }) {
  const PREFS_UI = [
    { id: "texto", title: "Texto e código", items: [
      { k: "texto.minCodePt", type: "num", unit: "pt", min: 6, max: 24, label: "Tamanho mínimo do código ao encolher", hint: "Código que não cabe encolhe até aqui (10 pt ≈ 20 px no slide). Se nem assim couber, ele rola na apresentação e o fiscal avisa." },
      { k: "texto.minTextPt", type: "num", unit: "pt", min: 6, max: 30, label: "Tamanho mínimo do texto ao encolher", hint: "Títulos e textos que se ajustam para caber não ficam menores que isto." },
      { k: "texto.wrapCode", type: "bool", label: "Quebrar linhas longas de código", hint: "Em vez de encolher o bloco todo por causa de uma linha comprida." },
    ] },
    { id: "ia", title: "Inteligência artificial", items: [
      { k: "ia.pesquisa", type: "bool", label: "Pesquisar na web quando precisar", hint: "Ranking, lançamentos, preços, um artigo científico: a IA pesquisa, lê as fontes confiáveis e cita cada uma. Desligado (ou sem internet), ela usa só o que sabe e avisa." },
      { k: "ia.perguntar", type: "bool", label: "Perguntar quando o pedido não disser para que serve o material", hint: "Ex.: um workshop sem dizer se o pessoal vai guardar o material. Desligado, a IA decide sozinha." },
      { k: "ia.imagens", type: "bool", label: "Gerar imagens quando o pedido pedir", hint: "Desligado: só ícones, gráficos e diagramas do sagadeck (sem custo de imagem)." },
      { k: "ia.autor", type: "text", label: "Seu nome", hint: "Vai na capa e no rodapé das apresentações novas (no lugar de \"Seu Nome\")." },
      { k: "ia.idioma", type: "select", options: [["auto", "O do pedido"], ["português do Brasil", "Português (Brasil)"], ["inglês", "Inglês"], ["espanhol", "Espanhol"]], label: "Idioma do conteúdo gerado" },
    ] },
    { id: "biblioteca", title: "Biblioteca", items: [
      { k: "biblioteca.lixeiraDias", type: "select", options: [["1", "1 dia"], ["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"]], label: "Quanto tempo a lixeira guarda", hint: "Apresentação excluída fica restaurável por esse tempo; depois é apagada de vez." },
    ] },
    { id: "exportacao", title: "Exportação", items: [
      { k: "exportacao.pdfClaro", type: "bool", label: "PDF na versão clara do tema", hint: "Tema escuro com par claro (ex.: Manual noite) sai claro no PDF, melhor para imprimir." },
    ] },
    { id: "editor", title: "Editor (este navegador)", local: true, items: [
      { k: "editor.theme", type: "select", options: [["system", "Automática (do sistema)"], ["light", "Clara"], ["dark", "Escura"]], label: "Tema da interface", hint: "Só a interface do Studio; o slide mantém o tema dele.",
        get: () => store.get("appTheme", "system"), set: (v) => setAppTheme(v) },
      { k: "editor.guides", type: "bool", label: "Mostrar as guias da área segura", hint: "O retângulo pontilhado onde o conteúdo cabe sem cortar.",
        get: () => dom.chkGuides.checked, set: (v) => { dom.chkGuides.checked = v; dom.chkGuides.dispatchEvent(new Event("change", { bubbles: true })); } },
      { k: "editor.inspect", type: "bool", label: "Marcar no slide os avisos do fiscal", hint: "Caixas em volta do texto fora da margem, código que não coube, sobreposição.",
        get: () => dom.chkInspectOverlay.checked, set: (v) => { dom.chkInspectOverlay.checked = v; dom.chkInspectOverlay.dispatchEvent(new Event("change", { bubbles: true })); } },
    ] },
  ];
  let prefsData = null, prefsTimer = null;
  const prefGet = (key) => { const [sec, k] = key.split("."); return prefsData?.[sec]?.[k]; };
  async function openPrefs() {
    const modal = document.getElementById("modal-prefs");
    modal.classList.remove("hidden");
    try {
      const r = await fetch("api/preferences"); const j = await r.json();
      prefsData = j.prefs; document.getElementById("prefs-file").textContent = j.file || "";
    } catch { prefsData = {}; }
    renderPrefs();
    const q = document.getElementById("prefs-search"); q.value = ""; q.focus();
  }
  function renderPrefs() {
    const nav = document.getElementById("prefs-nav"), list = document.getElementById("prefs-list");
    nav.innerHTML = PREFS_UI.map((sec) => `<button type="button" data-prefs-sec="${sec.id}">${escHtml(sec.title)}</button>`).join("");
    list.innerHTML = PREFS_UI.map((sec) => `<section class="prefs-sec" data-prefs-sec="${sec.id}"><h4>${escHtml(sec.title)}</h4>${sec.items.map((it) => {
      const v = it.get ? it.get() : prefGet(it.k);
      const ctl = it.type === "bool" ? `<input type="checkbox" data-pref="${it.k}"${v ? " checked" : ""} aria-label="${escAttr(it.label)}">`
        : it.type === "select" ? `<select class="form-control" data-pref="${it.k}" aria-label="${escAttr(it.label)}">${it.options.map(([ov, ol]) => `<option value="${ov}"${String(v) === ov ? " selected" : ""}>${escHtml(ol)}</option>`).join("")}</select>`
        : it.type === "num" ? `<span class="pref-num"><input type="number" class="form-control" data-pref="${it.k}" value="${escAttr(v ?? "")}" min="${it.min}" max="${it.max}" step="1" aria-label="${escAttr(it.label)}"><span>${it.unit || ""}</span></span>`
        : `<input type="text" class="form-control" data-pref="${it.k}" value="${escAttr(v ?? "")}" aria-label="${escAttr(it.label)}">`;
      return `<div class="pref-row" data-search="${escAttr(fold(`${sec.title} ${it.label} ${it.hint || ""}`))}"><div class="pref-label"><b>${escHtml(it.label)}</b>${it.hint ? `<small>${escHtml(it.hint)}</small>` : ""}</div><div class="pref-ctl">${ctl}</div></div>`;
    }).join("")}</section>`).join("");
    nav.querySelectorAll("[data-prefs-sec]").forEach((b) => b.onclick = () => list.querySelector(`section[data-prefs-sec="${b.dataset.prefsSec}"]`)?.scrollIntoView({ block: "start" }));
    list.querySelectorAll("[data-pref]").forEach((el) => el.addEventListener("change", () => changePref(el)));
  }
  function changePref(el) {
    const key = el.dataset.pref, it = PREFS_UI.flatMap((s) => s.items).find((x) => x.k === key);
    const value = el.type === "checkbox" ? el.checked : it.type === "num" ? Number(el.value) : el.value;
    const status = document.getElementById("prefs-status");
    if (it.set) { it.set(value); status.textContent = "Salvo neste navegador"; return; }
    const [sec, k] = key.split(".");
    (prefsData[sec] ||= {})[k] = value;
    clearTimeout(prefsTimer);
    status.textContent = "Salvando…";
    prefsTimer = setTimeout(async () => {
      try {
        const r = await fetch("api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs: { [sec]: prefsData[sec] } }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
        prefsData = j.prefs;
        const shown = document.querySelector(`#prefs-list [data-pref="${key}"]`); if (shown && shown.type === "number") shown.value = prefGet(key); // voltou para a faixa aceita
        status.textContent = "Salvo";
        renderCurrentSlide(); renderThumbnails(); // os mínimos do ajuste para caber mudam o desenho
      } catch (e) { status.textContent = "Não salvou: " + e.message; }
    }, 250);
  }
  function filterPrefs() {
    const q = fold(document.getElementById("prefs-search").value.trim());
    document.querySelectorAll("#prefs-list .pref-row").forEach((r) => { r.hidden = !!q && !r.dataset.search.includes(q); });
    document.querySelectorAll("#prefs-list .prefs-sec").forEach((sec) => { sec.hidden = !sec.querySelector(".pref-row:not([hidden])"); });
  }

  return { openPrefs, filterPrefs };
};
