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
import { slideSnapshots, closeSnapshots } from '../src/studio/snapshot.js';

export const slide = { layout: 'calc', title: 'Quando a espera cresce?', illustrative: true, prediction: 'Dobrar a demanda dobra a espera?', explanation: 'Observe a mudança perto da capacidade.', sweep: 'demand',
  inputs: { demand: { label: 'Demanda', value: 2, min: 1, max: 9, step: 1 }, capacity: { label: 'Capacidade', value: 10, min: 10, max: 20, step: 1 } },
  outputs: [{ name: 'wait', label: 'Espera', fn: '1/(capacity-demand)', decimals: 3, scale: { min: 0, max: 1 } }],
  scenarios: [{ label: 'Perto do limite', values: { demand: 9 }, explanation: 'A espera cresce rapidamente.' }] };

test('código guiado rola até o destaque da etapa sem deslocar o palco', async t => {
  const browser=await browserOrSkip(t);if(!browser)return;const deck=tempDeck();
  try {
    const file=path.join(deck.dir,'codigo-longo.html');
    fs.writeFileSync(file,buildHTML({theme:'manual',slides:[{layout:'codewalk',title:'Programa longo',density:'compact',language:'python',code:Array.from({length:45},(_,i)=>`valor_${i+1} = ${i+1}`).join('\n'),steps:[{title:'Início',highlight:[1]},{title:'Final',highlight:[44,45]}]}]}).html);
    const {page}=await newPage(browser,null,{width:1920,height:1080});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.sagadeck);
    await page.click('[data-lesson-go="1"]');
    const bounds=await page.evaluate(()=>{const c=document.querySelector('.code').getBoundingClientRect(),line=document.querySelector('.code .cl.hl').getBoundingClientRect();return{line:line.top,bottom:line.bottom,top:c.top,limit:c.bottom,window:window.scrollY};});
    assert.ok(bounds.line>=bounds.top&&bounds.bottom<=bounds.limit,JSON.stringify(bounds));assert.equal(bounds.window,0);
  } finally {await browser.close();deck.cleanup();}
});

test('capturas de revisão mostram a etapa do palco, não o resumo de exportação', async t => {
  const browser=await browserOrSkip(t);if(!browser)return;await browser.close();
  try {
    const frames=await slideSnapshots({theme:'manual',slides:[{layout:'codewalk',title:'Duas etapas',code:'a = 1\nb = 2',language:'python',steps:[{title:'Início',text:'Primeira linha',highlight:[1]},{title:'Final',text:'Segunda linha',highlight:[2]}]}]},0,{mode:'exploration',maxFrames:2});
    assert.equal(frames[0].state?.stepText,'Início');
    assert.equal(frames[1].state?.stepText,'Final');
    assert.equal(frames[1].state?.stepVisible,true);
    assert.deepEqual(frames[1].state?.highlightedLines,[2]);
  } finally {await closeSnapshots();}
});

test('oito resultados com curvas deixam controles e explicação visíveis', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const outputs = Array.from({length:4}, (_,i) => [
      {name:`n${i+1}`,label:`Novos na ${i+1}ª rodada`,fn:i ? `n${i}*p*fator` : 'alcance*p*fator',decimals:1},
      {name:`t${i+1}`,label:`Alcance após ${i+1} rodadas`,fn:i ? `t${i}+n${i+1}` : 'alcance+n1',decimals:1},
    ]).flat();
    const file = path.join(deck.dir,'oito-resultados.html');
    fs.writeFileSync(file,buildHTML({theme:'editorial',slides:[{...slide,
      title:'Quanto mais gente compartilha, mais verdade parece',sweep:'p',outputs,
      prediction:'Se 10 pessoas veem, 30% compartilham e cada compartilhamento alcança 3 pessoas novas, quantas pessoas são alcançadas em 4 rodadas?',
      inputs:{alcance:{label:'Alcance inicial',value:10,min:1,max:100,step:1},p:{label:'Probabilidade de compartilhar',value:.3,min:.01,max:.9,step:.01},fator:{label:'Novos por compartilhamento',value:3,fixed:true}},
      explanation:'O alcance cresce mesmo quando a afirmação não tem nenhuma evidência: popularidade não é prova, e o número final não diz se a informação é verdadeira. A curva mostra o alcance após quatro rodadas em função da probabilidade de compartilhar. Leia os valores nas saídas numéricas ao lado e acompanhe o formato da curva.',
      scenarios:[{label:'Viral',values:{p:.7}}],
    }]}).html);
    const {page,errors}=await newPage(browser,null,{width:1920,height:1080});
    await page.goto(pathToFileURL(file).href); await page.waitForSelector('[data-calc-ready]');
    await page.click('[data-calc-reveal]');
    await page.waitForTimeout(200);
    const initial=await page.evaluate(()=>({bottom:document.querySelector('.calc-explanation').getBoundingClientRect().bottom,limit:document.querySelector('.safe').getBoundingClientRect().bottom}));
    assert.ok(initial.bottom<=initial.limit+2,JSON.stringify(initial));
    await page.click('[data-calc-freeze]'); await page.click('[data-calc-scenario="0"]');
    await page.waitForTimeout(200);
    const bounds=await page.evaluate(()=>{
      const safe=document.querySelector('.safe').getBoundingClientRect();
      const panel=document.querySelector('.calc-outputs').getBoundingClientRect();
      const explanation=document.querySelector('.calc-explanation').getBoundingClientRect();
      return {bottom:panel.bottom,limit:safe.bottom,explanation:explanation.top,inputs:document.querySelector('.calc-inputs').getBoundingClientRect().bottom,top:panel.top};
    });
    assert.ok(bounds.bottom<=bounds.explanation+2 && bounds.bottom<=bounds.limit+2 && bounds.inputs<=bounds.top+2,JSON.stringify(bounds));
    assert.equal(await page.locator('[data-calc-out="t4"]').innerText(),'362,2');
    assert.equal(await page.locator('.calc-curve').count(),8);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();deck.cleanup();}
});

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

