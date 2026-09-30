// Simulador de Git para as dinâmicas ao vivo (duel, terminals): duas pessoas, um remoto (origin/main), um arquivo.
// Quem escreve o slide só diz o que cada um FAZ (edita, commita, dá push, pull, resolve); o simulador calcula o
// resto: diff, push rejeitado, fast-forward, merge automático, conflito (merge a três por linha) e o grafo.
//
//   base: "texto do arquivo"   people: [Ana, Beto]
//   turns: [{ who: 1, edit: {2: "nova linha 2", 5: null}, commit: "mensagem" }, { who: 1, push: true },
//           { who: 2, pull: true }, { who: 2, resolve: "ours" | "theirs" | "both" | {2: "linha"}, commit: "…" },
//           { who: 1, log: true }, { who: 2, say: "texto livre" }]

// linhas novas de b em relação a a (diff por subsequência comum mais longa: inserir uma linha não marca as de baixo)
function added(a, b) {
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (j < m) {
    if (i < n && a[i] === b[j]) { i++; j++; }
    else if (i < n && L[i + 1][j] >= L[i][j + 1]) i++;
    else { out.push(j + 1); j++; }
  }
  return out;
}
const short = (n) => ((n * 2654435761) >>> 0).toString(16).padStart(8, "0").slice(0, 7); // hash estável e curto
const lines = (t) => String(t ?? "").replace(/\r/g, "").replace(/\n$/, "").split("\n");

