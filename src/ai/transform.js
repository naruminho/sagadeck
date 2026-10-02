// Transformar uma apresentação que já existe (importada de um PowerPoint): tarefa agêntica que o chat inicia quando a
// pessoa pede para melhorar ou recriar a apresentação inteira (o modelo decide; ver `transform:` no PATCH_FORMAT).
//   melhorar — mesmo estilo do original (a moldura dele vira o mestre), conteúdo mais claro e mais rico; cada slide
//              mudado leva a marca de revisão (review) e o original fica em original/original.yaml para Desfazer
//   recriar  — do zero, com tudo o que o sagadeck faz, sem perder nada do original
// Etapas: VER (o modelo de visão descreve as figuras de cada slide original) → PLANEJAR → ESCREVER em blocos →
// CONFERIR (os fatos do original por código; o desenho por visão, lado a lado com a foto do original) → MONTAR.
// O modelo de texto escreve; o de visão vê (llm.js: papel "vision"). Juntar slides progressivos é código, não IA.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import YAML from "yaml";
import { chat, llmConfig } from "./llm.js";
import { systemPrompt, extractYaml, parseYaml, validateSlides, sanitizeCheck, materializeImages, countImagePrompts } from "./deck-ai.js";
import { groundSpotlights } from "./ground.js";
import { normalizeSpec } from "../fiscal/normalize.js";
import { plainOf } from "../import/pptx.js";
import { styleFromImport, repeatedFrame } from "../master.js";
import { mergeProgressive } from "../import/merge.js";
import { ensureUids, newUid } from "../uid.js";

const clip = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const jsonOf = (text) => {
  const m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/) || [null, String(text).slice(String(text).indexOf("{"), String(text).lastIndexOf("}") + 1)];
  return JSON.parse(m[1]);
};
// resposta cortada no meio (o modelo de visão gasta parte dos tokens pensando): os objetos completos da lista
// "slides" valem; o resto se pede de novo. Devolve { slides: [...], partial: true|false }.
export function jsonLoose(text) {
  try { return { ...jsonOf(text), partial: false }; } catch {}
  const t = String(text), start = t.search(/"slides"\s*:\s*\[/);
  if (start < 0) throw new Error("resposta sem JSON");
  const out = [];
  let i = t.indexOf("[", start) + 1, depth = 0, from = -1, inStr = false;
  for (; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") { if (depth++ === 0) from = i; }
    else if (c === "}") { if (--depth === 0 && from >= 0) { try { out.push(JSON.parse(t.slice(from, i + 1))); } catch {} from = -1; } }
    else if (c === "]" && depth === 0) break;
  }
  if (!out.length) throw new Error("resposta cortada antes do primeiro item");
  return { slides: out, partial: true };
}

// ------------------------------------------------------------------------------------------------ fatos (código)
const deaccent = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const canon = (v) => (Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : null);
// leituras possíveis de um número escrito (0,385 = 0.385; 10.000 = 10000; "0.385" pode ser as duas coisas)
const numVals = (tok) => {
  const t = tok.replace(/\s/g, "");
  const out = new Set();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) out.add(canon(Number(t.replace(/\./g, "").replace(",", ".")))); // milhar pt-BR
  if (/^\d+([.,]\d+)?$/.test(t)) out.add(canon(Number(t.replace(",", "."))));
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) out.add(canon(Number(t.replace(/,/g, "")))); // milhar em inglês
  return [...out].filter(Boolean);
};
const numVal = (tok) => numVals(tok)[0] || null;
const STOP = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM", "NO", "NA", "OU", "UM", "UMA", "OS", "AS", "A", "O", "SE", "PARA", "COM", "POR", "QUE", "NAO", "SAO"]);
function textsOfSlide(s) {
  const out = [];
  for (const e of s.elements || []) {
    if (e.deco) continue;
    if (e.textbox) { const t = plainOf(e).trim(); if (t && !/^\d{1,3}$/.test(t)) out.push(t); }
    if (e.tableData) for (const r of e.tableData) out.push(r.join(" | "));
  }
  return out;
}
export function factsOf(slide, extra = "") {
  const text = [...textsOfSlide(slide), extra].join("\n");
  const numbers = new Set();
  const alts = new Map();
  for (const tok of text.match(/\d+(?:[.,]\d+)*/g) || []) {
    const vs = numVals(tok), v = vs[0];
    if (v == null || v === "0" || /^\d$/.test(v)) continue;
    numbers.add(v); alts.set(v, vs);
  }
  const terms = new Set();
  // siglas: SAE, IDF, TR (o \b do JS não conhece acento: "MÁXIMA" não pode virar a sigla "XIMA")
  // frase toda em caixa alta (título dentro da figura: "BOCA DE LOBO", "DRENAGEM URBANA") não é fileira de siglas:
  // palavra de 3+ letras (só letras) com outra palavra em caixa alta do lado fica de fora; sigla com número (BL1) vale
  const capsPhrase = new Set();
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])(?:\p{Lu}{2,}[\p{Lu}\p{N}]*)(?:[ \t]+(?:\p{Lu}{2,}[\p{Lu}\p{N}]*|\p{N}+))+(?![\p{L}\p{N}])/gu))
    for (const w of m[0].split(/[ \t]+/)) if (/^\p{Lu}{3,}$/u.test(w)) capsPhrase.add(w);
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])([A-Z][A-Z0-9]{1,6})(?![\p{L}\p{N}])/gu)) if (!STOP.has(deaccent(m[1])) && !capsPhrase.has(m[1])) terms.add(m[1]);
  // nomes próprios no meio da frase; palavra comum com maiúscula (item de lista, cabeçalho) que aparece minúscula no
  // mesmo slide não é nome
  // (o espaço antes é da mesma linha: a 1ª palavra de cada linha do PowerPoint começa com maiúscula e não é nome; e
  // palavra seguida de ":" é rótulo, "Obs:", "Fonte:")
  for (const m of text.matchAll(/(?:[a-zà-ú,;][ \t])([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-úç]{2,}(?:[ \t]+(?:(?:de|da|do|dos|das|e)[ \t]+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-úç]{2,})*)(?![\p{L}]*\s*:)/gu)) {
    const low = m[1].toLowerCase();
    if (!m[1].includes(" ") && new RegExp(`(?<![\\p{L}])${low}(?![\\p{L}])`, "u").test(text)) continue;
    terms.add(m[1]);
  }
  return { numbers, terms, alts };
}
function textOfProduced(slides) {
  const acc = [];
  const walk = (v, k) => {
    if (["image", "drawing", "style", "font", "color", "review", "original"].includes(k)) return;
    if (typeof v === "string" || typeof v === "number") acc.push(String(v));
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
  };
  slides.forEach((s) => walk(s));
  return acc.join("\n");
}
export function missingFacts(facts, slides) {
  const text = textOfProduced(slides);
  const nums = new Set((text.match(/\d+(?:[.,]\d+)*/g) || []).flatMap(numVals));
  const low = deaccent(text).toLowerCase();
  return {
    numbers: [...facts.numbers].filter((n) => !(facts.alts?.get(n) || [n]).some((v) => nums.has(v))),
    terms: [...facts.terms].filter((t) => !low.includes(deaccent(t).toLowerCase())),
  };
}

