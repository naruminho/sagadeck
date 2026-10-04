import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {videoFrame} from '../src/ai/video-frames.js';
import {VIDEO_COMMAND_RULES,videoFreeRun} from '../src/ai/commands.js';
test('direção de vídeo distingue loop ambiente de abertura e preserva frame e camadas',()=>{
 assert.match(VIDEO_COMMAND_RULES,/loop: false/);assert.match(VIDEO_COMMAND_RULES,/DEPOIS do vídeo/);assert.match(VIDEO_COMMAND_RULES,/texto NOVO/);assert.match(VIDEO_COMMAND_RULES,/mediaTime/);
});
test('chat fala como gente: resumo em frase, JSON só no erro',()=>{
 assert.match(VIDEO_COMMAND_RULES,/nunca cole JSON/);assert.match(VIDEO_COMMAND_RULES,/mostre tudo/);
});
test('ações gratuitas de vídeo rodam sem aprovação; submit pede',()=>{
 for(const a of ['plan','status','frame','download']) assert.equal(videoFreeRun({language:'video',code:JSON.stringify({action:a})}),true,a);
 assert.equal(videoFreeRun({language:'video',code:JSON.stringify({action:'submit',prompt:'x'})}),false);
 assert.equal(videoFreeRun({language:'video',code:{action:'status',id:'job-1'}}),true,'objeto YAML vale como string');
 assert.equal(videoFreeRun({language:'video',code:{action:'submit',prompt:'x'}}),false,'objeto submit pede');
 assert.equal(videoFreeRun({language:'javascript',code:'console.log(1)'}),false);
 assert.equal(videoFreeRun({language:'video',code:'{invalido'}),false);
});
test('commandRequest preserva objeto em video/web em vez de virar [object Object]',async()=>{
 const {commandRequest,runCommand}=await import('../src/ai/commands.js');
 assert.deepEqual(commandRequest({language:'video',code:{action:'status'}}).code,{action:'status'});
 assert.equal(commandRequest({language:'shell',code:{a:1}}).code,'[object Object]','shell continua texto');
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'saga-vid-'));
 try{
  const out=await runCommand({language:'video',code:{action:'status',id:'job-1'}},{cwd});
  assert.equal(out.exitCode,1);assert.match(out.stderr,/job-1|apresenta|id|json/i);
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
test('frame para vídeo usa slide nativo, salva localmente e não depende de provedor',async()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'sagadeck-video-frame-'));fs.writeFileSync(path.join(cwd,'deck.yaml'),'slides:\n  - {layout: cover, title: Evento}\n');
 try{let captured;const snapshot=async(spec,index,options)=>{captured={spec,index,options};return [{dataUrl:'data:image/jpeg;base64,YWJj'}]};const result=await videoFrame({slide:1,out:'imagens/inicio.jpg'},{cwd,snapshot});assert.equal(result.costIncurred,false);assert.equal(captured.spec.slides[0].title,'Evento');assert.equal(captured.index,0);assert.equal(captured.options.width,1920);assert.equal(fs.readFileSync(path.join(cwd,result.file),'utf8'),'abc');await assert.rejects(videoFrame({slide:1,out:'../fora.jpg'},{cwd,snapshot}),/pasta da apresentação/);await assert.rejects(videoFrame({slide:2},{cwd,snapshot}),/slide existente/);}
  finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
test('status de vídeo não pede aprovação no chat; submit continua pedindo',async(t)=>{
 const helpers=await import('./helpers.js');
 const browser=await helpers.browserOrSkip(t);
 if(!browser)return;
 const {startStudio,tempDeck}=helpers;
 const {newPage}=helpers;
 const {startMockLLM}=await import('./mock-llm.js');
 const RUN_STATUS='Consultando.\n```yaml\nrun:\n  language: video\n  why: ver se o vídeo terminou\n  code: {"action":"status","id":"job-123"}\n```';
 const RUN_SUBMIT='Gerando.\n```yaml\nrun:\n  language: video\n  why: gerar o clipe\n  code: {"action":"submit","prompt":"areia dourada","out":"videos/cena.mp4"}\n```';
 const llm=await startMockLLM((req)=>/NÃO autorizou/.test(req.lastUser)?'Entendido, sem vídeo então.':(/Resultado do comando/.test(req.lastUser)?'Anotado.':(/status do vídeo/.test(req.lastUser)?RUN_STATUS:RUN_SUBMIT)));
 const deck=tempDeck();
 const studio=await startStudio(deck.file,{llmUrl:llm.url});
 try{
  const {page:p,errors}=await newPage(browser,studio.url);
  const waitAI=()=>p.waitForFunction(()=>!document.querySelector('.ai-working'),null,{timeout:90000});
  const send=async(text)=>{await p.fill('#chat-input',text);await p.click('#chat-send');await p.waitForTimeout(300);await waitAI();};
  await p.click('.thumb-card[data-idx="0"]');
  await p.click('#tab-btn-chat');
  // status: executa direto, sem botões de aprovação
  await send('qual o status do vídeo?');
  assert.equal(await p.locator('.cmd-msg button[data-d]').count(),0,'status não pode pedir aprovação');
  assert.match(await p.locator('.cmd-msg .cmd-state').last().innerText(),/Rodou/,'status executa');
  // submit: pede aprovação; negando, não executa (o clique concorre com o chat, senão trava)
  await p.fill('#chat-input','gera o vídeo');
  await p.click('#chat-send');
  await p.locator('.cmd-msg button[data-d="deny"]').last().waitFor({timeout:60000});
  assert.ok(await p.locator('.cmd-msg button[data-d]').count() > 0,'submit pede aprovação');
  await p.locator('.cmd-msg button[data-d="deny"]').last().click();
  await p.waitForFunction(()=>!document.querySelector('.ai-working'),null,{timeout:90000});
  const rodou=await p.locator('.cmd-msg .cmd-state').allInnerTexts();
  assert.equal(rodou.filter((s)=>/Rodou/.test(s)).length,1,'negado não executa de novo');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await studio.close();await llm.close();deck.cleanup();}
});
