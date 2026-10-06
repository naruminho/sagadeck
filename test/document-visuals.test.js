import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { browserOrSkip } from './helpers.js';
import { tempDeck, startStudio } from './helpers.js';
import { startMockLLM } from './mock-llm.js';
import { prepareDocumentMaterials, storedDocumentMaterials } from '../src/ai/document-materials.js';
import { materialsBlock } from '../src/ai/context.js';
import { extractDocumentVisuals, ensureVisualCoverage, protectPDFText } from '../src/ai/document-visuals.js';

test('recorte PDF protege a palavra e a legenda que cruzam a borda, sem capturar linhas distantes',()=>{
  const box=protectPDFText([300,400,380,215],[{left:650,top:500,right:740,bottom:520},{left:100,top:620,right:900,bottom:632},{left:100,top:800,right:900,bottom:815}]);
  assert.ok(box[0]<=100 && box[0]+box[2]>=900);
  assert.ok(box[1]+box[3]>=632 && box[1]+box[3]<800);
});

test('legenda identificada limita o recorte antes do título ou figura seguinte',()=>{
  const box=protectPDFText([100,200,800,600],[{text:'Figure.3.2.',left:100,top:650,right:260,bottom:665},{text:'Continuous function',left:270,top:650,right:800,bottom:665},{text:'Next section',left:100,top:740,right:800,bottom:770}],'Figura 3.2 — função contínua');
  assert.ok(box[1]+box[3]>=665&&box[1]+box[3]<700);
});

