// Peças prontas de tela (mock): um celular com notificações e um documento/ficha. Servem para pôr a plateia "dentro
// da cena" (o alerta que chegou no celular, o currículo que o modelo avaliou) sem a pessoa escrever HTML e CSS.
// Como o QR code, têm cores próprias de aparelho e de papel: leem igual em slide claro, escuro ou colorido.
//   { mock: phone, time: "8:07", date: "sábado, 13 de janeiro", notifications: [{ app: "Alerta de emergência", text: "…", step: 1 }] }
//   { mock: document, kicker: "Currículo", title: "Candidata #2317", lines: [86, 64, { text: "Capitã do clube…", mark: true, step: 1, note: "−" }, 72],
//     score: "★★☆☆☆", scoreLabel: "nota do modelo" }
//   { mock: chat, title: "Assistente", build: true, messages: [{ from: você, text: "Faz um app de gastos" },
//     { from: ia, text: "Pronto!", code: "…", language: javascript, fade: 4 }, { from: ia, thinking: true }], input: "…" }
//   { mock: diff, file: total.js, language: javascript, before: "…", after: "…", step: 1, note: "quebrou 3 telas" }
//   { mock: files, title: meu-app, files: ["src/app.js", { path: CLAUDE.md, mark: true, note: "regras", step: 1 }] }
//   { mock: browser, url: meuapp.com, title: Painel, lines: [80, 60], devtools: { tab: Network, lines: ["…", { text: "…", mark: true }] } }
import { md } from "../markup.js";
import { highlightCode } from "../code-highlight.js";
import { normalizeCodeLanguage } from "../code-language.js";
import { iconSVG } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stepAttr = (n) => (Number(n) > 0 ? ` data-step="${Number(n)}"` : "");
export const MOCKS = ["phone", "document", "chat", "diff", "files", "browser"];
const codeLine = (text, lang) => highlightCode(String(text), lang).join("") || "&nbsp;";

// Diferença linha a linha (maior subsequência comum): basta para os trechos curtos que cabem num slide.
export function lineDiff(before, after) {
  const a = before === "" || before == null ? [] : String(before).replace(/\n$/, "").split("\n");
  const b = after === "" || after == null ? [] : String(after).replace(/\n$/, "").split("\n");
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: " ", text: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: "-", text: a[i++] });
    else out.push({ op: "+", text: b[j++] });
  }
  while (i < n) out.push({ op: "-", text: a[i++] });
  while (j < m) out.push({ op: "+", text: b[j++] });
  // as linhas tiradas de um bloco antes das postas (como o git mostra)
  for (let k = 0; k < out.length; k++) {
    if (out[k].op !== "+") continue;
    let e = k; while (e < out.length && out[e].op === "+") e++;
    let d = e; while (d < out.length && out[d].op === "-") d++;
    if (d > e) { out.splice(k, d - k, ...out.slice(e, d), ...out.slice(k, e)); k = d - 1; } else k = e - 1;
  }
  return out;
}

// O que a IA mudou: linhas tiradas (-) e postas (+) com o contexto; a mudança entra no clique `step`.
function diffMock(el) {
  const lang = normalizeCodeLanguage(el.language || "") || "";
  const rows = Array.isArray(el.lines) ? el.lines.map((l) => {
    const x = typeof l === "string" ? { text: l } : l || {};
    if (x.op) return { op: x.op, text: String(x.text ?? ""), step: x.step };
    const m = String(x.text ?? "").match(/^([-+ ])\s?(.*)$/);
    return m ? { op: m[1], text: m[2], step: x.step } : { op: " ", text: String(x.text ?? ""), step: x.step };
  }) : lineDiff(el.before ?? "", el.after ?? "");
  const body = rows.map((r) => {
    const cls = r.op === "-" ? "mk-del" : r.op === "+" ? "mk-add" : "mk-ctx";
    const step = r.op === " " ? r.step : r.step ?? el.step;
    return `<div class="mk-dl ${cls}"${stepAttr(step)}><span class="mk-sign">${r.op === " " ? " " : esc(r.op)}</span><code>${codeLine(r.text, lang)}</code></div>`;
  }).join("");
  const head = `<div class="mk-diff-head">${iconSVG("file-diff", { size: 26, stroke: 2 })}<span class="mk-diff-file">${esc(el.file || "")}</span></div>`;
  const note = el.note ? `<div class="mk-diff-note"${stepAttr(el.noteStep ?? el.step)}>${md(String(el.note))}</div>` : "";
  return `<div class="mk mk-diff" style="width:${Number(el.size) || 980}px">${head}<div class="mk-diff-body">${body}</div>${note}</div>`;
}

