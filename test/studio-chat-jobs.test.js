import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import {browserOrSkip,newPage,startStudio,tempDeck} from './helpers.js';
import {startMockLLM} from './mock-llm.js';
import path from 'node:path';
import {copySlideAssets} from '../src/studio/slide-copy.js';
import {writeDeckFile} from '../src/deck-file.js';

test('chat pode parar sem travar entrada nem aplicar resposta tardia',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;
 let release;const pending=new Promise(r=>release=r);
 const llm=await startMockLLM(async()=>{await pending;return '```yaml\nedit:\n  1: {title: Resposta tardia}\n```';});
 const deck=tempDeck(),studio=await startStudio(deck.file,{llmUrl:llm.url});
 try{const {page:p,errors}=await newPage(browser,studio.url);await p.click('#tab-btn-chat');await p.fill('#chat-input','Mude o título');await p.click('#chat-send');await p.locator('.ai-working').waitFor();
 const start=Date.now();while(!llm.requests.length&&Date.now()-start<5000)await new Promise(r=>setTimeout(r,20));assert.ok(llm.requests.length);
 assert.equal(await p.locator('#chat-input').isEnabled(),true,'pode preparar outra mensagem enquanto pensa');
 assert.equal(await p.locator('.work-stop').count(),0); await p.locator('#chat-send[aria-label="Parar"]').click({timeout:3000});await p.waitForFunction(()=>!document.querySelector('.ai-working'));release();await p.waitForTimeout(500);
 assert.notEqual(YAML.parse(fs.readFileSync(deck.file,'utf8')).slides[0].title,'Resposta tardia');assert.deepEqual(errors,[]);
 }finally{release();await browser.close();await studio.close();await llm.close();deck.cleanup();}
});

test('copiar e colar entre abas salva slide e arquivos na apresentação de destino',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();
 const source=YAML.parse(fs.readFileSync(deck.file,'utf8'));
 source.slides[0].title='Slide que viaja';source.slides[0].figure={image:'foto.svg'};
 fs.writeFileSync(path.join(deck.dir,'foto.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>');
 writeDeckFile(deck.file,source);const studio=await startStudio(deck.file);
 try{const {page:a,errors:ea}=await newPage(browser,studio.url);const {page:b,errors:eb}=await newPage(browser,studio.url);
 const target=await b.evaluate(async()=>{const r=await fetch('api/library/decks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Destino da cópia'})});const d=await r.json();await fetch('api/library/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id})});return d;});
 await b.goto(studio.url+'/editor?deck='+encodeURIComponent(target.id));
 await a.click('#btn-copy-slide');await b.click('#btn-paste-slide');
 await b.waitForFunction(()=>document.querySelectorAll('.thumb-card').length===2);
 const saved=await b.evaluate(async()=> (await (await fetch('api/deck')).json()));
 const spec=YAML.parse(fs.readFileSync(saved.file,'utf8'));assert.equal(spec.slides[1].title,'Slide que viaja');
 const image=path.resolve(path.dirname(saved.file),spec.slides[1].figure.image);assert.ok(fs.existsSync(image));assert.notEqual(image,path.join(deck.dir,'foto.svg'));
 assert.equal((await a.evaluate(async()=>(await (await fetch('api/deck')).json()))).file,deck.file);
 assert.deepEqual([...ea,...eb],[]);
 }finally{await browser.close();await studio.close();deck.cleanup();}
});

test('abas mantêm apresentações independentes e tarefa não grava no deck aberto depois',async()=>{
 const deck=tempDeck(),llm=await startMockLLM(()=>new Promise(r=>setTimeout(()=>r('```yaml\nedit:\n  1: {title: Só no primeiro}\n```'),600))),studio=await startStudio(deck.file,{llmUrl:llm.url});
 const call=async(tab,route,body)=>{const r=await fetch(studio.url+route,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-sagadeck-workspace':tab},body:body?JSON.stringify(body):undefined});return r.json();};
 try{const a=await call('aba-a','/api/deck');const b=await call('aba-b','/api/library/decks',{title:'Outra apresentação'});await call('aba-b','/api/library/open',{id:b.id});
 assert.equal((await call('aba-a','/api/deck')).file,a.file,'abrir na aba B não troca o deck da aba A');
 const task=call('aba-a','/api/ai/chat',{message:'Troque o título',spec:a.spec,targetSlide:null,requestId:'tarefa-a'});
 await call('aba-b','/api/library/open',{id:b.id});await task;
 assert.equal((await call('aba-a','/api/deck')).spec.slides[0].title,'Só no primeiro');
 assert.notEqual((await call('aba-b','/api/deck')).spec.slides[0].title,'Só no primeiro');
 }finally{await studio.close();await llm.close();deck.cleanup();}
});

test('cópia preserva vídeo, poster e referências locais em HTML sem colisão',async()=>{
 const a=tempDeck(),b=tempDeck();try{for(const name of ['clip.mp4','poster.svg'])fs.writeFileSync(path.join(a.dir,name),'asset-'+name);
 const result=await copySlideAssets({video:'clip.mp4',poster:'poster.svg',html:'<img src="poster.svg">'},a.file,b.file);
 assert.equal(fs.readFileSync(path.resolve(b.dir,result.video),'utf8'),'asset-clip.mp4');assert.ok(result.html.includes(result.poster));
 const second=await copySlideAssets({image:'poster.svg'},a.file,b.file);assert.notEqual(second.image,result.poster);
 }finally{a.cleanup();b.cleanup();}
});
