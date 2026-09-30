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
    "cards", "bento", "mosaic", "ribbon", "stats", "steps", "funnel", "pyramid", "list", "agenda", "timeline", "hub", "status", "onepage",
    "chart", "compare", "matrix", "decisionlab", "diagram", "infographic", "question", "poll", "image", "code", "codewalk", "spotlight", "scenography", "science", "kinetic", "video", "carousel", "duel", "terminals", "turns",
    "blocks", "dossier", "canvas", "references", "end",
  ];

  // Nome que a pessoa vê para cada layout (o YAML continua com o nome em inglês).
  const LAYOUT_LABELS = {
    cover: "Capa", section: "Seção", statement: "Frase de impacto", quote: "Citação", number: "Número grande",
    split: "Texto e figura", cards: "Cartões", stats: "Indicadores", steps: "Etapas", list: "Lista",
    timeline: "Linha do tempo", chart: "Gráfico de dados", compare: "Comparação", matrix: "Matriz 2×2",
    question: "Pergunta", poll: "Enquete", image: "Imagem", code: "Código", video: "Vídeo",
    diagram: "Diagrama", infographic: "Infográfico", mosaic: "Grade adaptável", ribbon: "Cápsulas", dossier: "Página de consulta", decisionlab: "Laboratório de decisões", science: "Fórmulas e funções", scenography: "Texto no cenário", codewalk: "Código guiado", spotlight: "Foco guiado", kinetic: "Tipografia cinética",
    duel: "Duelo de commits", terminals: "Dois terminais", turns: "Turnos a dois", carousel: "Carrossel",
    blocks: "Livre (blocos)", canvas: "Livre (posições)", end: "Encerramento", references: "Referências",
    hub: "Mapa de caminhos", status: "Status semanal", onepage: "One-page", headline: "Manchete", full: "Página inteira", bento: "Mosaico", funnel: "Funil", pyramid: "Pirâmide", agenda: "Agenda",
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
    tabBtnVars: document.getElementById("tab-btn-vars"),
    tabPanelProps: document.getElementById("tab-panel-props"),
    tabPanelChat: document.getElementById("tab-panel-chat"),
    tabPanelVars: document.getElementById("tab-panel-vars"),
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
    aiDeckMinutes: document.getElementById("ai-deck-minutes"),
    aiDeckStyle: document.getElementById("ai-deck-style"),
    aiDeckFiles: document.getElementById("ai-deck-files"),
    aiDeckLink: document.getElementById("ai-deck-link"),
    aiDeckAddLink: document.getElementById("ai-deck-add-link"),
    aiDeckMaterials: document.getElementById("ai-deck-materials"),
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
    btnAppTheme: document.getElementById("btn-app-theme"),
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
    window.SagaVisual?.setup(document.getElementById("visual-tools"));
    hydrateIcons(document); // botões do Inserir e a barra flutuante do objeto
    window.SagaProject?.setup({
      hydrate: hydrateIcons,
      contextMenu: (e, items) => contextMenu(e, items),
      toast: showToast,
      highlightYaml,
      relayout: () => requestAnimationFrame(() => { if (state.autoFit) updateCanvasScale(); }),
      reloadDeck: async () => {
        const data = await (await fetch("api/deck")).json();
        state.deck = data.spec;
        state.currentSlideIndex = Math.min(state.currentSlideIndex, state.deck.slides.length - 1);
        renderThumbnails();
        await renderCurrentSlide();
      },
      insertSlide: async (slide) => {
        const at = state.currentSlideIndex + 1;
        state.deck.slides.splice(at, 0, slide);
        state.currentSlideIndex = at;
        await syncDeckToServer();
        renderThumbnails();
        await renderCurrentSlide();
      },
    });
    window.SagaInspector?.setup(document.getElementById("inspector-body"), {
      state,
      hydrate: hydrateIcons,
      layouts: () => (state.layouts || LAYOUT_NAMES).map((n) => [n, layoutLabel(n)]),
      themes: () => Object.entries(state.themeMeta || {}).map(([k, m]) => [k, m.label || k]),
      palettes: () => Object.entries(state.palettes || {}).map(([k, m]) => [k, (m.label || k).replace(/\s*\(.*\)$/, "")]),
      // dois usos; deck antigo (aula, workshop, executiva) mostra o que tem até a pessoa escolher um dos dois
      purposes: () => [["consulta", "Para estudar depois: conteúdo denso"], ...({ aula: [["aula", "Aula (antigo: conta como estudar depois)"]], workshop: [["workshop", "Workshop (antigo)"]], executiva: [["executiva", "Executiva (antigo)"]] }[state.deck?.purpose] || [])],
      changeLayout: (name) => changeCurrentLayout(name),
      applyLook: (kind, name, scope) => applyLook(kind, name, scope),
      commit: () => { syncDeckToServer(); renderCurrentSlide(); renderThumbnails(); },
      // como no Figma: clicar num objeto com o painel em Formatar mostra as propriedades dele; soltar a seleção volta
      onSelection: (els, why) => {
        const open = !dom.inspectorSidebar.classList.contains("collapsed");
        if (els.length && why === "user" && open && currentPane() === "props") { state.autoInspect = true; openPane("inspect"); }
        // soltou a seleção, trocou de slide com algo selecionado: o conteúdo do slide volta a ficar à mão
        else if (!els.length && state.autoInspect && currentPane() === "inspect") { state.autoInspect = false; openPane("props"); }
      },
      openContent: () => { state.autoInspect = false; openPane("props"); },
    });
    // Transformar em material de consulta: o mesmo deck, para distribuir e guardar (a IA decide como, pela referência)
    document.getElementById("btn-ai-reference").onclick = async () => {
      if (dom.chatSend.disabled) return;
      await refreshAIStatus(true);
      if (!state.ai.available) { openAISettings(); return; }
      openPane("chat");
      dom.chatInput.value = `Transforme esta apresentação em material de consulta (purpose: consulta), para o público guardar e consultar depois. Mantenha todo o conteúdo e a ordem. Traga a explicação das notas para os slides, em parágrafos curtos que explicam o porquê; complete os exemplos e o código (divida código com mais de ~16 linhas em slides de continuação); tire o que só faz sentido ao vivo (slides só de título de seção, quiz, enquete, perguntas para a plateia, números de impacto sem fonte). Se o tema for escuro e tiver versão clara, pode sugerir a clara para imprimir. Explique brevemente o que mudou.`;
      handleChatSubmit();
    };
    document.getElementById("btn-ai-review").onclick = async () => {
      if (dom.chatSend.disabled) return;
      await refreshAIStatus(true);
      if (!state.ai.available) { openAISettings(); return; }
      openPane("chat");
      dom.chatInput.value = `Analise visualmente a imagem renderizada do slide ${state.currentSlideIndex + 1}. Avalie hierarquia, legibilidade, espaço, alinhamento, composição e intenção narrativa. Aplique melhorias somente neste slide, preservando conteúdo e significado. Explique brevemente o que mudou. Se não tiver recebido a imagem ou não conseguir enxergá-la, diga isso explicitamente e não finja uma revisão visual.`;
      handleChatSubmit();
    };
    buildLayoutPicker();
    bindLookMenu();
    bindLookStrips();
    // vindo da biblioteca: /editor?deck=<id>[&present=1], ou um modelo em prévia: /editor?model=<tipo>[&topic=…]
    const params = new URLSearchParams(location.search);
    if (params.get("model")) {
      try {
        const r = await fetch("api/library/decks/model-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: params.get("model"), topic: params.has("topic") ? params.get("topic") : "Modelos" }) });
        if (!r.ok) showToast("Não deu para abrir o modelo: " + ((await r.json().catch(() => ({}))).error || r.status), 6000);
      } catch {}
    } else if (params.get("deck")) {
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
      state.palettes = data.palettes || {};
      state.layouts = data.layouts || LAYOUT_NAMES;
      state.file = data.file || null;
      state.preview = data.preview || null;
      syncPreviewBanner();

      buildThemeGallery();
      dom.deckTitle.value = state.deck.title || "";
      if (state.deck.theme) dom.themeSelect.value = state.deck.theme;
      updateSaveStatus();

      renderThumbnails();
      selectSlide(0);
      loadChatHistory();
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
    if (dom.tabPanelVars.classList.contains("active")) renderStudioSavedVars();

    dom.currentSlideLabel.textContent = `Slide ${idx + 1} de ${state.deck.slides.length}`;
    dom.currentLayoutBadge.textContent = layoutLabel(slide.layout);
    dom.toneSelect.value = slide.tone || "light";
    dom.decoSelect.value = slide.deco || "none";
    document.getElementById("advanced-density-select").value = ["compact", "dense"].includes(slide.density) ? slide.density : "";
    updateVariantButtons();
    dom.slideNotesInput.value = slide.notes || "";
    dom.slideTimeInput.value = slide.time || 1;
    syncThemeGallery();
    syncMotionMenu();

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
      window.SagaScience?.dispose(dom.renderedSlideContainer);
      dom.renderedSlideContainer.innerHTML = data.html;
      window.SagaScience?.mount(dom.renderedSlideContainer);
      window.SagaDiagrams?.mount(dom.renderedSlideContainer).then(() => reportDiagram(dom.renderedSlideContainer));
      window.SagaDecisionLab?.mount(dom.renderedSlideContainer);
      applyEditorStep(idx);
      fitSlideText(dom.renderedSlideContainer);
      // a miniatura deste slide usa o mesmo HTML (acompanha cada edição)
      putThumb(idx, slide, data.html);

      // Habilitar edição WYSIWYG inline
      enableInlineEditing();
      window.SagaVisual?.mount(dom.renderedSlideContainer, slide, () => { syncDeckToServer(); renderCurrentSlide(); });

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
  async function inspectGeometry() {
    let slideEl = dom.renderedSlideContainer.querySelector(".slide");
    if (!slideEl) return;
    // mede o slide parado: no meio da animação de entrada os elementos ainda estão deslocados (34px para baixo)
    // e o fiscal acusaria "fora da margem" (e a auto-correção encolheria o título) sem motivo
    await Promise.all(slideEl.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
    if (!slideEl.isConnected) return;

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
      slideEl.querySelectorAll(".ttl, .sub, .kicker, .card, .st-line, .q-text, .nm-val, .figbox, .cp-col, .rf, .adaptive-item, .code")
    ).filter((e) => {
      const cs = window.getComputedStyle(e);
      return cs.display !== "none" && cs.visibility !== "hidden" && e.offsetWidth > 0;
    });

    // 0. Código que não coube nem no tamanho mínimo (fit.js marcou data-code-cut): na apresentação rola, no PDF corta
    slideEl.querySelectorAll(".code[data-code-cut]").forEach((el) => {
      state.issues.push({ kind: "codigo-cortado", text: label(el), px: Math.round(el.scrollHeight - el.clientHeight), logical: toLogical(R(el)) });
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

      if (el.matches(".ttl, .sub, .card, .st-line, .q-text, .cp-col, .rf")) {
        const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
        if (Number.isFinite(fontSize) && fontSize < 16 && label(el).length > 12) {
          state.issues.push({
            kind: "texto-pequeno",
            text: label(el),
            px: Math.round(fontSize),
            logical: r,
          });
        }
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

    // "Deixar assim": a pessoa aceitou o slide como está; enquanto ele não mudar, nada de aviso nem marcação
    const accepted = state.deck?.slides?.[state.currentSlideIndex];
    if (accepted?.fiscalOk && accepted.fiscalOk === slideFingerprint(accepted)) state.issues = [];
    // Atualizar badge do fiscal (faixa Revisar) e a barra de status
    const count = state.issues.length;
    dom.fiscalBadge.textContent = count;
    if (count === 0) {
      dom.fiscalBadge.className = "fiscal-badge clean";
      dom.fiscalBadge.title = "Sem problemas detectados de layout ou legibilidade";
      dom.statusIssues.textContent = "";
      dom.statusIssues.classList.remove("warn");
    } else {
      dom.fiscalBadge.className = "fiscal-badge warn";
      dom.fiscalBadge.title = `${count} problema(s) de layout ou legibilidade`;
      dom.statusIssues.textContent = count === 1 ? "1 problema no slide" : `${count} problemas no slide`;
      dom.statusIssues.title = "Clique para abrir a revisão do slide";
      dom.statusIssues.classList.add("warn");
    }

    renderFixPanel();

    // Desenhar caixas no overlay se ativado
    if (state.showInspectorOverlay) {
      renderInspectorBoxes();
    }
  }

  // Painel do fiscal: em vez de só um número vermelho, o que está errado e o que dá para fazer
  const ISSUE_LABEL = { "codigo-cortado": () => "Código não coube nem no tamanho mínimo: divida em dois slides ou reduza o mínimo em Preferências", "passa-da-margem-inferior": (i) => `Texto fora da margem (+${i.px}px)`, "fora-do-slide": () => "Texto fora do slide", "estouro-horizontal": () => "Texto estourando a largura", "texto-pequeno": (i) => `Texto pequeno (${i.px}px)`, sobreposicao: () => "Elementos um em cima do outro" };
  // impressão digital do conteúdo do slide (sem anotações, tempo e a própria marca): mudou algo, muda a impressão
  function slideFingerprint(slide) {
    const { fiscalOk, notes, time, auto, ...rest } = slide || {};
    let h = 5381;
    for (const ch of JSON.stringify(rest)) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return (h >>> 0).toString(36);
  }
  function renderFixPanel() {
    const panel = document.getElementById("fix-panel");
    if (!panel) return;
    const slide = state.deck?.slides?.[state.currentSlideIndex];
    if (!state.issues.length || !slide) { panel.classList.add("hidden"); panel.innerHTML = ""; return; }
    const kinds = [...new Set(state.issues.map((i) => i.kind))];
    const lines = [...new Map(state.issues.map((i) => [i.kind + i.text, i])).values()].slice(0, 3)
      .map((i) => `<li>${escHtml((ISSUE_LABEL[i.kind] || (() => i.kind))(i))}${i.text ? `: <em>${escHtml(i.text)}</em>` : ""}</li>`).join("");
    const overflow = kinds.some((k) => !["sobreposicao", "texto-pequeno", "codigo-cortado"].includes(k));
    const codeCut = kinds.includes("codigo-cortado") && ["code", "codewalk"].includes(slide.layout) && typeof slide.code === "string";
    const buttons = [
      codeCut ? ["split-code", "copy", "Dividir em dois slides", "Metade do código fica aqui e a outra metade num slide de continuação"] : null,
      overflow ? ["auto", "wand", "Ajustar sozinho", "Diminui o texto ou reorganiza até caber"] : null,
      overflow && slide.density !== "compact" && slide.density !== "dense" ? ["compact", "minimize-2", "Modo compacto", "Menos espaço entre os elementos deste slide"] : null,
      state.ai?.available ? ["ai", "sparkles", "Pedir para a IA", "A IA arruma sem perder conteúdo (ou divide em dois slides)"] : null,
      ["ignore", "x", "Deixar assim", "O slide está bom: some o aviso e a marcação até o slide mudar"],
    ].filter(Boolean);
    panel.innerHTML = `<div class="fix-head"><i class="ic" data-ic="circle-alert"></i><b>${state.issues.length === 1 ? "1 aviso de layout ou leitura" : `${state.issues.length} avisos de layout ou leitura`} neste slide</b></div><ul>${lines}</ul><div class="fix-actions">${buttons.map(([k, ic, label, title]) => `<button type="button" class="fix-btn${k === "auto" ? " primary" : ""}" data-fix="${k}" title="${title}"><i class="ic" data-ic="${ic}"></i><span>${label}</span></button>`).join("")}</div>`;
    panel.classList.remove("hidden");
    hydrateIcons(panel);
    panel.querySelectorAll("[data-fix]").forEach((b) => b.onclick = () => applyFix(b.dataset.fix));
  }
  async function applyFix(kind) {
    const idx = state.currentSlideIndex, slide = state.deck.slides[idx];
    if (kind === "ignore") {
      slide.fiscalOk = slideFingerprint(slide); // vai no deck: vale depois de recarregar, até o slide mudar
      syncDeckToServer();
      state.issues = [];
      dom.inspectorOverlay.innerHTML = "";
      await renderCurrentSlide();
      return;
    }
    if (kind === "auto") return triggerAutofix();
    if (kind === "split-code") {
      // código que não coube: metade aqui, metade num slide de continuação (os destaques de linha acompanham)
      const lines = slide.code.split("\n"), half = Math.ceil(lines.length / 2);
      const hl = [].concat(slide.highlight || []).map(Number).filter(Number.isFinite);
      const next = JSON.parse(JSON.stringify(slide));
      slide.code = lines.slice(0, half).join("\n");
      next.code = lines.slice(half).join("\n");
      if (hl.length) { slide.highlight = hl.filter((n) => n <= half); next.highlight = hl.filter((n) => n > half).map((n) => n - half); }
      next.title = `${slide.title || "Código"} (continuação)`;
      delete next.notes; delete next.visualEdits; delete next.id;
      state.deck.slides.splice(idx + 1, 0, next);
      syncDeckToServer(); renderThumbnails(); await renderCurrentSlide();
      showToast(`Código dividido: ${half} linhas aqui, ${lines.length - half} no slide ${idx + 2}.`);
      return;
    }
    if (kind === "compact") {
      slide.density = "compact";
      syncDeckToServer(); await renderCurrentSlide(); renderThumbnails();
      showToast(`Slide ${idx + 1} em modo compacto`);
      return;
    }
    if (kind === "ai") {
      const what = [...new Set(state.issues.map((i) => (ISSUE_LABEL[i.kind] || (() => i.kind))(i)))].join("; ");
      openPane("chat");
      dom.chatInput.value = `O slide ${idx + 1} tem problema de layout (${what}). Arrume sem perder conteúdo; se não couber mesmo, divida em dois slides.`;
      handleChatSubmit();
    }
  }
  function openIssueReview() {
    if (state.issues.some((issue) => issue.kind !== "texto-pequeno")) return triggerAutofix();
    openPane("props");
    document.getElementById("fix-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Renderizar Caixas de Alerta Visuais no Canvas
  function renderInspectorBoxes() {
    dom.inspectorOverlay.innerHTML = "";
    if (state.issues.length === 0) return;

    state.issues.forEach((issue) => {
      if (!issue.logical) return;
      const box = document.createElement("div");
      box.className = issue.kind === "texto-pequeno" ? "issue-bounding-box issue-info" : "issue-bounding-box";
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
      if (issue.kind === "texto-pequeno") tagText = `Texto pequeno (${issue.px}px)`;
      if (issue.kind === "codigo-cortado") tagText = "Código não coube";
      tag.textContent = `${tagText}: ${issue.text}`;
      box.appendChild(tag);

      dom.inspectorOverlay.appendChild(box);
    });
  }

  // ==========================================================================
  // AUTO-CORREÇÃO AUTOMÁTICA ("corrigir sozinho")
  // ==========================================================================
  // Arrumar layout: o fiscal corrige o slide atual (sobreposição, margem, título comprido, texto demais) e diz o que fez
  async function triggerAutofix() {
    try {
      const idx = state.currentSlideIndex;
      const before = structuredClone(state.deck.slides[idx]);
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
        if (!data.actions?.length) { showToast("Nada para arrumar: o slide já está em ordem."); return; }
        showToast(`Arrumado: ${data.actions.join("; ")}`, 9000, { label: "Desfazer", fn: () => {
          state.deck.slides[idx] = before;
          syncDeckToServer(); renderCurrentSlide(); renderThumbnails();
        } });
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
    // nenhuma das opções serve: a pessoa escreve a sua (a IA entende texto livre)
    const other = document.createElement("button");
    other.type = "button";
    other.className = "bs-option bs-option-other";
    other.innerHTML = '<i class="ic" data-ic="pencil"></i><span>Outra resposta…</span>';
    other.onclick = () => {
      dom.chatInput.value = "";
      dom.chatInput.placeholder = "Escreva a sua resposta…";
      dom.chatInput.focus();
    };
    row.append(other);
    hydrateIcons(row);
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
        saveChatHistory();
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

    // Adicionar bolha do usuário (com os anexos: imagens e documentos)
    const bubble = appendChatMessage("user", message);
    if (state.chatAttachments.length) {
      const row = document.createElement("div");
      row.className = "msg-atts";
      state.chatAttachments.forEach((a) => {
        if (a.t === "img") { const img = document.createElement("img"); img.src = a.url; row.appendChild(img); }
        else { const chip = document.createElement("span"); chip.className = "msg-doc"; chip.innerHTML = `<i class="ic" data-ic="file-text"></i> `; hydrateIcons(chip); chip.appendChild(document.createTextNode(a.name)); row.appendChild(chip); }
      });
      bubble.querySelector(".user-content")?.appendChild(row);
    }
    dom.chatInput.value = "";
    autoGrowChat();

    // a IA sempre sabe qual slide está na tela; outros slides (ou o deck todo) a pessoa diz no pedido
    const targetIdx = state.currentSlideIndex;

    // Indicador de progresso ao vivo (etapa, segundos, texto chegando)
    const work = createProgressBubble(state.ai.available
      ? `Enviando para o LLM (${state.ai.textModel})…`
      : "Verificando se a IA está no ar…");
    dom.chatSend.disabled = true;
    dom.chatInput.disabled = true;
    // a conversa inteira deste deck (o servidor compacta as mensagens antigas; nada é esquecido)
    const history = state.chatHistory.slice();
    const baseDeck = JSON.parse(JSON.stringify(state.deck));
    if (state.chatAttachments.some((a) => a.t === "doc" && !a.id)) {
      showToast("Aguarde a leitura do anexo antes de enviar.", 4000);
      return;
    }
    state.chatHistory.push({ role: "user", text: message });
    // imagens vão embutidas (como antes); documentos vão por id (o texto já está no servidor)
    const attachments = state.chatAttachments.map((a) => (a.t === "img" ? a.url : { type: "doc", id: a.id }));
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
        autoRun: !!state.autoRunCommands, // a pessoa liberou os comandos desta conversa (só enquanto a página está aberta)
      }, (ev) => { if (!commandEvent(ev)) work.update(ev); });
      if (!data.spec) throw new Error(data.error || "resposta sem deck");
      // conversa salva antes de dispensar o indicador: quem espera o fim da resposta já encontra o arquivo gravado
      const finishWork = async () => { await saveChatHistory(); work.done(); };
      if (data.variants) {
        state.chatHistory.push({ role: "assistant", text: `${data.reply}\n(versões: ${data.variants.options.map((o) => o.label).join(" | ")})`, talk: true });
        await finishWork();
        const msg = appendChatMessage("ai", data.reply, data.actions);
        await renderVariants(msg, data.variants);
        updateBrainstormApply();
        return;
      }
      if (data.talk) {
        // conversa: nada muda nos slides (com a IA desligada o aviso não entra na conversa com o modelo)
        if (data.mode === "off") state.chatHistory.pop();
        else state.chatHistory.push({ role: "assistant", text: data.reply + (data.options?.length ? `\n(opções: ${data.options.join(" | ")})` : ""), talk: true });
        await finishWork();
        const msg = appendChatMessage("ai", data.reply, data.actions);
        msg.classList.add("bs");
        const tag = document.createElement("div");
        tag.className = "bs-tag";
        tag.innerHTML = '<i class="ic" data-ic="message-square-text"></i> Conversa — nada mudou nos slides'; hydrateIcons(tag);
        msg.querySelector(".ai-content").prepend(tag);
        renderChatOptions(msg, data.options);
        updateBrainstormApply();
        if (data.mode === "off") refreshAIStatus(); // o selo "IA ligada/desligada" acompanha
        return;
      }
      state.chatHistory.push({ role: "assistant", text: data.reply });

      // Atualizar o deck com as modificações da IA sem perder o que a pessoa mexeu enquanto ela pensava
      // (junção a três: base = o deck quando o pedido saiu; ver merge-decks.js)
      const merged = window.SagadeckMerge.mergeDecks(baseDeck, state.deck, data.spec);
      state.deck = merged.deck;
      if (JSON.stringify(merged.deck) !== JSON.stringify(data.spec)) syncDeckToServer();
      const conflicts = [...(data.conflicts || []), ...merged.conflicts];
      if (merged.kept || data.kept) showToast("Você reorganizou os slides enquanto a IA trabalhava: mantive a sua versão. Peça de novo se quiser a mudança dela.", 7000);
      else if (conflicts.length) showToast(`O slide ${[...new Set(conflicts)].map((i) => i + 1).join(", ")} mudou dos dois lados enquanto a IA trabalhava: ficou a sua versão.`, 7000);
      if (typeof data.targetSlide === "number" && data.targetSlide < state.deck.slides.length) {
        state.currentSlideIndex = data.targetSlide;
      }

      // Re-renderizar
      renderThumbnails();
      await renderCurrentSlide();

      // Substituir o indicador pela resposta completa
      await finishWork();
      appendChatMessage("ai", data.reply, data.actions);
      updateBrainstormApply();
    } catch (err) {
      work.fail(err.message);
    } finally {
      dom.chatSend.disabled = false;
      dom.chatInput.disabled = false;
      dom.chatInput.focus();
      await saveChatHistory();
    }
  }

  // A conversa é desta apresentação e fica ao lado dela (<deck>.conversa.json): volta ao reabrir o deck.
  // Devolve a promise: quem chama espera antes de liberar a tela, senão recarregar na mesma hora perde a troca.
  function saveChatHistory() {
    return fetch("api/chat/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history: state.chatHistory }) }).catch(() => {});
  }
  // ---- comandos da IA: nada roda sem a pessoa ver o código e clicar (a liberação vale só nesta página e neste deck) ----
  state.autoRunCommands = false;
  function commandCard(cmd) {
    const msg = appendChatMessage("ai", "");
    msg.classList.add("cmd-msg");
    const box = msg.querySelector(".ai-content");
    box.innerHTML = `<div class="cmd-head"><i class="ic" data-ic="terminal"></i><b></b></div><div class="cmd-why"></div><pre class="cmd-code"></pre><div class="cmd-actions"></div>`;
    box.querySelector("b").textContent = `A IA quer rodar um comando (${cmd.language})`;
    box.querySelector(".cmd-why").textContent = cmd.why || "";
    box.querySelector(".cmd-code").textContent = cmd.code;
    hydrateIcons(box);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    return box;
  }
  function commandEvent(ev) {
    if (ev.type !== "progress") return false;
    if (ev.phase === "approve" && ev.command) {
      const box = commandCard(ev.command), acts = box.querySelector(".cmd-actions");
      acts.innerHTML = `<button type="button" class="btn btn-primary" data-d="run"><i class="ic" data-ic="play"></i> Executar</button><button type="button" class="btn" data-d="always">Executar e liberar os próximos</button><button type="button" class="btn" data-d="deny"><i class="ic" data-ic="x"></i> Não executar</button>`;
      hydrateIcons(acts);
      acts.querySelectorAll("[data-d]").forEach((b) => b.onclick = async () => {
        const decision = b.dataset.d;
        if (decision === "always") state.autoRunCommands = true;
        acts.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        try { await fetch("api/ai/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, decision }) }); } catch {}
        acts.innerHTML = `<span class="cmd-state">${decision === "deny" ? "Não executado" : decision === "always" ? "Executando (próximos liberados nesta conversa)" : "Executando…"}</span>`;
        if (decision !== "deny") box.dataset.waiting = "1"; // o resultado vem para este cartão
      });
      return false; // a linha de progresso também mostra "Esperando você autorizar"
    }
    if (ev.phase === "command" && ev.command) {
      // aprovado agora: o cartão já está na tela; liberado antes: aparece um cartão novo, já rodando
      if (!document.querySelector(".cmd-msg [data-waiting]")) {
        const box = commandCard(ev.command);
        box.dataset.waiting = "1";
        box.querySelector(".cmd-actions").innerHTML = `<span class="cmd-state">Executando (liberado nesta conversa)…</span>`;
      }
      return false;
    }
    if (ev.phase === "command-result") {
      const box = document.querySelector(".cmd-msg [data-waiting]");
      if (box) {
        delete box.dataset.waiting;
        const r = ev.result || {}, ok = r.exitCode === 0 && !r.timedOut;
        const st = box.querySelector(".cmd-state") || box.querySelector(".cmd-actions");
        st.textContent = r.timedOut ? "Tempo esgotado" : ok ? "Rodou (saída 0)" : `Rodou com erro (saída ${r.exitCode ?? "?"})`;
        st.classList.toggle("cmd-bad", !ok);
        const out = document.createElement("details");
        out.className = "cmd-out";
        out.innerHTML = "<summary>Ver a saída</summary><pre></pre>";
        out.querySelector("pre").textContent = [r.stdout, r.stderr].filter(Boolean).join("\n").slice(0, 6000) || "(sem saída)";
        box.appendChild(out);
      }
      return false;
    }
    return false;
  }

  async function loadChatHistory() {
    state.autoRunCommands = false; // outra apresentação: nada fica liberado
    try {
      const { history } = await (await fetch("api/chat/history")).json();
      state.chatHistory = Array.isArray(history) ? history : [];
      state.loadingHistory = true; // conversa guardada não é resposta nova (o atalho do chat não acende)
      setTimeout(() => { state.loadingHistory = false; });
      // o que ficou entre parênteses no fim ("opções: …") é para o modelo; na tela, só a mensagem
      for (const m of state.chatHistory) appendChatMessage(m.role === "user" ? "user" : "ai", String(m.text).replace(/\n\((opções|versões): [^\n]*\)$/, ""));
    } catch { state.chatHistory = []; }
  }

  // ---- anexos do chat (imagem: colar/arrastar/escolher · documento: escolher → o servidor lê) ----
  state.chatAttachments = [];
  function clearChatAttachments() {
    state.chatAttachments = [];
    renderChatAttachments();
  }
  function renderChatAttachments() {
    const box = dom.chatAttachments;
    box.hidden = !state.chatAttachments.length;
    box.innerHTML = "";
    state.chatAttachments.forEach((a, i) => {
      const it = document.createElement("div");
      it.className = "chat-att";
      if (a.t === "img") {
        it.innerHTML = `<img alt=""><button type="button" title="Remover"><i class="ic" data-ic="x"></i></button>`; hydrateIcons(it);
        it.querySelector("img").src = a.url;
      } else {
        it.innerHTML = `<span class="chat-doc" title="${escHtml(a.name)}"><i class="ic" data-ic="file-text"></i><b>${escHtml(a.name)}</b><small>${a.chars} caracteres</small></span><button type="button" title="Remover"><i class="ic" data-ic="x"></i></button>`; hydrateIcons(it);
      }
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
      state.chatAttachments.push({ t: "img", url: c.toDataURL("image/jpeg", 0.85) });
      URL.revokeObjectURL(img.src);
      renderChatAttachments();
      openPane("chat");
    };
    img.src = URL.createObjectURL(file);
  }
  // documento (pdf, docx, xlsx, pptx, txt…): sobe na hora; o servidor extrai o texto e devolve um id.
  // O binário nunca vai para a IA — só o texto extraído, na hora de enviar a mensagem.
  function addChatDoc(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast("Arquivo grande demais (limite 15 MB)."); return; }
    const provisional = { t: "doc", id: null, name: file.name, chars: "lendo…" };
    state.chatAttachments.push(provisional);
    renderChatAttachments();
    openPane("chat");
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const res = await fetch("api/ai/context", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, dataUrl: rd.result }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
        Object.assign(provisional, { id: data.id, chars: data.chars });
      } catch (e) {
        state.chatAttachments.splice(state.chatAttachments.indexOf(provisional), 1);
        showToast(`Não deu para ler "${file.name}": ${e.message}`, 6000);
      }
      renderChatAttachments();
    };
    rd.readAsDataURL(file);
  }
  function addChatFile(file) {
    if (!file) return;
    window.SagaProject?.uploadFile(file, "contexto").then(() => window.SagaProject.refreshTree()).catch(() => {}); // sem projeto: só na conversa
    if (file.type.startsWith("image/")) addChatImage(file);
    else addChatDoc(file);
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
    // resposta da IA com o chat fora da vista: o atalho flutuante acende (some quando o chat abre)
    if (sender !== "user" && !state.loadingHistory && currentPane() !== "chat") document.getElementById("chat-badge")?.classList.add("show");
    const msgDiv = document.createElement("div");
    msgDiv.className = sender === "user" ? "user-msg" : "ai-msg";

    const avatar = document.createElement("div");
    avatar.className = sender === "user" ? "user-avatar" : "ai-avatar";
    if (sender === "user") avatar.textContent = "EU"; else { avatar.innerHTML = '<i class="ic" data-ic="sparkles"></i>'; hydrateIcons(avatar); }
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
        pill.innerHTML = `<i class="ic" data-ic="${/falhou|falha|erro|não enxerga/i.test(a) ? "circle-alert" : "check"}"></i> ${escHtml(a)}`; hydrateIcons(pill);
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
    showToast(`Card com ícone "${state.selectedIcon.name}" adicionado!`);
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
    showToast(`Ícone "${state.selectedIcon.name}" definido como figura principal!`);
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
    showToast(`Ícone "${state.selectedIcon.name}" adicionado ao canvas livre!`);
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
        dom.arcStatusBadge.textContent = ok ? "Variado" : "Repetitivo";
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
      showToast("Teste da Última Fileira: simula visualização distante ou em tela pequena");
      playHaptic("snap");
    }
  }

  function toggleHeatmap() {
    state.isHeatmap = !state.isHeatmap;
    dom.btnHeatmap.classList.toggle("active", state.isHeatmap);
    renderHeatmap();
    if (state.isHeatmap) {
      showToast("Heatmap de Atenção: simulação de foco visual nos primeiros 2 segundos");
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
      label: "Inserir ícone",
      fn: () => {
        openIconPicker();
      }
    });

    actions.push({
      label: "==Destaque==",
      fn: () => {
        document.execCommand("insertText", false, `==${text}==`);
        playHaptic("snap");
      }
    });

    actions.push({
      label: "Auto-ajustar",
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
    { title: "Arrumar layout do slide", cat: "Revisar", ic: "wand", fn: () => triggerAutofix() },
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

  // Tema (fonte, arranjo, ornamentos) e paleta (cores) são duas escolhas, como no PowerPoint. Clique = a
  // apresentação toda (e desfaz o que era só de um slide); botão direito = menu com "Só neste slide".
  const lookLabel = (kind, name) => kind === "theme" ? (state.themeMeta?.[name]?.label || name) : name === "tema" ? "Do tema" : (state.palettes?.[name]?.label || name);
  // Prévia ao passar o mouse num tema ou paleta: o slide aberto aparece com aquele visual, sem gravar nada; tirar
  // o mouse volta ao que era; o clique aplica. O CSS da prévia vai numa <style> à parte, que sai no fim.
  let previewTimer = null, previewing = null;
  function previewLook(kind, name) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const key = kind === "theme" ? "theme" : "palette";
      const idx = state.currentSlideIndex, slide = state.deck?.slides?.[idx];
      if (!slide) return;
      const spec = { ...state.deck, [key]: name };
      if (key === "palette" && name === "tema") delete spec.palette;
      const s = { ...slide };
      delete s[key]; // o clique aplica na apresentação toda (e tira o que era só deste slide): a prévia mostra isso
      previewing = { kind, name };
      const seq = ++renderSeq;
      try {
        const res = await fetch("api/render-slide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slide: s, index: idx, spec }) });
        const data = await res.json();
        if (seq !== renderSeq || !previewing || previewing.name !== name) return;
        let st = document.getElementById("sagadeck-preview-styles");
        if (!st) { st = document.createElement("style"); st.id = "sagadeck-preview-styles"; document.head.appendChild(st); }
        st.textContent = data.themeCSS || "";
        const box = dom.renderedSlideContainer;
        window.SagaScience?.dispose(box);
        box.innerHTML = data.html;
        window.SagaScience?.mount(box);
        window.SagaDiagrams?.mount(box);
        fitSlideText(box);
        const badge = document.getElementById("look-preview-badge");
        badge.textContent = `Prévia: ${lookLabel(kind, name)}. Clique para aplicar.`;
        badge.classList.remove("hidden");
      } catch { /* prévia é só conforto: se falhar, nada muda */ }
    }, 160);
  }
  // fim da prévia; restore=false quando o clique já vai redesenhar o slide
  function endPreview(restore = true) {
    clearTimeout(previewTimer);
    if (!previewing) return;
    previewing = null;
    document.getElementById("sagadeck-preview-styles")?.remove();
    document.getElementById("look-preview-badge")?.classList.add("hidden");
    if (restore) renderCurrentSlide();
  }

  function applyLook(kind, name, scope = "all") {
    endPreview(false);
    const key = kind === "theme" ? "theme" : "palette";
    const slide = state.deck.slides[state.currentSlideIndex];
    if (scope === "all") {
      if (key === "palette" && name === "tema") delete state.deck.palette; else state.deck[key] = name;
      state.deck.slides.forEach((s) => delete s[key]);
      if (key === "theme") dom.themeSelect.value = name;
    } else if (scope === "slide" && slide) {
      // paleta "tema" num slide só precisa ficar escrita se o deck tiver outra paleta
      if (key === "palette" && name === "tema" && !state.deck.palette) delete slide.palette; else slide[key] = name;
    } else if (scope === "reset" && slide) delete slide[key];
    syncDeckToServer();
    renderCurrentSlide();
    renderThumbnails();
    const what = kind === "theme" ? "Tema" : "Paleta";
    showToast(scope === "reset" ? `${what}: o slide ${state.currentSlideIndex + 1} voltou ao da apresentação` : `${what}: ${lookLabel(kind, name)}${scope === "slide" ? ` só no slide ${state.currentSlideIndex + 1}` : ""}`);
    playHaptic("snap");
  }
  const changeTheme = (themeName) => applyLook("theme", themeName);

  function openLookMenu(e, kind, name) {
    e.preventDefault();
    const menu = document.getElementById("look-menu");
    menu.dataset.kind = kind;
    menu.dataset.name = name;
    menu.classList.remove("hidden");
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
    menu.querySelector('[data-scope="slide"]').focus();
  }
  function bindLookMenu() {
    const menu = document.getElementById("look-menu");
    const close = () => menu.classList.add("hidden");
    menu.querySelectorAll("[data-scope]").forEach((b) => b.onclick = () => { close(); applyLook(menu.dataset.kind, menu.dataset.name, b.dataset.scope); });
    document.addEventListener("pointerdown", (e) => { if (!menu.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  function buildPaletteGallery() {
    const gal = document.getElementById("palette-gallery");
    if (!gal) return;
    gal.innerHTML = "";
    const entries = [["tema", { label: "Do tema", colors: [] }], ...Object.entries(state.palettes || {})];
    for (const [n, m] of entries) {
      const card = document.createElement("button");
      card.className = "theme-card palette-card";
      card.dataset.palette = n;
      card.title = `${m.label}. Clique: todos os slides. Botão direito: só neste slide.`;
      card.innerHTML = `<span class="pc-sw"></span><span class="tc-name"></span>`;
      const sw = card.querySelector(".pc-sw");
      if (m.colors.length) m.colors.forEach((c) => { const i = document.createElement("i"); i.style.background = c; sw.append(i); });
      else sw.innerHTML = '<i class="ic" data-ic="palette"></i>';
      card.querySelector(".tc-name").textContent = m.label.replace(/\s*\(.*\)$/, ""); // "Rubi (vermelho discreto)": o cartão mostra o nome, a dica o resto
      card.onclick = () => applyLook("palette", n);
      card.onmouseenter = () => previewLook("palette", n);
      card.onmouseleave = () => endPreview();
      card.oncontextmenu = (e) => { endPreview(); openLookMenu(e, "palette", n); };
      gal.appendChild(card);
    }
    hydrateIcons(gal);
  }

  // Faixas de tema e paleta (padrão da galeria do PowerPoint): só cartões inteiros, sem barra de rolagem; as setas
  // passam de página e "Ver todos" abre a mesma galeria em grade logo abaixo (os mesmos cartões: prévia e clique valem).
  const LOOK_STEP = 112; // cartão 104 + espaço 8
  function fitLookStrip(strip) {
    const gal = strip.querySelector(".theme-gallery");
    if (strip.classList.contains("open")) return;
    if (!strip.parentElement.clientWidth) return; // aba escondida: mede quando aparecer
    const room = strip.parentElement.clientWidth - strip.querySelector(".look-ctrl").offsetWidth - 2;
    const n = Math.max(1, Math.floor((room + 8) / LOOK_STEP));
    gal.style.width = `${n * LOOK_STEP - 8}px`;
    syncLookNav(strip);
  }
  function syncLookNav(strip) {
    const gal = strip.querySelector(".theme-gallery");
    const [prev, next] = strip.querySelectorAll(".look-nav");
    prev.disabled = gal.scrollLeft <= 1;
    next.disabled = gal.scrollLeft + gal.clientWidth >= gal.scrollWidth - 1;
  }
  function closeLookAll(strip) {
    if (!strip?.classList.contains("open")) return;
    strip.classList.remove("open");
    const gal = strip.querySelector(".theme-gallery");
    gal.style.left = gal.style.top = "";
    strip.querySelector(".look-all").setAttribute("aria-expanded", "false");
    fitLookStrip(strip);
    gal.querySelector(".theme-card.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function bindLookStrips() {
    const strips = [...document.querySelectorAll(".look-strip")];
    const ro = new ResizeObserver(() => strips.forEach(fitLookStrip));
    strips.forEach((strip) => {
      const gal = strip.querySelector(".theme-gallery");
      ro.observe(strip.parentElement);
      gal.addEventListener("scroll", () => syncLookNav(strip), { passive: true });
      gal.addEventListener("wheel", (e) => { if (!strip.classList.contains("open") && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); gal.scrollBy({ left: e.deltaY }); } }, { passive: false });
      strip.querySelectorAll(".look-nav").forEach((b) => b.onclick = () => gal.scrollBy({ left: Number(b.dataset.dir) * Math.max(LOOK_STEP, gal.clientWidth + 8), behavior: "smooth" }));
      strip.querySelector(".look-all").onclick = () => {
        if (strip.classList.contains("open")) return closeLookAll(strip);
        strips.forEach(closeLookAll);
        const r = strip.getBoundingClientRect();
        strip.style.setProperty("--strip-w", `${strip.offsetWidth}px`);
        strip.classList.add("open");
        gal.style.top = `${Math.round(r.bottom + 6)}px`;
        gal.style.left = `${Math.round(Math.min(r.left, window.innerWidth - Math.min(640, window.innerWidth - 16) - 8))}px`;
        strip.querySelector(".look-all").setAttribute("aria-expanded", "true");
      };
      gal.addEventListener("click", (e) => { if (e.target.closest(".theme-card")) closeLookAll(strip); });
    });
    document.addEventListener("pointerdown", (e) => strips.forEach((s) => { if (!s.contains(e.target) && !e.target.closest("#look-menu")) closeLookAll(s); }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") strips.forEach(closeLookAll); });
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
      card.onmouseenter = () => previewLook("theme", n);
      card.onmouseleave = () => endPreview();
      card.oncontextmenu = (e) => { endPreview(); openLookMenu(e, "theme", n); };
      card.title += ". Clique: todos os slides. Botão direito: só neste slide.";
      dom.themeGallery.appendChild(card);
    });
    buildPaletteGallery();
    syncThemeGallery();
    document.querySelectorAll(".look-strip").forEach(fitLookStrip);
  }

  // Identidade: as fontes (e a paleta) da empresa, do arquivo local identidades.yaml. O deck só guarda o nome.
  // Fonte instalada? Mede um texto com ela e com as genéricas: se sai igual às duas, o navegador não achou a fonte.
  function fontInstalled(name) {
    const c = document.createElement("canvas").getContext("2d"), t = "mmmmmmmmmmlliWWQ@#0";
    return ["monospace", "serif"].some((g) => { c.font = `72px ${g}`; const a = c.measureText(t).width; c.font = `72px '${name}', ${g}`; return c.measureText(t).width !== a; });
  }
  async function loadIdentities() {
    try { state.identities = await (await fetch("api/identities")).json(); } catch { state.identities = { identities: [] }; }
    syncIdentity();
  }
  function syncIdentity() {
    const sel = document.getElementById("identity-select"), note = document.getElementById("identity-note");
    if (!sel) return;
    const d = state.identities || { identities: [] }, cur = state.deck?.identity || "";
    const opts = [["", "Do tema"], ...d.identities.map((x) => [x.id, x.name])];
    if (cur && !d.identities.some((x) => x.id === cur)) opts.push([cur, `${cur} (não configurada aqui)`]);
    sel.innerHTML = "";
    for (const [v, l] of opts) { const o = document.createElement("option"); o.value = v; o.textContent = l; sel.append(o); }
    sel.value = cur;
    const say = (text, warn) => { note.textContent = text; note.title = text; note.hidden = !text; note.classList.toggle("warn", !!warn); };
    const ident = d.identities.find((x) => x.id === cur);
    if (d.error) say(d.error, true);
    else if (cur && !ident) say("Esta identidade não está configurada neste computador: vale a fonte do tema.", true);
    else if (ident) {
      const fonts = [...new Set([...ident.fonts.titulo, ...ident.fonts.corpo, ...ident.fonts.compacta])];
      const missing = fonts.filter((f) => !fontInstalled(f));
      say(missing.length === fonts.length ? "Nenhuma das fontes está instalada neste computador: vale a do tema."
        : missing.length ? `Não instaladas aqui: ${missing.join(", ")}.` : "", missing.length === fonts.length);
    } else say(d.exists ? "" : "Fontes da empresa: configure no botão ao lado.", false);
  }

  // cartão ativo = o que vale no slide aberto; "só este slide" ganha uma marca
  function syncThemeGallery() {
    syncIdentity();
    const ms = document.getElementById("mark-style-select");
    if (ms) ms.value = state.deck?.markStyle || "marca-texto";
    const slide = state.deck?.slides?.[state.currentSlideIndex] || {};
    const theme = slide.theme || state.deck?.theme || "sinal";
    const pal = slide.palette || state.deck?.palette || "tema";
    dom.themeGallery.querySelectorAll(".theme-card").forEach((c) => { c.classList.toggle("active", c.dataset.theme === theme); c.classList.toggle("slide-only", !!slide.theme && c.dataset.theme === theme); });
    // tema com par claro/escuro (manual ↔ manual-noite): um botão troca para o outro, no deck inteiro
    const pair = state.themeMeta?.[theme]?.pair, pairBtn = document.getElementById("btn-theme-pair");
    if (pairBtn) {
      pairBtn.hidden = !pair;
      if (pair) { pairBtn.dataset.pair = pair; pairBtn.querySelector("span").textContent = state.themeMeta?.[pair]?.dark ? "Versão escura" : "Versão clara"; }
    }
    document.querySelectorAll("#palette-gallery .palette-card").forEach((c) => { c.classList.toggle("active", c.dataset.palette === pal); c.classList.toggle("slide-only", !!slide.palette && c.dataset.palette === pal); });
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
    return JSON.stringify([d.theme, d.palette, d.identity, d.markStyle, d.footer, d.header, d.title, d.author, d.event, d.department, d.date, d.slides?.length]);
  };
  const thumbKey = (idx, slide) => `${deckLook()}|${idx}|${JSON.stringify(slide)}`;
  let thumbObserver = null;
  // o slide (1920×1080) encolhe para a largura do quadro da miniatura, qualquer que seja a do trilho
  const thumbScaleObserver = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => { if (target.clientWidth) target.style.setProperty("--thumb-scale", String(target.clientWidth / 1920)); });
  });
  const thumbQueue = [];
  let thumbActive = 0;

  const plainTitle = (slide, idx) => String(slide.title || slide.text || slide.question || slide.quote || `Slide ${idx + 1}`)
    .replace(/==|\*\*|\^\^|~~|`/g, "").replace(/(^|\s)\*(\S[^*]*)\*/g, "$1$2").slice(0, 60);

  function renderThumbnails() {
    if (!state.deck || !state.deck.slides) return;
    thumbObserver?.disconnect();
    thumbScaleObserver.disconnect();
    thumbQueue.length = 0;
    bindSlideListKeys();
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
      thumbScaleObserver.observe(screen);

      if (Array.isArray(slide.auto) && slide.auto.length) {
        const badge = document.createElement("span");
        badge.className = "thumb-auto";
        badge.innerHTML = '<i class="ic" data-ic="wand"></i>'; hydrateIcons(badge);
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

      card.addEventListener("click", () => { selectSlide(idx); dom.thumbnailsList.focus({ preventScroll: true }); });
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
    window.SagaDiagrams?.mount(screen); // miniatura de diagrama também é desenhada
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
  // Categorias dos tipos de slide: a mesma divisão na galeria "Novo slide" (cria) e no Layout (troca o formato do atual)
  const SLIDE_GROUPS = [
    ["estrutura", "Abertura e estrutura", ["cover", "section", "agenda", "end", "references"]],
    ["texto", "Texto e ideias", ["statement", "headline", "quote", "list", "cards", "split", "mosaic", "ribbon", "bento", "dossier"]],
    ["dados", "Números e gráficos", ["number", "stats", "chart", "science", "compare", "matrix"]],
    ["processo", "Processos e diagramas", ["steps", "timeline", "funnel", "pyramid", "diagram", "infographic", "hub"]],
    ["gestao", "Gestão e status", ["status", "onepage", "decisionlab"]],
    ["codigo", "Código e API", ["code", "codewalk", "api"]],
    ["visual", "Imagem e movimento", ["image", "full", "carousel", "spotlight", "video", "scenography", "kinetic"]],
    ["plateia", "Plateia", ["question", "poll"]],
    ["dinamicas", "Dinâmicas a dois", ["duel", "terminals", "turns"]],
    ["livre", "Montar do zero", ["blocks", "canvas"]],
  ];
  const groupOf = (layout) => SLIDE_GROUPS.find(([, , ids]) => ids.includes(layout))?.[0] || "livre";
  const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let sceneReturnFocus;
  const sceneModal = () => document.getElementById("scene-modal");
  function closeSceneLibrary() {
    sceneModal().classList.add("hidden");
    sceneReturnFocus?.focus();
  }
  async function insertScene(layout) {
    if (!state.deck || state.insertingScene) return;
    if (!state.layouts.includes(layout)) { showToast("Este servidor ainda usa uma versão antiga do motor. Abra a instância atualizada do SagaDeck.", 9000); return; }
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
    const search = document.getElementById("scene-search");
    search.value = "";
    search.focus();
    const filters = document.querySelector("#scene-modal .scene-filters");
    filters.innerHTML = [["all", "Todos"], ...SLIDE_GROUPS.map(([id, label]) => [id, label])]
      .map(([id, label]) => `<button type="button" data-scene-filter="${id}"${id === "all" ? ' class="active"' : ""}>${escHtml(label)}</button>`).join("");
    filters.querySelectorAll("[data-scene-filter]").forEach((b) => b.onclick = () => {
      filters.querySelectorAll("[data-scene-filter]").forEach((x) => x.classList.toggle("active", x === b));
      applySceneFilter();
    });
    const grid = document.getElementById("scene-grid");
    grid.innerHTML = '<p class="scene-loading" role="status">Preparando os tipos de slide no seu tema…</p>';
    try {
      const res = await fetch("api/layout-previews");
      if (!res.ok) throw new Error("Não foi possível carregar os tipos de slide. Tente novamente.");
      const data = await res.json();
      ensureSlideStyles(data.baseCSS, data.themeCSS);
      const card = (id, group) => `<div class="scene-card" role="button" tabindex="0" data-scene="${id}" data-category="${group}" data-search="${escAttr(fold(`${layoutLabel(id)} ${data.info?.[id]?.[1] || ""} ${id}`))}" aria-label="Novo slide: ${escAttr(layoutLabel(id))}"><div class="scene-preview" aria-hidden="true"><div class="scene-render" inert>${data.html[id]}</div><span class="scene-insert">+ Inserir</span></div><div class="scene-card-copy"><b>${escHtml(layoutLabel(id))}</b><span>${escHtml(data.info?.[id]?.[1] || "")}</span></div></div>`;
      grid.innerHTML = SLIDE_GROUPS.map(([group, label, ids]) => {
        const cards = ids.filter((id) => state.layouts.includes(id) && data.html[id]).map((id) => card(id, group)).join("");
        return cards ? `<h4 class="scene-group" data-category="${group}">${escHtml(label)}</h4>${cards}` : "";
      }).join("");
      grid.querySelectorAll(".scene-card").forEach(b => {
        b.onclick = () => insertScene(b.dataset.scene);
        b.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); insertScene(b.dataset.scene); } };
      });
      applySceneFilter(); // o que a pessoa já digitou enquanto as prévias carregavam vale
    } catch (err) { grid.innerHTML = `<p class="scene-loading" role="alert">${escHtml(err.message)}</p>`; }
  }
  // categoria + busca (sem acento: "codigo" acha "Código"); títulos de categoria sem cartão visível somem
  function applySceneFilter() {
    const cat = document.querySelector("#scene-modal [data-scene-filter].active")?.dataset.sceneFilter || "all";
    const q = fold(document.getElementById("scene-search").value.trim());
    document.querySelectorAll("#scene-grid .scene-card").forEach((x) => { x.hidden = (cat !== "all" && x.dataset.category !== cat) || (q && !x.dataset.search.includes(q)); });
    document.querySelectorAll("#scene-grid .scene-group").forEach((h) => { h.hidden = !document.querySelector(`#scene-grid .scene-card[data-category="${h.dataset.category}"]:not([hidden])`); });
    scaleScenePreviews();
  }
  function scaleScenePreviews() {
    document.querySelectorAll(".scene-preview").forEach(box => {
      box.querySelector(".scene-render").style.transform = `scale(${box.clientWidth / 1920})`;
    });
  }
  async function editScreenshot(existing = null, file) {
    if (!state.deck || document.querySelector(".shot-dialog")) return;
    const targetDeck = state.deck;
    const at = state.currentSlideIndex;
    const result = await window.ScreenshotEditor.open(existing || {}, file);
    if (!result || state.deck !== targetDeck) return;
    if (existing) {
      const index = state.deck.slides.indexOf(existing);
      if (index < 0) return;
      state.deck.slides[index] = result;
      state.currentSlideIndex = index;
    } else {
      state.deck.slides.splice(at + 1, 0, result);
      state.currentSlideIndex = at + 1;
    }
    await syncDeckToServer();
    renderThumbnails();
    await renderCurrentSlide();
    openPane("props");
    showToast("Screenshot pronto. Use Apresentar para percorrer os destaques.");
  }
  function setupCreativeTools() {
    const shotButton = document.createElement("button");
    shotButton.id = "btn-screenshot";
    shotButton.className = "rbtn rbtn-lg";
    shotButton.innerHTML = '<i class="ic" data-ic="image"></i><span>Screenshot</span>';
    shotButton.title = "Cole uma imagem e marque onde olhar";
    document.getElementById("btn-scenes").closest(".rsplit").after(shotButton); // depois do Novo slide dividido, não dentro dele
    hydrateIcons(shotButton);
    shotButton.onclick = () => editScreenshot();
    document.addEventListener("paste", e => {
      if (document.querySelector("dialog[open]") || e.target.closest("input, textarea, [contenteditable='true']")) return;
      if (window.SagaProject?.wantsPaste()) return; // na aba Arquivos (ou com um arquivo aberto) o print só vai para contexto/
      const item = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        const file = item.getAsFile();
        window.SagaProject?.savePastedImage(file).catch(() => {}); // também fica no projeto (contexto/), para a IA
        editScreenshot(null, file);
      }
    });
    dom.renderedSlideContainer.addEventListener("dragover", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
    dom.renderedSlideContainer.addEventListener("drop", e => {
      const file = e.dataTransfer?.files?.[0];
      if (file?.type.startsWith("image/")) { e.preventDefault(); e.stopPropagation(); editScreenshot(null, file); }
    });
    document.getElementById("btn-scenes").onclick = openSceneLibrary;
    document.getElementById("scene-close").onclick = closeSceneLibrary;
    sceneModal().onclick = e => { if (e.target === sceneModal()) closeSceneLibrary(); };
    document.querySelectorAll("[data-add-scene]").forEach(b => b.onclick = () => insertScene(b.dataset.addScene));
    document.querySelectorAll("[data-open-scenes]").forEach(b => b.onclick = openSceneLibrary);
    document.getElementById("scene-search").oninput = applySceneFilter;
    document.getElementById("scene-search").onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const first = document.querySelector("#scene-grid .scene-card:not([hidden])");
      if (first) { e.preventDefault(); insertScene(first.dataset.scene); }
    };
    // Animações da apresentação inteira (deck.motion), no menu Apresentar
    document.querySelectorAll(".motion-opt").forEach((b) => b.onclick = async (e) => {
      e.stopPropagation();
      if (!state.deck) return;
      state.deck.motion = b.dataset.motion;
      syncMotionMenu();
      await syncDeckToServer();
      showToast({ none: "Sem animação: cada clique mostra o próximo item na hora.", subtle: "Animações suaves: entradas e transições discretas.", expressive: "Animações expressivas: movimento de palco." }[state.deck.motion]);
    });
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

  // Delete/Backspace com o foco na lista de slides (à esquerda) exclui o slide selecionado. Só ali: digitando
  // num campo ou mexendo num elemento do slide, as teclas continuam fazendo o que já faziam.
  function bindSlideListKeys() {
    if (dom.thumbnailsList._keys) return;
    dom.thumbnailsList._keys = true;
    dom.thumbnailsList.tabIndex = 0;
    dom.thumbnailsList.setAttribute("aria-label", "Slides (Delete exclui o selecionado)");
    dom.thumbnailsList.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea, select, [contenteditable]")) return;
      // ↑/↓ (e Home/End) trocam de slide, como no PowerPoint; nunca rolam a visualização
      const go = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (go || e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const last = state.deck.slides.length - 1;
        const to = e.key === "Home" ? 0 : e.key === "End" ? last : Math.max(0, Math.min(last, state.currentSlideIndex + go));
        if (to !== state.currentSlideIndex) selectSlide(to);
        // rola só a lista (scrollIntoView rolaria também a tela em volta)
        const card = dom.thumbnailsList.querySelector(`.thumb-card[data-idx="${to}"]`), list = dom.thumbnailsList;
        if (card) {
          const c = card.getBoundingClientRect(), l = list.getBoundingClientRect();
          if (c.top < l.top) list.scrollTop -= l.top - c.top + 8;
          else if (c.bottom > l.bottom) list.scrollTop += c.bottom - l.bottom + 8;
        }
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      deleteCurrentSlide();
      dom.thumbnailsList.focus({ preventScroll: true });
    });
  }

  function deleteCurrentSlide() {
    if (state.deck.slides.length <= 1) {
      showToast("Não é possível excluir o único slide da apresentação.");
      return;
    }
    const at = state.currentSlideIndex;
    const [removed] = state.deck.slides.splice(at, 1);
    state.currentSlideIndex = Math.min(at, state.deck.slides.length - 1);
    syncDeckToServer();
    renderThumbnails();
    renderCurrentSlide();
    // sem desfazer geral no editor: o aviso devolve o slide no mesmo lugar
    showToast(`Slide ${at + 1} excluído.`, 8000, { label: "Desfazer", fn: () => {
      state.deck.slides.splice(Math.min(at, state.deck.slides.length), 0, removed);
      state.currentSlideIndex = at;
      syncDeckToServer();
      renderThumbnails();
      renderCurrentSlide();
      showToast(`Slide ${at + 1} de volta.`);
    } });
  }

  // ==========================================================================
  // PAINEL DE PROPRIEDADES (LATERAL DIREITA)
  // ==========================================================================
  // Galeria de layouts: prévia de verdade (exemplo desenhado no tema do deck) + descrição
  function buildLayoutPicker() {
    dom.layoutPickerGrid.innerHTML = "";
    const ordered = SLIDE_GROUPS.flatMap(([group, label, ids]) => ids.filter((id) => LAYOUT_NAMES.includes(id)).map((id, i) => [id, i === 0 ? label : null]));
    LAYOUT_NAMES.filter((n) => !ordered.some(([id]) => id === n)).forEach((n) => ordered.push([n, null]));
    ordered.forEach(([name, heading]) => {
      if (heading) {
        const h = document.createElement("div");
        h.className = "lp-group";
        h.textContent = heading;
        dom.layoutPickerGrid.appendChild(h);
      }
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
      layoutPreviewObserver.observe(card.querySelector(".lc-prev"));
    });
  }

  const layoutPreviewObserver = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => {
      if (target.clientWidth) target.style.setProperty("--thumb-scale", String(target.clientWidth / 1920));
    });
  });
  let layoutPreviewKey = "";
  async function loadLayoutPreviews() {
    const key = `${state.deck?.theme}|${state.deck?.palette || ""}|${state.deck?.identity || ""}|${state.deck?.markStyle || ""}`;
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
    agenda: "items", timeline: "events", matrix: "cells", question: "options", poll: "options", split: "bullets", statement: "lines", references: "items", end: "contacts", kinetic: "beats" };
  const SOURCE_KEYS = ["items", "tiles", "stats", "kpis", "steps", "process", "flow", "stages", "levels", "events", "cells", "options", "bullets", "lines", "contacts"];
  function kineticPhrases(value) {
    const words = String(value || "").match(/==[^=]+==|\*\*.*?\*\*|\*[^*]+\*|~~.*?~~|`[^`]+`|\[[^\]]+\]\([^)]+\)|\S+/g) || [];
    const connectors = new Set(["a", "as", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "o", "os"]);
    const phrases = [];
    while (words.length) {
      let take = Math.ceil(words.length / Math.ceil(words.length / 4));
      const last = words[take - 1]?.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, "").toLowerCase();
      if (take > 1 && connectors.has(last)) take--;
      phrases.push(words.splice(0, take).join(" "));
    }
    return phrases;
  }
  function carryContent(slide, to) {
    const target = LIST_KEY[to];
    if (!target) return;
    const activeKey = LIST_KEY[slide.layout];
    if (activeKey === target && Array.isArray(slide[target]) && slide[target].length) return;
    if (to === "kinetic") {
      const source = SOURCE_KEYS.find((key) => Array.isArray(slide[key]) && slide[key].length);
      if (source) {
        slide.beats = slide[source].map((item) => {
          if (typeof item !== "object" || item == null) return { text: String(item ?? "") };
          return { text: item.title ?? item.label ?? item.text ?? item.name ?? "", ...(item.text && item.title ? { tag: item.text } : {}) };
        });
      } else {
        const phrases = [...kineticPhrases(slide.title || slide.text), ...kineticPhrases(slide.subtitle)];
        if (phrases.length) slide.beats = phrases.map((text, i) => ({ text, ...(i === 0 && slide.kicker ? { tag: slide.kicker } : {}) }));
      }
      return;
    }
    const srcKey = [activeKey, ...SOURCE_KEYS].find((k) => k && Array.isArray(slide[k]) && slide[k].length);
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
    if (!slide || slide.layout === layoutName) return;
    const before = JSON.parse(JSON.stringify(slide));
    const currentKey = LIST_KEY[slide.layout];
    const entries = (Array.isArray(slide[currentKey]) ? slide[currentKey] : []).map(v => typeof v === "object" ? [v.title || v.label || v.text || v.name, v.title ? v.text : null].filter(Boolean).join(" — ") : String(v));
    const primary = (["statement", "headline"].includes(slide.layout) ? slide.text || entries.join("\n") : slide.layout === "quote" ? slide.quote : ["question", "poll"].includes(slide.layout) ? slide.question : slide.title) || slide.title || slide.text || "";
    carryContent(slide, layoutName);
    if (!slide.title && primary) slide.title = primary;
    if (["headline", "statement"].includes(layoutName)) {
      slide.text = primary;
      if (layoutName === "statement") { if (entries.length) slide.lines = entries; else delete slide.lines; }
    }
    if (layoutName === "quote") slide.quote = primary;
    if (["question", "poll"].includes(layoutName)) slide.question = primary;
    if (LIST_KEY[layoutName] && !slide[LIST_KEY[layoutName]]?.length && !["kinetic", "statement"].includes(layoutName)) {
      const content = [slide.subtitle, slide.body, primary].find(v => typeof v === "string" && v.trim());
      if (content) slide[LIST_KEY[layoutName]] = content.split(/\n+/).filter(Boolean).map(text => ["list", "split", "question", "poll", "references", "end"].includes(layoutName) ? text : {title:text});
    }
    if (layoutName === "blocks" && !slide.content?.length) slide.content = (entries.length ? entries : [slide.subtitle || slide.body || primary]).filter(Boolean).map(text=>({text}));
    if (layoutName === "canvas" && !slide.elements?.length) {
      slide.elements = [primary && {text:primary,as:"title",x:120,y:100,w:1600,h:180}, ...entries.map((text,i)=>({text,x:120,y:320+i*90,w:1100,h:80,size:36})), slide.figure && {...slide.figure,x:1300,y:350,w:450,h:450}].filter(Boolean);
    }
    if (layoutName === "science" && !slide.equations) {slide.equations=[];slide.plot=false;}
    delete slide.visualEdits;
    slide.layout = layoutName;
    syncDeckToServer(); renderCurrentSlide(); openPane("props");
    showToast(`Slide atual alterado para ${layoutLabel(layoutName)}. Revise os campos no painel.`, 9000, {label:"Desfazer",fn:()=>{Object.keys(slide).forEach(k=>delete slide[k]);Object.assign(slide,before);syncDeckToServer();renderCurrentSlide();}});
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
    box.innerHTML = `<h4><i class="ic" data-ic="wand"></i> Mudanças automáticas neste slide</h4>
      <p class="hint">Feitas pela auto-correção, não por você nem pela IA. Desfaça o que não quiser.</p>
      ${log.map((e, i) => `<div class="auto-item">
        <span class="what">${escHtml(e.campo)}</span>
        <span class="acts"><button class="btn-small" data-undo="${i}">Desfazer</button><button class="btn-small" data-keep="${i}">Manter</button></span>
        <span class="why">${escHtml(e.motivo || "")}</span>
        <span class="was" title="${escAttr(show(e.antes))}">Antes: ${escHtml(show(e.antes).slice(0, 120))}</span>
      </div>`).join("")}`;
    hydrateIcons(box);
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
      refreshFrom: async () => {
        try {
          const r = await fetch("api/project/refresh-chart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: state.currentSlideIndex }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          state.deck.slides[state.currentSlideIndex] = j.slide;
          renderThumbnails(); await renderCurrentSlide();
          showToast("Dados atualizados da planilha.");
        } catch (e) { showToast(`Não deu para atualizar: ${e.message}`); }
      },
      hydrate: hydrateIcons,
      pickIcon: (cb) => openIconPicker(null, cb),
      layoutLabel,
      generateImage: (element, btn) => {
        if (!element.image_prompt?.trim()) return showToast('Descreva a imagem no campo “Descrição para a IA gerar”.', 4000);
        return generateSlideImages(btn);
      },
      chooseImage: (element) => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
        input.onchange = async () => {
          const file = input.files[0]; if (!file) return;
          if (file.size > 8 * 1024 * 1024) return showToast('Use uma imagem de até 8 MB.', 4000);
          try {
            const data = await new Promise((resolve, reject) => {
              const reader = new FileReader(); reader.onload = () => resolve(reader.result);
              reader.onerror = reject; reader.readAsDataURL(file);
            });
            element.image = data; element.alt = file.name; delete element.image_prompt;
            formCommit(true);
          } catch { showToast('Não foi possível ler a imagem.', 4000); }
        };
        input.click();
      },
      imageChat: (element) => {
        const locate = (node, p = '') => {
          if (node === element) return p;
          if (!node || typeof node !== 'object') return null;
          for (const [key, value] of Object.entries(node)) {
            const found = locate(value, Array.isArray(node) ? `${p}[${key}]` : p ? `${p}.${key}` : key);
            if (found !== null) return found;
          }
          return null;
        };
        dom.chatInput.value = `Gere uma nova imagem para ${locate(slide) || 'a figura'} do slide ${state.currentSlideIndex + 1}, baseada no conteúdo e na intenção deste slide. Escolha uma direção visual coerente com a apresentação. Substitua somente essa imagem, preservando textos, posição, tamanho e enquadramento. Não inclua texto na imagem.`;
        document.getElementById('tab-btn-chat').click();
        dom.chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        dom.chatInput.focus();
      },
      editScreenshot: (slide) => editScreenshot(slide),
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
      scaleNapkinPreviews();
    }).catch(() => {});
  }

  function openNapkinModal() {
    buildNapkinPickers();
    dom.modalNapkin.classList.remove("hidden");
    requestAnimationFrame(scaleNapkinPreviews);
    dom.napkinPreviewBox.classList.add("hidden");
    dom.btnNapkinReplace.classList.add("hidden");
    dom.btnNapkinInsert.classList.add("hidden");
    dom.napkinInputText.focus();
  }
  function scaleNapkinPreviews() {
    document.querySelectorAll(".napkin-type .lc-prev").forEach((box) => {
      const render = box.querySelector(".thumb-render");
      if (render && box.clientWidth) render.style.transform = `scale(${box.clientWidth / 1920})`;
    });
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
      if (data.materialized) previewMaterialized(data.materialized);
      updateSaveStatus(res.ok ? "saved" : "error");
      if (res.ok) window.SagaProject?.deckChanged();
    } catch (err) {
      console.warn("Erro ao sincronizar com servidor:", err);
      updateSaveStatus("error");
    }
  }

  // Prévia de modelo: faixa acima do slide; a primeira mudança (ou "Usar como base") cria a cópia na biblioteca
  function syncPreviewBanner() {
    const banner = document.getElementById("preview-banner");
    banner.classList.toggle("hidden", !state.preview);
    if (state.preview) document.getElementById("preview-banner-text").textContent =
      `Prévia do modelo “${state.preview.title}”. Nada é salvo até você mudar algo: aí nasce uma cópia sua em “${state.preview.topic}”, e o modelo continua igual.`;
  }
  function previewMaterialized(made) {
    state.preview = null;
    syncPreviewBanner();
    const params = new URLSearchParams(location.search);
    params.delete("model"); params.delete("topic"); params.set("deck", made.id);
    history.replaceState(null, "", `${location.pathname}?${params}`);
    showToast(`Cópia criada em “${made.topic}”: ${made.title}. O modelo original continua igual.`, 6000);
  }
  async function useModelAsBase() {
    try {
      const r = await fetch("api/library/decks/model-use", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || r.status);
      const res = await fetch("api/deck");
      const d = await res.json();
      state.deck = d.spec; state.file = d.file || null;
      previewMaterialized(data);
      updateSaveStatus();
    } catch (e) { showToast("Não deu para criar a cópia: " + e.message, 6000); }
  }

  // "Salvo" quando há um arquivo de verdade por trás; senão, avisa que as mudanças só vivem aqui.
  function updateSaveStatus(phase = "saved") {
    const el = dom.saveStatus;
    if (state.preview && phase !== "saving") { el.classList.add("unsaved"); el.textContent = "Prévia · não salva"; el.title = "Modelo em prévia: mude algo ou clique em Usar como base para criar a sua cópia"; return; }
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
    // mesma conta de wordLimit (src/purpose.js): o propósito do material muda o limite
    const limit = slide.maxWords || state.deck?.maxWords || Math.max({ consulta: 220, aula: 160, workshop: 110 }[state.deck?.purpose] || 0, { onepage: 120, status: 90 }[slide.layout] || 0) || 40;
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

  // Diagrama desenhado: se encolheu demais para caber, a pessoa vê o aviso e a IA recebe junto com o pedido
  function reportDiagram(root) {
    if (root !== dom.renderedSlideContainer) return;
    const box = root.querySelector(".dg-box[data-dg-scale]");
    const k = box ? +box.dataset.dgScale : 1;
    const err = root.querySelector(".dg-box[data-dg=error] .dg-error span")?.textContent;
    const notes = (state.renderNotes || []).filter((n) => !/^o diagrama/.test(n));
    if (err) notes.push(`o diagrama não desenhou (erro no código Mermaid): ${err.slice(0, 200)}`);
    else if (k < 0.62) notes.push(`o diagrama precisou encolher para ${Math.round(k * 100)}% para caber na área (${box.clientWidth}×${box.clientHeight}): letra pequena`);
    state.renderNotes = notes;
    const fit = state.fitStatus || { text: "", title: "" }; // sem problema no diagrama: volta o aviso do texto (se houver)
    dom.statusFit.textContent = err ? "Diagrama com erro no código" : k < 0.62 ? `Diagrama reduzido para caber (${Math.round(k * 100)}%)` : fit.text;
    dom.statusFit.title = err || k < 0.62 ? `${notes.join("\n")}\nPeça para a IA reorganizar (menos nós por linha, rótulos curtos, dividir em dois slides).` : fit.title;
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
      state.renderNotes = [...notes, ...(state.renderNotes || []).filter((n) => /^o diagrama/.test(n))]; // o aviso do diagrama é de reportDiagram
      state.fitStatus = {
        text: z < 1 ? `Conteúdo reduzido para caber (${Math.round(z * 100)}%)` : notes.length ? "Texto reduzido para caber" : "",
        title: notes.length ? `${notes.join("\n")}\nIsso é automático. Para ficar maior: encurte o texto ou use outro layout.` : "",
      };
      if (state.renderNotes.length > notes.length) return; // o diagrama tem aviso: ele manda na barra
      dom.statusFit.textContent = state.fitStatus.text;
      dom.statusFit.title = state.fitStatus.title;
    };
    run();
    report();
    document.fonts?.ready.then(() => { run(); report(); }); // a fonte do tema pode chegar depois e mudar as medidas
  }

  // ==========================================================================
  // LLM: STATUS E GERAÇÃO DE DECK
  // ==========================================================================
  async function openAISettings() {
    // O console protege-se com frame-ancestors self: abrir numa aba, nunca dentro de iframe.
    const setupWindow = window.open("about:blank", "sagadeck-ai-setup");
    let dialog = document.getElementById("ai-settings-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "ai-settings-dialog"; dialog.className = "ai-settings-dialog";
      dialog.innerHTML = '<div class="ai-settings-head"><h2>Configurar IA</h2><button type="button" data-close>Fechar</button></div><p data-ai-info>Verificando a conexão...</p><a data-ai-link target="_blank" rel="noopener" hidden>Abrir configuração do modelrelay</a><button type="button" data-ai-refresh>Verificar conexão</button>';
      document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>refreshAIStatus(true));
      dialog.querySelector('[data-ai-refresh]').onclick=()=>openAISettings();
    }
    if (!dialog.open) dialog.showModal();
    await refreshAIStatus(true);
    const info=dialog.querySelector('[data-ai-info]'), link=dialog.querySelector('[data-ai-link]');
    try {
      const setup=await (await fetch('api/ai/setup')).json();
      info.textContent=state.ai.available ? `Conectada · modelo de texto: ${state.ai.textModel}. A configuração abre em uma aba própria.` : 'O serviço de IA não está respondendo. Inicie modelrelay serve neste computador e clique em Verificar conexão.';
      if(setup.url){link.href=setup.url;link.hidden=false;if(setupWindow){setupWindow.opener=null;setupWindow.location.href=setup.url;dialog.close();}}
      else {setupWindow?.close();link.hidden=true;}
    } catch { setupWindow?.close();info.textContent='Não foi possível consultar a configuração. Verifique a conexão e tente novamente.'; }
  }

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
      : `Nenhum LLM em ${state.ai.url || "?"}. Rode "modelrelay serve" ou defina SAGADECK_LLM_URL. Clique para configurar a IA.`;
    dom.aiStatus.classList.toggle("on", on);
    dom.aiStatus.classList.toggle("off", !on);
  }

  function openAiDeckModal() {
    dom.aiDeckTheme.innerHTML = '<option value="">A IA escolhe</option>' +
      (state.themes || []).map((t) => `<option value="${t}">${t}</option>`).join("");
    dom.aiDeckStatus.textContent = state.ai.available ? "" : 'Nenhum LLM disponível — rode "modelrelay serve" antes de gerar.';
    // cada abertura recomeça do sensato: 15 min viram 10 slides
    dom.aiDeckMinutes.value = "15";
    dom.aiDeckSlides.value = "10";
    dom.aiDeckStyle.value = "";
    state.deckMaterials = [];
    renderDeckMaterials();
    dom.modalAiDeck.classList.remove("hidden");
    dom.aiDeckBriefing.focus();
  }

  function closeAiDeckModal() {
    dom.modalAiDeck.classList.add("hidden");
  }

  // Minutos → slides e estilo → tema, no modal "Deck com IA". A conta minutos → slides é a mesma de
  // slidesForMinutes() em src/ai/deck-ai.js (o modal não importa o motor): mude aqui, mude lá.
  // O ajuste fino manual no campo Slides vale até trocar os minutos de novo (o input de minutos recalcula).
  const STYLE_THEMES = { perspectiva: "jornal", essencial: "prata", revista: "editorial", cromatico: "bauhaus", tracos: "bauhaus" };
  function setupAiDeckModal() {
    dom.aiDeckMinutes.addEventListener("input", () => {
      const m = Number(dom.aiDeckMinutes.value);
      if (!Number.isFinite(m) || m <= 0) return;
      dom.aiDeckSlides.value = String(Math.min(40, Math.max(3, Math.round(m / 1.5))));
    });
    dom.aiDeckStyle.addEventListener("change", () => {
      const theme = STYLE_THEMES[dom.aiDeckStyle.value];
      if (theme && !dom.aiDeckTheme.value) dom.aiDeckTheme.value = theme;
    });
    dom.aiDeckFiles.addEventListener("change", () => {
      [...dom.aiDeckFiles.files].forEach((f) => uploadDeckMaterial({ name: f.name, file: f }));
      dom.aiDeckFiles.value = "";
    });
    const addLink = () => {
      const url = dom.aiDeckLink.value.trim();
      if (!url) return;
      dom.aiDeckLink.value = "";
      uploadDeckMaterial({ url });
    };
    dom.aiDeckAddLink.onclick = addLink;
    dom.aiDeckLink.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } });
  }
  // materiais do modal: iguais aos do chat (o servidor lê), guardados aqui até gerar
  state.deckMaterials = [];
  function renderDeckMaterials() {
    const box = dom.aiDeckMaterials;
    box.hidden = !state.deckMaterials.length;
    box.innerHTML = "";
    state.deckMaterials.forEach((a, i) => {
      const it = document.createElement("div");
      it.className = "chat-att";
      it.innerHTML = `<span class="chat-doc" title="${escHtml(a.name)}"><i class="ic" data-ic="${a.url ? "link" : "file-text"}"></i><b>${escHtml(a.name)}</b><small>${a.chars}</small></span><button type="button" title="Remover"><i class="ic" data-ic="x"></i></button>`; hydrateIcons(it);
      it.querySelector("button").onclick = () => { state.deckMaterials.splice(i, 1); renderDeckMaterials(); };
      box.appendChild(it);
    });
  }
  async function uploadDeckMaterial({ name, file, url }) {
    const provisional = { name: name || url, chars: "lendo…" };
    if (url) provisional.url = url;
    state.deckMaterials.push(provisional);
    renderDeckMaterials();
    try {
      let body;
      if (url) body = { url };
      else {
        if (file.size > 15 * 1024 * 1024) throw new Error("Arquivo grande demais (limite 15 MB).");
        body = { name: file.name, dataUrl: await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(file); }) };
      }
      const res = await fetch("api/ai/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      Object.assign(provisional, { id: data.id, name: data.name, chars: `${data.chars} caracteres` });
    } catch (e) {
      state.deckMaterials.splice(state.deckMaterials.indexOf(provisional), 1);
      showToast(`Não deu para ler o material: ${e.message}`, 6000);
    }
    renderDeckMaterials();
  }

  let aiDeckAnswer = "";
  function showAiDeckQuestion(q) {
    const box = dom.aiDeckStatus;
    box.innerHTML = `<div class="ai-ask"><b></b><div class="ai-ask-opts"></div><div class="ai-ask-free"><input type="text" class="form-control" id="ai-deck-answer" placeholder="Ou responda com as suas palavras"><button class="btn btn-primary btn-sm" type="button" id="ai-deck-answer-go">Responder</button></div></div>`;
    box.querySelector("b").textContent = q.question;
    for (const o of q.options || []) { const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-secondary btn-sm"; b.textContent = o; b.onclick = () => { aiDeckAnswer = o; runAiDeckGeneration(); }; box.querySelector(".ai-ask-opts").append(b); }
    box.querySelector("#ai-deck-answer-go").onclick = () => { const v = box.querySelector("#ai-deck-answer").value.trim(); if (v) { aiDeckAnswer = v; runAiDeckGeneration(); } };
  }
  async function runAiDeckGeneration() {
    const briefing = dom.aiDeckBriefing.value.trim();
    if (!briefing) {
      showToast("Descreva a apresentação que você quer.");
      return;
    }
    if (state.deckMaterials.some((a) => !a.id)) {
      showToast("Aguarde a leitura dos anexos antes de gerar.", 4000);
      return;
    }
    dom.btnRunAiDeck.disabled = true;
    const started = Date.now();
    let phase = `Enviando para ${state.ai.textModel || "o LLM"}…`;
    const show = () => {
      dom.aiDeckStatus.textContent = `${phase} · ${Math.round((Date.now() - started) / 1000)}s`;
    };
    const tick = setInterval(show, 500);
    show();
    try {
      const data = await streamAI("api/ai/generate", {
        briefing,
        theme: dom.aiDeckTheme.value,
        style: dom.aiDeckStyle.value || undefined,
        slides: Number(dom.aiDeckSlides.value) || undefined,
        duration: Number(dom.aiDeckMinutes.value) || undefined,
        materials: state.deckMaterials.map((a) => a.id),
        answer: aiDeckAnswer || undefined,
      }, (ev) => {
        if (ev.type !== "progress") return;
        phase = ev.chars ? `${ev.text} (${(ev.chars / 1000).toFixed(1)} mil caracteres)` : ev.text;
        show();
      });
      if (data.question) { clearInterval(tick); aiDeckAnswer = ""; showAiDeckQuestion(data.question); return; }
      aiDeckAnswer = "";
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
      showToast(`Deck gerado: ${state.deck.slides.length} slides, salvo em ${data.file}${failed}`);
    } catch (err) {
      dom.aiDeckStatus.textContent = err.message;
    } finally {
      clearInterval(tick);
      dom.btnRunAiDeck.disabled = false;
    }
  }

  function showToast(msg, duration = 3200, action = null) {
    if (action) {
      dom.toast.innerHTML = `<span>${escHtml(msg)}</span><button type="button" class="toast-action" data-toast-undo>${escHtml(action.label)}</button>`;
      dom.toast.querySelector("[data-toast-undo]").onclick = () => { dom.toast.classList.add("hidden"); action.fn(); };
    } else dom.toast.textContent = msg;
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

  // ---------------------------------------------------------------- slides de API
  // Ambientes: o ~/.sagadeck/ambientes.yaml como texto, validado pelo Studio antes de gravar
  const apiEnvsModal = () => document.getElementById("modal-api-envs");
  function apiEnvsStatus(text, kind = "") {
    const el = document.getElementById("api-envs-status");
    el.textContent = text;
    el.className = `sf-hint api-envs-status ${kind}`;
  }
  let apiEnvValidationTimer = 0;
  let apiEnvValidationVersion = 0;
  async function validateApiEnvs() {
    const ta = document.getElementById("api-envs-text");
    const save = document.getElementById("btn-api-envs-save");
    const version = ++apiEnvValidationVersion;
    save.disabled = true;
    apiEnvsStatus("Validando YAML…");
    try {
      const response = await fetch("api/http/ambientes/validar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ta.value }),
      });
      const data = await response.json().catch(() => ({}));
      if (version !== apiEnvValidationVersion) return;
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      save.disabled = false;
      apiEnvsStatus("YAML válido. Salvar cria uma cópia .bak antes de substituir o arquivo.", "ok");
    } catch (error) {
      if (version !== apiEnvValidationVersion) return;
      save.disabled = true;
      apiEnvsStatus(error.message, "err");
    }
  }
  function scheduleApiEnvValidation() {
    clearTimeout(apiEnvValidationTimer);
    apiEnvValidationVersion++;
    document.getElementById("btn-api-envs-save").disabled = true;
    apiEnvsStatus("Aguardando validação…");
    apiEnvValidationTimer = setTimeout(validateApiEnvs, 250);
  }
  function renderApiEnvChips(st) {
    const list = document.getElementById("api-envs-list");
    list.innerHTML = "";
    for (const e of st.envs || []) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `env-chip${e.name === st.current ? " active" : ""}`;
      b.dataset.env = e.name;
      b.textContent = e.name.toUpperCase();
      if (e.builtin) {
        const small = document.createElement("small");
        small.textContent = `embutido · ${e.builtinLabel || "ambiente local"}`;
        b.append(" ", small);
      }
      b.title = Object.entries(e.vars || {}).map(([k, v]) => `{{${k}}} = ${v}`).join("\n");
      b.onclick = async () => {
        const r = await fetch("api/http/env", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: e.name }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return apiEnvsStatus(j.error || `HTTP ${r.status}`, "err");
        renderApiEnvChips(j);
        if (!e.builtin) await syncApiEnvsText(e.name);
        apiEnvsStatus(`Em uso: ${e.name.toUpperCase()}`, "ok");
      };
      list.append(b);
    }
    if (!list.childElementCount) list.textContent = "Nenhum ambiente ainda: escreva abaixo e salve.";
  }
  // a escolha do ambiente grava current: no arquivo; o texto na tela acompanha, senão o próximo Salvar desfaz a escolha.
  // Sem edição pendente, recarrega o arquivo; com edição pendente, troca só a linha current: e mantém o resto.
  let apiEnvsLoadedText = "";
  async function syncApiEnvsText(name) {
    const ta = document.getElementById("api-envs-text");
    if (ta.value !== apiEnvsLoadedText) {
      if (/^current:.*$/m.test(ta.value)) ta.value = ta.value.replace(/^current:.*$/m, `current: ${name}`);
      else ta.value = `current: ${name}
${ta.value}`;
      return scheduleApiEnvValidation();
    }
    const j = await (await fetch("api/http/ambientes")).json().catch(() => null);
    if (j && typeof j.text === "string") ta.value = apiEnvsLoadedText = j.text;
  }
  async function openApiEnvs() {
    const m = apiEnvsModal(), ta = document.getElementById("api-envs-text"), save = document.getElementById("btn-api-envs-save");
    m.classList.remove("hidden");
    apiEnvsStatus("Carregando…");
    const r = await fetch("api/http/ambientes");
    const j = await r.json().catch(() => ({}));
    const locked = !r.ok;
    ta.disabled = locked;
    save.disabled = true;
    if (locked) {
      ta.value = "";
      document.getElementById("api-envs-list").textContent = "";
      document.getElementById("api-envs-file").textContent = "";
      return apiEnvsStatus(j.error || `HTTP ${r.status}`, "err");
    }
    ta.value = apiEnvsLoadedText = j.text || "";
    document.getElementById("api-envs-file").textContent = j.file || "";
    const st = await (await fetch("api/http/state")).json().catch(() => ({ envs: [] }));
    renderApiEnvChips(st);
    if (!j.exists) apiEnvsStatus("Este arquivo ainda não existe. Validando o modelo antes de habilitar Salvar…");
    void validateApiEnvs();
  }
  function closeApiEnvs() { apiEnvsModal().classList.add("hidden"); }
  async function saveApiEnvs() {
    const text = document.getElementById("api-envs-text").value;
    const save = document.getElementById("btn-api-envs-save");
    save.disabled = true;
    apiEnvsStatus("Salvando ambientes…");
    try {
      const response = await fetch("api/http/ambientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      apiEnvsLoadedText = text;
      renderApiEnvChips(data);
      await refreshStudioVars();
      apiEnvsStatus(`Salvo. ${data.backupCreated ? "A cópia anterior está no arquivo .bak." : "Novo arquivo criado."} Os slides de API já usam o arquivo atualizado.`, "ok");
    } catch (error) {
      apiEnvsStatus(`Não foi possível salvar os ambientes: ${error.message}`, "err");
      void validateApiEnvs();
    }
  }

  function studioSavedVarRow(name, detail) {
    return `<tr class="studio-var-row" draggable="true" data-studio-drag-var="${escAttr(name)}"><td><code>${escHtml(name)}</code></td><td colspan="2">${escHtml(detail)}</td></tr>`;
  }
  // Grade de propriedades (como o Object Inspector do Delphi): clica na célula e digita; grava ao sair dela ou no
  // Enter; Esc desfaz. Coluna Tipo: Normal ou Segredo (segredo é guardado cifrado e nunca aparece na tela).
  // Valor com cara de token numa variável normal também não aparece: a célula fica vazia e digitar troca o valor.
  const TYPE_SELECT = (secret) => `<select data-var-type aria-label="Tipo da variável" title="Normal: aparece na tela e no código gerado. Segredo: guardado cifrado nesta máquina, só o nome aparece"><option value="normal"${secret ? "" : " selected"}>Normal</option><option value="segredo"${secret ? " selected" : ""}>Segredo</option></select>`;
  function studioEnvVarRow(name, value, secret = false) {
    const safeName = secret ? `secret.${name}` : name;
    const hiddenValue = secret || /(?:secret|token|password|passwd|api.?key|credential|authorization)/i.test(name);
    const shown = hiddenValue ? "" : value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    return `<tr class="studio-var-row" draggable="true" data-studio-drag-var="${escAttr(safeName)}" data-original-var="${escAttr(name)}"${secret ? ' data-secret="1"' : ""}>
      <td><input aria-label="Nome da variável" data-var-name value="${escAttr(name)}" spellcheck="false" title="${escAttr(`{{${safeName}}}`)}"${secret ? " readonly" : ""}></td>
      <td><input aria-label="Valor da variável" data-var-value spellcheck="false" ${hiddenValue ? 'type="password" autocomplete="new-password" placeholder="•••••• oculto · digite para trocar" data-hidden-value="true"' : `value="${escAttr(shown)}" title="${escAttr(shown)}" data-original-value="${escAttr(shown)}"`}></td>
      <td>${TYPE_SELECT(secret)}</td>
      <td class="pg-act"><button type="button" class="pg-del" data-delete-studio-var title="Excluir ${escAttr(name)}" aria-label="Excluir ${escAttr(name)}"><i class="ic" data-ic="trash-2"></i></button></td>
    </tr>`;
  }
  const studioNewVarRow = () => `<tr class="studio-var-row studio-var-new"><td><input aria-label="Nome da nova variável" data-var-name placeholder="nova variável" spellcheck="false"></td><td><input aria-label="Valor da nova variável" data-var-value placeholder="valor" spellcheck="false"></td><td>${TYPE_SELECT(false)}</td><td class="pg-act"></td></tr>`;
  function studioVarTable(rows, head = ["Nome", "Valor", "Tipo"]) {
    return `<div class="studio-var-table-wrap"><table class="studio-var-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}<th aria-label="Ações"></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function renderStudioEnvVars(data) {
    const host = document.getElementById("studio-env-vars");
    const envs = Array.isArray(data.envs) ? data.envs : [];
    if (data.live === false) {
      host.textContent = data.reason || "Os ambientes não estão disponíveis neste momento.";
      return;
    }
    if (!envs.length) {
      host.textContent = "Nenhum ambiente configurado. Configure-o em Inserir › Ambientes.";
      return;
    }
    const env = envs.find((item) => item.name === data.current) || envs[0];
    const vars = env.vars && typeof env.vars === "object" ? env.vars : {};
    const secretNames = Array.isArray(env.secrets) ? env.secrets : [];
    const rows = [
      ...Object.entries(vars).map(([name, value]) => studioEnvVarRow(name, value)),
      ...secretNames.map((name) => studioEnvVarRow(name, "", true)),
      studioNewVarRow(),
    ];
    host.innerHTML = `<div class="studio-env-head"><b>${escHtml(String(env.name || "Ambiente").toUpperCase())}</b>${env.name === data.current ? " <span>em uso</span>" : ""}${env.builtin ? '<small title="Ao editar, ele vira um ambiente seu (uma cópia no seu arquivo de ambientes)">exemplo</small>' : ""}</div>${studioVarTable(rows.join(""))}`;
    hydrateIcons(host);
  }
  function renderStudioSavedVars() {
    const host = document.getElementById("studio-saved-vars");
    const slides = Array.isArray(state.deck?.slides) ? state.deck.slides : [];
    const rows = [];
    slides.forEach((slide, index) => {
      if (slide.layout !== "api" || !slide.save || typeof slide.save !== "object" || Array.isArray(slide.save)) return;
      Object.entries(slide.save).forEach(([name, path]) => {
        const relation = index < state.currentSlideIndex ? "slide anterior" :
          index === state.currentSlideIndex ? "slide atual · disponível após executar" : "slide futuro";
        rows.push(studioSavedVarRow(name, `Slide ${index + 1} · ${relation} · ${String(path)}`));
      });
    });
    host.innerHTML = rows.length ? studioVarTable(rows.join(""), ["Nome", "Origem"]) : '<p class="studio-var-empty">Nenhum slide de API guarda variáveis (save:).</p>';
  }
  async function refreshStudioVars() {
    const status = document.getElementById("studio-vars-status");
    status.textContent = "";
    status.className = "sf-hint";
    renderStudioSavedVars();
    document.getElementById("studio-env-vars").textContent = "Carregando ambientes…";
    try {
      const response = await fetch("api/http/state");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      renderStudioEnvVars(data);
      if (data.error) {
        status.textContent = data.error;
        status.className = "sf-hint sf-error";
      }
    } catch (error) {
      document.getElementById("studio-env-vars").textContent = "Não foi possível carregar as variáveis de ambiente.";
      status.textContent = `Erro ao carregar variáveis: ${error.message}`;
      status.className = "sf-hint sf-error";
    }
  }
  async function changeVarType(row, toSecret) {
    const name = row.dataset.originalVar, status = document.getElementById("studio-vars-status");
    if (!name) return; // linha nova: o tipo vale quando ela for gravada
    try {
      let value = row.querySelector("[data-var-value]").value;
      if (!toSecret || !value || row.querySelector("[data-var-value]").dataset.hiddenValue) {
        const r = await fetch("api/http/vars/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status);
        value = j.value;
      }
      const r = await fetch("api/http/vars/set", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, value, protected: toSecret }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status);
      await refreshStudioVars();
      status.textContent = toSecret ? `"${name}" agora é segredo (cifrado nesta máquina).` : `"${name}" agora é uma variável normal.`;
      status.className = "sf-hint sf-success";
    } catch (e) { status.textContent = `Não deu para trocar o tipo: ${e.message}`; status.className = "sf-hint sf-error"; await refreshStudioVars(); }
  }
  async function saveStudioEnvVar(row) {
    const name = row.querySelector("[data-var-name]").value.trim();
    const valueInput = row.querySelector("[data-var-value]");
    const value = valueInput.value;
    const previousName = row.dataset.originalVar || "";
    const status = document.getElementById("studio-vars-status");
    // valor oculto não é lido de volta: sem digitar nada, só um segredo novo não muda
    if (valueInput.dataset.hiddenValue && !value) { if (!previousName || name === previousName) return; }
    try {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Use um nome sem {{ }}: letras, números e _ (comece por letra ou _).");
      const duplicate = [...document.querySelectorAll("#studio-env-vars [data-var-name]")].some((field) => field !== row.querySelector("[data-var-name]") && field.value.trim() === name);
      if (duplicate) throw new Error(`Já existe uma variável chamada "${name}" neste ambiente.`);
      const response = await fetch("api/http/vars/set", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, value, protected: row.dataset.secret === "1" || row.querySelector("[data-var-type]")?.value === "segredo" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (previousName && name !== previousName) {
        const deleted = await fetch("api/http/vars/delete", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: previousName }),
        });
        const result = await deleted.json().catch(() => ({}));
        if (!deleted.ok) throw new Error(`A nova variável foi salva, mas não consegui remover "${previousName}": ${result.error || `HTTP ${deleted.status}`}`);
      }
      status.textContent = `Variável "${name}" salva no ambiente em uso.`;
      status.className = "sf-hint sf-success";
      await refreshStudioVars();
      status.textContent = `Variável "${name}" salva no ambiente em uso.`;
      status.className = "sf-hint sf-success";
    } catch (error) {
      status.textContent = error.message;
      status.className = "sf-hint sf-error";
    }
  }
  async function deleteStudioEnvVar(row) {
    const name = row.dataset.originalVar;
    if (!name) return;
    try {
      const response = await fetch("api/http/vars/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      await refreshStudioVars();
      document.getElementById("studio-vars-status").textContent = `Variável "${name}" excluída.`;
    } catch (error) {
      const status = document.getElementById("studio-vars-status");
      status.textContent = error.message;
      status.className = "sf-hint sf-error";
    }
  }

  function closePopovers(except) {
    document.querySelectorAll(".popover.open").forEach((p) => { if (p !== except) p.classList.remove("open"); });
    document.querySelectorAll(".split-button.show, .file-menu-wrap.show").forEach((m) => { if (!m.contains(except)) m.classList.remove("show"); });
  }

  // ==========================================================================
  // PREFERÊNCIAS (tela única, com busca): as desta máquina ficam em ~/.sagadeck/preferencias.json (servidor);
  // as do editor, neste navegador. Cada linha diz o que faz; gravar é automático.
  // ==========================================================================
  const PREFS_UI = [
    { id: "texto", title: "Texto e código", items: [
      { k: "texto.minCodePt", type: "num", unit: "pt", min: 6, max: 24, label: "Tamanho mínimo do código ao encolher", hint: "Código que não cabe encolhe até aqui (10 pt ≈ 20 px no slide). Se nem assim couber, ele rola na apresentação e o fiscal avisa." },
      { k: "texto.minTextPt", type: "num", unit: "pt", min: 6, max: 30, label: "Tamanho mínimo do texto ao encolher", hint: "Títulos e textos que se ajustam para caber não ficam menores que isto." },
      { k: "texto.wrapCode", type: "bool", label: "Quebrar linhas longas de código", hint: "Em vez de encolher o bloco todo por causa de uma linha comprida." },
    ] },
    { id: "ia", title: "Inteligência artificial", items: [
      { k: "ia.perguntar", type: "bool", label: "Perguntar quando o pedido não disser para que serve o material", hint: "Ex.: um workshop sem dizer se o pessoal vai guardar o material. Desligado, a IA decide sozinha." },
      { k: "ia.imagens", type: "bool", label: "Gerar imagens quando o pedido pedir", hint: "Desligado: só ícones, gráficos e diagramas do sagadeck (sem custo de imagem)." },
      { k: "ia.autor", type: "text", label: "Seu nome", hint: "Vai na capa e no rodapé das apresentações novas (no lugar de \"Seu Nome\")." },
      { k: "ia.idioma", type: "select", options: [["auto", "O do pedido"], ["português do Brasil", "Português (Brasil)"], ["inglês", "Inglês"], ["espanhol", "Espanhol"]], label: "Idioma do conteúdo gerado" },
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

  function syncMotionMenu() {
    const cur = state.deck?.motion || "subtle";
    document.querySelectorAll(".motion-opt").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.motion === cur)));
  }

  function selectRibbonTab(name) {
    dom.ribbonTabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    dom.ribbonPanels.forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
    store.set("ribbonTab", name);
    if (name === "design") document.querySelectorAll(".look-strip").forEach(fitLookStrip); // escondida, a faixa não tinha largura para medir
  }

  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

  // Painel lateral: Formatar, Assistente ou Variáveis
  // abas do painel lateral: Formatar (conteúdo), Propriedades (inspetor), Assistente, Variáveis
  const PANE_TABS = ["props", "inspect", "chat", "vars"];
  const paneEls = (w) => ({ btn: document.getElementById(`tab-btn-${w}`), panel: document.getElementById(`tab-panel-${w}`) });
  const currentPane = () => PANE_TABS.find((w) => paneEls(w).panel?.classList.contains("active")) || "props";
  // menu de botão direito genérico (itens: { label, ic, fn, danger, disabled } ou { sep: true })
  function contextMenu(e, items) {
    document.querySelector(".ctx-menu")?.remove();
    const m = document.createElement("div");
    m.className = "ctx-menu";
    m.setAttribute("role", "menu");
    m.innerHTML = items.map((it, i) => it.sep ? '<div class="ctx-sep" role="separator"></div>'
      : `<button type="button" role="menuitem" class="ctx-item${it.danger ? " danger" : ""}" data-i="${i}"${it.disabled ? " disabled" : ""}><i class="ic" data-ic="${it.ic || "chevron-right"}"></i><span>${escHtml(it.label)}</span>${it.key ? `<kbd class="ctx-key">${escHtml(it.key)}</kbd>` : ""}</button>`).join("");
    document.body.append(m);
    hydrateIcons(m);
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    m.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
    const close = () => { m.remove(); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("keydown", esc, true); };
    const outside = (ev) => { if (!m.contains(ev.target)) close(); };
    const esc = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } };
    window.addEventListener("keydown", esc, true); // Esc fecha antes dos outros atalhos
    setTimeout(() => document.addEventListener("pointerdown", outside, true));
    m.onclick = (ev) => { const b = ev.target.closest("[data-i]"); if (!b || b.disabled) return; close(); items[+b.dataset.i].fn(); };
    m.querySelector(".ctx-item:not([disabled])")?.focus();
  }
  function syncChatFab() {
    const fab = document.getElementById("chat-fab");
    if (!fab) return;
    const visible = isMobile() ? dom.inspectorSidebar.classList.contains("mobile-open") : !dom.inspectorSidebar.classList.contains("collapsed");
    fab.classList.toggle("hidden", visible && currentPane() === "chat");
    const badge = document.getElementById("chat-badge");
    if (visible && currentPane() === "chat" && badge?.classList.contains("show")) badge.classList.remove("show"); // só se precisar: o observador do selo chama esta função
    fab.classList.toggle("has-news", !!document.getElementById("chat-badge")?.classList.contains("show"));
  }
  function openPane(which, { toggle = false } = {}) {
    const pane = dom.inspectorSidebar;
    if (!PANE_TABS.includes(which)) which = "props";
    const current = currentPane();
    const visible = isMobile() ? pane.classList.contains("mobile-open") : !pane.classList.contains("collapsed");
    if (toggle && visible && current === which) return closePane();
    const chat = which === "chat";
    const vars = which === "vars";
    for (const w of PANE_TABS) {
      const { btn, panel } = paneEls(w);
      btn?.classList.toggle("active", w === which);
      btn?.setAttribute("aria-selected", String(w === which));
      panel?.classList.toggle("active", w === which);
    }
    pane.classList.remove("collapsed");
    if (isMobile()) {
      pane.classList.add("mobile-open");
      document.getElementById("slides-nav")?.classList.remove("mobile-open");
    }
    dom.btnToggleChat.classList.toggle("active", chat);
    dom.btnPaneProps.classList.toggle("active", which === "props");
    store.set("pane", which);
    queueMicrotask(syncChatFab);
    if (chat) setTimeout(() => dom.chatInput.focus(), 0);
    if (vars) refreshStudioVars();
    if (which === "inspect") window.SagaInspector?.refresh();
    requestAnimationFrame(() => state.autoFit && updateCanvasScale());
  }

  function closePane() {
    dom.inspectorSidebar.classList.add("collapsed");
    dom.inspectorSidebar.classList.remove("mobile-open");
    dom.btnToggleChat.classList.remove("active");
    dom.btnPaneProps.classList.remove("active");
    store.set("pane", null);
    queueMicrotask(syncChatFab);
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
    // abas da faixa de opções. Tudo à vista de cara: as ferramentas de especialista ([data-adv]) ficam no fim de
    // cada aba, à direita (CSS), sem botão de mostrar/esconder
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
    document.getElementById("btn-api-slide").onclick = () => insertScene("api");
    document.getElementById("advanced-density-select").addEventListener("change", async (event) => {
      const slide = state.deck?.slides[state.currentSlideIndex];
      if (!slide) return;
      const value = event.currentTarget.value;
      if (value) slide.density = value;
      else delete slide.density;
      await syncDeckToServer();
      await renderCurrentSlide();
      renderThumbnails();
      showToast(value === "dense" ? "Mais conteúdo: texto preservado em um espaço mais compacto." : value === "compact" ? "Slide em modo compacto." : "Densidade padrão restaurada.");
    });
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
    dom.tabBtnVars.onclick = () => openPane("vars");
    document.getElementById("tab-btn-inspect").onclick = () => { state.autoInspect = false; openPane("inspect"); }; // escolha da pessoa: fica
    dom.btnToggleChat.onclick = () => openPane("chat", { toggle: true });
    dom.btnPaneProps.onclick = () => openPane("props", { toggle: true });
    dom.btnClosePane.onclick = closePane;
    document.getElementById("btn-model-use").onclick = useModelAsBase;
    document.getElementById("btn-prefs").onclick = openPrefs;
    document.getElementById("btn-theme-pair").onclick = (e) => { const to = e.currentTarget.dataset.pair; if (to) applyLook("theme", to); };
    document.getElementById("btn-close-prefs").onclick = () => document.getElementById("modal-prefs").classList.add("hidden");
    document.getElementById("modal-prefs").onclick = (e) => { if (e.target.id === "modal-prefs") e.target.classList.add("hidden"); };
    document.getElementById("prefs-search").oninput = filterPrefs;
    dom.btnAppTheme.onclick = () => setAppTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    // ao abrir, o painel começa no chat (a não ser que a pessoa tenha fechado o painel); paneOnLoad só para testes
    const pane = store.get("pane", "chat");
    if (pane && !isMobile()) openPane(store.get("paneOnLoad", "chat")); else closePane();

    // atalho flutuante do chat (lado direito, no meio da tela)
    document.getElementById("chat-fab").onclick = () => openPane("chat");
    syncChatFab();
    new MutationObserver(syncChatFab).observe(document.getElementById("chat-badge"), { attributes: true, attributeFilter: ["class"] });

    // duplo clique fora de um texto (fotos do carrossel, screenshot, gráfico…): abre o conteúdo do slide
    dom.renderedSlideContainer.addEventListener("dblclick", (e) => {
      if (e.target.closest(".t[data-vkey], [data-writing]")) return; // no texto, duplo clique edita o texto
      state.autoInspect = false; openPane("props");
    });
    // botão direito: ações rápidas
    const askAI = (text) => { openPane("chat"); dom.chatInput.value = text; autoGrowChat(); dom.chatInput.focus(); dom.chatInput.setSelectionRange(text.length, text.length); };
    const slideMenu = () => [
      { label: "Editar o conteúdo do slide", ic: "pencil", fn: () => { state.autoInspect = false; openPane("props"); } },
      { label: "Pedir à IA para melhorar este slide", ic: "sparkles", fn: () => askAI(`Melhore o slide ${state.currentSlideIndex + 1}: `) },
      { label: "Trocar layout…", ic: "layout-grid", fn: () => dom.btnLayoutGallery.click() },
      { label: "Arrumar layout", ic: "wand", fn: () => triggerAutofix() },
      { sep: true },
      { label: "Novo slide depois deste", ic: "plus", fn: () => openSceneLibrary() },
      { label: "Duplicar slide", ic: "copy", fn: () => duplicateCurrentSlide() },
      { label: "Apresentar a partir daqui", ic: "play", fn: () => startPresentation() },
      { sep: true },
      { label: "Excluir slide", ic: "trash-2", danger: true, fn: () => deleteCurrentSlide() },
    ];
    // no documento (e pelo ponto do clique): apertar o botão direito seleciona o objeto e o editor redesenha o slide,
    // então o elemento do evento pode já ter saído da página
    document.addEventListener("contextmenu", (e) => {
      // o que está no slide debaixo do cursor (a pílula de ações de texto e as alças flutuam por cima)
      const top = document.elementFromPoint(e.clientX, e.clientY);
      if (!top || top.closest("dialog, .modal, .ctx-menu, .task-pane, .slide-rail, .doc-view, .ribbon")) return;
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => dom.renderedSlideContainer.contains(el));
      if (!hit) return;
      if (hit.closest("[data-writing]")) return; // escrevendo no texto: o menu do navegador (copiar, colar)
      e.preventDefault();
      const obj = hit.closest("[data-vkey]");
      const V = window.SagaVisual;
      const act = (a) => () => { V?.select([obj]); document.querySelector(`.visual-toolbar [data-act="${a}"]`)?.click(); };
      const items = obj && V ? [
        { label: "Propriedades do objeto", ic: "sliders-horizontal", fn: () => { V.select([obj]); state.autoInspect = false; openPane("inspect"); } },
        { label: "Trazer para frente", ic: "bring-to-front", fn: act("front") },
        { label: "Enviar para trás", ic: "send-to-back", fn: act("back") },
        { label: "Excluir objeto", ic: "trash-2", danger: true, fn: act("delete") },
        { sep: true }, ...slideMenu(),
      ] : slideMenu();
      contextMenu(e, items);
    });
    dom.thumbnailsList.addEventListener("contextmenu", (e) => {
      const card = e.target.closest(".thumb-card"); if (!card) return;
      e.preventDefault();
      const idx = +card.dataset.idx;
      selectSlide(idx);
      contextMenu(e, [
        { label: "Novo slide depois deste", ic: "plus", fn: () => openSceneLibrary() },
        { label: "Duplicar slide", ic: "copy", fn: () => duplicateCurrentSlide() },
        { label: "Mover para cima", ic: "arrow-up", disabled: idx === 0, fn: () => moveSlide(idx, -1) },
        { label: "Mover para baixo", ic: "arrow-down", disabled: idx === state.deck.slides.length - 1, fn: () => moveSlide(idx, 1) },
        { label: "Pedir à IA para melhorar este slide", ic: "sparkles", fn: () => askAI(`Melhore o slide ${idx + 1}: `) },
        { label: "Apresentar a partir daqui", ic: "play", fn: () => startPresentation() },
        { sep: true },
        { label: "Excluir slide", ic: "trash-2", danger: true, fn: () => deleteCurrentSlide() },
      ]);
    });

    // anotações
    dom.btnNotesToggle.onclick = () => setNotesVisible(dom.notesBar.classList.contains("hidden"));
    dom.btnNotesToggleStatus.onclick = dom.btnNotesToggle.onclick;
    setNotesVisible(store.get("notes", true));

    // barra de status
    dom.statusIssues.onclick = openIssueReview;

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

    // identidade (fontes da empresa) no deck todo
    const idSel = document.getElementById("identity-select");
    idSel.addEventListener("change", () => {
      if (idSel.value) state.deck.identity = idSel.value;
      else delete state.deck.identity;
      syncDeckToServer();
      renderCurrentSlide();
      renderThumbnails();
      syncIdentity();
    });
    document.getElementById("btn-identity-setup").addEventListener("click", async () => {
      try {
        const r = await fetch("api/identities/setup", { method: "POST" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        showToast(`Escreva as fontes da empresa em ${j.file} (o arquivo explica como) e volte aqui: a lista atualiza sozinha.`, 12000);
        loadIdentities();
      } catch (e) { showToast(`Não deu para configurar: ${e.message}`, 8000); }
    });
    window.addEventListener("focus", loadIdentities); // editou o arquivo e voltou: a lista acompanha
    loadIdentities();

    // assistente: "Transformar em slides" aparece depois de uma conversa
    document.getElementById("btn-brainstorm-apply").addEventListener("click", applyBrainstorm);

    // cabeçalho e rodapé
    document.getElementById("btn-header-footer").addEventListener("click", openHeaderFooter);
    document.getElementById("btn-close-hf").addEventListener("click", closeHeaderFooter);
    document.getElementById("btn-hf-cancel").addEventListener("click", closeHeaderFooter);
    document.getElementById("btn-hf-apply").addEventListener("click", applyHeaderFooter);

    // ambientes dos slides de API
    document.getElementById("btn-api-envs").addEventListener("click", openApiEnvs);
    document.getElementById("btn-close-api-envs").addEventListener("click", closeApiEnvs);
    document.getElementById("btn-api-envs-cancel").addEventListener("click", closeApiEnvs);
    document.getElementById("btn-api-envs-save").addEventListener("click", saveApiEnvs);
    document.getElementById("btn-api-vars-studio").addEventListener("click", () => openPane("vars"));
    document.getElementById("api-envs-text").addEventListener("input", scheduleApiEnvValidation);
    // grade de variáveis: grava ao sair da célula (change) ou no Enter; Esc desfaz; a linha em branco do fim cria
    const varsPanel = document.getElementById("tab-panel-vars");
    varsPanel.addEventListener("change", (event) => {
      const row = event.target.closest("#studio-env-vars .studio-var-row");
      if (!row) return;
      if (event.target.matches("[data-var-type]")) { void changeVarType(row, event.target.value === "segredo"); return; }
      if (row.classList.contains("studio-var-new")) return; // a linha nova grava ao sair dela (ou no Enter)
      void saveStudioEnvVar(row);
    });
    const saveNewRow = (row) => { if (row?.classList.contains("studio-var-new") && row.querySelector("[data-var-name]").value.trim()) void saveStudioEnvVar(row); };
    varsPanel.addEventListener("focusout", (event) => {
      const row = event.target.closest("#studio-env-vars .studio-var-new");
      if (row && !row.contains(event.relatedTarget)) saveNewRow(row);
    });
    varsPanel.addEventListener("keydown", (event) => {
      const input = event.target.closest("#studio-env-vars .studio-var-row input");
      if (!input) return;
      if (event.key === "Escape") { input.value = input.hasAttribute("data-var-name") ? input.closest("tr").dataset.originalVar || "" : input.dataset.originalValue || ""; input.blur(); }
      if (event.key === "Enter") { event.preventDefault(); const row = input.closest(".studio-var-new"); if (row) saveNewRow(row); else input.blur(); }
    });
    varsPanel.addEventListener("click", (event) => {
      const row = event.target.closest(".studio-var-row");
      if (row && event.target.closest("[data-delete-studio-var]")) void deleteStudioEnvVar(row);
    });
    document.getElementById("tab-panel-vars").addEventListener("dragstart", (event) => {
      const row = event.target.closest("[data-studio-drag-var]");
      if (!row || !event.dataTransfer) return;
      const name = row.dataset.studioDragVar;
      event.dataTransfer.setData("text/plain", `{{${name}}}`);
      event.dataTransfer.effectAllowed = "copy";
    });
    document.getElementById("slide-fields-form").addEventListener("dragover", (event) => {
      if (event.target.closest("input:not([type=password]), textarea") && event.dataTransfer?.types.includes("text/plain")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    });
    document.getElementById("slide-fields-form").addEventListener("drop", (event) => {
      const field = event.target.closest("input:not([type=password]), textarea");
      if (!field || !event.dataTransfer?.types.includes("text/plain")) return;
      const expression = event.dataTransfer.getData("text/plain");
      if (!/^\{\{[A-Za-z_][A-Za-z0-9_.-]*\}\}$/.test(expression)) return;
      try {
        if (field.disabled || field.readOnly || typeof field.setRangeText !== "function") return;
        const start = field.selectionStart, end = field.selectionEnd;
        if (typeof start !== "number" || typeof end !== "number") return;
        event.preventDefault();
        field.focus();
        field.setRangeText(expression, start, end, "end");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      } catch { /* Some input types do not support text selection. */ }
    });

    // tema da interface (claro/escuro/automático): o botão do topo alterna; "automático" fica nas Preferências.
    // O <head> já aplicou antes do primeiro desenho.
    setAppTheme(store.get("appTheme", "system"));
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (store.get("appTheme", "system") === "system") setAppTheme("system");
    });
  }

  function setAppTheme(pref) {
    store.set("appTheme", pref);
    const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const themeButton = document.getElementById("btn-app-theme");
    if (themeButton) {
      const label = dark ? "Ativar tema claro" : "Ativar tema escuro";
      themeButton.title = label;
      themeButton.setAttribute("aria-label", label);
      themeButton.setAttribute("aria-pressed", String(dark));
    }
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
    dom.chatAttachInput.onchange = () => { [...dom.chatAttachInput.files].forEach(addChatFile); dom.chatAttachInput.value = ""; };

    // Chips de Sugestões de Prompt do Chat
    document.getElementById("chat-start-deck").addEventListener("click", openAiDeckModal);
    document.querySelectorAll(".chip-prompt").forEach((btn) => {
      if (btn.id === "chat-start-deck") return;
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
        showToast(`"${file.name}" aberto (${state.deck.slides.length} slides), com imagens e arquivos. As edições são salvas em ${data.dir}.`, 8000);
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
        showToast(`"${file.name}" aberto (${state.deck.slides.length} slides). As edições não são salvas no arquivo: use Arquivo › YAML, ou abra por Arquivo › Abrir Caminho no Servidor para salvar direto.`, 9000);
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
        showToast(`Deck carregado (${state.deck.slides.length} slides)!`);
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
      if (document.querySelector("dialog[open]")) return;
      if ([...(e.dataTransfer?.items || [])].some(i => i.type.startsWith("image/"))) { e.preventDefault(); return; }
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
      if (images.length) {
        if (e.target.closest("#tab-panel-chat")) images.forEach(addChatImage);
        else editScreenshot(null, images[0]);
        return;
      }
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
      tudo: { label: "o PowerPoint, o PDF e o roteiro", done: "um .zip com o PowerPoint (com notas), o PDF e o roteiro." },
    };
    document.querySelectorAll("[data-export]").forEach((btn) => {
      btn.onclick = async (e) => {
        e.preventDefault();
        if (btn.disabled) return;
        const kind = btn.dataset.export, clean = btn.dataset.notas === "0";
        const x = clean ? { label: "o PowerPoint sem as notas", done: "PowerPoint sem as notas do apresentador, pronto para mandar." } : EXPORTS[kind];
        btn.disabled = true;
        showToast(`Gerando ${x.label} (${state.deck.slides.length} slides)… pode levar alguns segundos.`, 60000);
        try {
          const { res, name } = await downloadFrom(`api/export/${kind}${clean ? "?notas=0" : ""}`, `apresentacao.${{ pptx: "pptx", tudo: "zip" }[kind] || "pdf"}`);
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
    setupAiDeckModal();
    dom.aiStatus.onclick = openAISettings;

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
        if (!apiEnvsModal().classList.contains("hidden")) {
          closeApiEnvs();
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
