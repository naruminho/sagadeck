// sagadeck · IA de verdade: editar deck pelo chat, texto -> slide (Napkin), gerar deck do zero e imagens.
// Toda saída do LLM passa por: extrair YAML -> normalizar -> renderizar cada slide (validação) ->
// se falhar, devolve o erro ao LLM e tenta de novo -> auto-cura geométrica.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { renderSlide, wordCount } from "../build.js";
import { THEMES } from "../themes.js";
import { LAYOUTS } from "../layouts.js";
import { normalizeSpec } from "../fiscal/normalize.js";
import { autofixDeck, autofixSlide } from "../fiscal/autofix.js";
import { chat, generateImage, LLMError } from "./llm.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_ATTEMPTS = 3;

let referenceCache = null;
export function reference() {
  if (referenceCache) return referenceCache;
  // repositório: src/ai -> ../../docs · motor empacotado (tudo num .mjs): ./docs
  const file = [path.join(HERE, "..", "..", "docs", "REFERENCIA.md"), path.join(HERE, "docs", "REFERENCIA.md")]
    .find((f) => fs.existsSync(f));
  referenceCache = file ? fs.readFileSync(file, "utf8") : "";
  return referenceCache;
}

function systemPrompt({ images = false, maxImages = 3 } = {}) {
  const themes = Object.entries(THEMES).map(([k, t]) => `${k}${t.label ? ` (${t.label})` : ""}`).join(", ");
  return `Você é o motor de IA do sagadeck, que gera apresentações a partir de YAML.
Siga ESTRITAMENTE a referência abaixo: use só layouts, elementos, campos e figuras que existem nela.

Regras de qualidade:
- Uma ideia por slide. Pouco texto na tela (o fiscal "anti-sono" reclama de textão); o detalhe vai em \`notes\`.
- Prefira figuras geradas (icon, picto, diagram, chart) a listas de bullets. Ícones são do Lucide, nomes em inglês kebab-case (ex.: rocket, shield-check, trending-up).
- Varie os layouts ao longo do deck; capa (cover) no início e encerramento (end) no fim quando fizer sentido.
- Escreva no idioma do pedido do usuário.
- Layouts válidos (\`layout:\`): ${Object.keys(LAYOUTS).join(", ")}. Diagramas e gráficos são ELEMENTOS (dentro de figure/content/side), não layouts.
- Temas disponíveis: ${themes}.
- YAML: coloque entre aspas duplas todo texto que comece com marcação (\`**\`, \`*\`, \`==\`, \`^^\`, \`~~\`, \`[\`) ou que contenha ": ".
${images
    ? `- Você PODE pedir ilustrações geradas por IA com \`image_prompt: "descrição visual detalhada, em inglês"\` no lugar de \`image\` — por exemplo \`figure: { image_prompt: "...", fit: cover }\` num split/cover, ou um slide \`layout: image\` com \`image_prompt\`. No máximo ${maxImages} imagens novas por resposta; use só quando uma foto/ilustração realmente ajudar.`
    : "- NÃO use `image_prompt` nem imagens externas; use as figuras geradas do sagadeck."}
- Nunca invente campos começando com "_" e não use caminhos de imagem que não existam no deck.

=== REFERÊNCIA DO YAML ===
${reference()}`;
}

// ---------------------------------------------------------------------------------------------
// Parsing e validação da resposta
// ---------------------------------------------------------------------------------------------

export function extractYaml(text) {
  const blocks = [...String(text).matchAll(/```(?:ya?ml)?[ \t]*\r?\n([\s\S]*?)```/gi)].map((m) => m[1]);
  if (blocks.length) return { yaml: blocks[blocks.length - 1], prose: cleanProse(String(text).replace(/```[\s\S]*?```/g, "")) };
  const open = /```(?:ya?ml)?[ \t]*\r?\n/i.exec(String(text)); // bloco sem o ``` de fechamento
  if (open) return { yaml: String(text).slice(open.index + open[0].length), prose: cleanProse(String(text).slice(0, open.index)) };
  return { yaml: String(text), prose: "" };
}

