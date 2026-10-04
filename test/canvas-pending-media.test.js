import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startMockLLM} from './mock-llm.js';
test('referência web posicionada no canvas valida antes de importar mídia',async()=>{
 const llm=await startMockLLM(()=> '```yaml\nslides:\n  - layout: canvas\n    elements:\n      - web_image: {url: "https://example.test/logo.png", source: "https://example.test/"}\n        x: 120\n        y: 100\n        w: 300\n        h: 150\n```');
 const before=process.env.SAGADECK_LLM_URL;process.env.SAGADECK_LLM_URL=llm.url;
 try{const {editDeck}=await import('../src/ai/deck-ai.js');const result=await editDeck({spec:{slides:[{layout:'cover',title:'Início'}]},instruction:'Use o logo observado',images:true,deferImages:true});assert.equal(llm.requests.length,1);assert.equal(result.spec.slides[0].elements[0].web_image.url,'https://example.test/logo.png');}
 finally{if(before==null)delete process.env.SAGADECK_LLM_URL;else process.env.SAGADECK_LLM_URL=before;await llm.close();}
});
