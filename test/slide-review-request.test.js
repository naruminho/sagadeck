import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import {test} from 'node:test';import assert from 'node:assert/strict';import {editDeck} from '../src/ai/deck-ai.js';import {startMockLLM} from './mock-llm.js';
test('review true no slide alterado solicita revisão mesmo sem flag no topo do patch',async()=>{
 let n=0;const llm=await startMockLLM(()=>`\`\`\`yaml\n${++n===2?'review: false\n':''}edit:\n  1: {title: Depois, review: true}\n\`\`\``);const before=process.env.SAGADECK_LLM_URL;process.env.SAGADECK_LLM_URL=llm.url;
 try{let reviews=0;const opts={spec:{slides:[{layout:'cover',title:'Antes'}]},instruction:'Reformule',reviewCheck:async()=>{reviews++;return{issues:[],unchecked:[],verified:true};}};const result=await editDeck(opts);assert.equal(result.reviewRequested,true);assert.equal(reviews,1);const optedOut=await editDeck(opts);assert.equal(optedOut.reviewRequested,false);assert.equal(reviews,1);}
 finally{if(before==null)delete process.env.SAGADECK_LLM_URL;else process.env.SAGADECK_LLM_URL=before;await llm.close();}
});
