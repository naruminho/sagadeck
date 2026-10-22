// Painel Revisar › Conferência: junta num lugar o que as checagens automáticas acharam no deck aberto (contas que não
// batem, contas do material que não fecham, números sem base no material, avisos da revisão visual, figuras do
// material sem slide, slides que a IA calculou ou incluiu) e o que a pessoa decidiu sobre cada um.
// Antes os achados ficavam espalhados (relatório da criação, mensagem do chat, selo na miniatura) e a professora
// entregou a aula com a conta errada: o aviso existia, mas não tinha lugar nem botão.
// A decisão (ignorado: "está certo assim"; enviado: o pedido de correção já foi ao chat) fica no relatório
// (.sagadeck/avaliacao-geracao.json, campo `decisoes`): o item some do painel e dos próximos pedidos à IA.
import { locate, checkMath } from "../ai/math-check.js";
import { unsupportedNumbers, uncoveredVisuals } from "../ai/document-visuals.js";
import { loadGenReport, writeGenReport } from "./generation-report.js";

export const CONF_KINDS = {
  conta: "Conta que não bate",
  material: "Conta do material que não fecha",
  numero: "Número sem base no material",
  visual: "Aviso da revisão visual",
  figura: "Figura do material sem slide",
  derivado: "Calculado pela IA",
  proprio: "Incluído pela IA",
};

// id estável para o mesmo achado (o painel e o relatório falam dele pelo id)
const hash = (s) => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.codePointAt(0)) >>> 0; return h.toString(36); };
const fmt = (x) => (typeof x === "number" ? Number(x.toPrecision(4)).toLocaleString("pt-BR", { maximumFractionDigits: 6 }) : String(x ?? ""));
const unit = (d) => (d.unidade ? ` ${d.unidade}` : "");

// Os itens pendentes: relatório + origem dos slides do deck atual, menos o que a pessoa já decidiu. Achado que o
// deck já não tem (o número saiu do slide, o slide não existe mais) não aparece: foi resolvido.
export function conferenceItems(report, spec) {
  const slides = spec?.slides || [];
  const decided = report?.decisoes || {};
  const out = [];
  const still = (n, number) => slides[n - 1] && locate(slides[n - 1], number).length > 0;
  for (const d of report?.math?.divergent || []) {
    if (!still(d.slide, d.afirmado)) continue;
    out.push({ id: `conta:${d.slide}:${d.afirmado}`, kind: "conta", slide: d.slide, contas: [d.slide],
      text: `${d.oQue ? `${d.oQue}: ` : ""}o slide diz ${d.afirmado}${unit(d)}; refazendo a conta, dá ${fmt(d.calculado)}${unit(d)}.`,
      fix: `Confira a conta do slide ${d.slide}${d.oQue ? ` (${d.oQue})` : ""}: o slide diz ${d.afirmado}${unit(d)}; refazendo a partir dos dados, dá ${fmt(d.calculado)}${unit(d)}${d.fn ? ` [${d.fn} com ${JSON.stringify(d.vars || {})}]` : ""}. Se o slide estiver errado, corrija o resultado em todos os campos onde ele aparece e o que depende dele (passos, resposta, notes, gráficos e textos de outros slides); se o slide estiver certo, diga por quê.` });
  }
  for (const d of report?.math?.material || []) {
    if (!still(d.slide, d.afirmado)) continue;
    out.push({ id: `material:${d.slide}:${d.afirmado}`, kind: "material", slide: d.slide, contas: [d.slide],
      text: `${d.oQue ? `${d.oQue}: ` : ""}o material traz ${d.afirmado}${unit(d)}, mas a conta com os dados dele dá ${fmt(d.calculado)}${unit(d)}. Confira com quem escreveu.`,
      fix: `No slide ${d.slide}, o número ${d.afirmado}${unit(d)} está no material, mas não fecha com os dados dele: refazendo, dá ${fmt(d.calculado)}${unit(d)}. Siga a autoria do deck: em \`autoria: autor\` (ou sem autoria definida), mantenha o número do material e explique a divergência nas notes ("Confira: o material traz X; refazendo a conta, dá Y"); em \`autoria: livre\`, corrija no slide e diga nas notes que o material traz outro valor.` });
  }
  for (const b of report?.facts?.unsupported || []) {
    if (!still(b.slide, b.number)) continue;
    out.push({ id: `numero:${b.slide}:${b.number}`, kind: "numero", slide: b.slide,
      text: `${b.number} aparece no slide, mas não está escrito no material.`,
      fix: `O número ${b.number} do slide ${b.slide} não está no material anexado. Se for valor do material lido errado (de um gráfico, por exemplo), troque pelo que o texto ou a tabela do material traz; se for conta sua a partir do material, deixe só com a conta no slide ou nas notes; se não houver base, tire o número (reescreva a frase sem ele). Não mexa em mais nada.` });
  }
  for (const i of report?.quality?.issues || []) {
    if (!slides[i.slide - 1]) continue;
    const text = String(i.text || "").trim();
    out.push({ id: `visual:${i.slide}:${hash(text)}`, kind: "visual", slide: i.slide, text,
      fix: `Corrija no slide ${i.slide} este aviso da revisão visual: ${text}` });
  }
  for (const caption of report?.coverage?.missing || []) {
    out.push({ id: `figura:${hash(caption)}`, kind: "figura", slide: null, text: String(caption),
      fix: `Esta figura/tabela do material não aparece em nenhum slide: ${caption}. Encaixe-a no ponto da narrativa em que o assunto dela é discutido (no slide que já fala dele ou num slide novo logo ao lado), com a figura dominante e 1–3 frases de leitura do que ela mostra. Não mexa no resto do deck.` });
  }
  slides.forEach((s, k) => {
    const n = k + 1, note = s?.provenanceNote ? String(s.provenanceNote) : "";
    if (s?.provenance === "derivado") out.push({ id: `derivado:${s.uid || n}`, kind: "derivado", slide: n, contas: [n],
      text: note || "Feito pela IA a partir dos números do material: confira as contas.",
      fix: `O slide ${n} foi feito pela IA a partir dos números do material${note ? ` (${note})` : ""}. Refaça as contas dele a partir dos dados e corrija o que não bater, em todos os campos onde o número aparece.` });
    else if (s?.provenance === "proprio") out.push({ id: `proprio:${s.uid || n}`, kind: "proprio", slide: n,
      text: note || "Incluído pela IA: não está no material.",
      fix: `O slide ${n} foi incluído pela IA e não está no material${note ? ` (${note})` : ""}. Confira se o que ele afirma está correto e coerente com o material; corrija o que não estiver e deixe claro na provenanceNote de onde vem.` });
  });
  return out.filter((it) => !decided[it.id]).map((it) => ({ ...it, label: CONF_KINDS[it.kind] }));
}

