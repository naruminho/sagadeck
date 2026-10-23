// Painel Revisar › Conferência: tudo o que as checagens automáticas acharam no deck aberto (contas, números sem base
// no material, avisos da revisão visual, figuras do material sem slide, slides que a IA calculou ou incluiu), por
// slide, com Ir ao slide, Corrigir com IA (um pedido pontual ao chat) e Ignorar (gravado no relatório). A lista vem
// do servidor (src/studio/conference.js); o app passa o que o painel usa (create(ctx)).
(function () {
  const KIND_ICON = { conta: "calculator", material: "file-text", numero: "hash", visual: "scan-eye", figura: "image-off", derivado: "calculator", proprio: "sparkles" };
  function create(ctx) {
    const { state, showToast, renderThumbnails, renderCurrentSlide, hydrateIcons, plainTitle, askChat, chatBusy } = ctx;
    let items = [], salvo = false, conferidoEm = null, timer = null, checking = false;
    const json = async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`); return j; };
    function take(j) {
      items = j.items || []; salvo = !!j.salvo; conferidoEm = j.conferidoEm || null;
      const b = document.getElementById("conference-badge");
      if (b) { b.textContent = items.length; b.classList.toggle("clean", !items.length); }
      document.getElementById("conference-dialog")?.dispatchEvent(new Event("refresh"));
    }
    async function refresh() {
      try { take(await json(await fetch("api/conferencia"))); } catch { /* sem servidor: o selo fica como estava */ }
    }
    // o deck muda o tempo todo (formulário, IA): o selo acompanha sem uma consulta por tecla
    const refreshSoon = () => { clearTimeout(timer); timer = setTimeout(refresh, 700); };
    function goTo(n) {
      if (!(n >= 1 && n <= (state.deck?.slides?.length || 0))) return;
      state.currentSlideIndex = n - 1;
      renderThumbnails(); renderCurrentSlide();
    }
    async function decide(id, status) {
      try { take(await json(await fetch("api/conferencia/item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }))); }
      catch (e) { showToast(e.message); }
    }
    async function recheck(btn) {
      if (checking) return;
      checking = true; btn.disabled = true;
      btn.innerHTML = '<i class="ic" data-ic="loader-circle"></i> Conferindo…'; hydrateIcons(btn);
      try {
        const j = await json(await fetch("api/conferencia/conferir", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
        take(j);
        showToast(`Conferido: ${items.length ? `${items.length} pendência(s)` : "nada pendente"}.${j.notes?.length ? ` ${j.notes.join(" ")}` : ""}`, 6000);
      } catch (e) { showToast(`A conferência não saiu: ${e.message}`); }
      finally { checking = false; document.getElementById("conference-dialog")?.dispatchEvent(new Event("refresh")); }
    }
    function fix(it, dlg) {
      if (chatBusy()) { showToast("Espere a IA terminar o pedido atual.", 3000); return; }
      if (it.slide) goTo(it.slide);
      dlg.close();
      // conta que não bate: o Studio confere de novo depois da resposta (contas: [n]) e o resultado decide se ela
      // sai do painel; o resto (sem como conferir sozinho) sai ao ir para o chat
      if (it.kind !== "conta" && it.kind !== "material") decide(it.id, "enviado");
      askChat(it.fix, it.contas ? { contas: it.contas } : {});
    }
    function open() {
      let dlg = document.getElementById("conference-dialog");
      const fill = () => {
        const groups = new Map();
        for (const it of items) { const k = it.slide || 0; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
        const order = [...groups.keys()].sort((a, b) => (a || 1e9) - (b || 1e9));
        dlg.innerHTML = `<header><i class="ic" data-ic="list-checks"></i><b>Conferência</b><span class="rv-count">${items.length}</span><span class="grow"></span>${salvo ? `<button type="button" class="btn btn-sm" data-recheck title="Refaz no deck atual a conferência das contas, a checagem dos números e das figuras do material"><i class="ic" data-ic="${checking ? "loader-circle" : "refresh-cw"}"></i> ${checking ? "Conferindo…" : "Conferir de novo"}</button>` : ""}<button type="button" class="btn btn-sm" data-close title="Fechar"><i class="ic" data-ic="x"></i></button></header>
          <div class="rv-list conf-list">${items.length ? order.map((k) => `<section class="conf-group" data-slide="${k}"><div class="conf-group-head">${k ? `<b class="rv-num">${k}</b><span class="conf-slide-title"></span><button type="button" class="btn btn-sm" data-go="${k}">Ir ao slide</button>` : "<b>Deck todo</b>"}</div>${groups.get(k).map((it) => `<div class="conf-item conf-${it.kind}" data-id="${it.id}"><span class="conf-kind"><i class="ic" data-ic="${KIND_ICON[it.kind] || "circle-alert"}"></i><span></span></span><span class="conf-text"></span><span class="conf-actions"><button type="button" class="btn btn-primary btn-sm" data-fix><i class="ic" data-ic="wand-sparkles"></i> Corrigir com IA</button><button type="button" class="btn btn-sm" data-ignore title="Está certo assim: sai do painel e dos próximos pedidos à IA"><i class="ic" data-ic="eye-off"></i> Ignorar</button></span></div>`).join("")}</section>`).join("")
            : `<div class="rv-empty">${salvo ? "Nada pendente: as checagens automáticas não deixaram avisos neste deck." : "A conferência vale para apresentações salvas na biblioteca."}</div>`}</div>
          ${conferidoEm ? `<div class="conf-foot">Conferido em ${new Date(conferidoEm).toLocaleString("pt-BR")}</div>` : ""}`;
        dlg.querySelectorAll(".conf-group").forEach((g) => {
          const n = +g.dataset.slide;
          if (n && state.deck?.slides?.[n - 1]) g.querySelector(".conf-slide-title").textContent = plainTitle(state.deck.slides[n - 1], n - 1);
          g.querySelector("[data-go]")?.addEventListener("click", () => { goTo(n); dlg.close(); });
        });
        dlg.querySelectorAll(".conf-item").forEach((row) => {
          const it = items.find((x) => x.id === row.dataset.id);
          row.querySelector(".conf-kind span").textContent = it.label;
          row.querySelector(".conf-text").textContent = it.text;
          row.querySelector("[data-fix]").onclick = () => fix(it, dlg);
          row.querySelector("[data-ignore]").onclick = () => decide(it.id, "ignorado");
        });
        dlg.querySelector("[data-recheck]")?.addEventListener("click", (e) => recheck(e.currentTarget));
        dlg.querySelector("[data-close]").onclick = () => dlg.close();
        hydrateIcons(dlg);
      };
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "conference-dialog"; dlg.className = "review-dialog conference-dialog";
        document.body.append(dlg);
        dlg.addEventListener("refresh", () => { if (dlg.open) fill(); });
      }
      fill();
      if (!dlg.open) dlg.showModal();
      refresh();
    }
    window.addEventListener("sagadeck:chat-done", refreshSoon);
    return { open, refresh, refreshSoon };
  }
  window.SagaConference = { create };
})();
