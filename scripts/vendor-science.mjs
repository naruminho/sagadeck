// Recursos locais: HTML exportado funciona sem CDN e sem internet.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const out = new URL('../src/runtime/vendor/', import.meta.url);
fs.mkdirSync(out, {recursive:true});
const katex = path.dirname(require.resolve('katex/package.json'));
let css = fs.readFileSync(path.join(katex,'dist/katex.min.css'),'utf8');
css = css.replace(/url\(([^)]+)\)/g, (_,file) => {
  const p = file.replace(/["']/g,'');
  return `url(data:font/${p.endsWith('.woff2')?'woff2':p.endsWith('.woff')?'woff':'ttf'};base64,${fs.readFileSync(path.join(katex,'dist',p)).toString('base64')})`;
});
fs.writeFileSync(new URL('katex.css',out), css);
fs.copyFileSync(require.resolve('plotly.js-dist-min'),new URL('plotly.min.js',out));
fs.copyFileSync(path.join(katex,'LICENSE'),new URL('KATEX-LICENSE.txt',out));
fs.copyFileSync(path.join(path.dirname(require.resolve('plotly.js-dist-min')),'LICENSE'),new URL('PLOTLY-LICENSE.txt',out));

// diagramas (layout diagram): Mermaid, desenhado no navegador com a paleta do slide (runtime/diagram.js)
const mermaid = path.dirname(require.resolve("mermaid/package.json"));
fs.copyFileSync(path.join(mermaid, "dist", "mermaid.min.js"), new URL("mermaid.min.js", out));
fs.copyFileSync(path.join(mermaid, "LICENSE"), new URL("MERMAID-LICENSE.txt", out));
