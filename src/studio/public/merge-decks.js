// Junção a três do deck, para nada se perder quando a pessoa mexe enquanto a IA pensa.
//   base = o deck quando o pedido foi para a IA · meu = o que a pessoa tem agora · ia = o que a IA devolveu
// Regras: o que só a IA mudou entra; o que só a pessoa mudou fica; se os dois mudaram a MESMA coisa, vale a da
// pessoa (e o conflito é avisado). Com uid (identidade persistente do slide), os slides são casados pela identidade e
// a junção é campo a campo: a IA muda o título, a pessoa move uma imagem do mesmo slide, as duas coisas ficam; os
// ajustes visuais (visualEdits) juntam objeto a objeto. Sem uid (deck antigo), casa pelo conteúdo, como antes.
// Serve ao Studio (navegador) e ao servidor (Node): globalThis.SagadeckMerge.
(function (root) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

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

  // campo a campo; objetos de ajuste (visualEdits e cada objeto dentro) juntam por chave
  const DEEP = new Set(["visualEdits"]);
  function mergeFields(b, m, a, deep, conflict) {
    const out = {};
    for (const k of new Set([...Object.keys(b || {}), ...Object.keys(m || {}), ...Object.keys(a || {})])) {
      const bv = b?.[k], mv = m?.[k], av = a?.[k];
      let v;
      if (eq(bv, mv)) v = av;
      else if (eq(bv, av) || eq(mv, av)) v = mv;
      else if (deep && isObj(bv) && isObj(mv) && isObj(av)) v = mergeFields(bv, mv, av, deep > 1 ? deep - 1 : 0, conflict);
      else if (!deep && DEEP.has(k) && isObj(mv) && isObj(av)) v = mergeFields(isObj(bv) ? bv : {}, mv, av, 2, conflict);
      else { v = mv; conflict(); }
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  // um lado sem uid (deck recém-gerado, página que ainda não recarregou): o slide herda o uid do mesmo slide do
  // outro lado (casado pelo conteúdo; listas do mesmo tamanho, pela posição). Sem isso, o uid parece uma mudança
  // da pessoa e a mudança da IA se perde.
  const strip = (s) => { if (!isObj(s) || !("uid" in s)) return s; const { uid, ...r } = s; return r; };
  function adopt(target, source) {
    if (!target.some((s) => isObj(s) && !s.uid) || !source.some((s) => s?.uid)) return target;
    const map = match(target.map(strip), source.map(strip));
    const used = new Set(target.map((s) => s?.uid).filter(Boolean));
    const taken = new Set(map.values());
    return target.map((s, i) => {
      if (!isObj(s) || s.uid) return s;
      const j = map.has(i) ? map.get(i) : target.length === source.length && !taken.has(i) ? i : -1;
      const u = j >= 0 ? source[j]?.uid : null;
      if (!u || used.has(u)) return s;
      used.add(u);
      return { ...s, uid: u };
    });
  }

  function mergeByUid(bs, ms, as, conflicts) {
    const B = new Map(bs.map((s, i) => [s.uid, { s, i }])), M = new Map(ms.map((s) => [s.uid, s])), A = new Map(as.filter((s) => s?.uid).map((s) => [s.uid, s]));
    const merged = (uid) => {
      const b = B.get(uid);
      let hit = false;
      const s = mergeFields(b.s, M.get(uid), A.get(uid), 0, () => { hit = true; });
      if (hit) conflicts.push(b.i);
      return s;
    };
    const inBoth = (u) => B.has(u);
    const userOrder = ms.map((s) => s.uid).filter(inBoth), baseOrder = bs.map((s) => s.uid).filter((u) => M.has(u));
    const userReordered = !eq(userOrder, baseOrder);
    const out = [];
    const placed = new Set();
    const push = (s) => { out.push(s); if (s?.uid) placed.add(s.uid); };
    if (!userReordered) {
      // a ordem é a da IA (ela pode ter inserido, apagado e reordenado)
      for (const s of as) {
        if (!s?.uid || !B.has(s.uid)) { push(s); continue; }   // slide novo da IA
        if (!M.has(s.uid)) continue;                            // a pessoa apagou
        push(merged(s.uid));
      }
      // a IA apagou um slide que a pessoa mudou: fica o da pessoa (conflito), no lugar em que estava
      bs.forEach((b, i) => {
        if (A.has(b.uid) || !M.has(b.uid) || eq(b, M.get(b.uid))) return;
        const prev = bs.slice(0, i).reverse().find((x) => placed.has(x.uid));
        const at = prev ? out.findIndex((x) => x.uid === prev.uid) + 1 : 0;
        out.splice(at, 0, M.get(b.uid)); placed.add(b.uid); conflicts.push(i);
      });
    } else {
      // a pessoa reorganizou: vale a ordem dela, com o conteúdo junto campo a campo
      for (const s of ms) {
        if (!B.has(s.uid)) { push(s); continue; }                // slide novo da pessoa
        if (!A.has(s.uid)) { if (!eq(B.get(s.uid).s, s)) { push(s); conflicts.push(B.get(s.uid).i); } continue; } // a IA apagou
        push(merged(s.uid));
      }
      // slides novos da IA: depois do mesmo vizinho em que ela pôs
      as.forEach((s, j) => {
        if (s?.uid && B.has(s.uid)) return;
        const prev = as.slice(0, j).reverse().find((x) => x?.uid && placed.has(x.uid));
        const at = prev ? out.findIndex((x) => x.uid === prev.uid) + 1 : out.length;
        out.splice(at, 0, s); if (s?.uid) placed.add(s.uid);
      });
    }
    // slides novos da pessoa (quando a ordem é a da IA): depois do vizinho de antes
    if (!userReordered) ms.forEach((s, j) => {
      if (B.has(s.uid) || placed.has(s.uid)) return;
      const prev = ms.slice(0, j).reverse().find((x) => placed.has(x.uid));
      const at = prev ? out.findIndex((x) => x.uid === prev.uid) + 1 : 0;
      out.splice(at, 0, s); placed.add(s.uid);
    });
    return out;
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
    let bs = base.slides || [], ms = mine.slides || [], as = ai.slides || [];
    bs = adopt(bs, ms); ms = adopt(ms, bs); bs = adopt(bs, as); as = adopt(as, bs);
    const conflicts = [];
    let kept = false;
    const withUid = (list) => list.every((s) => s && typeof s.uid === "string" && s.uid);
    if (eq(bs, ms)) deck.slides = as;                       // a pessoa não mexeu nos slides
    else if (eq(bs, as)) deck.slides = ms;                  // a IA não mexeu nos slides
    else if (withUid(bs) && withUid(ms)) deck.slides = mergeByUid(bs, ms, as, conflicts);
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
