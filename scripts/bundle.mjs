// Empacota o motor Node inteiro num único arquivo + recursos, dentro do pacote Python.
// Uso: node scripts/bundle.mjs   (gera python/sagadeck/engine/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// SAGADECK_BUNDLE_OUT: outra pasta (os testes empacotam numa pasta temporária)
const OUT = process.env.SAGADECK_BUNDLE_OUT ? path.resolve(process.env.SAGADECK_BUNDLE_OUT) : path.join(ROOT, "python", "sagadeck", "engine");
const require = createRequire(import.meta.url);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [path.join(ROOT, "bin", "sagadeck.js")],
  outfile: path.join(OUT, "sagadeck.mjs"),
  bundle: true, platform: "node", format: "esm", target: "node18",
  legalComments: "eof", logLevel: "warning",
  external: ["playwright-core"], // vai como pasta própria em engine/node_modules (ele lê arquivos do próprio pacote)
  banner: { js: "import { createRequire as __sdReq } from 'node:module'; import { fileURLToPath as __sdF } from 'node:url'; import { dirname as __sdD } from 'node:path'; const require = __sdReq(import.meta.url); const __filename = __sdF(import.meta.url); const __dirname = __sdD(__filename);" },
});

const copy = (from, to) => fs.cpSync(from, to, { recursive: true });
copy(path.join(ROOT, "src", "runtime"), path.join(OUT, "runtime"));
copy(path.join(ROOT, "src", "studio"), path.join(OUT, "studio"));
const pw = path.dirname(require.resolve("playwright-core/package.json"));
copy(pw, path.join(OUT, "node_modules", "playwright-core"));
// o sagadeck usa Chrome/Edge instalados: não precisa do trace viewer nem dos tipos
for (const extra of ["types", "lib/vite", "lib/tools", "bin"]) fs.rmSync(path.join(OUT, "node_modules", "playwright-core", extra), { recursive: true, force: true });
copy(path.join(ROOT, "templates"), path.join(OUT, "templates"));
copy(path.join(ROOT, "docs"), path.join(OUT, "docs"));
fs.copyFileSync(path.join(ROOT, "SKILL.md"), path.join(OUT, "docs", "SKILL.md"));
copy(path.join(path.dirname(require.resolve("lucide-static/package.json")), "icons"), path.join(OUT, "icons"));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const pyVersion = fs.readFileSync(path.join(ROOT, "python", "sagadeck", "__init__.py"), "utf8").match(/__version__ = "([^"]+)"/)[1];
if (pyVersion !== pkg.version) throw new Error(`Versões diferentes: package.json ${pkg.version} × __init__.py ${pyVersion}`);
fs.writeFileSync(path.join(OUT, "package.json"), JSON.stringify({ name: "sagadeck-engine", version: pkg.version, type: "module", private: true }, null, 2));
const size = fs.statSync(path.join(OUT, "sagadeck.mjs")).size;
console.log(`✓ motor empacotado em ${OUT} (${(size / 1e6).toFixed(1)} MB + recursos)`);
