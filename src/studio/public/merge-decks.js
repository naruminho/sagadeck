// Junção a três do deck, para nada se perder quando a pessoa mexe enquanto a IA pensa.
//   base = o deck quando o pedido foi para a IA · meu = o que a pessoa tem agora · ia = o que a IA devolveu
// Regras: o que só a IA mudou entra; o que só a pessoa mudou fica; se os dois mudaram a MESMA coisa, vale a da
// pessoa (e o conflito é avisado). Slides são casados pelo conteúdo, então inserções e remoções da IA não
// embaralham a edição da pessoa. Serve ao Studio (navegador) e ao servidor (Node): globalThis.SagadeckMerge.
(function (root) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // casamento monotônico (LCS) entre duas listas de slides iguais: devolve Map(índice em a -> índice em b)
  function match(a, b) {
    const n = a.length, m = b.length, ka = a.map((x) => JSON.stringify(x)), kb = b.map((x) => JSON.stringify(x));
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const map = new Map();
    for (let i = 0, j = 0; i < n && j < m;) {
      if (ka[i] === kb[j]) { map.set(i, j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
    return map;
  }

  function mergeDecks(base, mine, ai) {
    if (eq(base, mine)) return { deck: ai, conflicts: [], kept: false };
    const deck = {};
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(mine || {}), ...Object.keys(ai || {})]);
    keys.delete("slides");
    for (const k of keys) {
      const v = k.startsWith("_") || !eq(base[k], mine[k]) ? mine[k] : ai[k];
      if (v !== undefined) deck[k] = v;
    }
    const bs = base.slides || [], ms = mine.slides || [], as = ai.slides || [];
    const conflicts = [];
    let kept = false;
    if (eq(bs, ms)) deck.slides = as;                       // a pessoa não mexeu nos slides
    else if (eq(bs, as)) deck.slides = ms;                  // a IA não mexeu nos slides
    else if (ms.length === bs.length) {                     // a pessoa editou slides no lugar
      if (as.length === bs.length) {
        deck.slides = bs.map((b, i) => {
          const userChanged = !eq(b, ms[i]), aiChanged = !eq(b, as[i]);
          if (userChanged && aiChanged && !eq(ms[i], as[i])) conflicts.push(i);
          return userChanged ? ms[i] : as[i];
        });
      } else {                                              // a IA inseriu/removeu: casa pelo conteúdo
        const map = match(bs, as);
        deck.slides = as.slice();
        bs.forEach((b, i) => {
          if (eq(b, ms[i])) return;
          if (map.has(i)) deck.slides[map.get(i)] = ms[i];
          else conflicts.push(i);                           // a IA mudou ou apagou um slide que a pessoa também mudou
        });
      }
    } else {                                                // a pessoa reorganizou os slides enquanto isso: fica a dela
      deck.slides = ms;
      kept = true;
    }
    return { deck, conflicts, kept };
  }

  root.SagadeckMerge = { mergeDecks };
})(typeof globalThis !== "undefined" ? globalThis : window);
