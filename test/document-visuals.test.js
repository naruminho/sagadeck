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
import { extractDocumentVisuals, ensureVisualCoverage, protectPDFText, proseSuspect, orphanCaptions, isBlankCrop, snapToImages, mergeDuplicateCrops, uncoveredVisuals, creditLineStart, clearCaptionEdges, equationBox, sourcePixels, assignEquations, formulaSimilarity, captionLineStrict } from '../src/ai/document-visuals.js';

test('recorte PDF protege a palavra que cruza a borda; linha larga de prosa passando embaixo não estica o recorte',()=>{
  const box=protectPDFText([300,400,380,215],[{left:650,top:500,right:740,bottom:520},{left:100,top:620,right:900,bottom:632},{left:100,top:800,right:900,bottom:815}]);
  assert.ok(box[0]+box[2]>=744, `rótulo cruzando a borda direita entra: ${box}`);
  assert.ok(box[0]>=284 && box[0]+box[2]<=760, `a linha de 100 a 900 é prosa, não rótulo: ${box}`);
  assert.ok(box[1]+box[3]<800, `linha distante de fora: ${box}`);
});

test('legenda identificada fica FORA do recorte (a IA escreve a legenda; nada da figura seguinte entra)',()=>{
  const box=protectPDFText([100,200,800,600],[{text:'Figure.3.2.',left:100,top:650,right:260,bottom:665},{text:'Continuous function',left:270,top:650,right:800,bottom:665},{text:'Next section',left:100,top:740,right:800,bottom:770}],'Figura 3.2 — função contínua');
  assert.ok(box[1]+box[3]>=608&&box[1]+box[3]<650, `recorte termina antes da legenda: ${box}`);
});

test('legenda de cima (caption no topo) também fica de fora',()=>{
  const box=protectPDFText([100,200,800,600],[
    {text:'Figure 4: a) Evaluation indices',left:100,top:210,right:900,bottom:230},
    {text:'46°W',left:300,top:250,right:360,bottom:266},
  ],'Figure 4: evaluation indices and variable importance');
  assert.ok(box[1]>=234, `topo abaixo da legenda: ${box}`);
  assert.ok(box[0]<=296, `rótulo curto continua dentro: ${box}`);
});

test('parágrafo acima e coluna ao lado não entram no recorte (só o que cruza a borda)',()=>{
  const box=protectPDFText([100,300,800,500],[
    {text:'parágrafo continua acima',left:100,top:252,right:900,bottom:266},
    {text:'body text above',left:100,top:270,right:900,bottom:290},
    {text:'side column',left:910,top:400,right:990,bottom:700},
    {text:'y axis',left:90,top:400,right:120,bottom:420},
  ]);
  assert.ok(box[1]>=292, `topo preservado, sem o parágrafo: ${box}`);
  assert.ok(box[0]+box[2]<=908, `coluna ao lado de fora: ${box}`);
  assert.ok(box[0]<=86, `rótulo que cruza a borda continua protegido: ${box}`);
});

test('última linha larga do parágrafo cruzando o topo não estica o recorte',()=>{
  const box=protectPDFText([142,312,716,239],[
    {text:'well-instrumented basin with data',left:60,top:266,right:500,bottom:280},
    {text:'…ten years,',left:60,top:282,right:300,bottom:296},
    {text:'rainfall from four monitoring stations at',left:300,top:282,right:700,bottom:296},
    {text:'…providing a robust dataset for modeling and flood analysis.',left:60,top:298,right:940,bottom:314},
    {text:'46°32’0”W',left:300,top:330,right:380,bottom:346},
  ],'Figure 1: Land use and land cover');
  assert.ok(box[1]>=304, `parágrafo de fora: ${box}`);
  assert.ok(box[0]<=296, `rótulo curto cruzando continua dentro: ${box}`);
});

test('limpeza de borda: parágrafo inteiro grudado no topo é aparado, rótulo espaçado fica',()=>{  const box=protectPDFText([142,322,677,206],[
    {text:'rainfall from four monitoring stations',left:118,top:287,right:560,bottom:300},
    {text:'(Gauge control in Fig. 1), and water level',left:118,top:303,right:590,bottom:316},
    {text:'approximately ten years, providing a robust dataset',left:118,top:319,right:723,bottom:332},
    {text:'46°32’0”W',left:300,top:344,right:380,bottom:360},
    {text:'46°28’30”W',left:480,top:344,right:570,bottom:360},
  ],'Figure 1: Land use and land cover');
  assert.ok(box[1]>=334, `parágrafo aparado: ${box}`);
  assert.ok(box[1]<344, `rótulos de coordenada preservados: ${box}`);
});

test('halo do topo salva rótulo curto (eixo, letra de painel), mas não prosa',()=>{
  const box=protectPDFText([100,300,800,200],[
    {text:'a)',left:110,top:288,right:130,bottom:302},
    {text:'previous paragraph line',left:300,top:276,right:820,bottom:290},
    {text:'body text above the figure line',left:300,top:294,right:820,bottom:308},
  ]);
  assert.ok(box[1]<=284, `letra do painel absorvida: ${box}`);
});

