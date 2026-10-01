// Revisão das mudanças (review: { status, note, original, pair }): o selo na miniatura, a faixa no slide (Ver original,
// Aceitar, Desfazer) e a lista Revisar › Mudanças. Saiu de app.js; o app passa o que ela usa (create(ctx)).
(function () {
  function create(ctx) {
    const { state, showToast, renderThumbnails, renderCurrentSlide, trackDeck, hydrateIcons, plainTitle } = ctx;
    // ------------------------------------------------------------------ revisão (review: { status, note, original })
    const reviewImage = (slide) => {
      const n = slide?.review?.original;
      if (slide?.review?.image) return slide.review.image;
      return n ? `original/slide-${String(n).padStart(2, "0")}.png` : null;
    };
    const reviewCount = () => (state.deck?.slides || []).filter((s) => s.review?.status).length;
    // marca de revisão: novo, alterado, pendente (proposta ao lado do original), revisar (conferir o desenho)
    const REVIEW_KIND = {
      novo: { cls: "new", icon: "plus", tag: "novo", title: "Slide novo", reject: "Tira este slide" },
      alterado: { cls: "changed", icon: "pencil", tag: "alterado", title: "Alterado", reject: "Volta este slide ao original" },
      pendente: { cls: "pending", icon: "git-compare", tag: "pendente", title: "Proposta pendente", reject: "Tira a proposta (o original, logo antes, fica)", accept: "Fica a proposta; o original ao lado sai" },
      revisar: { cls: "check", icon: "scan-eye", tag: "revisar", title: "Conferir o desenho", reject: "Volta este slide ao original" },
    };
    const reviewKind = (rv) => REVIEW_KIND[rv?.status] || REVIEW_KIND.alterado;
    function syncReviewBadge() {
      const b = document.getElementById("review-badge");
      if (!b) return;
      const n = reviewCount();
      b.textContent = n; b.classList.toggle("clean", !n);
    }
    function renderReviewBar(slide, idx) {
      const bar = document.getElementById("review-bar"), orig = document.getElementById("review-original");
      syncReviewBadge();
      if (!bar) return;
      const rv = slide?.review;
      orig.classList.add("hidden");
      if (!rv?.status) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
      const img = reviewImage(slide);
      const k = reviewKind(rv);
      bar.className = `review-bar rv-${k.cls}`;
      bar.innerHTML = `<i class="ic" data-ic="${k.icon}"></i><b>${k.title}${rv.status !== "novo" && rv.original ? ` (${rv.status === "pendente" ? "para o" : "era o"} ${rv.original})` : ""}</b><span class="rb-note"></span>
        ${img ? '<button type="button" class="btn btn-sm" data-rv="orig" title="Mostra o slide original por cima (clique de novo para voltar)"><i class="ic" data-ic="eye"></i> Ver original</button>' : ""}
        <button type="button" class="btn btn-sm" data-rv="reject" title="${k.reject}"><i class="ic" data-ic="rotate-ccw"></i> Desfazer</button>
        <button type="button" class="btn btn-primary btn-sm" data-rv="accept" title="${k.accept || "Fica assim; a marca sai"}"><i class="ic" data-ic="check"></i> Aceitar</button>`;
      bar.querySelector(".rb-note").textContent = rv.note || "";
      hydrateIcons(bar);
      // a foto do original só carrega quando a pessoa pede (e pode não existir: importado sem PowerPoint)
      bar.querySelector('[data-rv="orig"]')?.addEventListener("click", async (e) => {
        const btn = e.currentTarget, im = orig.querySelector("img");
        if (!orig.classList.contains("hidden")) { orig.classList.add("hidden"); btn.classList.remove("active"); return; }
        const url = `api/project/file?path=${encodeURIComponent(img)}`;
        if (im.dataset.src !== url) {
          const ok = await fetch(url, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
          if (!ok) return showToast("Não há foto deste slide do original (a importação foi feita sem PowerPoint ou LibreOffice).");
          im.src = url; im.dataset.src = url;
        }
        orig.classList.remove("hidden"); btn.classList.add("active");
      });
      bar.querySelector('[data-rv="accept"]').onclick = () => reviewAction("accept", idx);
      bar.querySelector('[data-rv="reject"]').onclick = () => reviewAction("reject", idx);
    }
    async function reviewAction(action, idx) {
      try {
        const r = await fetch("api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, idx }) });
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
        state.deck = j.spec;
        trackDeck(action === "accept" ? "Aceitar mudança" : action === "acceptAll" ? "Aceitar todas as mudanças" : "Desfazer mudança da revisão");
        if (state.currentSlideIndex >= state.deck.slides.length) state.currentSlideIndex = state.deck.slides.length - 1;
        renderThumbnails(); await renderCurrentSlide();
        document.getElementById("review-dialog")?.dispatchEvent(new Event("refresh"));
      } catch (e) { showToast(e.message); }
    }
    function openReviewList() {
      let dlg = document.getElementById("review-dialog");
      const fill = () => {
        const list = (state.deck?.slides || []).map((s, i) => ({ s, i })).filter(({ s }) => s.review?.status);
        dlg.innerHTML = `<header><b>Mudanças para validar</b><span class="rv-count">${list.length}</span><span class="grow"></span>${list.length ? '<button type="button" class="btn btn-sm" data-all>Aceitar todas</button>' : ""}<button type="button" class="btn btn-sm" data-close title="Fechar"><i class="ic" data-ic="x"></i></button></header>
          <div class="rv-list">${list.length ? list.map(({ s, i }) => `<div class="rv-item" data-i="${i}"><span class="thumb-review rv-${reviewKind(s.review).cls}">${reviewKind(s.review).tag}</span><b class="rv-num">${i + 1}</b><span class="rv-text"><span class="rv-title"></span><span class="rv-note"></span></span><button type="button" class="btn btn-sm" data-go>Ver</button><button type="button" class="btn btn-sm" data-reject>Desfazer</button><button type="button" class="btn btn-primary btn-sm" data-accept>Aceitar</button></div>`).join("") : '<div class="rv-empty">Nada para validar: todas as mudanças foram aceitas.</div>'}</div>`;
        dlg.querySelectorAll(".rv-item").forEach((row) => {
          const i = +row.dataset.i, s = state.deck.slides[i];
          row.querySelector(".rv-title").textContent = plainTitle(s, i);
          row.querySelector(".rv-note").textContent = s.review.note || "";
          row.querySelector("[data-go]").onclick = () => { state.currentSlideIndex = i; renderThumbnails(); renderCurrentSlide(); };
          row.querySelector("[data-accept]").onclick = () => reviewAction("accept", i);
          row.querySelector("[data-reject]").onclick = () => reviewAction("reject", i);
        });
        dlg.querySelector("[data-all]")?.addEventListener("click", () => reviewAction("acceptAll"));
        dlg.querySelector("[data-close]").onclick = () => dlg.close();
        hydrateIcons(dlg);
      };
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "review-dialog"; dlg.className = "review-dialog";
        document.body.append(dlg);
        dlg.addEventListener("refresh", () => fill());
      }
      fill();
      if (!dlg.open) dlg.showModal();
    }
    return { reviewKind, renderReviewBar, openReviewList, syncReviewBadge };
  }
  window.SagaReview = { create };
})();
