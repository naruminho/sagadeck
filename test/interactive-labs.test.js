import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import YAML from 'yaml';
import {buildHTML} from '../src/build.js';
import {graphLabExample} from '../src/graph-lab.js';
import {codeLabExample} from '../src/code-lab.js';
import {pageVisuals,materializeWebVisuals,captureWebPage} from '../src/research/visuals.js';
import {fetchUrlDoc,fetchWebImage} from '../src/ai/context.js';
import {estudoHTML} from '../src/export/estudo.js';
import {browserOrSkip,newPage,tempDeck,startStudio,novoSlide} from './helpers.js';

test('rede: rota, bloqueio, BFS, edição, zoom e reset preservam o SVG',async t=>{
  const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();
  try{const file=path.join(deck.dir,'rede.html');fs.writeFileSync(file,buildHTML({theme:'manual',slides:[graphLabExample]}).html);const{page,errors}=await newPage(browser,null,{width:1920,height:1080});await page.goto(pathToFileURL(file).href);await page.waitForSelector('[data-graphlab-ready]');
    await page.evaluate(()=>window.originalNode=document.querySelector('[data-node="fabrica"]'));
    await page.click('[data-gl-action="route"]');assert.match(await page.locator('[data-gl-result]').textContent(),/custo 6/);
    await page.click('[data-node="porto"]');await page.click('[data-gl-action="focus"]');assert.match(await page.locator('.gl-world').getAttribute('transform'),/scale\(1.8\)/);
    await page.click('[data-gl-action="remove"]');await page.click('[data-gl-action="route"]');assert.match(await page.locator('[data-gl-result]').textContent(),/custo 7/);
    await page.click('[data-gl-action="reset"]');await page.click('[data-gl-action="walk"]');await page.click('[data-gl-action="step"]');assert.equal(await page.locator('.gl-node.gl-visited').count(),1);
    await page.click('[data-gl-action="add"]');assert.equal(await page.locator('.gl-node:not(.gl-leaving)').count(),5);await page.fill('[data-gl-label]','Hospital');await page.locator('[data-gl-label]').dispatchEvent('change');await page.click('[data-gl-action="connect"]');await page.fill('[data-gl-weight]','2');await page.locator('[data-gl-weight]').dispatchEvent('change');
    await page.selectOption('[data-gl-goal]','novo-1');await page.click('[data-gl-action="route"]');assert.match(await page.locator('[data-gl-result]').textContent(),/Hospital.*custo 2/);
    assert.equal(await page.evaluate(()=>window.originalNode===document.querySelector('[data-node="fabrica"]')),true);
    await page.click('[data-gl-action="reset"]');assert.equal(await page.locator('.gl-node:not(.gl-leaving)').count(),4);assert.deepEqual(errors,[]);
  }finally{await browser.close();deck.cleanup();}
});

test('código: aluno altera entrada e programa, vê saída real, erro e restaura',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();try{
  const file=path.join(deck.dir,'codigo.html');fs.writeFileSync(file,buildHTML({theme:'manual',slides:[{...codeLabExample,program:'def dobro(x):\n    print(x * 2)\n    return x * 2',call:'dobro(7)'}]}).html);const{page,errors}=await newPage(browser,null,{width:1920,height:1080});await page.goto(pathToFileURL(file).href);await page.waitForSelector('[data-codelab-ready]');
  await page.fill('[data-clab-call]','dobro(9)');await page.click('[data-clab-run]');for(let i=0;i<10;i++)await page.click('[data-clab-next]');assert.match(await page.locator('.dyn-frame.active .tr-out').textContent(),/18/);
  await page.click('.clab-editor summary');await page.fill('[data-clab-program]','def dobro(x):\n    print(x * 3)\n    return x * 3');await page.click('[data-clab-run]');for(let i=0;i<10;i++)await page.click('[data-clab-next]');assert.match(await page.locator('.dyn-frame.active .tr-out').textContent(),/27/);
  await page.fill('[data-clab-program]','import httpx');await page.click('[data-clab-run]');assert.match(await page.locator('.clab-status').textContent(),/Não executou/);
  await page.click('[data-clab-reset]');assert.equal(await page.locator('[data-clab-call]').inputValue(),'dobro(7)');assert.deepEqual(errors,[]);
 }finally{await browser.close();deck.cleanup();}
});

test('rede com nós próximos mantém ligação visível, nome completo e resultado dentro do painel',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();try{const file=path.join(deck.dir,'proximos.html');fs.writeFileSync(file,buildHTML({theme:'manual',slides:[{layout:'graphlab',title:'Rota',nodes:[{id:'A',label:'Centro de distribuição',x:680,y:310},{id:'B',label:'Loja',x:880,y:310}],edges:[{from:'A',to:'B',weight:3}]}]}).html);const{page,errors}=await newPage(browser,null,{width:1920,height:1080});await page.goto(pathToFileURL(file).href);await page.waitForSelector('[data-graphlab-ready]');
 const data=await page.evaluate(()=>{const root=document.querySelector('[data-graphlab]'),a=root.querySelector('[data-node="A"] rect').getBoundingClientRect(),b=root.querySelector('[data-node="B"] rect').getBoundingClientRect(),line=root.querySelector('.gl-edge line').getBoundingClientRect(),panel=root.querySelector('.gl-inspector').getBoundingClientRect(),result=root.querySelector('[data-gl-result]').getBoundingClientRect();return{gap:b.left-a.right,line:line.width,label:root.querySelector('[data-node="A"] text').textContent,result:result.bottom,panel:panel.bottom};});assert.ok(data.gap>5,JSON.stringify(data));assert.ok(data.line>5,JSON.stringify(data));assert.equal(data.label,'Centro de distribuição');assert.ok(data.result<=data.panel+1,JSON.stringify(data));assert.deepEqual(errors,[]);
 }finally{await browser.close();deck.cleanup();}
});

