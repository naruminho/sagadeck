import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import {test} from 'node:test';import assert from 'node:assert/strict';
import {sanitizeCheck} from '../src/ai/deck-ai.js';
import {startMockLLM} from './mock-llm.js';
test('trocar figura pelo chat não aceita SVG silenciosamente ocultado por diagrama antigo',async()=>{
 let n=0;const llm=await startMockLLM(()=>++n===1?'```yaml\nedit:\n  1:\n    figure: {svg: "<svg viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'40\'/></svg>"}\n```':'```yaml\nedit:\n  1:\n    figure: {diagram: null, steps: null, svg: "<svg viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'40\'/></svg>"}\n```');
 const before=process.env.SAGADECK_LLM_URL;process.env.SAGADECK_LLM_URL=llm.url;
 try{const {editDeck}=await import('../src/ai/deck-ai.js');const result=await editDeck({spec:{slides:[{layout:'split',title:'Fluxo',body:'Explicação',figure:{diagram:'flow',steps:['A','B']}}]},instruction:'Reconstrua como SVG'});assert.equal(llm.requests.length,2);assert.match(llm.requests[1].lastUser,/svg.*diagram|diagram.*svg/);assert.equal(result.spec.slides[0].figure.diagram,undefined);assert.match(result.spec.slides[0].figure.svg,/circle/);}
 finally{if(before==null)delete process.env.SAGADECK_LLM_URL;else process.env.SAGADECK_LLM_URL=before;await llm.close();}
});
test('uma figura aceita estilos e dados, mas não dois renderizadores incompatíveis',()=>{
 assert.throws(()=>sanitizeCheck({slides:[{layout:'split',figure:{diagram:'flow',svg:'<svg/>'}}]},[0]),/renderizadores/);
 assert.doesNotThrow(()=>sanitizeCheck({slides:[{layout:'split',figure:{svg:'<svg/>',color:'accent'},notes:'Fonte'}]},[0]));
});
