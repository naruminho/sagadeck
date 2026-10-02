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

// matiz (0-360), saturação e luminosidade de "rgb(r, g, b)"
const HSL = `(c) => { const [r, g, b] = c.match(/[\\d.]+/g).slice(0, 3).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const h = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l }; }`;
const perto = (a, b, tol = 14) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) <= tol; };

test("desenhado com a paleta: família do destaque, ênfase num tom mais forte, compacto", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const { p, errors } = await montar(browser, "sinal", [{ layout: "diagram", title: "Fluxo", mermaid: FLUXO }]);
    const r = await p.evaluate((HSL) => {
      const hsl = eval(HSL);
      const slide = document.querySelector(".slide"), box = slide.querySelector(".dg-box"), svg = box.querySelector(":scope > svg");
      const cs = getComputedStyle(slide), b = box.getBoundingClientRect(), s = svg.getBoundingClientRect();
      const probe = document.createElement("i"); slide.append(probe);
      const rgb = (c) => { probe.style.color = c; return getComputedStyle(probe).color; };
      const shapeOf = (id) => svg.querySelector(`[id*="flowchart-${id}-"]`)?.querySelector("rect,polygon,path,circle");
      const st = (id) => getComputedStyle(shapeOf(id));
      return {
        hi: hsl(rgb(cs.getPropertyValue("--hi"))), em: hsl(rgb(cs.getPropertyValue("--em"))),
        A: hsl(st("A").fill), F: hsl(st("F").fill), C: hsl(st("C").fill), strokeC: hsl(st("C").stroke),
        font: getComputedStyle(svg.querySelector(".nodeLabel, .label")).fontFamily,
        ocupa: Math.max(s.width / b.width, s.height / b.height), dentro: s.left >= b.left - 1 && s.right <= b.right + 1 && s.top >= b.top - 1 && s.bottom <= b.bottom + 1,
        icone: !!svg.querySelector(".dgi svg"), erro: !!slide.querySelector(".dg-error"),
      };
    }, HSL);
    assert.equal(r.erro, false);
    assert.ok(perto(r.C.h, r.hi.h) && perto(r.strokeC.h, r.hi.h), `nós na família do destaque do tema (${JSON.stringify([r.hi, r.C, r.strokeC])})`);
    assert.ok(r.C.l > 0.8, "preenchimento claro, não um bloco chapado");
    assert.ok(r.strokeC.l < r.C.l - 0.25, "contorno da mesma cor, mais escuro");
    assert.ok(perto(r.A.h, r.hi.h) && r.A.l < r.C.l - 0.05, "ênfase :::hi: o mesmo matiz num tom mais forte");
    assert.ok(perto(r.F.h, r.em.h, 20), "ênfase :::em: o matiz da cor de ênfase do tema");
    assert.doesNotMatch(r.font, /trebuchet/i, "fonte do tema, não a do Mermaid");
    assert.ok(r.ocupa > 0.85, `compacto: o desenho ocupa a área (${r.ocupa.toFixed(2)})`);
    assert.ok(r.dentro, "e cabe nela");
    assert.ok(r.icone, "ícone desenhado dentro do nó");
    assert.deepEqual(errors, []);
    await p.close();
    // outra paleta: outras cores
    const b2 = await montar(browser, "sinal", [{ layout: "diagram", mermaid: FLUXO }], "floresta");
    const C2 = await b2.p.evaluate((HSL) => eval(HSL)(getComputedStyle(document.querySelector('.dg-box [id*="flowchart-C-"]').querySelector("rect,polygon,path")).fill), HSL);
    assert.ok(!perto(C2.h, r.C.h), "outra paleta, outro matiz");
    await b2.p.close();
  } finally { await browser.close(); }
});

