import { traceHTML } from './trace-view.js';
// Mesmo interpretador do algoritmo animado; não há eval, rede nem processo Python no navegador.
for(const root of document.querySelectorAll('[data-codelab]')){
  const $=s=>root.querySelector(s),initial=JSON.parse($('.clab-model').textContent);let index=0;
  const show=()=>{const frames=[...root.querySelectorAll('.dyn-frame')];index=Math.max(0,Math.min(frames.length-1,index));frames.forEach((e,i)=>{e.classList.toggle('active',i===index);e.setAttribute('aria-hidden',i!==index);});$('.clab-status').textContent=`Passo ${index+1} de ${frames.length}`;};
  async function run(){if(initial.engine!=="trace"){return nativeRun()}try{const warnings=[],program=$('[data-clab-program]').value,call=$('[data-clab-call]').value;if(program.length>16000||call.length>2000)throw new Error('Reduza o programa ou a entrada para uma experiência de aula.');const html=traceHTML({maxSteps:initial.maxSteps},{program,call,view:null,name:'Sua execução'},{warnings},()=>'',(i,body,extra='')=>`<section class="lesson-panel dyn-frame ${extra}" data-lesson-panel="${i}">${body}</section>`);
    if(warnings.length&&html.includes('dyn-error'))throw new Error(warnings.join(' '));$('.clab-stage').innerHTML=html;index=0;show();root.dataset.codelabReady='true';
  }catch(e){$('.clab-status').textContent=`Não executou: ${e.message}`;}}
  async function nativeRun(){
    const button=$('[data-clab-run]');button.disabled=true;$('.clab-status').textContent='Executando '+initial.engine+'…';
    try{
      if(!/^https?:$/.test(location.protocol)||location.href==='about:srcdoc')throw new Error('Abra esta apresentação no Studio para usar o runtime nativo.');
      const program=$('[data-clab-program]').value,call=$('[data-clab-call]').value.trim();
      const code=program+(call?'\n'+(initial.engine==='python'?'print(repr('+call+'))':'console.log(await ('+call+'));'):'');
      const response=await fetch('api/code/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:initial.engine,code})}),data=await response.json();
      if(!response.ok)throw new Error(data.error||'Execução indisponível');
      const pre=document.createElement('pre');pre.className='clab-native-output';pre.textContent=[data.stdout,data.stderr].filter(Boolean).join('\n')||'(sem saída)';$('.clab-stage').replaceChildren(pre);
      $('.clab-status').textContent=(data.timedOut?'Tempo excedido':'Saída '+data.exitCode)+' · '+data.elapsedMs+' ms';root.dataset.codelabReady='true';
    }catch(e){$('.clab-status').textContent='Não executou: '+e.message;}finally{button.disabled=false;}
  }
  $('[data-clab-run]').onclick=run;$('[data-clab-next]').onclick=()=>{index++;show();};$('[data-clab-prev]').onclick=()=>{index--;show();};$('[data-clab-reset]').onclick=()=>{$('[data-clab-program]').value=initial.program;$('[data-clab-call]').value=initial.call;run();};if(initial.engine==='trace')run();else{root.dataset.codelabReady='true';$('[data-clab-prev]').hidden=true;$('[data-clab-next]').hidden=true;$('.clab-status').textContent='Execução nativa · clique Executar para iniciar.';}
}
