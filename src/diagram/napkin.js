// Napkin AI Engine for SagaDeck
// Transforma texto bruto, notas de reunião, bullets e processos em diagramas visuais inteligentes e editáveis.
// Detecta intenção semântica: fluxo sequencial (steps), KPIs (stats/number), contraste (compare), pilares (cards), citação (quote) ou impacto (statement).

import YAML from "yaml";
import { resolveIconName } from "../figures/icons.js";

// Mapeamento semântico de palavras-chave para ícones adequados
const KEYWORD_ICONS = [
  { match: /\b(prospec|pesquis|busc|descobert|mape|explor|encontr|lead)/i, icon: "compass" },
  { match: /\b(valid|qualif|verific|audit|aprov|check|test)/i, icon: "check-circle" },
  { match: /\b(demonstr|apresent|pitch|demo|reuni|talk)/i, icon: "presentation" },
  { match: /\b(fech|contrat|assin|acord|deal|negoci)/i, icon: "file-check" },
  { match: /\b(onboard|implant|integr|instal|setup|inici)/i, icon: "rocket" },
  { match: /\b(venda|receit|lucro|fatur|faturamento|crescim|roi|arr|mrr)/i, icon: "trending-up" },
  { match: /\b(custo|despes|pre[cç]o|dinheir|pagament|investim|economia)/i, icon: "banknote" },
  { match: /\b(seguran[cç]|privacid|prote[cç]|complianc|blind|cripto|biometr)/i, icon: "shield-check" },
  { match: /\b(velocid|r[aá]pid|efici[eê]nc|aceler|performan|tempo|agil)/i, icon: "zap" },
  { match: /\b(equip|time|pessoal|pessoas|usu[aá]ri|colaborad|client)/i, icon: "users" },
  { match: /\b(dado|analit|m[eé]tric|kpi|relat|dashboard|insights)/i, icon: "bar-chart-3" },
  { match: /\b(ia|intelig[eê]nc|autom|algoritm|rob[oô]|smart)/i, icon: "sparkles" },
  { match: /\b(ideia|inova[cç]|pensament|estrat[eé]g|criativ)/i, icon: "lightbulb" },
  { match: /\b(alvo|meta|objetiv|foco|dire[cç])/i, icon: "target" },
  { match: /\b(conex|red[e]|integr|api|ecossistem|link)/i, icon: "share-2" },
  { match: /\b(ferrament|sistema|engrenag|config|infra|motor)/i, icon: "settings" },
];

function deduceIcon(text, fallback = "sparkles") {
  if (!text) return fallback;
  for (const rule of KEYWORD_ICONS) {
    if (rule.match.test(text)) return resolveIconName(rule.icon);
  }
  return resolveIconName(fallback);
}

// Limpa marcadores de listas (-, *, •, 1., a))
function stripListMarker(line) {
  return line.replace(/^[-*•]\s+/, "").replace(/^\d+[\.\)]\s+/, "").trim();
}

/**
 * Converte um bloco de texto bruto em um slide de diagrama visual inteligente (estilo Napkin AI).
 */
