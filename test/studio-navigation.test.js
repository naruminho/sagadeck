import "./isolate.js";
// Navegar nos slides pelo servidor (portal, internet) ficou lento: cada troca de slide baixava ~170 kB (o CSS base
// inteiro, igual em todo clique) e subia o deck inteiro duas vezes (desenho e variedade), e cada miniatura era um
// pedido com o deck inteiro. Aqui, no editor de verdade: o CSS base desce uma vez, a troca de slide é leve, as
// miniaturas vêm em lote, a variedade sobe só layout/tom, e as respostas grandes vêm comprimidas.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck, ROOT } from "./helpers.js";

const FOTO = path.join(ROOT, "src", "studio", "assets", "imagens", "colecao-cor.png"); // 1,7 MB
const request = (url, { method = "GET", body } = {}) => new Promise((resolve, reject) => {
  const req = http.request(url, { method, headers: body ? { "Content-Type": "application/json" } : {} }, (res) => {
    const parts = []; res.on("data", (c) => parts.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
  });
  req.on("error", reject); req.end(body ? JSON.stringify(body) : undefined);
});

// Um slide com foto passava de 5 MB a cada clique (a foto ia embutida no HTML, em base64) e de novo em cada miniatura.
// No editor, a foto vai por endereço, e o navegador guarda. O endereço só entrega imagem ou vídeo das pastas do deck,
// da biblioteca e do sagadeck; e a pasta das imagens é a que o servidor conhece, nunca a que vem no pedido.
test("foto no editor vai por endereço (não embutida), aparece, e o endereço só entrega arquivo das pastas permitidas", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-foto-")), fora = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-fora-"));
  fs.copyFileSync(FOTO, path.join(dir, "foto.png"));
  fs.copyFileSync(FOTO, path.join(fora, "segredo.png"));
  const file = path.join(dir, "deck.yaml");
  fs.writeFileSync(file, YAML.stringify({ title: "Foto", theme: "sinal", slides: [{ layout: "statement", text: "Abertura" }, { layout: "canvas", elements: [{ image: "foto.png", x: 100, y: 100, w: 900, h: 600 }] }] }));
  const studio = await startStudio(file);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    const sizes = [];
    p.on("requestfinished", async (r) => { if (r.url().includes("/api/render-slide")) sizes.push((await (await r.response()).body()).length); });
    await p.click('.thumb-card[data-idx="1"]');
    await p.waitForFunction(() => document.querySelector("#rendered-slide-container img")?.complete, null, { timeout: 15000 });
    const img = await p.evaluate(() => { const i = document.querySelector("#rendered-slide-container img"); return { src: i.getAttribute("src"), w: i.naturalWidth }; });
    assert.match(img.src, /^api\/deck-asset\?v=[^&]+&p=.*foto\.png$/, "a foto vai por endereço");
    assert.ok(img.w > 0, "e aparece");
    await p.waitForTimeout(300);
    assert.ok(sizes.length && Math.max(...sizes) < 50000, `o desenho do slide com foto é leve: ${sizes.join(", ")} bytes`);
    const thumb = await p.evaluate(() => document.querySelector('.thumb-card[data-idx="1"] img')?.getAttribute("src") || "");
    assert.doesNotMatch(thumb, /^data:/, "a miniatura também não embute a foto");

    // o endereço: imagem do deck sim (e guardada de vez); fora das pastas, ou arquivo que não é imagem, não
    const ok = await request(new URL(img.src, `${studio.url}/`).href);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.length, fs.statSync(FOTO).size);
    assert.match(String(ok.headers["cache-control"]), /immutable/);
    for (const p2 of [path.join(fora, "segredo.png"), file, path.join(dir, "..", path.basename(fora), "segredo.png")]) {
      const r = await request(`${studio.url}/api/deck-asset?v=1&p=${encodeURIComponent(p2)}`);
      assert.equal(r.status, 404, `não entrega ${p2}`);
    }
    // um _dir mandado pelo navegador não muda a pasta das imagens (lia a biblioteca de outra pessoa no multiusuário)
    const r = await request(`${studio.url}/api/render-slide`, { method: "POST", body: { slide: { layout: "canvas", elements: [{ image: "segredo.png", x: 0, y: 0, w: 100, h: 100 }] }, index: 0, spec: { _dir: fora, slides: [] } } });
    const html = JSON.parse(r.body).html;
    assert.doesNotMatch(html, /base64|deck-asset/, "a imagem de fora não é lida nem ganha endereço");
    assert.match(html, /imagem não encontrada/);
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(fora, { recursive: true, force: true }); }
});

