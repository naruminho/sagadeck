// Importar PowerPoint fielmente (src/import): texto com a formatação e a herança do mestre, marcadores, formas e
// desenho livre, grupos, tabelas, imagens, anotações, equações (OMML → LaTeX); gravação na biblioteca; Studio.
// Os arquivos reais da pessoa (aulas) são casos de aceitação locais; aqui o PPTX é gerado pelo pptxgenjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import YAML from "yaml";
import pptxgen from "pptxgenjs";
import { importPptx } from "../src/import/pptx.js";
import { importToDir, aspectOf, outlineOf } from "../src/import/index.js";
import { ommlToLatex } from "../src/import/omml.js";
import { parseXML } from "../src/import/xml.js";
import { buildHTML } from "../src/build.js";
import { openLibrary } from "../src/library.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

process.env.SAGADECK_NO_OFFICE = "1"; // sem PowerPoint/LibreOffice na suíte: a importação não depende deles

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAACZgbYnAAAAE0lEQVR42mP8z8Dwn4EBQKAHCCAAyfgB/0RVhnQAAAAASUVORK5CYII=";
async function samplePptx({ layout = "LAYOUT_WIDE" } = {}) {
  const p = new pptxgen();
  p.layout = layout;
  const s1 = p.addSlide();
  s1.addText("Ciclo hidrológico", { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 32, bold: true, color: "1F4E79", fontFace: "Calibri" });
  s1.addText([
    { text: "Precipitação", options: { bullet: true, fontSize: 20 } },
    { text: "Infiltração ", options: { bullet: true, fontSize: 20, breakLine: false } },
    { text: "no solo", options: { fontSize: 20, italic: true, color: "C00000" } },
  ], { x: 0.5, y: 1.4, w: 6, h: 2, valign: "top" });
  s1.addShape(p.ShapeType.rect, { x: 7, y: 1.4, w: 2, h: 1, fill: { color: "9DC3E6" }, line: { color: "2F5597", width: 2 } });
  s1.addShape(p.ShapeType.line, { x: 7, y: 3, w: 2, h: 0, line: { color: "000000", width: 1.5, endArrowType: "triangle" } });
  s1.addTable([[{ text: "Ano", options: { bold: true, fill: { color: "33CCCC" } } }, { text: "Q máx", options: { bold: true, fill: { color: "33CCCC" } } }], ["1988", "2218,0"], ["1989", "2190,0"]], { x: 0.5, y: 4, w: 5, colW: [2.5, 2.5], fontSize: 14 });
  s1.addImage({ data: `image/png;base64,${PNG}`, x: 10, y: 4, w: 2, h: 1 });
  s1.addNotes("Começar pela chuva.");
  const s2 = p.addSlide();
  s2.background = { color: "EAF4F8" };
  s2.addText("Segundo slide", { x: 1, y: 1, w: 6, h: 1, fontSize: 28 });
  const buf = await p.write({ outputType: "nodebuffer" });
  // grupo com desenho livre (custGeom), como o PowerPoint grava diagramas feitos à mão
  const zip = await JSZip.loadAsync(buf);
  const f = "ppt/slides/slide2.xml";
  const grp = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="90" name="Grupo"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="6096000" y="3429000"/><a:ext cx="1219200" cy="609600"/><a:chOff x="0" y="0"/><a:chExt cx="2438400" cy="1219200"/></a:xfrm></p:grpSpPr>
    <p:sp><p:nvSpPr><p:cNvPr id="91" name="Livre"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2438400" cy="1219200"/></a:xfrm><a:custGeom><a:pathLst><a:path w="100" h="50"><a:moveTo><a:pt x="0" y="50"/></a:moveTo><a:cubicBezTo><a:pt x="30" y="0"/><a:pt x="70" y="0"/><a:pt x="100" y="50"/></a:cubicBezTo><a:close/></a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val="70AD47"/></a:solidFill></p:spPr></p:sp></p:grpSp>`;
  zip.file(f, (await zip.file(f).async("string")).replace("</p:spTree>", grp + "</p:spTree>"));
  return zip.generateAsync({ type: "nodebuffer" });
}

test("OMML → LaTeX: fração, potência, índice, raiz, somatório, parênteses, barra e letras matemáticas do Word", () => {
  const m = (inner) => ommlToLatex(parseXML(`<m:oMath xmlns:m="m">${inner}</m:oMath>`));
  const r = (t) => `<m:r><m:t>${t}</m:t></m:r>`;
  assert.equal(m(`${r("t")}<m:sSub><m:e>${r("c")}</m:e><m:sub>${r("")}</m:sub></m:sSub>`).startsWith("t"), true);
  assert.equal(m(`<m:f><m:num>${r("L")}</m:num><m:den>${r("Δh")}</m:den></m:f>`), "\\frac{L}{\\Delta h}");
  assert.equal(m(`<m:sSup><m:e>${r("x")}</m:e><m:sup>${r("0,385")}</m:sup></m:sSup>`), "x^{0,385}");
  assert.equal(m(`<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${r("S")}</m:e></m:rad>`), "\\sqrt{S}");
  assert.equal(m(`<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${r("i")}</m:sub><m:sup/><m:e>${r("L")}</m:e></m:nary>`), "\\sum_{i} L");
  assert.equal(m(`<m:d><m:e>${r("x")}</m:e></m:d>`), "\\left(x\\right)");
  assert.equal(m(`<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e><m:func><m:fName>${r("log")}</m:fName><m:e>${r("𝑥")}</m:e></m:func></m:e></m:bar>`), "\\overline{\\log x}", "𝑥 (itálico matemático) vira x");
});

