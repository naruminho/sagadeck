// Studio de ponta a ponta: sobe o servidor com o deck de teste e clica de verdade num Chrome headless.
// Cada recurso do Studio tem um teste aqui — se um refactor quebrar, o teste avisa.
// Testes que chamam o LLM de verdade só rodam com SAGADECK_LIVE=1 (precisam do modelrelay).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { unpackDeck } from "../src/package.js";
import { browserOrSkip, newPage, startStudio, tempDeck, readPptx } from "./helpers.js";

const LIVE = process.env.SAGADECK_LIVE === "1";
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test('modelos: criar na biblioteca, editar grade e persistir conteúdo',async t=>{
  const browser=await browserOrSkip(t);if(!browser)return;
  const studio=await startStudio(null);
  try{const {page:p,errors}=await newPage(browser,studio.url+'/biblioteca');
    await t.test('menu de modelos cabe em janela baixa',async()=>{
      await p.setViewportSize({width:1100,height:650});await p.click('#btn-new');
      const bounds=await p.locator('.lmenu.open').boundingBox();assert.ok(bounds.y+bounds.height<=650,'menu sai da janela');
      await p.keyboard.press('Escape');
    });
    await t.test('modelo lavanda cria arquivo completo na biblioteca',async()=>{
      await p.click('#btn-new');await p.click('#new-menu [data-new="gallery"]');await p.click('.vit-card[data-new="model-lavanda"]');
      await p.waitForSelector('.thumb-card[data-idx="1"]');
      await p.click('.thumb-card[data-idx="1"]');await p.waitForSelector('#rendered-slide-container .adaptive');
      assert.equal(await p.locator('#rendered-slide-container .adaptive-item').count(),5);
      const data=await p.evaluate(async()=>await(await fetch('/api/deck')).json());
      assert.ok(data.file.startsWith(studio.library));assert.equal(YAML.parse(fs.readFileSync(data.file,'utf8')).slides[1].layout,'mosaic');
    });
    await t.test('alterar item pelo formulário salva no YAML',async()=>{
      await p.click('#tab-btn-props');
      const toggles=p.locator('#slide-fields-form .sf-item-toggle');
      await toggles.first().click();
      const input=p.locator('#slide-fields-form .sf-field').filter({has:p.locator('.sf-label', {hasText:/^Título$/})}).locator('input').nth(1);
      await input.fill('Ideia revisada');await input.blur();await p.waitForTimeout(800);
      const data=await p.evaluate(async()=>await(await fetch('/api/deck')).json());
      assert.equal(YAML.parse(fs.readFileSync(data.file,'utf8')).slides[1].items[0].title,'Ideia revisada');
    });
    assert.deepEqual(errors,[]);
  }finally{await studio.close();await browser.close();}
});

test("guia Avançado: aplica densidade e insere uma página de consulta", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const tab = (name) => p.click(`.ribbon-tab[data-tab="${name}"]`);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    const deck = () => p.evaluate(async () => (await (await fetch("/api/deck")).json()).spec);
    const index = 0;
    await tab("avancado");
    assert.ok(await p.getByRole("button", { name: "Página de consulta" }).isVisible());
    const ribbon = await p.locator("#ribbon").boundingBox();
    const queryButton = await p.getByRole("button", { name: "Página de consulta" }).boundingBox();
    assert.ok(queryButton.y + queryButton.height <= ribbon.y + ribbon.height, "o atalho de página de consulta cabe na faixa");
    const demosLink = p.getByRole("link", { name: "Abrir demos completos" });
    assert.ok(await demosLink.isVisible());
    assert.equal(new URL(await demosLink.getAttribute("href"), studio.url).searchParams.get("topic"), "Demos e modelos");
    await tab("inicio");
    await p.click("#btn-scenes");
    await p.waitForSelector('.scene-card[data-scene="dossier"]');
    assert.ok(await p.locator('.scene-card[data-scene="mosaic"]').isVisible());
    assert.ok(await p.locator('.scene-card[data-scene="kinetic"]').isVisible());
    const sceneSizes = await p.evaluate(() => {
      const dialog = document.querySelector(".scene-dialog").getBoundingClientRect();
      const grid = document.querySelector("#scene-grid").getBoundingClientRect();
      const preview = document.querySelector(".scene-preview").getBoundingClientRect();
      return { dialog: dialog.height, grid: grid.height, previewWidth: preview.width, ratio: preview.width / preview.height };
    });
    assert.ok(sceneSizes.grid > 250, "a galeria reserva altura suficiente para os exemplos");
    assert.ok(sceneSizes.previewWidth >= 400, "as prévias ficam grandes o bastante para ler a composição");
    assert.ok(Math.abs(sceneSizes.ratio - 16 / 9) < 0.02, "as prévias mantêm proporção 16:9");
    await p.keyboard.press("Escape");
    await tab("avancado");
    await p.locator("#advanced-density-select").selectOption("dense");
    await p.waitForFunction((i) => document.querySelector(`.thumb-card[data-idx="${i}"]`), index);
    assert.equal(saved().slides[index].density, "dense");
    assert.ok(await p.locator("#rendered-slide-container .slide.density-dense").count());
    await p.locator("#advanced-density-select").selectOption("");
    await p.waitForFunction(() => document.querySelector("#rendered-slide-container .slide:not(.density-dense)"));
    assert.equal(saved().slides[index].density, undefined);
    const before = (await deck()).slides.length;
    await p.getByRole("button", { name: "Página de consulta" }).click();
    await p.waitForFunction((n) => document.querySelectorAll(".thumb-card").length === n + 1, before);
    assert.equal((await deck()).slides[index + 1].layout, "dossier");
    assert.ok(await p.locator("#rendered-slide-container .adaptive").count());
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("guia Inserir oferece o slide de código simples", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click('.ribbon-tab[data-tab="inserir"]');
    const button = p.locator('[data-add-scene="code"]');
    assert.equal(await button.innerText(), "Código");
    await button.click();
    await p.waitForFunction(() => document.querySelector('.thumb-card.active')?.getAttribute("title").includes("Código"));
    assert.match(await p.locator("#rendered-slide-container").innerText(), /def ola/);
    const form = await p.locator("#slide-fields-form").innerText();
    assert.match(form, /Nome do arquivo/);
    assert.match(form, /Linguagem/);
    assert.match(form, /Linhas destacadas \(a partir de 1\)/);
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("tema e edição direta de objetos ficam integrados ao Studio", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const theme = p.locator("#btn-app-theme");
    await theme.click();
    assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(await theme.getAttribute("aria-label"), "Ativar tema claro");
    assert.equal(await p.locator("#app-theme-select").inputValue(), "dark");
    await theme.click();
    assert.equal(await p.locator("html").getAttribute("data-theme"), "light");
    assert.equal(await theme.getAttribute("aria-label"), "Ativar tema escuro");
    await p.click('.ribbon-tab[data-tab="exibir"]');
    await p.selectOption("#app-theme-select", "system");

    await p.click('.ribbon-tab[data-tab="inserir"]');
    assert.equal(await p.locator("#visual-tools").evaluate((el) => getComputedStyle(el).position), "static");
    assert.equal(await p.locator("#btn-visual-edit").count(), 0);
    for (const name of ["Texto", "Forma", "Imagem", "Desfazer objeto"]) {
      assert.ok(await p.locator("#visual-tools").getByRole("button", { name, exact: true }).isVisible(), `${name} fica na faixa Inserir`);
    }
    const target = p.locator("#rendered-slide-container [data-vkey]").first();
    await target.click();
    assert.ok(await p.locator("#rendered-slide-container .visual-selected").count(), "clicar no próprio objeto o seleciona");
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("#rendered-slide-container .visual-mode").count(), 0, "Escape sai do ajuste de objetos");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("Studio mostra variáveis em tabela, permite editar e arrastar placeholders sem expor segredos", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck();
  const spec = YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
  spec.slides = [
    { layout: "api", title: "Criar tarefa", request: { method: "POST", url: "{{base}}/tasks" }, save: { task_id: "$.task.id" } },
    { layout: "code", title: "Consultar tarefa", filename: "main.py", language: "python", code: "print('{{task_id}}')" },
  ];
  fs.writeFileSync(deckFile.file, YAML.stringify(spec), "utf8");
  const envFile = process.env.SAGADECK_AMBIENTES;
  fs.writeFileSync(envFile, YAML.stringify({
    current: "dev",
    environments: { dev: { vars: { base: "https://private-env-value.invalid", api_token: "PRIVATE_VAR_TOKEN" }, secrets: ["api_key"] } },
  }), "utf8");
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click('.ribbon-tab[data-tab="inserir"]');
    await p.click("#btn-api-vars-studio");
    assert.equal(await p.locator("#modal-studio-vars").count(), 0, "variáveis não abrem em janela flutuante");
    await p.waitForSelector("#tab-panel-vars.active");
    await p.waitForSelector("#studio-env-vars .studio-var-row");
    assert.deepEqual((await p.locator("#studio-env-vars thead th").allTextContents()).slice(0, 2), ["Nome", "Valor"]);
    assert.equal(await p.locator("#studio-env-vars [data-var-name]").first().inputValue(), "base");
    assert.equal(await p.locator('#studio-env-vars [data-var-value]').first().inputValue(), "https://private-env-value.invalid");
    const tokenRow = p.locator('#studio-env-vars .studio-var-row[data-original-var="api_token"]');
    assert.match(await tokenRow.locator("[data-var-value]").inputValue(), /oculto/);
    assert.equal(await tokenRow.locator("[data-var-value]").isDisabled(), true, "valor com aparência de token não pode ser editado/exposto");
    const secretRow = p.locator('#studio-env-vars .studio-var-row[data-studio-drag-var="secret.api_key"]');
    assert.equal(await secretRow.count(), 1, "segredo fica disponível como placeholder sem expor valor");
    assert.match(await secretRow.locator("[data-var-value]").inputValue(), /oculto/);
    assert.doesNotMatch(await p.locator("#studio-env-vars").innerText(), /PRIVATE_SECRET_VALUE/);
    assert.doesNotMatch(await p.locator("#studio-env-vars").innerText(), /PRIVATE_VAR_TOKEN/);
    await p.click("#tab-btn-props");
    const urlField = p.locator("#slide-fields-form .sf-field").filter({ hasText: "Endereço" }).locator("input");
    await urlField.fill("https://api.example.test");
    await p.click("#btn-api-vars-studio");
    await p.waitForSelector("#tab-panel-vars.active");
    await p.evaluate(() => {
      const row = document.querySelector('#studio-env-vars [data-studio-drag-var="base"]');
      const field = [...document.querySelectorAll("#slide-fields-form .sf-field")].find((item) => item.textContent.includes("Endereço"))?.querySelector("input");
      const transfer = new DataTransfer();
      row.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
      field.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    });
    assert.match(await urlField.inputValue(), /\{\{base\}\}/);
    await p.locator('#studio-env-vars [data-var-value]').first().fill("https://new-api.example.test");
    await p.locator("#studio-env-vars .studio-var-row").first().getByRole("button", { name: "Salvar" }).click();
    await p.waitForFunction(() => document.getElementById("studio-vars-status").textContent.includes("salva"));
    assert.match(fs.readFileSync(envFile, "utf8"), /https:\/\/new-api\.example\.test/);
    await p.click("#studio-var-add");
    const newRow = p.locator("#studio-env-vars .studio-var-row").last();
    await newRow.locator("[data-var-name]").fill("workspace");
    await newRow.locator("[data-var-value]").fill("dev");
    await newRow.getByRole("button", { name: "Salvar" }).click();
    await p.waitForFunction(() => [...document.querySelectorAll("#studio-env-vars [data-var-name]")].some((field) => field.value === "workspace"));
    assert.match(fs.readFileSync(envFile, "utf8"), /workspace: dev/);
    await p.click('.thumb-card[data-idx="1"]');
    const savedVar = p.locator("#studio-saved-vars .studio-var-row").filter({ hasText: "task_id" });
    await savedVar.waitFor();
    assert.match(await savedVar.innerText(), /slide anterior/);
    assert.match(await savedVar.innerText(), /\$\.task\.id/);
    const content = await p.locator("#tab-panel-vars").innerText();
    assert.doesNotMatch(content, /PRIVATE_SECRET_VALUE/);
    assert.deepEqual(errors, []);
  } finally {
    await studio.close(); await browser.close(); deckFile.cleanup();
    fs.rmSync(envFile, { force: true });
    fs.rmSync(`${envFile}.bak`, { force: true });
  }
});

