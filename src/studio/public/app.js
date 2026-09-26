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

  // ordem da galeria: abertura, frase, números, listas/estruturas, dados, interação, mídia, livres, fim
  const LAYOUT_NAMES = [
    "cover", "section", "statement", "headline", "quote", "number", "split", "full",
    "cards", "bento", "stats", "steps", "funnel", "pyramid", "list", "agenda", "timeline",
    "chart", "compare", "matrix", "question", "poll", "image", "code", "codewalk", "spotlight", "video",
    "blocks", "canvas", "references", "end",
  ];

  // Nome que a pessoa vê para cada layout (o YAML continua com o nome em inglês).
  const LAYOUT_LABELS = {
    cover: "Capa", section: "Seção", statement: "Frase de impacto", quote: "Citação", number: "Número grande",
    split: "Texto e figura", cards: "Cartões", stats: "Indicadores", steps: "Etapas", list: "Lista",
    timeline: "Linha do tempo", chart: "Gráfico", compare: "Comparação", matrix: "Matriz 2×2",
    question: "Pergunta", poll: "Enquete", image: "Imagem", code: "Código", video: "Vídeo",
    codewalk: "Código guiado", spotlight: "Foco guiado",
    blocks: "Livre (blocos)", canvas: "Livre (posições)", end: "Encerramento", references: "Referências",
    headline: "Manchete", full: "Página inteira", bento: "Mosaico", funnel: "Funil", pyramid: "Pirâmide", agenda: "Agenda",
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
    exportSagadeck: document.getElementById("export-sagadeck"),
    exportHtml: document.getElementById("export-html"),
    actionSaveYaml: document.getElementById("action-save-yaml"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatSend: document.getElementById("chat-send"),
    chatMessages: document.getElementById("chat-messages"),
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
    formatBar: document.getElementById("format-bar"),
    yamlDrawer: document.getElementById("yaml-drawer"),
    yamlLiveEditor: document.getElementById("yaml-live-editor"),
    btnCloseYamlDrawer: document.getElementById("btn-close-yaml-drawer"),
    yamlStatus: document.getElementById("yaml-status"),
    yamlHl: document.getElementById("yaml-hl"),
    yamlModeSlide: document.getElementById("yaml-mode-slide"),
    yamlModeDeck: document.getElementById("yaml-mode-deck"),
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
    presFrame: document.getElementById("pres-frame"),
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
    stepControl: document.getElementById("step-control"),
    statusFit: document.getElementById("status-fit"),
    autoBanner: document.getElementById("auto-banner"),
    chatAttachments: document.getElementById("chat-attachments"),
    chatAttach: document.getElementById("chat-attach"),
    chatAttachInput: document.getElementById("chat-attach-input"),
    chatEmpty: document.getElementById("chat-empty"),
  };

  // Inicialização
  async function init() {
    hydrateIcons();
    setupEventListeners();
    setupShell();
    setupCreativeTools();
    buildLayoutPicker();
    // vindo da biblioteca: /editor?deck=<id>[&present=1]
    const params = new URLSearchParams(location.search);
    if (params.get("deck")) {
      try {
        const r = await fetch("api/library/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: params.get("deck") }) });
        if (!r.ok) showToast("Não deu para abrir: " + ((await r.json().catch(() => ({}))).error || r.status), 6000);
      } catch {}
    }
    await loadDeck();
    if (params.get("present") === "1") {
      params.delete("present");
      history.replaceState(null, "", `${location.pathname}?${params}`);
      startPresentation();
    }
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
      const res = await fetch("api/deck");
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
  let renderSeq = 0;
  async function renderCurrentSlide() {
    if (!state.deck || !state.deck.slides || state.deck.slides.length === 0) return;
    const seq = ++renderSeq;
    const rebuildForm = !state.skipFormRebuild;
    state.skipFormRebuild = false;
    const idx = state.currentSlideIndex;
    const slide = state.deck.slides[idx];
    if (!slide) return;

    dom.currentSlideLabel.textContent = `Slide ${idx + 1} de ${state.deck.slides.length}`;
    dom.currentLayoutBadge.textContent = layoutLabel(slide.layout);
    dom.toneSelect.value = slide.tone || "light";
    dom.decoSelect.value = slide.deco || "none";
    updateVariantButtons();
    dom.slideNotesInput.value = slide.notes || "";
    dom.slideTimeInput.value = slide.time || 1;
    syncThemeGallery();
    document.getElementById("motion-select").value = state.deck.motion || "subtle";

    try {
      const res = await fetch("api/render-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide, index: idx, spec: state.deck }),
      });
      const data = await res.json();
      if (seq !== renderSeq) return; // já pediram um render mais novo

      // Injetar estilos do Sagadeck se ainda não existirem
      ensureSlideStyles(data.baseCSS, data.themeCSS);

      // Renderizar HTML no palco
      dom.renderedSlideContainer.innerHTML = data.html;
      applyEditorStep(idx);
      fitSlideText(dom.renderedSlideContainer);
      // a miniatura deste slide usa o mesmo HTML (acompanha cada edição)
      putThumb(idx, slide, data.html);

      // Habilitar edição WYSIWYG inline
      enableInlineEditing();

      // Atualizar contagem de palavras anti-sono
      updateWordCount(slide);

      // Atualizar painel Formatar (a não ser que a mudança tenha vindo dele)
      if (rebuildForm) updatePropertiesPanel(slide);

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
  // EDIÇÃO DIRETA NO SLIDE (como no Word/PowerPoint)
  // Qualquer texto do slide é editável: descobrimos de qual campo do YAML ele veio (comparando o
  // texto puro) e, ao salvar, convertemos o HTML editado de volta para a marcação do sagadeck
  // (**negrito**, *itálico*, ==destaque==, ^^cor^^, ~~riscado~~), sem perder a formatação.
  // ==========================================================================
  const plainOf = (v) => String(v ?? "")
    .replace(/\*\*|==|\^\^|~~|`/g, "").replace(/(^|[^*])\*([^*]+)\*/g, "$1$2").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ").trim();

  // [objeto, chave] do texto do YAML cujo texto puro é `text` (ignora anotações e campos internos)
  function findTextPath(slide, text) {
    const want = text.replace(/\s+/g, " ").trim();
    if (!want) return null;
    let found = null;
    const walk = (o) => {
      if (found || !o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        if (k === "notes" || k === "auto" || k.startsWith("_")) continue;
        if (typeof v === "string") { if (plainOf(v) === want) { found = [o, k]; return; } }
        else walk(v);
      }
    };
    walk(slide);
    return found;
  }

  function domToMarkup(node) {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, " "); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { out += "\n"; return; }
      const inner = domToMarkup(n);
      if (!inner) return;
      if (tag === "b" || tag === "strong") out += `**${inner}**`;
      else if (tag === "i" || tag === "em") out += `*${inner}*`;
      else if (tag === "mark") out += `==${inner}==`;
      else if (tag === "s" || tag === "strike" || tag === "del") out += `~~${inner}~~`;
      else if (tag === "code") out += "`" + inner + "`";
      else if (tag === "a") out += `[${inner}](${n.getAttribute("href")})`;
      else if (tag === "span" && n.classList.contains("em")) out += `^^${inner}^^`;
      else if (tag === "div" || tag === "p") out += (out && !out.endsWith("\n") ? "\n" : "") + inner;
      else out += inner;
    });
    return out;
  }

  let editingEl = null;
  let inlineSaveTimer = null;

  function enableInlineEditing() {
    const container = dom.renderedSlideContainer;
    const slide = state.deck.slides[state.currentSlideIndex];
    if (!slide) return;
    container.querySelectorAll(".t").forEach((el) => {
      if (el.closest(".fig, svg")) return;
      const path = findTextPath(slide, el.innerText);
      if (!path) { el.title = "Este texto é gerado pelo layout — edite no painel Formatar"; return; }
      el._path = path;
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      el.addEventListener("focus", () => { editingEl = el; showFormatBar(el); });
      el.addEventListener("input", () => {
        clearTimeout(inlineSaveTimer);
        inlineSaveTimer = setTimeout(() => saveInlineChange(el), 250);
        inspectGeometry();
      });
      el.addEventListener("mouseup", () => {
        const sel = window.getSelection();
        showAlchemyPill(el, sel ? sel.toString().trim() : "");
      });
      el.addEventListener("keydown", (e) => { if (e.key === "Escape") el.blur(); });
      el.addEventListener("blur", () => {
        clearTimeout(inlineSaveTimer);
        saveInlineChange(el);
        // clique na barra de formatação não conta como sair do texto
        setTimeout(() => {
          if (document.activeElement === el || dom.formatBar.contains(document.activeElement)) return;
          editingEl = null;
          hideFormatBar();
          syncDeckToServer();
          renderCurrentSlide(); // redesenha (miniatura e painel acompanham)
        }, 0);
      });
    });
  }

  // grava o texto editado de volta no campo do YAML, com a marcação
  function saveInlineChange(el) {
    const slide = state.deck.slides[state.currentSlideIndex];
    if (!slide || !el._path) return;
    const [obj, key] = el._path;
    const markup = domToMarkup(el).replace(/\*\*\*\*|====|\^\^\^\^|~~~~/g, "").trim();
    if (obj[key] === markup) return;
    obj[key] = markup;
    updateWordCount(slide);
  }

  // ---- barra de formatação flutuante ----
  function showFormatBar(el) {
    const r = el.getBoundingClientRect();
    const bar = dom.formatBar;
    bar.classList.remove("hidden");
    const top = r.top - bar.offsetHeight - 8;
    bar.style.top = `${Math.max(8, top < 60 ? r.bottom + 8 : top)}px`;
    bar.style.left = `${Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, r.left))}px`;
  }
  function hideFormatBar() {
    dom.formatBar.classList.add("hidden");
    dom.alchemyPill.classList.add("hidden");
  }

  function selectionIn(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    return el.contains(range.commonAncestorContainer) ? range : null;
  }

  // envolve a seleção numa tag (mark / span.em); se ela já estiver dentro de uma, desfaz
  function toggleWrap(el, tag, cls) {
    const range = selectionIn(el);
    if (!range || range.collapsed) { showToast("Selecione o trecho primeiro."); return; }
    let anc = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const existing = anc.closest(cls ? `${tag}.${cls}` : tag);
    if (existing && el.contains(existing)) {
      existing.replaceWith(...existing.childNodes);
    } else {
      const w = document.createElement(tag);
      if (cls) w.className = cls;
      if (tag === "mark") w.classList.add("play");
      w.appendChild(range.extractContents());
      range.insertNode(w);
    }
  }

  function formatCommand(cmd) {
    const el = editingEl;
    if (!el) return;
    // sempre envolvendo em tag (execCommand("bold") olha o estilo calculado: num título que já é
    // negrito pelo CSS ele TIRA o negrito em vez de marcar **…**)
    if (cmd === "bold") toggleWrap(el, "b");
    else if (cmd === "italic") toggleWrap(el, "i");
    else if (cmd === "strike") toggleWrap(el, "s");
    else if (cmd === "mark") toggleWrap(el, "mark");
    else if (cmd === "em") toggleWrap(el, "span", "em");
    else if (cmd === "clear") {
      const range = selectionIn(el);
      if (range && !range.collapsed) {
        const t = range.toString();
        range.deleteContents();
        range.insertNode(document.createTextNode(t));
      } else {
        el.textContent = el.innerText; // sem seleção: limpa o texto todo
      }
    }
    saveInlineChange(el);
    el.focus();
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
      if (el.closest(".foot, .headbar")) continue;
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
      const res = await fetch("api/autofix", {
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
  // --------------------------------------------------------------------------
  // CONVERSA (brainstorm) sem escolher modo: o servidor percebe se é pedido de mudança ou conversa
  // (src/ai/intent.js). Resposta de conversa não mexe no deck, traz opções clicáveis e libera
  // "Transformar em slides".
  // --------------------------------------------------------------------------
  function updateBrainstormApply() {
    const recent = state.chatHistory.slice(-4);
    document.getElementById("btn-brainstorm-apply").classList.toggle("hidden", !recent.some((m) => m.talk));
  }

  function renderChatOptions(msg, options) {
    if (!options?.length) return;
    const row = document.createElement("div");
    row.className = "bs-options";
    for (const o of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bs-option";
      b.textContent = o;
      b.onclick = () => {
        row.querySelectorAll("button").forEach((x) => (x.disabled = true));
        dom.chatInput.value = o;
        handleChatSubmit();
      };
      row.append(b);
    }
    msg.querySelector(".ai-content").append(row);
  }

  // atalho depois de uma conversa: autoriza a IA a aplicar o que foi combinado
  function applyBrainstorm() {
    dom.chatInput.value = "Pode fazer: aplique nos slides o que combinamos nesta conversa.";
    handleChatSubmit();
  }

  // Versões de um slide lado a lado; nada muda até escolher uma
  async function renderVariants(msg, variants) {
    const box = document.createElement("div");
    box.className = "variants";
    msg.querySelector(".ai-content").append(box);
    for (const [k, v] of variants.options.entries()) {
      const card = document.createElement("div");
      card.className = "variant";
      card.innerHTML = `<div class="variant-prev"><div class="thumb-render"></div></div><div class="variant-foot"><b></b><button type="button" class="btn btn-secondary btn-sm">Usar esta</button></div>`;
      card.querySelector("b").textContent = v.label;
      const btn = card.querySelector("button");
      btn.dataset.variant = k;
      btn.onclick = () => {
        const s = JSON.parse(JSON.stringify(v.slide));
        if (variants.insert) state.deck.slides.splice(variants.index, 0, s);
        else state.deck.slides[variants.index] = s;
        state.currentSlideIndex = variants.index;
        box.querySelectorAll(".variant").forEach((c) => c.classList.toggle("chosen", c === card));
        box.querySelectorAll("button").forEach((b) => (b.disabled = true));
        btn.textContent = "Escolhida";
        state.chatHistory.push({ role: "user", text: `Escolhi a versão "${v.label}" (já apliquei no slide ${variants.index + 1}).` });
        syncDeckToServer();
        renderThumbnails();
        renderCurrentSlide();
        showToast(`Versão "${v.label}" aplicada no slide ${variants.index + 1}`, 2200);
      };
      box.append(card);
      try {
        const r = await (await fetch("api/render-slide", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide: v.slide, index: variants.index }) })).json();
        const prev = card.querySelector(".variant-prev");
        prev.querySelector(".thumb-render").innerHTML = r.html;
        requestAnimationFrame(() => fitRendered(prev));
        prev.style.setProperty("--thumb-scale", String(prev.clientWidth / 1920));
      } catch {}
    }
    box.scrollIntoView({ block: "nearest" });
  }

  async function handleChatSubmit(e) {
    if (e) e.preventDefault();
    const message = dom.chatInput.value.trim();
    if (!message) return;

    // Adicionar bolha do usuário (com as imagens anexadas)
    const bubble = appendChatMessage("user", message);
    if (state.chatAttachments.length) {
      const row = document.createElement("div");
      row.className = "msg-atts";
      state.chatAttachments.forEach((u) => { const img = document.createElement("img"); img.src = u; row.appendChild(img); });
      bubble.querySelector(".user-content")?.appendChild(row);
    }
    dom.chatInput.value = "";
    autoGrowChat();

    // a IA sempre sabe qual slide está na tela; outros slides (ou o deck todo) a pessoa diz no pedido
    const targetIdx = state.currentSlideIndex;

    // Indicador de progresso ao vivo (etapa, segundos, texto chegando)
    const work = createProgressBubble(state.ai.available
      ? `Enviando para o LLM (${state.ai.textModel})…`
      : "Analisando estrutura, geometria dos slides e aplicando correções…");
    dom.chatSend.disabled = true;
    dom.chatInput.disabled = true;
    const history = state.chatHistory.slice(-16);
    state.chatHistory.push({ role: "user", text: message });
    const attachments = state.chatAttachments.slice();
    clearChatAttachments();

    try {
      const data = await streamAI("api/ai/chat", {
        message,
        targetSlide: targetIdx,
        spec: state.deck,
        issues: state.issues,
        history,
        attachments,
        renderNotes: state.renderNotes || [],
      }, (ev) => work.update(ev));
      if (!data.spec) throw new Error(data.error || "resposta sem deck");
      if (data.variants) {
        state.chatHistory.push({ role: "assistant", text: `${data.reply}\n(versões: ${data.variants.options.map((o) => o.label).join(" | ")})`, talk: true });
        work.done();
        const msg = appendChatMessage("ai", data.reply, data.actions);
        await renderVariants(msg, data.variants);
        updateBrainstormApply();
        return;
      }
      if (data.talk) {
        // conversa: nada muda nos slides
        state.chatHistory.push({ role: "assistant", text: data.reply + (data.options?.length ? `\n(opções: ${data.options.join(" | ")})` : ""), talk: true });
        work.done();
        const msg = appendChatMessage("ai", data.reply, data.actions);
        msg.classList.add("bs");
        const tag = document.createElement("div");
        tag.className = "bs-tag";
        tag.textContent = "💬 Conversa — nada mudou nos slides";
        msg.querySelector(".ai-content").prepend(tag);
        renderChatOptions(msg, data.options);
        updateBrainstormApply();
        return;
      }
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
      updateBrainstormApply();
    } catch (err) {
      work.fail(err.message);
    } finally {
      dom.chatSend.disabled = false;
      dom.chatInput.disabled = false;
      dom.chatInput.focus();
    }
  }

  // ---- anexos do chat (colar/arrastar/escolher imagem) ----
  state.chatAttachments = [];
  function clearChatAttachments() {
    state.chatAttachments = [];
    renderChatAttachments();
  }
  function renderChatAttachments() {
    const box = dom.chatAttachments;
    box.hidden = !state.chatAttachments.length;
    box.innerHTML = "";
    state.chatAttachments.forEach((url, i) => {
      const it = document.createElement("div");
      it.className = "chat-att";
      it.innerHTML = `<img alt=""><button type="button" title="Remover">✕</button>`;
      it.querySelector("img").src = url;
      it.querySelector("button").onclick = () => { state.chatAttachments.splice(i, 1); renderChatAttachments(); };
      box.appendChild(it);
    });
  }
  // reduz para no máximo 1280 px (a IA não precisa de mais, e a requisição fica leve)
  function addChatImage(file) {
    if (!file || !file.type.startsWith("image/")) return;
    if (state.chatAttachments.length >= 4) { showToast("Até 4 imagens por mensagem."); return; }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      state.chatAttachments.push(c.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(img.src);
      renderChatAttachments();
      openPane("chat");
    };
    img.src = URL.createObjectURL(file);
  }
  // Altura da caixa do chat = o conteúdo (ou o placeholder, se vazia) + a borda; barra de rolagem só no limite.
  function autoGrowChat() {
    const el = dom.chatInput;
    const empty = !el.value;
    if (empty) el.value = el.placeholder; // scrollHeight ignora o placeholder: mede com ele no lugar
    el.style.height = "auto";
    const need = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    if (empty) el.value = "";
    el.style.height = `${Math.min(180, need)}px`;
    el.style.overflowY = need > 180 ? "auto" : "hidden";
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
  function openIconPicker(targetCardIdx = null, pickCallback = null) {
    state.iconTargetCardIndex = targetCardIdx;
    state.iconPickCallback = pickCallback;
    // no modo "escolher para um campo" só existe uma ação
    dom.btnInsertIconCard.classList.toggle("hidden", !!pickCallback);
    dom.btnInsertIconCanvas.classList.toggle("hidden", !!pickCallback);
    dom.btnInsertIconFigure.textContent = pickCallback ? "Usar este ícone" : "Usar como figura";
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
    state.iconPickCallback = null;
  }

  async function loadIcons(query = "") {
    dom.iconSearchCount.textContent = "Buscando...";
    try {
      const res = await fetch(`api/icons?q=${encodeURIComponent(query)}&limit=90`);
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
    if (state.iconPickCallback) {
      const cb = state.iconPickCallback;
      const name = state.selectedIcon.name;
      closeIconPicker();
      cb(name);
      return;
    }
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

    // variedade medida no servidor (src/ai/variety.js — a mesma régua da geração com IA)
    fetch("api/variety", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: state.deck }) })
      .then((r) => r.json()).then((v) => {
        const ok = v.ok;
        dom.arcStatusBadge.className = `arc-badge ${ok ? "ok" : "warn"}`;
        dom.arcStatusBadge.textContent = ok ? "Variado ✓" : "Repetitivo";
        dom.arcRecommendation.textContent = `${v.distinct} layouts diferentes em ${v.slides} slides.`;
        const ul = document.getElementById("arc-problems");
        ul.innerHTML = "";
        v.problems.forEach((p) => { const li = document.createElement("li"); li.textContent = p; ul.append(li); });
        const btn = document.getElementById("btn-vary-deck");
        btn.classList.toggle("hidden", ok);
        btn.onclick = () => {
          closePopovers();
          openPane("chat");
          dom.chatInput.value = `Deixe a apresentação menos repetitiva, sem perder conteúdo nem a ordem da narrativa. Problemas de ritmo: ${v.problems.join("; ")}.`;
          handleChatSubmit();
        };
      }).catch(() => {});
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
        label: "Converter em número",
        fn: () => {
          const match = text.match(/\d+(?:[\.,]\d+)?/);
          const slide = state.deck.slides[state.currentSlideIndex];
          slide.layout = "number";
          slide.value = match ? match[0] : 100;
          slide.suffix = text.includes("%") ? "%" : "";
          syncDeckToServer();
          renderCurrentSlide();
          playHaptic("pop");
          showToast("Convertido em número grande");
        }
      });
      actions.push({
        label: "Converter em gráfico de rosca",
        fn: () => {
          const slide = state.deck.slides[state.currentSlideIndex];
          slide.layout = "number";
          slide.side = { chart: "donut", value: 75, center: "75%", w: 500, h: 500 };
          syncDeckToServer();
          renderCurrentSlide();
          playHaptic("pop");
          showToast("Gráfico de rosca inserido");
        }
      });
    }

    actions.push({
      label: "Converter em cartões",
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
        showToast("Convertido em 3 cartões");
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
  // ==========================================================================
  // GAVETA DE YAML: "Slide atual" (padrão) ou "Apresentação inteira", com realce de sintaxe,
  // separadores entre slides e rolagem até o slide atual.
  // ==========================================================================
  let yamlDebounce = null;
  state.yamlMode = store.get("yamlMode", "slide");

  function toggleYamlDrawer() {
    state.isYamlDrawerOpen = !state.isYamlDrawerOpen;
    dom.yamlDrawer.classList.toggle("hidden", !state.isYamlDrawerOpen);
    dom.btnYamlDrawer.classList.toggle("active", state.isYamlDrawerOpen);
    if (state.isYamlDrawerOpen) {
      setYamlMode(state.yamlMode);
      dom.yamlLiveEditor.focus();
    }
    requestAnimationFrame(() => state.autoFit && updateCanvasScale());
  }

  function setYamlMode(mode) {
    state.yamlMode = mode;
    store.set("yamlMode", mode);
    dom.yamlModeSlide.classList.toggle("active", mode === "slide");
    dom.yamlModeDeck.classList.toggle("active", mode === "deck");
    dom.yamlStatus.textContent = "";
    updateYamlLiveEditor({ force: true });
  }

  // separador visível antes de cada slide ("  - " no primeiro nível da lista slides:)
  function withSlideSeparators(yaml) {
    let n = 0;
    const lines = yaml.split("\n");
    let inSlides = false;
    const out = [];
    for (const line of lines) {
      if (/^slides:\s*$/.test(line)) inSlides = true;
      else if (/^\S/.test(line)) inSlides = false;
      if (inSlides && /^ {2}- /.test(line)) {
        n++;
        const layout = (line.match(/layout:\s*(\S+)/) || [])[1] || "";
        out.push(`  # ─────────── slide ${n}${layout ? ` · ${layoutLabel(layout)}` : ""} ───────────`);
      }
      out.push(line);
    }
    return out.join("\n");
  }

  async function updateYamlLiveEditor({ force = false } = {}) {
    if (!state.isYamlDrawerOpen || !state.deck) return;
    // enquanto a pessoa digita na gaveta, o texto dela manda — não sobrescreve
    if (!force && document.activeElement === dom.yamlLiveEditor) return;
    try {
      if (state.yamlMode === "slide") {
        const r = await (await fetch(`api/slide-yaml?i=${state.currentSlideIndex}`)).json();
        setYamlText(r.yaml || "");
        dom.yamlLiveEditor.scrollTop = 0;
      } else {
        const r = await (await fetch("api/deck")).json();
        setYamlText(withSlideSeparators(r.yaml));
        // rola até o separador do slide atual
        const lineNo = dom.yamlLiveEditor.value.split("\n").findIndex((l) => l.includes(`# ─────────── slide ${state.currentSlideIndex + 1}`));
        const lh = parseFloat(getComputedStyle(dom.yamlLiveEditor).lineHeight) || 19;
        dom.yamlLiveEditor.scrollTop = Math.max(0, lineNo * lh - 8);
        syncYamlScroll();
      }
    } catch {}
  }

  function setYamlText(text) {
    dom.yamlLiveEditor.value = text;
    renderYamlHighlight();
  }

  // realce simples, linha a linha: chaves, textos, números, sim/não, comentários e ==destaques==
  function highlightYaml(text) {
    const value = (v) => {
      let h = escHtml(v);
      if (/^\s*(true|false|null|~)\s*$/.test(v)) return `<span class="yh-bool">${h}</span>`;
      if (/^\s*-?\d+(\.\d+)?\s*$/.test(v)) return `<span class="yh-num">${h}</span>`;
      h = h.replace(/(&quot;[^&]*?&quot;|"[^"]*"|'[^']*')/g, '<span class="yh-str">$1</span>');
      h = h.replace(/(==[^=]+==|\^\^[^^]+\^\^|\*\*[^*]+\*\*)/g, '<span class="yh-mk">$1</span>');
      return h;
    };
    return text.split("\n").map((line) => {
      if (/^\s*#/.test(line)) return `<span class="yh-com${line.includes("───") ? " yh-sep" : ""}">${escHtml(line)}</span>`;
      const m = /^(\s*)(- )?([^\s:#][^:#]*?)(:)(\s.*)?$/.exec(line);
      if (m) return `${m[1]}${m[2] ? '<span class="yh-dash">- </span>' : ""}<span class="yh-key">${escHtml(m[3])}</span>${m[4]}${m[5] ? value(m[5]) : ""}`;
      const d = /^(\s*)(- )(.*)$/.exec(line);
      if (d) return `${d[1]}<span class="yh-dash">- </span>${value(d[3])}`;
      return value(line);
    }).join("\n") + "\n";
  }
  function renderYamlHighlight() {
    dom.yamlHl.innerHTML = highlightYaml(dom.yamlLiveEditor.value);
    syncYamlScroll();
  }
  function syncYamlScroll() {
    dom.yamlHl.scrollTop = dom.yamlLiveEditor.scrollTop;
    dom.yamlHl.scrollLeft = dom.yamlLiveEditor.scrollLeft;
  }

  // Aplica quando a pessoa para de digitar e o YAML é válido; se não for, mostra o erro e não
  // mexe no deck (nem no texto dela).
  function onYamlEditorInput() {
    renderYamlHighlight();
    clearTimeout(yamlDebounce);
    yamlDebounce = setTimeout(async () => {
      try {
        const slideMode = state.yamlMode === "slide";
        const res = await fetch(slideMode ? "api/slide-yaml" : "api/deck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slideMode ? { index: state.currentSlideIndex, yaml: dom.yamlLiveEditor.value } : { yaml: dom.yamlLiveEditor.value }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          dom.yamlStatus.textContent = data.error || "YAML inválido";
          dom.yamlStatus.classList.add("error");
          return;
        }
        dom.yamlStatus.textContent = "Aplicado";
        dom.yamlStatus.classList.remove("error");
        state.deck = data.spec;
        if (state.currentSlideIndex >= state.deck.slides.length) state.currentSlideIndex = state.deck.slides.length - 1;
        renderCurrentSlide();
        renderThumbnails();
        updateStoryArc();
        updateSaveStatus();
      } catch (e) {
        dom.yamlStatus.textContent = e.message;
        dom.yamlStatus.classList.add("error");
      }
    }, 600);
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
    { title: "Editar YAML da apresentação", cat: "Exibir", ic: "code-xml", fn: () => toggleYamlDrawer() },
    { title: "Interface escura", cat: "Exibir", ic: "sun-moon", fn: () => setAppTheme("dark") },
    { title: "Interface clara", cat: "Exibir", ic: "sun-moon", fn: () => setAppTheme("light") },
    { title: "Interface automática (segue o sistema)", cat: "Exibir", ic: "sun-moon", fn: () => setAppTheme("system") },
    { title: "Apresentar deste slide", cat: "Apresentar", ic: "play", fn: () => startPresentation() },
    { title: "Apresentar do início", cat: "Apresentar", ic: "play", fn: () => { state.currentSlideIndex = 0; startPresentation(); } },
    { title: "Apresentar com caneta", cat: "Apresentar", ic: "play", fn: () => startPresentation({ pen: true }) },
    { title: "Abrir arquivo do computador", cat: "Arquivo", ic: "folder-open", fn: () => dom.fileInputYaml.click() },
    { title: "Abrir por caminho", cat: "Arquivo", ic: "folder-input", fn: () => dom.menuOpenServer.click() },
    { title: "Baixar apresentação (.sagadeck)", cat: "Arquivo", ic: "download", fn: () => dom.exportSagadeck.click() },
    { title: "Baixar PowerPoint (.pptx)", cat: "Arquivo", ic: "file-text", fn: () => document.getElementById("export-pptx").click() },
    { title: "Baixar PDF", cat: "Arquivo", ic: "file-text", fn: () => document.getElementById("export-pdf").click() },
    { title: "Baixar roteiro (PDF)", cat: "Arquivo", ic: "sticky-note", fn: () => document.getElementById("export-roteiro").click() },
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
    const ms = document.getElementById("mark-style-select");
    if (ms) ms.value = state.deck?.markStyle || "marca-texto";
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
  // tudo do deck que muda o desenho de um slide (tema, destaque, cabeçalho/rodapé e o que eles mostram)
  const deckLook = () => {
    const d = state.deck || {};
    return JSON.stringify([d.theme, d.markStyle, d.footer, d.header, d.title, d.author, d.event, d.department, d.date, d.slides?.length]);
  };
  const thumbKey = (idx, slide) => `${deckLook()}|${idx}|${JSON.stringify(slide)}`;
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
        requestAnimationFrame(() => fitRendered(screen));
      } else {
        const fb = document.createElement("div");
        fb.className = "thumb-fallback";
        fb.textContent = plainTitle(slide, idx);
        screen.appendChild(fb);
      }
      card.appendChild(screen);

      if (Array.isArray(slide.auto) && slide.auto.length) {
        const badge = document.createElement("span");
        badge.className = "thumb-auto";
        badge.textContent = "⚙";
        badge.title = `${slide.auto.length} mudança(s) automática(s) — veja no painel Formatar`;
        card.appendChild(badge);
      }

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
      // arrastar para reordenar
      card.draggable = true;
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-sagadeck-slide", String(idx));
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        dom.thumbnailsList.querySelectorAll(".drop-before, .drop-after").forEach((c) => c.classList.remove("drop-before", "drop-after"));
      });
      card.addEventListener("dragover", (e) => {
        if (!e.dataTransfer.types.includes("application/x-sagadeck-slide")) return;
        e.preventDefault();
        const r = card.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        dom.thumbnailsList.querySelectorAll(".drop-before, .drop-after").forEach((c) => c !== card && c.classList.remove("drop-before", "drop-after"));
        card.classList.toggle("drop-after", after);
        card.classList.toggle("drop-before", !after);
      });
      card.addEventListener("drop", (e) => {
        const from = Number(e.dataTransfer.getData("application/x-sagadeck-slide"));
        if (Number.isNaN(from)) return;
        e.preventDefault();
        const after = card.classList.contains("drop-after");
        let to = idx + (after ? 1 : 0);
        if (from < to) to--;
        moveSlideTo(from, to);
        showToast(`Slide ${from + 1} movido para a posição ${to + 1}`, 1800);
      });
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
      fetch("api/render-slide", {
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
    requestAnimationFrame(() => fitRendered(screen));
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
    if (idx !== state.currentSlideIndex) state.editorStep = "all"; // outro slide: volta a mostrar tudo
    state.currentSlideIndex = idx;
    markActiveThumb();
    renderCurrentSlide();
  }

  function moveSlide(idx, dir) {
    moveSlideTo(idx, idx + dir);
  }

  // move o slide `from` para a posição `to` (índice final); o slide selecionado continua selecionado
  function moveSlideTo(from, to) {
    const n = state.deck.slides.length;
    if (to < 0 || to >= n || from === to) return;
    const current = state.deck.slides[state.currentSlideIndex];
    const item = state.deck.slides.splice(from, 1)[0];
    state.deck.slides.splice(to, 0, item);
    state.currentSlideIndex = state.deck.slides.indexOf(current);
    syncDeckToServer();
    renderThumbnails();
    renderCurrentSlide();
  }

  // ==========================================================================
  // OPERAÇÕES DO DECK (ADICIONAR, DUPLICAR, EXCLUIR)
  // ==========================================================================
  const SCENES = [
    ["headline", "impact", "Uma ideia. Todo o palco.", "Tipografia monumental para a frase que fica."],
    ["number", "impact", "O número que muda tudo", "Dê dimensão a um resultado, sem um mar de dados."],
    ["quote", "impact", "Uma voz na história", "Uma citação com espaço para ressoar."],
    ["full", "impact", "Visão panorâmica", "Uma imagem ocupa a cena. A ideia ganha escala."],
    ["compare", "data", "Antes de ver, compare", "Dois caminhos, uma decisão mais clara."],
    ["chart", "data", "Dados que contam", "Um gráfico que ajuda a enxergar o argumento."],
    ["timeline", "data", "Conecte os acontecimentos", "Um percurso visual, no seu ritmo."],
    ["bento", "data", "Um mosaico de ideias", "Contraste de tamanhos e respiros na composição."],
    ["codewalk", "teach", "Código, um passo por vez", "Linhas em foco, explicação e saída simulada."],
    ["spotlight", "teach", "Olhe bem aqui", "Guie a atenção por regiões de uma imagem."],
    ["question", "teach", "O que você acha?", "Uma pergunta. A resposta aparece na hora certa."],
    ["poll", "teach", "Traga a sala para a conversa", "Votação local para registrar as escolhas da turma."],
  ];
  let sceneReturnFocus;
  const sceneModal = () => document.getElementById("scene-modal");
  function closeSceneLibrary() {
    sceneModal().classList.add("hidden");
    sceneReturnFocus?.focus();
  }
  async function insertScene(layout) {
    if (!state.deck || state.insertingScene) return;
    state.insertingScene = true;
    try {
      const res = await fetch(`api/layout-sample?layout=${encodeURIComponent(layout)}`);
      const data = await res.json();
      if (!res.ok || !data.slide) throw new Error(data.error || "Não foi possível carregar a cena");
      const slide = data.slide;
      const at = state.currentSlideIndex + 1;
      state.deck.slides.splice(at, 0, slide);
      state.currentSlideIndex = at;
      state.editorStep = "all";
      await syncDeckToServer();
      closeSceneLibrary();
      renderThumbnails();
      await renderCurrentSlide();
      openPane("props");
      showToast(`${layoutLabel(layout)} inserido. Personalize no painel ao lado.`);
    } catch (err) { showToast(err.message); }
    finally { state.insertingScene = false; }
  }
  async function openSceneLibrary() {
    sceneReturnFocus = document.activeElement;
    sceneModal().classList.remove("hidden");
    document.getElementById("scene-close").focus();
    const grid = document.getElementById("scene-grid");
    grid.innerHTML = '<p class="scene-loading" role="status">Preparando as cenas no seu tema…</p>';
    document.querySelectorAll("[data-scene-filter]").forEach(b => b.classList.toggle("active", b.dataset.sceneFilter === "all"));
    try {
      const res = await fetch("api/layout-previews");
      if (!res.ok) throw new Error("Não foi possível carregar as cenas. Tente novamente.");
      const data = await res.json();
      ensureSlideStyles(data.baseCSS, data.themeCSS);
      grid.innerHTML = SCENES.filter(([id]) => data.html[id]).map(([id,category,title,desc]) => `<div class="scene-card" role="button" tabindex="0" data-scene="${id}" data-category="${category}" aria-label="Inserir ${layoutLabel(id)}"><div class="scene-preview" aria-hidden="true"><div class="scene-render" inert>${data.html[id]}</div><span class="scene-insert">+ Inserir</span></div><div class="scene-card-copy"><b>${title}</b><span>${desc}</span><small>${layoutLabel(id)}</small></div></div>`).join("");
      grid.querySelectorAll(".scene-card").forEach(b => {
        b.onclick = () => insertScene(b.dataset.scene);
        b.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); insertScene(b.dataset.scene); } };
      });
      scaleScenePreviews();
    } catch (err) { grid.innerHTML = `<p class="scene-loading" role="alert">${escHtml(err.message)}</p>`; }
  }
  function scaleScenePreviews() {
    document.querySelectorAll(".scene-preview").forEach(box => {
      box.querySelector(".scene-render").style.transform = `scale(${box.clientWidth / 1920})`;
    });
  }
  function setupCreativeTools() {
    document.getElementById("btn-scenes").onclick = openSceneLibrary;
    document.getElementById("scene-close").onclick = closeSceneLibrary;
    sceneModal().onclick = e => { if (e.target === sceneModal()) closeSceneLibrary(); };
    document.querySelectorAll("[data-add-scene]").forEach(b => b.onclick = () => insertScene(b.dataset.addScene));
    document.querySelectorAll("[data-scene-filter]").forEach(b => b.onclick = () => {
      document.querySelectorAll("[data-scene-filter]").forEach(x => x.classList.toggle("active", x === b));
      document.querySelectorAll(".scene-card").forEach(x => { x.hidden = b.dataset.sceneFilter !== "all" && x.dataset.category !== b.dataset.sceneFilter; });
      scaleScenePreviews();
    });
    document.getElementById("motion-select").onchange = async e => {
      if (!state.deck) return;
      state.deck.motion = e.target.value;
      await syncDeckToServer();
      showToast({ none: "Movimento essencial: entradas imediatas, cliques preservados.", subtle: "Movimento equilibrado: transições suaves.", expressive: "Modo palco: movimento e entradas expressivas." }[state.deck.motion]);
    };
    window.addEventListener("resize", scaleScenePreviews);
    document.addEventListener("keydown", e => {
      if (sceneModal().classList.contains("hidden")) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closeSceneLibrary(); }
      if (e.key === "Tab") {
        const list = [...sceneModal().querySelectorAll("button, [tabindex='0']")].filter(b => b.getClientRects().length && !b.disabled && !b.closest("[inert]"));
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }, true);
  }

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
  // Galeria de layouts: prévia de verdade (exemplo desenhado no tema do deck) + descrição
  function buildLayoutPicker() {
    dom.layoutPickerGrid.innerHTML = "";
    LAYOUT_NAMES.forEach((name) => {
      const card = document.createElement("button");
      card.className = "layout-card";
      card.dataset.layout = name;
      card.title = name;
      card.innerHTML = `<div class="lc-prev"><div class="thumb-render"></div></div><div class="lc-name"></div><div class="lc-desc"></div>`;
      card.querySelector(".lc-name").textContent = layoutLabel(name);
      card.onclick = () => {
        closePopovers();
        changeCurrentLayout(name);
      };
      dom.layoutPickerGrid.appendChild(card);
    });
  }

  let layoutPreviewKey = "";
  async function loadLayoutPreviews() {
    const key = `${state.deck?.theme}|${state.deck?.markStyle || ""}`;
    const cur = state.deck?.slides[state.currentSlideIndex]?.layout || "blocks";
    dom.layoutPickerGrid.querySelectorAll(".layout-card").forEach((c) => c.classList.toggle("active", c.dataset.layout === cur));
    if (key === layoutPreviewKey) return;
    try {
      const data = await (await fetch("api/layout-previews")).json();
      ensureSlideStyles(data.baseCSS, data.themeCSS);
      dom.layoutPickerGrid.querySelectorAll(".layout-card").forEach((c) => {
        const n = c.dataset.layout;
        c.querySelector(".thumb-render").innerHTML = data.html[n] || "";
        c.querySelector(".lc-desc").textContent = data.info[n]?.[1] || "";
      });
      layoutPreviewKey = key;
    } catch {}
  }

  // Ao trocar de layout, o conteúdo em lista (cartões, etapas, eventos, níveis…) vai junto
  const LIST_KEY = { cards: "items", bento: "tiles", stats: "stats", steps: "steps", funnel: "stages", pyramid: "levels", list: "items",
    agenda: "items", timeline: "events", matrix: "cells", question: "options", poll: "options", split: "bullets", statement: "lines", references: "items", end: "contacts" };
  const SOURCE_KEYS = ["items", "tiles", "stats", "kpis", "steps", "process", "flow", "stages", "levels", "events", "cells", "options", "bullets", "lines", "contacts"];
  function carryContent(slide, to) {
    const target = LIST_KEY[to];
    if (!target || (Array.isArray(slide[target]) && slide[target].length)) return;
    const srcKey = SOURCE_KEYS.find((k) => Array.isArray(slide[k]) && slide[k].length);
    if (!srcKey) return;
    const entries = slide[srcKey].map((x) => {
      if (typeof x !== "object" || x == null) return { title: String(x ?? "") };
      return { title: x.title ?? x.label ?? x.text ?? x.name ?? "", text: x.title != null ? x.text ?? x.sub : x.sub, icon: x.icon, value: x.value ?? x.when ?? x.number };
    });
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""));
    const plainList = ["bullets", "options", "lines", "contacts"];
    if (plainList.includes(target) && to !== "question") slide[target] = entries.map((e) => e.title);
    else if (to === "list" || to === "question") slide[target] = entries.map((e) => (e.text ? { text: e.title, sub: e.text } : e.title));
    else if (to === "timeline") slide[target] = entries.map((e) => clean({ when: e.value ?? "", title: e.title, text: e.text }));
    else if (to === "stats") slide[target] = entries.map((e) => clean({ value: e.value ?? e.title, label: e.value != null ? e.title : e.text, icon: e.icon }));
    else slide[target] = entries.map((e) => clean(e));
  }

  function changeCurrentLayout(layoutName) {
    const slide = state.deck.slides[state.currentSlideIndex];
    if (!slide) return;
    carryContent(slide, layoutName);
    if ((layoutName === "statement" || layoutName === "headline") && !slide.text && slide.title) slide.text = slide.title;
    slide.layout = layoutName;
    syncDeckToServer();
    renderCurrentSlide();
    showToast(`Layout: ${layoutLabel(layoutName)}`);
  }

  // Painel Formatar: formulário completo do layout (slide-form.js). Cada mudança atualiza o slide
  // na hora; mudanças de estrutura (adicionar/remover/trocar tipo) reconstroem o formulário.
  let formSyncTimer = null;
  function renderAutoBanner(slide) {
    const log = Array.isArray(slide.auto) ? slide.auto : [];
    const box = dom.autoBanner;
    box.hidden = !log.length;
    if (!log.length) { box.innerHTML = ""; return; }
    const show = (v) => (v == null ? "(vazio)" : typeof v === "string" ? v : JSON.stringify(v));
    box.innerHTML = `<h4><span>⚙</span> Mudanças automáticas neste slide</h4>
      <p class="hint">Feitas pela auto-correção, não por você nem pela IA. Desfaça o que não quiser.</p>
      ${log.map((e, i) => `<div class="auto-item">
        <span class="what">${escHtml(e.campo)}</span>
        <span class="acts"><button class="btn-small" data-undo="${i}">Desfazer</button><button class="btn-small" data-keep="${i}">Manter</button></span>
        <span class="why">${escHtml(e.motivo || "")}</span>
        <span class="was" title="${escAttr(show(e.antes))}">Antes: ${escHtml(show(e.antes).slice(0, 120))}</span>
      </div>`).join("")}`;
    const done = () => { if (!slide.auto.length) delete slide.auto; renderThumbnails(); formCommit(true); };
    box.querySelectorAll("[data-undo]").forEach((b) => b.onclick = () => {
      const e = slide.auto[+b.dataset.undo];
      if (e.antes == null) delete slide[e.campo]; else slide[e.campo] = e.antes;
      slide.auto.splice(+b.dataset.undo, 1);
      showToast(`Desfeito: ${e.campo}`);
      done();
    });
    box.querySelectorAll("[data-keep]").forEach((b) => b.onclick = () => { slide.auto.splice(+b.dataset.keep, 1); done(); });
  }

  function updatePropertiesPanel(slide) {
    renderAutoBanner(slide);
    const pane = dom.tabPanelProps;
    const scroll = pane.scrollTop;
    window.SlideForm.render(dom.slideFieldsForm, slide, {
      commit: formCommit,
      pickIcon: (cb) => openIconPicker(null, cb),
      layoutLabel,
      generateImage: (_el, btn) => generateSlideImages(btn),
    });
    hydrateIcons(dom.slideFieldsForm);
    pane.scrollTop = scroll;
  }

  async function generateSlideImages(btn) {
    clearTimeout(formSyncTimer);
    await syncDeckToServer(); // o prompt que acabou de ser digitado precisa estar no servidor
    if (btn) { btn.disabled = true; btn.textContent = "Gerando imagem…"; }
    try {
      const res = await fetch("api/ai/slide-images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: state.currentSlideIndex }),
      });
      const data = await res.json();
      if (data.spec) state.deck = data.spec;
      showToast(data.ok ? "Imagem gerada" : `Não deu para gerar a imagem: ${data.error || "erro"}`, data.ok ? 2500 : 6000);
    } catch (e) {
      showToast(`Não deu para gerar a imagem: ${e.message}`, 6000);
    }
    renderCurrentSlide();
    renderThumbnails();
  }

  function formCommit(structural) {
    clearTimeout(formSyncTimer);
    formSyncTimer = setTimeout(syncDeckToServer, 400);
    const slide = state.deck.slides[state.currentSlideIndex];
    if (structural) updatePropertiesPanel(slide);
    state.skipFormRebuild = true; // o formulário já está certo: não reconstruir (perderia o foco)
    renderCurrentSlide();
  }


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
  // MODO APRESENTAÇÃO: a apresentação real (mesmo HTML do "Em uma nova aba") por cima do Studio.
  // O runtime traz tudo: cliques/etapas, timers, enquetes, caneta (D/M), tela cheia (F),
  // modo apresentador (P) e anti-bloqueio de tela. Aqui só abrimos, sincronizamos o slide e fechamos.
  // ==========================================================================
  let presCurWatch = null;

  function presRuntime() {
    try { return dom.presFrame.contentWindow?.sagadeck || null; } catch { return null; }
  }

  async function startPresentation({ pen = false } = {}) {
    await syncDeckToServer(); // a prévia é montada a partir do deck do servidor
    const start = state.currentSlideIndex + 1;
    dom.presModal.classList.remove("hidden");
    dom.presFrame.src = `preview?t=${Date.now()}#${start}`;
    document.documentElement.requestFullscreen?.().catch(() => {});
    dom.presFrame.onload = async () => {
      const win = dom.presFrame.contentWindow;
      if (dom.presModal.classList.contains("hidden") || win.location.href === "about:blank") return;
      const status = await fetch("api/preview-status").then((r) => r.json()).catch(() => ({ ok: true, warnings: [] }));
      if (!status.ok || !win.sagadeck) {
        closePresentation();
        showToast(`Não consegui abrir a apresentação: ${status.error || "erro ao montar o HTML"}`, 9000);
        return;
      }
      if (status.warnings.length) {
        const key = `${state.file || state.deck?.title}|${status.warnings.join("|")}`;
        if (!state.shownPreviewWarnings?.has(key)) {
          (state.shownPreviewWarnings ||= new Set()).add(key);
          const files = status.warnings.map((w) => (w.match(/"([^"]+)"/) || [])[1]).filter(Boolean);
          showToast(`Sem ${files.join(", ")} (ficam na pasta original do deck). Para usá-los, abra o deck por Arquivo › Abrir por caminho.`, 7000);
        }
      }
      dom.presFrame.focus();
      // Esc fecha a apresentação (se a caneta estiver ligada, o runtime a desliga primeiro)
      // fase de captura: roda antes do runtime, que desliga a caneta no mesmo Esc
      win.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !win.document.body.classList.contains("drawing")) closePresentation();
      }, true);
      if (pen) win.document.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
      clearInterval(presCurWatch);
      presCurWatch = setInterval(() => {
        const rt = presRuntime();
        if (rt && typeof rt.cur === "number") state.presCur = rt.cur;
      }, 300);
    };
  }

  function closePresentation() {
    if (dom.presModal.classList.contains("hidden")) return;
    clearInterval(presCurWatch);
    const cur = presRuntime()?.cur ?? state.presCur;
    dom.presModal.classList.add("hidden");
    dom.presFrame.src = "about:blank";
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    // volta para o slide em que a apresentação parou
    if (typeof cur === "number" && cur !== state.currentSlideIndex && state.deck?.slides[cur]) selectSlide(cur);
  }

  // ==========================================================================
  // NAPKIN AI (TEXTO -> DIAGRAMA VISUAL)
  // ==========================================================================
  let lastNapkinResult = null;

  // Formatos que o diagrama de texto sabe gerar; os exemplos vêm do servidor (src/diagram/napkin-examples.js)
  const NAPKIN_TYPES = ["auto", "steps", "funnel", "timeline", "stats", "number", "compare", "cards", "bento", "pyramid", "matrix", "list", "agenda", "chart"];
  let napkinType = "auto";

  function buildNapkinPickers() {
    const types = document.getElementById("napkin-types");
    if (types.childElementCount) return;
    for (const t of NAPKIN_TYPES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `napkin-type${t === napkinType ? " active" : ""}`;
      b.dataset.type = t;
      b.innerHTML = t === "auto"
        ? `<div class="lc-prev nt-auto"><i class="ic" data-ic="sparkles"></i></div><div class="lc-name">Automático</div>`
        : `<div class="lc-prev"><div class="thumb-render"></div></div><div class="lc-name"></div>`;
      if (t !== "auto") b.querySelector(".lc-name").textContent = layoutLabel(t);
      b.onclick = () => {
        napkinType = t;
        types.querySelectorAll(".napkin-type").forEach((x) => x.classList.toggle("active", x === b));
      };
      types.append(b);
    }
    const ex = document.getElementById("napkin-examples");
    fetch("api/napkin-examples").then((r) => r.json()).then((examples) => {
      for (const [key, { label, text }] of Object.entries(examples)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "napkin-example";
        b.dataset.example = key;
        b.innerHTML = `<b></b><span></span>`;
        b.querySelector("b").textContent = label;
        b.querySelector("span").textContent = text.split("\n")[0];
        b.onclick = () => { dom.napkinInputText.value = text; runNapkinConversion(); };
        ex.append(b);
      }
      if (!dom.napkinInputText.value.trim()) dom.napkinInputText.value = examples.steps?.text || "";
    }).catch(() => {});
    hydrateIcons(dom.modalNapkin);
    // prévias dos formatos: as mesmas da galeria de layouts
    fetch("api/layout-previews").then((r) => r.json()).then((data) => {
      ensureSlideStyles(data.baseCSS, data.themeCSS);
      types.querySelectorAll(".napkin-type").forEach((b) => {
        const r = b.querySelector(".thumb-render");
        if (r) r.innerHTML = data.html[b.dataset.type] || "";
      });
    }).catch(() => {});
  }

  function openNapkinModal() {
    buildNapkinPickers();
    dom.modalNapkin.classList.remove("hidden");
    dom.napkinPreviewBox.classList.add("hidden");
    dom.btnNapkinReplace.classList.add("hidden");
    dom.btnNapkinInsert.classList.add("hidden");
    dom.napkinInputText.focus();
  }

  function closeNapkinModal() {
    dom.modalNapkin.classList.add("hidden");
  }

  // desenha o slide gerado dentro do modal (igual à miniatura)
  async function renderNapkinStage(slide) {
    const stage = document.getElementById("napkin-stage");
    try {
      const r = await (await fetch("api/render-slide", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide, index: state.currentSlideIndex }) })).json();
      stage.innerHTML = `<div class="thumb-render">${r.html}</div>`;
      requestAnimationFrame(() => fitRendered(stage));
      stage.style.setProperty("--thumb-scale", String(stage.clientWidth / 1920));
    } catch {
      stage.innerHTML = `<div class="napkin-empty">Não deu para desenhar a prévia.</div>`;
    }
  }

  async function runNapkinConversion() {
    const text = dom.napkinInputText.value.trim();
    if (!text) {
      showToast("Escreva ou cole um texto primeiro.");
      return;
    }
    dom.btnRunNapkin.disabled = true;
    dom.btnRunNapkin.textContent = "Gerando…";
    document.getElementById("napkin-stage").classList.add("loading");
    try {
      const res = await fetch("api/napkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, layout: napkinType === "auto" ? undefined : napkinType, theme: state.deck.theme || "sinal", images: true }),
      });
      const data = await res.json();
      // formato escolhido pela pessoa manda: se o resultado veio em outro layout, converte o conteúdo
      if (napkinType !== "auto" && data.slide && data.slide.layout !== napkinType) {
        carryContent(data.slide, napkinType);
        data.slide.layout = napkinType;
        data.detectedType = napkinType;
      }
      lastNapkinResult = data;
      dom.napkinDetectedBadge.textContent = layoutLabel(data.detectedType);
      dom.napkinRationale.textContent = (data.mode === "llm" ? "IA · " : "regras locais · ") + (data.rationale || "");
      if (data.notice) showToast(data.notice);
      dom.napkinYamlPreview.textContent = data.yaml;
      dom.napkinPreviewBox.classList.remove("hidden");
      dom.btnNapkinReplace.classList.remove("hidden");
      dom.btnNapkinInsert.classList.remove("hidden");
      await renderNapkinStage(data.slide);
    } catch (err) {
      showToast("Erro ao gerar o diagrama no servidor.");
    } finally {
      document.getElementById("napkin-stage").classList.remove("loading");
      dom.btnRunNapkin.disabled = false;
      dom.btnRunNapkin.textContent = "Gerar de novo";
    }
  }

  function applyNapkinSlide(replaceCurrent = false) {
    if (!lastNapkinResult || !lastNapkinResult.slide) return;
    const newSlide = lastNapkinResult.slide;

    if (replaceCurrent) {
      state.deck.slides[state.currentSlideIndex] = newSlide;
      selectSlide(state.currentSlideIndex);
      showToast(`Slide ${state.currentSlideIndex + 1} substituído (${layoutLabel(lastNapkinResult.detectedType)})`);
    } else {
      state.deck.slides.splice(state.currentSlideIndex + 1, 0, newSlide);
      renderThumbnails();
      selectSlide(state.currentSlideIndex + 1);
      showToast(`Novo slide inserido (${layoutLabel(lastNapkinResult.detectedType)})`);
    }

    syncDeckToServer();
    closeNapkinModal();
  }

  // ==========================================================================
  // SINCRONIZAÇÃO E EVENT LISTENERS
  // ==========================================================================
  async function syncDeckToServer() {
    updateSaveStatus("saving");
    try {
      const res = await fetch("api/deck", {
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
    const skip = new Set(["notes", "auto", "source", "id", "layout", "tone", "style", "class", "ratio", "deco", "time", "icon", "picto", "pose", "sign", "name", "theme", "fit", "anim", "align", "color", "bg", "image", "image_prompt", "alt", "url"]);
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

  // Cliques no editor: por padrão mostra tudo (inclusive o que entra por clique, que o runtime
  // esconde até a hora); o seletor da barra de status mostra o slide como a plateia vê em cada clique.
  function applyEditorStep(idx) {
    const root = dom.renderedSlideContainer;
    const nodes = [...root.querySelectorAll("[data-step]")];
    const total = nodes.reduce((m, e) => Math.max(m, +e.dataset.step || 0), 0);
    const k = state.editorStep === "all" || state.editorStep == null ? Infinity : Math.min(+state.editorStep, total);
    nodes.forEach((e) => e.classList.toggle("in", k >= +e.dataset.step));
    root.querySelectorAll("[data-exit]").forEach((e) => e.classList.toggle("out", k !== Infinity && k >= +e.dataset.exit));
    root.querySelectorAll(".pl, mark, .chart").forEach((e) => e.classList.add("play"));
    renderStepControl(total);
  }

  function renderStepControl(total) {
    const box = dom.stepControl;
    if (!total) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    const cur = state.editorStep ?? "all";
    const opts = [["all", "Tudo"], ...Array.from({ length: total + 1 }, (_, i) => [String(i), String(i)])];
    box.innerHTML = `<span class="step-lbl">Cliques</span>` + opts.map(([v, l]) =>
      `<button class="step-btn ${String(cur) === v ? "active" : ""}" data-step-val="${v}" title="${v === "all" ? "Mostrar tudo (edição)" : `Como a plateia vê no clique ${v}`}">${l}</button>`).join("");
    box.querySelectorAll(".step-btn").forEach((b) => b.onclick = () => {
      state.editorStep = b.dataset.stepVal;
      applyEditorStep(state.currentSlideIndex);
      setTimeout(inspectGeometry, 60);
    });
  }

  // Mesmo ajuste do runtime (fitAll em src/runtime/runtime.js): textos com data-fit encolhem até
  // caber na área útil. Sem isso, títulos longos transbordam no editor mas não no HTML final.
  // Ajuste para caber: o mesmo código da apresentação (src/runtime/fit.js): título cede espaço e, se o
  // conteúdo ainda vaza (uma caixa por cima da outra), tudo é reduzido proporcionalmente.
  function fitRendered(root) {
    if (!window.SagadeckFit || !root) return;
    window.SagadeckFit.fitText(root);
    root.querySelectorAll(".slide").forEach((s) => window.SagadeckFit.shrink(s));
  }

  function fitSlideText(root) {
    const run = () => fitRendered(root);
    const report = () => {
      if (root !== dom.renderedSlideContainer) return;
      const notes = [];
      root.querySelectorAll("[data-fit]").forEach((el) => {
        const r = parseFloat(el.style.fontSize) / (+el.dataset.fs0 || 1);
        if (r < 0.9) notes.push(`o motor reduziu automaticamente a fonte de "${el.textContent.trim().slice(0, 40)}" para ${Math.round(r * 100)}% para caber`);
      });
      const z = +(root.querySelector(".slide")?.dataset.shrink || 1);
      if (z < 1) notes.push(`o motor reduziu automaticamente todo o conteúdo do slide para ${Math.round(z * 100)}% para caber (sem isso, uma parte ficaria por cima de outra)`);
      state.renderNotes = notes;
      dom.statusFit.textContent = z < 1 ? `⚙ Conteúdo reduzido para caber (${Math.round(z * 100)}%)` : notes.length ? "⚙ Texto reduzido para caber" : "";
      dom.statusFit.title = notes.length ? `${notes.join("\n")}\nIsso é automático. Para ficar maior: encurte o texto ou use outro layout.` : "";
    };
    run();
    report();
    document.fonts?.ready.then(() => { run(); report(); }); // a fonte do tema pode chegar depois e mudar as medidas
  }

  // ==========================================================================
  // LLM: STATUS E GERAÇÃO DE DECK
  // ==========================================================================
  async function refreshAIStatus(force = false) {
    try {
      const res = await fetch("api/ai/status" + (force ? "?refresh=1" : ""));
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
      const data = await streamAI("api/ai/generate", {
        briefing,
        theme: dom.aiDeckTheme.value,
        slides: Number(dom.aiDeckSlides.value) || undefined,
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
  // --------------------------------------------------------------------------
  // Tom / Fundo com prévia: em vez de um select com nomes, mostra o slide atual em cada opção
  // --------------------------------------------------------------------------
  const variantPop = document.getElementById("variant-popover");
  const VARIANTS = {
    tone: { title: "Tom do slide", select: () => dom.toneSelect, key: "tone", def: "light", re: /\btone-\S+/,
      desc: { light: "Fundo claro do tema", dark: "Fundo escuro, texto claro", accent: "Cor forte do tema", alert: "Para avisos e riscos" } },
    deco: { title: "Fundo do slide", select: () => dom.decoSelect, key: "deco", def: "none", re: /\bdeco-\S+/,
      desc: { none: "Sem textura", grid: "Quadriculado discreto", grain: "Textura de papel", dots: "Pontos em grade", sketch: "Caderno pontilhado, cartões desenhados",
        glow: "Brilho azul nos cantos", aurora: "Manchas coloridas suaves", silver: "Luz prateada, cartões de vidro" } },
  };
  const variantLabel = (kind, v) => [...VARIANTS[kind].select().options].find((o) => o.value === v)?.textContent || v;

  function updateVariantButtons() {
    const slide = state.deck?.slides[state.currentSlideIndex];
    for (const kind of ["tone", "deco"]) {
      const btn = document.getElementById(`btn-${kind}`);
      if (!btn || !slide) continue;
      const v = slide[kind] || VARIANTS[kind].def;
      btn.querySelector(".vpick-name").textContent = variantLabel(kind, v);
      btn.querySelector(".vpick-sw").className = `vpick-sw sw-${kind}-${v}`;
    }
  }

  function openVariantPicker(kind) {
    const cfg = VARIANTS[kind];
    const slide = state.deck.slides[state.currentSlideIndex];
    const cur = slide?.[cfg.key] || cfg.def;
    variantPop.querySelector(".popover-title").textContent = cfg.title;
    const grid = variantPop.querySelector(".variant-grid");
    grid.innerHTML = "";
    const src = dom.renderedSlideContainer.querySelector(".slide");
    for (const opt of cfg.select().options) {
      const v = opt.value;
      const card = document.createElement("button");
      card.type = "button";
      card.className = `variant-card${v === cur ? " active" : ""}`;
      card.dataset.value = v;
      card.innerHTML = `<div class="lc-prev"><div class="thumb-render"></div></div><div class="lc-name"></div><div class="lc-desc"></div>`;
      card.querySelector(".lc-name").textContent = opt.textContent;
      card.querySelector(".lc-desc").textContent = cfg.desc[v] || "";
      if (src) {
        const clone = src.cloneNode(true);
        clone.className = clone.className.replace(new RegExp(cfg.re.source, "g"), "").trim();
        if (!(kind === "deco" && v === "none")) clone.classList.add(`${kind}-${v}`);
        clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
        card.querySelector(".thumb-render").append(clone);
      }
      card.onclick = () => {
        closePopovers();
        const sel = cfg.select();
        sel.value = v;
        sel.dispatchEvent(new Event("change"));
        updateVariantButtons();
      };
      grid.append(card);
    }
  }

  // --------------------------------------------------------------------------
  // CABEÇALHO E RODAPÉ: modelos prontos + campos com variáveis + prévia do slide atual
  // --------------------------------------------------------------------------
  const HF_PRESETS = [
    { id: "padrao", name: "Padrão", desc: "Título e número", footer: null, header: null },
    { id: "autor", name: "Autor e evento", desc: "Autor · evento e 3 / 20", footer: { left: "{autor} · {evento}", right: "{n} / {total}" }, header: null },
    { id: "evento", name: "Evento e data", desc: "Evento, data e número", footer: { left: "{evento}", center: "{data:DD MMM AAAA}", right: "{pagina}" }, header: null },
    { id: "corp", name: "Corporativo", desc: "Área e Confidencial em cima; título, data e página embaixo",
      header: { left: "{depto}", right: "Confidencial" }, footer: { left: "{titulo}", center: "{data:MM/AAAA}", right: "{n} / {total}" } },
    { id: "numero", name: "Só o número", desc: "Número discreto no canto", footer: { right: "{n}" }, header: null },
    { id: "nenhum", name: "Nenhum", desc: "Slides limpos", footer: false, header: null },
  ];
  const HF_TOKENS = [["{titulo}", "Título"], ["{autor}", "Autor"], ["{evento}", "Evento"], ["{depto}", "Departamento"], ["{data:DD/MM/AAAA}", "Data"],
    ["{data:DD MMM AAAA}", "Data por extenso"], ["{pagina}", "Página (01)"], ["{n}", "Página (1)"], ["{total}", "Total"]];
  const HF_SLOTS = ["header.left", "header.center", "header.right", "footer.left", "footer.center", "footer.right"];
  const hfModal = () => document.getElementById("modal-hf");
  let hfLastInput = null;
  let hfTimer = null;

  // footer/header do deck -> valores dos 6 campos (o padrão sem footer = título + número)
  function hfSlotsFrom(v, kind, deck) {
    if (v === false) return { left: "", center: "", right: "" };
    if (v == null) return kind === "footer" ? { left: "{titulo}", center: "", right: "{pagina}" } : { left: "", center: "", right: "" };
    if (typeof v === "string") return { left: v, center: "", right: "{pagina}" };
    return { left: v.left || "", center: v.center || "", right: v.right || "" };
  }

  function hfFill(deckLike) {
    const m = hfModal();
    for (const k of ["author", "event", "department", "date"]) m.querySelector(`[data-deck="${k}"]`).value = deckLike[k] || "";
    for (const kind of ["header", "footer"]) {
      const v = hfSlotsFrom(deckLike[kind], kind, deckLike);
      for (const pos of ["left", "center", "right"]) m.querySelector(`[data-slot="${kind}.${pos}"]`).value = v[pos];
    }
  }

  // o que os campos do modal significam como deck (footer/header "limpos": null = padrão, false = nenhum)
  function hfRead() {
    const m = hfModal();
    const out = {};
    for (const k of ["author", "event", "department", "date"]) out[k] = m.querySelector(`[data-deck="${k}"]`).value.trim();
    for (const kind of ["header", "footer"]) {
      const v = Object.fromEntries(["left", "center", "right"].map((p) => [p, m.querySelector(`[data-slot="${kind}.${p}"]`).value.trim()]));
      const empty = !v.left && !v.center && !v.right;
      if (kind === "footer" && v.left === "{titulo}" && !v.center && v.right === "{pagina}") out.footer = null;
      else if (empty) out[kind] = kind === "footer" ? false : null;
      else out[kind] = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
    }
    return out;
  }

  function hfApplyTo(deck, vals) {
    for (const [k, v] of Object.entries(vals)) {
      if (v == null || v === "") delete deck[k];
      else deck[k] = v;
    }
    return deck;
  }

  function openHeaderFooter() {
    const m = hfModal();
    const presets = m.querySelector(".hf-presets");
    if (!presets.childElementCount) {
      for (const p of HF_PRESETS) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hf-preset";
        b.dataset.preset = p.id;
        b.innerHTML = `<b></b><span></span>`;
        b.querySelector("b").textContent = p.name;
        b.querySelector("span").textContent = p.desc;
        b.onclick = () => {
          const cur = hfRead();
          hfFill({ ...cur, footer: p.footer, header: p.header });
          presets.querySelectorAll(".hf-preset").forEach((x) => x.classList.toggle("active", x === b));
          hfPreview();
        };
        presets.append(b);
      }
      const chips = m.querySelector(".hf-tokens");
      for (const [tok, label] of HF_TOKENS) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "hf-token";
        c.dataset.token = tok;
        c.textContent = label;
        c.title = tok;
        c.onmousedown = (e) => e.preventDefault(); // não rouba o foco do campo
        c.onclick = () => {
          const inp = hfLastInput || m.querySelector('[data-slot="footer.left"]');
          const a = inp.selectionStart ?? inp.value.length, z = inp.selectionEnd ?? a;
          inp.value = inp.value.slice(0, a) + tok + inp.value.slice(z);
          inp.focus();
          inp.setSelectionRange(a + tok.length, a + tok.length);
          hfPreview();
        };
        chips.append(c);
      }
      m.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("focus", () => { if (inp.dataset.slot) hfLastInput = inp; });
        inp.addEventListener("input", () => { clearTimeout(hfTimer); hfTimer = setTimeout(hfPreview, 250); });
      });
    }
    hfFill(state.deck);
    m.classList.remove("hidden");
    hfPreview();
  }

  function closeHeaderFooter() {
    hfModal().classList.add("hidden");
  }

  async function hfPreview() {
    const stage = hfModal().querySelector(".hf-stage");
    const spec = hfApplyTo(JSON.parse(JSON.stringify(state.deck)), hfRead());
    // na prévia, um slide que mostra rodapé (a capa não mostra)
    let i = state.currentSlideIndex;
    const NO_BARS = ["cover", "section", "end", "image", "canvas", "full", "headline"];
    if (NO_BARS.includes(spec.slides[i]?.layout)) i = Math.max(0, spec.slides.findIndex((s) => !NO_BARS.includes(s.layout)));
    try {
      const r = await (await fetch("api/render-slide", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: spec.slides[i], index: i, spec }) })).json();
      stage.innerHTML = `<div class="thumb-render">${r.html}</div>`;
      requestAnimationFrame(() => fitRendered(stage));
      stage.style.setProperty("--thumb-scale", String(stage.clientWidth / 1920));
    } catch {}
  }

  function applyHeaderFooter() {
    hfApplyTo(state.deck, hfRead());
    closeHeaderFooter();
    syncDeckToServer();
    renderCurrentSlide();
    renderThumbnails();
    showToast("Cabeçalho e rodapé aplicados em todos os slides", 2200);
  }

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
    popover(dom.btnLayoutGallery, dom.layoutPopover, loadLayoutPreviews);
    popover(dom.btnStoryArc, dom.storyArcPopover, updateStoryArc);
    // Tom e Fundo: botões com prévia (o slide atual desenhado em cada opção)
    popover(document.getElementById("btn-tone"), variantPop, () => openVariantPicker("tone"));
    popover(document.getElementById("btn-deco"), variantPop, () => openVariantPicker("deco"));
    variantPop.addEventListener("click", (e) => e.stopPropagation());
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

    // barra de formatação: mousedown não tira o foco nem a seleção do texto
    dom.formatBar.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
    dom.formatBar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-fmt]");
      if (b) formatCommand(b.dataset.fmt);
    });

    // estilo do ==destaque== no deck todo
    const markSel = document.getElementById("mark-style-select");
    markSel.addEventListener("change", () => {
      if (markSel.value === "marca-texto") delete state.deck.markStyle;
      else state.deck.markStyle = markSel.value;
      syncDeckToServer();
      renderCurrentSlide();
      renderThumbnails();
    });

    // assistente: "Transformar em slides" aparece depois de uma conversa
    document.getElementById("btn-brainstorm-apply").addEventListener("click", applyBrainstorm);

    // cabeçalho e rodapé
    document.getElementById("btn-header-footer").addEventListener("click", openHeaderFooter);
    document.getElementById("btn-close-hf").addEventListener("click", closeHeaderFooter);
    document.getElementById("btn-hf-cancel").addEventListener("click", closeHeaderFooter);
    document.getElementById("btn-hf-apply").addEventListener("click", applyHeaderFooter);

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

    // Chat Form: Enter envia, Shift+Enter quebra linha; Ctrl+V de imagem anexa
    dom.chatForm.onsubmit = handleChatSubmit;
    dom.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleChatSubmit(); }
    });
    dom.chatInput.addEventListener("input", autoGrowChat);
    // a largura muda (painel, janela, placeholder trocado): recalcula
    let chatW = 0;
    new ResizeObserver(() => {
      const w = dom.chatInput.clientWidth;
      if (w && w !== chatW) { chatW = w; autoGrowChat(); }
    }).observe(dom.chatInput);
    dom.chatInput.addEventListener("paste", (e) => {
      const files = [...(e.clipboardData?.items || [])].filter((it) => it.kind === "file" && it.type.startsWith("image/")).map((it) => it.getAsFile());
      if (files.length) { e.preventDefault(); files.forEach(addChatImage); }
    });
    dom.chatAttach.onclick = () => dom.chatAttachInput.click();
    dom.chatAttachInput.onchange = () => { [...dom.chatAttachInput.files].forEach(addChatImage); dom.chatAttachInput.value = ""; };

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
    // .sagadeck / .zip: o servidor extrai numa pasta e abre de lá (edições salvas nessa pasta)
    async function loadPackageFile(file) {
      try {
        const res = await fetch(`api/open-package?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
        state.deck = data.spec;
        state.file = data.file;
        updateSaveStatus();
        dom.deckTitle.value = state.deck.title || file.name;
        if (state.deck.theme) dom.themeSelect.value = state.deck.theme;
        state.currentSlideIndex = 0;
        renderThumbnails();
        selectSlide(0);
        showToast(`✓ "${file.name}" aberto (${state.deck.slides.length} slides), com imagens e arquivos. As edições são salvas em ${data.dir}.`, 8000);
      } catch (err) {
        showToast("Erro ao abrir: " + err.message, 7000);
      }
    }

    async function loadYamlFile(file) {
      if (!file) return;
      if (/\.(sagadeck|zip)$/i.test(file.name)) return loadPackageFile(file);
      try {
        const text = await file.text();
        const res = await fetch("api/deck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml: text, saveToFile: false, source: "browser-file" }),
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
        const res = await fetch("api/open-file", {
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
      const images = [...(dt?.files || [])].filter((f) => f.type.startsWith("image/"));
      if (images.length) { images.forEach(addChatImage); return; }
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

    // baixa o que o servidor gerou, com o nome que ele mandou; devolve a resposta (para ler os avisos)
    async function downloadFrom(url, fallbackName) {
      await syncDeckToServer();
      const res = await fetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || fallbackName);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return { res, name };
    }

    // PowerPoint / PDF / roteiro: levam alguns segundos (o Chrome invisível desenha cada slide)
    const EXPORTS = {
      pptx: { label: "o PowerPoint", done: "PowerPoint editável, com animações e notas." },
      pdf: { label: "o PDF", done: "PDF com um slide por página." },
      roteiro: { label: "o roteiro", done: "roteiro com miniaturas, notas e tempos." },
    };
    document.querySelectorAll("[data-export]").forEach((btn) => {
      btn.onclick = async (e) => {
        e.preventDefault();
        if (btn.disabled) return;
        const kind = btn.dataset.export, x = EXPORTS[kind];
        btn.disabled = true;
        showToast(`Gerando ${x.label} (${state.deck.slides.length} slides)… pode levar alguns segundos.`, 60000);
        try {
          const { res, name } = await downloadFrom(`api/export/${kind}`, `apresentacao.${kind === "pptx" ? "pptx" : "pdf"}`);
          const warns = JSON.parse(decodeURIComponent(res.headers.get("X-Sagadeck-Warnings") || "%5B%5D"));
          showToast(warns.length ? `"${name}" baixado, com ${warns.length} aviso(s): ${warns.slice(0, 2).join("; ")}` : `"${name}" baixado: ${x.done}`, warns.length ? 9000 : 4000);
        } catch (err) {
          showToast(`Não deu para gerar ${x.label}: ${err.message}`, 8000);
        } finally {
          btn.disabled = false;
        }
      };
    });

    // .sagadeck: a apresentação inteira (YAML + imagens, CSS, widgets) num arquivo
    dom.exportSagadeck.onclick = async (e) => {
      e.preventDefault();
      try {
        const { res, name } = await downloadFrom("api/export/sagadeck", "apresentacao.sagadeck");
        const missing = JSON.parse(decodeURIComponent(res.headers.get("X-Sagadeck-Missing") || "%5B%5D"));
        showToast(missing.length
          ? `"${name}" baixado, mas ${missing.length} arquivo(s) usado(s) pelo deck não existe(m): ${missing.join(", ")} (listados em FALTANDO.txt dentro do arquivo)`
          : `"${name}" baixado: a apresentação inteira, com imagens, CSS e widgets.`, missing.length ? 9000 : 3500);
      } catch (err) {
        showToast("Não deu para baixar: " + err.message);
      }
    };
    dom.exportHtml.onclick = (e) => {
      e.preventDefault();
      window.location.href = "api/export/html";
    };
    dom.actionSaveYaml.onclick = (e) => {
      e.preventDefault();
      syncDeckToServer().then(() => showToast("Deck salvo no arquivo local!"));
    };

    // Modo Apresentação Fullscreen
    dom.btnPresent.onclick = startPresentation;
    dom.modalClosePresent.onclick = closePresentation;


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
    dom.yamlLiveEditor.addEventListener("scroll", syncYamlScroll);
    dom.yamlModeSlide.onclick = () => setYamlMode("slide");
    dom.yamlModeDeck.onclick = () => setYamlMode("deck");
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
        if (!document.getElementById("modal-hf").classList.contains("hidden")) {
          closeHeaderFooter();
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
        closePresentation();
        return;
      }

      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

      if (e.key === "F5") {
        e.preventDefault();
        startPresentation();
      } else if (e.key === "ArrowRight" || e.key === " ") {
        if (state.currentSlideIndex < state.deck.slides.length - 1) {
          selectSlide(state.currentSlideIndex + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (state.currentSlideIndex > 0) {
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
