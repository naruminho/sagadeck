/* Ajustes locais preservam o layout automático. Não intercepta digitação nem os gráficos. */
(function () {
  let active = false, root, slide, commit, selected, history = [], host, toolbar, dragging, beforeDrag, pending;
  const clone = x => JSON.parse(JSON.stringify(x));
  const button = (label,fn,className='rbtn rbtn-lg') => { const b=document.createElement('button');b.type='button';b.className=className;b.textContent=label;b.onclick=fn;return b; };
  function saveBefore() { history.push(clone(slide)); if(history.length>30)history.shift(); }
  function edit() { return (slide.visualEdits ||= {})[selected.dataset.vkey] ||= {}; }
  function finish() { commit?.(); }
  function change(fn) { if(!selected)return;saveBefore();fn(edit());finish(); }
  function undo() { const old=history.pop();if(!old)return;Object.keys(slide).forEach(k=>delete slide[k]);Object.assign(slide,old);finish(); }
  function pick(el) {
    root?.querySelectorAll('.visual-selected').forEach(n=>n.classList.remove('visual-selected'));
    selected=el; toolbar.hidden=!el || !active;
    if(!el)return;
    el.classList.add('visual-selected');
    toolbar.querySelector('[data-size]').value=Math.round(parseFloat(getComputedStyle(el).fontSize));
    toolbar.querySelector('[data-size]').disabled=!el.classList.contains('t');
    if(!el.querySelector(':scope > .visual-handle')) { const h=document.createElement('button');h.type='button';h.className='visual-handle';h.ariaLabel='Redimensionar elemento';el.append(h); }
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
    container.append(button('Texto',()=>insert({text:'Seu texto',x:180,y:200,w:650,h:100,size:64})),button('Forma',()=>insert({shape:'rect',x:230,y:320,w:360,h:200,bg:'hi',radius:24})));
    const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;container.append(file);
    container.append(button('Imagem',()=>file.click()));
    file.onchange=async()=>{ const f=file.files[0];if(!f)return;if(f.size>8*1024*1024){alert('Use uma imagem de até 8 MB.');return;} const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});insert({image:data,x:260,y:180,w:700,h:450,fit:'contain'});file.value=''; };
    container.append(button('Desfazer objeto',undo));
    toolbar=document.createElement('div');toolbar.className='visual-toolbar';toolbar.hidden=true;toolbar.ariaLabel='Objeto selecionado';
    const size=document.createElement('input');size.type='number';size.min='10';size.max='500';size.dataset.size='';size.ariaLabel='Tamanho do texto';size.onchange=()=>change(e=>e.size=Math.max(10,Math.min(500,Number(size.value))));
    const color=document.createElement('input');color.type='color';color.ariaLabel='Cor do texto';color.onchange=()=>change(e=>e.color=color.value);
    toolbar.append(size,color,button('Frente',()=>change(e=>e.z=(e.z||0)+1),'visual-action-button'),button('Atrás',()=>change(e=>e.z=(e.z||0)-1),'visual-action-button'),button('Excluir',()=>change(e=>e.hidden=true),'visual-action-button'));container.append(toolbar);
    document.addEventListener('keydown',e=>{
      if(!active || e.target.closest('input,textarea,[contenteditable="true"],dialog') || document.querySelector('dialog[open]'))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();undo();return;}
      if(!selected)return;
      if(['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();change(v=>v.hidden=true);pick(null);return;}
      if(e.key==='Escape'){pick(null);setMode(false);return;}
      if(e.key.startsWith('Arrow')){e.preventDefault();e.stopImmediatePropagation();const n=e.shiftKey?10:1;change(v=>{v.dx=(v.dx||0)+(e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0);v.dy=(v.dy||0)+(e.key==='ArrowDown'?n:e.key==='ArrowUp'?-n:0);});}
    },true);
  }
  function startDrag(el,x,y,pointerId,resize) {
    if(!active)setMode(true);
    root.querySelectorAll('[contenteditable]').forEach(n=>{n.contentEditable='false';delete n.dataset.writing;});document.activeElement?.blur();
    pick(el);const scale=root.querySelector('.slide').getBoundingClientRect().width/1920;const r=el.getBoundingClientRect();const value=clone(slide.visualEdits?.[el.dataset.vkey]||{});
    beforeDrag=clone(slide);dragging={el,x,y,scale,resize,w:r.width/scale,h:r.height/scale,value};
    try{root.setPointerCapture(pointerId);}catch{}
  }
  function mount(container,s,onCommit) {
    if(slide!==s){history=[];selected=null;}
    const key=selected?.dataset.vkey;
    root=container;slide=s;commit=onCommit;root.classList.toggle('visual-mode',active);
    if(!root.dataset.visualEvents){
      root.dataset.visualEvents='true';
      root.addEventListener('pointerdown',e=>{
        if(e.button!==0 || e.target.closest('.science-plot,input,textarea'))return;
        if(e.target.closest('[contenteditable="true"]')?.dataset.writing)return;
        const el=e.target.closest('[data-vkey]');if(!el){if(active){pick(null);setMode(false);}return;}
        // texto editável fora do modo de objetos: clique simples escreve (barra de formatação); só arrastar move o objeto
        if(!active && e.target.closest('[contenteditable="true"]')){pending={el,x:e.clientX,y:e.clientY,pointerId:e.pointerId,resize:false};return;}
        e.preventDefault();e.stopImmediatePropagation();
        startDrag(el,e.clientX,e.clientY,e.pointerId,e.target.classList.contains('visual-handle'));
      },true);
      root.addEventListener('pointermove',e=>{
        if(pending&&!dragging){if(Math.hypot(e.clientX-pending.x,e.clientY-pending.y)<5)return;const p=pending;pending=null;getSelection()?.removeAllRanges();startDrag(p.el,p.x,p.y,p.pointerId,false);}
        if(!dragging)return;const d=dragging,dx=(e.clientX-d.x)/d.scale,dy=(e.clientY-d.y)/d.scale;const v=edit();if(d.resize){v.w=Math.max(30,Math.round(d.w+dx));v.h=Math.max(30,Math.round(d.h+dy));d.el.style.setProperty('width',v.w+'px','important');d.el.style.setProperty('height',v.h+'px','important');}else{v.dx=Math.round((d.value.dx||0)+dx);v.dy=Math.round((d.value.dy||0)+dy);d.el.style.translate=`${v.dx}px ${v.dy}px`;}});
      const up=()=>{pending=null;if(!dragging)return;dragging=null;if(JSON.stringify(beforeDrag)!==JSON.stringify(slide)){history.push(beforeDrag);finish();}};
      root.addEventListener('pointerup',up);root.addEventListener('pointercancel',up);
      root.addEventListener('dblclick',e=>{if(!active)return;const el=e.target.closest('.t[data-vkey]');if(!el)return;el.contentEditable='true';el.dataset.writing='true';el.focus();});
    }
    if(active)root.querySelectorAll('[contenteditable]').forEach(n=>n.contentEditable='false');
    pick(key?root.querySelector(`[data-vkey="${CSS.escape(key)}"]`):null);
  }
  window.SagaVisual={setup,mount};
})();
