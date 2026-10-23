// Renomear tolerante a arquivo travado. A biblioteca mora em Documentos, que no Windows costuma estar no OneDrive:
// enquanto sincroniza (e também o antivírus ou o indexador), o arquivo fica preso por um instante e o rename falha
// com EPERM/EBUSY/EACCES. Em vez de perder o salvamento da pessoa, tenta de novo com espera curta e crescente
// (~4 s no total: a CI do Windows já segurou o arquivo por mais de 1 s). Qualquer outro erro (destino inexistente, disco cheio…) sobe na hora.
//
// Copiar e remover pasta NÃO usam fs.cpSync/fs.rmSync recursivos: o código nativo deles (std::filesystem) no
// Windows quebra o processo inteiro (0xC0000409, sem exceção para pegar) ou "faz nada" quando o caminho tem
// acento ou caractere fora do ASCII (nodejs/node#54476, #61878) — "Relatório (cópia)" da biblioteca é o caso da
// vida real. A cópia/remoção caminha na mão por readdir/copyFile/unlink/rmdir (libuv), que lida com acento, e
// cada arquivo ainda tolera o travamento de um instante (EPERM/EBUSY/EACCES), como o rename.
import fs from "node:fs";
import path from "node:path";

const LOCKED = new Set(["EPERM", "EBUSY", "EACCES"]);
export const RENAME_DELAYS = [20, 40, 80, 150, 250, 450, 700, 1000, 1300];

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// tenta de novo enquanto o erro for "travado por um instante"; o resto sobe na hora
function retry(delays, fn) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) {
      if (!LOCKED.has(e?.code) || i >= delays.length) throw e;
      pause(delays[i]);
    }
  }
}

export function renameRetry(from, to, { delays = RENAME_DELAYS } = {}) {
  return retry(delays, () => fs.renameSync(from, to));
}

// arquivo ou pasta inteira (com imagens): duplicar uma apresentação é o caso — no Windows o antivírus segura o
// arquivo recém-criado por um instante e a cópia falhava com EPERM (era o flake do CI no "mover (pasta inteira…)").
export function copyRetry(from, to, { delays = RENAME_DELAYS } = {}) {
  const st = fs.statSync(from);
  if (!st.isDirectory()) return retry(delays, () => fs.copyFileSync(from, to));
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    copyRetry(path.join(from, e.name), path.join(to, e.name), { delays });
  }
}

// pasta inteira ou arquivo: a lixeira apaga de vez e o import limpa a área de trabalho; no Windows um arquivo
// travado derrubava a operação e o rmSync recursivo ainda errava com caminho acentuado (apagava nada, em silêncio).
export function removeRetry(target, { delays = RENAME_DELAYS } = {}) {
  let st;
  try { st = fs.lstatSync(target); } catch (e) { if (e?.code === "ENOENT") return; throw e; }
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(target)) removeRetry(path.join(target, name), { delays });
    return retry(delays, () => fs.rmdirSync(target));
  }
  return retry(delays, () => fs.unlinkSync(target));
}
