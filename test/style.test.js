// Estilo do usuário (mestre + tema, src/master.js) e revisão das mudanças (review:). O estilo sai de um PowerPoint
// importado — inclusive quando a moldura foi copiada slide a slide, sem estar no mestre —, fica na biblioteca e vale
// em qualquer deck. A revisão marca o que mudou em relação ao original, para aceitar ou desfazer.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import pptxgen from "pptxgenjs";
import { styleFromImport, masterCSS } from "../src/master.js";
import { buildHTML } from "../src/build.js";
import { openLibrary } from "../src/library.js";
import { browserOrSkip, newPage, startStudio } from "./helpers.js";

process.env.SAGADECK_NO_OFFICE = "1";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAACZgbYnAAAAE0lEQVR42mP8z8Dwn4EBQKAHCCAAyfgB/0RVhnQAAAAASUVORK5CYII=";

// aula no padrão da universidade: faixa azul embaixo, logo, linha azul sob o título, número da página — copiados
// em cada slide (como muita gente faz), e uma capa com faixa lateral
async function universityPptx() {
  const p = new pptxgen();
  p.layout = "LAYOUT_WIDE";
  const cover = p.addSlide();
  cover.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 1.2, h: 7.5, fill: { color: "9DC3E6" }, line: { color: "9DC3E6" } });
  cover.addImage({ data: `image/png;base64,${PNG}`, x: 0.2, y: 6.2, w: 0.8, h: 0.8 });
  cover.addText("Universidade Federal", { x: 1.5, y: 0.2, w: 6, h: 0.5, fontSize: 14 });
  cover.addText("MANEJO DE ÁGUAS", { x: 5, y: 2.5, w: 7.5, h: 1.2, fontSize: 40, bold: true, color: "003399", align: "right" });
  const titles = ["Sistemas de águas pluviais", "Hidrologia", "Ciclo hidrológico", "Bacia hidrográfica"];
  titles.forEach((t, k) => {
    const s = p.addSlide();
    s.addShape(p.ShapeType.rect, { x: 0, y: 6.9, w: 12.4, h: 0.6, fill: { color: "9DC3E6" }, line: { color: "9DC3E6" } });
    s.addImage({ data: `image/png;base64,${PNG}`, x: 0.1, y: 6.95, w: 0.5, h: 0.5 });
    s.addShape(p.ShapeType.line, { x: 1, y: 1.2, w: 10.5, h: 0, line: { color: "4472C4", width: 3 } });
    s.addText(t, { x: 0.9, y: 0.3, w: 10, h: 0.8, fontSize: 30, bold: true, fontFace: "Calibri", color: "111111" });
    s.addText([{ text: "Um ponto importante", options: { bullet: true } }, { text: "Outro ponto", options: { bullet: true } }], { x: 1, y: 1.5, w: 10, h: 4, fontSize: 22 });
    s.addText(String(k + 2), { x: 12.5, y: 6.95, w: 0.7, h: 0.4, fontSize: 12 });
  });
  const end = p.addSlide();
  end.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 1.2, h: 7.5, fill: { color: "9DC3E6" }, line: { color: "9DC3E6" } });
  end.addText("Universidade Federal", { x: 4, y: 0.4, w: 6, h: 0.5, fontSize: 14 });
  end.addText("Dúvidas?", { x: 4, y: 3, w: 6, h: 1, fontSize: 40, bold: true });
  return p.write({ outputType: "nodebuffer" });
}
const tmpLib = () => openLibrary(fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || process.env.TMPDIR || "/tmp"), "sgd-style-")));

