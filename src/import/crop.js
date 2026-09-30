// Recortes de imagem (PNG) pelo Chromium: serve para tirar, da foto fiel do slide original, a região de um objeto
// que o sagadeck não desenha igual (equação antiga em WMF com fontes de símbolo, SmartArt…).
import fs from "node:fs";

// fotos reduzidas (JPEG) para mandar ao modelo de visão: menos tokens, a mesma leitura
export async function imagesAsDataUrls(files, { width = 1024, quality = 0.82 } = {}) {
  if (!files.length) return [];
  const { findBrowser } = await import("../export/browser.js");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: findBrowser() });
  try {
    const page = await browser.newPage();
    await page.setContent("<body></body>");
    const out = [];
    for (const f of files) {
      if (!f || !fs.existsSync(f)) { out.push(null); continue; }
      const ext = f.toLowerCase().endsWith(".png") ? "png" : "jpeg";
      const data = `data:image/${ext};base64,${fs.readFileSync(f).toString("base64")}`;
      out.push(await page.evaluate(async ([data, width, quality]) => {
        const img = new Image(); img.src = data; await img.decode();
        const w = Math.min(width, img.width), h = Math.round((img.height * w) / img.width);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        return c.toDataURL("image/jpeg", quality);
      }, [data, width, quality]));
    }
    return out;
  } finally { await browser.close(); }
}

export async function cropRegions(jobs) {
  if (!jobs.length) return [];
  const { findBrowser } = await import("../export/browser.js");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: findBrowser() });
  const done = [];
  try {
    const page = await browser.newPage();
    await page.setContent("<body></body>");
    const bySrc = new Map();
    for (const j of jobs) { if (!bySrc.has(j.src)) bySrc.set(j.src, []); bySrc.get(j.src).push(j); }
    for (const [src, list] of bySrc) {
      if (!fs.existsSync(src)) continue;
      const data = `data:image/png;base64,${fs.readFileSync(src).toString("base64")}`;
      const outs = await page.evaluate(async ([data, list]) => {
        const img = new Image(); img.src = data; await img.decode();
        return list.map((j) => {
          const x = Math.max(0, Math.floor(j.x)), y = Math.max(0, Math.floor(j.y));
          const w = Math.max(1, Math.min(img.width - x, Math.ceil(j.w))), h = Math.max(1, Math.min(img.height - y, Math.ceil(j.h)));
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
          return c.toDataURL("image/png");
        });
      }, [data, list.map(({ x, y, w, h }) => ({ x, y, w, h }))]);
      outs.forEach((u, k) => { fs.writeFileSync(list[k].dst, Buffer.from(u.split(",")[1], "base64")); done.push(list[k].dst); });
    }
  } finally { await browser.close(); }
  return done;
}
