// Transformar uma apresentação que já existe (importada de um PowerPoint): tarefa agêntica que o chat inicia quando a
// pessoa pede para melhorar ou recriar a apresentação inteira (o modelo decide; ver `transform:` no PATCH_FORMAT).
//   melhorar — mesmo estilo do original (a moldura dele vira o mestre), conteúdo mais claro e mais rico; cada slide
//              mudado leva a marca de revisão (review) e o original fica em original/original.yaml para Desfazer
//   recriar  — do zero, com tudo o que o sagadeck faz, sem perder nada do original
// Etapas: VER (o modelo de visão descreve as figuras de cada slide original) → PLANEJAR → ESCREVER em blocos →
// CONFERIR (os fatos do original por código; o desenho por visão, lado a lado com a foto do original) → MONTAR.
// O modelo de texto escreve; o de visão vê (llm.js: papel "vision"). Juntar slides progressivos é código, não IA.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { chat, llmConfig } from "./llm.js";
import { systemPrompt, extractYaml, parseYaml, validateSlides, sanitizeCheck } from "./deck-ai.js";
import { normalizeSpec } from "../fiscal/normalize.js";
import { plainOf } from "../import/pptx.js";
import { styleFromImport } from "../master.js";
import { mergeProgressive } from "../import/merge.js";

const clip = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const jsonOf = (text) => {
  const m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/) || [null, String(text).slice(String(text).indexOf("{"), String(text).lastIndexOf("}") + 1)];
  return JSON.parse(m[1]);
};

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
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9]{1,6})\b/g)) if (!STOP.has(deaccent(m[1]))) terms.add(m[1]); // siglas: SAE, IDF, TR
  for (const m of text.matchAll(/(?:[a-zà-ú,;]\s)([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-úç]{2,}(?:\s+(?:de|da|do|e)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-úç]{2,})*)/g)) terms.add(m[1]); // nomes próprios no meio da frase
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

// ------------------------------------------------------------------------------------------------ regras
const TOOLBOX = `Ferramentas para cada item do plano (campo "acao"):
- "manter": o slide original fica como está (só no modo melhorar; use quando ele já está bom ou é uma figura específica que não ganha nada sendo refeita).
- "juntar": slides que são o MESMO desenho crescendo (a pessoa copiou o slide e foi acrescentando partes para "animar") viram UM slide que se monta por cliques. É feito por código, exato, com o desenho original. Informe em "de" os números, na ordem.
- "escrever": você reescreve um ou mais slides originais ("de") com os layouts do sagadeck. Diga em "ideia" o layout e o recurso (ex.: "calc com L e Δh → tc de Kirpich"; "chart de colunas com a tabela de contagem"; "spotlight no mapa com o exutório, o divisor e a área azul").
- "novo": slide que não existia (exercício resolvido, calculadora, pergunta para a turma, gráfico feito a partir de uma tabela, algoritmo passo a passo de um método, resumo). "de" = os slides que dão a base (os dados vêm deles).
Recursos do sagadeck que costumam fazer diferença numa aula: calc (fórmula com entradas que a turma mexe), science (curvas com controles), chart (toda tabela numérica pode virar gráfico), solution (exercício resolvido passo a passo com os dados do próprio material), algo com program: (um método passo a passo como programa: ordenar e classificar, redistribuir blocos…), spotlight (mapa ou figura com regiões explicadas), compare, timeline, diagram, infographic, question/poll, split com a figura original.`;
const CONTENT_RULES = `Regras de conteúdo (valem sempre):
- NADA do original pode se perder: números, unidades, fórmulas, nomes, siglas, leis, fontes/créditos das figuras, exemplos, tabelas inteiras, observações. Se não couber no slide, vai para outro slide ou para notes.
- Figura ESPECÍFICA (mapa de um lugar, dado de um experimento, foto real, gráfico com dados que não estão no texto) continua: use a imagem original pelo caminho dado (image: …, ou figure: { image: … }). Figura GENÉRICA (conceito que qualquer livro desenha igual) pode ser redesenhada com os recursos do sagadeck — só se preservar exatamente as mesmas características.
- Não invente dado. Se o original parecer ter um erro (fórmula que contradiz o gráfico, número que não fecha), NÃO troque em silêncio: aponte em "alertas" e, no slide, mostre o que o material sustenta com uma nota curta para o professor validar.
- Escreva em português, no tom do material (aula).`;
const MODE_RULES = {
  melhorar: `MODO MELHORAR: o estilo é o do original (a moldura dele — faixa, logos, linha do título, número — já está no mestre do deck; use os layouts do sagadeck normalmente, sem redesenhar a moldura). Mantenha a ORDEM do original; inclusões entram perto do assunto. Melhore onde ganha: estrutura, clareza, interação, exercícios, redesenho de figura genérica. Slide que já está bom: "manter". Cada slide que mudar vai ser marcado para o professor validar.`,
  recriar: `MODO RECRIAR: uma apresentação nova, do zero, com o melhor que o sagadeck faz (escolha o tema em "tema"). A ordem pode mudar se a didática ganhar (seções, uma ideia por slide, exercícios no ponto certo). "manter" não vale; use "juntar", "escrever" e "novo". Todo slide original precisa ir para algum item (o conteúdo dele não pode sumir).`,
};

