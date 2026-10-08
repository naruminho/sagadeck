// Chat lateral de IA (/api/ai/chat, /api/ai/chat/cancel): SSE, trabalhos canceláveis,
// pesquisa fase 2, materiais, testes de slides api e junção a três. Saiu de server.js (P1);
// o servidor passa o estado (ctx). Devolve true quando atendeu.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadSpec } from "../build.js";
import { writeRecording } from "../api-client.js";
import { editDeck, coverDocumentVisuals, checkNumbers } from "../ai/deck-ai.js";
import { reviewExperience } from "../ai/quality.js";
import { maybeResearch } from "../research/chat-research.js";
import { chatErrorResult } from "./errors.js";
import { cancellable, respond } from "./ai-response.js";
import { prepareDocumentMaterials, takeMaterials } from "../ai/document-materials.js";
import { styleAction } from "./style-routes.js";
import * as Project from "./project.js";
import { carryVisualEdits } from "./visual-keys.js";

export async function aiChatRoutes({ req, res, pathname, url, W, readJSON, staleTab, llmAvailable, llmConfig, lookAt, withBase, apiBlocked, ensureEnsaio, readPastedLinks, imageOptions, apiContextFor, commandRunner, diagramCheck, slideSnapshots, persist, isBundledTemplate, runTransform, transforms, apiEnv }) {
  if (pathname === "/api/ai/chat/cancel" && req.method === "POST") {
    const body = await readJSON(req);
    const job = W.aiChats?.get(body.requestId);
    job?.abort();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, stopped: !!job }));
    return true;
  }
  if (pathname === "/api/ai/chat" && req.method === "POST") {
    const body = await readJSON(req);
    if (staleTab(body, W, res)) return true;
    const owner = W;
    owner.aiChats ||= new Map();
    const requestId = body.requestId || crypto.randomUUID();
    const controller = new AbortController();
    owner.aiChats.set(requestId, controller);
    const signal = controller.signal;
    const onClose = () => { if (!res.writableEnded && !['melhorar','recriar'].some(m => transforms.has(`${taskWorkspace.file}|${m}`))) controller.abort(); };
    res.on('close', onClose);
    // Capture o arquivo da tarefa: abrir outro deck não redireciona a escrita.
    const taskWorkspace = { ...owner, spec: structuredClone(owner.spec) };
    const prompt = body.message || "";
    const spec = body.spec || taskWorkspace.spec;
    const issues = body.issues || [];
    // a IA vê (e testa) os slides api no ambiente atual, que pode ser o embutido "ensaio"
    if (!apiBlocked(req) && (spec.slides || []).some((sl) => sl && sl.layout === "api")) await ensureEnsaio();

    try { await respond(res, body.stream, async (send) => cancellable(async () => {
      const emit = ev => { signal.throwIfAborted(); send(ev); };
      let result;
      const history = Array.isArray(body.history) ? body.history : [];
      // o cache pode ter guardado uma queda de segundos do relay: confere de novo antes de desistir
      if (!(await llmAvailable()) && !(await llmAvailable({ force: true }))) {
        // Sem modelo, ninguém decide nada: nem "o que é X?" nem "resuma" viram edição por palavra-chave
        // (as regras antigas trocavam o layout e enfiavam texto genérico no slide). O deck fica como está.
        return {
          reply: `A IA está desligada (nenhum LLM respondendo em ${llmConfig().url}), então não mexi em nada. Rode "modelrelay serve" ou defina SAGADECK_LLM_URL e mande de novo.`,
          spec, actions: [], targetSlide: body.targetSlide, talk: true, mode: "off",
        };
      }
      try {
        const target = typeof body.targetSlide === "number" ? body.targetSlide : null;
        const visuals = await lookAt(withBase(taskWorkspace, spec), target, prompt, emit);
        // anexos: imagens vão como visão; documentos (id do /api/ai/context) vão como texto
        let materials = await prepareDocumentMaterials(takeMaterials(taskWorkspace, (Array.isArray(body.attachments) ? body.attachments : [])
          .filter((a) => a && typeof a === "object" && a.type === "doc").map((a) => a.id)), path.dirname(taskWorkspace.file), {signal,onProgress:emit});
        for (const [i, url] of (Array.isArray(body.attachments) ? body.attachments : []).entries()) {
          if (typeof url === "string" && url.startsWith("data:image/")) visuals.push({ label: `imagem colada pelo usuário ${i + 1}`, dataUrl: url });
        }
        // arquivos do projeto (contexto/): material para a IA, junto com os anexos da mensagem
        const P = taskWorkspace.file && !isBundledTemplate(taskWorkspace.file) ? Project.projectOf(taskWorkspace.file) : null;
        if (P) for (const doc of await Project.contextMaterials(P)) if (!materials.some((m) => m.name === doc.name || m.name === doc.name.split("/").pop())) materials.push(doc);
        // links colados na mensagem: o servidor lê sozinho e conta nas ações
        const linkActions = [];
        for (const doc of await readPastedLinks(taskWorkspace, prompt, linkActions)) materials.push(doc);
        // pesquisa na web no chat (fase 2): a IA decide se o que ela sabe basta; as fontes
        // lidas entram nos materiais e a instrução de citação vai junto do pedido
        const chatResearch = await maybeResearch({ prompt, materials, saveDir: taskWorkspace.file && !isBundledTemplate(taskWorkspace.file) ? path.dirname(taskWorkspace.file) : null, onProgress: (s) => emit({ phase: "step", text: s }) });
        materials = chatResearch.materials;
        if (chatResearch.report?.fontes?.length) linkActions.push(`Pesquisa na web: ${chatResearch.report.fontes.length} fonte(s) (${chatResearch.report.fontes.map((f) => f.site).join(", ")})`);
        result = await editDeck({
          spec: withBase(taskWorkspace, spec), signal,
          instruction: chatResearch.instruction ? `${chatResearch.instruction}\n${prompt}` : prompt,
          targetSlide: target,
          issues,
          images: true, // a IA decide (regra no prompt: só quando pedirem ou aceitarem)
          imageOptions: imageOptions(taskWorkspace, withBase(taskWorkspace, spec)),
          history,
          onProgress: emit,
          visuals,
          materials,
          renderNotes: Array.isArray(body.renderNotes) ? body.renderNotes.slice(0, 8) : [],
          apiContext: apiContextFor(req, taskWorkspace),
          drawCheck: diagramCheck,
          runCommand: commandRunner(req, emit, body, taskWorkspace, signal),
          reviewCheck: (deck, indices) => reviewExperience(deck, indices, { snapshot: slideSnapshots, onProgress: emit, signal, briefing:prompt }),
          styles: taskWorkspace.file && !isBundledTemplate(taskWorkspace.file) ? { list: taskWorkspace.library.listStyles(), current: taskWorkspace.spec?.style?.name || null } : null,
        });
        signal.throwIfAborted();
        // documento anexado NESTA mensagem e a resposta montou/reescreveu a maior parte do deck (criar a apresentação
        // do paper pelo chat): a mesma conferência de cobertura da geração. Pedido pontual ("use a figura 3 no slide
        // 5") não dispara: mexe em poucos slides.
        const attachedDocs = (Array.isArray(body.attachments) ? body.attachments : []).some((a) => a && typeof a === "object" && a.type === "doc");
        if (attachedDocs && !result.talk && !result.transform && !result.style && !result.variants && result.spec?.slides) {
          const rewritten = Array.isArray(result.changed) ? result.changed.length : 0;
          if (rewritten >= Math.max(5, result.spec.slides.length / 2)) {
            const covered = await coverDocumentVisuals(result.spec, { materials, briefing: prompt, say: (s) => emit({ phase: "step", text: s }),
              edit: (o) => editDeck({ signal, images: true, imageOptions: imageOptions(taskWorkspace, withBase(taskWorkspace, spec)), onProgress: emit, materials, drawCheck: diagramCheck, ...o }) });
            signal.throwIfAborted();
            if (covered.spec !== result.spec) { result.spec = covered.spec; result.actions = [...(result.actions || []), ...covered.actions]; }
            if (covered.coverage?.missing.length) result.actions = [...(result.actions || []), `Sem slide (figuras/tabelas do material): ${covered.coverage.missing.join("; ")}`];
            const checked = await checkNumbers(result.spec, { materials, say: (s) => emit({ phase: "step", text: s }),
              edit: (o) => editDeck({ signal, images: true, imageOptions: imageOptions(taskWorkspace, withBase(taskWorkspace, spec)), onProgress: emit, materials, drawCheck: diagramCheck, ...o }) });
            signal.throwIfAborted();
            if (checked.spec !== result.spec) { result.spec = checked.spec; result.actions = [...(result.actions || []), ...checked.actions]; }
            if (checked.facts?.unsupported.length) result.actions = [...(result.actions || []), `Números sem base no material: ${checked.facts.unsupported.map((b) => `${b.number} (slide ${b.slide})`).join(", ")}`];
          }
        }
        if (linkActions.length) result.actions = [...linkActions, ...(result.actions || [])];
        // a IA decidiu transformar a apresentação inteira (transform:): o trabalho em etapas, com o andamento aqui
        if (result.transform) {
          const transformed = await runTransform(taskWorkspace, withBase(taskWorkspace, spec), result, emit, prompt, visuals.filter(v => v.label.startsWith("imagem colada pelo usuário")), signal);
          return owner.file === taskWorkspace.file ? transformed : { ...transformed, spec: owner.spec, talk: true, reply: transformed.reply + '\nO resultado ficou no arquivo original; você está em outra apresentação.' };
        }
        // a IA decidiu mexer no estilo (estilo:): aplicar, salvar, tirar ou padrão das novas
        if (result.style) return styleAction({ W: taskWorkspace, spec: withBase(taskWorkspace, spec), result, persist, isBundledTemplate });
        // Slides api: a IA pediu para testar (test: [n]) → o Studio executa, devolve o relatório e ela
        // corrige, até 3 rodadas. Quem decide testar e o que corrigir é a IA; aqui só executa.
        const convo = [...history, { role: "user", text: prompt }]
        for (let round = 1; result.test?.length && round <= 3; round++) {
          if (apiBlocked(req)) { result.actions.push("Testes de slides api só no Studio local."); break; }
          const reports = [];
          for (const i of result.test) {
            const slide = result.spec.slides[i];
            emit({ phase: "test", text: `Testando o slide ${i + 1} (${apiEnv.currentName() || "sem ambiente"})…` });
            const r = await apiEnv.runSlide(slide, { vars: taskWorkspace.apiVars || {}, deckDir: taskWorkspace.file ? path.dirname(taskWorkspace.file) : null });
            signal.throwIfAborted();
            if (r.saved) taskWorkspace.apiVars = { ...(taskWorkspace.apiVars || {}), ...r.saved };
            if (r.record) {
              const key = globalThis.SagadeckApiCore.key(slide);
              if (taskWorkspace.file && !isBundledTemplate(taskWorkspace.file)) writeRecording(taskWorkspace.file, key, r.record);
              else (taskWorkspace.apiRecordings = taskWorkspace.apiRecordings || {})[key] = { ...r.record, at: new Date().toISOString() };
            }
            reports.push({ slide: i + 1, ...r.report });
            result.actions.push(`Teste do slide ${i + 1}: ${r.report.ok ? "funcionou" : "falhou, " + String(r.report.erro || (r.report.status ? `HTTP ${r.report.status}` : "falhou")).slice(0, 140)}`);
          }
          convo.push({ role: "assistant", text: result.reply });
          const instruction = `Resultado do teste (rodada ${round} de 3), executado no ambiente ${apiEnv.currentName()}:\n\`\`\`json\n${JSON.stringify(reports, null, 2).slice(0, 12000)}\n\`\`\`\nSe algo falhou ou tem "NÃO EXISTE", corrija os slides com base na resposta real e peça test de novo. Se tudo funcionou, confirme em uma frase, sem yaml.`;
          emit({ phase: "test", text: reports.every((x) => x.ok) ? "Os testes passaram; conferindo…" : "Corrigindo com base no resultado…" });
          const next = await editDeck({
            spec: withBase(taskWorkspace, result.spec), signal, instruction, targetSlide: target, images: false,
            imageOptions: imageOptions(taskWorkspace, withBase(taskWorkspace, result.spec)), history: convo, onProgress: emit, apiContext: apiContextFor(req, taskWorkspace),
            drawCheck: diagramCheck, runCommand: commandRunner(req, emit, body, taskWorkspace, signal),
          });
          convo.push({ role: "user", text: instruction });
          result = { ...next, actions: [...result.actions, ...(next.actions || [])], spec: next.spec };
        }
        result.mode = "llm";
      } catch (e) {
        if (signal.aborted) return { reply: "Parado a pedido. Nenhuma resposta pendente foi aplicada.", spec, actions: [], talk: true, mode: "cancelled" };
        // Falhou no meio: não "chuta" com as regras (poderiam fazer outra coisa); deck fica como estava.
        console.error("[Studio] IA falhou:", e.message);
        return chatErrorResult(e,spec,body.targetSlide);
      }
      // o que a pessoa salvou enquanto a IA pensava não some: junção a três (base = o que foi para a IA)
      signal.throwIfAborted();
      const current = taskWorkspace.file && fs.existsSync(taskWorkspace.file) ? loadSpec(taskWorkspace.file) : owner.spec;
      const merged = globalThis.SagadeckMerge.mergeDecks(spec, current || spec, result.spec);
      taskWorkspace.spec = merged.deck;
      carryVisualEdits(spec, taskWorkspace.spec); // a IA mudou o texto de um objeto ajustado: o ajuste acompanha
      persist(taskWorkspace);
      if (owner.file === taskWorkspace.file) owner.spec = taskWorkspace.spec;
      return { ...result, spec: taskWorkspace.spec, conflicts: merged.conflicts, kept: merged.kept };
    }, signal)); } finally { owner.aiChats.delete(requestId); res.off("close", onClose); }
    return true;
  }
  return false;
}