// Erro de digitação do escritor ("Ajute", "probailidade", "Distribuião", "Periodo"): a palavra nova que não está no
// original mas é uma palavra dele com UMA letra a menos (no meio: "chuva" de "chuvas" é plural, não erro) ou sem o
// acento. Vocabulário = as palavras do original. Vai para a correção como possível erro; quem decide é a IA.
const WORD = /[\p{L}]{4,}/gu;
export function vocabularyOf(slides) {
  const v = new Map(); // forma sem acento, minúscula → a palavra como está no original
  for (const s of slides) for (const t of textsOfSlide(s)) for (const w of t.match(WORD) || []) {
    const k = w.toLowerCase();
    if (!v.has(k)) v.set(k, w);
  }
  return v;
}
export function typosOf(slides, vocab) {
  if (!vocab.size) return [];
  const plain = new Map(), dropped = new Map();
  for (const [k, w] of vocab) {
    const d = deaccent(k);
    if (!plain.has(d)) plain.set(d, w);
    // a última letra não (plural); a primeira só em palavra comprida ("arras" de "barras")
    for (let i = k.length >= 6 ? 0 : 1; i < k.length - 1; i++) { const x = k.slice(0, i) + k.slice(i + 1); if (!dropped.has(x)) dropped.set(x, w); }
  }
  const out = new Map();
  for (const w of textOfProduced(slides).replace(/\$[^$\n]*\$|`[^`]*`/g, " ").match(WORD) || []) {
    const k = w.toLowerCase();
    if (vocab.has(k) || out.has(k)) continue;
    // sem acento onde o original tem ("Periodo"); o contrário (o novo com acento) é correção, não erro
    const near = (deaccent(k) === k ? plain.get(k) : null) || dropped.get(k);
    if (near) out.set(k, `"${w}" (no original: "${near}")`);
  }
  return [...out.values()];
}

// ------------------------------------------------------------------------------------------------ regras
const TOOLBOX = `Ferramentas para cada item do plano (campo "acao"):
- "manter": o slide original fica como está (só no modo melhorar; use quando ele já está bom ou é uma figura específica que não ganha nada sendo refeita).
- "juntar": slides que são o MESMO desenho crescendo (a pessoa copiou o slide e foi acrescentando partes para "animar") viram UM slide que se monta por cliques. É feito por código, exato, com o desenho original. Informe em "de" os números, na ordem.
- "escrever": você reescreve um ou mais slides originais ("de") com os layouts do sagadeck. Diga em "ideia" o layout e o recurso (ex.: "calc com L e Δh → tc de Kirpich"; "chart de colunas com a tabela de contagem"; "spotlight no mapa com o exutório, o divisor e a área azul").
- "novo": slide que não existia (exercício resolvido, calculadora, pergunta para a turma, gráfico feito a partir de uma tabela, algoritmo passo a passo de um método, resumo). "de" = os slides que dão a base (os dados vêm deles).
Recursos do sagadeck que costumam fazer diferença numa aula: calc (fórmula com entradas que a turma mexe), science (curvas com controles), chart (toda tabela numérica pode virar gráfico), solution (exercício resolvido passo a passo com os dados do próprio material), algo com program: (um método passo a passo como programa: ordenar e classificar, redistribuir blocos…), spotlight (mapa ou figura com regiões explicadas), compare, timeline, diagram, infographic, question/poll, split com a figura original.`;
const CONTENT_RULES = `Regras de conteúdo (valem sempre):
- NADA do original pode se perder: números, unidades, fórmulas, nomes, siglas, leis, fontes/créditos das figuras, exemplos, tabelas inteiras, observações. Se não couber no slide, vai para outro slide, para \`consulta\` ou para notes.
- Figuras: pense como um designer que entende do assunto, figura por figura. REDESENHE bonito com os recursos do sagadeck sempre que der para reconstruir sem perder nada: gráfico cujos dados ou cuja equação estão no material (\`chart\` com os pontos, ou \`science\` com a curva da equação), tabela em imagem legível (\`table\`), esquema, fluxo ou ciclo (\`infographic\`, \`diagram\`), equação (LaTeX). Original feio, borrado ou escaneado que dá para reconstruir: reconstrua. MANTENHA a imagem original (image: …, ou figure: { image: … }, pelo caminho dado) só quando ela é insubstituível: foto real, mapa de um lugar, figura com dado que não dá para ler ou reproduzir com fidelidade; aí ela fica, mesmo feia, com a fonte. NUNCA as duas: redesenhou ou transcreveu (tabela, equação, gráfico), a imagem original não entra, nem como "versão alternativa" ou "imagem original". Confira o caminho: a imagem tem de ser a do assunto do slide.
- Não invente dado. Se o original parecer ter um erro (fórmula que contradiz o gráfico, número que não fecha), NÃO troque em silêncio: aponte em "alertas" e, no slide, mostre o que o material sustenta com uma nota curta para o professor validar.
- Tabela que veio como IMAGEM (recorte de livro, print) e que a visão transcreveu inteira e legível: reescreva como \`table\` de verdade (cabeçalho, linhas, a fonte em \`source\`), nas cores do deck; se algum valor ficou ilegível, mantenha a imagem original. Dado tabular espalhado em texto também vira \`table\`.
- Fórmula vai em LaTeX (\`$…$\` no texto, \`equations\` no \`science\`, \`latex\` no \`solution\`), nunca como imagem: a imagem de equação do original (recorte do OLE) só entra se a visão não conseguiu transcrever; transcrita, não repita a imagem. Uma fórmula importante por slide, grande; a explicação das variáveis em lista ao lado ou embaixo.
- Figura que é ILUSTRAÇÃO (desenho de uma cena, corte de terreno, perfil de solo, mapa, esquema desenhado; não fluxograma de caixas e setas, não gráfico, não tabela) com imagem ESCANEADA ou PIXELADA, genérica ou específica: REDESENHE como ilustração, com o modelo de imagem, a partir dela (não vire diagrama de caixas: ilustração volta como ilustração, bem feita): no lugar de \`image:\`, \`image_prompt: "Clean up and redraw THIS EXACT figure as if traced over it: same aspect ratio, same framing, every line in the same place; crisp lines, gentle colors (…cores que combinem com o deck…). Copy every text label exactly as written, letter by letter, at the same position; leave out what is unreadable; add no new text."\` e \`image_ref: <o caminho da imagem original dada>\` (com \`fit: contain\`). Descreva no prompt, em inglês, o que a figura mostra (ruas, curvas de nível, rio…) para o modelo não errar. O original fica guardado; a conferência compara os dois.
- Ilustração nova (uma cena, um objeto, um processo físico, a capa) onde uma imagem explica melhor que ícone ou diagrama: \`image_prompt: "…em inglês…"\` sem \`image_ref\`. Com moderação: as que fazem diferença.
- \`full\` (imagem de fundo com texto por cima) só para FOTO; gráfico, esquema, mapa e tabela nunca vão em \`full\` (o texto cobre os dados): use \`split\` (texto ao lado) ou \`image\`.
- Camadas físicas (atmosfera, superfície, solo, lençol, rocha; o perfil de um terreno): \`infographic\` com \`shape: camadas\`, de cima para baixo como na realidade, com os fluxos entre elas em \`flows\`; nunca um \`diagram\` (o fluxograma ordena pelas setas e põe a atmosfera embaixo).
- Gráfico 3D (\`plot.surface\`) só com a função ou os dados do próprio material; nada de superfície de enfeite (uma onda qualquer chamada de "terreno").
- Ciclo (algo que volta ao começo: ciclo hidrológico, PDCA, ciclo de vida): \`infographic\` com \`shape: ciclo\` (etapas em volta, setas curvas), nunca \`diagram\` (no fluxograma a volta vira setas cruzando o desenho).
- Exercício novo: quando o material já tem os dados (a série, a tabela, a bacia do original), prefira usá-los.
- Figura de um slide: um ícone sozinho só quando não houver nada melhor; prefira um gráfico ou esquema do próprio conceito (declividade: o perfil do rio num \`chart\`).
- Escreva em português, no tom do material (aula). Confira a ortografia de cada título e texto antes de responder.`;
// o uso do material (o plano escolhe pelo pedido: "proposito"); vale para quem escreve
const PURPOSE_RULES = {
  palestra: "- É para APRESENTAR (palestra): letra que se lê do fundo da sala. Não use \`dossier\` (página de consulta, letra pequena) nem encha um slide; o que é para ler depois vai em \`consulta\` (material de estudo) ou em outro slide.",
  consulta: "- É material para ESTUDAR depois (consulta): a explicação fica no slide, em parágrafos curtos, com toda a informação (o aluno lê sozinho); letra legível, nada de \`dossier\` de letra miúda; sem slide só de título, sem \"número de impacto\"; código e contas completos.",
};
const MODE_RULES = {
  melhorar: `MODO MELHORAR: o estilo é o do original (a moldura dele — faixa, logos, linha do título, número — já está no mestre do deck; use os layouts do sagadeck normalmente, sem redesenhar a moldura). Na capa, a moldura já traz os logos e o texto institucional do original: a capa nova leva só título, subtítulo, autor e data (não repita logo nem instituição). O título dos slides de conteúdo vai na faixa do título da moldura: uma linha curta, como no original. O aprofundamento que não cabe no slide vai em \`consulta\` (material de estudo). Mantenha a ORDEM do original; inclusões entram perto do assunto. Melhore onde ganha: estrutura, clareza, interação, exercícios, redesenho de figura genérica. Slide que já está bom: "manter". Cada slide que mudar vai ser marcado para o professor validar.`,
  recriar: `MODO RECRIAR: uma apresentação nova, do zero, com o melhor que o sagadeck faz (escolha o tema em "tema"). O tema e a paleta: os que o pedido disser (ou o jeito que ele pedir: "colorido", "sóbrio"); sem nada no pedido, o que você achar melhor para o assunto. A ordem pode mudar se a didática ganhar (seções, uma ideia por slide, exercícios no ponto certo). "manter" não vale; use "juntar", "escrever" e "novo". Todo slide original precisa ir para algum item (o conteúdo dele não pode sumir).`,
};

// ------------------------------------------------------------------------------------------------ tarefa
// A tarefa é persistente: o estado vai para .sagadeck/transform/tarefa-<modo>.json a cada etapa e a cada bloco;
// pedir de novo (mesmo modo, mesmo original) RETOMA de onde parou. Cancelar (signal) chega até a chamada ao modelo.
// Limites de chamadas, tokens e tempo param com um resultado parcial aproveitável. Estados: concluido | parcial |
// revisar (terminou, mas algo precisa do professor).
export const ANALYSIS_VERSION = 2; // muda quando o pedido ao modelo de visão muda: o cache antigo não vale
export class TransformStop extends Error { constructor(msg, kind) { super(msg); this.kind = kind; } }
const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
// calls: as chamadas que escrevem e pensam; looks: as de olhar (conferência visual de cada slide, localização dos
// destaques), curtas e sem raciocínio, uma por slide a cada rodada de correção
const DEFAULT_LIMITS = { calls: 300, looks: 2000, tokens: 6_000_000, minutes: 120 };
// impressão dos slides originais (o que a tarefa transforma): outra importação = outra tarefa
export function sourceHash(spec) {
  const originals = (spec?.slides || []).filter((s) => s.layout === "canvas" && s.original);
  return sha1(JSON.stringify(originals.map((s) => ({ n: s.original.slide, e: s.elements, notes: s.notes }))));
}
// a tarefa guardada (para retomar e para mostrar o andamento): { status, stage, srcHash, feitos, itens, updated } | null
export function jobStatus(dir, mode) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, ".sagadeck", "transform", `tarefa-${mode}.json`), "utf8"));
    return { mode, status: j.status, stage: j.stage, srcHash: j.srcHash, feitos: Object.keys(j.results || {}).length, itens: j.plan?.slides?.length || 0, calls: j.calls, updated: j.updated };
  } catch { return null; }
}