test('legenda da figura SEGUINTE também fica de fora (número diferente)',()=>{
  const box=protectPDFText([113,515,772,278],[
    {text:'Importance',left:600,top:700,right:720,bottom:716},
    {text:'Figure 5 shows the flood susceptibility maps',left:113,top:800,right:885,bottom:820},
    {text:'generated by the Random Forest, XGBoost, and',left:113,top:824,right:885,bottom:844},
  ],'Figure 4: a) Evaluation indices for calibration and validation of ML models, b) Variable importance');
  assert.ok(box[1]+box[3]<800, `recorte termina antes da legenda da Figura 5: ${box}`);
  assert.ok(box[1]+box[3]>=716, `conteúdo da Figura 4 preservado: ${box}`);
});

test('título isolado da figura cruzando o topo continua protegido',()=>{  const box=protectPDFText([142,312,716,239],[
    {text:'Experimental setup overview',left:200,top:298,right:800,bottom:314},
    {text:'46°32’0”W',left:300,top:330,right:380,bottom:346},
  ]);
  assert.ok(box[1]<304, `sem texto acima, é da figura: ${box}`);
});

test('legenda fragmentada ("F"+"igure") abaixo do meio fica de fora (ICFM10 Fig.2)',()=>{
  const box=protectPDFText([180,760,519,143],[
    {text:'F',left:170,top:886,right:178,bottom:900},
    {text:'igure 2: Flood occurrence (2013–2024)',left:180,top:886,right:700,bottom:900},
  ],'Figure 2: Flood occurrence data (2013–2024)');
  assert.ok(box[1]+box[3]<886, `corta antes da legenda fragmentada: ${box}`);
  assert.ok(box[1]+box[3]>=860, `não come a figura: ${box}`);
});

test('margem lateral protege rótulo raster e para no texto vizinho',()=>{
  const box=protectPDFText([200,400,600,200],[
    {text:'coluna vizinha',left:830,top:450,right:990,bottom:470},
  ]);
  assert.equal(box[0],184, `margem 16 no vazio: ${box}`);
  assert.equal(box[0]+box[2],816, `margem 16 sem engolir a coluna: ${box}`);
});

test('legenda de cima CURTA e centralizada (ABNT: "Figura 1 – Mapa…") fica de fora, com a frase que a anuncia',()=>{
  const box=protectPDFText([130,60,740,380],[
    {text:'A metodologia do estudo é mostrada na Figura 2.',left:150,top:62,right:520,bottom:74},
    {text:'Figura 2 – Fluxograma do estudo.',left:380,top:82,right:620,bottom:94},
    {text:'ETR',left:300,top:110,right:330,bottom:122},
  ],'Figura 2 – Fluxograma do estudo.');
  assert.ok(box[1]>=94, `topo abaixo da legenda curta: ${box}`);
  assert.ok(box[1]<110, `rótulo da figura preservado: ${box}`);
});

test('linha "Fonte: Os autores" embaixo da figura fica de fora, e o parágrafo depois dela também',()=>{
  const box=protectPDFText([80,186,844,91],[
    {text:'Estatística',left:100,top:184,right:200,bottom:196},
    {text:'RMSE%',left:100,top:213,right:160,bottom:225},
    {text:'Fonte: Os Autores (2023).',left:412,top:228,right:600,bottom:240},
    {text:'Foram obtidos valores inferiores a 33% para ambas as linhas.',left:155,top:258,right:900,bottom:270},
  ],'Tabela 1 – Análise de RMSE');
  assert.ok(box[1]+box[3]<228, `corta antes do crédito: ${box}`);
  assert.ok(box[1]+box[3]>=225, `a última linha da tabela fica: ${box}`);
  assert.ok(creditLineStart('Source: authors (2024)') && creditLineStart('Fonte : IBGE') && !creditLineStart('Fontes de dados abertos'));
});

test('snapToImages: a caixa da visão cai sobre a imagem embutida e o recorte vira a imagem exata',()=>{
  const img=[[95,220,900,441],[95,587,919,803]];
  // a visão marcou só o painel esquerdo de uma figura de dois painéis exportada como uma imagem: vale a figura toda
  assert.deepEqual(snapToImages([106,248,389,192],img),[95,220,805,221]);
  // caixa frouxa, pegando a legenda de cima e o "Fonte" de baixo: a imagem manda
  assert.deepEqual(snapToImages([90,200,820,270],img),[95,220,805,221]);
  // dois painéis que são duas imagens separadas: a união
  assert.deepEqual(snapToImages([90,200,500,300],[[95,220,330,400],[340,220,580,400]]),[95,220,485,180]);
  // logo pequeno dentro de um gráfico vetorial não vira "a figura"; sem imagem, null (vale a camada de texto)
  assert.equal(snapToImages([100,300,800,400],[[150,320,190,350]]),null);
  assert.equal(snapToImages([100,300,800,400],[]),null);
  // página escaneada (uma imagem do tamanho da página) não é régua
  assert.equal(snapToImages([100,300,800,400],[[0,0,1000,1000]]),null);
  // prancha enorme de painéis: fica a caixa, aparada pela imagem
  const big=snapToImages([120,120,300,300],[[50,50,800,800]]);
  assert.ok(big[0]>=50&&big[0]<120&&big[2]<400, `painel da prancha: ${big}`);
});

