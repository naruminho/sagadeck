// Votação da plateia pela rede: o que o motor e o servidor precisam saber em comum sobre as enquetes com `live: true`.
// As rotas ficam em src/studio/vote-routes.js; o lado do slide, em src/runtime/runtime.js ("votos pela rede").
import { plain } from "./markup.js";

export const MAX_OPTIONS = 8; // as letras A–H da enquete

// o nome da enquete no endereço de voto: só letras minúsculas, números e hífen
export const voteKey = (id) => String(id ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

const labelOf = (o) => plain(typeof o === "string" || typeof o === "number" ? String(o) : o?.label ?? o?.text ?? "").slice(0, 200);

// As enquetes com votação pela rede de um deck: chave -> { question, options } em texto puro (é só isso que a página
// de voto mostra). Vale o slide `poll` e o elemento `{ poll: id, live: true }` dentro de blocos. A enquete de decisão
// (`manual: true`) não vota pela rede.
export function livePolls(spec) {
  const out = new Map();
  const add = (id, question, options) => {
    const key = voteKey(id);
    if (!key || out.has(key) || !Array.isArray(options) || !options.length) return;
    out.set(key, { question: plain(question || "").slice(0, 300), options: options.slice(0, MAX_OPTIONS).map(labelOf) });
  };
  for (const raw of spec?.slides || []) {
    if (!raw || typeof raw !== "object") continue;
    const s = { ...(spec.defaults || {}), ...raw };
    const title = s.question || s.title || "";
    if (s.layout === "poll" && s.live && !s.manual) add(s.id || s.poll, title, s.options);
    const walk = (v, depth) => {
      if (!v || typeof v !== "object" || depth > 12) return;
      if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
      if (v !== s && v.poll != null && typeof v.poll !== "object" && v.live) add(v.poll, v.question || title, v.options);
      for (const [k, x] of Object.entries(v)) if (k !== "notes") walk(x, depth + 1);
    };
    walk(s, 0);
  }
  return out;
}
