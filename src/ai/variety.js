// Variedade de um deck: mede o que deixa uma apresentação repetitiva (e todos os decks com a mesma cara).
// É métrica, não decisão: quem decide como variar é a IA (generateDeck revisa; o Studio oferece no Ritmo).

const LISTY = new Set(["cards", "list", "steps", "stats", "bento", "agenda", "references"]);
const IMPACT = new Set(["headline", "number", "statement", "full", "quote", "question", "poll", "image", "section"]);
const FRAME = new Set(["cover", "end"]);

export function varietyReport(spec) {
  const slides = (spec?.slides || []).map((s) => ({ layout: s.layout || "blocks", tone: s.tone || "light" }));
  const body = slides.filter((s) => !FRAME.has(s.layout));
  const n = body.length;
  const problems = [];
  const distinct = new Set(body.map((s) => s.layout)).size;

  // 3+ slides seguidos com o mesmo layout
  const runs = [];
  for (let i = 0; i < slides.length;) {
    let j = i;
    while (j + 1 < slides.length && slides[j + 1].layout === slides[i].layout) j++;
    if (j - i + 1 >= 3 && !FRAME.has(slides[i].layout)) runs.push({ layout: slides[i].layout, from: i + 1, to: j + 1 });
    i = j + 1;
  }
  runs.forEach((r) => problems.push(`${r.to - r.from + 1} slides seguidos no mesmo layout (${r.layout}, slides ${r.from}–${r.to})`));

  if (n >= 6) {
    const want = Math.min(8, Math.ceil(n * 0.5));
    if (distinct < want) problems.push(`só ${distinct} layouts diferentes em ${n} slides de conteúdo (bom: ${want} ou mais)`);
    const listy = body.filter((s) => LISTY.has(s.layout)).length;
    if (listy / n > 0.45) problems.push(`${listy} de ${n} slides são listas/cartões — falta respiro (manchete, número grande, imagem, pergunta)`);
    if (!body.some((s) => IMPACT.has(s.layout))) problems.push("nenhum slide de impacto (manchete, número grande, frase, página inteira, pergunta)");
    if (new Set(slides.map((s) => s.tone)).size === 1) problems.push(`todos os slides no mesmo tom (${slides[0].tone}) — alterne com escuro/destaque nos momentos-chave`);
  }
  const counts = {};
  body.forEach((s) => (counts[s.layout] = (counts[s.layout] || 0) + 1));
  return { slides: slides.length, distinct, runs, counts, problems, ok: problems.length === 0 };
}

// Direções criativas: cada deck gerado sorteia um jeito de contar (e de se parecer), para dois decks sobre
// assuntos parecidos não saírem iguais.
export const CREATIVE_DIRECTIONS = [
  "Keynote minimalista: poucas palavras por slide, manchetes enormes, muito respiro, um número grande por ideia.",
  "Investigação jornalística: abra com um caso real, revele as pistas aos poucos (linha do tempo, antes × depois), feche com a conclusão.",
  "Workshop mão na massa: perguntas para a plateia, enquetes, etapas práticas, checklists curtos.",
  "Estudo de caso: contexto → problema → o que foi tentado → resultado em números → lições.",
  "Contra-intuitivo: comece derrubando uma crença comum; use comparações e dados que surpreendem.",
  "Visual primeiro: páginas inteiras com imagem ou figura, mosaicos (bento), diagramas — texto só como legenda.",
  "Conversa com a diretoria: decisão pedida no começo, impacto em R$, riscos numa matriz, próximos passos.",
];

export function pickDirection(seed = Math.random()) {
  return CREATIVE_DIRECTIONS[Math.floor(seed * CREATIVE_DIRECTIONS.length) % CREATIVE_DIRECTIONS.length];
}
