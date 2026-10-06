window.SagaSlideClipboard = function ({ state, showToast, trackDeck, syncDeckToServer, renderThumbnails, renderCurrentSlide }) {
  // os marcados na lista (multisselecao); sem marca, o atual
  const pick = () => {
    const n = state.deck?.slides.length || 0;
    const sel = (Array.isArray(state.selectedSlides) ? state.selectedSlides : []).filter((i) => Number.isInteger(i) && i >= 0 && i < n);
    return sel.length ? [...new Set(sel)].sort((a, b) => a - b) : [Math.min(state.currentSlideIndex, Math.max(0, n - 1))];
  };
  async function copySelectedSlides(idxs = pick()) {
    try {
      const slides = idxs.map((i) => state.deck.slides[i]).filter(Boolean);
      if (!slides.length) throw Error("Selecione um slide para copiar.");
      const r = await fetch('api/slides/copy', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ slides, expectFile:state.file }) });
      const data = await r.json(); if(!r.ok || data.error) throw Error(data.error || r.status);
      localStorage.setItem('sagadeck-slide-clipboard', data.token);
      await navigator.clipboard?.writeText('sagadeck-slide:'+data.token).catch(()=>{});
      showToast(slides.length > 1 ? `${slides.length} slides copiados. Abra outra apresentação e clique em Colar.` : 'Slide copiado. Abra outra apresentação e clique em Colar.');
    } catch(e) { showToast(e.message,6000); }
  }
  async function copyCurrentSlide() { return copySelectedSlides([state.currentSlideIndex]); }
  async function pasteCopiedSlide() {
    try {
      const { token } = await (await fetch('api/slides/clipboard')).json();
      if(!token) throw Error('Copie um slide primeiro.');
      const r = await fetch('api/slides/paste', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token,expectFile:state.file}) });
      const data = await r.json(); if(!r.ok || data.error) throw Error(data.error || r.status);
      const slides = Array.isArray(data.slides) && data.slides.length ? data.slides : [data.slide];
      const at = state.currentSlideIndex+1;
      state.deck.slides.splice(at,0,...slides);
      state.currentSlideIndex = at + slides.length - 1;
      state.selectedSlides = slides.map((_, k) => at + k);
      trackDeck(slides.length > 1 ? `${slides.length} slides colados` : 'Slide colado'); await syncDeckToServer(); renderThumbnails(); await renderCurrentSlide();
      showToast(slides.length > 1 ? `${slides.length} slides colados com seus arquivos.` : 'Slide colado com seus arquivos.');
    } catch(e) { showToast(e.message,6000); }
  }
  return { copyCurrentSlide, copySelectedSlides, pasteCopiedSlide };
};
