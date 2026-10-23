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
  let view = new URLSearchParams(location.search).get("topic") || store.get("libView", "recentes");
  let sortBy = store.get("libSort", "editada");
  let dialogSession = 0, profileSaved = false;
  let dialogKeyboard = null, dialogOrigin = null;

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
  // .yaml deixados direto na pasta da biblioteca (pelo Explorer): não estão em tópico nenhum. Não confundir
  // com o tópico "Sem tópico", que é uma pasta de verdade, para onde vai o que é criado sem escolher tópico.
  const NO_TOPIC = { id: "", name: "Soltas na pasta", color: "#8a8a8a" };

  function toast(msg, ms = 2800) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms); }

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  async function load() {
    data = await api("api/library");
    // atrás do portal, o id cru não diz nada: mostra o username (/whoami, mesma origem).
    // só pergunta quando há usuário (no Studio local o 404 sujaria o console sem motivo).
    let name = data.user;
    if (data.user) {
      try {
        const r = await fetch("/whoami");
        const w = r.ok ? await r.json() : null;
        if (w && w.logged_in) name = w.username || w.email || name;
        // grava o nome do portal na biblioteca (uma vez por página): quem administra reconhece a pessoa em "Enviar cópia para…"
        if (w && w.logged_in && !profileSaved) { profileSaved = true; api("api/library/me", { name: w.username || "", email: w.email || "" }).catch(() => {}); }
      } catch {}
    }
    if (name) {
      $("#user").hidden = false;
      $("#avatar").textContent = String(name).trim().slice(0, 1).toUpperCase();
      $("#uname").textContent = name;
      $("#user").title = data.user && data.user !== name ? data.user : "";
    }
    if (view !== "recentes" && view !== "todas" && view !== "lixeira" && !topicOf(view)) view = "recentes";
    render();
  }
  // botão IA: provedor, chave e modelos desta máquina (ai-settings.js); no multiusuário quem configura é quem administra
  // e, enquanto a IA não estiver configurada, a faixa "Configure a IA" (some ao salvar)
  const aiSaved = () => { $("#ai-banner").hidden = true; };
  api("api/ia").then(({ editable, configured, problem }) => {
    $("#btn-ai").hidden = !editable; $("#btn-map").hidden = !editable; $("#ai-banner").hidden = !editable || configured;
    if (problem) $("#ai-banner span").textContent = `A IA não está configurada. ${problem}`; // o arquivo existe mas não serve
    hydrate($("#ai-banner"));
  }).catch(() => {});
  $("#btn-ai").onclick = () => window.SagaAISettings.open(aiSaved);
  $("#btn-map").onclick = () => window.SagaMapSettings.open(); // opcional: o mapa funciona sem configurar nada
  $("#ai-banner-btn").onclick = () => window.SagaAISettings.open(aiSaved);
  const openEditor = (id, present) => { location.href = `editor?deck=${encodeURIComponent(id)}${present ? "&present=1" : ""}`; };

  // Demos oficiais (só leitura): as demos de um assunto só (src/studio/feature-demos.js: mapas, programação, APIs com
  // curl) em primeiro, o Conheça o SagaDeck (src/studio/tour.js) e as demos de recursos da vitrine. Moram numa
  // pasta própria da lateral e o Conheça aparece também entre as apresentações. Abrem em prévia (editor?model=…): navegar
  // e apresentar não gravam nada; editar cria a cópia da pessoa em Modelos, como nos modelos. Sem mover, renomear nem
  // excluir: a demo de fábrica nunca muda.
  const officialDemos = () => GALLERY.filter(([kind]) => kind === "recurso");
  const officialId = (key) => (key.startsWith("model-") ? key.slice(6) : key);
  const openOfficial = (key, present) => { location.href = `editor?model=${encodeURIComponent(officialId(key))}&topic=Modelos${present ? "&present=1" : ""}`; };
  function officialCard([, key, title, desc, sw]) {
    return `<div class="card card-oficial" data-oficial="${esc(officialId(key))}" data-key="${esc(key)}" tabindex="0" title="Demo oficial do SagaDeck: só leitura (editar cria uma cópia sua em Modelos)">
      <div class="thumb" style="background:linear-gradient(90deg,${sw.map(esc).join(",")})"><img loading="lazy" alt="" src="api/library/gallery-cover?key=${encodeURIComponent(key)}" onerror="this.remove()">
        <div class="over"><button class="pill" data-present>${ic("play")}Apresentar</button><button class="pill" data-open>${ic("eye")}Abrir</button></div></div>
      <div class="meta"><div class="t"><div class="name">${esc(title)}</div>
        <div class="info"><span class="chip chip-oficial">${ic("lock")}demo oficial</span>·<span class="desc">${esc(desc)}</span></div></div></div>
    </div>`;
  }
  const tourCard = () => officialCard(officialDemos().find(([, key]) => key === "model-conheca"));

  // ---------------------------------------------------------------- barra lateral
  function renderSide() {
    const loose = data.decks.filter((d) => !d.topic).length;
    $("#side").innerHTML = `
      <button class="nav ${view === "recentes" ? "active" : ""}" data-view="recentes">${ic("clock")}<span class="name">Recentes</span></button>
      <button class="nav ${view === "todas" ? "active" : ""}" data-view="todas">${ic("layout-grid")}<span class="name">Todas</span><span class="count">${data.decks.length || ""}</span></button>
      <button class="nav nav-oficiais ${view === "oficiais" ? "active" : ""}" data-view="oficiais" title="Apresentações do próprio SagaDeck, só leitura: o Conheça o SagaDeck e as demos (abrem em prévia)">${ic("lock")}<span class="name">Demos oficiais</span></button>
      <div class="side-title">TÓPICOS<button title="Novo tópico" id="new-topic" aria-label="Novo tópico">${ic("plus")}</button></div>
      ${data.topics.map((t) => `<button class="nav ${view === t.id ? "active" : ""}" data-view="${esc(t.id)}" data-topic="${esc(t.id)}"><span class="dot" style="background:${esc(t.color)}"></span><span class="name">${esc(t.name)}</span><span class="count">${t.count || ""}</span></button>`).join("")}
      ${loose ? `<button class="nav ${view === "" ? "active" : ""}" data-view="" title="Arquivos .yaml deixados direto na pasta da biblioteca"><span class="dot" style="background:${NO_TOPIC.color}"></span><span class="name">${NO_TOPIC.name}</span><span class="count">${loose}</span></button>` : ""}
      <div class="grow"></div>
      <div class="side-foot">
        <button class="nav ${view === "lixeira" ? "active" : ""}" data-view="lixeira">${ic("trash-2")}<span class="name">Lixeira</span><span class="count">${data.trash.length || ""}</span></button>
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
        await act(() => api("api/library/decks/move", { id, topic: b.dataset.topic }), `"${deck.title}" movida para ${(topicOf(b.dataset.topic) || NO_TOPIC).name}`);
      };
      b.oncontextmenu = (e) => { if (b.dataset.topic) { e.preventDefault(); openTopicMenu(b, b.dataset.topic); } };
    });
  }

  // ---------------------------------------------------------------- área principal
  function card(d, withTopic) {
    const t = topicOf(d.topic) || NO_TOPIC;
    return `<div class="card" draggable="true" data-id="${esc(d.id)}" tabindex="0">
      <div class="thumb"><div class="loading">${esc(d.slides)} slides</div>
        <img loading="lazy" alt="" src="api/library/cover?id=${encodeURIComponent(d.id)}&v=${Math.round(d.edited)}" onerror="this.remove()">
        <div class="over"><button class="pill" data-present>${ic("play")}Apresentar</button><button class="pill" data-edit>${ic("pencil")}Editar</button></div></div>
      <div class="meta"><div class="t"><div class="name">${esc(d.title)}</div>
        <div class="info">${withTopic ? `<span class="chip"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>·` : ""}<span>${d.slides} slides</span>·<span>${ago(d.edited)}</span>${d.pendencias ? `·<span class="pend" title="Avisos da conferência automática (contas, números, revisão visual): abra e veja em Revisar › Conferência">${d.pendencias} a conferir</span>` : ""}</div></div>
        <button class="more" data-more title="Mais ações" aria-label="Mais ações">${ic("ellipsis")}</button></div>
    </div>`;
  }

  function render() {
    renderSide();
    const q = $("#q").value.trim().toLowerCase();
    const match = (d) => !q || d.title.toLowerCase().includes(q);
    const main = $("#main");
    if (view === "lixeira") {
      main.innerHTML = `<div class="head"><div><h1>Lixeira</h1><div class="sub">Fica aqui por ${data.trashDays === 1 ? "um dia" : `${data.trashDays || 30} dias`}; depois é apagado de vez (o prazo se muda em Preferências).</div></div>${data.trash.length ? `<button class="lib-btn ghost danger" data-empty-trash>${ic("trash-2")}Esvaziar lixeira</button>` : ""}</div>` +
        (data.trash.length ? data.trash.map((t) => `<div class="trash-row"><div class="t"><b>${esc(t.title)}</b><div class="sub">Era de ${esc(t.topic || NO_TOPIC.name)} · ${t.slides || 0} slides · excluída ${ago(t.deleted)}</div></div>
          <button class="lib-btn ghost" data-restore="${esc(t.id)}">${ic("rotate-ccw")}Restaurar</button><button class="lib-btn ghost danger" data-purge="${esc(t.id)}">Excluir de vez</button></div>`).join("")
          : `<div class="empty"><div class="big">${ic("trash-2")}</div><h2>Lixeira vazia</h2></div>`);
    } else if (view === "oficiais") {
      const demos = officialDemos().filter(([, , title, desc]) => !q || `${title} ${desc}`.toLowerCase().includes(q));
      main.innerHTML = `<div class="head"><div><h1>${ic("lock")} SagaDeck · demos oficiais</h1><div class="sub">Só leitura: abrem em prévia, sem criar arquivo. Gostou? Edite e nasce uma cópia sua em Modelos.</div></div></div>
        ${demos.length ? `<div class="grid">${demos.map(officialCard).join("")}</div>` : `<div class="empty"><div class="big">${ic("search")}</div><h2>Nada encontrado</h2></div>`}`;
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
      if (!q) main.innerHTML += `<section class="lib-start" aria-labelledby="start-heading"><div><h2 id="start-heading">Da sua ideia aos slides</h2><p>Escolha um caminho e aproveite seu material.</p></div><div><div class="lib-start-actions">${window.SagaGenerationGuide.intents.map((intent) => `<button class="lib-btn ghost" data-ai-intent="${intent.id}">${ic(intent.icon)}${intent.id === "geral" ? "Criar com IA" : intent.title}</button>`).join("")}</div><div class="lib-start-options"><span>Prefere começar sem IA?</span><button type="button" data-starter="programacao">Exemplo de programação</button><button type="button" data-starter="apis">Exemplo de API</button></div></div></section>`;
      if (emptyTopic) {
        main.innerHTML += `<div class="empty"><div class="big">${ic("folder")}</div><h2>Nenhuma apresentação em ${esc(t.name)}</h2><p>Crie uma aqui ou arraste uma de outro tópico para cá.</p>
          <div class="actions"><button class="lib-btn primary" data-empty-new>${ic("plus")}Nova apresentação</button></div></div>`;
      } else if (!data.decks.length && !q) {
        main.innerHTML += `<div class="empty"><div class="big">${ic("library")}</div><h2>Sua biblioteca está vazia</h2>
          <p>Crie um tópico (ex.: Palestras, Trabalho) e comece uma apresentação — em branco, com IA ou importando um .sagadeck ou um PowerPoint (.pptx).</p>
          <div class="actions"><button class="lib-btn ghost" data-empty-topic>${ic("folder-plus")}Novo tópico</button><button class="lib-btn primary" data-empty-new>${ic("plus")}Nova apresentação</button></div></div>
          <div class="grid grid-oficial">${tourCard()}</div>`;
      } else if (!list.length) {
        main.innerHTML += `<div class="empty"><div class="big">${ic("search")}</div><h2>Nada encontrado</h2><p>Nenhuma apresentação com "${esc(q)}".</p></div>`;
      } else {
        // em Recentes e Todas, o Conheça o SagaDeck (demo oficial) vem primeiro, para quem ainda não abriu a pasta
        main.innerHTML += `<div class="grid">${t && !q ? `<div class="card new-card" id="card-new" tabindex="0"><div class="thumb"><div class="plus">${ic("plus")}Nova em ${esc(t.name)}</div></div></div>` : ""}${!t && !q ? tourCard() : ""}${items.map((d) => card(d, !t)).join("")}</div>`;
      }
      const sortSel = $("#sort");
      if (sortSel) { sortSel.value = sortBy; sortSel.onchange = () => { sortBy = sortSel.value; store.set("libSort", sortBy); render(); }; }
      const tm = $("#topic-more"); if (tm) tm.onclick = () => openTopicMenu(tm, t.id);
    }
    hydrate(main);
    wire(main);
  }

  function wire(main) {
    main.querySelectorAll(".card-oficial").forEach((c) => {
      c.onclick = (e) => openOfficial(c.dataset.key, !!e.target.closest("[data-present]"));
      c.onkeydown = (e) => { if (e.key === "Enter") openOfficial(c.dataset.key); };
    });
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
    main.querySelectorAll("[data-restore]").forEach((b) => b.onclick = () => act(() => api("api/library/decks/restore", { slot: b.dataset.restore }), "Restaurada"));
    const empty = main.querySelector("[data-empty-trash]");
    if (empty) empty.onclick = () => { if (confirm(`Apagar de vez ${data.trash.length === 1 ? "a apresentação" : `as ${data.trash.length} apresentações`} da lixeira? Não dá para desfazer.`)) act(() => api("api/library/trash/empty", {}), "Lixeira esvaziada"); };
    main.querySelectorAll("[data-purge]").forEach((b) => b.onclick = () => { if (confirm("Apagar de vez? Não dá para desfazer.")) act(() => api("api/library/decks/purge", { slot: b.dataset.purge }), "Apagada de vez"); });
    main.querySelectorAll("[data-empty-new], #card-new").forEach((b) => b.onclick = () => openNewMenu(b));
    main.querySelectorAll("[data-ai-intent]").forEach((b) => b.onclick = () => aiDialog(topicOf(view) ? view : "", b.dataset.aiIntent));
    main.querySelectorAll("[data-starter]").forEach((b) => b.onclick = () => startNew(`starter-${b.dataset.starter}`, topicOf(view) ? view : ""));
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
    menu.style.maxHeight = ""; menu.style.overflowY = "";
    menu.classList.add("open");
    // janela baixa (ou menu comprido, como o Nova com os modelos): cabe na tela, com rolagem, em vez de vazar
    if (menu.offsetHeight > innerHeight - 16) { menu.style.maxHeight = innerHeight - 16 + "px"; menu.style.overflowY = "auto"; }
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
    menu.style.top = (r.bottom + 6 + h <= innerHeight ? r.bottom + 6 : r.top - h - 6 >= 8 ? r.top - h - 6 : Math.max(8, innerHeight - h - 8)) + "px";
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
      ${data.admin ? `<button class="mi" data-a="send">${ic("send")}Enviar cópia para…<small>outra pessoa</small></button>` : ""}
      ${others.map((t) => `<button class="mi" data-move="${esc(t.id)}"><span class="dot" style="background:${esc(t.color)}"></span>Mover para ${esc(t.name)}</button>`).join("")}
      <div class="sep"></div>
      <button class="mi" data-dl="tudo">${ic("download")}Baixar tudo<small>PowerPoint, PDF e roteiro</small></button>
      <button class="mi" data-dl="sagadeck">${ic("download")}Baixar apresentação<small>.sagadeck</small></button>
      <button class="mi" data-dl="pptx">Baixar PowerPoint<small>.pptx</small></button>
      <button class="mi" data-dl="pptx" data-notas="0">Baixar PowerPoint sem as notas<small>.pptx</small></button>
      <button class="mi" data-dl="pdf">Baixar PDF</button>
      <div class="sep"></div>
      <button class="mi danger" data-a="trash">${ic("trash-2")}Mover para a lixeira</button>`;
    hydrate(m);
    place(m, anchor);
    m.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => {
      closeMenus();
      const a = b.dataset.a;
      if (a === "open" || a === "present") return openEditor(id, a === "present");
      if (a === "rename") return nameDialog("Renomear apresentação", d.title, (title) => act(() => api("api/library/decks/rename", { id, title }), "Renomeada"));
      if (a === "dup") return act(() => api("api/library/decks/duplicate", { id }), "Cópia criada");
      if (a === "send") return sendDialog(d);
      if (a === "trash") return act(() => api("api/library/decks/trash", { id }), `Na lixeira — dá para restaurar por ${data.trashDays === 1 ? "um dia" : `${data.trashDays || 30} dias`}`);
    });
    m.querySelectorAll("[data-move]").forEach((b) => b.onclick = () => { closeMenus(); act(() => api("api/library/decks/move", { id, topic: b.dataset.move }), `Movida para ${topicOf(b.dataset.move).name}`); });
    m.querySelectorAll("[data-dl]").forEach((b) => b.onclick = () => {
      closeMenus();
      window.SagadeckExports.start({ id, kind: b.dataset.dl, notes: b.dataset.notas !== '0', title: d.title }).catch(err => toast('Não deu para gerar: ' + err.message, 8000));
    });
  }

  function openTopicMenu(anchor, id) {
    const t = topicOf(id), m = $("#topic-menu");
    m.innerHTML = `<button class="mi" data-t="edit">${ic("pencil")}Renomear ou trocar a cor</button>
      <button class="mi danger" data-t="del">${ic("trash-2")}Excluir tópico${t.count ? " (precisa estar vazio)" : ""}</button>`;
    hydrate(m);
    place(m, anchor);
    m.querySelector('[data-t="edit"]').onclick = () => { closeMenus(); topicDialog(t); };
    m.querySelector('[data-t="del"]').onclick = () => { closeMenus(); act(async () => { await api("api/library/topics/delete", { id }); view = "recentes"; }, "Tópico excluído"); };
  }

  function openNewMenu(anchor) {
    const m = $("#new-menu");
    place(m, anchor);
    const topic = topicOf(view) ? view : "";
    m.querySelectorAll("[data-new]").forEach((b) => b.onclick = () => { closeMenus(); startNew(b.dataset.new, topic); });
  }

  // Um jeito de começar (menu Nova ou cartão da vitrine) → a apresentação nova, já aberta no editor
  function startNew(key, topic) {
    const create = async (path, body) => {
      try { const { id } = await api(path, { topic, ...body }); openEditor(id); } catch (e) { toast("Não deu: " + e.message, 5000); }
    };
    if (key === "blank") return nameDialog("Nova apresentação", "", (title) => create("api/library/decks", { title }), "Título");
    if (key === "starter-programacao" || key === "starter-apis") {
      const starter = key.slice(8);
      return nameDialog("Começar com exemplo", starter === "programacao" ? "Minha aula de programação" : "Minha demo de API", (title) => create("api/library/decks", { title, starter }), "Título da sua apresentação");
    }
    if (key === "ai" || key === "ai-file") return aiDialog(topic);
    if (key === "gallery") return galleryDialog(topic);
    // tudo da vitrine abre em prévia: a cópia só nasce quando a pessoa muda algo ou clica "Usar como base".
    // Modelo de fábrica cai em "Modelos" se não veio de um tópico; estilo e exemplo, no tópico atual (ou sem tópico).
    if (/^(model|exp|example)-/.test(key)) {
      const dest = topic || (key.startsWith("model-") ? "Modelos" : "");
      location.href = `editor?model=${encodeURIComponent(key.startsWith("model-") ? key.slice(6) : key)}&topic=${encodeURIComponent(dest)}`;
      return;
    }
    $("#import-input").dataset.topic = topic;
    $("#import-input").click();
  }

  // Vitrine "Modelo pronto": tudo o que já vem pronto num lugar só, em dois grupos pelo que a pessoa quer fazer:
  // "visual" (um visual completo para trocar o texto) e "recurso" (mostra do que o SagaDeck é capaz).
  // O cartão mostra a capa desenhada de verdade (api/library/gallery-cover); as cores são só o fundo enquanto carrega.
  const GALLERY = [
    ["visual", "model-perspectiva", "Perspectiva", "Corporativo com fotografia, agenda e contraste", ["#1F2A44", "#E9E4DA", "#C8553D"]],
    ["visual", "model-essencial", "Essencial", "Minimalismo, espaço e detalhes em preto e branco", ["#F5F5F2", "#1A1A1A", "#9A9A94"]],
    ["visual", "model-revista", "Revista", "Serifas, capítulos e fotografia editorial", ["#FAF7F0", "#1C1C1C", "#B23A2E"]],
    ["visual", "model-cromatico", "Cromático", "Cor, fotos e painéis sobrepostos", ["#F2B33D", "#1F4AA8", "#D93A2B"]],
    ["visual", "model-tracos", "Traços", "Geometria, molduras e caminhos visuais", ["#F3EEE3", "#1A1A1A", "#D93A2B"]],
    ["visual", "model-lavanda", "Estúdio lavanda", "Mosaicos, cápsulas e composições editoriais", ["#EFE9FB", "#5B3FA8", "#D8C8F5"]],
    ["visual", "model-executivo", "Relatório executivo", "Resumo, indicadores e plano de trabalho", ["#0F1115", "#E4B660", "#EDEBE6"]],
    ["visual", "model-workshop", "Workshop visual", "Perguntas, código guiado e consulta", ["#FFF7E6", "#1A1A1A", "#E8590C"]],
    ["recurso", "model-mapas", "Mapas", "Pontos, bolhas, regiões, linhas e áreas; rota, alcance, raio e faixa calculados; a IA e o Editar mapa", ["#EAF4F8", "#0B2A3C", "#0E7CB8"]],
    ["recurso", "model-programacao", "Programação", "Código destacado e guiado, código que a plateia roda, algoritmo animado, Git a dois e diagramas", ["#0C0F0B", "#F0B24A", "#A9C79B"]],
    ["recurso", "model-apis", "APIs com curl", "A anatomia de um curl, chamadas ao vivo com o curl para copiar, polling, streaming e as opções do dia a dia", ["#170A10", "#F2506A", "#F3A6B5"]],
    ["recurso", "model-conheca", "Conheça o SagaDeck", "Um slide por recurso, com a frase para pedir cada um à IA", ["#F2F0EA", "#1A1A1A", "#F2B33D"]],
    ["recurso", "model-hidraulica", "Aula de hidráulica", "Navier–Stokes, curva que se mexe, calculadora de Reynolds ao vivo e exercício resolvido passo a passo", ["#EAF4F8", "#0B5C7A", "#1B998B"]],
    ["recurso", "model-algoritmos", "Aula de algoritmos", "Ordenação e busca rodando de verdade: barras, código, contadores e o botão Tocar", ["#0F1426", "#7C8CFF", "#F2B33D"]],
    ["recurso", "model-diagramas", "Diagramas vivos", "Fluxo, sequência, estados e mapa mental", ["#F4F7FB", "#1F6FB2", "#5DBB86"]],
  ];
  const GALLERY_KINDS = [["", "Todos"], ["visual", "Visuais para começar"], ["recurso", "Recursos do SagaDeck"]];
  async function galleryDialog(topic, kind = "") {
    if (kind === "demo") kind = "recurso"; // link antigo: biblioteca?galeria=demo
    let items = GALLERY;
    try {
      const { experiences } = await api("api/experiences");
      items = [...GALLERY.slice(0, 8), ...experiences.map((x) => ["visual", `exp-${x.id}`, x.name, x.description, [x.background, x.accent, x.color]]), ...GALLERY.slice(8)];
    } catch { /* sem os estilos prontos, a vitrine segue com o resto */ }
    dialog(`<h3 id="dialog-heading">Modelo pronto</h3>
      <p class="vit-intro">Escolha um ponto de partida. Tudo abre em prévia: você navega e experimenta à vontade, e a sua cópia só é criada quando você muda algo.</p>
      <div class="vit-filters" role="tablist">${GALLERY_KINDS.map(([k, l], i) => `<button class="vit-filter ${i ? "" : "active"}" data-kind="${k}">${l}</button>`).join("")}</div>
      <div class="vit-grid">${items.map(([kind, key, name, desc, sw]) => `<button class="vit-card" data-new="${esc(key)}" data-kind="${kind}">
        <span class="vit-thumb" style="background:linear-gradient(90deg,${sw.map(esc).join(",")})"><img loading="lazy" alt="" src="api/library/gallery-cover?key=${encodeURIComponent(key)}" onerror="this.remove()"></span>
        <b>${esc(name)}</b><span class="d">${esc(desc)}</span></button>`).join("")}</div>
      <div class="row"><button class="lib-btn ghost" data-cancel>Fechar</button></div>`, (box, close) => {
      box.classList.add("wide");
      box.querySelectorAll(".vit-filter").forEach((f) => f.onclick = () => {
        box.querySelectorAll(".vit-filter").forEach((x) => x.classList.toggle("active", x === f));
        box.querySelectorAll(".vit-card").forEach((c) => { c.hidden = !!f.dataset.kind && c.dataset.kind !== f.dataset.kind; });
      });
      box.querySelectorAll(".vit-card").forEach((c) => c.onclick = () => { close(); startNew(c.dataset.new, topic); });
      if (kind) box.querySelector(`.vit-filter[data-kind="${kind}"]`)?.click(); // biblioteca?galeria=demo
    });
  }

  // ---------------------------------------------------------------- diálogos
  function dialog(html, onOpen) {
    const back = $("#dlg"), box = back.firstElementChild;
    if (!back.classList.contains("open") || !dialogOrigin?.isConnected) dialogOrigin = document.activeElement;
    const session = ++dialogSession;
    box.className = "ldlg"; // tira o "wide" de um diálogo anterior
    box.onkeydown = box.ondragover = box.ondragleave = box.ondrop = null;
    box.innerHTML = html;
    box.tabIndex = -1;
    const heading = box.querySelector("h3"); if (heading && !heading.id) heading.id = "dialog-heading";
    hydrate(box);
    back.classList.add("open");
    const isCurrent = () => session === dialogSession && back.classList.contains("open");
    const close = () => {
      if (session !== dialogSession) return;
      dialogSession++; back.classList.remove("open"); dialogKeyboard = null;
      const origin = dialogOrigin; dialogOrigin = null;
      (origin?.isConnected && origin.getClientRects().length ? origin : $("#btn-new"))?.focus({ preventScroll: true });
    };
    const focusable = () => [...box.querySelectorAll("button, a[href], input, select, textarea, summary, [tabindex]")].filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    dialogKeyboard = (event) => {
      if (!isCurrent()) return;
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = focusable(), first = controls[0], last = controls.at(-1), active = document.activeElement;
      if (!controls.length) { event.preventDefault(); box.focus(); return; }
      if (!box.contains(active) || event.shiftKey && active === first || !event.shiftKey && active === last) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    };
    back.onclick = (e) => { if (e.target === back) close(); };
    box.querySelectorAll("[data-cancel]").forEach((b) => b.onclick = close);
    onOpen(box, close, isCurrent);
    (box.querySelector("input:not([hidden]), textarea") || focusable()[0] || box).focus();
  }
  function nameDialog(title, value, onOk, label = "Nome") {
    dialog(`<h3>${esc(title)}</h3><label>${esc(label)}</label><input type="text" id="dlg-name" value="${esc(value)}">
      <div class="row"><button class="lib-btn ghost" data-cancel>Cancelar</button><button class="lib-btn primary" id="dlg-ok">OK</button></div>`, (box, close) => {
      const go = () => { const v = box.querySelector("#dlg-name").value.trim(); if (!v) return; close(); onOk(v); };
      box.querySelector("#dlg-ok").onclick = go;
      box.querySelector("#dlg-name").onkeydown = (e) => { if (e.key === "Enter") go(); };
    });
  }
  // Enviar cópia para… (só quem administra o servidor): a apresentação vai como NOVA para a biblioteca da outra pessoa,
  // com "(versão revisada)" no título; a dela não é tocada. Sem a conversa, as versões e os avisos da criação.
  function sendDialog(d) {
    dialog(`<h3>Enviar cópia para…</h3>
      <p class="hint">"${esc(d.title)}" chega como apresentação nova, com "(versão revisada)" no título. Nada do que a pessoa já tem é substituído. A conversa com a IA, as versões e os avisos da criação não vão junto.</p>
      <div class="send-users" id="send-users"><p class="hint">Carregando…</p></div>
      <div class="row"><button class="lib-btn ghost" data-cancel>Cancelar</button><button class="lib-btn primary" id="dlg-ok" disabled>Enviar</button></div>`, async (box, close, isCurrent) => {
      let chosen = null;
      const list = box.querySelector("#send-users"), okBtn = box.querySelector("#dlg-ok");
      try {
        const { users } = await api("api/library/users");
        if (!isCurrent()) return;
        list.innerHTML = users.length ? users.map((u) => `<label class="send-user"><input type="radio" name="send-user" value="${esc(u.id)}">
          <span><b>${esc(u.name || u.id)}</b>${u.email ? ` <small>${esc(u.email)}</small>` : ""}
          <small>${u.name ? `${esc(u.id)} · ` : ""}${plural(u.decks)}${u.recent ? ` · mais recente: ${esc(u.recent)}` : ""}</small></span></label>`).join("")
          : `<p class="hint">Ninguém mais tem biblioteca neste servidor ainda.</p>`;
        list.querySelectorAll("input").forEach((r) => r.onchange = () => { chosen = users.find((u) => u.id === r.value); okBtn.disabled = false; });
      } catch (e) { list.innerHTML = `<p class="hint">Não deu para listar as pessoas: ${esc(e.message)}</p>`; }
      okBtn.onclick = () => {
        if (!chosen) return;
        close();
        act(() => api("api/library/decks/send", { id: d.id, user: chosen.id }), `Enviada para ${chosen.name || chosen.id} como apresentação nova`);
      };
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
          const r = t ? await api("api/library/topics/update", { id: t.id, name, color }) : await api("api/library/topics", { name, color });
          view = r.id; store.set("libView", view);
        }, t ? "Tópico atualizado" : `Tópico "${name}" criado`);
      };
      box.querySelector("#dlg-ok").onclick = go;
      box.querySelector("#dlg-name").onkeydown = (e) => { if (e.key === "Enter") go(); };
    });
  }
  // Estilos = as coleções (COLLECTION_STYLE em src/studio/template-collections.js decide tema e direção criativa)
  const STYLES = [["terminal-pro", "Terminal Pro: grafite e menta para código"], ["aurora-dev", "Aurora Dev: luz, lilás e ciano"], ["perspectiva", "Perspectiva: corporativo fotográfico"], ["essencial", "Essencial: minimalismo"], ["revista", "Revista: editorial"], ["cromatico", "Cromático: cor e fotografia"], ["tracos", "Traços: geometria criativa"], ["manual", "Documentação técnica: clara (boa para imprimir)"], ["manual-noite", "Documentação técnica: escura (descansa a vista)"]];
  // mesma conta de slidesForMinutes (src/ai/deck-ai.js): ~1 slide a cada 1,5 min, entre 3 e 40
  const slidesFor = (min) => Math.min(40, Math.max(3, Math.round(Number(min) / 1.5)));
  const readAsDataURL = (f) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(r.error); r.readAsDataURL(f); });

  // "Descrever com IA" e "A partir de um arquivo ou link": o mesmo diálogo, numa tela só (assunto, tempo, estilo,
  // material de apoio). O material vira texto no servidor (/api/ai/context) e vai para a IA junto com o pedido.
  function aiDialog(topic, initialIntent = "geral") {
    const guide = window.SagaGenerationGuide;
    let intent = guide.intentById(initialIntent).id, styleTouched = false, generating = false;
    const docs = [];
    let reading = 0;
    dialog(`<h3 id="dialog-heading">Nova apresentação com IA</h3>
      <p class="dlg-intro">Comece com uma ideia, código ou cURL. O pedido pode ser livre; os campos abaixo ajudam a dar direção.</p>
      <div class="dlg-intents" role="group" aria-label="Tipo de apresentação">${guide.intents.map((choice) => `<button type="button" class="dlg-intent" data-intent="${choice.id}" aria-pressed="${choice.id === intent}">${ic(choice.icon)}<span><b>${esc(choice.title)}</b><small>${esc(choice.description)}</small></span></button>`).join("")}</div>
      <button type="button" class="dlg-start-example" id="dlg-start-example" ${intent === "geral" ? "hidden" : ""}>Ou comece com um exemplo editável, sem IA</button>
      <label for="dlg-brief">Conte sua ideia <span class="muted">ou cole e anexe o material abaixo</span></label>
      <textarea id="dlg-brief" aria-describedby="dlg-example-label"></textarea>
      <div class="dlg-examples"><span id="dlg-example-label">Comece com um exemplo:</span><div id="dlg-examples"></div></div>
      <div class="dlg-two">
        <div><label for="dlg-min">Quanto tempo você tem?</label><div class="dlg-min"><input type="number" id="dlg-min" min="1" max="120" value="10"><span>min</span><span class="hint" id="dlg-slides"></span></div></div>
        <div><label for="dlg-style">Estilo</label><select id="dlg-style"><option value="">Automático (a IA escolhe pelo assunto)</option>${STYLES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select></div>
      </div>
      <details class="dlg-details" id="dlg-refine"><summary>Refinar público, objetivo e roteiro <span class="muted">opcional</span></summary>
        <div class="dlg-two"><div><label for="dlg-audience">Para quem?</label><input type="text" id="dlg-audience" placeholder="Ex.: devs iniciantes ou time de backend"></div><div><label for="dlg-goal">O que a pessoa deve conseguir fazer?</label><input type="text" id="dlg-goal" placeholder="Ex.: autenticar e interpretar os erros da API"></div></div>
        <label for="dlg-route">Roteiro preferido</label><select id="dlg-route">${guide.routes.map(([id, title]) => `<option value="${id}">${esc(title)}</option>`).join("")}</select>
      </details>
      <details class="dlg-details" id="dlg-source-details" ${intent !== "geral" ? "open" : ""}><summary>Colar código, cURL ou resposta da API <span class="muted">opcional</span></summary>
        <label for="dlg-source">Seu material técnico</label><textarea id="dlg-source" spellcheck="false" placeholder="Cole o exemplo que você quer explicar. Código, comandos e respostas são preservados no pedido."></textarea>
        <p class="dlg-help">O material vai junto com seu pedido. Use os exemplos originais para orientar a explicação.</p>
      </details>
      <label>Material de apoio <span class="muted">(opcional: arquivos ou links; dá para arrastar arquivos para cá)</span></label>
      <div class="dlg-att"><button class="lib-btn ghost" id="dlg-file" type="button">${ic("paperclip")}Anexar arquivo</button>
        <input type="file" id="dlg-files" multiple hidden accept=".pdf,.doc,.docx,.pptx,.xlsx,.txt,.md,.markdown,.csv,.json,.jsonc,.yaml,.yml,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.sh,.bash,.ps1,.http,.sql,.go,.rs,.java,.c,.cpp,.h,.cs,.rb,.php,.html,.css">
        <input type="text" id="dlg-link" placeholder="ou cole um link (https://…)"><button class="lib-btn ghost" id="dlg-link-add" type="button">Adicionar</button></div>
      <p class="dlg-help">PDF, Word, PowerPoint, planilhas, texto e arquivos de código (JS, TS, Python, Shell, HTTP, SQL e outros).</p>
      <div class="dlg-chips" id="dlg-chips"></div>
      <div class="dlg-summary" id="dlg-summary" aria-live="polite"></div>
      <details class="dlg-details dlg-preview"><summary>Conferir pedido que irá para a IA</summary><pre id="dlg-preview"></pre></details>
      <div class="status" id="dlg-status" role="status" aria-live="polite"></div>
      <div class="row dlg-generation-actions"><span class="dlg-help">Gerar: <kbd>Ctrl</kbd> + <kbd>Enter</kbd></span><button class="lib-btn ghost" data-cancel>Cancelar</button><button class="lib-btn primary" id="dlg-ok">${ic("sparkles")}Gerar apresentação</button></div>`, (box, _close, isCurrent) => {
      box.classList.add("wide", "generation-dialog");
      const status = box.querySelector("#dlg-status"), btn = box.querySelector("#dlg-ok"), min = box.querySelector("#dlg-min");
      const brief = box.querySelector("#dlg-brief"), source = box.querySelector("#dlg-source"), style = box.querySelector("#dlg-style");
      const values = () => ({ briefing: brief.value, intent, audience: box.querySelector("#dlg-audience").value, goal: box.querySelector("#dlg-goal").value, route: box.querySelector("#dlg-route").value, source: source.value, hasMaterials: docs.length > 0 });
      const preview = () => {
        if (!isCurrent()) return;
        const request = guide.buildBriefing(values());
        box.querySelector("#dlg-preview").textContent = request ? `${request}${docs.length ? `\n\nAnexos: ${docs.map((d) => d.name).join(", ")}` : ""}` : "Seu pedido aparecerá aqui ao contar a ideia ou adicionar material.";
        box.querySelector("#dlg-summary").textContent = `${guide.intentById(intent).title} · ${Number(min.value) || 10} min · cerca de ${slidesFor(Number(min.value) || 10)} slides · ${style.selectedOptions[0].textContent.split(":")[0]}${docs.length ? ` · ${docs.length} anexo(s)` : ""}`;
      };
      const chooseIntent = (id) => {
        const selected = guide.intentById(id); intent = selected.id;
        box.querySelectorAll("[data-intent]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.intent === intent)));
        brief.placeholder = selected.placeholder;
        if (!styleTouched) style.value = selected.style;
        box.querySelector("#dlg-start-example").hidden = intent === "geral";
        if (intent !== "geral") box.querySelector("#dlg-source-details").open = true;
        box.querySelector("#dlg-examples").innerHTML = selected.examples.map(([label], index) => `<button type="button" class="dlg-example" data-example="${index}">${esc(label)}</button>`).join("");
        box.querySelectorAll("[data-example]").forEach((button) => button.onclick = () => {
          const text = selected.examples[Number(button.dataset.example)][1];
          brief.value = brief.value.trim() ? `${brief.value}\n\n${text}` : text;
          preview(); brief.focus();
        });
        preview();
      };
      box.querySelectorAll("[data-intent]").forEach((button) => button.onclick = () => chooseIntent(button.dataset.intent));
      box.querySelector("#dlg-start-example").onclick = () => startNew(`starter-${intent}`, topic);
      style.onchange = () => { styleTouched = true; preview(); };
      box.querySelectorAll("#dlg-brief, #dlg-source, #dlg-audience, #dlg-goal, #dlg-route").forEach((input) => input.addEventListener("input", preview));
      const showSlides = () => { box.querySelector("#dlg-slides").textContent = Number(min.value) > 0 ? `≈ ${slidesFor(min.value)} slides` : ""; preview(); };
      chooseIntent(intent);
      min.oninput = showSlides; showSlides();
      const chips = () => {
        if (!isCurrent()) return;
        box.querySelector("#dlg-chips").innerHTML = docs.map((d, i) => `<span class="dlg-chip">${ic(d.url ? "link" : "file-text")}<span>${esc(d.name)}${d.detail ? ` · ${esc(d.detail)}` : ""}</span><button type="button" data-rm="${i}" aria-label="Tirar ${esc(d.name)}">${ic("x")}</button></span>`).join("")
          + (reading ? `<span class="dlg-chip reading">lendo ${reading} material(is)…</span>` : "");
        hydrate(box.querySelector("#dlg-chips"));
        box.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { docs.splice(+b.dataset.rm, 1); chips(); });
        btn.disabled = reading > 0 || generating; preview();
      };
      const add = async (body, label) => {
        if (!isCurrent()) return;
        reading++; chips();
        try {
          const doc = await api("api/ai/context", body);
          if (!isCurrent()) return;
          docs.push({ ...doc, url: !!body.url }); status.textContent = "";
        } catch (e) { if (isCurrent()) status.textContent = `Não deu para ler ${label}: ${e.message}`; }
        finally { reading--; chips(); }
      };
      const files = box.querySelector("#dlg-files");
      box.querySelector("#dlg-file").onclick = () => files.click();
      files.onchange = async () => {
        for (const f of [...files.files]) add({ name: f.name, dataUrl: await readAsDataURL(f) }, f.name);
        files.value = "";
      };
      const link = box.querySelector("#dlg-link");
      const addLink = () => { const u = link.value.trim(); if (!/^https?:\/\//i.test(u)) { status.textContent = "Cole um link que comece com http:// ou https://"; return; } link.value = ""; add({ url: u }, u); };
      box.querySelector("#dlg-link-add").onclick = addLink;
      link.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } };
      // arrastar arquivos para dentro do modal também anexa
      box.ondragover = (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); box.classList.add("drop-over"); } };
      box.ondragleave = (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove("drop-over"); };
      box.ondrop = async (e) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault(); box.classList.remove("drop-over");
        for (const f of [...e.dataTransfer.files]) add({ name: f.name, dataUrl: await readAsDataURL(f) }, f.name);
      };
      let answer = "";
      // a IA perguntou para que serve o material: opções clicáveis + campo livre; responder gera de novo
      const showQuestion = (q) => {
        if (!isCurrent()) return;
        status.innerHTML = `<div class="dlg-ask"><b></b><div class="dlg-ask-opts"></div><div class="dlg-ask-free"><input type="text" id="dlg-answer" placeholder="Ou responda com as suas palavras"><button class="lib-btn primary" type="button" id="dlg-answer-go">Responder</button></div></div>`;
        status.querySelector("b").textContent = q.question;
        const opts = status.querySelector(".dlg-ask-opts");
        for (const o of q.options || []) { const b = document.createElement("button"); b.type = "button"; b.className = "lib-btn ghost"; b.textContent = o; b.onclick = () => { answer = o; btn.click(); }; opts.append(b); }
        status.querySelector("#dlg-answer-go").onclick = () => { answer = status.querySelector("#dlg-answer").value.trim(); if (answer) btn.click(); };
        generating = false; btn.disabled = reading > 0;
      };
      btn.onclick = async () => {
        if (!isCurrent() || reading || generating) return;
        const briefing = guide.buildBriefing(values());
        if (!briefing) { status.textContent = "Conte sua ideia, cole o material técnico ou anexe um arquivo ou link."; brief.focus(); return; }
        if (!min.checkValidity()) { min.reportValidity(); return; }
        generating = true;
        btn.disabled = true;
        status.textContent = "Gerando… pode levar um minuto.";
        // guide: o que a pessoa escolheu no pedido guiado; padrao = não escreveu nada e foi o texto padrão (fica no registro da criação)
        const v = values();
        const guideInfo = { intent: v.intent, audience: v.audience.trim() || undefined, goal: v.goal.trim() || undefined, route: v.route || undefined, padrao: !v.briefing.trim() };
        const payload = { topic, briefing, answer: answer || undefined, stream: true, duration: Number(min.value) || undefined, style: style.value || undefined, materials: docs.map((d) => d.id), guide: guideInfo };
        try {
          const res = await fetch("api/library/decks/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
              // a etapa (ou as etapas que correm juntas) e o tempo: a geração com documento leva minutos
              if (isCurrent() && ev.type === "progress" && ev.text) status.textContent = `${ev.text}${ev.elapsed ? ` · ${Math.round(ev.elapsed / 1000)}s` : ""}`;
              if (ev.type === "result") result = ev.data;
              if (ev.type === "error") throw new Error(ev.error || "falhou");
            }
          }
          if (!isCurrent()) return;
          if (result?.question) { showQuestion(result.question); return; }
          if (!result?.id) throw new Error("a geração não terminou");
          openEditor(result.id);
        } catch (e) {
          if (!isCurrent()) return;
          status.textContent = "Não deu: " + e.message;
          generating = false; btn.disabled = reading > 0;
        }
      };
      box.onkeydown = (event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); if (!btn.disabled) btn.click(); } };
    });
  }

  // ---------------------------------------------------------------- topo
  $("#btn-new").onclick = (e) => { e.stopPropagation(); openNewMenu($("#btn-new")); };
  $("#import-input").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const r = await fetch(`api/library/import?topic=${encodeURIComponent(e.target.dataset.topic || "")}&name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      toast(/\.pptx$/i.test(f.name) ? `"${f.name}" importada: ${j.slides} slides${j.snapshots ? `, com a foto de cada slide do original (${j.snapBy})` : ""}` : `"${f.name}" importada`, 6000);
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
  document.addEventListener("keydown", (e) => { dialogKeyboard?.(e); if (e.key === "Escape") closeMenus(); });
  hydrate();
  load().then(() => {
    // biblioteca?galeria=demo: abre a vitrine Modelo pronto já filtrada (link "Abrir demos completos" do editor)
    const g = new URLSearchParams(location.search).get("galeria");
    if (g != null) galleryDialog(topicOf(view) ? view : "", g === "1" ? "" : g);
  }).catch((e) => { $("#main").innerHTML = `<div class="empty"><h2>Não deu para abrir a biblioteca</h2><p>${esc(e.message)}</p></div>`; });
})();