test("grupos: cada subgraph ganha uma família (fundo claro, título e nós no mesmo matiz); nada de preto puro", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const mermaid = "flowchart LR\n  U([Usuário]):::suave\n  subgraph FE[Front-end]\n    T[Teams]\n    W[App]\n  end\n  subgraph BR[Bridge]\n    API[Gateway] --> M[Modelos]:::em\n  end\n  U --> T & W\n  T --> API\n  W --> API";
    for (const theme of ["sinal", "noite"]) {
      const { p, errors } = await montar(browser, theme, [{ layout: "diagram", mermaid }]);
      const r = await p.evaluate((HSL) => {
        const hsl = eval(HSL);
        const svg = document.querySelector(".dg-box > svg");
        const node = (id) => getComputedStyle(svg.querySelector(`[id*="flowchart-${id}-"]`).querySelector("rect,polygon,path"));
        const cl = [...svg.querySelectorAll("g.cluster")].map((g) => ({ fill: hsl(getComputedStyle(g.querySelector("rect")).fill), title: hsl(getComputedStyle(g.querySelector(".cluster-label span, .cluster-label p, .cluster-label .nodeLabel")).color) }));
        // nenhum texto ou traço em preto puro (nem branco puro no tema escuro)
        const probe = document.createElement("i"); document.querySelector(".slide").append(probe);
        probe.style.color = "var(--fg)"; const fg = getComputedStyle(probe).color;
        const puros = [...new Set([...svg.querySelectorAll("text, span, p, path, line, rect")].flatMap((e) => { const c = getComputedStyle(e); return /^(span|p)$/i.test(e.tagName) ? [c.color] : [c.fill, c.stroke]; })
          .filter((c) => c === fg || /^rgb\((0, 0, 0|255, 255, 255)\)$/.test(c)))];
        return { T: hsl(node("T").fill), W: hsl(node("W").fill), API: hsl(node("API").fill), M: hsl(node("M").fill), U: hsl(node("U").fill), cl, puros };
      }, HSL);
      assert.equal(r.cl.length, 2);
      assert.ok(perto(r.T.h, r.W.h, 2), "nós do mesmo grupo, mesma família");
      assert.ok(!perto(r.T.h, r.API.h, 25), `grupos diferentes, famílias diferentes (${theme}: ${r.T.h} × ${r.API.h})`);
      const dele = (c, n) => perto(c.fill.h, n.h, 8) && perto(c.title.h, n.h, 8);
      assert.ok(r.cl.some((c) => dele(c, r.T)) && r.cl.some((c) => dele(c, r.API)), `fundo e título de cada grupo no matiz dos nós dele (${theme}: ${JSON.stringify(r)})`);
      assert.ok(r.U.s < 0.2, ":::suave é cinza neutro");
      assert.ok(!perto(r.M.h, r.API.h, 25), `a ênfase se destaca do grupo em que está (${theme}: ${r.M.h} × ${r.API.h})`);
      assert.deepEqual(r.puros, [], `${theme}: nada de preto (ou branco) puro, nem a cor cheia do texto do tema`);
      assert.deepEqual(errors, []);
      await p.close();
    }
  } finally { await browser.close(); }
});