test("revisão do Studio sinaliza texto pequeno sem oferecer correção destrutiva", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.evaluate(() => {
      const title = document.querySelector("#rendered-slide-container .ttl");
      title.style.fontSize = "12px";
      const checkbox = document.querySelector("#chk-inspect-overlay");
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await p.waitForFunction(() => document.querySelector("#fix-panel")?.textContent.includes("Texto pequeno (12px)"));
    assert.equal(await p.locator('#fix-panel [data-fix="auto"]').count(), 0);
    assert.match(await p.getAttribute("#status-issues", "title"), /revisão do slide/);
    await p.click("#status-issues");
    assert.ok(await p.locator("#tab-panel-props").evaluate((el) => el.classList.contains("active")));
    assert.deepEqual(errors, []);
  } finally {
    await studio.close(); await browser.close(); deckFile.cleanup();
  }
});

test("assistente oferece um caminho guiado para criar uma apresentação", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click("#tab-btn-chat");
    assert.match(await p.locator("#chat-empty").innerText(), /assunto, público e duração/);
    assert.ok(await p.getByRole("button", { name: "Preparar para consulta" }).isVisible());
    await p.click("#chat-start-deck");
    assert.ok(await p.locator("#modal-ai-deck").isVisible());
    assert.ok(await p.locator("#ai-deck-briefing").isVisible());
    assert.deepEqual(errors, []);
  } finally {
    await studio.close(); await browser.close(); deckFile.cleanup();
  }
});

test("formulário API expõe as opções suportadas pelo runtime", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck();
  const spec = YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
  spec.slides = [{ layout: "api", title: "Opções da API", request: { method: "POST", url: "{{base}}/run", body: {} } }];
  fs.writeFileSync(deckFile.file, YAML.stringify(spec), "utf8");
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click("#tab-btn-props");
    const form = "#slide-fields-form";
    const field = (label) => `${form} .sf-field:has(> .sf-label:text-is("${label}"))`;
    await p.locator(`${form} > details.sf-more > summary`).click();
    await p.fill(`${field("Nome da variável do token no código")} input`, "WORKSHOP_TOKEN");
    await p.fill(`${field("Título de cada etapa (caminho)")} input`, "$.service");
    await p.fill(`${field("Parâmetros documentados")} textarea`, '{ "$.model": "Modelo usado" }');
    await p.fill(`${field("Comparação por embeddings")} textarea`, '{ "reference": "entrada", "texts": ["alternativa"] }');
    await p.fill(`${field("Abas de código")} textarea`, '["curl", "python"]');
    const tabs = await p.locator(`${field("Aba aberta ao entrar")} select option`).evaluateAll((options) => options.map((option) => option.value));
    assert.ok(tabs.includes("texts") && tabs.includes("log"), "a seleção inclui embeddings e mensagens de WebSocket");
    await p.waitForFunction(async () => (await (await fetch("/api/deck")).json()).spec.slides[0].tokenVar === "WORKSHOP_TOKEN");
    await p.waitForTimeout(900);
    let saved = YAML.parse(fs.readFileSync(deckFile.file, "utf8")).slides[0];
    assert.equal(saved.tokenVar, "WORKSHOP_TOKEN");
    assert.equal(saved.stepTitle, "$.service");
    assert.deepEqual(saved.fields, { "$.model": "Modelo usado" });
    assert.deepEqual(saved.similarity, { reference: "entrada", texts: ["alternativa"] });
    assert.deepEqual(saved.code, ["curl", "python"]);
    await p.selectOption(`${field("Modo")} select`, "stream");
    await p.waitForSelector(field("Leitura do texto no streaming"));
    await p.fill(`${field("Leitura do texto no streaming")} textarea`, '{ "text": "$.delta.text" }');
    await p.waitForFunction(async () => (await (await fetch("/api/deck")).json()).spec.slides[0].stream?.text === "$.delta.text");
    await p.waitForTimeout(900);
    saved = YAML.parse(fs.readFileSync(deckFile.file, "utf8")).slides[0];
    assert.deepEqual(saved.stream, { text: "$.delta.text" });
    await p.selectOption(`${field("Modo")} select`, "realtime");
    await p.waitForSelector(field("Conexão (WebSocket)"));
    await p.fill(`${field("Conexão (WebSocket)")} textarea`, '{ "url": "{{ws}}/realtime", "text": [{ "type": "input_text" }] }');
    await p.waitForFunction(async () => (await (await fetch("/api/deck")).json()).spec.slides[0].realtime?.url === "{{ws}}/realtime");
    await p.waitForTimeout(900);
    saved = YAML.parse(fs.readFileSync(deckFile.file, "utf8")).slides[0];
    assert.equal(saved.realtime.url, "{{ws}}/realtime");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});

test("demo avançado: aparece no tópico de demonstrações da biblioteca", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const studio = await startStudio(null);
  try {
    const { page: p, errors } = await newPage(browser, studio.url + "/biblioteca");
    const topic = await p.evaluate(async () => {
      const response = await fetch("/api/library/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Demos e modelos" }) });
      return response.json();
    });
    assert.ok(topic.id);
    await p.goto(studio.url + "/biblioteca?topic=" + encodeURIComponent(topic.id));
    await p.click("#btn-new");
    await p.click('#new-menu [data-new="gallery"]');
    await p.click('.vit-card[data-new="model-avancado"]');
    await p.waitForURL(/editor\?deck=/);
    await p.waitForSelector(".thumb-card[data-idx='5']");
    const data = await p.evaluate(async () => (await (await fetch("/api/deck")).json()));
    assert.match(data.spec.title, /recursos avançados/i);
    assert.deepEqual(data.spec.slides.map((slide) => slide.layout), ["cover", "code", "dossier", "mosaic", "statement", "end"]);
    assert.equal(data.spec.slides[1].density, "dense");
    assert.equal(data.spec.slides[4].add.aviso.tipo, "perigo");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); }
});

test('coleções: criar modelos e substituir foto preserva a composição', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const studio = await startStudio(null);
  try {
    const { page: p, errors } = await newPage(browser, studio.url + '/biblioteca');
    for (const kind of ['perspectiva', 'essencial', 'revista', 'cromatico', 'tracos']) {
      await t.test(`criar ${kind} pela biblioteca`, async () => {
        await p.goto(studio.url + '/biblioteca');
        await p.click('#btn-new'); await p.click('#new-menu [data-new="gallery"]'); await p.click(`.vit-card[data-new="model-${kind}"]`);
        await p.waitForSelector('.thumb-card[data-idx="1"]');
        const data = await p.evaluate(async () => (await fetch('/api/deck')).json());
        const saved = YAML.parse(fs.readFileSync(data.file, 'utf8'));
        assert.ok(saved.slides.length >= 6);
        const photo = saved.slides.flatMap(s => s.elements || []).find(e => e.image);
        assert.ok(fs.existsSync(path.join(path.dirname(data.file), photo.image)));
      });
    }
    await p.click('.thumb-card[data-idx="2"]'); await p.click('#tab-btn-props');
    const imageRow = p.locator('#slide-fields-form .sf-element').nth(2).locator('.sf-item-toggle').first();
    await imageRow.click();
    assert.equal(await p.getByRole('button', { name: 'Gerar imagem agora', exact: true }).isVisible(), true, 'gerar deve estar acessível mesmo antes de digitar a descrição');
    const before = await p.evaluate(async () => (await (await fetch('/api/deck')).json()).spec.slides[2].elements.find(e => e.image));
    const chooser = p.waitForEvent('filechooser');
    await p.getByRole('button', { name: 'Escolher minha foto', exact: true }).click();
    await (await chooser).setFiles({ name: 'minha-foto.png', mimeType: 'image/png', buffer: PNG_1PX });
    await p.waitForTimeout(1000);
    const data = await p.evaluate(async () => (await fetch('/api/deck')).json());
    const after = YAML.parse(fs.readFileSync(data.file, 'utf8')).slides[2].elements.find(e => e.image);
    assert.ok(after.image.startsWith('data:image/png;'));
    for (const k of ['x', 'y', 'w', 'h', 'fit']) assert.equal(after[k], before[k], k);
    // O formulário pode ter sido reconstruído após o salvamento.
    const generate = p.getByRole('button', { name: 'Criar imagem pelo conteúdo do slide', exact: true });
    if (!await generate.isVisible()) await imageRow.click();
    await generate.click();
    assert.match(await p.locator('#chat-input').inputValue(), /elements\[2\].*slide 3/);
    assert.match(await p.locator('#chat-input').inputValue(), /baseada no conteúdo/);
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); }
});

