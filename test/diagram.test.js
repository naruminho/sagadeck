// Diagramas (layout diagram, Mermaid): fluxograma, sequência, estados, UML, jornada… desenhados com a paleta do
// tema (nada das cores genéricas do Mermaid), compactos (o desenho ocupa a área, sem vazios enormes), com ênfase em
// poucos nós (classes hi/em/escuro/suave/vazado), ícones nos nós e erro legível quando o código está errado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML, renderSlide } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const FLUXO = `flowchart LR
  A([Pedido de acesso]):::hi --> B{Experimento ou projeto?}
  B -->|experimento| C[:flask-conical: 30 dias, dados fictícios]
  B -->|projeto| D[DEV 30 dias] ==> E[HOM 30 dias] ==> F[PROD]:::em
  C -.-> D`;

test("layout diagram: o código vai no slide (escapado), ícones viram marcador, a biblioteca só entra se o deck tiver diagrama", () => {
  const { html } = renderSlide({ layout: "diagram", title: "Governança", mermaid: FLUXO });
  assert.match(html, /class="L-diagram"/);
  assert.match(html, /dg-src/);
  assert.match(html, /&lt;|&gt;|--&gt;/, "o código vai escapado");
  assert.match(html, /dgi-flask-conical/, "ícone vira marcador sem aspas");
  assert.match(html, /data-dg-icons=/, "o desenho do ícone vai junto");
  const com = buildHTML({ slides: [{ layout: "diagram", mermaid: FLUXO }] }).html;
  const sem = buildHTML({ slides: [{ layout: "statement", text: "x" }] }).html;
  assert.match(com, /mermaid/i);
  assert.ok(com.length - sem.length > 1_000_000, "a biblioteca embutida (funciona sem internet)");
  assert.doesNotMatch(sem, /SagaDiagrams/);
});

async function montar(browser, theme, slides, palette) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-dg-")), "d.html");
  fs.writeFileSync(file, buildHTML({ theme, palette, slides }).html);
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("file:///" + file.replace(/\\/g, "/") + "?export=1");
  await p.waitForFunction(() => window.sagadeck && window.SagaDiagramsReady);
  await p.evaluate(() => window.SagaDiagramsReady);
  return { p, errors };
}

test("desenhado com a paleta, compacto e com ênfase só onde pediu", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const { p, errors } = await montar(browser, "sinal", [{ layout: "diagram", title: "Fluxo", mermaid: FLUXO }]);
    const r = await p.evaluate(() => {
      const slide = document.querySelector(".slide"), box = slide.querySelector(".dg-box"), svg = box.querySelector("svg");
      const cs = getComputedStyle(slide), b = box.getBoundingClientRect(), s = svg.getBoundingClientRect();
      const probe = document.createElement("i"); slide.append(probe);
      const rgb = (c) => { probe.style.color = c; return getComputedStyle(probe).color; };
      const shapeOf = (id) => svg.querySelector(`[id*="flowchart-${id}-"]`)?.querySelector("rect,polygon,path,circle");
      const fill = (id) => getComputedStyle(shapeOf(id)).fill;
      return {
        hi: rgb(cs.getPropertyValue("--hi")), em: rgb(cs.getPropertyValue("--em")),
        fillA: fill("A"), fillF: fill("F"), fillC: fill("C"), strokeC: getComputedStyle(shapeOf("C")).stroke,
        font: getComputedStyle(svg.querySelector(".nodeLabel, .label")).fontFamily, slideFont: getComputedStyle(slide.querySelector(".f-body") || slide).fontFamily,
        ocupa: Math.max(s.width / b.width, s.height / b.height), dentro: s.left >= b.left - 1 && s.right <= b.right + 1 && s.top >= b.top - 1 && s.bottom <= b.bottom + 1,
        icone: !!svg.querySelector(".dgi svg"), erro: !!slide.querySelector(".dg-error"),
      };
    });
    assert.equal(r.erro, false);
    assert.equal(r.fillA, r.hi, "nó :::hi preenchido com o destaque do tema");
    assert.equal(r.fillF, r.em, "nó :::em preenchido com a cor de ênfase");
    assert.notEqual(r.fillC, r.hi, "os outros não ficam todos preenchidos");
    assert.equal(r.strokeC, r.hi, "contorno na cor do tema, não o roxo padrão do Mermaid");
    assert.doesNotMatch(r.font, /trebuchet/i, "fonte do tema, não a do Mermaid");
    assert.ok(r.ocupa > 0.85, `compacto: o desenho ocupa a área (${r.ocupa.toFixed(2)})`);
    assert.ok(r.dentro, "e cabe nela");
    assert.ok(r.icone, "ícone desenhado dentro do nó");
    assert.deepEqual(errors, []);
    await p.close();
    // outra paleta: outras cores
    const b2 = await montar(browser, "sinal", [{ layout: "diagram", mermaid: FLUXO }], "floresta");
    const fillA2 = await b2.p.evaluate(() => getComputedStyle(document.querySelector('.dg-box [id*="flowchart-A-"]').querySelector("rect,polygon,path")).fill);
    assert.notEqual(fillA2, r.fillA);
    await b2.p.close();
  } finally { await browser.close(); }
});

test("sequência, estados e classes UML desenham; código errado mostra um erro legível (e não quebra a apresentação)", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const slides = [
      { layout: "diagram", mermaid: "sequenceDiagram\n  participant App\n  participant Identity\n  participant Bridge\n  App->>Identity: client_id + secret\n  Identity-->>App: token (30 min)\n  App->>Bridge: chamada + Bearer token\n  Bridge-->>App: resposta" },
      { layout: "diagram", mermaid: "stateDiagram-v2\n  [*] --> DEV\n  DEV --> HOM: 30 dias\n  HOM --> PROD\n  PROD --> [*]" },
      { layout: "diagram", mermaid: "classDiagram\n  class Projeto { +wave: string +horas: int }\n  class Area { +artefato() }\n  Projeto --> Area : pede" },
      { layout: "diagram", mermaid: "flowchart LR\n  A[ok --> " },
    ];
    const { p, errors } = await montar(browser, "noite", slides);
    const r = await p.evaluate(() => [...document.querySelectorAll(".slide")].map((s) => ({ svg: !!s.querySelector(".dg-box svg"), erro: s.querySelector(".dg-error")?.textContent || "" })));
    assert.deepEqual(r.slice(0, 3).map((x) => x.svg), [true, true, true]);
    assert.equal(r[3].svg, false);
    assert.match(r[3].erro, /diagrama|linha|erro/i);
    assert.deepEqual(await p.evaluate(() => window.sagadeckDiagramErrors.map((e) => e.slide)), [4]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