// Tira a numeração "1." / "2." que o formato de resposta pedido induz.
function cleanProse(s) {
  return s.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s+/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Slides acima do limite "anti-sono" do fiscal (mesma conta do build).
function wordySlides(spec) {
  return spec.slides
    .map((s, i) => ({ n: i + 1, words: wordCount({ ...s, notes: undefined }), limit: s.maxWords || spec.maxWords || 40 }))
    .filter((x) => x.words > x.limit);
}

function privateKeys(spec) {
  const out = {};
  for (const k of Object.keys(spec || {})) if (k.startsWith("_")) out[k] = spec[k];
  return out;
}

function publicSpec(spec) {
  const copy = JSON.parse(JSON.stringify(spec));
  for (const k of Object.keys(copy)) if (k.startsWith("_")) delete copy[k];
  return copy;
}

// Converte o texto do LLM num deck válido ou lança um erro descritivo (que volta para o LLM).
// Erro clássico de LLM: `text: **negrito** resto` (o * vira alias de YAML). Põe aspas nesses valores,
// sem mexer no conteúdo de blocos `|` / `>` (ex.: notes).
export function repairYaml(src) {
  let blockIndent = -1;
  return src.split(/\r?\n/).map((line) => {
    const indent = line.match(/^\s*/)[0].length;
    if (blockIndent >= 0) {
      if (!line.trim() || indent > blockIndent) return line;
      blockIndent = -1;
    }
    if (/:\s*[|>][+-]?\d*\s*$/.test(line)) {
      blockIndent = indent;
      return line;
    }
    const m = /^(\s*(?:- )?(?:[\w-]+:[ \t]+)?)((?:\*|==|\^\^|~~|`)\S.*)$/.exec(line);
    if (!m || !/(- |:[ \t]+)$/.test(m[1])) return line;
    const value = m[2].trim();
    if (/^\*[\w-]+$/.test(value)) return line; // alias legítimo (*nome)
    return m[1] + JSON.stringify(value);
  }).join("\n");
}

function parseYaml(src) {
  try {
    return YAML.parse(src);
  } catch (first) {
    try { return YAML.parse(repairYaml(src)); } catch { throw new Error(`YAML inválido: ${first.message}`); }
  }
}

// Converte o texto do LLM num deck válido ou lança um erro descritivo (que volta para o LLM).
function parseDeckText(text, base = {}) {
  const { yaml, prose } = extractYaml(text);
  let raw = parseYaml(yaml);
  if (Array.isArray(raw)) raw = { slides: raw };
  const spec = normalizeSpec(raw);
  if (!spec || !Array.isArray(spec.slides) || !spec.slides.length) throw new Error('O YAML precisa ter uma lista "slides:" com pelo menos um slide.');
  if (spec.theme && !THEMES[spec.theme]) throw new Error(`Tema "${spec.theme}" não existe. Use um de: ${Object.keys(THEMES).join(", ")}.`);
  Object.assign(spec, privateKeys(base));
  validateSlides(spec);
  return { spec, prose };
}

function parseSlideText(text, deck) {
  const { yaml, prose } = extractYaml(text);
  let raw = parseYaml(yaml);
  if (raw && Array.isArray(raw.slides)) raw = raw.slides[0];
  if (Array.isArray(raw)) raw = raw[0];
  if (!raw || typeof raw !== "object") throw new Error("Esperava UM slide (um objeto YAML com `layout:` e seus campos).");
  const slide = normalizeSpec({ slides: [raw] }).slides[0];
  validateSlides({ ...deck, slides: [slide] });
  return { slide, prose };
}

function validateSlides(spec) {
  const errors = [];
  spec.slides.forEach((s, i) => {
    try {
      renderSlide(withoutImagePrompts(s), i, spec);
    } catch (e) {
      errors.push(`slide ${i + 1} (${s.layout || "auto"}): ${e.message}`);
    }
  });
  if (errors.length) throw new Error(`Estes slides não renderizam:\n${errors.join("\n")}`);
}

// Para validar antes de gerar as imagens: image_prompt ainda não tem arquivo.
function withoutImagePrompts(node) {
  if (Array.isArray(node)) return node.map(withoutImagePrompts);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) if (k !== "image_prompt") out[k] = withoutImagePrompts(v);
  if ("image_prompt" in node && !out.image && Object.keys(out).every((k) => ["fit", "alt", "radius", "step", "anim", "w", "h"].includes(k))) {
    out.icon = "image";
  }
  return out;
}

// Conversa com o LLM até ele devolver algo que passa na validação.
// opts.onProgress({ phase, text, chars }) recebe as etapas e o texto chegando (para a interface mostrar vida).
async function askUntilValid(messages, parse, opts = {}) {
  let lastError;
  let firstProse = "";
  const progress = opts.onProgress || (() => {});
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    progress({ phase: "llm", text: attempt === 1 ? "Pensando…"
      : lastError?.soft ? "Revisando a consistência com os outros slides…"
      : `A resposta veio com erro; pedindo correção (tentativa ${attempt}/${MAX_ATTEMPTS})…` });
    let lastTick = 0;
    const res = await chat(messages, {
      temperature: opts.temperature ?? 0.4,
      onDelta: opts.onProgress ? (_piece, all) => {
        if (Date.now() - lastTick < 250) return;
        lastTick = Date.now();
        progress({ phase: "writing", text: "Escrevendo a resposta…", chars: all.length, preview: extractYaml(all).prose.slice(0, 280) });
      } : undefined,
    });
    progress({ phase: "validating", text: "Validando os slides…", chars: res.text.length });
    if (attempt === 1) firstProse = extractYaml(res.text).prose;
    try {
      const parsed = parse(res.text);
      // Correção só de formato: a explicação que vale é a da 1ª resposta (não o "desculpe, corrigi").
      // Revisão de conteúdo (soft): o que foi aplicado é a última resposta, então vale a explicação dela.
      if (attempt > 1 && firstProse && !lastError?.soft) parsed.prose = firstProse;
      return { ...parsed, attempts: attempt };
    } catch (e) {
      lastError = e;
      if (process.env.SAGADECK_AI_DEBUG) console.error(`[ia] tentativa ${attempt} inválida: ${e.message}`);
      if (e.soft) {
        // Objeção de conteúdo: refaz o pedido original com o fato anexado, sem a resposta rejeitada —
        // se ela ficasse na conversa, o LLM pediria desculpas ao usuário por algo que ele nunca viu.
        const last = messages[messages.length - 1];
        messages = [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n${e.message}` }];
      } else {
        messages = [...messages,
          { role: "assistant", content: res.text },
          { role: "user", content: `Sua resposta não pôde ser usada:\n${e.message}\n\nCorrija e responda de novo no mesmo formato (bloco \`\`\`yaml).` }];
      }
    }
  }
  throw new LLMError(`O LLM não conseguiu produzir um YAML válido em ${MAX_ATTEMPTS} tentativas. Último erro: ${lastError.message}`);
}

