// Status semanal (pedido do Naruminho): feito, em andamento, bloqueios, riscos e próximos passos, a saúde do projeto,
// o avanço e screenshots quando há o que mostrar. "Muito variável: tem semana sem nada mostrável": só aparece o que
// foi preenchido, e o arranjo se ajusta (sem buraco, sem texto saindo do slide).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const CHEIA = {
  layout: "status", kicker: "Semana 39 · 22 a 26/09", title: "Portal do cliente", health: "risco", progress: 65,
  highlight: "Login novo em homologação",
  done: ["Tela de login", { text: "Integração com o cadastro", owner: "Ana" }, "Testes de carga"],
  doing: ["Recuperação de senha", "Ajustes de acessibilidade"],
  blocked: [{ text: "Liberação de firewall para o serviço de e-mail", owner: "Infra", due: "30/09" }],
  risks: ["Prazo de HOM apertado"],
  upcoming: ["Homologar com o negócio", "Plano de implantação"],
  shots: [{ image: PNG, caption: "Nova tela de login" }, { image: PNG, caption: "Recuperação de senha" }],
};
const VAZIA = { layout: "status", kicker: "Semana 40", title: "Portal do cliente", health: "ok", progress: 70,
  done: ["Revisão de código"], upcoming: ["Seguir com os testes"] };

test("status: só as seções preenchidas aparecem, com saúde, avanço, responsáveis e screenshots", () => {
  const html = buildHTML({ slides: [CHEIA, VAZIA] }).html;
  const [a, b] = html.split('data-idx="1"');
  for (const k of ["done", "doing", "blocked", "risks", "upcoming"]) assert.match(a, new RegExp(`class="stt-col stt-${k}`), k);
  assert.match(a, /class="stt-health stt-risco"[\s\S]*?Atenção/);
  assert.match(a, /stt-bar[^>]*style="width:65%"/);
  assert.match(a, /65%/);
  assert.match(a, /Liberação de firewall[\s\S]*?stt-meta[^>]*>Infra · até 30\/09/);
  assert.equal((a.match(/class="stt-shot"/g) || []).length, 2);
  assert.match(a, /Nova tela de login/);
  assert.match(a, /stt-highlight[\s\S]*?Login novo em homologação/);
  // semana sem nada mostrável: sem colunas vazias, sem área de screenshots
  assert.doesNotMatch(b, /stt-doing|stt-blocked|stt-risks|stt-shots/);
  assert.match(b, /stt-done[\s\S]*stt-upcoming/);
  assert.match(b, /class="stt-health stt-ok"[\s\S]*?Em dia/);
  // sem buraco na grade: 5 seções sem telas = 3 em cima e 2 embaixo, dividindo a linha inteira
  const sem = buildHTML({ slides: [{ ...CHEIA, shots: undefined }] }).html;
  assert.deepEqual([...sem.matchAll(/stt-col stt-\w+ e" style="[^"]*grid-column:span (\d)/g)].map((m) => +m[1]), [2, 2, 2, 3, 3]);
  // semana magra: letra maior e o bloco no meio; semana cheia não
  assert.match(b, /L-status stt-roomy/);
  assert.doesNotMatch(a, /class="L-status[^"]*stt-roomy/);
  // o rótulo da saúde pode ser trocado; valor desconhecido vira aviso
  assert.match(buildHTML({ slides: [{ ...VAZIA, health: "atrasado", healthLabel: "Atrasado 1 semana" }] }).html, /stt-atrasado[\s\S]*?Atrasado 1 semana/);
  assert.match(buildHTML({ slides: [{ ...VAZIA, health: "roxo" }] }).warnings.join("\n"), /health: use ok, risco ou atrasado/);
});

test("status no navegador: semana cheia e semana vazia cabem no slide, nada encavala", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    for (const theme of ["sinal", "editorial", "noite"]) {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-status-")), "d.html");
      fs.writeFileSync(file, buildHTML({ theme, slides: [CHEIA, VAZIA] }).html);
      await p.goto("file://" + file + "?export=1");
      await p.evaluate(() => document.fonts.ready);
      for (const i of [0, 1]) {
        await p.evaluate((k) => window.sagadeck.goto(k, 99, true), i);
        await p.waitForTimeout(300);
        const problemas = await p.evaluate((k) => {
          const s = document.querySelectorAll(".slide")[k], sr = s.getBoundingClientRect(), out = [];
          const ts = [...s.querySelectorAll(".t")].filter((e) => e.getBoundingClientRect().width && !e.querySelector(".t"));
          for (const e of ts) { const r = e.getBoundingClientRect(); if (r.left < sr.left - 2 || r.right > sr.right + 2 || r.top < sr.top - 2 || r.bottom > sr.bottom + 2) out.push(`fora: ${e.textContent.slice(0, 30)}`); }
          for (let a = 0; a < ts.length; a++) for (let b = a + 1; b < ts.length; b++) {
            const x = ts[a].getBoundingClientRect(), y = ts[b].getBoundingClientRect();
            if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 4 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 4) out.push(`encavala: "${ts[a].textContent.slice(0, 20)}" × "${ts[b].textContent.slice(0, 20)}"`);
          }
          return out;
        }, i);
        assert.deepEqual(problemas, [], `${theme}, slide ${i + 1}`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
