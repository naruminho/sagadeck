// Rotas das direções aprovadas (~/.sagadeck/direcoes.json; ver src/ai/directions.js).
// GET lista; POST {name} fotografa a capa atual como receita reutilizável. Só no Studio local.
import { loadDirections, saveDirection } from "../ai/directions.js";

export async function directionRoutes({ req, res, pathname, W, readJSON, apiBlocked }) {
  const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (pathname === "/api/directions" && req.method === "GET") {
    const d = loadDirections();
    send(200, { file: d.file, exists: d.exists, error: d.error, directions: Object.values(d.directions) });
    return true;
  }
  if (pathname === "/api/directions" && req.method === "POST") {
    const blocked = apiBlocked(req);
    if (blocked) { send(blocked.code, { error: "Salvar direções só no Studio desta máquina." }); return true; }
    if (!W?.spec) { send(400, { error: "Abra uma apresentação primeiro." }); return true; }
    const body = await readJSON(req);
    const cover = (W.spec.slides || []).find((s) => s && s.layout === "cover") || (W.spec.slides || [])[0] || {};
    try {
      const name = saveDirection(body.name, {
        theme: W.spec.theme || null, palette: W.spec.palette || null,
        tone: cover.tone || null, ambient: cover.ambient || null, transition: cover.transition || null,
        notes: `capa "${String(cover.title || "").slice(0, 80)}"`,
      });
      send(200, { name });
    } catch (e) { send(400, { error: e.message }); }
    return true;
  }
  return false;
}
