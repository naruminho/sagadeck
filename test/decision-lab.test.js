import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateDecisionLab} from '../src/decision-lab.js';
import {buildHTML,renderSlide} from '../src/build.js';
import {browserOrSkip} from './helpers.js';
test('laboratório contabiliza correções, erros introduzidos e carga',()=>{
  const gain=calculateDecisionLab({});
  assert.equal(gain.automatic,200);assert.equal(gain.caught,120);
  assert.equal(gain.introduced,19.6);assert.equal(gain.reviewed,99.6);
  assert.equal(calculateDecisionLab({introducedRate:2}).reviewed,276);
  assert.equal(calculateDecisionLab({reviewRate:0}).reviewed,200);
  assert.equal(calculateDecisionLab({reviewRate:0}).hours,0);
  assert.equal(calculateDecisionLab({errorRate:100,catchRate:100}).reviewed,0);
  assert.equal(calculateDecisionLab({errorRate:0,introducedRate:100}).reviewed,10000);
  assert.equal(calculateDecisionLab({volume:0}).reviewed,0);
  assert.equal(calculateDecisionLab({errorRate:-5}).errorRate,0);
  assert.equal(calculateDecisionLab({reviewRate:200}).reviewRate,100);
});
test('laboratório tem conteúdo estático e executa offline, com teclado e reset',async t=>{
  const spec={theme:'terminal',slides:[{layout:'decisionlab',title:'Experimento'},{layout:'statement',text:'Fim'}]};
  assert.match(renderSlide(spec.slides[0],0,spec).html,/99,6/);
  const b=await browserOrSkip(t);if(!b)return;
  try{const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.setContent(buildHTML(spec).html);await p.waitForSelector('[data-decision-lab][data-mounted]');
    await p.locator('[data-param=introducedRate]').fill('2');
    assert.equal(await p.locator('[data-output=reviewed]').textContent(),'276');
    await p.locator('[data-param=introducedRate]').press('ArrowRight');
    assert.equal(await p.evaluate(()=>window.sagadeck.cur),0);
    await p.locator('[data-reset]').click();
    assert.equal(await p.locator('[data-output=reviewed]').textContent(),'99,6');
    assert.deepEqual(errors,[]);
  }finally{await b.close();}
});
