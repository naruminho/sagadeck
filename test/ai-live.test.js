// Com o LLM de VERDADE (modelrelay): o modelo entende sozinho se é conversa, ação ou pedido de versões?
// Só roda com SAGADECK_LIVE=1 (lento, depende do modelo). Ex.: SAGADECK_LIVE=1 node --test test/ai-live.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { editDeck, generateDeck } from "../src/ai/deck-ai.js";
import { loadSpec } from "../src/build.js";
import { plain } from "../src/markup.js";
import { FIXTURE } from "./helpers.js";

const LIVE = process.env.SAGADECK_LIVE === "1";
const opts = { skip: !LIVE && "defina SAGADECK_LIVE=1", timeout: 240000 };
const spec = () => loadSpec(FIXTURE);
const idx = (s, layout) => s.slides.findIndex((x) => x.layout === layout);

const TALK = [
  ["o que você acha da capa?", "cover"],
  ["tô pensando em abrir com uma história pessoal em vez desse título, faz sentido?", "cover"],
  ["essa linha do tempo tá boa ou ficou fraca?", "timeline"],
  ["me dá umas ideias pra deixar esse slide menos chato", "cards"],
];

for (const [msg, layout] of TALK) {
  test(`conversa (não mexe): "${msg}"`, opts, async () => {
    const s = spec();
    const r = await editDeck({ spec: s, instruction: msg, targetSlide: idx(s, layout) });
    assert.ok(r.talk, `a IA mexeu no deck em vez de conversar: ${r.reply}`);
    assert.deepEqual(r.spec.slides, s.slides);
    assert.ok(r.options?.length >= 2, `sem opções clicáveis: ${r.reply}`);
  });
}

test('ação: "muda o título da capa para Fraudes no Pix"', opts, async () => {
  const s = spec();
  const r = await editDeck({ spec: s, instruction: "muda o título da capa para Fraudes no Pix", targetSlide: 0 });
  assert.ok(!r.talk && !r.variants, r.reply);
  assert.match(plain(r.spec.slides[0].title), /Fraudes no Pix/); // destaque (==Pix==) é escolha dela
});

test('versões: "me mostra 3 versões diferentes desse slide de indicadores"', opts, async () => {
  const s = spec();
  const r = await editDeck({ spec: s, instruction: "me mostra 3 versões diferentes desse slide de indicadores", targetSlide: idx(s, "stats") });
  assert.ok(r.variants, `não veio versões: ${r.reply}`);
  assert.ok(r.variants.options.length >= 2);
  assert.deepEqual(r.spec.slides, s.slides, "nada muda até escolher");
});

test("refinamento: conversa e depois 'pode fazer' aplica o combinado", opts, async () => {
  const s = spec();
  const i = idx(s, "statement");
  const history = [
    { role: "user", text: "o que você acha desse slide da frase?" },
    { role: "assistant", text: "A frase é boa, mas genérica. Sugiro trocar por algo concreto: \"Fraude no Pix cresceu 40% em 2025\", com ==40%== destacado." },
  ];
  const r = await editDeck({ spec: s, instruction: "gostei, pode fazer", targetSlide: i, history });
  assert.ok(!r.talk, `ficou só conversando: ${r.reply}`);
  assert.match(JSON.stringify(r.spec.slides[i]), /40%/);
});

test("gerar deck: sai variado (sem 3 layouts iguais seguidos, com slides de impacto)", { ...opts, timeout: 600000 }, async () => {
  const { generateDeck } = await import("../src/ai/deck-ai.js");
  const { varietyReport } = await import("../src/ai/variety.js");
  const r = await generateDeck("Palestra de 15 minutos para gestores de um banco sobre como detectar fraudes no Pix com dados.", { slides: 10 });
  const v = varietyReport(r.spec);
  console.log(`direção: ${r.direction}\nlayouts: ${r.spec.slides.map((s) => s.layout).join(", ")}`);
  assert.deepEqual(v.problems, [], v.problems.join("; "));
});

test('slides citados: "arrume os slides 3 e 4 pra ficarem mais bonitos"', opts, async () => {
  const s = spec();
  const r = await editDeck({ spec: s, instruction: "arrume os slides 3 e 4 pra ficarem mais bonitos", targetSlide: 0, images: true });
  const changed = r.spec.slides.map((x, i) => (JSON.stringify(x) !== JSON.stringify(s.slides[i]) ? i + 1 : 0)).filter(Boolean);
  console.log(`  mudou: ${changed.join(", ")} | ${r.reply.slice(0, 120)}`);
  assert.ok(changed.includes(3) && changed.includes(4), `mudou ${changed}`);
  assert.ok(!changed.includes(1), "não mexeu no slide da tela");
});

