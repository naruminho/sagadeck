// Gera src/runtime/fonts/<família>.css: as fontes dos temas (licença OFL, pacotes @fontsource) embutidas em base64,
// só o subconjunto latino (que cobre o português). Nada de fonts.googleapis.com: a apresentação funciona offline e
// numa rede que barra o Google (a do banco), e ninguém fica sabendo quando ela é aberta.
// Uso: node scripts/vendor-fonts.mjs   (depois de npm install; os pacotes estão em devDependencies)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "runtime", "fonts");
const require = createRequire(import.meta.url);
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

// [família como os temas escrevem, arquivo do pacote, pesos]
const FONTS = [
  ["Caveat", "@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2", "400 700"],
  ["Patrick Hand", "@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2", "400"],
  ["Comic Neue", "@fontsource/comic-neue/files/comic-neue-latin-400-normal.woff2", "400"],
  ["Comic Neue", "@fontsource/comic-neue/files/comic-neue-latin-700-normal.woff2", "700"],
  ["Plus Jakarta Sans", "@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2", "200 800"],
  ["Fredoka", "@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2", "300 700"],
  ["Inter", "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", "100 900"],
  ["Press Start 2P", "@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2", "400"],
  ["VT323", "@fontsource/vt323/files/vt323-latin-400-normal.woff2", "400"],
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const byFamily = {};
for (const [family, file, weight] of FONTS) {
  const b64 = fs.readFileSync(require.resolve(file)).toString("base64");
  (byFamily[family] ||= []).push(`@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${LATIN}}`);
}
const slug = (f) => f.toLowerCase().replace(/\s+/g, "-");
for (const [family, rules] of Object.entries(byFamily)) fs.writeFileSync(path.join(OUT, `${slug(family)}.css`), `/* ${family} (SIL Open Font License 1.1, via @fontsource) */\n${rules.join("\n")}\n`);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(Object.fromEntries(Object.keys(byFamily).map((f) => [f, `${slug(f)}.css`])), null, 2) + "\n");
const kb = Object.keys(byFamily).reduce((n, f) => n + fs.statSync(path.join(OUT, `${slug(f)}.css`)).size, 0) / 1024;
console.log(`✓ ${Object.keys(byFamily).length} famílias em src/runtime/fonts (${Math.round(kb)} KB)`);
