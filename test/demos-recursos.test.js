// Demos de um assunto só (mapas, programação, APIs com curl): curtas, no lugar de passar pelo Conheça o SagaDeck
// inteiro para ver um recurso. Montam sem aviso, cobrem o assunto e só ele, e abrem pela vitrine.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { demoDeck, demoAssets, DEMO_NAMES } from "../src/studio/demo-decks.js";
import { mapDemos } from "../src/studio/tour.js";
import { ROOT } from "./helpers.js";
import { removeRetry } from "../src/fs-retry.js";

const ASSETS = path.join(ROOT, "src", "studio", "assets");
const layouts = (spec) => spec.slides.map((s) => s.layout);

test("as três demos estão registradas e montam sem nenhum aviso", () => {
  for (const kind of ["mapas", "programacao", "apis"]) {
    assert.ok(DEMO_NAMES[kind], kind);
    const spec = demoDeck(kind);
    assert.equal(spec.title, DEMO_NAMES[kind]);
    assert.deepEqual(buildHTML({ ...spec, _dir: ASSETS }).warnings, [], kind);
    assert.ok(spec.slides.length >= 12 && spec.slides.length <= 20, `${kind}: curta (${spec.slides.length} slides)`);
    assert.equal(spec.slides[0].layout, "cover");
    assert.equal(spec.slides.at(-1).layout, "end");
  }
  assert.notEqual(demoDeck("programacao").theme, demoDeck("apis").theme, "cada demo com a sua cara");
});

test("mapas: todas as demonstrações de mapa do tour, o exemplo do layout e as capturas do Studio", () => {
  const spec = demoDeck("mapas");
  const titulos = spec.slides.map((s) => s.title);
  for (const s of mapDemos()) assert.ok(titulos.includes(s.title), s.title);
  assert.ok(layouts(spec).filter((l) => l === "map").length >= 7);
  assert.deepEqual(demoAssets("mapas"), ["tour-mapa-botao.jpg", "tour-mapa-editor.jpg"], "a cópia leva as capturas do Editar mapa");
  assert.ok(!layouts(spec).some((l) => ["code", "api", "duel"].includes(l)), "só mapa");
});

test("programação: código destacado e guiado, código que roda, algoritmo, Git a dois e diagramas", () => {
  const ls = layouts(demoDeck("programacao"));
  for (const l of ["code", "codewalk", "codelab", "algo", "terminals", "duel", "turns", "diagram", "graphlab", "dossier"]) assert.ok(ls.includes(l), l);
  assert.ok(!ls.includes("map") && !ls.includes("api"), "só programação");
});

test("APIs com curl: anatomia de um curl, chamadas ao vivo abertas na aba curl, polling, streaming e as opções que viram", () => {
  const spec = demoDeck("apis");
  const apis = spec.slides.filter((s) => s.layout === "api");
  assert.ok(apis.length >= 5);
  assert.ok(apis.every((s) => s.tab === "curl"), "toda chamada abre mostrando o curl");
  assert.ok(apis.every((s) => /ENSAIO/.test(s.notes)), "diz que roda na API de mentira do Studio");
  assert.deepEqual(apis.map((s) => s.mode).filter(Boolean).sort(), ["polling", "stream"]);
  const anatomia = spec.slides.find((s) => s.layout === "codewalk");
  assert.match(anatomia.code, /^curl -X POST/);
  assert.match(anatomia.code, /\$API_TOKEN/, "o token vem de variável, nunca escrito");
  const opcoes = spec.slides.find((s) => s.layout === "cards");
  assert.ok(opcoes.items.length >= 6 && opcoes.items.every((c) => c.flip), "as opções viram no clique");
  assert.ok(!layouts(spec).includes("map"), "só API");
});

test("APIs com curl: cada chamada do demo funciona de verdade contra a API de mentira (o ambiente ENSAIO)", { timeout: 60000 }, async () => {
  const { startMockApi, demoEnvFile } = await import("../src/api-demo.js");
  const { ApiEnvironments } = await import("../src/api-client.js");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const mock = await startMockApi({ statuses: ["STARTED", "RUNNING", "FINISHED"] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-demo-apis-"));
  try {
    const envFile = path.join(dir, "ambientes.yaml");
    fs.writeFileSync(envFile, demoEnvFile(mock));
    const api = new ApiEnvironments(envFile);
    for (const s of demoDeck("apis").slides.filter((x) => x.layout === "api")) {
      const r = await api.runSlide(s, { vars: {}, deckDir: dir });
      assert.equal(r.report.ok, true, `${s.title}: ${JSON.stringify(r.report).slice(0, 300)}`);
    }
  } finally { await mock.close(); removeRetry(dir); }
});