// ------------------------------------------------------------------------------------------------ tarefa
export async function transformDeck({ spec, dir, mode = "melhorar", request = "", onProgress = () => {}, textModel, visionModel, maxRounds = 1, signal, log = () => {} }) {
  if (!["melhorar", "recriar"].includes(mode)) throw new Error(`modo desconhecido: ${mode}`);
  const originals = (spec.slides || []).filter((s) => s.layout === "canvas" && s.original);
  if (!originals.length) throw new Error("Esta apresentação não veio de uma importação (importe o PowerPoint primeiro: Biblioteca › Importar apresentação).");
  const cfg = llmConfig();
  const T = textModel || cfg.textModel, V = visionModel || cfg.visionModel;
  const started = Date.now();
  const usage = {};
  let calls = 0;
  const ask = async (messages, { model = T, maxTokens = 16000, temperature = 0.3 } = {}) => {
    if (signal?.aborted) throw new Error("interrompido");
    calls++;
    const r = await chat(messages, { model, maxTokens, temperature });
    const u = usage[r.model || model] || (usage[r.model || model] = { calls: 0, in: 0, out: 0 });
    u.calls++; u.in += r.usage?.prompt_tokens || 0; u.out += r.usage?.completion_tokens || 0;
    log({ model: r.model || model, usage: r.usage });
    return r;
  };
  const progress = (phase, text, extra = {}) => onProgress({ phase: `transform-${phase}`, text, ...extra });
  const orig = new Map(originals.map((s) => [s.original.slide, s]));
  const imgFile = (s) => s.original?.image && path.join(dir, s.original.image);

  // imagens que se repetem em muitos slides (logos da moldura) não são conteúdo
  const imgCount = new Map();
  for (const s of originals) for (const e of s.elements) if (e.image) imgCount.set(e.image, (imgCount.get(e.image) || 0) + 1);
  const contentImages = (s) => [...new Set(s.elements.filter((e) => e.image && !e.deco && imgCount.get(e.image) <= Math.max(2, originals.length * 0.2)).map((e) => e.image))];

  // ---- 1. VER: o modelo de visão descreve as figuras (genérica × específica, dados legíveis)
  const cacheDir = path.join(dir, ".sagadeck", "transform");
  fs.mkdirSync(cacheDir, { recursive: true });
  const figFile = path.join(cacheDir, "figuras.json");
  let figs = {};
  try { figs = JSON.parse(fs.readFileSync(figFile, "utf8")); } catch {}
  const needFig = originals.filter((s) => !figs[s.original.slide] && imgFile(s) && fs.existsSync(imgFile(s)) && (contentImages(s).length || s.elements.filter((e) => e.drawing && !e.deco).length >= 3 || s.elements.some((e) => e.table)));
  if (needFig.length) {
    const { imagesAsDataUrls } = await import("../import/crop.js");
    const urls = await imagesAsDataUrls(needFig.map(imgFile), { width: 1024 });
    for (let k = 0; k < needFig.length; k += 4) {
      const batch = needFig.slice(k, k + 4);
      progress("ver", `Olhando as figuras do original (slides ${batch.map((s) => s.original.slide).join(", ")})…`, { done: k, total: needFig.length });
      const content = [{ type: "text", text: `Fotos de slides de uma apresentação. Para cada slide, descreva as FIGURAS (não o texto corrido, que eu já tenho): o que é (esquema, mapa, gráfico, foto, tabela em imagem, equação em imagem, desenho), se é GENÉRICA (conceito que qualquer livro desenha igual e pode ser redesenhado sem perder nada) ou ESPECÍFICA (mapa de um lugar, dado de experimento, foto real, gráfico com dados que não estão no texto: tem que ser mantida), e transcreva os dados legíveis (números, rótulos, eixos, legendas, fórmulas em LaTeX). Diga também se o slide parece continuação do anterior (o mesmo desenho com partes a mais).
Responda só JSON: {"slides":[{"n":6,"figuras":[{"tipo":"esquema","generica":true,"o_que":"…","dados":"…"}],"continua_anterior":false}]}` }];
      batch.forEach((s, j) => content.push({ type: "text", text: `Slide ${s.original.slide}:` }, { type: "image_url", image_url: { url: urls[k + j] } }));
      try {
        const r = await ask([{ role: "user", content }], { model: V, maxTokens: 6000 });
        for (const it of jsonOf(r.text).slides || []) figs[it.n] = it;
      } catch (e) { for (const s of batch) figs[s.original.slide] = { n: s.original.slide, erro: e.message }; }
      fs.writeFileSync(figFile, JSON.stringify(figs, null, 1));
    }
  }

  // o que cada slide original tem (texto, tabelas, notas, figuras, imagens), compacto
  const brief = (s) => {
    const n = s.original.slide;
    const f = figs[n]?.figuras?.length ? `\n  figuras: ${figs[n].figuras.map((x) => `[${x.generica ? "genérica" : "ESPECÍFICA"}] ${x.tipo}: ${x.o_que}${x.dados ? ` — dados: ${x.dados}` : ""}`).join(" | ")}` : "";
    const imgs = contentImages(s);
    return `### slide ${n}: ${s.title || ""}\n${textsOfSlide(s).map((t) => `  ${t.replace(/\n/g, "\n  ")}`).join("\n")}${f}${imgs.length ? `\n  imagens: ${imgs.join(", ")}` : ""}${s.notes ? `\n  notas: ${clip(s.notes, 1500)}` : ""}${figs[n]?.continua_anterior ? "\n  (parece continuação do slide anterior: o mesmo desenho com partes a mais)" : ""}`;
  };

  // ---- 2. PLANEJAR
  progress("plano", "Planejando o que fazer com cada slide…");
  const style = mode === "melhorar" ? styleFromImport(spec) : null;
  const planMsg = [
    { role: "system", content: `${systemPrompt({ images: false })}\n\n${TOOLBOX}\n\n${CONTENT_RULES}\n\n${MODE_RULES[mode]}` },
    { role: "user", content: `Pedido do professor: ${request || (mode === "melhorar" ? "melhore a apresentação mantendo o estilo" : "recrie a apresentação do zero")}

Apresentação original (${originals.length} slides; proporção ${spec.aspect || "16:9"}):
${originals.map(brief).join("\n\n")}

Faça o PLANO. Responda só com um bloco \`\`\`json:
{"tema": "${mode === "recriar" ? "um dos temas do sagadeck" : "(ignorado no modo melhorar)"}", "titulo": "título da apresentação", "alertas": ["possível erro no conteúdo, com o slide"], "slides": [{"acao": "manter|juntar|escrever|novo", "de": [3], "ideia": "o que vai ter e qual layout/recurso", "imagens": ["imagens/…"]}]}
Todos os slides de 1 a ${originals.length} precisam aparecer em algum "de". Mantenha "ideia" curta (1 a 2 frases).` },
  ];
  let plan;
  for (let attempt = 1; attempt <= 3 && !plan; attempt++) {
    const r = await ask(planMsg, { maxTokens: 24000 });
    try {
      const p = jsonOf(r.text);
      if (!Array.isArray(p.slides) || !p.slides.length) throw new Error('o JSON precisa de "slides" com os itens do plano');
      plan = p;
    } catch (e) {
      planMsg.push({ role: "assistant", content: r.text }, { role: "user", content: `Não deu para ler o plano (${e.message}). Responda de novo só com o bloco \`\`\`json, completo.` });
    }
  }
  if (!plan) throw new Error("A IA não conseguiu fazer o plano.");
  // cobertura: todo slide original em algum item (o que faltar entra onde estava, mantido ou para escrever)
  const covered = new Set(plan.slides.flatMap((it) => (it.de || []).map(Number)));
  const missing = originals.map((s) => s.original.slide).filter((n) => !covered.has(n));
  for (const n of missing) {
    const at = plan.slides.findIndex((it) => Math.min(...(it.de || [Infinity])) > n);
    const item = { acao: mode === "melhorar" ? "manter" : "escrever", de: [n], ideia: "(o plano esqueceu este slide: entra aqui para não perder o conteúdo)", auto: true };
    if (at < 0) plan.slides.push(item); else plan.slides.splice(at, 0, item);
  }
  if (mode === "recriar") plan.slides.forEach((it) => { if (it.acao === "manter") it.acao = "escrever"; });
  fs.writeFileSync(path.join(cacheDir, `plano-${mode}.json`), JSON.stringify(plan, null, 1));

  // ---- 3. ESCREVER em blocos, 4. CONFERIR
  const deckBase = mode === "melhorar"
    ? { title: spec.title, aspect: spec.aspect, theme: style.theme, master: style.master, footer: false, purpose: "palestra" }
    : { title: plan.titulo || spec.title, aspect: spec.aspect, theme: plan.tema && typeof plan.tema === "string" ? plan.tema : "oceano", purpose: "palestra" };
  if (typeof deckBase.theme === "string") { try { const { THEMES } = await import("../themes.js"); if (!THEMES[deckBase.theme]) deckBase.theme = "oceano"; } catch {} }
  const results = plan.slides.map(() => null); // por item: slides prontos
  const report = { faltando: [], problemas: [], itens: plan.slides.length };
  const writeSystem = `${systemPrompt({ images: false })}\n\n${CONTENT_RULES}\n\n${MODE_RULES[mode]}\n\nFormato: responda com UM bloco \`\`\`yaml com \`slides:\` (a lista de slides completos). Cada slide leva \`origem: N\` (o número do ITEM do plano de onde ele saiu) e \`mudou: "uma frase: o que mudou em relação ao original"\`. Um item pode virar mais de um slide. Caminhos de imagem: só os que foram dados. Coloque entre aspas todo texto com ": " ou que comece com marcação.`;
  const writable = plan.slides.map((it, k) => ({ it, k })).filter(({ it }) => it.acao === "escrever" || it.acao === "novo");
  // juntar e manter: código
  plan.slides.forEach((it, k) => {
    const src = (it.de || []).map((n) => orig.get(Number(n))).filter(Boolean);
    if (it.acao === "manter" && src.length) results[k] = src.map((s) => structuredClone(s));
    if (it.acao === "juntar" && src.length) {
      const merged = mergeProgressive(src);
      if (mode === "melhorar") merged.review = { status: "alterado", note: `Os slides ${src.map((s) => s.original.slide).join(", ")} viraram um só, que se monta por cliques (o mesmo desenho).`, original: src[0].original.slide };
      results[k] = [merged];
    }
  });
  const BATCH = 5;
  for (let b = 0; b < writable.length; b += BATCH) {
    const batch = writable.slice(b, b + BATCH);
    progress("escrever", `Escrevendo ${batch.length === 1 ? "o item" : "os itens"} ${batch.map(({ k }) => k + 1).join(", ")} de ${plan.slides.length}…`, { done: b, total: writable.length });
    const itemsText = batch.map(({ it, k }) => {
      const src = (it.de || []).map((n) => orig.get(Number(n))).filter(Boolean);
      return `## ITEM ${k + 1} — ${it.acao}: ${it.ideia}${it.imagens?.length ? `\nImagens para usar: ${it.imagens.join(", ")}` : ""}\nOriginal:\n${src.map(brief).join("\n\n") || "(nenhum)"}`;
    }).join("\n\n");
    const before = plan.slides.slice(Math.max(0, batch[0].k - 3), batch[0].k).map((it) => `- ${it.ideia}`).join("\n");
    const messages = [
      { role: "system", content: writeSystem },
      { role: "user", content: `Deck: título "${deckBase.title}", tema ${typeof deckBase.theme === "string" ? deckBase.theme : "o do original (mestre já aplicado)"}.${before ? `\nLogo antes vêm:\n${before}` : ""}\n\nEscreva os slides destes itens do plano:\n\n${itemsText}` },
    ];
    let produced = null, lastErr = null;
    for (let attempt = 1; attempt <= 3 && !produced; attempt++) {
      const r = await ask(messages);
      try { produced = parseProduced(r.text, batch, deckBase, dir); }
      catch (e) { lastErr = e; messages.push({ role: "assistant", content: r.text }, { role: "user", content: `Não deu para usar:\n${e.message}\nCorrija e responda de novo com o bloco \`\`\`yaml completo.` }); }
    }
    if (!produced) { report.problemas.push(`itens ${batch.map(({ k }) => k + 1).join(", ")}: não saíram (${lastErr?.message})`); continue; }
    // conferir: fatos (código) e desenho (visão), uma rodada de correção
    for (let round = 0; round <= maxRounds; round++) {
      const issues = [];
      for (const { it, k } of batch) {
        const src = (it.de || []).map((n) => orig.get(Number(n))).filter(Boolean);
        if (!src.length || it.acao === "novo") continue;
        const facts = { numbers: new Set(), terms: new Set() };
        facts.alts = new Map();
        for (const s of src) { const f = factsOf(s, figs[s.original.slide]?.figuras?.map((x) => x.dados || "").join(" ")); f.numbers.forEach((x) => facts.numbers.add(x)); f.terms.forEach((x) => facts.terms.add(x)); f.alts.forEach((v, k) => facts.alts.set(k, v)); }
        // o que o item escreveu + o que os itens irmãos (mesmos slides de origem) escreveram
        const mine = produced.filter((s) => s.origem === k + 1);
        const sib = plan.slides.map((x, j) => (j !== k && (x.de || []).some((n) => (it.de || []).includes(n)) ? j : -1)).filter((j) => j >= 0);
        const others = [...sib.flatMap((j) => results[j] || []), ...produced.filter((s) => sib.includes(s.origem - 1))];
        const miss = missingFacts(facts, [...mine, ...others]);
        const imgsWanted = (it.imagens || []).filter((p) => fs.existsSync(path.join(dir, p)));
        const imgsLost = imgsWanted.filter((p) => !JSON.stringify(mine).includes(p));
        if (miss.numbers.length || miss.terms.length || imgsLost.length) issues.push({ k, text: `ITEM ${k + 1}: faltou do original ${[miss.numbers.length ? `números ${miss.numbers.slice(0, 30).join(", ")}` : "", miss.terms.length ? `nomes/siglas ${miss.terms.slice(0, 20).join(", ")}` : "", imgsLost.length ? `imagens ${imgsLost.join(", ")}` : ""].filter(Boolean).join("; ")}` });
      }
      if (round < maxRounds) {
        try {
          progress("conferir", `Conferindo o desenho dos itens ${batch.map(({ k }) => k + 1).join(", ")}…`);
          for (const v of await visualCheck({ produced, batch, deckBase, dir, orig, ask, model: V })) issues.push(v);
        } catch (e) { report.problemas.push(`conferência visual falhou: ${clip(e.message, 200)}`); }
      }
      if (!issues.length) break;
      if (round === maxRounds) { report.faltando.push(...issues.map((x) => x.text)); break; }
      progress("corrigir", `Corrigindo ${issues.length} ponto(s) nos itens ${[...new Set(issues.map((x) => x.k + 1))].join(", ")}…`);
      const fixMsg = [...messages, { role: "assistant", content: `\`\`\`yaml\n${YAML.stringify({ slides: produced })}\`\`\`` },
        { role: "user", content: `Conferi estes slides contra o original e contra a foto de como ficaram:\n${issues.map((x) => `- ${x.text}`).join("\n")}\n\nDevolva o bloco \`\`\`yaml com TODOS os slides destes itens, corrigidos (o que faltou entra no slide, numa tabela ou em notes; problema de desenho: ajuste o layout, divida o slide ou reduza o texto).` }];
      try { const r = await ask(fixMsg); produced = parseProduced(r.text, batch, deckBase, dir); }
      catch (e) { report.problemas.push(`correção dos itens ${batch.map(({ k }) => k + 1).join(", ")} falhou: ${clip(e.message, 200)}`); break; }
    }
    for (const { it, k } of batch) {
      const mine = produced.filter((s) => s.origem === k + 1);
      results[k] = mine.map((s) => {
        const out = { ...s };
        const why = out.mudou; delete out.origem; delete out.mudou;
        if (mode === "melhorar") out.review = it.acao === "novo" || !(it.de || []).length ? { status: "novo", note: clip(why || it.ideia, 200) } : { status: "alterado", note: clip(why || it.ideia, 200), original: Number(it.de[0]) };
        return out;
      });
    }
  }

  // ---- 5. MONTAR
  // item que não saiu: o slide original entra como era (nada se perde) e a pessoa fica sabendo
  const slides = results.flatMap((r, k) => {
    if (r) return r;
    const back = (plan.slides[k].de || []).map((n) => orig.get(Number(n))).filter(Boolean).map((s) => structuredClone(s));
    if (back.length && mode === "recriar") report.problemas.push(`item ${k + 1} não saiu: entrou o slide original ${back.map((s) => s.original.slide).join(", ")} como era`);
    return back;
  });
  const out = { ...deckBase, ...(mode === "melhorar" ? { import: spec.import, style: { name: style.name } } : { recreatedFrom: spec.import?.from || spec.title }), slides };
  const seconds = Math.round((Date.now() - started) / 1000);
  return { spec: out, plan, report: { ...report, mode, textModel: T, visionModel: V, calls, usage, seconds, alertas: plan.alertas || [] } };
}

