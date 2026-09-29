// Código longo nunca é cortado sem aviso: encolhe até o mínimo (fit.minCodePt, em pt como no PowerPoint; 1 pt = 2 px
// no slide de 1920), quebra linha longa e, se nem assim couber, ganha rolagem e fica marcado (o fiscal avisa).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildHTML } from "../src/build.js";
import { browserOrSkip, newPage } from "./helpers.js";

// 13 linhas normais e uma comprida (tem que quebrar, não cortar): cabe encolhendo, sem passar de 10 pt
const script = () => [...Array.from({ length: 12 }, (_, i) => `git switch -c feat/tarefa-${i + 1}   # passo ${i + 1}`), 'git commit -m "feat(checkout): adiciona pagamento via Pix com QR code dinâmico e confirmação automática no webhook"'].join("\n");
const linhas = (n) => Array.from({ length: n }, (_, i) => `git commit -m "passo ${i + 1}: uma mensagem de commit bem comprida para passar da largura do bloco"   # comentário ${i + 1}`).join("\n");

async function medir(browser, spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-code-"));
  const file = path.join(dir, "deck.html");
  fs.writeFileSync(file, buildHTML(spec).html);
  const { page, errors } = await newPage(browser, null, { width: 1280, height: 720 });
  await page.goto(pathToFileURL(file).href + "?export=1");
  await page.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
  await page.waitForTimeout(300);
  const blocos = await page.evaluate(() => [...document.querySelectorAll(".slide .code")].map((c) => {
    const sc = c.closest(".slide").getBoundingClientRect().width / 1920;
    return { fs: parseFloat(getComputedStyle(c).fontSize), zoom: parseFloat(getComputedStyle(c.closest(".safe")?.firstElementChild || c).zoom) || 1,
      cabeH: c.scrollHeight <= c.clientHeight + 2, cabeW: c.scrollWidth <= c.clientWidth + 2, cortado: c.hasAttribute("data-code-cut"),
      rola: getComputedStyle(c).overflowY === "auto", sc };
  }));
  await page.close();
  return { blocos, errors };
}

test("código longo: encolhe até caber, quebra a linha comprida e nunca fica abaixo do mínimo (padrão 10 pt)", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  try {
    const { blocos, errors } = await medir(browser, { slides: [{ layout: "code", title: "Do zero ao PR", code: script(), language: "bash" }] });
    assert.equal(blocos.length, 1);
    const [b] = blocos;
    assert.ok(b.cabeH && b.cabeW, `o código inteiro aparece (altura ${b.cabeH}, largura ${b.cabeW}, fonte ${b.fs}px, ${JSON.stringify(b)})`);
    assert.ok(b.fs * b.zoom >= 20 - 0.5, `não passa do mínimo de 10 pt = 20 px (ficou ${b.fs * b.zoom}px)`);
    assert.equal(b.cortado, false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("código longo demais para o mínimo: não corta calado — rola e fica marcado para o fiscal", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  try {
    const { blocos } = await medir(browser, { fit: { minCodePt: 12 }, slides: [{ layout: "code", title: "Longo", code: linhas(60), language: "bash" }] });
    const [b] = blocos;
    assert.ok(b.fs >= 24 - 0.5, `respeita o mínimo do deck (12 pt = 24 px): ${b.fs}`);
    assert.equal(b.cortado, true, "marcado como não coube");
    assert.equal(b.rola, true, "dá para rolar e ler tudo na apresentação");
  } finally { await browser.close(); }
});
