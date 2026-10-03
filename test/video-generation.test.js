import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseVideoArgs,videoApiURL,videoOperation} from '../src/ai/video-generation.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runCommand} from '../src/ai/commands.js';

test('gerador aceita argumentos documentados separados e URL relativa de polling sem duplicar /api/v1',()=>{
 assert.deepEqual(parseVideoArgs(['--prompt','areia dourada','--out=videos/teste.mp4','--dry-run']),{prompt:'areia dourada',out:'videos/teste.mp4','dry-run':true});
 assert.equal(videoApiURL('/api/v1/videos/job-123'),'https://openrouter.ai/api/v1/videos/job-123');
 assert.equal(videoApiURL('/videos/models'),'https://openrouter.ai/api/v1/videos/models');
 assert.throws(()=>videoApiURL('https://outro.example/jobs/123'),/OpenRouter/);
});

test('planejar não envia POST; submissão persiste job e download retoma sem expor chave ao CDN',async()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'saga-video-')),calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,...opts});
  if(url.endsWith('/models'))return Response.json({data:[{id:'google/veo-3.1-lite',supported_durations:[4],supported_resolutions:['720p'],supported_aspect_ratios:['16:9']}]});
  if(opts.method==='POST')return Response.json({id:'job-123',status:'pending',polling_url:'/api/v1/videos/job-123'});
  if(url.includes('cdn.example'))return new Response(Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]),{headers:{'content-type':'video/mp4'}});
  return Response.json({status:'completed',unsigned_urls:['https://cdn.example/result.mp4'],usage:{cost:1}});
 };
 try{
  fs.writeFileSync(path.join(cwd,'inicio.png'),Buffer.from('frame'));
  const opts={cwd,key:'segredo',fetcher},req={prompt:'partículas luminosas',out:'videos/teste.mp4',firstFrame:'inicio.png'};
  const plan=await videoOperation({...req,action:'plan'},opts);assert.equal(plan.costIncurred,false);assert.equal(calls.some(c=>c.method==='POST'),false);
  const submitted=await videoOperation({...req,action:'submit'},opts);assert.equal(submitted.id,'job-123');
  assert.match(JSON.parse(calls.find(c=>c.method==='POST').body).frame_images[0].image_url.url,/^data:image\/png;base64/);
  assert.ok(fs.existsSync(path.join(cwd,'.sagadeck/videos/job-123.json')));
  const downloaded=await videoOperation({action:'download',id:submitted.id},opts);assert.equal(downloaded.video,'videos/teste.mp4');
  assert.equal(calls.find(c=>c.url.includes('cdn.example')).headers.Authorization,undefined);
  assert.equal((await videoOperation({action:'download',id:submitted.id},opts)).cached,true);
  await assert.rejects(()=>videoOperation({...req,action:'submit',out:'../fora.mp4'},opts),/pasta da apresentação/);
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});

test('chat local expõe operação video e informa ausência de chave sem fingir geração',async()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'saga-video-chat-'));
 try{
  const result=await runCommand({language:'video',why:'Conferir plano sem gasto',code:'{"action":"plan","prompt":"areia fina"}'},{cwd,env:{SAGADECK_VIDEO_KEY:'',OPENROUTER_API_KEY:''}});
  // Sem credencial local, a falha precisa voltar ao agente como falha de ferramenta.
  if(!process.env.SAGADECK_VIDEO_KEY&&!process.env.OPENROUTER_API_KEY){assert.equal(result.exitCode,1);assert.match(result.stderr,/Configure/);}
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
