// Studio de ponta a ponta: sobe o servidor com o deck de teste e clica de verdade num Chrome headless.
// Cada recurso do Studio tem um teste aqui — se um refactor quebrar, o teste avisa.
// Testes que chamam o LLM de verdade só rodam com SAGADECK_LIVE=1 (precisam do modelrelay).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const LIVE = process.env.SAGADECK_LIVE === "1";
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

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

  // ------------------------------------------------------------ layout
  await t.test("galeria de layouts mostra prévia e descrição de cada layout", async () => {
    await go("cards");
    await p.click("#btn-layout-gallery");
    await p.waitForFunction(() => document.querySelector('.layout-card[data-layout="bento"] .thumb-render')?.innerHTML.length > 50);
    const r = await p.evaluate(() => {
      const cards = [...document.querySelectorAll(".layout-card")];
      return { n: cards.length, empty: cards.filter((c) => c.querySelector(".thumb-render").innerHTML.length < 50).map((c) => c.dataset.layout),
        noDesc: cards.filter((c) => !c.querySelector(".lc-desc").textContent).map((c) => c.dataset.layout),
        active: document.querySelector(".layout-card.active")?.dataset.layout };
    });
    assert.ok(r.n >= 29, `${r.n} layouts`);
    assert.deepEqual(r.empty, [], "layouts sem prévia");
    assert.deepEqual(r.noDesc, [], "layouts sem descrição");
    assert.equal(r.active, "cards");
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

  await t.test("editor visual tem formulário para os layouts novos", async () => {
    const i = await go("statement");
    const expect = { headline: /Frase/, full: /Imagem gerada pela IA/, bento: /Blocos/, funnel: /Etapas do funil/, pyramid: /Níveis/, agenda: /Seções/ };
    for (const [layout, label] of Object.entries(expect)) {
      await p.click("#btn-layout-gallery");
      await p.click(`.layout-card[data-layout="${layout}"]`); await settle(600);
      assert.match(await p.textContent(form), label, layout);
    }
    await p.click("#btn-layout-gallery");
    await p.click('.layout-card[data-layout="statement"]'); await settle();
    assert.equal((await deck()).slides[i].layout, "statement");
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

  // ------------------------------------------------------------ diagrama de texto
  await t.test("diagrama de texto: formatos com prévia, exemplos e resultado desenhado", async () => {
    await go("cover");
    await tab("inserir");
    await p.click("#btn-napkin");
    await p.waitForFunction(() => document.querySelector('.napkin-type[data-type="funnel"] .thumb-render')?.innerHTML.length > 50);
    assert.ok(await p.locator(".napkin-type").count() >= 12, "formatos");
    assert.ok(await p.locator(".napkin-example").count() >= 8, "exemplos");
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
  await t.test("colar/anexar imagem no chat mostra a miniatura para enviar", async () => {
    await p.setInputFiles("#chat-attach-input", { name: "ref.png", mimeType: "image/png", buffer: PNG_1PX });
    await p.waitForSelector("#chat-attachments .chat-att img");
    await p.click("#chat-attachments .chat-att button");
    assert.equal(await p.locator("#chat-attachments .chat-att").count(), 0);
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

  await t.test("sem erros de JavaScript na página", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    deckFile.cleanup();
  }
});
