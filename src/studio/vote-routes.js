// Votação da plateia pela rede (enquete com `live: true`). O aluno abre o endereço do QR code no celular, escolhe
// uma opção, e o slide de quem apresenta busca a contagem.
//   GET  /voto/<sala>/<enquete>         a página do celular: só a pergunta e as opções daquela enquete
//   POST /voto/<sala>/<enquete>         { o: índice da opção, d: identificador do aparelho } registra ou troca o voto
//   GET  /voto/<sala>/resultado         a contagem de todas as enquetes da sala   (só com a chave: X-Voto-Chave)
//   POST /voto/<sala>/<enquete>/zerar   apaga os votos da enquete                 (só com a chave)
// A "sala" é um código por apresentação (dono + deck), diferente do código do link de compartilhamento: do endereço
// de voto não se chega ao deck nem às notas. A chave vai no HTML da apresentação, nunca no QR.
// Em disco (<biblioteca>/.votos.json): o hash do aparelho e o índice da opção. Sem nome, sem cookie, sem IP (o IP só
// conta na memória, para o limite de taxa). Os votos de uma enquete somem 12 horas depois do último.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { renameRetry } from "../fs-retry.js";
import { loadSpec } from "../build.js";
import { esc } from "../markup.js";
import { livePolls } from "../vote.js";

// o endereço da sala, relativo à página que mostra a apresentação (/preview, /ver/<código>, /publico/<código>): o
// Studio fica atrás de um proxy com prefixo (/sagadeck/…) que ele não conhece; relativo, o navegador resolve certo
export const voteURL = (pathname, code) => "../".repeat(Math.max(0, pathname.split("/").length - 2)) + "voto/" + code;
// o deck aberto como referência da sala: o id na biblioteca; no Studio local, fora da biblioteca, o caminho
export function voteDeckRef(W, multiuser) {
  if (!W?.file) return null;
  const id = W.library.idOf(W.file);
  if (id && !id.startsWith("..") && !path.isAbsolute(id)) return { id };
  return multiuser ? null : { file: path.resolve(W.file) };
}

