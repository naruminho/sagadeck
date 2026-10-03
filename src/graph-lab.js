import { esc } from './markup.js';
import { iconSVG } from './figures/icons.js';

// O exemplo é dado, não uma regra por assunto: a IA escolhe nós, relações e aparência.
export const graphLabExample = { layout:'graphlab', title:'Qual rota sobrevive ao imprevisto?',
  nodes:[{id:'fabrica',label:'Fábrica',icon:'factory',x:140,y:300},{id:'centro',label:'Centro de distribuição',icon:'warehouse',x:470,y:160},{id:'porto',label:'Porto',icon:'ship',x:470,y:460},{id:'loja',label:'Loja',icon:'store',x:850,y:300}],
  edges:[{from:'fabrica',to:'centro',weight:4,label:'Rodovia'},{from:'fabrica',to:'porto',weight:2,label:'Ferrovia'},{from:'porto',to:'centro',weight:1},{from:'centro',to:'loja',weight:3},{from:'porto',to:'loja',weight:8}],
  start:'fabrica',goal:'loja',explanation:'Selecione uma ligação e altere seu custo. Bloqueie um nó e compare a nova rota.' };

export function graphLabHTML(s,ctx,head) {
  const nodes=(s.nodes||[]).map(n=>typeof n==='string'?{id:n,label:n}:{...n,id:String(n.id||'')});
  const ids=new Set();
  for(const n of nodes){if(!n.id||ids.has(String(n.id)))throw new Error('graphlab: cada nó precisa de id único');ids.add(String(n.id));}
  const edges=(s.edges||[]).map(e=>({...e,from:String(e.from),to:String(e.to),weight:Number(e.weight??1)}));
  for(const e of edges){if(!ids.has(String(e.from))||!ids.has(String(e.to))||!Number.isFinite(e.weight)||e.weight<0)throw new Error('graphlab: ligação com destino inexistente ou custo negativo');}
  const model={nodes,edges,directed:!!s.directed,start:s.start||nodes[0]?.id,goal:s.goal||nodes.at(-1)?.id};
  const icons=nodes.map(n=>`<template data-gl-icon="${esc(n.id)}">${iconSVG(n.icon||'map-pin',{size:28})}</template>`).join('');
  return `<div class="L-graphlab" data-graphlab>${head(s)}
    <div class="gl-toolbar"><button data-gl-action="route">Calcular rota</button><button data-gl-action="walk">Visitar vizinhos</button><button data-gl-action="step">Próxima visita</button><button data-gl-action="focus">Focar seleção</button><button data-gl-action="fit">Ver tudo</button><button data-gl-action="reset">Restaurar</button></div>
    <div class="gl-body"><div class="gl-canvas"><svg viewBox="0 0 1000 620" role="img" aria-label="Grafo explorável"><g class="gl-world"><g class="gl-edges"></g><g class="gl-nodes"></g></g></svg><div class="gl-zoom"><button data-gl-action="in" aria-label="Ampliar grafo">+</button><button data-gl-action="out" aria-label="Reduzir grafo">−</button></div></div>
    <aside class="gl-inspector"><h3>Explore a rede</h3><p data-gl-details>Clique num nó ou numa ligação. Arraste os nós para reorganizar.</p><label>Origem<select data-gl-start></select></label><label>Destino<select data-gl-goal></select></label><output data-gl-result aria-live="polite">Escolha origem e destino para comparar caminhos.</output>
    <details class="gl-edit-panel"><summary>Editar seleção</summary><label>Nome do nó<input data-gl-label></label><label>Custo da ligação<input data-gl-weight type="number" min="0" step="0.5"></label><label>Cor do destaque<input data-gl-color type="color" value="#e75b40"></label><div class="gl-edit"><button data-gl-action="add">Adicionar nó</button><button data-gl-action="connect">Ligar à origem</button><button data-gl-action="remove">Remover seleção</button></div></details></aside></div>
    ${s.explanation?`<p class="gl-explanation">${esc(s.explanation)}</p>`:''}${icons}<script type="application/json" class="gl-model">${JSON.stringify(model).replace(/</g,'\\u003c')}</script></div>`;
}
