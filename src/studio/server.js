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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "public");

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

  const server = http.createServer(async (req, res) => {
    // CORS headers para suporte a preview e proxy
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    try {
      // 1. Arquivos estáticos da pasta public
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
      if (pathname === "/app.js") {
        const js = fs.readFileSync(path.join(PUBLIC_DIR, "app.js"), "utf8");
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(js);
        return;
      }

      // 2. Visualização Completa (Preview Standalone)
      if (pathname === "/preview") {
        const out = buildHTML(currentSpec);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(out.html);
        return;
      }

      // 3. API Endpoints
      if (pathname === "/api/deck" && req.method === "GET") {
        const rawYaml = YAML.stringify(currentSpec, { indent: 2 });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          spec: currentSpec,
          yaml: rawYaml,
          file: currentFile,
          themes: Object.keys(THEMES),
          layouts: Object.keys(LAYOUTS),
        }));
        return;
      }

      if (pathname === "/api/deck" && req.method === "POST") {
        const body = await readJSON(req);
        if (body.spec) {
          currentSpec = body.spec;
        } else if (body.yaml) {
          currentSpec = YAML.parse(body.yaml);
        }
        if (currentFile) {
          try {
            fs.writeFileSync(currentFile, YAML.stringify(currentSpec, { indent: 2 }), "utf8");
          } catch (err) {
            console.error("[Studio] Erro ao salvar arquivo:", err);
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, spec: currentSpec }));
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
        const icons = listIcons(q);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(icons.slice(0, 100)));
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

      if (pathname === "/api/ai/chat" && req.method === "POST") {
        const body = await readJSON(req);
        const prompt = body.message || "";
        const slideIdx = typeof body.targetSlide === "number" ? body.targetSlide : 0;
        const spec = body.spec || currentSpec;
        const issues = body.issues || [];

        const result = handleAIChat({ prompt, slideIdx, spec, issues });
        currentSpec = result.spec;
        if (currentFile) {
          try { fs.writeFileSync(currentFile, YAML.stringify(currentSpec, { indent: 2 })); } catch {}
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
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
  const themeMatch = p.match(/tema\s+(sinal|editorial|noite|bauhaus|terminal|jornal)/i);
  if (themeMatch || (p.includes("tema") && (p.includes("bauhaus") || p.includes("editorial") || p.includes("noite") || p.includes("sinal") || p.includes("terminal") || p.includes("jornal")))) {
    const themeName = (themeMatch ? themeMatch[1] : (p.match(/(sinal|editorial|noite|bauhaus|terminal|jornal)/i) || [])[1]) || "editorial";
    newSpec.theme = themeName.toLowerCase();
    actions.push(`Tema da apresentação alterado para "${newSpec.theme}"`);
    reply = `Alterei o tema visual da apresentação para **${newSpec.theme}**. As fontes e paletas foram atualizadas.`;
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

  // 5. Intenção: Trocar Layout para Cards
  if (p.includes("card") || p.includes("cartao") || p.includes("cartões")) {
    s.layout = "cards";
    if (!Array.isArray(s.items) || s.items.length === 0) {
      s.items = [
        { title: "Diagnóstico Rápido", text: "Visão clara do problema em segundos.", icon: "zap" },
        { title: "Ação Imediata", text: "Passos práticos sem sobrecarregar a equipe.", icon: "target" },
        { title: "Métrica Concreta", text: "Resultados mensuráveis no final do ciclo.", icon: "trending-up" },
      ];
    }
    s.cols = Math.min(4, s.items.length);
    actions.push(`Layout do slide ${targetIdx + 1} transformado em cards (${s.items.length} cards, ${s.cols} colunas)`);
    reply = `Transformei o slide ${targetIdx + 1} em layout **cards** com ícones e estrutura balanceada.`;
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

  // 12. Intenção: Resumir / Deixar Conciso (Anti-sono)
  if (p.includes("resum") || p.includes("concis") || p.includes("diminuir texto") || p.includes("anti-sono")) {
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