test("direção automática: um fluxo comprido escrito em pé deita para caber maior; autoDirection: false respeita o código", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const trem = "flowchart TB\n  " + Array.from({ length: 6 }, (_, i) => `N${i}[Etapa ${i + 1}]`).join(" --> ");
    const { p, errors } = await montar(browser, "sinal", [{ layout: "diagram", mermaid: trem }, { layout: "diagram", mermaid: trem, autoDirection: false }]);
    const r = await p.evaluate(() => [...document.querySelectorAll(".dg-box > svg")].map((svg) => {
      const a = svg.querySelector('[id*="flowchart-N0-"]').getBoundingClientRect(), b = svg.querySelector('[id*="flowchart-N5-"]').getBoundingClientRect();
      return { deitado: Math.abs(b.left - a.left) > Math.abs(b.top - a.top), k: +svg.parentElement.dataset.dgScale };
    }));
    assert.equal(r[0].deitado, true, "deitou (o slide é largo)");
    assert.equal(r[1].deitado, false, "autoDirection: false fica em pé");
    assert.ok(r[0].k > r[1].k, "e a letra ficou maior");
    assert.deepEqual(errors, []);
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

test("paleta de família: grupos e ramos ficam nos tons da família; a cor forte só na ênfase", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const flow = "flowchart LR\n  subgraph A[Um]\n    a1[x] --> a2[y]\n  end\n  subgraph B[Dois]\n    b1[x]\n  end\n  subgraph C[Três]\n    c1[x]\n  end\n  subgraph D[Quatro]\n    d1[x]:::em\n  end\n  a2 --> b1 --> c1 --> d1";
    const mind = "mindmap\n  root((Centro))\n    Um\n    Dois\n    Três\n    Quatro\n    Cinco";
    const { p, errors } = await montar(browser, "prata", [{ layout: "diagram", mermaid: flow }, { layout: "diagram", mermaid: mind }], "rubi");
    const r = await p.evaluate((HSL) => {
      const hsl = eval(HSL);
      const [f, m] = [...document.querySelectorAll(".dg-box > svg")];
      const fills = (svg, sel) => [...svg.querySelectorAll(sel)].map((n) => n.querySelector("rect,polygon,path,circle")).filter(Boolean).map((s) => getComputedStyle(s).fill).filter((c) => !/rgba?\(0, 0, 0, 0\)|none/.test(c)).map(hsl);
      const em = svg => { const n = svg.querySelector('[id*="flowchart-d1-"]'); return hsl(getComputedStyle(n.querySelector("rect,polygon,path")).fill); };
      return { nodes: fills(f, "g.node:not(.em)"), groups: [...f.querySelectorAll("g.cluster rect")].map((r) => hsl(getComputedStyle(r).fill)), em: em(f), ramos: fills(m, ".mindmap-node, g.node") };
    }, HSL);
    // família rubi: rosas, magentas e vinhos (matiz de ~300 a ~360/0) e, no máximo, um terracota vizinho (até ~25)
    const naFamilia = (c) => c.s < 0.12 || c.h >= 290 || c.h <= 25;
    const fora = [...r.nodes, ...r.groups, ...r.ramos].filter((c) => !naFamilia(c));
    assert.deepEqual(fora.map((c) => Math.round(c.h)), [], "nada de verde, azul ou amarelo numa paleta rosa");
    assert.ok(new Set([...r.groups].map((c) => Math.round(c.h / 4) + ":" + Math.round(c.l * 20))).size >= 3, "grupos distinguíveis dentro da família");
    assert.ok(perto(r.em.h, 350, 14), `ênfase no vermelho da marca (${r.em.h})`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("rótulo com parênteses sem aspas (Boca de Lobo 1 (BL1)) desenha; ligações curvas por padrão, em ângulo ou retas se pedir", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const code = "flowchart LR\n  subgraph A1 [Área de Contribuição 1]\n    L1[Lotes] --> S1[Sarjeta]\n  end\n  S1 --> BL1[Boca de Lobo 1 (BL1)]\n  D1{Divisor (escoamento)} -.-> S1";
    const slides = [{ layout: "diagram", mermaid: code }, { layout: "diagram", mermaid: "flowchart TD\n  A --> B\n  A --> C", curve: "angulo" }, { layout: "diagram", mermaid: "flowchart TD\n  A --> B", curve: "reta" }];
    const { p, errors } = await montar(browser, "sinal", slides);
    const r = await p.evaluate(() => [...document.querySelectorAll(".slide")].map((s) => ({ svg: !!s.querySelector(".dg-box svg"), erro: s.querySelector(".dg-error")?.textContent || "", curve: s.querySelector(".dg-box").dataset.dgCurve, txt: s.querySelector(".dg-box svg")?.textContent || "" })));
    assert.equal(r[0].erro, "", "sem erro de sintaxe");
    assert.ok(r[0].svg && /Boca de Lobo 1 \(BL1\)/.test(r[0].txt) && /Divisor \(escoamento\)/.test(r[0].txt), JSON.stringify(r[0]).slice(0, 200));
    assert.deepEqual(r.map((x) => x.curve), ["basis", "step", "linear"]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
