// Pictogramas (estilo sinalização), gerados na hora em SVG. A pessoa (`human`, e dentro de crowd/scene)
// usa glifos do Material Symbols (Apache-2.0) — veja material-pictos.js e scripts/vendor-pictos.mjs.
// Cores seguem o tom do slide via variáveis CSS:
//   --pc  cor da figura (padrão: --fg)      --po  cor dos objetos (padrão: --fg)
//   classes: pc (fill figura), pcs (stroke figura), po/pos (objetos), ph (fill --hi),
//            pe (fill --em), pm (fill --muted), pb (fill --bg), pl (fill --line)
//
// YAML:
//   { picto: human, pose: walk }                     poses: veja POSES
//   { picto: human, pose: phone, sign: circle }      placa atrás: circle|square|triangle
//   { picto: machine }
//   { picto: scene, name: car-top, driver: machine, passenger: human, back: sleep }
//   { picto: scene, name: console, screen: "START" }
//   { picto: crowd, count: 20, highlight: 3 }

import { MATERIAL_GLYPHS } from "./material-pictos.js";

// Poses de { picto: human }: cada uma é um glifo de pessoa do Material Symbols (material-pictos.js),
// às vezes com um objeto do mesmo estilo (prop) — o set não tem pessoa falando ao celular, olhando,
// pensando ou carimbando. prop: [glifo, x, y, lado] no espaço do glifo (viewBox 0 -960 960 960).
// box: quadro da pose (padrão 120 x 160; "sleep" é deitado).
export const POSES = {
  stand: { glyph: "man" },
  walk: { glyph: "directions_walk" },
  run: { glyph: "directions_run" },
  sit: { glyph: "airline_seat_recline_normal" },
  drive: { glyph: "airline_seat_recline_extra" },
  phone: { glyph: "man", prop: ["call", 590, -930, 230] },
  watch: { glyph: "man", prop: ["visibility", 600, -1000, 270] },
  point: { glyph: "follow_the_signs" },
  raise: { glyph: "emoji_people" },
  shrug: { glyph: "accessibility" },
  think: { glyph: "man", prop: ["question_mark", 590, -1010, 260] },
  stamp: { glyph: "emoji_people", prop: ["approval", 50, -975, 210] },
  cheer: { glyph: "accessibility_new" },
  sleep: { glyph: "hotel", box: [0, 0, 180, 110] },
};

// Nomes alternativos (português e sinônimos) -> pose. Comparação sem acento, com hífens.
const POSE_ALIASES = {
  "em-pe": "stand", parado: "stand", "de-pe": "stand", standing: "stand",
  andando: "walk", caminhando: "walk", walking: "walk",
  correndo: "run", running: "run",
  sentado: "sit", sentada: "sit", sitting: "sit", seated: "sit",
  dirigindo: "drive", driving: "drive", motorista: "drive",
  telefone: "phone", celular: "phone", ligando: "phone", "no-telefone": "phone", "no-celular": "phone", call: "phone",
  olhando: "watch", observando: "watch", assistindo: "watch", vigiando: "watch", looking: "watch",
  apontando: "point", pointing: "point",
  "mao-levantada": "raise", "levantando-a-mao": "raise", acenando: "raise", wave: "raise", waving: "raise",
  "dando-de-ombros": "shrug", "de-ombros": "shrug", "bracos-abertos": "shrug",
  pensando: "think", duvida: "think", thinking: "think",
  carimbando: "stamp", aprovando: "stamp", carimbo: "stamp",
  comemorando: "cheer", celebrando: "cheer", vibrando: "cheer", celebrate: "cheer",
  dormindo: "sleep", deitado: "sleep", sleeping: "sleep",
};
const warnedPoses = new Set();

// Nome de pose como veio do YAML -> pose conhecida. Desconhecida vira "stand", com aviso (uma vez por nome).
export function resolvePose(name) {
  if (!name) return "stand";
  if (POSES[name]) return name;
  const key = String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (POSES[key]) return key;
  if (POSE_ALIASES[key]) return POSE_ALIASES[key];
  if (!warnedPoses.has(name)) {
    warnedPoses.add(name);
    console.warn(`⚠ pose "${name}" não existe; usei "stand". Poses: ${Object.keys(POSES).join(", ")} (ou em português: sentado, andando, pensando…)`);
  }
  return "stand";
}

