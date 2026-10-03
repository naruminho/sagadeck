import { traceHTML } from './trace-view.js';
// Mesmo interpretador do algoritmo animado; não há eval, rede nem processo Python no navegador.
for(const root of document.querySelectorAll('[data-codelab]')){
  const $=s=>root.querySelector(s),initial=JSON.parse($('.clab-model').textContent);let index=0;
  const show=()=>{const frames=[...root.querySelectorAll('.dyn-frame')];index=Math.max(0,Math.min(frames.length-1,index));frames.forEach((e,i)=>{e.classList.toggle('active',i===index);e.setAttribute('aria-hidden',i!==index);});$('.clab-status').textContent=`Passo ${index+1} de ${frames.length}`;};
  function run(){try{const warnings=[],program=$('[data-clab-program]').value,call=$('[data-clab-call]').value;if(program.length>16000||call.length>2000)throw new Error('Reduza o programa ou a entrada para uma experiência de aula.');const html=traceHTML({maxSteps:initial.maxSteps},{program,call,view:null,name:'Sua execução'},{warnings},()=>'',(i,body,extra='')=>`<section class="lesson-panel dyn-frame ${extra}" data-lesson-panel="${i}">${body}</section>`);
    if(warnings.length&&html.includes('dyn-error'))throw new Error(warnings.join(' '));$('.clab-stage').innerHTML=html;index=0;show();root.dataset.codelabReady='true';
  }catch(e){$('.clab-status').textContent=`Não executou: ${e.message}`;}}
  $('[data-clab-run]').onclick=run;$('[data-clab-next]').onclick=()=>{index++;show();};$('[data-clab-prev]').onclick=()=>{index--;show();};$('[data-clab-reset]').onclick=()=>{$('[data-clab-program]').value=initial.program;$('[data-clab-call]').value=initial.call;run();};run();
}
