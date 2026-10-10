// Calendário (pedido: "um infográfico em forma de calendário dos próximos filmes da Marvel"; o sagadeck não tinha
// calendário e a IA fez uma linha do tempo).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML, renderSlide } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const marvel = { layout: "calendar", kicker: "MCU", title: "Os próximos filmes da Marvel", events: [
  { date: "2026-12-18", title: "Avengers: Doomsday", tag: "Filme" }, { date: "14/10/2026", title: "VisionQuest", tag: "Série" },
  { date: "2027-12-17", title: "Avengers: Secret Wars", tag: "Filme" }, { date: "2028-05", title: "X-Men", tag: "Filme" }, { date: "algum dia", title: "Armor Wars" }],
  undated: [{ title: "Shang-Chi 2", text: "Data a definir" }] };
const R = (s) => renderSlide(s, 0, { title: "x", theme: "aurora", slides: [] }).html;

test("calendário: um cartão por mês em ordem, dias marcados, data sem dia e sem data no cartão próprio", () => {
  const h = R(marvel);
  assert.deepEqual([...h.matchAll(/ca-mo"[^>]*>([^<]*)</g)].map((m) => m[1]), ["out", "dez", "dez", "mai", "sem data"]);
  assert.deepEqual([...h.matchAll(/<b style="--c:[^"]*">(\d+)<\/b>/g)].map((m) => +m[1]), [14, 18, 17], "dias marcados (maio de 2028 não tem dia)");
  assert.match(h, /ca-undated[\s\S]*Armor Wars[\s\S]*Shang-Chi 2/, "data que não dá para ler vai para sem data");
  assert.match(h, /ca-legend/, "dois tipos: legenda");
  // outubro de 2026 começa numa quinta: 4 casas vazias antes do dia 1
  assert.match(h, /<u>S<\/u><i><\/i><i><\/i><i><\/i><i><\/i><i>1<\/i>/);
});

// Pedido de Narumi: muitos eventos no mesmo mês enchiam o cartão e passavam da altura do slide. Agora há visões
// (meses, mes, semana, lista) e, sem `view`, o sagadeck escolhe pelo que cabe.
const doMes = (m, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ date: `${m}-${String(2 + ((i * 2) % 27)).padStart(2, "0")}`, title: `Evento ${i + 1}`, ...extra }));
const viewOf = (h) => h.match(/class="L-calendar" data-view="(\w+)"/)?.[1];
const W = (s) => buildHTML({ title: "x", theme: "aurora", slides: [s] }).warnings.filter((w) => /calendário/.test(w));

test("calendário: sem view, escolhe pelo que cabe (cartões; um mês cheio vira o mês grande; vários meses cheios viram lista)", () => {
  assert.equal(viewOf(R(marvel)), "meses", "um evento por mês cabe nos cartões");
  const cheio = { layout: "calendar", title: "Novembro", events: doMes("2026-11", 16) };
  assert.equal(viewOf(R(cheio)), "mes");
  assert.deepEqual(W(cheio), []);
  const varios = { layout: "calendar", title: "Agenda", events: ["2026-11", "2026-12", "2027-01", "2027-02"].flatMap((m) => doMes(m, 7, { text: "Detalhe" })) };
  assert.equal(viewOf(R(varios)), "lista");
  // pediu cartões e não cabe: avisa e sugere o mês grande ou um slide por mês
  const forcado = W({ ...varios, view: "meses" }).join("\n");
  assert.match(forcado, /não cabe no cartão; use view: mes \(no Studio: Um slide por mês\) ou view: lista/);
  assert.match(W({ ...marvel, view: "ano" }).join("\n"), /visão "ano" não existe/);
});

test("calendário, visão de mês: o mês grande com os eventos escritos nos dias; month escolhe o mês; dia cheio vira + mais", () => {
  const ev = [...doMes("2026-11", 3), ...doMes("2026-12", 2), { date: "2026-12-10 19:30", title: "Sessão" }, { date: "2026-12-10", title: "Debate", time: "18h00" },
    { date: "2026-12-10", title: "Mostra" }, { date: "2026-12-10", title: "Oficina" }, { date: "2026-12", title: "Sem dia" }];
  const h = R({ layout: "calendar", title: "Dezembro", view: "mes", month: "2026-12", events: ev });
  assert.equal((h.match(/class="cm-month e/g) || []).length, 1, "só o mês pedido");
  assert.match(h, /ca-mo"[^>]*>dezembro</);
  assert.doesNotMatch(h, /novembro/);
  // dezembro de 2026 começa numa terça: 2 casas vazias antes do dia 1
  assert.match(h, /sáb<\/u><div class="cm-cell out"><\/div><div class="cm-cell out"><\/div><div class="cm-cell[^"]*"><span class="cm-d t f-label"[^>]*>1</);
  assert.match(h, /Mostra[\s\S]*Oficina[\s\S]*<b>18:00<\/b> Debate/, "o dia todo antes, depois pela hora (a hora vem do campo time)");
  assert.match(h, /\+ 1 mais/, "o dia com 4 eventos mostra 3 e o resto no + mais");
  assert.match(h, /cm-noday[\s\S]*Sem dia/, "evento do mês sem dia fica embaixo");
  assert.match(W({ layout: "calendar", view: "mes", month: "2026-12", events: ev }).join("\n"), /dia 10 de dezembro tem 4 eventos; 1 ficaram no "\+ mais"/);
});

test("calendário, visão de semana: uma coluna por dia com o horário; fim de semana vazio some; week escolhe a semana", () => {
  const ev = [{ date: "2026-11-16 09:00", title: "Abertura" }, { date: "2026-11-17", time: "14:00", title: "Mesa" }, { date: "2026-11-17", time: "09:00", title: "Oficina" }, { date: "2026-11-27", title: "Outra semana" }];
  const h = R({ layout: "calendar", title: "Programação", view: "semana", week: "2026-11-18", events: ev });
  assert.equal((h.match(/class="cw-day/g) || []).length, 5, "de segunda a sexta");
  assert.match(h, /seg<\/span><b class="t f-display">16[\s\S]*09:00[\s\S]*Abertura/);
  assert.match(h, /09:00[\s\S]*Oficina[\s\S]*14:00[\s\S]*Mesa/, "no dia, pela hora");
  assert.doesNotMatch(h, /Outra semana/);
  const fds = R({ layout: "calendar", view: "semana", events: [{ date: "2026-11-21", title: "Sábado cheio" }] });
  assert.equal((fds.match(/class="cw-day/g) || []).length, 7, "com evento no fim de semana, os sete dias");
});

test("calendário, visão de lista: agenda agrupada por mês, em colunas, com a letra menor quando são muitos", () => {
  const ev = ["2026-11", "2026-12", "2027-01"].flatMap((m) => doMes(m, 9));
  const h = R({ layout: "calendar", title: "Agenda", view: "lista", events: ev, undated: ["A definir"] });
  assert.deepEqual([...h.matchAll(/cl-h"><span class="t f-display"[^>]*>([^<]*)</g)].map((m) => m[1]), ["novembro", "dezembro", "janeiro", "sem data"]);
  assert.match(h, /--ncol:3;--cal-fs:17px/);
});

test("no navegador: o calendário cabe, os tipos têm cores diferentes e o nome do mês fica grande (não vira o menor texto do cartão)", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-cal-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "aurora", slides: [marvel] }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const s = document.querySelector(".slide"), safe = s.querySelector(".safe").getBoundingClientRect();
      const out = [...s.querySelectorAll(".safe .t")].filter((x) => x.getBoundingClientRect().bottom > safe.bottom + 6).length;
      const cores = new Set([...s.querySelectorAll(".ca-legend i")].map((i) => getComputedStyle(i).backgroundColor));
      return { out, cores: cores.size, mo: parseFloat(getComputedStyle(s.querySelector(".ca-mo")).fontSize), shrink: s.dataset.shrink || "" };
    });
    assert.equal(r.out, 0); assert.equal(r.cores, 2); assert.ok(r.mo >= 40, `mês com ${r.mo}px`); assert.ok(!r.shrink, r.shrink);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("no navegador: o que a escolha automática monta não corta nem passa da altura (de 1 a 8 meses, de 1 a 16 eventos por mês)", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-cal-"));
  try {
    const casos = [];
    for (const meses of [1, 3, 5, 8]) for (const n of [1, 3, 6, 16]) for (const text of [undefined, "Um detalhe curto"])
      casos.push({ layout: "calendar", kicker: "Agenda", title: "O calendário", events: Array.from({ length: meses }, (_, k) => doMes(`2026-${String(k + 1).padStart(2, "0")}`, n, text ? { text } : {})).flat() });
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "aurora", slides: casos }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck);
    const ruins = [];
    for (let i = 0; i < casos.length; i++) {
      await page.evaluate((i) => window.sagadeck.goto(i, 99), i); await page.waitForTimeout(60);
      const r = await page.evaluate(() => {
        const s = document.querySelector(".slide.current"), safe = s.querySelector(".safe").getBoundingClientRect();
        const cal = s.querySelector(".L-calendar");
        return { view: cal.dataset.view, cortado: [...s.querySelectorAll(".ca-month, .cl-list, .cw-day")].some((x) => x.scrollHeight > x.clientHeight + 1 || x.scrollWidth > x.clientWidth + 1),
          fora: [...s.querySelectorAll(".safe .t")].filter((x) => x.getBoundingClientRect().bottom > safe.bottom + 6).length };
      });
      if (r.cortado || r.fora) ruins.push({ i, meses: new Set(casos[i].events.map((e) => e.date.slice(0, 7))).size, n: casos[i].events.length, ...r });
    }
    // o que não cabe em slide nenhum (80, 128 eventos) precisa avisar para dividir
    const semAviso = ruins.filter((r) => !buildHTML({ title: "x", theme: "aurora", slides: [casos[r.i]] }).warnings.some((w) => /divida em dois slides|não cabe/.test(w)));
    assert.deepEqual(semAviso, []);
    assert.ok(ruins.every((r) => r.n > 48), `até 48 eventos sempre cabe: ${JSON.stringify(ruins)}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