test("navegar nos slides do editor é leve: CSS base uma vez, miniaturas em lote, respostas comprimidas", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  try {
    const calls = [];
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    p.on("requestfinished", async (r) => {
      const u = new URL(r.url()).pathname;
      if (!/^\/api\/(render-slides?|variety)$/.test(u)) return;
      const body = await (await r.response()).text().catch(() => "");
      calls.push({ u, up: (r.postData() || "").length, down: body.length, json: (() => { try { return JSON.parse(body); } catch { return null; } })() });
    });
    await p.reload({ waitUntil: "networkidle" }); // conta desde o começo de uma abertura do editor
    await p.waitForSelector('.thumb-card[data-idx="3"]');
    const n = await p.locator(".thumb-card").count();
    // as miniaturas visíveis terminam (as de fora da tela só se desenham ao rolar): nenhum pedido novo por 1,5 s
    for (let last = -1, since = Date.now(), t0 = Date.now(); Date.now() - t0 < 20000; await p.waitForTimeout(150)) {
      if (calls.length !== last) { last = calls.length; since = Date.now(); } else if (Date.now() - since > 1500) break;
    }
    assert.ok(await p.locator(".thumb-card .thumb-render .slide").count() >= 3, "miniaturas desenhadas");
    const batches = calls.filter((c) => c.u === "/api/render-slides");
    assert.ok(batches.length >= 1 && batches.length <= Math.ceil(n / 6) + 1, `miniaturas em lote: ${batches.length} pedidos para ${n} slides`);
    assert.ok(batches.every((c) => c.json?.slides?.length >= 1));
    const withBase = calls.filter((c) => typeof c.json?.baseCSS === "string" && c.json.baseCSS.length > 10000);
    assert.equal(withBase.length, 1, `o CSS base desce uma vez só (desceu ${withBase.length} vezes)`);

    // trocar de slide não refaz a miniatura que já está certa (recolocava o mesmo HTML e media tudo de novo a cada
    // clique: na palestra de 39 slides, ~35 ms por troca)
    await p.evaluate(() => { for (const r of document.querySelectorAll(".thumb-card .thumb-render")) r.dataset.marca = "antes"; });
    // trocar de slide: o desenho vem sem o CSS base, pequeno; o slide aparece com o estilo do sagadeck
    calls.length = 0;
    for (const i of [1, 2, 3]) {
      await p.click(`.thumb-card[data-idx="${i}"]`);
      await p.waitForFunction((k) => document.querySelector("#rendered-slide-container .slide")?.dataset.idx === String(k), i);
      await p.waitForTimeout(250);
    }
    const renders = calls.filter((c) => c.u === "/api/render-slide");
    assert.ok(renders.length >= 3, `um desenho por troca (${renders.length})`);
    for (const r of renders) {
      assert.equal(r.json?.baseCSS, undefined, "a troca de slide não baixa de novo o CSS base");
      assert.ok(r.down < 40000, `troca de slide leve: ${r.down} bytes`);
    }
    for (const i of [1, 2, 3]) {
      assert.equal(await p.evaluate((k) => document.querySelector(`.thumb-card[data-idx="${k}"] .thumb-render`)?.dataset.marca, i), "antes", `a miniatura ${i + 1} não foi refeita`);
    }
    const style = await p.evaluate(() => getComputedStyle(document.querySelector("#rendered-slide-container .slide")).position);
    assert.equal(style, "absolute", "o slide continua com o CSS do sagadeck aplicado");
    const variety = calls.filter((c) => c.u === "/api/variety");
    assert.ok(variety.every((c) => c.up < 3000), `a variedade sobe só layout e tom: ${variety.map((c) => c.up).join(", ")} bytes`);

    // o JS do Studio e as respostas grandes vêm comprimidos quando o navegador aceita
    const gz = await new Promise((resolve, reject) => http.get(`${studio.url}/app.js`, { headers: { "Accept-Encoding": "gzip" } }, (res) => { res.resume(); res.on("end", () => resolve(res.headers["content-encoding"])); }).on("error", reject));
    assert.equal(gz, "gzip");
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); }
});
