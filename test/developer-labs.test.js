import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {pathToFileURL} from 'node:url';
import YAML from 'yaml';
import {buildHTML} from '../src/build.js';
import {importCollection,expandApiCollections} from '../src/api-collections.js';
import {youtubeId,videoPlayer} from '../src/video-player.js';
import {playgroundDocument} from '../src/playground.js';
import {downloadYoutube} from '../src/studio/video-download.js';
import {startMockApi,envFileFor} from './mock-api.js';
import {browserOrSkip,newPage,tempDeck,startStudio,novoSlide,readPptx} from './helpers.js';

const collection={info:{name:'Aula'},item:[{name:'Pedidos',item:[{name:'Consultar',request:{method:'GET',url:{raw:'{{base}}/pedidos'},header:[{key:'X-Aula',value:'sim'}]}},{name:'Criar',request:{method:'POST',url:'{{base}}/pedidos',body:{mode:'raw',raw:'{"quantidade":3}'}}}]}]};
test('coleção Postman preserva pastas, URLs, headers, corpo e variáveis; exportação expande sem alterar o original',()=>{
  const services=importCollection(collection);assert.equal(services.length,2);assert.equal(services[0].name,'Pedidos / Consultar');assert.equal(services[0].request.headers['X-Aula'],'sim');assert.equal(services[1].request.body.quantidade,3);
  const spec={slides:[{layout:'api',title:'Pedidos',services}]},out=expandApiCollections(spec);assert.equal(out.slides.length,2);assert.equal(out.slides[1].request.method,'POST');assert.equal(spec.slides.length,1);assert.equal(spec.slides[0].services.length,2);
  assert.throws(()=>importCollection({item:[{name:'Quebrado',request:{}}]}),/URL ausente/);
});

test('YouTube só aceita hosts reais; MP4 local fica incorporado, arquivo ausente fica explícito',()=>{
  assert.equal(youtubeId('https://youtu.be/M7lc1UVf-VE'),'M7lc1UVf-VE');assert.equal(youtubeId('https://youtube.com.evil.test/watch?v=M7lc1UVf-VE'),null);
  assert.match(videoPlayer({video:'https://www.youtube.com/watch?v=M7lc1UVf-VE'}),/youtube-nocookie.com\/embed\/M7lc1UVf-VE/);
  const deck=tempDeck();try{fs.writeFileSync(path.join(deck.dir,'aula.mp4'),Buffer.from('test'));assert.match(videoPlayer({video:'aula.mp4'},{baseDir:deck.dir}),/data:video\/mp4;base64/);assert.match(videoPlayer({video:'ausente.mp4'},{baseDir:deck.dir}),/arquivo não encontrado/);}finally{deck.cleanup();}
});

test('vídeo em loop: repete sozinho sem controles; com poster',()=>{
  const deck=tempDeck();try{fs.writeFileSync(path.join(deck.dir,'cena.mp4'),Buffer.from('test'));
    const out=videoPlayer({video:'cena.mp4',loop:true,poster:'capa.jpg'},{baseDir:deck.dir});
    assert.match(out,/autoplay muted loop playsinline/);assert.match(out,/poster="capa.jpg"/);assert.doesNotMatch(out,/controls/);
    assert.match(videoPlayer({video:'cena.mp4'},{baseDir:deck.dir}),/controls/);}finally{deck.cleanup();}
});

test('download usa URL canônica, não lê configurações/cookies e pede áudio com vídeo MP4',async()=>{
 const deck=tempDeck();try{
  const result=await downloadYoutube('https://youtu.be/M7lc1UVf-VE?list=outra',deck.dir,{spawnProcess:(exe,args)=>{
    assert.ok(args.includes('--ignore-config'));assert.ok(args.includes('--no-playlist'));assert.equal(args.at(-1),'https://www.youtube.com/watch?v=M7lc1UVf-VE');assert.match(args[args.indexOf('-f')+1],/bestaudio/);
    fs.writeFileSync(args[args.indexOf('-o')+1],Buffer.from('mp4-test'));const child=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};queueMicrotask(()=>child.emit('close',0));return child;
  }});assert.ok(fs.existsSync(path.join(deck.dir,result.url)));assert.match(result.source,/watch\?v=/);
 }finally{deck.cleanup();}
});

