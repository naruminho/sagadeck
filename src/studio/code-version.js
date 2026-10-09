// Impressão do código do sagadeck (caminho, data e tamanho de cada arquivo). O Studio guarda a de quando subiu e a
// página consulta de tempos em tempos: se o código mudou no disco (git pull, npm update, merge), o servidor que está
// rodando ainda é o velho e a página avisa "reinicie". Antes, um Studio aberto antes de uma atualização recebia
// arquivos novos do disco com o servidor velho e quebrava em silêncio (nenhum slide abria).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CODE = /\.(m?js|html|css|json)$/i;

export function codeFingerprint(root) {
  const h = crypto.createHash("sha1");
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (CODE.test(e.name)) { try { const st = fs.statSync(p); h.update(`${path.relative(root, p)}|${st.mtimeMs}|${st.size}\n`); } catch {} }
    }
  };
  walk(root);
  return h.digest("hex").slice(0, 16);
}

// a que vale para o servidor: a de quando ele subiu × a de agora (recalculada no máximo a cada poucos segundos)
export function codeWatch(root, { every = 3000 } = {}) {
  const started = codeFingerprint(root);
  let now = started, at = Date.now();
  return () => {
    if (Date.now() - at > every) { now = codeFingerprint(root); at = Date.now(); }
    return { started, now, changed: now !== started };
  };
}
