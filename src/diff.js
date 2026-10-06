// diff de decks por uid (cai para o índice quando não há uid): o que entrou,
// saiu, mudou de conteúdo e mudou de lugar. Base para `sagadeck diff`.
export function slideKey(s, i) {
  return s && s.uid ? String(s.uid) : `#${i}`;
}

function changedFields(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (k === "uid" || k === "auto") continue;
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) out.push(k);
  }
  return out;
}

export function diffDecks(a = {}, b = {}) {
  const A = Array.isArray(a.slides) ? a.slides : [];
  const B = Array.isArray(b.slides) ? b.slides : [];
  const am = new Map(), bm = new Map();
  A.forEach((s, i) => am.set(slideKey(s, i), { s, i }));
  B.forEach((s, i) => bm.set(slideKey(s, i), { s, i }));
  const added = [], removed = [], changed = [], moved = [];
  for (const [k, { s, i }] of am) {
    const o = bm.get(k);
    if (!o) { removed.push({ index: i, title: s?.title || "" }); continue; }
    if (o.i !== i) moved.push({ key: k, title: o.s?.title || s?.title || "", from: i, to: o.i });
    const fields = changedFields(s, o.s);
    if (fields.length) changed.push({ index: o.i, key: k, title: o.s?.title || s?.title || "", fields });
  }
  for (const [k, { s, i }] of bm) {
    if (!am.has(k)) added.push({ index: i, title: s?.title || "" });
  }
  return { added, removed, changed, moved, same: !added.length && !removed.length && !changed.length && !moved.length };
}

export function formatDiff(d, { aName = "a", bName = "b" } = {}) {
  if (d.same) return "iguais: nenhum slide entrou, saiu, mudou ou andou.";
  const L = [];
  for (const r of d.removed) L.push(`- slide ${r.index + 1}${r.title ? ` "${r.title}"` : ""} (só em ${aName})`);
  for (const a of d.added) L.push(`+ slide ${a.index + 1}${a.title ? ` "${a.title}"` : ""} (só em ${bName})`);
  for (const m of d.moved) L.push(`> "${m.title || m.key}" andou: ${m.from + 1} → ${m.to + 1}`);
  for (const c of d.changed) L.push(`~ slide ${c.index + 1}${c.title ? ` "${c.title}"` : ""}: ${c.fields.join(", ")}`);
  return L.join("\n");
}