export const VOTE_LIMITS = {
  body: 512,              // bytes do corpo do voto
  devices: 5000,          // aparelhos por enquete
  perIp: 120,             // pedidos por minuto por IP (uma turma atrás do mesmo roteador divide o IP)
  perRoom: 1200,          // pedidos por minuto por sala
  ttl: 12 * 60 * 60e3,    // os votos duram 12 h depois do último
};
const ROUTE = /^\/voto\/([a-z0-9]{6,24})\/([a-z0-9-]{1,48})(\/zerar)?\/?$/;
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // sem 0/o, 1/l/i: dá para ditar
const newCode = () => Array.from(crypto.randomBytes(10), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
const HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const shell = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;font:18px/1.4 system-ui,"Segoe UI",Roboto,sans-serif;background:#f4f5f7;color:#16191d;display:flex;justify-content:center}
main{width:100%;max-width:34em;padding:28px 18px 40px}h1{font-size:24px;line-height:1.25;margin:0 0 22px}
.op{display:flex;align-items:center;gap:14px;width:100%;margin:0 0 12px;padding:14px 16px;border:2px solid #cfd4dc;border-radius:14px;background:#fff;color:inherit;font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
.op:active{background:#eef1f5}.op[aria-pressed="true"]{border-color:#16191d;background:#16191d;color:#fff}.op:disabled{opacity:.6}
.k{flex:none;width:38px;height:38px;border-radius:50%;background:#e4e7ec;color:#16191d;display:grid;place-items:center;font-weight:700}
#st{min-height:1.5em;margin:18px 0 0;font-size:17px}#st.err{color:#b3261e}.pe{margin:26px 0 0;font-size:14px;color:#5b636e}
@media(prefers-color-scheme:dark){body{background:#121418;color:#eef0f3}.op{background:#1c2026;border-color:#3a414b}.op:active{background:#252a32}.op[aria-pressed="true"]{border-color:#eef0f3;background:#eef0f3;color:#121418}.k{background:#2c323b;color:#eef0f3}.pe{color:#9aa3af}#st.err{color:#ff8a80}}
</style></head><body><main>${body}</main></body></html>`;
const message = (title, text) => shell(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`);

// A página do celular. Um arquivo só, fonte do sistema, nada de fora. O identificador do aparelho é sorteado aqui e
// fica no localStorage: é o que impede o voto repetido sem pedir login.
function votePage(poll) {
  const data = JSON.stringify({ n: poll.options.length }).replace(/</g, "\\u003c");
  const buttons = poll.options.map((o, i) => `<button class="op" type="button" data-o="${i}" aria-pressed="false"><span class="k">${"ABCDEFGH"[i]}</span><span>${esc(o)}</span></button>`).join("");
  return shell(poll.question || "Enquete", `<h1>${esc(poll.question || "Escolha uma opção")}</h1>
<div id="ops">${buttons}</div><p id="st" role="status" aria-live="polite"></p>
<p class="pe">Seu voto é anônimo: não pedimos nome nem guardamos nada sobre você. Dá para trocar o voto tocando em outra opção.</p>
<script type="application/json" id="d">${data}</script>
<script>(function(){
var LET="ABCDEFGH",st=document.getElementById("st"),ops=[].slice.call(document.querySelectorAll(".op")),KEY="sagadeck-voto",PICK="sagadeck-voto:"+location.pathname;
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function set(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function newId(){var a=new Uint8Array(16);(window.crypto||window.msCrypto).getRandomValues(a);var s="";for(var i=0;i<a.length;i++)s+=("0"+a[i].toString(16)).slice(-2);return s}
var id=get(KEY);if(!/^[a-f0-9]{32}$/.test(id||"")){id=newId();set(KEY,id)}
function mark(o){ops.forEach(function(b,i){b.setAttribute("aria-pressed",i===o?"true":"false")})}
function say(t,err){st.textContent=t;st.className=err?"err":""}
var mine=get(PICK);if(mine!==null&&ops[+mine]){mark(+mine);say("Seu voto: "+LET[+mine]+". Para trocar, toque em outra opção.")}
ops.forEach(function(b,i){b.addEventListener("click",function(){
ops.forEach(function(x){x.disabled=true});say("Enviando…");
fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({o:i,d:id}),cache:"no-store",credentials:"omit"})
.then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,j:j}})})
.then(function(x){if(x.ok){mark(i);set(PICK,String(i));say("Voto registrado: "+LET[i]+". Para trocar, toque em outra opção.")}else say(x.j.error||"Não deu para registrar o voto. Tente de novo.",true)})
.catch(function(){say("Sem conexão. Confira a internet e tente de novo.",true)})
.then(function(){ops.forEach(function(x){x.disabled=false})})})});
})();</script>`);
}

function voteStore(libraryRoot) {
  const file = path.join(libraryRoot, ".votos.json");
  const read = () => { try { const j = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(j.salas) ? j.salas : []; } catch { return []; } };
  const write = (salas) => {
    fs.mkdirSync(libraryRoot, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ salas }));
    renameRetry(tmp, file);
  };
  return { file, read, write };
}

// limite de taxa por janela de um minuto, só na memória
function limiter(now) {
  const hits = new Map();
  return (key, max) => {
    const t = now(), h = hits.get(key);
    if (!h || t - h.t >= 60e3) {
      if (hits.size > 20000) for (const [k, v] of hits) if (t - v.t >= 60e3) hits.delete(k);
      hits.set(key, { t, n: 1 });
      return true;
    }
    return ++h.n <= max;
  };
}

/**
 * @param {{ libraryRoot: string, multiuser: boolean, libraryOf: (user: string) => { resolveId: Function, idOf: Function }, now?: () => number, limits?: Partial<typeof VOTE_LIMITS> }} o
 */
export function voteRoutes({ libraryRoot, multiuser, libraryOf, now = Date.now, limits = {} }) {
  const LIM = { ...VOTE_LIMITS, ...limits };
  const store = voteStore(libraryRoot);
  const rooms = store.read().filter((r) => r && typeof r.code === "string" && typeof r.key === "string");
  for (const r of rooms) if (!r.polls || typeof r.polls !== "object") r.polls = {};
  const allow = limiter(now);
  const seen = new Map();   // sala -> enquetes do deck como foi servido por último (vale antes de o arquivo ser salvo)
  const parsed = new Map(); // sala -> { stamp, polls } lidas do arquivo

  // gravação agrupada: no máximo uma por segundo, por mais votos que cheguem
  let timer = null, changed = false;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!changed) return;
    changed = false;
    try { store.write(rooms); } catch (e) { console.warn("[Studio] não deu para gravar os votos:", e.message); }
  };
  const dirty = () => { changed = true; if (!timer) { timer = setTimeout(flush, 1000); timer.unref?.(); } };
  const save = () => { changed = true; flush(); };

  const fileOf = (r) => {
    if (r.file) return r.file;
    try { return libraryOf(r.owner).resolveId(r.id); } catch { return null; }
  };
  function pollsOf(room) {
    const file = fileOf(room);
    let fromFile = null;
    try {
      const st = fs.statSync(file), stamp = `${file}|${st.mtimeMs}|${st.size}`, hit = parsed.get(room.code);
      if (hit?.stamp === stamp) fromFile = hit.polls;
      else { fromFile = livePolls(loadSpec(file)); parsed.set(room.code, { stamp, polls: fromFile }); }
    } catch { /* deck apagado, movido ou com erro: vale o que foi servido por último, se houver */ }
    return { get: (k) => fromFile?.get(k) || seen.get(room.code)?.get(k) || null };
  }
  // os votos de uma enquete somem 12 h depois do último
  function expire(room) {
    for (const [k, p] of Object.entries(room.polls)) if (now() - (p.at || 0) > LIM.ttl) { delete room.polls[k]; dirty(); }
  }
  const counts = (p, n) => { const v = Array(n).fill(0); for (const o of Object.values(p.votos)) if (o < n) v[o]++; return v; };

  // A sala da apresentação (cria na primeira vez). `spec` é o deck como vai ser servido agora.
  //   ref: { id } (id do deck na biblioteca do dono) ou { file } (Studio local, deck fora da biblioteca)
  function roomFor(owner, ref, spec) {
    if (!ref || (!ref.id && !ref.file)) return null;
    const polls = livePolls(spec);
    if (!polls.size) return null;
    let room = rooms.find((r) => r.owner === owner && (ref.id ? r.id === ref.id : r.file === ref.file));
    if (!room) {
      room = { code: newCode(), key: crypto.randomBytes(18).toString("base64url"), owner, ...(ref.id ? { id: ref.id } : { file: ref.file }), created: new Date(now()).toISOString(), polls: {} };
      rooms.push(room);
      save();
    }
    seen.set(room.code, polls);
    return { code: room.code, key: room.key };
  }

  const sameKey = (room, given) => {
    const a = Buffer.from(String(given || "")), b = Buffer.from(room.key);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  function readSmall(req) {
    return new Promise((resolve) => {
      let size = 0, done = false;
      const chunks = [];
      const end = (v) => { if (!done) { done = true; resolve(v); } };
      req.on("data", (c) => { size += c.length; if (size > LIM.body) { end(null); req.resume(); } else if (!done) chunks.push(c); });
      req.on("end", () => end(Buffer.concat(chunks).toString("utf8")));
      req.on("error", () => end(null));
    });
  }

  // antes da conferência de usuário: quem vota não tem usuário
  //   user: o usuário do portal, se o pedido chegou com um (multiusuário); foreign: Origin de outro site; ip: de quem pede
  async function serve(req, res, pathname, { user = "", foreign = false, ip = "" } = {}) {
    if (pathname !== "/voto" && !pathname.startsWith("/voto/")) return false;
    const json = (status, body, extra = {}) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...HEADERS, ...extra }); res.end(req.method === "HEAD" ? undefined : JSON.stringify(body)); };
    const html = (status, body, extra = {}) => { res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PAGE_CSP, ...HEADERS, ...extra }); res.end(req.method === "HEAD" ? undefined : body); };
    const read = req.method === "GET" || req.method === "HEAD";
    const gone = () => (read ? html(404, message("Enquete indisponível", "Este endereço de votação não existe ou a enquete saiu da apresentação.")) : json(404, { error: "Enquete indisponível." }));
    const slow = () => (read ? html(429, message("Um momento", "Muitos pedidos ao mesmo tempo. Espere um pouco e tente de novo."), { "Retry-After": "30" }) : json(429, { error: "Muitos pedidos ao mesmo tempo. Espere um pouco e tente de novo." }, { "Retry-After": "30" }));
    if (!read && req.method !== "POST") return json(405, { error: "Método não aceito." }, { Allow: "GET, HEAD, POST" }), true;
    if (!read && foreign) return json(403, { error: "Pedido vindo de outra página: bloqueado." }), true;

    const result = /^\/voto\/([a-z0-9]{6,24})\/resultado\/?$/.exec(pathname);
    const m = result ? null : ROUTE.exec(pathname);
    if (!result && !m) return gone(), true;
    const room = rooms.find((r) => r.code === (result || m)[1]);
    const keyed = !!room && sameKey(room, req.headers["x-voto-chave"]);
    // quem apresenta (com a chave) consulta de dois em dois segundos e não entra no limite
    if (!keyed && ((ip && !allow(`ip:${ip}`, LIM.perIp)) || !allow(`sala:${(result || m)[1]}`, LIM.perRoom))) return slow(), true;
    if (!room) return gone(), true;
    expire(room);
    const polls = pollsOf(room);

    if (result) {
      if (!read) return json(405, { error: "Método não aceito." }, { Allow: "GET, HEAD" }), true;
      if (!keyed) return json(403, { error: "Só quem apresenta vê a contagem." }), true;
      // multiusuário e o pedido chegou com usuário: o proxy não tem a entrada pública de /voto/, a plateia não entra
      if (multiuser && user) return json(200, { publico: false }), true;
      const out = {};
      for (const [k, p] of Object.entries(room.polls)) {
        const poll = polls.get(k);
        if (poll) out[k] = { rodada: p.rodada, votos: counts(p, poll.options.length) };
      }
      return json(200, { publico: true, polls: out }), true;
    }

    const [, , key, reset] = m;
    const poll = polls.get(key);
    if (!poll) return gone(), true;
    if (reset) {
      if (read) return gone(), true;
      if (!keyed) return json(403, { error: "Só quem apresenta zera os votos." }), true;
      if (room.polls[key]) { delete room.polls[key]; save(); }
      return json(200, { ok: true }), true;
    }
    if (read) return html(200, votePage(poll)), true;

    const text = await readSmall(req);
    if (text == null) return json(413, { error: "Pedido grande demais." }, { Connection: "close" }), true;
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    const o = body?.o, d = body?.d;
    if (!body || typeof body !== "object" || !Number.isInteger(o) || o < 0 || o >= poll.options.length || typeof d !== "string" || !DEVICE.test(d)) return json(400, { error: "Voto inválido." }), true;
    const p = room.polls[key] ||= { rodada: crypto.randomBytes(6).toString("base64url"), at: now(), votos: {} };
    const device = crypto.createHash("sha256").update(`${room.code}|${key}|${d}`).digest("base64url").slice(0, 22);
    if (!(device in p.votos) && Object.keys(p.votos).length >= LIM.devices) return json(429, { error: "Esta enquete chegou ao limite de votos." }), true;
    p.votos[device] = o;
    p.at = now();
    dirty();
    return json(200, { ok: true, o }), true;
  }

  return { roomFor, serve, flush, file: store.file };
}
