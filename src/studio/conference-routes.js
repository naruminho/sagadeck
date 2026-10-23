// Rotas do painel Revisar › Conferência (src/studio/conference.js): a lista, a decisão por item, o Corrigir tudo e o
// Conferir de novo.
import path from "node:path";
import { storedDocumentMaterials } from "../ai/document-materials.js";
import { llmAvailable } from "../ai/llm.js";
import * as Project from "./project.js";
import { conferenceItems, conferenceBatch, decideItem, decideItems, recheckDeck, loadGenReport } from "./conference.js";

const send = (res, data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };

// o material da apresentação: o documento guardado na criação ou no chat; sem ele, os arquivos de contexto/
export async function deckMaterials(file) {
  const dir = path.dirname(file);
  let materials = storedDocumentMaterials(dir);
  if (!materials.length) { try { materials = await Project.contextMaterials(Project.projectOf(file)); } catch { materials = []; } }
  return materials;
}

export async function conferenceRoutes({ req, res, pathname, W, readJSON, isBundledTemplate }) {
  if (!pathname.startsWith("/api/conferencia")) return false;
  const dir = W.file && !isBundledTemplate(W.file) ? path.dirname(W.file) : null;
  const list = (report = loadGenReport(dir)) => ({ items: dir ? conferenceItems(report, W.spec, { dir }) : [], conferidoEm: report?.conferidoEm || null, salvo: !!dir });
  if (pathname === "/api/conferencia" && req.method === "GET") { send(res, list()); return true; }
  if (pathname === "/api/conferencia/item" && req.method === "POST") {
    const body = await readJSON(req);
    try { decideItem(dir, String(body.id || ""), String(body.status || "")); send(res, { ok: true, ...list() }); }
    catch (e) { send(res, { error: e.message }, 400); }
    return true;
  }
  // Corrigir tudo com IA: monta o pedido único e marca como enviado o que não se confere sozinho; o Studio manda ao chat
  if (pathname === "/api/conferencia/corrigir-tudo" && req.method === "POST") {
    try {
      if (!dir) throw new Error("A apresentação precisa estar salva na biblioteca.");
      const batch = conferenceBatch(conferenceItems(loadGenReport(dir), W.spec, { dir }));
      if (!batch) throw new Error("Nada pendente para corrigir.");
      decideItems(dir, batch.enviados, "enviado");
      send(res, { ok: true, pedido: batch.text, contas: batch.contas, count: batch.count, ...list() });
    } catch (e) { send(res, { error: e.message }, 400); }
    return true;
  }
  if (pathname === "/api/conferencia/conferir" && req.method === "POST") {
    if (!dir) { send(res, { error: "A apresentação precisa estar salva na biblioteca." }, 400); return true; }
    const notes = [];
    try {
      const materials = await deckMaterials(W.file);
      const ai = await llmAvailable({ force: true });
      // sem IA: números e figuras se conferem do mesmo jeito; as contas precisam do modelo para escrever as fórmulas
      const r = await recheckDeck(dir, W.spec, materials, ai ? {} : { complete: async () => { throw new Error("a IA está desligada"); } });
      notes.push(...r.notes);
      if (r.unchecked) notes.push(`${r.unchecked} conta(s) sem como calcular.`);
      send(res, { ok: true, notes, ...list(r.report) });
    } catch (e) { send(res, { error: e.message }, 500); }
    return true;
  }
  return false;
}
