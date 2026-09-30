// Dinâmicas ao vivo entre duas pessoas. Cada clique da apresentação é um quadro (o mesmo mecanismo do Código
// guiado: data-lesson + data-lesson-panel), então funciona com o controle remoto, o modo apresentador e o PDF
// (que mostra o último quadro).
//   duel      — Duelo de commits: dois editores, o comando da vez e o grafo crescendo (simulador em git-sim.js)
//   terminals — dois terminais lado a lado com o comando sendo digitado (roteiro livre ou o mesmo do duelo)
//   turns     — turnos genéricos: code review, cliente × servidor, debate, role-play, pair programming
import { md, esc } from "../markup.js";
import { poll } from "../elements.js";
import { highlightCode as hlRaw } from "../code-highlight.js";
import { resolveCodeLanguage } from "../code-language.js";
import { simulateGit, graphSVG } from "./git-sim.js";

const langOf = (file, lang) => resolveCodeLanguage(lang, file);
// coloração das linguagens que o motor conhece; as outras saem só escapadas
const plainLines = (src) => src.split("\n").map(esc);
const highlightCode = (src, language) => { try { return language ? hlRaw(src, language) : plainLines(src); } catch { return plainLines(src); } };
const initial = (name) => esc(String(name || "?").trim().charAt(0).toUpperCase() || "?");
const personOf = (p, i) => (typeof p === "object" && p ? { name: String(p.name || `Pessoa ${i + 1}`), role: p.role ? String(p.role) : "" } : { name: String(p || (i ? "Pessoa B" : "Pessoa A")), role: "" });
const panel = (i, inner, cls = "") => `<section class="lesson-panel dyn-frame ${cls}${i === 0 ? " active" : ""}" data-lesson-panel="${i}">${inner}</section>`;
const counter = (i, n) => `<div class="dyn-count f-label">${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}</div>`;

function codeLines(file, { changed = [], conflict = [] } = {}, language) {
  const hl = highlightCode(file.join("\n"), language);
  const ch = new Set(changed), cf = new Set(conflict);
  return `<ol class="dyn-code dyn-mono">${file.map((l, i) => {
    const marker = /^(<<<<<<<|=======|>>>>>>>)/.test(l);
    const cls = [cf.has(i + 1) ? (marker ? "cf cf-mark" : "cf") : "", ch.has(i + 1) && !cf.has(i + 1) ? "chg" : ""].filter(Boolean).join(" ");
    return `<li${cls ? ` class="${cls}"` : ""}><span class="ln">${i + 1}</span><span class="lc">${marker ? esc(l) : hl[i] || " "}</span></li>`;
  }).join("")}</ol>`;
}

// ---------------------------------------------------------------------------------------------------- duel
export function duelHTML(s, ctx, head) {
  let sim;
  try { sim = simulateGit(s); }
  catch (e) { ctx?.warnings?.push(`duelo de commits: ${e.message}`); return `<div class="L-duel">${head(s)}<div class="dyn-error f-body">Roteiro do duelo com erro: ${esc(e.message)}</div></div>`; }
  const language = langOf(s.file, s.language);
  const frames = sim.frames.map((f) => ({ f }));
  // aposta: uma enquete antes do primeiro pull que decide (conflito ou merge); o quadro seguinte revela
  if (s.bet) {
    const at = frames.findIndex(({ f }) => ["conflict", "merge", "ff"].includes(f.event));
    if (at > 0) {
      frames[at].reveal = frames[at].f.event === "conflict" ? "Deu conflito!" : "Sem conflito: o Git juntou sozinho.";
      frames.splice(at, 0, { bet: true, f: frames[at - 1].f });
    }
  }
  const n = frames.length;
  const editor = (p, i, f) => `<div class="dyn-ed who-${i ? "b" : "a"}${f.who === i ? " turn" : ""}${p.status === "conflito" ? " has-conflict" : ""}">
      <div class="dyn-ed-top"><span class="dyn-av">${initial(p.name)}</span><b class="f-heading">${esc(p.name)}</b><span class="dyn-file dyn-mono">${esc(sim.file)}</span><span class="dyn-status f-label st-${p.status.replace(/\W+/g, "-")}">${esc(p.status)}</span></div>
      ${codeLines(p.file, p, language)}</div>`;
  const body = frames.map(({ f, bet, reveal }, i) => {
    if (bet) {
      const q = typeof s.bet === "string" ? s.bet : "Vai dar conflito?";
      const pollEl = poll({ poll: `${s.id || "duelo"}-aposta`, options: s.betOptions || ["Vai dar conflito", "O Git resolve sozinho"], hint: "Votem antes do pull" }, ctx);
      return panel(i, `${counter(i, n)}<div class="dyn-bet"><div class="dyn-bet-q t f-display">${md(q)}</div>${pollEl}</div>`, "dyn-bet-frame");
    }
    const who = f.who >= 0 ? sim.people[f.who] : "";
    const term = `<div class="dyn-term">${f.cmd ? `<div class="dyn-cmd dyn-mono"><span class="dyn-prompt">${esc(who || "$")} $</span> ${esc(f.cmd)}</div>` : ""}${f.out ? `<pre class="dyn-out dyn-mono ev-${f.event}">${esc(f.out)}</pre>` : ""}${f.text ? `<p class="dyn-say t f-body">${md(f.text)}</p>` : ""}</div>`;
    return panel(i, `${counter(i, n)}<div class="dyn-row">${f.people.map((p, k) => editor(p, k, f)).join("")}</div>
      <div class="dyn-bottom">${term}<div class="dyn-graph">${graphSVG(f, sim.people)}</div></div>
      ${reveal ? `<div class="dyn-reveal t f-display ${f.event === "conflict" ? "bad" : "good"}">${esc(reveal)}</div>` : ""}${f.note ? `<div class="dyn-note t f-body">${md(f.note)}</div>` : ""}`, `ev-${f.event}`);
  }).join("");
  return `<div class="L-duel dyn" data-lesson="duel" data-lesson-count="${n}">${head(s)}<div class="dyn-frames">${body}</div></div>`;
}