test("studio", async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  try {
  const { page: p, errors } = await newPage(browser, studio.url);
  const form = "#slide-fields-form";
  const deck = () => p.evaluate(async () => (await (await fetch("/api/deck")).json()).spec);
  const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
  const go = async (pred) => {
    const i = (await deck()).slides.findIndex(typeof pred === "string" ? (s) => s.layout === pred : pred);
    assert.ok(i >= 0, `slide não encontrado: ${pred}`);
    await p.click(`.thumb-card[data-idx="${i}"]`);
    await p.waitForTimeout(600);
    return i;
  };
  const tab = (name) => p.click(`.ribbon-tab[data-tab="${name}"]`);
  const settle = (ms = 900) => p.waitForTimeout(ms);
  // cada teste começa com a tela "limpa": um teste que falha com um modal aberto não derruba os seguintes
  t.beforeEach(async () => {
    await p.keyboard.press("Escape");
    await p.keyboard.press("Escape");
    await p.evaluate(() => document.querySelectorAll(".popover.open").forEach((x) => x.classList.remove("open")));
  });

  // pedido do "preguiçoso": sem mil botões. Por padrão as ferramentas de especialista ficam guardadas; "Mais opções"
  // mostra tudo e a escolha sobrevive a recarregar. (Deixa ligado: os testes seguintes usam YAML, API, ritmo…)
  await t.test("modo simples por padrão: ferramentas de especialista guardadas; Mais opções mostra e lembra", async () => {
    const visivel = (sel) => p.isVisible(sel);
    await tab("exibir");
    assert.ok(!(await visivel("#btn-yaml-drawer")), "YAML guardado no modo simples");
    assert.ok(await visivel("#btn-notes-toggle"), "o essencial continua");
    await tab("inserir");
    assert.ok(!(await visivel("#btn-api-slide")), "API ao vivo guardada");
    assert.ok(await visivel("#btn-add-diagram"));
    await p.click("#btn-more-options");
    assert.ok(await visivel("#btn-api-slide"), "Mais opções mostra");
    assert.equal(await p.textContent("#btn-more-options span"), "Menos opções");
    await p.reload(); await p.waitForSelector(".thumb-card");
    await tab("exibir");
    assert.ok(await visivel("#btn-yaml-drawer"), "a escolha sobrevive a recarregar");
    await tab("inicio");
  });

  // ------------------------------------------------------------ slides
  await t.test("novo, duplicar e excluir slide", async () => {
    const n = (await deck()).slides.length;
    await p.click("#btn-add-slide"); await settle(400);
    await p.click("#btn-dup-slide"); await settle(400);
    assert.equal((await deck()).slides.length, n + 2);
    await p.click("#btn-del-slide"); await settle(300);
    await p.click("#btn-del-slide"); await settle(400);
    assert.equal((await deck()).slides.length, n);
  });

  await t.test("arrastar miniatura reordena os slides e salva", async () => {
    const before = (await deck()).slides.map((s) => s.layout);
    await p.dragAndDrop('.thumb-card[data-idx="0"]', '.thumb-card[data-idx="2"]', { targetPosition: { x: 20, y: 60 } });
    await settle();
    const after = (await deck()).slides.map((s) => s.layout);
    assert.equal(after[2], before[0], `ordem: ${after.slice(0, 4)}`);
    assert.equal(saved().slides[2].layout, before[0], "salvo no arquivo");
    // desfaz
    await p.dragAndDrop('.thumb-card[data-idx="2"]', '.thumb-card[data-idx="0"]', { targetPosition: { x: 20, y: 5 } });
    await settle();
    assert.deepEqual((await deck()).slides.map((s) => s.layout), before);
  });

  await t.test("densidade técnica salva a escolha sem cortar o código", async () => {
    const index = await go("statement");
    await p.click('#btn-layout-gallery'); await p.click('.layout-card[data-layout="code"]'); await settle();
    const before = saved().slides.find(s => s.layout === "code").code;
    await p.click('#tab-btn-props');
    const select = p.locator('#slide-fields-form select').filter({has:p.locator('option[value="dense"]')});
    await select.selectOption('dense'); await settle();
    const after = saved().slides.find(s => s.layout === "code");
    assert.equal(after.density, 'dense'); assert.equal(after.code, before);
    assert.equal(await p.locator('#rendered-slide-container .density-dense').count(), 1);
    assert.equal(await select.locator('option').filter({hasText:'Confortável'}).count(),1);
    await p.click('#btn-layout-gallery'); await p.click('.layout-card[data-layout="statement"]'); await settle();
  });

  // ------------------------------------------------------------ layout
  await t.test("galeria de layouts mostra prévia e descrição de cada layout", async () => {
    await go("cards");
    await p.click("#btn-layout-gallery");
    await p.waitForFunction(() => document.querySelector('.layout-card[data-layout="bento"] .thumb-render')?.innerHTML.length > 50);
    const r = await p.evaluate(() => {
      const cards = [...document.querySelectorAll(".layout-card")];
      const grid = document.querySelector(".layout-grid");
      return { n: cards.length, empty: cards.filter((c) => c.querySelector(".thumb-render").innerHTML.length < 50).map((c) => c.dataset.layout),
        noDesc: cards.filter((c) => !c.querySelector(".lc-desc").textContent).map((c) => c.dataset.layout),
        active: document.querySelector(".layout-card.active")?.dataset.layout,
        kinetic: cards.some((c) => c.dataset.layout === "kinetic"),
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        cardWidth: cards[0].getBoundingClientRect().width,
        previewWidth: cards[0].querySelector(".lc-prev").clientWidth,
        previewScale: parseFloat(getComputedStyle(cards[0].querySelector(".lc-prev")).getPropertyValue("--thumb-scale")) };
    });
    assert.ok(r.n >= 29, `${r.n} layouts`);
    assert.deepEqual(r.empty, [], "layouts sem prévia");
    assert.deepEqual(r.noDesc, [], "layouts sem descrição");
    assert.equal(r.active, "cards");
    assert.equal(r.kinetic, true, "galeria inclui tipografia cinética");
    assert.equal(r.columns, 3, "galeria mostra três cartões por linha");
    assert.ok(r.cardWidth > 260, `cartão ampliado: ${r.cardWidth}px`);
    assert.ok(Math.abs(r.previewScale * 1920 - r.previewWidth) < 2, "prévia ocupa o retângulo sem corte");
    await p.keyboard.press("Escape");
  });

  await t.test("trocar de layout leva o conteúdo junto (cartões → funil)", async () => {
    const i = await go("cards");
    const titles = (await deck()).slides[i].items.map((x) => x.title);
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="funnel"]'); await settle();
    const s = (await deck()).slides[i];
    assert.equal(s.layout, "funnel");
    assert.deepEqual(s.stages.map((x) => x.title), titles);
    assert.match(await p.textContent(form), /Etapas do funil/);
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="cards"]'); await settle();
    assert.equal((await deck()).slides[i].layout, "cards");
  });

  // navegação por caminhos: o mapa (hub) pelo formulário, com o destino de cada caminho e o id do slide
  await t.test("Mapa de caminhos: criar pela galeria, adicionar caminho com destino e dar id ao slide salva no deck", async () => {
    await go("statement");
    await p.click("#btn-add-slide"); await settle(500);
    const i = await p.evaluate(() => +document.querySelector(".thumb-card.active").dataset.idx); // o slide novo
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="hub"]'); await settle();
    assert.equal(saved().slides[i].layout, "hub");
    assert.match(await p.textContent(form), /Caminhos/);
    const n = (saved().slides[i].options || []).length;
    await p.click(`${form} button:has-text("Adicionar caminho")`); await settle();
    assert.equal(saved().slides[i].options.length, n + 1, "caminho novo no deck");
    const item = p.locator(`${form} .sf-item`).last();
    const destino = item.locator('.sf-field:has(.sf-label:text-is("Ao clicar, ir para")) input').first();
    if (!(await destino.isVisible())) await item.locator(".sf-item-toggle").first().click();
    await destino.fill("fim"); await destino.blur(); await settle();
    assert.equal(saved().slides[i].options.at(-1).goto, "fim", "o destino do caminho no deck salvo");
    assert.ok(await p.locator('#rendered-slide-container .hub-card[data-goto="fim"]').count(), "e a opção clicável no slide");
    const idField = p.locator(`${form} .sf-field:has(.sf-label:text-is("Id do slide")) input`).first();
    const abriu = !(await idField.isVisible());
    if (abriu) await p.locator(`${form} summary:has-text("Mais opções")`).last().click();
    await idField.fill("mapa"); await idField.blur(); await settle();
    assert.equal(saved().slides[i].id, "mapa", "id do slide salvo");
    // o Studio lembra se "Mais opções" está aberto: deixa como estava para os próximos testes
    if (abriu) await p.locator(`${form} summary:has-text("Mais opções")`).last().click();
    await p.click("#btn-del-slide"); await settle(500);
  });

  // status semanal: pela galeria, marcar a saúde, pôr o avanço e anotar um bloqueio com responsável
  await t.test("Status semanal: criar pela galeria, marcar saúde, avanço e um bloqueio salva no deck", async () => {
    await go("statement");
    await p.click("#btn-add-slide"); await settle(500);
    const i = await p.evaluate(() => +document.querySelector(".thumb-card.active").dataset.idx);
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="status"]'); await settle();
    assert.equal(saved().slides[i].layout, "status");
    const campo = (label, tag = "input") => p.locator(`${form} .sf-field:has(.sf-label:text-is("${label}")) ${tag}`).first();
    await campo("Saúde", "select").selectOption("atrasado"); await settle();
    await campo("Avanço (%)").fill("40"); await campo("Avanço (%)").blur(); await settle();
    const n = (saved().slides[i].blocked || []).length;
    await p.click(`${form} button:has-text("Adicionar bloqueio")`); await settle();
    const item = p.locator(`${form} .sf-list:has(> .sf-list-head button:has-text("Adicionar bloqueio")) .sf-item`).last();
    const texto = item.locator("textarea, input").first();
    await texto.fill("Aguardando acesso ao banco"); await texto.blur(); await settle();
    const s = saved().slides[i];
    assert.equal(s.health, "atrasado");
    assert.equal(s.progress, 40);
    assert.equal(s.blocked.length, n + 1);
    assert.match(JSON.stringify(s.blocked.at(-1)), /Aguardando acesso ao banco/, "o bloqueio no deck salvo");
    assert.match(await p.textContent("#rendered-slide-container .stt-health"), /Atrasado/);
    assert.match(await p.textContent("#rendered-slide-container .stt-blocked"), /Aguardando acesso ao banco/);
    await p.click("#btn-del-slide"); await settle(500);
  });

  // one-page: pela galeria, escrever o problema e pôr um número grande no painel
  await t.test("One-page: criar pela galeria, escrever o problema e adicionar número ao painel salva no deck", async () => {
    await go("statement");
    await p.click("#btn-add-slide"); await settle(500);
    const i = await p.evaluate(() => +document.querySelector(".thumb-card.active").dataset.idx);
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="onepage"]'); await settle();
    assert.equal(saved().slides[i].layout, "onepage");
    const problema = p.locator(`${form} fieldset:has(> legend:text-is("O problema")) .sf-field:has(.sf-label:text-is("Texto")) textarea`).first();
    await problema.fill("Abrir conta leva 5 dias"); await problema.blur(); await settle();
    assert.equal(saved().slides[i].problem.text, "Abrir conta leva 5 dias", "o problema no deck salvo");
    await p.locator(`${form} fieldset:has(> legend:text-is("Painel")) button:has-text("Adicionar número")`).first().click();
    await settle();
    const n = saved().slides[i].dashboard?.numbers || [];
    assert.equal(n.length, 1, "um número grande no painel");
    assert.equal(n[0].value, "100");
    assert.match(await p.textContent("#rendered-slide-container .op-problem"), /Abrir conta leva 5 dias/);
    assert.ok(await p.locator("#rendered-slide-container .op-kpi").count(), "e o número no slide");
    await p.click("#btn-del-slide"); await settle(500);
  });

  await t.test("editor visual tem formulário para os layouts novos", async () => {
    const i = await go("statement");
    const expect = { headline: /Frase/, full: /Imagem gerada pela IA/, bento: /Blocos/, funnel: /Etapas do funil/, pyramid: /Níveis/, agenda: /Seções/, kinetic: /Cena de fundo/ };
    for (const [layout, label] of Object.entries(expect)) {
      await p.click("#btn-layout-gallery");
      await p.click(`.layout-card[data-layout="${layout}"]`); await settle(600);
      assert.match(await p.textContent(form), label, layout);
    }
    assert.match(await p.textContent(form), /Frases da sequência/);
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="statement"]'); await settle();
    assert.equal((await deck()).slides[i].layout, "statement");
  });

  await t.test("trocar uma capa para tipografia cinética leva o título e a figura", async () => {
    const i = await go("cover");
    const before = (await deck()).slides[i];
    let changed = false;
    try {
      await p.click("#btn-layout-gallery");
      await p.click('.layout-card[data-layout="kinetic"]'); changed = true; await settle();
      const kinetic = saved().slides[i];
      assert.equal(kinetic.layout, "kinetic");
      assert.deepEqual(kinetic.beats, [
        { text: "Título da ==capa==", tag: "Suíte de testes" },
        { text: "Subtítulo" },
      ]);
      assert.deepEqual(kinetic.figure, before.figure);
      assert.match(await p.locator("#rendered-slide-container").innerText(), /Título da capa/i);
      assert.match(await p.textContent(form), /Frases da sequência/);
    } finally {
      if (changed) {
        await p.click("#btn-layout-gallery");
        await p.click('.layout-card[data-layout="cover"]'); await settle();
      }
    }
  });

  await t.test("codewalk infere linguagem do arquivo e permite uma escolha manual", async () => {
    const i = await go("statement");
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="codewalk"]'); await settle();
    const filename = `${form} input[placeholder="exemplo.js"]`;
    const language = p.locator(`${form} select`).first();
    const options = await language.locator("option").evaluateAll((items) => items.map((item) => item.textContent.trim()));
    assert.deepEqual(options.slice(1), ["Python", "Java", "JavaScript", "TypeScript", "C#"]);

    await p.fill(filename, "hello.py"); await settle();
    assert.equal(await language.inputValue(), "Python");
    assert.equal((await deck()).slides[i].language, "Python");

    await language.selectOption("Java"); await settle();
    await p.fill(filename, "hello.ts"); await settle();
    assert.equal(await language.inputValue(), "Java", "a escolha manual prevalece sobre a extensão");

    await language.selectOption(""); await settle();
    await p.fill(filename, "hello.cs"); await settle();
    assert.equal(await language.inputValue(), "C#", "voltar à inferência acompanha a extensão nova");
    assert.equal((await deck()).slides[i].language, "C#");
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="statement"]'); await settle();
  });

  await t.test("imagem a gerar: placeholder no slide e botão Gerar imagem agora", async () => {
    await go("full");
    assert.ok(await p.isVisible("#rendered-slide-container .fig-pending"), "placeholder no canvas");
    assert.match(await p.inputValue(`${form} textarea >> nth=0`), /sala de controle/, "descrição visível no formulário");
    assert.ok(await p.isVisible(`${form} button:has-text("Gerar imagem agora")`), "botão no formulário");
  });

  // ------------------------------------------------------------ aparência
  await t.test("Tom com prévia: 4 opções desenhando o slide atual", async () => {
    await go("statement");
    await p.click("#btn-tone");
    assert.equal(await p.locator(".variant-card .slide").count(), 4);
    await p.click('.variant-card[data-value="accent"]'); await settle();
    assert.match(await p.getAttribute("#rendered-slide-container .slide", "class"), /tone-accent/);
    assert.equal(await p.textContent("#btn-tone .vpick-name"), "Destaque");
    await p.click("#btn-tone");
    await p.click('.variant-card[data-value="light"]'); await settle();
  });

  await t.test("Fundo com prévia: cada textura aparece na prévia", async () => {
    const i = await go("statement");
    await p.click("#btn-deco");
    assert.equal(await p.locator(".variant-card .slide.deco-aurora").count(), 1);
    await p.click('.variant-card[data-value="grid"]'); await settle();
    assert.equal((await deck()).slides[i].deco, "grid");
    await p.click("#btn-deco");
    await p.click('.variant-card[data-value="none"]'); await settle();
  });

  await t.test("estilo do ==destaque== (markStyle) vale para o deck", async () => {
    await go("statement");
    await tab("design");
    await p.selectOption("#mark-style-select", "negrito"); await settle();
    assert.equal((await deck()).markStyle, "negrito");
    assert.match(await p.getAttribute("#rendered-slide-container .slide", "class"), /ms-negrito/);
    await p.selectOption("#mark-style-select", "marca-texto"); await settle();
    await tab("inicio");
  });

  await t.test("Identidade: Configurar cria o modelo; escolher põe as fontes da empresa no slide e no deck salvo; avisa se não estão instaladas", async () => {
    const old = process.env.SAGADECK_IDENTIDADES;
    process.env.SAGADECK_IDENTIDADES = path.join(deckFile.dir, "config", "identidades.yaml");
    try {
      await tab("design");
      await p.click("#btn-identity-setup"); await settle(700);
      assert.ok(fs.existsSync(process.env.SAGADECK_IDENTIDADES), "modelo criado");
      assert.match(fs.readFileSync(process.env.SAGADECK_IDENTIDADES, "utf8"), /fontes:/);
      await p.waitForFunction(() => [...document.querySelectorAll("#identity-select option")].some((o) => o.value === "trabalho"));
      await p.selectOption("#identity-select", "trabalho"); await settle(1200);
      assert.equal(saved().identity, "trabalho", "salvo no deck");
      const font = await p.evaluate(() => getComputedStyle(document.querySelector("#rendered-slide-container .f-body, #rendered-slide-container .t")).fontFamily);
      assert.match(font, /Nome da Fonte Sans/, "o slide usa a fonte da empresa (com a do tema de reserva)");
      assert.match(await p.textContent("#identity-note"), /Nenhuma das fontes está instalada/, "aviso: fonte de mentira não está instalada");
      await p.selectOption("#identity-select", ""); await settle(900);
      assert.equal(saved().identity, undefined, "Do tema: sai do deck");
    } finally {
      if (old === undefined) delete process.env.SAGADECK_IDENTIDADES; else process.env.SAGADECK_IDENTIDADES = old;
      await tab("inicio");
    }
  });

  await t.test("Design: temas e paletas ficam à vista (a lista de paletas não espreme os temas), a faixa não rola na vertical e o tema clicado vai para o deck salvo", async () => {
    const old = process.env.SAGADECK_IDENTIDADES;
    process.env.SAGADECK_IDENTIDADES = path.join(deckFile.dir, "sem-config", "identidades.yaml"); // aviso "configure" à vista
    const size = p.viewportSize();
    try {
      await tab("design");
      await p.evaluate(() => window.dispatchEvent(new Event("focus"))); await settle(600); // relê as identidades
      assert.ok(await p.isVisible("#identity-note"), "o aviso das fontes está à vista (o caso mais alto)");
      for (const width of [1366, 2000]) {
        await p.setViewportSize({ width, height: 900 }); await settle(300);
        const m = await p.evaluate(() => {
          const panel = document.querySelector('.ribbon-panel[data-panel="design"]');
          const w = (sel) => document.querySelector(sel).getBoundingClientRect().width;
          return { sobra: panel.scrollHeight - panel.clientHeight, temas: w("#theme-gallery"), paletas: w("#palette-gallery") };
        });
        assert.ok(m.sobra <= 1, `${width}px: a faixa rola na vertical (${m.sobra}px a mais)`);
        assert.ok(m.temas >= 3 * 104, `${width}px: a galeria de temas sumiu (${Math.round(m.temas)}px)`);
        assert.ok(m.paletas >= 3 * 104, `${width}px: a galeria de paletas sumiu (${Math.round(m.paletas)}px)`);
      }
      await p.click('#theme-gallery .theme-card[data-theme="editorial"]'); await settle(900);
      assert.equal(saved().theme, "editorial", "tema clicado salvo no deck");
      await p.click('#theme-gallery .theme-card[data-theme="sinal"]'); await settle(900);
      assert.equal(saved().theme, "sinal");
    } finally {
      if (old === undefined) delete process.env.SAGADECK_IDENTIDADES; else process.env.SAGADECK_IDENTIDADES = old;
      await p.setViewportSize(size);
      await tab("inicio");
    }
  });

  await t.test("faixa de opções: rótulos dos botões com espaço entre as palavras", async () => {
    // um <br> escondido pelo CSS grudava as palavras ("Diagramade texto"); o teste lê o texto
    // visível aba por aba, como a pessoa vê na tela (aba inativa não tem layout e o innerText volta grudado)
    const esperado = {
      inserir: ["Diagrama de texto"],
      avancado: ["Página de consulta", "Grade adaptável", "Diagrama vivo", "Tipografia cinética"],
      design: ["Cabeçalho e rodapé"],
      ia: ["Deck com IA"],
      revisar: ["Última fileira", "Mapa de atenção"],
    };
    for (const [aba, rotulos] of Object.entries(esperado)) {
      await tab(aba); await settle(300);
      const visiveis = await p.evaluate(() => [...document.querySelectorAll(".ribbon-panel.active .rbtn-lg > span")]
        .map((s) => s.innerText.replace(/\s+/g, " ").trim()));
      for (const r of rotulos) assert.ok(visiveis.includes(r), `${aba}: sem o botão "${r}" (veio: ${visiveis.join(" | ")})`);
      for (const v of visiveis) assert.ok(!/[a-zà-öø-ÿ][A-ZÀ-ÖØ-Þ]/.test(v), `${aba}: palavras grudadas em "${v}"`);
    }
    await tab("inicio");
  });

  await t.test("Deck com IA: minutos calculam os slides, estilo sugere o tema e o pedido leva tudo", async () => {
    await tab("ia");
    await p.click("#btn-ai-deck");
    assert.ok(await p.isVisible("#modal-ai-deck"), "modal abriu");
    assert.equal(await p.inputValue("#ai-deck-minutes"), "15");
    assert.equal(await p.inputValue("#ai-deck-slides"), "10");
    await p.fill("#ai-deck-minutes", "30");
    assert.equal(await p.inputValue("#ai-deck-slides"), "20", "30 min viram 20 slides");
    await p.fill("#ai-deck-slides", "8"); // ajuste fino manual…
    await p.fill("#ai-deck-minutes", "45");
    assert.equal(await p.inputValue("#ai-deck-slides"), "30", "…mas trocar os minutos recalcula");
    await p.selectOption("#ai-deck-style", "revista");
    assert.equal(await p.inputValue("#ai-deck-theme"), "editorial", "estilo sugere o tema");
    await p.selectOption("#ai-deck-theme", ""); // a IA escolhe: o estilo decide no servidor
    await p.fill("#ai-deck-briefing", "palestra teste sobre pix");
    // o servidor está sem LLM nos testes: responde com o próprio deck de teste (renderização conhecida)
    await p.route("**/api/ai/generate", async (route) => {
      const spec = YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
      await route.fulfill({ json: { ok: true, spec, file: deckFile.file, images: { done: [], failed: [] } } });
    });
    const req = p.waitForRequest("**/api/ai/generate");
    await p.click("#btn-run-ai-deck");
    const body = JSON.parse((await req).postData());
    await p.unroute("**/api/ai/generate");
    assert.equal(body.duration, 45);
    assert.equal(body.slides, 30);
    assert.equal(body.style, "revista");
    await p.waitForTimeout(1500);
    assert.ok(await p.isHidden("#modal-ai-deck"), "modal fechou: gerou");
    await tab("inicio");
  });

  await t.test("Deck com IA: anexos vão como materiais no pedido", async () => {
    await tab("ia");
    await p.click("#btn-ai-deck");
    // upload de verdade (o servidor extrai sem LLM); a geração é interceptada
    await p.setInputFiles("#ai-deck-files", { name: "dados.txt", mimeType: "text/plain", buffer: Buffer.from("Fraudes: 40% em 2025.") });
    await p.waitForFunction(() => [...document.querySelectorAll("#ai-deck-materials .chat-doc b")]
      .some((b) => b.textContent === "dados.txt" && !/lendo/.test(b.closest(".chat-att").textContent)));
    await p.fill("#ai-deck-briefing", "palestra teste sobre pix");
    await p.route("**/api/ai/generate", async (route) => {
      const spec = YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
      await route.fulfill({ json: { ok: true, spec, file: deckFile.file, images: { done: [], failed: [] } } });
    });
    const req = p.waitForRequest("**/api/ai/generate");
    await p.click("#btn-run-ai-deck");
    const body = JSON.parse((await req).postData());
    await p.unroute("**/api/ai/generate");
    assert.equal(body.materials.length, 1);
    assert.equal(typeof body.materials[0], "string");
    await p.waitForTimeout(1500);
    assert.ok(await p.isHidden("#modal-ai-deck"), "modal fechou: gerou");
    await tab("inicio");
  });

  await t.test("elemento Aviso: adiciona pelo formulário, salva e desenha a caixa", async () => {
    await p.click('.thumb-card[data-idx="0"]'); await settle(600);
    await p.click("#tab-btn-props"); await settle(400);
    for (const s of await p.locator(`${form} summary:has-text("Mais opções")`).all()) {
      if (await s.isVisible()) await s.click();
    }
    const extras = p.locator(`${form} .sf-list`, { has: p.locator(".sf-list-head", { hasText: "Elementos extras no fim" }) });
    await extras.locator("select.sf-kind-add").selectOption("aviso");
    await settle(600);
    const card = p.locator(`${form} .sf-item`, { has: p.locator(".sf-item-title", { hasText: "Aviso" }) });
    if (await card.locator(".sf-item-toggle").getAttribute("aria-expanded") === "false") {
      await card.locator(".sf-item-toggle").click();
    }
    // o cartão pode estar dentro de um "Mais opções" fechado (o display calculado não acusa, mas o
    // navegador esconde): abre toda a cadeia de details, como a pessoa faria
    await card.evaluate((c) => { for (let e = c.parentElement; e; e = e.parentElement) if (e.tagName === "DETAILS" && !e.open) e.open = true; });
    const field = (label) => card.locator(".sf-field", { has: p.locator("label.sf-label", { hasText: label }) }).locator("input, textarea, select");
    // espera robusta: o formulário reconstrói de forma assíncrona e o CI lento atrasa o desenho
    await p.waitForFunction((form) => {
      const cards = [...document.querySelectorAll(`${form} .sf-item`)];
      const card = cards.find((c) => c.querySelector(".sf-item-title")?.textContent.includes("Aviso"));
      const inp = card?.querySelector(".sf-field input");
      if (!card?.classList.contains("open") || !inp || getComputedStyle(inp).display === "none") return false;
      for (let e = inp; e; e = e.parentElement) if (e.tagName === "DETAILS" && !e.open) return false;
      return true;
    }, form, { timeout: 20000 });
    await field("Título").fill("Cuidado");
    await field("Texto").fill("Não molhe o equipamento.");
    await settle(1200);
    const add = saved().slides[0].add || [];
    assert.ok(add.some((e) => e.aviso && e.aviso.titulo === "Cuidado" && e.aviso.texto === "Não molhe o equipamento."), "aviso salvo no deck");
    const box = p.locator("#rendered-slide-container .aviso");
    assert.ok(await box.isVisible(), "caixa desenhada");
    assert.match(await box.innerText(), /Cuidado/);
    assert.match(await box.innerText(), /Não molhe/);
    await tab("inicio");
  });

  await t.test("conteúdo que não cabe: editor e miniatura reduzem (sem sobrepor) e avisam que foi automático", async () => {
    const i = await go((s) => s.title === "Conteúdo que não cabe");
    await settle(900);
    const overlap = (sel) => p.evaluate((sel) => {
      const s = document.querySelector(sel);
      const row = s.querySelector(".row"), next = row.nextElementSibling;
      const last = Math.max(...[...row.querySelectorAll(".t")].map((t) => t.getBoundingClientRect().bottom));
      return last - next.getBoundingClientRect().top;
    }, sel);
    assert.ok(await overlap("#rendered-slide-container .slide") <= 1, "canvas sem sobreposição");
    assert.match(await p.textContent("#status-fit"), /reduzid/i, "aviso de ajuste automático");
    assert.match(await p.getAttribute("#status-fit", "title"), /conteúdo do slide/i);
    await p.waitForFunction((i) => document.querySelector(`.thumb-card[data-idx="${i}"] .thumb-render .slide`), i);
    assert.ok(await overlap(`.thumb-card[data-idx="${i}"] .thumb-render .slide`) <= 1, "miniatura sem sobreposição");
  });

  // ------------------------------------------------------------ edição
  await t.test("digitar no formulário atualiza slide e arquivo sem perder o foco", async () => {
    const i = await go("cards");
    const input = p.locator(`${form} > .sf-field:nth-of-type(2) input`);
    await input.click(); await input.press("End");
    await p.keyboard.type(" TESTE", { delay: 40 }); await settle(1200);
    assert.ok(await p.evaluate(() => document.activeElement?.closest("#slide-fields-form") != null), "foco");
    assert.ok((await p.innerText("#rendered-slide-container")).includes("TESTE"), "canvas");
    assert.ok(saved().slides[i].title.endsWith(" TESTE"), "arquivo");
    for (let k = 0; k < 6; k++) await input.press("Backspace");
    await settle();
  });

  await t.test("Inserir → Diagrama: desenha no palco e na miniatura; editar o código salva, e erro aparece na barra", async () => {
    await tab("inserir");
    await p.click("#btn-add-diagram"); await settle(1200);
    const i = (await deck()).slides.findIndex((s) => s.layout === "diagram");
    assert.ok(i >= 0, "slide inserido");
    assert.match(saved().slides[i].mermaid, /flowchart/, "salvo no arquivo");
    await p.waitForSelector('#rendered-slide-container .dg-box[data-dg="ready"] > svg', { timeout: 15000 });
    await p.waitForSelector(`.thumb-card[data-idx="${i}"] .dg-box[data-dg="ready"] > svg`, { timeout: 15000 });
    const code = p.locator(`${form} textarea`).first();
    // código quebrado: o palco mostra o erro e a barra de status avisa
    await code.fill("flowchart LR\n  A[Pedido --> ");
    await settle(1500);
    await p.waitForSelector('#rendered-slide-container .dg-error', { timeout: 15000 });
    assert.match(await p.textContent("#status-fit"), /Diagrama com erro/);
    // conserta: desenha de novo e o arquivo guarda o código novo (ênfase e ícone inclusos)
    await code.fill("flowchart LR\n  A([:key-round: Pedido]):::hi --> B[Wave] ==> C[Produção]:::em");
    await settle(1500);
    await p.waitForSelector('#rendered-slide-container .dg-box[data-dg="ready"] .dgi svg', { timeout: 15000 });
    assert.match(saved().slides[i].mermaid, /C\[Produção\]:::em/);
    assert.doesNotMatch(await p.textContent("#status-fit"), /Diagrama com erro/);
    // limpa para os próximos testes
    await tab("inicio");
    await go((s) => s.layout === "diagram");
    await p.click("#btn-del-slide"); await settle(500);
  });

  await t.test("Inserir → Infográfico: desenha; trocar a forma e adicionar item pelo formulário salva no deck", async () => {
    await tab("inserir");
    await p.click("#btn-add-infographic"); await settle(1200);
    const i = (await deck()).slides.findIndex((s) => s.layout === "infographic");
    assert.ok(i >= 0, "slide inserido");
    assert.ok(saved().slides[i].items.length >= 2, "salvo com os itens de exemplo");
    await p.waitForSelector("#rendered-slide-container .ig-stage.ig-arco .ig-box");
    await p.selectOption(`${form} select.form-control >> nth=0`, "metro"); await settle(1200);
    await p.waitForSelector("#rendered-slide-container .ig-stage.ig-metro");
    assert.equal(saved().slides[i].shape, "metro");
    const n = saved().slides[i].items.length;
    await p.click(`${form} button:has-text("Adicionar item")`); await settle(1200);
    assert.equal(saved().slides[i].items.length, n + 1, "item novo no deck");
    assert.equal(await p.locator("#rendered-slide-container .ig-layer").count(), n + 1, "e no desenho");
    await tab("inicio");
    await go((s) => s.layout === "infographic");
    await p.click("#btn-del-slide"); await settle(500);
  });

  await t.test("lista: adicionar, reordenar e remover cartões", async () => {
    const i = await go("cards");
    const [a, b] = (await deck()).slides[i].items.map((c) => c.title);
    const n = (await deck()).slides[i].items.length;
    await p.click(`${form} .sf-list-head button:has-text("Adicionar cartão")`); await settle();
    assert.equal((await deck()).slides[i].items.length, n + 1);
    await p.locator(`${form} .sf-item`).last().locator('button[title="Remover"]').click(); await settle();
    assert.equal((await deck()).slides[i].items.length, n);
    await p.locator(`${form} .sf-item`).first().locator('button[title="Descer"]').click(); await settle();
    assert.deepEqual((await deck()).slides[i].items.slice(0, 2).map((c) => c.title), [b, a]);
    await p.locator(`${form} .sf-item`).first().locator('button[title="Descer"]').click(); await settle();
  });

  await t.test("escolher ícone pela biblioteca", async () => {
    const i = await go("cards");
    await p.locator(`${form} .sf-item-toggle`).first().click();
    await p.locator(`${form} .sf-item.open button:has-text("Escolher")`).first().click();
    await p.fill("#icon-search-input", "rocket"); await settle(600);
    await p.locator(".icon-card").first().click();
    await p.click("#btn-insert-icon-figure"); await settle();
    assert.match((await deck()).slides[i].items[0].icon, /rocket/);
  });

  await t.test("comparação: editar o lado B", async () => {
    const i = await go("compare");
    const input = p.locator(`${form} fieldset.sf-object`).nth(1).locator(".sf-field input").first();
    const orig = await input.inputValue();
    await input.fill(orig + " X"); await settle();
    assert.equal((await deck()).slides[i].right.label, orig + " X");
    await input.fill(orig); await settle();
  });

  await t.test("edição direto no slide com barra de formatação (negrito + cor) preserva a marcação", async () => {
    const i = await go("cards");
    const target = p.locator("#rendered-slide-container .card .t[contenteditable=true]").nth(2);
    await target.click();
    await p.evaluate(() => {
      const el = document.activeElement; const r = document.createRange(); const node = el.firstChild;
      r.setStart(node, 0); r.setEnd(node, Math.min(6, node.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    assert.ok(await p.isVisible("#format-bar"), "barra de formatação aparece com seleção");
    await p.click('#format-bar [data-fmt="bold"]');
    await p.click('#format-bar [data-fmt="em"]');
    await p.keyboard.press("Escape"); await settle(1200);
    const item = JSON.stringify((await deck()).slides[i].items);
    assert.match(item, /\^\^\*\*|\*\*\^\^/, item);
  });

  // ------------------------------------------------------------ cliques
  await t.test("controle de cliques mostra o slide como a plateia vê", async () => {
    const i = await go((s) => s.title === "Três lugares para colocar um humano");
    const vis = () => p.evaluate(() => [...document.querySelectorAll("#rendered-slide-container [data-step]")].map((e) => +getComputedStyle(e).opacity));
    assert.ok((await vis()).every((o) => o === 1), "Tudo por padrão");
    await p.click('.step-btn[data-step-val="0"]'); await settle(700);
    assert.ok((await vis()).every((o) => o === 0), "clique 0");
    await p.click('.step-btn[data-step-val="2"]'); await settle(700);
    assert.deepEqual((await vis()).map((o) => o === 1), [true, true, false], "clique 2");
    await p.click('.step-btn[data-step-val="all"]'); await settle(500);
    const thumbAll = await p.evaluate((i) => [...document.querySelectorAll(`.thumb-card[data-idx="${i}"] .thumb-render [data-step]`)].every((e) => +getComputedStyle(e).opacity === 1), i);
    assert.ok(thumbAll, "miniatura mostra todos os passos");
  });

  // ------------------------------------------------------------ auto-correção visível
  await t.test("mudança automática aparece no painel e pode ser desfeita", async () => {
    const i = await go("statement");
    await p.evaluate(async (i) => {
      const d = (await (await fetch("/api/deck")).json()).spec;
      d.slides[i].titleSize = 60;
      d.slides[i].auto = [{ campo: "titleSize", antes: null, motivo: "teste", por: "auto-correção", quando: "2026-01-01 00:00" }];
      await fetch("/api/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: d }) });
    }, i);
    await p.reload({ waitUntil: "networkidle" }); await settle(600);
    await go("statement");
    assert.ok(await p.locator(`.thumb-card[data-idx="${i}"] .thumb-auto`).count(), "selo ⚙ na miniatura");
    assert.ok(await p.isVisible("#auto-banner"), "aviso no painel Formatar");
    await p.click("#auto-banner [data-undo]"); await settle();
    const s = (await deck()).slides[i];
    assert.equal(s.titleSize, undefined);
    assert.ok(!s.auto?.length);
  });

  // ------------------------------------------------------------ YAML
  await t.test("gaveta de YAML: slide atual, com edição aplicada", async () => {
    const i = await go("statement");
    await tab("exibir"); await p.click("#btn-yaml-drawer");
    await p.waitForFunction(() => document.querySelector("#yaml-live-editor").value.includes("layout:"));
    const v = await p.inputValue("#yaml-live-editor");
    assert.doesNotMatch(v, /^slides:/m, "só o slide atual");
    await p.fill("#yaml-live-editor", v.replace(/^kicker: .*$/m, "kicker: Mudado pelo YAML")); await settle(1200);
    assert.equal((await deck()).slides[i].kicker, "Mudado pelo YAML");
    assert.ok(await p.locator("#yaml-hl .yh-key").count() > 0, "realce de sintaxe");
  });

  await t.test("gaveta de YAML: deck inteiro com separadores e YAML inválido não aplica", async () => {
    if (!(await p.isVisible("#yaml-live-editor"))) { await tab("exibir"); await p.click("#btn-yaml-drawer"); }
    await p.click("#yaml-mode-deck"); await settle(600);
    const v = await p.inputValue("#yaml-live-editor");
    assert.match(v, /# ─+ slide 1/);
    assert.doesNotMatch(v, /^_(dir|file):/m, "campos internos escondidos");
    const n = (await deck()).slides.length;
    await p.fill("#yaml-live-editor", v + "\n  : : quebrado ["); await settle(1200);
    assert.ok(await p.evaluate(() => document.querySelector("#yaml-status").classList.contains("error")));
    assert.equal((await deck()).slides.length, n);
    await p.fill("#yaml-live-editor", v); await settle(1200);
    await p.click("#yaml-mode-slide");
    await p.click("#btn-close-yaml-drawer");
  });

  await t.test("QR code no encerramento: editar o link pelo formulário", async () => {
    const i = await go("end");
    const input = p.locator(`${form} .sf-field:has-text("QR code (link)") input`);
    await input.fill("https://www.linkedin.com/in/outro-perfil"); await settle();
    assert.equal((await deck()).slides[i].qr, "https://www.linkedin.com/in/outro-perfil");
    assert.ok(await p.isVisible("#rendered-slide-container .qr-svg"), "QR desenhado no slide");
  });

  // ------------------------------------------------------------ cabeçalho e rodapé
  await t.test("cabeçalho e rodapé: modelo + dados do deck + variável, com prévia, salvos no deck", async () => {
    await go("cards");
    await tab("design");
    await p.click("#btn-header-footer");
    assert.ok(await p.isVisible("#modal-hf"));
    await p.fill('[data-deck="author"]', "Narumi");
    await p.fill('[data-deck="event"]', "Summit");
    await p.fill('[data-deck="department"]', "Dados");
    await p.fill('[data-deck="date"]', "2026-03-07");
    await p.click('.hf-preset[data-preset="corp"]');
    // variável inserida no campo escolhido
    await p.fill('[data-slot="footer.left"]', "");
    await p.click('[data-slot="footer.left"]');
    await p.click('.hf-token[data-token="{autor}"]');
    await settle(700);
    const prev = await p.innerText("#modal-hf .hf-stage");
    assert.match(prev, /NARUMI/i, "prévia mostra o autor");
    assert.match(prev, /CONFIDENCIAL/i, "prévia mostra o cabeçalho do modelo");
    await p.click("#btn-hf-apply"); await settle();
    const d = await deck();
    assert.equal(d.author, "Narumi");
    assert.deepEqual(d.footer, { left: "{autor}", center: "{data:MM/AAAA}", right: "{n} / {total}" });
    assert.deepEqual(d.header, { left: "{depto}", right: "Confidencial" });
    assert.equal(saved().event, "Summit");
    const canvas = await p.innerText("#rendered-slide-container .slide");
    assert.match(canvas, /03\/2026/);
    assert.match(canvas, new RegExp(`${d.slides.findIndex((s) => s.layout === "cards") + 1} / ${d.slides.length}`));
    // miniaturas acompanham (o cache não pode segurar o rodapé antigo)
    await p.waitForFunction(() => /NARUMI/i.test(document.querySelector(".thumb-card.active .thumb-render")?.innerText || ""));
  });

  await t.test("cabeçalho e rodapé: modelo Padrão volta ao título + número", async () => {
    await tab("design");
    await p.click("#btn-header-footer");
    await p.click('.hf-preset[data-preset="padrao"]');
    await p.click("#btn-hf-apply"); await settle();
    const d = await deck();
    assert.equal(d.footer, undefined);
    assert.equal(d.header, undefined);
    await tab("inicio");
  });

  // ------------------------------------------------------------ variedade
  await t.test("Ritmo: deck repetitivo mostra os problemas e oferece 'Deixar menos repetitivo'", async () => {
    const orig = await deck();
    const boring = { ...orig, slides: [orig.slides[0], ...[1, 2, 3, 4].map((k) => ({ layout: "cards", title: `C${k}`, items: [{ title: "a" }, { title: "b" }] })), orig.slides.at(-1)] };
    const post = (spec) => p.evaluate(async (spec) => fetch("/api/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec }) }), spec);
    await post(boring);
    await p.reload({ waitUntil: "networkidle" }); await settle(600);
    await tab("revisar");
    await p.click("#btn-story-arc");
    await p.waitForFunction(() => document.querySelector("#arc-status-badge").textContent === "Repetitivo");
    assert.match(await p.innerText("#arc-problems"), /4 slides seguidos no mesmo layout/);
    await p.click("#btn-vary-deck"); await settle(600);
    const userMsg = await p.evaluate(() => [...document.querySelectorAll("#chat-messages .user-msg")].pop()?.innerText || "");
    assert.match(userMsg, /menos repetitiva/);
    await p.evaluate(() => { const w = document.querySelector(".ai-working"); return w; });
    await p.waitForFunction(() => !document.querySelector(".ai-working"), null, { timeout: 30000 });
    await post(orig);
    await p.reload({ waitUntil: "networkidle" }); await settle(600);
    assert.equal((await deck()).slides.length, orig.slides.length);
  });

  // ------------------------------------------------------------ diagrama de texto
  await t.test("diagrama de texto: formatos com prévia, exemplos e resultado desenhado", async () => {
    await go("cover");
    await tab("inserir");
    await p.click("#btn-napkin");
    await p.waitForFunction(() => document.querySelector('.napkin-type[data-type="funnel"] .thumb-render')?.innerHTML.length > 50);
    assert.ok(await p.locator(".napkin-type").count() >= 12, "formatos");
    assert.ok(await p.locator(".napkin-example").count() >= 8, "exemplos");
    const previewSize = await p.locator(".napkin-type .lc-prev").first().evaluate((el) => {
      const { width, height } = el.getBoundingClientRect();
      return { width, height };
    });
    assert.ok(previewSize.width >= 150 && previewSize.height >= 80, `miniaturas legíveis (${previewSize.width}×${previewSize.height})`);
    const h = await p.evaluate(() => document.querySelector("#napkin-input-text").getBoundingClientRect().height);
    assert.ok(h >= 200, `área de texto grande (${h}px)`);
    // exemplo gera e desenha
    await p.click('.napkin-example[data-example="stats"]');
    await p.waitForSelector("#napkin-stage .thumb-render .slide");
    // formato escolhido pela pessoa manda
    await p.click('.napkin-type[data-type="funnel"]');
    await p.fill("#napkin-input-text", ["Funil:", "- Visitas: 100", "- Cadastros: 40", "- Clientes: 10"].join("\n"));
    await p.click("#btn-run-napkin");
    await p.waitForSelector('#napkin-stage .slide[data-layout="funnel"]');
    const n = (await deck()).slides.length;
    await p.click("#btn-napkin-insert"); await settle();
    const d = await deck();
    assert.equal(d.slides.length, n + 1);
    const s = d.slides.find((x) => x.layout === "funnel" && JSON.stringify(x).includes("Cadastros"));
    assert.ok(s, "slide de funil inserido com o conteúdo");
    await tab("inicio");
    await p.click("#btn-del-slide"); await settle();
  });

  // ------------------------------------------------------------ assistente
  await t.test("caixa do chat não come o texto (placeholder ou digitado) e cresce até o limite", async () => {
    await p.click("#tab-btn-chat");
    const fits = () => p.evaluate(() => {
      const el = document.querySelector("#chat-input");
      const probe = el.cloneNode(); // mede o conteúdo real (texto ou placeholder) com a mesma largura
      probe.style.cssText = `position:absolute;visibility:hidden;height:auto;width:${el.getBoundingClientRect().width}px`;
      probe.value = el.value || el.placeholder;
      el.parentElement.append(probe);
      const need = probe.scrollHeight;
      probe.remove();
      return { need, has: el.clientHeight, scrollbar: el.scrollHeight > el.clientHeight + 1 };
    });
    for (const width of [1440, 1100]) { // painel lateral estreito: o placeholder quebra em 2 linhas
      await p.setViewportSize({ width, height: 1000 }); await settle(300);
      await p.fill("#chat-input", "");
      const empty = await fits();
      assert.ok(empty.has >= empty.need && !empty.scrollbar, `vazio em ${width}px: ${JSON.stringify(empty)}`);
    }
    await p.fill("#chat-input", ["linha", "linha", "linha", "linha", "fim"].join("\n"));
    const typed = await fits();
    assert.ok(typed.has >= typed.need && !typed.scrollbar, `digitado: ${JSON.stringify(typed)}`);
    await p.fill("#chat-input", Array(30).fill("linha").join("\n"));
    assert.ok(await p.evaluate(() => document.querySelector("#chat-input").clientHeight <= 182), "para de crescer no limite");
    await p.fill("#chat-input", "");
    await p.setViewportSize({ width: 1440, height: 1000 });
  });

  await t.test("colar/anexar imagem no chat mostra a miniatura para enviar", async () => {
    await p.setInputFiles("#chat-attach-input", { name: "ref.png", mimeType: "image/png", buffer: PNG_1PX });
    await p.waitForSelector("#chat-attachments .chat-att img");
    await p.click("#chat-attachments .chat-att button");
    assert.equal(await p.locator("#chat-attachments .chat-att").count(), 0);
  });

  await t.test("sem LLM no ar, o assistente não mexe nos slides (nem numa pergunta)", { skip: LIVE && "com SAGADECK_LIVE=1 o LLM está no ar" }, async () => {
    // bug: "o que é CTAP na figura do slide 2?" caía nas regras por palavra-chave, trocava o slide para
    // split e enfiava "A clareza visual ajuda a audiência..." no corpo. Sem modelo, ninguém decide nada.
    const before = saved();
    for (const msg of ["o que é CTAP que tem na figura do slide 2?", "resuma o slide 2", "mude para o tema pop"]) {
      await p.fill("#chat-input", msg);
      await p.click("#chat-send");
      await p.waitForTimeout(300);
      await p.waitForFunction(() => !document.querySelector(".ai-working"), null, { timeout: 30000 });
      const txt = await p.evaluate(() => [...document.querySelectorAll("#chat-messages .ai-msg")].pop().innerText);
      assert.match(txt, /nada mudou/i, `"${msg}" → ${txt}`);
      assert.match(txt, /IA (está )?desligada|nenhum LLM/i, "diz por que não fez nada");
      assert.doesNotMatch(txt, /clareza visual|Alternei|Alterei|Transformei/);
    }
    assert.deepEqual(saved(), before, "o deck salvo ficou igual");
    assert.doesNotMatch(fs.readFileSync(deckFile.file, "utf8"), /clareza visual/);
  });

  await t.test("assistente responde (LLM real)", { skip: !LIVE && "defina SAGADECK_LIVE=1" }, async () => {
    await p.fill("#chat-input", "Quantos slides tem a apresentação? Só responda, não mude nada.");
    await p.click("#chat-send");
    await p.waitForFunction(() => !document.querySelector(".ai-working"), null, { timeout: 120000 });
    const txt = await p.evaluate(() => [...document.querySelectorAll("#chat-messages .ai-msg")].pop().innerText);
    assert.ok(txt.length > 5);
  });

  // ------------------------------------------------------------ apresentar
  await t.test("Apresentar usa o runtime real e volta ao editor", async () => {
    await go("cover");
    await p.click("#btn-present"); await settle(2500);
    const fr = p.frames().find((f) => f.url().includes("/preview"));
    assert.ok(fr, "iframe do /preview");
    const n = await fr.evaluate(() => window.sagadeck.n);
    assert.equal(n, (await deck()).slides.length);
    await fr.press("body", "Escape"); await settle(500);
    assert.ok(!(await p.isVisible("#presentation-modal")));
  });

  // ------------------------------------------------------------ PowerPoint
  await t.test("Baixar PowerPoint (.pptx): baixa um pptx com todos os slides", { timeout: 180000 }, async () => {
    const n = (await deck()).slides.length;
    await p.click("#btn-export-menu");
    const [download] = await Promise.all([p.waitForEvent("download", { timeout: 170000 }), p.click("#export-pptx")]);
    assert.match(download.suggestedFilename(), /\.pptx$/);
    const file = path.join(deckFile.dir, "baixado.pptx");
    await download.saveAs(file);
    const pp = await readPptx(fs.readFileSync(file));
    assert.equal(pp.slides.length, n);
    assert.match(pp.notes, /falar de segurança primeiro/, "com as notas do apresentador");
  });

  await t.test("Baixar PowerPoint sem as notas: mesma apresentação, sem a cola do apresentador", { timeout: 180000 }, async () => {
    const n = (await deck()).slides.length;
    await p.click("#btn-export-menu");
    const [download] = await Promise.all([p.waitForEvent("download", { timeout: 170000 }), p.click("#export-pptx-clean")]);
    assert.match(download.suggestedFilename(), /\.pptx$/);
    const file = path.join(deckFile.dir, "sem-notas.pptx");
    await download.saveAs(file);
    const pp = await readPptx(fs.readFileSync(file));
    assert.equal(pp.slides.length, n);
    assert.doesNotMatch(pp.notes, /falar de segurança/, "sem as notas");
    assert.match(saved().slides.find((x) => x.notes)?.notes || "", /falar de segurança/, "as notas continuam no deck");
  });

  await t.test("Baixar PDF e roteiro pelo menu", { timeout: 240000 }, async () => {
    for (const [id, re] of [["#export-pdf", /\.pdf$/], ["#export-roteiro", / - roteiro\.pdf$/]]) {
      await p.click("#btn-export-menu");
      const [download] = await Promise.all([p.waitForEvent("download", { timeout: 170000 }), p.click(id)]);
      assert.match(download.suggestedFilename(), re);
      const file = path.join(deckFile.dir, "baixado-" + id.slice(8) + ".pdf");
      await download.saveAs(file);
      assert.equal(fs.readFileSync(file).subarray(0, 4).toString(), "%PDF");
    }
  });

  // pedido do "preguiçoso": um clique só em vez de três idas ao menu Arquivo
  await t.test("Baixar tudo: um .zip com o PowerPoint (com notas), o PDF e o roteiro", { timeout: 300000 }, async () => {
    const n = (await deck()).slides.length;
    await p.click("#btn-export-menu");
    const [download] = await Promise.all([p.waitForEvent("download", { timeout: 290000 }), p.click("#export-all")]);
    assert.match(download.suggestedFilename(), /\.zip$/);
    const file = path.join(deckFile.dir, "tudo.zip");
    await download.saveAs(file);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const names = Object.keys(zip.files).sort();
    assert.equal(names.length, 3, names.join(", "));
    const pick = (re) => zip.file(names.find((x) => re.test(x)));
    const pp = await readPptx(await pick(/\.pptx$/).async("nodebuffer"));
    assert.equal(pp.slides.length, n);
    assert.match(pp.notes, /falar de segurança primeiro/, "o PowerPoint leva as notas (é para quem apresenta)");
    assert.equal((await pick(/ - roteiro\.pdf$/).async("nodebuffer")).subarray(0, 4).toString(), "%PDF");
    assert.equal((await pick(/(?<! - roteiro)\.pdf$/).async("nodebuffer")).subarray(0, 4).toString(), "%PDF");
  });

  // ------------------------------------------------------------ arquivo .sagadeck
  await t.test("Baixar apresentação (.sagadeck): leva o YAML e as imagens; abrir o arquivo restaura tudo e salva numa pasta", async () => {
    // uma imagem local no deck (o fixture não tem)
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    fs.mkdirSync(path.join(deckFile.dir, "imagens"), { recursive: true });
    fs.writeFileSync(path.join(deckFile.dir, "imagens", "foto.png"), PNG);
    await p.evaluate(async () => {
      const d = (await (await fetch("/api/deck")).json()).spec;
      d.slides.push({ layout: "split", title: "Com foto", figure: { image: "imagens/foto.png" } });
      await fetch("/api/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: d }) });
    });
    await p.reload({ waitUntil: "networkidle" }); await settle(600);
    await p.click("#btn-export-menu");
    assert.equal(await p.locator("#export-yaml").count(), 0, "sem o antigo 'Baixar YAML'");
    const [download] = await Promise.all([p.waitForEvent("download"), p.click("#export-sagadeck")]);
    assert.match(download.suggestedFilename(), /\.sagadeck$/);
    const file = path.join(deckFile.dir, "baixado.sagadeck");
    await download.saveAs(file);
    const out = fs.mkdtempSync(path.join(path.dirname(deckFile.dir), "sd-check-"));
    const { manifest, file: yamlFile } = await unpackDeck(fs.readFileSync(file), out);
    assert.equal(manifest.format, "sagadeck");
    assert.ok(fs.existsSync(path.join(out, "imagens", "foto.png")), "a imagem foi junto");
    assert.doesNotMatch(fs.readFileSync(yamlFile, "utf8"), /_dir|_file/);

    // abrir o .sagadeck pelo "Abrir do computador"
    await p.setInputFiles("#file-input-yaml", file);
    let opened;
    for (let k = 0; k < 40; k++) {
      opened = await p.evaluate(async () => (await (await fetch("/api/deck")).json()));
      if (opened.file && opened.file !== deckFile.file) break;
      await settle(150);
    }
    assert.ok(opened.file.startsWith(path.join(studio.library, "Importados")), `entra na biblioteca, em Importados: ${opened.file}`);
    assert.ok(opened.spec.slides.some((s) => s.title === "Com foto"));
    assert.ok(fs.existsSync(path.join(path.dirname(opened.file), "imagens", "foto.png")), "a imagem veio junto na pasta aberta");
    // volta ao deck do teste
    await p.evaluate(async (f) => fetch("/api/open-file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: f }) }), deckFile.file);
    await p.reload({ waitUntil: "networkidle" }); await settle(600);
  });

  // ------------------------------------------------------------ slides de API (dev)
  await t.test("Inserir → Slide de API: um slide genérico, de qualquer serviço (os exemplos ficam no deck de exemplo)", async () => {
    const n = (await deck()).slides.length;
    await tab("inserir");
    await p.click("#btn-api-slide");
    await settle();
    const slides = saved().slides;
    assert.equal(slides.length, n + 1);
    const api = slides.find((sl) => sl.layout === "api" && sl.request?.url === "{{base}}/echo");
    assert.ok(api, "o slide genérico foi salvo no deck");
    // nada de um serviço em particular: sem token de Identity, sem arquivo, sem caminhos de OCR/indexador
    assert.doesNotMatch(JSON.stringify(api), /identity|client_secret|path_id|ocr|index|file/i);
    assert.equal(await p.locator("#api-examples-popover").count(), 0, "sem a lista de exemplos no botão");
    assert.ok(await p.isVisible(form), "abre o formulário para preencher");
  });

  await t.test("formulário do slide api: corpo em JSON, token do ambiente marcado por padrão, modo tempo real troca os campos", async () => {
    const i = await go((sl) => sl.layout === "api" && sl.request?.url === "{{base}}/echo");
    // os testes do chat deixaram o painel no Assistente: volta para Formatar
    if (await p.isVisible("#tab-btn-props")) await p.click("#tab-btn-props");
    else { await tab("exibir"); await p.click("#btn-pane-props"); }
    await p.waitForSelector(form);
    const field = (label) => `${form} .sf-field:has(> .sf-label:text-is("${label}"))`;
    // auth ausente = manda o token (o padrão do slide); o formulário mostra isso
    assert.equal(await p.isChecked(`${form} .sf-check:has-text("Enviar o token do ambiente") input`), true);
    await p.fill(`${field("Corpo (JSON)")} textarea`, '{ "messages": [ { "role": "user", "content": "Oi, API" } ] }');
    await settle();
    assert.equal(saved().slides[i].request.body.messages[0].content, "Oi, API");
    // JSON quebrado não estraga o que estava salvo
    await p.fill(`${field("Corpo (JSON)")} textarea`, '{ "messages": [ ');
    await settle();
    assert.match(await p.innerText(field("Corpo (JSON)")), /JSON inválido/);
    assert.equal(saved().slides[i].request.body.messages[0].content, "Oi, API");
    await p.fill(`${field("Guardar para os próximos slides")} textarea`, '{ "resposta_id": "$.id" }');
    await settle();
    assert.deepEqual(saved().slides[i].save, { resposta_id: "$.id" });
    await p.uncheck(`${form} .sf-check:has-text("Enviar o token do ambiente") input`);
    await settle();
    assert.equal(saved().slides[i].request.auth, false);
    // tempo real: some a requisição HTTP, aparece a conexão do WebSocket
    await p.selectOption(`${field("Modo")} select`, "realtime");
    await p.waitForSelector(field("Conexão (WebSocket)"));
    assert.equal(await p.isVisible(`${form} legend:text-is("Requisição")`), false);
    await p.fill(`${field("Conexão (WebSocket)")} textarea`, '{ "url": "{{ws}}/realtime" }');
    await settle();
    assert.equal(saved().slides[i].mode, "realtime");
    assert.equal(saved().slides[i].realtime.url, "{{ws}}/realtime");
  });

  await t.test("Ambientes: modelo comentado quando não existe; YAML errado é recusado; salvar grava o arquivo e escolher troca o ambiente", async () => {
    const envFile = process.env.SAGADECK_AMBIENTES;
    fs.rmSync(envFile, { force: true });
    await tab("inserir");
    await p.click("#btn-api-envs");
    await p.waitForFunction(() => document.getElementById("api-envs-text").value.length > 50);
    const modalSize = await p.locator("#modal-api-envs .api-envs-dialog").evaluate((el) => {
      const { width, height } = el.getBoundingClientRect();
      return { width, height };
    });
    assert.ok(modalSize.width >= 1000 && modalSize.height >= 600, `modal amplo (${modalSize.width}×${modalSize.height})`);
    assert.match(await p.inputValue("#api-envs-text"), /environments:/);
    assert.match(await p.innerText("#api-envs-status"), /ainda não existe|YAML válido/);
    assert.match(await p.innerText("#api-envs-file"), /ambientes-de-teste\.yaml/);
    assert.match(await p.innerText("#api-envs-list"), /ENSAIO/, "o ambiente embutido aparece");
    assert.match(await p.innerText("#api-envs-list"), /OPENROUTER/, "o ambiente OpenRouter aparece");
    // YAML quebrado: recusado, nada gravado
    await p.fill("#api-envs-text", "environments:\n  dev: [\n");
    await p.waitForFunction(() => /YAML inválido/.test(document.getElementById("api-envs-status").textContent) && document.getElementById("btn-api-envs-save").disabled);
    assert.equal(fs.existsSync(envFile), false);
    // lista com traços no lugar de nomes: recusado com explicação
    await p.fill("#api-envs-text", "environments:\n  - dev\n");
    await p.waitForFunction(() => /não uma lista com traços/.test(document.getElementById("api-envs-status").textContent) && document.getElementById("btn-api-envs-save").disabled);
    await p.fill("#api-envs-text", 'environments:\n  dev:\n    secrets: "não é um mapa"\n');
    await p.waitForFunction(() => /secrets do ambiente/.test(document.getElementById("api-envs-status").textContent) && document.getElementById("btn-api-envs-save").disabled);
    // válido: grava o texto como está (comentários inclusive) e os ambientes aparecem para escolher
    const text = '# meus ambientes\ncurrent: dev\nenvironments:\n  dev:\n    vars: { base: "https://api-dev.exemplo.com/v1" }\n  hom:\n    vars: { base: "https://api-hom.exemplo.com/v1" }\n';
    await p.fill("#api-envs-text", text);
    await p.click("#btn-api-envs-save");
    await p.waitForFunction(() => /Salvo/.test(document.getElementById("api-envs-status").textContent));
    assert.equal(fs.readFileSync(envFile, "utf8"), text);
    assert.equal(fs.existsSync(`${envFile}.bak`), false, "primeiro salvamento não precisa de backup");
    assert.deepEqual(await p.$$eval("#api-envs-list .env-chip", (els) => els.map((e) => e.dataset.env)), ["dev", "hom", "ensaio", "openrouter"]);
    assert.equal(await p.getAttribute('#api-envs-list .env-chip.active', "data-env"), "dev");
    await p.click('#api-envs-list .env-chip[data-env="hom"]');
    await p.waitForSelector('#api-envs-list .env-chip.active[data-env="hom"]');
    assert.match(fs.readFileSync(envFile, "utf8"), /^current: hom/m, "a escolha fica no arquivo, com os comentários");
    assert.match(fs.readFileSync(envFile, "utf8"), /# meus ambientes/);
    const beforeUpdate = fs.readFileSync(envFile, "utf8");
    await p.fill("#api-envs-text", `${text}# atualização validada\n`);
    await p.waitForFunction(() => document.getElementById("btn-api-envs-save").disabled === false);
    await p.click("#btn-api-envs-save");
    await p.waitForFunction(() => /cópia anterior/.test(document.getElementById("api-envs-status").textContent));
    assert.equal(fs.readFileSync(`${envFile}.bak`, "utf8"), beforeUpdate);
    await p.click('#api-envs-list .env-chip[data-env="ensaio"]');
    await p.waitForSelector('#api-envs-list .env-chip.active[data-env="ensaio"]');
    assert.match(fs.readFileSync(envFile, "utf8"), /^current: hom/m, "o embutido não vai para o arquivo");
    await p.click("#btn-api-envs-cancel");
    assert.equal(await p.isVisible("#modal-api-envs"), false);
    fs.rmSync(`${envFile}.bak`, { force: true });
  });

  await t.test("sem erros de JavaScript na página", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    deckFile.cleanup();
  }
});

// ------------------------------------------------------------ outras páginas não usam o Studio
// O Studio roda na máquina da pessoa (no banco, dentro da VPN). Qualquer site aberto no navegador
// consegue mandar fetch para http://127.0.0.1:<porta>; sem estas travas ele leria a biblioteca e os decks,
// apagaria apresentações e gastaria a IA. Pedido cru (node:http) para controlar Origin e Host.
async function raw(url, { method = "GET", headers = {}, body } = {}) {
  const http = await import("node:http");
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("outra origem não lê nem altera nada: 403 nas rotas /api, sem Access-Control-Allow-Origin", async () => {
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  const host = new URL(studio.url).host;
  const evil = "https://malicioso.exemplo";
  const json = { "Content-Type": "application/json" };
  try {
    // ler a biblioteca / o deck
    for (const p of ["/api/library", "/api/deck", "/api/ai/status"]) {
      const r = await raw(studio.url + p, { headers: { Origin: evil } });
      assert.equal(r.status, 403, `${p}: ${r.status}`);
      assert.equal(r.headers["access-control-allow-origin"], undefined, p);
      assert.ok(!r.body.includes("slides"), `${p} vazou o deck`);
    }
    // alterar o deck (POST "simples", sem preflight: o navegador manda mesmo sem CORS)
    const before = fs.readFileSync(deckFile.file, "utf8");
    const w = await raw(studio.url + "/api/deck", { method: "POST", headers: { Origin: evil, "Content-Type": "text/plain" },
      body: JSON.stringify({ spec: { title: "invadido", slides: [] } }) });
    assert.equal(w.status, 403);
    assert.equal(fs.readFileSync(deckFile.file, "utf8"), before, "o deck salvo não muda");
    // HTML aberto do disco manda Origin: null; também é outra página
    assert.equal((await raw(studio.url + "/api/library", { headers: { Origin: "null" } })).status, 403);
    // preflight de outra origem não libera nada
    const pre = await raw(studio.url + "/api/library/delete", { method: "OPTIONS",
      headers: { Origin: evil, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
    assert.equal(pre.status, 403);
    for (const h of ["access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers"]) {
      assert.equal(pre.headers[h], undefined, h);
    }
    // DNS rebinding: malicioso.exemplo apontando para 127.0.0.1 tem Origin igual ao Host, mas não é esta máquina
    const rb = await raw(studio.url + "/api/library", { headers: { Host: "malicioso.exemplo:" + new URL(studio.url).port, Origin: "http://malicioso.exemplo:" + new URL(studio.url).port } });
    assert.equal(rb.status, 403);

    // a própria página continua funcionando: sem Origin (GET) e com Origin igual ao Host (POST)
    const own = await raw(studio.url + "/api/deck");
    assert.equal(own.status, 200);
    assert.equal(own.headers["access-control-allow-origin"], undefined, "nada de CORS genérico");
    const spec = JSON.parse(own.body).spec;
    const ok = await raw(studio.url + "/api/deck", { method: "POST", headers: { ...json, Origin: `http://${host}` }, body: JSON.stringify({ spec }) });
    assert.equal(ok.status, 200, ok.body);
    assert.equal((await raw(studio.url + "/api/library", { headers: { Origin: `http://localhost:${new URL(studio.url).port}`, Host: `localhost:${new URL(studio.url).port}` } })).status, 200);

    // iframe: só a própria origem (a apresentação dentro do editor); nenhum site embute o Studio
    for (const p of ["/", "/editor", "/preview"]) {
      const r = await raw(studio.url + p);
      assert.match(r.headers["content-security-policy"] || "", /frame-ancestors 'self'/, p);
      assert.doesNotMatch(r.headers["content-security-policy"] || "", /frame-ancestors \*/, p);
      assert.notEqual(r.headers["cross-origin-resource-policy"], "cross-origin", p);
    }
  } finally {
    await studio.close();
    deckFile.cleanup();
  }
});

// No BabsDeck o nginx pode trocar o Host pelo do Studio (127.0.0.1:porta, o padrão do proxy_pass) e
// mandar o endereço do portal em X-Forwarded-Host. A página do portal tem que continuar funcionando.
test("multiusuário atrás do proxy: a origem do portal (X-Forwarded-Host) vale; outra origem não", async () => {
  const studio = await startStudio(null, { multiuser: true });
  const host = new URL(studio.url).host;
  const proxied = { Host: host, "X-Forwarded-Host": "portal.exemplo", "X-Forwarded-Proto": "https", "X-Sagadeck-User": "ana" };
  try {
    const own = await raw(studio.url + "/api/library", { headers: { ...proxied, Origin: "https://portal.exemplo" } });
    assert.equal(own.status, 200, own.body);
    const evil = await raw(studio.url + "/api/library", { headers: { ...proxied, Origin: "https://malicioso.exemplo" } });
    assert.equal(evil.status, 403);
    assert.equal(evil.headers["access-control-allow-origin"], undefined);
  } finally {
    await studio.close();
  }
});

// Comandos da IA no servidor multiusuário: só quem está em --agentes (o comando roda na máquina do servidor). Os
// outros conversam e editam normalmente, e a IA deles nem sabe que comandos existem. Ninguém aprova o de outro.
test("multiusuário: comandos só para quem está em --agentes; ninguém responde pelo comando de outra pessoa", async () => {
  const { startMockLLM } = await import("./mock-llm.js");
  const RUN = "Vou testar.\n```yaml\nrun:\n  language: javascript\n  why: testar\n  code: console.log(1)\n```";
  const llm = await startMockLLM(({ lastUser }) => (/NÃO autorizou/.test(lastUser) ? "Tudo bem, não rodei." : RUN));
  const studio = await startStudio(null, { multiuser: true, agentUsers: ["naru", "ana"], llmUrl: llm.url });
  const as = (user) => ({ Host: new URL(studio.url).host, "X-Sagadeck-User": user, "Content-Type": "application/json" });
  const post = (user, p, body) => raw(studio.url + p, { method: "POST", headers: as(user), body: JSON.stringify(body) });
  const openDeck = async (user) => { const { id } = JSON.parse((await post(user, "/api/library/decks", { topic: "", title: "Deck" })).body); await post(user, "/api/library/open", { id }); };
  // o chat ao vivo (NDJSON): devolve os eventos conforme chegam e deixa responder no meio
  const chat = (user, onEvent) => new Promise(async (resolve, reject) => {
    const http = await import("node:http");
    const u = new URL(studio.url + "/api/ai/chat");
    const rq = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: as(user) }, (res) => {
      let buf = "", events = [];
      res.setEncoding("utf8");
      res.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) { const ev = JSON.parse(line); events.push(ev); onEvent?.(ev); } } });
      res.on("end", () => resolve(events));
    });
    rq.on("error", reject);
    rq.end(JSON.stringify({ message: "teste a API", stream: true, targetSlide: 0 }));
  });
  try {
    // Mary (fora da lista): a IA dela não tem comandos e nada pede aprovação
    await openDeck("mary");
    const n = llm.requests.length;
    const evMary = await chat("mary");
    assert.ok(!evMary.some((e) => e.phase === "approve"), "nenhum pedido de aprovação para quem não está na lista");
    assert.match(llm.requests[n].system, /Comandos: indisponíveis aqui/);
    assert.doesNotMatch(llm.requests[n].system, /COMANDOS \(Studio local\)/);
    assert.equal((await post("mary", "/api/ai/approve", { id: "x", decision: "run" })).status, 403);
    // Naru (na lista): o pedido chega; a Mary não consegue responder por ele; ele responde
    await openDeck("naru");
    const tentativas = [];
    const evNaru = await chat("naru", async (ev) => {
      if (ev.phase !== "approve") return;
      tentativas.push((await post("mary", "/api/ai/approve", { id: ev.id, decision: "run" })).status);
      tentativas.push((await post("ana", "/api/ai/approve", { id: ev.id, decision: "run" })).status); // na lista, mas o pedido não é dela
      tentativas.push((await post("naru", "/api/ai/approve", { id: ev.id, decision: "deny" })).status);
    });
    assert.ok(evNaru.some((e) => e.phase === "approve"), "quem está na lista recebe o pedido de aprovação");
    assert.deepEqual(tentativas, [403, 404, 200], "nem a Mary (fora da lista) nem a Ana (outra pessoa) aprovam o comando do Naru; ele sim");
    assert.match(JSON.stringify(evNaru.at(-1)), /não rodei/);
  } finally {
    await studio.close();
    await llm.close();
  }
});
