import crypto from "node:crypto";
import { copySlideAssets } from "./slide-copy.js";
export async function slideCopyRoutes({pathname,req,res,W,readJSON,staleTab,slideClipboard,isBundledTemplate,materializePreview}) {
      if (pathname === "/api/slides/clipboard" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ token: slideClipboard.get(W.user || '')?.token || null })); return true;
      }
      if (pathname === "/api/slides/copy" && req.method === "POST") {
        const body = await readJSON(req);
        if (staleTab(body, W, res)) return true;
        if (!W.file || !body.slide) throw Error('Abra uma apresentação salva para copiar.');
        const token = crypto.randomUUID();
        slideClipboard.set(W.user || '', { token, file: W.file, slide: structuredClone(body.slide) });
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ token })); return true;
      }
      if (pathname === "/api/slides/paste" && req.method === "POST") {
        const body = await readJSON(req);
        if (staleTab(body, W, res)) return true;
        const clip = slideClipboard.get(W.user || '');
        if (!clip || clip.token !== body.token) throw Error('Copie um slide novamente antes de colar.');
        if (!W.file || isBundledTemplate(W.file)) materializePreview(W);
        const slide = await copySlideAssets(clip.slide, clip.file, W.file);
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ slide })); return true;
      }
 return false;
}
