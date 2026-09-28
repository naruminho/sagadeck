import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { demoDeck, demoAssets } from '../src/studio/demo-decks.js';
import { COLLECTION_NAMES, COLLECTION_STYLE } from '../src/studio/template-collections.js';
import { THEMES } from '../src/themes.js';
import { buildHTML } from '../src/build.js';
import { browserOrSkip, ROOT } from './helpers.js';

test('estilos das coleções: um por coleção, com tema válido e direção com dica de tema', () => {
  assert.deepEqual(Object.keys(COLLECTION_STYLE).sort(), Object.keys(COLLECTION_NAMES).sort());
  for (const [kind, s] of Object.entries(COLLECTION_STYLE)) {
    assert.ok(THEMES[s.theme], `${kind}: tema "${s.theme}" não existe`);
    assert.match(s.direction, /Considere \w+/, `${kind}: direção sem dica de tema`);
  }
});

test('coleções: fotos portáteis, texto editável e todos os slides renderizados', async t => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = path.join(process.env.SAGADECK_HOME, 'colecoes');
  fs.mkdirSync(path.join(dir, 'imagens'), { recursive: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    for (const kind of Object.keys(COLLECTION_NAMES)) {
      for (const asset of demoAssets(kind)) fs.copyFileSync(path.join(ROOT, 'src/studio/assets', asset), path.join(dir, 'imagens', asset));
      const spec = demoDeck(kind); spec._dir = dir;
      assert.ok(spec.slides.length >= 6);
      const built = buildHTML(spec);
      assert.ok(!built.warnings.some(w => /não encontrada/.test(w)), built.warnings.join('\n'));
      await p.setContent(built.html); await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(800);
      for (let i = 0; i < spec.slides.length; i++) {
        await p.evaluate(i => window.sagadeck.goto(i, 99, { instant: true }), i);
        await p.waitForTimeout(700);
        const transparentShapes = await p.evaluate(() => [...document.querySelectorAll('.slide.current .shape')].filter(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)').length);
        assert.equal(transparentShapes, 0, `${kind}/${i}: cores das formas resolvidas`);
        assert.ok(await p.locator('.slide.current .t').count() > 0, `${kind}/${i}: texto editável`);
        const bad = await p.evaluate(() => [...document.querySelectorAll('.slide.current img')].filter(img => !img.complete || !img.naturalWidth).length);
        assert.equal(bad, 0, `${kind}/${i}: imagem carregada`);
        const overflow = await p.evaluate(() => [...document.querySelectorAll('.slide.current .t')].filter(el => {
          const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect();
          return b.width > 0 && (b.bottom > 1080 || b.right > 1921 || b.left < -1 || b.top < -1);
        }).map(el => el.textContent));
        assert.deepEqual(overflow, [], `${kind}/${i}: texto dentro do slide`);
        if (process.env.SAGADECK_TEMPLATE_SHOTS) {
          fs.mkdirSync(path.join(ROOT, '.artifacts/templates'), { recursive: true });
          await p.screenshot({ path: path.join(ROOT, `.artifacts/templates/${kind}-${i + 1}.png`) });
        }
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
