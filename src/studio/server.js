// sagadeck Studio · Servidor HTTP local para o editor visual PowerPoint + Chat Lateral IA
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildHTML, renderSlide, loadSpec, inferLayout } from "../build.js";
import { THEMES } from "../themes.js";
import { LAYOUTS } from "../layouts.js";
import { listIcons } from "../figures/icons.js";
import { autofixSlide, autofixDeck } from "../fiscal/autofix.js";
import { normalizeSpec } from "../fiscal/normalize.js";
import { varietyReport } from "../ai/variety.js";
import { packDeck, unpackDeck, EXTENSION, MIME } from "../package.js";
import { openLibrary, defaultLibraryRoot, safeName } from "../library.js";
import { ApiEnvironments, defaultEnvFile, readRecordings, writeRecording, mimeOf } from "../api-client.js";
import { slideSnapshots } from "./snapshot.js";
import { llmAvailable, llmConfig } from "../ai/llm.js";
import { editDeck, textToSlide, generateDeck, toYaml, materializeImages } from "../ai/deck-ai.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Caminhos que existem no repositório (src/studio/…) OU no motor empacotado do pip (engine/studio/…, engine/runtime/…)
const firstDir = (...dirs) => dirs.find((d) => fs.existsSync(d)) || dirs[0];
const PUBLIC_DIR = firstDir(path.join(HERE, "public"), path.join(HERE, "studio", "public"));
const RUNTIME_DIR = firstDir(path.join(HERE, "..", "runtime"), path.join(HERE, "runtime"));
// templates de exemplo do pacote (repositório: ../../templates · motor empacotado: ./templates)
const TEMPLATE_DIRS = [path.resolve(HERE, "..", "..", "templates"), path.resolve(HERE, "templates")];
const isBundledTemplate = (f) => !!f && TEMPLATE_DIRS.some((d) => path.resolve(f).startsWith(d + path.sep));
const slugify = (s) => String(s || "deck").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deck";

