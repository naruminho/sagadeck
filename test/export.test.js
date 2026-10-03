// Exportação: PowerPoint editável a partir do deck de teste (Chrome invisível + pptxgenjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import JSZip from "jszip";
import path from "node:path";
import { buildHTML, loadSpec } from "../src/build.js";
import { tempDeck, browserOrSkip, readPptx, startStudio } from "./helpers.js";

test("PowerPoint: um slide por slide, textos editáveis, notas e animações dos cliques", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t); // só para pular sem Chrome; a exportação abre o próprio
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = loadSpec(deck.file);
  const r = buildHTML(spec);
  const htmlFile = path.join(deck.dir, "deck.html"), out = path.join(deck.dir, "deck.pptx");
  fs.writeFileSync(htmlFile, r.html);
  const { exportPptx } = await import("../src/export/pptx.js");
  const { errors } = await exportPptx(htmlFile, out, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta } });
  assert.deepEqual(errors, []);
  const p = await readPptx(fs.readFileSync(out));
  assert.equal(p.slides.length, spec.slides.length);
  assert.ok(p.slides.some((s) => s.includes("Três pilares")), "título como texto editável (não imagem)");
  assert.match(p.notes, /Roteiro do slide dos pilares/, "notas do apresentador");
  assert.ok(p.animations > 0, "cliques viram animações");
  deck.cleanup();
});

const pdfPages = (buf) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

test("PDF: uma página por slide", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = loadSpec(deck.file);
  const htmlFile = path.join(deck.dir, "deck.html"), out = path.join(deck.dir, "deck.pdf");
  fs.writeFileSync(htmlFile, buildHTML(spec).html);
  const { pdf } = await import("../src/export/shots.js");
  await pdf(htmlFile, out);
  const buf = fs.readFileSync(out);
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.equal(pdfPages(buf), spec.slides.length);
  deck.cleanup();
});

test("roteiro: PDF com miniaturas e notas", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = loadSpec(deck.file);
  const r = buildHTML(spec);
  const htmlFile = path.join(deck.dir, "deck.html"), out = path.join(deck.dir, "roteiro.pdf");
  fs.writeFileSync(htmlFile, r.html);
  const { shots } = await import("../src/export/shots.js");
  const { roteiroPDF } = await import("../src/export/roteiro.js");
  const { files } = await shots(htmlFile, path.join(deck.dir, "mini"), { scale: 0.5, jpeg: true });
  assert.equal(files.length, spec.slides.length, "uma miniatura por slide");
  await roteiroPDF({ slidesMeta: r.slidesMeta, shotFiles: files, outFile: out, title: r.meta.title, author: r.meta.author, duration: spec.duration });
  const buf = fs.readFileSync(out);
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdfPages(buf) >= 1);
  assert.ok((buf.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length >= spec.slides.length, "as miniaturas estão no PDF");
  deck.cleanup();
});

// formas de um slide do .pptx: [{ cx, cy, fill }] em px da tela de 1920 (1 px = 6350 EMU)
async function shapesOf(file, n) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file(`ppt/slides/slide${n}.xml`).async("string");
  return [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => {
    const ext = m[0].match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    const fill = (m[0].match(/<p:spPr>[\s\S]*?<a:solidFill><a:srgbClr val="([0-9A-F]{6})"/) || [])[1];
    return ext ? { w: +ext[1] / 6350, h: +ext[2] / 6350, fill } : null;
  }).filter(Boolean);
}

