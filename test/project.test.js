// Projeto (a pasta da apresentação, como no VS Code): árvore, arquivos protegidos, lixeira do projeto, planilhas
// (CSV e XLSX), tipos das colunas, sugestões de gráfico, contexto para a IA — e o uso de ponta a ponta no Studio.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import JSZip from "jszip";
import * as Project from "../src/studio/project.js";
import { packDeck } from "../src/package.js";
import { loadSpec } from "../src/build.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

async function xlsx(file, sheets) {
  const zip = new JSZip(), shared = [];
  const si = (v) => { const i = shared.indexOf(v); return i >= 0 ? i : shared.push(v) - 1; };
  const col = (j) => String.fromCharCode(65 + j);
  zip.file("xl/workbook.xml", `<workbook xmlns:r="r"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<Relationships>${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet><sheetData>${s.rows.map((r, k) => `<row r="${k + 1}">${r.map((v, j) => typeof v === "number" ? `<c r="${col(j)}${k + 1}"><v>${v}</v></c>` : `<c r="${col(j)}${k + 1}" t="s"><v>${si(v)}</v></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`));
  zip.file("xl/sharedStrings.xml", `<sst>${shared.map((v) => `<si><t>${v}</t></si>`).join("")}</sst>`);
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }));
}

test("projeto: só a pasta do deck; nada sai dela; .sagadeck e o .yaml protegidos; apagar vai para a lixeira do projeto", async () => {
  const deck = tempDeck();
  try {
    const P = Project.projectOf(deck.file);
    assert.ok(P);
    const t = Project.tree(P);
    assert.equal(t.entries[0].path, "deck.yaml", "a apresentação primeiro");
    assert.ok(t.entries.some((e) => e.path === ".sagadeck" && e.protected), ".sagadeck existe e é protegida");
    assert.ok(t.entries.some((e) => e.path === "contexto"), "contexto/ à vista");
    for (const bad of ["../fora.md", "..\\fora.md", "contexto/../../x.md"]) assert.throws(() => Project.resolveIn(P, bad), /fora do projeto/);
    assert.throws(() => Project.remove(P, ".sagadeck"), /Studio/);
    assert.throws(() => Project.rename(P, ".sagadeck", "x"), /Studio/);
    assert.throws(() => Project.remove(P, "deck.yaml"), /biblioteca/);
    assert.throws(() => Project.writeText(P, ".sagadeck/conversa.json", "{}"), /Studio/);
    assert.throws(() => Project.upload(P, ".sagadeck", "x.png", Buffer.from("x")), /Studio/);
    const md = Project.createFile(P, "contexto", "ideias", "# oi");
    assert.equal(md.path, "contexto/ideias.md");
    const again = Project.createFile(P, "contexto", "ideias.md", "");
    assert.equal(again.path, "contexto/ideias (2).md", "nome repetido não sobrescreve");
    const r = Project.remove(P, md.path);
    assert.ok(!fs.existsSync(path.join(deck.dir, md.path)));
    assert.match(r.trashed, /^\.sagadeck\/lixeira\//);
    assert.equal(Project.restore(P, r.trashed).path, "contexto/ideias.md", "restaura no mesmo lugar");
    // pacote .sagadeck: vai o que o deck usa; contexto e .sagadeck ficam
    const { files } = await packDeck(loadSpec(deck.file), { baseDir: deck.dir, name: "deck" });
    assert.ok(!files.some((f) => /contexto|\.sagadeck/.test(f)), `pacote sem arquivos auxiliares: ${files}`);
    // deck solto numa pasta com outros decks não vira projeto
    fs.writeFileSync(path.join(deck.dir, "outro.yaml"), "title: x\nslides: []\n");
    assert.equal(Project.projectOf(deck.file), null);
  } finally { deck.cleanup(); }
});

test("planilhas: CSV e XLSX (várias abas), tipos das colunas, sugestões que fazem sentido e montagem pelo nome das colunas", async () => {
  const deck = tempDeck();
  try {
    const P = Project.projectOf(deck.file);
    fs.mkdirSync(path.join(deck.dir, "contexto"), { recursive: true });
    await xlsx(path.join(deck.dir, "contexto", "resultado.xlsx"), [
      { name: "Vendas", rows: [["Mês", "Norte", "Sul"], ["jan", 10.5, 7], ["fev", 12, 9], ["mar", 15, 8]] },
      { name: "Times", rows: [["Time", "Gols"], ["A", 3], ["B", 5], ["C", 1]] },
    ]);
    const { sheets } = await Project.readSheet(path.join(deck.dir, "contexto", "resultado.xlsx"));
    assert.deepEqual(sheets.map((s) => s.name), ["Vendas", "Times"]);
    assert.deepEqual(sheets[0].rows[1], ["jan", "10.5", "7"]);
    const info = Project.inferColumns(sheets[0].rows);
    assert.deepEqual(info.columns.map((c) => [c.name, c.type]), [["Mês", "date"], ["Norte", "number"], ["Sul", "number"]]);
    const sug = Project.suggestCharts(info, { file: "contexto/resultado.xlsx", sheet: "Vendas" });
    assert.equal(sug[0].slide.chart.chart, "line", "tempo + números: linha primeiro");
    assert.deepEqual(sug[0].slide.from, { file: "contexto/resultado.xlsx", sheet: "Vendas", columns: ["Mês", "Norte", "Sul"] });
    const times = Project.suggestCharts(Project.inferColumns(sheets[1].rows), { file: "x.xlsx" });
    assert.equal(times[0].slide.chart.chart, "bar", "categoria + número: barras");
    assert.deepEqual(times[0].slide.chart.data.map((d) => d.label), ["B", "A", "C"], "ordenadas do maior para o menor");
    // porcentagem e R$, número brasileiro
    const pct = Project.inferColumns([["Canal", "Fatia", "Receita"], ["Loja", "40%", "R$ 1.200,50"], ["Site", "35%", "R$ 900"], ["App", "25%", "R$ 300"]]);
    assert.deepEqual(pct.columns.map((c) => c.type), ["category", "percent", "number"]);
    assert.ok(Project.suggestCharts(pct, { file: "c.csv" }).some((s) => s.slide.chart?.chart === "donut"), "partes de 100%: rosca");
    // montagem pelo que a IA escolheu (nomes das colunas), com eixos
    const s = Project.buildChart(info, { type: "column", x: "mês", ys: ["Norte", "Sul"], title: "Norte cresce", xLabel: "Mês", yLabel: "R$ mi" }, { file: "contexto/resultado.xlsx", sheet: "Vendas" });
    assert.equal(s.chart.series.length, 2);
    assert.equal(s.chart.yLabel, "R$ mi");
    assert.throws(() => Project.buildChart(info, { type: "line", x: "Não existe", ys: ["Norte"] }), /colunas não encontradas/);
    // contexto para a IA: o texto dos arquivos de contexto/ (com cache)
    fs.writeFileSync(path.join(deck.dir, "contexto", "briefing.md"), "Cliente quer ==reduzir fraude== em 30%.");
    const mats = await Project.contextMaterials(P);
    assert.ok(mats.some((m) => m.name === "contexto/briefing.md" && /reduzir fraude/.test(m.text)));
    assert.ok(mats.some((m) => m.name === "contexto/resultado.xlsx" && /Norte/.test(m.text)));
    assert.ok(fs.readdirSync(path.join(deck.dir, ".sagadeck", "cache")).length >= 2, "texto extraído fica em cache");
  } finally { deck.cleanup(); }
});

test("Studio: aba Arquivos, texto da apresentação ao vivo, .md que grava, print colado vai para contexto/, planilha vira gráfico ligado", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck();
  fs.mkdirSync(path.join(deckFile.dir, "contexto"), { recursive: true });
  const csv = path.join(deckFile.dir, "contexto", "vendas.csv");
  fs.writeFileSync(csv, "Mês;Norte;Sul\njan;10,5;7\nfev;12;9\nmar;15;8\n");
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    await p.click("#rail-tab-files");
    await p.waitForSelector('.ex-row[data-kind="deck"]');
    assert.ok(await p.locator('.ex-row[data-path=".sagadeck"].ex-protected').count());
    // 1) texto da apresentação: editar o YAML muda o slide e o deck salvo
    await p.click('.ex-row[data-kind="deck"]');
    await p.waitForSelector("#deck-text-editor");
    assert.ok(await p.locator("#canvas-viewport").isVisible(), "o slide fica ao lado do texto");
    const yaml = await p.inputValue("#deck-text-editor");
    await p.fill("#deck-text-editor", yaml.replace(/^title: .*$/m, "title: Mudei pelo texto"));
    for (let k = 0; k < 40 && saved().title !== "Mudei pelo texto"; k++) await p.waitForTimeout(100);
    assert.equal(saved().title, "Mudei pelo texto");
    // 2) .md novo em contexto/, com o nome digitado na própria árvore (como no VS Code): grava sozinho
    await p.click('.ex-row[data-path="contexto"]'); await p.click('.ex-row[data-path="contexto"]'); // seleciona (e deixa aberta)
    await p.click("#ex-new-file");
    await p.waitForSelector("#project-tree .ex-new .ex-edit");
    await p.fill("#project-tree .ex-edit", "roteiro.md");
    await p.keyboard.press("Enter");
    await p.waitForSelector('.doc-tab.active:has-text("roteiro.md")');
    await p.locator(".dv-text").fill("# Roteiro\n\n- abrir com a pergunta");
    const mdFile = path.join(deckFile.dir, "contexto", "roteiro.md");
    for (let k = 0; k < 30 && !fs.existsSync(mdFile); k++) await p.waitForTimeout(100);
    await p.waitForTimeout(700);
    assert.match(fs.readFileSync(mdFile, "utf8"), /abrir com a pergunta/);
    assert.match(await p.locator(".dv-md").innerHTML(), /<h1>Roteiro<\/h1>/);
    // 3) Ctrl+V de um print (fora de campo de texto): vai para contexto/
    await p.click('.doc-tab[data-doc="__deck__"]');
    await p.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 20; c.height = 10; c.getContext("2d").fillRect(0, 0, 20, 10);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const dt = new DataTransfer(); dt.items.add(new File([blob], "x.png", { type: "image/png" }));
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await p.waitForFunction(() => [...document.querySelectorAll(".ex-row")].some((r) => /^contexto\/print .*\.png$/.test(r.dataset.path)));
    assert.ok(fs.readdirSync(path.join(deckFile.dir, "contexto")).some((f) => /^print .*\.png$/.test(f)));
    // 4) planilha: tipos, sugestões com prévia, inserir → gráfico ligado (from) que se atualiza
    await p.click('.ex-row[data-path="contexto/vendas.csv"]');
    await p.waitForSelector(".sh-card");
    assert.deepEqual(await p.locator(".sh-type").allTextContents(), ["tempo", "número", "número"]);
    assert.ok(await p.locator(".sh-card .sh-prev svg.chart").count(), "prévia desenhada do gráfico");
    const n0 = saved().slides.length;
    await p.locator(".sh-card [data-insert]").first().click();
    for (let k = 0; k < 40 && saved().slides.length === n0; k++) await p.waitForTimeout(100);
    const ins = saved().slides.find((s) => s.from?.file === "contexto/vendas.csv");
    assert.ok(ins, "o gráfico entrou no deck com a origem");
    assert.equal(ins.chart.chart, "line");
    assert.deepEqual(ins.chart.series[0].values, [10.5, 12, 15]);
    fs.writeFileSync(csv, "Mês;Norte;Sul\njan;20;7\nfev;22;9\nmar;25;8\n");
    await p.click('.doc-tab[data-doc="__deck__"]');
    await p.click("#tab-btn-props");
    await p.getByRole("button", { name: "Atualizar da planilha" }).click();
    for (let k = 0; k < 40 && saved().slides.find((s) => s.from)?.chart.series[0].values[0] !== 20; k++) await p.waitForTimeout(100);
    assert.deepEqual(saved().slides.find((s) => s.from).chart.series[0].values, [20, 22, 25], "Atualizar da planilha relê o arquivo");
    // 5) renomear com F2 (no lugar), apagar com Delete (sem pergunta: vai para a lixeira do projeto, com Desfazer)
    await p.click('.doc-tab[data-doc="__deck__"]');
    await p.click('.ex-row[data-path="contexto/roteiro.md"] .ex-name');
    await p.keyboard.press("F2");
    await p.waitForSelector('#project-tree .ex-row.editing .ex-edit');
    assert.equal(await p.evaluate(() => { const i = document.querySelector("#project-tree .ex-edit"); return i.value.slice(i.selectionStart, i.selectionEnd); }), "roteiro", "seleciona o nome sem a extensão");
    await p.keyboard.type("plano");
    await p.keyboard.press("Enter");
    await p.waitForSelector('.ex-row[data-path="contexto/plano.md"]');
    assert.ok(fs.existsSync(path.join(deckFile.dir, "contexto", "plano.md")) && !fs.existsSync(mdFile));
    fs.renameSync(path.join(deckFile.dir, "contexto", "plano.md"), mdFile);
    await p.click("#ex-refresh");
    await p.waitForSelector('.ex-row[data-path="contexto/roteiro.md"]');
    // botão direito na árvore: o menu com as ações
    await p.click('.ex-row[data-path="contexto/roteiro.md"]', { button: "right" });
    assert.deepEqual(await p.locator(".ctx-menu .ctx-item span").allTextContents(), ["Abrir", "Novo arquivo", "Nova pasta", "Enviar arquivos para cá", "Renomear", "Copiar caminho", "Apagar"]);
    await p.keyboard.press("Escape");
    await p.click('.ex-row[data-path="contexto/roteiro.md"] .ex-name');
    await p.keyboard.press("Delete");
    await p.waitForFunction(() => !document.querySelector('.ex-row[data-path="contexto/roteiro.md"]'));
    assert.ok(!fs.existsSync(mdFile));
    assert.ok(fs.readdirSync(path.join(deckFile.dir, ".sagadeck", "lixeira")).some((f) => /roteiro\.md$/.test(f)));
    await p.click("#toast-notification [data-toast-undo]");
    await p.waitForSelector('.ex-row[data-path="contexto/roteiro.md"]');
    const del = await p.evaluate(async () => (await fetch("/api/project/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ".sagadeck" }) })).status);
    assert.equal(del, 400, ".sagadeck não se apaga");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("demo de novidades: desenha sem avisos e, ao virar cópia, traz a planilha e o leia-me para contexto/", async () => {
  const { demoDeck } = await import("../src/studio/demo-decks.js");
  const { buildHTML } = await import("../src/build.js");
  const spec = demoDeck("novidades");
  const layouts = spec.slides.map((s) => s.layout);
  for (const l of ["carousel", "chart", "science", "duel", "terminals", "turns", "spotlight"]) assert.ok(layouts.includes(l), `a demo mostra ${l}`);
  assert.ok(spec.slides.some((s) => s.style === "rings"), "as duas formas do carrossel");
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  try {
    const post = async (u, b) => (await fetch(`${studio.url}${u}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json();
    const prev = await post("/api/library/decks/model-preview", { key: "model-novidades", topic: "Modelos" });
    assert.equal(prev.spec.title, "Demo — novidades");
    const { warnings } = buildHTML(prev.spec);
    assert.deepEqual(warnings.filter((w) => !/imagem/i.test(w)), [], "sem avisos (a planilha da demo é lida na prévia)");
    const made = await post("/api/library/decks/model-use", {});
    const dir = path.dirname(path.join(studio.library, ...made.id.split("/")));
    for (const f of ["contexto/vendas.csv", "contexto/leia-me.md", "imagens/lavanda-cover.jpg"]) assert.ok(fs.existsSync(path.join(dir, ...f.split("/"))), `a cópia traz ${f}`);
    const tree = await (await fetch(`${studio.url}/api/project/tree`)).json();
    assert.ok(JSON.stringify(tree).includes("contexto/vendas.csv"), "a aba Arquivos mostra a planilha");
    const sug = await post("/api/project/chart-suggestions", { path: "contexto/vendas.csv" });
    assert.equal(sug.suggestions[0].slide.chart.chart, "line");
  } finally { await studio.close(); deckFile.cleanup(); }
});

test("Sugerir com IA: a IA recebe o resumo das colunas (não a planilha inteira) e as escolhas dela viram gráficos com título e eixos", async () => {
  const { startMockLLM } = await import("./mock-llm.js");
  const llm = await startMockLLM(() => JSON.stringify({ colunas: [{ nome: "Ano", tipo: "tempo" }, { nome: "Receita", tipo: "numero" }],
    graficos: [{ tipo: "column", x: "Ano", y: ["Receita"], titulo: "A receita dobrou em dois anos", eixoX: "Ano", eixoY: "R$ milhões", porque: "tendência em poucos pontos" }, { tipo: "line", x: "Nao existe", y: ["Receita"], titulo: "x" }] }));
  const deckFile = tempDeck();
  fs.mkdirSync(path.join(deckFile.dir, "contexto"), { recursive: true });
  fs.writeFileSync(path.join(deckFile.dir, "contexto", "anos.csv"), "Ano,Receita\n2023,10\n2024,14\n2025,20\n");
  const studio = await startStudio(deckFile.file, { llmUrl: llm.url });
  try {
    const r = await (await fetch(`${studio.url}/api/project/chart-suggestions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: "contexto/anos.csv", ai: true }) })).json();
    const req = llm.requests.at(-1);
    assert.match(req.lastUser, /"Ano": /, "vai o resumo das colunas");
    assert.match(req.system, /Corrija o tipo quando o nome mostrar outra coisa/);
    assert.equal(r.suggestions[0].ai, true);
    assert.equal(r.suggestions[0].title, "A receita dobrou em dois anos");
    assert.equal(r.suggestions[0].slide.chart.yLabel, "R$ milhões");
    assert.match(r.suggestions[0].html, /R\$ milhões/, "a prévia já mostra o eixo com nome");
    assert.equal(r.suggestions.filter((s) => s.ai).length, 1, "coluna que não existe: a sugestão da IA é descartada, o resto fica");
    assert.deepEqual(r.ai.columns[0], { nome: "Ano", tipo: "tempo" });
  } finally { await studio.close(); await llm.close(); deckFile.cleanup(); }
});
