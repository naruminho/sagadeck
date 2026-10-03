for(const player of document.querySelectorAll('.video-player')){
  const slide=player.closest('.slide'),video=player.querySelector('video'),frame=player.querySelector('iframe');
  if(frame&&/^https?:$/.test(location.protocol)){
    const url=new URL(frame.src);url.searchParams.set('enablejsapi','1');url.searchParams.set('origin',location.origin);frame.src=url.href;
  }
  if(slide)new MutationObserver(()=>{
    if(slide.classList.contains('current'))return;
    video?.pause();frame?.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}),'https://www.youtube-nocookie.com');
  }).observe(slide,{attributes:true,attributeFilter:['class']});
}