// ---------------------------------------------------------------------------------------------
// Imagens: { image_prompt } -> gera -> salva em <assetsDir> -> { image: caminho relativo }
// ---------------------------------------------------------------------------------------------

function collectImagePrompts(node, found = []) {
  if (Array.isArray(node)) node.forEach((n) => collectImagePrompts(n, found));
  else if (node && typeof node === "object") {
    if (typeof node.image_prompt === "string" && node.image_prompt.trim()) found.push(node);
    for (const v of Object.values(node)) collectImagePrompts(v, found);
  }
  return found;
}

export function countImagePrompts(spec) {
  return collectImagePrompts(spec.slides || []).length;
}

export async function materializeImages(spec, { assetsDir, baseDir, max = Infinity, onProgress, keepFailed = false } = {}) {
  const nodes = collectImagePrompts(spec.slides || []);
  const done = [];
  const failed = [];
  baseDir = baseDir || spec._dir || process.cwd();
  assetsDir = assetsDir || path.join(baseDir, "imagens");
  for (const node of nodes.slice(0, max)) {
    const prompt = node.image_prompt.trim();
    onProgress?.(`gerando imagem: ${prompt.slice(0, 70)}`);
    try {
      const img = await generateImage(prompt);
      const ext = (img.mime.split("/")[1] || "png").replace("jpeg", "jpg").replace(/\W.*/, "");
      const hash = crypto.createHash("sha1").update(prompt).digest("hex").slice(0, 8);
      fs.mkdirSync(assetsDir, { recursive: true });
      const file = path.join(assetsDir, `ia-${hash}.${ext}`);
      fs.writeFileSync(file, img.data);
      node.image = path.relative(baseDir, file).split(path.sep).join("/");
      if (!node.fit) node.fit = "cover";
      if (!node.alt) node.alt = prompt.slice(0, 120);
      delete node.image_prompt;
      done.push({ prompt, file });
    } catch (e) {
      failed.push({ prompt, error: e.message });
    }
  }
  // O que sobrou sem imagem vira um ícone, para o slide continuar renderizando
  // (ou fica como pedido, com keepFailed, para tentar de novo depois).
  if (keepFailed) return { done, failed };
  for (const node of collectImagePrompts(spec.slides || [])) {
    if (!node.image) Object.assign(node, withoutImagePrompts(node));
    delete node.image_prompt;
  }
  return { done, failed };
}

