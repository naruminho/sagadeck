for (const root of document.querySelectorAll('[data-playground]')) {
  const frame = root.querySelector('iframe'), original = frame.srcdoc;
  root.querySelector('[data-pg-reset]').onclick = () => { frame.srcdoc = original; root.querySelector('[data-pg-status]').textContent = ''; };
  const slide=root.closest('.slide'),sync=()=>frame.contentWindow?.postMessage({sagaActive:!slide||slide.classList.contains('current')},'*');
  frame.addEventListener('load',sync);
  if(slide)new MutationObserver(sync).observe(slide,{attributes:true,attributeFilter:['class']});
  window.addEventListener('message', e => {
    if (e.source !== frame.contentWindow || !e.data?.sagaPlayground) return;
    root.querySelector('[data-pg-status]').textContent = `${e.data.kind === 'error' ? 'Erro: ' : ''}${String(e.data.text || '').slice(0,4000)}`;
  });
}
