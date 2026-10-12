import { mediaPrompt } from './art-direction.js';
import { llmConfig, providerFetch } from './llm.js';
// Operações curtas e retomáveis: o chat não fica preso esperando o render do provedor.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE='https://openrouter.ai/api/v1';
export const DEFAULT_VIDEO_MODEL='google/veo-3.1-lite';

// De onde o vídeo sai. Com um modelo de vídeo em Configurar IA (papel "video"), pela mesma camada da IA: o endereço, a
// chave, os cabeçalhos e o adaptador de lá, como texto e imagem. Sem ele, como sempre foi: OpenRouter, com
// SAGADECK_VIDEO_KEY ou OPENROUTER_API_KEY. SAGADECK_VIDEO_URL e SAGADECK_VIDEO_MODEL trocam endereço e modelo.
export function videoSetup({env=process.env,cfg=llmConfig(env)}={}){
 const viaConfig=!!cfg.videoModel&&!!(cfg.url||cfg.adaptador);
 return {
  base:String(env.SAGADECK_VIDEO_URL||(viaConfig?cfg.url:BASE)).replace(/\/+$/,''),
  key:env.SAGADECK_VIDEO_KEY||(viaConfig?cfg.key:'')||env.OPENROUTER_API_KEY||'',
  model:env.SAGADECK_VIDEO_MODEL||cfg.videoModel||DEFAULT_VIDEO_MODEL,
  headers:viaConfig?cfg.headers||{}:{},adaptador:viaConfig?cfg.adaptador||'':'',
  origem:viaConfig?'configuração da IA':'variáveis de ambiente',
 };
}
// a conexão de cada operação: setup explícito, ou {key, fetcher} (compatível com quem já chamava assim, no OpenRouter)
function conn({setup,key,fetcher}={}){
 const s=setup||(key!==undefined?{base:BASE,key,model:DEFAULT_VIDEO_MODEL,headers:{},adaptador:''}:videoSetup());
 const call=fetcher||(s.adaptador?(url,init)=>providerFetch({adaptador:s.adaptador},url,init):fetch);
 const auth=s.key?{Authorization:`Bearer ${s.key}`}:{};
 return {...s,base:String(s.base||BASE).replace(/\/+$/,''),call,auth:{...(s.headers||{}),...auth}};
}
// o catálogo de modelos de vídeo, quando o provedor tem um (nem todo tem): { ok, models } ou { ok: false, motivo }
export async function videoCatalog(opts={}){
 const c=conn(opts);
 try{
  const r=await c.call(`${c.base}/videos/models`,{method:'GET',headers:c.auth,signal:AbortSignal.timeout(15000)});
  if(r.status===401||r.status===403)return{ok:false,motivo:`a chave foi recusada (HTTP ${r.status})`};
  if(!r.ok)return{ok:false,motivo:`o provedor não tem catálogo de vídeo (HTTP ${r.status})`};
  const data=(await r.json()).data;
  return Array.isArray(data)?{ok:true,models:data}:{ok:false,motivo:'o provedor não devolveu um catálogo de vídeo'};
 }catch(e){return{ok:false,motivo:`o catálogo não respondeu (${e.message})`};}
}
export function parseVideoArgs(args){
 const result={};for(let i=0;i<args.length;i++){
  const m=args[i].match(/^--([^=]+)(?:=(.*))?$/);if(!m)throw new Error(`Argumento inesperado: ${args[i]}`);
  result[m[1]]=m[2]??(args[i+1]&&!args[i+1].startsWith('--')?args[++i]:true);
 }return result;
}
// endereço de uma operação de vídeo: relativo à base configurada, ou absoluto mas no MESMO servidor e caminho (a
// chave nunca vai para outro lugar, mesmo que a resposta do provedor mande consultar outro endereço)
export function videoApiURL(value,base=BASE){
  const b=new URL(String(base).replace(/\/+$/,'')+'/'),v=String(value);
  const url=/^https?:/i.test(v)?new URL(v):v.startsWith(b.pathname)?new URL(v,b.origin):new URL(v.replace(/^\//,''),b);
  if(url.origin!==b.origin||!url.pathname.startsWith(b.pathname+'videos'))throw new Error(`O acompanhamento do vídeo precisa usar o mesmo endereço de vídeo configurado (${b.host}): a chave não vai para outro servidor.`);
  return url.href;
}
// quanto custa ANTES de gerar (para mostrar na aprovação): catálogo é de graça; null se não der para estimar
export async function estimateVideoCost({model,duration,resolution},opts={}){
  try{
   const c=conn(opts);
   if(!c.key&&!c.adaptador)return null;
   const cat=await videoCatalog(opts);if(!cat.ok)return null;
   const meta=cat.models.find((m)=>m.id===(model||c.model)||m.canonical_slug===(model||c.model));
   const skus=meta?.pricing_skus||meta?.pricing||null;
   const perSec=Number(skus?.[/1080|1k|2k|4k/i.test(String(resolution||''))?'per-video-second-1080p':'per-video-second']);
   if(!Number.isFinite(perSec)||perSec<0)return null;
   const total=perSec*Number(duration||0);
   return Number.isFinite(total)&&total>0?`~$${total.toFixed(2)}`:null;
  }catch{return null;}
}
function within(dir,name){
 const target=path.resolve(dir,name),rel=path.relative(path.resolve(dir),target);
 if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Salve o vídeo dentro da pasta da apresentação.');
 return target;
}
export async function videoOperation(request,{cwd,...opts}={}){
 if(request.action==='frame'){const {videoFrame}=await import('./video-frames.js');return videoFrame(request,{cwd});}
 const c=conn(opts);
 if(!c.key&&!c.adaptador)throw new Error('Configure o vídeo: um modelo de vídeo em Configurar IA, ou SAGADECK_VIDEO_KEY / OPENROUTER_API_KEY. O modelo de texto não gera vídeo.');
 const api=async(value,body)=>{
  const r=await c.call(videoApiURL(value,c.base),{method:body?'POST':'GET',headers:{...c.auth,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error(`API de vídeo retornou HTTP ${r.status}.`);return r.json();
 };
 const action=request.action||'plan';
 if(['plan','submit'].includes(action)){
  // o catálogo valida modelo, duração e resolução quando existe; sem ele (nem todo provedor tem), o pedido vai como
  // veio e quem recusa é a API. duration/resolution "min": o clipe mais curto e leve que o modelo aceita (teste)
  const model=request.model||c.model,cat=await videoCatalog(opts);
  const meta=cat.ok?cat.models.find(m=>m.id===model||m.canonical_slug===model):null;if(cat.ok&&!meta)throw new Error(`Modelo de vídeo indisponível: ${model}`);
  const px=(r)=>Number(String(r).match(/\d+/)?.[0]||0)*(/k/i.test(String(r))?1000:1);
  const duration=request.duration==='min'?Math.min(...(meta?.supported_durations?.map(Number).filter(Number.isFinite)||[4])):Number(request.duration||4);
  const resolution=request.resolution==='min'?([...(meta?.supported_resolutions||[])].sort((a,b)=>px(a)-px(b))[0]||'720p'):request.resolution||'720p';
  const body={model,prompt:String(request.prompt||''),duration,resolution,aspect_ratio:request.aspect||'16:9',generate_audio:false};
  if(!body.prompt.trim())throw new Error('Descreva o clipe antes de gerar.');
  body.prompt=mediaPrompt(body.prompt); // plan mostra exatamente o prompt que submit enviará.
  if(!Number.isInteger(body.duration)||body.duration<1)throw new Error('Duração precisa ser um número inteiro positivo.');
  for(const [field,list] of [['duration',meta?.supported_durations],['resolution',meta?.supported_resolutions],['aspect_ratio',meta?.supported_aspect_ratios]])if(list?.length&&!list.map(String).includes(String(body[field])))throw new Error(`${field} não suportado por ${model}.`);
  if(request.seed!=null){body.seed=Number(request.seed);if(!Number.isInteger(body.seed)||body.seed<0)throw new Error('seed precisa ser inteiro não negativo.');}
  const frames=[];
  for(const [field,type] of [['firstFrame','first_frame'],['lastFrame','last_frame']])if(request[field]){
    if(!cwd)throw new Error('Abra a apresentação para usar frames locais.');
    const file=within(cwd,request[field]),ext=path.extname(file).toLowerCase();
    if(!['.png','.jpg','.jpeg','.webp'].includes(ext))throw new Error('Frame precisa ser PNG, JPEG ou WebP.');
    if(fs.statSync(file).size>10*1024*1024)throw new Error('Frame excede 10 MB.');
    frames.push({type:'image_url',frame_type:type,image_url:{url:`data:image/${ext==='.jpg'?'jpeg':ext.slice(1)};base64,${fs.readFileSync(file).toString('base64')}`}});
  }
  if(frames.length)body.frame_images=frames;
  const summary={...body,...(frames.length?{frame_images:frames.map(f=>({frame_type:f.frame_type,local:true}))}:{})};
  if(action==='plan')return{action,costIncurred:false,request:summary,pricing:meta?.pricing_skus||meta?.pricing||null};
  if(!cwd)throw new Error('Abra uma apresentação salva antes de gerar vídeo.');
  const output=within(cwd,request.out||`videos/clip-${crypto.randomUUID()}.mp4`);if(fs.existsSync(output))throw new Error('O arquivo de saída já existe; escolha outro nome.');
  const job=await api('/videos',body);
  if(!/^[\w-]+$/.test(job.id||''))throw new Error('A API não devolveu um identificador de job válido.');
  const folder=path.join(cwd,'.sagadeck','videos');fs.mkdirSync(folder,{recursive:true});
  const record={id:job.id,polling_url:videoApiURL(job.polling_url||`/videos/${job.id}`,c.base),output:path.relative(cwd,output).split(path.sep).join("/"),request:summary,createdAt:new Date().toISOString()};
  fs.writeFileSync(path.join(folder,job.id+'.json'),JSON.stringify(record,null,2),{flag:'wx'});
  return{id:job.id,status:job.status,output:record.output,nextAction:'status'};
 }
 if(!['status','download'].includes(action))throw new Error('Ação de vídeo: plan, submit, status ou download.');
 if(!/^[\w-]+$/.test(request.id||''))throw new Error('Informe o id da geração.');
 const file=within(cwd,`.sagadeck/videos/${request.id}.json`),record=JSON.parse(fs.readFileSync(file,'utf8'));
 const job=await api(record.polling_url);
 if(action==='status'||job.status!=='completed')return{id:record.id,status:job.status,error:job.error||null,cost:job.usage?.cost??null};
 const output=within(cwd,record.output);if(fs.existsSync(output))return{id:record.id,status:'downloaded',video:record.output,cached:true};
 const url=new URL(job.unsigned_urls?.[0]||`${c.base}/videos/${record.id}/content?index=0`);
 if(url.protocol!=='https:'&&url.origin!==new URL(c.base).origin)throw new Error('Download do vídeo exige HTTPS.');
 // a chave só vai junto se o download é no próprio provedor (o link assinado de um CDN não precisa dela)
 const r=await c.call(url.href,{headers:url.origin===new URL(c.base).origin?c.auth:{},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new Error(`Download retornou HTTP ${r.status}.`);
 const mime=r.headers.get('content-type')||'';if(!/^video\/|application\/octet-stream/i.test(mime))throw new Error('O provedor não retornou um arquivo de vídeo.');
 const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>100*1024*1024)throw new Error('Vídeo excede 100 MB.');chunks.push(chunk);}
  const data=Buffer.concat(chunks);if(data.length<12||data.toString('ascii',4,8)!=='ftyp')throw new Error('O resultado não é um MP4 válido.');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data,{flag:'wx'});
  return{id:record.id,status:'downloaded',video:record.output,bytes,cost:job.usage?.cost??null};
}

// vigia os jobs do deck: confere andamento (grátis), baixa sozinho o que terminou.
// para o ticker do Studio avisar "clipe pronto" sem a pessoa ficar olhando.
const lastCheck = new Map(); // polling_url -> { at, status }
export async function pollVideoJobs(cwd,{cooldownMs=60000,...opts}={}){
  const c=conn(opts),can=!!(c.key||c.adaptador);
  const dir=path.join(path.resolve(cwd),'.sagadeck','videos');
  let files=[];
  try{files=fs.readdirSync(dir).filter((f)=>f.endsWith('.json'));}catch{return[];}
  const out=[];
  for(const f of files){
   let record;try{record=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));}catch{continue;}
   if(!record?.id||!record?.polling_url)continue;
   const done=record.downloadedAt||(record.output&&fs.existsSync(path.join(path.resolve(cwd),record.output))&&record.status==='completed');
   const cached=lastCheck.get(record.polling_url);
   let status=record.status||'unknown';
   if(cached&&Date.now()-cached.at<cooldownMs) status=cached.status;
   else if(!done&&can){
    try{
     const r=await c.call(videoApiURL(record.polling_url,c.base),{headers:c.auth,signal:AbortSignal.timeout(15000)});
     if(r.ok){const job=await r.json();status=job.status||status;lastCheck.set(record.polling_url,{at:Date.now(),status});}
    }catch{/* sem rede: mantém o último */}
   }
   let video=record.output&&fs.existsSync(path.join(path.resolve(cwd),record.output))?record.output:null;
   if(status==='completed'&&!video&&can){
    try{
     const dl=await videoOperation({action:'download',id:record.id},{cwd,...opts});
     video=dl.video;status='downloaded';
     record.downloadedAt=new Date().toISOString();record.status='completed';
     try{fs.writeFileSync(path.join(dir,f),JSON.stringify(record,null,2));}catch{}
    }catch{/* tenta de novo no próximo ciclo */}
   }
   if(video)status='downloaded'; // arquivo em disco manda: pronto para usar, em qualquer chamada
   out.push({id:record.id,status,video:video||null});
  }
  return out;
}
