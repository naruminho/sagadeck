// Peças prontas de tela (mock): um celular com notificações e um documento/ficha. Servem para pôr a plateia "dentro
// da cena" (o alerta que chegou no celular, o currículo que o modelo avaliou) sem a pessoa escrever HTML e CSS.
// Como o QR code, têm cores próprias de aparelho e de papel: leem igual em slide claro, escuro ou colorido.
//   { mock: phone, time: "8:07", date: "sábado, 13 de janeiro", notifications: [{ app: "Alerta de emergência", text: "…", step: 1 }] }
//   { mock: document, kicker: "Currículo", title: "Candidata #2317", lines: [86, 64, { text: "Capitã do clube…", mark: true, step: 1, note: "−" }, 72],
//     score: "★★☆☆☆", scoreLabel: "nota do modelo" }
//   { mock: chat, title: "Assistente", build: true, messages: [{ from: você, text: "Faz um app de gastos" },
//     { from: ia, text: "Pronto!", code: "…", language: javascript, fade: 4 }, { from: ia, thinking: true }], input: "…" }
import { md } from "../markup.js";
import { highlightCode } from "../code-highlight.js";
import { normalizeCodeLanguage } from "../code-language.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stepAttr = (n) => (Number(n) > 0 ? ` data-step="${Number(n)}"` : "");
export const MOCKS = ["phone", "document", "chat"];

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
  throw new Error(`mock "${el.mock}" não existe. Use: ${MOCKS.join(", ")}`);
}
