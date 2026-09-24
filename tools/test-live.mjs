// Teste automatizado do modo apresentação: janela do apresentador, cliques, widgets.
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { findBrowser } from "../src/export/browser.js";
const file = process.argv[2];
const b = await chromium.launch({ executablePath: findBrowser() });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const watch = (p, tag) => { p.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`)); p.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`)); };
watch(page, "main");
await page.goto(pathToFileURL(file).href);
await page.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
const [pop] = await Promise.all([ctx.waitForEvent("page"), page.keyboard.press("p")]);
watch(pop, "presenter");
await pop.waitForSelector("#pv .pv-notes");
await pop.waitForTimeout(500);
const notes1 = await pop.$eval(".pv-notes", (e) => e.textContent.slice(0, 80));
await pop.keyboard.press("ArrowRight"); await pop.waitForTimeout(300);
await pop.keyboard.press("ArrowRight"); await pop.waitForTimeout(300);
const st = await page.evaluate(() => [window.sagadeck.cur, window.sagadeck.step]);
const pvStep = await pop.$eval(".pv-step", (e) => e.textContent);
console.log("notas do slide 1:", notes1);
console.log("depois de 2 cliques na janela do apresentador -> principal em slide/clique:", st, "| apresentador mostra:", pvStep);
// jogo do carimbo
const veto = await page.evaluate(() => [...document.querySelectorAll(".slide")].findIndex((s) => s.querySelector('[data-widget="veto"]')));
await page.evaluate((i) => window.sagadeck.goto(i, 0), veto);
for (let k = 1; k <= 6; k++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(k === 5 ? 1200 : 250); }
const vetoTxt = await page.evaluate((i) => document.querySelectorAll(".slide")[i].querySelector(".vt-final")?.textContent, veto);
const count = await page.evaluate((i) => document.querySelectorAll(".slide")[i].querySelector("[data-n]")?.textContent, veto);
console.log("jogo do carimbo, clique 6:", vetoTxt?.trim().slice(0, 60), "| decisões:", count);
// simulador do limiar
const lim = await page.evaluate(() => [...document.querySelectorAll(".slide")].findIndex((s) => s.querySelector('[data-widget="limiar"]')));
await page.evaluate((i) => window.sagadeck.goto(i, 0), lim);
const before = await page.evaluate((i) => document.querySelectorAll(".slide")[i].querySelector("[data-v]").textContent, lim);
for (let k = 0; k < 4; k++) await page.keyboard.press("[");
const after = await page.evaluate((i) => [...document.querySelectorAll(".slide")[i].querySelectorAll(".lm-n")].map((e) => e.textContent), lim);
const v2 = await page.evaluate((i) => document.querySelectorAll(".slide")[i].querySelector("[data-v]").textContent, lim);
console.log("limiar:", before, "->", v2, after);
// enquete
const poll = await page.evaluate(() => [...document.querySelectorAll(".slide")].findIndex((s) => s.querySelector(".poll")));
await page.evaluate((i) => window.sagadeck.goto(i, 0), poll);
const vals = await page.$$(`.slide:nth-child(${poll + 1}) .po-val`);
for (const [j, n] of [[0, "12"], [1, "5"], [2, "20"]]) { await vals[j].click(); await page.keyboard.type(n); await page.keyboard.press("Enter"); }
const pct = await page.evaluate((i) => [...document.querySelectorAll(".slide")[i].querySelectorAll(".po-val")].map((e) => e.textContent), poll);
console.log("enquete 1 (12/5/20):", pct);
const poll2 = await page.evaluate(() => [...document.querySelectorAll(".slide")].map((s, i) => (s.querySelector(".poll[data-compare]") ? i : -1)).filter((i) => i >= 0)[0]);
if (poll2 != null) {
  await page.evaluate((i) => window.sagadeck.goto(i, 0), poll2);
  const v = await page.$$(`.slide:nth-child(${poll2 + 1}) .po-val`);
  for (const [j, n] of [[0, "8"], [1, "10"], [2, "19"]]) { await v[j].click(); await page.keyboard.type(n); await page.keyboard.press("Enter"); }
  console.log("enquete 2 comparada:", await page.evaluate((i) => [...document.querySelectorAll(".slide")[i].querySelectorAll(".po-val")].map((e) => e.textContent), poll2));
}
await page.screenshot({ path: process.argv[3] + "/live-poll2.png" });
await pop.screenshot({ path: process.argv[3] + "/live-presenter.png" });
console.log("erros JS:", errors.length ? errors : "nenhum");
await b.close();
