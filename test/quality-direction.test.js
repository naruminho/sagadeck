import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewExperience} from '../src/ai/quality.js';
import {startMockLLM} from './mock-llm.js';

test('reparo automático conserva ferramentas e contexto do agente original',async()=>{
 const llm=await startMockLLM(()=> '```yaml\nreview: true\nslides:\n  - layout: cover\n    title: Revisado\n```');
 const before=process.env.SAGADECK_LLM_URL;process.env.SAGADECK_LLM_URL=llm.url;
 try{const {editDeck}=await import('../src/ai/deck-ai.js');const runner=async()=>({stdout:'ok'});runner.description='FERRAMENTA_WEB_DISPONIVEL';await editDeck({spec:{slides:[{layout:'cover',title:'Inicial'}]},instruction:'Corrija',runCommand:runner,reviewCheck:async()=>({issues:[{slide:1,text:'Título'}],unchecked:[],verified:false})});assert.equal(llm.requests.length,2);assert.match(llm.requests[1].system,/FERRAMENTA_WEB_DISPONIVEL/);}
 finally{if(before==null)delete process.env.SAGADECK_LLM_URL;else process.env.SAGADECK_LLM_URL=before;await llm.close();}
});

test('revisor e auditor recebem direção pedida e consideram hierarquia visual um defeito funcional',async()=>{
  const calls=[];
  const complete=async messages=>{calls.push(messages);return {text:JSON.stringify(calls.length===1?{issues:['Título ocupa o espaço da figura; rótulos ilegíveis.']}:{confirmed:[0]})};};
  const result=await reviewExperience({slides:[{title:'Resultado',layout:'split'},{title:'Capa',layout:'canvas',elements:[{motion:{type:'requests',speed:4}}]}]},[0],{briefing:'Mapa dominante, apresentação técnica com animação discreta.',snapshot:async()=>[{label:'Final',dataUrl:'data:image/png;base64,a'}],complete});
  assert.equal(result.verified,false);
  for(const messages of calls){assert.match(JSON.stringify(messages),/Mapa dominante/);assert.match(JSON.stringify(messages),/hierarquia/i);}
  assert.match(JSON.stringify(calls[0]),/requests/, 'revisão compara os recursos da sequência, não só os títulos');
  assert.ok(calls[1].find(m=>m.role==='user').content.some(p=>p.type==='image_url'),'auditor visual confere a imagem em vez de aceitar alegação de corte sem olhar');
});
