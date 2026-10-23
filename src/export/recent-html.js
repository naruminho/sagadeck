// HTML que este processo acabou de gravar (build, exportação, conferência). No Windows, o antivírus segura por 15 a
// 20 s a primeira leitura pelo Node de um HTML grande recém-gravado (o Chrome abre na hora): a abertura no Chrome
// (browser.js: openDeck) usa o texto da memória em vez de reler o arquivo. Vale só enquanto o arquivo no disco é o
// mesmo (tamanho e data); guarda só os últimos (o Studio fica aberto o dia todo). Módulo à parte, sem o Playwright,
// para o build gravar por aqui sem carregar o navegador.
import fs from "node:fs";
import path from "node:path";

const RECENT = new Map(); // caminho -> { html, size, mtimeMs }

export function writeDeckHTML(file, html) {
  fs.writeFileSync(file, html);
  const key = path.resolve(file), st = fs.statSync(file);
  RECENT.delete(key);
  RECENT.set(key, { html, size: st.size, mtimeMs: st.mtimeMs });
  while (RECENT.size > 4) RECENT.delete(RECENT.keys().next().value);
}

export function recentHTML(file) {
  const r = RECENT.get(path.resolve(file));
  if (!r) return null;
  const st = fs.statSync(file, { throwIfNoEntry: false });
  return st && st.size === r.size && st.mtimeMs === r.mtimeMs ? r.html : null;
}
