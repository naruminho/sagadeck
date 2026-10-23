import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
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

test('auditor descarta achado que se contradiz e desproporção que os valores do gráfico desmentem',async()=>{
  // num deck de aula, a revisão disse que a barra de 120 cm era "menor" que a de 12 cm (a foto mostrava o contrário) e
  // que uma fórmula "subtrai em vez de descontar"; os dois avisos passaram pela confirmação
  const calls=[];
  const complete=async messages=>{calls.push(messages);return {text:JSON.stringify(calls.length===1?{issues:['A barra destacada (120 cm) é menor que a de 12 cm']}:{confirmed:[]})};};
  const slide={layout:'chart',title:'Balanço',chart:{chart:'bar',data:[{label:'a',value:12},{label:'b',value:120}],highlight:[1]}};
  const result=await reviewExperience({slides:[slide]},[0],{snapshot:async()=>[{label:'Final',dataUrl:'data:image/png;base64,a'}],complete});
  assert.deepEqual(result.issues,[]);
  assert.match(JSON.stringify(calls[0]),/compare o tamanho das barras com os valores do slide/);
  assert.match(JSON.stringify(calls[0]),/cite as duas e diga qual termo difere/);
  assert.match(JSON.stringify(calls[1]),/achado que se contradiz/);
  assert.match(JSON.stringify(calls[1]),/barra é proporcional ao valor/);
  assert.match(JSON.stringify(calls[1]),/value[\\"]*:120/,'o auditor recebe os valores do slide');
});

test('rótulo de desenho pequeno medido na foto vira achado com os textos e os tamanhos, sem depender da visão', async () => {
  const slide = { layout: 'split', title: 'Sifão', figure: { svg: '<svg viewBox="0 0 1000 520"><text font-size="24">N.A.</text></svg>' } };
  const complete = async () => ({ text: JSON.stringify({ issues: [] }) });
  const result = await reviewExperience({ slides: [slide] }, [0], { snapshot: async () => [{ label: 'Final', dataUrl: 'data:image/png;base64,a', state: { tinyText: [{ text: 'N.A.', px: 19 }, { text: 'C', px: 19 }] } }], complete });
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].text, /Texto da figura pequeno demais para ler na tela: "N.A." \(19 px\), "C" \(19 px\)/);
  assert.match(result.issues[0].text, /use 40 ou mais/);
});
