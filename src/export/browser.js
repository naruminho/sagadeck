// Abre o deck num Chrome/Edge headless (usa o navegador já instalado; nada é baixado).
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const CANDIDATES = [
  process.env.SAGADECK_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge",
].filter(Boolean);

export function findBrowser() {
  const p = CANDIDATES.find((c) => fs.existsSync(c));
  if (!p) throw new Error("Não achei Chrome nem Edge. Defina SAGADECK_BROWSER com o caminho do executável.");
  return p;
}

export async function openDeck(htmlFile, { scale = 1 } = {}) {
  const browser = await chromium.launch({ executablePath: findBrowser() });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(pathToFileURL(htmlFile).href + "?export=1");
  await page.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0 && document.fonts.status === "loaded");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  return { browser, page, errors };
}
