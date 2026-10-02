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
