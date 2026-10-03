// Rede persistente: atualiza só nós/arestas afetados, sem substituir o SVG a cada interação.
(()=>{
  const NS='http://www.w3.org/2000/svg';
  const make=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
  let serial=0;
  for(const root of document.querySelectorAll('[data-graphlab]')){
    const initial=JSON.parse(root.querySelector('.gl-model').textContent),svg=root.querySelector('.gl-canvas>svg'),world=root.querySelector('.gl-world'),nodeLayer=root.querySelector('.gl-nodes'),edgeLayer=root.querySelector('.gl-edges');
    const markerId=`gl-arrow-${serial++}`,defs=make('defs'),marker=make('marker',{id:markerId,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'});marker.append(make('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(marker);svg.prepend(defs);
    const $=s=>root.querySelector(s),clone=o=>JSON.parse(JSON.stringify(o));
    let model=clone(initial),selected=null,zoom=1,pan=[0,0],sequence=[],visited=[],route=[];
    const nodeEls=new Map(),edgeEls=new Map();let nextId=1;
    const edgeKey=(e,i)=>`${e.from}\u0000${e.to}\u0000${i}`;
    const report=s=>{$('[data-gl-result]').textContent=s;};
    function positions(){model.nodes.forEach((n,i)=>{if(!Number.isFinite(n.x)||!Number.isFinite(n.y)){const columns=Math.min(4,model.nodes.length),rows=Math.ceil(model.nodes.length/columns);n.x=130+(i%columns)*(740/Math.max(columns-1,1));n.y=rows===1?310:70+Math.floor(i/columns)*(480/(rows-1));}});
      for(let k=0;k<12;k++)for(let i=0;i<model.nodes.length;i++)for(let j=i+1;j<model.nodes.length;j++){const a=model.nodes[i],b=model.nodes[j],dx=b.x-a.x,dy=b.y-a.y;if(Math.abs(dx)<240&&Math.abs(dy)<110){if(Math.abs(dx)>=Math.abs(dy)){const d=(240-Math.abs(dx))/2,sign=dx<0?-1:1;a.x=Math.max(110,Math.min(890,a.x-d*sign));b.x=Math.max(110,Math.min(890,b.x+d*sign));}else{const d=(110-Math.abs(dy))/2,sign=dy<0?-1:1;a.y=Math.max(55,Math.min(565,a.y-d*sign));b.y=Math.max(55,Math.min(565,b.y+d*sign));}}}
    }
    function options(){for(const sel of [$('[data-gl-start]'),$('[data-gl-goal]')]){const old=sel.value;sel.replaceChildren(...model.nodes.map(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.label||n.id;return o;}));sel.value=model.nodes.some(n=>n.id===old)?old:(sel.hasAttribute('data-gl-start')?model.start:model.goal)||model.nodes[0]?.id||'';}}
    function paint(){
      const live=new Set(model.nodes.map(n=>n.id));
      for(const[id,e]of nodeEls)if(!live.has(id)){e.classList.add('gl-leaving');setTimeout(()=>e.remove(),220);nodeEls.delete(id);}
      const edgeLive=new Set();model.edges.forEach((edge,i)=>{
        const k=edgeKey(edge,i);edgeLive.add(k);let e=edgeEls.get(k);
        if(!e){e=make('g',{'class':'gl-edge'});e.append(make('line'),make('text',{'text-anchor':'middle'}));e.addEventListener('click',()=>select({edge:i}));edgeLayer.append(e);edgeEls.set(k,e);}
        const a=model.nodes.find(n=>n.id===edge.from),b=model.nodes.find(n=>n.id===edge.to);if(!a||!b)return;
        const dx=b.x-a.x,dy=b.y-a.y,t=1/Math.max(Math.abs(dx)/110,Math.abs(dy)/52,2);
        const line=e.querySelector('line');for(const[k,v]of Object.entries({x1:a.x+dx*t,y1:a.y+dy*t,x2:b.x-dx*t,y2:b.y-dy*t}))line.setAttribute(k,v);if(model.directed)line.setAttribute('marker-end',`url(#${markerId})`);
        const text=e.querySelector('text');text.setAttribute('x',(a.x+b.x)/2);text.setAttribute('y',(a.y+b.y)/2-12);text.textContent=`${edge.label?edge.label+' · ':''}${edge.weight}${model.directed?' →':''}`;
        const active=route.some((n,j)=>j&&((route[j-1]===edge.from&&n===edge.to)||(!model.directed&&route[j-1]===edge.to&&n===edge.from)));
        e.classList.toggle('gl-path',active);e.classList.toggle('gl-selected',selected?.edge===i);e.classList.toggle('gl-neighbor',!!selected?.node&&(edge.from===selected.node||edge.to===selected.node));e.style.setProperty('--gl-color',edge.color||'');
      });
      for(const[k,e]of edgeEls)if(!edgeLive.has(k)){e.remove();edgeEls.delete(k);}
      for(const n of model.nodes){let e=nodeEls.get(n.id);
        if(!e){e=make('g',{'class':'gl-node',tabindex:0,role:'button','aria-label':n.label||n.id,'data-node':n.id});e.append(make('rect',{x:-100,y:-43,width:200,height:86,rx:18}));
          const icon=make('g',{transform:'translate(-83 -14)'}),tpl=[...root.querySelectorAll('template[data-gl-icon]')].find(t=>t.dataset.glIcon===n.id);if(tpl)icon.append(tpl.content.cloneNode(true));e.append(icon,make('text',{x:0,y:7,'text-anchor':'middle'}));
          e.addEventListener('click',()=>select({node:n.id}));e.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.stopPropagation();select({node:n.id});}});
          e.addEventListener('pointerdown',ev=>{ev.stopPropagation();select({node:n.id});const at=point(ev),start=[n.x,n.y];e.setPointerCapture(ev.pointerId);e.classList.add('gl-dragging');e.onpointermove=p=>{const q=point(p);n.x=start[0]+(q.x-at.x)/zoom;n.y=start[1]+(q.y-at.y)/zoom;paint();};e.onpointerup=()=>{e.onpointermove=null;e.classList.remove('gl-dragging');};});
          nodeLayer.append(e);nodeEls.set(n.id,e);}
        e.setAttribute('transform',`translate(${n.x} ${n.y})`);const text=e.querySelector('text'),words=String(n.label||n.id).split(/\s+/),lines=[''];for(const w of words){if(lines.at(-1).length+w.length>17&&lines.at(-1))lines.push(w);else lines[lines.length-1]+=(lines.at(-1)?' ':'')+w;}text.replaceChildren(...lines.map((l,i)=>{const t=make('tspan',{x:-45,y:(i-(lines.length-1)/2)*20+6});t.textContent=(i?' ':'')+l;if(l.length>20){t.setAttribute('textLength',130);t.setAttribute('lengthAdjust','spacingAndGlyphs');}return t;}));text.setAttribute('text-anchor','start');e.setAttribute('aria-label',n.label||n.id);
        e.classList.toggle('gl-selected',selected?.node===n.id);e.classList.toggle('gl-neighbor',!!selected?.node&&neighbors(selected.node).some(e=>e.to===n.id));e.classList.toggle('gl-visited',visited.includes(n.id));e.classList.toggle('gl-path',route.includes(n.id));e.style.setProperty('--gl-color',n.color||'');
      }
      world.setAttribute('transform',`translate(${pan[0]} ${pan[1]}) scale(${zoom})`);root.dataset.graphlabReady='true';
    }
    function point(e){return new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());}
    function select(s){selected=s;$('.gl-edit-panel').open=true;const n=model.nodes.find(n=>n.id===s.node),e=model.edges[s.edge];$('[data-gl-label]').disabled=!n;$('[data-gl-weight]').disabled=!e;$('[data-gl-label]').value=n?.label||n?.id||'';$('[data-gl-weight]').value=e?.weight??'';$('[data-gl-details]').textContent=n?`${n.label||n.id} · ${model.edges.filter(e=>e.from===n.id||e.to===n.id).length} ligações`:e?`${e.from} → ${e.to} · custo ${e.weight}`:'Explore a rede';paint();}
    function neighbors(id){return model.edges.flatMap((e,i)=>e.from===id?[{to:e.to,cost:e.weight,i}]:!model.directed&&e.to===id?[{to:e.from,cost:e.weight,i}]:[]);}
    function shortest(){if(!model.nodes.length){route=[];report('Adicione um nó para explorar a rede.');paint();return;}const start=$('[data-gl-start]').value,goal=$('[data-gl-goal]').value,dist=new Map([[start,0]]),prev=new Map(),todo=new Set(model.nodes.map(n=>n.id));
      while(todo.size){const current=[...todo].sort((a,b)=>(dist.get(a)??Infinity)-(dist.get(b)??Infinity))[0];if(!Number.isFinite(dist.get(current)))break;todo.delete(current);if(current===goal)break;
        for(const n of neighbors(current)){const cost=dist.get(current)+n.cost;if(cost<(dist.get(n.to)??Infinity)){dist.set(n.to,cost);prev.set(n.to,current);}}}
      route=[];if(!dist.has(goal)){report('Não existe caminho entre esses nós.');paint();return;}for(let n=goal;n!==undefined;n=prev.get(n))route.unshift(n);report(`Rota: ${route.map(id=>model.nodes.find(n=>n.id===id)?.label||id).join(' → ')} · custo ${dist.get(goal)}`);paint();}
    function clearResult(){route=[];sequence=[];visited=[];report('Rede alterada. Calcule novamente para comparar.');}
    function action(a){
      if(a==='route')shortest();
      if(a==='walk'){const seen=new Set(),q=[$('[data-gl-start]').value];sequence=[];while(q.length){const n=q.shift();if(seen.has(n))continue;seen.add(n);sequence.push(n);q.push(...neighbors(n).map(e=>e.to));}visited=[];report('Busca em largura preparada. Avance uma visita por vez.');}
      if(a==='step'){const n=sequence[visited.length];if(n!==undefined){visited.push(n);select({node:n});report(`Visita ${visited.length}/${sequence.length}: ${n}. Próximos: ${sequence.slice(visited.length).join(', ')||'fim'}`);}else report('Visitas concluídas. Use Visitar vizinhos para recomeçar.');}
      if(a==='in'||a==='out'){zoom=Math.max(.35,Math.min(3,zoom*(a==='in'?1.25:.8)));}
      if(a==='focus'&&selected?.node){const n=model.nodes.find(n=>n.id===selected.node);zoom=1.8;pan=[500-n.x*zoom,310-n.y*zoom];}
      if(a==='fit'){zoom=1;pan=[0,0];}
      if(a==='reset'){model=clone(initial);positions();selected=null;zoom=1;pan=[0,0];options();clearResult();}
      if(a==='add'){let id;do{id=`novo-${nextId++}`;}while(model.nodes.some(n=>n.id===id));model.nodes.push({id,label:'Novo nó',x:(500-pan[0])/zoom,y:(310-pan[1])/zoom});options();clearResult();select({node:id});}
      if(a==='connect'&&selected?.node){const from=$('[data-gl-start]').value,to=selected.node;if(from!==to&&!model.edges.some(e=>e.from===from&&e.to===to)){model.edges.push({from,to,weight:1});clearResult();select({edge:model.edges.length-1});}}
      if(a==='remove'&&selected){if(selected.node){model.nodes=model.nodes.filter(n=>n.id!==selected.node);model.edges=model.edges.filter(e=>e.from!==selected.node&&e.to!==selected.node);}else model.edges.splice(selected.edge,1);selected=null;options();clearResult();}
      paint();
    }
    root.querySelectorAll('[data-gl-action]').forEach(b=>b.onclick=()=>action(b.dataset.glAction));
    $('[data-gl-weight]').onchange=e=>{const v=Number(e.target.value);if(selected?.edge!==undefined&&Number.isFinite(v)&&v>=0){model.edges[selected.edge].weight=v;clearResult();paint();}};
    $('[data-gl-label]').onchange=e=>{const n=model.nodes.find(n=>n.id===selected?.node);if(n){n.label=e.target.value;options();paint();}};
    $('[data-gl-color]').oninput=e=>{const n=model.nodes.find(n=>n.id===selected?.node)||model.edges[selected?.edge];if(n){n.color=e.target.value;paint();}};
    svg.addEventListener('wheel',e=>{e.preventDefault();const p=point(e),old=zoom;zoom=Math.max(.35,Math.min(3,zoom*(e.deltaY<0?1.12:1/1.12)));pan=[p.x-(p.x-pan[0])*zoom/old,p.y-(p.y-pan[1])*zoom/old];paint();},{passive:false});
    svg.addEventListener('pointerdown',e=>{if(e.target.closest('.gl-node,.gl-edge'))return;const p=point(e),old=[...pan];svg.setPointerCapture(e.pointerId);svg.onpointermove=v=>{const q=point(v);pan=[old[0]+q.x-p.x,old[1]+q.y-p.y];paint();};svg.onpointerup=()=>svg.onpointermove=null;});
    positions();options();paint();root.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea'))return;if(['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopPropagation();action('remove');}});
  }
})();