// ---------------------------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------------------------

// Regras do chat de edição: o que o LLM errou na prática (trocar figura por símbolo genérico,
// mudar um motivo recorrente num slide só, "chutar" em vez de perguntar).
const EDIT_RULES = `Regras de edição:
- Preserve o SIGNIFICADO do que você altera. Se o usuário não gostou de uma figura, a nova precisa representar a mesma coisa: uma pessoa continua sendo uma pessoa/cena com pessoas (outra pose, outra cena, outro picto), um processo continua sendo um processo. NUNCA troque uma figura específica por um símbolo genérico (escudo, check, estrela, raio) sem o usuário pedir.
- CONSISTÊNCIA: se o que você muda é um motivo que se repete no deck (o mesmo personagem/picto, o mesmo tipo de figura, o mesmo estilo de elemento), mude TODAS as ocorrências do mesmo jeito e diga na resposta quais slides mudou. Harmonia visual entre os slides vale mais que acertar um slide isolado.
- Você não vê os slides renderizados. Pictos (human, crowd, scene…) são desenhados pelo motor num estilo fixo: você só controla os parâmetros (pose, sign, name, count…). Se a reclamação é sobre o traço de um picto em si, diga isso com franqueza e ofereça alternativas (ex.: outro tipo de figura no deck todo, ou ilustrações geradas se as imagens estiverem ligadas) — de preferência perguntando antes de mudar vários slides.
- Se o pedido for ambíguo, ou a mudança certa afetar muitos slides de um jeito que o usuário talvez não espere, PERGUNTE: responda só com a pergunta, sem bloco yaml.`;

// Formato de patch: o LLM devolve só o que mudou (bem mais rápido que reescrever o deck inteiro).
const PATCH_FORMAT = `Formato da resposta:
1. Uma ou duas frases curtas dizendo o que você mudou e em quais slides (ou só a sua pergunta, se for perguntar).
2. Se mudou algo, UM bloco \`\`\`yaml só com as mudanças, neste formato (todas as chaves são opcionais):
\`\`\`yaml
deck:              # campos do deck que mudaram (title, theme, duration…)
  theme: prata
slides:            # só os slides alterados, pelo NÚMERO atual (1 = primeiro), cada um COMPLETO
  2:
    layout: split
    title: …
insert:            # slides novos; after = número do slide depois do qual entra (0 = no início)
  - after: 3
    slide: { layout: statement, text: … }
delete: [7]        # números (atuais) dos slides a remover
\`\`\``;

