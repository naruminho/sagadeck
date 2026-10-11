import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { startStudio, tempDeck, readPptx, browserOrSkip } from './helpers.js';
import { createExportJobs } from '../src/studio/export-jobs.js';

test('exportação continua sem a página aberta, informa progresso e guarda o arquivo para baixar', { timeout: 90000 }, async t => {
  const browser = await browserOrSkip(t); if (!browser) return; await browser.close();
  const deck = tempDeck();
  fs.writeFileSync(deck.file, YAML.stringify({ title: 'Exportação acompanhada', theme: 'bauhaus', slides: [
    { layout: 'cover', title: 'Exportação acompanhada', notes: 'Nota preservada' },
    { layout: 'statement', text: 'Segundo slide' },
  ] }));
  const studio = await startStudio(deck.file);
  try {
    const create = await fetch(studio.url + '/api/export/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'pptx' }) });
    assert.equal(create.status, 202);
    const { job } = await create.json();
    assert.equal(job.status, 'queued');
    assert.equal(job.progress.total, 2);
    const states = [];
    let current;
    for (let i = 0; i < 300; i++) {
      const list = await (await fetch(studio.url + '/api/export/jobs')).json();
      current = list.jobs.find(j => j.id === job.id);
      assert.ok(current, 'o servidor mantém a geração depois de responder ao pedido');
      states.push(current.progress.phase);
      if (['ready', 'failed'].includes(current.status)) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(current.status, 'ready', JSON.stringify(current));
    assert.ok(states.some(s => ['opening', 'slides', 'packing'].includes(s)), states.join(','));
    assert.equal(current.progress.completed, 2);
    const res = await fetch(studio.url + '/api/export/jobs/' + job.id + '/download');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /\.pptx/);
    const file = path.join(deck.dir, 'resultado.pptx');
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const saved = await readPptx(fs.readFileSync(file));
    assert.equal(saved.slides.length, 2);
    assert.match(saved.slides[1], /Segundo slide/);
    assert.match(saved.notes, /Nota preservada/);
    assert.equal((await fetch(studio.url + '/api/export/jobs/' + job.id + '/download')).status, 200, 'pode baixar novamente');
  } finally { await studio.close(); deck.cleanup(); }
});

test('fila de exportação: isola pessoas, reaproveita pedido em andamento e comunica falha e expiração', async () => {
  let finish, clock = Date.now();
  const done = new Promise(resolve => { finish = resolve; });
  const spec = { title: 'Teste', slides: [{ layout: 'cover', title: 'Teste' }] };
  const manager = createExportJobs({ now: () => clock, ttl: 100, generate: async (kind, spec, name, { onProgress }) => {
    onProgress({ phase: 'slides', completed: 0, total: 1, slide: 1 });
    await done;
    if (name === 'falhar') throw new Error('Falha de exportação testada');
    return { body: Buffer.from('arquivo de teste'), file: 'teste.pptx', mime: 'application/test', warnings: ['Aviso preservado'] };
  } });
  const response = () => ({ code: null, body: '', writeHead(code) { this.code = code; }, end(body) { this.body = body; } });
  try {
    const a = manager.create('ana', 'pptx', spec, 'teste');
    assert.equal(manager.create('ana', 'pptx', spec, 'teste').id, a.id, 'dois cliques não duplicam a geração');
    const b = manager.create('bia', 'pptx', spec, 'falhar');
    assert.deepEqual(manager.list('ana').map(j => j.id), [a.id]);
    let res = response(); manager.download('bia', a.id, res); assert.equal(res.code, 404);
    res = response(); manager.download('ana', a.id, res); assert.equal(res.code, 409);
    finish();
    for (let i = 0; i < 100 && !manager.list('bia')[0]?.finishedAt; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(manager.list('ana')[0].status, 'ready');
    assert.deepEqual(manager.list('ana')[0].warnings, ['Aviso preservado']);
    assert.equal(manager.list('bia')[0].status, 'failed');
    assert.match(manager.list('bia')[0].error, /Falha de exportação testada/);
    res = response(); manager.download('bia', b.id, res); assert.equal(res.code, 409); assert.match(res.body, /Falha/);
    clock += 101;
    assert.equal(manager.list('ana').length, 0);
    res = response(); manager.download('ana', a.id, res); assert.equal(res.code, 404);
  } finally { finish(); await manager.close(); }
});

test('API de exportações exige a mesma pessoa no status e no download', async () => {
  const studio = await startStudio(null, { multiuser: true });
  try {
    const headers = { 'X-Sagadeck-User': 'ana', 'Content-Type': 'application/json' };
    assert.equal((await fetch(studio.url + '/api/export/jobs')).status, 401);
    const created = await fetch(studio.url + '/api/export/jobs', { method: 'POST', headers, body: JSON.stringify({ kind: 'sagadeck' }) });
    assert.equal(created.status, 202); const { job } = await created.json();
    const list = await (await fetch(studio.url + '/api/export/jobs', { headers: { 'X-Sagadeck-User': 'bia' } })).json();
    assert.deepEqual(list.jobs, []);
    assert.equal((await fetch(studio.url + '/api/export/jobs/' + job.id + '/download', { headers: { 'X-Sagadeck-User': 'bia' } })).status, 404);
  } finally { await studio.close(); }
});
