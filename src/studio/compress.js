// Respostas leves pela rede. No servidor, pelo portal, nada saía comprimido (o nginx só comprime o que ele mesmo gera)
// e nada ficava no cache do navegador: cada troca de slide baixava ~170 kB, e cada abertura do editor ~1,3 MB de
// novo (só o katex.css, com as fontes da matemática embutidas, tem 924 kB). Aqui, valendo em qualquer lugar (servidor,
// rede do banco, máquina da pessoa) sem depender do proxy:
// - gzip para texto (HTML, CSS, JS, JSON, SVG, XML) a partir de 1 kB, quando o navegador aceita; nunca o que chega aos
//   poucos (respostas ao vivo da IA em x-ndjson, eventos em event-stream), que o gzip seguraria até juntar um bloco;
// - ETag nos arquivos da página (fora de /api/) entregues de uma vez: na visita seguinte o navegador pergunta se mudou
//   e recebe 304, sem corpo. Sem prazo de cache próprio, vai "no-cache" (sempre pergunta): versão nova do sagadeck
//   chega na hora, sem código velho preso no navegador.
import crypto from "node:crypto";
import zlib from "node:zlib";

const COMPRESSIBLE = /^(text\/(html|css|plain|javascript|xml)|application\/(json|javascript|xml)|image\/svg\+xml)\b/i;
const STREAMING = /event-stream|ndjson/i;
export const MIN_BYTES = 1024;

export function installCompression(req, res, { min = MIN_BYTES } = {}) {
  if (req.method === "HEAD") return;
  const gzipOk = /\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""));
  const conditional = req.method === "GET" && !String(req.url || "").startsWith("/api/");
  if (!gzipOk && !conditional) return;
  const writeHead = res.writeHead, write = res.write, end = res.end;
  let pending = null; // writeHead adiado: o primeiro pedaço decide se comprime (e, inteiro, se mudou)
  let gz = null, decided = false, notModified = false;

  const compressibleNow = () => {
    const type = String(res.getHeader("content-type") || "");
    return COMPRESSIBLE.test(type) && !STREAMING.test(type) && !res.getHeader("content-encoding") && ![204, 304].includes(res.statusCode);
  };
  // decide e manda os cabeçalhos de verdade; body: a resposta inteira (end de uma vez) ou null (vem aos pedaços)
  const flush = (body) => {
    if (decided) return;
    decided = true;
    const reason = pending?.reason;
    pending = null;
    if (conditional && body && res.statusCode === 200 && !res.getHeader("etag")) {
      const etag = `"${crypto.createHash("sha1").update(body).digest("base64url").slice(0, 22)}"`;
      res.setHeader("ETag", etag);
      if (!res.getHeader("cache-control")) res.setHeader("Cache-Control", "no-cache");
      if (String(req.headers["if-none-match"] || "").split(/\s*,\s*/).includes(etag)) {
        notModified = true;
        res.statusCode = 304;
        for (const h of ["content-length", "content-type", "content-encoding"]) res.removeHeader(h);
        return writeHead.call(res, 304);
      }
    }
    if (gzipOk && compressibleNow() && (body == null || body.length >= min)) {
      gz = zlib.createGzip({ level: 6 });
      res.setHeader("Content-Encoding", "gzip");
      res.removeHeader("Content-Length");
      const vary = String(res.getHeader("vary") || "");
      if (!/accept-encoding/i.test(vary)) res.setHeader("Vary", vary ? `${vary}, Accept-Encoding` : "Accept-Encoding");
      gz.on("data", (c) => write.call(res, c));
      gz.on("end", () => end.call(res));
      // quem escreve com pipe (arquivo) para quando o write devolve false e espera o drain da resposta: é o gzip que drena
      gz.on("drain", () => res.emit("drain"));
    }
    reason === undefined ? writeHead.call(res, res.statusCode) : writeHead.call(res, res.statusCode, reason);
  };

  res.writeHead = function (code, a, b) {
    const reason = typeof a === "string" ? a : undefined;
    const headers = typeof a === "string" ? b : a;
    res.statusCode = code;
    if (Array.isArray(headers)) for (let i = 0; i + 1 < headers.length; i += 2) res.setHeader(headers[i], headers[i + 1]);
    else if (headers) for (const [k, v] of Object.entries(headers)) if (v !== undefined) res.setHeader(k, v);
    if (decided) return reason === undefined ? writeHead.call(res, code) : writeHead.call(res, code, reason);
    // o que chega aos poucos (ou não é texto nem arquivo da página) sai na hora, como antes
    const type = String(res.getHeader("content-type") || "");
    if (STREAMING.test(type) || (!compressibleNow() && !conditional)) { decided = true; return reason === undefined ? writeHead.call(res, code) : writeHead.call(res, code, reason); }
    pending = { reason };
    return res;
  };
  res.write = function (chunk, enc, cb) {
    if (!decided) flush(null);
    if (notModified) return true;
    return gz ? gz.write(chunk, enc, cb) : write.call(res, chunk, enc, cb);
  };
  res.end = function (chunk, enc, cb) {
    if (typeof chunk === "function") { cb = chunk; chunk = undefined; enc = undefined; } else if (typeof enc === "function") { cb = enc; enc = undefined; }
    if (!decided) flush(chunk == null ? Buffer.alloc(0) : Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === "string" ? enc : "utf8"));
    if (notModified) return end.call(res, cb);
    if (!gz) return end.call(res, chunk, enc, cb);
    if (cb) res.once("finish", cb);
    if (chunk != null) gz.end(chunk, enc); else gz.end();
    return res;
  };
}