test('clearCaptionEdges: legenda grudada na imagem (pernas das letras dentro da caixa) e crédito embaixo saem da borda',()=>{
  // caso real (Rev. Bras. Cartogr., Figura 5): a imagem começa em 752 e a legenda termina em 755
  const box=clearCaptionEdges([95,752,806,107],[
    {text:'Figura 5 – Filtragem da nuvem de pontos (continua).',left:322,top:741,right:678,bottom:755},
    {text:'a) Nuvem Bruta',left:258,top:760,right:345,bottom:769},
    {text:'Fonte: Os autores (2024).',left:412,top:852,right:588,bottom:866},
  ]);
  assert.ok(box[1]>=755, `topo depois da legenda: ${box}`);
  assert.ok(box[1]<760, `rótulo do painel continua: ${box}`);
  assert.ok(box[1]+box[3]<=852, `base antes do crédito: ${box}`);
  // nada de legenda na borda: a caixa fica igual
  assert.deepEqual(clearCaptionEdges([95,220,805,221],[{text:'c) Volume Real linha 1',left:150,top:224,right:420,bottom:233}]),[95,220,805,221]);
});

test('equationBox: equação escrita como texto sai pela camada de texto (inteira, sem a vizinha, a prosa e o número)',()=>{
  // Pearson do paper de eucalipto (Eq. 6): numerador, traço, denominador com raiz; "(6)" na margem; prosa abaixo
  const f=(text,left,base,h,width)=>({text,left,right:left+width,top:base-h,bottom:base});
  const page=[
    f('𝑟 =',254,384.4,13.1,28), f('∑',340,373.9,13.1,12), f('(𝑉𝑝𝑟𝑒𝑑𝑖𝑡𝑜',376,374.6,13.1,80), f('𝑖',457,377.1,9.5,6),
    f('− 𝑉𝑝𝑟𝑒𝑑𝑖𝑡𝑜)(𝑉𝑟𝑒𝑎𝑙',467,374.4,13.1,150), f('− 𝑉𝑟𝑒𝑎𝑙)',632,374.4,13.1,60), f('𝑖=1',353,377.7,9.5,15),
    f('√(∑',287,402.4,13.1,40), f('(𝑉𝑝𝑟𝑒𝑑𝑖𝑡𝑜',346,403.5,13.1,80), f('− 𝑉𝑝𝑟𝑒𝑑𝑖𝑡𝑜)',437,403.4,13.1,95), f('2',538,393.8,9.5,6),
    f(') (∑',547,403.4,13.1,40), f('(𝑉𝑟𝑒𝑎𝑙',603,403.5,13.1,55), f('− 𝑉𝑟𝑒𝑎𝑙)',667,403.4,13.1,60), f(')',749,403.4,13.1,5),
    f('(6)',892,384.6,11.8,20),
    f('em que Vpredito é o volume calculado pela nuvem de pontos e o volume em m²',95,440,13,800),
    // a equação de cima (Eq. 5), separada por mais de uma linha
    f('𝑅𝑀𝑆𝐸% =',334,300,13,60), f('∑',440,290,13,12),
  ];
  for (const vision of [[319,379,425,31],[300,420,400,30]]) { // só o denominador; e logo abaixo da equação
    const [x,y,w,h]=equationBox(vision,page);
    assert.ok(x<=254 && x+w>=754, `largura da equação inteira (do "r =" ao último parêntese): ${[x,y,w,h]}`);
    assert.ok(y<=361 && y>=340, `topo no numerador, sem a Eq. 5: ${[x,y,w,h]}`);
    assert.ok(y+h>=403 && y+h<427, `base no denominador, sem a prosa: ${[x,y,w,h]}`);
    assert.ok(x+w<892, `sem o número (6): ${[x,y,w,h]}`);
  }
  // sem texto matemático (equação que é imagem): null, e quem decide é a régua da imagem
  assert.equal(equationBox([100,100,200,50],[{text:'Texto comum do artigo sobre a bacia',left:100,top:110,right:400,bottom:122}]),null);
  // prosa com km² não vira equação
  assert.equal(equationBox([100,100,200,50],[{text:'área de 71 km² com densidade alta',left:100,top:110,right:400,bottom:122}]),null);
});

