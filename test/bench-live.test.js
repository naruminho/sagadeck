// Avaliação AO VIVO da geração a partir de documento: para cada PDF de uma pasta, gera pelo caminho do Studio
// (generateForStudio, com o modelo de verdade) e dá nota ao que o motor entregou (src/ai/bench.js). O relatório fica
// numa pasta própria e compara com a rodada anterior: mede o motor, não um deck. Os PDFs são quaisquer exemplos
// (nunca entram no repositório).
//
//   SAGADECK_LIVE=1 SAGADECK_BENCH_DIR=<pasta com PDFs> node --test test/bench-live.test.js
// Opcional: SAGADECK_BENCH_PEDIDO (o pedido de cada geração), SAGADECK_BENCH_IDIOMA (en, pt… para conferir o idioma),
// SAGADECK_BENCH_OUT (relatórios; senão <SAGADECK_BENCH_DIR>/sagadeck-bancada). Os decks ficam na biblioteca
// temporária da suíte.
import { test, after } from "node:test";
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
const skip = !LIVE ? "defina SAGADECK_LIVE=1" : !DIR ? "defina SAGADECK_BENCH_DIR (pasta com PDFs)" : false;
const PEDIDO = process.env.SAGADECK_BENCH_PEDIDO || "Apresentação oral deste artigo num congresso, 15 minutos.";
const IDIOMA = process.env.SAGADECK_BENCH_IDIOMA || "";
// autor das Preferências de mentira: o deck de um documento credita os autores dele, nunca quem usa o sagadeck
const PREFS_AUTHOR = "Pessoa das Preferências";

const pdfs = !skip && fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((n) => /\.pdf$/i.test(n)).sort() : [];
const results = [];
// a revisão dos slides abre um navegador (src/studio/snapshot.js): sem fechar, o processo do teste não termina nunca
after(async () => (await import("../src/studio/snapshot.js")).closeSnapshots());

for (const name of pdfs) {
  test(`avaliação: ${name}`, { timeout: 3 * 3600_000 }, async () => {
    const t0 = Date.now();
    const result = { id: name.replace(/\.pdf$/i, ""), file: name };
    results.push(result);
    try {
      const bytes = fs.readFileSync(path.join(DIR, name));
      const doc = await extractDocText(name, bytes);
      const { dir } = openLibrary(defaultLibraryRoot()).createStagingDeck("Avaliação");
      const gen = await generateForStudio({ briefing: PEDIDO }, {
        dir, materials: [{ name, text: doc.text, detail: doc.detail, bytes }],
        prefs: { autor: PREFS_AUTHOR, perguntar: false, idioma: "auto", imagens: false },
        emit: (e) => { if (e?.phase === "step") console.log(`  [${name}] ${e.text}`); },
      });
      assert.ok(gen.spec?.slides?.length, `a geração não devolveu deck${gen.question ? `; perguntou: ${JSON.stringify(gen.question)}` : ""}`);
      const score = scoreDeck(gen.spec, { materials: storedDocumentMaterials(dir), layouts: { [name]: await pdfLayout(bytes) }, briefing: PEDIDO, expect: { notAuthor: PREFS_AUTHOR, ...(IDIOMA ? { lang: IDIOMA } : {}) } });
      Object.assign(result, score, { deck: dir });
      console.log(`  [${name}] nota ${score.total} · ${Object.entries(score.checks).map(([k, v]) => `${k} ${v.score == null ? "—" : Math.round(v.score * 100)}`).join(" · ")}`);
    } catch (e) { result.error = e.message; throw e; }
    finally { result.seconds = Math.round((Date.now() - t0) / 1000); }
  });
}

test("avaliação: relatório", { skip: skip || (!pdfs.length && `nenhum PDF em ${DIR}`) }, () => {
  if (!results.length) return;
  const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const out = process.env.SAGADECK_BENCH_OUT || path.join(DIR, "sagadeck-bancada");
  const saved = saveBenchReport(out, { date: new Date().toISOString(), version, commit: git("rev-parse", "--short", "HEAD"), model: `${llmConfig().textModel} / ${llmConfig().visionModel} (${llmConfig().url})`, cases: results });
  console.log(`\n${saved.markdown}\nRelatório: ${saved.md}`);
});