test('Studio cria os dois laboratórios e salva campos pelo formulário',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck(),studio=await startStudio(deck.file);try{
  const{page,errors}=await newPage(browser,studio.url);await novoSlide(page,'graphlab');await page.click('#tab-btn-props');const title=page.locator('#slide-fields-form .sf-field').filter({has:page.locator('.sf-label',{hasText:/^Título$/})}).locator('input');await title.fill('Rede da turma');await title.blur();await page.waitForTimeout(800);assert.equal(YAML.parse(fs.readFileSync(deck.file,'utf8')).slides.find(s=>s.layout==='graphlab').title,'Rede da turma');
  await novoSlide(page,'codelab');await page.click('#tab-btn-props');const call=page.locator('#slide-fields-form .sf-field').filter({has:page.locator('.sf-label',{hasText:/^Chamada \/ entrada$/})}).locator('input');await call.fill('lotes(20, 3)');await call.blur();await page.waitForTimeout(800);assert.equal(YAML.parse(fs.readFileSync(deck.file,'utf8')).slides.find(s=>s.layout==='codelab').call,'lotes(20, 3)');assert.deepEqual(errors,[]);
 }finally{await browser.close();await studio.close();deck.cleanup();}
});

test('inventário visual preserva URLs observadas e origem sem inventar',()=>{
 const images=pageVisuals('<meta property="og:image" content="/hero.png"><img src="figures/route.png" alt="Rota"><img src="/icon.png" width="16"><img src="data:image/png,x">','https://oficial.example/docs/');assert.equal(images.length,2);assert.equal(images[1].url,'https://oficial.example/docs/figures/route.png');assert.equal(images[1].alt,'Rota');
});

test('aluno explora rede e código no HTML de estudo offline',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();try{const built=buildHTML({theme:'manual',slides:[graphLabExample,codeLabExample]}),file=path.join(deck.dir,'estudo.html');fs.writeFileSync(file,estudoHTML({title:'Laboratórios',slidesMeta:built.slidesMeta,shotFiles:[]}));const{page,errors}=await newPage(browser);await page.goto(pathToFileURL(file).href);await page.locator('summary',{hasText:'Experimentar esta rede'}).click();const graph=page.frameLocator('iframe').first();await graph.locator('[data-gl-action="route"]').click();assert.match(await graph.locator('[data-gl-result]').textContent(),/custo 6/);assert.equal(await page.frameLocator('iframe').nth(1).locator('[data-codelab-ready]').count(),1);assert.deepEqual(errors,[]);}finally{await browser.close();deck.cleanup();}
});

test('referências reais são importadas offline com proveniência; falha não vira ilustração',async()=>{
 const deck=tempDeck();try{const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');const spec={slides:[{layout:'split',title:'Tela oficial',figure:{web_capture:{url:'https://oficial.example/docs',selector:'main'}}},{layout:'split',figure:{web_image:{url:'https://oficial.example/falhou.png'}}}]};
 const result=await materializeWebVisuals(spec,{baseDir:deck.dir,capture:async(url,opts)=>{assert.equal(opts.selector,'main');return{data:png,mime:'image/png',url,title:'Guia oficial'};},fetchImage:async()=>{throw new Error('HTTP 404');}});assert.equal(result.done.length,1);assert.equal(result.failed.length,1);assert.ok(fs.existsSync(path.join(deck.dir,spec.slides[0].figure.image)));assert.equal(spec.slides[0].figure.image_source.kind,'capture');assert.ok(spec.slides[1].figure.web_image);assert.match(buildHTML({...spec,_dir:deck.dir}).html,/data:image\/png;base64/);assert.ok(fs.existsSync(path.join(deck.dir,'contexto/pesquisa/visuais.json')));
 }finally{deck.cleanup();}
});

test('leitura da página mantém imagens e captura usa navegador real',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;await browser.close();const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');const server=http.createServer((req,res)=>{if(req.url==='/image.png'){res.writeHead(200,{'content-type':'image/png'});res.end(png);}else{res.writeHead(200,{'content-type':'text/html'});res.end('<html><title>Aplicação oficial de teste</title><body><main style="width:700px;height:450px;background:#234;color:white"><h1>Explorar a rede</h1><button>Executar consulta</button><img src="/image.png" alt="Diagrama"></main></body></html>');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 try{const doc=await fetchUrlDoc(url,{allowLocal:true});assert.equal(doc.visuals[0].url,url+'/image.png');const img=await fetchWebImage(doc.visuals[0].url,{allowLocal:true});assert.equal(img.mime,'image/png');const capture=await captureWebPage(url,{allowLocal:true,selector:'main'});assert.equal(capture.mime,'image/png');assert.ok(capture.data.length>1000);await assert.rejects(()=>captureWebPage(url),/privad|local|permit|bloque/i);}finally{await new Promise(r=>server.close(r));}
});
