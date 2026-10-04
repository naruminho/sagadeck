// Consciência ambiente do Studio: carimbo do motor, vigia de clipes e versões.
// Módulo próprio (não no app.js) por causa da trava de tamanho dos monolitos.
// Uso: window.SagaAwareness.mount({ state, showToast, hydrateIcons, fitRendered, ensureSlideStyles }).
(function () {
  function mount(ctx) {
    mount.ctx = ctx;
    // delegação no document: a barra de título pode ser redesenhada e trocar os nós
    document.addEventListener("click", (e) => {
      if (e.target.closest("#btn-versions")) openVersions();
      else if (e.target.closest("#versions-close") || e.target.id === "versions-modal") closeVersions();
      else if (e.target.closest("#btn-direction-save")) saveDirection();
    });
    window.addEventListener("focus", loadDirections);
    refreshBuildStamp();
    watchVideoJobs();
    loadDirections();
    setInterval(refreshBuildStamp, 30000);
    setInterval(watchVideoJobs, 30000);
  }

  // direções aprovadas: a capa atual vira receita que a IA usa ao ouvir o nome
  async function loadDirections() {
    const ctx = mount.ctx;
    try {
      const j = await (await fetch("api/directions")).json();
      ctx.state.directions = j.directions || [];
      ctx.state.directionsError = j.error || "";
    } catch { ctx.state.directions = []; ctx.state.directionsError = ""; }
    syncDirections();
  }
  function syncDirections() {
    const ctx = mount.ctx;
    const sel = document.getElementById("direction-select"), note = document.getElementById("direction-note");
    if (!sel) return;
    const list = ctx.state.directions || [];
    sel.innerHTML = `<option value="">Nenhuma</option>` + list.map((d) => `<option value="${d.name.replace(/"/g, "&quot;")}">${d.name.replace(/</g, "&lt;")}</option>`).join("");
    if (ctx.state.directionsError) { note.textContent = ctx.state.directionsError; note.hidden = false; }
    else { note.textContent = list.length ? "Cite o nome no chat e a IA veste a capa com ela." : ""; note.hidden = !list.length; }
  }
  async function saveDirection() {
    const ctx = mount.ctx;
    const name = (prompt("Nome da direção (ex.: Stark dourado):", "") || "").trim();
    if (!name) return;
    try {
      const r = await fetch("api/directions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      ctx.showToast(`Direção "${j.name}" salva. Cite o nome no chat para a IA usar.`, 9000);
      loadDirections();
    } catch (e) { ctx.showToast(`Não deu para salvar: ${e.message}`, 8000); }
  }

  // carimbo do código rodando (para o "é antigão?" nunca mais)
  async function refreshBuildStamp() {
    try {
      const info = await (await fetch("api/instance")).json();
      const el = document.getElementById("build-stamp");
      if (!el) return;
      const when = info.started ? new Date(info.started) : null;
      el.textContent = `Motor ${info.version || "?"} · #${info.commit || "?"}`;
      el.title = `Código rodando neste Studio: versão ${info.version || "?"} (commit ${info.commit || "?"}), no ar desde ${when ? when.toLocaleString("pt-BR") : "?"} (processo ${info.pid || "?"}). Se não bater com seu último push, reinicie o Studio.`;
    } catch { /* barra de status não pode quebrar a sessão */ }
  }

  // vigia de clipes: o servidor baixa sozinho o que terminou; aqui só avisamos uma vez por job
  async function watchVideoJobs() {
    const ctx = mount.ctx;
    let jobs = [];
    try { jobs = (await (await fetch("api/video/jobs")).json()).jobs || []; } catch { return; }
    ctx.state.seenVideoJobs ||= {};
    for (const j of jobs) {
      const before = ctx.state.seenVideoJobs[j.id];
      ctx.state.seenVideoJobs[j.id] = j.status;
      if (!before || before === j.status) continue;
      if ((j.status === "completed" || j.status === "downloaded") && j.video) {
        ctx.showToast(`Clipe pronto: ${j.video} — já baixado na pasta.`, 12000);
      } else if (j.status === "failed") {
        ctx.showToast("A geração do clipe falhou — veja o motivo no chat.", 12000);
      }
    }
  }

  // Versões: cada salvamento fotografa o deck; aqui compara lado a lado e restaura
  let versionsCurrent = null;
  function closeVersions() { document.getElementById("versions-modal")?.classList.add("hidden"); }
  async function openVersions() {
    const ctx = mount.ctx;
    const modal = document.getElementById("versions-modal");
    const list = modal.querySelector(".versions-list"), cmp = modal.querySelector(".versions-compare");
    modal.classList.remove("hidden");
    ctx.hydrateIcons(modal);
    list.innerHTML = "<p>Carregando…</p>"; cmp.innerHTML = ""; versionsCurrent = null;
    document.getElementById("versions-restore").disabled = true;
    let versions = [];
    try { versions = (await (await fetch("api/versions")).json()).versions || []; }
    catch { list.innerHTML = "<p>Não deu para listar.</p>"; return; }
    if (!versions.length) { list.innerHTML = "<p>Nenhuma versão ainda. Salve o deck para fotografar a primeira.</p>"; return; }
    list.innerHTML = "";
    versions.forEach((v) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ver-item";
      const when = new Date(v.at);
      b.innerHTML = `<b></b><small></small>`;
      b.querySelector("b").textContent = when.toLocaleString("pt-BR");
      b.querySelector("small").textContent = "comparar";
      b.setAttribute("role", "option");
      b.onclick = () => { list.querySelectorAll(".ver-item").forEach((x) => x.classList.remove("active")); b.classList.add("active"); compareVersion(v); };
      list.appendChild(b);
    });
  }
  async function compareVersion(v) {
    const ctx = mount.ctx;
    const cmp = document.querySelector(".versions-compare");
    const count = document.querySelector(".versions-count");
    cmp.innerHTML = "<p>Comparando…</p>";
    document.getElementById("versions-restore").disabled = true;
    versionsCurrent = v;
    try {
      const show = await (await fetch("api/versions/show", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v.name }) })).json();
      const cur = ctx.state.deck.slides || [], ver = show.slides || [];
      const n = Math.max(cur.length, ver.length), changed = [];
      for (let i = 0; i < n; i++) if (JSON.stringify(cur[i] ?? null) !== JSON.stringify(ver[i] ?? null)) changed.push(i);
      count.textContent = changed.length ? `${changed.length} slide(s) diferente(s)` : "Nenhuma diferença";
      if (!changed.length) { cmp.innerHTML = "<p>Idêntica à atual.</p>"; return; }
      cmp.innerHTML = "";
      for (const i of changed.slice(0, 8)) {
        const row = document.createElement("div");
        row.className = "ver-row";
        row.innerHTML = `<figure class="ver-cell changed"><figcaption>Atual · slide ${i + 1}</figcaption><div class="thumb-screen"><div class="thumb-render"></div></div></figure><figure class="ver-cell changed"><figcaption>Versão · slide ${i + 1}</figcaption><div class="thumb-screen"><div class="thumb-render"></div></div></figure>`;
        cmp.appendChild(row);
        const [cellA, cellB] = row.querySelectorAll(".thumb-render");
        const render = async (slide, spec, el) => {
          const r = await (await fetch("api/render-slide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slide, index: i, spec }) })).json();
          ctx.ensureSlideStyles(r.baseCSS, r.themeCSS);
          el.innerHTML = r.html;
          ctx.fitRendered(el.closest(".thumb-screen"));
        };
          await render(cur[i] || { layout: "statement", text: "(removido)" }, ctx.state.deck, cellA);
          await render(ver[i] || { layout: "statement", text: "(removido)" }, { theme: show.theme, palette: show.palette, slides: ver }, cellB);
      }
      if (changed.length > 8) { const more = document.createElement("p"); more.textContent = `+ ${changed.length - 8} slide(s). Restaure para ver tudo.`; cmp.appendChild(more); }
      const rb = document.getElementById("versions-restore");
      rb.disabled = false;
      rb.onclick = async () => {
        if (!confirm(`Voltar o deck para a versão de ${new Date(versionsCurrent.at).toLocaleString("pt-BR")}? O estado atual vira versão antes.`)) return;
        const r = await fetch("api/versions/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: versionsCurrent.name }) });
        if (!r.ok) { ctx.showToast("Não deu para restaurar.", 8000); return; }
        location.reload();
      };
    } catch { cmp.innerHTML = "<p>Não deu para comparar.</p>"; }
  }

  window.SagaAwareness = { mount };
})();