export function simulateGit(spec = {}) {
  const people = [0, 1].map((i) => {
    const p = (spec.people || [])[i];
    return String((typeof p === "object" ? p?.name : p) || (i ? "Pessoa B" : "Pessoa A"));
  });
  const commits = [];
  const mk = (msg, author, parents, file, lane) => {
    const c = { id: short(commits.length + 7), n: commits.length, msg: String(msg), author, parents, file: [...file], lane };
    commits.push(c);
    return c;
  };
  const root = mk(spec.initial || "primeiro commit", -1, [], lines(spec.base), "main");
  const remote = { head: root };
  const P = people.map((name, i) => ({ i, name, file: [...root.file], head: root, changed: new Set(), conflict: null, ahead: 0 }));
  const ancestors = (c) => { const s = new Set(); const st = [c]; while (st.length) { const x = st.pop(); if (s.has(x)) continue; s.add(x); x.parents.forEach((q) => st.push(q)); } return s; };
  const isAnc = (a, b) => ancestors(b).has(a); // a é ancestral de b (ou igual)
  const base3 = (a, b) => { const A = ancestors(a); let best = null; for (const x of ancestors(b)) if (A.has(x) && (!best || x.n > best.n)) best = x; return best || root; };

  // merge a três por linha (as edições do slide trocam, apagam ou acrescentam linhas: o alinhamento é pelo número)
  function merge3(base, ours, theirs) {
    const n = Math.max(base.length, ours.length, theirs.length);
    const out = [], conflicts = [];
    for (let i = 0; i < n; i++) {
      const b = base[i], o = ours[i], t = theirs[i];
      if (o === t) out.push({ v: o, i });
      else if (o === b) out.push({ v: t, i, from: "theirs" });
      else if (t === b) out.push({ v: o, i, from: "ours" });
      else { out.push({ conflict: true, o, t, i }); conflicts.push(i + 1); }
    }
    return { out, conflicts };
  }
  const flat = (m) => m.out.flatMap((x) => (x.conflict ? [] : x.v === undefined || x.v === null ? [] : [x.v]));

  const frames = [];
  let touched = [[], []]; // linhas que mudaram neste turno, por pessoa (edição, pull, resolução)
  const shown = (p) => (p.conflict ? p.conflict.view : p.file);
  const state = (extra) => ({
    people: P.map((p, i) => ({ name: p.name, file: p.conflict ? p.conflict.view : [...p.file], changed: [...(touched[i] || [])], conflict: p.conflict ? p.conflict.lines : [],
      head: p.head.id, status: p.conflict ? "conflito" : p.changed.size ? "mudou sem commit" : aheadOf(p) ? `${aheadOf(p)} ${aheadOf(p) > 1 ? "commits" : "commit"} à frente` : behindOf(p) ? "desatualizado" : "em dia" })),
    remote: remote.head.id,
    heads: P.map((p) => p.head.id),
    commits: commits.map((c) => ({ id: c.id, msg: c.msg, author: c.author, parents: c.parents.map((q) => q.id), lane: c.lane })),
    ...extra,
  });
  const aheadOf = (p) => [...ancestors(p.head)].filter((c) => !ancestors(remote.head).has(c)).length;
  const behindOf = (p) => [...ancestors(remote.head)].filter((c) => !ancestors(p.head).has(c)).length;
  frames.push(state({ who: -1, cmd: "", out: "", text: `Os dois clonaram o repositório: ${spec.file || "arquivo"} igual para todo mundo.`, event: "start" }));

  for (const [k, t] of (spec.turns || []).entries()) {
    const who = Math.min(1, Math.max(0, (Number(t.who) || 1) - 1)), p = P[who];
    const before = P.map((q) => [...shown(q)]);
    let cmd = "", out = "", text = "", event = ""; // out = o que o terminal mostra; text = a explicação para a plateia
    const edits = (map) => {
      for (const [key, val] of Object.entries(map || {})) {
        const i = Number(key) - 1;
        if (!Number.isInteger(i) || i < 0) throw new Error(`turno ${k + 1}: linha "${key}" inválida (use o número da linha)`);
        while (p.file.length <= i) p.file.push("");
        if (val === null) p.file[i] = null; else p.file[i] = String(val);
        p.changed.add(i + 1);
      }
      const kept = [];
      p.file.forEach((l, i) => { if (l !== null) kept.push(l); });
      if (kept.length !== p.file.length) { p.changed = new Set([...p.changed].filter((n) => n <= kept.length)); p.file = kept; }
    };
    if (t.edit) {
      if (p.conflict) throw new Error(`turno ${k + 1}: ${p.name} está com conflito; use resolve: antes de editar`);
      edits(t.edit);
      const ls = [...p.changed].sort((a, b) => a - b);
      text = `${p.name} mudou a ${ls.length > 1 ? "s linhas" : "linha"} ${ls.join(", ")}.`; event = "edit";
    }
    if (t.resolve != null) {
      if (!p.conflict) throw new Error(`turno ${k + 1}: ${p.name} não tem conflito para resolver`);
      const m = p.conflict.merge, r = t.resolve;
      const merged = m.out.flatMap((x) => {
        if (!x.conflict) return x.v == null ? [] : [x.v];
        if (r === "ours") return x.o == null ? [] : [x.o];
        if (r === "theirs") return x.t == null ? [] : [x.t];
        if (r === "both") return [x.o, x.t].filter((v) => v != null);
        const v = typeof r === "object" ? r[x.i + 1] : undefined;
        if (v === undefined) throw new Error(`turno ${k + 1}: faltou resolver a linha ${x.i + 1} (resolve: {${x.i + 1}: "…"})`);
        return v === null ? [] : [String(v)];
      });
      p.file = merged; p.changed = new Set(p.conflict.lines);
      const theirs = p.conflict.theirs;
      p.conflict = null; p.pendingMerge = theirs;
      cmd = `git add ${spec.file || "arquivo"}`; text = `${p.name} resolveu o conflito: tirou os marcadores e ficou com a versão final.`; event = "resolve";
    }
    if (t.commit) {
      if (p.conflict) throw new Error(`turno ${k + 1}: ${p.name} ainda está com conflito`);
      const parents = p.pendingMerge ? [p.head, p.pendingMerge] : [p.head];
      const c = mk(t.commit, who, parents, p.file, who === 0 ? "a" : "b");
      p.head = c; p.pendingMerge = null; p.changed = new Set();
      cmd = cmd ? `${cmd} && git commit -m "${t.commit}"` : `git commit -am "${t.commit}"`;
      out = `[main ${c.id}] ${t.commit}\n 1 file changed`; event = parents.length > 1 ? "merge-commit" : "commit";
      if (!text) text = parents.length > 1 ? `${p.name} fechou o merge com um commit que tem dois pais.` : `${p.name} guardou a mudança num commit, só na máquina dele(a).`;
    }
    if (t.push) {
      cmd = "git push";
      if (p.conflict || p.changed.size) { out = "Everything up-to-date"; text = "Nada foi enviado: a mudança ainda não virou commit."; event = "noop"; }
      else if (isAnc(remote.head, p.head) && remote.head !== p.head) { out = `To origin\n   ${remote.head.id}..${p.head.id}  main -> main`; remote.head = p.head; text = `O remoto agora tem o que ${p.name} fez.`; event = "push"; }
      else if (remote.head === p.head) { out = "Everything up-to-date"; event = "noop"; }
      else { out = "! [rejected]  main -> main (fetch first)\nerror: failed to push some refs to 'origin'"; text = `Recusado: o remoto tem commits que ${p.name} não tem. Primeiro pull.`; event = "rejected"; }
    }
    if (t.pull) {
      cmd = "git pull";
      if (p.changed.size) throw new Error(`turno ${k + 1}: ${p.name} tem mudanças sem commit; faça commit antes do pull`);
      if (isAnc(remote.head, p.head)) { out = "Already up to date."; event = "noop"; }
      else if (isAnc(p.head, remote.head)) { out = `Updating ${p.head.id}..${remote.head.id}\nFast-forward`; text = `${p.name} só estava atrás: o Git avançou o ponteiro, sem merge.`; p.head = remote.head; p.file = [...remote.head.file]; event = "ff"; }
      else {
        const b = base3(p.head, remote.head), m = merge3(b.file, p.head.file, remote.head.file);
        if (!m.conflicts.length) {
          p.file = flat(m);
          const c = mk(`Merge de origin/main`, who, [p.head, remote.head], p.file, who === 0 ? "a" : "b");
          p.head = c; event = "merge"; out = `Auto-merging ${spec.file || "arquivo"}\nMerge made by the 'ort' strategy.`; text = "As mudanças não se tocam: o Git juntou sozinho, num commit de merge.";
        } else {
          const view = [], clines = [];
          m.out.forEach((x) => {
            if (!x.conflict) { if (x.v != null) view.push(x.v); return; }
            clines.push(view.length + 1); view.push(`<<<<<<< ${p.name} (seu)`);
            if (x.o != null) { clines.push(view.length + 1); view.push(x.o); }
            clines.push(view.length + 1); view.push("=======");
            if (x.t != null) { clines.push(view.length + 1); view.push(x.t); }
            clines.push(view.length + 1); view.push(">>>>>>> origin/main");
          });
          p.conflict = { merge: m, view, lines: clines, theirs: remote.head };
          out = `Auto-merging ${spec.file || "arquivo"}\nCONFLICT (content): Merge conflict in ${spec.file || "arquivo"}\nAutomatic merge failed; fix conflicts and then commit the result.`;
          text = `Os dois mudaram a linha ${m.conflicts.join(", ")}: o Git não escolhe por você.`; event = "conflict";
        }
      }
    }
    if (t.log) { cmd = "git log --graph --oneline --all"; out = logGraph(commits, P, remote); event = event || "log"; }
    if (t.say) text = String(t.say);
    touched = P.map((q, i) => added(before[i], shown(q)));
    frames.push(state({ who, cmd, out, text, event, note: t.note ? String(t.note) : "" }));
  }
  return { people, frames, file: spec.file || "arquivo" };
}