// As pendências que vão junto do pedido ao chat (editDeck: pending). O que foi ignorado não vai: a IA não volta a
// insistir nisso, nem quando a pessoa pede "corrija os avisos da criação" com a mensagem antiga na conversa.
export function conferencePrompt(items) {
  const list = (items || []).filter((it) => it.kind !== "derivado" && it.kind !== "proprio");
  if (!list.length) return "";
  return `PENDÊNCIAS DA CONFERÊNCIA AUTOMÁTICA (painel Revisar › Conferência): o que as checagens acharam e a pessoa ainda não resolveu nem ignorou. Avisos antigos da conversa que não estão nesta lista foram resolvidos ou ignorados pela pessoa: não volte a eles. Mexa nestes só se o pedido tiver a ver.\n${list.slice(0, 40).map((it) => `- ${it.slide ? `slide ${it.slide}` : "deck"} · ${it.label}: ${it.text}`).join("\n")}`;
}

// A pessoa decidiu sobre um item: ignorado ("está certo assim") ou enviado (o pedido de correção foi ao chat)
export function decideItem(dir, id, status) {
  if (!dir) throw new Error("A apresentação precisa estar salva na biblioteca.");
  if (!["ignorado", "enviado"].includes(status)) throw new Error("status: ignorado ou enviado");
  if (!/^[a-z]+:[^\s]{1,200}$/.test(String(id || ""))) throw new Error("item da conferência inválido");
  const report = loadGenReport(dir) || { createdAt: new Date().toISOString(), avisado: true };
  report.decisoes = { ...(report.decisoes || {}), [id]: { status, em: new Date().toISOString() } };
  writeGenReport(dir, report);
  return report.decisoes[id];
}

// O chat conferiu as contas de alguns slides (pedido da pessoa, do painel ou edição que mexeu nos números): o resultado
// substitui o que o relatório dizia desses slides. only: índices 0-based.
export function recordMath(dir, only, math) {
  if (!dir || !math || math.failed || !only?.length) return;
  const report = loadGenReport(dir);
  if (!report && !math.divergent?.length && !math.material?.length) return;
  const nums = new Set(only.map((i) => i + 1));
  const keep = (list) => (list || []).filter((d) => !nums.has(d.slide));
  const prev = report?.math || {};
  writeGenReport(dir, { ...(report || { createdAt: new Date().toISOString(), avisado: true }),
    math: { ...prev, divergent: [...keep(prev.divergent), ...(math.divergent || [])], material: [...keep(prev.material), ...(math.material || [])] } });
}

// Conferir de novo (botão do painel): refaz no deck atual a conferência das contas (só confere, não corrige: a
// correção é pelo item), a checagem de números e a cobertura das figuras do material. A revisão visual não se refaz
// aqui (precisa fotografar os slides); os avisos dela ficam até a pessoa corrigir ou ignorar.
export async function recheckDeck(dir, spec, materials = [], { complete, signal } = {}) {
  const report = loadGenReport(dir) || { createdAt: new Date().toISOString(), avisado: true };
  const notes = [];
  const sources = (materials || []).filter((m) => m && m.kind !== "critica" && m.kind !== "pesquisa");
  if (sources.some((m) => String(m.text || "").trim())) report.facts = { checked: 0, unsupported: unsupportedNumbers(spec, sources) };
  if (sources.some((m) => m.inventory?.items?.length)) report.coverage = { missing: uncoveredVisuals(spec, sources).map((m) => m.caption) };
  const r = await checkMath(spec, { materials: sources, ...(complete ? { complete } : {}), signal });
  if (r.math?.failed) notes.push(`A conferência das contas falhou (${r.math.failed}); o resto foi conferido.`);
  else report.math = r.math ? { checked: r.math.checked, fixed: [], unchecked: r.math.unchecked, divergent: r.math.divergent, material: r.math.material } : { checked: 0, fixed: [], unchecked: [], divergent: [], material: [] };
  if (!sources.length) notes.push("Sem material anexado: a checagem de números e de figuras precisa do documento.");
  report.conferidoEm = new Date().toISOString();
  writeGenReport(dir, report);
  return { report, notes, unchecked: r.math?.unchecked?.length || 0 };
}

export { loadGenReport };
