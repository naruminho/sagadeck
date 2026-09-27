import {md,esc} from './markup.js';
import {iconSVG} from './figures/icons.js';
export function adaptiveGrid(items=[],variant='mosaic') {
  const n=items.length;
  const long=items.some(x=>String(x.text||'').length>240);
  const columns=n<3?Math.max(1,n):n===4?2:n<=6?3:4;
  return {columns:long&&n<=6?Math.min(columns,2):columns,compact:variant==='dossier'||n>6||long};
}
export function adaptiveHTML(s,variant) {
  const items=Array.isArray(s.items)?s.items:[],grid=adaptiveGrid(items,variant);
  // faltando um item para fechar a última linha, o primeiro ocupa duas colunas (em destaque) e a grade fecha sem buraco
  const lead=variant==='mosaic'&&grid.columns>=3&&(grid.columns-items.length%grid.columns)%grid.columns===1;
  return `<div class="adaptive adaptive-${variant}${grid.compact?' adaptive-compact':''}" style="--adaptive-cols:${grid.columns}" data-item-count="${items.length}">${items.map((item,i)=>`<article class="adaptive-item${lead&&i===0?' adaptive-lead':''}"${s.build?` data-step="${i+1}"`:''}>
  <div class="adaptive-index f-label">${item.icon?iconSVG(item.icon,{size:38}):String(i+1).padStart(2,'0')}</div>
  ${item.value!=null?`<div class="adaptive-value t f-display">${md(String(item.value))}</div>`:''}
  <h3 class="t f-heading">${md(item.title||'')}</h3>${item.text?`<div class="adaptive-text t f-body">${md(item.text)}</div>`:''}
  ${item.code?`<pre class="adaptive-code f-mono">${esc(item.code)}</pre>`:''}${item.foot?`<div class="adaptive-foot t f-label">${md(item.foot)}</div>`:''}</article>`).join('')}</div>`;
}
