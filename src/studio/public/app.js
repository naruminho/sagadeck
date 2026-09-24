/* ==========================================================================
   SagaDeck Studio — Aplicação Frontend do Editor PowerPoint + Chat IA
   ========================================================================== */

(function () {
  "use strict";

  // Estado da Aplicação
  const state = {
    deck: null,
    currentSlideIndex: 0,
    zoomScale: 0.6,
    autoFit: true,
    showGuides: true,
    showInspectorOverlay: true,
    issues: [],
    themes: [],
    layouts: [],
    history: [],
    currentCSS: "",
  };

  const LAYOUT_NAMES = [
    "cover", "statement", "section", "cards", "split", "number",
    "quote", "list", "timeline", "chart", "compare", "matrix",
    "question", "poll", "image", "code", "blocks", "end",
    "references", "video", "canvas"
  ];

  // Elementos do DOM
  const dom = {
    deckTitle: document.getElementById("deck-title-input"),
    themeSelect: document.getElementById("theme-select"),
    toneSelect: document.getElementById("tone-select"),
    decoSelect: document.getElementById("deco-select"),
    slideCount: document.getElementById("slide-count"),
    currentSlideLabel: document.getElementById("current-slide-label"),
    currentLayoutBadge: document.getElementById("current-layout-badge"),
    thumbnailsList: document.getElementById("thumbnails-list"),
    renderedSlideContainer: document.getElementById("rendered-slide-container"),
    slideStage: document.getElementById("slide-stage"),
    canvasViewport: document.getElementById("canvas-viewport"),
    inspectorOverlay: document.getElementById("inspector-overlay"),
    safeMarginGuides: document.getElementById("safe-margin-guides"),
    fiscalBadge: document.getElementById("fiscal-badge"),
    btnAutofix: document.getElementById("btn-autofix"),
    btnToggleChat: document.getElementById("btn-toggle-chat"),
    inspectorSidebar: document.getElementById("inspector-sidebar"),
    tabBtnProps: document.getElementById("tab-btn-props"),
    tabBtnChat: document.getElementById("tab-btn-chat"),
    tabPanelProps: document.getElementById("tab-panel-props"),
    tabPanelChat: document.getElementById("tab-panel-chat"),
    layoutPickerGrid: document.getElementById("layout-picker-grid"),
    slideFieldsForm: document.getElementById("slide-fields-form"),
    canvasElementsSection: document.getElementById("canvas-elements-section"),
    canvasElementsList: document.getElementById("canvas-elements-list"),
    slideNotesInput: document.getElementById("slide-notes-input"),
    slideTimeInput: document.getElementById("slide-time-input"),
    wordCountNum: document.getElementById("word-count-num"),
    antiSleepIndicator: document.getElementById("anti-sleep-indicator"),
    chkGuides: document.getElementById("chk-guides"),
    chkInspectOverlay: document.getElementById("chk-inspect-overlay"),
    zoomFit: document.getElementById("zoom-fit"),
    zoomOut: document.getElementById("zoom-out"),
    zoomIn: document.getElementById("zoom-in"),
    zoomLevel: document.getElementById("zoom-level"),
    btnAddSlide: document.getElementById("btn-add-slide"),
    btnAddSlideMini: document.getElementById("btn-add-slide-mini"),
    btnDupSlide: document.getElementById("btn-dup-slide"),
    btnDelSlide: document.getElementById("btn-del-slide"),
    btnPresent: document.getElementById("btn-present"),
    btnExportMenu: document.getElementById("btn-export-menu"),
    exportDropdown: document.getElementById("export-dropdown"),
    exportYaml: document.getElementById("export-yaml"),
    exportHtml: document.getElementById("export-html"),
    actionSaveYaml: document.getElementById("action-save-yaml"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatMessages: document.getElementById("chat-messages"),
    aiScopeSelect: document.getElementById("ai-scope-select"),
    toast: document.getElementById("toast-notification"),
    // Apresentação Fullscreen
    presModal: document.getElementById("presentation-modal"),
    modalClosePresent: document.getElementById("modal-close-present"),
    modalStage: document.getElementById("modal-stage"),
    presPrev: document.getElementById("pres-prev"),
    presNext: document.getElementById("pres-next"),
    presCounter: document.getElementById("pres-counter"),
  };

  // Inicialização
  async function init() {
    setupEventListeners();
    buildLayoutPicker();
    await loadDeck();
    updateCanvasScale();
    window.addEventListener("resize", () => {
      if (state.autoFit) updateCanvasScale();
    });
  }

  // Carregar Deck Inicial do Servidor
  async function loadDeck() {
    try {
      const res = await fetch("/api/deck");
      const data = await res.json();
      state.deck = data.spec;
      state.themes = data.themes || [];
      state.layouts = data.layouts || LAYOUT_NAMES;

      dom.deckTitle.value = state.deck.title || "Minha Apresentação";
      if (state.deck.theme) dom.themeSelect.value = state.deck.theme;

      renderThumbnails();
      selectSlide(0);
    } catch (err) {
      showToast("Erro ao carregar apresentação: " + err.message);
    }
  }

  // Renderizar o Slide Atual no Canvas Central
  async function renderCurrentSlide() {
    if (!state.deck || !state.deck.slides || state.deck.slides.length === 0) return;
    const idx = state.currentSlideIndex;
    const slide = state.deck.slides[idx];
    if (!slide) return;

    dom.currentSlideLabel.textContent = `Slide ${idx + 1} de ${state.deck.slides.length}`;
    dom.currentLayoutBadge.textContent = slide.layout || "auto";
    dom.toneSelect.value = slide.tone || "light";
    dom.decoSelect.value = slide.deco || "none";
    dom.slideNotesInput.value = slide.notes || "";
    dom.slideTimeInput.value = slide.time || 1;

    // Atualizar seletor de alvo da IA
    dom.aiScopeSelect.innerHTML = `
      <option value="current">Slide Atual (Slide ${idx + 1})</option>
      <option value="all">Toda a Apresentação (${state.deck.slides.length} slides)</option>
    `;

    try {
      const res = await fetch("/api/render-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide, index: idx, spec: state.deck }),
      });
      const data = await res.json();

      // Injetar estilos do Sagadeck se ainda não existirem
      ensureSlideStyles(data.baseCSS, data.themeCSS);

      // Renderizar HTML no palco
      dom.renderedSlideContainer.innerHTML = data.html;

      // Habilitar edição WYSIWYG inline
      enableInlineEditing();

      // Atualizar contagem de palavras anti-sono
      updateWordCount(slide);

      // Atualizar painel lateral de propriedades
      updatePropertiesPanel(slide);

      // Rodar inspeção geométrica do fiscal (detector de sobreposição e margens)
      setTimeout(inspectGeometry, 60);
    } catch (err) {
      console.error("Erro ao renderizar slide:", err);
    }
  }

  // Garantir Estilos CSS Base e Tema
  function ensureSlideStyles(baseCSS, themeCSS) {
    let styleEl = document.getElementById("sagadeck-injected-styles");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "sagadeck-injected-styles";
      document.head.appendChild(styleEl);
    }
    const combined = `${baseCSS || ""}\n${themeCSS || ""}`;
    if (state.currentCSS !== combined) {
      styleEl.textContent = combined;
      state.currentCSS = combined;
    }
  }

  // ==========================================================================
  // EDIÇÃO DIRETA WYSIWYG INLINE
  // ==========================================================================
  function enableInlineEditing() {
    const container = dom.renderedSlideContainer;
    const editableSelectors = [
      ".ttl", ".sub", ".kicker", ".st-line", ".q-text",
      ".nm-val", ".card-title", ".card-text", ".rf",
      ".sc-text .ttl", ".cv-main .ttl", ".en-main .ttl",
      "p", "li"
    ];

    const elements = container.querySelectorAll(editableSelectors.join(", "));
    elements.forEach((el) => {
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");

      el.addEventListener("input", () => {
        saveInlineChange(el);
        inspectGeometry();
      });

      el.addEventListener("blur", () => {
        syncDeckToServer();
        renderThumbnails();
      });
    });
  }

  // Mapear Edição Inline de Volta ao Objeto do Slide
  function saveInlineChange(el) {
    const slide = state.deck.slides[state.currentSlideIndex];
    if (!slide) return;
    const text = el.innerText.trim();

    if (el.classList.contains("ttl")) {
      slide.title = text;
      dom.deckTitle.value = text;
    } else if (el.classList.contains("sub")) {
      slide.subtitle = text;
    } else if (el.classList.contains("kicker")) {
      slide.kicker = text;
    } else if (el.classList.contains("st-line")) {
      if (slide.lines && Array.isArray(slide.lines)) {
        slide.lines[0] = text;
      } else {
        slide.text = text;
      }
    } else if (el.classList.contains("q-text")) {
      slide.quote = text;
    } else if (el.classList.contains("nm-val")) {
      slide.value = text;
    }

    updateWordCount(slide);
    updatePropertiesPanel(slide);
  }

  // ==========================================================================
  // O FISCAL GEOMÉTRICO: INSPEÇÃO EM TEMPO REAL ("se enxergar sozinho")
  // ==========================================================================
  function inspectGeometry() {
    const slideEl = dom.renderedSlideContainer.querySelector(".slide");
    if (!slideEl) return;

    dom.inspectorOverlay.innerHTML = "";
    state.issues = [];

    const R = (e) => e.getBoundingClientRect();
    const stageR = dom.slideStage.getBoundingClientRect();
    const scale = stageR.width / 1920;

    // Coordenadas lógicas no espaço 1920x1080
    const toLogical = (clientRect) => ({
      left: (clientRect.left - stageR.left) / scale,
      top: (clientRect.top - stageR.top) / scale,
      right: (clientRect.right - stageR.left) / scale,
      bottom: (clientRect.bottom - stageR.top) / scale,
      width: clientRect.width / scale,
      height: clientRect.height / scale,
    });

    const label = (e) => (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36);

    // Selecionar blocos de texto e cartões visíveis
    const candidates = Array.from(
      slideEl.querySelectorAll(".ttl, .sub, .kicker, .card, .st-line, .q-text, .nm-val, .figbox, .cp-col, .rf")
    ).filter((e) => {
      const cs = window.getComputedStyle(e);
      return cs.display !== "none" && cs.visibility !== "hidden" && e.offsetWidth > 0;
    });

    // 1. Checagem de Margem Segura (Safe Area: top 92, bottom 976, left 120, right 1800)
    for (const el of candidates) {
      if (el.closest(".foot")) continue;
      const r = toLogical(R(el));

      // Margem Inferior (Safe area termina em 976px)
      if (r.bottom > 976 + 18) {
        const overflow = Math.round(r.bottom - 976);
        state.issues.push({
          kind: "passa-da-margem-inferior",
          text: label(el),
          px: overflow,
          logical: r,
        });
      }

      // Estouro Fora do Slide (1920x1080)
      if (r.right > 1920 + 2 || r.bottom > 1080 + 2 || r.left < -2 || r.top < -2) {
        state.issues.push({
          kind: "fora-do-slide",
          text: label(el),
          logical: r,
        });
      }

      // Estouro Horizontal de Texto
      if (el.scrollWidth > el.clientWidth + 4) {
        state.issues.push({
          kind: "estouro-horizontal",
          text: label(el),
          logical: r,
        });
      }
    }

    // 2. Checagem de Sobreposição (Bounding Box Collisions)
    for (let a = 0; a < candidates.length; a++) {
      for (let b = a + 1; b < candidates.length; b++) {
        const A = candidates[a], B = candidates[b];
        if (A.contains(B) || B.contains(A)) continue;

        const ra = toLogical(R(A)), rb = toLogical(R(B));
        const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);

        if (ix > 8 && iy > 8) {
          // Sobreposição real detectada
          state.issues.push({
            kind: "sobreposicao",
            text: `${label(A)} ⟂ ${label(B)}`,
            logical: {
              left: Math.max(ra.left, rb.left),
              top: Math.max(ra.top, rb.top),
              width: ix,
              height: iy,
            },
          });
        }
      }
    }

    // Atualizar badge do fiscal
    const count = state.issues.length;
    dom.fiscalBadge.textContent = count;
    if (count === 0) {
      dom.fiscalBadge.className = "fiscal-badge clean";
      dom.fiscalBadge.title = "✓ Layout 100% perfeito: sem sobreposições e respeitando as margens";
    } else {
      dom.fiscalBadge.className = "fiscal-badge warn";
      dom.fiscalBadge.title = `⚠ ${count} problema(s) detectado(s): sobreposição ou quebra de margem`;
    }

    // Desenhar caixas no overlay se ativado
    if (state.showInspectorOverlay) {
      renderInspectorBoxes();
    }
  }

  // Renderizar Caixas de Alerta Visuais no Canvas
  function renderInspectorBoxes() {
    dom.inspectorOverlay.innerHTML = "";
    if (state.issues.length === 0) return;

    state.issues.forEach((issue) => {
      if (!issue.logical) return;
      const box = document.createElement("div");
      box.className = "issue-bounding-box";
      box.style.left = `${issue.logical.left}px`;
      box.style.top = `${issue.logical.top}px`;
      box.style.width = `${Math.max(issue.logical.width, 40)}px`;
      box.style.height = `${Math.max(issue.logical.height, 20)}px`;

      const tag = document.createElement("span");
      tag.className = "issue-tag";
      let tagText = "Sobreposição";
      if (issue.kind === "passa-da-margem-inferior") tagText = `Fora da Margem (+${issue.px}px)`;
      if (issue.kind === "fora-do-slide") tagText = "Fora do Slide";
      if (issue.kind === "estouro-horizontal") tagText = "Texto Estourado";
      tag.textContent = `${tagText}: ${issue.text}`;
      box.appendChild(tag);

      dom.inspectorOverlay.appendChild(box);
    });
  }

  // ==========================================================================
  // AUTO-CORREÇÃO AUTOMÁTICA ("corrigir sozinho")
  // ==========================================================================
  async function triggerAutofix() {
    try {
      const idx = state.currentSlideIndex;
      const res = await fetch("/api/autofix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideIndex: idx,
          spec: state.deck,
          issues: state.issues,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        state.deck.slides[idx] = data.slide;
        await renderCurrentSlide();
        renderThumbnails();
        const actionMsg = data.actions && data.actions.length
          ? data.actions.join("; ")
          : "Layout otimizado e perfeitamente seguro!";
        showToast(`🪄 Auto-Correção: ${actionMsg}`);
      }
    } catch (err) {
      showToast("Erro ao auto-corrigir: " + err.message);
    }
  }

  // ==========================================================================
  // CHAT LATERAL COM IA
  // ==========================================================================
  async function handleChatSubmit(e) {
    if (e) e.preventDefault();
    const message = dom.chatInput.value.trim();
    if (!message) return;

    // Adicionar bolha do usuário
    appendChatMessage("user", message);
    dom.chatInput.value = "";

    const scope = dom.aiScopeSelect.value;
    const targetIdx = scope === "all" ? null : state.currentSlideIndex;

    // Indicador de "pensando / corrigindo"
    const thinkingEl = appendChatMessage("ai", "Analisando estrutura, geometria dos slides e aplicando correções…");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          targetSlide: targetIdx,
          spec: state.deck,
          issues: state.issues,
        }),
      });
      const data = await res.json();

      // Atualizar o deck com as modificações feitas pela IA
      state.deck = data.spec;
      if (typeof data.targetSlide === "number" && data.targetSlide < state.deck.slides.length) {
        state.currentSlideIndex = data.targetSlide;
      }

      // Re-renderizar
      renderThumbnails();
      await renderCurrentSlide();

      // Substituir mensagem de thinking pela resposta completa
      thinkingEl.remove();
      appendChatMessage("ai", data.reply, data.actions);
    } catch (err) {
      thinkingEl.innerHTML = `<span style="color:var(--danger)">Erro: ${err.message}</span>`;
    }
  }

  function appendChatMessage(sender, text, actions = []) {
    const msgDiv = document.createElement("div");
    msgDiv.className = sender === "user" ? "user-msg" : "ai-msg";

    const avatar = document.createElement("div");
    avatar.className = sender === "user" ? "user-avatar" : "ai-avatar";
    avatar.textContent = sender === "user" ? "EU" : "✦";
    msgDiv.appendChild(avatar);

    const content = document.createElement("div");
    content.className = sender === "user" ? "user-content" : "ai-content";

    // Formatar quebras de linha e negritos
    const formatted = text
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/\n/g, "<br>");
    content.innerHTML = formatted;

    // Exibir badges de ações realizadas pela IA
    if (actions && actions.length > 0) {
      const actionsContainer = document.createElement("div");
      actionsContainer.style.marginTop = "8px";
      actions.forEach((a) => {
        const pill = document.createElement("span");
        pill.className = "action-badge-pill";
        pill.textContent = `✓ ${a}`;
        actionsContainer.appendChild(pill);
      });
      content.appendChild(actionsContainer);
    }

    msgDiv.appendChild(content);
    dom.chatMessages.appendChild(msgDiv);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    return msgDiv;
  }

  // ==========================================================================
  // NAVEGAÇÃO DE MINIATURAS (BARRA LATERAL ESQUERDA)
  // ==========================================================================
  function renderThumbnails() {
    if (!state.deck || !state.deck.slides) return;
    dom.thumbnailsList.innerHTML = "";
    dom.slideCount.textContent = state.deck.slides.length;

    state.deck.slides.forEach((slide, idx) => {
      const card = document.createElement("div");
      card.className = `thumb-card ${idx === state.currentSlideIndex ? "active" : ""}`;
      card.dataset.idx = idx;

      const header = document.createElement("div");
      header.className = "thumb-header";

      const num = document.createElement("span");
      num.className = "thumb-num";
      num.textContent = idx + 1;
      header.appendChild(num);

      const badge = document.createElement("span");
      badge.className = "thumb-badge";
      badge.textContent = slide.layout || "auto";
      header.appendChild(badge);

      card.appendChild(header);

      // Mini preview de tela
      const screen = document.createElement("div");
      screen.className = "thumb-screen";

      const previewTitle = document.createElement("span");
      previewTitle.style.cssText = "font-size:11px;color:#aaa;padding:6px;text-align:center;";
      const t = slide.title || slide.text || slide.question || slide.quote || "Slide " + (idx + 1);
      previewTitle.textContent = t.slice(0, 36);
      screen.appendChild(previewTitle);

      card.appendChild(screen);

      // Ações rápidas de thumbnail
      const actions = document.createElement("div");
      actions.className = "thumb-actions";

      const btnUp = document.createElement("button");
      btnUp.className = "btn-thumb-action";
      btnUp.innerHTML = "↑";
      btnUp.title = "Mover para cima";
      btnUp.onclick = (e) => { e.stopPropagation(); moveSlide(idx, -1); };

      const btnDown = document.createElement("button");
      btnDown.className = "btn-thumb-action";
      btnDown.innerHTML = "↓";
      btnDown.title = "Mover para baixo";
      btnDown.onclick = (e) => { e.stopPropagation(); moveSlide(idx, 1); };

      actions.appendChild(btnUp);
      actions.appendChild(btnDown);
      card.appendChild(actions);

      card.addEventListener("click", () => selectSlide(idx));
      dom.thumbnailsList.appendChild(card);
    });
  }

  function selectSlide(idx) {
    if (idx < 0 || idx >= state.deck.slides.length) return;
    state.currentSlideIndex = idx;
    renderThumbnails();
    renderCurrentSlide();
  }

  function moveSlide(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= state.deck.slides.length) return;
    const item = state.deck.slides.splice(idx, 1)[0];
    state.deck.slides.splice(target, 0, item);
    state.currentSlideIndex = target;
    syncDeckToServer();
    renderThumbnails();
    renderCurrentSlide();
  }

  // ==========================================================================
  // OPERAÇÕES DO DECK (ADICIONAR, DUPLICAR, EXCLUIR)
  // ==========================================================================
  function addNewSlide() {
    const newSlide = {
      layout: "statement",
      kicker: "Novo Tópico",
      text: "Escreva aqui a ideia principal deste slide.",
      tone: "light",
      time: 1,
      notes: "> Roteiro deste novo slide.",
    };
    const at = state.currentSlideIndex + 1;
    state.deck.slides.splice(at, 0, newSlide);
    state.currentSlideIndex = at;
    syncDeckToServer();
    renderThumbnails();
    renderCurrentSlide();
    showToast(`Slide adicionado na posição ${at + 1}`);
  }

  function duplicateCurrentSlide() {
    const cur = state.deck.slides[state.currentSlideIndex];
    if (!cur) return;
    const clone = JSON.parse(JSON.stringify(cur));
    const at = state.currentSlideIndex + 1;
    state.deck.slides.splice(at, 0, clone);
    state.currentSlideIndex = at;
    syncDeckToServer();
    renderThumbnails();
    renderCurrentSlide();
    showToast(`Slide duplicado na posição ${at + 1}`);
  }

  function deleteCurrentSlide() {
    if (state.deck.slides.length <= 1) {
      showToast("Não é possível excluir o único slide da apresentação.");
      return;
    }
    state.deck.slides.splice(state.currentSlideIndex, 1);
    state.currentSlideIndex = Math.max(0, state.currentSlideIndex - 1);
    syncDeckToServer();
    renderThumbnails();
    renderCurrentSlide();
    showToast("Slide excluído.");
  }

  // ==========================================================================
  // PAINEL DE PROPRIEDADES (LATERAL DIREITA)
  // ==========================================================================
  function buildLayoutPicker() {
    dom.layoutPickerGrid.innerHTML = "";
    LAYOUT_NAMES.forEach((name) => {
      const chip = document.createElement("div");
      chip.className = "layout-chip";
      chip.textContent = name;
      chip.dataset.layout = name;
      chip.onclick = () => {
        changeCurrentLayout(name);
      };
      dom.layoutPickerGrid.appendChild(chip);
    });
  }

  function changeCurrentLayout(layoutName) {
    const slide = state.deck.slides[state.currentSlideIndex];
    if (!slide) return;
    slide.layout = layoutName;
    syncDeckToServer();
    renderCurrentSlide();
    renderThumbnails();
    showToast(`Layout alterado para "${layoutName}"`);
  }

  function updatePropertiesPanel(slide) {
    // Atualizar chip ativo no picker de layouts
    const chips = dom.layoutPickerGrid.querySelectorAll(".layout-chip");
    chips.forEach((c) => {
      c.classList.toggle("active", c.dataset.layout === (slide.layout || "auto"));
    });

    // Campos dinâmicos conforme o layout
    dom.slideFieldsForm.innerHTML = "";
    const layout = slide.layout || "blocks";

    // Campo Título
    createField("Título", slide.title || slide.text || "", (val) => {
      if (slide.title !== undefined || !slide.text) slide.title = val;
      else slide.text = val;
      renderCurrentSlide();
    });

    // Campo Kicker
    createField("Kicker (Chapéu)", slide.kicker || "", (val) => {
      slide.kicker = val;
      renderCurrentSlide();
    });

    // Campo Subtítulo
    if (layout === "cover" || layout === "section" || layout === "end") {
      createField("Subtítulo", slide.subtitle || "", (val) => {
        slide.subtitle = val;
        renderCurrentSlide();
      });
    }

    // Campos específicos para Number
    if (layout === "number") {
      createField("Valor Numérico", slide.value ?? 100, (val) => {
        slide.value = val;
        renderCurrentSlide();
      });
      createField("Sufixo / Unidade", slide.suffix || "", (val) => {
        slide.suffix = val;
        renderCurrentSlide();
      });
      createField("Rótulo", slide.label || "", (val) => {
        slide.label = val;
        renderCurrentSlide();
      });
    }

    // Campos específicos para Quote
    if (layout === "quote") {
      createField("Citação", slide.quote || "", (val) => {
        slide.quote = val;
        renderCurrentSlide();
      }, true);
      createField("Autor da Citação", slide.by || "", (val) => {
        slide.by = val;
        renderCurrentSlide();
      });
    }

    // Seção de Canvas Livre
    if (layout === "canvas") {
      dom.canvasElementsSection.classList.remove("hidden");
      renderCanvasElementsList(slide);
    } else {
      dom.canvasElementsSection.classList.add("hidden");
    }
  }

  function createField(label, value, onChange, isTextarea = false) {
    const group = document.createElement("div");
    group.className = "field-group";

    const lbl = document.createElement("label");
    lbl.textContent = label;
    group.appendChild(lbl);

    const input = document.createElement(isTextarea ? "textarea" : "input");
    input.className = "form-control";
    input.value = value;
    if (isTextarea) input.rows = 3;

    input.addEventListener("change", () => {
      onChange(input.value);
      syncDeckToServer();
    });

    group.appendChild(input);
    dom.slideFieldsForm.appendChild(group);
  }

  function renderCanvasElementsList(slide) {
    dom.canvasElementsList.innerHTML = "";
    if (!Array.isArray(slide.elements)) slide.elements = [];

    slide.elements.forEach((el, i) => {
      const item = document.createElement("div");
      item.style.cssText = "background:var(--bg-card);padding:8px;border-radius:4px;margin-bottom:6px;font-size:12px;";
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <b>#${i + 1} (${el.text ? el.text.slice(0, 15) : "Elemento"})</b>
          <span style="color:var(--text-dim)">[x:${el.x ?? 0}, y:${el.y ?? 0}]</span>
        </div>
        <div style="display:flex;gap:4px;">
          <input type="number" value="${el.x ?? 120}" style="width:50px" placeholder="X" onchange="window.updateCanvasEl(${i}, 'x', +this.value)">
          <input type="number" value="${el.y ?? 120}" style="width:50px" placeholder="Y" onchange="window.updateCanvasEl(${i}, 'y', +this.value)">
          <input type="number" value="${el.w ?? 300}" style="width:50px" placeholder="W" onchange="window.updateCanvasEl(${i}, 'w', +this.value)">
          <input type="number" value="${el.h ?? 100}" style="width:50px" placeholder="H" onchange="window.updateCanvasEl(${i}, 'h', +this.value)">
        </div>
      `;
      dom.canvasElementsList.appendChild(item);
    });
  }

  window.updateCanvasEl = (idx, prop, val) => {
    const slide = state.deck.slides[state.currentSlideIndex];
    if (slide && slide.elements && slide.elements[idx]) {
      slide.elements[idx][prop] = val;
      syncDeckToServer();
      renderCurrentSlide();
    }
  };

  // ==========================================================================
  // AUTO-FIT E ESCALA DO CANVAS 16:9
  // ==========================================================================
  function updateCanvasScale() {
    const vp = dom.canvasViewport;
    const availW = vp.clientWidth - 48;
    const availH = vp.clientHeight - 48;
    if (availW <= 0 || availH <= 0) return;

    if (state.autoFit) {
      const scaleW = availW / 1920;
      const scaleH = availH / 1080;
      state.zoomScale = Math.min(scaleW, scaleH);
      dom.zoomLevel.textContent = `${Math.round(state.zoomScale * 100)}%`;
    }

    dom.slideStage.style.transform = `scale(${state.zoomScale})`;
  }

  // ==========================================================================
  // MODO APRESENTAÇÃO FULLSCREEN (F5)
  // ==========================================================================
  function startPresentation() {
    dom.presModal.classList.remove("hidden");
    document.documentElement.requestFullscreen?.().catch(() => {});
    updatePresSlide();
  }

  function closePresentation() {
    dom.presModal.classList.add("hidden");
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function updatePresSlide() {
    const idx = state.currentSlideIndex;
    dom.presCounter.textContent = `${idx + 1} / ${state.deck.slides.length}`;
    const slide = state.deck.slides[idx];

    fetch("/api/render-slide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slide, index: idx, spec: state.deck }),
    })
      .then((res) => res.json())
      .then((data) => {
        dom.modalStage.innerHTML = data.html;
        const scaleW = window.innerWidth / 1920;
        const scaleH = window.innerHeight / 1080;
        dom.modalStage.style.transform = `scale(${Math.min(scaleW, scaleH)})`;
      });
  }

  // ==========================================================================
  // SINCRONIZAÇÃO E EVENT LISTENERS
  // ==========================================================================
  async function syncDeckToServer() {
    try {
      await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: state.deck }),
      });
    } catch (err) {
      console.warn("Erro ao sincronizar com servidor:", err);
    }
  }

  function updateWordCount(slide) {
    const text = JSON.stringify(slide);
    const words = text.split(/\s+/).length;
    dom.wordCountNum.textContent = words;
    if (words > 40) {
      dom.antiSleepIndicator.className = "meta-item anti-sleep-warn";
    } else {
      dom.antiSleepIndicator.className = "meta-item anti-sleep-ok";
    }
  }

  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.remove("hidden");
    clearTimeout(dom.toast._timer);
    dom.toast._timer = setTimeout(() => {
      dom.toast.classList.add("hidden");
    }, 3200);
  }

  function setupEventListeners() {
    // Título do Deck
    dom.deckTitle.addEventListener("change", () => {
      state.deck.title = dom.deckTitle.value;
      syncDeckToServer();
      showToast("Título atualizado");
    });

    // Seletor de Tema
    dom.themeSelect.addEventListener("change", () => {
      state.deck.theme = dom.themeSelect.value;
      syncDeckToServer();
      renderCurrentSlide();
      showToast(`Tema alterado para "${state.deck.theme}"`);
    });

    // Seletor de Tom do Slide
    dom.toneSelect.addEventListener("change", () => {
      const slide = state.deck.slides[state.currentSlideIndex];
      if (slide) {
        slide.tone = dom.toneSelect.value;
        syncDeckToServer();
        renderCurrentSlide();
      }
    });

    // Seletor de Decoração
    dom.decoSelect.addEventListener("change", () => {
      const slide = state.deck.slides[state.currentSlideIndex];
      if (slide) {
        slide.deco = dom.decoSelect.value;
        syncDeckToServer();
        renderCurrentSlide();
      }
    });

    // Notas do Apresentador
    dom.slideNotesInput.addEventListener("input", () => {
      const slide = state.deck.slides[state.currentSlideIndex];
      if (slide) slide.notes = dom.slideNotesInput.value;
    });
    dom.slideNotesInput.addEventListener("blur", syncDeckToServer);

    // Tempo do Slide
    dom.slideTimeInput.addEventListener("change", () => {
      const slide = state.deck.slides[state.currentSlideIndex];
      if (slide) {
        slide.time = +dom.slideTimeInput.value;
        syncDeckToServer();
      }
    });

    // Botões de Operação do Slide
    dom.btnAddSlide.onclick = addNewSlide;
    dom.btnAddSlideMini.onclick = addNewSlide;
    dom.btnDupSlide.onclick = duplicateCurrentSlide;
    dom.btnDelSlide.onclick = deleteCurrentSlide;
    dom.btnAutofix.onclick = triggerAutofix;

    // Toggle Chat Lateral
    dom.btnToggleChat.onclick = () => {
      dom.btnToggleChat.classList.toggle("active");
      dom.inspectorSidebar.classList.toggle("collapsed");
    };

    // Alternância de Abas na Barra Direita
    dom.tabBtnProps.onclick = () => {
      dom.tabBtnProps.classList.add("active");
      dom.tabBtnChat.classList.remove("active");
      dom.tabPanelProps.classList.add("active");
      dom.tabPanelChat.classList.remove("active");
    };
    dom.tabBtnChat.onclick = () => {
      dom.tabBtnChat.classList.add("active");
      dom.tabBtnProps.classList.remove("active");
      dom.tabPanelChat.classList.add("active");
      dom.tabPanelProps.classList.remove("active");
      dom.chatInput.focus();
    };

    // Chat Form
    dom.chatForm.onsubmit = handleChatSubmit;

    // Chips de Sugestões de Prompt do Chat
    document.querySelectorAll(".chip-prompt").forEach((btn) => {
      btn.onclick = () => {
        dom.chatInput.value = btn.dataset.prompt;
        handleChatSubmit();
      };
    });

    // Guias de Margem e Inspector Overlay
    dom.chkGuides.onchange = () => {
      dom.safeMarginGuides.style.display = dom.chkGuides.checked ? "block" : "none";
    };
    dom.chkInspectOverlay.onchange = () => {
      state.showInspectorOverlay = dom.chkInspectOverlay.checked;
      if (state.showInspectorOverlay) inspectGeometry();
      else dom.inspectorOverlay.innerHTML = "";
    };

    // Zoom Controls
    dom.zoomFit.onclick = () => {
      state.autoFit = true;
      updateCanvasScale();
    };
    dom.zoomIn.onclick = () => {
      state.autoFit = false;
      state.zoomScale = Math.min(1.5, state.zoomScale + 0.1);
      dom.zoomLevel.textContent = `${Math.round(state.zoomScale * 100)}%`;
      dom.slideStage.style.transform = `scale(${state.zoomScale})`;
    };
    dom.zoomOut.onclick = () => {
      state.autoFit = false;
      state.zoomScale = Math.max(0.2, state.zoomScale - 0.1);
      dom.zoomLevel.textContent = `${Math.round(state.zoomScale * 100)}%`;
      dom.slideStage.style.transform = `scale(${state.zoomScale})`;
    };

    // Dropdown de Exportação
    dom.btnExportMenu.onclick = (e) => {
      e.stopPropagation();
      dom.exportDropdown.parentElement.classList.toggle("show");
    };
    document.addEventListener("click", () => {
      dom.exportDropdown.parentElement.classList.remove("show");
    });

    dom.exportYaml.onclick = (e) => {
      e.preventDefault();
      window.location.href = "/api/export/yaml";
    };
    dom.exportHtml.onclick = (e) => {
      e.preventDefault();
      window.location.href = "/api/export/html";
    };
    dom.actionSaveYaml.onclick = (e) => {
      e.preventDefault();
      syncDeckToServer().then(() => showToast("Deck salvo no arquivo local!"));
    };

    // Modo Apresentação Fullscreen
    dom.btnPresent.onclick = startPresentation;
    dom.modalClosePresent.onclick = closePresentation;
    dom.presPrev.onclick = () => {
      if (state.currentSlideIndex > 0) {
        state.currentSlideIndex--;
        updatePresSlide();
      }
    };
    dom.presNext.onclick = () => {
      if (state.currentSlideIndex < state.deck.slides.length - 1) {
        state.currentSlideIndex++;
        updatePresSlide();
      }
    };

    // Atalhos de Teclado (F5, Setas, Esc)
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

      if (e.key === "F5") {
        e.preventDefault();
        startPresentation();
      } else if (e.key === "Escape") {
        closePresentation();
      } else if (e.key === "ArrowRight" || e.key === " ") {
        if (!dom.presModal.classList.contains("hidden")) {
          e.preventDefault();
          dom.presNext.click();
        } else if (state.currentSlideIndex < state.deck.slides.length - 1) {
          selectSlide(state.currentSlideIndex + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (!dom.presModal.classList.contains("hidden")) {
          e.preventDefault();
          dom.presPrev.click();
        } else if (state.currentSlideIndex > 0) {
          selectSlide(state.currentSlideIndex - 1);
        }
      }
    });
  }

  // Inicializar quando o DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
