// Carrossel (layout carousel): um item por clique, com foto (sua) e texto.
//   style: arc   — roda em semicírculo com as fotos; gira até o item da vez; o texto atual sai pela esquerda e o
//                  novo entra da esquerda para a direita, sobrepondo
//   style: rings — a foto em anéis: o de fora gira no sentido anti-horário, o de dentro no horário, e travam no
//                  lugar formando a foto; o texto sobe junto com o anel de fora
// Sem foto, cada item ganha uma foto de demonstração desenhada (SVG, funciona sem internet).
import { md, esc } from "./markup.js";
import { figureHTML } from "./elements.js";

// ---- fotos de demonstração: paisagens desenhadas, uma paleta por item ----
const SCENES = [
  { sky: ["#ffb36b", "#ff6f61"], sun: "#fff3c4", far: "#b8577a", near: "#5b2a58", kind: "mountains" },
  { sky: ["#8fd3f4", "#2f80ed"], sun: "#ffffff", far: "#1f5fa8", near: "#0d3b66", kind: "sea" },
  { sky: ["#1b1f3b", "#51306d"], sun: "#ffe8a3", far: "#2c2350", near: "#120f26", kind: "city" },
  { sky: ["#ffd29d", "#f08a4b"], sun: "#fff7e0", far: "#d9864a", near: "#9c4f2e", kind: "dunes" },
  { sky: ["#c8f0d8", "#5fb88b"], sun: "#fbfff0", far: "#2f7d5b", near: "#174a35", kind: "forest" },
];
export function demoPhoto(k) {
  const s = SCENES[k % SCENES.length], id = `g${k}`;
  let land = "";
  if (s.kind === "mountains") land = `<path d="M0 560 L180 360 L300 470 L470 280 L640 480 L800 380 L800 800 L0 800Z" fill="${s.far}"/><path d="M0 650 L220 500 L400 620 L600 470 L800 600 L800 800 L0 800Z" fill="${s.near}"/>`;
  else if (s.kind === "sea") land = `<rect y="520" width="800" height="280" fill="${s.far}"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M0 ${560 + i * 50} q100 -24 200 0 t200 0 t200 0 t200 0" stroke="#ffffff55" stroke-width="6" fill="none"/>`).join("")}<rect y="700" width="800" height="100" fill="${s.near}"/>`;
  else if (s.kind === "city") land = [60, 150, 230, 330, 420, 520, 600, 690].map((x, i) => { const h = 180 + ((i * 97) % 220); return `<rect x="${x}" y="${800 - h - 120}" width="${70 + (i % 3) * 14}" height="${h + 120}" fill="${i % 2 ? s.far : s.near}"/>${Array.from({ length: 5 }, (_, j) => `<rect x="${x + 14}" y="${800 - h - 90 + j * 44}" width="12" height="16" fill="#ffd66b" opacity="${(i + j) % 3 ? 0.9 : 0.25}"/>`).join("")}`; }).join("");
  else if (s.kind === "dunes") land = `<path d="M0 560 Q200 460 420 560 T800 520 L800 800 L0 800Z" fill="${s.far}"/><path d="M0 660 Q260 560 520 660 T800 640 L800 800 L0 800Z" fill="${s.near}"/>`;
  else land = `<rect y="600" width="800" height="200" fill="${s.near}"/>${Array.from({ length: 11 }, (_, i) => `<path d="M${i * 78 - 10} 640 l40 -${170 + (i * 53) % 90} l40 ${170 + (i * 53) % 90}Z" fill="${i % 2 ? s.far : s.near}"/>`).join("")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.sky[0]}"/><stop offset="1" stop-color="${s.sky[1]}"/></linearGradient></defs><rect width="800" height="800" fill="url(#${id})"/><circle cx="${540 - (k % 3) * 120}" cy="${260 + (k % 2) * 40}" r="${80 + (k % 3) * 18}" fill="${s.sun}" opacity=".92"/>${land}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// a foto do item: a da pessoa (image: caminho, link ou data:) ou a de demonstração
function photo(item, k, ctx) {
  if (item.image) {
    const html = figureHTML({ image: item.image, fit: "cover", alt: item.alt || item.title || "" }, ctx);
    const src = html.match(/src="([^"]+)"/)?.[1];
    if (src) return src;
  }
  return demoPhoto(k);
}

export function carouselHTML(s, ctx, head) {
  const items = (s.items || []).map((x) => (typeof x === "string" ? { title: x } : x || {}));
  if (!items.length) items.push({ title: "Primeiro item", text: "Troque pelos seus itens: título, texto e foto." }, { title: "Segundo item" }, { title: "Terceiro item" });
  const n = items.length, style = s.style === "rings" ? "rings" : "arc";
  const text = (it, k) => `<article class="car-text${k === 0 ? " active" : ""}" data-lesson-k="${k}">${it.label ? `<div class="car-kicker t f-label">${md(it.label)}</div>` : `<div class="car-kicker t f-label">${String(k + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}</div>`}<h3 class="car-title t f-display">${md(it.title || "")}</h3>${it.text ? `<p class="car-body t f-body">${md(it.text)}</p>` : ""}</article>`;
  const srcs = items.map((it, k) => photo(it, k, ctx));
  const alt = (it) => esc(it.alt || it.title || "");
  let visual;
  if (style === "arc") {
    const step = Math.max(24, Math.min(40, 200 / Math.max(1, Math.min(n, 6))));
    visual = `<div class="car-wheel" style="--step:${step}deg" aria-hidden="true"><div class="car-track"></div>${items.map((it, k) => `<div class="car-item${k === 0 ? " active" : ""}" data-lesson-k="${k}" style="--k:${k}"><div class="car-photo"><img src="${srcs[k]}" alt="${alt(it)}"></div></div>`).join("")}</div>`;
  } else {
    visual = `<div class="car-disc">${items.map((it, k) => `<div class="car-slide${k === 0 ? " active" : ""}" data-lesson-k="${k}"><div class="car-ring-out"><img src="${srcs[k]}" alt="${alt(it)}"></div><div class="car-ring-in"><img src="${srcs[k]}" alt=""></div></div>`).join("")}<div class="car-lock" aria-hidden="true"></div></div>
      <nav class="car-dots" aria-hidden="true">${items.map((it, k) => `<span class="car-dot${k === 0 ? " active" : ""}" data-lesson-k="${k}"></span>`).join("")}</nav>`;
  }
  return `<div class="L-carousel car-${style}" data-lesson="carousel" data-lesson-count="${n}" style="--n:${n}">${s.title || s.kicker ? head(s) : ""}<div class="car-stage">${visual}<div class="car-texts">${items.map(text).join("")}</div></div></div>`;
}
