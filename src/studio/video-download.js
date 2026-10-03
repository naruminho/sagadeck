import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { youtubeId } from '../video-player.js';

export async function downloadYoutube(url, dir, {spawnProcess=spawn, timeoutMs=180000}={}) {
  const id=youtubeId(url);if(!id)throw new Error('Informe um link válido do YouTube.');
  const folder=path.join(dir,'videos');fs.mkdirSync(folder,{recursive:true});
  const file=path.join(folder,`${id}-${crypto.randomBytes(4).toString('hex')}.mp4`);
  const local = process.platform === 'win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA,'SagaDeck','tools','yt-dlp.exe') : '';
  const executable=process.env.SAGADECK_YTDLP || (local && fs.existsSync(local) ? local : 'yt-dlp');
  const bin = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA,'SagaDeck','python','imageio_ffmpeg','binaries') : '';
  const ffmpeg = process.env.SAGADECK_FFMPEG || (bin && fs.existsSync(bin) ? fs.readdirSync(bin).filter(n=>/^ffmpeg.*\.exe$/.test(n)).map(n=>path.join(bin,n))[0] : undefined);
  const args=['--ignore-config','--no-playlist','--no-overwrites','--max-filesize','100M','--socket-timeout','15','--retries','1','--js-runtimes',`node:${process.execPath}`,'-f','bestvideo[ext=mp4][vcodec^=avc1][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]','--merge-output-format','mp4',...(ffmpeg?['--ffmpeg-location',ffmpeg]:[]),'-o',file,'--',`https://www.youtube.com/watch?v=${id}`];
  await new Promise((resolve,reject)=>{
    const child=spawnProcess(executable,args,{cwd:dir,windowsHide:true,stdio:['ignore','ignore','pipe']});let error='',settled=false;
    const finish=(e)=>{if(settled)return;settled=true;clearTimeout(timer);e?reject(e):resolve()};
    const timer=setTimeout(()=>{child.kill();finish(new Error('O download excedeu três minutos.'))},timeoutMs);
    child.stderr?.on('data',d=>{error=(error+d.toString()).slice(-2000)});
    child.on('error',e=>finish(new Error(e.code==='ENOENT'?'yt-dlp não instalado. Configure SAGADECK_YTDLP com o caminho do executável.':e.message)));
    child.on('close',code=>finish(code===0?null:new Error(error||`Download falhou (${code}).`)));
  });
  if(!fs.existsSync(file)||!fs.statSync(file).size)throw new Error('O YouTube não forneceu um arquivo MP4.');
  if(fs.statSync(file).size>100*1024*1024){fs.unlinkSync(file);throw new Error('Use um vídeo menor que 100 MB.');}
  return {url:path.relative(dir,file).replace(/\\/g,'/'),source:`https://www.youtube.com/watch?v=${id}`};
}