test('frame executa JavaScript, aluno altera a experiência e reinicia; pai e rede permanecem isolados',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();try{
  const slide={layout:'playground',title:'Minha experiência',html:'<button id="change">Adicionar</button><p id="result">0</p>',css:'p{font-size:40px}',javascript:'let n=0;document.querySelector("#change").onclick=()=>document.querySelector("#result").textContent=++n;try{parent.document.body.dataset.escaped="yes"}catch{};'};
  assert.match(playgroundDocument(slide),/connect-src 'none'/);
  const file=path.join(deck.dir,'frame.html');fs.writeFileSync(file,buildHTML({theme:'manual',slides:[slide]}).html);const {page,errors}=await newPage(browser);await page.goto(pathToFileURL(file).href);
  const frame=page.frameLocator('.pg-frame');await frame.locator('#change').click();assert.equal(await frame.locator('#result').textContent(),'1');assert.equal(await page.getAttribute('body','data-escaped'),null);
  assert.ok(await page.locator('[data-pg-reset]').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=18,'controle de reinício mantém tamanho legível no slide');
  await page.click('[data-pg-reset]');await frame.locator('#result').waitFor();assert.equal(await frame.locator('#result').textContent(),'0');assert.deepEqual(errors,[]);
 }finally{await browser.close();deck.cleanup();}
});

test('Python e JavaScript nativos executam de verdade pelo slide, com imports, erros e saída',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();fs.writeFileSync(deck.file,YAML.stringify({theme:'manual',slides:[{layout:'codelab',title:'Python real',engine:'python',program:'import sys\nprint(sys.version_info.major)',call:''},{layout:'codelab',title:'Node real',engine:'javascript',program:'import os from "node:os";\nconsole.log("Node:",typeof process.versions.node);',call:''}]}));const studio=await startStudio(deck.file);try{
  const {page,errors}=await newPage(browser);await page.goto(studio.url+'/preview');await page.locator('[data-clab-run]').first().click();await page.waitForFunction(()=>document.querySelector('.clab-status').textContent.startsWith('Saída'));assert.match(await page.locator('.clab-native-output').first().textContent(),/3/);
  await page.evaluate(()=>window.sagadeck.goto(1));await page.locator('[data-clab-run]').nth(1).click();await page.waitForFunction(()=>document.querySelectorAll('.clab-status')[1].textContent.startsWith('Saída'));assert.match(await page.locator('.clab-native-output').nth(1).textContent(),/Node: string/);
  await page.locator('.clab-editor summary').nth(1).click();await page.locator('[data-clab-program]').nth(1).fill('throw new Error("erro da aula");');await page.locator('[data-clab-run]').nth(1).click();await page.waitForFunction(()=>document.querySelectorAll('.clab-status')[1].textContent.startsWith('Saída 1'));assert.match(await page.locator('.clab-native-output').nth(1).textContent(),/erro da aula/);assert.deepEqual(errors,[]);
 }finally{await browser.close();await studio.close();deck.cleanup();}
});

test('seletor preserva edição de cada serviço; PDF/PPTX recebem um slide por pedido',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();const services=importCollection(collection);fs.writeFileSync(deck.file,YAML.stringify({theme:'manual',slides:[{layout:'api',title:'Coleção da aula',services}]}));const studio=await startStudio(deck.file);try{
  const {page,errors}=await newPage(browser);await page.goto(studio.url+'/preview');const panels=page.locator('.api-collection-panel');assert.equal(await panels.count(),2);await panels.first().locator('[data-api-url]').fill('https://example.test/alterado');await page.selectOption('[data-api-service]','1');assert.equal(await panels.nth(1).isVisible(),true);await page.selectOption('[data-api-service]','0');assert.equal(await panels.first().locator('[data-api-url]').inputValue(),'https://example.test/alterado');
  const response=await fetch(studio.url+'/api/export/pptx');assert.equal(response.status,200);assert.equal((await readPptx(Buffer.from(await response.arrayBuffer()))).slides.length,2);assert.deepEqual(errors,[]);
 }finally{await browser.close();await studio.close();deck.cleanup();}
});

