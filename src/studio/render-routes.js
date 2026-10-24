// O slide desenhado para o editor (/api/render-slide), as miniaturas em lote (/api/render-slides) e os arquivos do
// deck que elas mostram (/api/deck-asset). Pela internet (servidor, portal), navegar nos slides ficava lento:
// - o CSS base (~160 kB) e o dos temas, iguais em todo clique, desciam de novo a cada troca de slide. Agora o editor
//   diz a versão que já tem (baseHash/themeHash) e só recebe o que mudou;
// - cada miniatura era um pedido, com o deck inteiro;
// - as fotos e os vídeos iam embutidos no HTML (base64): um slide com foto passava de 5 MB, em cada clique e em cada
//   miniatura. Agora vão por endereço, com a data do arquivo no endereço: o navegador baixa uma vez e guarda.
// A pasta das imagens é a que o servidor conhece (a do deck aberto), nunca a que vem no pedido: no multiusuário, um
// `_dir` mandado pelo navegador lia arquivos da biblioteca de outra pessoa.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
const ASSET_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg" };

// pastas de onde o editor pode mostrar arquivos: a biblioteca da pessoa, a pasta do deck aberto e as do sagadeck
function assetRoots(W, extra) {
  return [W.library?.root, W.spec?._dir, W.file && path.dirname(W.file), ...extra].filter(Boolean).map((d) => path.resolve(d));
}
const inside = (f, dir) => f === dir || f.startsWith(dir + path.sep);

// endereço de um arquivo do deck (o caminho por último: o player reconhece o vídeo pela terminação)
export function assetURL(file) {
  const st = fs.statSync(file, { throwIfNoEntry: false });
  return `api/deck-asset?v=${st ? Math.round(st.mtimeMs).toString(36) + st.size.toString(36) : 0}&p=${encodeURIComponent(path.resolve(file))}`;
}

// o deck como o servidor conhece: a pasta das imagens é a do deck aberto, e os arquivos vão por endereço
function serverDeck(spec, W) {
  const deck = { ...(spec || W.spec) };
  if (W.spec) deck._dir = W.spec._dir; else delete deck._dir;
  deck._assetURL = assetURL;
  return deck;
}

export async function renderRoutes({ req, res, pathname, url, W, readJSON, roots = [] }) {
  const json = (obj) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); return true; };
  if (pathname === "/api/render-slide" && req.method === "POST") {
    const { slide, index, spec, baseHash, themeHash } = await readJSON(req);
    return json(withoutKnownCSS(renderSlide(slide, index ?? 0, serverDeck(spec, W)), { baseHash, themeHash }));
  }
  if (pathname === "/api/render-slides" && req.method === "POST") {
    const { indices, spec, baseHash, themeHash } = await readJSON(req);
    const deck = serverDeck(spec, W);
    const slides = [];
    let first = null;
    for (const i of [].concat(indices || []).slice(0, MAX_BATCH)) {
      const s = deck.slides?.[i];
      if (!s) continue;
      try { const r = renderSlide(s, i, deck); first ||= r; slides.push({ index: i, html: r.html }); } catch (e) { slides.push({ index: i, error: e.message }); }
    }
    const css = first ? withoutKnownCSS(first, { baseHash, themeHash }) : {};
    return json({ baseHash: css.baseHash, themeHash: css.themeHash, baseCSS: css.baseCSS, themeCSS: css.themeCSS, slides });
  }
  if (pathname === "/api/deck-asset" && (req.method === "GET" || req.method === "HEAD")) {
    const file = path.resolve(String(url.searchParams.get("p") || ""));
    const type = ASSET_TYPES[path.extname(file).slice(1).toLowerCase()];
    const st = type && assetRoots(W, roots).some((d) => inside(file, d)) ? fs.statSync(file, { throwIfNoEntry: false }) : null;
    if (!st?.isFile()) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Arquivo não encontrado." })); return true; }
    // a data e o tamanho estão no endereço (v=): mudou o arquivo, muda o endereço; o mesmo endereço nunca muda
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Cache-Control": "private, max-age=31536000, immutable" });
    if (req.method === "HEAD") res.end(); else fs.createReadStream(file).pipe(res);
    return true;
  }
  return false;
}
