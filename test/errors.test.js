import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {errorDiagnostic,installErrorResponses,chatErrorResult} from '../src/studio/errors.js';
import {respond} from '../src/studio/ai-response.js';

test('diagnósticos distinguem causas comprovadas e não inventam o motivo de uma falha',()=>{
  for(const [error,code] of [
    [Object.assign(new Error('raw provider key=secret'),{code:'AI_TOKEN_LIMIT'}),'AI_TOKEN_LIMIT'],
    [new Error('request failed',{cause:Object.assign(new Error(),{name:'TimeoutError'})}),'TIMEOUT'],
    [Object.assign(new Error(),{status:429}),'RATE_LIMIT'],
    [Object.assign(new Error(),{status:402}),'NO_CREDIT'],
    [Object.assign(new Error(),{status:401}),'ACCESS_DENIED'],
    [Object.assign(new Error(),{code:'ENOENT'}),'FILE_NOT_FOUND'],
    [new Error('opaque provider key=secret'),'APP_UNKNOWN'],
  ]) {
    const out=errorDiagnostic(error);
    assert.equal(out.diagnostic.code,code);
    assert.match(out.error,/Código:.*responsável pelo SagaDeck/);
    assert.doesNotMatch(out.error,/secret|raw provider|opaque provider/);
    assert.deepEqual(errorDiagnostic(error),out,'a mesma falha mantém a referência');
  }
  assert.match(errorDiagnostic(new Error('unknown')).error,/causa não foi determinada/);
  assert.equal(errorDiagnostic(Object.assign(new Error(),{aborted:true})).diagnostic.code,'CANCELLED');
  assert.equal(chatErrorResult(Object.assign(new Error(),{code:'AI_INVALID_OUTPUT'}),{slides:[]},2).mode,'error');
});

test('JSON de qualquer rota e tarefas com ou sem streaming apresentam diagnóstico ao usuário',async()=>{
  const server=http.createServer(async(req,res)=>{
    installErrorResponses(res);
    if(req.url==='/other') {res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:'Selecione um arquivo PDF ou Word.'}));return;}
    await respond(res,req.url==='/stream',async()=>{throw Object.assign(new Error('raw service detail'),{status:429});});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const other=await(await fetch(base+'/other')).json();
    assert.match(other.error,/Selecione um arquivo PDF ou Word/);
    assert.equal(other.diagnostic.code,'INVALID_INPUT');
    const ordinary=await(await fetch(base+'/ordinary')).json();
    assert.equal(ordinary.diagnostic.code,'RATE_LIMIT');
    const text=await(await fetch(base+'/stream')).text();
    const event=text.trim().split('\n').map(JSON.parse).find(e=>e.type==='error');
    assert.equal(event.diagnostic.code,'RATE_LIMIT');
    assert.doesNotMatch(event.error,/raw service detail/);
  } finally {await new Promise(r=>{server.closeAllConnections();server.close(r);});}
});