test("PowerPoint: linhas desenhadas por CSS (pseudo-elementos e bordas de um lado só) aparecem", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = {
    title: "Linhas", theme: "bauhaus",
    // a linha do tempo NÃO é o 1º slide (fora da tela ao exportar) e tem cliques: era assim que a linha sumia
    slides: [
      { layout: "blocks", title: "Divisor", content: [{ body: "Texto com linha embaixo", style: "border-bottom:6px solid #cc0000;padding-bottom:12px" }] },
      { layout: "timeline", title: "Linha do tempo", build: true, events: [{ when: "2019", title: "A" }, { when: "2022", title: "B" }, { when: "2026", title: "C" }] },
    ],
  };
  const r = buildHTML(spec);
  const htmlFile = path.join(deck.dir, "l.html"), out = path.join(deck.dir, "l.pptx");
  fs.writeFileSync(htmlFile, r.html);
  const { exportPptx } = await import("../src/export/pptx.js");
  await exportPptx(htmlFile, out, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta } });
  const tl = await shapesOf(out, 2);
  assert.ok(tl.filter((s) => s.h <= 10 && s.w >= 60).length >= 2, `linha do tempo sem o traço entre os eventos: ${JSON.stringify(tl)}`);
  const dv = await shapesOf(out, 1);
  assert.ok(dv.some((s) => s.fill === "CC0000" && s.h <= 10 && s.w >= 100), `divisor (borda embaixo) sumiu: ${JSON.stringify(dv)}`);
  deck.cleanup();
});

test("PowerPoint: a tabela sai como tabela nativa, editável, com o texto e a cor do cabeçalho", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = { title: "Tabela", theme: "sinal", slides: [{ layout: "table", title: "Vazões", head: ["Ano", "Vazão (m³/s)"], rows: [["1984", "2.218,0"], ["1985", "1.980,5"]], highlight: { row: 1 } }] };
  const r = buildHTML(spec);
  const htmlFile = path.join(deck.dir, "t.html"), out = path.join(deck.dir, "t.pptx");
  fs.writeFileSync(htmlFile, r.html);
  const { exportPptx } = await import("../src/export/pptx.js");
  await exportPptx(htmlFile, out, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta } });
  const zip = await JSZip.loadAsync(fs.readFileSync(out));
  const xml = await zip.file("ppt/slides/slide1.xml").async("string");
  assert.match(xml, /<a:tbl>/, "tabela nativa");
  assert.equal((xml.match(/<a:tr /g) || []).length, 3, "cabeçalho + 2 linhas");
  for (const v of ["Ano", "Vazão (m³/s)", "2.218,0", "1.980,5"]) assert.ok(xml.includes(`<a:t>${v}</a:t>`), v);
  assert.match(xml, /<a:tcPr[^>]*>[\s\S]*?<a:solidFill><a:srgbClr val="[0-9A-F]{6}"/, "cabeçalho com cor");
  deck.cleanup();
});

test('exportação pequena: fórmulas inline inteiras, estados de saída e ocultação inicial', async t => {
  const b=await browserOrSkip(t);if(!b)return;await b.close();const d=tempDeck();
  try {
    const r=buildHTML({theme:'prata',slides:[{layout:'split',title:'Fórmula',body:'Tempo $t_c=57\\left(\\frac{L^3}{\\Delta h}\\right)^{0.385}$ e risco $1-(1-1/T)^n$.',figure:{icon:'cloud-rain'}},{layout:'canvas',elements:[{text:'Primeira etapa',x:100,y:100,w:600,h:120,step:1,exit:2},{text:'Segunda etapa',x:100,y:250,w:600,h:120,step:2}]}]});
    const file=path.join(d.dir,'mini.html'),out=path.join(d.dir,'mini.pptx');fs.writeFileSync(file,r.html);
    const {exportPptx}=await import('../src/export/pptx.js');await exportPptx(file,out,{theme:r.theme,meta:{...r.meta,slides:r.slidesMeta}});
    const zip=await JSZip.loadAsync(fs.readFileSync(out));const xml=await zip.file('ppt/slides/slide2.xml').async('string');
    assert.match(xml,/Primeira etapa/,'o elemento que sai no clique 2 deve existir no PPTX');
    assert.match(xml.split('<p:seq')[0],/style.visibility[\s\S]*?val="hidden"/,'as entradas têm ocultação inicial antes da sequência de cliques');
    const one=await zip.file('ppt/slides/slide1.xml').async('string');assert.ok((one.match(/<p:pic>/g)||[]).length>=2,'o parágrafo com as duas fórmulas e o ícone preservados como imagens');
    assert.doesNotMatch(one,/<a:t>Δ<\/a:t>/,'KaTeX não deve ser desmontado em glifos nativos');
  } finally {d.cleanup();}
});

