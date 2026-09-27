import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adaptiveGrid} from '../src/adaptive-layouts.js';
import {demoDeck,DEMO_NAMES} from '../src/studio/demo-decks.js';
import {buildHTML,renderSlide} from '../src/build.js';
import {browserOrSkip} from './helpers.js';
test('modelos e grades preservam 1–12 itens com colunas automáticas',()=>{
  for(const name of Object.keys(DEMO_NAMES))assert.doesNotThrow(()=>buildHTML(demoDeck(name)));
  for(let n=1;n<=12;n++){const items=Array.from({length:n},(_,i)=>({title:'Item '+i,text:'Descrição'}));assert.ok(adaptiveGrid(items).columns<=4);for(const layout of ['mosaic','ribbon','dossier']){const html=renderSlide({layout,items}).html;assert.equal((html.match(/<article class="adaptive-item/g)||[]).length,n);}}
});
test('grade de 8 itens e código compacto cabem na página',async t=>{
  const browser=await browserOrSkip(t);if(!browser)return;
  try{const p=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    const spec=demoDeck('compacto');await p.setContent(buildHTML(spec).html);
    for(const i of [2,3,4]){await p.evaluate(i=>window.sagadeck.goto(i,99,{instant:true}),i);
      const bad=await p.evaluate(()=>[...document.querySelectorAll('.slide.current .adaptive-item,.slide.current .code')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>1080||r.right>1920}).length);assert.equal(bad,0,'slide '+(i+1));}
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test("mosaic sem buraco: faltando um item para fechar a última linha, o primeiro ocupa duas colunas", () => {
  const html = (n) => renderSlide({ layout: "mosaic", items: Array.from({ length: n }, (_, i) => ({ title: "Item " + i })) }).html;
  const cols = (n) => +html(n).match(/--adaptive-cols:(\d+)/)[1];
  for (let n = 2; n <= 12; n++) {
    const c = cols(n), lead = /adaptive-lead/.test(html(n));
    const cells = n + (lead ? 1 : 0);
    assert.notEqual((c - (cells % c)) % c, 1, `${n} itens em ${c} colunas: sobra um buraco no fim`);
  }
});
