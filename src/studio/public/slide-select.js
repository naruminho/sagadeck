// Seleção de slides na lista (multisseleção com Ctrl/Shift) e teclas da lista.
// Saiu do app.js pela trava de tamanho dos monolitos; o comportamento é o mesmo.
window.SagaSlideSelect = function ({ state, dom, markActiveThumb, renderCurrentSlide, copySelectedSlides, pasteCopiedSlide, deleteCurrentSlide }) {
  // slides selecionados na lista (para excluir/copiar em bloco): ordenados, válidos e nunca vazios
  function selectedSlides() {
    const n = state.deck?.slides.length || 0;
    const sel = (Array.isArray(state.selectedSlides) ? state.selectedSlides : []).filter((i) => Number.isInteger(i) && i >= 0 && i < n);
    if (!sel.length && n) sel.push(Math.min(state.currentSlideIndex, n - 1));
    return [...new Set(sel)].sort((a, b) => a - b);
  }
  // click: só este; Ctrl+click: alterna; Shift+click: do atual até aqui. O atual (foco) vai junto.
  function selectSlide(idx, { add, range } = {}) {
    const n = state.deck.slides.length;
    if (idx < 0 || idx >= n) return;
    let sel = selectedSlides();
    if (add) {
      sel = sel.includes(idx) ? sel.filter((i) => i !== idx) : [...sel, idx];
      if (!sel.length) sel = [idx];
    } else if (range) {
      const a = sel.length ? sel[sel.length - 1] : state.currentSlideIndex;
      const [lo, hi] = a < idx ? [a, idx] : [idx, a];
      sel = [...new Set([...sel, ...Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)])];
    } else sel = [idx];
    if (idx !== state.currentSlideIndex) state.editorStep = "all"; // outro slide: volta a mostrar tudo
    state.currentSlideIndex = idx;
    state.selectedSlides = [...new Set(sel)].sort((a, b) => a - b);
    markActiveThumb();
    renderCurrentSlide();
  }
  // Delete/Backspace com o foco na lista de slides (à esquerda) exclui o slide selecionado. Só ali: digitando
  // num campo ou mexendo num elemento do slide, as teclas continuam fazendo o que já faziam.
  function bindSlideListKeys() {
    document.getElementById("btn-copy-slide").onclick = () => copySelectedSlides();
    document.getElementById("btn-paste-slide").onclick = pasteCopiedSlide;
    if (dom.thumbnailsList._keys) return;
    dom.thumbnailsList._keys = true;
    dom.thumbnailsList.tabIndex = 0;
    dom.thumbnailsList.setAttribute("aria-label", "Slides (Ctrl+click seleciona vários; Delete exclui)");
    const scrollCard = (to) => {
      // rola só a lista (scrollIntoView rolaria também a tela em volta)
      const card = dom.thumbnailsList.querySelector(`.thumb-card[data-idx="${to}"]`), list = dom.thumbnailsList;
      if (card) {
        const c = card.getBoundingClientRect(), l = list.getBoundingClientRect();
        if (c.top < l.top) list.scrollTop -= l.top - c.top + 8;
        else if (c.bottom > l.bottom) list.scrollTop += c.bottom - l.bottom + 8;
      }
    };
    dom.thumbnailsList.addEventListener("keydown", (e) => {
      if (e.altKey || e.target.closest("input, textarea, select, [contenteditable]")) return;
      // Ctrl+C/V copiam e colam os selecionados (funcionam aqui na lista)
      if ((e.ctrlKey || e.metaKey) && ["c","v"].includes(e.key.toLowerCase())) { e.preventDefault(); e.key.toLowerCase()==="c" ? copySelectedSlides() : pasteCopiedSlide(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); state.selectedSlides = state.deck.slides.map((_, i) => i); markActiveThumb(); return; }
      const go = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      // ↑/↓ (e Home/End) trocam de slide, como no PowerPoint; nunca rolam a visualização.
      // Com Ctrl ou Shift segurados, estendem a seleção em vez de trocar.
      if (go || e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const last = state.deck.slides.length - 1;
        const to = e.key === "Home" ? 0 : e.key === "End" ? last : Math.max(0, Math.min(last, state.currentSlideIndex + go));
        if (to !== state.currentSlideIndex) selectSlide(to, { add: e.ctrlKey || e.metaKey || e.shiftKey });
        scrollCard(to);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      deleteCurrentSlide();
      dom.thumbnailsList.focus({ preventScroll: true });
    });
  }


  return { selectedSlides, selectSlide, bindSlideListKeys };
};
