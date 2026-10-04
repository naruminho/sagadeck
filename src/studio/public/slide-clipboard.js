window.SagaSlideClipboard = function ({ state, showToast, trackDeck, syncDeckToServer, renderThumbnails, renderCurrentSlide }) {
  async function copyCurrentSlide() {
    try {
      const r = await fetch('api/slides/copy', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ slide:state.deck.slides[state.currentSlideIndex], expectFile:state.file }) });
      const data = await r.json(); if(!r.ok || data.error) throw Error(data.error || r.status);
      localStorage.setItem('sagadeck-slide-clipboard', data.token);
      await navigator.clipboard?.writeText('sagadeck-slide:'+data.token).catch(()=>{});
      showToast('Slide copiado. Abra outra apresentação e clique em Colar.');
    } catch(e) { showToast(e.message,6000); }
  }
  async function pasteCopiedSlide() {
    try {
      const { token } = await (await fetch('api/slides/clipboard')).json();
      if(!token) throw Error('Copie um slide primeiro.');
      const r = await fetch('api/slides/paste', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token,expectFile:state.file}) });
      const data = await r.json(); if(!r.ok || data.error) throw Error(data.error || r.status);
      const at = state.currentSlideIndex+1; state.deck.slides.splice(at,0,data.slide); state.currentSlideIndex=at;
      trackDeck('Slide colado'); await syncDeckToServer(); renderThumbnails(); await renderCurrentSlide();
      showToast('Slide colado com seus arquivos.');
    } catch(e) { showToast(e.message,6000); }
  }
  return { copyCurrentSlide, pasteCopiedSlide };
};