export async function transformDeck({ spec, dir, mode = "melhorar", request = "", onProgress = () => {}, textModel, visionModel, maxRounds = 2, signal, limits = {}, log = () => {}, resume = true }) {
  if (!["melhorar", "recriar"].includes(mode)) throw new Error(`modo desconhecido: ${mode}`);
  const originals = (spec.slides || []).filter((s) => s.layout === "canvas" && s.original);
  if (!originals.length) throw new Error("Esta apresentação não veio de uma importação (importe o PowerPoint primeiro: Biblioteca › Importar apresentação).");
  const cfg = llmConfig();
  const T = textModel || cfg.textModel, V = visionModel || cfg.visionModel;
  const lim = { ...DEFAULT_LIMITS, ...Object.fromEntries(Object.entries(limits || {}).filter(([, v]) => Number(v) > 0)) };
  const cacheDir = path.join(dir, ".sagadeck", "transform");
  fs.mkdirSync(cacheDir, { recursive: true });
  const srcHash = sourceHash(spec);
  const jobFile = path.join(cacheDir, `tarefa-${mode}.json`);
  let job = null;
  if (resume) { try { const j = JSON.parse(fs.readFileSync(jobFile, "utf8")); if (j.srcHash === srcHash && j.status !== "concluido") job = j; } catch {} }
  const resumed = !!job;
  if (!job) job = { version: 1, mode, request, srcHash, status: "andamento", stage: "ver", plan: null, results: {}, checks: {}, usage: {}, calls: 0, spentMs: 0, created: new Date().toISOString() };
  job.textModel = T; job.visionModel = V; job.request = request || job.request; job.status = "andamento";
  const save = () => { job.updated = new Date().toISOString(); fs.writeFileSync(jobFile, JSON.stringify(job)); };
  // resposta do modelo que não deu para usar: fica guardada (as 40 últimas) para entender o que ele mandou
  const failDir = path.join(cacheDir, "falhas");
  const keepFailure = (name, text, err) => {
    try {
      fs.mkdirSync(failDir, { recursive: true });
      fs.writeFileSync(path.join(failDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}.txt`), `${err?.message || ""}\n\n----- resposta -----\n${text}`);
      const all = fs.readdirSync(failDir).sort();
      for (const f of all.slice(0, Math.max(0, all.length - 40))) fs.rmSync(path.join(failDir, f), { force: true });
    } catch {}
  };
  const t0 = Date.now(), spentBefore = job.spentMs || 0;
  const tokens = () => Object.values(job.usage).reduce((a, u) => a + u.in + u.out, 0);
  const ask = async (messages, { model = T, maxTokens = 16000, temperature = 0.3, think } = {}) => {
    if (signal?.aborted) throw new TransformStop("Parado a pedido.", "cancelado");
    const look = think === false;
    if (!look && job.calls >= lim.calls) throw new TransformStop(`Limite de ${lim.calls} chamadas.`, "limite");
    if (look && (job.looks || 0) >= lim.looks) throw new TransformStop(`Limite de ${lim.looks} conferências.`, "limite");
    if (tokens() >= lim.tokens) throw new TransformStop(`Limite de ${lim.tokens} tokens.`, "limite");
    if (spentBefore + Date.now() - t0 >= lim.minutes * 60000) throw new TransformStop(`Limite de ${lim.minutes} minutos.`, "limite");
    if (look) job.looks = (job.looks || 0) + 1; else job.calls++;
    let r;
    // em streaming (os cabeçalhos chegam logo; chamada longa não cai no limite de 300 s do fetch) e mostrando o texto
    // chegando; erro passageiro (rede, 5xx) tenta de novo uma vez
    let shown = 0;
    const onDelta = (_, all) => { if (all.length - shown > 1500) { shown = all.length; onProgress({ ...lastProgress, chars: all.length }); } };
    for (let attempt = 1; ; attempt++) {
      try { r = await chat(messages, { model, maxTokens, temperature, think, signal, onDelta }); break; }
      catch (e) {
        if (signal?.aborted) throw new TransformStop("Parado a pedido.", "cancelado");
        const transient = !e.status || e.status >= 500 || e.status === 429;
        if (attempt >= 2 || !transient) throw e;
        log({ retry: e.message });
        await new Promise((ok) => setTimeout(ok, 3000));
      }
    }
    const u = job.usage[r.model || model] || (job.usage[r.model || model] = { calls: 0, in: 0, out: 0 });
    u.calls++; u.in += r.usage?.prompt_tokens || 0; u.out += r.usage?.completion_tokens || 0;
    log({ model: r.model || model, usage: r.usage });
    return r;
  };
  let lastProgress = {};
  const progress = (phase, text, extra = {}) => { lastProgress = { phase: `transform-${phase}`, text, ...extra }; onProgress(lastProgress); };
  if (resumed) for (const [k, r] of Object.entries(job.results)) if (r.state === "falhou") delete job.results[k]; // tenta de novo o que não saiu
  if (resumed) progress("retomar", `Retomando a tarefa de onde parou (${Object.keys(job.results).length} item(ns) já prontos).`);
  const orig = new Map(originals.map((s) => [s.original.slide, s]));
  const imgFile = (s) => s.original?.image && path.join(dir, s.original.image);
  const imgCount = new Map();
  for (const s of originals) for (const e of s.elements) if (e.image) imgCount.set(e.image, (imgCount.get(e.image) || 0) + 1);
  const contentImages = (s) => [...new Set(s.elements.filter((e) => e.image && !e.deco && imgCount.get(e.image) <= Math.max(2, originals.length * 0.2)).map((e) => e.image))];
  const report = { faltando: [], problemas: [], pendentes: [], revisar: [] };
  let stop = null;

  // ---- 1. VER — cache pelo conteúdo da foto do slide (e pela versão da análise); falha não conta como feita
  const figFile = path.join(cacheDir, "figuras.json");
  let figCache = {};
  try { figCache = JSON.parse(fs.readFileSync(figFile, "utf8")); } catch {}
  const figKey = (s) => { const f = imgFile(s); return f && fs.existsSync(f) ? `${sha1(fs.readFileSync(f))}:v${ANALYSIS_VERSION}` : null; };
  const figs = {};
  const candidates = originals.filter((s) => imgFile(s) && fs.existsSync(imgFile(s)) && (contentImages(s).length || s.elements.filter((e) => e.drawing && !e.deco).length >= 3 || s.elements.some((e) => e.table)));
  // o cache de antes da "aparencia" (digital, foto, escaneada, pixelada) é olhado de novo: sem ela, nada é redesenhado
  // ("qualidade: boa/ruim" era subjetivo: a visão achava boa até o mapa de xerox)
  for (const s of candidates) { const k = figKey(s); if (k && figCache[k] && (figCache[k].figuras || []).every((f) => "aparencia" in f && "arquivo" in f)) figs[s.original.slide] = figCache[k]; }
  const needFig = candidates.filter((s) => !figs[s.original.slide]);
  try {
    if (needFig.length) {
      const { imagesAsDataUrls } = await import("../import/crop.js");
      const urls = await imagesAsDataUrls(needFig.map(imgFile), { width: 1024 });
      const queue = [];
      for (let k = 0; k < needFig.length; k += 4) queue.push(needFig.slice(k, k + 4));
      const urlOf = new Map(needFig.map((s, j) => [s, urls[j]]));
      // lotes em paralelo, como a escrita (SAGADECK_TRANSFORM_PARALLEL); o que volta para a fila (resposta cortada) é
      // pego por quem estiver livre
      let qi = 0, halted = null;
      const look = async (batch) => {
        const k = needFig.indexOf(batch[0]);
        progress("ver", `Olhando as figuras do original (slides ${batch.map((s) => s.original.slide).join(", ")})…`, { done: k, total: needFig.length });
        const content = [{ type: "text", text: `Fotos de slides de uma apresentação. Para cada slide, descreva as FIGURAS (não o texto corrido, que eu já tenho): o que é (esquema, mapa, gráfico, foto, tabela em imagem, equação em imagem, desenho), se é GENÉRICA (conceito que qualquer livro desenha igual e pode ser redesenhado sem perder nada) ou ESPECÍFICA (mapa de um lugar, dado de experimento, foto real, gráfico com dados que não estão no texto: tem que ser mantida), a APARÊNCIA da imagem ("digital": desenho limpo feito no computador; "foto": fotografia real; "escaneada": papel escaneado, fotocopiado ou fotografado, com traço grosso, manchas ou preto e branco chapado, de livro ou apostila; "pixelada": baixa resolução, borrada, serrilhada) e transcreva os dados legíveis (números, rótulos, eixos, legendas, fórmulas em LaTeX). TABELA em imagem: transcreva-a INTEIRA, uma linha por linha com as células separadas por " | " (o cabeçalho primeiro), e diga se algum valor ficou ilegível. Diga também se o slide parece continuação do anterior (o mesmo desenho com partes a mais). Cada figura que é uma das imagens dadas leva o "arquivo" dela (o nome que vem antes da imagem); figura desenhada no próprio slide (formas, caixas de texto) leva "arquivo": "". Mapa ou desenho em preto e branco de traço grosso, com letras de máquina ou à mão, de livro antigo, é "escaneada".
Responda só JSON: {"slides":[{"n":6,"figuras":[{"arquivo":"imagens/original/image4.png","tipo":"esquema","generica":true,"aparencia":"escaneada","o_que":"…","dados":"…"}],"continua_anterior":false}]}` }];
        for (const s of batch) {
          content.push({ type: "text", text: `Slide ${s.original.slide}:` }, { type: "image_url", image_url: { url: urlOf.get(s) } });
          const files = contentImages(s);
          if (files.length === 1) content.push({ type: "text", text: `(a imagem deste slide é o arquivo ${files[0]})` });
          if (files.length > 1) {
            const urls = await imagesAsDataUrls(files.map((f) => path.join(dir, f)), { width: 640 });
            files.forEach((f, j) => { if (urls[j]) content.push({ type: "text", text: `Arquivo ${f} (uma das imagens do slide ${s.original.slide}):` }, { type: "image_url", image_url: { url: urls[j] } }); });
          }
        }
        try {
          const r = await ask([{ role: "user", content }], { model: V, maxTokens: 16000 });
          const got = jsonLoose(r.text);
          for (const it of got.slides || []) {
            const s = orig.get(Number(it.n));
            if (!s) continue;
            figs[s.original.slide] = it;
            const key = figKey(s); if (key) figCache[key] = it;
          }
          // resposta cortada: os que ficaram de fora vão de novo, um por vez
          const left = batch.filter((s) => !figs[s.original.slide]);
          if (left.length && batch.length > 1) left.forEach((s) => queue.push([s]));
          else if (left.length) report.problemas.push(`não consegui ver as figuras do slide ${left[0].original.slide} (resposta incompleta): segue só com o texto`);
        } catch (e) {
          if (e instanceof TransformStop) { halted = halted || e; return; }
          if (batch.length > 1) batch.forEach((s) => queue.push([s]));
          else report.problemas.push(`não consegui ver as figuras do slide ${batch[0].original.slide} (${clip(e.message, 120)}): segue só com o texto`);
        }
        fs.writeFileSync(figFile, JSON.stringify(figCache, null, 1));
      };
      const lookWorker = async () => { while (!halted && qi < queue.length) await look(queue[qi++]); };
      const lanes = Math.max(1, Math.min(16, Number(process.env.SAGADECK_TRANSFORM_PARALLEL) || 8));
      await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, lookWorker));
      if (halted) throw halted;
    }
  } catch (e) { if (e instanceof TransformStop) stop = e; else throw e; }

  const brief = (s) => {
    const n = s.original.slide;
    const f = figs[n]?.figuras?.length ? `\n  figuras: ${figs[n].figuras.map((x) => `${x.arquivo ? `(arquivo ${x.arquivo}) ` : ""}[${x.generica ? "genérica" : "ESPECÍFICA"}${/escaneada|pixelada/.test(x.aparencia || "") ? `, imagem ${String(x.aparencia).toUpperCase()}` : ""}] ${x.tipo}: ${x.o_que}${x.dados ? ` — dados: ${x.dados}` : ""}`).join(" | ")}` : "";
    const imgs = contentImages(s);
    return `### slide ${n}: ${s.title || ""}\n${textsOfSlide(s).map((t) => `  ${t.replace(/\n/g, "\n  ")}`).join("\n")}${f}${imgs.length ? `\n  imagens: ${imgs.join(", ")}` : ""}${s.notes ? `\n  notas: ${clip(s.notes, 1500)}` : ""}${figs[n]?.continua_anterior ? "\n  (parece continuação do slide anterior: o mesmo desenho com partes a mais)" : ""}`;
  };

  // ---- 2. PLANEJAR (fica salvo: retomar não replaneja)
  const style = mode === "melhorar" ? styleFromImport(spec) : null;
  if (!job.plan && !stop) {
    job.stage = "plano"; save();
    progress("plano", "Planejando o que fazer com cada slide…");
    const planMsg = [
      { role: "system", content: `${systemPrompt({ images: false })}\n\n${TOOLBOX}\n\n${CONTENT_RULES}\n\n${MODE_RULES[mode]}` },
      { role: "user", content: `Pedido do professor: ${request || (mode === "melhorar" ? "melhore a apresentação mantendo o estilo" : "recrie a apresentação do zero")}

Apresentação original (${originals.length} slides; proporção ${spec.aspect || "16:9"}):
${originals.map(brief).join("\n\n")}

Faça o PLANO. Responda só com um bloco \`\`\`json:
{"tema": "${mode === "recriar" ? "um dos temas do sagadeck" : "(ignorado no modo melhorar)"}", ${mode === "recriar" ? '"paleta": "uma das paletas do sagadeck, se o pedido ou o assunto pedir (senão omita)", ' : ""}"proposito": "palestra (para apresentar; o padrão) ou consulta (para o aluno estudar depois), pelo pedido", "titulo": "título da apresentação", "alertas": ["possível erro no conteúdo, com o slide"], "slides": [{"acao": "manter|juntar|escrever|novo", "de": [3], "ideia": "o que vai ter e qual layout/recurso", "imagens": ["imagens/…"]}]}
Todos os slides de 1 a ${originals.length} precisam aparecer em algum "de". Mantenha "ideia" curta (1 a 2 frases).` },
    ];
    try {
      for (let attempt = 1; attempt <= 3 && !job.plan; attempt++) {
        const r = await ask(planMsg, { maxTokens: 24000 });
        try {
          const p = jsonOf(r.text);
          if (!Array.isArray(p.slides) || !p.slides.length) throw new Error('o JSON precisa de "slides" com os itens do plano');
          job.plan = p;
        } catch (e) { planMsg.push({ role: "assistant", content: r.text }, { role: "user", content: `Não deu para ler o plano (${e.message}). Responda de novo só com o bloco \`\`\`json, completo.` }); }
      }
    } catch (e) { if (e instanceof TransformStop) stop = e; else throw e; }
    if (job.plan) {
      // cobertura: todo slide original em algum item (o que faltar entra onde estava)
      const covered = new Set(job.plan.slides.flatMap((it) => (it.de || []).map(Number)));
      for (const n of originals.map((s) => s.original.slide).filter((n) => !covered.has(n))) {
        const at = job.plan.slides.findIndex((it) => Math.min(...(it.de || [Infinity])) > n);
        const item = { acao: mode === "melhorar" ? "manter" : "escrever", de: [n], ideia: "(o plano esqueceu este slide: entra aqui para não perder o conteúdo)", auto: true };
        if (at < 0) job.plan.slides.push(item); else job.plan.slides.splice(at, 0, item);
      }
      // recriar é redesenhar: nem "manter" nem "juntar" (juntar os progressivos guarda os desenhos velhos do original)
      if (mode === "recriar") job.plan.slides.forEach((it) => { if (it.acao === "manter" || it.acao === "juntar") it.acao = "escrever"; });
      save();
    }
  }
  if (!job.plan) {
    job.status = "parcial"; job.spentMs = spentBefore + Date.now() - t0; save();
    if (stop) throw stop;
    throw new Error("A IA não conseguiu fazer o plano.");
  }
  const plan = job.plan;

  // ---- 3. ESCREVER em blocos + 4. CONFERIR (fatos por código, desenho por visão, de novo depois de cada correção)
  const deckBase = mode === "melhorar"
    ? { title: spec.title, aspect: spec.aspect, theme: style.theme, master: style.master, footer: false }
    : { title: plan.titulo || spec.title, aspect: spec.aspect, theme: plan.tema && typeof plan.tema === "string" ? plan.tema : "oceano" };
  // para que é (o que o pedido disse: o plano escolhe) e, no recriar, a paleta; o que não existe fica no padrão
  deckBase.purpose = PURPOSE_RULES[plan.proposito] ? plan.proposito : "palestra";
  try {
    const { THEMES, PALETTES } = await import("../themes.js");
    if (typeof deckBase.theme === "string" && !THEMES[deckBase.theme]) deckBase.theme = "oceano";
    if (mode === "recriar" && typeof plan.paleta === "string" && PALETTES[plan.paleta]) deckBase.palette = plan.paleta;
  } catch {}
  const writeSystem = `${systemPrompt({ images: false })}\n\n${CONTENT_RULES}\n${PURPOSE_RULES[deckBase.purpose]}\n\n${MODE_RULES[mode]}\n\nFormato: responda com UM bloco \`\`\`yaml com \`slides:\` (a lista de slides completos). Cada slide leva \`origem: N\` (o número do ITEM do plano de onde ele saiu) e \`mudou: "uma frase: o que mudou em relação ao original"\`. Um item pode virar mais de um slide. Caminhos de imagem: só os que foram dados. Coloque entre aspas todo texto com ": " ou que comece com marcação.`;
  const srcOf = (it) => (it.de || []).map((n) => orig.get(Number(n))).filter(Boolean);
  const vocab = vocabularyOf(originals);
  // manter e juntar: código (sem IA)
  plan.slides.forEach((it, k) => {
    if (job.results[k]) return;
    const src = srcOf(it);
    if (it.acao === "manter" && src.length) job.results[k] = { slides: src.map((s) => structuredClone(s)), state: "ok" };
    if (it.acao === "juntar" && src.length) {
      const merged = mergeProgressive(src);
      if (mode === "melhorar") merged.review = { status: "alterado", note: `Os slides ${src.map((s) => s.original.slide).join(", ")} viraram um só, que se monta por cliques (o mesmo desenho).`, original: src[0].original.slide };
      job.results[k] = { slides: [merged], state: "ok" };
    }
  });
  job.stage = "escrever"; save();
  // fatos do original: o texto do slide e, para cada figura que NÃO foi mantida no novo, o que a visão leu nela (eixos,
  // rótulos). Figura mantida (a mesma imagem no slide novo) já carrega os números dela: não cobra de novo no texto.
  // Pendência é só o que estava ESCRITO no original (texto, tabela do PowerPoint, notas) e sumiu. O que a visão leu
  // numa figura (eixos, coordenadas de mapa, rótulos) é aproximado e, numa figura redesenhada, nem precisa estar no
  // texto: vira dica para a correção (figureFacts), nunca pendência. A imagem do original também não é cobrada: a IA
  // decide se redesenha ou mantém (a conferência visual compara com a foto do original e aponta o que se perdeu).
  const factsFor = (it) => {
    const facts = { numbers: new Set(), terms: new Set(), alts: new Map() };
    for (const s of srcOf(it)) { const f = factsOf(s); f.numbers.forEach((x) => facts.numbers.add(x)); f.terms.forEach((x) => facts.terms.add(x)); f.alts.forEach((v, key) => facts.alts.set(key, v)); }
    return facts;
  };
  const figureFacts = (it, produced = []) => {
    const facts = { numbers: new Set(), terms: new Set(), alts: new Map() };
    const used = JSON.stringify(produced);
    for (const s of srcOf(it)) {
      const kept = contentImages(s).length && contentImages(s).every((im) => used.includes(im));
      if (kept) continue;
      const f = factsOf({ elements: [] }, figs[s.original.slide]?.figuras?.map((x) => x.dados || "").join(" "));
      f.numbers.forEach((x) => facts.numbers.add(x)); f.terms.forEach((x) => facts.terms.add(x)); f.alts.forEach((v, key) => facts.alts.set(key, v));
    }
    return facts;
  };
  // imagem do original que a visão viu como gráfico, mapa, tabela, esquema (não foto): sai inteira (fit: contain).
  // Cortar perde eixo e legenda, e no layout image a legenda ia por cima do gráfico (com contain, vai embaixo).
  const notPhoto = new Set();
  for (const s of originals) {
    const kinds = (figs[s.original.slide]?.figuras || []).map((f) => String(f.tipo || ""));
    if (kinds.length && kinds.some((t) => !/foto|photo|fotografia/i.test(t))) contentImages(s).forEach((im) => notPhoto.add(im));
  }
  const wholeFigures = (slides) => {
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (typeof o.image === "string" && notPhoto.has(o.image) && (!o.fit || o.fit === "cover")) o.fit = "contain";
      for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
    };
    slides.forEach(walk);
    return slides;
  };
  const siblingsOf = (k) => plan.slides.map((x, j) => (j !== k && (x.de || []).some((n) => (plan.slides[k].de || []).includes(n)) ? j : -1)).filter((j) => j >= 0);
  const writable = plan.slides.map((it, k) => ({ it, k })).filter(({ it, k }) => (it.acao === "escrever" || it.acao === "novo") && !job.results[k]);
  const BATCH = 5;
  const batches = [];
  for (let b = 0; b < writable.length; b += BATCH) batches.push(writable.slice(b, b + BATCH));
  // blocos em paralelo (cada um é independente: o plano já diz o que vai em cada item); SAGADECK_TRANSFORM_PARALLEL
  // troca quantos de cada vez (1 = um por vez, como antes)
  const parallel = Math.max(1, Math.min(16, Number(process.env.SAGADECK_TRANSFORM_PARALLEL) || 8));
  // image_prompt (e image_ref, o redesenho de uma figura ruim do original) vira arquivo em imagens/ia; o que não sai
  // volta a ser a figura de base (ou um ícone, sem base)
  // o que a visão viu em cada imagem do original (pelos tipos das figuras do slide dela): gráfico, tabela e equação
  // não vão para o modelo de imagem (saíam como figura com número trocado e rótulo em inglês, e a fórmula como foto);
  // são refeitos com chart, table e LaTeX. Só ilustração (esquema, mapa, desenho, corte) é redesenhada.
  const tiposDe = new Map(), figDe = new Map();
  for (const s of originals) {
    const fs_ = figs[s.original.slide]?.figuras || [], files = contentImages(s);
    for (const img of files) tiposDe.set(img, fs_.map((f) => String(f.tipo || "")));
    // a figura de cada arquivo (a visão diz qual é qual; com uma imagem só e uma figura, é ela)
    for (const f of fs_) if (f.arquivo && files.includes(f.arquivo)) figDe.set(f.arquivo, f);
    if (files.length === 1 && fs_.length === 1 && !figDe.has(files[0])) figDe.set(files[0], fs_[0]);
  }
  const tipoDe = (img) => (figDe.has(img) ? [String(figDe.get(img).tipo || "")] : tiposDe.get(img));
  const naoIlustracao = (ref) => { const t = tipoDe(ref); return !!t?.length && t.every((x) => /gr[aá]fico|tabela|equa|f[oó]rmula/i.test(x)); };
  const ilustracaoRuim = (img) => { const f = figDe.get(img); return !!f && /mapa|esquema|desenho|ilustra|corte|perfil/i.test(f.tipo || "") && !/gr[aá]fico|tabela|equa/i.test(f.tipo || "") && /escaneada|pixelada/.test(f.aparencia || ""); };
  const themeName = typeof deckBase.theme === "string" ? deckBase.theme : "clean";
  const keepDataFigures = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(keepDataFigures);
    if (typeof node.image_ref === "string" && node.image_prompt && naoIlustracao(node.image_ref)) {
      report.problemas.push(`redesenho recusado (${node.image_ref} é gráfico, tabela ou equação: refaça com chart, table ou LaTeX)`);
      node.image = node.image_ref; delete node.image_prompt; delete node.image_ref;
    }
    // ilustração de xerox que a escritora deixou como estava: o redesenho é automático (a regra pedia e ela ignorava;
    // o mapa do posto fluviométrico ficou o xerox); a conferência visual compara com o original
    if (typeof node.image === "string" && !node.image_prompt && !node.image_ref && ilustracaoRuim(node.image)) {
      const f = figDe.get(node.image);
      node.image_prompt = `Clean up and redraw THIS EXACT figure as if traced over it: same aspect ratio, same framing, every line in the same place; crisp lines and gentle colors that fit a "${themeName}" presentation. Redraw only the figure itself: if the source is a screenshot or a scanned page (window frame, toolbar, scroll bars, page edges, the book's caption line), leave them out. It shows: ${clip(f.o_que, 300)}. Copy every text label exactly as written, letter by letter, at the same position${f.dados ? ` (${clip(f.dados, 300)})` : ""}; leave out what is unreadable; add no new text.`;
      node.image_ref = node.image;
      if (!node.fit) node.fit = "contain";
      if (!node.alt && f.o_que) node.alt = clip(f.o_que, 160); // senão o texto alternativo vira o pedido ao modelo de imagem
    }
    for (const v of Object.values(node)) keepDataFigures(v);
  };
  // imagem do original que é uma EQUAÇÃO num slide novo: a fórmula vai em LaTeX (a imagem ficava, e às vezes no slide
  // errado: a fórmula de P no lugar do hidrograma). Volta para a correção com o que a visão leu.
  const equationImages = (slides) => {
    const out = [];
    slides.forEach((sl, j) => {
      const walk = (o) => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk);
        if (typeof o.image === "string") { const f = figDe.get(o.image); if (f && /equa|f[oó]rmula/i.test(f.tipo || "")) out.push({ j, img: o.image, f }); }
        for (const v of Object.values(o)) walk(v); };
      walk(sl);
    });
    return out;
  };
  const groundMemo = new Map();
  const drawImages = async (slides) => {
    keepDataFigures(slides);
    if (countImagePrompts({ slides })) {
      if (signal?.aborted) throw new TransformStop("Parado a pedido.", "cancelado");
      progress("escrever", "Desenhando as ilustrações…");
      const r = await materializeImages({ slides }, { baseDir: dir, assetsDir: path.join(dir, "imagens", "ia"), max: 6 });
      job.images = (job.images || 0) + r.done.length;
      for (const f of r.failed) report.problemas.push(`ilustração não saiu (${clip(f.error, 100)}): ${clip(f.prompt, 80)}`);
    }
    // foco guiado: a visão olha a figura e põe cada destaque no lugar (a escritora não vê a figura e chutava)
    await groundSpotlights(slides, { baseDir: dir, memo: groundMemo, onFail: (t, e) => report.problemas.push(`foco guiado "${clip(t.replace(/[=*]/g, ""), 60)}": não localizei os destaques na figura (${clip(e.message, 120)}); as caixas são as da escrita`), ask: async (content) => (await ask([{ role: "user", content }], { model: V, maxTokens: 8000, think: false })).text, onProgress: (t) => progress("conferir", t) });
  };
  const runBatch = async (batch) => {
    if (stop) return;
    try {
      progress("escrever", `Escrevendo ${batch.length === 1 ? "o item" : "os itens"} ${batch.map(({ k }) => k + 1).join(", ")} de ${plan.slides.length}…`, { done: Object.keys(job.results).length, total: plan.slides.length });
      const itemsText = batch.map(({ it, k }) => `## ITEM ${k + 1} — ${it.acao}: ${it.ideia}${it.imagens?.length ? `\nImagens para usar: ${it.imagens.join(", ")}` : ""}\nOriginal:\n${srcOf(it).map(brief).join("\n\n") || "(nenhum)"}`).join("\n\n");
      const before = plan.slides.slice(Math.max(0, batch[0].k - 3), batch[0].k).map((it) => `- ${it.ideia}`).join("\n");
      const messages = [
        { role: "system", content: writeSystem },
        { role: "user", content: `Deck: título "${deckBase.title}", tema ${typeof deckBase.theme === "string" ? deckBase.theme : "o do original (mestre já aplicado)"}.${before ? `\nLogo antes vêm:\n${before}` : ""}\n\nEscreva os slides destes itens do plano:\n\n${itemsText}` },
      ];
      let produced = null, lastErr = null;
      for (let attempt = 1; attempt <= 3 && !produced; attempt++) {
        const r = await ask(messages);
        try { produced = wholeFigures(parseProduced(r.text, batch, deckBase, dir)); }
        catch (e) { lastErr = e; keepFailure(`escrita-${batch.map(({ k }) => k + 1).join("-")}`, r.text, e); messages.push({ role: "assistant", content: r.text }, { role: "user", content: `Não deu para usar:\n${e.message}\nCorrija e responda de novo com o bloco \`\`\`yaml completo.` }); }
      }
      // o bloco não saiu (a resposta parou no meio e faltaram itens, por exemplo): cada item vai de novo, sozinho,
      // para a fila; só o item que não sai nem sozinho fica como falhou
      if (!produced && batch.length > 1) { batches.push(...batch.map((b) => [b])); return; }
      if (!produced) {
        report.problemas.push(`itens ${batch.map(({ k }) => k + 1).join(", ")}: não saíram (${clip(lastErr?.message, 160)})`);
        for (const { k } of batch) job.results[k] = { slides: null, state: "falhou" };
        save(); return;
      }
      await drawImages(produced);
      // conferir → corrigir → conferir de novo (a última conferência também olha o desenho)
      let issues = [], hints = [];
      for (let round = 0; ; round++) {
        issues = []; hints = [];
        for (const { k } of batch) {
          const typos = typosOf(produced.filter((s) => s.origem === k + 1), vocab);
          // dica, não erro: palavra certa também pode ser a do original com uma letra a menos ("estão" de "gestão")
          if (typos.length) hints.push(`ITEM ${k + 1}: confira a grafia (letra faltando ou sem acento?): ${typos.slice(0, 15).join(", ")}`);
        }
        for (const { j, img, f } of equationImages(produced)) {
          issues.push({ k: (produced[j]?.origem || batch[0].k + 1) - 1, kind: "desenho", text: `slide novo ${j + 1} (item ${produced[j]?.origem}): a imagem ${img} é uma EQUAÇÃO${f.dados ? ` (${clip(f.dados, 200)})` : ""}, não uma figura: escreva a fórmula em LaTeX ($…$ no texto, ou equations/latex) e tire a imagem; se o slide precisava de outra figura, use o arquivo certo` });
        }
        for (const { it, k } of batch) {
          if (!srcOf(it).length || it.acao === "novo") continue;
          const mine = produced.filter((s) => s.origem === k + 1);
          const sib = siblingsOf(k);
          const others = [...sib.flatMap((j) => job.results[j]?.slides || []), ...produced.filter((s) => sib.includes(s.origem - 1))];
          const miss = missingFacts(factsFor(it), [...mine, ...others]);
          if (miss.numbers.length || miss.terms.length) issues.push({ k, kind: "fatos", miss, text: `ITEM ${k + 1}: faltou do original ${[miss.numbers.length ? `números ${miss.numbers.slice(0, 30).join(", ")}` : "", miss.terms.length ? `nomes/siglas ${miss.terms.slice(0, 20).join(", ")}` : ""].filter(Boolean).join("; ")}` });
          const fig = missingFacts(figureFacts(it, [...mine, ...others]), [...mine, ...others]);
          const figNums = fig.numbers.filter((x) => !miss.numbers.includes(x)), figTerms = fig.terms.filter((x) => !miss.terms.includes(x));
          if (figNums.length || figTerms.length) hints.push(`ITEM ${k + 1}: a figura do original mostrava ${[figNums.length ? `os números ${figNums.slice(0, 20).join(", ")}` : "", figTerms.length ? `os nomes ${figTerms.slice(0, 12).join(", ")}` : ""].filter(Boolean).join(" e ")}; se a figura foi redesenhada, confira se o que importa está nela (marcações de eixo não precisam)`);
        }
        try {
          progress("conferir", `Conferindo o desenho dos itens ${batch.map(({ k }) => k + 1).join(", ")}${round ? " (depois da correção)" : ""}…`);
          const seen = await visualCheck({ produced, batch, deckBase, dir, orig, ask, model: V, mode, keepFailure });
          for (const v of seen) issues.push({ ...v, kind: "desenho" });
          if (seen.missed?.length) report.problemas.push(`conferência visual sem resposta nos slides novos ${seen.missed.join(", ")} dos itens ${batch.map(({ k }) => k + 1).join(", ")}`);
        } catch (e) {
          if (e instanceof TransformStop) throw e;
          report.problemas.push(`conferência visual dos itens ${batch.map(({ k }) => k + 1).join(", ")} falhou: ${clip(e.message, 160)}`);
        }
        if (!issues.length || round >= maxRounds) break;
        progress("corrigir", `Corrigindo ${issues.length} ponto(s) nos itens ${[...new Set(issues.map((x) => x.k + 1))].join(", ")}…`);
        const fixMsg = [...messages, { role: "assistant", content: `\`\`\`yaml\n${YAML.stringify({ slides: produced })}\`\`\`` },
          { role: "user", content: `Conferi estes slides contra o original e contra a foto de como ficaram:\n${issues.map((x) => `- ${x.text}`).join("\n")}${hints.length ? `\n\nDicas (não são erro): ${hints.map((x) => `\n- ${x}`).join("")}` : ""}\n\nDevolva o bloco \`\`\`yaml com TODOS os slides destes itens, corrigidos (o que faltou entra no slide, numa tabela ou em notes; problema de desenho: ajuste o layout, divida o slide ou reduza o texto).` }];
        // a correção pode vir só com os itens corrigidos: os que não vieram ficam como estavam. Resposta que não serve
        // (YAML quebrado, campo que não existe, imagem errada) volta com o erro, como na escrita
        let fixed = null, fixErr = null, kept = false;
        for (let attempt = 1; attempt <= 2 && !fixed && !kept; attempt++) {
          try {
            const r = await ask(fixMsg);
            // resposta sem bloco nenhum ("não há o que corrigir": a conferência às vezes aponta o que não é erro):
            // fica como está, os pontos seguem para a revisão da pessoa
            if (!/```/.test(r.text)) { kept = true; break; }
            try { fixed = wholeFigures(parseProduced(r.text, batch, deckBase, dir, { partial: true })); }
            catch (e) { fixErr = e; keepFailure(`correcao-${batch.map(({ k }) => k + 1).join("-")}`, r.text, e); fixMsg.push({ role: "assistant", content: r.text }, { role: "user", content: `Não deu para usar:\n${e.message}\nCorrija e responda de novo com o bloco \`\`\`yaml.` }); }
          } catch (e) { if (e instanceof TransformStop) throw e; fixErr = e; break; }
        }
        if (kept) break;
        if (!fixed) { report.problemas.push(`correção dos itens ${batch.map(({ k }) => k + 1).join(", ")} falhou: ${clip(fixErr?.message, 160)}`); break; }
        const got = new Set(fixed.map((x) => x.origem));
        produced = batch.flatMap(({ k }) => (got.has(k + 1) ? fixed.filter((x) => x.origem === k + 1) : produced.filter((x) => x.origem === k + 1)));
        await drawImages(produced);
      }
      for (const { it, k } of batch) {
        const mine = produced.filter((s) => s.origem === k + 1).map((s) => { const out = { ...s }; const why = out.mudou; delete out.origem; delete out.mudou; out._why = why; return out; });
        const factIssue = issues.find((x) => x.k === k && x.kind === "fatos");
        const drawIssues = issues.filter((x) => x.k === k && x.kind === "desenho").map((x) => x.text);
        job.results[k] = { slides: mine, state: factIssue ? "pendente" : drawIssues.length ? "revisar" : "ok", missing: factIssue?.text || null, drawing: drawIssues };
      }
      save();
    } catch (e) {
      if (e instanceof TransformStop) { stop = stop || e; return; }
      // o bloco não saiu (o modelo falhou mesmo depois de tentar de novo): fica registrado e a tarefa segue;
      // esses itens entram como o original e pedir de novo tenta só eles
      report.problemas.push(`itens ${batch.map(({ k }) => k + 1).join(", ")}: ${clip(e.message, 160)}`);
      save();
    }
  };
  let nextBatch = 0;
  const worker = async () => { while (!stop && nextBatch < batches.length) await runBatch(batches[nextBatch++]); };
  await Promise.all(Array.from({ length: Math.min(parallel, batches.length) }, worker));

  // pendente por fato que faltou: confere de novo com TODOS os itens prontos. Um item irmão (do mesmo slide original)
  // escrito depois, ou noutro bloco ao mesmo tempo, pode ter levado o fato: aí não é pendência.
  for (const [key, res] of Object.entries(job.results)) {
    const k = Number(key), it = plan.slides[k];
    if (res?.state !== "pendente" || !res.slides || !it) continue;
    const all = [...res.slides, ...siblingsOf(k).flatMap((j) => job.results[j]?.slides || [])];
    const miss = missingFacts(factsFor(it), all);
    if (!miss.numbers.length && !miss.terms.length) { res.state = res.drawing?.length ? "revisar" : "ok"; res.missing = null; }
  }
  save();

  // ---- 5. MONTAR — o que faltou conserva o original; a proposta fica pendente para o professor decidir
  const slides = [];
  const coverage = [];
  // o original que volta para o deck (pendente, não saiu): no recriar, sem a moldura antiga (faixa, logos: o deco e o
  // que se repete na mesma posição, como no estilo), que destoaria do tema novo; o conteúdo fica inteiro
  const frameOf = mode === "recriar" ? repeatedFrame(originals.length > 1 ? originals.slice(1) : originals).isFrame : null;
  const asOriginal = (s) => { const c = structuredClone(s); if (frameOf) c.elements = (c.elements || []).filter((e) => !frameOf(e)); return c; };
  plan.slides.forEach((it, k) => {
    const res = job.results[k];
    const src = srcOf(it);
    const reviewFor = (why, state) => (mode === "melhorar" || state !== "ok")
      ? (it.acao === "novo" || !src.length ? { status: state === "ok" ? "novo" : state, note: clip(why || it.ideia, 220) } : { status: state === "ok" ? "alterado" : state, note: clip(why || it.ideia, 220), original: Number(it.de[0]) })
      : null;
    if (!res?.slides) {
      // não saiu (falhou, parou no limite, cancelado): o original como era
      const back = src.map((s) => (it.acao === "manter" ? structuredClone(s) : asOriginal(s)));
      if (back.length && it.acao !== "manter") report.pendentes.push(`item ${k + 1} (${it.ideia}): ${res?.state === "falhou" ? "não saiu" : "não chegou a ser escrito"}; ficou o original (slide ${src.map((s) => s.original.slide).join(", ")})`);
      slides.push(...back);
      return;
    }
    if (res.state === "pendente" && src.length && mode === "recriar") {
      // recriar: o original não volta para o deck novo (destoava e duplicava: a capa velha antes da nova); a proposta
      // fica, marcada para conferir o que faltou (o original continua em original/)
      slides.push(...res.slides.map(({ _why, ...s }) => ({ ...s, review: { status: "revisar", note: clip(`Faltou do original (slide ${src.map((x) => x.original.slide).join(", ")}): ${res.missing}. Confira e complete se fizer falta.`, 300), original: Number(it.de[0]) } })));
      report.revisar.push(`item ${k + 1}: ${res.missing}`);
      return;
    }
    if (res.state === "pendente" && src.length) {
      // omissão: o original fica, e a proposta vem logo depois, marcada para decidir
      const back = src.map((s) => ({ ...asOriginal(s), uid: newUid() }));
      slides.push(...back);
      slides.push(...res.slides.map(({ _why, ...s }) => ({ ...s, review: { status: "pendente", note: clip(`Proposta para o slide ${src.map((x) => x.original.slide).join(", ")}: ${res.missing}. O original ficou antes desta; aceitar tira o original, desfazer tira a proposta.`, 300), original: Number(it.de[0]), pair: back.map((b) => b.uid) } })));
      report.pendentes.push(res.missing);
      return;
    }
    const state = res.state === "revisar" ? "revisar" : "ok";
    if (state === "revisar") report.revisar.push(`item ${k + 1}: ${res.drawing.join(" · ")}`);
    slides.push(...res.slides.map(({ _why, ...s }) => {
      const rv = s.review || (it.acao === "manter" && state === "ok" ? null : reviewFor(state === "revisar" ? `${_why || it.ideia}. Conferir: ${res.drawing.join("; ")}` : _why, state));
      return rv ? { ...s, review: rv } : s;
    }));
  });
  const out = { ...deckBase, ...(mode === "melhorar" ? { import: spec.import, style: { name: style.name } } : { recreatedFrom: spec.import?.from || spec.title }), slides };
  ensureUids(out);
  // mapa de cobertura: cada trecho do original e para onde foi
  const itemOfSlide = new Map();
  let cursor = 0;
  // (recalcula a posição de cada item no deck montado)
  plan.slides.forEach((it, k) => { const res = job.results[k]; const n = !res?.slides ? srcOf(it).length : res.state === "pendente" && srcOf(it).length && mode === "melhorar" ? srcOf(it).length + res.slides.length : res.slides.length; for (let j = 0; j < n; j++) itemOfSlide.set(cursor + j, k); cursor += n; });
  for (const s of originals) {
    for (const unit of unitsOf(s)) {
      const where = [];
      out.slides.forEach((ns, i) => { if (unitIn(unit, ns)) where.push(i + 1); });
      const viaItem = [...itemOfSlide].filter(([, k]) => (plan.slides[k].de || []).map(Number).includes(s.original.slide)).map(([i]) => i + 1);
      coverage.push({ original: s.original.slide, tipo: unit.kind, trecho: clip(unit.label, 120), onde: where, ...(where.length ? {} : { reescrito_em: viaItem }) });
    }
  }
  fs.mkdirSync(path.join(dir, "original"), { recursive: true });
  fs.writeFileSync(path.join(dir, "original", `cobertura-${mode}.json`), JSON.stringify(coverage, null, 1));
  fs.writeFileSync(path.join(dir, "original", `cobertura-${mode}.md`), coverageMarkdown(coverage, out));
  const literal = coverage.filter((c) => c.onde.length).length;
  job.spentMs = spentBefore + Date.now() - t0;
  const missingItems = plan.slides.filter((it, k) => !job.results[k]?.slides && (it.acao !== "manter" || !srcOf(it).length)).length;
  const status = stop || missingItems ? "parcial" : report.pendentes.length || report.revisar.length ? "revisar" : "concluido";
  job.status = status; job.stage = "montado"; save();
  return {
    spec: out, plan,
    report: { ...report, status, parou: stop ? stop.message : missingItems ? `${missingItems} item(ns) não saíram` : null, retomada: resumed, mode, textModel: T, visionModel: V, calls: job.calls, usage: job.usage, seconds: Math.round(job.spentMs / 1000), alertas: plan.alertas || [], cobertura: { trechos: coverage.length, localizados: literal, reescritos: coverage.length - literal, arquivo: `original/cobertura-${mode}.md` } },
  };
}

