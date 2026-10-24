// O slide desenhado para o editor (/api/render-slide) e as miniaturas em lote (/api/render-slides).
// O CSS base (~160 kB) e o dos temas são iguais em todo clique: o editor diz a versão que já tem (baseHash/themeHash) e
// só recebe de novo o que mudou. Antes, cada troca de slide baixava ~170 kB e cada miniatura subia o deck inteiro num
// pedido próprio: pela internet (servidor, portal), navegar nos slides ficava lento.
import crypto from "node:crypto";
import { renderSlide } from "../build.js";

const hashes = new Map(); // texto do CSS -> hash (o CSS base é o mesmo enquanto o processo vive)
function hashOf(css) {
  let h = hashes.get(css);
  if (!h) {
    h = crypto.createHash("sha1").update(css).digest("hex").slice(0, 16);
    if (hashes.size > 50) hashes.clear();
    hashes.set(css, h);
  }
  return h;
}

// a resposta sem o CSS que o editor já tem; sempre com os hashes, para ele pedir sem o CSS da próxima vez
export function withoutKnownCSS(rendered, { baseHash, themeHash } = {}) {
  const { baseCSS = "", themeCSS = "", ...rest } = rendered;
  const bh = hashOf(baseCSS), th = hashOf(themeCSS);
  return { ...rest, baseHash: bh, themeHash: th, ...(baseHash === bh ? {} : { baseCSS }), ...(themeHash === th ? {} : { themeCSS }) };
}

export const MAX_BATCH = 24;

export async function renderRoutes({ req, res, pathname, W, readJSON }) {
  const json = (obj) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); return true; };
  if (pathname === "/api/render-slide" && req.method === "POST") {
    const { slide, index, spec, baseHash, themeHash } = await readJSON(req);
    return json(withoutKnownCSS(renderSlide(slide, index ?? 0, spec || W.spec), { baseHash, themeHash }));
  }
  if (pathname === "/api/render-slides" && req.method === "POST") {
    const { indices, spec, baseHash, themeHash } = await readJSON(req);
    const deck = spec || W.spec;
    const slides = [];
    let first = null;
    for (const i of [].concat(indices || []).slice(0, MAX_BATCH)) {
      const s = deck?.slides?.[i];
      if (!s) continue;
      try { const r = renderSlide(s, i, deck); first ||= r; slides.push({ index: i, html: r.html }); } catch (e) { slides.push({ index: i, error: e.message }); }
    }
    const css = first ? withoutKnownCSS(first, { baseHash, themeHash }) : {};
    return json({ baseHash: css.baseHash, themeHash: css.themeHash, baseCSS: css.baseCSS, themeCSS: css.themeCSS, slides });
  }
  return false;
}
