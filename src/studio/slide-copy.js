// Transfere somente arquivos de mídia referenciados; nunca a pasta inteira do deck.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const media = /\.(png|jpe?g|svg|webp|gif|avif|mp4|webm|mov|mp3|wav|ogg|html?|css|m?js|woff2?|ttf)$/i;
const fields = new Set(['image','video','poster','audio','src','url']);
export async function copySlideAssets(slide, sourceFile, targetFile) {
 const source=path.dirname(sourceFile), target=path.dirname(targetFile);
 const prefix='copiados/'+crypto.randomUUID(), copied=new Set();
 const local=v=>typeof v==='string'&&!/^(https?:|data:|blob:|\/\/|#)/i.test(v)&&media.test(v.split(/[?#]/)[0]);
 async function file(ref,from=source){
  const abs=path.resolve(from,ref.split(/[?#]/)[0]);const rel=path.relative(source,abs);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('A mídia deve estar dentro da pasta da apresentação de origem.');
  // os dois lados pelo caminho real: a pasta aberta por junção (ou nome curto do Windows, RUNNER~1) não bate com o
  // caminho resolvido do arquivo e toda mídia parecia "fora da apresentação"
  const real=await fs.realpath(abs);const rr=path.relative(await fs.realpath(source),real);if(rr.startsWith('..')||path.isAbsolute(rr))throw Error('Referência de mídia fora da apresentação.');
  const out=path.join(target,prefix,rel);
  if(!copied.has(abs)){copied.add(abs);await fs.mkdir(path.dirname(out),{recursive:true});await fs.copyFile(abs,out);
   if(/\.(html?|css)$/i.test(abs)){const text=await fs.readFile(abs,'utf8');for(const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)){const dep=m[1]||m[2];if(local(dep))await file(dep,path.dirname(abs));}}
  }
  return (prefix+'/'+rel.split(path.sep).join('/'))+(ref.match(/[?#].*$/)?.[0]||'');
 }
 async function walk(v,key){if(typeof v==='string'&&fields.has(key)&&local(v))return file(v);
  if(typeof v==='string'&&key==='html'){
   const refs=[...v.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)];
   for(const m of refs){const ref=m[1]||m[2];if(local(ref))v=v.replaceAll(ref,await file(ref));}return v;
  }
  if(Array.isArray(v))return Promise.all(v.map(x=>walk(x,key)));
  if(v&&typeof v==='object'){const out={};for(const [k,x]of Object.entries(v))out[k]=await walk(x,k);return out;}return v;
 }
 const result=await walk(slide);result.uid=crypto.randomUUID();return result;
}