// Aplica um patch {deck, slides, insert, delete} ao deck; devolve { spec, changed: [índices no deck novo] }.
export function applyPatch(base, patch) {
  const spec = JSON.parse(JSON.stringify(base));
  const n = spec.slides.length;
  const num = (k, what) => {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 1 || i > n) throw new Error(`${what}: slide ${k} não existe (o deck tem ${n} slides).`);
    return i - 1;
  };
  if (patch.deck && typeof patch.deck === "object") {
    for (const [k, v] of Object.entries(patch.deck)) if (k !== "slides" && !k.startsWith("_")) spec[k] = v;
  }
  const replaced = new Map();
  for (const [k, s] of Object.entries(patch.slides || {})) {
    if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error(`slides.${k} precisa ser um slide completo (objeto com layout e campos).`);
    replaced.set(num(k, "slides"), normalizeSpec({ slides: [s] }).slides[0]);
  }
  const deleted = new Set([].concat(patch.delete || []).map((k) => num(k, "delete")));
  const inserts = new Map();
  for (const ins of [].concat(patch.insert || [])) {
    const after = Number(ins?.after ?? n);
    if (!Number.isInteger(after) || after < 0 || after > n) throw new Error(`insert.after inválido: ${ins?.after}`);
    if (!ins?.slide || typeof ins.slide !== "object") throw new Error("insert precisa de `slide:` com o slide completo.");
    if (!inserts.has(after)) inserts.set(after, []);
    inserts.get(after).push(normalizeSpec({ slides: [ins.slide] }).slides[0]);
  }
  const out = [];
  const changed = [];
  const pushNew = (s) => { changed.push(out.length); out.push(s); };
  (inserts.get(0) || []).forEach(pushNew);
  spec.slides.forEach((s, i) => {
    if (!deleted.has(i)) {
      if (replaced.has(i)) pushNew(replaced.get(i));
      else out.push(s);
    }
    (inserts.get(i + 1) || []).forEach(pushNew);
  });
  if (!out.length) throw new Error("O patch removeria todos os slides.");
  spec.slides = out;
  return { spec, changed, deletedCount: deleted.size };
}

// Pictos (desenhados pelo motor) que aparecem num slide, como "human", "scene:pair", "crowd".
function motifsOf(node, acc = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => motifsOf(n, acc));
  else if (node && typeof node === "object") {
    if (typeof node.picto === "string") acc.add(node.picto === "scene" && node.name ? `scene:${node.name}` : node.picto);
    for (const [k, v] of Object.entries(node)) if (k !== "notes") motifsOf(v, acc);
  }
  return acc;
}

// Trava de consistência: se um slide alterado perdeu um picto que continua em slides NÃO alterados,
// o deck fica com dois estilos para a mesma coisa. Devolve ao LLM (uma vez) para propagar ou perguntar.
function checkMotifs(parsed, base) {
  if (parsed.question || !parsed.changed?.length || parsed.motifsChecked) return parsed;
  const changedNew = new Set(parsed.changed);
  const survivors = new Set(); // pictos nos slides que ficaram iguais
  parsed.spec.slides.forEach((s, i) => { if (!changedNew.has(i)) motifsOf(s, survivors); });
  const lost = [];
  base.slides.forEach((s, i) => {
    const now = parsed.spec.slides.find((x, j) => changedNew.has(j) && j === i);
    if (!now) return;
    const after = motifsOf(now);
    for (const m of motifsOf(s)) if (!after.has(m) && survivors.has(m)) lost.push({ slide: i + 1, motif: m });
  });
  if (!lost.length) return parsed;
  const where = (m) => parsed.spec.slides.map((s, i) => (!changedNew.has(i) && motifsOf(s).has(m) ? i + 1 : 0)).filter(Boolean);
  const detail = [...new Set(lost.map((l) => l.motif))]
    .map((m) => `- o picto "${m}" aparece nos slides ${[...new Set([...lost.filter((l) => l.motif === m).map((l) => l.slide), ...where(m)])].sort((a, b) => a - b).join(", ")}`).join("\n");
  const err = new Error(`FATO DO DECK (importante para este pedido):\n${detail}\nSe for mudar essa figura, mude em TODOS esses slides do mesmo jeito (preservando o significado de cada um) — ou pergunte ao usuário antes, sem bloco yaml.`);
  err.soft = true;
  throw err;
}