test('exportação espera gráficos tardios antes de fotografar',async t=>{
  const b=await browserOrSkip(t);if(!b)return;await b.close();const d=tempDeck();
  try {
    const file=path.join(d.dir,'late.html');const r=buildHTML({slides:[{layout:'statement',text:'Inicial'}]});
    fs.writeFileSync(file,r.html.replace('</body>',`<script>window.SagaScienceReady=new Promise(resolve=>setTimeout(()=>{document.body.dataset.ready='sim';resolve()},650));</script></body>`));
    const {openDeck}=await import('../src/export/browser.js');const session=await openDeck(file);try{assert.equal(await session.page.getAttribute('body','data-ready'),'sim');}finally{await session.browser.close();}
  }finally{d.cleanup();}
});

test('exportação: preparação travada informa erro; widgets com fechamento de script não quebram HTML', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const d = tempDeck();
  try {
    fs.writeFileSync(path.join(d.dir, 'widget.js'), 'window.widgetText="</script>";');
    const r = buildHTML({_dir:d.dir, widgets:['widget.js'], slides:[{layout:'statement',text:'Teste'}]});
    const file = path.join(d.dir,'widget.html'); fs.writeFileSync(file,r.html);
    const page = await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file:///' + file.replace(/\\/g,'/'));
    assert.equal(await page.evaluate(()=>window.widgetText),'</script>');
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>{window.SagaScienceReady=new Promise(()=>{});});
    const {waitForResources}=await import('../src/export/browser.js');
    await assert.rejects(waitForResources(page,{timeout:100}),/Tempo excedido ao preparar/);
  } finally { await browser.close(); d.cleanup(); }
});

test('Studio: downloads pequenos têm formato válido e PDF contém as imagens de todas as páginas', async t => {
  const browser = await browserOrSkip(t); if(!browser)return; await browser.close();
  const d=tempDeck(); const studio=await startStudio(d.file);
  try {
    const spec={title:'Fórmulas',theme:'prata',slides:[
      {layout:'split',title:'Kirpich',body:'Tempo $t_c=57\\left(\\frac{L^3}{\\Delta h}\\right)^{0.385}$.',figure:{icon:'cloud-rain'}},
      {layout:'statement',text:'Probabilidade $P=1-(1-1/T)^n$'},
    ]};
    const saved=await fetch(studio.url+'/api/deck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spec})});
    assert.equal(saved.status,200);
    for(const kind of ['pptx','pdf']) {
      const response=await fetch(studio.url+'/api/export/'+kind);
      assert.equal(response.status,200); assert.match(response.headers.get('content-disposition'),new RegExp('\\.'+kind));
      const bytes=Buffer.from(await response.arrayBuffer());
      if(kind==='pptx') {const zip=await JSZip.loadAsync(bytes); assert.ok(zip.file('ppt/slides/slide2.xml'));}
      else {
        assert.equal(response.headers.get('content-type'),'application/pdf');
        const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
        const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
        try {const doc=await task.promise; assert.equal(doc.numPages,2);
          for(let i=1;i<=2;i++){const operators=await (await doc.getPage(i)).getOperatorList(); assert.ok(operators.fnArray.includes(OPS.paintImageXObject),'imagem do slide na página '+i);}
        }finally{await task.destroy();}
      }
    }
  } finally {await studio.close();d.cleanup();}
});

test('Studio: falha de gravação retorna 500, sem sucesso fictício nem arquivo temporário',async()=>{
  const d=tempDeck();const studio=await startStudio(d.file);
  try {
    fs.unlinkSync(d.file);fs.mkdirSync(d.file);
    const response=await fetch(studio.url+'/api/deck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({yaml:'title: Teste\nslides:\n  - layout: statement\n    text: Teste\n'})});
    assert.equal(response.status,500);assert.ok((await response.json()).error);
    assert.deepEqual(fs.readdirSync(d.dir),['deck.yaml']);
  }finally{await studio.close();d.cleanup();}
});
