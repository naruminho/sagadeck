import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import {buildHTML,renderSlide} from '../src/build.js';
import {mathHTML} from '../src/science.js';
import {applyVisualEdits} from '../src/visual-edits.js';
import {browserOrSkip,newPage,startStudio,tempDeck,novoSlide} from './helpers.js';

test('equações, cena e ajustes persistem no HTML offline',()=>{
  assert.throws(()=>mathHTML(Array(6).fill('x')),/cinco/);
  assert.match(mathHTML([{latex:'x^2'}]),/katex/);
  assert.doesNotMatch(mathHTML([{latex:'\\href{javascript:alert(1)}{x}'}]),/href="javascript/);
  const slide={layout:'science',equations:[{latex:'x^2'}],plot:{preset:'surface'}};
  const {html}=buildHTML({slides:[slide]});
  assert.match(html,/Plotly/);assert.match(html,/data:font\/woff2;base64/);
  assert.match(html,/"surface":"sin\(sqrt\(x\^2\+y\^2\)\)"/,'o exemplo antigo vira fórmula de superfície');
  assert.match(html,/class="science-preview"[\s\S]*<rect/,'prévia desenhada da superfície');
  for(const scene of ['stage','floor','signs'])assert.match(renderSlide({layout:'scenography',scene,title:'CENA'}).html,new RegExp('scene-'+scene));
  assert.match(applyVisualEdits('<div class="t">Oi</div>',{'t-0':{dx:42,hidden:true}}),/display:none!important;translate:42px 0px/);
});

test('Studio: cena, matemática, gráficos e objetos com arquivo salvo',async t=>{
  const browser=await browserOrSkip(t);if(!browser)return;
  const temp=tempDeck();const studio=await startStudio(temp.file);
  try{
    const {page:p,errors}=await newPage(browser,studio.url+'/editor');
    const saved=()=>YAML.parse(fs.readFileSync(temp.file,'utf8'));
    await t.test('status abre configuração imediatamente',async()=>{
      await p.click('#ai-status');await p.waitForSelector('#ai-settings-dialog[open]');
      assert.match(await p.locator('#ai-settings-dialog').innerText(),/Configurar IA/);
      await p.click('#ai-settings-dialog [data-close]');
    });
    await t.test('console configurado abre em aba própria, sem iframe bloqueado',async()=>{
      await p.route('**/api/ai/setup',route=>route.fulfill({json:{url:studio.url+'/editor'}}));
      const popupPromise=p.waitForEvent('popup');
      await p.click('#ai-status');const popup=await popupPromise;
      await popup.waitForURL(studio.url+'/editor');
      assert.equal(await p.locator('#ai-settings-dialog iframe').count(),0);
      await popup.close();await p.unroute('**/api/ai/setup');
    });
    await t.test('insere cena estática',async()=>{
      await novoSlide(p,'scenography');
      await p.waitForSelector('#rendered-slide-container .L-scenography');
      assert.ok(saved().slides.some(s=>s.layout==='scenography'));
    });
    await t.test('equação e gráfico 2D ficam editáveis e interativos',async()=>{
      await novoSlide(p,'science');
      await p.waitForSelector('#rendered-slide-container .science-plot[data-mounted="ready"]',{timeout:25000});
      assert.equal(await p.locator('#rendered-slide-container .katex').count(),2);
      assert.ok(await p.locator('#rendered-slide-container .js-plotly-plot').count());
      assert.deepEqual(saved().slides.find(s=>s.layout==='science').plot.functions,['a*sin(b*x)','a*b*cos(b*x)']);
      const latex=p.locator('#slide-fields-form textarea').first();
      // abrir a primeira equação, caso o formulário a apresente recolhida
      await p.locator('#slide-fields-form .sf-item-toggle').filter({hasText:'A função'}).click();
      await latex.fill('E = mc^2');await latex.blur();await p.waitForTimeout(1000);
      assert.equal(saved().slides.find(s=>s.layout==='science').equations[0].latex,'E = mc^2');
      // superfície 3D: em Mais opções do gráfico, z = f(x, y)
      await p.locator('#slide-fields-form .sf-plot details.sf-more > summary').click();
      const surf=p.locator('#slide-fields-form .sf-plot .sf-field').filter({hasText:'Superfície 3D'}).locator('input');
      await surf.fill('sin(sqrt(x^2+y^2))');await surf.blur();
      await p.waitForFunction(()=>document.querySelector('#rendered-slide-container .science-plot-target')?.data?.[0]?.type==='surface',null,{timeout:25000});
      await p.waitForFunction(async()=> (await (await fetch('/api/deck')).json()).spec.slides.find(s=>s.layout==='science').plot.surface==='sin(sqrt(x^2+y^2))');
      assert.equal(saved().slides.find(s=>s.layout==='science').plot.surface,'sin(sqrt(x^2+y^2))');
      assert.equal(await p.locator('#rendered-slide-container .science-plot-target').evaluate(el=>el.data[0].type),'surface');
      await p.waitForSelector('#rendered-slide-container .science-plot[data-mounted="ready"]',{timeout:25000});
      const target=p.locator('#rendered-slide-container .science-plot-target');
      const camera=()=>target.evaluate(el=>JSON.stringify(el._fullLayout.scene._scene.getCamera()));
      const before=await camera(), box=await target.boundingBox();
      // o WebGL do Plotly leva um instante para responder ao mouse depois de pronto: tenta o arraste algumas vezes
      let girou=false;
      for(let k=0;k<5&&!girou;k++){
        await p.mouse.move(box.x+box.width*.45,box.y+box.height*.45);await p.mouse.down();
        await p.mouse.move(box.x+box.width*.7,box.y+box.height*.55,{steps:10});await p.mouse.up();
        girou=(await camera())!==before;
        if(!girou)await p.waitForTimeout(400);
      }
      assert.ok(girou,'arrastar gira a câmera 3D');
    });
    await t.test('insere, arrasta, exclui com teclado e desfaz objeto',async()=>{
      await p.click('[data-tab="inserir"]');await p.getByRole('button',{name:'Texto',exact:true}).click();
      const object=p.locator('#rendered-slide-container [data-vkey]').filter({hasText:'Seu texto'});
      await object.waitFor();await object.click();
      const r=await object.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+45,r.y+r.height/2+20,{steps:5});await p.mouse.up();await p.waitForTimeout(650);
      let sl=saved().slides.find(s=>s.layout==='science');assert.ok(Object.values(sl.visualEdits||{}).some(e=>e.dx>0));
      // continua selecionado depois de arrastar: Delete exclui (clicar de novo no texto entraria na escrita)
      await p.keyboard.press('Delete');await p.waitForTimeout(600);
      sl=saved().slides.find(s=>s.layout==='science');assert.ok(Object.values(sl.visualEdits).some(e=>e.hidden));
      await p.keyboard.press('Control+z');await p.waitForTimeout(600);
      assert.ok(!Object.values(saved().slides.find(s=>s.layout==='science').visualEdits).some(e=>e.hidden));
    });
    assert.deepEqual(errors,[]);
  }finally{await studio.close();await browser.close();temp.cleanup();}
});

test('curva continua visível quando a cor de destaque é quase igual ao fundo',async t=>{
  const browser=await browserOrSkip(t);if(!browser)return;
  try {
    const {page,errors}=await newPage(browser,null);
    await page.setContent(buildHTML({theme:'prata',slides:[{layout:'science',title:'Curva',plot:{functions:[{fn:'x^2',color:'hi'}],x:[0,2]}}]}).html);
    await page.evaluate(()=>window.SagaScienceReady);
    const colors=await page.evaluate(()=>{const p=document.querySelector('.science-plot');return {line:p.querySelector('.science-plot-target').data[0].line.color,highlight:getComputedStyle(p).getPropertyValue('--hi').trim()};});
    const ratio=await page.evaluate(()=>{ const p=document.querySelector('.science-plot'),ctx=document.createElement('canvas').getContext('2d');const lum=c=>{ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);};const a=lum(p.querySelector('.science-plot-target').data[0].line.color),b=lum(getComputedStyle(p).getPropertyValue('--bg'));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
    assert.ok(ratio>=3,`contraste do traço: ${ratio}`);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
