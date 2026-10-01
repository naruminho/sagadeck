// Rotas da revisão das mudanças (aceitar / desfazer, inclusive a proposta pendente ao lado do original) e dos estilos
// da pessoa (salvar, aplicar, tirar, padrão das novas). Saiu de server.js: devolve true quando a rota era daqui.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { styleFromImport } from "../master.js";

export async function styleRoutes({ req, res, pathname, W, persist, readJSON }) {
      // revisão: aceitar (a marca sai) ou desfazer (slide novo sai; alterado volta ao original de original/original.yaml)
  if (pathname === "/api/review" && req.method === "POST") {
    const reply = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); return true; };
    try {
      const b = await readJSON(req);
      const slides = W.spec?.slides || [];
      // proposta pendente (a transformação deixou o original ao lado, porque faltava algo dele): aceitar tira o
      // original do par; desfazer tira a proposta
      const acceptOne = (s) => {
        const pair = new Set(s.review?.status === "pendente" && Array.isArray(s.review.pair) ? s.review.pair : []);
        delete s.review;
        if (pair.size) W.spec.slides = W.spec.slides.filter((x) => !pair.has(x.uid));
      };
      if (b.action === "acceptAll") [...slides].forEach((s) => s.review && acceptOne(s));
      else {
        const s = slides[b.idx];
        if (!s?.review) throw new Error("Este slide não tem mudança para validar.");
        if (b.action === "accept") acceptOne(s);
        else if (b.action === "reject") {
          if (s.review.status === "novo" || s.review.status === "pendente" || s.review.original == null) slides.splice(b.idx, 1);
          else {
            const origFile = W.file && path.join(path.dirname(W.file), "original", "original.yaml");
            if (!origFile || !fs.existsSync(origFile)) throw new Error("Não achei o original (original/original.yaml) para desfazer.");
            const orig = YAML.parse(fs.readFileSync(origFile, "utf8"));
            const back = orig.slides?.[Number(s.review.original) - 1];
            if (!back) throw new Error(`O original não tem o slide ${s.review.original}.`);
            slides[b.idx] = back;
          }
        } else throw new Error("ação desconhecida");
      }
      persist(W);
      return reply(200, { ok: true, spec: W.spec });
    } catch (e) { return reply(400, { error: e.message }); }
  }
  // estilos da pessoa (tema + mestre: src/master.js), guardados na biblioteca e aplicáveis em qualquer deck
  if (pathname.startsWith("/api/styles")) {
    const reply = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); return true; };
    try {
      if (pathname === "/api/styles" && req.method === "GET") return reply(200, { styles: W.library.listStyles(), current: W.spec?.style || null, canExtract: !!(W.spec?.master || W.spec?.import) });
      const b = await readJSON(req);
      if (!W.file) throw new Error("Abra uma apresentação da biblioteca primeiro.");
      const dir = path.dirname(W.file);
      if (pathname === "/api/styles/save") {
        const name = String(b.name || W.spec.style?.name || W.spec.import?.from?.replace(/\.[a-z]+$/i, "") || W.spec.title || "Meu estilo").slice(0, 80);
        const style = W.spec.master ? { name, theme: W.spec.theme, master: W.spec.master, from: W.spec.import?.from || null } : styleFromImport(W.spec, { name });
        return reply(200, W.library.saveStyle(style, dir));
      }
      if (pathname === "/api/styles/default") return reply(200, { ok: true, default: W.library.setDefaultStyle(b.id || null) });
      if (pathname === "/api/styles/apply") {
        W.spec = W.library.applyStyleTo(W.spec, dir, b.id);
        persist(W);
        return reply(200, { ok: true, spec: W.spec });
      }
      if (pathname === "/api/styles/remove") {
        delete W.spec.master; delete W.spec.style;
        if (b.theme) W.spec.theme = b.theme;
        persist(W);
        return reply(200, { ok: true, spec: W.spec });
      }
      return reply(404, { error: "rota de estilo desconhecida" });
    } catch (e) { return reply(400, { error: e.message }); }
  }
  return false;
}

// a IA decidiu mexer no estilo pelo chat (estilo: aplicar | salvar | tirar | padrao); devolve a resposta do chat
export function styleAction({ W, spec, result, persist, isBundledTemplate }) {
  const { action, name } = result.style;
  const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const find = () => W.library.listStyles().find((s) => norm(s.name) === norm(name) || s.id === name) || W.library.listStyles().find((s) => norm(s.name).includes(norm(name)));
  const say = (reply, extra = {}) => ({ ...result, reply, spec: W.spec || spec, ...extra });
  if (!W.file || isBundledTemplate(W.file)) return say("Para usar estilos, a apresentação precisa estar salva na biblioteca.", { talk: true });
  const dir = path.dirname(W.file);
  try {
    if (action === "aplicar") {
      const st = find();
      if (!st) return say(`Não achei o estilo "${name}". Os salvos: ${W.library.listStyles().map((s) => s.name).join(", ") || "nenhum"}.`, { talk: true });
      W.spec = W.library.applyStyleTo(W.spec, dir, st.id); persist(W);
      return say(`${result.reply}\nEstilo "${st.name}" aplicado: moldura, cores e fontes; o conteúdo ficou.`, { spec: W.spec });
    }
    if (action === "tirar") { delete W.spec.master; delete W.spec.style; W.spec.theme = W.spec.theme && typeof W.spec.theme === "string" ? W.spec.theme : "manual"; persist(W); return say(`${result.reply}\nEstilo tirado.`, { spec: W.spec }); }
    if (action === "salvar") {
      const style = W.spec.master ? { name, theme: W.spec.theme, master: W.spec.master, from: W.spec.import?.from || null } : styleFromImport(W.spec, { name });
      const saved = W.library.saveStyle(style, dir);
      return say(`${result.reply}\nEstilo "${saved.name}" salvo na biblioteca.`, { talk: true });
    }
    if (action === "padrao") {
      const st = find();
      if (!st) return say(`Não achei o estilo "${name}".`, { talk: true });
      W.library.setDefaultStyle(st.id);
      return say(`${result.reply}\nAs apresentações novas já nascem no estilo "${st.name}".`, { talk: true });
    }
  } catch (e) { return say(`Não deu: ${e.message}`, { talk: true }); }
  return say("Não entendi o que fazer com o estilo.", { talk: true });
}