// Árvore do projeto a partir de caminhos: pastas antes dos arquivos, em ordem alfabética, cada nível recuado.
function filesMock(el) {
  const root = { dirs: new Map(), files: [] };
  for (const f of Array.isArray(el.files) ? el.files : []) {
    const x = typeof f === "string" ? { path: f } : f || {};
    const parts = String(x.path || "").replace(/\\/g, "/").split("/").filter(Boolean);
    if (!parts.length) continue;
    const isDir = String(x.path).endsWith("/");
    let node = root;
    const dirParts = isDir ? parts : parts.slice(0, -1);
    for (const p of dirParts) { if (!node.dirs.has(p)) node.dirs.set(p, { dirs: new Map(), files: [], meta: {} }); node = node.dirs.get(p); }
    if (isDir) node.meta = x; else node.files.push({ name: parts.at(-1), ...x });
  }
  const sort = (a, b) => a.localeCompare(b, "pt", { sensitivity: "base" });
  const row = (name, lv, dir, x = {}) => {
    const hl = x.mark ? `<i class="mk-hl"${stepAttr(x.step)}></i>` : "";
    const note = x.note ? `<span class="mk-fnote"${stepAttr(x.step)}>${esc(x.note)}</span>` : "";
    const ic = iconSVG(dir ? "folder" : "file-text", { size: 28, stroke: 1.8 });
    return `<div class="mk-fl${dir ? " mk-dir" : ""}${x.mark ? " mk-marked" : ""}"${x.mark ? "" : stepAttr(x.step)} style="--lv:${lv}">${hl}<span class="mk-fic">${ic}</span><span class="mk-fname">${esc(name)}</span>${note}</div>`;
  };
  const walk = (node, lv) => [...node.dirs.keys()].sort(sort).map((d) => row(d, lv, true, node.dirs.get(d).meta) + walk(node.dirs.get(d), lv + 1)).join("")
    + [...node.files].sort((a, b) => sort(a.name, b.name)).map((f) => row(f.name, lv, false, f)).join("");
  const title = el.title ? `<div class="mk-files-head">${esc(el.title)}</div>` : "";
  return `<div class="mk mk-files" style="width:${Number(el.size) || 760}px">${title}<div class="mk-files-body">${walk(root, 0)}</div></div>`;
}

// Navegador com a página e, embaixo, o DevTools (a aba aberta e as linhas; a marcada é o achado).
function browserMock(el) {
  const bar = `<div class="mk-br-bar"><i></i><i></i><i></i><div class="mk-url">${esc(el.url || "")}</div></div>`;
  const lines = (Array.isArray(el.lines) ? el.lines : []).map((l) => (typeof l === "number"
    ? `<div class="mk-bar" style="width:${Math.max(8, Math.min(100, l))}%"></div>`
    : `<div class="mk-line"${stepAttr(l?.step)}><span class="mk-ltext">${md(String(typeof l === "string" ? l : l?.text ?? ""))}</span></div>`)).join("");
  const page = `<div class="mk-page">${el.title ? `<div class="mk-title">${md(String(el.title))}</div>` : ""}${lines}</div>`;
  const dt = el.devtools || el.console;
  let tools = "";
  if (dt) {
    const tabs = ["Elements", "Console", "Sources", "Network"], on = String(dt.tab || (el.console ? "Console" : "Network"));
    const tabRow = (tabs.includes(on) ? tabs : [...tabs, on]).map((tb) => `<span class="mk-dt-tab${tb === on ? " mk-on" : ""}">${esc(tb)}</span>`).join("");
    const dl = (Array.isArray(dt.lines) ? dt.lines : []).map((l) => {
      const x = typeof l === "string" ? { text: l } : l || {};
      const hl = x.mark ? `<i class="mk-hl"${stepAttr(x.step)}></i>` : "";
      return `<div class="mk-dt-line${x.mark ? " mk-marked" : ""}"${x.mark ? "" : stepAttr(x.step)}>${hl}<span>${esc(x.text ?? "")}</span></div>`;
    }).join("");
    tools = `<div class="mk-devtools"${stepAttr(dt.step)}><div class="mk-dt-tabs">${tabRow}</div><div class="mk-dt-body">${dl}</div></div>`;
  }
  return `<div class="mk mk-browser" style="width:${Number(el.size) || 1000}px">${bar}${page}${tools}</div>`;
}

function phone(el) {
  const list = Array.isArray(el.notifications) && el.notifications.length ? el.notifications
    : el.text || el.app ? [{ app: el.app, title: el.title, text: el.text, step: el.notificationStep }] : [];
  const notes = list.map((n) => {
    const x = typeof n === "string" ? { text: n } : n || {};
    return `<div class="mk-note"${stepAttr(x.step)}>${x.app ? `<div class="mk-app">${esc(x.app)}</div>` : ""}${x.title ? `<div class="mk-ntitle">${md(String(x.title))}</div>` : ""}${x.text ? `<div class="mk-ntext">${md(String(x.text))}</div>` : ""}</div>`;
  }).join("");
  return `<div class="mk mk-phone" style="width:${Number(el.size) || 600}px"><div class="mk-clock">${el.time ? `<span class="mk-time">${esc(el.time)}</span>` : ""}${el.date ? `<span class="mk-date">${esc(el.date)}</span>` : ""}</div>${notes}</div>`;
}