// Resposta do chat: pergunta (sem yaml), patch, ou — tolerado — o deck completo.
function parseEditText(text, base) {
  // Às vezes o patch vem sem a cerca ```: se há uma linha "slides:"/"deck:"/"insert:"/"delete", é YAML.
  const bare = /^(slides|deck|insert|delete)\s*:/m.exec(text);
  if (!/```/.test(text) && bare) text = `${text.slice(0, bare.index)}\n\`\`\`yaml\n${text.slice(bare.index)}\n\`\`\``;
  const hasYaml = /```/.test(text);
  if (!hasYaml) {
    const prose = cleanProse(String(text));
    if (!prose) throw new Error("Resposta vazia.");
    return { spec: base, prose, changed: [], question: true };
  }
  const { yaml, prose } = extractYaml(text);
  const raw = parseYaml(yaml);
  if (!raw || typeof raw !== "object") throw new Error("O bloco yaml precisa ser um objeto com deck/slides/insert/delete.");
  if (Array.isArray(raw.slides)) { // devolveu o deck inteiro: aceita, valida tudo
    const { spec } = parseDeckText(text, base);
    const changed = spec.slides.map((s, i) => (JSON.stringify(s) !== JSON.stringify(base.slides[i]) ? i : -1)).filter((i) => i >= 0);
    return { spec, prose, changed };
  }
  const { spec, changed } = applyPatch(base, raw);
  if (spec.theme && !THEMES[spec.theme]) throw new Error(`Tema "${spec.theme}" não existe. Use um de: ${Object.keys(THEMES).join(", ")}.`);
  validateSlides({ ...spec, slides: changed.map((i) => spec.slides[i]) });
  return { spec, prose, changed };
}

// Chat lateral do Studio: aplica um pedido em linguagem natural ao deck.
export async function editDeck({ spec, instruction, targetSlide = null, issues = [], images = false, imageOptions = {}, history = [], onProgress }) {
  const deck = publicSpec(spec);
  const { slides: _slides, ...numbered } = deck;
  const slidesYaml = deck.slides.map((s, i) => `# ── slide ${i + 1} ──\n${YAML.stringify([s], { indent: 2 })}`).join("");
  const focus = typeof targetSlide === "number"
    ? `O usuário está olhando o slide ${targetSlide + 1}; se o pedido não disser qual slide, é nele — mas respeite a regra de consistência.`
    : "O pedido vale para a apresentação inteira.";
  const problems = issues?.length
    ? `\nProblemas que o fiscal de layout detectou no slide ${typeof targetSlide === "number" ? targetSlide + 1 : "atual"} (corrija se tiver a ver com o pedido):\n${JSON.stringify(issues).slice(0, 4000)}`
    : "";
  const messages = [
    { role: "system", content: `${systemPrompt({ images })}\n\n${EDIT_RULES}\n\n${PATCH_FORMAT}` },
    // últimas trocas do chat, para o LLM entender respostas curtas ("sim", "pode fazer")
    ...history.slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.text || "").slice(0, 1500) })),
    { role: "user", content: `Deck atual (${deck.slides.length} slides):
\`\`\`yaml
${YAML.stringify(numbered, { indent: 2 })}slides:
${slidesYaml}\`\`\`
${focus}${problems}

Pedido: ${instruction}

Antes de responder, verifique (e siga as Regras de edição):
- Se vai trocar uma figura: a nova representa a MESMA coisa (pessoa → pessoa/cena com pessoas)? Ícone genérico não vale.
- O elemento que você vai mudar aparece em outros slides? Se sim, mude todos igual ou pergunte antes.
- Na dúvida, pergunte (resposta sem bloco yaml).` },
  ];
  let motifObjected = false;
  const { spec: edited, prose, attempts, changed = [], question } =
    await askUntilValid(messages, (t) => {
      const parsed = parseEditText(t, spec);
      if (motifObjected) return parsed; // já objetou uma vez: a 2ª resposta vale, mesmo insistindo
      try { return checkMotifs(parsed, spec); } catch (e) { if (e.soft) motifObjected = true; throw e; }
    }, { onProgress });
  const actions = [];
  if (question) return { reply: prose, spec, actions, targetSlide, question: true };
  if (attempts > 1) actions.push(`YAML corrigido após ${attempts - 1} tentativa(s) inválida(s)`);
  if (changed.length) actions.push(`Slides alterados: ${changed.map((i) => i + 1).join(", ")}`);
  // sem imagens habilitadas, max 0 só troca eventuais image_prompt por um ícone
  const nImgs = images ? countImagePrompts(edited) : 0;
  const imgs = await materializeImages(edited, images
    ? { ...imageOptions, onProgress: (m) => onProgress?.({ phase: "images", text: `${m[0].toUpperCase()}${m.slice(1)} (${nImgs} no total)…` }) }
    : { max: 0 });
  imgs.done.forEach((d) => actions.push(`Imagem gerada: ${path.basename(d.file)}`));
  imgs.failed.forEach((f) => actions.push(`Falhou ao gerar imagem ("${f.prompt.slice(0, 50)}"): ${f.error}`));
  // Auto-cura só onde o inspetor viu problema de verdade (as issues são do slide aberto na tela).
  // A cura preventiva reescreve títulos e desfaria o que o usuário acabou de pedir.
  if (issues?.length && typeof targetSlide === "number" && edited.slides[targetSlide]) {
    const fix = autofixSlide(edited.slides[targetSlide], edited, issues);
    edited.slides[targetSlide] = fix.slide;
    fix.actions.forEach((x) => actions.push(`Slide ${targetSlide + 1}: ${x}`));
  }
  return {
    reply: prose || "Pronto, apliquei o pedido.",
    spec: edited,
    actions,
    targetSlide: changed.includes(targetSlide) ? targetSlide : (changed[0] ?? pickTarget(spec, edited, targetSlide)),
  };
}

