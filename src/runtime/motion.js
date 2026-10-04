for(const frame of document.querySelectorAll('iframe[data-motion]')){
 const slide=frame.closest('.slide');let started=false,done=false;
 const send=(kind,active)=>frame.contentWindow?.postMessage({sagaMotion:kind,active},'*');
 const finish=()=>{if(done||!slide?.classList.contains('current'))return;done=true;
  if(frame.dataset.motionFinish==='next'){const i=[...document.querySelectorAll('.slide')].indexOf(slide);window.sagadeck.goto(i+1);}
  else if(frame.dataset.motionFinish==='video'){frame.style.visibility='hidden';slide.querySelector('[data-video-start]')?.click();}
 };
 if(frame.dataset.motion==='chat'&&frame.dataset.motionManual==='true'){
  const begin=e=>{if(!slide?.classList.contains('current')||done||e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(e.type==='keydown'&&![' ','Enter','ArrowRight','PageDown'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();if(started){finish();return;}started=true;send('start');};
  document.addEventListener('keydown',begin,true);slide.addEventListener('click',begin,true);
 }
 window.addEventListener('message',e=>{if(e.source!==frame.contentWindow)return;if(e.data?.sagaMotion==='done')finish();if(e.data?.sagaMotion==='start-request'&&slide?.classList.contains('current')&&!done){if(started)finish();else{started=true;send('start');}}});
 const activate=()=>{const active=slide?.classList.contains('current');send('active',active);if(document.documentElement.classList.contains('export')||document.documentElement.dataset.motion==='none'||matchMedia('(prefers-reduced-motion: reduce)').matches)send('poster');if(!active){started=false;done=false;frame.style.visibility='';send('reset');}};
 frame.addEventListener('load',activate);if(slide)new MutationObserver(activate).observe(slide,{attributes:true,attributeFilter:['class']});
}