// ---------------------------------------------------------------------------------------------- terminals
export function terminalsHTML(s, ctx, head) {
  let people, steps;
  if (s.base != null && Array.isArray(s.turns)) { // mesmo roteiro do duelo: os comandos e a saída vêm do simulador
    try {
      const sim = simulateGit(s);
      people = sim.people.map((name) => ({ name }));
      steps = sim.frames.slice(1).filter((f) => f.cmd).map((f) => ({ who: f.who + 1, cmd: f.cmd, out: f.out, event: f.event }));
    } catch (e) { ctx?.warnings?.push(`terminais: ${e.message}`); return `<div class="L-terminals">${head(s)}<div class="dyn-error f-body">Roteiro com erro: ${esc(e.message)}</div></div>`; }
  } else {
    people = [0, 1].map((i) => personOf((s.panes || s.people || [])[i], i));
    steps = (s.steps || []).map((x) => (typeof x === "string" ? { who: 1, cmd: x } : x || {}));
  }
  const n = Math.max(1, steps.length);
  const MAX = s.keep || 6; // comandos visíveis por terminal (os mais velhos saem por cima)
  const body = Array.from({ length: n }, (_, i) => {
    const pane = (p, k) => {
      const mine = steps.slice(0, i + 1).map((x, j) => ({ ...x, j })).filter((x) => (Number(x.who) || 1) - 1 === k).slice(-MAX);
      const rows = mine.map((x) => {
        const last = x.j === i;
        const cmd = String(x.cmd ?? "");
        return `<div class="tm-entry${last ? " tm-new" : ""}"><div class="tm-line"><span class="tm-ps">${esc(p.name.toLowerCase().replace(/\s+/g, ""))}@${esc(s.host || "dev")} $</span> <span class="tm-cmd"${last ? ` style="--n:${Math.max(1, cmd.length)}"` : ""}>${esc(cmd)}</span></div>${x.out ? `<pre class="tm-out${x.event ? ` ev-${esc(x.event)}` : ""}">${esc(x.out)}</pre>` : ""}</div>`;
      }).join("");
      return `<div class="tm-pane who-${k ? "b" : "a"}${(Number(steps[i]?.who) || 1) - 1 === k ? " turn" : ""}"><div class="tm-bar"><i></i><i></i><i></i><b class="f-label">${esc(p.name)}${p.role ? ` · ${esc(p.role)}` : ""}</b></div><div class="tm-body dyn-mono">${rows || '<div class="tm-line tm-idle"><span class="tm-ps">$</span> <span class="tm-caret"></span></div>'}</div></div>`;
    };
    return panel(i, `${counter(i, n)}<div class="tm-row">${people.map(pane).join("")}</div>${steps[i]?.note ? `<div class="dyn-note t f-body">${md(steps[i].note)}</div>` : ""}`);
  }).join("");
  return `<div class="L-terminals dyn" data-lesson="terminals" data-lesson-count="${n}">${head(s)}<div class="dyn-frames">${body}</div></div>`;
}

// -------------------------------------------------------------------------------------------------- turns
export function turnsHTML(s, ctx, head) {
  const people = [0, 1].map((i) => personOf((s.people || [])[i], i));
  const turns = (s.turns || []).map((x) => (typeof x === "string" ? { who: 1, text: x } : x || {}));
  const n = Math.max(1, turns.length);
  const MAX = s.keep || 4; // falas visíveis ao mesmo tempo (as mais velhas sobem e somem)
  const bubble = (t, j, last) => {
    const k = Math.min(1, Math.max(0, (Number(t.who) || 1) - 1));
    const p = people[k];
    const req = t.method || t.url ? `<div class="tn-req dyn-mono"><b>${esc(String(t.method || "GET").toUpperCase())}</b> ${esc(t.url || "")}${t.status ? ` <span class="tn-status s${String(t.status).charAt(0)}">${esc(t.status)}</span>` : ""}</div>` : "";
    const code = t.code ? `<pre class="tn-code dyn-mono">${highlightCode(String(t.code), resolveCodeLanguage(t.language, "")).join("\n")}</pre>` : "";
    return `<div class="tn-turn who-${k ? "b" : "a"}${last ? " tn-new" : ""}"><span class="dyn-av">${initial(p.name)}</span><div class="tn-bubble">${t.tag ? `<span class="tn-tag f-label">${esc(t.tag)}</span>` : ""}${req}${t.text ? `<div class="tn-text t f-body">${md(t.text)}</div>` : ""}${code}</div></div>`;
  };
  const top = `<div class="tn-cast">${people.map((p, k) => `<div class="tn-who who-${k ? "b" : "a"}"><span class="dyn-av">${initial(p.name)}</span><div><b class="f-heading">${esc(p.name)}</b>${p.role ? `<small class="f-label">${esc(p.role)}</small>` : ""}</div></div>`).join('<span class="tn-vs f-label">×</span>')}</div>`;
  const body = Array.from({ length: n }, (_, i) => panel(i, `<div class="tn-feed">${turns.slice(Math.max(0, i + 1 - MAX), i + 1).map((t, j, arr) => bubble(t, j, j === arr.length - 1)).join("")}</div>`)).join("");
  return `<div class="L-turns dyn" data-lesson="turns" data-lesson-count="${n}">${head(s)}${top}<div class="dyn-frames">${body}</div></div>`;
}
