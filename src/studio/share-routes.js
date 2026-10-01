// Link para ver uma apresentação, só leitura (Arquivo › Compartilhar link). Quem abre vê a apresentação pronta
// (passa os slides), sem o editor, sem a biblioteca de quem compartilhou e sem as notas do apresentador (a não ser que
// o link seja "com as notas"). Cada link é um código aleatório de 144 bits (ninguém adivinha), guardado em
// <biblioteca>/.compartilhados.json, e pode ser revogado.
//   /ver/<código>      no servidor (multiusuário), só quem entrou no portal (o nginx exige a sessão e manda o usuário)
//   /publico/<código>  qualquer pessoa com o link (só se o link foi criado assim; o nginx deixa passar sem sessão)
// No Studio local os dois abrem para quem alcança o Studio (esta máquina ou a rede, com --host).
// Buscador não acha: o endereço não está em lugar nenhum, a página diz noindex/nofollow e não manda o Referer.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildHTML, loadSpec } from "../build.js";
import { esc } from "../markup.js";

const VIEW = /^\/(ver|publico)\/([A-Za-z0-9_-]{16,64})\/?$/;

export function shareStore(libraryRoot) {
  const file = path.join(libraryRoot, ".compartilhados.json");
  const read = () => { try { const j = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(j.links) ? j.links : []; } catch { return []; } };
  const write = (links) => {
    fs.mkdirSync(libraryRoot, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ links }, null, 1));
    fs.renameSync(tmp, file);
  };
  return { file, read, write };
}

const page = (status, title, text) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>body{font:18px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7f9;color:#1f2328}main{max-width:32em;padding:24px;text-align:center}h1{font-size:22px}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(text)}</p></main></body></html>`;
const NOINDEX = { "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" };

/**
 * @param {{ libraryRoot: string, multiuser: boolean, libraryOf: (user: string) => { resolveId: Function, idOf: Function } }} o
 */
export function shareRoutes({ libraryRoot, multiuser, libraryOf }) {
  const store = shareStore(libraryRoot);
  const ownerOf = (W) => (multiuser ? String(W.user || "") : "");
  const deckRef = (W) => {
    if (!W.file) return null;
    const id = W.library.idOf(W.file);
    if (id && !id.startsWith("..") && !path.isAbsolute(id)) return { id };
    return multiuser ? null : { file: path.resolve(W.file) }; // local: deck fora da biblioteca vale pelo caminho
  };
  const sameDeck = (l, ref) => (ref.id ? l.id === ref.id : l.file === ref.file);
  const fileOf = (l) => {
    if (l.file) return l.file;
    try { return libraryOf(l.owner).resolveId(l.id); } catch { return null; }
  };
  const pathOf = (l) => `${l.publico ? "publico" : "ver"}/${l.token}`;
  const view = (l) => ({ token: l.token, path: pathOf(l), publico: !!l.publico, notas: !!l.notas, created: l.created });

  // a página do link: antes da conferência de usuário (o link público não tem usuário)
  function serveView(req, res, pathname, user) {
    const m = pathname.match(VIEW);
    if (!m || !["GET", "HEAD"].includes(req.method)) return false;
    const [, kind, token] = m;
    const l = store.read().find((x) => x.token === token);
    const send = (status, html, extra = {}) => { res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...NOINDEX, ...extra }); res.end(req.method === "HEAD" ? undefined : html); };
    if (!l || (kind === "publico" && !l.publico)) return send(404, page(404, "Link indisponível", "Este link não existe ou foi revogado por quem compartilhou.")), true;
    if (multiuser && kind === "ver" && !user) return send(401, page(401, "Entre pelo portal", "Este link é só para quem tem acesso ao portal.")), true;
    const file = fileOf(l);
    if (!file || !fs.existsSync(file)) return send(404, page(404, "Apresentação indisponível", "A apresentação foi apagada ou mudou de lugar.")), true;
    let spec;
    try { spec = loadSpec(file); } catch { return send(500, page(500, "Não deu para abrir", "A apresentação tem um erro e não pôde ser mostrada.")), true; }
    if (!l.notas) spec.slides = spec.slides.map((s) => { if (!s || typeof s !== "object") return s; const { notes, ...rest } = s; return rest; });
    const html = buildHTML(spec).html.replace(/<head>/i, '<head><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">');
    send(200, html);
    return true;
  }

  // a API do Studio (a pessoa que compartilha): listar, criar e revogar os links da apresentação aberta
  async function api({ req, res, pathname, W, readJSON }) {
    if (!pathname.startsWith("/api/share")) return false;
    const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
    const owner = ownerOf(W), ref = deckRef(W);
    const mine = (links) => links.filter((l) => l.owner === owner && ref && sameDeck(l, ref)).map(view);
    if (pathname === "/api/share" && req.method === "GET") return json(200, { multiuser, links: ref ? mine(store.read()) : [], saved: !!ref }), true;
    if (pathname === "/api/share" && req.method === "POST") {
      if (!ref) return json(400, { error: "Salve a apresentação na biblioteca antes de compartilhar." }), true;
      const body = await readJSON(req);
      const link = { token: crypto.randomBytes(18).toString("base64url"), owner, ...ref, publico: multiuser && !!body.publico, notas: !!body.notas, created: new Date().toISOString() };
      const links = store.read();
      links.push(link);
      store.write(links);
      return json(200, { multiuser, link: view(link), links: mine(links) }), true;
    }
    if (pathname === "/api/share/revoke" && req.method === "POST") {
      const { token } = await readJSON(req);
      const links = store.read();
      const l = links.find((x) => x.token === token);
      if (!l || l.owner !== owner) return json(404, { error: "Link não encontrado." }), true; // o de outra pessoa nem existe para você
      store.write(links.filter((x) => x !== l));
      return json(200, { multiuser, links: mine(links.filter((x) => x !== l)) }), true;
    }
    return false;
  }

  return { serveView, api };
}
