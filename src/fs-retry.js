// Renomear tolerante a arquivo travado. A biblioteca mora em Documentos, que no Windows costuma estar no OneDrive:
// enquanto sincroniza (e também o antivírus ou o indexador), o arquivo fica preso por um instante e o rename falha
// com EPERM/EBUSY/EACCES. Em vez de perder o salvamento da pessoa, tenta de novo com espera curta e crescente
// (~1 s no total). Qualquer outro erro (destino inexistente, disco cheio…) sobe na hora.
import fs from "node:fs";

const LOCKED = new Set(["EPERM", "EBUSY", "EACCES"]);
export const RENAME_DELAYS = [20, 40, 80, 150, 250, 450];

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function renameRetry(from, to, { delays = RENAME_DELAYS } = {}) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); } catch (e) {
      if (!LOCKED.has(e?.code) || i >= delays.length) throw e;
      pause(delays[i]);
    }
  }
}

// Copiar tolerante ao mesmo travamento (duplicar uma apresentação copia as imagens: no Windows o antivírus ou a
// sincronização segura o arquivo recém-criado por um instante e o cpSync falha com EPERM/EBUSY/EACCES — era o
// flake do CI em "mover (pasta inteira...), renomear e duplicar"). Erro que não é trava sobe na hora.
export function copyRetry(from, to, { delays = RENAME_DELAYS, ...opts } = {}) {
  for (let i = 0; ; i++) {
    try { return fs.cpSync(from, to, { recursive: true, ...opts }); } catch (e) {
      if (!LOCKED.has(e?.code) || i >= delays.length) throw e;
      pause(delays[i]);
    }
  }
}