test("PPTX → deck: posição, fonte, tamanho, negrito, cor, marcador, forma, seta, tabela, imagem, grupo com desenho livre, fundo e notas", async () => {
  const res = await importPptx(await samplePptx());
  assert.equal(res.slides.length, 2);
  assert.equal(res.W, 1920); assert.equal(res.H, 1080);
  const [s1, s2] = res.slides;
  assert.equal(s1.title, "Ciclo hidrológico");
  const title = s1.elements.find((e) => e.textbox && e.textbox.paragraphs[0].runs[0]?.t === "Ciclo hidrológico");
  const run = title.textbox.paragraphs[0].runs[0];
  assert.deepEqual([run.b, run.color, run.font, run.size], [true, "#1F4E79", "Calibri", 64], "32 pt = 64 px num slide de 1920");
  assert.deepEqual([title.x, title.y], [72, 43.2], "0,5 pol = 72 px; 0,3 pol = 43,2 px");
  const list = s1.elements.find((e) => e.textbox && e.textbox.paragraphs.some((p) => p.runs.some((r) => r.t === "Precipitação")));
  assert.ok(list.textbox.paragraphs.every((p) => p.bullet), "marcadores");
  const red = list.textbox.paragraphs[1].runs.find((r) => r.t === "no solo");
  assert.deepEqual([red.i, red.color], [true, "#C00000"]);
  const rect = s1.elements.find((e) => e.drawing && /fill="#9DC3E6"/.test(e.drawing));
  assert.ok(rect && /stroke="#2F5597"/.test(rect.drawing), "retângulo com preenchimento e contorno");
  assert.ok(s1.elements.some((e) => e.drawing && /marker-end/.test(e.drawing)), "linha com ponta de seta");
  const table = s1.elements.find((e) => e.table);
  assert.deepEqual(table.tableData, [["Ano", "Q máx"], ["1988", "2218,0"], ["1989", "2190,0"]]);
  assert.equal(table.table.cells[0][0].fill, "#33CCCC");
  const img = s1.elements.find((e) => e.image);
  assert.match(img.image, /^imagens\/original\/.+\.png$/);
  assert.equal(img.fit, "fill");
  assert.equal(s1.notes, "Começar pela chuva.");
  assert.equal(s2.background.color, "EAF4F8");
  const free = s2.elements.find((e) => e.drawing && /C[\d. ]+/.test(e.drawing) && /#70AD47/.test(e.drawing));
  assert.ok(free, "desenho livre (curva de Bézier) do grupo");
  assert.deepEqual([free.x, free.y, free.w, free.h], [960, 540, 192, 96], "grupo achatado: posição e escala do grupo aplicadas");
  assert.equal(aspectOf(9144000, 6858000), "4:3");
  assert.equal(aspectOf(12192000, 6858000), undefined);
  assert.deepEqual(res.warnings, []);
});

test("importar para a biblioteca: deck fiel com mídias, cópia do original, origem de cada slide; monta sem erro e a IA lê o roteiro", async () => {
  const lib = openLibrary(fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || process.env.TMPDIR || "/tmp"), "sgd-imp-")));
  try {
    const buf = await samplePptx({ layout: "LAYOUT_4x3" });
    const r = await lib.importOffice(buf, "Aulas", "Hidrologia 1.pptx");
    assert.equal(r.slides, 2);
    const dir = path.dirname(r.file);
    const spec = YAML.parse(fs.readFileSync(r.file, "utf8"));
    assert.equal(spec.aspect, "4:3");
    assert.equal(spec.footer, false, "o original tem o próprio rodapé");
    assert.equal(spec.import.from, "Hidrologia 1.pptx");
    assert.ok(fs.existsSync(path.join(dir, "original", "Hidrologia 1.pptx")), "cópia do original");
    assert.deepEqual(spec.slides.map((s) => s.original.slide), [1, 2]);
    const img = spec.slides[0].elements.find((e) => e.image);
    assert.ok(fs.existsSync(path.join(dir, img.image)), "a imagem foi gravada ao lado do deck");
    const built = buildHTML({ ...spec, _dir: dir });
    assert.deepEqual(built.warnings.filter((w) => !/palavras/.test(w)), []);
    assert.match(built.html, /class="tbx"/); assert.match(built.html, /class="drw"/); assert.match(built.html, /tbx-table/); assert.match(built.html, /fig fig-img/);
    const outline = outlineOf(spec);
    assert.match(outline, /## 1\. Ciclo hidrológico/); assert.match(outline, /1988 \| 2218,0/); assert.match(outline, /\[notas\] Começar pela chuva/);
    await assert.rejects(lib.importOffice(Buffer.from("x"), "", "notas.docx"), /\.pptx/);
  } finally { fs.rmSync(lib.root, { recursive: true, force: true }); }
});

test("Studio: Importar apresentação aceita .pptx e abre o deck fiel, sem erro na página", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const r = await p.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const res = await fetch("api/library/import?topic=Aulas&name=" + encodeURIComponent("Aula 1.pptx"), { method: "POST", body: bin });
      return res.json();
    }, (await samplePptx()).toString("base64"));
    assert.equal(r.slides, 2);
    assert.ok(r.id);
    await p.goto(new URL(`editor?deck=${encodeURIComponent(r.id)}`, studio.url).href);
    await p.waitForSelector("#rendered-slide-container .tbx");
    assert.ok(await p.locator("#rendered-slide-container .drw svg").count(), "as formas aparecem no editor");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
