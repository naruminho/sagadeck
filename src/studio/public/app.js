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
    soundEnabled: true,
    isSquint: false,
    isHeatmap: false,
    isYamlDrawerOpen: false,
    selectedIcon: null,
    iconTargetCardIndex: null,
    issues: [],
    ai: { available: false, textModel: "", imageModel: "", url: "" },
    chatHistory: [],
    themes: [],
    layouts: [],
    history: [],
    currentCSS: "",
  };

  const LAYOUT_NAMES = [
    "cover", "statement", "section", "cards", "stats", "steps", "split", "number",
    "quote", "list", "timeline", "chart", "compare", "matrix",
    "question", "poll", "image", "code", "blocks", "end",
    "references", "video", "canvas"
  ];

  // Nome que a pessoa vê para cada layout (o YAML continua com o nome em inglês).
  const LAYOUT_LABELS = {
    cover: "Capa", section: "Seção", statement: "Frase de impacto", quote: "Citação", number: "Número grande",
    split: "Texto e figura", cards: "Cartões", stats: "Indicadores", steps: "Etapas", list: "Lista",
    timeline: "Linha do tempo", chart: "Gráfico", compare: "Comparação", matrix: "Matriz 2×2",
    question: "Pergunta", poll: "Enquete", image: "Imagem", code: "Código", video: "Vídeo",
    blocks: "Livre (blocos)", canvas: "Livre (posições)", end: "Encerramento", references: "Referências",
  };
  const layoutLabel = (name) => LAYOUT_LABELS[name] || name || "Automático";

  const store = {
    get(k, d) { try { const v = localStorage.getItem("sagadeck." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("sagadeck." + k, JSON.stringify(v)); } catch {} },
  };

  const escHtml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escAttr = (v) => escHtml(v).replace(/"/g, "&quot;");

  // <i class="ic" data-ic="nome"> -> SVG do Lucide (ui-icons.js)
  function hydrateIcons(root = document) {
    const icons = window.UI_ICONS || {};
    root.querySelectorAll(".ic[data-ic]").forEach((el) => {
      const name = el.dataset.ic;
      if (el.dataset.done === name || !icons[name]) return;
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
      el.dataset.done = name;
    });
  }

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
    btnOpenYaml: document.getElementById("btn-open-yaml"),
    fileInputYaml: document.getElementById("file-input-yaml"),
    menuOpenLocal: document.getElementById("menu-open-local"),
    menuOpenServer: document.getElementById("menu-open-server"),
    modalOpenServer: document.getElementById("modal-open-server"),
    inputServerPath: document.getElementById("input-server-path"),
    btnConfirmOpenServer: document.getElementById("btn-confirm-open-server"),
    btnCancelOpenServer: document.getElementById("btn-cancel-open-server"),
    btnCloseOpenModal: document.getElementById("btn-close-open-modal"),
    dropOverlay: document.getElementById("drop-overlay"),
    exportYaml: document.getElementById("export-yaml"),
    exportHtml: document.getElementById("export-html"),
    actionSaveYaml: document.getElementById("action-save-yaml"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatSend: document.getElementById("chat-send"),
    chatMessages: document.getElementById("chat-messages"),
    aiScopeSelect: document.getElementById("ai-scope-select"),
    aiImagesToggle: document.getElementById("ai-images-toggle"),
    aiStatus: document.getElementById("ai-status"),
    // Gerar deck com IA
    btnAiDeck: document.getElementById("btn-ai-deck"),
    modalAiDeck: document.getElementById("modal-ai-deck"),
    btnCloseAiDeck: document.getElementById("btn-close-ai-deck"),
    btnCancelAiDeck: document.getElementById("btn-cancel-ai-deck"),
    btnRunAiDeck: document.getElementById("btn-run-ai-deck"),
    aiDeckBriefing: document.getElementById("ai-deck-briefing"),
    aiDeckTheme: document.getElementById("ai-deck-theme"),
    aiDeckSlides: document.getElementById("ai-deck-slides"),
    aiDeckImages: document.getElementById("ai-deck-images"),
    aiDeckStatus: document.getElementById("ai-deck-status"),
    toast: document.getElementById("toast-notification"),
    // Biblioteca de Ícones
    btnInsertIcon: document.getElementById("btn-insert-icon"),
    modalIconPicker: document.getElementById("modal-icon-picker"),
    btnCloseIconPicker: document.getElementById("btn-close-icon-picker"),
    iconSearchInput: document.getElementById("icon-search-input"),
    iconSearchCount: document.getElementById("icon-search-count"),
    iconsGridContainer: document.getElementById("icons-grid-container"),
    iconPreviewFooter: document.getElementById("icon-preview-footer"),
    iconPreviewSvg: document.getElementById("icon-preview-svg"),
    iconPreviewName: document.getElementById("icon-preview-name"),
    btnInsertIconCard: document.getElementById("btn-insert-icon-card"),
    btnInsertIconFigure: document.getElementById("btn-insert-icon-figure"),
    btnInsertIconCanvas: document.getElementById("btn-insert-icon-canvas"),
    // Recursos Inovadores Fora da Caixa
    btnSpotlight: document.getElementById("btn-spotlight"),
    btnSquint: document.getElementById("btn-squint"),
    btnHeatmap: document.getElementById("btn-heatmap"),
    btnSmartTidy: document.getElementById("btn-smart-tidy"),
    btnYamlDrawer: document.getElementById("btn-yaml-drawer"),
    btnAudioToggle: document.getElementById("btn-audio-toggle"),
    heatmapOverlay: document.getElementById("heatmap-overlay"),
    alchemyPill: document.getElementById("alchemy-pill"),
    alchemyActions: document.getElementById("alchemy-actions"),
    yamlDrawer: document.getElementById("yaml-drawer"),
    yamlLiveEditor: document.getElementById("yaml-live-editor"),
    btnCloseYamlDrawer: document.getElementById("btn-close-yaml-drawer"),
    storyArcWidget: document.getElementById("story-arc-widget"),
    storyArcPath: document.getElementById("story-arc-path"),
    storyArcDot: document.getElementById("story-arc-dot"),
    arcStatusBadge: document.getElementById("arc-status-badge"),
    arcRecommendation: document.getElementById("arc-recommendation"),
    commandPaletteModal: document.getElementById("command-palette-modal"),
    paletteSearchInput: document.getElementById("palette-search-input"),
    paletteResultsList: document.getElementById("palette-results-list"),
    // Napkin AI (Texto -> Diagrama Visual)
    btnNapkin: document.getElementById("btn-napkin"),
    modalNapkin: document.getElementById("modal-napkin"),
    btnCloseNapkin: document.getElementById("btn-close-napkin"),
    napkinInputText: document.getElementById("napkin-input-text"),
    napkinPreviewBox: document.getElementById("napkin-preview-box"),
    napkinDetectedBadge: document.getElementById("napkin-detected-badge"),
    napkinRationale: document.getElementById("napkin-rationale"),
    napkinYamlPreview: document.getElementById("napkin-yaml-preview"),
    btnRunNapkin: document.getElementById("btn-run-napkin"),
    btnNapkinReplace: document.getElementById("btn-napkin-replace"),
    btnNapkinInsert: document.getElementById("btn-napkin-insert"),
    // Apresentação Fullscreen & Live Drawing
    presModal: document.getElementById("presentation-modal"),
    modalClosePresent: document.getElementById("modal-close-present"),
    modalStage: document.getElementById("modal-stage"),
    presSlideRender: document.getElementById("pres-slide-render"),
    presDrawCanvas: document.getElementById("pres-draw-canvas"),
    presDrawToolbar: document.getElementById("pres-draw-toolbar"),
    presDrawFab: document.getElementById("pres-draw-fab"),
    presBtnPen: document.getElementById("pres-btn-pen"),
    presBtnHighlighter: document.getElementById("pres-btn-highlighter"),
    presBtnUndo: document.getElementById("pres-btn-undo"),
    presBtnClear: document.getElementById("pres-btn-clear"),
    presBtnCloseDraw: document.getElementById("pres-btn-close-draw"),
    presPrev: document.getElementById("pres-prev"),
    presNext: document.getElementById("pres-next"),
    presCounter: document.getElementById("pres-counter"),
    // Navegação Mobile (Smartphones)
    mobileNavBtnSlides: document.getElementById("mobile-btn-slides"),
    mobileNavBtnNapkin: document.getElementById("mobile-btn-napkin"),
    mobileNavBtnPresent: document.getElementById("mobile-btn-present"),
    mobileNavBtnEditor: document.getElementById("mobile-btn-editor"),
    mobileNavBtnChat: document.getElementById("mobile-btn-chat"),
    // Estrutura nova (faixa de opções, painéis, barra de status)
    saveStatus: document.getElementById("save-status"),
    ribbonTabs: document.querySelectorAll("#ribbon-tabs .ribbon-tab[data-tab]"),
    ribbonPanels: document.querySelectorAll("#ribbon .ribbon-panel"),
    btnLayoutGallery: document.getElementById("btn-layout-gallery"),
    layoutPopover: document.getElementById("layout-popover"),
    btnStoryArc: document.getElementById("btn-story-arc"),
    storyArcPopover: document.getElementById("story-arc-popover"),
    themeGallery: document.getElementById("theme-gallery"),
    presentSplit: document.getElementById("present-split"),
    btnPresentMenu: document.getElementById("btn-present-menu"),
    presentFromStart: document.getElementById("present-from-start"),
    presentFromCurrent: document.getElementById("present-from-current"),
    btnClosePane: document.getElementById("btn-close-pane"),
    btnPaneProps: document.getElementById("btn-pane-props"),
    btnNotesToggle: document.getElementById("btn-notes-toggle"),
    btnNotesToggleStatus: document.getElementById("btn-notes-toggle-status"),
    notesBar: document.getElementById("notes-bar"),
    statusIssues: document.getElementById("status-issues"),
    chatEmpty: document.getElementById("chat-empty"),
  };

  // Inicialização
  async function init() {
    hydrateIcons();
    setupEventListeners();
    setupShell();
    buildLayoutPicker();
    await loadDeck();
    refreshAIStatus();
    setInterval(refreshAIStatus, 30000);
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
      state.themeMeta = data.themeMeta || {};
      state.layouts = data.layouts || LAYOUT_NAMES;
      state.file = data.file || null;

      buildThemeGallery();
      dom.deckTitle.value = state.deck.title || "";
      if (state.deck.theme) dom.themeSelect.value = state.deck.theme;
      updateSaveStatus();

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
    dom.currentLayoutBadge.textContent = layoutLabel(slide.layout);
    dom.toneSelect.value = slide.tone || "light";
    dom.decoSelect.value = slide.deco || "none";
    dom.slideNotesInput.value = slide.notes || "";
    dom.slideTimeInput.value = slide.time || 1;
    syncThemeGallery();

    // Atualizar seletor de alvo da IA (mantém a escolha)
    const scope = dom.aiScopeSelect.value || "current";
    dom.aiScopeSelect.innerHTML = `
      <option value="current">Este slide (${idx + 1})</option>
      <option value="all">Apresentação inteira</option>
    `;
    dom.aiScopeSelect.value = scope;

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
      fitSlideText(dom.renderedSlideContainer);
      // a miniatura deste slide usa o mesmo HTML (acompanha cada edição)
      putThumb(idx, slide, data.html);

      // Habilitar edição WYSIWYG inline
      enableInlineEditing();

      // Atualizar contagem de palavras anti-sono
      updateWordCount(slide);

      // Atualizar painel lateral de propriedades
      updatePropertiesPanel(slide);

      // Atualizar Eletrocardiograma da Narrativa (Story Arc Pulse)
      updateStoryArc();

      // Atualizar YAML Live Link
      updateYamlLiveEditor();

      // Renderizar Heatmap se ativo
      if (state.isHeatmap) renderHeatmap();

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

      el.addEventListener("mouseup", () => {
        const sel = window.getSelection();
        const selText = sel ? sel.toString().trim() : "";
        showAlchemyPill(el, selText);
      });

      el.addEventListener("focus", () => {
        showAlchemyPill(el, "");
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

    // Atualizar badge do fiscal (faixa Revisar) e a barra de status
    const count = state.issues.length;
    dom.fiscalBadge.textContent = count;
    if (count === 0) {
      dom.fiscalBadge.className = "fiscal-badge clean";
      dom.fiscalBadge.title = "Sem sobreposições nem texto fora das margens";
      dom.statusIssues.textContent = "";
      dom.statusIssues.classList.remove("warn");
    } else {
      dom.fiscalBadge.className = "fiscal-badge warn";
      dom.fiscalBadge.title = `${count} problema(s): sobreposição ou texto fora das margens`;
      dom.statusIssues.textContent = count === 1 ? "1 problema de layout" : `${count} problemas de layout`;
      dom.statusIssues.title = "Clique para corrigir automaticamente";
      dom.statusIssues.classList.add("warn");
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

    // Indicador de progresso ao vivo (etapa, segundos, texto chegando)
    const work = createProgressBubble(state.ai.available
      ? `Enviando para o LLM (${state.ai.textModel})…`
      : "Analisando estrutura, geometria dos slides e aplicando correções…");
    dom.chatSend.disabled = true;
    dom.chatInput.disabled = true;
    const history = state.chatHistory.slice(-6);
    state.chatHistory.push({ role: "user", text: message });

    try {
      const data = await streamAI("/api/ai/chat", {
        message,
        targetSlide: targetIdx,
        spec: state.deck,
        issues: state.issues,
        images: dom.aiImagesToggle.checked,
        history,
      }, (ev) => work.update(ev));
      if (!data.spec) throw new Error(data.error || "resposta sem deck");
      state.chatHistory.push({ role: "assistant", text: data.reply });

      // Atualizar o deck com as modificações feitas pela IA
      state.deck = data.spec;
      if (typeof data.targetSlide === "number" && data.targetSlide < state.deck.slides.length) {
        state.currentSlideIndex = data.targetSlide;
      }

      // Re-renderizar
      renderThumbnails();
      await renderCurrentSlide();

      // Substituir o indicador pela resposta completa
      work.done();
      appendChatMessage("ai", data.reply, data.actions);
    } catch (err) {
      work.fail(err.message);
    } finally {
      dom.chatSend.disabled = false;
      dom.chatInput.disabled = false;
      dom.chatInput.focus();
    }
  }

  function appendChatMessage(sender, text, actions = []) {
    dom.chatEmpty?.remove();
    const msgDiv = document.createElement("div");
    msgDiv.className = sender === "user" ? "user-msg" : "ai-msg";

    const avatar = document.createElement("div");
    avatar.className = sender === "user" ? "user-avatar" : "ai-avatar";
    avatar.textContent = sender === "user" ? "EU" : "✦";
    msgDiv.appendChild(avatar);

    const content = document.createElement("div");
    content.className = sender === "user" ? "user-content" : "ai-content";

    // Formatar quebras de linha e negritos
    const formatted = String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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
  // SÍNTESE DE ÁUDIO WEB AUDIO API (MICRO-INTERAÇÕES HÁPTICAS)
  // ==========================================================================
  let audioCtx = null;
  function playHaptic(type = "snap") {
    if (!state.soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === "snap") {
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === "pop") {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      }
    } catch {}
  }

  // ==========================================================================
  // BIBLIOTECA DE ÍCONES (2.100+ ÍCONES)
  // ==========================================================================
  function openIconPicker(targetCardIdx = null) {
    state.iconTargetCardIndex = targetCardIdx;
    dom.modalIconPicker.classList.remove("hidden");
    dom.iconSearchInput.value = "";
    dom.iconPreviewFooter.classList.add("hidden");
    state.selectedIcon = null;
    loadIcons("");
    setTimeout(() => dom.iconSearchInput.focus(), 60);
  }

  function closeIconPicker() {
    dom.modalIconPicker.classList.add("hidden");
    state.iconTargetCardIndex = null;
  }

  async function loadIcons(query = "") {
    dom.iconSearchCount.textContent = "Buscando...";
    try {
      const res = await fetch(`/api/icons?q=${encodeURIComponent(query)}&limit=90`);
      const list = await res.json();
      dom.iconsGridContainer.innerHTML = "";
      dom.iconSearchCount.textContent = `${list.length} ícones`;

      if (list.length === 0) {
        dom.iconsGridContainer.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-dim);">Nenhum ícone encontrado para "${query}". Tente termos como "coffee", "user", "star", "chart", "rocket".</div>`;
        return;
      }

      list.forEach((item) => {
        const card = document.createElement("div");
        card.className = "icon-card";
        card.title = item.name;

        const svgBox = document.createElement("div");
        svgBox.className = "icon-svg-wrapper";
        svgBox.innerHTML = item.svg;
        card.appendChild(svgBox);

        const label = document.createElement("span");
        label.className = "icon-card-name";
        label.textContent = item.name;
        card.appendChild(label);

        card.onclick = () => {
          dom.iconsGridContainer.querySelectorAll(".icon-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          state.selectedIcon = item;

          if (state.iconTargetCardIndex !== null) {
            applyIconToTargetCard(item.name);
            return;
          }

          dom.iconPreviewFooter.classList.remove("hidden");
          dom.iconPreviewSvg.innerHTML = item.svg;
          dom.iconPreviewName.textContent = item.name;
          playHaptic("snap");
        };

        dom.iconsGridContainer.appendChild(card);
      });
    } catch (err) {
      dom.iconsGridContainer.innerHTML = `<div style="color:var(--danger);padding:20px;">Erro ao carregar ícones: ${err.message}</div>`;
    }
  }

  function applyIconToTargetCard(iconName) {
    const slide = state.deck.slides[state.currentSlideIndex];
    if (slide && slide.items && slide.items[state.iconTargetCardIndex]) {
      if (typeof slide.items[state.iconTargetCardIndex] === "object") {
        slide.items[state.iconTargetCardIndex].icon = iconName;
      } else {
        slide.items[state.iconTargetCardIndex] = {
          title: String(slide.items[state.iconTargetCardIndex]),
          icon: iconName,
        };
      }
      syncDeckToServer();
      renderCurrentSlide();
      closeIconPicker();
      showToast(`Ícone alterado para "${iconName}"!`);
      playHaptic("snap");
    }
  }

  function insertSelectedIconAsCard() {
    if (!state.selectedIcon) return;
    const slide = state.deck.slides[state.currentSlideIndex];
    if (!slide) return;

    if (slide.layout !== "cards") {
      slide.layout = "cards";
    }
    if (!Array.isArray(slide.items)) slide.items = [];

    slide.items.push({
      title: state.selectedIcon.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      text: "Descrição do novo ponto ou benefício.",
      icon: state.selectedIcon.name,
    });
    slide.cols = Math.min(4, Math.max(2, slide.items.length));

    syncDeckToServer();
    renderCurrentSlide();
    renderThumbnails();
    closeIconPicker();
    showToast(`✓ Card com ícone "${state.selectedIcon.name}" adicionado!`);
    playHaptic("pop");
  }

  function insertSelectedIconAsFigure() {
    if (!state.selectedIcon) return;
    const slide = state.deck.slides[state.currentSlideIndex];
    if (!slide) return;

    slide.figure = { icon: state.selectedIcon.name, size: 360 };
    if (slide.layout !== "split" && slide.layout !== "section" && slide.layout !== "cover" && slide.layout !== "end") {
      slide.layout = "split";
    }

    syncDeckToServer();
    renderCurrentSlide();
    renderThumbnails();
    closeIconPicker();
    showToast(`✓ Ícone "${state.selectedIcon.name}" definido como figura principal!`);
    playHaptic("pop");
  }

  function insertSelectedIconAsCanvas() {
    if (!state.selectedIcon) return;
    const slide = state.deck.slides[state.currentSlideIndex];
    if (!slide) return;

    if (slide.layout !== "canvas") {
      slide.layout = "canvas";
    }
    if (!Array.isArray(slide.elements)) slide.elements = [];

    slide.elements.push({
      icon: state.selectedIcon.name,
      x: 800,
      y: 350,
      w: 220,
      h: 220,
    });

    syncDeckToServer();
    renderCurrentSlide();
    renderThumbnails();
    closeIconPicker();
    showToast(`✓ Ícone "${state.selectedIcon.name}" adicionado ao canvas livre!`);
    playHaptic("pop");
  }

  // ==========================================================================
  // ELETROCARDIOGRAMA DA NARRATIVA (Story Arc Pulse)
  // ==========================================================================
  function updateStoryArc() {
    if (!state.deck || !state.deck.slides || state.deck.slides.length === 0) return;
    const slides = state.deck.slides;
    const count = slides.length;
    const svgW = 200;
    const svgH = 36;

    const ENERGY_MAP = {
      cover: 85, statement: 80, number: 75, cards: 55, split: 60,
      chart: 65, timeline: 50, compare: 65, matrix: 55, question: 80,
      poll: 80, image: 70, quote: 70, end: 85, canvas: 60, blocks: 50
    };

    const points = slides.map((s, idx) => {
      const x = count <= 1 ? svgW / 2 : (idx / (count - 1)) * (svgW - 16) + 8;
      const baseEnergy = ENERGY_MAP[s.layout] || 60;
      const toneBonus = s.tone === "accent" || s.tone === "alert" ? 15 : s.tone === "dark" ? 8 : 0;
      const energy = Math.min(95, Math.max(15, baseEnergy + toneBonus));
      const y = svgH - ((energy / 100) * (svgH - 10) + 5);
      return { x, y, energy, layout: s.layout };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const cx = (prev.x + cur.x) / 2;
      pathD += ` C ${cx} ${prev.y}, ${cx} ${cur.y}, ${cur.x} ${cur.y}`;
    }
    dom.storyArcPath.setAttribute("d", pathD);

    const currentPt = points[state.currentSlideIndex] || points[0];
    dom.storyArcDot.setAttribute("cx", currentPt.x);
    dom.storyArcDot.setAttribute("cy", currentPt.y);

    let isMonotone = false;
    if (count >= 4) {
      for (let i = 0; i <= count - 4; i++) {
        const slice = slides.slice(i, i + 4);
        const layouts = new Set(slice.map((s) => s.layout || "auto"));
        const tones = new Set(slice.map((s) => s.tone || "light"));
        if (layouts.size === 1 && tones.size === 1) {
          isMonotone = true;
          break;
        }
      }
    }

    if (isMonotone) {
      dom.arcStatusBadge.className = "arc-badge warn";
      dom.arcStatusBadge.textContent = "Ritmo Monótono";
      dom.arcRecommendation.textContent = "4 slides seguidos similares detectados. Alterne com gráficos, perguntas ou cards!";
    } else {
      dom.arcStatusBadge.className = "arc-badge ok";
      dom.arcStatusBadge.textContent = "Dinâmico ✓";
      dom.arcRecommendation.textContent = "Alternância equilibrada de layouts e ritmos visuais.";
    }
  }

  // ==========================================================================
  // MODOS DE VISÃO: HEATMAP, SQUINT TEST & SMART TIDY
  // ==========================================================================
  function toggleSquintTest() {
    state.isSquint = !state.isSquint;
    dom.canvasViewport.classList.toggle("squint-mode", state.isSquint);
    dom.btnSquint.classList.toggle("active", state.isSquint);
    if (state.isSquint) {
      showToast("👁️ Teste da Última Fileira: simula visualização distante ou em tela pequena");
      playHaptic("snap");
    }
  }

  function toggleHeatmap() {
    state.isHeatmap = !state.isHeatmap;
    dom.btnHeatmap.classList.toggle("active", state.isHeatmap);
    renderHeatmap();
    if (state.isHeatmap) {
      showToast("🔥 Heatmap de Atenção: simulação de foco visual nos primeiros 2 segundos");
      playHaptic("pop");
    }
  }

  function renderHeatmap() {
    dom.heatmapOverlay.innerHTML = "";
    if (!state.isHeatmap) {
      dom.heatmapOverlay.classList.add("hidden");
      return;
    }
    dom.heatmapOverlay.classList.remove("hidden");

    const slideEl = dom.renderedSlideContainer.querySelector(".slide");
    if (!slideEl) return;

    const stageR = dom.slideStage.getBoundingClientRect();
    const scale = stageR.width / 1920;

    const targets = Array.from(slideEl.querySelectorAll(".ttl, .nm-val, .card, .figbox, .st-line, .q-text"));
    targets.forEach((el) => {
      const r = el.getBoundingClientRect();
      const lx = (r.left - stageR.left) / scale;
      const ly = (r.top - stageR.top) / scale;
      const lw = r.width / scale;
      const lh = r.height / scale;

      const spot = document.createElement("div");
      const isHigh = el.classList.contains("ttl") || el.classList.contains("nm-val");
      spot.className = `heat-spot ${isHigh ? "high" : "medium"}`;
      const size = Math.max(lw, lh) * 1.6;
      spot.style.width = `${size}px`;
      spot.style.height = `${size}px`;
      spot.style.left = `${lx + lw / 2 - size / 2}px`;
      spot.style.top = `${ly + lh / 2 - size / 2}px`;
      dom.heatmapOverlay.appendChild(spot);
    });
  }

  function smartTidy() {
    playHaptic("pop");
    dom.slideStage.style.transition = "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
    dom.slideStage.style.transform = `scale(${state.zoomScale * 1.02})`;
    setTimeout(() => {
      dom.slideStage.style.transform = `scale(${state.zoomScale})`;
    }, 180);
    triggerAutofix();
    showToast("✨ Arrumar a Casa: elementos alinhados e espaçamentos equilibrados!");
  }

  // ==========================================================================
  // PÍLULA DE ALQUIMIA FLUTUANTE
  // ==========================================================================
  function showAlchemyPill(targetEl, selText) {
    if (!targetEl) {
      dom.alchemyPill.classList.add("hidden");
      return;
    }

    const stageR = dom.slideStage.getBoundingClientRect();
    const scale = stageR.width / 1920;
    const r = targetEl.getBoundingClientRect();

    const lx = (r.left - stageR.left) / scale;
    const ly = (r.top - stageR.top) / scale;
    const lw = r.width / scale;

    dom.alchemyPill.style.left = `${Math.max(140, Math.min(1500, lx + lw / 2 - 140))}px`;
    dom.alchemyPill.style.top = `${Math.max(20, ly - 52)}px`;

    dom.alchemyActions.innerHTML = "";
    const text = selText || targetEl.innerText || "";
    const isNumber = /\b\d+(?:[\.,]\d+)?%?\b/.test(text);

    const actions = [];

    if (isNumber) {
      actions.push({
        label: "⚡ Virar Number",
        fn: () => {
          const match = text.match(/\d+(?:[\.,]\d+)?/);
          const slide = state.deck.slides[state.currentSlideIndex];
          slide.layout = "number";
          slide.value = match ? match[0] : 100;
          slide.suffix = text.includes("%") ? "%" : "";
          syncDeckToServer();
          renderCurrentSlide();
          playHaptic("pop");
          showToast("Convertido para layout Number!");
        }
      });
      actions.push({
        label: "📊 Donut Chart",
        fn: () => {
          const slide = state.deck.slides[state.currentSlideIndex];
          slide.layout = "number";
          slide.side = { chart: "donut", value: 75, center: "75%", w: 500, h: 500 };
          syncDeckToServer();
          renderCurrentSlide();
          playHaptic("pop");
          showToast("Donut Chart inserido!");
        }
      });
    }

    actions.push({
      label: "🃏 Virar Cards",
      fn: () => {
        const slide = state.deck.slides[state.currentSlideIndex];
        slide.layout = "cards";
        slide.items = [
          { title: "Ponto Principal", text: text.slice(0, 60), icon: "zap" },
          { title: "Desdobramento", text: "Impacto no dia a dia da operação.", icon: "target" },
          { title: "Métrica", text: "Resultados claros ao final do ciclo.", icon: "trending-up" },
        ];
        slide.cols = 3;
        syncDeckToServer();
        renderCurrentSlide();
        playHaptic("pop");
        showToast("Convertido em 3 Cards!");
      }
    });

    actions.push({
      label: "✦ Inserir Ícone",
      fn: () => {
        openIconPicker();
      }
    });

    actions.push({
      label: "✨ ==Destaque==",
      fn: () => {
        document.execCommand("insertText", false, `==${text}==`);
        playHaptic("snap");
      }
    });

    actions.push({
      label: "🪄 Auto-Ajustar",
      fn: () => {
        triggerAutofix();
      }
    });

    actions.forEach((a) => {
      const btn = document.createElement("button");
      btn.className = "btn-alchemy";
      btn.textContent = a.label;
      btn.onclick = (e) => {
        e.stopPropagation();
        a.fn();
        dom.alchemyPill.classList.add("hidden");
      };
      dom.alchemyActions.appendChild(btn);
    });

    dom.alchemyPill.classList.remove("hidden");
  }

  // ==========================================================================
  // GAVETA YAML LIVE LINK
  // ==========================================================================
  let yamlDebounce = null;

  function toggleYamlDrawer() {
    state.isYamlDrawerOpen = !state.isYamlDrawerOpen;
    dom.yamlDrawer.classList.toggle("hidden", !state.isYamlDrawerOpen);
    dom.btnYamlDrawer.classList.toggle("active", state.isYamlDrawerOpen);
    if (state.isYamlDrawerOpen) {
      updateYamlLiveEditor();
      dom.yamlLiveEditor.focus();
    }
  }

  async function updateYamlLiveEditor() {
    if (!state.isYamlDrawerOpen || !state.deck) return;
    try {
      const res = await fetch("/api/deck");
      const data = await res.json();
      dom.yamlLiveEditor.value = data.yaml;
    } catch {}
  }

  function onYamlEditorInput() {
    clearTimeout(yamlDebounce);
    yamlDebounce = setTimeout(async () => {
      try {
        const text = dom.yamlLiveEditor.value;
        const res = await fetch("/api/deck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml: text, saveToFile: false }),
        });
        const data = await res.json();
        if (data.ok) {
          state.deck = data.spec;
          renderCurrentSlide();
          renderThumbnails();
          updateStoryArc();
        }
      } catch {}
    }, 120);
  }

  // ==========================================================================
  // PALETA DE COMANDOS (SPOTLIGHT / RAYCAST)
  // ==========================================================================
  // Busca de comandos (Ctrl+K). "ic" = ícone Lucide; "cat" = aba da faixa onde o comando também mora.
  const PALETTE_COMMANDS = [
    { title: "Novo slide", cat: "Início", ic: "plus", fn: () => addNewSlide() },
    { title: "Duplicar slide", cat: "Início", ic: "copy", fn: () => duplicateCurrentSlide() },
    { title: "Excluir slide", cat: "Início", ic: "trash-2", fn: () => deleteCurrentSlide() },
    { title: "Trocar layout do slide", cat: "Início", ic: "layout-template", fn: () => { selectRibbonTab("inicio"); dom.btnLayoutGallery.click(); } },
    { title: "Tom escuro", cat: "Início", ic: "sun-moon", fn: () => changeTone("dark") },
    { title: "Tom claro", cat: "Início", ic: "sun-moon", fn: () => changeTone("light") },
    { title: "Tom de destaque", cat: "Início", ic: "sun-moon", fn: () => changeTone("accent") },
    { title: "Inserir ícone", cat: "Inserir", ic: "shapes", fn: () => openIconPicker() },
    { title: "Diagrama a partir de texto", cat: "Inserir", ic: "workflow", fn: () => openNapkinModal() },
    { title: "Trocar tema", cat: "Design", ic: "palette", fn: () => selectRibbonTab("design") },
    { title: "Nova apresentação com IA", cat: "IA", ic: "wand-sparkles", fn: () => openAiDeckModal() },
    { title: "Abrir assistente", cat: "IA", ic: "bot", fn: () => openPane("chat") },
    { title: "Corrigir layout do slide", cat: "Revisar", ic: "wand", fn: () => triggerAutofix() },
    { title: "Arrumar elementos", cat: "Revisar", ic: "layout-dashboard", fn: () => smartTidy() },
    { title: "Teste da última fileira", cat: "Revisar", ic: "scan-eye", fn: () => toggleSquintTest() },
    { title: "Mapa de atenção", cat: "Revisar", ic: "flame", fn: () => toggleHeatmap() },
    { title: "Ritmo narrativo", cat: "Revisar", ic: "activity", fn: () => { selectRibbonTab("revisar"); dom.btnStoryArc.click(); } },
    { title: "Painel Formatar", cat: "Exibir", ic: "sliders-horizontal", fn: () => openPane("props") },
    { title: "Mostrar/ocultar anotações", cat: "Exibir", ic: "sticky-note", fn: () => dom.btnNotesToggle.click() },
    { title: "Editar YAML do slide", cat: "Exibir", ic: "code-xml", fn: () => toggleYamlDrawer() },
    { title: "Interface escura", cat: "Exibir", ic: "sun-moon", fn: () => setAppTheme("dark") },
    { title: "Interface clara", cat: "Exibir", ic: "sun-moon", fn: () => setAppTheme("light") },
    { title: "Interface automática (segue o sistema)", cat: "Exibir", ic: "sun-moon", fn: () => setAppTheme("system") },
    { title: "Apresentar deste slide", cat: "Apresentar", ic: "play", fn: () => startPresentation() },
    { title: "Apresentar do início", cat: "Apresentar", ic: "play", fn: () => { state.currentSlideIndex = 0; startPresentation(); } },
    { title: "Apresentar com caneta", cat: "Apresentar", ic: "play", fn: () => { startPresentation(); setTimeout(() => togglePresDrawing(true, "pen"), 250); } },
    { title: "Abrir arquivo do computador", cat: "Arquivo", ic: "folder-open", fn: () => dom.fileInputYaml.click() },
    { title: "Abrir por caminho", cat: "Arquivo", ic: "folder-input", fn: () => dom.menuOpenServer.click() },
    { title: "Baixar YAML", cat: "Arquivo", ic: "download", fn: () => dom.exportYaml.click() },
    { title: "Baixar HTML", cat: "Arquivo", ic: "file-code", fn: () => dom.exportHtml.click() },
  ];

  function openSpotlight() {
    dom.commandPaletteModal.classList.remove("hidden");
    dom.paletteSearchInput.value = "";
    renderPaletteResults("");
    dom.paletteSearchInput.focus();
  }

  function closeSpotlight() {
    dom.commandPaletteModal.classList.add("hidden");
  }

  function renderPaletteResults(filter = "") {
    dom.paletteResultsList.innerHTML = "";
    const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(filter.trim());
    const matches = PALETTE_COMMANDS.filter((cmd) => norm(cmd.title).includes(q) || norm(cmd.cat).includes(q));

    matches.forEach((cmd, i) => {
      const item = document.createElement("div");
      item.className = `palette-item ${i === 0 ? "selected" : ""}`;
      item.innerHTML = `
        <div class="palette-item-left">
          <i class="ic palette-icon" data-ic="${cmd.ic}"></i>
          <span>${cmd.title}</span>
        </div>
        <span class="palette-item-category">${cmd.cat}</span>
      `;
      item.onclick = () => {
        closeSpotlight();
        cmd.fn();
      };
      dom.paletteResultsList.appendChild(item);
    });
    hydrateIcons(dom.paletteResultsList);
  }

  function setupSpotlightPalette() {
    dom.paletteSearchInput.addEventListener("input", () => {
      renderPaletteResults(dom.paletteSearchInput.value);
    });
    dom.paletteSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSpotlight();
      } else if (e.key === "Enter") {
        const first = dom.paletteResultsList.querySelector(".palette-item");
        if (first) {
          first.click();
        }
      }
    });
    dom.commandPaletteModal.addEventListener("click", (e) => {
      if (e.target === dom.commandPaletteModal) closeSpotlight();
    });
  }

  function changeTheme(themeName) {
    state.deck.theme = themeName;
    dom.themeSelect.value = themeName;
    syncDeckToServer();
    renderCurrentSlide();
    renderThumbnails();
    showToast(`Tema: ${state.themeMeta?.[themeName]?.label || themeName}`);
    playHaptic("snap");
  }

  // Galeria de temas da aba Design: cartão com as cores do tema; o <select> escondido segue valendo.
  function buildThemeGallery() {
    const names = state.themes.length ? state.themes : Object.keys(state.themeMeta || {});
    dom.themeSelect.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");
    dom.themeGallery.innerHTML = "";
    names.forEach((n) => {
      const m = state.themeMeta?.[n] || { label: n, paper: "#fff", ink: "#222", accent: "#0f6cbd" };
      const card = document.createElement("button");
      card.className = "theme-card";
      card.dataset.theme = n;
      card.title = m.desc ? `${m.label} — ${m.desc}` : m.label;
      card.style.background = m.paper;
      card.innerHTML = `<span class="tc-aa" style="color:${m.ink}">Aa</span><span class="tc-bar" style="background:${m.accent}"></span><span class="tc-name"></span>`;
      card.querySelector(".tc-name").textContent = m.label;
      card.onclick = () => changeTheme(n);
      dom.themeGallery.appendChild(card);
    });
    syncThemeGallery();
  }

  function syncThemeGallery() {
    const cur = state.deck?.theme || "sinal";
    dom.themeGallery.querySelectorAll(".theme-card").forEach((c) => c.classList.toggle("active", c.dataset.theme === cur));
  }

  function changeTone(toneName) {
    const slide = state.deck.slides[state.currentSlideIndex];
    if (slide) {
      slide.tone = toneName;
      dom.toneSelect.value = toneName;
      syncDeckToServer();
      renderCurrentSlide();
      showToast(`Tom alterado para "${toneName}"`);
      playHaptic("snap");
    }
  }

  // ==========================================================================
  // NAVEGAÇÃO DE MINIATURAS (BARRA LATERAL ESQUERDA)
  // ==========================================================================
  // Miniaturas = o próprio slide renderizado, em escala. Renderizadas sob demanda (quando aparecem
  // na lista), com cache por conteúdo; o slide aberto atualiza a sua a cada edição (putThumb).
  const thumbCache = new Map(); // chave (tema + índice + slide) -> html
  const thumbKey = (idx, slide) => `${state.deck?.theme || ""}|${idx}|${JSON.stringify(slide)}`;
  let thumbObserver = null;
  const thumbQueue = [];
  let thumbActive = 0;

  const plainTitle = (slide, idx) => String(slide.title || slide.text || slide.question || slide.quote || `Slide ${idx + 1}`)
    .replace(/==|\*\*|\^\^|~~|`/g, "").replace(/(^|\s)\*(\S[^*]*)\*/g, "$1$2").slice(0, 60);

  function renderThumbnails() {
    if (!state.deck || !state.deck.slides) return;
    thumbObserver?.disconnect();
    thumbQueue.length = 0;
    dom.thumbnailsList.innerHTML = "";
    dom.slideCount.textContent = state.deck.slides.length;

    state.deck.slides.forEach((slide, idx) => {
      const card = document.createElement("div");
      card.className = `thumb-card ${idx === state.currentSlideIndex ? "active" : ""}`;
      card.dataset.idx = idx;
      card.title = `${idx + 1}. ${plainTitle(slide, idx)} — ${layoutLabel(slide.layout)}`;

      const num = document.createElement("span");
      num.className = "thumb-num";
      num.textContent = idx + 1;
      card.appendChild(num);

      const screen = document.createElement("div");
      screen.className = "thumb-screen";
      const cached = thumbCache.get(thumbKey(idx, slide));
      if (cached) {
        screen.innerHTML = `<div class="thumb-render">${cached}</div>`;
      } else {
        const fb = document.createElement("div");
        fb.className = "thumb-fallback";
        fb.textContent = plainTitle(slide, idx);
        screen.appendChild(fb);
      }
      card.appendChild(screen);

      const actions = document.createElement("div");
      actions.className = "thumb-actions";
      [["arrow-up", "Mover para cima", -1], ["arrow-down", "Mover para baixo", 1]].forEach(([ic, title, dir]) => {
        const b = document.createElement("button");
        b.className = "btn-thumb-action";
        b.title = title;
        b.innerHTML = `<i class="ic" data-ic="${ic}"></i>`;
        b.onclick = (e) => { e.stopPropagation(); moveSlide(idx, dir); };
        actions.appendChild(b);
      });
      card.appendChild(actions);

      card.addEventListener("click", () => selectSlide(idx));
      dom.thumbnailsList.appendChild(card);
    });
    hydrateIcons(dom.thumbnailsList);

    thumbObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        thumbObserver.unobserve(e.target);
        const idx = +e.target.dataset.idx;
        const slide = state.deck.slides[idx];
        if (slide && !thumbCache.has(thumbKey(idx, slide))) thumbQueue.push(idx);
      }
      pumpThumbs();
    }, { root: dom.thumbnailsList, rootMargin: "300px 0px" });
    dom.thumbnailsList.querySelectorAll(".thumb-card").forEach((c) => thumbObserver.observe(c));
  }

  function pumpThumbs() {
    while (thumbActive < 3 && thumbQueue.length) {
      const idx = thumbQueue.shift();
      const slide = state.deck.slides[idx];
      if (!slide) continue;
      thumbActive++;
      fetch("/api/render-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide, index: idx, spec: state.deck }),
      })
        .then((r) => r.json())
        .then((data) => {
          ensureSlideStyles(data.baseCSS, data.themeCSS);
          putThumb(idx, slide, data.html);
        })
        .catch(() => {})
        .finally(() => { thumbActive--; pumpThumbs(); });
    }
  }

  function putThumb(idx, slide, html) {
    if (!html) return;
    thumbCache.set(thumbKey(idx, slide), html);
    const screen = dom.thumbnailsList.querySelector(`.thumb-card[data-idx="${idx}"] .thumb-screen`);
    if (!screen) return;
    screen.innerHTML = `<div class="thumb-render">${html}</div>`;
  }

  function markActiveThumb() {
    dom.thumbnailsList.querySelectorAll(".thumb-card").forEach((c) => {
      const on = +c.dataset.idx === state.currentSlideIndex;
      c.classList.toggle("active", on);
      if (on) c.scrollIntoView({ block: "nearest" });
    });
  }

  function selectSlide(idx) {
    if (idx < 0 || idx >= state.deck.slides.length) return;
    state.currentSlideIndex = idx;
    markActiveThumb();
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
      const chip = document.createElement("button");
      chip.className = "layout-chip";
      chip.textContent = layoutLabel(name);
      chip.title = name;
      chip.dataset.layout = name;
      chip.onclick = () => {
        closePopovers();
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
    showToast(`Layout: ${layoutLabel(layoutName)}`);
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
    createField("Chapéu (acima do título)", slide.kicker || "", (val) => {
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
      createField("Valor", slide.value ?? 100, (val) => {
        slide.value = val;
        renderCurrentSlide();
      });
      createField("Unidade", slide.suffix || "", (val) => {
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
      createField("Autor", slide.by || "", (val) => {
        slide.by = val;
        renderCurrentSlide();
      });
    }

    // Seção de Cards (com seletor de ícone em cada card)
    if (layout === "cards" && Array.isArray(slide.items)) {
      const cardsHeader = document.createElement("div");
      cardsHeader.className = "pane-section-head";
      cardsHeader.innerHTML = `
        <span>Cartões (${slide.items.length})</span>
        <button id="btn-add-card-with-icon" class="btn-small">Adicionar cartão</button>
      `;
      dom.slideFieldsForm.appendChild(cardsHeader);

      cardsHeader.querySelector("#btn-add-card-with-icon").onclick = (e) => {
        e.preventDefault();
        openIconPicker();
      };

      slide.items.forEach((item, idx) => {
        const itemBox = document.createElement("div");
        itemBox.className = "item-box";
        const iconName = typeof item === "object" ? item.icon || "star" : "star";
        const titleVal = typeof item === "object" ? item.title || "" : String(item);
        const textVal = typeof item === "object" ? item.text || "" : "";

        itemBox.innerHTML = `
          <div class="item-box-head">
            <button class="btn-small btn-change-card-icon" title="Trocar o ícone">Ícone: <b>${iconName}</b></button>
            <button class="icon-btn icon-btn-sm btn-del-card" title="Remover cartão"><i class="ic" data-ic="trash-2"></i></button>
          </div>
          <input type="text" class="form-control card-title-input" placeholder="Título" value="${escAttr(titleVal)}">
          <textarea class="form-control card-text-input" placeholder="Texto" rows="2">${escHtml(textVal)}</textarea>
        `;

        itemBox.querySelector(".btn-change-card-icon").onclick = (e) => {
          e.preventDefault();
          openIconPicker(idx);
        };
        itemBox.querySelector(".btn-del-card").onclick = (e) => {
          e.preventDefault();
          slide.items.splice(idx, 1);
          syncDeckToServer();
          renderCurrentSlide();
        };
        itemBox.querySelector(".card-title-input").onchange = (e) => {
          if (typeof slide.items[idx] !== "object") slide.items[idx] = { title: e.target.value };
          else slide.items[idx].title = e.target.value;
          syncDeckToServer();
          renderCurrentSlide();
        };
        itemBox.querySelector(".card-text-input").onchange = (e) => {
          if (typeof slide.items[idx] !== "object") slide.items[idx] = { text: e.target.value };
          else slide.items[idx].text = e.target.value;
          syncDeckToServer();
          renderCurrentSlide();
        };

        dom.slideFieldsForm.appendChild(itemBox);
      });
    }

    // Seção de Stats / KPIs
    if (layout === "stats") {
      if (!Array.isArray(slide.stats)) slide.stats = [];
      const statsHeader = document.createElement("div");
      statsHeader.className = "pane-section-head";
      statsHeader.innerHTML = `
        <span>Indicadores (${slide.stats.length})</span>
        <button id="btn-add-stat-item" class="btn-small">Adicionar</button>
      `;
      dom.slideFieldsForm.appendChild(statsHeader);

      statsHeader.querySelector("#btn-add-stat-item").onclick = (e) => {
        e.preventDefault();
        slide.stats.push({ value: "100%", label: "Nova Métrica", trend: "+10%", icon: "trending-up" });
        syncDeckToServer();
        renderCurrentSlide();
      };

      slide.stats.forEach((st, idx) => {
        const itemBox = document.createElement("div");
        itemBox.className = "item-box";
        itemBox.innerHTML = `
          <div class="item-box-head">
            <button class="btn-small btn-change-stat-icon" title="Trocar o ícone">Ícone: <b>${escHtml(st.icon || "star")}</b></button>
            <button class="icon-btn icon-btn-sm btn-del-stat" title="Remover"><i class="ic" data-ic="trash-2"></i></button>
          </div>
          <div class="item-box-row">
            <input type="text" class="form-control stat-val-input" placeholder="Valor (ex.: 98%)" value="${escAttr(st.value || "")}">
            <input type="text" class="form-control stat-trend-input" placeholder="Tendência (ex.: +14%)" value="${escAttr(st.trend || "")}">
          </div>
          <input type="text" class="form-control stat-lab-input" placeholder="Rótulo" value="${escAttr(st.label || "")}">
        `;
        itemBox.querySelector(".btn-change-stat-icon").onclick = (e) => {
          e.preventDefault();
          openIconPicker();
        };
        itemBox.querySelector(".btn-del-stat").onclick = (e) => {
          e.preventDefault();
          slide.stats.splice(idx, 1);
          syncDeckToServer();
          renderCurrentSlide();
        };
        itemBox.querySelector(".stat-val-input").onchange = (e) => {
          st.value = e.target.value;
          syncDeckToServer();
          renderCurrentSlide();
        };
        itemBox.querySelector(".stat-trend-input").onchange = (e) => {
          st.trend = e.target.value;
          syncDeckToServer();
          renderCurrentSlide();
        };
        itemBox.querySelector(".stat-lab-input").onchange = (e) => {
          st.label = e.target.value;
          syncDeckToServer();
          renderCurrentSlide();
        };
        dom.slideFieldsForm.appendChild(itemBox);
      });
    }

    // Seção de Steps / Processo
    if (layout === "steps") {
      if (!Array.isArray(slide.steps)) slide.steps = [];
      const stepsHeader = document.createElement("div");
      stepsHeader.className = "pane-section-head";
      stepsHeader.innerHTML = `
        <span>Etapas (${slide.steps.length})</span>
        <button id="btn-add-step-item" class="btn-small">Adicionar etapa</button>
      `;
      dom.slideFieldsForm.appendChild(stepsHeader);

      stepsHeader.querySelector("#btn-add-step-item").onclick = (e) => {
        e.preventDefault();
        slide.steps.push({ stepNum: slide.steps.length + 1, title: "Nova Etapa", text: "Descrição concisa do passo.", icon: "arrow-right" });
        syncDeckToServer();
        renderCurrentSlide();
      };

      slide.steps.forEach((st, idx) => {
        const itemBox = document.createElement("div");
        itemBox.className = "item-box";
        itemBox.innerHTML = `
          <div class="item-box-head">
            <span class="field-label">Etapa ${idx + 1}</span>
            <button class="icon-btn icon-btn-sm btn-del-step" title="Remover etapa"><i class="ic" data-ic="trash-2"></i></button>
          </div>
          <input type="text" class="form-control step-title-input" placeholder="Título" value="${escAttr(st.title || "")}">
          <input type="text" class="form-control step-text-input" placeholder="Descrição" value="${escAttr(st.text || "")}">
        `;
        itemBox.querySelector(".btn-del-step").onclick = (e) => {
          e.preventDefault();
          slide.steps.splice(idx, 1);
          syncDeckToServer();
          renderCurrentSlide();
        };
        itemBox.querySelector(".step-title-input").onchange = (e) => {
          st.title = e.target.value;
          syncDeckToServer();
          renderCurrentSlide();
        };
        itemBox.querySelector(".step-text-input").onchange = (e) => {
          st.text = e.target.value;
          syncDeckToServer();
          renderCurrentSlide();
        };
        dom.slideFieldsForm.appendChild(itemBox);
      });
    }

    // Seção de Figura Principal / Ícone Ilustrativo
    if (layout === "split" || layout === "section" || layout === "cover" || layout === "end" || slide.figure) {
      const figHeader = document.createElement("div");
      figHeader.className = "pane-section-head";
      const curIcon = slide.figure?.icon ? `Figura: ${slide.figure.icon}` : "Figura";
      figHeader.innerHTML = `
        <span>${curIcon}</span>
        <button id="btn-pick-fig-icon" class="btn-small">Escolher ícone</button>
      `;
      dom.slideFieldsForm.appendChild(figHeader);
      figHeader.querySelector("#btn-pick-fig-icon").onclick = (e) => {
        e.preventDefault();
        openIconPicker();
      };
    }

    // Seção de Canvas Livre
    if (layout === "canvas") {
      dom.canvasElementsSection.classList.remove("hidden");
      renderCanvasElementsList(slide);
    } else {
      dom.canvasElementsSection.classList.add("hidden");
    }
    hydrateIcons(dom.slideFieldsForm);
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
    const isMobile = window.innerWidth <= 900;
    const pad = isMobile ? 8 : 48;
    const availW = vp.clientWidth - pad;
    const availH = vp.clientHeight - pad;
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
  // MODO APRESENTAÇÃO FULLSCREEN (F5) & ANTI-BLOQUEIO CORPORATIVO
  // ==========================================================================
  let presWakeLock = null;
  let presKeepAwakeVideo = null;

  async function requestStudioWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        presWakeLock = await navigator.wakeLock.request("screen");
        presWakeLock.addEventListener("release", () => { presWakeLock = null; });
        return true;
      }
    } catch (e) {}

    try {
      if (!presKeepAwakeVideo) {
        presKeepAwakeVideo = document.createElement("video");
        presKeepAwakeVideo.setAttribute("playsinline", "");
        presKeepAwakeVideo.setAttribute("muted", "");
        presKeepAwakeVideo.setAttribute("loop", "");
        presKeepAwakeVideo.style.cssText = "position:fixed;width:1px;height:1px;top:-10px;left:-10px;opacity:0.01;pointer-events:none;";
        presKeepAwakeVideo.src = "data:video/webm;base64,GkXfo0AgQoaBAUL3gQDu4vqcgQdUaW5mb1ZAdYGAZW5jb2RpbmdlcHVibGlzaGVyX2FwcGxpY2F0aW9uY2hhcnNldAB4h5C5kIEYQoEB2QCQA4N1c2WDZkZlZmVmZmVmZmVmZmVmZmVmZmVmZmVmZmVmZg==";
        document.body.appendChild(presKeepAwakeVideo);
        presKeepAwakeVideo.play().catch(() => {});
      }
    } catch (e) {}
    return false;
  }

  function releaseStudioWakeLock() {
    if (presWakeLock) {
      presWakeLock.release().catch(() => {});
      presWakeLock = null;
    }
    if (presKeepAwakeVideo) {
      presKeepAwakeVideo.pause();
      presKeepAwakeVideo.remove();
      presKeepAwakeVideo = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!dom.presModal.classList.contains("hidden") && document.visibilityState === "visible") {
      requestStudioWakeLock();
    }
  });

  function startPresentation() {
    dom.presModal.classList.remove("hidden");
    document.documentElement.requestFullscreen?.().catch(() => {});
    requestStudioWakeLock();
    showToast("🛡️ Modo Apresentação: Anti-bloqueio de tela ativo");
    updatePresSlide();
  }

  function closePresentation() {
    dom.presModal.classList.add("hidden");
    togglePresDrawing(false);
    releaseStudioWakeLock();
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  // ==========================================================================
  // CANETA E ANOTAÇÕES AO VIVO NO MODO APRESENTAÇÃO DO STUDIO
  // ==========================================================================
  let isPresDrawing = false;
  let presDrawTool = "pen"; // "pen" | "highlighter"
  let presDrawColor = "#ef4444";
  let isPresPointerDown = false;
  let activePresStroke = null;
  const presSlideStrokes = {}; // { [slideIdx]: [strokes] }

  function togglePresDrawing(forceState, tool = "pen") {
    if (!dom.presDrawCanvas) return;
    isPresDrawing = typeof forceState === "boolean" ? forceState : !isPresDrawing;
    if (tool) presDrawTool = tool;
    document.body.classList.toggle("pres-drawing", isPresDrawing);
    if (dom.presDrawToolbar) dom.presDrawToolbar.style.display = isPresDrawing ? "flex" : "none";
    if (dom.presDrawFab) dom.presDrawFab.style.display = isPresDrawing ? "none" : "";
    if (isPresDrawing) {
      updatePresDrawUI();
      showToast(presDrawTool === "highlighter" ? "🖍️ Marca-texto ativo (D: caneta, C: limpar)" : "✏️ Caneta ativa (M: marca-texto, C: limpar)");
    }
  }

  function updatePresDrawUI() {
    dom.presBtnPen?.classList.toggle("active", presDrawTool === "pen");
    dom.presBtnHighlighter?.classList.toggle("active", presDrawTool === "highlighter");
    dom.presDrawToolbar?.querySelectorAll(".draw-color").forEach((b) => {
      b.classList.toggle("active", b.dataset.color === presDrawColor);
    });
  }

  function getPresDrawCoords(e) {
    const rect = dom.presDrawCanvas.getBoundingClientRect();
    const sx = 1920 / rect.width;
    const sy = 1080 / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  }

  function redrawPresSlideDrawings(slideIdx) {
    const ctx = dom.presDrawCanvas?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    const strokes = presSlideStrokes[slideIdx] || [];
    for (const s of strokes) {
      renderPresStroke(s, ctx);
    }
  }

  function renderPresStroke(s, ctx) {
    if (!ctx || !s.points || s.points.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.tool === "highlighter") {
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 28;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 5;
    }

    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      const p1 = s.points[i - 1];
      const p2 = s.points[i];
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      ctx.quadraticCurveTo(p1.x, p1.y, mx, my);
    }
    const last = s.points[s.points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }

  function undoPresDrawing() {
    const idx = state.currentSlideIndex;
    const strokes = presSlideStrokes[idx] || [];
    if (strokes.length > 0) {
      strokes.pop();
      redrawPresSlideDrawings(idx);
      showToast("Último traço desfeito");
    }
  }

  function clearPresDrawing() {
    const idx = state.currentSlideIndex;
    presSlideStrokes[idx] = [];
    redrawPresSlideDrawings(idx);
    showToast("Anotações do slide limpas");
  }

  function setupPresDrawingListeners() {
    if (!dom.presDrawCanvas) return;
    dom.presDrawCanvas.addEventListener("pointerdown", (e) => {
      if (!isPresDrawing) return;
      e.preventDefault();
      isPresPointerDown = true;
      const pt = getPresDrawCoords(e);
      activePresStroke = {
        tool: presDrawTool,
        color: presDrawColor,
        width: presDrawTool === "highlighter" ? 28 : 5,
        points: [pt, pt],
      };
      const idx = state.currentSlideIndex;
      if (!presSlideStrokes[idx]) presSlideStrokes[idx] = [];
      presSlideStrokes[idx].push(activePresStroke);
      const ctx = dom.presDrawCanvas.getContext("2d");
      renderPresStroke(activePresStroke, ctx);
    });

    dom.presDrawCanvas.addEventListener("pointermove", (e) => {
      if (!isPresPointerDown || !activePresStroke) return;
      e.preventDefault();
      const pt = getPresDrawCoords(e);
      activePresStroke.points.push(pt);
      redrawPresSlideDrawings(state.currentSlideIndex);
    });

    const endPresDraw = () => {
      isPresPointerDown = false;
      activePresStroke = null;
    };
    dom.presDrawCanvas.addEventListener("pointerup", endPresDraw);
    dom.presDrawCanvas.addEventListener("pointercancel", endPresDraw);

    dom.presDrawFab?.addEventListener("click", () => togglePresDrawing(true, "pen"));
    dom.presBtnPen?.addEventListener("click", () => { presDrawTool = "pen"; updatePresDrawUI(); });
    dom.presBtnHighlighter?.addEventListener("click", () => { presDrawTool = "highlighter"; updatePresDrawUI(); });
    dom.presBtnUndo?.addEventListener("click", undoPresDrawing);
    dom.presBtnClear?.addEventListener("click", clearPresDrawing);
    dom.presBtnCloseDraw?.addEventListener("click", () => togglePresDrawing(false));
    dom.presDrawToolbar?.querySelectorAll(".draw-color").forEach((b) => {
      b.addEventListener("click", () => {
        presDrawColor = b.dataset.color || "#ef4444";
        updatePresDrawUI();
      });
    });
  }

  // ==========================================================================
  // NAPKIN AI (TEXTO -> DIAGRAMA VISUAL)
  // ==========================================================================
  let lastNapkinResult = null;

  const NAPKIN_PRESETS = {
    steps: "Etapas do Funil de Conversão:\n1. Prospecção Ativa: Mapeamento de decisores em ICP qualificado\n2. Reunião Executiva: Demonstração e levantamento de necessidades\n3. Proposta & SLA: Envio dos termos comerciais personalizados\n4. Fechamento & Go-Live: Assinatura de contrato e início da operação",
    stats: "Resultados do Trimestre:\n- Crescimento de Receita: +142%\n- ARR Consolidado: R$ 8.4M\n- Churn Mensal: 0.6%\n- Satisfação (NPS): 91",
    compare: "Tradicional vs SagaDeck:\n- Slides manuais e demorados vs Geração instantânea por IA\n- Quebra formatação no PPT vs 100% nativo e editável no Office\n- Alucina layouts e textos vs Salvaguardas determinísticas e anti-spoiler",
    cards: "3 Pilares da Arquitetura:\n1. Segurança Zero-Trust: Criptografia ponta a ponta e logs de auditoria\n2. Performance Extrema: Carregamento instantâneo e renderização determinística\n3. Design System Atômico: Tokens de estilo e layouts balanceados",
  };

  function openNapkinModal() {
    dom.modalNapkin.classList.remove("hidden");
    dom.napkinPreviewBox.classList.add("hidden");
    dom.btnNapkinReplace.classList.add("hidden");
    dom.btnNapkinInsert.classList.add("hidden");
    if (!dom.napkinInputText.value.trim()) {
      dom.napkinInputText.value = NAPKIN_PRESETS.steps;
    }
    dom.napkinInputText.focus();
  }

  function closeNapkinModal() {
    dom.modalNapkin.classList.add("hidden");
  }

  async function runNapkinConversion() {
    const text = dom.napkinInputText.value.trim();
    if (!text) {
      showToast("Por favor, digite ou cole um texto para analisar.");
      return;
    }

    dom.btnRunNapkin.disabled = true;
    dom.btnRunNapkin.textContent = "⏳ Analisando padrão visual...";

    try {
      const res = await fetch("/api/napkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          theme: state.deck.theme || "sinal",
          tone: "dark",
          images: dom.aiImagesToggle.checked,
        }),
      });
      const data = await res.json();
      lastNapkinResult = data;

      dom.napkinDetectedBadge.textContent = data.detectedType.toUpperCase();
      dom.napkinRationale.textContent = (data.mode === "llm" ? "🤖 LLM · " : "⚙ regras · ") + data.rationale;
      if (data.notice) showToast(data.notice);
      dom.napkinYamlPreview.textContent = data.yaml;
      dom.napkinPreviewBox.classList.remove("hidden");
      dom.btnNapkinReplace.classList.remove("hidden");
      dom.btnNapkinInsert.classList.remove("hidden");

      if (!data.notice) showToast(`✨ Padrão visual detectado: ${data.detectedType.toUpperCase()}`);
    } catch (err) {
      showToast("Erro ao processar diagrama no servidor.");
    } finally {
      dom.btnRunNapkin.disabled = false;
      dom.btnRunNapkin.textContent = "✨ Analisar & Gerar Diagrama";
    }
  }

  function applyNapkinSlide(replaceCurrent = false) {
    if (!lastNapkinResult || !lastNapkinResult.slide) return;
    const newSlide = lastNapkinResult.slide;

    if (replaceCurrent) {
      state.deck.slides[state.currentSlideIndex] = newSlide;
      selectSlide(state.currentSlideIndex);
      showToast(`Slide ${state.currentSlideIndex + 1} substituído pelo diagrama ${lastNapkinResult.detectedType}!`);
    } else {
      state.deck.slides.splice(state.currentSlideIndex + 1, 0, newSlide);
      renderThumbnails();
      selectSlide(state.currentSlideIndex + 1);
      showToast(`Novo slide com diagrama ${lastNapkinResult.detectedType} inserido com sucesso!`);
    }

    syncDeckToServer();
    closeNapkinModal();
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
        if (dom.presSlideRender) {
          dom.presSlideRender.innerHTML = data.html;
        } else {
          dom.modalStage.innerHTML = data.html;
        }
        const scaleW = window.innerWidth / 1920;
        const scaleH = window.innerHeight / 1080;
        dom.modalStage.style.transform = `scale(${Math.min(scaleW, scaleH)})`;
        fitSlideText(dom.presSlideRender || dom.modalStage);
        redrawPresSlideDrawings(idx);
      });
  }

  // ==========================================================================
  // SINCRONIZAÇÃO E EVENT LISTENERS
  // ==========================================================================
  async function syncDeckToServer() {
    updateSaveStatus("saving");
    try {
      const res = await fetch("/api/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: state.deck }),
      });
      const data = await res.json().catch(() => ({}));
      if ("file" in data) state.file = data.file;
      updateSaveStatus(res.ok ? "saved" : "error");
    } catch (err) {
      console.warn("Erro ao sincronizar com servidor:", err);
      updateSaveStatus("error");
    }
  }

  // "Salvo" quando há um arquivo de verdade por trás; senão, avisa que as mudanças só vivem aqui.
  function updateSaveStatus(phase = "saved") {
    const el = dom.saveStatus;
    const name = state.file ? state.file.split(/[\\/]/).pop() : "";
    el.classList.remove("unsaved");
    if (phase === "saving") {
      el.textContent = "Salvando…";
    } else if (phase === "error") {
      el.textContent = "Erro ao salvar";
      el.classList.add("unsaved");
    } else if (state.file && !/[\\/]templates[\\/]/.test(state.file)) {
      el.textContent = "Salvo";
      el.title = `Salvo em ${state.file}`;
    } else {
      el.textContent = "Não salvo em arquivo";
      el.title = "Aberto pelo navegador ou exemplo. Use Arquivo › Baixar YAML, ou abra por caminho para salvar direto.";
      el.classList.add("unsaved");
    }
    if (name && phase === "saved" && !el.classList.contains("unsaved")) el.title = `Salvo em ${state.file}`;
  }

  // Palavras visíveis no slide — mesma conta do fiscal do build (wordCount em src/build.js):
  // ignora anotações, ids e configurações; tira a marcação inline.
  function visibleWordCount(slide) {
    const plain = (s) => String(s).replace(/==|\*\*|\^\^|~~|`|\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/(^|\s)\*(\S[^*]*)\*/g, "$1$2");
    const skip = new Set(["notes", "source", "id", "layout", "tone", "style", "class", "ratio", "deco", "time", "icon", "picto", "pose", "sign", "name", "theme", "fit", "anim", "align", "color", "bg", "image", "image_prompt", "alt", "url"]);
    const txt = [];
    const walk = (v, k) => {
      if (skip.has(k)) return;
      if (typeof v === "string") { if (!/^(\.|https?:|#?[0-9a-f]{6}$)/i.test(v)) txt.push(plain(v)); }
      else if (Array.isArray(v)) v.forEach((x) => walk(x));
      else if (v && typeof v === "object" && !v.svg && !v.chart && !v.html) for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
    };
    walk(slide);
    return txt.join(" ").split(/\s+/).filter((w) => w.length > 1).length;
  }

  function updateWordCount(slide) {
    const words = visibleWordCount(slide);
    const limit = slide.maxWords || state.deck?.maxWords || 40;
    dom.wordCountNum.textContent = words;
    dom.antiSleepIndicator.className = `status-item ${words > limit ? "anti-sleep-warn" : "anti-sleep-ok"}`;
    dom.antiSleepIndicator.title = words > limit
      ? `${words} palavras na tela (recomendado: até ${limit}). Mova detalhes para as anotações.`
      : `Palavras visíveis no slide (recomendado: até ${limit})`;
  }

  // Mesmo ajuste do runtime (fitAll em src/runtime/runtime.js): textos com data-fit encolhem até
  // caber na área útil. Sem isso, títulos longos transbordam no editor mas não no HTML final.
  function fitSlideText(root) {
    const run = () => root.querySelectorAll("[data-fit]").forEach((el) => {
      const safe = el.closest(".safe") || el.closest(".slide");
      if (!safe) return;
      if (!el.dataset.fs0) el.dataset.fs0 = parseFloat(getComputedStyle(el).fontSize);
      let fs = +el.dataset.fs0;
      el.style.fontSize = fs + "px";
      const over = () => {
        const sr = safe.getBoundingClientRect(), r = el.getBoundingClientRect();
        const sc = (el.closest(".slide") || safe).getBoundingClientRect().width / 1920 || 1;
        const tol = fs * 0.3;
        if (el.scrollHeight > el.clientHeight + tol || el.scrollWidth > el.clientWidth + 2 || (r.bottom - sr.bottom) / sc > tol) return true;
        for (const t of safe.querySelectorAll(".t")) {
          const tr = t.getBoundingClientRect();
          if ((tr.bottom - sr.bottom) / sc > 6 || (sr.top - tr.top) / sc > 6) return true;
        }
        return false;
      };
      let guard = 0;
      while (over() && fs > +el.dataset.fs0 * 0.3 && guard++ < 60) { fs *= 0.95; el.style.fontSize = fs.toFixed(1) + "px"; }
    });
    run();
    document.fonts?.ready.then(run); // a fonte do tema pode chegar depois e mudar as medidas
  }

  // ==========================================================================
  // LLM: STATUS E GERAÇÃO DE DECK
  // ==========================================================================
  async function refreshAIStatus(force = false) {
    try {
      const res = await fetch("/api/ai/status" + (force ? "?refresh=1" : ""));
      state.ai = await res.json();
    } catch {
      state.ai = { available: false };
    }
    const on = !!state.ai.available;
    dom.aiStatus.textContent = on ? "IA ligada" : "IA desligada";
    dom.aiStatus.title = on
      ? `LLM em ${state.ai.url} · texto: ${state.ai.textModel} · imagem: ${state.ai.imageModel}`
      : `Nenhum LLM em ${state.ai.url || "?"}. Rode "modelrelay serve" ou defina SAGADECK_LLM_URL. Clique para verificar de novo.`;
    dom.aiStatus.classList.toggle("on", on);
    dom.aiStatus.classList.toggle("off", !on);
    dom.aiImagesToggle.disabled = !on;
  }

  function openAiDeckModal() {
    dom.aiDeckTheme.innerHTML = '<option value="">IA escolhe</option>' +
      (state.themes || []).map((t) => `<option value="${t}">${t}</option>`).join("");
    dom.aiDeckStatus.textContent = state.ai.available ? "" : '⚠ Nenhum LLM disponível — rode "modelrelay serve" antes de gerar.';
    dom.modalAiDeck.classList.remove("hidden");
    dom.aiDeckBriefing.focus();
  }

  function closeAiDeckModal() {
    dom.modalAiDeck.classList.add("hidden");
  }

  async function runAiDeckGeneration() {
    const briefing = dom.aiDeckBriefing.value.trim();
    if (!briefing) {
      showToast("Descreva a apresentação que você quer.");
      return;
    }
    dom.btnRunAiDeck.disabled = true;
    const started = Date.now();
    let phase = `Enviando para ${state.ai.textModel || "o LLM"}…`;
    const show = () => {
      dom.aiDeckStatus.textContent = `⏳ ${phase} · ${Math.round((Date.now() - started) / 1000)}s`;
    };
    const tick = setInterval(show, 500);
    show();
    try {
      const data = await streamAI("/api/ai/generate", {
        briefing,
        theme: dom.aiDeckTheme.value,
        slides: Number(dom.aiDeckSlides.value) || undefined,
        images: dom.aiDeckImages.checked,
      }, (ev) => {
        if (ev.type !== "progress") return;
        phase = ev.chars ? `${ev.text} (${(ev.chars / 1000).toFixed(1)} mil caracteres)` : ev.text;
        show();
      });
      if (!data.spec) throw new Error(data.error || "resposta sem deck");
      state.deck = data.spec;
      state.file = data.file || null;
      updateSaveStatus();
      dom.deckTitle.value = state.deck.title || "Apresentação";
      if (state.deck.theme) dom.themeSelect.value = state.deck.theme;
      state.currentSlideIndex = 0;
      renderThumbnails();
      selectSlide(0);
      closeAiDeckModal();
      const failed = data.images?.failed?.length ? ` · ${data.images.failed.length} imagem(ns) falharam` : "";
      showToast(`✨ Deck gerado: ${state.deck.slides.length} slides, salvo em ${data.file}${failed}`);
    } catch (err) {
      dom.aiDeckStatus.textContent = "✗ " + err.message;
    } finally {
      clearInterval(tick);
      dom.btnRunAiDeck.disabled = false;
    }
  }

  function showToast(msg, duration = 3200) {
    dom.toast.textContent = msg;
    dom.toast.classList.remove("hidden");
    clearTimeout(dom.toast._timer);
    dom.toast._timer = setTimeout(() => {
      dom.toast.classList.add("hidden");
    }, duration);
  }

  // Chama um endpoint de IA com stream NDJSON; onEvent recebe {type:"progress"|"tick", …}. Devolve o resultado.
  async function streamAI(url, body, onEvent) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, stream: true }),
    });
    const type = res.headers.get("content-type") || "";
    if (!type.includes("ndjson")) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === "result") return ev.data;
        if (ev.type === "error") throw new Error(ev.error);
        onEvent?.(ev);
      }
    }
    throw new Error("A conexão com o servidor caiu antes da resposta.");
  }

  // Bolha de "trabalhando": etapa atual, segundos, caracteres recebidos e o começo da resposta.
  function createProgressBubble(initial) {
    const el = appendChatMessage("ai", "");
    el.classList.add("ai-working");
    const content = el.querySelector(".ai-content");
    content.innerHTML = `<div class="work-line"><span class="work-dots"><i></i><i></i><i></i></span><span class="work-text"></span><span class="work-time">0s</span></div><div class="work-preview"></div>`;
    const text = content.querySelector(".work-text");
    const time = content.querySelector(".work-time");
    const preview = content.querySelector(".work-preview");
    const started = Date.now();
    text.textContent = initial;
    const timer = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      time.textContent = `${s}s`;
    }, 500);
    return {
      el,
      update(ev) {
        if (ev.type !== "progress") return;
        text.textContent = ev.chars ? `${ev.text} (${(ev.chars / 1000).toFixed(1)} mil caracteres)` : ev.text;
        if (ev.preview) preview.textContent = ev.preview;
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      },
      done() { clearInterval(timer); el.remove(); },
      fail(msg) {
        clearInterval(timer);
        el.classList.remove("ai-working");
        content.innerHTML = "";
        const span = document.createElement("span");
        span.style.color = "var(--danger)";
        span.textContent = `Erro: ${msg}`;
        content.appendChild(span);
      },
    };
  }

  // ==========================================================================
  // ESTRUTURA DA TELA: faixa de opções, popovers, painel lateral, anotações
  // ==========================================================================
  function closePopovers(except) {
    document.querySelectorAll(".popover.open").forEach((p) => { if (p !== except) p.classList.remove("open"); });
    document.querySelectorAll(".split-button.show, .file-menu-wrap.show").forEach((m) => { if (!m.contains(except)) m.classList.remove("show"); });
  }

  function selectRibbonTab(name) {
    dom.ribbonTabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    dom.ribbonPanels.forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
    store.set("ribbonTab", name);
  }

  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

  // Painel lateral: um conteúdo de cada vez ("props" = Formatar, "chat" = Assistente)
  function openPane(which, { toggle = false } = {}) {
    const pane = dom.inspectorSidebar;
    const current = dom.tabPanelChat.classList.contains("active") ? "chat" : "props";
    const visible = isMobile() ? pane.classList.contains("mobile-open") : !pane.classList.contains("collapsed");
    if (toggle && visible && current === which) return closePane();
    const chat = which === "chat";
    dom.tabBtnChat.classList.toggle("active", chat);
    dom.tabBtnProps.classList.toggle("active", !chat);
    dom.tabPanelChat.classList.toggle("active", chat);
    dom.tabPanelProps.classList.toggle("active", !chat);
    pane.classList.remove("collapsed");
    if (isMobile()) {
      pane.classList.add("mobile-open");
      document.getElementById("slides-nav")?.classList.remove("mobile-open");
    }
    dom.btnToggleChat.classList.toggle("active", chat);
    dom.btnPaneProps.classList.toggle("active", !chat);
    store.set("pane", which);
    if (chat) setTimeout(() => dom.chatInput.focus(), 0);
    requestAnimationFrame(() => state.autoFit && updateCanvasScale());
  }

  function closePane() {
    dom.inspectorSidebar.classList.add("collapsed");
    dom.inspectorSidebar.classList.remove("mobile-open");
    dom.btnToggleChat.classList.remove("active");
    dom.btnPaneProps.classList.remove("active");
    store.set("pane", null);
    requestAnimationFrame(() => state.autoFit && updateCanvasScale());
  }

  function setNotesVisible(on) {
    dom.notesBar.classList.toggle("hidden", !on);
    dom.btnNotesToggle.classList.toggle("active", on);
    dom.btnNotesToggleStatus.classList.toggle("active", on);
    store.set("notes", on);
    requestAnimationFrame(() => state.autoFit && updateCanvasScale());
  }

  function setupShell() {
    // abas da faixa de opções
    dom.ribbonTabs.forEach((t) => t.addEventListener("click", () => selectRibbonTab(t.dataset.tab)));
    selectRibbonTab(store.get("ribbonTab", "inicio"));

    // popovers (layout, ritmo) e menus (Arquivo, Apresentar)
    // os popovers são "fixed" e ancorados no botão: a faixa rola na horizontal e cortaria um absolute
    const popover = (btn, pop, onOpen) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = !pop.classList.contains("open");
      closePopovers();
      if (!opening) return;
      pop.classList.add("open");
      onOpen?.();
      const r = btn.getBoundingClientRect();
      const w = pop.offsetWidth;
      pop.style.top = `${r.bottom + 4}px`;
      pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    });
    popover(dom.btnLayoutGallery, dom.layoutPopover);
    popover(dom.btnStoryArc, dom.storyArcPopover, updateStoryArc);
    [dom.layoutPopover, dom.storyArcPopover].forEach((p) => p.addEventListener("click", (e) => e.stopPropagation()));
    dom.btnPresentMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !dom.presentSplit.classList.contains("show");
      closePopovers();
      dom.presentSplit.classList.toggle("show", open);
    });
    dom.presentFromStart.onclick = () => { closePopovers(); state.currentSlideIndex = 0; startPresentation(); };
    dom.presentFromCurrent.onclick = () => { closePopovers(); startPresentation(); };
    document.addEventListener("click", () => closePopovers());

    // painel lateral
    dom.tabBtnProps.onclick = () => openPane("props");
    dom.tabBtnChat.onclick = () => openPane("chat");
    dom.btnToggleChat.onclick = () => openPane("chat", { toggle: true });
    dom.btnPaneProps.onclick = () => openPane("props", { toggle: true });
    dom.btnClosePane.onclick = closePane;
    const pane = store.get("pane", "props");
    if (pane && !isMobile()) openPane(pane); else closePane();

    // anotações
    dom.btnNotesToggle.onclick = () => setNotesVisible(dom.notesBar.classList.contains("hidden"));
    dom.btnNotesToggleStatus.onclick = dom.btnNotesToggle.onclick;
    setNotesVisible(store.get("notes", true));

    // barra de status
    dom.statusIssues.onclick = triggerAutofix;

    // tema da interface (claro/escuro/automático); o <head> já aplicou antes do primeiro desenho
    const themeSelect = document.getElementById("app-theme-select");
    themeSelect.value = store.get("appTheme", "system");
    themeSelect.addEventListener("change", () => setAppTheme(themeSelect.value));
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (store.get("appTheme", "system") === "system") setAppTheme("system");
    });
  }

  function setAppTheme(pref) {
    store.set("appTheme", pref);
    const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const sel = document.getElementById("app-theme-select");
    if (sel) sel.value = pref;
  }

  function setupEventListeners() {
    // Título do Deck
    dom.deckTitle.addEventListener("change", () => {
      state.deck.title = dom.deckTitle.value;
      syncDeckToServer();
      showToast("Título atualizado");
    });

    // Seletor de Tema (escondido; a galeria da aba Design chama changeTheme direto)
    dom.themeSelect.addEventListener("change", () => changeTheme(dom.themeSelect.value));

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

    // ==========================================================================
    // ABRIR ARQUIVO .YML / .YAML
    // ==========================================================================
    async function loadYamlFile(file) {
      if (!file) return;
      try {
        const text = await file.text();
        const res = await fetch("/api/deck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml: text, saveToFile: false }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Erro ao processar arquivo YAML");
        }
        state.deck = data.spec;
        state.file = null;
        updateSaveStatus();
        dom.deckTitle.value = state.deck.title || file.name.replace(/\.(ya?ml)$/i, "");
        if (state.deck.theme) dom.themeSelect.value = state.deck.theme;
        state.currentSlideIndex = 0;
        renderThumbnails();
        selectSlide(0);
        // O navegador não informa o caminho do arquivo: as edições ficam só aqui até exportar.
        showToast(`✓ "${file.name}" aberto (${state.deck.slides.length} slides). As edições não são salvas no arquivo: use Arquivo › YAML, ou abra por Arquivo › Abrir Caminho no Servidor para salvar direto.`, 9000);
      } catch (err) {
        showToast("Erro ao abrir YAML: " + err.message);
      }
    }

    async function loadServerPath(pathStr) {
      if (!pathStr) return;
      try {
        const res = await fetch("/api/open-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pathStr }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Erro ao carregar caminho no servidor");
        }
        state.deck = data.spec;
        state.file = data.file || null;
        updateSaveStatus();
        dom.deckTitle.value = state.deck.title || pathStr;
        if (state.deck.theme) dom.themeSelect.value = state.deck.theme;
        state.currentSlideIndex = 0;
        renderThumbnails();
        selectSlide(0);
        showToast(`✓ Deck carregado (${state.deck.slides.length} slides)!`);
      } catch (err) {
        showToast("Erro ao abrir arquivo: " + err.message);
      }
    }

    // Botão e Input de Arquivo
    const triggerFilePicker = () => dom.fileInputYaml.click();
    dom.btnOpenYaml.onclick = triggerFilePicker;
    dom.menuOpenLocal.onclick = (e) => {
      e.preventDefault();
      triggerFilePicker();
    };

    dom.fileInputYaml.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        loadYamlFile(file);
        dom.fileInputYaml.value = "";
      }
    });

    // Abrir arquivo a partir do caminho do servidor
    dom.menuOpenServer.onclick = (e) => {
      e.preventDefault();
      dom.modalOpenServer.classList.remove("hidden");
      dom.inputServerPath.focus();
    };
    dom.btnCloseOpenModal.onclick = () => dom.modalOpenServer.classList.add("hidden");
    dom.btnCancelOpenServer.onclick = () => dom.modalOpenServer.classList.add("hidden");
    dom.btnConfirmOpenServer.onclick = () => {
      const p = dom.inputServerPath.value.trim();
      if (p) {
        dom.modalOpenServer.classList.add("hidden");
        loadServerPath(p);
      }
    };
    dom.inputServerPath.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        dom.btnConfirmOpenServer.click();
      }
    });

    // Drag & Drop de arquivo .yaml / .yml em qualquer lugar da tela
    let dragCounter = 0;
    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      dom.dropOverlay.classList.remove("hidden");
    });
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dom.dropOverlay.classList.add("hidden");
      }
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      dragCounter = 0;
      dom.dropOverlay.classList.add("hidden");
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        const file = dt.files[0];
        if (/\.(ya?ml|txt)$/i.test(file.name)) {
          loadYamlFile(file);
        } else {
          showToast("Por favor, solte um arquivo .yaml ou .yml!");
        }
      }
    });

    // Menu Arquivo
    dom.btnExportMenu.onclick = (e) => {
      e.stopPropagation();
      const open = !dom.exportDropdown.parentElement.classList.contains("show");
      closePopovers();
      dom.exportDropdown.parentElement.classList.toggle("show", open);
      // fixed e ancorado: a faixa de abas rola na horizontal e cortaria o menu
      const r = dom.btnExportMenu.getBoundingClientRect();
      dom.exportDropdown.style.top = `${r.bottom + 2}px`;
      dom.exportDropdown.style.left = `${Math.max(8, r.left)}px`;
    };
    dom.exportDropdown.addEventListener("click", () => dom.exportDropdown.parentElement.classList.remove("show"));

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

    // ==========================================================================
    // RECURSOS FORA DA CAIXA & ICON PICKER EVENT LISTENERS
    // ==========================================================================
    // Seletor de Ícones (2.100+ Lucide / Public Domain)
    dom.btnInsertIcon.onclick = () => openIconPicker();
    dom.btnCloseIconPicker.onclick = closeIconPicker;

    let iconSearchDebounce = null;
    dom.iconSearchInput.addEventListener("input", () => {
      clearTimeout(iconSearchDebounce);
      iconSearchDebounce = setTimeout(() => {
        loadIcons(dom.iconSearchInput.value);
      }, 150);
    });

    document.querySelectorAll(".chip-cat").forEach((chip) => {
      chip.onclick = () => {
        document.querySelectorAll(".chip-cat").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        dom.iconSearchInput.value = chip.dataset.cat;
        loadIcons(chip.dataset.cat);
      };
    });

    dom.btnInsertIconCard.onclick = insertSelectedIconAsCard;
    dom.btnInsertIconFigure.onclick = insertSelectedIconAsFigure;
    dom.btnInsertIconCanvas.onclick = insertSelectedIconAsCanvas;

    // Recursos UX Inovadores
    dom.btnSquint.onclick = toggleSquintTest;
    dom.btnHeatmap.onclick = toggleHeatmap;
    dom.btnSmartTidy.onclick = smartTidy;
    dom.btnYamlDrawer.onclick = toggleYamlDrawer;
    dom.btnCloseYamlDrawer.onclick = toggleYamlDrawer;
    dom.yamlLiveEditor.addEventListener("input", onYamlEditorInput);
    dom.btnSpotlight.onclick = openSpotlight;
    setupSpotlightPalette();

    // Deck com IA + status do LLM
    dom.btnAiDeck.onclick = openAiDeckModal;
    dom.btnCloseAiDeck.onclick = closeAiDeckModal;
    dom.btnCancelAiDeck.onclick = closeAiDeckModal;
    dom.btnRunAiDeck.onclick = runAiDeckGeneration;
    dom.aiStatus.onclick = () => refreshAIStatus(true);

    // Napkin AI (Texto -> Diagrama Visual)
    dom.btnNapkin.onclick = openNapkinModal;
    dom.btnCloseNapkin.onclick = closeNapkinModal;
    dom.btnRunNapkin.onclick = runNapkinConversion;
    dom.btnNapkinReplace.onclick = () => applyNapkinSlide(true);
    dom.btnNapkinInsert.onclick = () => applyNapkinSlide(false);
    document.querySelectorAll(".btn-preset-napkin").forEach((btn) => {
      btn.onclick = () => {
        const ex = btn.dataset.example;
        if (NAPKIN_PRESETS[ex]) {
          dom.napkinInputText.value = NAPKIN_PRESETS[ex];
          runNapkinConversion();
        }
      };
    });

    // Anotações e Caneta no Modo Apresentação
    setupPresDrawingListeners();

    // Navegação Mobile (Smartphones)
    dom.mobileNavBtnSlides?.addEventListener("click", () => {
      document.getElementById("slides-nav")?.classList.toggle("mobile-open");
      document.getElementById("inspector-sidebar")?.classList.remove("mobile-open");
    });
    dom.mobileNavBtnNapkin?.addEventListener("click", () => {
      openNapkinModal();
    });
    dom.mobileNavBtnPresent?.addEventListener("click", () => {
      startPresentation();
    });
    dom.mobileNavBtnEditor?.addEventListener("click", () => openPane("props", { toggle: true }));
    dom.mobileNavBtnChat?.addEventListener("click", () => openPane("chat", { toggle: true }));

    // Fechar gavetas mobile se tocar no viewport central
    dom.canvasViewport.addEventListener("touchstart", () => {
      document.getElementById("slides-nav")?.classList.remove("mobile-open");
      document.getElementById("inspector-sidebar")?.classList.remove("mobile-open");
    }, { passive: true });

    // Touch Swipe (arrastar com o dedo para navegar pelos slides)
    function attachSwipe(el, onNext, onPrev) {
      if (!el) return;
      let sx = null, sy = null;
      el.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
          sx = e.touches[0].clientX;
          sy = e.touches[0].clientY;
        }
      }, { passive: true });
      el.addEventListener("touchend", (e) => {
        if (sx === null || sy === null || e.changedTouches.length === 0) return;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) onNext();
          else onPrev();
        }
        sx = null;
        sy = null;
      }, { passive: true });
    }

    attachSwipe(
      dom.canvasViewport,
      () => {
        if (state.currentSlideIndex < state.deck.slides.length - 1) {
          selectSlide(state.currentSlideIndex + 1);
        }
      },
      () => {
        if (state.currentSlideIndex > 0) {
          selectSlide(state.currentSlideIndex - 1);
        }
      }
    );

    attachSwipe(
      dom.presModal,
      () => dom.presNext.click(),
      () => dom.presPrev.click()
    );

    const syncAudioButton = () => {
      const ic = dom.btnAudioToggle.querySelector(".ic");
      ic.dataset.ic = state.soundEnabled ? "volume-2" : "volume-x";
      delete ic.dataset.done;
      hydrateIcons(dom.btnAudioToggle);
      dom.btnAudioToggle.classList.toggle("active", state.soundEnabled);
    };
    state.soundEnabled = store.get("sound", true);
    syncAudioButton();
    dom.btnAudioToggle.onclick = () => {
      state.soundEnabled = !state.soundEnabled;
      store.set("sound", state.soundEnabled);
      syncAudioButton();
      showToast(state.soundEnabled ? "Sons ligados" : "Sons desligados");
      if (state.soundEnabled) playHaptic("snap");
    };

    // Oculta Alchemy pill se clicar fora
    dom.canvasViewport.addEventListener("mousedown", (e) => {
      if (!e.target.closest("#alchemy-pill") && !e.target.closest("[contenteditable]")) {
        dom.alchemyPill.classList.add("hidden");
      }
    });

    // Atalhos de Teclado (F5, Setas, Esc, Cmd+K)
    window.addEventListener("keydown", (e) => {
      // Cmd+K / Ctrl+K abre a Spotlight Command Palette em qualquer lugar
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSpotlight();
        return;
      }

      if (e.key === "Escape") {
        if (document.querySelector(".popover.open, .split-button.show, .file-menu-wrap.show")) {
          closePopovers();
          return;
        }
        for (const m of [dom.modalAiDeck, dom.modalOpenServer]) {
          if (!m.classList.contains("hidden")) { m.classList.add("hidden"); return; }
        }
        if (!dom.modalNapkin.classList.contains("hidden")) {
          closeNapkinModal();
          return;
        }
        if (!dom.modalIconPicker.classList.contains("hidden")) {
          closeIconPicker();
          return;
        }
        if (!dom.commandPaletteModal.classList.contains("hidden")) {
          closeSpotlight();
          return;
        }
        if (!dom.yamlDrawer.classList.contains("hidden")) {
          toggleYamlDrawer();
          return;
        }
        if (isPresDrawing) {
          togglePresDrawing(false);
          return;
        }
        closePresentation();
        return;
      }

      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

      if (!dom.presModal.classList.contains("hidden")) {
        if ((e.key === "d" || e.key === "D")) {
          e.preventDefault();
          togglePresDrawing(isPresDrawing && presDrawTool === "pen" ? false : true, "pen");
          return;
        }
        if ((e.key === "m" || e.key === "M")) {
          e.preventDefault();
          togglePresDrawing(isPresDrawing && presDrawTool === "highlighter" ? false : true, "highlighter");
          return;
        }
        if (isPresDrawing && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          undoPresDrawing();
          return;
        }
        if (isPresDrawing && (e.key === "c" || e.key === "C" || e.key === "e" || e.key === "E")) {
          e.preventDefault();
          clearPresDrawing();
          return;
        }
      }

      if (e.key === "F5") {
        e.preventDefault();
        startPresentation();
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
