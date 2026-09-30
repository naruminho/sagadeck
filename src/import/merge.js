// Slides progressivos → um slide que se monta por cliques. Muita gente "anima" no PowerPoint copiando o slide e
// acrescentando partes (o ciclo da água em 7 slides). Aqui cada elemento aparece no clique em que surgiu (step) e
// some no clique em que saiu (exit). Sem IA: é o mesmo desenho, só que num slide.
const keyOf = (e) => { const { step, exit, deco, ...rest } = e || {}; return JSON.stringify(rest); };

export function mergeProgressive(slides) {
  const list = (slides || []).filter((s) => s && Array.isArray(s.elements));
  if (!list.length) throw new Error("nenhum slide com elementos para juntar");
  if (list.length === 1) return structuredClone(list[0]);
  const out = [];
  let alive = new Map(); // chave -> elemento no resultado (vivo no passo anterior)
  list.forEach((s, k) => {
    const now = new Map();
    for (const e of s.elements) {
      const key = keyOf(e);
      if (now.has(key)) { // repetido no mesmo slide: outra instância
        const c = structuredClone(e); if (k > 0) c.step = k; out.push(c); continue;
      }
      if (alive.has(key)) now.set(key, alive.get(key));
      else { const c = structuredClone(e); if (k > 0) c.step = k; out.push(c); now.set(key, c); }
    }
    for (const [key, el] of alive) if (!now.has(key)) el.exit = k;
    alive = now;
  });
  const first = list[0];
  const notes = list.map((s) => s.notes).filter(Boolean).join("\n\n");
  return {
    ...structuredClone({ ...first, elements: undefined, notes: undefined }),
    elements: out,
    ...(notes ? { notes } : {}),
    original: { ...(first.original || {}), merged: list.map((s) => s.original?.slide).filter(Boolean) },
  };
}

// é uma sequência progressiva? (cada slide mantém boa parte do anterior: o mesmo desenho crescendo)
export function isProgressive(slides) {
  if (!slides || slides.length < 2) return false;
  for (let k = 1; k < slides.length; k++) {
    const prev = new Set((slides[k - 1].elements || []).map(keyOf));
    const cur = (slides[k].elements || []).map(keyOf);
    const kept = cur.filter((x) => prev.has(x)).length;
    if (!prev.size || kept / prev.size < 0.5) return false;
  }
  return true;
}
