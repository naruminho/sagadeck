// Cabeçalho e rodapé dos slides, com variáveis.
//
//   footer: "Texto"                     -> texto à esquerda + número à direita (como sempre foi)
//   footer: false                       -> sem rodapé
//   footer: { left: "{autor} · {evento}", center: "", right: "{pagina} / {total}" }
//   header: { left: "{depto}", right: "{data:DD/MM/AAAA}" }
//
// Variáveis: {titulo} {autor} {evento} {depto} {data} {data:MASCARA} {pagina} {n} {total}
//   {pagina} = 01, 02… · {n} = 1, 2… · MASCARA: DD MM AAAA AA MMM (jan) MMMM (janeiro) — também YYYY/YY
// Campos do deck usados: title, author, event, department, date (AAAA-MM-DD; sem date, usa a data de hoje).
import { esc, plain } from "./markup.js";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function formatDate(date, mask = "DD/MM/AAAA") {
  const d = date instanceof Date ? date : parseDate(date);
  if (!d) return String(date ?? "");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return mask.replace(/MMMM|MMM|AAAA|YYYY|AA|YY|DD|MM/g, (t) => ({
    DD: dd, MM: mm, AAAA: yyyy, YYYY: yyyy, AA: yyyy.slice(2), YY: yyyy.slice(2), MMM: MESES[d.getMonth()].slice(0, 3), MMMM: MESES[d.getMonth()],
  })[t]);
}

function parseDate(v) {
  if (v == null || v === "" || v === "hoje") return new Date();
  if (v instanceof Date) return v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const br = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);
  return null;
}

export function fillTokens(tpl, spec, i, total) {
  const vars = {
    titulo: spec.title, autor: spec.author, evento: spec.event, depto: spec.department,
    pagina: String(i + 1).padStart(2, "0"), n: String(i + 1), total: String(total),
  };
  return String(tpl ?? "").replace(/\{(\w+)(?::([^}]*))?\}/g, (all, k, arg) => {
    if (k === "data") return formatDate(spec.date, arg || "DD/MM/AAAA");
    return k in vars ? String(vars[k] ?? "") : all;
  });
}

// Normaliza footer/header do deck em { left, center, right } (ou null = não tem)
export function barSlots(v, spec, kind) {
  if (v === false) return null;
  if (v == null) return kind === "footer" && spec.title ? { left: "{titulo}", right: "{pagina}" } : null;
  if (typeof v === "string") return { left: v, right: "{pagina}" };
  if (typeof v === "object") return { left: v.left || "", center: v.center || "", right: v.right || "" };
  return null;
}

export function barHTML(kind, spec, i, total) {
  const slots = barSlots(spec[kind], spec, kind);
  if (!slots) return "";
  const cell = (pos) => {
    const txt = fillTokens(slots[pos], spec, i, total).trim();
    return `<span class="bar-${pos}${/^\d+$/.test(txt) ? " fn" : ""}">${esc(plain(txt))}</span>`;
  };
  if (!["left", "center", "right"].some((p) => String(slots[p] || "").trim())) return "";
  return `<div class="${kind === "footer" ? "foot" : "headbar"} f-label">${cell("left")}${cell("center")}${cell("right")}</div>`;
}