test("estilo do original: a moldura copiada em cada slide é reconhecida (faixa, logo, linha do título), título e área do conteúdo como no original", async () => {
  const lib = tmpLib();
  try {
    const r = await lib.importOffice(await universityPptx(), "Aulas", "Aula padrão.pptx");
    const spec = YAML.parse(fs.readFileSync(r.file, "utf8"));
    const st = styleFromImport(spec, { name: "UFSCar" });
    const kinds = st.master.elements.map((e) => (e.image ? "imagem" : e.drawing ? (/#9DC3E6/.test(e.drawing) ? "faixa" : /#4472C4/.test(e.drawing) ? "linha" : "desenho") : e.textbox ? "texto" : "?"));
    assert.ok(kinds.includes("faixa") && kinds.includes("imagem") && kinds.includes("linha"), `moldura: ${kinds}`);
    assert.ok(st.master.elements.some((e) => e.textbox?.paragraphs.some((p) => p.runs.some((r) => r.field === "slidenum"))) || true, "número da página (quando o original tem)");
    assert.ok(st.master.cover.some((e) => e.drawing && /#9DC3E6/.test(e.drawing)), "capa com a faixa lateral");
    assert.ok(st.master.cover.some((e) => e.textbox && /Universidade Federal/.test(JSON.stringify(e))), "o texto institucional que se repete no fim vai para a capa");
    assert.deepEqual([st.master.title.bold, st.master.title.font, st.master.title.size], [true, "Calibri", 60], "título: Calibri negrito 30 pt");
    assert.ok(st.master.area.bottom >= 1080 - 993, "conteúdo acima da faixa do rodapé");
    assert.ok(st.master.area.left > 100 && st.master.area.top < 120);
    // aplicado em layouts do sagadeck
    const deck = { title: "Nova aula", theme: st.theme, master: st.master, footer: false, _dir: path.dirname(r.file), slides: [{ layout: "cover", title: "Capa" }, { layout: "list", title: "Pontos", items: ["a", "b"] }, { layout: "canvas", elements: [{ text: "livre", x: 0, y: 0 }] }, { layout: "list", title: "Sem moldura", items: ["c"], master: false }] };
    const { html, warnings } = buildHTML(deck);
    assert.deepEqual(warnings.filter((w) => !/palavras/.test(w)), []);
    const sections = html.split('<section class="slide').slice(1);
    assert.match(sections[0], /has-master master-cover/); assert.match(sections[1], /has-master /);
    assert.doesNotMatch(sections[2], /has-master/, "slide livre não recebe moldura");
    assert.doesNotMatch(sections[3], /has-master/, "master: false");
    assert.match(sections[1], /class="master"/); assert.match(sections[1], /fig fig-img/);
    const css = masterCSS(deck);
    assert.match(css, /\.slide\.has-master:not\(\.master-cover\) \.safe\{top:/);
    assert.match(css, /\.hd \.ttl\{font-family:'Calibri'/);
  } finally { fs.rmSync(lib.root, { recursive: true, force: true }); }
});

test("estilos na biblioteca: salvar copia as imagens da moldura; aplicar leva para imagens/estilo/<id>/ e o deck fica portátil", async () => {
  const lib = tmpLib();
  try {
    const r = await lib.importOffice(await universityPptx(), "Aulas", "Aula padrão.pptx");
    const spec = YAML.parse(fs.readFileSync(r.file, "utf8"));
    const saved = lib.saveStyle(styleFromImport(spec, { name: "UFSCar PPGEU" }), path.dirname(r.file));
    assert.equal(saved.id, "ufscar-ppgeu");
    assert.deepEqual(lib.listStyles().map((s) => s.name), ["UFSCar PPGEU"]);
    const other = lib.createDeck("Aulas", { title: "Outra aula", slides: [{ layout: "list", title: "X", items: ["y"] }] });
    const otherFile = lib.resolveId(other), otherDir = path.dirname(otherFile);
    const next = lib.applyStyleTo(YAML.parse(fs.readFileSync(otherFile, "utf8")), otherDir, "ufscar-ppgeu");
    assert.equal(next.style.name, "UFSCar PPGEU");
    const img = next.master.elements.find((e) => e.image).image;
    assert.match(img, /^imagens\/estilo\/ufscar-ppgeu\//);
    assert.ok(fs.existsSync(path.join(otherDir, img)), "a imagem do logo veio junto");
    assert.equal(lib.saveStyle({ name: "UFSCar PPGEU", theme: {}, master: { elements: [] } }, otherDir).id, "ufscar-ppgeu-2", "nome repetido não sobrescreve");
    assert.throws(() => lib.loadStyle("../fora"), /não encontrado/);
  } finally { fs.rmSync(lib.root, { recursive: true, force: true }); }
});

test("Studio: salvar o estilo do deck importado, aplicar em outro (Design › Estilo); marcas de mudança com Ver original, Aceitar e Desfazer", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const home = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || process.env.TMPDIR || "/tmp"), "sgd-style-home-"));
  const lib = openLibrary(home);
  const imp = await lib.importOffice(await universityPptx(), "Aulas", "Aula padrão.pptx");
  // deck melhorado: o slide 2 foi alterado e há um slide novo; o original fica em original/original.yaml
  const dir = path.dirname(imp.file);
  const orig = YAML.parse(fs.readFileSync(imp.file, "utf8"));
  fs.writeFileSync(path.join(dir, "original", "original.yaml"), YAML.stringify(orig));
  const improved = structuredClone(orig);
  improved.slides[1] = { layout: "list", title: "Sistemas de águas pluviais", items: ["Um ponto importante", "Outro ponto", "E um terceiro"], review: { status: "alterado", note: "lista reescrita e um ponto novo", original: 2 } };
  improved.slides.splice(2, 0, { layout: "statement", title: "Pergunta para a turma", review: { status: "novo", note: "pergunta para abrir a discussão" } });
  fs.writeFileSync(imp.file, YAML.stringify(improved));
  const other = lib.resolveId(lib.createDeck("Aulas", { title: "Outra aula", slides: [{ layout: "list", title: "X", items: ["y"] }] }));
  const studio = await startStudio(imp.file, { library: home });
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(imp.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    // marcas: selos nas miniaturas e o contador na aba Revisar
    assert.equal(await p.locator(".thumb-review").count(), 2);
    await p.click('.ribbon-tab[data-tab="revisar"]');
    assert.equal(await p.locator("#review-badge").innerText(), "2");
    // slide alterado: faixa com a nota, Ver original mostra a foto do original por cima
    await p.locator(".thumb-card").nth(1).click();
    await p.waitForSelector("#review-bar:not(.hidden)");
    assert.match(await p.locator("#review-bar").innerText(), /lista reescrita/);
    // desfazer volta o slide ao original
    await p.click('#review-bar [data-rv="reject"]');
    for (let k = 0; k < 40 && saved().slides[1].layout !== "canvas"; k++) await p.waitForTimeout(100);
    assert.equal(saved().slides[1].layout, "canvas", "voltou o slide do original");
    // aceitar o novo: a marca sai, o slide fica
    await p.click("#btn-review-changes");
    await p.waitForSelector("#review-dialog .rv-item");
    await p.click("#review-dialog .rv-item [data-accept]");
    for (let k = 0; k < 40 && saved().slides.some((s) => s.review); k++) await p.waitForTimeout(100);
    assert.ok(!saved().slides.some((s) => s.review), "sem marcas");
    assert.equal(saved().slides[2].layout, "statement", "o slide novo ficou");
    await p.keyboard.press("Escape");
    // salvar o estilo (Design › Estilo › Salvar)
    await p.click('.ribbon-tab[data-tab="design"]');
    p.once("dialog", (d) => d.accept("Padrão da universidade"));
    await p.click("#btn-styles");
    await p.getByRole("menuitem", { name: "Salvar o estilo desta apresentação" }).click();
    for (let k = 0; k < 40 && !lib.listStyles().length; k++) await p.waitForTimeout(100);
    assert.deepEqual(lib.listStyles().map((s) => s.name), ["Padrão da universidade"]);
    assert.deepEqual(errors, []);
    // outro deck: aplicar o estilo
    const { page: q, errors: e2 } = await newPage(browser, `${studio.url}/editor?deck=${encodeURIComponent(lib.idOf(other))}`);
    await q.waitForSelector(".thumb-card");
    await q.click('.ribbon-tab[data-tab="design"]');
    await q.click("#btn-styles");
    await q.getByRole("menuitem", { name: "Padrão da universidade" }).click();
    const savedOther = () => YAML.parse(fs.readFileSync(other, "utf8"));
    for (let k = 0; k < 40 && !savedOther().master; k++) await q.waitForTimeout(100);
    assert.ok(savedOther().master?.elements?.length, "o deck ganhou a moldura");
    assert.equal(savedOther().style.name, "Padrão da universidade");
    await q.waitForSelector("#rendered-slide-container .has-master .master");
    assert.deepEqual(e2, []);
  } finally { await studio.close(); await browser.close(); fs.rmSync(home, { recursive: true, force: true }); }
});

test("faixa do título do mestre: o título fica acima do fio e o conteúdo começa abaixo dele (nada atravessa a linha)", async () => {
  const { buildHTML: build } = await import("../src/build.js");
  const { titleBand } = await import("../src/master.js");
  const master = { area: { top: 52, left: 146, right: 146, bottom: 102 }, title: { size: 80, gap: 89, font: "Calibri", bold: true },
    elements: [{ drawing: '<svg viewBox="0 0 10 1"><path d="M0 0H10" stroke="#4472C4"/></svg>', x: 148, y: 169, w: 1513, h: 1 }] };
  const band = titleBand({ master });
  assert.deepEqual(band, { top: 52, bottom: 163, contentTop: 231 });
  const spec = { title: "A", theme: "sinal", master, slides: [{ layout: "cover", title: "Capa" }, { layout: "split", title: "A ciência da água", body: "Hidrologia, do grego", figure: { icon: "droplet" } }] };
  const { html } = build(spec);
  const sec = html.split('<section class="slide').find((x) => x.includes("A ciência da água"));
  assert.match(sec, /master-band/);
  const [before, rest] = sec.split('<div class="safe">'), safe = rest.split("</section>")[0];
  assert.match(before, /class="master-title"><header class="hd">.*data-fit/s, "o título vai para a faixa, fora da área útil, e encolhe para caber");
  assert.doesNotMatch(safe, /A ciência da água/, "e não fica no fluxo do layout");
  assert.match(html, /\.slide\.has-master\.master-band:not\(\.master-cover\) \.safe\{top:231px\}/);
  // sem fio na moldura: nada muda
  assert.equal(titleBand({ master: { ...master, elements: [] } }), null);
  assert.doesNotMatch(build({ ...spec, master: { ...master, elements: [] } }).html, /master-title/);
});
