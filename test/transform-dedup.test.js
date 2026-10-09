// dedup de slides repetidos + cutucada de ilustração: sem LLM, só as funções puras.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeSlides, hasImagePrompt } from "../src/ai/transform.js";

test("dedupe: repetido idêntico cai, original/proposta/review ficam", () => {
  const a = { layout: "bullets", title: "Declividade", bullets: ["água escoa"] };
  const b = { layout: "bullets", title: "Declividade", bullets: ["água escoa"] };
  const c = { layout: "title", title: "Declividade" };
  const orig = { layout: "bullets", title: "Declividade", bullets: ["água escoa"], original: { slide: 3 } };
  const prop = { layout: "bullets", title: "Declividade", bullets: ["água escoa"], review: { status: "pendente" } };
  const r = dedupeSlides([a, b, c, orig, prop]);
  assert.equal(r.slides.length, 4);
  assert.deepEqual(r.dropped.map((d) => d.index), [1]);
  assert.ok(r.slides.includes(orig) && r.slides.includes(prop));
});

test("dedupe: mesma frase com imagem diferente não é duplicado", () => {
  const a = { layout: "image", title: "Rio", image: "rio1.png" };
  const b = { layout: "image", title: "Rio", image: "rio2.png" };
  const r = dedupeSlides([a, b]);
  assert.equal(r.slides.length, 2);
  assert.equal(r.dropped.length, 0);
});

test("hasImagePrompt: acha no slide e nos elementos", () => {
  assert.equal(hasImagePrompt({ layout: "title", title: "A" }), false);
  assert.equal(hasImagePrompt({ image_prompt: "draw a dam" }), true);
  assert.equal(hasImagePrompt({ elements: [{ text: "x" }, { image_prompt: "  " }] }), false);
  assert.equal(hasImagePrompt({ add: [{ image_prompt: "cutaway view" }] }), true);
});