export function textToVisualSlide(rawText, options = {}) {
  let text = (rawText || "").trim();
  if (!text) {
    return {
      slide: { layout: "statement", text: "Ideia em branco" },
      detectedType: "statement",
      confidence: 0,
      rationale: "Texto vazio fornecido.",
    };
  }

  // Expande listas numeradas ou em bullets na mesma linha (ex: "1. Setup 2. Treino 3. Go-live")
  text = text.replace(/(\s+)(\d+[\.\)])\s+/g, "\n$2 ");
  // Separa título introdutório se houver múltiplos dois-pontos na primeira linha
  text = text.replace(/^([^:\n]{3,40}):\s*(?=[A-Za-zÀ-ÿ0-9\s]+:)/, "$1\n");
  // Expande separadores em linha como bullets ou ponto mediano (·, |, ;)
  text = text.replace(/(\s*[·|;]\s*)/g, "\n");

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Extração preliminar de Título e Kicker
  let extractedTitle = "";
  let extractedKicker = options.kicker || "";
  let contentLines = [...lines];

  const firstLine = lines[0];
  const isHeaderLine =
    firstLine.startsWith("#") ||
    firstLine.endsWith(":") ||
    (lines.length > 2 && firstLine.length < 60 && !/^[-*•\d]/.test(firstLine));

  if (isHeaderLine) {
    extractedTitle = firstLine.replace(/^#+\s*/, "").replace(/:$/, "").trim();
    contentLines = lines.slice(1);
  }

  // Tenta extrair kicker entre colchetes ou antes de barra: [VENDAS] ou PROCESSO //
  const kickerMatch = extractedTitle.match(/^\[(.*?)\]\s*(.*)$/) || extractedTitle.match(/^(.*?)\s*[\/|]\s*(.*)$/);
  if (kickerMatch && kickerMatch[2]) {
    extractedKicker = kickerMatch[1].trim();
    extractedTitle = kickerMatch[2].trim();
  }

  // Se não extraiu título do header, gera um trigger title curto
  if (!extractedTitle) {
    extractedTitle = options.title || "Visão Geral";
  }

  // 2. Análise Semântica de Padrões (Napkin Pattern Classifier)

  // PADRÃO 1: Citação (Quote)
  const isQuote =
    (text.startsWith('"') || text.startsWith('“') || text.includes('”') || text.includes(' - ')) &&
    (text.includes(' - ') || text.includes(' — ') || lines.some((l) => /^[-—]\s*[A-Z]/.test(l)));
  if (isQuote && lines.length <= 4) {
    const fullText = lines.join(" ");
    const quoteMatch = fullText.match(/^["“]?([^"”]+)["”]?\s*[-—]\s*(.*)$/);
    if (quoteMatch) {
      return {
        slide: {
          layout: "quote",
          quote: quoteMatch[1].trim(),
          by: quoteMatch[2].trim(),
          tone: options.tone || "dark",
        },
        detectedType: "quote",
        confidence: 0.95,
        rationale: "Detectada citação com atribuição de autor.",
      };
    }
  }

  // PADRÃO 2: Código (Code)
  const hasCodeBlock = text.includes("```") || (lines.length > 2 && lines.filter((l) => /^(const|let|var|function|import|export|class|def|return)\b/.test(l)).length >= 2);
  if (hasCodeBlock) {
    const cleanCode = text.replace(/```[a-z]*\n?/gi, "").trim();
    return {
      slide: {
        layout: "code",
        title: extractedTitle !== "Visão Geral" ? extractedTitle : "Implementação",
        code: cleanCode,
        lang: options.lang || "javascript",
        kicker: extractedKicker || "CÓDIGO",
      },
      detectedType: "code",
      confidence: 0.98,
      rationale: "Detectado bloco de código ou sintaxe de programação.",
    };
  }

  // PADRÃO 3: Comparação / Contraste / Prós e Contras / Antes vs Depois (Compare)
  const compareTriggerRegex = /\b(vs|versus|contra|antes\s*(?:x|vs|e|\/)\s*depois|problema\s*(?:vs|x)\s*solu[cç][aã]o|pr[oó]s\s*(?:e|x|vs)\s*contras|vantagens\s*(?:e|x|vs)\s*desvantagens)\b/i;
  const hasCompareHeader = compareTriggerRegex.test(extractedTitle) || compareTriggerRegex.test(firstLine);
  const leftRightSections = splitIntoCompareSections(contentLines);

  if (hasCompareHeader || leftRightSections) {
    const leftTitle = leftRightSections?.leftTitle || "Antes / Tradicional";
    const rightTitle = leftRightSections?.rightTitle || "Depois / Com IA";
    const leftItems = (leftRightSections?.leftItems && leftRightSections.leftItems.length > 0)
      ? leftRightSections.leftItems
      : ["Processo manual lento", "Alto custo de equipe", "Risco de erro humano"];
    const rightItems = (leftRightSections?.rightItems && leftRightSections.rightItems.length > 0)
      ? leftRightSections.rightItems
      : ["Automação instantânea", "Zero custo extra", "Precisão determinística"];

    return {
      slide: {
        layout: "compare",
        kicker: extractedKicker || "COMPARAÇÃO",
        title: extractedTitle !== "Visão Geral" ? extractedTitle : "Diferencial Competitivo",
        left: {
          title: leftTitle,
          items: leftItems,
        },
        right: {
          title: rightTitle,
          items: rightItems,
        },
        tone: options.tone || "dark",
      },
      detectedType: "compare",
      confidence: 0.92,
      rationale: "Detectado contraste entre duas ideias, estados (antes/depois) ou prós/contras.",
    };
  }

  // PADRÃO 4: Fluxo Sequencial / Processo / Pipeline / Roadmap (Steps) - prioridade antes de métricas se houver marcadores ordinais
  const isSequential = detectSequentialFlow(contentLines, extractedTitle);
  if (isSequential.matches) {
    const stepItems = isSequential.items.map((it, idx) => ({
      step: idx + 1,
      title: it.title,
      desc: it.desc || "",
      icon: it.icon || deduceIcon(it.title + " " + it.desc, idx === 0 ? "compass" : idx === isSequential.items.length - 1 ? "rocket" : "zap"),
    }));

    return {
      slide: {
        layout: "steps",
        kicker: extractedKicker || "FLUXO DE TRABALHO",
        title: extractedTitle,
        steps: stepItems.slice(0, 5),
        tone: options.tone || "dark",
      },
      detectedType: "steps",
      confidence: 0.94,
      rationale: `Detectado processo em ${stepItems.length} etapas sequenciais com marcadores cronológicos.`,
    };
  }

  // PADRÃO 5: Métricas & KPIs (Stats / Number)
  const statItems = extractMetrics(contentLines);
  if (statItems.length >= 2) {
    return {
      slide: {
        layout: "stats",
        kicker: extractedKicker || "MÉTRICAS-CHAVE",
        title: extractedTitle,
        stats: statItems.slice(0, 4),
        tone: options.tone || "dark",
      },
      detectedType: "stats",
      confidence: 0.9,
      rationale: `Detectados ${statItems.length} indicadores quantitativos (percentuais, moeda ou multiplicadores).`,
    };
  } else if (statItems.length === 1 && lines.length <= 4) {
    return {
      slide: {
        layout: "number",
        kicker: extractedKicker || "IMPACTO",
        value: statItems[0].value,
        label: statItems[0].label || extractedTitle,
        note: statItems[0].note || "",
        tone: options.tone || "accent",
      },
      detectedType: "number",
      confidence: 0.93,
      rationale: "Detectado KPI único de alto impacto.",
    };
  }

  // PADRÃO 6: Grade de Pilares / Benefícios / Módulos (Cards)
  const cardItems = extractCardItems(contentLines);
  if (cardItems.length >= 2 && cardItems.length <= 4) {
    return {
      slide: {
        layout: "cards",
        kicker: extractedKicker || "PILARES FUNDAMENTAIS",
        title: extractedTitle,
        cards: cardItems.map((c) => ({
          title: c.title,
          desc: c.desc,
          icon: deduceIcon(c.title + " " + c.desc, "sparkles"),
        })),
        tone: options.tone || "dark",
      },
      detectedType: "cards",
      confidence: 0.85,
      rationale: `Detectada estrutura multi-pilar com ${cardItems.length} blocos conceituais independentes.`,
    };
  }

  // PADRÃO 7: Frase de Impacto Única (Statement)
  if (lines.length <= 2 && text.length < 140 && !text.includes(":")) {
    return {
      slide: {
        layout: "statement",
        kicker: extractedKicker,
        text: text,
        tone: options.tone || "accent",
      },
      detectedType: "statement",
      confidence: 0.82,
      rationale: "Texto curto e direto de alta densidade sem marcadores secundários.",
    };
  }

  // PADRÃO 8: Fallback Inteligente (Split: Narrativa + Destaque)
  const bulletItems = contentLines.map(stripListMarker).filter(Boolean);
  return {
    slide: {
      layout: "split",
      kicker: extractedKicker || "CONCEITO",
      title: extractedTitle,
      left: bulletItems.slice(0, 4),
      right: bulletItems.slice(4).length > 0 ? bulletItems.slice(4, 8) : undefined,
      tone: options.tone || "dark",
    },
    detectedType: "split",
    confidence: 0.75,
    rationale: "Estrutura descritiva formatada com layout dividido para equilíbrio visual.",
  };
}

// Auxiliar: Detecta se o texto é um fluxo sequencial
function detectSequentialFlow(lines, title = "") {
  const nonFlowKeywords = /\b(pilar|pilares|princ[ií]pio|princ[ií]pios|benef[ií]cio|benef[ií]cios|vantagen|vantagens|recurso|recursos|m[oó]dulo|m[oó]dulos|diferencia|diferenciais)\b/i;
  if (nonFlowKeywords.test(title)) return { matches: false, items: [] };

  const flowKeywords = /\b(fase|etapa|passo|passos|fluxo|pipeline|roadmap|jornada|ciclo|step|primeiro|segundo|terceiro|em seguida|depois|finalmente)\b/i;
  const isExplicitFlow = flowKeywords.test(title);

  const sequentialItems = [];
  let numberedMatches = 0;

  for (const line of lines) {
    const numMatch = line.match(/^(\d+)[\.\)]\s*(.*)$/);
    if (numMatch) {
      numberedMatches++;
      const [t, d] = splitTitleDesc(numMatch[2]);
      sequentialItems.push({ title: t, desc: d });
    } else if (line.startsWith("-") || line.startsWith("*") || line.startsWith("•")) {
      const stripped = stripListMarker(line);
      const [t, d] = splitTitleDesc(stripped);
      sequentialItems.push({ title: t, desc: d });
    }
  }

  if (numberedMatches >= 2 || (isExplicitFlow && sequentialItems.length >= 2)) {
    return { matches: true, items: sequentialItems.slice(0, 5) };
  }

  return { matches: false, items: [] };
}

// Auxiliar: Extrai métricas e valores quantitativos
function extractMetrics(lines) {
  const stats = [];
  const metricRegex = /([+~-]?\s*(?:R\$\s*|\$\s*|USD\s*|€\s*)?\d+[.,\d]*\s*(?:%|x|M|bi|mi|milhões|bilhões|k|ms|s|h|fps)?)/i;

  for (const line of lines) {
    const clean = stripListMarker(line);
    // Ex: "99.9% de uptime garantido no SLA" ou "Crescimento: +140% no ano"
    const colonParts = clean.split(":");
    if (colonParts.length === 2) {
      const p1 = colonParts[0].trim();
      const p2 = colonParts[1].trim();
      const valMatch1 = p1.match(metricRegex);
      const valMatch2 = p2.match(metricRegex);

      if (valMatch1 && isNumericMetric(valMatch1[1])) {
        stats.push({ value: valMatch1[1].trim(), label: p2, icon: deduceIcon(p2, "trending-up") });
        continue;
      } else if (valMatch2 && (isNumericMetric(valMatch2[1]) || /^\d+$/.test(valMatch2[1].trim()))) {
        stats.push({ value: valMatch2[1].trim(), label: p1, icon: deduceIcon(p1, "trending-up") });
        continue;
      }
    }

    // Procura número isolado no início da frase
    const leadMatch = clean.match(/^([+~-]?\s*(?:R\$\s*|\$\s*)?\d+[.,\d]*\s*(?:%|x|k|M|bi|mi)?)\s+[-–—]?\s*(.*)$/i);
    if (leadMatch && isNumericMetric(leadMatch[1])) {
      stats.push({ value: leadMatch[1].trim(), label: leadMatch[2].trim(), icon: deduceIcon(leadMatch[2], "trending-up") });
    }
  }

  return stats;
}

function isNumericMetric(str) {
  if (!str) return false;
  const s = str.trim();
  if (/^\d+[\.\)]$/.test(s)) return false;
  const hasUnit = /[%xkmMbi$R€]/i.test(s);
  const isFormattedNumber = /^\d+([.,]\d+)+$/.test(s);
  return hasUnit || isFormattedNumber;
}

// Auxiliar: Separa seções para Compare
function splitIntoCompareSections(lines) {
  let leftTitle = "Antes";
  let rightTitle = "Depois";
  const leftItems = [];
  const rightItems = [];
  let currentSide = "left";

  const sideRegex = /^(antes|problema|tradicional|atual|antigo|sem ia|contra|lado a|de um lado)/i;
  const rightRegex = /^(depois|solu[cç][aã]o|sagadeck|novo|com ia|pr[oó]|lado b|do outro lado)/i;

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx <= 25) {
      const prefix = line.slice(0, colonIdx).trim();
      const rest = line.slice(colonIdx + 1).trim();
      if (sideRegex.test(prefix)) {
        leftTitle = prefix;
        currentSide = "left";
        if (rest) leftItems.push(stripListMarker(rest));
        continue;
      } else if (rightRegex.test(prefix)) {
        rightTitle = prefix;
        currentSide = "right";
        if (rest) rightItems.push(stripListMarker(rest));
        continue;
      }
    }

    // Detecção "X vs Y" na mesma linha
    if (line.includes(" vs ") || line.includes(" x ")) {
      const [l, r] = line.split(/\s+(?:vs|x)\s+/i);
      if (l && r) {
        leftItems.push(stripListMarker(l));
        rightItems.push(stripListMarker(r));
        continue;
      }
    }

    const clean = stripListMarker(line);
    if (!clean) continue;
    if (currentSide === "left") leftItems.push(clean);
    else rightItems.push(clean);
  }

  if (leftItems.length > 0 && rightItems.length > 0) {
    return { leftTitle, rightTitle, leftItems: leftItems.slice(0, 5), rightItems: rightItems.slice(0, 5) };
  }
  return null;
}

// Auxiliar: Extrai cards conceituais
function extractCardItems(lines) {
  const cards = [];
  for (const line of lines) {
    const clean = stripListMarker(line);
    if (!clean) continue;
    const [title, desc] = splitTitleDesc(clean);
    cards.push({ title, desc });
  }
  return cards;
}

// Separa "Título: Descrição" ou "Título - Descrição"
function splitTitleDesc(text) {
  const match = text.match(/^(.*?)\s*[:–—]\s*(.*)$/);
  if (match && match[1].length < 40) {
    return [match[1].trim(), match[2].trim()];
  }
  const words = text.split(" ");
  if (words.length <= 4) return [text, ""];
  return [words.slice(0, 3).join(" "), words.slice(3).join(" ")];
}

/**
 * Converte notas completas ou texto longo em um deck inteiro de slides visuais.
 */
export function textToVisualDeck(rawText, options = {}) {
  const text = (rawText || "").trim();
  // Divide por delimitador triplo --- ou por quebras de linha duplas com headers #
  const chunks = text
    .split(/(?:\n\s*---\s*\n|\n(?=#\s+))/)
    .map((c) => c.trim())
    .filter(Boolean);

  const slides = [];
  for (const chunk of chunks) {
    const res = textToVisualSlide(chunk, options);
    slides.push(res.slide);
  }

  return {
    title: options.title || slides[0]?.title || "Apresentação Visual",
    theme: options.theme || "sinal",
    slides: slides.length > 0 ? slides : [textToVisualSlide(rawText, options).slide],
  };
}

/**
 * Retorna YAML pronto para copiar ou salvar em arquivo.
 */
export function napkinToYaml(rawText, options = {}) {
  const deck = textToVisualDeck(rawText, options);
  return YAML.stringify(deck, { indent: 2 });
}
