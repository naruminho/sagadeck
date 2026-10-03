// sagadeck Studio · Servidor HTTP local para o editor visual PowerPoint + Chat Lateral IA
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import YAML from "yaml";
import { buildHTML, renderSlide, loadSpec, inferLayout, setFitDefaults } from "../build.js";
import { loadPreferences, savePreferences, preferencesFile, PREF_SCHEMA } from "../preferences.js";
import { THEMES, PALETTES } from "../themes.js";
import { writeDeckFile } from "../deck-file.js";
import "./public/merge-decks.js"; // globalThis.SagadeckMerge (o mesmo que o Studio usa no navegador)
import { LAYOUTS } from "../layouts.js";
import { listIcons } from "../figures/icons.js";
import { autofixSlide, autofixDeck } from "../fiscal/autofix.js";
import { normalizeSpec } from "../fiscal/normalize.js";
import { varietyReport } from "../ai/variety.js";
import { EXPERIENCES, createExperienceDeck } from "../experiences.js";
import { packDeck, unpackDeck, EXTENSION, MIME } from "../package.js";
import { openLibrary, defaultLibraryRoot, safeName } from "../library.js";
import { ApiEnvironments, defaultEnvFile, readRecordings, writeRecording, mimeOf } from "../api-client.js";
import { startMockApi, demoEnv, DEMO_FILES } from "../api-demo.js";
import { slideSnapshots, diagramCheck } from "./snapshot.js";
import { reviewExperience } from '../ai/quality.js';
import { runCommand, envName, logCommand } from "../ai/commands.js";
import { demoDeck, demoAssets, demoProjectFiles } from "./demo-decks.js";
import { llmAvailable, llmConfig } from "../ai/llm.js";
import { editDeck, textToSlide, generateDeck, toYaml, materializeImages } from "../ai/deck-ai.js";
import { transformDeck, jobStatus, sourceHash } from "../ai/transform.js";
import { sendExport, lightVariant } from "./exporting.js";
import { styleRoutes, styleAction } from "./style-routes.js";
import { shareRoutes } from "./share-routes.js";
import { apiRoutes } from "./api-routes.js";
export { lightVariant };
import { VERSION } from "./instance.js";
import { extractDocText, fetchUrlText, CONTEXT_STORE_CHARS, CONTEXT_MAX_DOCS, pastedUrls } from "../ai/context.js";
import * as Project from "./project.js";
import { docxToHtml } from "../docx.js";
import { ensureUids } from "../uid.js";
import { migrateLegacyKeys, carryVisualEdits } from "./visual-keys.js";
import { createRequire } from "node:module";
// pdf.js do node_modules (já é dependência para ler PDF de contexto); sem ele, o explorador usa o leitor do navegador
const PDFJS_DIR = (() => { try { return path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/build/pdf.min.mjs")); } catch { return null; } })();
import { parseAspect, convertAspect, slideSize } from "../aspect.js";
import { chat as llmChat } from "../ai/llm.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Caminhos que existem no repositório (src/studio/…) OU no motor empacotado do pip (engine/studio/…, engine/runtime/…)
const firstDir = (...dirs) => dirs.find((d) => fs.existsSync(d)) || dirs[0];
const PUBLIC_DIR = firstDir(path.join(HERE, "public"), path.join(HERE, "studio", "public"));
const RUNTIME_DIR = firstDir(path.join(HERE, "..", "runtime"), path.join(HERE, "runtime"));
// imagens dos modelos de fábrica (em imagens/, como num deck): a prévia usa esta pasta direto, sem copiar nada
const MODEL_ASSETS_DIR = firstDir(path.join(HERE, "assets"), path.join(HERE, "studio", "assets"));
// templates de exemplo do pacote (repositório: ../../templates · motor empacotado: ./templates)
const TEMPLATE_DIRS = [path.resolve(HERE, "..", "..", "templates"), path.resolve(HERE, "templates")];
const isBundledTemplate = (f) => !!f && TEMPLATE_DIRS.some((d) => path.resolve(f).startsWith(d + path.sep));
const templateFile = (name) => TEMPLATE_DIRS.map((d) => path.join(d, name)).find((f) => fs.existsSync(f));

const slugify = (s) => String(s || "deck").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deck";

export function createStudioServer(deckPath = null, opts = {}) {
  setFitDefaults(loadPreferences().texto); // mínimos do ajuste para caber (Preferências), valem no Studio e na exportação
  // Área de trabalho: o que cada pessoa tem aberto (deck, arquivo, última prévia) + a biblioteca dela.
  // Modo local (Windows do banco, só você): uma área só, biblioteca em SAGADECK_HOME ou ~/sagadeck.
  // Modo multiusuário (servidor atrás do BabsDeck): uma área por usuário, biblioteca <raiz>/usuarios/<usuário>.
  const libraryRoot = path.resolve(opts.library || defaultLibraryRoot());
  const STARTED = new Date().toISOString();
  const workspaces = new Map();
  function sampleSpec() {
    const samplePath = TEMPLATE_DIRS.map((d) => path.join(d, "exemplo.yaml")).find((f) => fs.existsSync(f)) || "";
    if (samplePath) return { spec: loadSpec(samplePath), file: samplePath };
    return {
      file: null,
      spec: {
        title: "Minha Apresentação", theme: "sinal", duration: 15,
        slides: [
          { layout: "cover", title: "Título da Apresentação", subtitle: "Criado com SagaDeck", author: "Seu Nome" },
          { layout: "statement", kicker: "Destaque", text: "Uma ideia forte por slide muda tudo." },
        ],
      },
    };
  }
  function newWorkspace(user) {
    const W = { user, library: openLibrary(user ? path.join(libraryRoot, "usuarios", safeName(user, "usuario")) : libraryRoot),
      file: null, spec: null, lastPreview: { ok: true, error: null, warnings: [] } };
    Object.assign(W, sampleSpec());
    return W;
  }
  const localWs = newWorkspace(null);
  if (deckPath) {
    const f = path.resolve(deckPath);
    if (fs.existsSync(f)) {
      try { localWs.spec = loadSpec(f); localWs.file = f; }
      catch (e) { console.warn(`[Studio] Aviso ao carregar ${f}: ${e.message}`); }
    } else {
      localWs.file = f; // arquivo novo: nasce do exemplo e é salvo aí
    }
  }
  workspaces.set("", localWs);
  // quem é: no modo multiusuário, o cabeçalho que o proxy (nginx + BabsDeck) põe; senão, a área local
  const USER_HEADER = String(opts.userHeader || "x-sagadeck-user").toLowerCase();
  function workspaceOf(req) {
    if (!opts.multiuser) return localWs;
    const user = String(req.headers[USER_HEADER] || "").trim();
    if (!user) return null;
    if (!workspaces.has(user)) workspaces.set(user, newWorkspace(user));
    return workspaces.get(user);
  }
  // links de ver, só leitura (Arquivo › Compartilhar link; src/studio/share-routes.js): a biblioteca de quem compartilhou
  const shares = shareRoutes({ libraryRoot, multiuser: !!opts.multiuser, libraryOf: (u) => {
    if (!workspaces.has(u || "")) workspaces.set(u || "", newWorkspace(u || null));
    return workspaces.get(u || "").library;
  } });
  // A aba diz qual arquivo está vendo (expectFile). O Studio tem uma apresentação aberta para todas as abas e aparelhos:
  // se outra aba (ou um script) abriu outra, o que esta manda gravar (salvar, YAML, chat) iria parar no arquivo errado.
  // Recusa e avisa para recarregar.
  const sameFile = (a, b) => { const n = (x) => path.resolve(String(x)); return process.platform === "win32" ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b); };
  function staleTab(body, W, res) {
    if (!body?.expectFile || !W.file || sameFile(body.expectFile, W.file)) return false;
    res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Outra aba ou aparelho abriu outra apresentação neste Studio. Recarregue a página para continuar; esta mudança não foi gravada.", stale: true, file: W.file }));
    return true;
  }
  const layoutPreviewCache = new Map(); // tema -> { layout: html }

  // Slide "api": ambientes (dev/hom…) e token ficam na máquina, fora do deck.
  const apiEnv = new ApiEnvironments(opts.apiEnvFile || defaultEnvFile()); // LOOPBACK: definido abaixo, junto da trava de origem
  const rtSessions = new Map(); // conversas em tempo real abertas: sid -> { conn, buffer, res }
  // Ambiente embutido "ensaio": a API de mentira (src/api-demo.js), para o deck de exemplo rodar sem VPN e
  // sem configurar nada. Só no Studio local; sobe na primeira vez que um slide api precisa e fecha com o Studio.
  let ensaio = null;
  function ensureOpenRouter() {
    apiEnv.builtin.openrouter ??= {
      label: "OpenRouter · chamada real",
      vars: { base: "https://openrouter.ai/api/v1" },
      secrets: { openrouter_api_key: { env: "OPENROUTER_API_KEY" } },
    };
  }
  function ensureEnsaio() {
    if (opts.multiuser) return Promise.resolve(null);
    if (opts.ensaio === false) {
      ensureOpenRouter();
      return Promise.resolve(null);
    }
    ensaio ??= startMockApi().then((mock) => {
      apiEnv.builtin.ensaio = { ...demoEnv(mock), label: "API de mentira" };
      ensureOpenRouter();
      return mock;
    }).catch((e) => {
      ensureOpenRouter();
      console.error("[Studio] API de ensaio não subiu:", e.message);
      return null;
    });
    return ensaio;
  }
  // O que a IA sabe do ambiente dos slides api: nome, variáveis (endereços), nomes dos segredos. Nunca valores de segredo.
  function apiContextFor(req, W) {
    if (opts.multiuser) return null;
    try {
      const st = apiEnv.state();
      const cur = st.envs.find((e) => e.name === st.current);
      if (!cur) return null;
      return { env: cur.name, live: !apiBlocked(req), vars: cur.vars, secrets: Object.keys(apiEnv.env().secrets || {}), saved: W.apiVars || {} };
    } catch { return null; }
  }

  // Comandos da IA (src/ai/commands.js): só no Studio local, com a resposta ao vivo (stream: é por ela que se pergunta),
  // com a apresentação salva na biblioteca (a pasta dela é a pasta de trabalho) e só com a aprovação da pessoa: o
  // pedido vai como {phase: "approve", id, command} e a resposta chega em /api/ai/approve. body.autoRun: ela liberou
  // os próximos desta conversa (o Studio só guarda isso enquanto a página está aberta). Sem resposta em 10 min: recusado.
  // Quem pode: no Studio local, a pessoa da máquina (mesmas travas do slide api: endereço local, própria página). No
  // servidor multiusuário, só quem está em --agentes / SAGADECK_AGENTES (o comando roda NA MÁQUINA DO SERVIDOR); os
  // outros usam tudo (gerar slides, conversar, imagens), só sem comandos, e a IA deles nem sabe que existem.
  const AGENTS = new Set([].concat(opts.agentUsers ?? String(process.env.SAGADECK_AGENTES || "").split(",")).map((u) => String(u).trim()).filter(Boolean));
  function commandsAllowed(req, W) {
    if (!W) return false;
    return opts.multiuser ? !!W.user && AGENTS.has(W.user) : !apiBlocked(req);
  }
  const approvals = new Map(); // id -> { user, answer }
  // transformações em andamento (continuam se o navegador fechar; o andamento e o Parar vêm pelas rotas /api/ai/transform/*)
  const transforms = new Map(); // "<arquivo do deck>|<modo>" -> { controller, mode, progress, started }
  function commandRunner(req, emit, body, W) {
    if (!body.stream || !commandsAllowed(req, W) || !W.file || isBundledTemplate(W.file)) return null;
    const cwd = path.dirname(W.file);
    return async (command) => {
      if (!body.autoRun) {
        const id = crypto.randomUUID();
        const decision = await new Promise((resolve) => {
          const timer = setTimeout(() => { approvals.delete(id); resolve("deny"); }, 10 * 60 * 1000);
          approvals.set(id, { user: W.user || "", answer: (d) => { clearTimeout(timer); approvals.delete(id); resolve(d); } });
          emit({ phase: "approve", id, command, text: "Esperando você autorizar o comando…" });
        });
        if (decision === "deny") { logCommand({ user: W.user || null, deck: W.file, cwd, language: command.language, why: command.why, code: command.code, decision: "recusado" }); return { denied: true }; }
        if (decision === "always") body.autoRun = true;
      }
      emit({ phase: "command", command, text: `Rodando: ${command.why || command.language}…` });
      const { env, mask } = await commandEnv(W);
      const t0 = Date.now();
      let result;
      try { result = await runCommand(command, { cwd, env, mask }); }
      catch (e) { logCommand({ user: W.user || null, deck: W.file, cwd, language: command.language, why: command.why, code: command.code, decision: body.autoRun ? "liberado" : "aprovado", error: e.message }, { mask }); throw e; }
      logCommand({ user: W.user || null, deck: W.file, cwd, language: command.language, why: command.why, code: command.code, decision: body.autoRun ? "liberado" : "aprovado", exit: result.exitCode ?? result.code ?? null, ms: Date.now() - t0, output: [result.stdout, result.stderr].filter(Boolean).join("\n") }, { mask });
      emit({ phase: "command-result", command, result, text: "Analisando o resultado…" });
      return result;
    };
  }
  // variáveis, segredos e token do ambiente ativo para o comando (a IA só conhece os nomes; a saída volta mascarada)
  async function commandEnv(W) {
    try {
      const e = apiEnv.env(), env = {};
      for (const [k, v] of Object.entries({ ...(W.apiVars || {}), ...(e.vars || {}) })) if (v != null && typeof v !== "object") env[`SAGA_VAR_${envName(k)}`] = String(v);
      for (const [k, v] of Object.entries(apiEnv.secretVars(e))) env[`SAGA_SECRET_${envName(k.replace(/^secret\./, ""))}`] = v;
      try { const t = await apiEnv.token(e); if (t) env.SAGA_TOKEN = String(t); } catch {}
      return { env, mask: (s) => apiEnv.maskText(e, s) };
    } catch { return { env: {}, mask: (s) => s }; }
  }

  // Motivo para NÃO executar pedidos, ou null. Vale para toda rota /api/http/* que executa algo.
  function apiBlocked(req) {
    if (opts.multiuser) return { code: 403, message: "No servidor (multiusuário) o slide API só mostra a última gravação; executar é no Studio local." };
    if (opts.host && !LOOPBACK.has(opts.host)) return { code: 403, message: "O Studio está aberto para a rede (--host): executar pedidos fica desligado." };
    const host = (() => { try { return new URL(`http://${req.headers.host || ""}`).hostname; } catch { return ""; } })();
    if (!LOOPBACK.has(host)) return { code: 403, message: "Executar pedidos só pelo endereço desta máquina (127.0.0.1)." };
    const origin = req.headers.origin;
    if (origin) { // "null" (HTML aberto do disco) também é outra página
      let oh = "";
      try { oh = new URL(origin).host; } catch {}
      if (oh !== req.headers.host) return { code: 403, message: "Pedido vindo de outra página: bloqueado." };
    }
    return null;
  }

  // Salva o deck atual no arquivo aberto — nunca por cima dos exemplos que vêm no pacote.
  // Grava o deck (src/deck-file.js): só o que mudou, preservando comentários e formatação, de forma atômica.
  // text: o YAML que a pessoa escreveu na gaveta vai para o arquivo exatamente como ela escreveu.
  // Modelo de fábrica aberto em prévia (W.preview): nada é gravado até a pessoa mudar algo. A primeira mudança (ou
  // "Usar como base") cria a cópia na biblioteca, com as imagens, e o Studio passa a gravar nela.
  function copyModelAssets(L, id, kind) {
    for (const asset of demoAssets(kind)) {
      const dest = path.join(path.dirname(L.resolveId(id)), "imagens");
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(MODEL_ASSETS_DIR, "imagens", asset), path.join(dest, asset));
    }
    // arquivos do projeto do modelo (ex.: contexto/vendas.csv da demo de novidades)
    for (const rel of demoProjectFiles(kind)) {
      const dest = path.join(path.dirname(L.resolveId(id)), ...rel.split("/"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(MODEL_ASSETS_DIR, ...rel.split("/")), dest);
    }
  }
  // Tudo o que a vitrine "Modelo pronto" oferece, por chave (model-*, exp-*, example-*): o deck, a pasta de onde a
  // prévia lê as imagens e o que copiar para a pasta da cópia quando ela nasce.
  function galleryEntry(key) {
    key = String(key || "");
    if (key.startsWith("model-")) { const kind = key.slice(6); return { spec: demoDeck(kind), dir: MODEL_ASSETS_DIR, copy: (L, id) => copyModelAssets(L, id, kind) }; }
    if (key.startsWith("exp-")) return { spec: createExperienceDeck(key.slice(4)), dir: null, copy: () => {} };
    if (key === "example-cenario") {
      const dir0 = TEMPLATE_DIRS.map((d) => path.join(d, "cenario")).find((d) => fs.existsSync(d));
      if (!dir0) throw new Error("o exemplo não veio no pacote (templates/cenario)");
      const tpl = fs.readdirSync(dir0).find((f) => f.endsWith(".yaml"));
      return { spec: YAML.parse(fs.readFileSync(path.join(dir0, tpl), "utf8")), dir: dir0,
        copy: (L, id) => fs.cpSync(path.join(dir0, "imagens"), path.join(path.dirname(L.resolveId(id)), "imagens"), { recursive: true, force: false }) };
    }
    if (key === "example-api") {
      const tpl = templateFile("ensaio-api.yaml");
      if (!tpl) throw new Error("o exemplo não veio no pacote (templates/ensaio-api.yaml)");
      return { spec: YAML.parse(fs.readFileSync(tpl, "utf8")), dir: path.dirname(tpl),
        copy: (L, id) => { const dir = path.dirname(L.resolveId(id)); for (const [name, text] of Object.entries(DEMO_FILES)) fs.writeFileSync(path.join(dir, name), text); } };
    }
    throw new Error("Modelo não encontrado.");
  }
  // editor?model=lavanda (tipo do modelo) ou a chave completa da vitrine (exp-executivo, example-api…)
  const galleryKey = (v) => /^(model|exp|example)-/.test(String(v || "")) ? String(v) : `model-${v}`;
  function materializePreview(W) {
    if (!W.preview || W.file) return null;
    const { key, topic } = W.preview;
    W.preview = null;
    const clean = Object.fromEntries(Object.entries(W.spec || {}).filter(([k]) => !k.startsWith("_")));
    const id = W.library.createDeck(topic, clean);
    galleryEntry(key).copy(W.library, id);
    W.file = W.library.resolveId(id);
    W.spec = loadSpec(W.file);
    return { id, title: W.spec.title, topic };
  }
  function persist(W, text = null) {
    if (!W.file || isBundledTemplate(W.file)) return;
    if (text == null && W.spec) ensureUids(W.spec); // decks antigos ganham uid aqui; slide novo (da pessoa ou da IA) também
    try {
      if (text != null) {
        const tmp = W.file + ".tmp-" + crypto.randomUUID();
        try { fs.writeFileSync(tmp, text, "utf8"); fs.renameSync(tmp, W.file); }
        finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
      }
      else writeDeckFile(W.file, W.spec);
    } catch (e) { console.error("[Studio] Erro ao salvar:", e.message); throw e; }
  }

  // Onde a IA grava imagens geradas: pasta "imagens" ao lado do deck (ou na pasta atual, se o deck é um exemplo).
  function imageOptions(W, spec) {
    materializePreview(W); // a IA vai gravar imagens: a prévia vira uma cópia antes
    const deckDir = W.file && !isBundledTemplate(W.file) ? path.dirname(W.file) : process.cwd();
    return { baseDir: spec._dir || deckDir, assetsDir: path.join(deckDir, "imagens") };
  }

  function withBase(W, spec) {
    if (!spec._dir && W.file) return { ...spec, _dir: path.dirname(W.file), _file: W.file };
    return spec;
  }

  // Materiais de contexto (arquivos e links) para a IA: o texto extraído fica na sessão (W),
  // o binário nunca vai para o modelo. POST /api/ai/context guarda; o chat e a geração referenciam por id.
  function keepMaterial(W, name, text, detail) {
    if (!(W.contextDocs instanceof Map)) W.contextDocs = new Map();
    const id = crypto.randomBytes(4).toString("hex");
    W.contextDocs.set(id, { name: String(name).slice(0, 120), text: String(text).slice(0, CONTEXT_STORE_CHARS), detail, at: Date.now() });
    while (W.contextDocs.size > CONTEXT_MAX_DOCS) W.contextDocs.delete(W.contextDocs.keys().next().value);
    return { id, name, chars: text.length, detail };
  }
  // Gerar com IA (editor ou biblioteca): pasta nova na biblioteca ("Gerando…"), o deck gravado nela com as imagens
  // em imagens/, e a pasta renomeada para o título. Falhou: a pasta vai para a lixeira. Minutos, estilo, anexos.
  async function generateIntoLibrary(W, topic, b, emit) {
    const L = W.library;
    const id = L.createDeck(topic, { title: "Gerando…", slides: [{ layout: "cover", title: "Gerando…" }] });
    const file = L.resolveId(id), dir = path.dirname(file);
    try {
      const prefs = loadPreferences().ia;
      const gen = await generateDeck(String(b.briefing || ""), {
        ask: prefs.perguntar !== false && !b.answer, answer: b.answer ? String(b.answer).slice(0, 500) : "",
        author: prefs.autor || "", language: prefs.idioma || "auto",
        theme: b.theme || undefined,
        style: b.style || undefined,
        slides: Number(b.slides) || undefined,
        duration: Number(b.duration) || undefined,
        direction: b.direction || undefined,
        materials: takeMaterials(W, b.materials),
        images: prefs.imagens !== false, // o briefing diz se quer imagens (e onde); Preferências podem desligar
        imageOptions: { baseDir: dir, assetsDir: path.join(dir, "imagens") },
        onEvent: emit,
        drawCheck: diagramCheck,
        reviewCheck: (deck, indices) => reviewExperience({ ...deck, _dir: dir }, indices, { snapshot: slideSnapshots }),
        // pesquisa na web quando a IA decidir que precisa (Preferências › IA pode desligar; SAGADECK_WEB=0 no banco);
        // as fontes lidas ficam em contexto/pesquisa/ do deck
        research: prefs.pesquisa === false ? false : "auto",
        researchDir: dir,
      });
      if (gen.question) { L.trashDeck(id); return { question: gen.question }; } // a IA quer saber para que serve o material
      // estilo padrão da biblioteca (Brand Kit), se a pessoa não escolheu um tema para esta
      if (!b.theme) gen.spec = L.withDefaultStyle(gen.spec, dir);
      fs.writeFileSync(file, toYaml(gen.spec), "utf8");
      const finalId = L.renameDeck(id, gen.spec.title || "Nova apresentação");
      return { id: finalId, file: L.resolveId(finalId), images: gen.images, research: gen.research };
    } catch (e) {
      L.trashDeck(id);
      throw e;
    }
  }
  // tópico do deck aberto, se ele mora na biblioteca ("" = Sem tópico)
  function topicOfOpen(W) {
    if (!W.file || isBundledTemplate(W.file)) return "";
    const rel = path.relative(W.library.root, W.file);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "";
    const parts = rel.split(/[\\/]/);
    return parts.length > 1 ? parts[0] : "";
  }
  function takeMaterials(W, ids) {
    if (!(W.contextDocs instanceof Map)) return [];
    return (Array.isArray(ids) ? ids : []).map((a) => {
      const d = typeof a === "string" ? W.contextDocs.get(a) : W.contextDocs.get(a?.id);
      return d ? { name: d.name, text: d.text, detail: d.detail } : null;
    }).filter(Boolean);
  }
  // Links colados na mensagem: o servidor lê sozinho (até 2) e conta nas ações; falha não trava o pedido.
  async function readPastedLinks(W, text, actions) {
    const docs = [];
    for (const u of pastedUrls(text)) {
      try {
        const d = await fetchUrlText(u, { allowLocal: process.env.SAGADECK_CONTEXT_ALLOW_LOCAL === "1" });
        keepMaterial(W, d.name, d.text, d.detail); // guarda para os próximos pedidos
        docs.push({ name: d.name, text: d.text.slice(0, CONTEXT_STORE_CHARS), detail: d.detail });
        actions.push(`Li o link ${u} (${d.detail}, ${d.text.length} caracteres).`);
      } catch (e) { actions.push(`Não consegui ler o link ${u}: ${e.message}`); }
    }
    return docs;
  }

  // Só a própria página usa o Studio. Ele roda na máquina da pessoa (no banco, dentro da VPN): sem isto,
  // qualquer site aberto no navegador faria fetch para 127.0.0.1 e leria a biblioteca, apagaria decks, gastaria a IA.
  // Por isso não há CORS: nenhum Access-Control-Allow-*, e pedido de outra origem para /api/* leva 403.
  const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  const hostnameOf = (h) => { try { return new URL(`http://${h}`).hostname; } catch { return ""; } };
  // Escutando só nesta máquina, o Host tem que ser desta máquina: barra o DNS rebinding
  // (malicioso.exemplo resolvendo para 127.0.0.1 tem Origin igual ao Host, mas não é a página do Studio).
  const loopbackOnly = !opts.multiuser && LOOPBACK.has(opts.host);
  function wrongHost(req) {
    if (!loopbackOnly) return false;
    const h = hostnameOf(req.headers.host || "");
    return !(LOOPBACK.has(h) || h.endsWith(".localhost"));
  }
  // Pedido feito por outra página? O navegador manda Origin em todo POST e em todo pedido de outra origem;
  // a própria página, no GET, não manda. "null" (HTML aberto do disco) também é outra página.
  function foreignOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return false;
    let oh = "";
    try { oh = new URL(origin).host.toLowerCase(); } catch { return true; }
    const own = [req.headers.host];
    // atrás do proxy (BabsDeck) o Host pode ser o do Studio (127.0.0.1:porta); o endereço do portal vem em X-Forwarded-Host
    if (opts.multiuser && req.headers["x-forwarded-host"]) own.push(String(req.headers["x-forwarded-host"]).split(",")[0].trim());
    return !own.some((h) => h && String(h).toLowerCase() === oh);
  }

  const server = http.createServer(async (req, res) => {
    // Iframe só na própria origem: a apresentação dentro do editor (#pres-frame carrega "preview").
    // Nenhum outro site embute o Studio (clickjacking); CORP same-origin: outro site não carrega nem as capas.
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (wrongHost(req) || (pathname.startsWith("/api/") && foreignOrigin(req))) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Pedido vindo de outra página: bloqueado." }));
      return;
    }

    // link de ver (só leitura): o público não tem usuário; o "ver" exige o do portal no multiusuário
    if (shares.serveView(req, res, pathname, opts.multiuser ? String(req.headers[USER_HEADER] || "").trim() : "")) return;

    const W = workspaceOf(req);
    if (!W) { // multiusuário sem o cabeçalho do proxy: ninguém autenticado
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "sessão ausente: entre pelo portal" }));
      return;
    }

    // sem CORS: o preflight responde, mas não libera nada (o navegador barra o pedido de outra origem)
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "HEAD" && (pathname === "/" || pathname === "/index.html" || pathname === "/editor" || pathname === "/biblioteca")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end();
      return;
    }

    try {
      // 1. Arquivos estáticos da pasta public e downloads
      if (pathname === "/v1.2.0.patch" || pathname === "/patch") {
        const patchPath = path.join(HERE, "..", "..", "v1.2.0.patch");
        if (fs.existsSync(patchPath)) {
          const patchContent = fs.readFileSync(patchPath);
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": 'attachment; filename="v1.2.0.patch"',
          });
          res.end(patchContent);
          return;
        }
      }

      if (pathname === "/sagadeck-v1.2.0.tar.gz" || pathname === "/tarball") {
        const tarPath = path.join(HERE, "..", "..", "sagadeck-v1.2.0.tar.gz");
        if (fs.existsSync(tarPath)) {
          const tarContent = fs.readFileSync(tarPath);
          res.writeHead(200, {
            "Content-Type": "application/gzip",
            "Content-Disposition": 'attachment; filename="sagadeck-v1.2.0.tar.gz"',
          });
          res.end(tarContent);
          return;
        }
      }

      // "/" = biblioteca; com um deck passado na linha de comando ("sagadeck studio x.yaml"), "/" é o editor dele
      const page = pathname === "/biblioteca" ? "library.html" : pathname === "/editor" || pathname === "/index.html" ? "index.html"
        : pathname === "/" ? (deckPath ? "index.html" : "library.html") : null;
      if (page) {
        const html = fs.readFileSync(path.join(PUBLIC_DIR, page), "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (["/style.css", "/library.css", "/studio-next.css"].includes(pathname)) {
        const css = fs.readFileSync(path.join(PUBLIC_DIR, pathname.slice(1)), "utf8");
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
        res.end(css);
        return;
      }
      if (pathname === "/fonts.css") { // as fontes de todos os temas (embutidas, sem Google), para o editor e as miniaturas
        const index = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, "fonts", "index.json"), "utf8"));
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "max-age=86400" });
        res.end(Object.values(index).map((f) => fs.readFileSync(path.join(RUNTIME_DIR, "fonts", f), "utf8")).join("\n"));
        return;
      }
      if (pathname === "/katex.css") {
        res.writeHead(200, {"Content-Type":"text/css; charset=utf-8"});
        res.end(fs.readFileSync(path.join(RUNTIME_DIR,"vendor/katex.css")));return;
      }
      if (pathname === "/decision-lab.js") {
        res.writeHead(200, {"Content-Type":"application/javascript"});
        res.end(fs.readFileSync(path.join(RUNTIME_DIR,"decision-lab.js"))); return;
      }
      if (["/diagram.js", "/mermaid.min.js"].includes(pathname)) {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(fs.readFileSync(path.join(RUNTIME_DIR, pathname === "/diagram.js" ? "diagram.js" : "vendor/mermaid.min.js")));
        return;
      }
      if (["/science.js", "/formula.js", "/calc.js", "/plotly.min.js"].includes(pathname)) {
        res.writeHead(200, {"Content-Type":"application/javascript; charset=utf-8"});
        res.end(fs.readFileSync(path.join(RUNTIME_DIR, pathname === "/plotly.min.js" ? "vendor/plotly.min.js" : pathname.slice(1))));
        return;
      }
      if (pathname === "/vendor/pdf.min.mjs" || pathname === "/vendor/pdf.worker.min.mjs") { // leitor de PDF do explorador (sem internet)
        const file = PDFJS_DIR && path.join(PDFJS_DIR, pathname.split("/").pop());
        if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "max-age=86400" });
        res.end(fs.readFileSync(file));
        return;
      }
      if (pathname === "/csv.js") { // o mesmo leitor de CSV do motor (src/csv.js), para o realce e a planilha
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(fs.readFileSync(path.join(path.dirname(RUNTIME_DIR), "csv.js")));
        return;
      }
      if (pathname === "/fit.js") { // o mesmo ajuste da apresentação (src/runtime/fit.js)
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(fs.readFileSync(path.join(RUNTIME_DIR, "fit.js"), "utf8"));
        return;
      }
      if (pathname === "/app.js" || pathname === "/ui-icons.js" || pathname === "/slide-form.js" || pathname === "/calc-fields.js" || pathname === "/art-preview.js" || pathname === "/library.js" || pathname === "/screenshot-editor.js" || pathname === "/visual-editor.js" || pathname === "/inspector.js" || pathname === "/explorer.js" || pathname === "/viewers.js" || pathname === "/merge-decks.js" || pathname === "/history.js" || pathname === "/review-ui.js" || pathname === "/share-ui.js") {
        const js = fs.readFileSync(path.join(PUBLIC_DIR, pathname.slice(1)), "utf8");
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(js);
        return;
      }

      // 2. Visualização Completa (Preview Standalone)
      if (pathname === "/preview") {
        let out;
        try {
          out = buildHTML(W.spec);
        } catch (e) {
          W.lastPreview = { ok: false, error: e.message, warnings: [] };
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Não consegui montar a apresentação: ${e.message}`);
          return;
        }
        // avisos de montagem (ex.: CSS/widget ao lado do YAML que não foi achado) para o Studio mostrar
        W.lastPreview = { ok: true, error: null, warnings: out.warnings.filter((w) => !/palavras \(limite/.test(w)) };
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(out.html);
        return;
      }

      if (pathname === "/api/preview-status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(W.lastPreview));
        return;
      }

      // 3. API Endpoints
      // Identidades (fontes da empresa, arquivo local ~/.sagadeck/identidades.yaml; ver src/identity.js).
      // Ler vale sempre; criar o modelo e abrir a pasta, só no Studio local (é a máquina da pessoa).
      // Preferências desta máquina (~/.sagadeck/preferencias.json): tela Preferências do Studio
      if (pathname === "/api/preferences") {
        const send = (obj) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
        if (req.method === "GET") return send({ prefs: loadPreferences(), file: preferencesFile(), schema: PREF_SCHEMA });
        if (req.method === "POST") {
          const body = await readJSON(req);
          const prefs = savePreferences(body.prefs || {});
          setFitDefaults(prefs.texto);
          return send({ prefs, file: preferencesFile() });
        }
      }
      if (pathname === "/api/identities" && req.method === "GET") {
        const { loadIdentities } = await import("../identity.js");
        const d = loadIdentities();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ file: d.file, exists: d.exists, error: d.error, identities: Object.values(d.identities).map((x) => ({ id: x.id, name: x.name, fonts: x.fonts, palette: typeof x.palette === "string" ? x.palette : x.palette ? "propria" : null })) }));
        return;
      }
      if (pathname === "/api/identities/setup" && req.method === "POST") {
        const blocked = apiBlocked(req);
        if (blocked) { res.writeHead(blocked.code, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Configurar identidades só no Studio desta máquina." })); return; }
        const { ensureIdentitiesFile } = await import("../identity.js");
        const file = ensureIdentitiesFile();
        if (process.platform === "win32") spawn("explorer.exe", [`/select,${file}`], { detached: true, stdio: "ignore" }).unref();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ file }));
        return;
      }

      // quem é esta instância (o CLI confere antes de abrir outra na mesma porta)
      if (pathname === "/api/instance" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ app: "sagadeck-studio", version: VERSION, pid: process.pid, library: libraryRoot, started: STARTED, multiuser: !!opts.multiuser }));
        return;
      }
      if (pathname === "/api/deck" && req.method === "GET") {
        if (W.spec) { ensureUids(W.spec); migrateLegacyKeys(W.spec); } // identidade dos slides e ajustes pelo conteúdo (gravados no próximo salvar)
        const rawYaml = toYaml(W.spec); // sem os campos internos (_dir, _file)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          spec: W.spec,
          yaml: rawYaml,
          file: W.file,
          preview: W.preview && !W.file ? { key: W.preview.key, kind: W.preview.key.replace(/^model-/, ""), title: W.spec?.title, topic: W.preview.topic } : null,
          themes: Object.keys(THEMES),
          // para a galeria de temas: nome curto + cores de fundo, texto e destaque
          themeMeta: Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, {
            label: String(t.label || k).split(/\s+[—–-]\s+/)[0],
            desc: String(t.label || "").split(/\s+[—–-]\s+/)[1] || "",
            paper: `#${t.colors.paper}`, ink: `#${t.colors.ink}`, accent: `#${t.colors.accent}`, pair: t.pair || null, dark: !!t.dark,
          }])),
          // paletas (só cores, valem em qualquer tema): para a galeria de paletas
          palettes: Object.fromEntries(Object.entries(PALETTES).map(([k, p]) => [k, { label: p.label, colors: [p.paper, p.ink, p.accent, p.alert, ...(p.family || [])].map((c) => `#${c}`) }])),
          layouts: Object.keys(LAYOUTS),
        }));
        return;
      }

      if (pathname === "/api/deck" && req.method === "POST") {
        const body = await readJSON(req);
        if (staleTab(body, W, res)) return;
        const before = W.spec;
        if (body.yaml) {
          try {
            const parsed = YAML.parse(body.yaml);
            if (!parsed || !Array.isArray(parsed.slides)) throw new Error('falta a lista "slides:"');
            // o YAML editado não traz os campos internos: mantém a pasta do deck (imagens, CSS, widgets)
            const keep = body.source === "browser-file" ? {} : Object.fromEntries(Object.entries(W.spec || {}).filter(([k]) => k.startsWith("_")));
            W.spec = { ...parsed, ...keep };
            W.yamlText = body.yaml;
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "YAML inválido: " + e.message }));
            return;
          }
        } else if (body.spec) {
          W.spec = body.spec;
        }
        if (before && W.spec && before !== W.spec) carryVisualEdits(before, W.spec); // texto mudou: o ajuste vai junto
        if (body.filepath) {
          W.file = path.resolve(body.filepath);
        } else if (body.source === "browser-file") {
          // Deck aberto pelo navegador (seletor/arrastar): o servidor não sabe o caminho dele.
          // Esquece o arquivo anterior — senão as edições deste deck iam parar por cima daquele.
          W.file = null;
        }
        if (body.filepath || body.source === "browser-file") W.preview = null;
        const materialized = body.saveToFile !== false ? materializePreview(W) : null;
        if (body.saveToFile !== false) persist(W, body.yaml && body.source !== "browser-file" ? W.yamlText : null);
        W.yamlText = null;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, spec: W.spec, file: W.file, materialized }));
        return;
      }

      if (pathname === "/api/open-file" && req.method === "POST") {
        const body = await readJSON(req);
        if (!body.path) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Caminho do arquivo não informado" }));
          return;
        }
        const targetPath = path.resolve(body.path);
        if (!fs.existsSync(targetPath)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Arquivo não encontrado: ${targetPath}` }));
          return;
        }
        try {
          W.spec = loadSpec(targetPath);
          W.file = targetPath;
          const rawYaml = toYaml(W.spec);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            spec: W.spec,
            yaml: rawYaml,
            file: W.file,
          }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Erro ao carregar YAML: ${e.message}` }));
        }
        return;
      }

      // YAML de um slide só (gaveta de YAML em "Slide atual")
      // "Gerar imagem agora": transforma os image_prompt de UM slide em imagens de verdade
      if (pathname === "/api/ai/slide-images" && req.method === "POST") {
        const body = await readJSON(req);
        const i = Number(body.index);
        const slide = W.spec?.slides?.[i];
        const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
        if (!slide) return send(404, { error: "slide não existe" });
        try {
          const wrapper = { ...withBase(W, W.spec), slides: [slide] };
          const r = await materializeImages(wrapper, { ...imageOptions(W, wrapper), keepFailed: true });
          persist(W);
          send(r.done.length || !r.failed.length ? 200 : 502, { ok: !!r.done.length, done: r.done.length, failed: r.failed, error: r.failed[0]?.error, spec: W.spec });
        } catch (e) {
          send(500, { error: e.message });
        }
        return;
      }

      // revisão das mudanças e estilos da pessoa (src/studio/style-routes.js)
      if (await styleRoutes({ req, res, pathname, W, persist, readJSON })) return;
      if (await shares.api({ req, res, pathname, W, readJSON })) return;
      if (pathname === "/api/aspect" && req.method === "POST") {
        const b = await readJSON(req);
        if (!parseAspect(b.aspect)) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: `Proporção "${b.aspect}" não entendida. Use 16:9, 4:3, 1:1, 9:16 ou largura:altura.` })); return; }
        W.spec = convertAspect(W.spec, String(b.aspect) === "16:9" ? undefined : b.aspect);
        if (W.spec.aspect === undefined) delete W.spec.aspect;
        persist(W);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, spec: W.spec, label: slideSize(W.spec).label }));
        return;
      }
      if (pathname === "/api/slide-yaml" && req.method === "GET") {
        const i = Number(url.searchParams.get("i"));
        const slide = W.spec?.slides?.[i];
        res.writeHead(slide ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(slide ? { yaml: YAML.stringify(slide, { indent: 2 }) } : { error: "slide não existe" }));
        return;
      }
      if (pathname === "/api/slide-yaml" && req.method === "POST") {
        const body = await readJSON(req);
        if (staleTab(body, W, res)) return;
        const i = Number(body.index);
        let slide;
        try {
          let raw = YAML.parse(body.yaml || "");
          if (Array.isArray(raw)) raw = raw[0];
          if (!raw || typeof raw !== "object") throw new Error("o slide precisa ser um objeto (ex.: layout: statement)");
          slide = normalizeSpec({ slides: [raw] }).slides[0];
          renderSlide(slide, i, W.spec); // valida: layout existe, elementos reconhecidos
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
          return;
        }
        W.spec.slides[i] = slide;
        persist(W);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, spec: W.spec, file: W.file }));
        return;
      }

      if (pathname === "/api/experiences" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ experiences: EXPERIENCES }));
        return;
      }
      if (pathname === "/api/layout-sample" && req.method === "GET") {
        const { LAYOUT_SAMPLES } = await import("./layout-samples.js");
        const name = url.searchParams.get("layout");
        const sample = Object.hasOwn(LAYOUT_SAMPLES, name) ? LAYOUT_SAMPLES[name] : null;
        res.writeHead(sample ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(sample ? { slide: sample } : { error: "Cena não encontrada" }));
        return;
      }

      // Galeria de layouts: um exemplo de cada, desenhado no tema do deck (cache por tema)
      if (pathname === "/api/layout-previews") {
        const { LAYOUT_INFO, LAYOUT_SAMPLES } = await import("./layout-samples.js");
        const theme = W.spec?.theme || "sinal";
        const identity = W.spec?.identity, palette = W.spec?.palette;
        const key = `${theme}|${palette || ""}|${identity || ""}|${W.spec?.markStyle || ""}`;
        if (!layoutPreviewCache.has(key)) {
          const spec = { theme, palette, identity, markStyle: W.spec?.markStyle, title: "", footer: false, slides: [] };
          const out = {};
          for (const [name, sample] of Object.entries(LAYOUT_SAMPLES)) {
            try { out[name] = renderSlide(sample, 0, spec).html; } catch (e) { out[name] = ""; }
          }
          layoutPreviewCache.set(key, out);
        }
        const r = renderSlide({ layout: "statement", text: "x" }, 0, { theme, palette, identity });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ info: LAYOUT_INFO, html: layoutPreviewCache.get(key), baseCSS: r.baseCSS, themeCSS: r.themeCSS }));
        return;
      }

      if (pathname === "/api/render-slide" && req.method === "POST") {
        const { slide, index, spec } = await readJSON(req);
        const deckSpec = spec || W.spec;
        const rendered = renderSlide(slide, index ?? 0, deckSpec);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(rendered));
        return;
      }

      if (pathname === "/api/icons" && req.method === "GET") {
        const q = url.searchParams.get("q") || "";
        const limit = Math.min(Number(url.searchParams.get("limit") || 80), 150);
        const icons = listIcons(q).slice(0, limit);
        const { iconSVG } = await import("../figures/icons.js");
        const results = icons.map((name) => {
          try {
            return { name, svg: iconSVG(name, { size: 32 }) };
          } catch {
            return { name, svg: "" };
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
        return;
      }

      // variedade do deck (painel Ritmo)
      if (pathname === "/api/variety" && req.method === "POST") {
        const body = await readJSON(req);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(varietyReport(body.spec || W.spec)));
        return;
      }

      if (pathname === "/api/napkin-examples" && req.method === "GET") {
        const { NAPKIN_EXAMPLES } = await import("../diagram/napkin-examples.js");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(NAPKIN_EXAMPLES));
        return;
      }

      if (pathname === "/api/napkin" && req.method === "POST") {
        const body = await readJSON(req);
        const { textToVisualSlide, textToVisualDeck } = await import("../diagram/napkin.js");
        const YAML = (await import("yaml")).default;
        const opts = { theme: body.theme, tone: body.tone, title: body.title, kicker: body.kicker, layout: body.layout };
        let result = null;
        let mode = "rules";
        let notice = "";
        if (body.mode !== "rules" && body.text && await llmAvailable()) {
          try {
            result = await textToSlide(body.text, { ...opts, images: true, imageOptions: imageOptions(W, withBase(W, W.spec)), drawCheck: diagramCheck });
            mode = "llm";
          } catch (e) {
            notice = `A IA falhou (${e.message}); usei as regras locais.`;
          }
        }
        if (!result) result = textToVisualSlide(body.text || "", opts);
        const fullDeck = textToVisualDeck(body.text || "");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          slide: result.slide,
          detectedType: result.detectedType,
          confidence: result.confidence,
          rationale: result.rationale,
          mode,
          notice,
          yaml: YAML.stringify(result.slide, { indent: 2 }),
          deckYaml: YAML.stringify(fullDeck, { indent: 2 }),
        }));
        return;
      }

      if (pathname === "/api/autofix" && req.method === "POST") {
        const { slideIndex, spec, issues } = await readJSON(req);
        const targetSpec = spec || W.spec;
        if (typeof slideIndex === "number" && targetSpec.slides[slideIndex]) {
          const resFix = autofixSlide(targetSpec.slides[slideIndex], targetSpec, issues || []);
          targetSpec.slides[slideIndex] = resFix.slide;
          W.spec = targetSpec;
          persist(W);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, slide: resFix.slide, actions: resFix.actions, spec: targetSpec }));
        } else {
          const resDeck = autofixDeck(targetSpec, issues || []);
          W.spec = resDeck.spec;
          persist(W);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ...resDeck }));
        }
        return;
      }

      if (pathname === "/api/search") {
        const query = url.searchParams.get("q") || "";
        const limit = Number(url.searchParams.get("limit") || 5);
        if (!query) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Parâmetro 'q' é obrigatório" }));
          return;
        }
        try {
          const { searchDuckDuckGo } = await import("../research/duckduckgo.js");
          const results = await searchDuckDuckGo(query, { limit });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ query, count: results.length, results }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message, query, results: [] }));
        }
        return;
      }

      // Tela de configuração da IA: é do modelrelay (vale para todos os apps). Só aparece quando ele
      // roda nesta máquina e tem a tela; no multiusuário quem configura é o admin, pelo portal.
      if (pathname === "/api/ai/setup" && req.method === "GET") {
        let setup = null;
        const base = llmConfig().url.replace(/\/v1$/, "");
        if (!opts.multiuser && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
          try {
            const r = await fetch(base + "/api/console/config", { signal: AbortSignal.timeout(1500) });
            if (r.ok) setup = base + "/";
          } catch {}
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ url: setup }));
        return;
      }

      if (pathname === "/api/ai/status" && req.method === "GET") {
        const cfg = llmConfig();
        const available = await llmAvailable({ force: url.searchParams.has("refresh") });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ available, url: cfg.url, textModel: cfg.textModel, imageModel: cfg.imageModel }));
        return;
      }

      // Materiais de contexto: a pessoa anexa arquivo (dataUrl) ou link; o servidor extrai o texto
      // e devolve um id. O texto fica na sessão; o chat e a geração mandam os ids.
      if (pathname === "/api/ai/context" && req.method === "POST") {
        const body = await readJSON(req);
        try {
          let doc;
          if (body.url) {
            doc = await fetchUrlText(String(body.url), { allowLocal: process.env.SAGADECK_CONTEXT_ALLOW_LOCAL === "1" });
          } else if (body.name && body.dataUrl) {
            const m = String(body.dataUrl).match(/^data:([^;]+);base64,([\s\S]*)$/);
            if (!m) throw new Error("Anexo inválido.");
            const fname = String(body.name).split(/[\\/]/).pop();
            doc = { ...(await extractDocText(fname, Buffer.from(m[2], "base64"))), name: fname };
          } else throw new Error("Mande { name, dataUrl } ou { url }.");
          if (!doc.text.trim()) throw new Error("Não achei texto legível no material.");
          const kept = keepMaterial(W, doc.name, doc.text, doc.detail);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ...kept, preview: doc.text.slice(0, 200) }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      if (pathname === "/api/ai/generate" && req.method === "POST") {
        const body = await readJSON(req);
        if (!String(body.briefing || "").trim()) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Descreva a apresentação (briefing)." }));
          return;
        }
        if (!(await llmAvailable({ force: true }))) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Nenhum LLM respondendo em ${llmConfig().url}. Rode "modelrelay serve" ou ajuste SAGADECK_LLM_URL.` }));
          return;
        }
        // O deck novo vai para uma pasta própria na biblioteca (regra do CLAUDE.md), no tópico do deck aberto
        await respond(res, body.stream, async (emit) => {
          const r = await generateIntoLibrary(W, topicOfOpen(W), body, emit);
          if (r.question) return { ok: true, question: r.question }; // a IA perguntou para que serve o material
          W.file = r.file;
          W.spec = loadSpec(r.file);
          return { ok: true, spec: W.spec, file: W.file, id: r.id, images: r.images, research: r.research };
        });
        return;
      }

      // Projeto (a pasta da apresentação, como no VS Code): árvore, arquivos, planilhas e sugestões de gráfico
      if (pathname.startsWith("/api/project/")) {
        const done = (obj = {}, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(code === 200 ? { ok: true, ...obj } : obj)); };
        try {
          const P = W.file && !isBundledTemplate(W.file) ? Project.projectOf(W.file) : null;
          if (!P) return done({ error: W.preview ? "Modelo em prévia: a pasta do projeto nasce na primeira mudança." : "Esta apresentação não tem uma pasta só dela (abra pela biblioteca)." }, 409);
          if (pathname === "/api/project/tree" && req.method === "GET") return done(Project.tree(P));
          if (pathname === "/api/project/file" && (req.method === "GET" || req.method === "HEAD")) {
            const abs = Project.resolveIn(P, url.searchParams.get("path"));
            if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return done({ error: "Arquivo não existe." }, 404);
            res.writeHead(200, { "Content-Type": mimeOf(abs) || "application/octet-stream", "Cache-Control": "no-store" });
            res.end(req.method === "HEAD" ? undefined : fs.readFileSync(abs));
            return;
          }
          if (pathname === "/api/project/sheet" && req.method === "GET") {
            const rel = url.searchParams.get("path");
            const { sheets, editable, delimiter } = await Project.readSheet(Project.resolveIn(P, rel));
            const all = url.searchParams.get("all") === "1";
            return done({ editable: !!editable, delimiter, sheets: sheets.map((sh) => { const info = Project.inferColumns(sh.rows); return { name: sh.name, rows: all ? sh.rows.slice(0, 20000) : sh.rows.slice(0, 1000), total: sh.rows.length, columns: info.columns, hasHeader: info.hasHeader }; }) });
          }
          if (pathname === "/api/project/docx" && req.method === "GET") {
            const abs = Project.resolveIn(P, url.searchParams.get("path"));
            if (!/\.docx$/i.test(abs) || !fs.existsSync(abs)) return done({ error: "Arquivo .docx não existe." }, 404);
            return done({ html: await docxToHtml(fs.readFileSync(abs)) });
          }
          if (req.method !== "POST") return done({ error: "método não suportado" }, 405);
          const b = await readJSON(req);
          switch (pathname) {
            case "/api/project/write": return done(Project.writeText(P, b.path, b.text));
            case "/api/project/sheet-write": return done(Project.writeSheet(P, b.path, b.rows));
            case "/api/project/create": return done(Project.createFile(P, b.dir || "", b.name, b.text || ""));
            case "/api/project/mkdir": return done(Project.mkdir(P, b.dir || "", b.name));
            case "/api/project/rename": return done(Project.rename(P, b.path, b.name));
            case "/api/project/move": return done(Project.move(P, b.path, b.dir || ""));
            case "/api/project/delete": return done(Project.remove(P, b.path));
            case "/api/project/restore": return done(Project.restore(P, b.path));
            case "/api/project/upload": {
              const m = String(b.dataUrl || "").match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/);
              if (!m) throw new Error("Arquivo inválido.");
              const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
              return done(Project.upload(P, b.dir ?? Project.CONTEXT, b.name, buf));
            }
            case "/api/project/chart-suggestions": {
              const { sheets } = await Project.readSheet(Project.resolveIn(P, b.path));
              const sh = sheets.find((x) => x.name === b.sheet) || sheets[0];
              const info = Project.inferColumns(sh.rows);
              const where = { file: b.path, ...(sheets.length > 1 ? { sheet: sh.name } : {}) };
              let list = Project.suggestCharts(info, where), ai = null;
              if (b.ai) {
                // a IA classifica as colunas e escolhe os gráficos que respondem a perguntas de verdade, com título e eixos
                if (!(await llmAvailable({ force: true }))) throw new Error(`A IA está desligada (nenhum LLM em ${llmConfig().url}).`);
                const r = await llmChat([
                  { role: "system", content: `Você é analista de dados e monta gráficos para slides. Recebe as colunas de uma planilha (nome, tipo visto pelos valores, exemplos e faixa). Corrija o tipo quando o nome mostrar outra coisa (ex.: "ano" é tempo; "código" é categoria, não número) e proponha de 2 a 4 gráficos que respondam a perguntas úteis. Tipos: line (tendência no tempo), bar (comparar categorias, ordenado), column (poucas categorias ou várias séries lado a lado), donut (partes de um todo, até 6), scatter (relação entre dois números). Título: a conclusão ou a pergunta, curto, em português. Eixos: nomes claros com unidade quando der.
Responda só com JSON: {"colunas": [{"nome": "…", "tipo": "tempo|categoria|numero|porcentagem|texto"}], "graficos": [{"tipo": "line|bar|column|donut|scatter", "x": "coluna", "y": ["coluna"], "titulo": "…", "eixoX": "…", "eixoY": "…", "porque": "…"}]}` },
                  { role: "user", content: `Planilha "${b.path}"${sh.name ? `, aba "${sh.name}"` : ""} (${info.rows.length} linhas):\n${Project.columnsSummary(info)}` },
                ], { temperature: 0.2 });
                const j = JSON.parse(String(r.text || "").match(/\{[\s\S]*\}/)?.[0] || "{}");
                ai = { columns: Array.isArray(j.colunas) ? j.colunas : [] };
                const made = (Array.isArray(j.graficos) ? j.graficos : []).slice(0, 4).map((g, i) => {
                  try { const slide = Project.buildChart(info, { type: g.tipo, x: g.x, ys: g.y, title: g.titulo, xLabel: g.eixoX, yLabel: g.eixoY }, where); return { id: `ia-${i + 1}`, title: slide.title, why: String(g.porque || ""), slide, ai: true }; }
                  catch { return null; }
                }).filter(Boolean);
                if (made.length) list = [...made, ...list.filter((x) => !made.some((m) => m.slide.chart?.chart === x.slide.chart?.chart && m.slide.layout === x.slide.layout))];
              }
              // prévia de cada sugestão: o slide desenhado com o tema do deck
              const deck = withBase(W, W.spec);
              const previews = list.slice(0, 6).map((x) => { try { return { ...x, html: renderSlide(x.slide, 0, deck).html }; } catch (e) { return { ...x, error: e.message }; } });
              return done({ suggestions: previews, columns: info.columns, ai });
            }
            case "/api/project/refresh-chart": {
              // gráfico que veio de planilha (from:): relê o arquivo e troca os dados, mantendo o resto do slide
              const i = Number(b.index), slide = W.spec.slides[i];
              if (!slide?.from?.file) throw new Error("Este slide não veio de uma planilha.");
              const { sheets } = await Project.readSheet(Project.resolveIn(P, slide.from.file));
              const sh = sheets.find((x) => x.name === slide.from.sheet) || sheets[0];
              const [x, ...ys] = slide.from.columns || [];
              const type = slide.layout === "science" ? "scatter" : slide.from.type || slide.chart?.chart;
              const fresh = Project.buildChart(Project.inferColumns(sh.rows), { type, x, ys, title: slide.title, xLabel: slide.chart?.xLabel, yLabel: slide.chart?.yLabel }, { file: slide.from.file, sheet: slide.from.sheet });
              const next = slide.layout === "science" ? { ...slide, plot: { ...slide.plot, points: fresh.plot.points, x: fresh.plot.x } } : { ...slide, chart: { ...slide.chart, ...fresh.chart } };
              if (next.chart?.series) { delete next.chart.data; delete next.chart.parts; } else if (next.chart?.data) { delete next.chart.labels; delete next.chart.series; }
              W.spec.slides[i] = next;
              persist(W);
              return done({ slide: next });
            }
          }
          return done({ error: "rota do projeto desconhecida" }, 404);
        } catch (e) {
          return done({ error: e.message }, 400);
        }
      }

      // Conversa do chat: uma por apresentação, num arquivo ao lado do deck (<deck>.conversa.json). Deck sem arquivo
      // (aberto pelo navegador, exemplo embutido): só na memória desta sessão.
      if (pathname === "/api/chat/history") {
        const P = W.file && !isBundledTemplate(W.file) ? Project.projectOf(W.file) : null;
        const file = P ? Project.conversationFile(P) : W.file && !isBundledTemplate(W.file) ? W.file.replace(/\.ya?ml$/i, ".conversa.json") : null;
        if (req.method === "GET") {
          let history = W.chatHistory || [];
          if (file) try { history = JSON.parse(fs.readFileSync(file, "utf8")).history || []; } catch { history = []; }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ history }));
          return;
        }
        if (req.method === "POST") {
          const body = await readJSON(req);
          const history = (Array.isArray(body.history) ? body.history : []).filter((m) => m && typeof m.text === "string")
            .slice(-400).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text.slice(0, 8000), ...(m.talk ? { talk: true } : {}) }));
          W.chatHistory = history;
          if (file) try { const tmp = `${file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify({ history }, null, 1)); fs.renameSync(tmp, file); } catch (e) { console.error("[Studio] conversa:", e.message); }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
      }

      // A pessoa responde a um pedido de comando da IA (ver commandRunner): run | always | deny
      if (pathname === "/api/ai/approve" && req.method === "POST") {
        const body = await readJSON(req);
        const allowed = commandsAllowed(req, W);
        // só quem fez o pedido responde (no servidor, outra pessoa não aprova o comando de ninguém)
        const pending = allowed && approvals.get(String(body.id || ""));
        const mine = pending && pending.user === (W.user || "");
        res.writeHead(!allowed ? 403 : mine ? 200 : 404, { "Content-Type": "application/json" });
        if (mine) pending.answer(["run", "always"].includes(body.decision) ? body.decision : "deny");
        res.end(JSON.stringify(!allowed ? { error: "Comandos não estão liberados para você aqui." } : { ok: !!mine }));
        return;
      }

      // melhorar / recriar a apresentação importada (src/ai/transform.js), a pedido do chat. A tarefa segue no servidor
      // mesmo se o navegador fechar (a página reaberta acompanha por /api/ai/transform/status); pedir de novo retoma.
      const transformLimits = () => ({ calls: Number(process.env.SAGADECK_TRANSFORM_CALLS) || 0, tokens: Number(process.env.SAGADECK_TRANSFORM_TOKENS) || 0, minutes: Number(process.env.SAGADECK_TRANSFORM_MINUTES) || 0 });
      async function runTransform(W, spec, result, emit, request, visualReferences = []) {
        if (!W.file || isBundledTemplate(W.file)) return { ...result, reply: "Para transformar, a apresentação precisa estar salva na biblioteca.", spec, talk: true };
        // o deck da tarefa fica guardado: a pessoa pode abrir outra apresentação durante os minutos de trabalho, e o
        // resultado tem de ir para ESTE arquivo (W.file passa a ser o outro)
        const file = W.file;
        const dir = path.dirname(file);
        const { mode, pedido } = result.transform;
        const key = `${file}|${mode}`;
        if (transforms.has(key)) return { ...result, reply: `Já estou ${mode === "melhorar" ? "melhorando" : "recriando"} esta apresentação; o andamento aparece aqui no chat.`, spec, talk: true };
        const job = { controller: new AbortController(), mode, progress: null, started: Date.now() };
        transforms.set(key, job);
        const tell = (ev) => { job.progress = ev; try { emit(ev); } catch {} };
        // retomar o melhorar: a fonte é o original importado (o deck pode já ter a parte pronta aplicada)
        const origFile = path.join(dir, "original", "original.yaml");
        let source = spec;
        const saved = jobStatus(dir, mode);
        if (mode === "melhorar" && saved && saved.status !== "concluido" && fs.existsSync(origFile)) {
          try { const o = YAML.parse(fs.readFileSync(origFile, "utf8")); if (sourceHash(o) === saved.srcHash) source = { ...o, _dir: dir }; } catch {}
        }
        tell({ phase: "transform", text: mode === "melhorar" ? "Vou melhorar a apresentação em etapas…" : "Vou recriar a apresentação em etapas…", mode });
        let t;
        try { t = await transformDeck({ spec: source, dir, mode, request: request || pedido, visualReferences, onProgress: (ev) => tell({ ...ev, mode }), signal: job.controller.signal, limits: transformLimits() }); }
        catch (e) {
          if (e.kind) return { ...result, reply: `Parei antes de terminar o plano (${e.message}). Peça de novo para continuar de onde parou.`, spec, talk: true };
          console.error("[Studio] transformação:", e.message);
          return { ...result, reply: `A transformação parou por um erro (${e.message}). Nada mudou na apresentação; o que ficou pronto está guardado e pedir de novo continua de onde parou.`, spec, talk: true };
        } finally { transforms.delete(key); }
        const r = t.report;
        if (r.status === "parcial" && job.controller.signal.aborted) {
          return { ...result, reply: `Parei a pedido. O que já estava pronto (${jobStatus(dir, mode)?.feitos || 0} de ${t.plan.slides.length} itens) ficou guardado: peça de novo para continuar de onde parou.`, spec, talk: true, transformReport: r };
        }
        const count = (k) => t.plan.slides.filter((it) => it.acao === k).length;
        const cost = Object.entries(r.usage).map(([m, u]) => `${m}: ${u.calls} chamada(s), ${Math.round(u.in / 1000)} mil tokens de entrada e ${Math.round(u.out / 1000)} mil de saída`).join("; ");
        const STATUS = { concluido: "Concluído.", revisar: "Concluído, com pontos para você revisar.", parcial: `Parcial (${r.parou}): o que não chegou a ser feito ficou como no original; peça de novo para continuar de onde parou.` };
        const lines = [
          `${STATUS[r.status]}${r.retomada ? " (retomei de onde tinha parado)" : ""}`,
          `${t.spec.slides.length} slides a partir dos ${(source.slides || []).filter((s) => s.original).length} do original (${count("manter")} mantidos, ${count("juntar")} juntados, ${count("escrever")} reescritos, ${count("novo")} novos) em ${Math.round(r.seconds / 60)} min.`,
          ...(r.alertas.length ? [`Possíveis erros no original (para você conferir): ${r.alertas.join(" · ")}`] : []),
          ...(r.pendentes.length ? [`${r.pendentes.length} proposta(s) pendente(s): o original ficou ao lado, porque faltava algo dele (${r.pendentes.join(" · ")})`] : []),
          ...(r.revisar.length ? [`${r.revisar.length} ponto(s) de desenho para conferir: ${r.revisar.join(" · ")}`] : []),
          ...(r.problemas.length ? [`Problemas: ${r.problemas.join(" · ")}`] : []),
          `Onde foi parar cada trecho do original: ${r.cobertura.arquivo} (${r.cobertura.localizados} de ${r.cobertura.trechos} trechos encontrados como estavam; os outros foram reescritos).`,
          `Modelos: ${cost}.`,
        ];
        if (mode === "melhorar") {
          if (!fs.existsSync(origFile)) { fs.mkdirSync(path.dirname(origFile), { recursive: true }); fs.writeFileSync(origFile, YAML.stringify(spec, { lineWidth: 0 })); }
          // o estilo do original pode virar um estilo salvo (Brand Kit): a resposta oferece o botão
          const offerStyle = { name: String(spec.import?.from || spec.title || "Estilo").replace(/\.[a-z]+$/i, "").slice(0, 80) };
          if (W.file === file) { W.spec = { ...t.spec, _dir: dir }; persist(W); }
          else { writeDeckFile(file, t.spec); return { ...result, reply: `Pronto: "${W.library.idOf(file)}" foi melhorada (você está em outra apresentação agora). Cada slide mudado está marcado para validar.\n${lines.join("\n")}`, spec: W.spec, talk: true, transformReport: r }; }
          return { ...result, reply: `Pronto. Cada slide mudado está marcado (Revisar › Mudanças) para você validar.\n${lines.join("\n")}`, spec: W.spec, actions: [...(result.actions || [])], transformReport: r, offerStyle };
        }
        // recriar: apresentação nova no mesmo tópico, com as imagens que ela usa. A retomada grava na MESMA
        // apresentação nova (não cria outra a cada pedaço).
        const side = path.join(dir, ".sagadeck", "transform", "recriar-deck.json");
        let prev = null;
        try { prev = JSON.parse(fs.readFileSync(side, "utf8")); } catch {}
        const id = W.library.idOf(file);
        const topic = id.split("/").length === 3 ? id.split("/")[0] : "";
        const title = t.spec.title || spec.title || "Recriada";
        let newId = null, newFile = null;
        if (prev?.srcHash === sourceHash(spec)) { try { const f = W.library.resolveId(prev.id); if (fs.existsSync(f)) { newId = prev.id; newFile = f; } } catch {} }
        if (newFile) writeDeckFile(newFile, { ...t.spec, title });
        else { newId = W.library.createDeck(topic, { ...t.spec, title }); newFile = W.library.resolveId(newId); }
        if (r.status === "parcial") fs.writeFileSync(side, JSON.stringify({ srcHash: sourceHash(spec), id: newId }));
        else fs.rmSync(side, { force: true });
        const newDir = path.dirname(newFile);
        const used = new Set();
        const walk = (v, k) => { if (k === "image" && typeof v === "string") used.add(v); else if (typeof v === "string" && k === "drawing") for (const m of v.matchAll(/href="media:([^"]+)"/g)) used.add(m[1]); else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
        walk(t.spec);
        for (const rel of [...used, r.cobertura.arquivo, r.cobertura.arquivo.replace(/\.md$/, ".json")]) {
          const src = path.resolve(dir, rel);
          if (!src.startsWith(dir) || !fs.existsSync(src)) continue;
          const dst = path.join(newDir, ...rel.split("/"));
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
        }
        return { ...result, reply: `Pronto: ${prev && newId === prev.id ? "atualizei" : "criei"} "${title}" na biblioteca, do zero.\n${lines.join("\n")}`, spec, talk: true, createdDeck: { id: newId, title }, transformReport: r };
      }
      if (pathname === "/api/ai/transform/status" && req.method === "GET") {
        const dir = W.file && !isBundledTemplate(W.file) ? path.dirname(W.file) : null;
        const running = ["melhorar", "recriar"].map((mode) => transforms.get(`${W.file}|${mode}`) && { mode, progress: transforms.get(`${W.file}|${mode}`).progress, started: transforms.get(`${W.file}|${mode}`).started }).filter(Boolean);
        const jobs = dir ? ["melhorar", "recriar"].map((mode) => jobStatus(dir, mode)).filter(Boolean).map(({ srcHash, ...j }) => j) : [];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ running, jobs }));
        return;
      }
      if (pathname === "/api/ai/transform/cancel" && req.method === "POST") {
        const body = await readJSON(req);
        let n = 0;
        for (const mode of ["melhorar", "recriar"]) {
          const job = transforms.get(`${W.file}|${mode}`);
          if (job && (!body.mode || body.mode === mode)) { job.controller.abort(); n++; }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, stopped: n }));
        return;
      }
      if (pathname === "/api/ai/chat" && req.method === "POST") {
        const body = await readJSON(req);
        if (staleTab(body, W, res)) return;
        const prompt = body.message || "";
        const spec = body.spec || W.spec;
        const issues = body.issues || [];
        // a IA vê (e testa) os slides api no ambiente atual, que pode ser o embutido "ensaio"
        if (!apiBlocked(req) && (spec.slides || []).some((sl) => sl && sl.layout === "api")) await ensureEnsaio();

        await respond(res, body.stream, async (emit) => {
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
            const visuals = await lookAt(withBase(W, spec), target, prompt, emit);
            // anexos: imagens vão como visão; documentos (id do /api/ai/context) vão como texto
            const materials = takeMaterials(W, (Array.isArray(body.attachments) ? body.attachments : [])
              .filter((a) => a && typeof a === "object" && a.type === "doc").map((a) => a.id));
            for (const [i, url] of (Array.isArray(body.attachments) ? body.attachments : []).entries()) {
              if (typeof url === "string" && url.startsWith("data:image/")) visuals.push({ label: `imagem colada pelo usuário ${i + 1}`, dataUrl: url });
            }
            // arquivos do projeto (contexto/): material para a IA, junto com os anexos da mensagem
            const P = W.file && !isBundledTemplate(W.file) ? Project.projectOf(W.file) : null;
            if (P) for (const doc of await Project.contextMaterials(P)) if (!materials.some((m) => m.name === doc.name || m.name === doc.name.split("/").pop())) materials.push(doc);
            // links colados na mensagem: o servidor lê sozinho e conta nas ações
            const linkActions = [];
            for (const doc of await readPastedLinks(W, prompt, linkActions)) materials.push(doc);
            result = await editDeck({
              spec: withBase(W, spec),
              instruction: prompt,
              targetSlide: target,
              issues,
              images: true, // a IA decide (regra no prompt: só quando pedirem ou aceitarem)
              imageOptions: imageOptions(W, withBase(W, spec)),
              history,
              onProgress: emit,
              visuals,
              materials,
              renderNotes: Array.isArray(body.renderNotes) ? body.renderNotes.slice(0, 8) : [],
              apiContext: apiContextFor(req, W),
              drawCheck: diagramCheck,
              runCommand: commandRunner(req, emit, body, W),
              reviewCheck: (deck, indices) => reviewExperience(deck, indices, { snapshot: slideSnapshots }),
              styles: W.file && !isBundledTemplate(W.file) ? { list: W.library.listStyles(), current: W.spec?.style?.name || null } : null,
            });
            if (linkActions.length) result.actions = [...linkActions, ...(result.actions || [])];
            // a IA decidiu transformar a apresentação inteira (transform:): o trabalho em etapas, com o andamento aqui
            if (result.transform) return await runTransform(W, withBase(W, spec), result, emit, prompt, visuals.filter(v => v.label.startsWith("imagem colada pelo usuário")));
            // a IA decidiu mexer no estilo (estilo:): aplicar, salvar, tirar ou padrão das novas
            if (result.style) return styleAction({ W, spec: withBase(W, spec), result, persist, isBundledTemplate });
            // Slides api: a IA pediu para testar (test: [n]) → o Studio executa, devolve o relatório e ela
            // corrige, até 3 rodadas. Quem decide testar e o que corrigir é a IA; aqui só executa.
            const convo = [...history, { role: "user", text: prompt }]
            for (let round = 1; result.test?.length && round <= 3; round++) {
              if (apiBlocked(req)) { result.actions.push("Testes de slides api só no Studio local."); break; }
              const reports = [];
              for (const i of result.test) {
                const slide = result.spec.slides[i];
                emit({ phase: "test", text: `Testando o slide ${i + 1} (${apiEnv.currentName() || "sem ambiente"})…` });
                const r = await apiEnv.runSlide(slide, { vars: W.apiVars || {}, deckDir: W.file ? path.dirname(W.file) : null });
                if (r.saved) W.apiVars = { ...(W.apiVars || {}), ...r.saved };
                if (r.record) {
                  const key = globalThis.SagadeckApiCore.key(slide);
                  if (W.file && !isBundledTemplate(W.file)) writeRecording(W.file, key, r.record);
                  else (W.apiRecordings = W.apiRecordings || {})[key] = { ...r.record, at: new Date().toISOString() };
                }
                reports.push({ slide: i + 1, ...r.report });
                result.actions.push(`Teste do slide ${i + 1}: ${r.report.ok ? "funcionou" : "falhou, " + String(r.report.erro || (r.report.status ? `HTTP ${r.report.status}` : "falhou")).slice(0, 140)}`);
              }
              convo.push({ role: "assistant", text: result.reply });
              const instruction = `Resultado do teste (rodada ${round} de 3), executado no ambiente ${apiEnv.currentName()}:\n\`\`\`json\n${JSON.stringify(reports, null, 2).slice(0, 12000)}\n\`\`\`\nSe algo falhou ou tem "NÃO EXISTE", corrija os slides com base na resposta real e peça test de novo. Se tudo funcionou, confirme em uma frase, sem yaml.`;
              emit({ phase: "test", text: reports.every((x) => x.ok) ? "Os testes passaram; conferindo…" : "Corrigindo com base no resultado…" });
              const next = await editDeck({
                spec: withBase(W, result.spec), instruction, targetSlide: target, images: false,
                imageOptions: imageOptions(W, withBase(W, result.spec)), history: convo, onProgress: emit, apiContext: apiContextFor(req, W),
                drawCheck: diagramCheck, runCommand: commandRunner(req, emit, body, W),
              });
              convo.push({ role: "user", text: instruction });
              result = { ...next, actions: [...result.actions, ...(next.actions || [])], spec: next.spec };
            }
            result.mode = "llm";
          } catch (e) {
            // Falhou no meio: não "chuta" com as regras (poderiam fazer outra coisa); deck fica como estava.
            console.error("[Studio] IA falhou:", e.message);
            return { reply: `A IA falhou e não mudei nada: ${e.message}`, spec, actions: [], targetSlide: body.targetSlide, mode: "error" };
          }
          // o que a pessoa salvou enquanto a IA pensava não some: junção a três (base = o que foi para a IA)
          const merged = globalThis.SagadeckMerge.mergeDecks(spec, W.spec || spec, result.spec);
          W.spec = merged.deck;
          carryVisualEdits(spec, W.spec); // a IA mudou o texto de um objeto ajustado: o ajuste acompanha
          persist(W);
          return { ...result, spec: W.spec, conflicts: merged.conflicts, kept: merged.kept };
        });
        return;
      }

      // ── Biblioteca (tópicos e apresentações da área de trabalho) ──
      // ---------- slide "api": executa pedidos HTTP (ver src/api-client.js) ----------
      // Só no modo local, só pelo endereço desta máquina e só da própria página: nenhum outro site
      // (nem outro computador da rede) usa a sua VPN e o seu token por aqui.
      // slide API: ambientes, variáveis, envio, tempo real, gravação (src/studio/api-routes.js)
      if (pathname.startsWith("/api/http/")) return apiRoutes({ req, res, pathname, url, W, apiEnv, rtSessions, apiBlocked, ensureEnsaio, readJSON, isBundledTemplate });

      if (pathname.startsWith("/api/library")) {
        const L = W.library;
        const ok = (obj = {}) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, ...obj })); };
        const fail = (e, code = 400) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || String(e) })); };
        try {
          if (pathname === "/api/library" && req.method === "GET") {
            const openId = W.file && W.file.startsWith(L.root + path.sep) ? L.idOf(W.file) : null;
            return ok({ ...L.list(), user: W.user, multiuser: !!opts.multiuser, open: openId });
          }
          if (pathname === "/api/library/gallery-cover" && req.method === "GET") {
            const key = galleryKey(url.searchParams.get("key")), entry = galleryEntry(key);
            const spec = entry.dir ? { ...entry.spec, _dir: entry.dir } : entry.spec;
            const cacheDir = path.join(L.root, ".cache", "vitrine");
            const cached = path.join(cacheDir, `${crypto.createHash("sha1").update(`${key}|${JSON.stringify(entry.spec)}`).digest("hex")}.jpg`);
            if (!fs.existsSync(cached)) {
              const [shot] = await slideSnapshots(spec, 0, { mode: "final", width: 480 });
              fs.mkdirSync(cacheDir, { recursive: true });
              fs.writeFileSync(cached, Buffer.from(shot.dataUrl.split(",")[1], "base64"));
            }
            res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" });
            res.end(fs.readFileSync(cached));
            return;
          }
          if (pathname === "/api/library/cover" && req.method === "GET") {
            const file = L.resolveId(url.searchParams.get("id"));
            const st = fs.statSync(file);
            const cacheDir = path.join(L.root, ".cache", "capas");
            const cached = path.join(cacheDir, `${crypto.createHash("sha1").update(`${L.idOf(file)}|${st.mtimeMs}`).digest("hex")}.jpg`);
            if (!fs.existsSync(cached)) {
              const spec = loadSpec(file);
              const [shot] = await slideSnapshots(spec, 0, { mode: "final", width: 480 });
              fs.mkdirSync(cacheDir, { recursive: true });
              fs.writeFileSync(cached, Buffer.from(shot.dataUrl.split(",")[1], "base64"));
            }
            res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000" });
            res.end(fs.readFileSync(cached));
            return;
          }
          if (pathname === "/api/library/download" && req.method === "GET") {
            const file = L.resolveId(url.searchParams.get("id"));
            const kind = url.searchParams.get("kind") || "sagadeck";
            if (!["sagadeck", "pptx", "pdf", "roteiro", "tudo", "estudo", "estudo-html"].includes(kind)) throw new Error("formato inválido");
            await sendExport(res, kind, loadSpec(file), path.basename(file).replace(/\.ya?ml$/i, ""), { notes: url.searchParams.get("notas") !== "0" });
            return;
          }
          if (pathname === "/api/library/import" && req.method === "POST") {
            const name = url.searchParams.get("name") || "Importada";
            // PowerPoint: importação fiel (src/import); .sagadeck/.zip: pacote do sagadeck
            if (/\.pptx$/i.test(name)) { const r = await L.importOffice(await readBody(req), url.searchParams.get("topic") || "", name); return ok({ id: r.id, slides: r.slides, snapshots: r.snapshots, snapBy: r.snapBy }); }
            const id = await L.importPackage(await readBody(req), url.searchParams.get("topic") || "", name);
            return ok({ id });
          }
          if (req.method !== "POST") return fail(new Error("método não suportado"), 405);
          const b = await readJSON(req);
          switch (pathname) {
            case "/api/library/experience": {
              const spec = createExperienceDeck(b.experience, { title: b.title });
              buildHTML(spec); // Valida antes de criar o arquivo na biblioteca.
              return ok({ id: L.createDeck(b.topic || "", spec) });
            }
            case "/api/library/topics": return ok({ id: L.createTopic(b.name, b.color) });
            case "/api/library/topics/update": return ok({ id: L.updateTopic(b.id, b) });
            case "/api/library/topics/delete": L.deleteTopic(b.id); return ok();
            case "/api/library/decks": {
              // nova: em branco (uma capa) — "com IA" usa /api/library/decks/ai
              const title = String(b.title || "Nova apresentação").trim();
              const id = L.createDeck(b.topic || "", { title, theme: b.theme || "bauhaus", duration: 10,
                slides: [{ layout: "cover", title, subtitle: "Subtítulo", author: "" }] });
              // estilo padrão da biblioteca (Brand Kit): sem tema escolhido, a nova já nasce nele
              if (!b.theme && L.defaultStyle()) { const f = L.resolveId(id); writeDeckFile(f, L.withDefaultStyle(YAML.parse(fs.readFileSync(f, "utf8")), path.dirname(f))); }
              return ok({ id });
            }
            case "/api/library/decks/model": {
              // modelos de fábrica (src/studio/demo-decks.js): viram uma apresentação nova na biblioteca
              const id = L.createDeck(b.topic || "Modelos", demoDeck(b.kind));
              copyModelAssets(L, id, b.kind);
              return ok({ id });
            }
            case "/api/library/decks/model-preview": {
              // abre o item da vitrine sem criar arquivo; a cópia só nasce na primeira mudança
              const key = galleryKey(b.key || b.kind), entry = galleryEntry(key);
              W.spec = entry.dir ? { ...entry.spec, _dir: entry.dir } : entry.spec;
              W.file = null;
              W.preview = { key, topic: String(b.topic ?? "Modelos") }; // "" = sem tópico
              W.chatHistory = [];
              return ok({ spec: W.spec, preview: { key, title: W.spec.title, topic: W.preview.topic } });
            }
            case "/api/library/decks/model-use": {
              // "Usar como base": cria a cópia agora, mesmo sem mudança
              const made = materializePreview(W);
              if (!made) throw new Error("Não há um modelo em prévia aberto.");
              return ok(made);
            }
            case "/api/library/decks/example-cenario": {
              // demonstração do Texto no cenário: o YAML e as imagens de exemplo (fundo e recorte transparente)
              const dir0 = TEMPLATE_DIRS.map((d) => path.join(d, "cenario")).find((d) => fs.existsSync(d));
              if (!dir0) throw new Error("o exemplo não veio no pacote (templates/cenario)");
              const tpl = fs.readdirSync(dir0).find((f) => f.endsWith(".yaml"));
              const id = L.createDeck(b.topic || "", YAML.parse(fs.readFileSync(path.join(dir0, tpl), "utf8")));
              fs.cpSync(path.join(dir0, "imagens"), path.join(path.dirname(L.resolveId(id)), "imagens"), { recursive: true, force: false });
              return ok({ id });
            }
            case "/api/library/decks/example": {
              // exemplo de slides api (aula de APIs de IA): roda no ambiente embutido "ensaio", sem configurar nada
              const tpl = templateFile("ensaio-api.yaml");
              if (!tpl) throw new Error("o exemplo não veio no pacote (templates/ensaio-api.yaml)");
              const id = L.createDeck(b.topic || "", YAML.parse(fs.readFileSync(tpl, "utf8")));
              const dir = path.dirname(L.resolveId(id));
              for (const [name, text] of Object.entries(DEMO_FILES)) fs.writeFileSync(path.join(dir, name), text);
              return ok({ id });
            }
            case "/api/library/decks/move": return ok({ id: L.moveDeck(b.id, b.topic || "") });
            case "/api/library/decks/rename": {
              const id = L.renameDeck(b.id, String(b.title || "").trim() || "Sem título");
              if (W.file === L.resolveId(b.id)) { W.file = L.resolveId(id); W.spec = loadSpec(W.file); }
              return ok({ id });
            }
            case "/api/library/decks/duplicate": return ok({ id: L.duplicateDeck(b.id) });
            case "/api/library/decks/trash": return ok({ slot: L.trashDeck(b.id) });
            case "/api/library/decks/restore": return ok({ id: L.restoreDeck(b.slot) });
            case "/api/library/decks/purge": L.purgeDeck(b.slot); return ok();
            case "/api/library/trash/empty": return ok({ purged: L.emptyTrash() });
            case "/api/library/open": {
              W.preview = null;
              const file = L.resolveId(b.id);
              W.spec = loadSpec(file);
              W.file = file;
              return ok({ spec: W.spec, file: W.file, id: b.id });
            }
            case "/api/library/decks/ai": {
              // gera com IA direto numa pasta nova da biblioteca (as imagens ficam dentro dela)
              if (!(await llmAvailable({ force: true }))) return fail(new Error(`Nenhum LLM respondendo em ${llmConfig().url}.`), 503);
              await respond(res, b.stream, async (emit) => {
                const r = await generateIntoLibrary(W, b.topic || "", b, emit);
                if (r.question) return { ok: true, question: r.question }; // o Studio mostra a pergunta e gera de novo com a resposta
                return { ok: true, id: r.id, images: r.images, research: r.research };
              });
              return;
            }
          }
          return fail(new Error("rota da biblioteca desconhecida"), 404);
        } catch (e) {
          return fail(e);
        }
      }

      // Baixar o deck aberto: .sagadeck (YAML + imagens, CSS, widgets), PowerPoint, PDF ou roteiro
      const exportKind = (pathname.match(/^\/api\/export\/(sagadeck|pptx|pdf|roteiro|tudo|estudo|estudo-html)$/) || [])[1];
      if (exportKind) {
        const spec = withBase(W, W.spec);
        const name = W.file && !isBundledTemplate(W.file) ? path.basename(W.file).replace(/\.ya?ml$/i, "") : slugify(spec.title);
        // ?ver=1: o material de estudo abre na aba (o que o aluno recebe), em vez de baixar
        await sendExport(res, exportKind, spec, name, { notes: url.searchParams.get("notas") !== "0", inline: exportKind === "estudo-html" && url.searchParams.get("ver") === "1" });
        return;
      }

      // Abrir um .sagadeck (ou .zip) vindo do navegador: extrai numa pasta de verdade e abre de lá
      // (assim as edições são salvas; o navegador não informa o caminho do arquivo original).
      if (pathname === "/api/open-package" && req.method === "POST") {
        const name = url.searchParams.get("name") || "apresentacao";
        try {
          // entra na biblioteca (tópico "Importados", ou o tópico pedido) e abre de lá
          const id = await W.library.importPackage(await readBody(req), url.searchParams.get("topic") || "", name);
          const file = W.library.resolveId(id);
          W.spec = loadSpec(file);
          W.file = file;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, spec: W.spec, file: W.file, dir: path.dirname(file), id }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      if (pathname.startsWith("/api/export/")) {
        const format = pathname.replace("/api/export/", "");
        if (format === "yaml") {
          const y = toYaml(W.spec); // sem campos internos (_dir, _file: caminhos desta máquina)
          res.writeHead(200, {
            "Content-Type": "text/yaml; charset=utf-8",
            "Content-Disposition": 'attachment; filename="apresentacao.yaml"',
          });
          res.end(y);
          return;
        }
        if (format === "html") {
          const out = buildHTML(W.spec);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": 'attachment; filename="apresentacao.html"',
          });
          res.end(out.html);
          return;
        }
        if (format === "patch") {
          const patchPath = path.resolve("sagadeck-v1.2.0.patch");
          if (fs.existsSync(patchPath)) {
            res.writeHead(200, {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": 'attachment; filename="sagadeck-v1.2.0.patch"',
            });
            fs.createReadStream(patchPath).pipe(res);
            return;
          }
        }
        if (format === "wheel") {
          const wheelPath = path.resolve("dist/sagadeck-1.2.0-py3-none-any.whl");
          if (fs.existsSync(wheelPath)) {
            res.writeHead(200, {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": 'attachment; filename="sagadeck-1.2.0-py3-none-any.whl"',
            });
            fs.createReadStream(wheelPath).pipe(res);
            return;
          }
        }
        if (format === "source" || format === "tar") {
          const tarPath = path.resolve("sagadeck-v1.2.0-source.tar.gz");
          if (fs.existsSync(tarPath)) {
            res.writeHead(200, {
              "Content-Type": "application/gzip",
              "Content-Disposition": 'attachment; filename="sagadeck-v1.2.0-source.tar.gz"',
            });
            fs.createReadStream(tarPath).pipe(res);
            return;
          }
        }
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (err) {
      console.error("[Studio Error]", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message, stack: err.stack }));
    }
  });

  server.on("close", () => { ensaio?.then((mock) => mock?.close()); });
  return server;
}