// trechos de um slide original: cada caixa de texto (parágrafos), tabela, fórmula, imagem de conteúdo, anotações
function unitsOf(s) {
  const out = [];
  for (const e of s.elements || []) {
    if (e.deco) continue;
    if (e.textbox) {
      const t = plainOf(e).trim();
      if (!t || /^\d{1,3}$/.test(t)) continue;
      const latex = e.textbox.paragraphs.flatMap((p) => p.runs || []).filter((r) => r.latex).map((r) => r.latex);
      out.push({ kind: latex.length ? "fórmula" : "texto", label: t.replace(/\s+/g, " "), facts: factsOf({ elements: [e] }) });
    } else if (e.tableData) out.push({ kind: "tabela", label: e.tableData.map((r) => r.join(" | ")).slice(0, 2).join(" / "), facts: factsOf({ elements: [e] }) });
    else if (e.image && !e.fromOriginal) out.push({ kind: "imagem", label: e.image, image: e.image });
    else if (e.image && e.fromOriginal) out.push({ kind: "figura", label: e.image, image: e.image });
  }
  if (s.notes) out.push({ kind: "notas", label: s.notes.replace(/\s+/g, " "), facts: factsOf({ elements: [] }, s.notes) });
  return out;
}
function unitIn(unit, slide) {
  if (unit.image) return JSON.stringify(slide).includes(unit.image);
  const f = unit.facts;
  if (!f || (!f.numbers.size && !f.terms.size)) {
    // sem número nem nome: procura as primeiras palavras (as curtas não contam, dos dois lados)
    const words = (t) => deaccent(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 3);
    const probe = words(unit.label).slice(0, 6).join(" ");
    return probe.length > 12 && ` ${words(textOfProduced([slide])).join(" ")} `.includes(` ${probe} `);
  }
  const miss = missingFacts(f, [slide]);
  return !miss.numbers.length && !miss.terms.length;
}
function coverageMarkdown(coverage, deck) {
  const title = (i) => { const s = deck.slides[i - 1]; return s ? (s.title || s.text || s.question || s.layout) : ""; };
  const lines = ["# Onde ficou cada trecho do original", "", "Gerado pela transformação. \"Reescrito em\" = o trecho não aparece igual (foi reescrito), então vale conferir.", ""];
  let last = null;
  for (const c of coverage) {
    if (c.original !== last) { lines.push(`## Slide ${c.original} do original`); last = c.original; }
    const where = c.onde.length ? c.onde.map((i) => `slide ${i} (${clip(title(i), 50)})`).join(", ") : c.reescrito_em?.length ? `reescrito em ${c.reescrito_em.map((i) => `slide ${i}`).join(", ")}` : "NÃO ENCONTRADO";
    lines.push(`- ${c.tipo}: "${c.trecho}" → ${where}`);
  }
  return lines.join("\n") + "\n";
}

