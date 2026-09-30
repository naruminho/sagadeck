/* Projeto no estilo VS Code: a pasta da apresentação vira uma árvore de arquivos (à esquerda, no lugar dos slides)
   e cada arquivo abre numa aba no centro.
   - Apresentação (sempre a primeira aba): o slide, como sempre.
   - texto da apresentação (.yaml): editor à esquerda e o slide à direita, atualizando enquanto digita.
   - .md / .txt / .csv como texto: editor (o .md com a prévia ao lado).
   - planilha (.csv, .xlsx): a grade com o tipo de cada coluna e sugestões de gráfico com prévia (regras ou IA);
     "Inserir no slide" cria o gráfico ligado à planilha (from:, com Atualizar).
   - imagem: a prévia e "Usar num slide".
   Ctrl+V de um print (fora de um campo de texto) guarda em contexto/. Tudo o que está em contexto/ vai para a IA. */
(function () {
  let ctx = null;
  let treeData = null;
  const openTabs = []; // { path, kind, name, dirty, text, sheet }
  let active = "__deck__";
  const expanded = new Set(["contexto"]);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const api = async (url, body) => {
    const r = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `erro ${r.status}`);
    return j;
  };
  const KIND_ICON = { deck: "presentation", md: "file-text", text: "file-code", sheet: "file-spreadsheet", image: "file-image", pdf: "file-text", doc: "file-text", other: "file" };
  const fileUrl = (p) => `api/project/file?path=${encodeURIComponent(p)}&t=${Date.now()}`;
  const readAsDataUrl = (file) => new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = bad; fr.readAsDataURL(file); });

  // ------------------------------------------------------------------ árvore
  async function refreshTree() {
    const host = $("#project-tree");
    try { treeData = await api("api/project/tree"); }
    catch (e) { treeData = null; host.innerHTML = `<div class="ex-empty">${esc(e.message)}</div>`; return; }
    host.innerHTML = `<div class="ex-root" title="${esc(treeData.name)}"><i class="ic" data-ic="folder-open"></i><b>${esc(treeData.name)}</b></div>${renderEntries(treeData.entries, 0)}`;
    ctx.hydrate(host);
  }
  const rowActions = (e) => e.protected ? "" : `<span class="ex-acts"><i class="ic" data-ic="pencil" data-act="rename" role="button" aria-label="Renomear ${esc(e.name)}" title="Renomear (F2)"></i><i class="ic" data-ic="trash-2" data-act="delete" role="button" aria-label="Apagar ${esc(e.name)}" title="Apagar (Delete)"></i></span>`;
  function renderEntries(list, depth) {
    return list.map((e) => {
      const pad = `style="padding-left:${10 + depth * 14}px"`;
      const sel = selected === e.path ? " sel" : "";
      if (e.type === "dir") {
        const open = expanded.has(e.path);
        return `<div class="ex-row ex-dir${e.protected ? " ex-protected" : ""}${sel}" data-path="${esc(e.path)}" data-type="dir" draggable="${!e.protected}" ${pad} title="${e.protected ? "Pasta do Studio (conversa, cache e lixeira do projeto): só some junto com o projeto" : esc(e.path)}"><i class="ic ex-caret" data-ic="${open ? "chevron-down" : "chevron-right"}"></i><i class="ic" data-ic="folder"></i><span class="ex-name">${esc(e.name)}</span>${rowActions(e)}</div>${open ? renderEntries(e.children || [], depth + 1) : ""}`;
      }
      return `<div class="ex-row ex-file${e.protected ? " ex-protected" : ""}${active === e.path ? " active" : ""}${sel}" data-path="${esc(e.path)}" data-type="file" data-kind="${e.kind}" draggable="${!e.protected}" ${pad} title="${esc(e.path)}"><i class="ic" data-ic="${KIND_ICON[e.kind] || "file"}"></i><span class="ex-name">${esc(e.name)}</span>${rowActions(e)}</div>`;
    }).join("");
  }
  const findEntry = (p, list = treeData?.entries || []) => { for (const e of list) { if (e.path === p) return e; if (e.children) { const f = findEntry(p, e.children); if (f) return f; } } return null; };
  const dirOf = (p) => { const e = findEntry(p); return !p ? "" : e?.type === "dir" ? p : p.split("/").slice(0, -1).join("/"); };
  let selected = "";
  const rowOf = (p) => $(`#project-tree .ex-row[data-path="${CSS.escape(p)}"]`);
  function select(p, { focus = true } = {}) {
    selected = p;
    $("#project-tree").querySelectorAll(".ex-row.sel").forEach((r) => r.classList.remove("sel"));
    const row = rowOf(p);
    row?.classList.add("sel");
    row?.scrollIntoView({ block: "nearest" });
    if (focus) $("#project-tree").focus({ preventScroll: true });
  }
  function openRow(row) {
    if (row.dataset.type === "dir") { expanded.has(row.dataset.path) ? expanded.delete(row.dataset.path) : expanded.add(row.dataset.path); refreshTree(); }
    else openFile(row.dataset.path, row.dataset.kind);
  }

  function bindTree() {
    const host = $("#project-tree");
    host.addEventListener("click", (ev) => {
      if (ev.target.closest(".ex-edit")) return;
      const row = ev.target.closest(".ex-row"); if (!row) return;
      const act = ev.target.closest("[data-act]")?.dataset.act;
      select(row.dataset.path);
      if (act === "rename") return renameEntry(row.dataset.path);
      if (act === "delete") return deleteEntry(row.dataset.path);
      openRow(row);
    });
    // teclado como no VS Code: setas andam, Enter abre, F2 renomeia, Delete apaga
    host.addEventListener("keydown", (ev) => {
      if (ev.target.closest(".ex-edit")) return;
      const rows = [...host.querySelectorAll(".ex-row")], i = rows.findIndex((r) => r.dataset.path === selected);
      const row = rows[i];
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); const n = rows[Math.max(0, Math.min(rows.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1)))]; if (n) select(n.dataset.path); return; }
      if (!row) return;
      if (ev.key === "ArrowRight" && row.dataset.type === "dir" && !expanded.has(selected)) { ev.preventDefault(); expanded.add(selected); refreshTree(); }
      else if (ev.key === "ArrowLeft" && row.dataset.type === "dir" && expanded.has(selected)) { ev.preventDefault(); expanded.delete(selected); refreshTree(); }
      else if (ev.key === "Enter") { ev.preventDefault(); openRow(row); }
      else if (ev.key === "F2") { ev.preventDefault(); renameEntry(selected); }
      else if (ev.key === "Delete") { ev.preventDefault(); deleteEntry(selected); }
    });
    host.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const row = ev.target.closest(".ex-row");
      if (row) select(row.dataset.path, { focus: false });
      menuAt(ev, row);
    });
    host.addEventListener("dblclick", (ev) => { const row = ev.target.closest(".ex-row.ex-file"); if (row && !row.classList.contains("ex-protected") && ev.target.closest(".ex-name")) renameEntry(row.dataset.path); });
    // arrastar: arquivo do computador para uma pasta (envia) ou item da árvore para outra pasta (move)
    host.addEventListener("dragstart", (ev) => { const row = ev.target.closest(".ex-row"); if (row) ev.dataTransfer.setData("text/x-saga-path", row.dataset.path); });
    host.addEventListener("dragover", (ev) => { ev.preventDefault(); host.querySelectorAll(".drop").forEach((r) => r.classList.remove("drop")); ev.target.closest(".ex-dir")?.classList.add("drop"); });
    host.addEventListener("dragleave", () => host.querySelectorAll(".drop").forEach((r) => r.classList.remove("drop")));
    host.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      host.querySelectorAll(".drop").forEach((r) => r.classList.remove("drop"));
      const dir = ev.target.closest(".ex-dir")?.dataset.path ?? "contexto";
      const moving = ev.dataTransfer.getData("text/x-saga-path");
      try {
        if (moving) { if (dirOf(moving) !== dir) { await api("api/project/move", { path: moving, dir }); expanded.add(dir); } }
        else for (const f of ev.dataTransfer.files) await uploadFile(f, dir);
        refreshTree();
      } catch (e) { ctx.toast(e.message); }
    });
  }
  // botão direito: o mesmo menu do resto do Studio
  function menuAt(ev, row) {
    const p = row?.dataset.path || "", prot = !!row?.classList.contains("ex-protected"), isDir = row ? row.dataset.type === "dir" : true;
    const here = row ? (isDir ? p : dirOf(p)) : "";
    const items = [
      row && !isDir && { label: "Abrir", ic: "folder-open", fn: () => openFile(p, row.dataset.kind) },
      !prot && { label: "Novo arquivo", ic: "file-plus", fn: () => newFile(here || "contexto") },
      !prot && { label: "Nova pasta", ic: "folder-plus", fn: () => newFolder(here) },
      !prot && { label: "Enviar arquivos para cá", ic: "upload", fn: () => { uploadTarget = here || "contexto"; $("#ex-upload-input").click(); } },
      row && { sep: true },
      row && !prot && { label: "Renomear", ic: "pencil", key: "F2", fn: () => renameEntry(p) },
      row && { label: "Copiar caminho", ic: "copy", fn: () => navigator.clipboard?.writeText(p).then(() => ctx.toast(`Copiado: ${p}`)) },
      row && !isDir && row.dataset.kind === "image" && { label: "Usar num slide", ic: "plus", fn: () => ctx.insertSlide({ layout: "image", image: p, title: p.split("/").pop().replace(/\.[a-z0-9]+$/i, "") }) },
      row && !prot && { sep: true },
      row && !prot && { label: "Apagar", ic: "trash-2", key: "Delete", danger: true, fn: () => deleteEntry(p) },
    ].filter(Boolean);
    ctx.contextMenu(ev, items);
  }
  // campo de nome dentro da árvore (renomear e criar), como no VS Code: Enter confirma, Esc desiste
  function inlineName(anchorRow, initial, { depth = 0, icon = "file", create = false } = {}) {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement("input"), { className: "ex-edit", value: initial, spellcheck: false });
      input.setAttribute("aria-label", create ? "Nome do novo item" : "Novo nome");
      let row = anchorRow, holder;
      if (create || !row) {
        holder = document.createElement("div");
        holder.className = "ex-row ex-new";
        holder.style.paddingLeft = `${10 + depth * 14}px`;
        holder.innerHTML = `<i class="ic" data-ic="${icon}"></i>`;
        holder.append(input);
        (anchorRow ? anchorRow.after(holder) : $("#project-tree").append(holder));
        ctx.hydrate(holder);
      } else {
        row.classList.add("editing");
        row.querySelector(".ex-name").replaceWith(input);
      }
      input.focus();
      const dot = initial.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : initial.length); // como no VS Code: seleciona o nome sem a extensão
      let done = false;
      const finish = (value) => { if (done) return; done = true; holder?.remove(); resolve(value); };
      input.addEventListener("keydown", (ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") { ev.preventDefault(); finish(input.value.trim() || null); }
        if (ev.key === "Escape") { ev.preventDefault(); finish(null); refreshTree(); }
      });
      input.addEventListener("blur", () => finish(input.value.trim() || null));
    });
  }
  const depthOf = (p) => (p ? p.split("/").length : 0);
  async function newFile(dir = dirOf(selected) || "contexto") {
    expanded.add(dir); await refreshTree();
    const name = await inlineName(dir ? rowOf(dir) : null, "anotações.md", { depth: depthOf(dir), icon: "file-text", create: true });
    if (!name) return refreshTree();
    try { const r = await api("api/project/create", { dir, name, text: "" }); await refreshTree(); select(r.path); openFile(r.path); } catch (e) { ctx.toast(e.message); refreshTree(); }
  }
  async function newFolder(dir = dirOf(selected)) {
    if (dir) { expanded.add(dir); await refreshTree(); }
    const name = await inlineName(dir ? rowOf(dir) : null, "nova pasta", { depth: depthOf(dir), icon: "folder", create: true });
    if (!name) return refreshTree();
    try { const r = await api("api/project/mkdir", { dir, name }); expanded.add(r.path); await refreshTree(); select(r.path); } catch (e) { ctx.toast(e.message); refreshTree(); }
  }
  async function renameEntry(p) {
    const row = rowOf(p); if (!row || row.classList.contains("ex-protected")) return;
    const cur = p.split("/").pop(), name = await inlineName(row, cur);
    if (!name || name === cur) return refreshTree();
    try {
      const r = await api("api/project/rename", { path: p, name });
      const t = openTabs.find((x) => x.path === p);
      if (t) { t.path = r.path; t.name = r.path.split("/").pop(); if (active === p) active = r.path; renderTabs(); }
      if (expanded.has(p)) { expanded.delete(p); expanded.add(r.path); }
      await refreshTree(); select(r.path);
    } catch (e) { ctx.toast(e.message); refreshTree(); }
  }
  // apagar: sem pergunta (vai para a lixeira do projeto) e com Desfazer
  async function deleteEntry(p) {
    const row = rowOf(p); if (!row || row.classList.contains("ex-protected")) return;
    const rows = [...$("#project-tree").querySelectorAll(".ex-row")], i = rows.indexOf(row);
    try {
      const r = await api("api/project/delete", { path: p });
      closeTab(p, true);
      await refreshTree();
      const next = rows[i + 1] || rows[i - 1];
      if (next && rowOf(next.dataset.path)) select(next.dataset.path);
      ctx.toast(`"${p.split("/").pop()}" foi para a lixeira do projeto.`, 8000, { label: "Desfazer", fn: async () => { await api("api/project/restore", { path: r.trashed }); await refreshTree(); select(p); } });
    } catch (e) { ctx.toast(e.message); }
  }
  let uploadTarget = null;
  async function uploadFile(file, dir = "contexto") {
    const r = await api("api/project/upload", { dir, name: file.name, dataUrl: await readAsDataUrl(file) });
    expanded.add(dir);
    return r.path;
  }
  // print colado: vai para contexto/ com data e hora no nome (e a IA passa a ver o texto dos documentos de lá)
  async function savePastedImage(blob) {
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-");
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const path = await uploadFile(new File([blob], `print ${stamp}.${ext}`, { type: blob.type }), "contexto");
    await refreshTree();
    return path;
  }

  // ------------------------------------------------------------------ abas
  function renderTabs() {
    const bar = $("#doc-tabs");
    bar.innerHTML = `<button type="button" class="doc-tab${active === "__deck__" ? " active" : ""}" data-doc="__deck__"><i class="ic" data-ic="presentation"></i><span>Apresentação</span></button>` +
      openTabs.map((t) => `<button type="button" class="doc-tab${active === t.path ? " active" : ""}" data-doc="${esc(t.path)}" title="${esc(t.path)}"><i class="ic" data-ic="${KIND_ICON[t.kind] || "file"}"></i><span>${esc(t.name)}</span>${t.dirty ? '<span class="doc-dirty" aria-label="não gravado"></span>' : ""}<i class="ic doc-close" data-ic="x" data-close="${esc(t.path)}" role="button" aria-label="Fechar ${esc(t.name)}"></i></button>`).join("");
    ctx.hydrate(bar);
  }
  function bindTabs() {
    $("#doc-tabs").addEventListener("click", (ev) => {
      const c = ev.target.closest("[data-close]"); if (c) { ev.stopPropagation(); closeTab(c.dataset.close); return; }
      const t = ev.target.closest("[data-doc]"); if (t) activate(t.dataset.doc);
    });
    $("#doc-tabs").addEventListener("auxclick", (ev) => { const t = ev.target.closest("[data-doc]"); if (ev.button === 1 && t && t.dataset.doc !== "__deck__") closeTab(t.dataset.doc); });
  }
  function closeTab(p, force = false) {
    const i = openTabs.findIndex((t) => t.path === p); if (i < 0) return;
    if (!force && openTabs[i].dirty && !confirm("Fechar sem gravar as mudanças?")) return;
    openTabs.splice(i, 1);
    if (active === p) activate(openTabs[i - 1]?.path || openTabs[i]?.path || "__deck__");
    else renderTabs();
  }
  async function openFile(p, kind) {
    kind = kind || findEntry(p)?.kind || "other";
    if (!openTabs.some((t) => t.path === p)) openTabs.push({ path: p, kind, name: p.split("/").pop() });
    await activate(p);
  }
  async function activate(p) {
    active = p;
    renderTabs();
    $("#project-tree")?.querySelectorAll(".ex-file").forEach((r) => r.classList.toggle("active", r.dataset.path === p));
    const editor = $("#canvas-stage-wrapper"), view = $("#doc-view");
    editor.classList.remove("doc-side", "doc-full");
    if (p === "__deck__") { view.innerHTML = ""; view.classList.add("hidden"); ctx.relayout(); return; }
    const t = openTabs.find((x) => x.path === p);
    view.classList.remove("hidden");
    editor.classList.add(t.kind === "deck" ? "doc-side" : "doc-full");
    try {
      if (t.kind === "deck") await showDeckText(view, t);
      else if (t.kind === "md" || t.kind === "text") await showText(view, t);
      else if (t.kind === "sheet") await showSheet(view, t);
      else if (t.kind === "image") showImage(view, t);
      else view.innerHTML = `<div class="dv-info"><i class="ic" data-ic="file"></i><b>${esc(t.name)}</b><p>O texto deste arquivo vai como material para a IA.</p><a class="btn btn-small" href="${fileUrl(t.path)}" download="${esc(t.name)}">Baixar</a></div>`;
    } catch (e) { view.innerHTML = `<div class="dv-info">${esc(e.message)}</div>`; }
    ctx.hydrate(view);
    ctx.relayout();
  }

  // ------------------------------------------------------------------ editores de texto
  function editorBox(text, { highlight } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "dv-code";
    wrap.innerHTML = `${highlight ? '<pre class="yaml-hl dv-hl" aria-hidden="true"></pre>' : ""}<textarea class="yaml-editor dv-text" spellcheck="false" wrap="${highlight ? "off" : "soft"}"></textarea>`;
    const ta = wrap.querySelector("textarea"), hl = wrap.querySelector("pre");
    ta.value = text;
    const paint = () => { if (hl) { hl.innerHTML = highlight(ta.value); hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; } };
    ta.addEventListener("scroll", () => { if (hl) { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; } });
    ta.addEventListener("input", paint);
    paint();
    return { wrap, ta, paint };
  }
  let deckTimer = 0;
  async function showDeckText(view, t) {
    const r = await (await fetch("api/deck")).json();
    view.innerHTML = `<div class="dv-head"><i class="ic" data-ic="presentation"></i><b>${esc(t.name)}</b><span class="dv-status" id="dv-status">o slide ao lado atualiza enquanto você digita</span></div>`;
    const { wrap, ta, paint } = editorBox(r.yaml || "", { highlight: ctx.highlightYaml });
    ta.id = "deck-text-editor";
    view.append(wrap);
    ta.addEventListener("input", () => {
      clearTimeout(deckTimer);
      deckTimer = setTimeout(async () => {
        const st = $("#dv-status");
        try {
          const res = await fetch("api/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ yaml: ta.value }) });
          const j = await res.json();
          if (!res.ok || !j.ok) throw new Error(j.error || "YAML inválido");
          st.textContent = "aplicado"; st.classList.remove("error");
          await ctx.reloadDeck();
        } catch (e) { st.textContent = e.message; st.classList.add("error"); }
      }, 450);
    });
    t.refresh = async () => { if (document.activeElement === ta) return; const r2 = await (await fetch("api/deck")).json(); if (r2.yaml !== ta.value) { ta.value = r2.yaml; paint(); } };
  }
  // markdown simples para a prévia (títulos, listas, negrito, itálico, código, links)
  function mdToHtml(src) {
    const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const out = []; let list = null, code = null;
    for (const line of String(src).split("\n")) {
      if (code) { if (/^```/.test(line)) { out.push(`<pre>${esc(code.join("\n"))}</pre>`); code = null; } else code.push(line); continue; }
      if (/^```/.test(line)) { code = []; continue; }
      const li = line.match(/^\s*[-*]\s+(.*)$/) || line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (li) { if (!list) { list = []; } list.push(`<li>${inline(li[1])}</li>`); continue; }
      if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push(`<ul>${list.join("")}</ul>`);
    if (code) out.push(`<pre>${esc(code.join("\n"))}</pre>`);
    return out.join("");
  }
  async function showText(view, t) {
    const text = t.text ?? (await (await fetch(fileUrl(t.path))).text());
    const md = t.kind === "md";
    view.innerHTML = `<div class="dv-head"><i class="ic" data-ic="${KIND_ICON[t.kind]}"></i><b>${esc(t.name)}</b><span class="dv-status" id="dv-status">grava sozinho</span></div><div class="dv-split${md ? "" : " one"}"></div>`;
    const split = view.querySelector(".dv-split");
    const { wrap, ta } = editorBox(text);
    ta.dataset.path = t.path;
    split.append(wrap);
    const prev = md ? Object.assign(document.createElement("div"), { className: "dv-md" }) : null;
    if (prev) { prev.innerHTML = mdToHtml(text); split.append(prev); }
    let timer = 0;
    ta.addEventListener("input", () => {
      t.text = ta.value; t.dirty = true; renderTabs();
      if (prev) prev.innerHTML = mdToHtml(ta.value);
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try { await api("api/project/write", { path: t.path, text: ta.value }); t.dirty = false; renderTabs(); $("#dv-status").textContent = "gravado"; }
        catch (e) { $("#dv-status").textContent = e.message; }
      }, 500);
    });
  }
  function showImage(view, t) {
    view.innerHTML = `<div class="dv-head"><i class="ic" data-ic="file-image"></i><b>${esc(t.name)}</b><button type="button" class="btn btn-small" data-use-image><i class="ic" data-ic="plus"></i> Usar num slide</button></div><div class="dv-img"><img src="${fileUrl(t.path)}" alt="${esc(t.name)}"></div>`;
    view.querySelector("[data-use-image]").onclick = () => ctx.insertSlide({ layout: "image", image: t.path, title: t.name.replace(/\.[a-z0-9]+$/i, "") });
  }

  // ------------------------------------------------------------------ planilha + sugestões de gráfico
  const TYPE_LABEL = { number: "número", percent: "porcentagem", date: "tempo", category: "categoria", text: "texto" };
  async function showSheet(view, t) {
    const data = await api(`api/project/sheet?path=${encodeURIComponent(t.path)}`);
    const sheet = data.sheets.find((s) => s.name === t.sheet) || data.sheets[0];
    t.sheet = sheet.name;
    const tabs = data.sheets.length > 1 ? `<div class="sh-tabs">${data.sheets.map((s) => `<button type="button" class="sh-tab${s.name === sheet.name ? " active" : ""}" data-sheet="${esc(s.name)}">${esc(s.name)}</button>`).join("")}</div>` : "";
    const cols = sheet.columns, rows = sheet.hasHeader ? sheet.rows.slice(1) : sheet.rows;
    const shown = rows.slice(0, 300);
    view.innerHTML = `<div class="dv-head"><i class="ic" data-ic="file-spreadsheet"></i><b>${esc(t.name)}</b><span class="dv-status">${sheet.total - (sheet.hasHeader ? 1 : 0)} linhas · ${cols.length} colunas</span></div>${tabs}
      <div class="sh-body"><div class="sh-grid-wrap"><table class="sh-grid"><thead><tr><th class="sh-n"></th>${cols.map((c) => `<th><div class="sh-col">${esc(c.name)}</div><span class="sh-type t-${c.type}" data-col-type="${esc(c.name)}">${TYPE_LABEL[c.type] || c.type}</span></th>`).join("")}</tr></thead>
      <tbody>${shown.map((r, i) => `<tr><td class="sh-n">${i + 1}</td>${cols.map((c) => `<td class="${c.type === "number" || c.type === "percent" ? "num" : ""}">${esc(r[c.index] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>${rows.length > shown.length ? `<div class="sh-more">mostrando ${shown.length} de ${rows.length} linhas</div>` : ""}</div>
      <aside class="sh-suggest"><div class="sh-suggest-head"><b>Gráficos que fazem sentido</b><button type="button" class="btn btn-small" data-ai-suggest title="A IA confere o tipo das colunas e sugere gráficos, títulos e nomes dos eixos"><i class="ic" data-ic="sparkles"></i> Sugerir com IA</button></div><div class="sh-cards" id="sh-cards"><div class="ex-empty">Olhando as colunas…</div></div></aside></div>`;
    view.querySelectorAll("[data-sheet]").forEach((b) => b.onclick = () => { t.sheet = b.dataset.sheet; activate(t.path); });
    view.querySelector("[data-ai-suggest]").onclick = (ev) => loadSuggestions(t, true, ev.currentTarget);
    ctx.hydrate(view);
    loadSuggestions(t, false);
  }
  async function loadSuggestions(t, ai, btn) {
    const host = $("#sh-cards"); if (!host) return;
    if (btn) { btn.disabled = true; btn.classList.add("busy"); }
    if (ai) host.insertAdjacentHTML("afterbegin", '<div class="ex-empty sh-thinking">A IA está olhando as colunas…</div>');
    try {
      const r = await api("api/project/chart-suggestions", { path: t.path, sheet: t.sheet, ai });
      if (active !== t.path) return;
      if (r.ai?.columns?.length) r.ai.columns.forEach((c) => { const chip = document.querySelector(`[data-col-type="${CSS.escape(c.nome)}"]`); if (chip && c.tipo) { chip.textContent = `${c.tipo} · IA`; chip.classList.add("by-ai"); } });
      if (!r.suggestions.length) { host.innerHTML = '<div class="ex-empty">Não achei um gráfico que faça sentido com estas colunas. Precisa de ao menos uma coluna de números.</div>'; return; }
      host.innerHTML = r.suggestions.map((s, i) => `<article class="sh-card${s.ai ? " by-ai" : ""}"><div class="sh-prev lc-prev"><div class="thumb-render">${s.html || ""}</div></div><div class="sh-card-body"><b>${esc(s.title)}</b>${s.ai ? '<span class="sh-ai f-label">IA</span>' : ""}<p>${esc(s.why)}</p><button type="button" class="btn btn-primary btn-sm" data-insert="${i}"><i class="ic" data-ic="plus"></i> Inserir no slide</button></div></article>`).join("");
      host.querySelectorAll("[data-insert]").forEach((b) => b.onclick = () => { ctx.insertSlide(r.suggestions[+b.dataset.insert].slide); ctx.toast("Gráfico inserido depois do slide atual (ligado à planilha: Formatar › Atualizar da planilha)."); });
      host.querySelectorAll(".sh-prev").forEach((el) => scaleObs.observe(el));
      host.querySelectorAll(".pl, mark, .chart").forEach((e) => e.classList.add("play")); // a prévia já mostra o gráfico desenhado
      ctx.hydrate(host);
    } catch (e) { host.querySelector(".sh-thinking")?.remove(); ctx.toast(e.message); }
    finally { if (btn) { btn.disabled = false; btn.classList.remove("busy"); } }
  }
  const scaleObs = new ResizeObserver((es) => es.forEach(({ target }) => { if (target.clientWidth) target.style.setProperty("--thumb-scale", String(target.clientWidth / 1920)); }));

  // ------------------------------------------------------------------ montagem
  function setView(which) {
    const files = which === "files";
    $("#rail-tab-slides").classList.toggle("active", !files);
    $("#rail-tab-files").classList.toggle("active", files);
    $("#thumbnails-list").classList.toggle("hidden", files);
    $("#project-explorer").classList.toggle("hidden", !files);
    $("#btn-add-slide-mini").classList.toggle("hidden", files);
    try { localStorage.setItem("sagadeck.railView", which); } catch {}
    if (files) refreshTree();
  }
  function setup(c) {
    ctx = c;
    $("#rail-tab-slides").onclick = () => setView("slides");
    $("#rail-tab-files").onclick = () => setView("files");
    $("#ex-new-file").onclick = () => newFile();
    $("#ex-new-folder").onclick = () => newFolder();
    $("#ex-refresh").onclick = () => refreshTree();
    const up = $("#ex-upload-input");
    $("#ex-upload").onclick = () => up.click();
    up.onchange = async () => { try { const dir = uploadTarget ?? (dirOf(selected) || "contexto"); uploadTarget = null; for (const f of up.files) await uploadFile(f, dir); up.value = ""; refreshTree(); ctx.toast("Arquivo no projeto."); } catch (e) { ctx.toast(e.message); } };
    bindTree(); bindTabs(); renderTabs();
    // Ctrl+V de print em qualquer lugar do editor (fora de campo de texto): vai para contexto/
    document.addEventListener("paste", async (ev) => {
      if (ev.defaultPrevented || ev.target.closest?.("input, textarea, [contenteditable], #chat-form")) return;
      const img = [...(ev.clipboardData?.items || [])].find((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (!img) return;
      ev.preventDefault();
      try { const p = await savePastedImage(img.getAsFile()); ctx.toast(`Print guardado em ${p}. A IA vê o que está em contexto/.`, 6000, { label: "Abrir", fn: () => { setView("files"); openFile(p, "image"); } }); }
      catch (e) { ctx.toast(e.message); }
    });
    setView("slides"); // ao abrir, a barra da esquerda mostra os slides (Arquivos é um clique)
  }
  // o deck mudou por outro caminho (formulário, IA, arrastar): a aba do texto da apresentação acompanha
  function deckChanged() { openTabs.find((t) => t.kind === "deck")?.refresh?.(); }
  const wantsPaste = () => !$("#project-explorer").classList.contains("hidden") || active !== "__deck__";
  window.SagaProject = { setup, refreshTree, openFile, deckChanged, savePastedImage, uploadFile, wantsPaste, activeTab: () => active };
})();