// "Olhos" da IA: foto do slide renderizado (uma por clique se o pedido falar de animação/ordem).
// Sem Chrome disponível, segue sem foto — a IA só perde a visão, o pedido continua.
const ANIM_WORDS = /clique|click|anima|aparec|revel|ordem|sequ[eê]n|entra|some|surge|transi/i;
async function lookAt(spec, index, prompt, emit) {
  if (typeof index !== "number" || !spec?.slides?.[index]) return [];
  try {
    emit({ phase: "looking", text: "Olhando o slide…" });
    const { slideSnapshots } = await import("./snapshot.js");
    return await slideSnapshots(spec, index, { mode: ANIM_WORDS.test(prompt) ? "steps" : "final" });
  } catch (e) {
    console.warn("[Studio] sem foto do slide para a IA:", e.message);
    return [];
  }
}

// Resposta de uma tarefa de IA. Com stream, manda NDJSON: uma linha {type:"progress",…} por etapa/pedaço
// de texto e, no fim, {type:"result", data} ou {type:"error", error}. Sem stream, um JSON só.
async function respond(res, stream, work) {
  if (!stream) {
    try {
      const data = await work(() => {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");
  const started = Date.now();
  const heartbeat = setInterval(() => send({ type: "tick", elapsed: Date.now() - started }), 1000);
  try {
    const data = await work((ev) => send({ type: "progress", elapsed: Date.now() - started, ...ev }));
    send({ type: "result", data });
  } catch (e) {
    console.error("[Studio] tarefa de IA falhou:", e.message);
    send({ type: "error", error: e.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error("JSON inválido no corpo da requisição"));
      }
    });
    req.on("error", reject);
  });
}
