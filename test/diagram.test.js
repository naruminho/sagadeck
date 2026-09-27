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

// Todo tipo que a referência promete à IA precisa desenhar de verdade (e o exemplo dela também).
test("todos os tipos da referência desenham, inclusive o exemplo que a IA copia", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const ref = fs.readFileSync(new URL("../docs/REFERENCIA.md", import.meta.url), "utf8");
    const exemplo = ref.match(/- layout: diagram[\s\S]*?mermaid: \|\n([\s\S]*?)```/)[1].replace(/^ {4}/gm, "");
    const codes = {
      exemplo,
      journey: "journey\n  title Pedido de acesso\n  section Bridge\n    Abrir chamado: 3: Dev\n    Esperar: 1: Dev",
      mindmap: "mindmap\n  root((Artefatos))\n    Segurança\n      Throughput\n    Sustentação\n      Runbook",
      timeline: "timeline\n  DEV : 30 dias\n  HOM : 30 dias\n  PROD : sem prazo",
      er: "erDiagram\n  PROJETO ||--o{ AREA : pede\n  PROJETO { string wave }",
      block: "block-beta\n  columns 3\n  App Bridge Identity",
      gantt: "gantt\n  dateFormat YYYY-MM-DD\n  section Projeto\n  DEV :a1, 2026-01-01, 30d\n  HOM :after a1, 30d",
      quadrant: "quadrantChart\n  x-axis Baixo esforço --> Alto esforço\n  y-axis Baixo valor --> Alto valor\n  Experimento: [0.2, 0.7]",
    };
    const { p, errors } = await montar(browser, "sinal", Object.values(codes).map((mermaid) => ({ layout: "diagram", title: "x", mermaid })));
    const r = await p.evaluate(() => [...document.querySelectorAll(".slide")].map((s) => s.querySelector(".dg-box").dataset.dg));
    assert.deepEqual(Object.fromEntries(Object.keys(codes).map((k, i) => [k, r[i]])), Object.fromEntries(Object.keys(codes).map((k) => [k, "ready"])),
      JSON.stringify(await p.evaluate(() => window.sagadeckDiagramErrors)));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("desenho que precisa encolher demais vira aviso (com o tamanho da área); o conferidor do servidor devolve o slide certo", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const { diagramCheck, closeSnapshots } = await import("../src/studio/snapshot.js");
  try {
    const trem = "flowchart LR\n  " + Array.from({ length: 22 }, (_, i) => `N${i}[Etapa número ${i + 1}]`).join(" --> ");
    const spec = { theme: "sinal", slides: [
      { layout: "cover", title: "Capa" },
      { layout: "diagram", title: "Curto", mermaid: "flowchart LR\n  A --> B" },
      { layout: "diagram", title: "Longo demais", mermaid: trem },
      { layout: "diagram", title: "Quebrado", mermaid: "flowchart LR\n  A[ok --> " },
    ] };
    const r = await diagramCheck(spec, [1, 2, 3]);
    assert.deepEqual(r.errors.map((e) => e.slide), [4]);
    assert.deepEqual(r.warnings.map((w) => w.slide), [3]);
    assert.match(r.warnings[0].warning, /encolher para \d+%.*\d+×\d+/);
  } finally { await closeSnapshots(); }
});

// Letra legível em qualquer tema: todo rótulo de nó (inclusive ramos do mapa mental e números da sequência) com
// contraste de pelo menos 3:1 contra o próprio fundo.
test("contraste: rótulos legíveis em temas claros e escuros (mapa mental, fluxo, números da sequência)", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const slides = [
      { layout: "diagram", mermaid: "mindmap\n  root((:folder-open: Artefatos))\n    Segurança\n      Throughput\n    Cyber\n      Mecanismos\n    Sustentação\n      Runbook\n    Governança\n      Curadoria\n    Infra\n      Namespace\n    Rede\n      Firewall" },
      { layout: "diagram", mermaid: FLUXO },
      { layout: "diagram", mermaid: "sequenceDiagram\n  autonumber\n  App->>Bridge: chamada\n  Bridge-->>App: resposta" },
    ];
    const todos = [];
    for (const theme of ["sinal", "noite", "bauhaus"]) {
      const { p, errors } = await montar(browser, theme, slides);
      const ruins = await p.evaluate(() => {
        const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
        const opaque = (c) => c && c !== "none" && !/rgba\(.*,\s*0\)$/.test(c) && c !== "transparent";
        const out = [];
        document.querySelectorAll(".dg-box > svg").forEach((svg, k) => {
          svg.querySelectorAll(".node, .mindmap-node").forEach((n) => {
            const shape = n.querySelector("rect, path, circle, polygon, ellipse");
            const label = n.querySelector(".nodeLabel, span, text");
            if (!shape || !label || !label.textContent.trim()) return;
            const bg = getComputedStyle(shape).fill;
            if (!opaque(bg)) return;
            const fg = label instanceof SVGElement ? getComputedStyle(label).fill : getComputedStyle(label).color;
            const r = ratio(fg, bg);
            if (r < 3) out.push(`${k + 1} "${label.textContent.trim()}": ${r.toFixed(1)} (${fg} sobre ${bg})`);
          });
          // números da sequência: o círculo e o número
          svg.querySelectorAll(".sequenceNumber").forEach((num) => {
            const circle = svg.querySelector('[id$="-sequencenumber"] circle, [id$="-sequencenumber"]');
            const r = ratio(getComputedStyle(num).fill, getComputedStyle(circle).fill);
            if (r < 3) out.push(`${k + 1} número ${num.textContent}: ${r.toFixed(1)}`);
          });
        });
        return out;
      });
      todos.push(...ruins.map((r) => `${theme} slide ${r}`));
      assert.deepEqual(errors, []);
      await p.close();
    }
    assert.deepEqual(todos, []);
  } finally { await browser.close(); }
});
