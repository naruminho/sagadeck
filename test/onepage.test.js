// One-page (pedido do Naruminho): uma página só com a jornada (ícones e mini-frases), o problema com números, a
// solução e, às vezes, um dashboard (números grandes, mapa de região, barras comparativas, linhas de tendência).
// Só entram as partes preenchidas; o arranjo se ajusta e nada sai do slide nem encavala.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { UF_GRID } from "../src/figures/ufmap.js";
import { browserOrSkip } from "./helpers.js";

const CHEIO = {
  layout: "onepage", kicker: "Proposta", title: "Cadastro digital de clientes", subtitle: "Menos papel, menos fila, menos retrabalho",
  journey: [{ icon: "user", title: "Cliente chega", text: "Fila de 40 min" }, { icon: "file-text", title: "Preenche papel", text: "3 formulários" },
    { icon: "scan", title: "Digitalização", text: "Retrabalho em 1 de 5" }, { icon: "check", title: "Conta aberta", text: "Até 5 dias" }],
  problem: { text: "O cadastro em papel atrasa a abertura de contas e gera erros de digitação.", numbers: [{ value: "5 dias", label: "para abrir uma conta" }, { value: "20%", label: "dos cadastros refeitos" }] },
  solution: { text: "Cadastro no tablet, com validação na hora e assinatura digital.", items: ["Conta aberta no mesmo dia", "Zero papel na agência"] },
  dashboard: {
    numbers: [{ value: "1,2 mi", label: "cadastros por ano", trend: "+8%" }],
    figures: [
      { title: "Tempo por etapa (min)", chart: "bar", data: [{ label: "Fila", value: 40 }, { label: "Papel", value: 25 }, { label: "Digitação", value: 15 }] },
      { title: "Contas por mês", chart: "line", labels: ["jan", "fev", "mar", "abr", "mai", "jun"], series: [{ name: "contas", values: [80, 95, 90, 110, 130, 150] }] },
      { title: "Cadastros por UF (mil)", ufmap: { SP: 320, RJ: 140, MG: 150, BA: 90, PR: 80, RS: 85, PE: 60, CE: 55, DF: 40, AM: 20, PA: 30 }, highlight: ["SP"] },
    ],
  },
};
const PAINEL = { layout: "onepage", title: "Painel de vendas", dashboard: {
  numbers: [{ value: "R$ 4,2 mi", label: "no trimestre", trend: "+12%" }, { value: "38 mil", label: "clientes novos", trend: "-3%" }],
  figures: [{ title: "Vendas por UF", ufmap: { SP: 1200, RJ: 600, MG: 700, RS: 400, BA: 300 } }, { title: "Por canal", chart: "bar", data: [{ label: "App", value: 60 }, { label: "Agência", value: 30 }, { label: "Web", value: 10 }], suffix: "%" }] } };
const SIMPLES = { layout: "onepage", title: "Onboarding em 1 página", journey: ["Pedido", "Aprovação", "Acesso liberado"], problem: "Leva 2 semanas", solution: "Fluxo automático em 2 dias" };

test("one-page: jornada, problema com números, solução e painel; só o que foi preenchido aparece", () => {
  const { html, warnings } = buildHTML({ slides: [CHEIO, PAINEL, SIMPLES, { layout: "onepage", title: "Vazio", problem: {}, dashboard: {} }] });
  const [a, b, c, d] = html.split(/data-idx="\d+"/).slice(1);
  assert.equal((a.match(/class="op-step[" ]/g) || []).length, 4, "4 etapas da jornada");
  assert.match(a, /op-problem[\s\S]*?5 dias[\s\S]*?para abrir uma conta/);
  assert.match(a, /op-solution[\s\S]*?Conta aberta no mesmo dia/);
  assert.match(a, /class="L-onepage op-beside"/, "problema/solução e painel lado a lado");
  assert.match(a, /op-kpi[\s\S]*?1,2 mi[\s\S]*?trend-up/);
  assert.equal((a.match(/class="op-tile op-fig"/g) || []).length, 2, "barras e linha");
  assert.match(a, /class="op-tile op-fig op-map"[\s\S]*?data-uf="SP"/, "o mapa por UF numa coluna própria");
  // só o painel: dashboard de página inteira, mapa com os valores (quadro largo)
  assert.match(b, /L-onepage op-only-dash/);
  assert.match(b, /trend-down/, "tendência negativa em vermelho");
  assert.match(b, /data-uf="SP"[\s\S]*?1\.200/);
  // sem painel: letra maior; texto simples vira bloco e etapa só com texto vira frase em destaque
  assert.match(c, /L-onepage op-roomy/);
  assert.match(c, /op-problem[\s\S]*?Leva 2 semanas/);
  assert.match(c, /op-st-t[^>]*>Pedido/);
  // bloco vazio (o formulário cria {} ao abrir) não aparece
  assert.doesNotMatch(d, /op-problem|op-dash"/);
  // denso por natureza: o limite de palavras do one-page é maior
  assert.deepEqual(warnings.filter((w) => /palavras/.test(w)), []);
});

