// Identificador persistente de slide (uid): não depende do layout nem da posição na lista. Serve para casar o mesmo
// slide entre versões (junção do que a pessoa e a IA mexeram ao mesmo tempo), para marcas de revisão, cobertura da
// transformação e histórico. Decks antigos ganham uid na primeira gravação (migração sem perder nada).
export function newUid() {
  const r = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 2 ** 32, Math.random() * 2 ** 32];
  return `s${(r[0] >>> 0).toString(36)}${(r[1] >>> 0).toString(36)}`.slice(0, 12);
}
// garante um uid em cada slide (e troca uid repetido, que aparece quando alguém duplica um slide copiando o YAML)
export function ensureUids(spec) {
  if (!spec || !Array.isArray(spec.slides)) return 0;
  const seen = new Set();
  let added = 0;
  for (const s of spec.slides) {
    if (!s || typeof s !== "object") continue;
    if (typeof s.uid !== "string" || !s.uid || seen.has(s.uid)) { s.uid = newUid(); added++; }
    seen.add(s.uid);
  }
  return added;
}
