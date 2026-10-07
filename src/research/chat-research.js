// Pesquisa web no chat de um deck aberto (fase 2): a mesma decisão do `new`
// (a IA diz se o que ela sabe basta), mas com o pedido da mensagem.
// Se precisar, busca, lê e anota; os materiais [F1]… entram no prompt junto
// com a instrução de citação, e tudo fica em contexto/pesquisa/ do deck.
// Sem internet (SAGADECK_WEB=0, a rede do banco): avisa e segue sem inventar.
// Falhou: segue com o que a IA sabe (o chat nunca trava por causa da pesquisa).
import { decideResearch, runResearch, researchInstruction, defaultWeb } from "./research.js";

const today = () => new Date().toISOString().slice(0, 10);

export async function maybeResearch({ prompt, materials = [], saveDir = null, onProgress = () => {}, web = null } = {}) {
  try {
    const plan = await decideResearch(prompt, { materials });
    if (!plan.pesquisar) return { materials, report: { pesquisou: false, motivo: plan.motivo }, instruction: "" };
    onProgress(`vou pesquisar: ${plan.motivo}`);
    if (process.env.SAGADECK_WEB === "0") {
      const report = { pesquisou: true, motivo: plan.motivo, buscas: plan.buscas, fontes: [], falhas: ["web desligada"], offline: true, data: today() };
      return { materials, report, instruction: researchInstruction(report) };
    }
    const r = await runResearch(plan, { briefing: prompt, web: web || defaultWeb, onProgress, saveDir });
    onProgress(r.materials.length
      ? `pesquisa: ${r.materials.length} fonte(s) lida(s) (${r.report.fontes.map((f) => f.site).join(", ")})`
      : "a pesquisa não achou fonte que desse para ler; sigo com o que eu sei, sem inventar dado recente.");
    return { materials: [...materials, ...r.materials], report: r.report, instruction: researchInstruction(r.report) };
  } catch (e) {
    onProgress(`a pesquisa falhou (${e.message}); sigo com o que eu sei`);
    return { materials, report: null, instruction: "" };
  }
}
