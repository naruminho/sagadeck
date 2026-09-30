// Arquivos do projeto como no VS Code: texto com realce e números de linha (editável), CSV como o Excel abre
// (separador descoberto, grade editável que grava no mesmo formato), PDF (páginas) e DOCX (só leitura).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { detectDelimiter, parseCSV, toCSV } from "../src/csv.js";
import { docxToHtml } from "../src/docx.js";
import { parseTable } from "../src/science.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

test("CSV: vírgula, ponto e vírgula, tab e barra; aspas com separador e quebra de linha; sep= do Excel; grava igual", () => {
  assert.equal(detectDelimiter("a,b,c\n1,2,3\n"), ",");
  assert.equal(detectDelimiter("Mês;Valor\njan;10,5\nfev;12,25\n"), ";", "vírgula decimal não engana");
  assert.equal(detectDelimiter("x\ty\n1,5\t2\n"), "\t");
  assert.equal(detectDelimiter("a|b\n1|2\n"), "|");
  assert.equal(detectDelimiter("sep=;\na,b;c\n"), ";");
  const p = parseCSV('﻿nome;obs;valor\r\n"Silva; Ana";"disse ""oi""\nna aula";1,5\r\nBeto;;2\r\n');
  assert.equal(p.delimiter, ";"); assert.equal(p.eol, "\r\n"); assert.equal(p.bom, true);
  assert.deepEqual(p.rows, [["nome", "obs", "valor"], ["Silva; Ana", 'disse "oi"\nna aula', "1,5"], ["Beto", "", "2"]]);
  assert.equal(toCSV(p.rows, p), '﻿nome;obs;valor\r\n"Silva; Ana";"disse ""oi""\nna aula";1,5\r\nBeto;;2\r\n', "volta byte a byte");
  assert.deepEqual(parseCSV("a,b\n1\n").rows, [["a", "b"], ["1", ""]], "linha curta completa com vazio");
  assert.deepEqual(parseTable("t\tmedido\n0\t20\n0,5\t18,9"), [["t", "medido"], ["0", "20"], ["0,5", "18,9"]], "tabela colada do Excel no deck");
});

async function docxFile(file) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="w" xmlns:r="r"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Relatório de campo</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Vazão </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>máxima</w:t></w:r><w:r><w:t xml:space="preserve"> em </w:t></w:r><w:hyperlink r:id="rId9"><w:r><w:t>ANA</w:t></w:r></w:hyperlink></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>coletar</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>medir</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Ano</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Q</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1988</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2218</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:sectPr/></w:body></w:document>`);
  zip.file("word/_rels/document.xml.rels", `<Relationships><Relationship Id="rId9" Type="hyperlink" Target="https://www.gov.br/ana" TargetMode="External"/></Relationships>`);
  zip.file("word/styles.xml", `<w:styles xmlns:w="w"><w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/></w:style></w:styles>`);
  zip.file("word/numbering.xml", `<w:numbering xmlns:w="w"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  if (file) fs.writeFileSync(file, buf);
  return buf;
}

test("DOCX vira HTML para ler: título pelo estilo, negrito, link externo, lista numerada e tabela", async () => {
  const html = await docxToHtml(await docxFile());
  assert.match(html, /<h1>Relatório de campo<\/h1>/);
  assert.match(html, /Vazão <b>máxima<\/b> em <a href="https:\/\/www\.gov\.br\/ana"/);
  assert.match(html, /<ol><li>coletar<\/li><li>medir<\/li><\/ol>/);
  assert.match(html, /<table><tr><td><p>Ano<\/p><\/td><td><p>Q<\/p><\/td><\/tr><tr><td><p>1988<\/p><\/td>/);
  await assert.rejects(docxToHtml(await new JSZip().file("a.txt", "x").generateAsync({ type: "nodebuffer" })), /Não parece um \.docx/);
});

