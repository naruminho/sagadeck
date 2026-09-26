import { test } from "node:test";
import assert from "node:assert/strict";
import YAML from "yaml";
import { EXPERIENCES, createExperienceDeck } from "../src/experiences.js";
import { buildHTML } from "../src/build.js";
import { THEMES } from "../src/themes.js";
import { CREATIVE_DIRECTIONS, createDirectionPicker, varietyReport } from "../src/ai/variety.js";
import { generateDeck } from "../src/ai/deck-ai.js";
import { startMockLLM } from "./mock-llm.js";

test("experiências: cada cartão abre um deck completo, renderizável e com narrativa variada", () => {
  assert.deepEqual(EXPERIENCES.map((item) => item.id), ["executivo", "editorial", "palco", "pop", "aula", "minimal"]);
  const themes = new Set(), sequences = new Set();
  for (const item of EXPERIENCES) {
    const spec = createExperienceDeck(item.id);
    assert.ok(THEMES[item.theme], `${item.id}: tema existe`);
    assert.equal(spec.theme, item.theme);
    assert.equal(spec.slides.length, item.slideCount);
    assert.ok(spec.slides.length >= 6 && spec.slides.length <= 9);
    assert.ok(spec.slides.every((slide) => typeof slide.notes === "string" && slide.notes.length > 30), `${item.id}: roteiro do apresentador`);
    assert.equal(spec.slides.at(-1).layout, "end", `${item.id}: encerramento`);
    assert.deepEqual(varietyReport(spec).problems, [], `${item.id}: ritmo`);
    const built = buildHTML(YAML.parse(YAML.stringify(spec)));
    assert.equal(built.slidesMeta.length, item.slideCount, `${item.id}: round-trip YAML`);
    assert.doesNotMatch(built.html, /class="[^"]*fig-pending|Imagem não encontrada/, `${item.id}: figura faltando`); // o CSS de .fig-pending existe em todo HTML
    assert.match(built.html, /data-layout=/);
    themes.add(spec.theme);
    sequences.add(spec.slides.map((slide) => slide.layout).join(","));
  }
  assert.equal(themes.size, EXPERIENCES.length, "paletas e tipografias distintas");
  assert.equal(sequences.size, EXPERIENCES.length, "cada experiência muda a composição e a narrativa");
});

test("experiências: personalizar o título preserva modelos e outras apresentações", () => {
  for (const item of EXPERIENCES) {
    const original = createExperienceDeck(item.id);
    const custom = createExperienceDeck(item.id, { title: "  Meu assunto  ", topic: " Contexto do briefing " });
    assert.equal(custom.title, "Meu assunto");
    assert.equal(custom.slides[0].title, "Meu assunto");
    if (custom.slides[0].text) assert.equal(custom.slides[0].text, "Meu assunto");
    assert.equal(custom.briefing, "Contexto do briefing");
    custom.slides[1].title = "Alteração só neste deck";
    assert.deepEqual(createExperienceDeck(item.id), original, item.id);
    assert.equal(createExperienceDeck(item.id, { title: " " }).title, original.title);
  }
  assert.throws(() => createExperienceDeck("inexistente"), /Experiência desconhecida/);
  assert.throws(() => createExperienceDeck("__proto__"), /Experiência desconhecida/);
});

test("laboratório: código e screenshot incluem etapas úteis e ficam autocontidos", () => {
  const spec = createExperienceDeck("aula");
  const walkthrough = spec.slides.find((slide) => slide.layout === "codewalk");
  const spotlight = spec.slides.find((slide) => slide.layout === "spotlight");
  assert.ok(walkthrough.steps.length >= 3);
  const lines = walkthrough.code.split("\n").length;
  for (const step of walkthrough.steps) {
    assert.ok(step.highlight.every((line) => line >= 1 && line <= lines));
    assert.ok(step.output);
  }
  assert.match(walkthrough.code, /if \(!response.ok\)/);
  assert.match(walkthrough.notes, /não executa código/);
  assert.match(spotlight.image, /^data:image\/svg\+xml;base64,/);
  for (const focus of spotlight.hotspots) {
    assert.ok(focus.x >= 0 && focus.y >= 0 && focus.width > 0 && focus.height > 0);
    assert.ok(focus.x + focus.width <= 100 && focus.y + focus.height <= 100);
  }
});

test("direções: dois ciclos usam todas as opções e não repetem na fronteira", () => {
  const choose = createDirectionPicker(() => 0.42);
  const first = CREATIVE_DIRECTIONS.map(() => choose());
  const second = CREATIVE_DIRECTIONS.map(() => choose());
  assert.equal(new Set(first).size, CREATIVE_DIRECTIONS.length);
  assert.equal(new Set(second).size, CREATIVE_DIRECTIONS.length);
  assert.notEqual(first.at(-1), second[0]);
});

test("geração: quatro decks consecutivos recebem direções distintas e a escolha explícita prevalece", async () => {
  const spec = { title: "Teste", theme: "prata", slides: [{ layout: "cover", title: "Teste" }, { layout: "statement", text: "Uma ideia" }, { layout: "end", title: "Fim" }] };
  const llm = await startMockLLM(() => `\`\`\`yaml\n${YAML.stringify(spec)}\`\`\``);
  const previousUrl = process.env.SAGADECK_LLM_URL;
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const directions = [];
    for (let i = 0; i < 4; i++) {
      const generated = await generateDeck("Uma apresentação sóbria para a diretoria.", { images: false });
      directions.push(generated.direction);
      assert.ok(llm.requests.at(-1).lastUser.includes(generated.direction));
    }
    assert.equal(new Set(directions).size, 4, "a direção não é sorteada com repetição");
    const explicit = await generateDeck("Uma apresentação de produto.", { images: false, direction: "Minha direção específica." });
    assert.equal(explicit.direction, "Minha direção específica.");
    assert.match(llm.requests.at(-1).lastUser, /público e o nível de sobriedade pedidos no briefing têm precedência/);
  } finally {
    if (previousUrl === undefined) delete process.env.SAGADECK_LLM_URL;
    else process.env.SAGADECK_LLM_URL = previousUrl;
    await llm.close();
  }
});
