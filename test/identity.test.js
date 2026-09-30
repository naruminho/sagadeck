// Identidade persistente: uid de slide e chave de objeto pelo conteúdo. Critério: inserir, reordenar ou transformar
// elementos não pode transferir um ajuste para outro objeto; a junção com a IA é campo a campo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { ensureUids } from "../src/uid.js";
import { renderSlide, buildHTML } from "../src/build.js";
import { migrateLegacyKeys, carryVisualEdits } from "../src/studio/visual-keys.js";
import { applyPatch } from "../src/ai/deck-ai.js";
import "../src/studio/public/merge-decks.js";
import { startStudio, tempDeck } from "./helpers.js";

const { mergeDecks } = globalThis.SagadeckMerge;
const keysOf = (slide) => [...renderSlide(slide, 0, { slides: [slide] }).html.matchAll(/data-vkey="([^"]+)"/g)].map((m) => m[1]);
const txt = (t, y) => ({ text: t, x: 0, y, w: 600, h: 80 });
const moved = (slide, word) => {
  const html = renderSlide(slide, 0, { slides: [slide] }).html;
  const tag = [...html.matchAll(/<div[^>]*data-vkey="[^"]+"[^>]*>([^<]*)/g)].find((m) => m[1].includes(word));
  return /translate:40px/.test(tag?.[0] || "");
};

test("uid: cada slide ganha o seu, repetido é trocado, o que já tem fica", () => {
  const spec = { slides: [{ layout: "cover", title: "a", uid: "sfixo" }, { layout: "cover", title: "b", uid: "sfixo" }, { layout: "cover", title: "c" }] };
  assert.equal(ensureUids(spec), 2);
  assert.equal(spec.slides[0].uid, "sfixo");
  assert.equal(new Set(spec.slides.map((s) => s.uid)).size, 3);
  assert.match(buildHTML(spec).html, /data-uid="sfixo"/);
});

test("ajuste visual preso ao objeto: inserir antes, reordenar e duplicar não passam o ajuste para outro", () => {
  const slide = { layout: "canvas", elements: [txt("Alfa", 0), txt("Beta", 100)] };
  const [kA, kB] = keysOf(slide);
  assert.notEqual(kA, kB);
  const ve = { [kB]: { dx: 40 } };
  assert.ok(moved({ ...slide, visualEdits: ve }, "Beta") && !moved({ ...slide, visualEdits: ve }, "Alfa"));
  // um texto novo antes de todos: o ajuste continua no Beta
  const ins = { layout: "canvas", elements: [txt("Novo", 0), txt("Alfa", 100), txt("Beta", 200)], visualEdits: ve };
  assert.ok(moved(ins, "Beta") && !moved(ins, "Alfa") && !moved(ins, "Novo"));
  // reordenar: vai junto
  const re = { layout: "canvas", elements: [txt("Beta", 0), txt("Alfa", 100)], visualEdits: ve };
  assert.ok(moved(re, "Beta") && !moved(re, "Alfa"));
  // dois objetos iguais: chaves diferentes (~2)
  const dup = keysOf({ layout: "canvas", elements: [txt("Igual", 0), txt("Igual", 100)] });
  assert.equal(new Set(dup).size, 2);
  assert.match(dup[1], /~2$/);
});

test("deck antigo: a chave pela ordem vira a chave pelo conteúdo, sem perder o ajuste", () => {
  const spec = { slides: [{ layout: "canvas", elements: [txt("Alfa", 0), txt("Beta", 100)], visualEdits: { "t-f-body-r-body-1": { dx: 40 } } }] };
  assert.equal(migrateLegacyKeys(spec), 1);
  const k = Object.keys(spec.slides[0].visualEdits)[0];
  assert.ok(k.includes("~"), k);
  // depois da migração, inserir um texto antes não muda nada
  spec.slides[0].elements.unshift(txt("Novo", 0));
  assert.ok(moved(spec.slides[0], "Beta") && !moved(spec.slides[0], "Alfa"));
});

test("texto do objeto mudou (pela pessoa ou pela IA): o ajuste acompanha; mudar OUTRO objeto não mexe", () => {
  const s = { uid: "s1", layout: "canvas", elements: [txt("Alfa", 0), txt("Beta", 100)] };
  s.visualEdits = { [keysOf(s)[1]]: { dx: 40 } };
  const prev = { slides: [s] };
  const next = structuredClone(prev);
  next.slides[0].elements[1].text = "Beta revisado";
  assert.equal(carryVisualEdits(prev, next), 1);
  assert.ok(moved(next.slides[0], "Beta revisado") && !moved(next.slides[0], "Alfa"));
  // um texto novo (e nenhum sumiu): nada a carregar
  const more = structuredClone(next); more.slides[0].elements.push(txt("Gama", 300));
  assert.equal(carryVisualEdits(next, more), 0);
  assert.ok(moved(more.slides[0], "Beta revisado") && !moved(more.slides[0], "Gama"));
});

test("junção com a IA por uid, campo a campo: título da IA + ajuste da pessoa no mesmo slide; inserções e reordenações", () => {
  const base = { title: "D", slides: [{ uid: "a", layout: "cover", title: "Capa" }, { uid: "b", layout: "statement", text: "Frase" }, { uid: "c", layout: "statement", text: "Outra" }] };
  const mine = structuredClone(base); mine.slides[1].visualEdits = { "t~x": { dx: 10 } };
  const ai = structuredClone(base); ai.slides[1].text = "Frase melhor"; ai.slides.splice(2, 0, { layout: "statement", text: "Nova da IA" });
  const r = mergeDecks(base, mine, ai);
  assert.deepEqual(r.deck.slides.map((s) => s.text || s.title), ["Capa", "Frase melhor", "Nova da IA", "Outra"]);
  assert.deepEqual(r.deck.slides[1].visualEdits, { "t~x": { dx: 10 } }, "o ajuste da pessoa ficou junto do texto da IA");
  assert.deepEqual(r.conflicts, []);
  // ajustes: cada objeto junta por chave (a IA mexe num, a pessoa noutro)
  const b2 = structuredClone(base); b2.slides[0].visualEdits = { "t~1": { dx: 1 }, "t~2": { dx: 2 } };
  const m2 = structuredClone(b2); m2.slides[0].visualEdits["t~1"] = { dx: 5 };
  const a2 = structuredClone(b2); a2.slides[0].visualEdits["t~2"] = { dx: 9 };
  assert.deepEqual(mergeDecks(b2, m2, a2).deck.slides[0].visualEdits, { "t~1": { dx: 5 }, "t~2": { dx: 9 } });
  // a pessoa reordenou enquanto a IA mudou um texto: fica a ordem dela, com o texto da IA
  const m3 = structuredClone(base); m3.slides.reverse();
  const a3 = structuredClone(base); a3.slides[0].title = "Capa nova";
  assert.deepEqual(mergeDecks(base, m3, a3).deck.slides.map((s) => s.uid), ["c", "b", "a"]);
  assert.equal(mergeDecks(base, m3, a3).deck.slides[2].title, "Capa nova");
  // a IA apagou um slide que a pessoa mudou: fica o da pessoa, com o aviso
  const m4 = structuredClone(base); m4.slides[2].text = "Outra (mexida)";
  const a4 = structuredClone(base); a4.slides.splice(2, 1); a4.slides[0].title = "Capa 2";
  const r4 = mergeDecks(base, m4, a4);
  assert.deepEqual(r4.deck.slides.map((s) => s.uid), ["a", "b", "c"]);
  assert.equal(r4.deck.slides[2].text, "Outra (mexida)");
  assert.deepEqual(r4.conflicts, [2]);
  // mesmo campo mudado pelos dois: vale o da pessoa, com conflito
  const m5 = structuredClone(base); m5.slides[1].text = "da pessoa";
  const a5 = structuredClone(base); a5.slides[1].text = "da IA";
  const r5 = mergeDecks(base, m5, a5);
  assert.equal(r5.deck.slides[1].text, "da pessoa"); assert.deepEqual(r5.conflicts, [1]);
});

test("a IA troca um slide inteiro: a identidade (uid) e os ajustes ficam; o prompt não mostra o uid", () => {
  const base = { title: "D", slides: [{ uid: "a1", layout: "cover", title: "Capa", visualEdits: { "t~k": { dx: 3 } } }] };
  const { spec } = applyPatch(base, { slides: { 1: { layout: "statement", text: "Nova" } } });
  assert.equal(spec.slides[0].uid, "a1");
  assert.deepEqual(spec.slides[0].visualEdits, { "t~k": { dx: 3 } });
});

test("Studio: gravar com o texto mudado devolve o ajuste já levado para o objeto novo; o deck ganha uid", async () => {
  const deck = tempDeck();
  const spec = YAML.parse(fs.readFileSync(deck.file, "utf8"));
  const i = spec.slides.push({ layout: "canvas", elements: [txt("Alfa", 0), txt("Beta", 100)] }) - 1;
  spec.slides[i].visualEdits = { [keysOf(spec.slides[i])[1]]: { dx: 40 } };
  fs.writeFileSync(deck.file, YAML.stringify(spec));
  const studio = await startStudio(deck.file);
  try {
    const got = await (await fetch(`${studio.url}/api/deck`)).json();
    assert.ok(got.spec.slides.every((s) => s.uid), "todo slide com uid");
    const edited = structuredClone(got.spec);
    edited.slides[i].elements[1].text = "Beta 2";
    const res = await (await fetch(`${studio.url}/api/deck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: edited }) })).json();
    assert.ok(moved(res.spec.slides[i], "Beta 2"), "o ajuste foi junto com o texto");
    const saved = YAML.parse(fs.readFileSync(deck.file, "utf8"));
    assert.ok(saved.slides.every((s) => s.uid), "uids gravados");
  } finally { await studio.close(); deck.cleanup(); }
});

test("junção: deck sem uid de um lado (veio da geração) e com uid do outro: a mudança da IA não se perde", () => {
  const base = { title: "D", slides: [{ layout: "cover", title: "Deck gerado" }, { layout: "end", title: "Fim" }] };
  const mine = { title: "D", slides: [{ layout: "cover", title: "Deck gerado", uid: "u1" }, { layout: "end", title: "Fim", uid: "u2" }] };
  const ai = { title: "D", slides: [{ layout: "cover", title: "Deck gerado", kicker: "Conta 42" }, { layout: "end", title: "Fim" }] };
  const r = mergeDecks(base, mine, ai);
  assert.equal(r.deck.slides[0].kicker, "Conta 42");
  assert.deepEqual(r.deck.slides.map((s) => s.uid), ["u1", "u2"], "a identidade fica");
  assert.deepEqual(r.conflicts, []);
  // a pessoa mexeu (no deck com uid) e a IA inseriu (sem uid): as duas coisas ficam
  const mine2 = structuredClone(mine); mine2.slides[1].title = "Fim meu";
  const ai2 = { title: "D", slides: [base.slides[0], { layout: "statement", text: "Nova" }, base.slides[1]] };
  const r2 = mergeDecks(base, mine2, ai2);
  assert.deepEqual(r2.deck.slides.map((s) => s.title || s.text), ["Deck gerado", "Nova", "Fim meu"]);
});