test('Studio grava engine nativo e programa personalizado pelo formulário',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck(),studio=await startStudio(deck.file);try{
  const {page,errors}=await newPage(browser,studio.url+'/editor');await novoSlide(page,'codelab');await page.locator('#slide-fields-form .sf-field').filter({has:page.locator('.sf-label',{hasText:/^Execução$/})}).locator('select').selectOption('javascript');await page.waitForTimeout(650);assert.equal(YAML.parse(fs.readFileSync(deck.file,'utf8')).slides.find(s=>s.layout==='codelab').engine,'javascript');
  await novoSlide(page,'playground');const field=page.locator('#slide-fields-form .sf-field').filter({has:page.locator('.sf-label',{hasText:/^JavaScript$/})}).locator('textarea');await field.fill('console.log("Aula personalizada")');await field.blur();await page.waitForTimeout(1600);assert.match(YAML.parse(fs.readFileSync(deck.file,'utf8')).slides.find(s=>s.layout==='playground').javascript,/Aula personalizada/);assert.deepEqual(errors,[]);
 }finally{await browser.close();await studio.close();deck.cleanup();}
});

test('Studio importa Postman e MP4; serviços executam e vídeo offline reproduz',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck(),mock=await startMockApi();fs.writeFileSync(process.env.SAGADECK_AMBIENTES,envFileFor(mock));const studio=await startStudio(deck.file);try{
  const {page,errors}=await newPage(browser,studio.url+'/editor');await novoSlide(page,'api');await page.getByText('Importar coleção Postman',{exact:true}).click();await page.locator('[data-collection-file]').setInputFiles({name:'aula.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({item:[{name:'Primeiro',request:{method:'POST',url:'{{base}}/sync',body:{mode:'raw',raw:'{"messages":[{"role":"user","content":"primeiro"}]}'}}},{name:'Segundo',request:{method:'POST',url:'{{base}}/sync',body:{mode:'raw',raw:'{"messages":[{"role":"user","content":"segundo"}]}'}}}]}))});await page.waitForTimeout(850);assert.equal(YAML.parse(fs.readFileSync(deck.file,'utf8')).slides.find(s=>s.layout==='api').services.length,2);
  await novoSlide(page,'video');await page.getByText('Inserir meu MP4',{exact:true}).click();await page.locator('[data-video-file]').setInputFiles(path.resolve('test/fixtures/short.mp4'));await page.waitForTimeout(900);const spec=YAML.parse(fs.readFileSync(deck.file,'utf8')),video=spec.slides.find(s=>s.layout==='video');assert.match(video.url,/videos\/short.mp4/);assert.ok(fs.existsSync(path.join(deck.dir,video.url)));
  await page.goto(studio.url+'/preview');await page.evaluate(i=>window.sagadeck.goto(i),spec.slides.findIndex(s=>s.layout==='api'));await page.waitForFunction(()=>document.querySelector('[data-api-env]').textContent.includes('HOM'));await page.selectOption('[data-api-service]','1');const selected=page.locator('.api-collection-panel').nth(1);await selected.locator('[data-api-run]').click();await page.waitForFunction(()=>!document.querySelectorAll('.L-api')[1].classList.contains('running'));assert.match(await selected.locator('.api-out').textContent(),/segundo|choices/);
  await page.evaluate(i=>window.sagadeck.goto(i),spec.slides.findIndex(s=>s.layout==='video'));await page.waitForFunction(()=>document.querySelector('video').readyState>=2);assert.match(await page.locator('video').getAttribute('src'),/^data:video\/mp4/);assert.ok(await page.locator('video').evaluate(v=>v.duration)>0);await page.locator('video').evaluate(v=>{v.muted=true;return v.play()});assert.deepEqual(errors,[]);
 }finally{await browser.close();await studio.close();await mock.close();deck.cleanup();}
});
