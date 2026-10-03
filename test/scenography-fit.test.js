import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildHTML} from '../src/build.js';
import {browserOrSkip,newPage,tempDeck} from './helpers.js';
test('cenografia encaixa título multilinha na própria região sem esconder convite ou subtítulo',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();try{const file=path.join(deck.dir,'fit.html');fs.writeFileSync(file,buildHTML({title:'Cena',theme:'manual-noite',slides:[{layout:'scenography',scene:'synthwave',title:'UMA IDEIA.\nUM APP.\nUM NOVO JEITO.',titleSize:175,kicker:'CONVITE PARA CRIAR',subtitle:'Uma ideia pode virar uma solução que você consegue usar.'}]}).html);const {page,errors}=await newPage(browser);await page.goto(pathToFileURL(file).href);await page.evaluate(()=>document.fonts.ready);const result=await page.evaluate(()=>{window.SagadeckFit.fitText(document);const box=document.querySelector('.scene-type').getBoundingClientRect();return [...document.querySelector('.scene-type').children].every(e=>{const r=e.getBoundingClientRect();return r.top>=box.top-3&&r.bottom<=box.bottom+3})});assert.equal(result,true,'título deve ceder espaço para preservar os demais textos da cena');assert.deepEqual(errors,[])}finally{await browser.close();deck.cleanup()}
});
