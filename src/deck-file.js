// Gravar o .yaml do deck sem estragar o arquivo.
//
// O arquivo é da pessoa: pode ter comentários, estilos ({ a: 1 } numa linha, blocos |) e ordem própria. Regravar tudo
// com YAML.stringify apaga isso e, a cada salvamento, "mexe" em slides que ninguém tocou. Aqui:
//   1. o arquivo atual é aberto como documento YAML e só os nós que MUDARAM são trocados (campo a campo, item a item);
//      slides iguais, inclusive movidos de lugar, são reaproveitados com comentários e formatação;
//   2. linhas intocadas voltam byte a byte (a biblioteca só normaliza o espaço antes de um comentário);
//   3. o texto final é relido e comparado com o deck: se não bater, grava o deck inteiro (correção primeiro);
//   4. a troca é atômica: escreve num temporário ao lado e renomeia (nunca fica um arquivo pela metade).
import fs from "node:fs";
import { renameRetry } from "./fs-retry.js";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import YAML from "yaml";

const same = (a, b) => isDeepStrictEqual(a, b);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const publicOf = (spec) => Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(spec))).filter(([k]) => !k.startsWith("_")));

export const fullYaml = (spec) => YAML.stringify(publicOf(spec), { indent: 2 });

// troca o valor de um par chave/valor mantendo o nó (e o comentário) quando os dois lados são escalares
function setValue(doc, map, key, oldVal, newVal) {
  const node = map.get(key, true);
  if (YAML.isScalar(node) && !isObj(newVal) && !Array.isArray(newVal) && !isObj(oldVal) && !Array.isArray(oldVal)) {
    node.value = newVal;
    if (typeof newVal === "string" && newVal.includes("\n")) node.type = "BLOCK_LITERAL";
    return;
  }
  if (YAML.isMap(node) && isObj(oldVal) && isObj(newVal)) return syncMap(doc, node, oldVal, newVal);
  if (YAML.isSeq(node) && Array.isArray(oldVal) && Array.isArray(newVal)) return syncSeq(doc, node, oldVal, newVal);
  map.set(key, doc.createNode(newVal));
}

function syncMap(doc, map, oldObj, newObj) {
  for (const k of Object.keys(oldObj)) if (!(k in newObj)) map.delete(k);
  for (const [k, v] of Object.entries(newObj)) {
    if (!(k in oldObj)) map.set(k, doc.createNode(v));
    else if (!same(oldObj[k], v)) setValue(doc, map, k, oldObj[k], v);
  }
}

// Itens de lista: primeiro reaproveita os iguais (mesmo que tenham mudado de lugar), depois edita no lugar os que
// estão na mesma posição e são do mesmo tipo (mesmo layout), e só então cria nós novos.
function syncSeq(doc, seq, oldArr, newArr) {
  const nodes = seq.items, used = new Set(), out = new Array(newArr.length);
  newArr.forEach((v, j) => {
    let best = -1;
    oldArr.forEach((o, i) => { if (!used.has(i) && same(o, v) && (best < 0 || Math.abs(i - j) < Math.abs(best - j))) best = i; });
    if (best >= 0) { used.add(best); out[j] = nodes[best]; }
  });
  newArr.forEach((v, j) => {
    if (out[j]) return;
    const o = oldArr[j];
    if (j < oldArr.length && !used.has(j) && isObj(o) && isObj(v) && o.layout === v.layout && YAML.isMap(nodes[j])) {
      used.add(j); syncMap(doc, nodes[j], o, v); out[j] = nodes[j];
    } else if (j < oldArr.length && !used.has(j) && !isObj(o) && !Array.isArray(o) && !isObj(v) && !Array.isArray(v) && YAML.isScalar(nodes[j])) {
      used.add(j); nodes[j].value = v; out[j] = nodes[j];
    } else out[j] = doc.createNode(v);
  });
  seq.items = out;
}

// A biblioteca normaliza espaços (antes de comentário, dentro de [ ] e { }). Linha cujo conteúdo sem espaços é igual
// ao de uma linha do arquivo original volta como estava. Seguro: se uma troca dessas mudasse o sentido, a releitura
// em deckText não bateria com o deck e a gravação cairia na escrita completa.
function keepOriginalSpacing(original, text) {
  const norm = (l) => l.replace(/\s+/g, "");
  const pool = new Map();
  for (const l of original.split("\n")) { const k = norm(l); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(l); }
  return text.split("\n").map((l) => { const q = pool.get(norm(l)); return q && q.length ? q.shift() : l; }).join("\n");
}

export function deckText(spec, currentText) {
  const want = publicOf(spec);
  if (currentText != null) {
    try {
      const doc = YAML.parseDocument(currentText);
      if (!doc.errors.length && YAML.isMap(doc.contents)) {
        const have = doc.toJS() || {};
        if (same(have, want)) return currentText; // nada mudou: o arquivo fica intocado
        syncMap(doc, doc.contents, have, want);
        const text = keepOriginalSpacing(currentText, doc.toString({ lineWidth: 0 }));
        if (same(YAML.parse(text), want)) return text;
      }
    } catch { /* cai na escrita completa */ }
  }
  return fullYaml(want);
}

// Portátil: caminho absoluto que aponta para DENTRO da pasta do deck vira relativo (mudar a pasta de lugar ou mandar
// para outra pessoa não quebra). Fora da pasta fica como está (o .sagadeck empacotado traz esses para dentro).
const FILE_KEYS = new Set(["image", "foreground", "src", "file", "audio", "video", "css", "widgets", "poster"]);
const isAbs = (p) => typeof p === "string" && (path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) && !/^[a-z]+:\/\//i.test(p);
export function relativizePaths(spec, deckDir) {
  const dir = path.resolve(deckDir);
  const fix = (p) => {
    if (!isAbs(p)) return p;
    const rel = path.relative(dir, path.resolve(p));
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel.split(path.sep).join("/") : p;
  };
  const walk = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => (FILE_KEYS.has(key) && typeof x === "string" ? fix(x) : walk(x, key)));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, FILE_KEYS.has(k) && typeof x === "string" ? fix(x) : walk(x, k)]));
    return v;
  };
  return walk(spec, "");
}

// grava de forma atômica: temporário na mesma pasta + rename (no Windows, rename substitui o destino)
export function writeDeckFile(file, spec) {
  let current = null;
  try { current = fs.readFileSync(file, "utf8"); } catch { /* arquivo novo */ }
  const text = deckText(relativizePaths(publicOf(spec), path.dirname(file)), current);
  if (text === current) return false;
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, text, "utf8");
  try { renameRetry(tmp, file); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  return true;
}
