// Operações curtas e retomáveis: o chat não fica preso esperando o render do provedor.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE='https://openrouter.ai/api/v1';
export function parseVideoArgs(args){
 const result={};for(let i=0;i<args.length;i++){
  const m=args[i].match(/^--([^=]+)(?:=(.*))?$/);if(!m)throw new Error(`Argumento inesperado: ${args[i]}`);
  result[m[1]]=m[2]??(args[i+1]&&!args[i+1].startsWith('--')?args[++i]:true);
 }return result;
}
export function videoApiURL(value){
 const url=new URL(String(value).startsWith('/api/v1/')?value:String(value).replace(/^\//,''),BASE+'/');
 if(url.origin!=='https://openrouter.ai'||!url.pathname.startsWith('/api/v1/videos'))throw new Error('Polling precisa usar a API de vídeo do OpenRouter.');
 return url.href;
}
function within(dir,name){
 const target=path.resolve(dir,name),rel=path.relative(path.resolve(dir),target);
 if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Salve o vídeo dentro da pasta da apresentação.');
 return target;
}
export async function videoOperation(request,{cwd,key=process.env.SAGADECK_VIDEO_KEY||process.env.OPENROUTER_API_KEY,fetcher=fetch}={}){
 if(!key)throw new Error('Configure SAGADECK_VIDEO_KEY ou OPENROUTER_API_KEY para a API de vídeo. O modelo de texto não gera vídeo.');
 const api=async(value,body)=>{
  const r=await fetcher(videoApiURL(value),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error(`API de vídeo retornou HTTP ${r.status}.`);return r.json();
 };
 const action=request.action||'plan';
 if(['plan','submit'].includes(action)){
  const model=request.model||'google/veo-3.1-lite',catalog=await api('/videos/models');
  const meta=catalog.data?.find(m=>m.id===model||m.canonical_slug===model);if(!meta)throw new Error(`Modelo de vídeo indisponível: ${model}`);
  const body={model,prompt:String(request.prompt||''),duration:Number(request.duration||4),resolution:request.resolution||'720p',aspect_ratio:request.aspect||'16:9',generate_audio:false};
  if(!body.prompt.trim())throw new Error('Descreva o clipe antes de gerar.');
  if(!Number.isInteger(body.duration)||body.duration<1)throw new Error('Duração precisa ser um número inteiro positivo.');
  for(const [field,list] of [['duration',meta.supported_durations],['resolution',meta.supported_resolutions],['aspect_ratio',meta.supported_aspect_ratios]])if(list?.length&&!list.map(String).includes(String(body[field])))throw new Error(`${field} não suportado por ${model}.`);
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
  if(action==='plan')return{action,costIncurred:false,request:summary,pricing:meta.pricing_skus||meta.pricing||null};
  if(!cwd)throw new Error('Abra uma apresentação salva antes de gerar vídeo.');
  const output=within(cwd,request.out||`videos/clip-${crypto.randomUUID()}.mp4`);if(fs.existsSync(output))throw new Error('O arquivo de saída já existe; escolha outro nome.');
  const job=await api('/videos',body);
  if(!/^[\w-]+$/.test(job.id||''))throw new Error('A API não devolveu um identificador de job válido.');
  const folder=path.join(cwd,'.sagadeck','videos');fs.mkdirSync(folder,{recursive:true});
  const record={id:job.id,polling_url:videoApiURL(job.polling_url||`/videos/${job.id}`),output:path.relative(cwd,output).split(path.sep).join("/"),request:summary,createdAt:new Date().toISOString()};
  fs.writeFileSync(path.join(folder,job.id+'.json'),JSON.stringify(record,null,2),{flag:'wx'});
  return{id:job.id,status:job.status,output:record.output,nextAction:'status'};
 }
 if(!['status','download'].includes(action))throw new Error('Ação de vídeo: plan, submit, status ou download.');
 if(!/^[\w-]+$/.test(request.id||''))throw new Error('Informe o id da geração.');
 const file=within(cwd,`.sagadeck/videos/${request.id}.json`),record=JSON.parse(fs.readFileSync(file,'utf8'));
 const job=await api(record.polling_url);
 if(action==='status'||job.status!=='completed')return{id:record.id,status:job.status,error:job.error||null,cost:job.usage?.cost??null};
 const output=within(cwd,record.output);if(fs.existsSync(output))return{id:record.id,status:'downloaded',video:record.output,cached:true};
 const url=new URL(job.unsigned_urls?.[0]||`${BASE}/videos/${record.id}/content?index=0`);
 if(url.protocol!=='https:')throw new Error('Download do vídeo exige HTTPS.');
 const r=await fetcher(url.href,{headers:url.origin==='https://openrouter.ai'?{Authorization:`Bearer ${key}`}:{},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new Error(`Download retornou HTTP ${r.status}.`);
 const mime=r.headers.get('content-type')||'';if(!/^video\/|application\/octet-stream/i.test(mime))throw new Error('O provedor não retornou um arquivo de vídeo.');
 const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>100*1024*1024)throw new Error('Vídeo excede 100 MB.');chunks.push(chunk);}
 const data=Buffer.concat(chunks);if(data.length<12||data.toString('ascii',4,8)!=='ftyp')throw new Error('O resultado não é um MP4 válido.');
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data,{flag:'wx'});
 return{id:record.id,status:'downloaded',video:record.output,bytes,cost:job.usage?.cost??null};
}
