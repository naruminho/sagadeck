// sagadeck · Servidor MCP (Model Context Protocol) para IDEs Agênticos
// Permite que Cursor, Claude Code, Windsurf, Cline, Roo Code etc. descubram e invoquem
// ferramentas do sagadeck via protocolo JSON-RPC 2.0 padrão sobre stdio.

import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadSpec, buildHTML, buildFile } from "../build.js";
import { autofixDeck } from "../fiscal/autofix.js";
import { THEMES } from "../themes.js";
import { LAYOUTS } from "../layouts.js";
import { createStudioServer } from "../studio/server.js";

const TOOLS = [
  {
    name: "sagadeck_read_deck",
    description: "Lê e analisa a estrutura de um arquivo de apresentação Sagadeck (.yaml), retornando título, tema, slides e notas.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo .yaml da apresentação" },
      },
      required: ["path"],
    },
  },
  {
    name: "sagadeck_inspect_deck",
    description: "Fiscal de layout: inspeciona o deck procurando sobreposição de elementos, transgressão de margens seguras (120px), texto estourado e excesso de palavras (anti-sono).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo .yaml a ser fiscalizado" },
      },
      required: ["path"],
    },
  },
  {
    name: "sagadeck_autofix_deck",
    description: "Auto-cura do Sagadeck: analisa a geometria dos slides e repara automaticamente sobreposições, quebras de margem e excessos de texto no arquivo YAML.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo .yaml" },
        out: { type: "string", description: "Caminho de saída opcional (sobrescreve se omitido)" },
      },
      required: ["path"],
    },
  },
  {
    name: "sagadeck_build_html",
    description: "Compila o arquivo .yaml em uma apresentação .html standalone interativa, com suporte a modo apresentador (P), animações e offline.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo .yaml" },
        out: { type: "string", description: "Caminho de saída do .html (opcional)" },
      },
      required: ["path"],
    },
  },
  {
    name: "sagadeck_create_deck",
    description: "Cria uma nova apresentação Sagadeck com tema e estrutura inicial.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho onde salvar o .yaml" },
        title: { type: "string", description: "Título da apresentação" },
        theme: {
          type: "string",
          enum: ["sinal", "editorial", "noite", "bauhaus", "terminal", "jornal"],
          description: "Tema visual do Sagadeck",
        },
        author: { type: "string", description: "Nome do autor ou palestrante" },
      },
      required: ["path", "title"],
    },
  },
  {
    name: "sagadeck_launch_studio",
    description: "Inicia o SagaDeck Studio (página web estilo PowerPoint com canvas visual, edição WYSIWYG e chat lateral com IA).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo .yaml a carregar no Studio" },
        port: { type: "number", description: "Porta HTTP (padrão: 3000)" },
      },
    },
  },
];

export function runMCPServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const send = (obj) => {
    process.stdout.write(JSON.stringify(obj) + "\n");
  };

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }

    const { id, method, params } = req;

    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "sagadeck-mcp", version: "1.1.0" },
          capabilities: { tools: {} },
        },
      });
      return;
    }

    if (method === "tools/list") {
      send({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      });
      return;
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        const result = await handleToolCall(toolName, args);
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: err.message },
        });
      }
      return;
    }

    // Ping / notifications
    if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    }
  });
}

async function handleToolCall(name, args) {
  switch (name) {
    case "sagadeck_read_deck": {
      const spec = loadSpec(path.resolve(args.path));
      return {
        title: spec.title,
        theme: spec.theme,
        duration: spec.duration,
        slidesCount: spec.slides?.length || 0,
        slides: spec.slides,
      };
    }

    case "sagadeck_inspect_deck": {
      const spec = loadSpec(path.resolve(args.path));
      const res = buildHTML(spec);
      const warnings = res.warnings || [];
      const issues = [];
      // Anti-sleep & boundary checks
      spec.slides.forEach((s, idx) => {
        const words = (JSON.stringify(s).match(/\b\w+\b/g) || []).length;
        if (words > 40) {
          issues.push({ slide: idx + 1, kind: "anti-sono", detail: `${words} palavras (limite 40)` });
        }
        if (s.title && s.title.length > 55 && !s.titleSize) {
          issues.push({ slide: idx + 1, kind: "titulo-longo", detail: "Título longo sem titleSize explícito (risco de sobreposição)" });
        }
      });
      return {
        clean: warnings.length === 0 && issues.length === 0,
        warnings,
        issues,
      };
    }

    case "sagadeck_autofix_deck": {
      const targetPath = path.resolve(args.path);
      const spec = loadSpec(targetPath);
      const fixResult = autofixDeck(spec);
      const outPath = args.out ? path.resolve(args.out) : targetPath;
      fs.writeFileSync(outPath, YAML.stringify(fixResult.spec, { indent: 2 }), "utf8");
      return {
        ok: true,
        savedTo: outPath,
        modifiedSlidesCount: fixResult.modifiedSlidesCount,
        actions: fixResult.actions,
      };
    }

    case "sagadeck_build_html": {
      const targetPath = path.resolve(args.path);
      const outPath = args.out ? path.resolve(args.out) : targetPath.replace(/\.ya?ml$/i, ".html");
      const res = buildFile(targetPath, outPath);
      return {
        ok: true,
        htmlPath: outPath,
        slidesCount: res.meta.slides.length,
        theme: res.theme.name,
      };
    }

    case "sagadeck_create_deck": {
      const targetPath = path.resolve(args.path);
      const content = {
        title: args.title || "Nova Apresentação",
        theme: args.theme || "sinal",
        author: args.author || "Autor",
        duration: 15,
        slides: [
          {
            layout: "cover",
            title: args.title || "Nova Apresentação",
            subtitle: "Apresentação estruturada com Sagadeck",
            author: args.author || "Autor",
          },
          {
            layout: "statement",
            kicker: "Ponto Principal",
            text: "Uma mensagem clara e memorável por slide.",
            tone: "accent",
          },
        ],
      };
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, YAML.stringify(content, { indent: 2 }), "utf8");
      return { ok: true, created: targetPath };
    }

    case "sagadeck_launch_studio": {
      const port = args.port || 3000;
      const server = createStudioServer(args.path, { port });
      server.listen(port, "0.0.0.0");
      return { ok: true, url: `http://localhost:${port}`, message: "Studio ativo" };
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}
