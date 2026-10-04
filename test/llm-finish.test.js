import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {chat} from '../src/ai/llm.js';
import {inspectPDFPage} from '../src/ai/document-visuals.js';

test('limite de tokens vem do provedor, incluindo streaming; visão amplia uma vez e distingue causa desconhecida',async()=>{
  const previous=process.env.SAGADECK_LLM_URL, previousBudget=process.env.SAGADECK_DOCUMENT_VISION_TOKENS;
  const requests=[];let reply={text:'',reason:'length'},stream=false;
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);requests.push(body);
    const result=typeof reply==='function'?reply(body):reply;
    if(stream){res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: '+JSON.stringify({choices:[{delta:{content:result.text},finish_reason:result.reason}]})+'\n\ndata: [DONE]\n\n');}
    else {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:result.text},finish_reason:result.reason}]}));}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  process.env.SAGADECK_LLM_URL=`http://127.0.0.1:${server.address().port}/v1`;
  process.env.SAGADECK_DOCUMENT_VISION_TOKENS='6000';
  try {
    assert.equal((await chat([{role:'user',content:'test'}],{allowTruncated:true})).finishReason,'length');
    await assert.rejects(chat([{role:'user',content:'test'}]),e=>e.code==='AI_TOKEN_LIMIT');
    stream=true;
    assert.equal((await chat([{role:'user',content:'test'}],{onDelta:()=>{},allowTruncated:true})).finishReason,'length');
    stream=false;
    reply=b=>b.max_tokens===6000?{text:'{"complete":',reason:'length'}:{text:'{"complete":true,"items":[]}',reason:'stop'};
    const progress=[];
    assert.deepEqual(await inspectPDFPage('data:image/png;base64,a',1,{onProgress:e=>progress.push(e)}),{complete:true,items:[]});
    assert.deepEqual(requests.slice(-2).map(r=>r.max_tokens),[6000,12000]);
    assert.equal(requests.at(-1).reasoning.enabled,false);
    assert.match(progress[0].text,/6000 tokens/);
    reply={text:'',reason:'length'};
    await assert.rejects(inspectPDFPage('data:image/png;base64,a',1),/limite de tokens/);
    reply={text:'not json',reason:undefined};
    await assert.rejects(inspectPDFPage('data:image/png;base64,a',1),/causa desconhecida/);
  } finally {
    if(previous===undefined)delete process.env.SAGADECK_LLM_URL;else process.env.SAGADECK_LLM_URL=previous;
    if(previousBudget===undefined)delete process.env.SAGADECK_DOCUMENT_VISION_TOKENS;else process.env.SAGADECK_DOCUMENT_VISION_TOKENS=previousBudget;
    await new Promise(r=>{server.closeAllConnections();server.close(r);});
  }
});

test('falhas transitórias repetem automaticamente; acesso negado e cancelamento não repetem',async()=>{
  let calls=0,status=502,stream=false;
  const server=http.createServer((req,res)=>{req.resume();calls++;if(stream&&calls===1){res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: '+JSON.stringify({error:{message:'Upstream provider terminated the stream before completion.',code:502}})+'\n\n');return;}res.writeHead(calls===1?status:200,{'content-type':'application/json'});res.end(calls===1?JSON.stringify({error:{message:'temporarily unavailable'}}):JSON.stringify({choices:[{message:{content:'ok'},finish_reason:'stop'}]}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const cfg={url:`http://127.0.0.1:${server.address().port}`,textModel:'test',timeoutMs:1000};
  try {
    const events=[];
    assert.equal((await chat([{role:'user',content:'test'}],{cfg,retryDelayMs:0,onRetry:e=>events.push(e)})).text,'ok');
    assert.equal(calls,2);assert.equal(events[0].attempt,2);
    calls=0;stream=true;
    assert.equal((await chat([{role:'user',content:'test'}],{cfg,onDelta:()=>{},retryDelayMs:0})).text,'ok');assert.equal(calls,2);stream=false;
    calls=0;status=401;await assert.rejects(chat([{role:'user',content:'test'}],{cfg,retryDelayMs:0}),e=>e.status===401);assert.equal(calls,1);
    calls=0;status=502;const controller=new AbortController();
    await assert.rejects(chat([{role:'user',content:'test'}],{cfg,signal:controller.signal,onRetry:()=>controller.abort()}));assert.equal(calls,1);
  } finally {await new Promise(r=>{server.closeAllConnections();server.close(r);});}
});
