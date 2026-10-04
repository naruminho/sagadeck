import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
test('chat recupera limite após ferramenta sem repetir execução nem perder streaming',async()=>{
 const calls=[];let runs=0;
 const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);calls.push(body);const n=calls.length;const content=n===1?'```yaml\nrun: {language: web, code: \'{"action":"search","query":"marca"}\'}\n```':n===2?'incompleto':'```yaml\nedit:\n  1: {title: Revisado}\n```';res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content},finish_reason:n===2?'length':'stop'}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const before=process.env.SAGADECK_LLM_URL;process.env.SAGADECK_LLM_URL=`http://127.0.0.1:${server.address().port}/v1`;
 try{const {editDeck}=await import('../src/ai/deck-ai.js');const progress=[];const result=await editDeck({spec:{slides:[{layout:'cover',title:'Inicial'}]},instruction:'Use a fonte observada',onProgress:e=>progress.push(e),runCommand:async()=>{runs++;return {stdout:'FONTE_OBSERVADA'};}});assert.equal(result.spec.slides[0].title,'Revisado');assert.equal(runs,1);assert.equal(calls.length,3);assert.ok(calls.every(c=>c.stream===true));assert.equal(calls[2].reasoning.enabled,false);assert.match(JSON.stringify(calls[2].messages),/FONTE_OBSERVADA/);assert.ok(progress.some(e=>e.phase==='retry'&&/limite/i.test(e.text)));}
 finally{if(before==null)delete process.env.SAGADECK_LLM_URL;else process.env.SAGADECK_LLM_URL=before;server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('recuperação de tokens é limitada e segunda falha mantém o diagnóstico',async()=>{
 let calls=0;const server=http.createServer((req,res)=>{req.resume();calls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'parcial'},finish_reason:'length'}]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const before=process.env.SAGADECK_LLM_URL;process.env.SAGADECK_LLM_URL=`http://127.0.0.1:${server.address().port}/v1`;
 try{const {editDeck}=await import('../src/ai/deck-ai.js');await assert.rejects(editDeck({spec:{slides:[{layout:'cover',title:'Inicial'}]},instruction:'Criar'}),e=>e.code==='AI_TOKEN_LIMIT');assert.equal(calls,2);}
 finally{if(before==null)delete process.env.SAGADECK_LLM_URL;else process.env.SAGADECK_LLM_URL=before;server.closeAllConnections();await new Promise(r=>server.close(r));}
});