// Quadrado onde o glifo é desenhado, centralizado no quadro da pose.
export function glyphSquare(poseName = "stand") {
  const P = POSES[resolvePose(poseName)];
  const [x, y, w, h] = P.box || [0, -8, 120, 168];
  const side = Math.max(w, h) * (P.box ? 1 : 0.95);
  return [x + (w - side) / 2, y + (h - side) / 2, side, side];
}

export function humanBody(poseName = "stand") {
  const P = POSES[resolvePose(poseName)];
  const [x, y, w, h] = glyphSquare(poseName);
  let inner = `<path class="pc" d="${MATERIAL_GLYPHS[P.glyph]}"/>`;
  if (P.prop) {
    const [name, px, py, side] = P.prop;
    inner += `<svg x="${px}" y="${py}" width="${side}" height="${side}" viewBox="0 -960 960 960" overflow="visible"><path class="po" d="${MATERIAL_GLYPHS[name]}"/></svg>`;
  }
  return `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 -960 960 960" overflow="visible">${inner}</svg>`;
}

function signPlate(kind, box) {
  const [x, y, w, h] = box;
  const cx = x + w / 2, cy = y + h / 2, r = Math.max(w, h) * 0.62;
  if (kind === "circle") return `<circle class="ph" cx="${cx}" cy="${cy}" r="${r}"/>`;
  if (kind === "square") return `<rect class="ph" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.18}"/>`;
  if (kind === "triangle") {
    const R = r * 1.3;
    return `<path class="ph" d="M${cx} ${cy - R * 0.95} L${cx + R} ${cy + R * 0.78} L${cx - R} ${cy + R * 0.78} Z" stroke-linejoin="round" stroke-width="${R * 0.12}" style="stroke:var(--hi)"/><path d="M${cx} ${cy - R * 0.72} L${cx + R * 0.8} ${cy + R * 0.64} L${cx - R * 0.8} ${cy + R * 0.64} Z" fill="none" style="stroke:var(--pc)" stroke-width="${R * 0.07}" stroke-linejoin="round"/>`;
  }
  return "";
}

export function machineBody() {
  return `<line class="pos" x1="60" y1="30" x2="60" y2="12" stroke-width="7" stroke-linecap="round"/>
<circle class="po" cx="60" cy="10" r="7"/>
<rect class="po" x="14" y="30" width="92" height="92" rx="22"/>
<circle class="pb" cx="60" cy="76" r="25"/>
<circle class="ph" cx="60" cy="76" r="11"/>
<rect class="po" x="30" y="128" width="60" height="14" rx="7"/>`;
}

function wrap(inner, box, { w, h, cls = "", style = "" } = {}) {
  const [x, y, bw, bh] = box;
  return `<svg class="pic ${cls}" viewBox="${x} ${y} ${bw} ${bh}" ${w ? `width="${w}"` : ""} ${h ? `height="${h}"` : ""} style="${style}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

export function colorStyle(o = {}) {
  const role = (v, d) => {
    if (!v) return `var(--${d})`;
    if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`;
    if (v.startsWith("#")) return v;
    return `var(--${v})`;
  };
  return `--pc:${role(o.color, "fg")};--po:${role(o.object, "fg")};`;
}

export function human(o = {}) {
  const box = glyphSquare(o.pose);
  let inner = "";
  if (o.sign) {
    inner += signPlate(o.sign, box);
    return wrap(inner + humanBody(o.pose), plateBox(o.sign, box), { style: colorStyle({ color: o.color || "on-hi", object: o.object || "on-hi" }) });
  }
  return wrap(humanBody(o.pose), box, { style: colorStyle(o) });
}

// caixa que contém a placa inteira (círculo/quadrado/triângulo)
function plateBox(kind, box) {
  const [x, y, w, h] = box;
  const cx = x + w / 2, cy = y + h / 2, r = Math.max(w, h) * 0.62;
  const R = kind === "triangle" ? r * 1.3 * 1.08 : r * 1.02;
  const top = kind === "triangle" ? cy - R * 0.95 : cy - R, bottom = kind === "triangle" ? cy + R * 0.8 : cy + R;
  return [cx - R, top, 2 * R, bottom - top];
}

