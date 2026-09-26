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
  "Keynote minimalista: uma frase de abertura sem ilustração, grandes espaços vazios, composição central, um número por ideia. Considere prata; destaque em cor apenas na virada.",
  "Investigação editorial: abra com uma cena concreta, revele pistas por enquadramentos e comparações, entregue a conclusão no final. Considere editorial; serifas, linhas finas, papel claro e um único contraste escuro.",
  "Workshop geométrico: abra com uma escolha da plateia, alterne desafios curtos, diagramas e timer. Considere bauhaus ou pop; formas primárias, assimetria e revelação por clique.",
  "Estudo de caso documental: contexto → problema → tentativa → resultado → lição. Considere jornal; manchetes, evidências visuais, cronologia e legendas curtas. Só use dados do briefing ou dados verificados.",
  "Contraponto: abra com duas possibilidades em comparação, questione uma crença e mostre uma evidência decisiva. Considere sinal; contraste firme, pouco ornamento e uma frase final que retoma a abertura.",
  "Atlas visual: conte a história com páginas inteiras, diagramas e detalhes ampliados; texto como legenda. Considere oceano; alterne escala, posição e composição, sem usar um mosaico em toda página.",
  "Sala de decisão: peça a decisão no começo, mostre evidências, opções, riscos e o próximo marco. Considere noite; ouro discreto, tipografia leve, gráficos limpos e transições suaves.",
  "Palco elétrico: abra com uma pergunta provocadora em tamanho gigante, crie expectativa, pause e revele. Considere aurora; tela escura, uma cor luminosa, números monumentais e participação real da plateia.",
  "Caderno de descoberta: uma pergunta inicial, um mapa de hipóteses, uma tentativa e uma descoberta. Considere rabisco; desenhos, setas e anotações visuais, com espaço para a audiência pensar.",
  "Laboratório vivo: prever → observar → explicar → experimentar. Considere terminal; use codewalk para ler código por etapas, spotlight para screenshots e uma pergunta antes da resposta. Saídas simuladas devem ser identificadas.",
  "Lançamento de produto: primeiro o benefício, depois uma demonstração visual, um detalhe ampliado, prova e convite. Considere prata ou oceano; mostre o produto em escala, evitando uma sequência de cartões de funcionalidades.",
  "Manifesto tipográfico: alterne frases muito curtas, uma pausa visual, contrastes de escala e uma conclusão coletiva. Considere editorial ou bauhaus; capa assimétrica sem ícone decorativo e cada ato com composição própria.",
];

export function pickDirection(seed = Math.random()) {
  return CREATIVE_DIRECTIONS[Math.floor(seed * CREATIVE_DIRECTIONS.length) % CREATIVE_DIRECTIONS.length];
}

// Um baralho embaralhado distribui todas as direções antes de repetir. O estado tem tamanho fixo,
// dura só nesta sessão do servidor e não armazena o conteúdo das apresentações.
export function createDirectionPicker(random = Math.random) {
  let remaining = [];
  let previous;
  return () => {
    if (!remaining.length) {
      remaining = [...CREATIVE_DIRECTIONS];
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1)) || 0));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      // Também evita a repetição na fronteira entre dois baralhos.
      if (remaining.at(-1) === previous) [remaining[0], remaining[remaining.length - 1]] = [remaining.at(-1), remaining[0]];
    }
    previous = remaining.pop();
    return previous;
  };
}

export const nextDirection = createDirectionPicker();
