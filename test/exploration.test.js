import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildHTML } from '../src/build.js';
import { explorationStates, auditExploration } from '../src/exploration.js';
import { estudoHTML } from '../src/export/estudo.js';
import { reviewExperience } from '../src/ai/quality.js';
import { evaluateAutonomy } from '../src/ai/evaluation.js';
import { explorationDemo } from '../src/studio/exploration-demo.js';
import { editDeck, generateDeck } from '../src/ai/deck-ai.js';
import { startMockLLM } from './mock-llm.js';
import { measureLLM } from '../src/ai/usage.js';
import { chat } from '../src/ai/llm.js';
import { browserOrSkip, newPage, tempDeck } from './helpers.js';

export const slide = { layout: 'calc', title: 'Quando a espera cresce?', illustrative: true, prediction: 'Dobrar a demanda dobra a espera?', explanation: 'Observe a mudança perto da capacidade.', sweep: 'demand',
  inputs: { demand: { label: 'Demanda', value: 2, min: 1, max: 9, step: 1 }, capacity: { label: 'Capacidade', value: 10, min: 10, max: 20, step: 1 } },
  outputs: [{ name: 'wait', label: 'Espera', fn: '1/(capacity-demand)', decimals: 3, scale: { min: 0, max: 1 } }],
  scenarios: [{ label: 'Perto do limite', values: { demand: 9 }, explanation: 'A espera cresce rapidamente.' }] };

test('experiência: estados calculados, extremos e contrato inválido', () => {
  assert.deepEqual(auditExploration(slide), []);
  assert.equal(explorationStates(slide)[1].results.wait.value, 1);
  assert.ok(auditExploration({ ...slide, scenarios: [{ label: 'Inválido', values: { demand: 100 } }] }).length);
  assert.ok(auditExploration({ ...slide, outputs: [{ name: 'bad', fn: 'missing+1' }] }).length);
});

test('estudo inclui estados, resultados e explicação, sem notas privadas', () => {
  const built = buildHTML({ title: 'Laboratório', theme: 'sinal', slides: [{ ...slide, notes: 'privado' }] });
  const html = estudoHTML({ title: 'A', slidesMeta: built.slidesMeta, shotFiles: [] });
  assert.match(html, /Perto do limite/); assert.match(html, /Espera: 1/); assert.match(html, /Simulação ilustrativa/); assert.doesNotMatch(html, /privado/);
});

test('revisão não aprova sem visão e respeita achados concretos', async () => {
  const spec = { slides: [slide] };
  assert.equal((await reviewExperience(spec, [0])).verified, false);
  const result = await reviewExperience(spec, [0], { snapshot: async () => [{ label: 'Inicial', dataUrl: 'data:image/png;base64,AA==' }], complete: async () => ({ text: '{"issues":["Controle ilegível"]}' }) });
  assert.equal(result.issues[0].text, 'Controle ilegível');
  assert.equal(result.verified, false);
});

test('avaliação registra falha por caso, continua e não inventa custo ou aprovação', async () => {
  const recorded = [];
  const report = await evaluateAutonomy([{ id: 'bad', prompt: 'bad' }, { id: 'good', prompt: 'good' }], {
    generate: async prompt => { if (prompt === 'bad') throw Error('Sem modelo'); return { spec: { slides: [slide] } }; },
    record: async row => recorded.push(row.id),
  });
  assert.deepEqual(recorded, ['bad', 'good']);
  assert.equal(report[0].status, 'failed'); assert.equal(report[1].status, 'unverified'); assert.equal(report[1].cost, null);
});

test('medição de chamadas soma tokens e não inventa preço ausente', async () => {
  const llm = await startMockLLM(() => 'ok');
  const before = process.env.SAGADECK_LLM_URL; process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const [one, two] = await Promise.all([measureLLM(() => chat([{ role: 'user', content: 'A' }])), measureLLM(async () => { await chat([{ role: 'user', content: 'B' }]); return chat([{ role: 'user', content: 'C' }]); })]);
    assert.equal(one.usage.calls, 1); assert.equal(two.usage.calls, 2);
    assert.equal(two.usage.promptTokens + two.usage.completionTokens, 4);
    assert.equal(two.usage.missingCost, 2);
  } finally { if (before == null) delete process.env.SAGADECK_LLM_URL; else process.env.SAGADECK_LLM_URL = before; await llm.close(); }
});

test('agente recebe achados, corrige, confere outra vez e preserva conteúdo alheio', async () => {
  let call = 0, reviews = 0;
  const llm = await startMockLLM(() => `\`\`\`yaml\nreview: true\nedit:\n  1:\n    title: ${++call === 1 ? 'Primeira' : 'Corrigida'}\n\`\`\``);
  const before = process.env.SAGADECK_LLM_URL; process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const result = await editDeck({ spec: { theme: 'sinal', slides: [slide, { layout: 'statement', text: 'Preservar' }] }, instruction: 'Melhore a composição', reviewCheck: async () => (++reviews === 1 ? { issues: [{ slide: 1, text: 'Título ilegível' }], unchecked: [], verified: false } : { issues: [], unchecked: [], verified: true }) });
    assert.equal(result.spec.slides[0].title, 'Corrigida'); assert.equal(result.spec.slides[1].text, 'Preservar'); assert.equal(reviews, 2); assert.equal(result.quality.verified, true);
  } finally { if (before == null) delete process.env.SAGADECK_LLM_URL; else process.env.SAGADECK_LLM_URL = before; await llm.close(); }
});

