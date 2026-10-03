import { esc } from './markup.js';

// Conteúdo executável tem uma origem opaca e nenhuma permissão de rede ou do pai.
export function playgroundDocument(s) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'";
  const bridge = `const report=(kind,text)=>parent.postMessage({sagaPlayground:true,kind,text:String(text).slice(0,4000)},'*');window.addEventListener('error',e=>report('error',e.message));window.addEventListener('unhandledrejection',e=>report('error',e.reason));console.log=(...x)=>report('log',x.join(' '));window.sagaActive=true;window.addEventListener('message',e=>{if(e.source===parent&&typeof e.data?.sagaActive==='boolean')window.sagaActive=e.data.sagaActive});const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>interval(()=>{if(window.sagaActive)fn(...args)},ms);`;
  const script = String(s.javascript || '').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(policy)}"><style>html,body{margin:0;height:100%;font-family:system-ui;background:#f6f7fa;color:#202432}*{box-sizing:border-box}${s.css || ''}</style></head><body>${s.html || ''}<script>${bridge}\n${script}</script></body></html>`;
}
export function playgroundHTML(s, ctx, head) {
  return `<div class="L-playground f-body" data-playground>${head(s)}<div class="pg-toolbar"><button data-pg-reset>Reiniciar experiência</button><output data-pg-status aria-live="polite"></output></div><iframe class="pg-frame" title="${esc(s.title || 'Experiência interativa')}" sandbox="allow-scripts" srcdoc="${esc(playgroundDocument(s))}"></iframe>${s.explanation ? `<p class="gl-explanation">${esc(s.explanation)}</p>` : ''}</div>`;
}
export const playgroundExample = {
  layout: 'playground', title: 'Uma fila. Dois ritmos.',
  html: '<main><h2>Chegadas e atendimento</h2><label>Capacidade <input id="capacity" type="range" min="1" max="8" value="3"></label><button id="add">Chegaram mais cinco pedidos</button><p id="stats"></p><div id="queue"></div></main>',
  css: 'main{padding:32px}#queue{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.job{width:48px;height:48px;background:#7756dc;border-radius:12px;transition:opacity .5s,transform .5s}button,input{margin:12px}button{padding:12px}',
  javascript: `let next=0,done=0;const q=document.querySelector('#queue');function add(){for(let i=0;i<5;i++){const e=document.createElement('div');e.className='job';e.title='Pedido '+(++next);q.append(e)}paint()}function paint(){document.querySelector('#stats').textContent=q.children.length+' na fila; '+done+' atendidos'}document.querySelector('#add').onclick=add;setInterval(()=>{const n=Number(document.querySelector('#capacity').value);for(const e of [...q.children].slice(0,n)){e.style.opacity=0;e.style.transform='translateY(-20px)';setTimeout(()=>{e.remove();done++;paint()},500)}},1600);add();`,
  explanation: 'Aumente as chegadas e altere a capacidade. Em que condições a fila consegue diminuir?',
};
