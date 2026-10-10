import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import './isolate.js';
import { chromium } from 'playwright-core';
// O navegador é falso: findBrowser só precisa de um executável existente, inclusive sem Chrome na máquina.
process.env.SAGADECK_BROWSER = process.execPath;
const { diagramCheck, closeSnapshots } = await import('../src/studio/snapshot.js');

const spec = { title: 'Teste de encerramento', slides: [{ layout: 'statement', text: 'Teste' }] };
const page = () => ({
  async goto() {}, async waitForFunction() {}, async close() {},
  async evaluate() { return { errors: [], warnings: [] }; },
});
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

test('encerrar capturas espera o Chrome sair e um navegador antigo não apaga o novo', async t => {
  const closing = deferred();
  const first = new EventEmitter();
  first.newPage = async () => page();
  first.close = async () => { await closing.promise; first.emit('disconnected'); };
  const second = new EventEmitter();
  second.newPage = async () => page();
  second.close = async () => { second.emit('disconnected'); };
  let launches = 0;
  t.mock.method(chromium, 'launch', async () => ++launches === 1 ? first : second);
  let finished = false;
  let close;
  try {
    await diagramCheck(spec, [0]);
    close = closeSnapshots().then(() => { finished = true; });
    await new Promise(r => setImmediate(r));
    assert.equal(finished, false, 'closeSnapshots só termina depois de fechar o Chrome');
    await diagramCheck(spec, [0]);
    assert.equal(launches, 2, 'um pedido novo tem seu próprio navegador durante o encerramento');
    closing.resolve();
    await close;
    await diagramCheck(spec, [0]);
    assert.equal(launches, 2, 'disconnected do Chrome anterior preserva o navegador atual');
  } finally {
    closing.resolve();
    await close;
    await closeSnapshots();
  }
});
