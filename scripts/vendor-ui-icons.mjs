// Gera src/studio/public/ui-icons.js: os ícones Lucide (ISC) usados na interface do Studio.
// Na página, <i class="ic" data-ic="nome"></i> vira o SVG correspondente (ver hydrateIcons em app.js).
// Uso: node scripts/vendor-ui-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const DIR = path.join(path.dirname(require.resolve("lucide-static/package.json")), "icons");

const NAMES = [
  "layers", "clapperboard", "terminal", "image", "circle-help",
  "plus", "copy", "trash-2", "layout-template", "palette", "sun-moon", "grid-3x3", "sparkles", "wand-sparkles",
  "shapes", "workflow", "folder-open", "folder-input", "save", "download", "file-code", "file-text", "external-link",
  "play", "chevron-down", "search", "x", "bot", "message-square-text", "panel-right", "sticky-note", "code-xml",
  "scan-eye", "flame", "layout-dashboard", "activity", "wand", "square-dashed", "scan-line", "volume-2", "volume-x",
  "zoom-in", "zoom-out", "maximize", "arrow-up", "arrow-down", "send", "image-plus", "circle-alert", "check",
  "monitor-play", "sliders-horizontal", "loader-circle", "panel-bottom",
  "clock", "layout-grid", "ellipsis", "pencil", "folder", "arrow-left", "library", "rotate-ccw", "upload", "file-plus", "moon", "sun", "folder-plus", "presentation",
];

const icons = {};
for (const n of NAMES) {
  const svg = fs.readFileSync(path.join(DIR, `${n}.svg`), "utf8");
  icons[n] = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/\s*\n\s*/g, "").trim();
}

const out = `// GERADO por scripts/vendor-ui-icons.mjs — não edite à mão. Ícones Lucide (ISC), https://lucide.dev
window.UI_ICONS = ${JSON.stringify(icons)};
`;
fs.writeFileSync(path.join(ROOT, "src", "studio", "public", "ui-icons.js"), out);
console.log(`✓ ${NAMES.length} ícones em src/studio/public/ui-icons.js`);