export function machine(o = {}) {
  let inner = "";
  const box = [0, 0, 120, 150];
  if (o.sign) inner += signPlate(o.sign, box);
  return wrap(inner + machineBody(), o.sign ? plateBox(o.sign, box) : box, { style: colorStyle(o.sign ? { color: "on-hi", object: o.object || "on-hi" } : o) });
}

// Vários bonequinhos em grade; `highlight` primeiros ficam na cor --hi (ou --em).
export function crowd(o = {}) {
  const n = o.count || 20, cols = o.cols || Math.min(n, 10), hl = o.highlight || 0;
  const rows = Math.ceil(n / cols), cw = 70, chh = 110;
  let inner = "";
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * chh;
    const on = i < hl;
    inner += `<g transform="translate(${x} ${y}) scale(0.55)" class="${on ? "crowd-on" : "crowd-off"}" style="--pc:${on ? `var(--${o.hiColor || "hi"})` : "var(--muted)"}">${humanBody(o.pose || "stand")}</g>`;
  }
  return wrap(inner, [-4, -8, cols * cw, rows * chh], { style: colorStyle(o) });
}

// ---------- cenas ----------
const SCENES = {
  // Mesa de controle com monitor (ex.: Petrov). screen: texto que aparece na tela.
  console(o) {
    const scr = o.screen ?? "";
    return [[0, 0, 420, 280], `
      <rect class="po" x="0" y="196" width="420" height="12" rx="4"/>
      <rect class="po" x="30" y="208" width="12" height="70"/><rect class="po" x="378" y="208" width="12" height="70"/>
      <rect class="po" x="196" y="30" width="200" height="140" rx="10"/>
      <rect class="${o.alarm ? "blink" : "pb"}" ${o.alarm ? 'style="fill:var(--c-alert)"' : ""} x="208" y="42" width="176" height="116" rx="4"/>
      ${scr ? `<text x="296" y="${108 + (o.screenSize || 30) / 3}" text-anchor="middle" class="f-display" font-size="${o.screenSize || 30}" style="letter-spacing:.06em;fill:${o.alarm ? "#fff" : "var(--pc)"}">${scr}</text>` : ""}
      <rect class="po" x="286" y="170" width="20" height="28"/>
      <g transform="translate(40 52) scale(1)">${humanBody("sit")}</g>`];
  },
  // Pessoa em uma mesa com papéis (analista)
  desk(o) {
    return [[0, 0, 300, 260], `
      <rect class="po" x="110" y="150" width="190" height="12" rx="4"/>
      <rect class="po" x="130" y="162" width="10" height="92"/><rect class="po" x="270" y="162" width="10" height="92"/>
      <rect class="pm" x="${o.laptop === false ? 190 : 170}" y="118" width="80" height="30" rx="3" transform="skewX(-12)"/>
      ${o.papers ? `<rect class="pl" x="236" y="128" width="46" height="22" rx="2"/><rect class="pl" x="240" y="120" width="46" height="22" rx="2"/>` : ""}
      <g transform="translate(40 18)">${humanBody("sit")}</g>`];
  },
  // Carro visto de cima. driver/passenger: human|human-watch|human-phone|machine|none ; back: sleep|human|none ; button: true
  "car-top"(o) {
    const seat = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" style="fill:var(--line)" opacity=".7"/>`;
    const headTop = (cx, cy) => `<ellipse cx="${cx}" cy="${cy + 16}" rx="36" ry="17" style="fill:var(--fg)"/><circle cx="${cx}" cy="${cy}" r="23" style="fill:var(--hi);stroke:var(--fg)" stroke-width="5"/>`;
    const machineTop = (cx, cy) => `<rect class="po" x="${cx - 32}" y="${cy - 32}" width="64" height="64" rx="15"/><circle class="pb" cx="${cx}" cy="${cy}" r="15"/><circle class="ph" cx="${cx}" cy="${cy}" r="6.5"/>`;
    const arms = (cx, cy) => `<path d="M${cx - 28} ${cy + 6} L${cx - 22} ${cy - 56} M${cx + 28} ${cy + 6} L${cx + 22} ${cy - 56}" style="stroke:var(--fg)" stroke-width="10" stroke-linecap="round"/>`;
    const occ = (who, cx, cy, isDriver) => {
      if (who === "human") return (isDriver ? arms(cx, cy) : "") + headTop(cx, cy);
      if (who === "human-watch") return `<path d="M${cx + 24} ${cy + 4} L${cx + 4} ${cy - 76}" style="stroke:var(--fg)" stroke-width="10" stroke-linecap="round"/>` + headTop(cx, cy);
      if (who === "human-phone") return headTop(cx, cy) + `<rect x="${cx - 11}" y="${cy + 30}" width="22" height="30" rx="5" style="fill:var(--fg)"/>`;
      if (who === "machine") return (isDriver ? arms(cx, cy) : "") + machineTop(cx, cy);
      return "";
    };
    const back = o.back === "sleep"
      ? `<ellipse cx="172" cy="352" rx="62" ry="19" style="fill:var(--fg)"/><circle cx="96" cy="350" r="23" style="fill:var(--hi);stroke:var(--fg)" stroke-width="5"/><text x="196" y="318" class="f-display" style="fill:var(--fg)" font-size="38">Z</text><text x="226" y="296" class="f-display" style="fill:var(--fg)" font-size="26">z</text>`
      : o.back === "human" ? headTop(150, 345) : "";
    return [[0, 0, 300, 470], `
      <rect x="26" y="8" width="248" height="454" rx="84" style="fill:var(--surface);stroke:var(--fg)" stroke-width="9"/>
      <path d="M64 100 Q150 76 236 100 L220 136 Q150 122 80 136 Z" style="fill:var(--fg)" opacity=".28"/>
      ${seat(64, 196, 82, 84)}${seat(154, 196, 82, 84)}${seat(64, 306, 172, 96)}
      <rect x="68" y="146" width="74" height="16" rx="8" style="fill:var(--fg)"/>
      ${o.button ? `<circle cx="196" cy="146" r="17" style="fill:var(--c-alert, var(--em))"/>` : ""}
      ${occ(o.driver, 105, 236, true)}${occ(o.passenger, 195, 236, false)}${back}`];
  },
  // Juiz atrás da bancada com martelo
  judge(o) {
    return [[0, 0, 320, 260], `
      <g transform="translate(100 6)">${humanBody("sit")}</g>
      <rect class="po" x="40" y="118" width="240" height="140" rx="6"/>
      <rect class="pb" x="60" y="140" width="200" height="8" rx="4" opacity=".25"/>
      <g transform="rotate(-30 236 96)"><rect class="po" x="222" y="70" width="34" height="22" rx="4"/><rect class="po" x="236" y="90" width="7" height="40" rx="3"/></g>`];
  },
  // Elevador com pessoa e botão
  elevator(o) {
    return [[0, 0, 300, 300], `
      <rect x="20" y="10" width="200" height="280" rx="8" fill="none" style="stroke:var(--fg)" stroke-width="10"/>
      <line x1="120" y1="16" x2="120" y2="284" style="stroke:var(--line)" stroke-width="4"/>
      <g transform="translate(62 104) scale(1.05)">${humanBody("stand")}</g>
      <rect x="236" y="96" width="50" height="120" rx="10" style="fill:var(--surface);stroke:var(--fg)" stroke-width="5"/>
      <circle cx="261" cy="126" r="11" style="fill:var(--muted)"/><circle cx="261" cy="156" r="11" style="fill:var(--muted)"/>
      <circle cx="261" cy="190" r="15" class="${o.button === false ? "pm" : "pe"}"/>`];
  },
  // Duas pessoas, lado a lado, cada uma numa mesa (comparação de julgamentos)
  pair(o) {
    return [[0, 0, 560, 260], `
      <g transform="translate(0 0)">${SCENES.desk({ papers: true })[1]}</g>
      <g transform="translate(270 0)">${SCENES.desk({ papers: true })[1]}</g>`];
  },
};

export function scene(o = {}) {
  const fn = SCENES[o.name];
  if (!fn) throw new Error(`Cena "${o.name}" não existe. Disponíveis: ${Object.keys(SCENES).join(", ")}`);
  const [box, inner] = fn(o);
  return wrap(inner, box, { style: colorStyle(o) });
}

export function picto(o) {
  const k = o.picto;
  if (k === "human") return human(o);
  if (k === "machine" || k === "robot") return machine(o);
  if (k === "crowd") return crowd(o);
  if (k === "scene") return scene(o);
  throw new Error(`picto "${k}" desconhecido (use human | machine | crowd | scene)`);
}

export const SCENE_NAMES = Object.keys(SCENES);
