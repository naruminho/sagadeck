// Biblioteca: tópicos (pastas) e apresentações. Os dados vêm de /api/library (a pasta da biblioteca no disco).
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const COLORS = ["#d33a2c", "#0f6cbd", "#e5a50a", "#8b5cf6", "#0e9f6e", "#e8590c", "#d6336c", "#495057"];
  const H = 3600e3, D = 24 * H;
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sagadeck." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("sagadeck." + k, JSON.stringify(v)); } catch {} },
  };
  let data = { topics: [], decks: [], trash: [], root: "" };
  let view = store.get("libView", "recentes");
  let sortBy = store.get("libSort", "editada");

  function hydrate(root = document) {
    const icons = window.UI_ICONS || {};
    root.querySelectorAll(".ic[data-ic]").forEach((el) => {
      if (el.dataset.done === el.dataset.ic || !icons[el.dataset.ic]) return;
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.ic]}</svg>`;
      el.dataset.done = el.dataset.ic;
    });
  }
  const ic = (n) => `<i class="ic" data-ic="${n}"></i>`;
  const ago = (t) => { const d = Date.now() - t; return d < H ? "agora há pouco" : d < D ? `há ${Math.round(d / H)} h` : d < 2 * D ? "ontem" : d < 60 * D ? `há ${Math.round(d / D)} dias` : new Date(t).toLocaleDateString("pt-BR"); };
  const plural = (n) => `${n} apresentaç${n === 1 ? "ão" : "ões"}`;
  const topicOf = (id) => data.topics.find((t) => t.id === id);
  const NO_TOPIC = { id: "", name: "Sem tópico", color: "#8a8a8a" };

  function toast(msg, ms = 2800) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms); }

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  async function load() {
    data = await api("/api/library");
    if (data.user) {
      $("#user").hidden = false;
      $("#avatar").textContent = String(data.user).slice(0, 1);
      $("#uname").textContent = data.user;
    }
    if (view !== "recentes" && view !== "todas" && view !== "lixeira" && !topicOf(view)) view = "recentes";
    render();
  }
  // botão IA: a tela de configuração do modelrelay local, quando existe
  api("/api/ai/setup").then(({ url }) => { if (url) { $("#btn-ai").href = url; $("#btn-ai").hidden = false; } }).catch(() => {});
  const openEditor = (id, present) => { location.href = `/editor?deck=${encodeURIComponent(id)}${present ? "&present=1" : ""}`; };

  // ---------------------------------------------------------------- barra lateral
  function renderSide() {
    const loose = data.decks.filter((d) => !d.topic).length;
    $("#side").innerHTML = `
      <button class="nav ${view === "recentes" ? "active" : ""}" data-view="recentes">${ic("clock")}<span class="name">Recentes</span></button>
      <button class="nav ${view === "todas" ? "active" : ""}" data-view="todas">${ic("layout-grid")}<span class="name">Todas</span><span class="count">${data.decks.length || ""}</span></button>
      <div class="side-title">TÓPICOS<button title="Novo tópico" id="new-topic" aria-label="Novo tópico">${ic("plus")}</button></div>
      ${data.topics.map((t) => `<button class="nav ${view === t.id ? "active" : ""}" data-view="${esc(t.id)}" data-topic="${esc(t.id)}"><span class="dot" style="background:${esc(t.color)}"></span><span class="name">${esc(t.name)}</span><span class="count">${t.count || ""}</span></button>`).join("")}
      ${loose ? `<button class="nav ${view === "" ? "active" : ""}" data-view="" data-topic=""><span class="dot" style="background:${NO_TOPIC.color}"></span><span class="name">${NO_TOPIC.name}</span><span class="count">${loose}</span></button>` : ""}
      <div class="grow"></div>
      <div class="side-foot">
        <button class="nav ${view === "lixeira" ? "active" : ""}" data-view="lixeira">${ic("trash-2")}<span class="name">Lixeira</span><span class="count">${data.trash.length || ""}</span></button>
        <div class="where" title="${esc(data.root)}">Tudo fica em <code>${esc(data.root)}</code>. Um tópico é uma pasta.</div>
      </div>`;
    hydrate($("#side"));
    $("#side").querySelectorAll("[data-view]").forEach((b) => b.onclick = () => { view = b.dataset.view; store.set("libView", view); render(); });
    $("#new-topic").onclick = () => topicDialog();
    $("#side").querySelectorAll("[data-topic]").forEach((b) => {
      b.ondragover = (e) => { if (e.dataTransfer.types.includes("application/x-sagadeck-deck")) { e.preventDefault(); b.classList.add("drop"); } };
      b.ondragleave = () => b.classList.remove("drop");
      b.ondrop = async (e) => {
        e.preventDefault(); b.classList.remove("drop");
        const id = e.dataTransfer.getData("application/x-sagadeck-deck");
        const deck = data.decks.find((d) => d.id === id);
        if (!deck || deck.topic === b.dataset.topic) return;
        await act(() => api("/api/library/decks/move", { id, topic: b.dataset.topic }), `"${deck.title}" movida para ${(topicOf(b.dataset.topic) || NO_TOPIC).name}`);
      };
      b.oncontextmenu = (e) => { if (b.dataset.topic) { e.preventDefault(); openTopicMenu(b, b.dataset.topic); } };
    });
  }

  // ---------------------------------------------------------------- área principal
  function card(d, withTopic) {
    const t = topicOf(d.topic) || NO_TOPIC;
    return `<div class="card" draggable="true" data-id="${esc(d.id)}" tabindex="0">
      <div class="thumb"><div class="loading">${esc(d.slides)} slides</div>
        <img loading="lazy" alt="" src="/api/library/cover?id=${encodeURIComponent(d.id)}&v=${Math.round(d.edited)}" onerror="this.remove()">
        <div class="over"><button class="pill" data-present>${ic("play")}Apresentar</button><button class="pill" data-edit>${ic("pencil")}Editar</button></div></div>
      <div class="meta"><div class="t"><div class="name">${esc(d.title)}</div>
        <div class="info">${withTopic ? `<span class="chip"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>·` : ""}<span>${d.slides} slides</span>·<span>${ago(d.edited)}</span></div></div>
        <button class="more" data-more title="Mais ações" aria-label="Mais ações">${ic("ellipsis")}</button></div>
    </div>`;
  }

  function render() {
    renderSide();
    const q = $("#q").value.trim().toLowerCase();
    const match = (d) => !q || d.title.toLowerCase().includes(q);
    const main = $("#main");
    if (view === "lixeira") {
      main.innerHTML = `<div class="head"><div><h1>Lixeira</h1><div class="sub">Fica aqui por 30 dias; depois é apagado de vez.</div></div></div>` +
        (data.trash.length ? data.trash.map((t) => `<div class="trash-row"><div class="t"><b>${esc(t.title)}</b><div class="sub">Era de ${esc(t.topic || NO_TOPIC.name)} · ${t.slides || 0} slides · excluída ${ago(t.deleted)}</div></div>
          <button class="lib-btn ghost" data-restore="${esc(t.id)}">${ic("rotate-ccw")}Restaurar</button><button class="lib-btn ghost danger" data-purge="${esc(t.id)}">Excluir de vez</button></div>`).join("")
          : `<div class="empty"><div class="big">${ic("trash-2")}</div><h2>Lixeira vazia</h2></div>`);
    } else {
      const t = view === "" ? NO_TOPIC : topicOf(view);
      const all = t ? data.decks.filter((d) => d.topic === t.id) : data.decks;
      const list = all.filter(match).sort((a, b) => (sortBy === "nome" ? a.title.localeCompare(b.title, "pt-BR") : b.edited - a.edited));
      const items = view === "recentes" && !q ? list.slice(0, 12) : list;
      const title = t ? `<span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}` : view === "recentes" ? "Recentes" : "Todas as apresentações";
      const sub = q ? `${plural(list.length)} com "${esc(q)}"` : t ? plural(all.length) : view === "recentes" ? "As que você mexeu por último" : `${plural(all.length)} em ${data.topics.length} tópico${data.topics.length === 1 ? "" : "s"}`;
      const emptyTopic = t && !all.length;
      main.innerHTML = `<div class="head"><div><h1>${title}</h1><div class="sub">${sub}</div></div><div class="spacer"></div>
        ${t && t.id ? `<button class="lib-icon-btn" id="topic-more" title="Tópico: renomear, cor, excluir" aria-label="Opções do tópico">${ic("ellipsis")}</button>` : ""}
        ${emptyTopic || !all.length ? "" : `<select class="sort" id="sort" aria-label="Ordenar"><option value="editada">Editadas recentemente</option><option value="nome">Nome (A–Z)</option></select>`}</div>`;
      if (emptyTopic) {
        main.innerHTML += `<div class="empty"><div class="big">${ic("folder")}</div><h2>Nenhuma apresentação em ${esc(t.name)}</h2><p>Crie uma aqui ou arraste uma de outro tópico para cá.</p>
          <div class="actions"><button class="lib-btn primary" data-empty-new>${ic("plus")}Nova apresentação</button></div></div>`;
      } else if (!data.decks.length && !q) {
        main.innerHTML += `<div class="empty"><div class="big">${ic("library")}</div><h2>Sua biblioteca está vazia</h2>
          <p>Crie um tópico (ex.: Palestras, Trabalho) e comece uma apresentação — em branco, com IA ou importando um .sagadeck.</p>
          <div class="actions"><button class="lib-btn ghost" data-empty-topic>${ic("folder-plus")}Novo tópico</button><button class="lib-btn primary" data-empty-new>${ic("plus")}Nova apresentação</button></div></div>`;
      } else if (!list.length) {
        main.innerHTML += `<div class="empty"><div class="big">${ic("search")}</div><h2>Nada encontrado</h2><p>Nenhuma apresentação com "${esc(q)}".</p></div>`;
      } else {
        main.innerHTML += `<div class="grid">${t && !q ? `<div class="card new-card" id="card-new" tabindex="0"><div class="thumb"><div class="plus">${ic("plus")}Nova em ${esc(t.name)}</div></div></div>` : ""}${items.map((d) => card(d, !t)).join("")}</div>`;
      }
      const sortSel = $("#sort");
      if (sortSel) { sortSel.value = sortBy; sortSel.onchange = () => { sortBy = sortSel.value; store.set("libSort", sortBy); render(); }; }
      const tm = $("#topic-more"); if (tm) tm.onclick = () => openTopicMenu(tm, t.id);
    }
    hydrate(main);
    wire(main);
  }

  function wire(main) {
    main.querySelectorAll(".card[data-id]").forEach((c) => {
      const id = c.dataset.id;
      c.ondragstart = (e) => { e.dataTransfer.setData("application/x-sagadeck-deck", id); c.classList.add("dragging"); };
      c.ondragend = () => c.classList.remove("dragging");
      c.onclick = (e) => {
        if (e.target.closest("[data-more]")) return openCardMenu(e.target.closest("[data-more]"), id);
        openEditor(id, !!e.target.closest("[data-present]"));
      };
      c.onkeydown = (e) => { if (e.key === "Enter") openEditor(id); };
    });
    main.querySelectorAll("[data-restore]").forEach((b) => b.onclick = () => act(() => api("/api/library/decks/restore", { slot: b.dataset.restore }), "Restaurada"));
    main.querySelectorAll("[data-purge]").forEach((b) => b.onclick = () => { if (confirm("Apagar de vez? Não dá para desfazer.")) act(() => api("/api/library/decks/purge", { slot: b.dataset.purge }), "Apagada de vez"); });
    main.querySelectorAll("[data-empty-new], #card-new").forEach((b) => b.onclick = () => openNewMenu(b));
    main.querySelectorAll("[data-empty-topic]").forEach((b) => b.onclick = () => topicDialog());
  }

  async function act(fn, msg) {
    try { await fn(); if (msg) toast(msg); await load(); }
    catch (e) { toast("Não deu: " + e.message, 5000); }
  }

  // ---------------------------------------------------------------- menus
  function place(menu, anchor) {
    closeMenus();
    const r = anchor.getBoundingClientRect();
    menu.classList.add("open");
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
    menu.style.top = (r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
  }
  function closeMenus() { document.querySelectorAll(".lmenu").forEach((m) => m.classList.remove("open")); }

  function openCardMenu(anchor, id) {
    const d = data.decks.find((x) => x.id === id);
    const m = $("#card-menu");
    const others = [...data.topics.filter((t) => t.id !== d.topic)];
    m.innerHTML = `
      <button class="mi" data-a="open">${ic("pencil")}Abrir</button>
      <button class="mi" data-a="present">${ic("play")}Apresentar</button>
      <div class="sep"></div>
      <button class="mi" data-a="rename">Renomear</button>
      <button class="mi" data-a="dup">${ic("copy")}Duplicar</button>
      ${others.map((t) => `<button class="mi" data-move="${esc(t.id)}"><span class="dot" style="background:${esc(t.color)}"></span>Mover para ${esc(t.name)}</button>`).join("")}
      <div class="sep"></div>
      <button class="mi" data-dl="sagadeck">${ic("download")}Baixar apresentação<small>.sagadeck</small></button>
      <button class="mi" data-dl="pptx">Baixar PowerPoint<small>.pptx</small></button>
      <button class="mi" data-dl="pdf">Baixar PDF</button>
      <div class="sep"></div>
      <button class="mi danger" data-a="trash">${ic("trash-2")}Mover para a lixeira</button>`;
    hydrate(m);
    place(m, anchor);
    m.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => {
      closeMenus();
      const a = b.dataset.a;
      if (a === "open" || a === "present") return openEditor(id, a === "present");
      if (a === "rename") return nameDialog("Renomear apresentação", d.title, (title) => act(() => api("/api/library/decks/rename", { id, title }), "Renomeada"));
      if (a === "dup") return act(() => api("/api/library/decks/duplicate", { id }), "Cópia criada");
      if (a === "trash") return act(() => api("/api/library/decks/trash", { id }), "Na lixeira — dá para restaurar por 30 dias");
    });
    m.querySelectorAll("[data-move]").forEach((b) => b.onclick = () => { closeMenus(); act(() => api("/api/library/decks/move", { id, topic: b.dataset.move }), `Movida para ${topicOf(b.dataset.move).name}`); });
    m.querySelectorAll("[data-dl]").forEach((b) => b.onclick = () => {
      closeMenus();
      if (b.dataset.dl !== "sagadeck") toast("Gerando… o download começa em alguns segundos.", 6000);
      location.href = `/api/library/download?id=${encodeURIComponent(id)}&kind=${b.dataset.dl}`;
    });
  }

  function openTopicMenu(anchor, id) {
    const t = topicOf(id), m = $("#topic-menu");
    m.innerHTML = `<button class="mi" data-t="edit">${ic("pencil")}Renomear ou trocar a cor</button>
      <button class="mi danger" data-t="del">${ic("trash-2")}Excluir tópico${t.count ? " (precisa estar vazio)" : ""}</button>`;
    hydrate(m);
    place(m, anchor);
    m.querySelector('[data-t="edit"]').onclick = () => { closeMenus(); topicDialog(t); };
    m.querySelector('[data-t="del"]').onclick = () => { closeMenus(); act(async () => { await api("/api/library/topics/delete", { id }); view = "recentes"; }, "Tópico excluído"); };
  }

  function openNewMenu(anchor) {
    const m = $("#new-menu");
    place(m, anchor);
    const topic = topicOf(view) ? view : "";
    m.querySelectorAll("[data-new]").forEach((b) => b.onclick = () => {
      closeMenus();
      if (b.dataset.new === "blank") return nameDialog("Nova apresentação", "", async (title) => {
        try { const { id } = await api("/api/library/decks", { topic, title }); openEditor(id); } catch (e) { toast("Não deu: " + e.message, 5000); }
      }, "Título");
      if (b.dataset.new === "ai") return aiDialog(topic);
      $("#import-input").dataset.topic = topic;
      $("#import-input").click();
    });
  }

  // ---------------------------------------------------------------- diálogos
  function dialog(html, onOpen) {
    const back = $("#dlg"), box = back.firstElementChild;
    box.innerHTML = html;
    hydrate(box);
    back.classList.add("open");
    const close = () => back.classList.remove("open");
    back.onclick = (e) => { if (e.target === back) close(); };
    box.querySelectorAll("[data-cancel]").forEach((b) => b.onclick = close);
    onOpen(box, close);
    box.querySelector("input, textarea")?.focus();
  }
  function nameDialog(title, value, onOk, label = "Nome") {
    dialog(`<h3>${esc(title)}</h3><label>${esc(label)}</label><input type="text" id="dlg-name" value="${esc(value)}">
      <div class="row"><button class="lib-btn ghost" data-cancel>Cancelar</button><button class="lib-btn primary" id="dlg-ok">OK</button></div>`, (box, close) => {
      const go = () => { const v = box.querySelector("#dlg-name").value.trim(); if (!v) return; close(); onOk(v); };
      box.querySelector("#dlg-ok").onclick = go;
      box.querySelector("#dlg-name").onkeydown = (e) => { if (e.key === "Enter") go(); };
    });
  }
  function topicDialog(t) {
    let color = t?.color || COLORS[data.topics.length % COLORS.length];
    dialog(`<h3>${t ? "Tópico" : "Novo tópico"}</h3><label>Nome</label><input type="text" id="dlg-name" value="${esc(t?.name || "")}" placeholder="Ex.: Palestras, Trabalho, Aulas">
      <label>Cor</label><div class="swatches">${COLORS.map((c) => `<button class="sw ${c === color ? "on" : ""}" data-c="${c}" style="background:${c}" aria-label="cor ${c}"></button>`).join("")}</div>
      <div class="row"><button class="lib-btn ghost" data-cancel>Cancelar</button><button class="lib-btn primary" id="dlg-ok">${t ? "Salvar" : "Criar"}</button></div>`, (box, close) => {
      box.querySelectorAll(".sw").forEach((s) => s.onclick = () => { color = s.dataset.c; box.querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x === s)); });
      const go = async () => {
        const name = box.querySelector("#dlg-name").value.trim();
        if (!name) return;
        close();
        await act(async () => {
          const r = t ? await api("/api/library/topics/update", { id: t.id, name, color }) : await api("/api/library/topics", { name, color });
          view = r.id; store.set("libView", view);
        }, t ? "Tópico atualizado" : `Tópico "${name}" criado`);
      };
      box.querySelector("#dlg-ok").onclick = go;
      box.querySelector("#dlg-name").onkeydown = (e) => { if (e.key === "Enter") go(); };
    });
  }
  function aiDialog(topic) {
    dialog(`<h3>Nova apresentação com IA</h3><label>Sobre o que é, para quem e com que objetivo?</label>
      <textarea id="dlg-brief" placeholder="Ex.: palestra de 15 minutos para gestores sobre golpes no Pix. Você decide onde ilustrar."></textarea>
      <div class="status" id="dlg-status"></div>
      <div class="row"><button class="lib-btn ghost" data-cancel>Cancelar</button><button class="lib-btn primary" id="dlg-ok">${ic("sparkles")}Gerar</button></div>`, (box) => {
      box.querySelector("#dlg-ok").onclick = async () => {
        const briefing = box.querySelector("#dlg-brief").value.trim();
        if (!briefing) return;
        const status = box.querySelector("#dlg-status"), btn = box.querySelector("#dlg-ok");
        btn.disabled = true;
        status.textContent = "Gerando… pode levar um minuto.";
        try {
          const res = await fetch("/api/library/decks/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, briefing, stream: true }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
          const reader = res.body.getReader(), dec = new TextDecoder();
          let buf = "", result = null;
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
              if (!line.trim()) continue;
              const ev = JSON.parse(line);
              if (ev.type === "progress" && ev.text) status.textContent = ev.text;
              if (ev.type === "result") result = ev.data;
              if (ev.type === "error") throw new Error(ev.error || "falhou");
            }
          }
          if (!result?.id) throw new Error("a geração não terminou");
          openEditor(result.id);
        } catch (e) {
          status.textContent = "Não deu: " + e.message;
          btn.disabled = false;
        }
      };
    });
  }

  // ---------------------------------------------------------------- topo
  $("#btn-new").onclick = (e) => { e.stopPropagation(); openNewMenu($("#btn-new")); };
  $("#import-input").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const r = await fetch(`/api/library/import?topic=${encodeURIComponent(e.target.dataset.topic || "")}&name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      toast(`"${f.name}" importada`);
      await load();
    } catch (err) { toast("Não deu para importar: " + err.message, 6000); }
  };
  $("#q").oninput = () => { if (view === "lixeira") view = "todas"; render(); };
  $("#btn-theme").onclick = () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    store.set("appTheme", dark ? "dark" : "light");
  };
  document.addEventListener("click", (e) => { if (!e.target.closest(".lmenu, [data-more], #btn-new, #card-new, [data-empty-new], #topic-more")) closeMenus(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenus(); $("#dlg").classList.remove("open"); } });
  hydrate();
  load().catch((e) => { $("#main").innerHTML = `<div class="empty"><h2>Não deu para abrir a biblioteca</h2><p>${esc(e.message)}</p></div>`; });
})();
