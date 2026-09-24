// Diagramas gerados em SVG.
//   { diagram: loop, nodes: [dados, modelo, decisão, ação], actor: in|on|out|none, at: 3 }
//   { diagram: spectrum, stops: [HITL, HOTL, HOOTL], at: 1, left: "humano decide", right: "máquina decide" }
//   { diagram: flow, steps: [a, b, c], highlight: 1 }
//   { diagram: venn, a: "…", b: "…", both: "…" }
import { esc } from "../markup.js";
import { humanBody } from "./pictos.js";

const wrap = (box, inner, cls = "") =>
  `<svg class="pic dia ${cls}" viewBox="${box.join(" ")}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;

function arrowDefs(id) {
  return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill:var(--fg)"/></marker></defs>`;
}

let uid = 0;

export function loop(o = {}) {
  const nodes = o.nodes || ["dados", "modelo", "decisão", "ação"];
  const n = nodes.length, cx = 300, cy = 300, r = 190;
  const id = `ar${++uid}`;
  const ang = (i) => (-90 + (360 / n) * i) * Math.PI / 180;
  const pt = (a, rr = r) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  let g = arrowDefs(id);
  const actor = o.actor || "none";
  const at = o.at ?? n - 1; // posição do humano quando "in": entre o nó at e at+1
  for (let i = 0; i < n; i++) {
    const a1 = ang(i) + 0.2, a2 = ang(i + 1) - 0.2;
    const [x1, y1] = pt(a1), [x2, y2] = pt(a2);
    if (actor === "in" && i === at) {
      const mid = (ang(i) + ang(i + 1)) / 2;
      const [mx1, my1] = pt(mid - 0.2), [mx2, my2] = pt(mid + 0.2);
      g += `<path d="M${x1} ${y1} A${r} ${r} 0 0 1 ${mx1} ${my1}" fill="none" style="stroke:var(--fg)" stroke-width="10" stroke-linecap="round"/>`;
      g += `<path d="M${mx2} ${my2} A${r} ${r} 0 0 1 ${x2} ${y2}" fill="none" style="stroke:var(--fg)" stroke-width="10" stroke-linecap="round" marker-end="url(#${id})"/>`;
    } else {
      g += `<path d="M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}" fill="none" style="stroke:var(--fg)" stroke-width="10" stroke-linecap="round" marker-end="url(#${id})"/>`;
    }
  }
  nodes.forEach((label, i) => {
    const a = ang(i);
    const [x, y] = pt(a);
    g += `<circle cx="${x}" cy="${y}" r="17" style="fill:var(--fg)"/>`;
    const [lx, ly] = pt(a, r + 58);
    const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    const dx = anchor === "start" ? -26 : anchor === "end" ? 26 : 0;
    g += `<text x="${lx + dx}" y="${ly + 10}" text-anchor="${anchor}" class="f-label" font-size="${o.labelSize || 30}" style="fill:var(--fg)">${esc(label)}</text>`;
  });
  const person = (x, y, s, faded) =>
    `<g opacity="${faded ? 0.38 : 1}"><circle cx="${x}" cy="${y}" r="${60 * s}" style="fill:var(--hi)"/><g transform="translate(${x - 60 * s * 0.62} ${y - 60 * s * 0.86}) scale(${s * 0.62})" style="--pc:var(--on-hi);--po:var(--on-hi)">${humanBody(faded ? "sleep" : o.actorPose || "stand")}</g></g>`;
  let box = [0, 0, 600, 600];
  if (actor === "in") {
    const mid = (ang(at) + ang(at + 1)) / 2;
    const [x, y] = pt(mid);
    g += person(x, y, 1);
  } else if (actor === "on") {
    g += `<line x1="${cx}" y1="${cy - r - 40}" x2="${cx}" y2="${-40}" style="stroke:var(--fg)" stroke-width="6" stroke-dasharray="14 12"/>`;
    g += person(cx, -110, 1);
    box = [0, -200, 600, 800];
  } else if (actor === "out") {
    g += `<g opacity=".4"><circle cx="720" cy="40" r="64" style="fill:var(--hi)"/><g transform="translate(662 6) scale(0.64)" style="--pc:var(--on-hi);--po:var(--on-hi)">${humanBody("sleep")}</g></g>`;
    box = [0, -60, 820, 680];
  }
  return wrap(box, g, "loop");
}

