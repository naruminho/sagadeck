// Capturas do Studio para o Conheça o SagaDeck (seção Mapas): o slide de mapa com o botão "Editar mapa" e a tela do
// editor com um ponto selecionado. Sobe um Studio numa biblioteca temporária, abre o próprio tour em prévia e
// fotografa. Imprime as regiões (em % da imagem) para os hotspots do foco guiado em src/studio/tour.js.
// Precisa de internet (o fundo do mapa) e de Chrome ou Edge. Uso: node scripts/capturas-tour.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "studio", "assets", "imagens");
const W = 1600, H = 900;
process.env.SAGADECK_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-capturas-"));
process.env.SAGADECK_LLM_URL = "http://127.0.0.1:9/v1";

const { createStudioServer } = await import("../src/studio/server.js");
const { findBrowser } = await import("../src/export/browser.js");
const { chromium } = await import("playwright-core");
const server = createStudioServer(null, { host: "127.0.0.1", library: process.env.SAGADECK_HOME });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: findBrowser() });
const pct = (r) => ({ x: +(100 * r.x / W).toFixed(1), y: +(100 * r.y / H).toFixed(1), width: +(100 * r.width / W).toFixed(1), height: +(100 * r.height / H).toFixed(1) });
try {
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  await p.emulateMedia({ colorScheme: "light" });
  await p.goto(`${url}/editor?model=conheca&topic=Modelos`);
  const idx = await p.evaluate(async () => { for (let k = 0; k < 80; k++) { const d = await (await fetch("api/deck")).json(); const i = d.spec?.slides?.findIndex((s) => s.layout === "map" && /1 km/.test(s.title)); if (i >= 0) return i; await new Promise((r) => setTimeout(r, 100)); } return -1; });
  if (idx < 0) throw new Error("o tour não tem o mapa da cobertura");
  await p.waitForSelector("#thumbnails-list > *");
  await p.evaluate((i) => document.querySelectorAll("#thumbnails-list > *")[i].click(), idx);
  await p.waitForSelector('#rendered-slide-container .map-box[data-map-mounted="ready"]', { timeout: 20000 });
  await p.waitForTimeout(3000); // fundo do mapa
  await p.screenshot({ path: path.join(OUT, "tour-mapa-botao.jpg"), type: "jpeg", quality: 82 });
  const botao = pct(await p.locator("#canvas-viewport > .me-open").boundingBox());
  const painel = pct(await p.locator("#slide-fields-form").boundingBox().catch(() => null) || { x: 0, y: 0, width: 0, height: 0 });

  await p.click("#canvas-viewport > .me-open");
  await p.waitForSelector('.mpe .mpe-box[data-mpe-ready="1"]', { timeout: 20000 });
  const pt = await p.evaluate(() => { const inst = window.SagaMap.instance(document.querySelector(".mpe .mpe-box")); const l = inst.layers[0].g.getLayers()[1]; const q = inst.map.latLngToContainerPoint(l.getLatLng()), r = inst.map.getContainer().getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; });
  await p.mouse.click(...pt);
  await p.waitForSelector('.mpe [data-props] input[data-fp="nome"]');
  await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(OUT, "tour-mapa-editor.jpg"), type: "jpeg", quality: 82 });
  const box = async (s) => pct(await p.locator(s).first().boundingBox());
  console.log(JSON.stringify({ botao, painel, editor: { camadas: await box(".mpe-left"), ferramentas: await box(".mpe-tools"), mapa: await box(".mpe-mapwrap"), propriedades: await box(".mpe-right"), dica: await box(".mpe-tip"), concluir: await box(".mpe [data-fim]") } }, null, 1));
} finally {
  await browser.close();
  server.closeAllConnections?.(); server.close();
  const { closeSnapshots } = await import("../src/studio/snapshot.js"); await closeSnapshots();
}