test('Word: todas as figuras, tabelas e equações são inventariadas com seus dados originais', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Método</w:t></w:r></w:p><w:p><w:drawing><a:blip r:embed="img1"/></w:drawing></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Grupo</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Valor</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12,5</w:t></w:r></w:p></w:tc></w:tr></w:tbl><m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath></w:body></w:document>');
  zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="img1" Target="media/figure.svg"/></Relationships>');
  zip.file('word/media/figure.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="30"/></svg>');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-doc-visuals-'));
  try {
    const inventory = await extractDocumentVisuals('paper.docx', await zip.generateAsync({ type: 'nodebuffer' }), dir);
    assert.deepEqual(inventory.items.map(x => x.kind).sort(), ['equation', 'figure', 'table']);
    assert.deepEqual(inventory.items.find(x => x.kind === 'table').rows, [['Grupo', 'Valor'], ['A', '12,5']]);
    assert.equal(inventory.items.find(x => x.kind === 'equation').latex, '\\frac{a}{b}');
    for (const item of inventory.items.filter(x => x.image)) assert.ok(fs.existsSync(path.join(dir, item.image)));
    const result = ensureVisualCoverage({ title: 'Paper', slides: [{ layout: 'statement', text: 'Resumo' }] }, [inventory]);
    assert.equal(result.missing.length, 0);
    assert.equal(result.added.length, 3, 'a IA não pode resumir eliminando os elementos do paper');
    const again = ensureVisualCoverage(result.spec, [inventory]);
    assert.equal(again.added.length, 0, 'a conferência não duplica elementos já preservados');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('uma tabela reconstruída com valores alterados não conta como cobertura fiel', () => {
  const source = { name: 'paper', items: [{ id: 'table-1', kind: 'table', caption: 'Resultados', rows: [['Grupo', 'Valor'], ['A', '12,5']] }] };
  const deck = { slides: [{ layout: 'table', sourceVisuals: ['table-1'], table: { headers: ['Grupo', 'Valor'], rows: [['A', '99']] } }] };
  const result = ensureVisualCoverage(deck, [source]);
  assert.equal(result.repaired.length, 1);
  assert.equal(result.spec.slides[0].rows[0][1], '12,5');
});

test('seleção editorial explícita não força slides nem restaura valores editados', () => {
  const source = {name:'paper',items:[{id:'a',kind:'equation',latex:'x=1'}]};
  const deck = {slides:[{layout:'statement',text:'Resumo executivo'}]};
  assert.deepEqual(ensureVisualCoverage(deck,[source],{preserve:false}).spec,deck);
});

test('PDF: recortes completos e fallback conservador sem perder a página original', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'saga-pdf-visuals-'));
  try {
    const page = await browser.newPage();
    await page.setContent('<h1>Resultados</h1><table><tr><td>A</td><td>12.5</td></tr></table><svg width="300" height="100"><path d="M0 90L300 10" stroke="black"/></svg><p>E = mc²</p>');
    const bytes = await page.pdf();
    const material = {name:'paper.pdf',text:'Resultados A 12.5 E=mc²',detail:'pdf',bytes};
    const inspect = async()=>({complete:true,items:[{kind:'table',caption:'Tabela de resultados',bounds:{left:0,top:0,right:500,bottom:300}},{kind:'chart',caption:'Gráfico',bounds:{left:0,top:300,right:500,bottom:600}},{kind:'equation',caption:'Equação',bounds:{left:0,top:600,right:500,bottom:700}}]});
    const docs = await prepareDocumentMaterials([material],dir,{inspect});
    assert.equal(docs[0].inventory.items.length,3);
    for (const item of docs[0].inventory.items) assert.ok(fs.existsSync(path.join(dir,item.image)));
    assert.equal(storedDocumentMaterials(dir)[0].inventory.items.length,3);
    assert.ok(docs[0].inventory.items[1].box[3]>=300,'margem protege rótulos na borda');
    const reordered=await extractDocumentVisuals('paper.pdf',bytes,dir,{inspect:async()=>{const value=await inspect();value.items.reverse();return value;}});
    for(const item of docs[0].inventory.items)assert.equal(reordered.items.find(x=>x.caption===item.caption).image,item.image,'reanalisar em outra ordem não troca o arquivo de uma figura por outra');
    await prepareDocumentMaterials([material],dir,{inspect:()=>{throw Error('cache válido não deve chamar visão');}});
    assert.match(materialsBlock(docs),/INVENTÁRIO VISUAL/);
    assert.match(materialsBlock(docs),/fonte exclusiva/);
    const fallback = await extractDocumentVisuals('paper.pdf',bytes,dir,{inspect:async()=>{throw Error('visão indisponível');}});
    assert.equal(fallback.items[0].kind,'page');
    assert.equal(fallback.items[0].needsReview,true);
    assert.match(fallback.warnings[0],/preservada/);
    const invalid = await extractDocumentVisuals('paper.pdf',bytes,dir,{inspect:async()=>({complete:true,items:[{kind:'chart',bounds:{left:500,top:100,right:200,bottom:600}}]})});
    assert.equal(invalid.items[0].needsReview,true,'limites invertidos nunca viram recortes enganosos');
    const metadata = storedDocumentMaterials(dir)[0];
    metadata.inventory = fallback;
    fs.writeFileSync(path.join(dir,'contexto','documentos',fallback.hash,'material.saga.json'),JSON.stringify(metadata));
    const refreshed = await prepareDocumentMaterials([material],dir,{inspect});
    assert.equal(refreshed[0].inventory.items.length,3,'falha transitória de visão não fica presa no cache');
  } finally {await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Studio: anexo Word chega ao chat com imagem local e continua disponível na próxima mensagem', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml','<w:document><w:body><w:p><w:r><w:t>Resultado: 12,5</w:t><a:blip r:embed="i"/></w:r></w:p></w:body></w:document>');
  zip.file('word/_rels/document.xml.rels','<Relationships><Relationship Id="i" Target="media/f.svg"/></Relationships>');
  zip.file('word/media/f.svg','<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');
  const bytes = await zip.generateAsync({type:'nodebuffer'});
  let calls = 0;
  const deck = tempDeck(), llm = await startMockLLM(req => {
    if (calls++) return 'Recebi os elementos do documento.';
    const inventory = JSON.parse(req.lastUser.match(/INVENTÁRIO VISUAL[^\n]*\n([^\n]+)/)[1]);
    return '```yaml\ninsert:\n  - after: 1\n    slide:\n      layout: split\n      title: Resultado da fonte\n      body: "Resultado: 12,5"\n      figure:\n        image: '+JSON.stringify(inventory.items[0].image)+'\n        fit: contain\n```';
  }), studio = await startStudio(deck.file,{llmUrl:llm.url});
  const call = async (route,body) => (await fetch(studio.url+route,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined})).json();
  try {
    const attached = await call('/api/ai/context',{name:'paper.docx',dataUrl:'data:application/octet-stream;base64,'+bytes.toString('base64')});
    assert.ok(attached.id);
    const current = await call('/api/deck');
    const result = await call('/api/ai/chat',{message:'Apresente o paper fielmente',spec:current.spec,attachments:[{type:'doc',id:attached.id}]});
    assert.equal(result.error,undefined);
    assert.match(llm.requests.at(-1).lastUser,/INVENTÁRIO VISUAL/);
    assert.equal(storedDocumentMaterials(deck.dir)[0].inventory.items.length,1);
    assert.ok((await call('/api/deck')).spec.slides.some(s=>s.figure?.image?.startsWith('contexto/visuais/')));
    await call('/api/ai/chat',{message:'Releia a figura',spec:current.spec});
    assert.match(llm.requests.at(-1).lastUser,/INVENTÁRIO VISUAL/);
  } finally {await studio.close();await llm.close();deck.cleanup();}
});