test('navegador: prever, revelar, comparar, cenário, curva e restaurar', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, 'exploration.html');
    fs.writeFileSync(file, buildHTML({ title: 'Laboratório', theme: 'sinal', slides: [slide] }).html);
    const { page, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await page.goto(pathToFileURL(file).href);
    await page.waitForSelector('[data-calc-ready]');
    assert.equal(await page.locator('.calc-outputs').isVisible(), false);
    await page.click('[data-calc-reveal]');
    assert.equal(await page.locator('[data-calc-reveal]').innerText(), 'Resultado revelado');
    await page.click('[data-calc-freeze]');
    await page.click('[data-calc-scenario="0"]');
    assert.equal(await page.locator('[data-calc-out="wait"]').innerText(), '1,000');
    assert.match(await page.locator('[data-calc-compare="wait"]').innerText(), /0,125/);
    assert.match(await page.locator('[data-calc-explanation]').innerText(), /rapidamente/);
    assert.match(await page.locator('[data-calc-curve]').getAttribute('d'), /^M/);
    await page.click('[data-calc-reset]');
    assert.equal(await page.locator('.calc-outputs').isVisible(), false);
    await page.click('[data-calc-free]');
    assert.equal(await page.locator('[data-calc-in="demand"]').inputValue(), '2');
    assert.equal(await page.locator('[data-calc-compare]').isVisible(), false);
    assert.deepEqual(errors, []);
    const study = estudoHTML({ title: 'Estudo', slidesMeta: buildHTML({ slides: [slide] }).slidesMeta, shotFiles: [] });
    await page.setContent(study);
    await page.click('.study-live summary');
    await page.click('[data-calc-scenario="0"]');
    assert.equal(await page.locator('[data-calc-out="wait"]').innerText(), '1,000');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test('continuidade entre cenas anima o objeto e respeita movimento reduzido', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, 'continuity.html');
    const spec = explorationDemo(); spec.slides = spec.slides.slice(2, 4);
    fs.writeFileSync(file, buildHTML(spec).html);
    const { page, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await page.goto(pathToFileURL(file).href); await page.waitForFunction(() => window.sagadeck);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(70);
    assert.ok(await page.locator('.current [data-continuity]').evaluate(el => el.getAnimations().length > 0));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(70);
    assert.equal(await page.locator('.current [data-continuity]').evaluate(el => el.getAnimations().filter(a => a.effect.getTiming().duration === 550).length), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test('resultado alterado mantém contraste no tema prata claro', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const f = path.join(deck.dir, 'contrast.html');
    fs.writeFileSync(f, buildHTML({ theme: 'prata', slides: [{ ...slide, prediction: '' }] }).html);
    const { page, errors } = await newPage(browser, null);
    await page.goto(pathToFileURL(f).href + '?export'); await page.waitForSelector('[data-calc-ready]');
    await page.click('[data-calc-scenario="0"]');
    const color = await page.locator('[data-calc-out="wait"]').evaluate(e => getComputedStyle(e).color);
    assert.ok(Number(color.match(/\d+/)[0]) < 150, `texto precisa contrastar com o fundo claro: ${color}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test('geração confere mesmo sem review no YAML e corrige até a revisão passar', async () => {
  let reviews = 0;
  const llm = await startMockLLM(req => req.lastUser.includes('Corrija somente') ? '```yaml\nedit:\n  1:\n    title: Corrigida\n```' : '```yaml\ndeck:\n  title: Exemplo\nslides:\n  - layout: cover\n    title: Exemplo\n  - layout: statement\n    text: Conteúdo\n```');
  const before = process.env.SAGADECK_LLM_URL; process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const r = await generateDeck('Crie dois slides sem perguntar', { research:false, images:false, reviewCheck:async () => (++reviews < 3 ? { issues:[{slide:1,text:'Título ilegível'}], unchecked:[], verified:false } : {issues:[],unchecked:[],verified:true}) });
    assert.equal(reviews,3); assert.equal(r.quality.verified,true); assert.equal(r.spec.slides[0].title,'Corrigida');
  } finally { if(before==null) delete process.env.SAGADECK_LLM_URL; else process.env.SAGADECK_LLM_URL=before; await llm.close(); }
});

test('revisão confirma semanticamente defeitos sem tratar verificações corretas como erros',async()=>{
  let call=0;
  const r=await reviewExperience({slides:[slide]},[0],{snapshot:async()=>[{label:'Inicial',dataUrl:'data:image/png;base64,AA=='}],complete:async()=>({text:++call===1?'Texto antes. ```json\n{"issues":["O resultado está correto","Controle ilegível"]}\n```':'{"confirmed":[1]}'})});
  assert.deepEqual(r.issues,[{slide:1,text:'Controle ilegível'}]);assert.deepEqual(r.unchecked,[]);
  const failed=await reviewExperience({slides:[slide]},[0],{snapshot:async()=>{throw Error('Render indisponível');}});
  assert.equal(failed.failures[0].reason,'Render indisponível');assert.equal(failed.verified,false);
});
