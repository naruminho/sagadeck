// Embute o renderizador vetorial e a ligação com o Leaflet. Nenhuma biblioteca vem de CDN ao abrir o mapa.
// Uso: node scripts/vendor-map-background.mjs (depois de npm install).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/runtime/vendor");
const gl = path.dirname(require.resolve("maplibre-gl/package.json"));
const adapter = path.dirname(require.resolve("@maplibre/maplibre-gl-leaflet/package.json"));
const options = { bundle: true, minify: true, format: "iife", platform: "browser", target: "es2020", legalComments: "eof" };
// O worker abaixo é clássico (IIFE sem imports), inclusive quando embutido em blob no HTML file://.
// MapLibre 6 deduz o tipo pela extensão .cjs; blobs não têm essa extensão. Fixamos essa decisão no bundle
// próprio. Mudança do código upstream faz a geração parar, em vez de publicar um worker incompatível.
const classicWorker = { name: "sagadeck-worker-classico", setup(builder) {
  builder.onLoad({ filter: /maplibre-gl\.mjs$/ }, ({ path: file }) => {
    const source = fs.readFileSync(file, "utf8");
    const detector = /function ([\w$]+)\(([\w$]+)\)\{return \2\.split\(\/\[\?#\]\/\)\[0\]\.endsWith\(`\.cjs`\)\}/g;
    if ([...source.matchAll(detector)].length !== 1) throw new Error("Reveja a seleção do worker clássico ao atualizar o MapLibre.");
    return { contents: source.replace(detector, "function $1($2){return true}"), loader: "js" };
  });
} };
await build({ ...options, plugins: [classicWorker], entryPoints: [path.join(gl, "dist/maplibre-gl.mjs")], outfile: path.join(out, "maplibre-gl.js"), globalName: "maplibregl", define: { "import.meta.url": "window.location.href" } });
await build({ ...options, entryPoints: [path.join(gl, "dist/maplibre-gl-worker.mjs")], outfile: path.join(out, "maplibre-worker.js") });
fs.copyFileSync(path.join(gl, "dist/maplibre-gl.css"), path.join(out, "maplibre-gl.css"));
fs.copyFileSync(path.join(gl, "LICENSE.txt"), path.join(out, "MAPLIBRE-LICENSE.txt"));
fs.copyFileSync(path.join(adapter, "leaflet-maplibre-gl.js"), path.join(out, "maplibre-leaflet.js"));
fs.copyFileSync(path.join(adapter, "LICENSE"), path.join(out, "MAPLIBRE-LEAFLET-LICENSE.txt"));
console.log(`MapLibre ${require("maplibre-gl/package.json").version} e ligação Leaflet embutidos.`);