// saída de "git log --graph --oneline --all" do estado atual (do mais novo para o mais velho)
export function logGraph(commits, P, remote) {
  const tags = (c) => {
    const t = [];
    P.forEach((p) => { if (p.head === c) t.push(`${p.name}/HEAD`); });
    if (remote.head === c) t.push("origin/main");
    return t.length ? ` (${t.join(", ")})` : "";
  };
  return [...commits].reverse().map((c) => `${c.parents.length > 1 ? "*   " : c.lane === "b" ? "| * " : "* "}${c.id} ${c.msg}${tags(c)}`).join("\n");
}

// grafo em SVG: três trilhas (pessoa A em cima, main no meio, pessoa B embaixo), um nó por commit
export function graphSVG(frame, people, { h = 240 } = {}) {
  const lanes = { a: 58, main: h / 2, b: h - 58 };
  const cs = frame.commits, gap = 170, w = Math.max(560, 120 + gap * Math.max(1, cs.length - 1)); // o grafo cresce com os commits
  const pos = new Map(cs.map((c, i) => [c.id, { x: 60 + i * gap, y: lanes[c.lane] ?? lanes.main, c }]));
  // commit que já está no remoto sobe para a trilha main
  const onRemote = new Set(); const st = [frame.remote];
  while (st.length) { const id = st.pop(); if (onRemote.has(id)) continue; onRemote.add(id); cs.find((c) => c.id === id)?.parents.forEach((q) => st.push(q)); }
  for (const [id, p] of pos) if (onRemote.has(id)) p.y = lanes.main;
  let g = `<text x="0" y="${lanes.a + 7}" class="gg-lane f-label">${people[0]}</text><text x="0" y="${lanes.main + 7}" class="gg-lane f-label">main</text><text x="0" y="${lanes.b + 7}" class="gg-lane f-label">${people[1]}</text>`;
  g = g.replace(/<text x="0"/g, '<text x="-6" text-anchor="end"');
  cs.forEach((c) => c.parents.forEach((q) => {
    const a = pos.get(q), b = pos.get(c.id);
    g += a.y === b.y ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="gg-edge"/>`
      : `<path d="M${a.x} ${a.y} C${a.x + gap * 0.55} ${a.y} ${b.x - gap * 0.55} ${b.y} ${b.x} ${b.y}" class="gg-edge" fill="none"/>`;
  }));
  const last = cs.at(-1)?.id;
  cs.forEach((c) => {
    const p = pos.get(c.id), who = c.author < 0 ? "gg-root" : c.author === 0 ? "gg-a" : "gg-b";
    g += `<g class="gg-node ${who}${c.id === last ? " gg-new" : ""}${c.parents.length > 1 ? " gg-merge" : ""}"><circle cx="${p.x}" cy="${p.y}" r="${c.parents.length > 1 ? 15 : 13}"/><text x="${p.x}" y="${p.y > h / 2 ? p.y + 40 : p.y - 24}" text-anchor="middle" class="gg-msg f-body">${esc(c.msg.length > 16 ? c.msg.slice(0, 15) + "…" : c.msg)}</text></g>`;
  });
  const rp = pos.get(frame.remote);
  if (rp) g += `<g class="gg-tag"><rect x="${rp.x - 64}" y="${rp.y + 20}" width="128" height="30" rx="15"/><text x="${rp.x}" y="${rp.y + 41}" text-anchor="middle" class="f-label">origin/main</text></g>`;
  return `<svg class="git-graph" viewBox="-110 0 ${w + 190} ${h}" preserveAspectRatio="xMinYMid meet" aria-label="Grafo de commits">${g}</svg>`;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