// Mantém o foco no slide atual, ou vai para o primeiro que mudou.
function pickTarget(before, after, current) {
  const n = after.slides.length;
  const changed = after.slides.findIndex((s, i) => JSON.stringify(s) !== JSON.stringify(before.slides?.[i]));
  if (typeof current === "number" && current < n && JSON.stringify(after.slides[current]) !== JSON.stringify(before.slides?.[current])) return current;
  if (changed >= 0) return changed;
  return typeof current === "number" ? Math.min(current, n - 1) : 0;
}

// Napkin com LLM: texto bruto -> um slide visual.
export async function textToSlide(text, { theme, tone, title, kicker, images = false, imageOptions = {} } = {}) {
  const hints = [theme && `tema do deck: ${theme}`, tone && `tom: ${tone}`, title && `título sugerido: ${title}`, kicker && `kicker: ${kicker}`]
    .filter(Boolean).join("; ");
  const messages = [
    { role: "system", content: systemPrompt({ images, maxImages: 1 }) },
    { role: "user", content: `Transforme o texto abaixo em UM slide visual do sagadeck (diagrama, cards, steps, stats/number, compare, timeline, chart…), escolhendo o layout que melhor comunica a estrutura do texto.${hints ? `\n(${hints})` : ""}

Texto:
"""
${text}
"""

Responda com:
1. Uma frase explicando por que escolheu esse layout.
2. O slide num bloco \`\`\`yaml (um único objeto de slide, sem "slides:").` },
  ];
  const deck = { theme: theme || "sinal", slides: [] };
  const { slide, prose } = await askUntilValid(messages, (t) => parseSlideText(t, deck));
  const wrapper = { ...deck, slides: [slide] };
  await materializeImages(wrapper, images ? imageOptions : { max: 0 });
  return { slide: wrapper.slides[0], detectedType: wrapper.slides[0].layout || "blocks", confidence: 1, rationale: prose || "Layout escolhido pelo LLM." };
}