// resposta do escritor → slides válidos (renderizam, só imagens que existem, origem de um item do bloco)
function parseProduced(text, batch, deckBase, dir) {
  const { yaml } = extractYaml(text);
  let raw = parseYaml(yaml);
  if (Array.isArray(raw)) raw = { slides: raw };
  if (!raw || !Array.isArray(raw.slides) || !raw.slides.length) throw new Error('Esperava `slides:` com a lista de slides.');
  const allowed = new Set(batch.map(({ k }) => k + 1));
  const slides = raw.slides.map((s, i) => {
    if (!s || typeof s !== "object") throw new Error(`slide ${i + 1}: não é um objeto`);
    const origem = Number(s.origem ?? (batch.length === 1 ? batch[0].k + 1 : NaN));
    if (!allowed.has(origem)) throw new Error(`slide ${i + 1}: origem ${s.origem} não é um item deste bloco (${[...allowed].join(", ")})`);
    return { ...s, origem };
  });
  const missingItems = [...allowed].filter((n) => !slides.some((s) => s.origem === n));
  if (missingItems.length) throw new Error(`Faltou escrever ${missingItems.length === 1 ? "o item" : "os itens"} ${missingItems.join(", ")} (cada item precisa de pelo menos um slide com origem: N).`);
  const clean = normalizeSpec({ ...deckBase, slides: slides.map(({ origem, mudou, ...rest }) => rest) });
  // imagens que não existem na pasta do deck: erro (volta para a IA)
  const bad = [];
  const walk = (v, k) => { if (k === "image" && typeof v === "string" && !/^(https?:|data:)/.test(v) && !fs.existsSync(path.join(dir, v))) bad.push(v); else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
  clean.slides.forEach((s) => walk(s));
  if (bad.length) throw new Error(`Imagens que não existem: ${[...new Set(bad)].join(", ")}. Use só os caminhos dados.`);
  validateSlides({ ...clean, _dir: dir });
  sanitizeCheck(clean, clean.slides.map((_, i) => i));
  return clean.slides.map((s, i) => ({ ...s, origem: slides[i].origem, ...(slides[i].mudou ? { mudou: String(slides[i].mudou) } : {}) }));
}

// o slide novo desenhado ao lado da foto do original: o modelo de visão aponta o que está errado
async function visualCheck({ produced, batch, deckBase, dir, orig, ask, model }) {
  const { slideSnapshots } = await import("../studio/snapshot.js");
  const { imagesAsDataUrls } = await import("../import/crop.js");
  const deck = { ...deckBase, _dir: dir, slides: produced.map(({ origem, mudou, ...s }) => s) };
  const shots = [];
  for (let i = 0; i < deck.slides.length; i++) shots.push((await slideSnapshots(deck, i, { mode: "final", width: 960 }))[0]?.dataUrl);
  const origFiles = [...new Set(batch.flatMap(({ it }) => (it.de || []).map((n) => orig.get(Number(n))?.original?.image).filter(Boolean)))];
  const origUrls = await imagesAsDataUrls(origFiles.map((f) => path.join(dir, f)), { width: 960 });
  const content = [{ type: "text", text: `Confira slides NOVOS de uma aula contra as fotos dos slides ORIGINAIS. Aponte só problemas reais:
- desenho: texto cortado, sobreposto, fora do slide, ilegível de tão pequeno, área vazia enorme, figura esticada;
- conteúdo: informação que está no original e sumiu no novo (número, rótulo, parte de uma figura específica), figura errada.
Responda só JSON: {"slides":[{"i":1,"ok":true,"problemas":["…"]}]} (i = número do slide novo, na ordem).` }];
  origFiles.forEach((f, j) => { if (origUrls[j]) content.push({ type: "text", text: `ORIGINAL ${f.match(/(\d+)\.png$/)?.[1] || j + 1}:` }, { type: "image_url", image_url: { url: origUrls[j] } }); });
  shots.forEach((u, i) => { if (u) content.push({ type: "text", text: `NOVO ${i + 1} (do item ${produced[i].origem}):` }, { type: "image_url", image_url: { url: u } }); });
  const r = await ask([{ role: "user", content }], { model, maxTokens: 6000 });
  const res = jsonOf(r.text);
  return (res.slides || []).filter((s) => s && s.ok === false && Array.isArray(s.problemas) && s.problemas.length).map((s) => ({ k: (produced[s.i - 1]?.origem || batch[0].k + 1) - 1, text: `slide novo ${s.i} (item ${produced[s.i - 1]?.origem}): ${s.problemas.join("; ")}` }));
}
