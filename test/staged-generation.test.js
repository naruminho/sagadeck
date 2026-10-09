import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stagedGeneration} from '../src/ai/staged-generation.js';
import http from 'node:http';

test('geração completa recupera finish_reason length pelo próprio fluxo de IA',async()=>{
 let calls=0;
 const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const request=JSON.parse(raw);calls++;let text;
 if(calls===3)text=JSON.stringify({identity:'clara',slides:[{title:'A'},{title:'B'},{title:'C'},{title:'D'}]});
 else if(calls===4)text='```yaml\ntitle: Evento\ntheme: prisma\nslides:\n  - {layout: section, title: A}\n  - {layout: section, title: B}\n  - {layout: section, title: C}\n```';
 else text='```yaml\nslides:\n  - {layout: section, title: D}\n```';
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{role:'assistant',content:text},finish_reason:calls<=2?'length':'stop'}]}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const before=process.env.SAGADECK_LLM_URL;process.env.SAGADECK_LLM_URL=`http://127.0.0.1:${server.address().port}/v1`;
 try{const {generateDeck}=await import('../src/ai/deck-ai.js');const result=await generateDeck('Quatro cenas',{research:false,images:false});assert.deepEqual(result.spec.slides.map(s=>s.title),['A','B','C','D']);assert.equal(result.spec.theme,'prisma');assert.equal(calls,5);}
 finally{if(before==null)delete process.env.SAGADECK_LLM_URL;else process.env.SAGADECK_LLM_URL=before;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('geração em etapas preserva sequência e identidade com grupos limitados', async () => {
 const calls=[], progress=[];
 const slides=Array.from({length:7},(_,i)=>({title:`Cena ${i}`,visual:'motion'}));
 const result=await stagedGeneration('Pedido completo',{starter:{slides:[{title:'Nova apresentação'}]},wishes:'Tema claro',options:{images:false},say:s=>progress.push(s),plan:async()=>({text:JSON.stringify({identity:'azul e magenta',slides})}),edit:async request=>{
  calls.push(request);
  const count=calls.length===3?1:3;
  return {spec:{title:'Evento',theme:'prisma',slides:Array.from({length:count},()=>({layout:'canvas'}))}};
 }});
 assert.equal(result.spec.slides.length,7);
 assert.equal(calls.length,3);
 assert.match(calls[1].instruction,/prisma/);
 assert.ok(calls.every(c=>c.instruction.includes('Pedido completo')&&c.instruction.includes('azul e magenta')));
 assert.equal(progress.length,4);
});

test('etapa incompleta falha antes de devolver um deck como concluído',async()=>{
 await assert.rejects(stagedGeneration('Pedido',{starter:{},wishes:'',options:{},say:()=>{},plan:async()=>({text:'{"slides":[{},{}]}'}),edit:async()=>({spec:{slides:[{}]}})}),/incompleta não foi salva/);
});
