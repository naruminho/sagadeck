import fs from 'node:fs';
import path from 'node:path';
import { esc } from './markup.js';
import {iconSVG} from './figures/icons.js';

export function youtubeId(value) {
  try {
    const u = new URL(value), host = u.hostname.toLowerCase();
    if (host === 'youtu.be') return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (!['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) return null;
    const id = u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})(?:\/|$)/)?.[1];
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
export function videoPlayer(e, ctx = {}) {
  const id = youtubeId(e.video), label = esc(e.label || 'Vídeo');
  if (id) return `<div class="video-player"><iframe title="${label}" src="https://www.youtube-nocookie.com/embed/${id}?rel=0" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><small>YouTube · reprodução online</small></div>`;
  let url = String(e.video || '');
  if (!/^https?:|^data:/i.test(url) && /\.(mp4|webm|ogg)$/i.test(url)) {
    const file = path.resolve(ctx.baseDir || process.cwd(), url);
    if (fs.existsSync(file)) {
      const mime = /\.mp4$/i.test(file) ? 'video/mp4' : /\.webm$/i.test(file) ? 'video/webm' : 'video/ogg';
      url = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
    } else { ctx.warnings?.push(`Vídeo não encontrado: ${url}`); return `<div class="fig-pending">${label}: arquivo não encontrado</div>`; }
  }
  if (/\.(mp4|webm|ogg)(?:\?|$)|^data:video\//i.test(url)) {
    let poster=e.poster;
    if(poster&&!/^(https?:|data:)/i.test(poster)){
      const file=path.resolve(ctx.baseDir||process.cwd(),poster);
      if(fs.existsSync(file)){const ext=path.extname(file).slice(1).toLowerCase();poster=`data:image/${ext==='jpg'?'jpeg':ext};base64,${fs.readFileSync(file).toString('base64')}`;}
      else ctx.warnings?.push(`Poster não encontrado: ${poster}`);
    }
    // loop silencioso (fundo vivo, detalhe animado): sem controles, repete sozinho
    const posterAttr=poster?` poster="${esc(poster)}"`:'';
    if(e.start==='manual')return `<div class="video-player video-opening${e.composite==='screen'?' video-composite':''}" data-video-opening${e.finish==='next'?' data-video-next':''}${e.finish==='reveal'?' data-video-reveal':''} data-video-fade="${Number.isFinite(e.fadeOut)?Math.max(0,e.fadeOut):0.4}"${Number.isFinite(e.handoffAt)&&e.handoffAt>=0?` data-video-handoff="${e.handoffAt}"`:''}><video title="${label}" src="${esc(url)}"${posterAttr} muted playsinline preload="auto" disablepictureinpicture></video><div class="video-opening-controls"><button data-video-start>${iconSVG('play',20)} Iniciar abertura</button><button data-video-advance>${iconSVG('arrow-right',20)} Avançar</button><output data-video-status aria-live="polite"></output></div></div>`;
    if (e.loop) return `<div class="video-player video-loop"><video title="${label}" src="${esc(url)}"${posterAttr} autoplay muted loop playsinline preload="auto" disablepictureinpicture></video></div>`;
    return `<div class="video-player"><video title="${label}" controls preload="metadata" playsinline src="${esc(url)}"></video></div>`;
  }
  return null;
}