test('sem pedir imagem, não gera ("deixa esse slide mais bonito")', opts, async () => {
  const s = spec();
  const i = s.slides.findIndex((x) => x.layout === "statement");
  const r = await editDeck({ spec: s, instruction: "deixa esse slide mais bonito", targetSlide: i, images: true });
  assert.ok(!r.actions.some((a) => /Imagem gerada/.test(a)), r.actions.join("; "));
  assert.doesNotMatch(JSON.stringify(r.spec.slides[i]), /image_prompt|imagens\//);
});

test('pedindo, gera ("coloca uma foto de um cofre de banco nesse slide")', opts, async () => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-live-"));
  const s = spec();
  const i = s.slides.findIndex((x) => x.layout === "statement");
  const r = await editDeck({ spec: s, instruction: "coloca uma foto de um cofre de banco nesse slide", targetSlide: i, images: true,
    imageOptions: { baseDir: dir, assetsDir: path.join(dir, "imagens") } });
  console.log(`  ${r.actions.join(" | ")}`);
  assert.ok(r.actions.some((a) => /Imagem gerada/.test(a)), r.actions.join("; "));
});

for (const [label, extra, check] of [
  ["você decide onde ilustrar → alguns slides, não todos", " Você decide onde vale ilustrar com imagens.", (n, total) => n >= 1 && n <= total - 2],
  ["sem falar de imagens → nenhuma", "", (n) => n === 0],
]) {
  test(`gerar deck: ${label}`, { ...opts, timeout: 900000 }, async () => {
    const os = await import("node:os");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { generateDeck } = await import("../src/ai/deck-ai.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-live-"));
    const r = await generateDeck("Palestra de 10 minutos para gestores de um banco sobre golpes no Pix e como a análise de dados ajuda." + extra,
      { slides: 8, imageOptions: { baseDir: dir, assetsDir: path.join(dir, "imagens") } });
    const n = r.images.done.length + r.images.failed.length;
    console.log(`  ${n} imagem(ns) em ${r.spec.slides.length} slides: ${r.images.done.map((d) => d.prompt.slice(0, 50)).join(" | ")}`);
    assert.ok(check(n, r.spec.slides.length), `${n} imagens em ${r.spec.slides.length} slides`);
  });
}

// Para que serve o material: o modelo decide (e pergunta quando não dá para saber)
const PURPOSE = [
  ["Apostila de Git para o meu time guardar e consultar depois: explique branches, rebase e conflitos com exemplos de comandos.", ["consulta", "aula"]],
  ["Pitch de 5 minutos para a diretoria aprovar o orçamento do projeto de migração para a nuvem.", ["executiva", "palestra"]],
];
for (const [brief, ok] of PURPOSE) {
  test(`purpose: "${brief.slice(0, 50)}…"`, { ...opts, timeout: 600000 }, async () => {
    const r = await generateDeck(brief, { duration: 6, images: false });
    assert.ok(ok.includes(r.spec.purpose), `purpose ${r.spec.purpose} (esperado ${ok.join(" ou ")})`);
    if (ok.includes("consulta")) {
      const media = r.spec.slides.reduce((n, s) => n + (JSON.stringify({ ...s, notes: undefined }).split(/\s+/).length), 0) / r.spec.slides.length;
      assert.ok(media > 45, `material de consulta com pouco texto na tela (${Math.round(media)} palavras/slide)`);
      assert.ok(!r.spec.slides.some((s) => ["question", "poll"].includes(s.layout)), "consulta sem quiz/enquete");
    }
  });
}
test('purpose ambíguo com "perguntar": "um workshop de docker pro time"', { ...opts, timeout: 300000 }, async () => {
  const r = await generateDeck("um workshop de docker pro time", { duration: 30, images: false, ask: true });
  assert.ok(r.question?.question, `a IA gerou sem perguntar (purpose ${r.spec?.purpose})`);
});

// O que a pessoa diz com todas as letras sobre a quantidade de texto vence o tipo de material (e não precisa perguntar)
test('quantidade de texto explícita: "workshop… com bastante texto" não pergunta e aceita texto longo', { ...opts, timeout: 600000 }, async () => {
  const r = await generateDeck("Workshop de Docker para o time, com bastante texto explicativo em cada slide porque o pessoal vai estudar depois.", { duration: 6, images: false, ask: true });
  assert.ok(!r.question, `perguntou sem precisar: ${r.question?.question}`);
  assert.ok((r.spec.maxWords || 0) >= 150 || ["aula", "consulta"].includes(r.spec.purpose), `limite ${r.spec.maxWords}, purpose ${r.spec.purpose}`);
});
test('quantidade de texto explícita: "aula… com pouco texto, só tópicos" fica enxuta', { ...opts, timeout: 600000 }, async () => {
  const r = await generateDeck("Aula de Git para calouros, com pouco texto nos slides, só tópicos; eu explico falando.", { duration: 6, images: false, ask: true });
  assert.ok(!r.question, `perguntou sem precisar: ${r.question?.question}`);
  assert.ok((r.spec.maxWords && r.spec.maxWords <= 60) || ["palestra", "workshop"].includes(r.spec.purpose), `limite ${r.spec.maxWords}, purpose ${r.spec.purpose}`);
});
