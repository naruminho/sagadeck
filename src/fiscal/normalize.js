// sagadeck · Normalizador Flexível de Schema (Anti-Alucinação para IAs)
// Tolerante a variações sintáticas, termos em português e aliases comuns que
// modelos de IA econômicos (Haiku, Flash, GPT-4o-mini, DeepSeek) possam gerar.

const COLOR_MAP = {
  azul: "0066FF",
  verde: "10B981",
  amarelo: "F59E0B",
  vermelho: "EF4444",
  roxo: "8B5CF6",
  rosa: "EC4899",
  cinza: "86868B",
  preto: "1D1D1F",
  branco: "FFFFFF",
};

export function normalizeSpec(rawSpec) {
  if (!rawSpec || typeof rawSpec !== "object") return rawSpec;
  const spec = JSON.parse(JSON.stringify(rawSpec));

  // 1. Normalização no nível da raiz
  if (spec.tema && !spec.theme) {
    spec.theme = spec.tema;
    delete spec.tema;
  }
  if (spec.titulo && !spec.title) {
    spec.title = spec.titulo;
    delete spec.titulo;
  }
  if (spec.duracao && !spec.duration) {
    spec.duration = spec.duracao;
    delete spec.duracao;
  }
  if (!Array.isArray(spec.slides)) {
    if (Array.isArray(spec.slide)) spec.slides = spec.slide;
    else if (spec.slides && typeof spec.slides === "object") spec.slides = Object.values(spec.slides);
    else spec.slides = [];
  }

  // 2. Normalização slide a slide
  spec.slides = spec.slides.map((s) => {
    if (!s || typeof s !== "object") return { layout: "statement", text: String(s) };

    // Termos em português para campos básicos
    if (s.titulo && !s.title) { s.title = s.titulo; delete s.titulo; }
    if (s.subtitulo && !s.subtitle) { s.subtitle = s.subtitulo; delete s.subtitulo; }
    if (s.notas && !s.notes) { s.notes = s.notas; delete s.notas; }
    if (s.fonte && !s.source) { s.source = s.fonte; delete s.fonte; }
    if (s.tempo && !s.time) { s.time = s.tempo; delete s.tempo; }
    if (s.tom && !s.tone) { s.tone = s.tom; delete s.tom; }

    // Aliases para layout stats (KPIs)
    if (s.kpis || s.metricas) {
      s.stats = s.stats || s.kpis || s.metricas;
      delete s.kpis;
      delete s.metricas;
    }
    if (Array.isArray(s.stats)) {
      s.stats = s.stats.map((st) => {
        if (typeof st !== "object") return { value: String(st) };
        if (st.valor && !st.value) { st.value = st.valor; delete st.valor; }
        if (st.rotulo && !st.label) { st.label = st.rotulo; delete st.rotulo; }
        if (st.tendencia && !st.trend) { st.trend = st.tendencia; delete st.tendencia; }
        if (st.icone && !st.icon) { st.icon = st.icone; delete st.icone; }
        return st;
      });
    }

    // Aliases para layout steps (Processo)
    if (s.process || s.fluxo || s.passos || s.etapas) {
      s.steps = s.steps || s.process || s.fluxo || s.passos || s.etapas;
      delete s.process;
      delete s.fluxo;
      delete s.passos;
      delete s.etapas;
    }
    if (Array.isArray(s.steps)) {
      s.steps = s.steps.map((st, i) => {
        if (typeof st !== "object") return { stepNum: i + 1, title: String(st) };
        if (st.passo && !st.title) { st.title = st.passo; delete st.passo; }
        if (st.etapa && !st.title) { st.title = st.etapa; delete st.etapa; }
        if (st.descricao && !st.text) { st.text = st.descricao; delete st.descricao; }
        if (st.texto && !st.text) { st.text = st.texto; delete st.texto; }
        if (st.icone && !st.icon) { st.icon = st.icone; delete st.icone; }
        if (st.step && !st.stepNum && typeof st.step === "number") st.stepNum = st.step;
        return st;
      });
    }

    // Aliases em cards
    if (Array.isArray(s.items)) {
      s.items = s.items.map((it) => {
        if (typeof it !== "object") return it;
        if (it.titulo && !it.title) { it.title = it.titulo; delete it.titulo; }
        if (it.texto && !it.text) { it.text = it.texto; delete it.texto; }
        if (it.icone && !it.icon) { it.icon = it.icone; delete it.icone; }
        if (it.progresso != null && it.progress == null) { it.progress = it.progresso; delete it.progresso; }
        if (it.avaliacao != null && it.rating == null) { it.rating = it.avaliacao; delete it.avaliacao; }
        return it;
      });
    }

    // Cores comuns em português
    if (s.color && COLOR_MAP[s.color.toLowerCase()]) {
      s.color = COLOR_MAP[s.color.toLowerCase()];
    }
    if (s.bg && COLOR_MAP[s.bg.toLowerCase()]) {
      s.bg = COLOR_MAP[s.bg.toLowerCase()];
    }

    return s;
  });

  return spec;
}
