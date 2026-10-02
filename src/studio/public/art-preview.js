// Cada direção tem seu próprio CSS: a prévia não muda o tema do editor nem das outras opções.
window.SagaArtPreview = (container, rendered, label) => {
  const frame = document.createElement('iframe');
  frame.title = `Prévia: ${label}`;
  frame.setAttribute('sandbox', '');
  frame.style.cssText = 'width:1920px;height:1080px;border:0;transform-origin:0 0;pointer-events:none;position:absolute;left:0;top:0';
  frame.srcdoc = `<!doctype html><html class="export"><meta charset="utf-8"><style>${rendered.baseCSS}\n${rendered.themeCSS}\nhtml,body{margin:0;width:1920px;height:1080px}.slide{opacity:1!important;visibility:visible!important;transform:none!important}</style><body>${rendered.html}</body></html>`;
  container.replaceChildren(frame);
  frame.style.transform = `scale(${container.clientWidth / 1920})`;
};