test('Word: barra horizontal, pizza e tipo desconhecido (vira tabela, nada se perde)', async () => {
  const chartXML = (plot) => `<c:chartSpace><c:chart><c:plotArea>${plot}</c:plotArea></c:chart></c:chartSpace>`;
  const ser = (name, labels, values) => `<c:ser><c:tx><c:v>${name}</c:v></c:tx><c:cat>${labels.map((l, i) => `<c:pt idx="${i}"><c:v>${l}</c:v></c:pt>`).join('')}</c:cat><c:val>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:val></c:ser>`;
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document><w:body><w:p><w:drawing><c:chart r:id="ch1"/></w:drawing></w:p><w:p><w:drawing><c:chart r:id="ch2"/></w:drawing></w:p><w:p><w:drawing><c:chart r:id="ch3"/></w:drawing></w:p></w:body></w:document>`);
  zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="ch1" Target="charts/chart1.xml"/><Relationship Id="ch2" Target="charts/chart2.xml"/><Relationship Id="ch3" Target="charts/chart3.xml"/></Relationships>');
  zip.file('word/charts/chart1.xml', chartXML(`<c:barChart><c:barDir val="bar"/>${ser('A', ['J', 'F'], [5, 7])}</c:barChart>`));
  zip.file('word/charts/chart2.xml', chartXML(`<c:pieChart>${ser('', ['X', 'Y'], [3, 9])}</c:pieChart>`));
  zip.file('word/charts/chart3.xml', chartXML(`<c:scatterChart>${ser('S', ['1', '2'], [4, 8])}</c:scatterChart>`));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-doc-chart-'));
  try {
    const inventory = await extractDocumentVisuals('charts.docx', await zip.generateAsync({ type: 'nodebuffer' }), dir);
    assert.equal(inventory.items.length, 3);
    const [bar, pie, tab] = inventory.items;
    assert.equal(bar.chart.chart, 'bar');
    assert.deepEqual(bar.chart.series, [{ name: 'A', values: [5, 7] }]);
    assert.equal(pie.chart.chart, 'donut');
    assert.deepEqual(pie.chart.parts, [{ label: 'X', value: 3 }, { label: 'Y', value: 9 }]);
    assert.equal(tab.kind, 'table');
    assert.deepEqual(tab.rows, [['Série', '1', '2'], ['S', '4', '8']]);
    assert.ok(inventory.warnings.some(w => w.includes('scatter')), JSON.stringify(inventory.warnings));
    for (const item of inventory.items) assert.ok(fs.existsSync(path.join(dir, item.image)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