test("mapa por UF: 27 estados em grade, cor pelo valor, sigla desconhecida avisa", () => {
  assert.equal(Object.keys(UF_GRID).length, 27);
  const pos = Object.values(UF_GRID).map((p) => p.join(","));
  assert.equal(new Set(pos).size, 27, "cada UF num quadrado só");
  const { html, warnings } = buildHTML({ slides: [{ layout: "split", title: "Mapa", figure: { ufmap: { sp: 10, RJ: "5", XX: 3 }, suffix: "%" } }] });
  assert.match(html, /data-uf="SP"[^>]*>\s*<rect[^>]*color-mix\(in srgb,var\(--em\) 100%/, "o maior valor com a cor cheia (sigla em minúscula vale)");
  assert.match(html, /data-uf="RJ"[^>]*>\s*<rect[^>]*var\(--em\) 18%/, "o menor ainda aparece");
  assert.match(html, /class="uf-cell uf-empty" data-uf="AC"/, "UF sem valor fica apagada");
  assert.match(html, />10%</);
  assert.match(warnings.join("\n"), /ufmap: "XX" não é uma UF/);
});

test("one-page no navegador: cheio, só painel e simples cabem no slide, nada encavala", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    for (const theme of ["sinal", "editorial", "noite"]) {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-onepage-")), "d.html");
      fs.writeFileSync(file, buildHTML({ theme, slides: [CHEIO, PAINEL, SIMPLES] }).html);
      await p.goto("file://" + file + "?export=1");
      await p.evaluate(() => document.fonts.ready);
      for (const i of [0, 1, 2]) {
        await p.evaluate((k) => window.sagadeck.goto(k, 99, true), i);
        await p.waitForTimeout(300);
        const problemas = await p.evaluate((k) => {
          const s = document.querySelectorAll(".slide")[k], sr = s.getBoundingClientRect(), out = [];
          const dentro = (r, box, m = 2) => r.left >= box.left - m && r.right <= box.right + m && r.top >= box.top - m && r.bottom <= box.bottom + m;
          const ts = [...s.querySelectorAll(".t")].filter((e) => e.getBoundingClientRect().width && !e.querySelector(".t"));
          for (const e of ts) {
            const r = e.getBoundingClientRect();
            if (!dentro(r, sr)) out.push(`fora do slide: ${e.textContent.slice(0, 30)}`);
            // texto não vaza do bloco/quadro em que está
            const box = e.closest(".op-block,.op-tile");
            if (box && !dentro(r, box.getBoundingClientRect())) out.push(`vaza do quadro: ${e.textContent.slice(0, 30)}`);
          }
          for (let a = 0; a < ts.length; a++) for (let b = a + 1; b < ts.length; b++) {
            const x = ts[a].getBoundingClientRect(), y = ts[b].getBoundingClientRect();
            if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 4 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 4) out.push(`encavala: "${ts[a].textContent.slice(0, 20)}" × "${ts[b].textContent.slice(0, 20)}"`);
          }
          // gráficos e mapa não vazam do quadro e não somem (altura de verdade)
          for (const f of s.querySelectorAll(".op-fig-in svg")) {
            const r = f.getBoundingClientRect(), box = f.closest(".op-tile").getBoundingClientRect();
            if (r.height < 80) out.push(`gráfico espremido: ${Math.round(r.height)}px`);
            if (!dentro(r, box)) out.push("gráfico vaza do quadro");
          }
          return out;
        }, i);
        assert.deepEqual(problemas, [], `${theme}, slide ${i + 1}`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
