// Utilitários da suíte de testes: deck de teste numa pasta temporária, Studio numa porta livre, navegador.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Blindagem: qualquer código que caia na biblioteca padrão durante os testes usa uma pasta temporária,
// nunca a ~/sagadeck de quem está rodando.
process.env.SAGADECK_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-home-"));
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
// Com { llmUrl }, usa esse LLM (ex.: o falso de test/mock-llm.js).
export async function startStudio(deckFile, { llmUrl, multiuser = false } = {}) {
  if (llmUrl) process.env.SAGADECK_LLM_URL = llmUrl;
  else if (process.env.SAGADECK_LIVE !== "1") process.env.SAGADECK_LLM_URL = "http://127.0.0.1:9/v1";
  // biblioteca temporária: os testes nunca tocam a ~/sagadeck de quem roda
  const library = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-biblioteca-"));
  const { createStudioServer } = await import("../src/studio/server.js");
  const server = createStudioServer(deckFile, { host: "127.0.0.1", library, multiuser });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    library,
    close: async () => {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
      // o Chrome que tira as fotos do slide para a IA fica aberto entre pedidos; sem fechar, o processo não termina
      const { closeSnapshots } = await import("../src/studio/snapshot.js");
      await closeSnapshots();
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

// o que tem dentro de um .pptx: slides, textos e notas
export async function readPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  const notes = names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  const text = async (n) => (await zip.file(n).async("string")).match(/<a:t>([^<]*)<\/a:t>/g)?.map((t) => t.slice(5, -6)).join(" ") || "";
  return {
    slides: await Promise.all(slides.map(text)),
    notes: (await Promise.all(notes.map(text))).join(" "),
    animations: (await Promise.all(slides.map((n) => zip.file(n).async("string")))).filter((x) => /<p:timing>/.test(x)).length,
  };
}