function documentMock(el) {
  const lines = (Array.isArray(el.lines) ? el.lines : []).map((l) => {
    if (typeof l === "number") return `<div class="mk-bar" style="width:${Math.max(8, Math.min(100, l))}%"></div>`;
    const x = typeof l === "string" ? { text: l } : l || {};
    if (x.bar != null) return `<div class="mk-bar" style="width:${Math.max(8, Math.min(100, Number(x.bar) || 60))}%"></div>`;
    // mark: a linha fica sempre na tela; o destaque (e o sinal ao lado) só acende no clique `step`, se houver
    const hl = x.mark ? `<i class="mk-hl"${stepAttr(x.step)}></i>` : "";
    const note = x.note ? `<span class="mk-pen"${x.mark ? stepAttr(x.step) : ""}>${esc(x.note)}</span>` : "";
    return `<div class="mk-line${x.mark ? " mk-marked" : ""}"${x.mark ? "" : stepAttr(x.step)}>${hl}<span class="mk-ltext">${md(String(x.text ?? ""))}</span>${note}</div>`;
  }).join("");
  const score = el.score != null && el.score !== "" ? `<div class="mk-score"${stepAttr(el.scoreStep)}><span class="mk-sval">${esc(el.score)}</span>${el.scoreLabel ? `<span class="mk-slabel">${esc(el.scoreLabel)}</span>` : ""}</div>` : "";
  return `<div class="mk mk-doc" style="width:${Number(el.size) || 760}px">${el.kicker ? `<div class="mk-kicker">${esc(el.kicker)}</div>` : ""}${el.title ? `<div class="mk-title">${md(String(el.title))}</div>` : ""}${lines}${score}</div>`;
}

// Conversa com uma IA (ou entre pessoas): a pessoa à direita, a IA à esquerda. `build: true` põe cada mensagem no seu
// clique; `fade: N` desbota a mensagem no clique N (o que a IA "esqueceu" quando a conversa encheu); `mark` acende
// em vermelho; `thinking` é o balão de pensando; `code` vai num bloco com realce dentro do balão; `note` é uma
// etiqueta pequena (hora 1, turno 30).
const AI_SIDE = /^(ia|ai|assistente|assistant|bot|modelo|model|claude|gpt|agente|agent)$/i;
function chat(el) {
  const list = Array.isArray(el.messages) ? el.messages : [];
  const msgs = list.map((m, i) => {
    const x = typeof m === "string" ? { text: m, from: i % 2 ? "ia" : "você" } : m || {};
    const ai = AI_SIDE.test(String(x.from ?? x.who ?? "").trim());
    const step = el.build ? (Number(el.buildFrom) || 1) + i : x.step;
    const cls = ["mk-msg", ai ? "mk-ai" : "mk-me", x.thinking ? "mk-thinking" : "", x.mark ? "mk-marked" : ""].filter(Boolean).join(" ");
    const exit = Number(x.fade) > 0 ? ` data-exit="${Number(x.fade)}"` : "";
    const lang = normalizeCodeLanguage(x.language || "") || "";
    const code = x.code ? `<pre class="mk-code"><code>${highlightCode(String(x.code).replace(/\n$/, ""), lang).join("\n")}</code></pre>` : "";
    const body = x.thinking ? `<span class="mk-dots"><i></i><i></i><i></i></span>${x.text ? `<span class="mk-ttext">${md(String(x.text))}</span>` : ""}`
      : `${x.text ? `<div class="mk-text">${md(String(x.text))}</div>` : ""}${code}`;
    const who = x.name ? `<div class="mk-who">${esc(x.name)}</div>` : "";
    const tag = x.note ? `<div class="mk-tag">${esc(x.note)}</div>` : "";
    return `<div class="${cls}"${stepAttr(step)}${exit}>${who}<div class="mk-bubble">${body}</div>${tag}</div>`;
  }).join("");
  const bar = `<div class="mk-chat-bar"><i></i><i></i><i></i><span class="mk-chat-title">${esc(el.title || "")}</span></div>`;
  const input = el.input ? `<div class="mk-input"${stepAttr(el.inputStep)}>${esc(el.input)}</div>` : "";
  return `<div class="mk mk-chat" style="width:${Number(el.size) || 920}px">${bar}<div class="mk-chat-body">${msgs}</div>${input}</div>`;
}

export function mockHTML(el) {
  const kind = String(el.mock || "").toLowerCase();
  if (kind === "phone") return phone(el);
  if (kind === "document") return documentMock(el);
  if (kind === "chat") return chat(el);
  if (kind === "diff") return diffMock(el);
  if (kind === "files") return filesMock(el);
  if (kind === "browser") return browserMock(el);
  throw new Error(`mock "${el.mock}" não existe. Use: ${MOCKS.join(", ")}`);
}
