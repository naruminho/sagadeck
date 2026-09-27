// Infográficos (layout infographic) no navegador: para cada forma, com poucos e com o máximo de itens, o desenho se
// reorganiza sem encavalar nada, o texto cabe na caixa (encolhe se precisar), tudo fica dentro do palco e as setas
// aparecem em qualquer slide (não só no primeiro).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { INFOGRAPHIC_SHAPES } from "../src/infographic.js";
import { browserOrSkip } from "./helpers.js";

const LONGO = "Um texto bem mais comprido que o normal, para ver a caixa encolher a letra até caber sem sair do desenho nem cobrir o vizinho.";
const item = (i, text = "Uma frase curta explicando o item.") => ({ title: `Item ${i + 1}`, text, icon: ["target", "users", "shield", "server", "cloud", "database", "rocket", "clock"][i % 8], steps: [{ title: "Tática 1", text: "Frase curta." }, { title: "Tática 2", text: "Frase curta." }] });

test("infográficos: nada encavala, o texto cabe, tudo dentro do palco, setas visíveis em qualquer slide", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const slides = [{ layout: "statement", text: "abertura" }]; // o infográfico não é o 1º slide (as setas do 1º ficam escondidas)
    for (const [shape, { max }] of Object.entries(INFOGRAPHIC_SHAPES)) {
      for (const n of [shape === "trilhas" ? 1 : 2, max]) slides.push({ layout: "infographic", shape, title: `${shape} ${n}`, center: { title: "Centro", icon: "star" }, items: Array.from({ length: n }, (_, i) => item(i)) });
      slides.push({ layout: "infographic", shape, title: `${shape} longo`, center: { title: "Centro" }, items: Array.from({ length: Math.min(max, 4) }, (_, i) => item(i, LONGO)) });
    }
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-ig-")), "d.html");
    // tema escuro com fonte larga: pega texto que estoura por cima da caixa (alinhada no pé ou no centro)
    fs.writeFileSync(file, buildHTML({ theme: process.env.IG_THEME || "noite", slides }).html);
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("file:///" + file.replace(/\\/g, "/") + "?export=1");
    await p.waitForFunction(() => window.sagadeck);
    await p.evaluate(() => document.fonts.ready);
    const problems = [];
    for (let i = 1; i < slides.length; i++) {
      await p.evaluate((k) => window.sagadeck.goto(k, 99, true), i);
      await p.waitForTimeout(250);
      problems.push(...await p.evaluate((k) => {
        const slide = document.querySelectorAll(".slide")[k], stage = slide.querySelector(".ig-stage"), name = slide.querySelector("h2, .hd")?.textContent.trim();
        const out = [], sr = stage.getBoundingClientRect(), sc = sr.width / 1680;
        const boxes = [...stage.querySelectorAll(".ig-box")].filter((b) => b.textContent.trim());
        for (const b of boxes) {
          const r = b.getBoundingClientRect();
          // (a mesma folga do ajuste automático, src/runtime/fit.js: 30% da letra, por acentos e descendentes)
          const tol = parseFloat(getComputedStyle(b).fontSize) * 0.3;
          if (b.scrollHeight > b.clientHeight + tol || b.scrollWidth > b.clientWidth + 3) out.push(`${name}: texto não coube em "${b.textContent.trim().slice(0, 24)}"`);
          // nada sai por cima da caixa (o excesso por cima não aparece no scrollHeight)
          const first = b.firstElementChild?.getBoundingClientRect();
          if (first && first.top < r.top - tol) out.push(`${name}: "${b.textContent.trim().slice(0, 24)}" cortado em cima`);
          if (r.left < sr.left - 2 || r.right > sr.right + 2 || r.top < sr.top - 2 || r.bottom > sr.bottom + 2) out.push(`${name}: "${b.textContent.trim().slice(0, 24)}" fora do palco`);
        }
        // caixas de texto de itens diferentes não se sobrepõem (a do número/ícone fica dentro da forma do próprio item)
        const texts = boxes.filter((b) => b.querySelector(".ig-x") || b.querySelectorAll(".ig-t").length && b.getBoundingClientRect().width > 120 * sc);
        for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
          const x = texts[a].getBoundingClientRect(), y = texts[b].getBoundingClientRect();
          const ov = Math.max(0, Math.min(x.right, y.right) - Math.max(x.left, y.left)) * Math.max(0, Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top));
          if (ov > 4 * sc * sc) out.push(`${name}: "${texts[a].textContent.trim().slice(0, 16)}" cobre "${texts[b].textContent.trim().slice(0, 16)}"`);
        }
        // a ponta de seta usada neste slide é deste slide (a de outro slide some quando ele está escondido)
        for (const u of stage.querySelectorAll("[marker-end]")) {
          const id = u.getAttribute("marker-end").match(/#([^)]+)/)[1];
          if (document.getElementById(id)?.closest(".slide") !== slide) out.push(`${name}: seta aponta para a definição de outro slide`);
        }
        return out;
      }, i));
    }
    assert.deepEqual(problems, []);
    // texto comprido encolheu (e não foi cortado nem vazou: conferido acima)
    const shrunk = await p.evaluate(() => [...document.querySelectorAll(".slide")].filter((s) => /longo/.test(s.querySelector("h2, .hd")?.textContent || ""))
      .map((s) => Math.min(...[...s.querySelectorAll(".ig-box")].map((b) => parseFloat(b.style.fontSize) || 20))));
    assert.ok(shrunk.some((f) => f < 20), `alguma caixa encolheu a letra (${shrunk})`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