export function spectrum(o = {}) {
  const stops = o.stops || ["HITL", "HOTL", "HOOTL"];
  const W = 1200, y = 90, x0 = 60, x1 = W - 60;
  const n = stops.length;
  const X = (i) => x0 + ((x1 - x0) * i) / (n - 1);
  let g = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" style="stroke:var(--line)" stroke-width="14" stroke-linecap="round"/>`;
  stops.forEach((s, i) => {
    g += `<circle cx="${X(i)}" cy="${y}" r="16" style="fill:var(--fg)"/>`;
    g += `<text x="${X(i)}" y="${y + 70}" text-anchor="middle" class="f-heading" font-size="44" style="fill:var(--fg)">${esc(s)}</text>`;
  });
  if (o.left) g += `<text x="${x0}" y="${y - 44}" class="f-label" font-size="24" style="fill:var(--muted)">${esc(o.left)}</text>`;
  if (o.right) g += `<text x="${x1}" y="${y - 44}" text-anchor="end" class="f-label" font-size="24" style="fill:var(--muted)">${esc(o.right)}</text>`;
  if (o.at != null) {
    const x = typeof o.at === "number" && o.at <= 1 && !Number.isInteger(o.at) ? x0 + (x1 - x0) * o.at : X(o.at);
    g += `<circle class="marker" cx="${x}" cy="${y}" r="34" style="fill:var(--hi);stroke:var(--fg)" stroke-width="6"/>`;
  }
  return wrap([0, 0, W, 190], g, "spectrum");
}

export function flow(o = {}) {
  const steps = o.steps || [];
  const n = steps.length, bw = 300, gap = 90, bh = 150;
  const W = n * bw + (n - 1) * gap;
  const id = `ar${++uid}`;
  let g = arrowDefs(id);
  steps.forEach((s, i) => {
    const x = i * (bw + gap);
    const hl = o.highlight === i;
    g += `<rect x="${x}" y="0" width="${bw}" height="${bh}" rx="18" style="fill:var(${hl ? "--hi" : "--surface"});stroke:var(--fg)" stroke-width="${hl ? 0 : 4}"/>`;
    g += `<foreignObject x="${x + 16}" y="10" width="${bw - 32}" height="${bh - 20}"><div xmlns="http://www.w3.org/1999/xhtml" class="f-heading" style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:36px;color:var(${hl ? "--on-hi" : "--fg"})">${esc(s)}</div></foreignObject>`;
    if (i < n - 1) g += `<line x1="${x + bw + 12}" y1="${bh / 2}" x2="${x + bw + gap - 20}" y2="${bh / 2}" style="stroke:var(--fg)" stroke-width="8" marker-end="url(#${id})"/>`;
  });
  return wrap([-4, -4, W + 8, bh + 8], g, "flow");
}

export function venn(o = {}) {
  let g = `<circle cx="300" cy="260" r="220" style="fill:var(--hi)" opacity=".85"/>
<circle cx="560" cy="260" r="220" style="fill:var(--fg)" opacity=".85"/>`;
  g += `<text x="220" y="270" text-anchor="middle" class="f-heading" font-size="40" style="fill:var(--on-hi)">${esc(o.a || "")}</text>`;
  g += `<text x="650" y="270" text-anchor="middle" class="f-heading" font-size="40" style="fill:var(--bg)">${esc(o.b || "")}</text>`;
  if (o.both) g += `<text x="430" y="270" text-anchor="middle" class="f-label" font-size="26" style="fill:var(--bg)">${esc(o.both)}</text>`;
  return wrap([60, 20, 740, 480], g, "venn");
}

export function diagram(o) {
  const k = o.diagram;
  if (k === "loop" || k === "cycle") return loop(o);
  if (k === "spectrum") return spectrum(o);
  if (k === "flow") return flow(o);
  if (k === "venn") return venn(o);
  throw new Error(`diagrama "${k}" desconhecido (loop | cycle | spectrum | flow | venn)`);
}