test('PDF: a visão relê cada equação no recorte; releitura que encolhe não vale; o número sai; o prompt não leva o recorte', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-pdf-eq-'));
  try {
    const page = await browser.newPage();
    await page.setContent('<p>Texto.</p><p style="font-size:28px">E = mc²</p><p style="font-size:28px">F = ma</p>');
    const bytes = await page.pdf();
    const seen = [];
    const r = await extractDocumentVisuals('paper.pdf', bytes, dir, {
      inspect: async () => ({ complete: true, items: [
        { kind: 'equation', caption: 'Eq. 1', latex: 'E = m c^{2} \\quad (1)', bounds: { left: 30, top: 40, right: 400, bottom: 90 } },
        { kind: 'equation', caption: 'Eq. 2', latex: 'F = m \\cdot a \\cdot \\text{(lida na página)}', bounds: { left: 30, top: 90, right: 400, bottom: 140 } },
      ] }),
      transcribe: async (image, { hint }) => { seen.push({ image: /^data:image\//.test(image), hint }); return /E = /.test(hint) ? 'E = mc^2' : 'F'; },
    });
    assert.equal(seen.length, 2, 'cada equação relida no próprio recorte');
    assert.ok(seen.every(s => s.image && s.hint));
    const [e1, e2] = r.items;
    assert.equal(e1.latex, 'E = mc^2'); assert.equal(e1.latexFrom, 'recorte');
    assert.match(e2.latex, /lida na página/, 'releitura bem mais curta (recorte parcial) não troca a leitura da página');
    assert.doesNotMatch(e2.latex, /\\quad \(\d\)/);
    const block = materialsBlock([{ name: 'paper.pdf', text: 'x', inventory: r }]);
    assert.doesNotMatch(block, /"image":"[^"]*equation/, 'equação com LaTeX vai sem o arquivo do recorte');
    assert.match(block, /E = mc\^2/);
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('assignEquations: caixas da visão deslocadas uma equação para baixo; o número impresso casa cada uma (e acha a esquecida)',()=>{
  // página 8 do paper de eucalipto: Eq. 4 (RMSE), 5 (RMSE%), 6 (Pearson), cada uma com "(n)" na margem; e uma (7) que a visão não listou
  const f=(text,left,top,right,bottom)=>({text,left,top,right,bottom});
  const page=[
    f('𝑅𝑀𝑆𝐸 = √',356,208,440,221), f('∑ (𝑉𝑝𝑟𝑒𝑑𝑖𝑡𝑜 − 𝑉𝑟𝑒𝑎𝑙)²',444,198,660,212), f('𝑛',540,218,552,230), f('(4)',892,215,912,227),
    f('𝑅𝑀𝑆𝐸% =',334,280,420,293), f('∑ 𝑉𝑟𝑒𝑎𝑙',430,295,520,309), f('(5)',892,284,912,297),
    f('𝑟 =',254,371,282,384), f('∑ (𝑉𝑝𝑟𝑒𝑑𝑖𝑡𝑜 − 𝑉̅𝑝𝑟𝑒𝑑𝑖𝑡𝑜)',340,361,640,375), f('𝑖=1',353,368,368,378), f('2',538,384,544,394), f('√(∑ (𝑉𝑝𝑟𝑒𝑑𝑖𝑡𝑜 − 𝑉̅𝑝𝑟𝑒𝑑𝑖𝑡𝑜)²)',287,389,760,403), f('(6)',892,373,912,385),
    f('𝐶𝑉 = 𝜎/𝜇',400,480,470,493), f('(7)',892,480,912,493),
    f('em que Vpredito é o volume calculado pela nuvem de pontos',95,430,900,443),
  ];
  const items=[
    {kind:'equation',caption:'Eq. (4) RMSE',latex:'RMSE = \\sqrt{\\frac{\\sum (Vpredito_i - Vreal_i)^2}{n}}',box:[332,282,271,56]},
    {kind:'equation',caption:'Eq. (5) RMSE%',latex:'RMSE\\% = \\frac{...}{\\sum Vreal_i}',box:[250,367,512,44]},
    {kind:'equation',caption:'Correlação de Pearson',latex:'r = \\frac{\\sum (Vpredito_i - \\bar{V}predito)}{\\sqrt{\\sum (Vpredito_i - \\bar{V}predito)^2}}',box:[570,427,53,22]},
  ];
  const got=assignEquations(items,page);
  const top=(it)=>Math.round(got.get(it)?.[1]);
  assert.ok(top(items[0])<208 && top(items[0])>190, `Eq. 4 na RMSE: ${got.get(items[0])}`);
  assert.ok(top(items[1])<280 && top(items[1])>265, `Eq. 5 na RMSE%: ${got.get(items[1])}`);
  assert.ok(top(items[2])<361 && top(items[2])>345, `Pearson pelo conteúdo (sem número na legenda): ${got.get(items[2])}`);
  assert.deepEqual(got.missed.map(m=>m.caption),['Equação (7)'],'a numerada que a visão não listou entra');
  assert.ok(formulaSimilarity('RMSE = \\sqrt{x}', '𝑅𝑀𝑆𝐸 = √ 𝑥'.normalize('NFKC'))>0.6);
});

test('legenda de verdade × frase que cita a figura ("Figure 5 shows…" não cobra arte na página)',()=>{
  assert.ok(captionLineStrict('Figure 5: Flood susceptibility maps') && captionLineStrict('Figura 1 – Mapa') && captionLineStrict('Figura 1. Mapa') && captionLineStrict('Tabela 2 - RMSE'));
  assert.ok(!captionLineStrict('Figure 5 shows the flood susceptibility maps') && !captionLineStrict('Figura 2 apresenta o fluxo'));
  const orphans=orphanCaptions({items:[]},[{text:'Figure 5 shows the flood susceptibility maps generated by the models',left:100,top:300,right:900,bottom:312}]);
  assert.deepEqual(orphans,[]);
});

test('PDF: tabela sem rows é relida no recorte; com rows, a reconstrução nativa conta na cobertura', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-pdf-tab-'));
  try {
    const page = await browser.newPage();
    await page.setContent('<p>Table 1: Statistic index</p><table border="1"><tr><td>Model</td><td>NSE</td></tr><tr><td>HYMOD</td><td>0.96</td></tr><tr><td>HEC-HMS</td><td>0.90</td></tr></table>');
    const bytes = await page.pdf();
    let reads = 0;
    const r = await extractDocumentVisuals('paper.pdf', bytes, dir, {
      inspect: async () => ({ complete: true, items: [{ kind: 'table', caption: 'Table 1: Statistic index', bounds: { left: 30, top: 50, right: 500, bottom: 200 } }] }),
      readTable: async (image) => { reads++; assert.match(image, /^data:image\//); return [['Model', 'NSE'], ['HYMOD', '0.96'], ['HEC-HMS', '0.90']]; },
    });
    assert.equal(reads, 1);
    assert.deepEqual(r.items[0].rows[1], ['HYMOD', '0.96']);
    assert.equal(r.items[0].rowsFrom, 'recorte');
    const deck = { slides: [{ layout: 'table', title: 'Desempenho', head: ['Modelo', 'NSE'], rows: [['HYMOD', '0.96'], ['HEC-HMS', '0.90']] }] };
    assert.deepEqual(uncoveredVisuals(deck, [{ inventory: r }]), [], 'a tabela nativa com os mesmos números cobre a do paper');
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('PDF: item com caixa inválida sai sozinho; os outros recortes da página continuam', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-pdf-invalido-'));
  try {
    const page = await browser.newPage();
    await page.setContent('<h1>Resultados</h1><svg width="300" height="100"><path d="M0 90L300 10" stroke="black"/></svg>');
    const bytes = await page.pdf();
    const r = await extractDocumentVisuals('paper.pdf', bytes, dir, { inspect: async () => ({ complete: true, items: [
      { kind: 'chart', caption: 'Figura 1 – Gráfico', bounds: { left: 50, top: 300, right: 950, bottom: 700 } },
      { kind: 'table', caption: 'Tabela 3', bounds: { left: 500, top: 100, right: 200, bottom: 600 } },
    ] }) });
    assert.deepEqual(r.items.map(i => i.kind), ['chart'], 'o gráfico fica; a página inteira não substitui tudo');
    assert.match(r.warnings.join(' '), /descartado/);
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sourcePixels: o tamanho nativo da maior imagem dentro do recorte (o fluxograma de 960 px fica borrado no slide)',()=>{
  const imgs=[[142,650,858,925,960,540],[860,57,923,107,114,130]];
  assert.deepEqual(sourcePixels([142,650,716,275],imgs),{w:960,h:540});
  assert.equal(sourcePixels([100,100,300,300],imgs),null);
});

test('mergeDuplicateCrops: dois itens no mesmo recorte viram um, com a legenda numerada',()=>{
  const out=mergeDuplicateCrops([
    {kind:'figure',caption:'figure — página 4',box:[95,112,810,413]},
    {kind:'figure',caption:'Figura 1. Mapa de localização da bacia',box:[95,112,810,413]},
    {kind:'table',caption:'Tabela 1',box:[95,600,810,200]},
  ]);
  assert.equal(out.length,2);
  assert.match(out[0].caption,/^Figura 1/);
  assert.equal(out[1].kind,'table');
  // figuras diferentes na mesma página continuam separadas
  assert.equal(mergeDuplicateCrops([{kind:'chart',caption:'Figura 8',box:[95,220,805,221]},{kind:'chart',caption:'Figura 9',box:[95,587,824,216]}]).length,2);
});

test('uncoveredVisuals: lista figura/tabela numerada sem slide (tabela reconstruída pelos números conta)',()=>{
  const doc={name:'paper.pdf',inventory:{items:[
    {id:'a',kind:'figure',page:3,caption:'Figura 1 – Mapa',image:'contexto/visuais/x/a.png'},
    {id:'b',kind:'figure',page:3,caption:'Figura 2 – Fluxograma',image:'contexto/visuais/x/b.png'},
    {id:'c',kind:'table',page:10,caption:'Tabela 1 – RMSE',image:'contexto/visuais/x/c.png',rows:[['Estatística','Linha 1'],['RMSE','0,03162'],['RMSE%','37,6692%']]},
    {id:'d',kind:'table',page:11,caption:'Tabela 2 – Diâmetro',image:'contexto/visuais/x/d.png',rows:[['Seção','RMSE'],['0,5 m','0,834'],['1,0 m','0,798']]},
    {id:'e',kind:'equation',page:5,caption:'Eq. 1',latex:'d=c/\pi'},
    {id:'f',kind:'figure',page:14,caption:'Foto do autor',image:'contexto/visuais/x/f.png'},
  ]}};
  const spec={slides:[
    {layout:'split',figure:{image:'contexto\\visuais\\x\\a.png'}},
    {layout:'chart',chart:{chart:'bar',data:[{label:'Linha 1',value:'0,03162'},{label:'RMSE%',value:'37,6692%'}]}},
  ]};
  const missing=uncoveredVisuals(spec,[doc]);
  assert.deepEqual(missing.map(m=>m.id),['b','d']);
});

test('proseSuspect: caixa cheia de prosa é suspeita; arte com legenda, não',()=>{  const prose=[
    {text:'linha um de prosa corrida aqui',left:100,top:500,right:900,bottom:520},
    {text:'linha dois de prosa corrida aqui',left:100,top:525,right:900,bottom:545},
    {text:'linha três de prosa corrida aqui',left:100,top:550,right:900,bottom:570},
    {text:'linha quatro de prosa corrida',left:100,top:575,right:900,bottom:596},
  ];
  assert.ok(proseSuspect([100,490,800,120],prose), 'prosa densa é suspeita');
  const arte=[
    {text:'Flow (m³/s)',left:40,top:400,right:95,bottom:560},
    {text:'Figure 2: mapa da bacia',left:100,top:700,right:700,bottom:720},
  ];
  assert.ok(!proseSuspect([100,200,700,400],arte), 'arte com legenda não é suspeita');
  assert.ok(!proseSuspect([100,200,700,400],[]), 'vazio não é suspeito');
});

test('orphanCaptions: legenda sem item que a cubra (inclui "Quadro")',()=>{  const boxes=[
    {text:'Figura 1 - A: Localização da região',left:100,top:600,right:900,bottom:620},
    {text:'como mostra a Figura 1, os viveiros',left:100,top:300,right:900,bottom:320},
    {text:'Quadro 1 - Ingredientes da ração',left:100,top:800,right:900,bottom:820},
  ];
  const inv={items:[{caption:'Tabela 1 - Mann-Whitney'}]};
  const orphans=orphanCaptions(inv,boxes);
  assert.deepEqual(orphans.map(o=>o.n),['1'], `Figura 1 órfã; menção em prosa não conta; Tabela 1 coberta: ${JSON.stringify(orphans)}`);
  const inv2={items:[{caption:'Figura 1 - mapa'},{caption:'Quadro 1 - ingredientes'}]};
  assert.deepEqual(orphanCaptions(inv2,boxes),[],'tudo coberto, nada órfão');
});

test('isBlankCrop: quase-branco grande é suspeito; com tinta ou pequeno, não',()=>{
  assert.ok(isBlankCrop(0.01,[100,100,800,400]),'legenda + papel = suspeito');
  assert.ok(!isBlankCrop(0.06,[100,100,800,400]),'mapa claro passa');
  assert.ok(!isBlankCrop(0.01,[100,100,10,10]),'miniatura não conta');
  assert.ok(!isBlankCrop(undefined,[100,100,800,400]),'sem medida não acusa');
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

test('PDF: caixa de figura em cima de prosa pede localização de novo (retry com dica)', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-pdf-retry-'));
  try {
    const page = await browser.newPage();
    const prose = Array.from({ length: 20 }, (_, i) => `<p>Parágrafo ${i + 1} de prosa corrida para encher a metade de cima da página com palavras e mais palavras.</p>`).join('');
    await page.setContent(`<h1>Estudo</h1>${prose}<svg width="400" height="200"><rect x="10" y="10" width="380" height="180" fill="none" stroke="black"/></svg>`);
    const bytes = await page.pdf();
    const material = { name: 'paper.pdf', text: 'Estudo', detail: 'pdf', bytes };
    const calls = [];
    const inspect = async (image, n, opts) => {
      calls.push(opts?.hint || null);
      if (calls.length === 1) return { complete: true, items: [{ kind: 'figure', caption: 'Figura 1: desenho', bounds: { left: 50, top: 50, right: 950, bottom: 450 } }] };
      return { complete: true, items: [{ kind: 'figure', caption: 'Figura 1: desenho', bounds: { left: 50, top: 800, right: 950, bottom: 950 } }] };
    };
    const docs = await prepareDocumentMaterials([material], dir, { inspect });
    assert.equal(calls.length, 2, 'pediu de novo após caixa suspeita');
    assert.match(calls[1] || '', /texto corrido/, 'dica menciona o problema');
    const final = docs[0].inventory.items[0].box;
    assert.ok(final[0] >= 30 && final[0] <= 50 && final[1] >= 770 && final[1] <= 800, `valeu a segunda localização: ${final}`);
    assert.ok(fs.existsSync(path.join(dir, docs[0].inventory.items[0].image)));
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('PDF: figura raster sai pela imagem embutida (sem legenda nem "Fonte", proporção exata) e os painéis não duplicam', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-pdf-snap-'));
  try {
    const page = await browser.newPage();
    // a "arte": PNG 2:1 com duas metades (dois painéis numa imagem só, como o mapa duplo do paper)
    await page.setViewportSize({ width: 600, height: 300 });
    await page.setContent('<body style="margin:0;display:flex"><div style="width:300px;height:300px;background:#2a7"></div><div style="width:300px;height:300px;background:#27a"></div></body>');
    const png = (await page.screenshot()).toString('base64');
    await page.setContent(`<body style="font:16px serif;margin:40px">
      <p>Parágrafo anterior do artigo, com texto corrido que não pertence à figura e segue até o fim da linha.</p>
      <p style="text-align:center">Figura 1 – Mapa da área de localização.</p>
      <div style="text-align:center"><img src="data:image/png;base64,${png}" style="width:500px;height:250px"></div>
      <p style="text-align:center">Fonte: Os autores (2024).</p>
      <p>A realização dos levantamentos de campo ocorreu em condições climáticas que influenciaram a qualidade dos dados.</p></body>`);
    const bytes = await page.pdf({ format: 'A4' });
    // a visão erra como no caso real: caixa frouxa (pega legenda e "Fonte") e um segundo item só sobre o painel direito
    const inspect = async () => ({ complete: true, items: [
      { kind: 'figure', caption: 'Figura 1 – Mapa da área de localização.', bounds: { left: 80, top: 60, right: 920, bottom: 330 } },
      { kind: 'figure', caption: 'Mapa da área de estudo (sem legenda visível)', bounds: { left: 500, top: 100, right: 880, bottom: 290 } },
    ] });
    const r = await extractDocumentVisuals('paper.pdf', bytes, dir, { inspect });
    assert.equal(r.items.length, 1, `os dois painéis viram uma figura só: ${JSON.stringify(r.items.map(i => i.caption))}`);
    const item = r.items[0];
    assert.match(item.caption, /^Figura 1/, 'fica a legenda numerada');
    assert.equal(item.sourcePx, '600×300', 'tamanho nativo da imagem embutida, para a IA julgar a qualidade');
    assert.ok(Math.abs(item.width / item.height - 2) < 0.04, `proporção da imagem original (2:1), sem legenda nem crédito: ${item.width}×${item.height}`);
    // o recorte começa na arte: a primeira linha tem a cor do painel, não papel nem texto
    const shot = await browser.newPage();
    await shot.setContent(`<img id="i" src="data:image/png;base64,${fs.readFileSync(path.join(dir, item.image)).toString('base64')}">`);
    const corner = await shot.evaluate(async () => { const i = document.getElementById('i'); await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return [...g.getImageData(Math.round(c.width * 0.25), 2, 1, 1).data].slice(0, 3); });
    assert.ok(corner[1] > corner[0] + 40, `topo do recorte já é a arte verde: ${corner}`);
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('PDF: resposta inválida da visão tenta de novo uma vez (sem travar em fallback)', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-pdf-retry2-'));
  try {
    const page = await browser.newPage();
    await page.setContent('<h1>Resultados</h1><svg width="300" height="100"><path d="M0 90L300 10" stroke="black"/></svg>');
    const bytes = await page.pdf();
    const material = { name: 'paper.pdf', text: 'Resultados', detail: 'pdf', bytes };
    let calls = 0;
    const inspect = async () => {
      calls++;
      if (calls === 1) throw Error('Inventário inválido (término informado pelo provedor: stop).');
      return { complete: true, items: [{ kind: 'figure', caption: 'Gráfico', bounds: { left: 50, top: 300, right: 950, bottom: 700 } }] };
    };
    const docs = await prepareDocumentMaterials([material], dir, { inspect });
    assert.equal(calls, 2, 'tentou de novo após erro transitório');
    assert.equal(docs[0].inventory.items.length, 1, 'valeu a segunda leitura');
    assert.ok(fs.existsSync(path.join(dir, docs[0].inventory.items[0].image)));
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
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
    // decisão de pesquisa do chat (fase 2): o anexo é fonte exclusiva, sem autorização externa — não pesquisa
    if (!/INVENTÁRIO VISUAL/.test(req.lastUser)) return '{"pesquisar": false, "motivo": "anexo é fonte exclusiva"}';
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


test('Studio: criar a apresentação do paper pelo chat confere a cobertura (figura esquecida volta para a IA) e o deck salvo tem as duas', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml','<w:document><w:body><w:p><w:r><w:t>Resultados</w:t><a:blip r:embed="a"/><a:blip r:embed="b"/></w:r></w:p></w:body></w:document>');
  zip.file('word/_rels/document.xml.rels','<Relationships><Relationship Id="a" Target="media/a.svg"/><Relationship Id="b" Target="media/b.svg"/></Relationships>');
  zip.file('word/media/a.svg','<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');
  zip.file('word/media/b.svg','<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>');
  const bytes = await zip.generateAsync({type:'nodebuffer'});
  const asks = [];
  const deck = tempDeck(), llm = await startMockLLM(req => {
    if (!/INVENTÁRIO VISUAL/.test(req.lastUser)) return '{"pesquisar": false, "motivo": "anexo é fonte exclusiva"}';
    const inventory = JSON.parse(req.lastUser.match(/INVENTÁRIO VISUAL[^\n]*\n([^\n]+)/)[1]);
    const [a, b] = inventory.items.map(i => JSON.stringify(i.image));
    if (/Releia a figura 1/.test(req.lastUser)) return '```yaml\nslides:\n  3:\n    body: "Leitura revisada."\n```';
    if (/Conferência de cobertura/.test(req.lastUser)) { asks.push(req.lastUser); return '```yaml\ninsert:\n  - after: 3\n    slide: { layout: split, title: Segundo resultado, body: "Leitura do segundo resultado.", figure: { image: '+b+', fit: contain } }\n```'; }
    return '```yaml\nslides:\n  - { layout: cover, title: Paper }\n  - { layout: split, title: Contexto, body: "Problema." }\n  - { layout: split, title: Primeiro resultado, body: "Leitura.", figure: { image: '+a+', fit: contain } }\n  - { layout: list, title: Conclusões, items: [Um, Dois] }\n  - { layout: end, title: Obrigado }\n```';
  }), studio = await startStudio(deck.file,{llmUrl:llm.url});
  const call = async (route,body) => (await fetch(studio.url+route,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined})).json();
  try {
    const attached = await call('/api/ai/context',{name:'paper.docx',dataUrl:'data:application/octet-stream;base64,'+bytes.toString('base64')});
    const current = await call('/api/deck');
    const result = await call('/api/ai/chat',{message:'Monte a apresentação de congresso deste paper',spec:current.spec,attachments:[{type:'doc',id:attached.id}]});
    assert.equal(result.error,undefined);
    assert.equal(asks.length,1,'uma conferência de cobertura');
    assert.match(asks[0],/Figura 2/);
    const saved = (await call('/api/deck')).spec.slides.map(s => s.figure?.image).filter(Boolean);
    assert.equal(saved.length,2,`as duas figuras no deck salvo: ${saved}`);
    // pedido pontual com o anexo (mexe num slide só): sem conferência
    await call('/api/ai/chat',{message:'Releia a figura 1',spec:(await call('/api/deck')).spec,attachments:[{type:'doc',id:attached.id}]});
    assert.equal(asks.length,1,'pedido pontual não dispara a cobertura');
  } finally {await studio.close();await llm.close();deck.cleanup();}
});

test('Studio: o chat pede para VER o material (ver: página/recorte) e responde já vendo; caminho fora da pasta é recusado', async () => {
  const zip = new JSZip();
  zip.file('word/document.xml','<w:document><w:body><w:p><w:r><w:t>Resultados</w:t><a:blip r:embed="a"/></w:r></w:p></w:body></w:document>');
  zip.file('word/_rels/document.xml.rels','<Relationships><Relationship Id="a" Target="media/a.png"/></Relationships>');
  zip.file('word/media/a.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));
  const bytes = await zip.generateAsync({type:'nodebuffer'});
  const asked = [];
  const deck = tempDeck(), llm = await startMockLLM(req => {
    if (/Decida se o que você JÁ SABE basta/.test(req.lastUser)) return '{"pesquisar": false, "motivo": "pergunta sobre o anexo", "academico": false, "buscas": []}';
    asked.push(req);
    if (asked.length === 1) {
      const inventory = JSON.parse(req.lastUser.match(/INVENTÁRIO VISUAL[^\n]*\n([^\n]+)/)[1]);
      return 'Vou olhar a figura antes de responder.\n```yaml\nver: [' + JSON.stringify(inventory.items[0].image) + ', "../../fora.png"]\n```';
    }
    return 'Vi a figura: é um quadrado preto, sem rótulos.';
  }), studio = await startStudio(deck.file,{llmUrl:llm.url});
  const call = async (route,body) => (await fetch(studio.url+route,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined})).json();
  try {
    fs.writeFileSync(path.join(path.dirname(deck.dir), 'fora.png'), 'x');
    const attached = await call('/api/ai/context',{name:'paper.docx',dataUrl:'data:application/octet-stream;base64,'+bytes.toString('base64')});
    const current = await call('/api/deck');
    const result = await call('/api/ai/chat',{message:'O que a figura 1 mostra?',spec:current.spec,attachments:[{type:'doc',id:attached.id}]});
    assert.equal(result.error, undefined);
    assert.equal(asked.length, 2, 'pediu para ver e foi chamada de novo com as imagens');
    assert.match(asked[0].system, /VER O MATERIAL ANEXADO/);
    const images = (asked[1].messages.at(-1).content || []).filter(p => p.type === 'image_url');
    assert.equal(images.length, 1, 'só a imagem do material; o arquivo fora da pasta não foi');
    assert.match(JSON.stringify(asked[1].messages.at(-1).content), /material: contexto\/visuais\//);
    assert.match(asked[1].lastUser, /Não encontrei: \.\.\/\.\.\/fora\.png/);
    assert.match(result.reply, /Vi a figura/);
    assert.ok(result.actions.some(a => /Olhei no material: contexto\/visuais\//.test(a)));
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
