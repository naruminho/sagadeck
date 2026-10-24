import "./isolate.js";
// Navegar nos slides pelo servidor (portal, internet) ficou lento: cada troca de slide baixava ~170 kB (o CSS base
// inteiro, igual em todo clique) e subia o deck inteiro duas vezes (desenho e variedade), e cada miniatura era um
// pedido com o deck inteiro. Aqui, no editor de verdade: o CSS base desce uma vez, a troca de slide é leve, as
// miniaturas vêm em lote, a variedade sobe só layout/tom, e as respostas grandes vêm comprimidas.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

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
