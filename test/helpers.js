// Utilitários da suíte de testes: deck de teste numa pasta temporária, Studio numa porta livre, navegador.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURE = path.join(ROOT, "test", "fixtures", "deck.yaml");

// Copia o deck de teste para uma pasta temporária (os testes editam e salvam o arquivo).
export function tempDeck(src = FIXTURE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-test-"));
  const file = path.join(dir, "deck.yaml");
  fs.copyFileSync(src, file);
  return { dir, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// Sobe o Studio numa porta livre com o deck de teste.
// Sem SAGADECK_LIVE=1 o LLM fica "desligado" (endereço sem ninguém): o Studio usa as regras locais e os testes
// ficam rápidos e determinísticos.
export async function startStudio(deckFile) {
  if (process.env.SAGADECK_LIVE !== "1") process.env.SAGADECK_LLM_URL = "http://127.0.0.1:9/v1";
  const { createStudioServer } = await import("../src/studio/server.js");
  const server = createStudioServer(deckFile, { host: "127.0.0.1" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    },
  };
}

// Chrome/Edge instalado (o sagadeck não baixa navegador). Sem navegador, os testes de UI são pulados.
export async function browserOrSkip(t) {
  const { findBrowser } = await import("../src/export/browser.js");
  let exe;
  try { exe = findBrowser(); } catch { t.skip("sem Chrome/Edge — defina SAGADECK_BROWSER"); return null; }
  const { chromium } = await import("playwright-core");
  return chromium.launch({ executablePath: exe });
}

// Página que coleciona erros de JS/console — todo teste de UI termina exigindo zero erros.
export async function newPage(browser, url, viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(8000); // falha rápido em vez de travar a suíte
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/status of 400/.test(m.text()) && errors.push(m.text()));
  if (url) {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(600);
  }
  return { page, errors };
}
