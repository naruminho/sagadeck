import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import YAML from 'yaml';
import {buildHTML} from '../src/build.js';
import {portalExample,portalDemo} from '../src/portal-scene.js';
import {browserOrSkip,newPage,tempDeck,startStudio,novoSlide} from './helpers.js';

test('portal atravessa o elemento, transforma objetos persistentes, muda texto no chão e retorna; sem erros',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();try{
  const file=path.join(deck.dir,'portal.html');fs.writeFileSync(file,buildHTML(portalDemo()).html);const {page,errors}=await newPage(browser);await page.goto(pathToFileURL(file).href);await page.waitForSelector('[data-portal-ready]');const root=page.locator('[data-portal]').first();await root.locator('[data-portal-enter="0"]').click();assert.equal(await root.locator('.portal-flight').count(),1);await root.locator('.portal-inside').waitFor();assert.equal(await root.locator('.portal-floor-word').textContent(),'RUÍDO');assert.ok(await root.locator('[data-portal-back] svg').evaluate(e=>e.getBoundingClientRect().width)<=22,'ícone do controle ocupa apenas o tamanho do botão');
  await page.evaluate(()=>window.portalFirst=document.querySelector('.portal-object'));await root.locator('[data-portal-transform]').click();assert.equal(await root.getAttribute('data-transformed'),'true');assert.equal(await root.locator('.portal-floor-word').textContent(),'CLAREZA');assert.equal(await page.evaluate(()=>window.portalFirst===document.querySelector('.portal-object')),true);assert.equal(await root.locator('.portal-paths path').count(),4);
  await root.locator('[data-portal-transform]').click();assert.equal(await root.locator('.portal-floor-word').textContent(),'RUÍDO');await root.locator('[data-portal-back]').click();await root.locator('[data-portal-enter="1"]').click();await root.locator('.portal-inside').waitFor();assert.match(await root.locator('.portal-objects').textContent(),/Fábrica/);await root.locator('[data-portal-reset]').click();assert.equal(await root.getAttribute('data-view'),'catalog');assert.deepEqual(errors,[]);
 }finally{await browser.close();deck.cleanup();}
});

test('portal com movimento reduzido elimina viagem e animação; modelo pode ser editado e salvo no Studio',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck(),studio=await startStudio(deck.file);try{
  const {page,errors}=await newPage(browser,studio.url+'/editor');await page.emulateMedia({reducedMotion:'reduce'});await novoSlide(page,'portal');const title=page.locator('#slide-fields-form .sf-field').filter({has:page.locator('.sf-label',{hasText:/^Título$/})}).locator('input');await title.fill('Meu processo ganha vida');await title.blur();await page.waitForTimeout(1200);assert.equal(YAML.parse(fs.readFileSync(deck.file,'utf8')).slides.find(s=>s.layout==='portal').title,'Meu processo ganha vida');await page.goto(studio.url+'/preview');const index=YAML.parse(fs.readFileSync(deck.file,'utf8')).slides.findIndex(s=>s.layout==='portal');await page.evaluate(i=>window.sagadeck.goto(i),index);await page.locator('[data-portal-enter="0"]').click();await page.locator('.portal-inside').waitFor();await page.locator('[data-portal-transform]').click();assert.equal(await page.locator('.portal-paths path').first().evaluate(e=>getComputedStyle(e).animationName),'none');assert.deepEqual(errors,[]);
 }finally{await browser.close();await studio.close();deck.cleanup();}
});
