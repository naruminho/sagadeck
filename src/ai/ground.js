// Foco guiado (spotlight) com as caixas no lugar certo: a IA que escreve o slide não vê a figura e chutava as
// coordenadas dos destaques (o "exutório" caía no meio da legenda). Aqui a visão olha a figura e localiza cada
// destaque pelo título e texto dele; as caixas são em % da imagem (o runtime alinha a camada dos destaques à área
// real da imagem desenhada). Destaque que a visão não acha fica como estava.
import fs from "node:fs";
import path from "node:path";
import { chat } from "./llm.js";

const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v) * 10) / 10)) : null);

export async function locateRegions(file, items, { model, ask } = {}) {
  const { imagesAsDataUrls } = await import("../import/crop.js");
  const [url] = await imagesAsDataUrls([file], { width: 1400 });
  if (!url) return [];
  const prompt = `Na figura, localize cada item abaixo e dê a caixa que o envolve, em PORCENTAGEM da largura e da altura da figura inteira (0 a 100): x e y do canto superior esquerdo, width e height. A caixa tem de cobrir o elemento certo, justa (um ponto da figura: uma caixa pequena em volta dele). Se o item não aparece na figura, "achou": false.
${items.map((t, i) => `${i + 1}. ${t}`).join("\n")}
Responda só JSON: {"itens": [{"i": 1, "achou": true, "x": 0, "y": 0, "width": 0, "height": 0}]}`;
  const content = [{ type: "text", text: prompt }, { type: "image_url", image_url: { url } }];
  const text = ask ? await ask(content) : (await chat([{ role: "user", content }], { model: model || "vision", maxTokens: 8000, temperature: 0 })).text;
  const m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/), raw = m ? m[1] : String(text).slice(String(text).indexOf("{"), String(text).lastIndexOf("}") + 1);
  const got = JSON.parse(raw).itens || [];
  return items.map((_, i) => {
    const g = got.find((x) => Number(x.i) === i + 1);
    if (!g || g.achou === false) return null;
    const box = { x: num(g.x), y: num(g.y), width: num(g.width), height: num(g.height) };
    return Object.values(box).some((v) => v == null) || box.width < 0.5 || box.height < 0.5 ? null : box;
  });
}

// cada spotlight com imagem: as caixas dos destaques vêm da visão. Devolve quantos destaques foram posicionados.
export async function groundSpotlights(slides, { baseDir, model, ask, onProgress } = {}) {
  let placed = 0;
  for (const s of slides || []) {
    if (!s || s.layout !== "spotlight" || !Array.isArray(s.hotspots) || !s.hotspots.length) continue;
    const img = (s.figure && typeof s.figure === "object" ? s.figure.image : null) || s.image;
    if (typeof img !== "string" || /^(https?:|data:)/.test(img)) continue;
    const file = path.resolve(baseDir || ".", img);
    if (!fs.existsSync(file)) continue;
    onProgress?.(`Localizando os destaques na figura de "${String(s.title || "").replace(/[=*]/g, "").slice(0, 50)}"…`);
    try {
      const boxes = await locateRegions(file, s.hotspots.map((h) => [h.title, h.text].filter(Boolean).join(": ")), { model, ask });
      boxes.forEach((b, i) => { if (b) { Object.assign(s.hotspots[i], b); delete s.hotspots[i].kind; placed++; } });
    } catch { /* a visão falhou: os destaques ficam como a IA escreveu */ }
  }
  return placed;
}
