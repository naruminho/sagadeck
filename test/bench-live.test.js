// Bancada de qualidade AO VIVO: gera decks a partir de PDFs fixos pelo caminho do Studio (generateForStudio, com o
// modelo de verdade) e dá nota (src/ai/bench.js). O relatório fica numa pasta própria e compara com a rodada
// anterior: é assim que se sabe se a geração a partir de paper melhorou, sem abrir deck por deck.
//
// Os PDFs não entram no repositório (são de terceiros): ficam em SAGADECK_BENCH_DIR. Rodar:
//   SAGADECK_LIVE=1 SAGADECK_BENCH_DIR=C:\Users\narum\Downloads node --test test/bench-live.test.js
// Só alguns casos: SAGADECK_BENCH_CASOS=eucalipto,icfm10-en. Relatórios: SAGADECK_BENCH_OUT (senão
// <SAGADECK_BENCH_DIR>/sagadeck-bancada). Os decks gerados ficam na biblioteca temporária da suíte.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./helpers.js";
import { openLibrary, defaultLibraryRoot } from "../src/library.js";
import { extractDocText } from "../src/ai/context.js";
import { storedDocumentMaterials } from "../src/ai/document-materials.js";
import { pdfLayout } from "../src/ai/document-visuals.js";
import { llmConfig } from "../src/ai/llm.js";
import { generateForStudio } from "../src/studio/generate.js";
import { scoreDeck, saveBenchReport } from "../src/ai/bench.js";

const DIR = process.env.SAGADECK_BENCH_DIR;
const LIVE = process.env.SAGADECK_LIVE === "1";
const skip = !LIVE ? "defina SAGADECK_LIVE=1" : !DIR ? "defina SAGADECK_BENCH_DIR (pasta com os PDFs)" : false;

// autor das Preferências de mentira: o deck de um paper credita os autores do paper, nunca quem usa o sagadeck
const PREFS_AUTHOR = "Pessoa das Preferências";
const CASES = [
  { id: "eucalipto", file: "75286_pt.pdf", briefing: "Apresentação oral de 15 minutos sobre este artigo num congresso de sensoriamento remoto.", expect: { lang: "pt" } },
  { id: "beberibe", file: "93d854559fbed77d3b0fb078919cdb3e9edb.pdf", briefing: "Apresentação deste artigo num simpósio de recursos hídricos, 15 minutos.", expect: { lang: "pt" } },
  { id: "icfm10-en", file: "ICFM10 Full - 080.pdf", briefing: "Apresentação que a Maria Clara vai fazer no ICFM10 sobre o artigo dela, em inglês. Ela vai apresentar o artigo dela.", expect: { lang: "en", author: "Fava" } },
  { id: "icfm10-pt", file: "ICFM10 Full - 080.pdf", briefing: "Apresentação que a Maria Clara vai fazer sobre o artigo dela, em português. Ela vai apresentar o artigo dela.", expect: { lang: "pt", author: "Fava" } },
];

const wanted = (process.env.SAGADECK_BENCH_CASOS || "").split(",").map((s) => s.trim()).filter(Boolean);
const cases = CASES.filter((c) => !wanted.length || wanted.includes(c.id));
const results = [];

for (const c of cases) {
  const file = DIR ? path.join(DIR, c.file) : "";
  const missing = !skip && !fs.existsSync(file) && `falta ${c.file} em ${DIR}`;
  test(`bancada: ${c.id}`, { skip: skip || missing, timeout: 3 * 3600_000 }, async () => {
    const t0 = Date.now();
    const result = { id: c.id, file: c.file };
    results.push(result);
    try {
      const bytes = fs.readFileSync(file);
      const doc = await extractDocText(c.file, bytes);
      const lib = openLibrary(defaultLibraryRoot());
      const { dir } = lib.createStagingDeck("Bancada");
      const gen = await generateForStudio({ briefing: c.briefing }, {
        dir, materials: [{ name: c.file, text: doc.text, detail: doc.detail, bytes }],
        prefs: { autor: PREFS_AUTHOR, perguntar: false, idioma: "auto", imagens: false },
        emit: (e) => { if (e?.phase === "step") console.log(`  [${c.id}] ${e.text}`); },
      });
      assert.ok(gen.spec?.slides?.length, `a geração não devolveu deck${gen.question ? `; perguntou: ${JSON.stringify(gen.question)}` : ""}`);
      const materials = storedDocumentMaterials(dir);
      const score = scoreDeck(gen.spec, { materials, layouts: { [c.file]: await pdfLayout(bytes) }, briefing: c.briefing, expect: { ...c.expect, notAuthor: PREFS_AUTHOR } });
      Object.assign(result, score, { deck: dir });
      console.log(`  [${c.id}] nota ${score.total} · ${Object.entries(score.checks).map(([k, v]) => `${k} ${v.score == null ? "—" : Math.round(v.score * 100)}`).join(" · ")}`);
    } catch (e) { result.error = e.message; throw e; }
    finally { result.seconds = Math.round((Date.now() - t0) / 1000); }
  });
}

test("bancada: relatório", { skip: skip || !cases.length }, () => {
  if (!results.length) return;
  const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const out = process.env.SAGADECK_BENCH_OUT || path.join(DIR, "sagadeck-bancada");
  const saved = saveBenchReport(out, { date: new Date().toISOString(), version, commit: git("rev-parse", "--short", "HEAD"), model: `${llmConfig().textModel} / ${llmConfig().visionModel} (${llmConfig().url})`, cases: results });
  console.log(`\n${saved.markdown}\nRelatório: ${saved.md}`);
});
