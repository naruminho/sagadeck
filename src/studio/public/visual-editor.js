/* Ajustes locais preservam o layout automático. Não intercepta digitação nem os gráficos.
   Seleção como no Google Slides/Canva: um clique em qualquer ponto do objeto seleciona (texto também); clicar de novo
   no texto selecionado (ou duplo clique) escreve; arrastar numa área vazia desenha um retângulo que seleciona vários;
   Shift+clique soma. Arrastar, setas, Delete e a barra valem para todos os selecionados. */
(function () {
  let active = false, root, slide, commit, sel = [], history = [], host, toolbar, dragging, beforeDrag, pendingWrite, marquee;
  const primary = () => sel[sel.length - 1] || null;
  const clone = x => JSON.parse(JSON.stringify(x));
  const button = (label,fn,className='rbtn rbtn-lg',icon='') => { const b=document.createElement('button');b.type='button';b.className=className;if(icon){b.innerHTML=`<i class="ic" data-ic="${icon}"></i><span></span>`;b.querySelector('span').textContent=label;}else b.textContent=label;b.onclick=fn;return b; };
  // Formas do menu: as mesmas que o motor desenha (src/elements.js); a prévia usa o mesmo desenho 100×100
  const SHAPES = [
    ['rect','Retângulo','<rect x="4" y="16" width="92" height="68"/>'],['rounded','Arredondado','<rect x="4" y="16" width="92" height="68" rx="16"/>'],
    ['circle','Elipse','<ellipse cx="50" cy="50" rx="46" ry="38"/>'],['pill','Pílula','<rect x="4" y="28" width="92" height="44" rx="22"/>'],
    ['line','Linha','<rect x="4" y="47" width="92" height="6" rx="3"/>'],['triangle','Triângulo','<polygon points="50,6 96,94 4,94"/>'],
    ['diamond','Losango','<polygon points="50,4 96,50 50,96 4,50"/>'],['hexagon','Hexágono','<polygon points="27,8 73,8 96,50 73,92 27,92 4,50"/>'],
    ['star','Estrela','<polygon points="50,4 61,37 96,37 68,58 79,92 50,71 21,92 32,58 4,37 39,37"/>'],['arrow','Seta','<polygon points="4,34 60,34 60,12 96,50 60,88 60,66 4,66"/>'],
    ['chevron','Chevron','<polygon points="4,14 68,14 96,50 68,86 4,86 30,50"/>'],['bubble','Balão','<path d="M12,10 H88 Q96,10 96,18 V62 Q96,70 88,70 H42 L24,92 L28,70 H12 Q4,70 4,62 V18 Q4,10 12,10 Z"/>'],
  ];
  const shapeSize = k => k==='line' ? {w:420,h:8,thickness:8} : k==='circle' ? {w:280,h:280} : k==='pill' ? {w:380,h:120} : {w:320,h:240};
  function saveBefore() { history.push(clone(slide)); if(history.length>30)history.shift(); }
  function edit(el = primary()) { return (slide.visualEdits ||= {})[el.dataset.vkey] ||= {}; }
  function finish() { commit?.(); }
  function change(fn) { if(!sel.length)return;saveBefore();sel.forEach(el=>fn(edit(el)));finish(); }
  function undo() { const old=history.pop();if(!old)return;Object.keys(slide).forEach(k=>delete slide[k]);Object.assign(slide,old);finish(); }
  // els: lista de elementos selecionados (vazia = nenhum). A alça de redimensionar só aparece com um único objeto.
  function pick(els) {
    els = (Array.isArray(els) ? els : els ? [els] : []).filter(Boolean);
    root?.querySelectorAll('.visual-selected').forEach(n=>n.classList.remove('visual-selected'));
    root?.querySelectorAll('.visual-handle').forEach(h=>h.remove());
    sel=els; toolbar.hidden=!sel.length || !active;
    if(!sel.length)return;
    sel.forEach(el=>el.classList.add('visual-selected'));
    const el=primary();
    toolbar.querySelector('[data-size]').value=Math.round(parseFloat(getComputedStyle(el).fontSize));
    toolbar.querySelector('[data-size]').disabled=!sel.every(n=>n.classList.contains('t'));
    if(sel.length===1) { const h=document.createElement('button');h.type='button';h.className='visual-handle';h.ariaLabel='Redimensionar elemento';el.append(h); }
  }
  // escreve no texto: o cursor vai para onde a pessoa clicou; o app salva no blur (enableInlineEditing)
  function startWriting(el,x,y) {
    if(!el.classList.contains('t'))return;
    pick(null);
    el.contentEditable='true';el.dataset.writing='true';el.focus();
    const r=document.caretRangeFromPoint?.(x,y);
    if(r&&el.contains(r.startContainer)){const s=getSelection();s.removeAllRanges();s.addRange(r);}
    el.addEventListener('blur',()=>{delete el.dataset.writing;if(active)el.contentEditable='false';},{once:true});
  }
  function insert(element) {
    saveBefore();
    const list=slide.layout==='canvas' ? 'elements' : 'add';
    if(slide[list] && !Array.isArray(slide[list]))slide[list]=[slide[list]];
    (slide[list] ||= []).push(element); active=true;finish();
  }
  function setMode(value) { active=value;root?.classList.toggle('visual-mode',active);if(!active){pick(null);root?.querySelectorAll('[contenteditable="false"]').forEach(n=>n.contentEditable='true');} } // saiu do ajuste: o texto volta a ser editável
  function setup(container) {
    host=container;
    container.append(button('Texto',()=>insert({text:'Seu texto',x:180,y:200,w:650,h:100,size:64}),'rbtn rbtn-lg','type'));
    // Formas: menu com as 12 formas desenhadas (abre abaixo do botão, fora do recorte da faixa)
    const menu=document.createElement('div');menu.className='shape-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.ariaLabel='Formas';
    SHAPES.forEach(([k,label,svg])=>{const b=document.createElement('button');b.type='button';b.className='shape-option';b.dataset.shape=k;b.title=label;b.setAttribute('role','menuitem');b.innerHTML=`<svg viewBox="0 0 100 100" aria-hidden="true">${svg}</svg><span></span>`;b.querySelector('span').textContent=label;
      b.onclick=()=>{menu.hidden=true;insert({shape:k,x:300,y:260,...shapeSize(k),fill:k==='line'?undefined:'hi',color:k==='line'?'hi':undefined});};menu.append(b);});
    const shapesBtn=button('Formas',()=>{if(!menu.hidden){menu.hidden=true;return;}const r=shapesBtn.getBoundingClientRect();menu.style.left=`${Math.round(r.left)}px`;menu.style.top=`${Math.round(r.bottom+4)}px`;menu.hidden=false;menu.querySelector('button')?.focus();},'rbtn rbtn-lg','square');
    shapesBtn.id='btn-insert-shape';shapesBtn.setAttribute('aria-haspopup','menu');container.append(shapesBtn);document.body.append(menu);
    document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!shapesBtn.contains(e.target))menu.hidden=true;});
    menu.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;shapesBtn.focus();}});
    const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;container.append(file);
    container.append(button('Imagem',()=>file.click(),'rbtn rbtn-lg','image'));
    file.onchange=async()=>{ const f=file.files[0];if(!f)return;if(f.size>8*1024*1024){alert('Use uma imagem de até 8 MB.');return;} const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});insert({image:data,x:260,y:180,w:700,h:450,fit:'contain'});file.value=''; };
    toolbar=document.createElement('div');toolbar.className='visual-toolbar';toolbar.hidden=true;toolbar.ariaLabel='Objeto selecionado';
    const size=document.createElement('input');size.type='number';size.min='10';size.max='500';size.dataset.size='';size.ariaLabel='Tamanho do texto';size.onchange=()=>change(e=>e.size=Math.max(10,Math.min(500,Number(size.value))));
    const color=document.createElement('input');color.type='color';color.ariaLabel='Cor do texto';color.onchange=()=>change(e=>e.color=color.value);
    toolbar.append(size,color,button('Frente',()=>change(e=>e.z=(e.z||0)+1),'visual-action-button'),button('Atrás',()=>change(e=>e.z=(e.z||0)-1),'visual-action-button'),button('Excluir',()=>change(e=>e.hidden=true),'visual-action-button'));container.append(toolbar);
    document.addEventListener('keydown',e=>{
      if(!active || e.target.closest('input,textarea,[contenteditable="true"],dialog') || document.querySelector('dialog[open]'))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();undo();return;}
      if(!sel.length)return;
      if(['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();change(v=>v.hidden=true);pick(null);return;}
      if(e.key==='Escape'){pick(null);setMode(false);return;}
      if(e.key.startsWith('Arrow')){e.preventDefault();e.stopImmediatePropagation();const n=e.shiftKey?10:1;change(v=>{v.dx=(v.dx||0)+(e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0);v.dy=(v.dy||0)+(e.key==='ArrowDown'?n:e.key==='ArrowUp'?-n:0);});}
    },true);
  }
  function enterMode() {
    if(!active)setMode(true);
    root.querySelectorAll('[contenteditable]').forEach(n=>{n.contentEditable='false';delete n.dataset.writing;});document.activeElement?.blur();
  }
  function startDrag(x,y,pointerId,resize) {
    const scale=root.querySelector('.slide').getBoundingClientRect().width/1920;const el=primary();const r=el.getBoundingClientRect();
    beforeDrag=clone(slide);
    dragging={x,y,scale,resize,w:r.width/scale,h:r.height/scale,moved:false,items:sel.map(n=>({el:n,value:clone(slide.visualEdits?.[n.dataset.vkey]||{})}))};
    try{root.setPointerCapture(pointerId);}catch{}
  }
  // objetos inteiros dentro do retângulo (o de fora ganha do de dentro: um cartão e não o texto dele)
  function inMarquee(box) {
    const all=[...root.querySelectorAll('[data-vkey]')].filter(n=>n.offsetParent&&getComputedStyle(n).display!=='none');
    const hit=all.filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom;});
    return hit.filter(n=>!hit.some(o=>o!==n&&o.contains(n)));
  }
  function mount(container,s,onCommit) {
    if(slide!==s){history=[];sel=[];}
    const keys=sel.map(n=>n.dataset.vkey);
    root=container;slide=s;commit=onCommit;root.classList.toggle('visual-mode',active);
    if(!root.dataset.visualEvents){
      root.dataset.visualEvents='true';
      root.addEventListener('pointerdown',e=>{
        if(e.button!==0 || e.target.closest('.science-plot,input,textarea'))return;
        if(e.target.closest('[contenteditable="true"]')?.dataset.writing)return; // escrevendo: o clique é do cursor
        const el=e.target.closest('[data-vkey]');
        if(!el){
          if(!e.target.closest('.slide')){if(active){pick(null);setMode(false);}return;}
          // área vazia do slide: retângulo de seleção
          e.preventDefault();e.stopImmediatePropagation();document.activeElement?.blur();
          const rr=root.getBoundingClientRect();const box=document.createElement('div');box.className='visual-marquee';root.append(box);
          marquee={x:e.clientX,y:e.clientY,rr,k:(rr.width/root.offsetWidth)||1,box,add:e.shiftKey,before:e.shiftKey?[...sel]:[]}; // k: o palco pode estar com zoom
          try{root.setPointerCapture(e.pointerId);}catch{}
          return;
        }
        e.preventDefault();e.stopImmediatePropagation();
        const resize=e.target.classList.contains('visual-handle');
        // clicar de novo no texto já selecionado: escreve (se não arrastar)
        if(!resize&&sel.length===1&&sel[0]===el&&el.classList.contains('t')&&!e.shiftKey){pendingWrite={el};startDrag(e.clientX,e.clientY,e.pointerId,false);return;}
        enterMode();
        if(e.shiftKey){pick(sel.includes(el)?sel.filter(n=>n!==el):[...sel,el]);if(!sel.length)return;}
        else if(!sel.includes(el))pick(el);
        startDrag(e.clientX,e.clientY,e.pointerId,resize);
      },true);
      root.addEventListener('pointermove',e=>{
        if(marquee){const m=marquee,l=Math.min(m.x,e.clientX),t=Math.min(m.y,e.clientY);Object.assign(m.box.style,{left:`${(l-m.rr.left)/m.k}px`,top:`${(t-m.rr.top)/m.k}px`,width:`${Math.abs(e.clientX-m.x)/m.k}px`,height:`${Math.abs(e.clientY-m.y)/m.k}px`});m.moved=Math.hypot(e.clientX-m.x,e.clientY-m.y)>4;return;}
        if(!dragging)return;const d=dragging,dx=(e.clientX-d.x)/d.scale,dy=(e.clientY-d.y)/d.scale;
        if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<4)return;
        if(!d.moved){d.moved=true;if(pendingWrite){pendingWrite=null;enterMode();}}
        if(d.resize){const el=primary(),v=edit(el);v.w=Math.max(30,Math.round(d.w+dx));v.h=Math.max(30,Math.round(d.h+dy));el.style.setProperty('width',v.w+'px','important');el.style.setProperty('height',v.h+'px','important');}
        else d.items.forEach(({el,value})=>{const v=edit(el);v.dx=Math.round((value.dx||0)+dx);v.dy=Math.round((value.dy||0)+dy);el.style.translate=`${v.dx}px ${v.dy}px`;});});
      const up=e=>{
        if(marquee){const m=marquee;marquee=null;const b=m.box.getBoundingClientRect();m.box.remove();
          if(!m.moved){if(!m.add){pick(null);setMode(false);}return;}
          const hit=inMarquee(b);enterMode();pick(m.add?[...new Set([...m.before,...hit])]:hit);if(!sel.length)setMode(false);return;}
        const w=pendingWrite;pendingWrite=null;
        if(!dragging)return;const d=dragging;dragging=null;
        if(w&&!d.moved){startWriting(w.el,e.clientX,e.clientY);return;}
        if(JSON.stringify(beforeDrag)!==JSON.stringify(slide)){history.push(beforeDrag);finish();}
      };
      root.addEventListener('pointerup',up);root.addEventListener('pointercancel',up);
      root.addEventListener('dblclick',e=>{const el=e.target.closest('.t[data-vkey]');if(!el||el.dataset.writing)return;startWriting(el,e.clientX,e.clientY);});
    }
    if(active)root.querySelectorAll('[contenteditable]').forEach(n=>n.contentEditable='false');
    pick(keys.map(k=>root.querySelector(`[data-vkey="${CSS.escape(k)}"]`)));
  }
  window.SagaVisual={setup,mount};
})();