// caminho de imagem que não existe, mas há UM arquivo de imagem parecido na pasta (mesmo nome em outra pasta, ou até
// 2 letras de diferença: "imagens/orignal/x.png"): é ele
const imageListCache = new Map();
export function nearImage(rel, dir) {
  let files = imageListCache.get(dir);
  if (!files) {
    files = [];
    const walk = (d, pre) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch {} for (const e of ents) { if (e.name.startsWith(".")) continue; if (e.isDirectory()) walk(path.join(d, e.name), `${pre}${e.name}/`); else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(e.name)) files.push(`${pre}${e.name}`); } };
    walk(dir, ""); imageListCache.set(dir, files);
  }
  const want = String(rel).replace(/\\/g, "/").replace(/^\.\//, "");
  const lev = (a, b) => { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } } return d[b.length]; };
  const near = files.filter((f) => lev(f, want) <= 2);
  if (near.length === 1) return near[0];
  const same = files.filter((f) => f.split("/").pop() === want.split("/").pop());
  return same.length === 1 ? same[0] : null;
}

// resposta do escritor → slides válidos (renderizam, só imagens que existem, origem de um item do bloco)
function parseProduced(text, batch, deckBase, dir, { partial = false } = {}) {
  const { yaml } = extractYaml(text);
  let raw = parseYaml(yaml);
  if (Array.isArray(raw)) raw = { slides: raw };
  if (!raw || !Array.isArray(raw.slides) || !raw.slides.length) throw new Error('Esperava `slides:` com a lista de slides.');
  const allowed = new Set(batch.map(({ k }) => k + 1));
  let prev = null;
  const slides = raw.slides.map((s, i) => {
    if (!s || typeof s !== "object") throw new Error(`slide ${i + 1}: não é um objeto`);
    let origem = Number(s.origem ?? (batch.length === 1 ? batch[0].k + 1 : NaN));
    // sem origem (ou origem: extra, nova…): é do item do slide de antes; o primeiro, do primeiro item (a IA escreve
    // na ordem dos itens)
    if (!allowed.has(origem) && !/^\d+$/.test(String(s.origem ?? ""))) origem = prev ?? batch[0].k + 1;
    prev = origem;
    if (!allowed.has(origem)) throw new Error(`slide ${i + 1}: origem ${s.origem} não é um item deste bloco (${[...allowed].join(", ")})`);
    return { ...s, origem };
  });
  const missingItems = [...allowed].filter((n) => !slides.some((s) => s.origem === n));
  if (missingItems.length && !partial) throw new Error(`Faltou escrever ${missingItems.length === 1 ? "o item" : "os itens"} ${missingItems.join(", ")} (cada item precisa de pelo menos um slide com origem: N).`);
  const clean = normalizeSpec({ ...deckBase, slides: slides.map(({ origem, mudou, ...rest }) => rest) });
  // imagens que não existem na pasta do deck: erro (volta para a IA)
  const bad = [];
  const walk = (o) => { if (!o || typeof o !== "object") return; for (const [k, v] of Object.entries(o)) {
    if ((k === "image" || k === "image_ref") && typeof v === "string" && !/^(https?:|data:)/.test(v) && !fs.existsSync(path.join(dir, v))) { const fix = nearImage(v, dir); if (fix) o[k] = fix; else bad.push(v); }
    else if (v && typeof v === "object") walk(v);
  } };
  clean.slides.forEach((s) => walk(s));
  if (bad.length) throw new Error(`Imagens que não existem: ${[...new Set(bad)].join(", ")}. Use só os caminhos dados.`);
  validateSlides({ ...clean, _dir: dir });
  sanitizeCheck(clean, clean.slides.map((_, i) => i));
  return clean.slides.map((s, i) => ({ ...s, origem: slides[i].origem, ...(slides[i].mudou ? { mudou: String(slides[i].mudou) } : {}) }));
}

