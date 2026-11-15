// Defeitos achados no deck "Vibe coding sem as obviedades", gerado pela IA (15/11/2026): o fiscal não acusava nada,
// mas na tela o Venn cortava e sobrepunha os rótulos, a anotação do gráfico invadia o texto ao lado e passava por cima
// da linha, e a fonte do `stats` com `add` ficava por baixo dos cartões. Cada slide aqui é o que a IA escreveu.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const SLIDES = [
  { layout: "split", kicker: "A tese", title: "Não é o prompt. É o contexto.",
    body: "Escrever o prompt é uma tarefa discreta: você escreve e pronto. Decidir **o que entra na janela** é um trabalho contínuo.",
    figure: { diagram: "venn", a: "escrever o prompt", b: "curar o contexto", both: "o que o app entrega" } },
  { layout: "chart", title: "Começa bem. Termina mal.",
    chart: { chart: "line", labels: [1, 5, 10, 15, 20, 25, 30, 35, 40], series: [{ name: "o que o modelo ainda acerta", values: [100, 99, 96, 90, 80, 66, 50, 36, 26] }],
      axis: false, markers: false, area: true,
      annotations: [{ at: 1, text: "ainda lembra tudo" }, { at: 5, text: "já repete o que você disse" }, { at: 8, text: "esqueceu a tarefa original" }] },
    side: "O contexto é um recurso finito, com retornos decrescentes: cada token novo gasta um pouco do **orçamento de atenção** do modelo." },
  { layout: "stats", kicker: "A conta", title: "Refinar tem preço — e dá para ver onde ele vai",
    stats: [{ value: 13, prefix: "$", label: "por desenvolvedor, por dia ativo", icon: "calendar-days" },
      { value: "150–250", prefix: "$", label: "por desenvolvedor, por mês", icon: "wallet" },
      { value: 30, prefix: "$", label: "por dia ativo — o teto para 90% dos usuários", icon: "gauge" }],
    add: [{ body: "O `/usage` atribui o uso recente a skills, subagentes, plugins e servidores MCP, cada um como porcentagem do total.", card: true }],
    source: "Claude Code, Gerencie custos de forma eficaz [F7]" },
];

const overlap = (a, b, tol = 2) => a.left < b.right - tol && b.left < a.right - tol && a.top < b.bottom - tol && b.top < a.bottom - tol;

test("Venn, anotações do gráfico e fonte do stats não se sobrepõem nem saem da figura", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-sobre-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "terminal-pro", slides: SLIDES }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const open = async (n) => { await page.goto(`file://${file.replace(/\\/g, "/")}?export#${n}`); await page.waitForTimeout(600); };
    const box = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });

    // 1. Venn: cada rótulo dentro da sua região, sem encostar no outro
    await open(1);
    const venn = await page.evaluate(() => {
      const svg = document.querySelectorAll(".slide")[0].querySelector("svg.venn");
      const circles = [...svg.querySelectorAll("circle")].map((c) => c.getBoundingClientRect());
      const labels = [...svg.querySelectorAll(".venn-label")].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight }; });
      return { circles: circles.map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })), labels };
    });
    assert.equal(venn.labels.length, 3, "três rótulos (a, b e a interseção)");
    const [ca, cb] = venn.circles;
    const [la, lb, lab] = venn.labels;
    assert.ok(la.left >= ca.left - 1 && la.right <= cb.left + 1, `rótulo A dentro da parte só de A: ${JSON.stringify(la)}`);
    assert.ok(lb.left >= ca.right - 1 && lb.right <= cb.right + 1, `rótulo B dentro da parte só de B: ${JSON.stringify(lb)}`);
    assert.ok(lab.left >= cb.left - 1 && lab.right <= ca.right + 1, `interseção dentro da interseção: ${JSON.stringify(lab)}`);
    for (const l of venn.labels) assert.ok(l.sw <= l.cw + 1 && l.sh <= l.ch + 1, `"${l.text}" cabe na caixa`);

    // 2. Gráfico: anotação dentro do gráfico (não invade o texto ao lado) e longe da linha
    await open(2);
    const ch = await page.evaluate(() => {
      const slide = document.querySelectorAll(".slide")[1];
      const svg = slide.querySelector("svg.chart-line"), side = slide.querySelector(".L-chart .side, .L-chart .t.f-body:not(.src)");
      const notes = [...svg.querySelectorAll("text.f-heading")].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      const line = svg.querySelector("path.draw");
      // pontos da linha (amostrados) em coordenadas da tela
      const pts = [];
      if (line && line.getTotalLength) {
        const L = line.getTotalLength(), m = line.getScreenCTM();
        for (let k = 0; k <= 200; k++) { const p = line.getPointAtLength((L * k) / 200); pts.push([p.x * m.a + p.y * m.c + m.e, p.x * m.b + p.y * m.d + m.f]); }
      }
      const svgR = svg.getBoundingClientRect();
      return { notes, pts, svg: { left: svgR.left, right: svgR.right, top: svgR.top, bottom: svgR.bottom }, side: side ? (() => { const r = side.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })() : null };
    });
    assert.equal(ch.notes.length, 3);
    assert.ok(ch.pts.length > 10, "achou a linha do gráfico");
    for (const n of ch.notes) {
      assert.ok(n.right <= ch.svg.right + 1 && n.left >= ch.svg.left - 1, `"${n.text}" fica dentro do gráfico`);
      if (ch.side) assert.ok(!overlap(n, ch.side), `"${n.text}" não invade o texto ao lado`);
      const hit = ch.pts.filter(([x, y]) => x > n.left + 2 && x < n.right - 2 && y > n.top + 2 && y < n.bottom - 2);
      assert.equal(hit.length, 0, `"${n.text}" não fica em cima da linha`);
    }

    // 3. stats com add e fonte: a fonte não fica por baixo dos cartões
    await open(3);
    const st = await page.evaluate(() => {
      const slide = document.querySelectorAll(".slide")[2];
      const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
      return { src: r(slide.querySelector(".src")), cards: [...slide.querySelectorAll(".L-stats .stat, .L-stats .card, .L-stats > div > div")].map(r) };
    });
    assert.ok(st.cards.length >= 3);
    for (const c of st.cards) assert.ok(!overlap(c, st.src), `fonte por baixo de um cartão: ${JSON.stringify({ c, src: st.src })}`);

    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
