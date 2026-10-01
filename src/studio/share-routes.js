// Link para ver uma apresentação, só leitura (Arquivo › Compartilhar link). Quem abre vê a apresentação pronta
// (passa os slides), sem o editor, sem a biblioteca de quem compartilhou e sem as notas do apresentador (a não ser que
// o link seja "com as notas"). Cada link é um código aleatório de 144 bits (ninguém adivinha), guardado em
// <biblioteca>/.compartilhados.json, e pode ser revogado.
//   /ver/<código>      no servidor (multiusuário), só quem entrou no portal (o nginx exige a sessão e manda o usuário)
//   /publico/<código>  qualquer pessoa com o link (só se o link foi criado assim; o nginx deixa passar sem sessão)
// No Studio local os dois abrem para quem alcança o Studio (esta máquina ou a rede, com --host).
// Buscador não acha: o endereço não está em lugar nenhum, a página diz noindex/nofollow e não manda o Referer.
// Quem abre também baixa (botão Baixar na página): PDF, PowerPoint, HTML para apresentar sem internet, material de
// estudo (PDF e HTML) e o .sagadeck (para abrir no sagadeck dela), em <link>/baixar/<formato>, com as mesmas regras
// do link. Sem as notas, nenhum arquivo as leva; o roteiro (que é feito delas) só existe no link "com as notas".
// Um arquivo por vez por link (gerar PDF/PPTX usa o Chrome do servidor).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildHTML, loadSpec } from "../build.js";
import { esc } from "../markup.js";
import { iconSVG } from "../figures/icons.js";
import { sendExport } from "./exporting.js";

