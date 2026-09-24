// Ícones: 2.100+ do Lucide (MIT), embutidos só os que o deck usa.
// Uso no YAML:  { icon: gavel }   { icon: car, size: 120, color: hi }
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
let DIR;
function dir() {
  if (!DIR) {
    // versão empacotada (pip) traz os ícones ao lado do motor; em desenvolvimento vêm do node_modules
    const bundled = path.join(HERE, "icons");
    DIR = fs.existsSync(bundled) ? bundled : path.join(path.dirname(require.resolve("lucide-static/package.json")), "icons");
  }
  return DIR;
}

export function iconExists(name) {
  return fs.existsSync(path.join(dir(), `${name}.svg`));
}

export function listIcons(filter) {
  const all = fs.readdirSync(dir()).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4));
  return filter ? all.filter((n) => n.includes(filter)) : all;
}

// Retorna <svg> com stroke = currentColor, para herdar a cor do tom do slide.
export function iconSVG(name, { size = 96, stroke = 1.75, cls = "" } = {}) {
  const file = path.join(dir(), `${name}.svg`);
  if (!fs.existsSync(file)) {
    const near = listIcons(name.split("-")[0]).slice(0, 8).join(", ");
    throw new Error(`Ícone "${name}" não existe no Lucide.${near ? " Parecidos: " + near : ""}`);
  }
  let svg = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "").trim();
  svg = svg
    .replace(/\swidth="\d+"/, ` width="${size}"`)
    .replace(/\sheight="\d+"/, ` height="${size}"`)
    .replace(/stroke-width="[\d.]+"/, `stroke-width="${stroke}"`)
    .replace(/class="[^"]*"/, `class="ico ${cls}"`);
  return svg;
}
