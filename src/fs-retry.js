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