// Gera um deck inteiro a partir de um briefing.
export async function generateDeck(briefing, { theme, slides, duration, images = false, imageOptions = {}, onProgress, onEvent } = {}) {
  // onProgress(texto): marcos (CLI) · onEvent({ phase, text, chars }): tudo, inclusive o texto chegando (Studio)
  const say = (text) => { onProgress?.(text); onEvent?.({ phase: "step", text }); };
  const wishes = [
    theme ? `Use o tema "${theme}".` : "Escolha o tema que combina com o assunto.",
    slides ? `Cerca de ${slides} slides.` : "Entre 8 e 14 slides.",
    duration ? `Duração planejada: ${duration} minutos (campo duration).` : "",
  ].filter(Boolean).join(" ");
  const messages = [
    { role: "system", content: systemPrompt({ images, maxImages: 4 }) },
    { role: "user", content: `Crie uma apresentação completa sobre o briefing abaixo. ${wishes}
Tenha um arco narrativo (gancho, desenvolvimento, fechamento), inclua notas do apresentador (notes) e o tempo em minutos (time) em cada slide, somando a duração total, e ao menos uma interação com a plateia quando fizer sentido.

Briefing:
"""
${briefing}
"""

Responda só com o deck completo num bloco \`\`\`yaml (com title, theme, duration e slides).` },
  ];
  say("pedindo o deck ao LLM…");
  let { spec, attempts } = await askUntilValid(messages, (t) => parseDeckText(t), { temperature: 0.7, onProgress: onEvent });
  if (attempts > 1) say(`YAML corrigido após ${attempts - 1} tentativa(s)`);

  // Uma rodada de enxugamento se o fiscal anti-sono reclamaria de algum slide.
  const wordy = wordySlides(spec);
  if (wordy.length) {
    say(`enxugando ${wordy.length} slide(s) com texto demais…`);
    try {
      ({ spec } = await askUntilValid([
        { role: "system", content: systemPrompt({ images, maxImages: 4 }) },
        { role: "user", content: `Deck:\n\`\`\`yaml\n${toYaml(spec)}\`\`\`
O fiscal anti-sono reclama destes slides (palavras na tela, sem contar notes):
${wordy.map((w) => `- slide ${w.n}: ${w.words} palavras (limite ${w.limit})`).join("\n")}

Enxugue esses slides para no máximo ~75% do limite (ex.: 30 palavras se o limite é 40): frases curtas, menos itens, detalhe movido para \`notes\` — ou divida um slide em dois. Não mexa nos outros slides.
Responda só com o deck completo num bloco \`\`\`yaml.` },
      ], (t) => parseDeckText(t), { onProgress: onEvent }));
    } catch (e) {
      say(`não consegui enxugar (${e.message}); mantive a versão anterior`);
    }
  }
  const imgs = await materializeImages(spec, images ? { ...imageOptions, onProgress: say } : { max: 0 });
  const fixed = autofixDeck(spec, []);
  return { spec: publicSpec(fixed.spec), images: imgs };
}

export function toYaml(spec) {
  return YAML.stringify(publicSpec(spec), { indent: 2 });
}