const VIEW = /^\/(ver|publico)\/([A-Za-z0-9_-]{16,64})(?:\/baixar\/([a-z-]+))?\/?$/;
// formatos para quem recebe o link (o roteiro e o "tudo" levam as notas: só no link com as notas)
const DOWNLOADS = [
  { kind: "pdf", label: "PDF", hint: "Um slide por página, tudo revelado" },
  { kind: "pptx", label: "PowerPoint (.pptx)", hint: "Editável no PowerPoint, com as animações dos cliques" },
  { kind: "html", label: "Para apresentar sem internet (HTML)", hint: "Um arquivo só, abre em qualquer navegador" },
  { kind: "estudo", label: "Material de estudo (PDF)", hint: "Cada slide inteiro e o texto de consulta" },
  { kind: "estudo-html", label: "Material de estudo (HTML)", hint: "O mesmo material num arquivo HTML, bom no celular" },
  { kind: "sagadeck", label: "Para abrir no sagadeck (.sagadeck)", hint: "A apresentação inteira, para importar e editar a sua cópia" },
  { kind: "roteiro", label: "Roteiro do apresentador (PDF)", hint: "Miniatura de cada slide com as notas", notas: true },
  { kind: "tudo", label: "Tudo (PowerPoint, PDF e roteiro)", hint: "Um .zip com o que se leva para apresentar", notas: true },
];
// botão Baixar na página do link (canto de cima, discreto; os cliques nele não passam o slide)
const downloadBar = (l) => {
  const items = DOWNLOADS.filter((d) => !d.notas || l.notas);
  return `<style>.sd-dl{position:fixed;top:14px;right:14px;z-index:2147483000;font:14px system-ui,sans-serif}.sd-dl>button{display:flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid rgba(0,0,0,.15);border-radius:8px;background:rgba(255,255,255,.92);color:#1f2328;cursor:pointer;opacity:.55;transition:opacity .2s}.sd-dl>button:hover,.sd-dl.open>button{opacity:1}.sd-dl ul{display:none;list-style:none;margin:6px 0 0;padding:6px;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);min-width:260px}.sd-dl.open ul{display:block}.sd-dl a{display:block;padding:8px 10px;border-radius:6px;color:#1f2328;text-decoration:none}.sd-dl a:hover{background:#eef2f7}.sd-dl a.busy{opacity:.5;pointer-events:none}@media print{.sd-dl{display:none}}</style>
<div class="sd-dl" id="sd-dl"><button type="button" aria-haspopup="menu" title="Baixar esta apresentação">${iconSVG("download", { size: 16, stroke: 2 })}Baixar</button><ul role="menu">${items.map((d) => `<li><a role="menuitem" data-kind="${d.kind}" href="#" title="${esc(d.hint)}">${esc(d.label)}</a></li>`).join("")}</ul></div>
<script>(function(){var b=document.getElementById("sd-dl");["click","keydown","pointerdown","mousedown","touchstart","wheel"].forEach(function(t){b.addEventListener(t,function(e){e.stopPropagation()})});
b.querySelector("button").onclick=function(){b.classList.toggle("open")};document.addEventListener("click",function(){b.classList.remove("open")});
b.querySelectorAll("a").forEach(function(a){a.onclick=function(e){e.preventDefault();var base=location.pathname;while(base.slice(-1)==="/")base=base.slice(0,-1);a.classList.add("busy");setTimeout(function(){a.classList.remove("busy")},4000);location.href=base+"/baixar/"+a.dataset.kind;b.classList.remove("open")}})})();</script>`;
};

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
    const [, kind, token, download] = m;
    const l = store.read().find((x) => x.token === token);
    const send = (status, html, extra = {}) => { res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...NOINDEX, ...extra }); res.end(req.method === "HEAD" ? undefined : html); };
    if (!l || (kind === "publico" && !l.publico)) return send(404, page(404, "Link indisponível", "Este link não existe ou foi revogado por quem compartilhou.")), true;
    if (multiuser && kind === "ver" && !user) return send(401, page(401, "Entre pelo portal", "Este link é só para quem tem acesso ao portal.")), true;
    const file = fileOf(l);
    if (!file || !fs.existsSync(file)) return send(404, page(404, "Apresentação indisponível", "A apresentação foi apagada ou mudou de lugar.")), true;
    let spec;
    try { spec = loadSpec(file); } catch { return send(500, page(500, "Não deu para abrir", "A apresentação tem um erro e não pôde ser mostrada.")), true; }
    if (!l.notas) spec.slides = spec.slides.map((s) => { if (!s || typeof s !== "object") return s; const { notes, ...rest } = s; return rest; });
    if (download) return sendDownload(req, res, l, spec, file, download), true;
    const html = buildHTML(spec).html.replace(/<head>/i, '<head><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">');
    send(200, req.method === "HEAD" ? html : html.replace(/<\/body>/i, `${downloadBar(l)}</body>`));
    return true;
  }

  const busy = new Set(); // um arquivo por vez por link
  async function sendDownload(req, res, l, spec, file, kind) {
    const fmt = DOWNLOADS.find((d) => d.kind === kind && (!d.notas || l.notas));
    if (!fmt) { res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", ...NOINDEX }); res.end(page(404, "Formato indisponível", "Este formato não está disponível neste link.")); return; }
    if (busy.has(l.token)) { res.writeHead(429, { "Content-Type": "text/html; charset=utf-8", "Retry-After": "20", ...NOINDEX }); res.end(page(429, "Um momento", "Ainda estou gerando o arquivo anterior deste link. Tente de novo em alguns segundos.")); return; }
    const name = path.basename(file).replace(/\.ya?ml$/i, "");
    busy.add(l.token);
    try {
      if (kind === "html") {
        const html = buildHTML(spec).html.replace(/<head>/i, '<head><meta name="robots" content="noindex,nofollow">');
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="apresentacao.html"; filename*=UTF-8''${encodeURIComponent(name + ".html")}`, ...NOINDEX });
        res.end(html);
        return;
      }
      for (const [k, v] of Object.entries(NOINDEX)) res.setHeader(k, v);
      await sendExport(res, kind, spec, name, { notes: !!l.notas });
    } finally { busy.delete(l.token); }
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
