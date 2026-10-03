import { build } from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('../src/code-lab-browser.js',import.meta.url))],outfile:fileURLToPath(new URL('../src/runtime/code-lab.js',import.meta.url)),bundle:true,platform:'browser',format:'iife',target:'es2020',minify:true,legalComments:'none'});
