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
          let x = Math.max(0, Math.floor(j.x)), y = Math.max(0, Math.floor(j.y));
          let w = Math.max(1, Math.min(img.width - x, Math.ceil(j.w))), h = Math.max(1, Math.min(img.height - y, Math.ceil(j.h)));
          let c = document.createElement("canvas"); c.width = w; c.height = h;
          let g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, x, y, w, h, 0, 0, w, h);
          // densidade de tinta (fração de pixels não-papel): recorte quase em branco = caixa errada (medida antes de aparar)
          let ink = 0;
          try {
            const d = g.getImageData(0, 0, w, h).data;
            for (let i = 0; i < d.length; i += 16) { if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 235) ink++; }
            ink /= d.length / 16;
          } catch { ink = 1; }
          // trim: apara a margem de papel em volta (linha/coluna inteira branca), com um respiro de 6 px.
          // Só papel puro sai: céu claro numa foto ou fundo cinza de gráfico não é branco puro em toda a linha.
          if (j.trim && w > 24 && h > 24) {
            const d = g.getImageData(0, 0, w, h).data;
            const paper = (i) => d[i] >= 246 && d[i + 1] >= 246 && d[i + 2] >= 246;
            const rowBlank = (r) => { for (let q = 0; q < w; q++) if (!paper((r * w + q) * 4)) return false; return true; };
            const colBlank = (q, t0, t1) => { for (let r = t0; r <= t1; r++) if (!paper((r * w + q) * 4)) return false; return true; };
            let t = 0, b = h - 1, l = 0, r = w - 1;
            while (t < b && rowBlank(t)) t++;
            while (b > t && rowBlank(b)) b--;
            while (l < r && colBlank(l, t, b)) l++;
            while (r > l && colBlank(r, t, b)) r--;
            const pad = 6, nl = Math.max(0, l - pad), nt = Math.max(0, t - pad), nw = Math.min(w, r + pad + 1) - nl, nh = Math.min(h, b + pad + 1) - nt;
            if (r > l && b > t && (nw < w || nh < h)) {
              const c2 = document.createElement("canvas"); c2.width = nw; c2.height = nh;
              const g2 = c2.getContext("2d", { willReadFrequently: true }); g2.drawImage(c, nl, nt, nw, nh, 0, 0, nw, nh);
              c = c2; g = g2; w = nw; h = nh;
            }
          }
          return { png: c.toDataURL("image/png"), ink, size: { w, h } };
        });
      }, [data, list.map(({ x, y, w, h, trim }) => ({ x, y, w, h, trim }))]);
      outs.forEach((u, k) => { fs.writeFileSync(list[k].dst, Buffer.from(u.png.split(",")[1], "base64")); list[k].ink = u.ink; list[k].size = u.size; done.push(list[k].dst); });
    }
  } finally { await browser.close(); }
  return done;
}
