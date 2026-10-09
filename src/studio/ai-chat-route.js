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
import { prepareDocumentMaterials, takeMaterials, storedDocumentMaterials } from "../ai/document-materials.js";
import { critiqueMaterials, critiqueMarkdown, saveCritique, loadCritique, critiqueMaterial, markCritiqueItem } from "../ai/critique.js";
import { styleAction } from "./style-routes.js";
import * as Project from "./project.js";
import { carryVisualEdits } from "./visual-keys.js";

// Arquivos que a IA pode pedir para ver (ver: […]): imagens DENTRO da pasta da apresentação (os recortes e as
// páginas do material ficam em contexto/visuais/). Caminho que sai da pasta, que não existe ou que não é imagem fica
// de fora; no máximo 6.
export function lookableFiles(deckDir, wanted = []) {
  if (!deckDir) return [];
  const root = path.resolve(deckDir);
  const out = [];
  for (const w of wanted) {
    const rel = String(w || "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
    if (!rel || !/\.(png|jpe?g|webp|gif)$/i.test(rel)) continue;
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) continue;
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    if (!out.some((o) => o.abs === abs)) out.push({ rel, abs });
    if (out.length >= 6) break;
  }
  return out;
}

export async function aiChatRoutes({ req, res, pathname, url, W, readJSON, staleTab, llmAvailable, llmConfig, lookAt, withBase, apiBlocked, ensureEnsaio, readPastedLinks, imageOptions, apiContextFor, commandRunner, diagramCheck, slideSnapshots, persist, isBundledTemplate, runTransform, transforms, apiEnv }) {
  if (pathname === "/api/ai/chat/cancel" && req.method === "POST") {
    const body = await readJSON(req);
    const job = W.aiChats?.get(body.requestId);
    job?.abort();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, stopped: !!job }));
    return true;
  }
  // Leitura crítica do material da apresentação aberta (botão do chat): src/ai/critique.js. Nada muda nos slides; o
  // resultado fica em .sagadeck/leitura-critica.json (acompanha os próximos pedidos ao chat) e volta como conversa.
  if (pathname === "/api/ai/critique" && req.method === "POST") {
    const body = await readJSON(req);
    if (staleTab(body, W, res)) return true;
    const deckDir = W.file && !isBundledTemplate(W.file) ? path.dirname(W.file) : null;
    const spec = body.spec || W.spec;
    await respond(res, body.stream, async (emit) => {
      const P = deckDir ? Project.projectOf(W.file) : null;
      let materials = deckDir ? storedDocumentMaterials(deckDir) : [];
      if (!materials.length && P) materials = (await Project.contextMaterials(P)).filter((m) => String(m.text || "").length > 1500);
      if (!materials.length) return { talk: true, reply: "Esta apresentação não tem material anexado para ler criticamente. Anexe o documento (PDF, Word) no chat e peça de novo.", options: [] };
      if (!(await llmAvailable({ force: true }))) return { talk: true, reply: `A IA está desligada (nenhum LLM respondendo em ${llmConfig().url}).`, options: [] };
      emit({ phase: "step", text: `Lendo ${materials.map((m) => m.name).join(", ")} com olho crítico…` });
      const c = await critiqueMaterials(materials, { spec, briefing: spec?.context ? JSON.stringify(spec.context) : "" });
      saveCritique(deckDir, c);
      const autor = spec?.context?.autoria !== "livre";
      const options = c.itens.length
        ? (autor
          ? ["Leve para os slides os achados que estão no material", "Ponha as perguntas prováveis e as inconsistências nas notes", "Corrija os slides apontados", "Só queria ler, obrigado"]
          : ["Transforme os achados em conteúdo, marcando o que é do sagadeck", "Crie um slide de discussão crítica", "Corrija os slides apontados", "Só queria ler, obrigado"])
        : [];
      const head = c.itens.length
        ? `Li ${c.material.join(", ")} como um revisor da área. ${c.itens.length} ponto(s), cada um com o trecho do material que o sustenta (conferido no texto). ${autor ? "Como a apresentação é do próprio autor, nada disso entra nos slides sem você pedir: o que é achado do material pode ir para os slides; crítica e perguntas, para as notes." : "Como a apresentação é livre, posso transformar isso em conteúdo, marcando o que é do sagadeck."}`
        : "Não achei nada com trecho conferido no material para apontar.";
      // os pontos vão também estruturados: o chat mostra cada um como cartão, ligado ao slide, com Aplicar e Ignorar
      return { talk: true, reply: `${head}\n\n${critiqueMarkdown(c)}`, critique: { itens: c.itens, autor, summary: `${head}${c.naoConfirmados.length ? `

_${c.naoConfirmados.length} observação(ões) descartada(s): o trecho citado não foi encontrado no material._` : ""}` }, options, actions: [`Leitura crítica: ${c.itens.length} ponto(s) conferido(s)${c.naoConfirmados.length ? `, ${c.naoConfirmados.length} descartado(s) sem trecho no material` : ""}`] };
    });
    return true;
  }
  // cartão da leitura crítica: a pessoa aplicou ou ignorou o ponto (ignorado deixa de acompanhar os pedidos)
  if (pathname === "/api/ai/critique/item" && req.method === "POST") {
    const body = await readJSON(req);
    const deckDir = W.file && !isBundledTemplate(W.file) ? path.dirname(W.file) : null;
    try {
      const item = markCritiqueItem(deckDir, String(body.id || ""), String(body.status || ""));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, item }));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
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
          reply: `A IA está desligada (${llmConfig().url ? `nenhum LLM respondendo em ${llmConfig().url}` : "não configurada"}), então não mexi em nada. Configure em Configurar IA (provedor e chave) e mande de novo.`,
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
        // a leitura crítica já feita (geração ou botão) acompanha o pedido, rotulada como do sagadeck
        const critique = critiqueMaterial(loadCritique(P ? path.dirname(taskWorkspace.file) : null));
        if (critique) materials.push(critique);
        // links colados na mensagem: o servidor lê sozinho e conta nas ações
        const linkActions = [];
        for (const doc of await readPastedLinks(taskWorkspace, prompt, linkActions)) materials.push(doc);
        // pesquisa na web no chat (fase 2): a IA decide se o que ela sabe basta; as fontes
        // lidas entram nos materiais e a instrução de citação vai junto do pedido
        const chatResearch = await maybeResearch({ prompt, materials, saveDir: taskWorkspace.file && !isBundledTemplate(taskWorkspace.file) ? path.dirname(taskWorkspace.file) : null, onProgress: (s) => emit({ phase: "step", text: s }) });
        materials = chatResearch.materials;
        if (chatResearch.report?.fontes?.length) linkActions.push(`Pesquisa na web: ${chatResearch.report.fontes.length} fonte(s) (${chatResearch.report.fontes.map((f) => f.site).join(", ")})`);
        const firstInstruction = chatResearch.instruction ? `${chatResearch.instruction}\n${prompt}` : prompt;
        const editOpts = (extra = {}) => ({
          spec: withBase(taskWorkspace, spec), signal,
          instruction: firstInstruction,
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
          ...extra,
        });
        result = await editDeck(editOpts());
        signal.throwIfAborted();
        // A IA pediu para VER o material (ver: [recortes, páginas]): do documento ela só recebe o texto e o
        // inventário. O Studio carrega as imagens (só arquivos da pasta desta apresentação) e chama de novo, com elas
        // anexadas; até 2 rodadas. Antes ela respondia "não tenho acesso ao PDF" ou dizia ter visto o que não viu.
        const deckDir = taskWorkspace.file && !isBundledTemplate(taskWorkspace.file) ? path.dirname(taskWorkspace.file) : null;
        const seen = [];
        for (let round = 1; result.look?.length && round <= 2; round++) {
          const files = lookableFiles(deckDir, result.look);
          const missing = result.look.filter((f) => !files.some((x) => x.rel === f.replace(/\\/g, "/").replace(/^\.\//, "")));
          emit({ phase: "step", text: files.length ? `Olhando o material: ${files.map((f) => path.basename(f.rel)).join(", ")}…` : "Os arquivos pedidos não estão na pasta da apresentação." });
          const { imagesAsDataUrls } = await import("../import/crop.js");
          const urls = files.length ? await imagesAsDataUrls(files.map((f) => f.abs), { width: 1600, quality: 0.9 }) : [];
          signal.throwIfAborted();
          files.forEach((f, k) => urls[k] && seen.push({ label: `material: ${f.rel}`, dataUrl: urls[k] }));
          result.actions = [...(result.actions || []), files.length ? `Olhei no material: ${files.map((f) => f.rel).join(", ")}` : "Pedido de ver o material sem arquivo válido"];
          const before = result;
          result = await editDeck(editOpts({
            visuals: [...visuals, ...seen],
            history: [...history, { role: "user", text: prompt }, { role: "assistant", text: before.reply }],
            instruction: `${files.length ? `Aqui estão as imagens do material que você pediu para ver (${files.map((f) => f.rel).join(", ")}), anexadas com o rótulo "material: <arquivo>".` : "Nenhuma das imagens pedidas existe na pasta da apresentação."}${missing.length ? ` Não encontrei: ${missing.join(", ")} (use os caminhos exatos do inventário: recortes em items[].image e páginas inteiras em pages).` : ""} Agora atenda o pedido da pessoa já vendo, sem pedir de novo o que já está aqui:\n"""\n${firstInstruction}\n"""`,
          }));
          signal.throwIfAborted();
          result.actions = [...before.actions, ...(result.actions || [])];
        }
        if (result.look?.length) result = { ...result, look: undefined, talk: true, reply: `${result.reply}\n(Já mostrei as imagens duas vezes; me diga o que procurar nelas.)` };
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