// o slide novo desenhado ao lado da foto do original: o modelo de visão aponta o que está errado
export async function visualCheck({ produced, batch, deckBase, dir, orig, ask, model, mode = "melhorar", fiscalToo = true, offset = 0, keepFailure }) {
  const { slideSnapshots } = await import("../studio/snapshot.js");
  const { imagesAsDataUrls } = await import("../import/crop.js");
  const deck = { ...deckBase, _dir: dir, slides: produced.map(({ origem, mudou, ...s }) => s) };
  // primeiro o fiscal do sagadeck (medido no navegador, exato): o que ele acha vai para a correção com o texto do objeto
  const fiscal = [];
  if (fiscalToo) try {
    const { layoutCheck } = await import("../studio/snapshot.js");
    for (const r of await layoutCheck(deck)) {
      const found = [...new Set(r.issues.filter((x) => x.kind !== "fonte-pequena" || x.px < 16).map((x) => `${FISCAL[x.kind] || x.kind}${x.px && x.kind === "fonte-pequena" ? ` (${x.px} px)` : ""}: "${clip(x.text, 50)}"`))].slice(0, 4);
      if (found.length) fiscal.push({ k: (produced[r.slide - 1]?.origem || batch[0].k + 1) - 1, text: `slide novo ${r.slide} (item ${produced[r.slide - 1]?.origem}), medido: ${found.join("; ")}` });
    }
  } catch (e) { if (e instanceof TransformStop) throw e; }
  const shots = [];
  for (let i = 0; i < deck.slides.length; i++) shots.push((await slideSnapshots(deck, i, { mode: "final", width: 960 }))[0]?.dataUrl);
  const origOf = (origem) => (batch.find(({ k }) => k + 1 === origem)?.it.de || []).map((n) => orig.get(Number(n))?.original?.image).filter(Boolean);
  const origFiles = [...new Set(produced.flatMap((x) => origOf(x.origem)))];
  const origUrls = new Map((await imagesAsDataUrls(origFiles.map((f) => path.join(dir, f)), { width: 960 })).map((u, j) => [origFiles[j], u]));
  const prompt = `Confira slides NOVOS de uma aula contra as fotos dos slides ORIGINAIS; aqui vai UM slide novo, com o(s) original(is) de onde ele veio. Olhe como um professor que vai apresentar este slide amanhã e aponte só problemas reais:
- crítica de desenho: destaque ou caixa do foco guiado fora do lugar na figura; figura que não é a do assunto do slide (a legenda fala de uma coisa e a imagem mostra outra); equação ou tabela como imagem (devia ser LaTeX ou table); gráfico de enfeite sem dado do material; ordem física invertida (o que fica em cima no mundo desenhado embaixo); texto gigante ocupando o slide; título repetido;
- desenho: texto cortado, sobreposto, fora do slide, ilegível de tão pequeno, área vazia enorme, figura esticada, print de tela com a janela do programa;
- conteúdo: informação que está no original e sumiu no novo (número, rótulo, parte de uma figura específica), figura errada.
- texto: erro de digitação ou de ortografia (letra faltando ou trocada: "Méodo", "Refrências").
O rodapé com o nome da aula abreviado com "…" é do tema; não aponte. ${mode === "recriar" ? "O estilo é NOVO de propósito: a moldura do original (logos, faixas, cores, fontes, número da página) NÃO precisa estar no novo; não aponte isso. " : ""}Responda só JSON: {"problemas":["…"]} (lista vazia se o slide estiver bom)`;
  // um slide por chamada: com o lote inteiro numa chamada só (todas as fotos juntas), o modelo pensava até estourar o
  // limite e não escrevia nada (16 mil tokens de raciocínio, resposta vazia) ou aprovava tudo sem olhar
  const one = async (i) => {
    const x = produced[i];
    const content = [{ type: "text", text: prompt }];
    origOf(x.origem).forEach((f, j) => { const u = origUrls.get(f); if (u) content.push({ type: "text", text: `ORIGINAL ${f.match(/(\d+)\.png$/)?.[1] || j + 1}:` }, { type: "image_url", image_url: { url: u } }); });
    content.push({ type: "text", text: `NOVO ${i + 1 + offset} (do item ${x.origem}):` }, { type: "image_url", image_url: { url: shots[i] } });
    const parse = (text) => { const r = jsonLoose(text); return Array.isArray(r.slides) ? r.slides[0] || { ok: true } : r; };
    let r;
    try { r = await ask([{ role: "user", content }], { model, maxTokens: 8000, temperature: 0.6, think: false }); return parse(r.text); }
    catch (e) {
      if (e instanceof TransformStop) throw e;
      keepFailure?.(`conferencia-${x.origem}`, r?.text || "", e);
      // resposta sem JSON (o modelo às vezes só "pensa" e não escreve): mais uma vez, pedindo só o JSON
      try { r = await ask([{ role: "user", content: [...content, { type: "text", text: "Responda agora SÓ o bloco JSON, sem explicação." }] }], { model, maxTokens: 8000, temperature: 0.6, think: false }); return parse(r.text); }
      catch (e2) { if (e2 instanceof TransformStop) throw e2; return null; }
    }
  };
  const res = new Array(produced.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, produced.length) }, async () => { while (next < produced.length) { const i = next++; if (shots[i]) res[i] = await one(i); else res[i] = { ok: true }; } }));
  const missed = res.map((r, i) => (r ? null : i + 1 + offset)).filter(Boolean);
  if (missed.length === produced.length) throw new Error("resposta sem JSON");
  const found = res.map((r, i) => ({ r, i })).filter(({ r }) => r && Array.isArray(r.problemas) && r.problemas.filter(Boolean).length)
    .map(({ r, i }) => ({ k: (produced[i]?.origem || batch[0].k + 1) - 1, text: `slide novo ${i + 1 + offset} (item ${produced[i]?.origem}): ${r.problemas.join("; ")}` }));
  return Object.assign([...fiscal, ...found], { missed });
}
// o que cada achado do fiscal quer dizer, para a IA corrigir
const FISCAL = {
  "estouro-horizontal": "texto mais largo que a caixa", "estouro-vertical": "texto cortado embaixo", "fora-do-slide": "sai do slide",
  "passa-da-margem-inferior": "passa da margem de baixo", sobreposicao: "texto por cima de outro", "baixo-contraste": "pouco contraste com o fundo", "fonte-pequena": "letra miúda",
};