test('revisão informa avanço por slide inclusive quando uma captura falha', async () => {
  const events = [];
  const r = await reviewExperience({ slides: [slide, { layout: 'statement', text: 'Outra ideia' }] }, [0, 1, 1], {
    onProgress: event => events.push(event),
    snapshot: async (_spec, index) => {
      if (index === 0) throw Error('Captura indisponível');
      return [{ label: 'Completo', dataUrl: 'data:image/png;base64,AA==' }];
    },
    complete: async () => ({ text: '{"issues":[]}' }),
  });
  assert.deepEqual(events.map(e => [e.phase, e.slide, e.current, e.total]), [
    ['review', 1, 1, 2], ['review', 2, 2, 2],
  ]);
  assert.match(events[1].text, /2.*2/);
  assert.deepEqual(r.unchecked, [1]);
  assert.equal(r.verified, false);
});

test('geração preserva o último deck válido se o provedor cai durante a correção visual', async () => {
  const llm = await startMockLLM(req => req.lastUser.includes('Corrija somente')
    ? { status: 502, error: 'Provedor indisponível' }
    : '```yaml\ndeck:\n  title: Exemplo preservado\nslides:\n  - layout: cover\n    title: Exemplo preservado\n  - layout: statement\n    text: Conteúdo já gerado\n```');
  const before = process.env.SAGADECK_LLM_URL;
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const r = await generateDeck('Crie dois slides', { research: false, images: false,
      reviewCheck: async () => ({ issues: [{ slide: 1, text: 'Título cortado' }], unchecked: [], failures: [], verified: false }) });
    assert.equal(r.spec.slides[1].text, 'Conteúdo já gerado');
    assert.equal(r.quality.verified, false);
    assert.equal(r.quality.issues.length, 1);
    assert.match(r.quality.failures.at(-1).reason, /502|indisponível/i);
  } finally {
    if (before == null) delete process.env.SAGADECK_LLM_URL; else process.env.SAGADECK_LLM_URL = before;
    await llm.close();
  }
});

test('calculadora com duas curvas e comparação mantém resultados dentro da área útil', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, 'duas-curvas.html');
    fs.writeFileSync(file, buildHTML({ theme: 'editorial', slides: [{ ...slide,
      title: 'Como pequenas escolhas mudam os resultados ao longo de várias etapas?',
      outputs: [...slide.outputs, { name: 'factor', label: 'Fator acumulado', fn: 'demand^3', decimals: 2 }],
    }] }).html);
    const { page, errors } = await newPage(browser, null, { width: 1280, height: 720 });
    await page.goto(pathToFileURL(file).href);
    await page.waitForSelector('[data-calc-ready]');
    await page.click('[data-calc-reveal]');
    await page.click('[data-calc-freeze]');
    await page.click('[data-calc-scenario="0"]');
    await page.waitForTimeout(150);
    const bounds = await page.evaluate(() => {
      const safe = document.querySelector('.safe').getBoundingClientRect();
      const panel = document.querySelector('.calc-outputs').getBoundingClientRect();
      return { bottom: panel.bottom, limit: safe.bottom, top: panel.top, start: safe.top };
    });
    assert.ok(bounds.bottom <= bounds.limit + 4 && bounds.top >= bounds.start - 4, JSON.stringify(bounds));
    assert.equal(await page.locator('[data-calc-out="factor"]').innerText(), '729,00');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});