test("Studio: JSON e Python com realce e linhas; CSV com ; abre como planilha, edita, cola do Excel e grava igual; PDF e DOCX abrem", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck();
  const ctxDir = path.join(deckFile.dir, "contexto");
  fs.mkdirSync(ctxDir, { recursive: true });
  fs.writeFileSync(path.join(ctxDir, "notas.json"), '{\n  "bacia": "Monjolinho",\n  "area": 43.2,\n  "urbana": true\n}\n');
  fs.writeFileSync(path.join(ctxDir, "kirpich.py"), "def tc(L, dh):\n    # minutos\n    return 57 * (L ** 3 / dh) ** 0.385\n");
  fs.writeFileSync(path.join(ctxDir, "vazoes.csv"), 'Ano;Vazão;Obs\r\n1988;2218,0;"cheia; recorde"\r\n1989;2190,0;\r\n');
  await docxFile(path.join(ctxDir, "relatorio.docx"));
  const pdfPage = await browser.newPage();
  await pdfPage.setContent("<h1>Artigo</h1><p>página um</p><div style='page-break-before:always'>página dois</div>");
  fs.writeFileSync(path.join(ctxDir, "artigo.pdf"), await pdfPage.pdf({ format: "A4" }));
  await pdfPage.close();
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.waitForSelector(".thumb-card");
    await p.click("#rail-tab-files");
    await p.waitForSelector('.ex-row[data-path="contexto/notas.json"]');
    // JSON: chave, número e verdadeiro coloridos; linhas numeradas; editar grava
    await p.click('.ex-row[data-path="contexto/notas.json"]');
    await p.waitForSelector(".cv-hl .hl-key");
    assert.deepEqual(await p.locator(".cv-hl .hl-key").allTextContents(), ['"bacia"', '"area"', '"urbana"']);
    assert.ok(await p.locator(".cv-hl .hl-num").count() && await p.locator(".cv-hl .hl-kw").count());
    assert.equal(await p.locator(".cv-gutter div").count(), 6, "uma linha numerada por linha do arquivo");
    assert.match(await p.locator(".dv-lang").innerText(), /JSON/);
    await p.locator(".cv-text").fill('{\n  "bacia": "Gregório"\n}\n');
    const jsonFile = path.join(ctxDir, "notas.json");
    for (let k = 0; k < 30 && !fs.readFileSync(jsonFile, "utf8").includes("Gregório"); k++) await p.waitForTimeout(100);
    assert.match(fs.readFileSync(jsonFile, "utf8"), /Gregório/);
    // Python: palavra-chave, comentário, função
    await p.click('.ex-row[data-path="contexto/kirpich.py"]');
    await p.waitForSelector(".cv-hl .hl-com");
    assert.deepEqual(await p.locator(".cv-hl .hl-kw").allTextContents(), ["def", "return"]);
    assert.equal(await p.locator(".cv-hl .hl-fn").first().innerText(), "tc");
    // CSV com ponto e vírgula: grade com letras nas colunas, 3 colunas certas (o ; dentro das aspas não separa)
    await p.click('.ex-row[data-path="contexto/vazoes.csv"]');
    await p.waitForSelector(".sg td");
    assert.deepEqual(await p.locator(".sg thead th[data-col]").evaluateAll((els) => els.map((e) => e.firstChild.textContent)), ["A", "B", "C"]);
    assert.match(await p.locator("#dv-status").innerText(), /ponto e vírgula/);
    assert.equal(await p.locator('.sg td[data-r="1"][data-c="2"]').innerText(), "cheia; recorde");
    // editar como no Excel: clicar, digitar, Enter
    await p.click('.sg td[data-r="2"][data-c="2"]');
    await p.keyboard.type("seca");
    await p.keyboard.press("Enter");
    const csvFile = path.join(ctxDir, "vazoes.csv");
    for (let k = 0; k < 30 && !fs.readFileSync(csvFile, "utf8").includes("seca"); k++) await p.waitForTimeout(100);
    assert.equal(fs.readFileSync(csvFile, "utf8"), 'Ano;Vazão;Obs\r\n1988;2218,0;"cheia; recorde"\r\n1989;2190,0;seca\r\n', "mesmo separador, mesmas aspas, mesmo fim de linha");
    // colar um bloco copiado do Excel (tab entre colunas) a partir da célula selecionada
    await p.click('.sg td[data-r="2"][data-c="0"]');
    await p.keyboard.press("ArrowDown");
    await p.locator(".sg-wrap").evaluate((el) => { const dt = new DataTransfer(); dt.setData("text/plain", "1990\t1445,0\n1991\t1747,0"); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
    for (let k = 0; k < 30 && !fs.readFileSync(csvFile, "utf8").includes("1991"); k++) await p.waitForTimeout(100);
    assert.match(fs.readFileSync(csvFile, "utf8"), /1990;1445,0;\r\n1991;1747,0;\r\n$/);
    // desfazer (Ctrl+Z) volta a colagem
    await p.keyboard.press("Control+z");
    for (let k = 0; k < 30 && fs.readFileSync(csvFile, "utf8").includes("1991"); k++) await p.waitForTimeout(100);
    assert.ok(!fs.readFileSync(csvFile, "utf8").includes("1991"));
    // ver como texto: cada coluna de uma cor
    await p.click("[data-as-text]");
    await p.waitForSelector(".cv-hl .hl-c1");
    assert.equal(await p.locator(".cv-hl .hl-c1").first().innerText(), "Vazão");
    await p.click("[data-as-grid]");
    await p.waitForSelector(".sg td");
    // PDF: as duas páginas desenhadas
    await p.click('.ex-row[data-path="contexto/artigo.pdf"]');
    await p.waitForSelector(".pv-page canvas");
    assert.match(await p.locator(".pv-count").innerText(), /2 páginas/);
    assert.equal(await p.locator(".pv-page").count(), 2);
    // DOCX: título, negrito e tabela, só leitura
    await p.click('.ex-row[data-path="contexto/relatorio.docx"]');
    await p.waitForSelector(".dx-page h1");
    assert.equal(await p.locator(".dx-page h1").innerText(), "Relatório de campo");
    assert.equal(await p.locator(".dx-page table td").count(), 4);
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
