import katex from 'katex';
import { esc } from './markup.js';

export function mathHTML(equations = []) {
  if (!Array.isArray(equations) || equations.length > 5) throw new Error('Use até cinco equações por slide.');
  return equations.map((eq,i) => {
    const e = typeof eq === 'string' ? {latex:eq} : eq;
    const html = katex.renderToString(String(e.latex || ''), {displayMode:true,throwOnError:false,trust:false,maxExpand:1000,maxSize:20});
    return `<article class="science-equation raster"><span class="science-number">${String(i+1).padStart(2,'0')}</span><div>${e.label ? `<p class="t f-label">${esc(e.label)}</p>` : ''}${html}</div></article>`;
  }).join('');
}

export function plotData(plot = {}) {
  if (Array.isArray(plot.data) && plot.data.length) return plot.data;
  const x = Array.from({length:81},(_,i)=>(i-40)/10);
  if (plot.preset === 'surface') return [{type:'surface',x,y:x,z:x.map(y=>x.map(x=>Math.sin(Math.sqrt(x*x+y*y)))),colorscale:'Viridis',showscale:true}];
  return [{type:'scatter',mode:'lines',x,y:x.map(x=>plot.preset==='parabola'?x*x:Math.sin(x)),name:plot.preset==='parabola'?'y = x²':'y = sin(x)',line:{width:4,color:'#7760ed'}}];
}
export function plotHTML(plot = {}) {
  const payload = JSON.stringify({data:plotData(plot),layout:plot.layout || {}}).replace(/</g,'\\u003c');
  return `<div class="science-plot raster" aria-label="Gráfico interativo"><div class="science-plot-target"></div><script type="application/json" class="science-data">${payload}</script><p class="science-help f-label">Arraste para explorar · passe o mouse para ver valores · duplo clique para restaurar</p></div>`;
}
