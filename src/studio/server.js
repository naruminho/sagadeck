// sagadeck Studio · Servidor HTTP local para o editor visual PowerPoint + Chat Lateral IA
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildHTML, renderSlide, loadSpec, inferLayout } from "../build.js";
import { THEMES } from "../themes.js";
import { LAYOUTS } from "../layouts.js";
import { listIcons } from "../figures/icons.js";
import { autofixSlide, autofixDeck } from "../fiscal/autofix.js";
import { llmAvailable, llmConfig } from "../ai/llm.js";
import { editDeck, textToSlide, generateDeck, toYaml } from "../ai/deck-ai.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");
// templates de exemplo do pacote (repositório: ../../templates · motor empacotado: ./templates)
const TEMPLATE_DIRS = [path.resolve(HERE, "..", "..", "templates"), path.resolve(HERE, "templates")];
const isBundledTemplate = (f) => !!f && TEMPLATE_DIRS.some((d) => path.resolve(f).startsWith(d + path.sep));
const slugify = (s) => String(s || "deck").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deck";

export function createStudioServer(deckPath = null, opts = {}) {
  let currentFile = deckPath ? path.resolve(deckPath) : null;
  let currentSpec = null;

  if (currentFile && fs.existsSync(currentFile)) {
    try {
      currentSpec = loadSpec(currentFile);
    } catch (e) {
      console.warn(`[Studio] Aviso ao carregar ${currentFile}: ${e.message}`);
    }
  }

  if (!currentSpec) {
    // Carregar deck padrão de exemplo se não foi passado nenhum arquivo
    const samplePath = path.join(HERE, "..", "..", "templates", "exemplo.yaml");
    if (fs.existsSync(samplePath)) {
      currentSpec = loadSpec(samplePath);
      currentFile = samplePath;
    } else {
      currentSpec = {
        title: "Minha Apresentação",
        theme: "sinal",
        duration: 15,
        slides: [
          { layout: "cover", title: "Título da Apresentação", subtitle: "Criado com SagaDeck", author: "Seu Nome" },
          { layout: "statement", kicker: "Destaque", text: "Uma ideia forte por slide muda tudo." },
        ],
      };
    }
  }

  let lastPreview = { ok: true, error: null, warnings: [] }; // resultado do último /preview

  // Salva o deck atual no arquivo aberto — nunca por cima dos exemplos que vêm no pacote.
  function persist() {
    if (!currentFile || isBundledTemplate(currentFile)) return;
    try { fs.writeFileSync(currentFile, toYaml(currentSpec), "utf8"); } catch (e) { console.error("[Studio] Erro ao salvar:", e.message); }
  }

  // Onde a IA grava imagens geradas: pasta "imagens" ao lado do deck (ou na pasta atual, se o deck é um exemplo).
  function imageOptions(spec) {
    const deckDir = currentFile && !isBundledTemplate(currentFile) ? path.dirname(currentFile) : process.cwd();
    return { baseDir: spec._dir || deckDir, assetsDir: path.join(deckDir, "imagens") };
  }

  function withBase(spec) {
    if (!spec._dir && currentFile) return { ...spec, _dir: path.dirname(currentFile), _file: currentFile };
    return spec;
  }

  const server = http.createServer(async (req, res) => {
    // Headers completos para permitir embedding seguro em iframes no Arena e navegadores mobile
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Security-Policy", "frame-ancestors *;");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "HEAD" && (pathname === "/" || pathname === "/index.html")) {
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

      if (pathname === "/" || pathname === "/index.html") {
        const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
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
      if (pathname === "/app.js" || pathname === "/ui-icons.js" || pathname === "/slide-form.js") {
        const js = fs.readFileSync(path.join(PUBLIC_DIR, pathname.slice(1)), "utf8");
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(js);
        return;
      }

      // 2. Visualização Completa (Preview Standalone)
      if (pathname === "/preview") {
        let out;
        try {
          out = buildHTML(currentSpec);
        } catch (e) {
          lastPreview = { ok: false, error: e.message, warnings: [] };
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Não consegui montar a apresentação: ${e.message}`);
          return;
        }
        // avisos de montagem (ex.: CSS/widget ao lado do YAML que não foi achado) para o Studio mostrar
        lastPreview = { ok: true, error: null, warnings: out.warnings.filter((w) => !/palavras \(limite/.test(w)) };
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(out.html);
        return;
      }

      if (pathname === "/api/preview-status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(lastPreview));
        return;
      }

      // 3. API Endpoints
      if (pathname === "/api/deck" && req.method === "GET") {
        const rawYaml = toYaml(currentSpec); // sem os campos internos (_dir, _file)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          spec: currentSpec,
          yaml: rawYaml,
          file: currentFile,
          themes: Object.keys(THEMES),
          // para a galeria de temas: nome curto + cores de fundo, texto e destaque
          themeMeta: Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, {
            label: String(t.label || k).split(/\s+[—–-]\s+/)[0],
            desc: String(t.label || "").split(/\s+[—–-]\s+/)[1] || "",
            paper: `#${t.colors.paper}`, ink: `#${t.colors.ink}`, accent: `#${t.colors.accent}`,
          }])),
          file: currentFile,
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
            const keep = body.source === "browser-file" ? {} : Object.fromEntries(Object.entries(currentSpec || {}).filter(([k]) => k.startsWith("_")));
            currentSpec = { ...parsed, ...keep };
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "YAML inválido: " + e.message }));
            return;
          }
        } else if (body.spec) {
          currentSpec = body.spec;
        }
        if (body.filepath) {
          currentFile = path.resolve(body.filepath);
        } else if (body.source === "browser-file") {
          // Deck aberto pelo navegador (seletor/arrastar): o servidor não sabe o caminho dele.
          // Esquece o arquivo anterior — senão as edições deste deck iam parar por cima daquele.
          currentFile = null;
        }
        if (body.saveToFile !== false) persist();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, spec: currentSpec, file: currentFile }));
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
          currentSpec = loadSpec(targetPath);
          currentFile = targetPath;
          const rawYaml = toYaml(currentSpec);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            spec: currentSpec,
            yaml: rawYaml,
            file: currentFile,
          }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Erro ao carregar YAML: ${e.message}` }));
        }
        return;
      }

      if (pathname === "/api/render-slide" && req.method === "POST") {
        const { slide, index, spec } = await readJSON(req);
        const deckSpec = spec || currentSpec;
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

      if (pathname === "/api/napkin" && req.method === "POST") {
        const body = await readJSON(req);
        const { textToVisualSlide, textToVisualDeck } = await import("../diagram/napkin.js");
        const YAML = (await import("yaml")).default;
        const opts = { theme: body.theme, tone: body.tone, title: body.title, kicker: body.kicker };
        let result = null;
        let mode = "rules";
        let notice = "";
        if (body.mode !== "rules" && body.text && await llmAvailable()) {
          try {
            result = await textToSlide(body.text, { ...opts, images: !!body.images, imageOptions: imageOptions(withBase(currentSpec)) });
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
        const targetSpec = spec || currentSpec;
        if (typeof slideIndex === "number" && targetSpec.slides[slideIndex]) {
          const resFix = autofixSlide(targetSpec.slides[slideIndex], targetSpec, issues || []);
          targetSpec.slides[slideIndex] = resFix.slide;
          if (currentFile) {
            try { fs.writeFileSync(currentFile, YAML.stringify(targetSpec, { indent: 2 })); } catch {}
          }
          currentSpec = targetSpec;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, slide: resFix.slide, actions: resFix.actions, spec: targetSpec }));
        } else {
          const resDeck = autofixDeck(targetSpec, issues || []);
          currentSpec = resDeck.spec;
          if (currentFile) {
            try { fs.writeFileSync(currentFile, YAML.stringify(currentSpec, { indent: 2 })); } catch {}
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
        const dir = currentFile && !isBundledTemplate(currentFile) ? path.dirname(currentFile) : process.cwd();
        await respond(res, body.stream, async (emit) => {
          const gen = await generateDeck(body.briefing, {
            theme: body.theme || undefined,
            slides: Number(body.slides) || undefined,
            duration: Number(body.duration) || undefined,
            images: !!body.images,
            imageOptions: { baseDir: dir, assetsDir: path.join(dir, "imagens") },
            onEvent: emit,
          });
          let target = path.join(dir, `${slugify(gen.spec.title)}.yaml`);
          for (let n = 2; fs.existsSync(target); n++) target = path.join(dir, `${slugify(gen.spec.title)}-${n}.yaml`);
          fs.writeFileSync(target, toYaml(gen.spec), "utf8");
          currentFile = target;
          currentSpec = loadSpec(target);
          return { ok: true, spec: currentSpec, file: currentFile, images: gen.images };
        });
        return;
      }

      if (pathname === "/api/ai/chat" && req.method === "POST") {
        const body = await readJSON(req);
        const prompt = body.message || "";
        const slideIdx = typeof body.targetSlide === "number" ? body.targetSlide : 0;
        const spec = body.spec || currentSpec;
        const issues = body.issues || [];

        await respond(res, body.stream, async (emit) => {
          let result;
          if (body.mode !== "rules" && await llmAvailable()) {
            try {
              const target = typeof body.targetSlide === "number" ? body.targetSlide : null;
              const visuals = await lookAt(withBase(spec), target, prompt, emit);
              for (const [i, url] of (Array.isArray(body.attachments) ? body.attachments : []).entries()) {
                if (typeof url === "string" && url.startsWith("data:image/")) visuals.push({ label: `imagem colada pelo usuário ${i + 1}`, dataUrl: url });
              }
              result = await editDeck({
                spec: withBase(spec),
                instruction: prompt,
                targetSlide: target,
                issues,
                images: !!body.images,
                imageOptions: imageOptions(withBase(spec)),
                history: Array.isArray(body.history) ? body.history : [],
                onProgress: emit,
                visuals,
                renderNotes: Array.isArray(body.renderNotes) ? body.renderNotes.slice(0, 8) : [],
              });
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
          currentSpec = result.spec;
          persist();
          return result;
        });
        return;
      }

      if (pathname.startsWith("/api/export/")) {
        const format = pathname.replace("/api/export/", "");
        if (format === "yaml") {
          const y = YAML.stringify(currentSpec, { indent: 2 });
          res.writeHead(200, {
            "Content-Type": "text/yaml; charset=utf-8",
            "Content-Disposition": 'attachment; filename="apresentacao.yaml"',
          });
          res.end(y);
          return;
        }
        if (format === "html") {
          const out = buildHTML(currentSpec);
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