export function createStudioServer(deckPath = null, opts = {}) {
  // Área de trabalho: o que cada pessoa tem aberto (deck, arquivo, última prévia) + a biblioteca dela.
  // Modo local (Windows do banco, só você): uma área só, biblioteca em SAGADECK_HOME ou ~/sagadeck.
  // Modo multiusuário (servidor atrás do BabsDeck): uma área por usuário, biblioteca <raiz>/usuarios/<usuário>.
  const libraryRoot = path.resolve(opts.library || defaultLibraryRoot());
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
  const layoutPreviewCache = new Map(); // tema -> { layout: html }

  // Slide "api": ambientes (dev/hom…) e token ficam na máquina, fora do deck.
  const apiEnv = new ApiEnvironments(opts.apiEnvFile || defaultEnvFile()); // LOOPBACK: definido abaixo, junto da trava de origem
  const rtSessions = new Map(); // conversas em tempo real abertas: sid -> { conn, buffer, res }
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
  function persist(W) {
    if (!W.file || isBundledTemplate(W.file)) return;
    try { fs.writeFileSync(W.file, toYaml(W.spec), "utf8"); } catch (e) { console.error("[Studio] Erro ao salvar:", e.message); }
  }

  // Onde a IA grava imagens geradas: pasta "imagens" ao lado do deck (ou na pasta atual, se o deck é um exemplo).
  function imageOptions(W, spec) {
    const deckDir = W.file && !isBundledTemplate(W.file) ? path.dirname(W.file) : process.cwd();
    return { baseDir: spec._dir || deckDir, assetsDir: path.join(deckDir, "imagens") };
  }

  function withBase(W, spec) {
    if (!spec._dir && W.file) return { ...spec, _dir: path.dirname(W.file), _file: W.file };
    return spec;
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
      if (pathname === "/style.css") {
        const css = fs.readFileSync(path.join(PUBLIC_DIR, "style.css"), "utf8");
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
        res.end(css);
        return;
      }
      if (pathname === "/fit.js") { // o mesmo ajuste da apresentação (src/runtime/fit.js)
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(fs.readFileSync(path.join(RUNTIME_DIR, "fit.js"), "utf8"));
        return;
      }
      if (pathname === "/app.js" || pathname === "/ui-icons.js" || pathname === "/slide-form.js" || pathname === "/library.js") {
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
      if (pathname === "/api/deck" && req.method === "GET") {
        const rawYaml = toYaml(W.spec); // sem os campos internos (_dir, _file)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          spec: W.spec,
          yaml: rawYaml,
          file: W.file,
          themes: Object.keys(THEMES),
          // para a galeria de temas: nome curto + cores de fundo, texto e destaque
          themeMeta: Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, {
            label: String(t.label || k).split(/\s+[—–-]\s+/)[0],
            desc: String(t.label || "").split(/\s+[—–-]\s+/)[1] || "",
            paper: `#${t.colors.paper}`, ink: `#${t.colors.ink}`, accent: `#${t.colors.accent}`,
          }])),
          layouts: Object.keys(LAYOUTS),
        }));
        return;
      }

      if (pathname === "/api/deck" && req.method === "POST") {
        const body = await readJSON(req);
        if (body.yaml) {
          try {
            const parsed = YAML.parse(body.yaml);
            if (!parsed || !Array.isArray(parsed.slides)) throw new Error('falta a lista "slides:"');
            // o YAML editado não traz os campos internos: mantém a pasta do deck (imagens, CSS, widgets)
            const keep = body.source === "browser-file" ? {} : Object.fromEntries(Object.entries(W.spec || {}).filter(([k]) => k.startsWith("_")));
            W.spec = { ...parsed, ...keep };
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "YAML inválido: " + e.message }));
            return;
          }
        } else if (body.spec) {
          W.spec = body.spec;
        }
        if (body.filepath) {
          W.file = path.resolve(body.filepath);
        } else if (body.source === "browser-file") {
          // Deck aberto pelo navegador (seletor/arrastar): o servidor não sabe o caminho dele.
          // Esquece o arquivo anterior — senão as edições deste deck iam parar por cima daquele.
          W.file = null;
        }
        if (body.saveToFile !== false) persist(W);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, spec: W.spec, file: W.file }));
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

      if (pathname === "/api/slide-yaml" && req.method === "GET") {
        const i = Number(url.searchParams.get("i"));
        const slide = W.spec?.slides?.[i];
        res.writeHead(slide ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(slide ? { yaml: YAML.stringify(slide, { indent: 2 }) } : { error: "slide não existe" }));
        return;
      }
      if (pathname === "/api/slide-yaml" && req.method === "POST") {
        const body = await readJSON(req);
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

      // Galeria de layouts: um exemplo de cada, desenhado no tema do deck (cache por tema)
      if (pathname === "/api/layout-previews") {
        const { LAYOUT_INFO, LAYOUT_SAMPLES } = await import("./layout-samples.js");
        const theme = W.spec?.theme || "sinal";
        const key = `${theme}|${W.spec?.markStyle || ""}`;
        if (!layoutPreviewCache.has(key)) {
          const spec = { theme, markStyle: W.spec?.markStyle, title: "", footer: false, slides: [] };
          const out = {};
          for (const [name, sample] of Object.entries(LAYOUT_SAMPLES)) {
            try { out[name] = renderSlide(sample, 0, spec).html; } catch (e) { out[name] = ""; }
          }
          layoutPreviewCache.set(key, out);
        }
        const r = renderSlide({ layout: "statement", text: "x" }, 0, { theme });
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
            result = await textToSlide(body.text, { ...opts, images: true, imageOptions: imageOptions(W, withBase(W, W.spec)) });
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
          if (W.file) {
            try { fs.writeFileSync(W.file, YAML.stringify(targetSpec, { indent: 2 })); } catch {}
          }
          W.spec = targetSpec;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, slide: resFix.slide, actions: resFix.actions, spec: targetSpec }));
        } else {
          const resDeck = autofixDeck(targetSpec, issues || []);
          W.spec = resDeck.spec;
          if (W.file) {
            try { fs.writeFileSync(W.file, YAML.stringify(W.spec, { indent: 2 })); } catch {}
          }
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
        // Arquivo novo na pasta do deck aberto (ou na pasta atual), sem sobrescrever nada.
        const dir = W.file && !isBundledTemplate(W.file) ? path.dirname(W.file) : process.cwd();
        await respond(res, body.stream, async (emit) => {
          const gen = await generateDeck(body.briefing, {
            theme: body.theme || undefined,
            slides: Number(body.slides) || undefined,
            duration: Number(body.duration) || undefined,
            images: true, // o briefing diz se quer imagens (e onde)
            imageOptions: { baseDir: dir, assetsDir: path.join(dir, "imagens") },
            onEvent: emit,
          });
          let target = path.join(dir, `${slugify(gen.spec.title)}.yaml`);
          for (let n = 2; fs.existsSync(target); n++) target = path.join(dir, `${slugify(gen.spec.title)}-${n}.yaml`);
          fs.writeFileSync(target, toYaml(gen.spec), "utf8");
          W.file = target;
          W.spec = loadSpec(target);
          return { ok: true, spec: W.spec, file: W.file, images: gen.images };
        });
        return;
      }

      if (pathname === "/api/ai/chat" && req.method === "POST") {
        const body = await readJSON(req);
        const prompt = body.message || "";
        const slideIdx = typeof body.targetSlide === "number" ? body.targetSlide : 0;
        const spec = body.spec || W.spec;
        const issues = body.issues || [];

        await respond(res, body.stream, async (emit) => {
          let result;
          const history = Array.isArray(body.history) ? body.history : [];
          if (body.mode !== "rules" && await llmAvailable()) {
            try {
              const target = typeof body.targetSlide === "number" ? body.targetSlide : null;
              const visuals = await lookAt(withBase(W, spec), target, prompt, emit);
              for (const [i, url] of (Array.isArray(body.attachments) ? body.attachments : []).entries()) {
                if (typeof url === "string" && url.startsWith("data:image/")) visuals.push({ label: `imagem colada pelo usuário ${i + 1}`, dataUrl: url });
              }
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
                renderNotes: Array.isArray(body.renderNotes) ? body.renderNotes.slice(0, 8) : [],
                apiContext: apiContextFor(req, W),
              });
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
                  result.actions.push(`${r.report.ok ? "✓" : "✗"} Teste do slide ${i + 1}: ${r.report.ok ? "funcionou" : String(r.report.erro || (r.report.status ? `HTTP ${r.report.status}` : "falhou")).slice(0, 140)}`);
                }
                convo.push({ role: "assistant", text: result.reply });
                const instruction = `Resultado do teste (rodada ${round} de 3), executado no ambiente ${apiEnv.currentName()}:\n\`\`\`json\n${JSON.stringify(reports, null, 2).slice(0, 12000)}\n\`\`\`\nSe algo falhou ou tem "NÃO EXISTE", corrija os slides com base na resposta real e peça test de novo. Se tudo funcionou, confirme em uma frase, sem yaml.`;
                emit({ phase: "test", text: reports.every((x) => x.ok) ? "Os testes passaram; conferindo…" : "Corrigindo com base no resultado…" });
                const next = await editDeck({
                  spec: withBase(W, result.spec), instruction, targetSlide: target, images: false,
                  imageOptions: imageOptions(W, withBase(W, result.spec)), history: convo, onProgress: emit, apiContext: apiContextFor(req, W),
                });
                convo.push({ role: "user", text: instruction });
                result = { ...next, actions: [...result.actions, ...(next.actions || [])], spec: next.spec };
              }
              result.mode = "llm";
            } catch (e) {
              // Falhou no meio: não "chuta" com as regras (poderiam fazer outra coisa); deck fica como estava.
              console.error("[Studio] IA falhou:", e.message);
              return { reply: `⚠ A IA falhou e não mudei nada: ${e.message}`, spec, actions: [], targetSlide: body.targetSlide, mode: "error" };
            }
          } else {
            result = handleAIChat({ prompt, slideIdx, spec, issues });
            result.mode = "rules";
          }
          W.spec = result.spec;
          persist(W);
          return result;
        });
        return;
      }

      // ── Biblioteca (tópicos e apresentações da área de trabalho) ──
      // ---------- slide "api": executa pedidos HTTP (ver src/api-client.js) ----------
      // Só no modo local, só pelo endereço desta máquina e só da própria página: nenhum outro site
      // (nem outro computador da rede) usa a sua VPN e o seu token por aqui.
      if (pathname.startsWith("/api/http/")) {
        const reply = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
        const blocked = apiBlocked(req);
        if (pathname === "/api/http/state" && req.method === "GET") {
          let st;
          try { st = apiEnv.state(); } catch (e) { st = { error: e.message, envs: [] }; }
          const tokens = Object.fromEntries((st.envs || []).map((e) => [e.name, apiEnv.tokenInfo(e.name)]));
          return reply(200, { live: !blocked, reason: blocked?.message || null, ...(blocked ? { envs: [], current: null } : st), tokens, recordings: { ...readRecordings(W.file), ...(W.apiRecordings || {}) } });
        }
        if (blocked) return reply(blocked.code, { error: blocked.message, live: false });
        // conversa em tempo real: os eventos do serviço chegam ao navegador por aqui (SSE)
        if (pathname === "/api/http/rt/events" && req.method === "GET") {
          const s = rtSessions.get(url.searchParams.get("sid") || "");
          if (!s) return reply(404, { error: "conversa não existe (já terminou?)" });
          res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
          s.res = res;
          for (const ev of s.buffer.splice(0)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
          req.on("close", () => { if (s.res === res) { s.conn.close(); rtSessions.delete(s.sid); } });
          return;
        }
        if (req.method !== "POST") return reply(405, { error: "use POST" });
        if (!/^application\/json/i.test(req.headers["content-type"] || "")) return reply(415, { error: "envie JSON" });
        let body;
        try { body = await readJSON(req); } catch (e) { return reply(400, { error: e.message }); }
        // o arquivo do slide: o que foi arrastado na hora, ou o padrão (file:), só de dentro da pasta do deck
        const fileOf = (b) => {
          if (b.file && b.file.base64) return { name: String(b.file.name || "arquivo"), type: String(b.file.type || mimeOf(b.file.name)), data: Buffer.from(b.file.base64, "base64") };
          if (!b.fileRef) return null;
          const dir = W.file ? path.dirname(W.file) : null;
          if (!dir) throw Object.assign(new Error("Salve o deck numa pasta para usar um arquivo padrão (file:)."), { kind: "config" });
          const abs = path.resolve(dir, String(b.fileRef));
          if (!abs.startsWith(dir + path.sep)) throw Object.assign(new Error("O arquivo precisa estar dentro da pasta do deck."), { kind: "config" });
          if (!fs.existsSync(abs)) throw Object.assign(new Error(`Não achei ${b.fileRef} na pasta do deck (${dir}).`), { kind: "config" });
          return { name: path.basename(abs), type: mimeOf(abs), data: fs.readFileSync(abs) };
        };
        try {
          if (pathname === "/api/http/env") return reply(200, apiEnv.use(String(body.name || "")));
          if (pathname === "/api/http/send") return reply(200, await apiEnv.send({ ...(body.request || {}), file: fileOf(body) }));
          if (pathname === "/api/http/rt/open") {
            const r = await apiEnv.openRealtime(body.realtime || {});
            const sid = crypto.randomUUID();
            const s = { sid, conn: r.conn, buffer: [], res: null };
            const push = (ev) => { if (s.res) s.res.write(`data: ${JSON.stringify(ev)}\n\n`); else s.buffer.push(ev); };
            r.conn.on("message", (m, isText) => push(isText ? { dir: "in", text: r.mask(m) } : { dir: "in", bin: m.toString("base64") }));
            r.conn.on("close", (code, why) => { push({ type: "close", code, why: String(why || "") }); if (s.res) s.res.end(); rtSessions.delete(sid); });
            rtSessions.set(sid, s);
            for (const m of [].concat(body.open || [])) r.conn.send(typeof m === "string" ? m : JSON.stringify(m));
            return reply(200, { sid, url: r.url, env: r.env });
          }
          if (pathname === "/api/http/rt/send") {
            const s = rtSessions.get(String(body.sid || ""));
            if (!s) return reply(404, { error: "conversa não existe (já terminou?)" });
            for (const m of [].concat(body.messages || [])) s.conn.send(typeof m === "string" ? m : JSON.stringify(m));
            return reply(200, { ok: true });
          }
          if (pathname === "/api/http/rt/close") {
            const s = rtSessions.get(String(body.sid || ""));
            if (s) { s.conn.close(); rtSessions.delete(s.sid); }
            return reply(200, { ok: true });
          }
          if (pathname === "/api/http/record") {
            if (!body.key || !body.record) return reply(400, { error: "faltou key/record" });
            const f = W.file && !isBundledTemplate(W.file) ? writeRecording(W.file, String(body.key), body.record) : null;
            if (!f) (W.apiRecordings = W.apiRecordings || {})[body.key] = { ...body.record, at: new Date().toISOString() };
            return reply(200, { ok: true, file: f });
          }
          if (pathname === "/api/http/stream") {
            const up = await apiEnv.open({ ...(body.request || {}), file: fileOf(body) });
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Api-Status": String(up.res.statusCode), "X-Api-Type": up.res.headers["content-type"] || "" });
            up.res.on("data", (c) => res.write(up.mask(c.toString("utf8"))));
            up.res.on("end", () => res.end());
            up.res.on("error", () => res.end());
            req.on("close", () => up.res.destroy());
            return;
          }
        } catch (e) {
          return reply(e.kind === "config" ? 400 : 502, { error: e.message, kind: e.kind || "error" });
        }
        return reply(404, { error: "não existe" });
      }

      if (pathname.startsWith("/api/library")) {
        const L = W.library;
        const ok = (obj = {}) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, ...obj })); };
        const fail = (e, code = 400) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || String(e) })); };
        try {
          if (pathname === "/api/library" && req.method === "GET") {
            const openId = W.file && W.file.startsWith(L.root + path.sep) ? L.idOf(W.file) : null;
            return ok({ ...L.list(), user: W.user, multiuser: !!opts.multiuser, open: openId });
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
            if (!["sagadeck", "pptx", "pdf", "roteiro"].includes(kind)) throw new Error("formato inválido");
            await sendExport(res, kind, loadSpec(file), path.basename(file).replace(/\.ya?ml$/i, ""));
            return;
          }
          if (pathname === "/api/library/import" && req.method === "POST") {
            const id = await L.importPackage(await readBody(req), url.searchParams.get("topic") || "", url.searchParams.get("name") || "Importada");
            return ok({ id });
          }
          if (req.method !== "POST") return fail(new Error("método não suportado"), 405);
          const b = await readJSON(req);
          switch (pathname) {
            case "/api/library/topics": return ok({ id: L.createTopic(b.name, b.color) });
            case "/api/library/topics/update": return ok({ id: L.updateTopic(b.id, b) });
            case "/api/library/topics/delete": L.deleteTopic(b.id); return ok();
            case "/api/library/decks": {
              // nova: em branco (uma capa) — "com IA" usa /api/library/decks/ai
              const title = String(b.title || "Nova apresentação").trim();
              const id = L.createDeck(b.topic || "", { title, theme: b.theme || "bauhaus", duration: 10,
                slides: [{ layout: "cover", title, subtitle: "Subtítulo", author: "" }] });
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
            case "/api/library/open": {
              const file = L.resolveId(b.id);
              W.spec = loadSpec(file);
              W.file = file;
              return ok({ spec: W.spec, file: W.file, id: b.id });
            }
            case "/api/library/decks/ai": {
              // gera com IA direto numa pasta nova da biblioteca (as imagens ficam dentro dela)
              if (!(await llmAvailable({ force: true }))) return fail(new Error(`Nenhum LLM respondendo em ${llmConfig().url}.`), 503);
              const id = L.createDeck(b.topic || "", { title: "Gerando…", slides: [{ layout: "cover", title: "Gerando…" }] });
              const file = L.resolveId(id), dir = path.dirname(file);
              await respond(res, b.stream, async (emit) => {
                try {
                  const gen = await generateDeck(b.briefing || "", { theme: b.theme || undefined, slides: Number(b.slides) || undefined,
                    imageOptions: { baseDir: dir, assetsDir: path.join(dir, "imagens") }, onEvent: emit });
                  fs.writeFileSync(file, toYaml(gen.spec), "utf8");
                  const finalId = L.renameDeck(id, gen.spec.title || "Nova apresentação");
                  return { ok: true, id: finalId, images: gen.images };
                } catch (e) {
                  L.trashDeck(id);
                  throw e;
                }
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
      const exportKind = (pathname.match(/^\/api\/export\/(sagadeck|pptx|pdf|roteiro)$/) || [])[1];
      if (exportKind) {
        const spec = withBase(W, W.spec);
        const name = W.file && !isBundledTemplate(W.file) ? path.basename(W.file).replace(/\.ya?ml$/i, "") : slugify(spec.title);
        await sendExport(res, exportKind, spec, name);
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
// Gera e envia um arquivo da apresentação. PPTX/PDF/roteiro usam o Chrome invisível (os mesmos
// exportadores de "sagadeck pptx | pdf | roteiro"), numa pasta temporária.
async function sendExport(res, kind, spec, name) {
  const cd = (file) => `attachment; filename="${slugify(file.replace(/\.\w+$/, ""))}${path.extname(file)}"; filename*=UTF-8''${encodeURIComponent(file)}`;
  if (kind === "sagadeck") {
    const { zip, missing } = await packDeck(spec, { baseDir: spec._dir || process.cwd(), name, generator: "sagadeck studio" });
    res.writeHead(200, { "Content-Type": MIME, "Content-Disposition": cd(name + EXTENSION), "X-Sagadeck-Missing": encodeURIComponent(JSON.stringify(missing)) });
    res.end(zip);
    return;
  }
  const kinds = {
    pptx: { file: `${name}.pptx`, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
    pdf: { file: `${name}.pdf`, mime: "application/pdf" },
    roteiro: { file: `${name} - roteiro.pdf`, mime: "application/pdf" },
  };
  const k = kinds[kind];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `sagadeck-${kind}-`));
  try {
    const r = buildHTML(spec);
    const htmlFile = path.join(tmp, "deck.html"), out = path.join(tmp, "saida");
    fs.writeFileSync(htmlFile, r.html);
    let errors = [];
    if (kind === "pptx") {
      const { exportPptx } = await import("../export/pptx.js");
      ({ errors } = await exportPptx(htmlFile, out, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta } }));
    } else if (kind === "pdf") {
      const { pdf } = await import("../export/shots.js");
      await pdf(htmlFile, out);
    } else {
      const { shots } = await import("../export/shots.js");
      const { roteiroPDF } = await import("../export/roteiro.js");
      const { files } = await shots(htmlFile, path.join(tmp, "miniaturas"), { scale: 0.5, jpeg: true });
      await roteiroPDF({ slidesMeta: r.slidesMeta, shotFiles: files, outFile: out, title: r.meta.title, author: r.meta.author, duration: spec.duration });
    }
    res.writeHead(200, {
      "Content-Type": k.mime, "Content-Disposition": cd(k.file),
      // só o que afeta o arquivo (falha ao exportar, arquivo não encontrado); o fiscal de conteúdo fica no Revisar
      "X-Sagadeck-Warnings": encodeURIComponent(JSON.stringify([...(r.warnings || []).filter((w) => /não encontrado/.test(w)), ...errors].slice(0, 20))),
    });
    res.end(fs.readFileSync(out));
  } catch (e) {
    console.error(`[Studio] exportação ${kind} falhou:`, e.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

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

// Motor Inteligente do Chat com IA (Regras determinísticas avançadas + auto-correção geométrica)
function handleAIChat({ prompt, slideIdx, spec, issues }) {
  const p = prompt.toLowerCase().trim();
  const newSpec = JSON.parse(JSON.stringify(spec));
  const actions = [];
  let reply = "";
  let targetIdx = slideIdx;

  // 1. Identificar se o usuário especificou outro slide no prompt (ex: "no slide 3", "mude o slide 2")
  const slideNumMatch = p.match(/slide\s*(\d+)/i);
  if (slideNumMatch) {
    const num = parseInt(slideNumMatch[1], 10);
    if (num >= 1 && num <= newSpec.slides.length) {
      targetIdx = num - 1;
    }
  }

  const s = newSpec.slides[targetIdx] || newSpec.slides[0];

  // 2. Intenção: Auto-correção / Resolver sobreposições e margens
  if (p.includes("corrig") || p.includes("sobrepos") || p.includes("margem") || p.includes("ajust") || p.includes("arrum") || p.includes("fiscal") || p.includes("fix")) {
    const fixResult = autofixSlide(s, newSpec, issues);
    newSpec.slides[targetIdx] = fixResult.slide;
    const count = fixResult.actions.length;
    actions.push(...fixResult.actions);
    if (count > 0) {
      reply = `Enxerguei a geometria do slide ${targetIdx + 1} e apliquei ${count} correção(ões):\n` +
        fixResult.actions.map((a) => `• ${a}`).join("\n") +
        `\n\nAgora os elementos estão distribuídos sem sobreposição e respeitando as margens seguras (120px).`;
    } else {
      reply = `Analisei o slide ${targetIdx + 1}: ele já está perfeitamente alinhado, sem sobreposições ou quebra de margens!`;
    }
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 3. Intenção: Troca de Tema
  const themeMatch = p.match(/tema\s+(sinal|prata|rabisco|oceano|pop|aurora|editorial|noite|bauhaus|terminal|jornal)/i);
  const knownThemes = ["sinal", "prata", "rabisco", "oceano", "pop", "aurora", "editorial", "noite", "bauhaus", "terminal", "jornal"];
  let chosenTheme = null;

  if (themeMatch) {
    chosenTheme = themeMatch[1].toLowerCase();
  } else if (p.includes("prata") || p.includes("apple") || p.includes("keynote") || (p.includes("cinza") && p.includes("prata")) || p.includes("titanio") || (p.includes("jovem") && p.includes("sério")) || (p.includes("clean") && p.includes("respiro"))) {
    chosenTheme = "prata";
  } else if (p.includes("rabisco") || p.includes("pintado") || p.includes("desenhado") || p.includes("caderno") || p.includes("artesanal") || p.includes("lousa") || p.includes("bonitinho")) {
    chosenTheme = "rabisco";
  } else if (p.includes("oceano") || (p.includes("azul") && (p.includes("vivo") || p.includes("eletrico") || p.includes("elétrico") || p.includes("vibrante")))) {
    chosenTheme = "oceano";
  } else if (p.includes("pop") || p.includes("alegre") || p.includes("chiclete") || p.includes("colorid")) {
    chosenTheme = "pop";
  } else if (p.includes("aurora") || p.includes("neon") || p.includes("gradiente")) {
    chosenTheme = "aurora";
  } else if (p.includes("tema")) {
    for (const t of knownThemes) {
      if (p.includes(t)) { chosenTheme = t; break; }
    }
  }

  if (chosenTheme) {
    newSpec.theme = chosenTheme;
    actions.push(`Tema da apresentação alterado para "${newSpec.theme}"`);
    let desc = "";
    if (chosenTheme === "prata") desc = "estilo Keynote da Apple: cinza prata acetinado (#F5F5F7), respiro clean, tipografia SF/Inter nítida e cartelas sofisticadas";
    else if (chosenTheme === "rabisco") desc = "fontes manuscritas ('Caveat'/'Patrick Hand'), bordas orgânicas desenhadas à mão, post-its e traços de caderno";
    else if (chosenTheme === "oceano") desc = "azul royal elétrico vibrante, ciano neon, visual dinâmico e luminoso";
    else if (chosenTheme === "pop") desc = "paleta super alegre e animada (roxo, rosa chiclete, menta, sol) com cantos ultra-arredondados";
    else if (chosenTheme === "aurora") desc = "fundo escuro espacial com luzes e gradientes neon (ciano, violeta, magenta)";
    else desc = `estilo ${chosenTheme}`;
    reply = `Alterei o tema visual da apresentação para **${newSpec.theme}** (${desc})!`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 4. Intenção: Troca de Tom do Slide
  if (p.includes("tom") || p.includes("fundo") || p.includes("escuro") || p.includes("claro") || p.includes("destaque")) {
    let newTone = "light";
    if (p.includes("escuro") || p.includes("dark") || p.includes("noite")) newTone = "dark";
    else if (p.includes("destaque") || p.includes("accent") || p.includes("colorido")) newTone = "accent";
    else if (p.includes("alerta") || p.includes("alert")) newTone = "alert";
    s.tone = newTone;
    actions.push(`Tom do slide ${targetIdx + 1} alterado para "${newTone}"`);
    reply = `Mudei o tom do slide ${targetIdx + 1} para **${newTone}**.`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 5. Intenção: Transformar em Stats / KPIs visuais (menos texto, mais impacto)
  if (p.includes("stat") || p.includes("kpi") || p.includes("métrica") || p.includes("metricas") || (p.includes("menos texto") && (p.includes("numero") || p.includes("número")))) {
    s.layout = "stats";
    s.title = s.title || "Nossas Métricas de Impacto";
    s.stats = [
      { value: "99.4%", label: "Disponibilidade Global", trend: "+2.1%", trendUp: true, icon: "shield-check", text: "Acima do benchmark da indústria" },
      { value: "4.5x", label: "Mais Produtividade", trend: "recorde", trendUp: true, icon: "zap", text: "Redução drástica no ciclo operacional" },
      { value: "12M+", label: "Usuários Impactados", trend: "+38% a/a", trendUp: true, icon: "users", text: "Presença em mais de 65 países" },
    ];
    actions.push(`Slide ${targetIdx + 1} transformado em layout de KPIs visuais ("stats")`);
    reply = `Transformei o slide ${targetIdx + 1} no layout visual de **KPIs / Stats**. O textão foi substituído por grandes números com ícones, badges de tendência (+2.1%, recorde) e títulos concisos!`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 6. Intenção: Transformar em Processo / Passos (Steps)
  if (p.includes("passo") || p.includes("processo") || p.includes("fluxo") || p.includes("step") || p.includes("etapa") || p.includes("pipeline")) {
    s.layout = "steps";
    s.title = s.title || "Jornada em 3 Etapas Simples";
    s.steps = [
      { stepNum: 1, title: "Diagnóstico", text: "Mapeamento rápido de necessidades.", icon: "search", tag: "Dia 1" },
      { stepNum: 2, title: "Configuração", text: "Integração sem código com o SagaDeck.", icon: "cpu", tag: "Automático" },
      { stepNum: 3, title: "Lançamento", text: "Apresentação visual com alto engajamento.", icon: "rocket", tag: "Resultado" },
    ];
    actions.push(`Slide ${targetIdx + 1} transformado em fluxo de etapas visuais ("steps")`);
    reply = `Transformei o slide ${targetIdx + 1} em um fluxo visual de **Etapas / Processo (steps)**. As frases longas viraram cartões conectados por setas, com números destacados, ícones e tags!`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 7. Intenção: Trocar Layout para Cards
  if (p.includes("card") || p.includes("cartao") || p.includes("cartões")) {
    s.layout = "cards";
    if (!Array.isArray(s.items) || s.items.length === 0) {
      s.items = [
        { title: "Diagnóstico Rápido", text: "Visão clara do problema em segundos.", icon: "zap", badge: "Rápido" },
        { title: "Ação Imediata", text: "Passos práticos sem sobrecarregar a equipe.", icon: "target", progress: 80 },
        { title: "Métrica Concreta", text: "Resultados mensuráveis no final do ciclo.", icon: "trending-up", tags: ["Visual", "Direto"] },
      ];
    }
    s.cols = Math.min(4, s.items.length);
    actions.push(`Layout do slide ${targetIdx + 1} transformado em cards (${s.items.length} cards, ${s.cols} colunas)`);
    reply = `Transformei o slide ${targetIdx + 1} em layout **cards** com ícones, badges e estrutura balanceada.`;
    // Roda auto-correção
    const auto = autofixSlide(s, newSpec);
    newSpec.slides[targetIdx] = auto.slide;
    return { reply, actions: [...actions, ...auto.actions], spec: newSpec, targetSlide: targetIdx };
  }

  // 6. Intenção: Trocar Layout para Number (Estatística)
  if (p.includes("numero") || p.includes("número") || p.includes("estatistica") || p.includes("estatística") || p.includes("métrica") || p.includes("contador")) {
    s.layout = "number";
    s.value = 87;
    s.suffix = "%";
    s.label = "de eficiência atingida na primeira iteração";
    s.side = { chart: "donut", value: 87, center: "87%", w: 500, h: 500 };
    actions.push(`Layout do slide ${targetIdx + 1} alterado para "number" com donut chart`);
    reply = `Configurei o slide ${targetIdx + 1} com layout **number**, destacando um valor com gráfico circular integrado.`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 7. Intenção: Trocar Layout para Split (Texto + Figura)
  if (p.includes("split") || p.includes("dividir") || p.includes("figura") || p.includes("diagrama")) {
    s.layout = "split";
    s.figure = { picto: "scene", name: "desk", papers: true };
    s.body = s.body || "A clareza visual ajuda a audiência a reter a mensagem sem esforço.";
    actions.push(`Layout do slide ${targetIdx + 1} alterado para "split" com figura`);
    reply = `Alternei o slide ${targetIdx + 1} para o layout **split**, combinando texto objetivo com ilustração visual.`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 8. Intenção: Trocar Layout para Statement (Frase de impacto)
  if (p.includes("statement") || p.includes("frase") || p.includes("impacto") || p.includes("manchete")) {
    s.layout = "statement";
    s.text = s.title || "Menos texto, mais significado e impacto real.";
    s.center = true;
    actions.push(`Layout do slide ${targetIdx + 1} alterado para "statement" centralizado`);
    reply = `Defini o slide ${targetIdx + 1} como **statement** de alto impacto visual.`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 9. Intenção: Adicionar Novo Slide
  if (p.includes("novo slide") || p.includes("adicionar slide") || p.includes("criar slide") || p.includes("inserir slide")) {
    const isConclusion = p.includes("conclus") || p.includes("final") || p.includes("encerramento");
    const newSlide = isConclusion
      ? {
          layout: "end",
          title: "Próximos Passos",
          subtitle: "Obrigado pela atenção.",
          contacts: ["contato@empresa.com", "sagadeck.org"],
          notes: "> Agradeça e abra para perguntas.",
        }
      : {
          layout: "statement",
          kicker: "Conceito Chave",
          text: "Um ponto crucial para a nossa jornada.",
          tone: "accent",
          notes: "> Detalhe este ponto verbalmente.",
        };

    newSpec.slides.splice(targetIdx + 1, 0, newSlide);
    const addedIndex = targetIdx + 1;
    actions.push(`Novo slide inserido na posição ${addedIndex + 1} (layout: ${newSlide.layout})`);
    reply = `Criei um novo slide na posição **${addedIndex + 1}** (${newSlide.layout}). Você já pode editá-lo!`;
    return { reply, actions, spec: newSpec, targetSlide: addedIndex };
  }

  // 10. Intenção: Excluir Slide
  if (p.includes("excluir") || p.includes("remover") || p.includes("deletar") || p.includes("apagar")) {
    if (newSpec.slides.length <= 1) {
      reply = "A apresentação não pode ficar sem nenhum slide!";
      return { reply, actions, spec: newSpec, targetSlide: targetIdx };
    }
    newSpec.slides.splice(targetIdx, 1);
    const newTarget = Math.max(0, targetIdx - 1);
    actions.push(`Slide ${targetIdx + 1} removido com sucesso`);
    reply = `Removi o slide ${targetIdx + 1}. Agora você está no slide ${newTarget + 1}.`;
    return { reply, actions, spec: newSpec, targetSlide: newTarget };
  }

  // 11. Intenção: Duplicar Slide
  if (p.includes("duplicar") || p.includes("copiar")) {
    const clone = JSON.parse(JSON.stringify(s));
    newSpec.slides.splice(targetIdx + 1, 0, clone);
    actions.push(`Slide ${targetIdx + 1} duplicado na posição ${targetIdx + 2}`);
    reply = `Dupliquei o slide atual na posição ${targetIdx + 2}.`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx + 1 };
  }

  // 12. Intenção: Resumir / Deixar Conciso / Menos Texto / Mais Visual (Anti-sono)
  if (p.includes("resum") || p.includes("concis") || p.includes("diminuir texto") || p.includes("menos texto") || p.includes("muito texto") || p.includes("mais visual") || p.includes("anti-sono") || p.includes("textao") || p.includes("textão")) {
    // Se o slide tiver texto longo e estiver em split ou blocks, transformar em cards visuais com widgets
    if ((s.body && s.body.length > 70) || (s.bullets && s.bullets.length > 2)) {
      s.layout = "cards";
      s.items = [
        { title: "Diagnóstico Rápido", text: "Identificação imediata da oportunidade.", icon: "zap", badge: "Essencial" },
        { title: "Progresso da Meta", text: "Execução orientada por entregáveis visuais.", icon: "target", progress: 85, progressLabel: "Meta" },
        { title: "Impacto no Negócio", text: "Crescimento sustentável sem burocracia.", icon: "trending-up", tags: ["Visual", "Direto"] }
      ];
      delete s.body;
      delete s.bullets;
      actions.push(`Slide ${targetIdx + 1} transformado em cards visuais com badges, progresso e tags`);
      reply = `Substituí o excesso de texto do slide ${targetIdx + 1} por **cards visuais estruturados**, com ícones, barra de progresso e tags, eliminando o visual cansativo!`;
      const fix = autofixSlide(s, newSpec);
      newSpec.slides[targetIdx] = fix.slide;
      return { reply, actions: [...actions, ...fix.actions], spec: newSpec, targetSlide: targetIdx };
    }

    if (s.body && typeof s.body === "string") {
      const parts = s.body.split(/(?<=[.?!])\s+/);
      s.body = parts[0];
      s.notes = (s.notes ? s.notes + "\n\n" : "") + "> Roteiro transferido:\n" + parts.slice(1).join(" ");
    }
    if (s.title && s.title.length > 50) {
      s.titleSize = 72;
    }
    actions.push(`Texto do slide ${targetIdx + 1} condensado e narrativa movida para as notas`);
    reply = `Otimizei o texto do slide ${targetIdx + 1} para o padrão anti-sono (~40 palavras visíveis). O excedente foi colocado no roteiro do apresentador (notas).`;
    return { reply, actions, spec: newSpec, targetSlide: targetIdx };
  }

  // 13. Intenção Genérica / Edição de Título / Conteúdo
  if (p.includes("título") || p.includes("titulo")) {
    const newTitle = prompt.replace(/^.*?(mude|troque|altere|coloque|para|o título|título)\s*(para|:)?\s*/i, "").trim();
    if (newTitle) {
      s.title = newTitle;
      actions.push(`Título do slide ${targetIdx + 1} alterado para "${newTitle}"`);
      reply = `Atualizei o título do slide ${targetIdx + 1} para: **"${newTitle}"**.`;
      // Checar se precisa auto-correção geométrica
      const fix = autofixSlide(s, newSpec);
      newSpec.slides[targetIdx] = fix.slide;
      return { reply, actions: [...actions, ...fix.actions], spec: newSpec, targetSlide: targetIdx };
    }
  }

  // Fallback Inteligente: auto-inspeção e auto-cura
  const fix = autofixSlide(s, newSpec, issues);
  newSpec.slides[targetIdx] = fix.slide;
  actions.push(...fix.actions);
  reply = `Entendi seu pedido. Revisei a estrutura do slide ${targetIdx + 1}, garantindo proporções seguras, fontes legíveis e zero colisões.\n` +
    (fix.actions.length ? `Correções aplicadas:\n${fix.actions.map((a) => `• ${a}`).join("\n")}` : "Nenhum problema de layout foi detectado.");

  return { reply, actions, spec: newSpec, targetSlide: targetIdx };
}
