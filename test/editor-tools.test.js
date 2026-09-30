// Editor visual sem YAML: alinhar e distribuir vários objetos, copiar e colar estilo, travar (o clique atravessa),
// lista de objetos (selecionar o travado, destravar, ocultar), guias ao arrastar e trocar imagem. Tudo conferido no
// deck salvo. Critério do relatório: trocar uma foto, alinhar 3 objetos e ajustar um título sem YAML.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const PNG = (hex) => Buffer.from(hex === "b"
  ? "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  : "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("editor visual: alinhar, distribuir, estilo, travar, lista de objetos, guias e trocar imagem", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  fs.mkdirSync(path.join(deck.dir, "imagens"), { recursive: true });
  fs.writeFileSync(path.join(deck.dir, "imagens", "a.png"), PNG("a"));
  const shape = (label, x, y) => ({ shape: "rect", fill: "hi", x, y, w: 260, h: 120, label });
  fs.writeFileSync(deck.file, YAML.stringify({ title: "Ferramentas", theme: "sinal", slides: [{ layout: "canvas", elements: [
    { text: "Alfa", x: 120, y: 80, w: 320, h: 90 },
    { text: "Beta", x: 700, y: 230, w: 320, h: 90 },
    { text: "Gama", x: 1300, y: 560, w: 320, h: 90 },
    { image: "imagens/a.png", x: 120, y: 700, w: 300, h: 200, fit: "cover" },
    { textbox: { paragraphs: [{ runs: [{ t: "Moldura do original" }] }] }, x: 1500, y: 20, w: 380, h: 50, deco: true },
  ] }] }));
  const studio = await startStudio(deck.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deck.file, "utf8")).slides[0];
    const settle = () => p.waitForTimeout(900);
    const obj = (txt) => p.locator("#rendered-slide-container [data-vkey]").filter({ hasText: new RegExp(`^${txt}$`) }).first();
    const box = (txt) => obj(txt).evaluate((n) => { const s = n.closest(".slide").getBoundingClientRect(), k = s.width / 1920, r = n.getBoundingClientRect(); return { l: (r.left - s.left) / k, t: (r.top - s.top) / k, w: r.width / k, h: r.height / k }; });
    const selected = () => p.evaluate(() => window.SagaVisual.selection().map((n) => n.textContent.trim()));

    // selecionar três e alinhar à esquerda
    await obj("Alfa").click();
    await obj("Beta").click({ modifiers: ["Shift"] });
    await obj("Gama").click({ modifiers: ["Shift"] });
    assert.deepEqual((await selected()).sort(), ["Alfa", "Beta", "Gama"]);
    await p.click('.visual-toolbar [data-align="left"]'); await settle();
    const [a, b, c] = [await box("Alfa"), await box("Beta"), await box("Gama")];
    assert.ok(Math.abs(a.l - b.l) < 1.5 && Math.abs(a.l - c.l) < 1.5, `esquerdas: ${a.l} ${b.l} ${c.l}`);
    assert.ok(Object.values(saved().visualEdits).some((e) => e.dx < 0), "gravado no deck");
    // distribuir na vertical: mesmo espaço entre os três
    await p.click('.visual-toolbar [data-distribute="v"]'); await settle();
    const [a2, b2, c2] = [await box("Alfa"), await box("Beta"), await box("Gama")];
    const gap1 = b2.t - (a2.t + a2.h), gap2 = c2.t - (b2.t + b2.h);
    assert.ok(Math.abs(gap1 - gap2) < 2, `espaços ${gap1} e ${gap2}`);

    // copiar o estilo do Alfa (cor e tamanho mudados) e colar no Beta
    await obj("Alfa").click();
    await p.locator(".visual-toolbar [data-color]").evaluate((n) => { n.value = "#cc2200"; n.dispatchEvent(new Event("change")); }); await settle();
    await p.fill(".visual-toolbar [data-size]", "90"); await p.locator(".visual-toolbar [data-size]").dispatchEvent("change"); await settle();
    await p.click('.visual-toolbar [data-act="copy-style"]');
    await obj("Beta").click();
    await p.click('.visual-toolbar [data-act="paste-style"]'); await settle();
    const edits = Object.values(saved().visualEdits);
    assert.equal(edits.filter((e) => e.color === "#cc2200" && e.size === 90).length, 2, JSON.stringify(edits));

    // travar o Gama: clicar nele não seleciona mais
    await obj("Gama").click();
    await p.click('.visual-toolbar [data-act="lock"]'); await settle();
    assert.ok(Object.values(saved().visualEdits).some((e) => e.locked === true));
    await obj("Gama").click({ force: true });
    assert.ok(!(await selected()).includes("Gama"), "travado: o clique atravessa");
    // decoração do original já vem travada
    await p.locator("#rendered-slide-container .tbx").click({ force: true });
    assert.ok(!(await selected()).some((x) => /Moldura/.test(x)));

    // lista de objetos (Formatar): seleciona o travado e destrava; ocultar e mostrar
    await p.click("#tab-btn-inspect");
    await p.waitForSelector(".ip-layer");
    const row = p.locator(".ip-layer").filter({ hasText: "Gama" });
    await row.click();
    assert.deepEqual(await selected(), ["Gama"], "a lista seleciona o travado");
    await row.locator("[data-layer-lock]").click(); await settle();
    assert.ok(Object.values(saved().visualEdits).some((e) => e.locked === false), "destravado");
    await p.locator(".ip-layer").filter({ hasText: "Beta" }).locator("[data-layer-eye]").click(); await settle();
    assert.ok(Object.values(saved().visualEdits).some((e) => e.hidden === true && e.color), "Beta oculto");
    await p.locator(".ip-layer").filter({ hasText: "Beta" }).locator("[data-layer-eye]").click(); await settle();
    assert.ok(!Object.values(saved().visualEdits).some((e) => e.hidden), "Beta de volta");

    // guias: soltar o Gama perto do centro do slide gruda no centro
    const g = await box("Gama");
    const s = await p.locator("#rendered-slide-container .slide").boundingBox(), k = s.width / 1920;
    const from = { x: s.x + (g.l + g.w / 2) * k, y: s.y + (g.t + g.h / 2) * k };
    const to = { x: s.x + (960 + 5) * k, y: from.y };
    await p.mouse.move(from.x, from.y); await p.mouse.down();
    await p.mouse.move((from.x + to.x) / 2, from.y, { steps: 4 }); await p.mouse.move(to.x, to.y, { steps: 4 });
    assert.ok(await p.locator(".visual-guide").count() > 0, "a guia aparece");
    await p.mouse.up(); await settle();
    const g2 = await box("Gama");
    assert.ok(Math.abs(g2.l + g2.w / 2 - 960) < 1.5, `centro do Gama em ${g2.l + g2.w / 2}`);
    assert.equal(await p.locator(".visual-guide").count(), 0);

    // trocar a imagem: mesmo lugar, mesmos ajustes
    const img = p.locator("#rendered-slide-container .fig-img").first();
    await img.click();
    const chooser = p.waitForEvent("filechooser");
    await p.click('.visual-toolbar [data-act="replace-image"]');
    await (await chooser).setFiles({ name: "nova.png", mimeType: "image/png", buffer: PNG("b") });
    await settle();
    const im = Object.values(saved().visualEdits).find((e) => e.image);
    assert.ok(im && (/^imagens\/nova.*\.png$/.test(im.image) || im.image.startsWith("data:image/png")), JSON.stringify(im));
    assert.equal(saved().elements[3].image, "imagens/a.png", "o elemento original não muda (o ajuste troca)");
    const src = await img.locator("img").getAttribute("src");
    assert.ok(!/a\.png/.test(src), `a tela mostra a nova (${src.slice(0, 60)})`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
