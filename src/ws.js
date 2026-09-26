// WebSocket mínimo (RFC 6455) sem dependências: cliente (Studio → serviço de conversa em tempo real) e o
// lado servidor (usado pela API de mentira). Feito à mão para aceitar cabeçalhos (token) e o certificado
// da empresa (ca), que o WebSocket do navegador/Node não deixam configurar.
import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { EventEmitter } from "node:events";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const accept = (key) => crypto.createHash("sha1").update(key + GUID).digest("base64");

// ---------- quadros ----------
function encode(data, { opcode, mask }) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
  const op = opcode ?? (Buffer.isBuffer(data) ? 0x2 : 0x1);
  const len = payload.length;
  const head = [0x80 | op];
  let ext = Buffer.alloc(0);
  if (len < 126) head.push((mask ? 0x80 : 0) | len);
  else if (len < 65536) { head.push((mask ? 0x80 : 0) | 126); ext = Buffer.alloc(2); ext.writeUInt16BE(len); }
  else { head.push((mask ? 0x80 : 0) | 127); ext = Buffer.alloc(8); ext.writeBigUInt64BE(BigInt(len)); }
  if (!mask) return Buffer.concat([Buffer.from(head), ext, payload]);
  const key = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ key[i & 3];
  return Buffer.concat([Buffer.from(head), ext, key, masked]);
}

// Conexão já estabelecida (depois do handshake), dos dois lados.
class Conn extends EventEmitter {
  constructor(socket, { client }) {
    super();
    this.socket = socket;
    this.client = client; // cliente mascara o que envia
    this.buf = Buffer.alloc(0);
    this.parts = null; // mensagem fragmentada em andamento
    this.open = true;
    socket.on("data", (d) => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on("close", () => { if (this.open) { this.open = false; this.emit("close", 1006, "conexão caiu"); } });
    // conexão derrubada do outro lado (ECONNRESET…): vira "close", nunca um erro solto que derruba o Studio
    socket.on("error", (e) => {
      if (this.listenerCount("error")) this.emit("error", e);
      if (this.open) { this.open = false; this.emit("close", 1006, e.message); }
    });
  }
  parse() {
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80);
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const k = this.buf.subarray(off, off + 4); payload = Buffer.from(payload.map((x, i) => x ^ k[i & 3])); }
      this.buf = this.buf.subarray(need);
      if (op === 0x8) { // close
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        if (this.open) { this.open = false; try { this.socket.write(encode(payload.subarray(0, 2), { opcode: 0x8, mask: this.client })); } catch {} this.socket.end(); this.emit("close", code, payload.subarray(2).toString()); }
        return;
      }
      if (op === 0x9) { this.socket.write(encode(payload, { opcode: 0xa, mask: this.client })); continue; } // ping → pong
      if (op === 0xa) continue;
      if (op === 0x0) { if (!this.parts) continue; this.parts.chunks.push(payload); }
      else this.parts = { op, chunks: [payload] };
      if (fin && this.parts) {
        const all = Buffer.concat(this.parts.chunks), isText = this.parts.op === 0x1;
        this.parts = null;
        this.emit("message", isText ? all.toString("utf8") : all, isText);
      }
    }
  }
  send(data) { if (this.open) this.socket.write(encode(data, { mask: this.client })); }
  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code);
    try { this.socket.write(encode(p, { opcode: 0x8, mask: this.client })); } catch {}
    this.open = false;
    setTimeout(() => this.socket.destroy(), 200);
    this.emit("close", code, "");
  }
}

// Cliente: ws:// ou wss://, com cabeçalhos e certificado da empresa.
export function connectWs(url, { headers = {}, ca, insecure = false, timeout = 15000, protocols } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { reject(Object.assign(new Error(`Endereço inválido: ${url}`), { kind: "config" })); return; }
    if (!/^wss?:$/.test(u.protocol)) { reject(Object.assign(new Error(`Conversa em tempo real precisa de ws:// ou wss:// (veio ${u.protocol})`), { kind: "config" })); return; }
    const secure = u.protocol === "wss:";
    const port = Number(u.port) || (secure ? 443 : 80);
    const key = crypto.randomBytes(16).toString("base64");
    const opts = { host: u.hostname, port, servername: u.hostname, ca, rejectUnauthorized: !insecure };
    const socket = secure ? tls.connect(opts) : net.connect(opts);
    const timer = setTimeout(() => { socket.destroy(); reject(Object.assign(new Error(`sem resposta de ${u.host} em ${Math.round(timeout / 1000)}s`), { code: "TIMEOUT" })); }, timeout);
    socket.once("error", (e) => { clearTimeout(timer); reject(e); });
    socket.once(secure ? "secureConnect" : "connect", () => {
      const lines = [`GET ${u.pathname}${u.search} HTTP/1.1`, `Host: ${u.host}`, "Upgrade: websocket", "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13", ...(protocols ? [`Sec-WebSocket-Protocol: ${[].concat(protocols).join(", ")}`] : []),
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)];
      socket.write(lines.join("\r\n") + "\r\n\r\n");
    });
    let head = Buffer.alloc(0);
    const onData = (d) => {
      head = Buffer.concat([head, d]);
      const end = head.indexOf("\r\n\r\n");
      if (end < 0) return;
      socket.removeListener("data", onData);
      clearTimeout(timer);
      const text = head.subarray(0, end).toString();
      const status = Number((text.match(/^HTTP\/1\.1 (\d+)/) || [])[1]);
      if (status !== 101 || !text.toLowerCase().includes(`sec-websocket-accept: ${accept(key).toLowerCase()}`)) {
        socket.destroy();
        const body = head.subarray(end + 4).toString().slice(0, 400);
        reject(Object.assign(new Error(`o serviço recusou a conexão (HTTP ${status || "?"})${body ? ": " + body : ""}`), { status }));
        return;
      }
      const conn = new Conn(socket, { client: true });
      const rest = head.subarray(end + 4);
      resolve(conn);
      if (rest.length) { conn.buf = rest; conn.parse(); }
    };
    socket.on("data", onData);
  });
}

// Servidor: responde ao "upgrade" de um http.Server e devolve a conexão (usado pela API de mentira).
export function acceptWs(req, socket) {
  const key = req.headers["sec-websocket-key"];
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept(key)}`].join("\r\n") + "\r\n\r\n");
  return new Conn(socket, { client: false });
}
