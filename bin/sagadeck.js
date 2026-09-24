#!/usr/bin/env node
// sagadeck — gerador de apresentações.  Uso: sagadeck <comando> <deck.yaml> [opções]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { buildFile, loadSpec, buildHTML } from "../src/build.js";
import { THEMES } from "../src/themes.js";
import { listIcons } from "../src/figures/icons.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// templates: ../templates (repositório) ou ./templates (motor empacotado para o pip)
const TEMPLATES = [path.join(HERE, "..", "templates"), path.join(HERE, "templates")].find((d) => fs.existsSync(d));
const DOCS = [path.join(HERE, "..", "docs"), path.join(HERE, "docs")].find((d) => fs.existsSync(d));
const SKILL = [path.join(HERE, "..", "SKILL.md"), path.join(HERE, "docs", "SKILL.md")].find((f) => fs.existsSync(f));
const VERSION = (() => { for (const f of [path.join(HERE, "..", "package.json"), path.join(HERE, "package.json")]) { try { return JSON.parse(fs.readFileSync(f, "utf8")).version; } catch {} } return "?"; })();
const [, , cmd, ...rawRest] = process.argv;
const flags = {};
const args = [];
for (let i = 0; i < rawRest.length; i++) {
  const item = rawRest[i];
  if (item.startsWith("--")) {
    const eqIdx = item.indexOf("=");
    if (eqIdx !== -1) {
      flags[item.slice(2, eqIdx)] = item.slice(eqIdx + 1);
    } else {
      const key = item.slice(2);
      const next = rawRest[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  } else {
    args.push(item);
  }
}

const HELP = `sagadeck — YAML -> apresentação (HTML animado + PowerPoint editável + PDF + roteiro)

  sagadeck napkin <texto|arquivo> [-o deck.yaml]  transforma texto bruto em diagrama visual (Napkin AI)
  sagadeck scaffold <deck.yaml> [--theme=prata] [--type=pitch|keynote|palestra]  gera esqueleto narrativo pronto (economiza 80% de tokens)
  sagadeck new <deck.yaml> [--theme=sinal]     cria um deck de exemplo
  sagadeck build <deck.yaml>                   gera <deck>.html (abre no navegador; P = modo apresentador)
  sagadeck check <deck.yaml>                   procura texto estourado, sobreposição, contraste, excesso de texto
  sagadeck shots <deck.yaml> [--steps] [--only=3,5]  PNG de cada slide + folhas de contato (para revisar)
  sagadeck pptx <deck.yaml> [--native-charts]  gera <deck>.pptx editável (com animações dos cliques e notas)
  sagadeck pdf <deck.yaml>                     gera <deck>.pdf (um slide por página)
  sagadeck roteiro <deck.yaml>                 gera <deck> - roteiro.pdf (miniaturas + notas + tempos)
  sagadeck all <deck.yaml>                     build + check + pptx + pdf + roteiro
  sagadeck studio [deck.yaml] [--port=3000]    abre o editor visual estilo PowerPoint com chat lateral IA
  sagadeck autofix <deck.yaml> [--out=pasta]   auto-corrige sobreposições, margens e excesso de texto no YAML
  sagadeck mcp                                 inicia o servidor MCP para IDEs agênticos (Cursor, Claude Code, Cline)
  sagadeck watch <deck.yaml>                   recompila o HTML sempre que o YAML mudar
  sagadeck themes [--out=pasta]                gera uma vitrine com todos os temas
  sagadeck icons [filtro]                      lista ícones disponíveis (2.100+)
  sagadeck search <termo> [--limit=5]          pesquisa na web via DuckDuckGo (sem bloqueio) para enriquecer dados
  sagadeck ref                                 imprime a referência completa do YAML (ótimo para dar a um LLM)
  sagadeck skill                               imprime as instruções para agentes de IA
  sagadeck --version

Saídas vão para a pasta do YAML (ou --out=pasta).`;

function paths(yamlFile) {
  if (!yamlFile) { console.error("Informe o arquivo .yaml"); process.exit(1); }
  const abs = path.resolve(yamlFile);
  const out = flags.out ? path.resolve(flags.out) : path.dirname(abs);
  const base = path.basename(abs).replace(/\.(ya?ml)$/i, "");
  return { abs, out, base, html: path.join(out, `${base}.html`), pptx: path.join(out, `${base}.pptx`), pdf: path.join(out, `${base}.pdf`), roteiro: path.join(out, `${base} - roteiro.pdf`), shots: path.join(out, `${base}-revisao`), tmpShots: path.join(os.tmpdir(), `sagadeck-${base.replace(/[^\w-]+/g, "_")}`) };
}

function doBuild(p, quiet) {
  const r = buildFile(p.abs, p.html);
  if (!quiet) {
    console.log(`✓ HTML: ${p.html}`);
    console.log(`  ${r.meta.slides.length} slides · tema ${r.theme.name} · tempo planejado ${r.planned} min${r.spec.duration ? ` de ${r.spec.duration}` : ""}`);
    if (r.warnings.length) { console.log("⚠ Anti-sono:"); r.warnings.forEach((w) => console.log("  - " + w)); }
  }
  return r;
}

async function doCheck(p) {
  const { check } = await import("../src/export/shots.js");
  const { report, errors } = await check(p.html);
  if (errors.length) { console.log("✗ Erros de JavaScript:"); errors.forEach((e) => console.log("  - " + e)); }
  if (!report.length) console.log("✓ check: nenhum problema de layout encontrado");
  else {
    console.log(`⚠ check: ${report.length} slide(s) com possíveis problemas`);
    for (const r of report) for (const i of r.issues) console.log(`  slide ${r.slide}: ${i.kind}${i.px ? ` (${i.px}px)` : ""}${i.ratio ? ` (${i.ratio}:1)` : ""} — "${i.text}"`);
  }
  return report;
}

async function doShots(p, dir = p.shots) {
  const { shots, contactSheet } = await import("../src/export/shots.js");
  const only = flags.only ? String(flags.only).split(",").map(Number) : null;
  const { files, errors } = await shots(p.html, dir, { steps: !!flags.steps, only });
  const sheets = await contactSheet(files, dir);
  console.log(`✓ ${files.length} imagens em ${dir}`);
  sheets.forEach((s) => console.log(`  folha: ${s}`));
  if (errors.length) errors.forEach((e) => console.log("  ✗ " + e));
  return files;
}

async function main() {
  switch (cmd) {
    case "napkin":
    case "visual": {
      const input = args.join(" ").trim();
      if (!input) {
        console.error("Uso: sagadeck napkin <texto bruto ou arquivo.txt> [-o deck.yaml] [--theme=sinal]");
        process.exit(1);
      }
      let content = input;
      if (fs.existsSync(input)) {
        content = fs.readFileSync(input, "utf8");
      }
      const { textToVisualSlide, napkinToYaml } = await import("../src/diagram/napkin.js");
      const theme = flags.theme || "sinal";
      const tone = flags.tone;
      const title = flags.title;

      const outPath = flags.o || flags.out;
      if (outPath) {
        const target = path.resolve(outPath);
        const yamlStr = napkinToYaml(content, { theme, tone, title });
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, yamlStr, "utf8");
        console.log(`✓ Diagrama visual gerado com sucesso em: ${target}`);
      } else {
        const res = textToVisualSlide(content, { theme, tone, title });
        console.log(`✨ [Napkin AI] Padrão detectado: ${res.detectedType.toUpperCase()} (confiança: ${Math.round(res.confidence * 100)}%)`);
        console.log(`💡 Raciocínio: ${res.rationale}\n`);
        const YAML = (await import("yaml")).default;
        console.log(YAML.stringify(res.slide, { indent: 2 }));
      }
      break;
    }
    case "scaffold": {
      const target = path.resolve(args[0] || "apresentacao.yaml");
      if (fs.existsSync(target) && !flags.force) {
        console.error(`Erro: o arquivo ${target} já existe. Use --force para sobrescrever.`);
        process.exit(1);
      }
      const { generateScaffold } = await import("../src/templates/scaffold.js");
      const YAML = (await import("yaml")).default;
      const theme = flags.theme || "prata";
      const type = flags.type || "keynote";
      const title = flags.title || (args[0] ? path.basename(args[0], path.extname(args[0])) : "Nova Apresentação");
      const author = flags.author || "Seu Nome";
      const spec = generateScaffold({ title, theme, type, author });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, YAML.stringify(spec, { indent: 2 }), "utf8");
      console.log(`✓ Esqueleto narrativo gerado em: ${target}`);
      console.log(`  Tipo: ${type} · Tema: ${theme} · Slides: ${spec.slides.length}`);
      console.log(`  Estrutura ideal (cover -> statement -> stats -> steps -> cards -> end) pronta para preenchimento.`);
      break;
    }
    case "new": {
      const target = path.resolve(args[0] || "deck.yaml");
      if (fs.existsSync(target)) { console.error(`${target} já existe`); process.exit(1); }
      let t = fs.readFileSync(path.join(TEMPLATES, "exemplo.yaml"), "utf8");
      if (flags.theme) t = t.replace(/^theme: .*/m, `theme: ${flags.theme}`);
      fs.writeFileSync(target, t);
      console.log(`✓ criado ${target}\n  próximo passo: sagadeck build "${target}"`);
      break;
    }
    case "build": doBuild(paths(args[0])); break;
    case "check": { const p = paths(args[0]); doBuild(p); await doCheck(p); break; }
    case "shots": { const p = paths(args[0]); doBuild(p, true); await doShots(p); break; }
    case "pptx": {
      const p = paths(args[0]); const r = doBuild(p, true);
      const { exportPptx } = await import("../src/export/pptx.js");
      console.log("… exportando PowerPoint");
      const { errors } = await exportPptx(p.html, p.pptx, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta }, nativeCharts: !!flags["native-charts"], log: flags.verbose ? console.log : () => {} });
      errors.forEach((e) => console.log("  ✗ " + e));
      console.log(`✓ PPTX: ${p.pptx}`);
      break;
    }
    case "pdf": {
      const p = paths(args[0]); doBuild(p, true);
      const { pdf } = await import("../src/export/shots.js");
      await pdf(p.html, p.pdf); console.log(`✓ PDF: ${p.pdf}`); break;
    }
    case "roteiro": {
      const p = paths(args[0]); const r = doBuild(p, true);
      const { shots } = await import("../src/export/shots.js");
      const { roteiroPDF } = await import("../src/export/roteiro.js");
      const { files } = await shots(p.html, p.tmpShots + "-mini", { scale: 0.5, jpeg: true });
      await roteiroPDF({ slidesMeta: r.slidesMeta, shotFiles: files, outFile: p.roteiro, title: r.meta.title, author: r.meta.author, duration: r.spec.duration });
      console.log(`✓ Roteiro: ${p.roteiro}`); break;
    }
    case "all": {
      const p = paths(args[0]); const r = doBuild(p);
      await doCheck(p);
      const files = await doShots(p, flags.revisao ? p.shots : p.tmpShots);
      const { exportPptx } = await import("../src/export/pptx.js");
      await exportPptx(p.html, p.pptx, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta }, nativeCharts: !!flags["native-charts"] });
      console.log(`✓ PPTX: ${p.pptx}`);
      const { pdf } = await import("../src/export/shots.js");
      await pdf(p.html, p.pdf); console.log(`✓ PDF: ${p.pdf}`);
      const { roteiroPDF } = await import("../src/export/roteiro.js");
      const { shots: mini } = await import("../src/export/shots.js");
      const small = (await mini(p.html, p.tmpShots + "-mini", { scale: 0.5, jpeg: true })).files;
      await roteiroPDF({ slidesMeta: r.slidesMeta, shotFiles: small, outFile: p.roteiro, title: r.meta.title, author: r.meta.author, duration: r.spec.duration });
      console.log(`✓ Roteiro: ${p.roteiro}`);
      break;
    }
    case "watch": {
      const p = paths(args[0]); doBuild(p);
      console.log("observando mudanças… (Ctrl+C para sair)");
      let t; fs.watch(path.dirname(p.abs), () => { clearTimeout(t); t = setTimeout(() => { try { doBuild(p); } catch (e) { console.error("✗ " + e.message); } }, 150); });
      break;
    }
    case "studio": case "web": {
      const { createStudioServer } = await import("../src/studio/server.js");
      const deckFile = args[0] ? path.resolve(args[0]) : null;
      const port = Number(flags.port || process.env.PORT || 3000);
      const host = flags.host || "0.0.0.0";
      const server = createStudioServer(deckFile, { port, host });
      server.listen(port, host, () => {
        console.log(`✓ SagaDeck Studio rodando em http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
        console.log(`  Visualizador & Editor PowerPoint + Chat Lateral com IA ativo.`);
      });
      break;
    }
    case "autofix": {
      const p = paths(args[0]);
      const { autofixDeck } = await import("../src/fiscal/autofix.js");
      const YAML = (await import("yaml")).default;
      const spec = loadSpec(p.abs);
      console.log(`… analisando e auto-corrigindo ${p.abs}`);
      const res = autofixDeck(spec);
      const outYaml = flags.out ? path.resolve(flags.out) : p.abs;
      fs.writeFileSync(outYaml, YAML.stringify(res.spec, { indent: 2 }), "utf8");
      console.log(`✓ Auto-correção concluída! Salvo em: ${outYaml}`);
      if (res.actions.length === 0) {
        console.log("  Nenhum problema de sobreposição ou margem encontrado.");
      } else {
        console.log(`  ${res.modifiedSlidesCount} slide(s) corrigido(s):`);
        for (const a of res.actions) {
          console.log(`  • Slide ${a.slide} (${a.layout}):`);
          for (const item of a.actions) console.log(`    - ${item}`);
        }
      }
      break;
    }
    case "mcp": {
      const { runMCPServer } = await import("../src/mcp/server.js");
      runMCPServer();
      break;
    }
    case "themes": {
      const out = path.resolve(flags.out || path.join(process.cwd(), "sagadeck-temas"));
      fs.mkdirSync(out, { recursive: true });
      const { shots, contactSheet } = await import("../src/export/shots.js");
      const src = path.join(TEMPLATES, "exemplo.yaml");
      for (const name of Object.keys(THEMES)) {
        const spec = loadSpec(src); spec.theme = name; spec.id = "tema-" + name;
        const html = path.join(out, `tema-${name}.html`);
        fs.writeFileSync(html, buildHTML(spec).html);
        const { files } = await shots(html, path.join(out, `tema-${name}`), {});
        const sheets = await contactSheet(files, path.join(out, `tema-${name}`), { perSheet: 12 });
        console.log(`✓ ${name}: ${html}\n  ${sheets[0]}`);
      }
      break;
    }
    case "icons": { const l = listIcons(args[0]); console.log(l.join("  ")); console.log(`\n${l.length} ícones`); break; }
    case "search": {
      const query = args.join(" ");
      if (!query) {
        console.error("Uso: sagadeck search <termo de busca>");
        process.exit(1);
      }
      const { searchDuckDuckGo } = await import("../src/research/duckduckgo.js");
      const limit = Number(flags.limit || 5);
      console.log(`… pesquisando no DuckDuckGo: "${query}"`);
      try {
        const results = await searchDuckDuckGo(query, { limit });
        if (flags.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(`✓ ${results.length} resultado(s) encontrado(s):\n`);
          results.forEach((r, i) => {
            console.log(`${i + 1}. \x1b[1m${r.title}\x1b[0m`);
            console.log(`   \x1b[36m${r.url}\x1b[0m`);
            if (r.snippet) console.log(`   ${r.snippet}\n`);
          });
        }
      } catch (err) {
        console.error(`✗ Erro na pesquisa: ${err.message}`);
      }
      break;
    }
    case "ref": case "referencia": process.stdout.write(fs.readFileSync(path.join(DOCS, "REFERENCIA.md"), "utf8")); break;
    case "skill": process.stdout.write(fs.readFileSync(SKILL, "utf8")); break;
    case "--version": case "-v": case "version": console.log(`sagadeck ${VERSION}`); break;
    default: console.log(HELP);
  }
}

main().catch((e) => { console.error("✗ " + (e.stack || e.message)); process.exit(1); });
