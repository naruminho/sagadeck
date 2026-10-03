for(const player of document.querySelectorAll('.video-player')){
  const slide=player.closest('.slide'),video=player.querySelector('video'),frame=player.querySelector('iframe');
  const start=player.querySelector('[data-video-start]'),advance=player.querySelector('[data-video-advance]'),status=player.querySelector('[data-video-status]');
  let active=false,finished=false,frameId;
  const handoff=()=>{
    if(finished||!slide?.classList.contains('current'))return;
    if(player.hasAttribute('data-video-reveal')){finished=true;active=false;video.pause();player.dataset.revealed='true';slide.dataset.videoRevealed='true';return;}
    const index=[...document.querySelectorAll('.slide')].indexOf(slide);
    if(index>=0&&index+1<window.sagadeck.n){finished=true;active=false;video?.pause();window.sagadeck.goto(index+1);}
  };
  if(start){
    start.onclick=async()=>{try{if(video.ended)video.currentTime=0;finished=false;delete player.dataset.revealed;delete slide.dataset.videoRevealed;video.style.opacity='1';await video.play();if(!slide?.classList.contains('current')){video.pause();return;}active=true;start.hidden=true;status.textContent='';if(video.requestVideoFrameCallback)frameId=video.requestVideoFrameCallback(tick);}catch{status.textContent='Não foi possível iniciar o vídeo. Você pode avançar.';}};
    advance.onclick=handoff;
    if(player.hasAttribute('data-video-stage')){
      player.addEventListener('click',event=>{if(event.target.closest('button'))return;event.preventDefault();event.stopPropagation();active?handoff():start.click();});
      document.addEventListener('keydown',event=>{
        if(!slide?.classList.contains('current')||finished||event.target.closest('input,textarea,select,[contenteditable=true]'))return;
        if(![' ','Enter','ArrowRight','PageDown'].includes(event.key))return;
        event.preventDefault();event.stopImmediatePropagation();active?handoff():start.click();
      },true);
    }
    const check=time=>{if(!active)return;const cue=player.dataset.videoHandoff!=null?Number(player.dataset.videoHandoff):video.duration;const fade=Number(player.dataset.videoFade);if(player.hasAttribute('data-video-reveal')&&Number.isFinite(cue)){video.style.opacity=fade>0?String(Math.max(0,Math.min(1,(cue-time)/fade))):'1';if(time>=cue)handoff();}else if(player.hasAttribute('data-video-next')&&player.dataset.videoHandoff!=null&&time>=cue)handoff();};
    const tick=(_now,meta)=>{check(meta.mediaTime);if(active&&!finished)frameId=video.requestVideoFrameCallback(tick);};
    video.addEventListener('timeupdate',()=>{if(!video.requestVideoFrameCallback)check(video.currentTime)});
    video.addEventListener('ended',()=>{active=false;start.hidden=false;if(player.hasAttribute('data-video-next')||player.hasAttribute('data-video-reveal'))handoff();});
  }
  if(frame&&/^https?:$/.test(location.protocol)){
    const url=new URL(frame.src);url.searchParams.set('enablejsapi','1');url.searchParams.set('origin',location.origin);frame.src=url.href;
  }
  if(slide)new MutationObserver(()=>{
    if(slide.classList.contains('current')){if(video?.loop&&!matchMedia('(prefers-reduced-motion: reduce)').matches)video.play().catch(()=>{});return;}
    video?.pause();frame?.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}),'https://www.youtube-nocookie.com');
    if(start){active=false;finished=false;video.cancelVideoFrameCallback?.(frameId);start.hidden=false;delete player.dataset.revealed;delete slide.dataset.videoRevealed;video.style.opacity="1";}
  }).observe(slide,{attributes:true,attributeFilter:['class']});
}
