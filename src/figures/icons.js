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
    // versão empacotada (pip) traz os ícones ao lado do motor; em desenvolvimento vêm do node_modules ou do engine
    const candidates = [
      path.join(HERE, "icons"),
      path.join(HERE, "..", "..", "python", "sagadeck", "engine", "icons"),
      path.join(HERE, "..", "python", "sagadeck", "engine", "icons")
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      DIR = found;
    } else {
      DIR = path.join(path.dirname(require.resolve("lucide-static/package.json")), "icons");
    }
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

// Tabela determinística de sinônimos e termos em português para modelos de IA
const ICON_SYNONYMS = {
  money: "banknote", dinheiro: "banknote", cash: "banknote", moeda: "coins", moedas: "coins",
  dollar: "dollar-sign", real: "banknote", preco: "tag", preço: "tag", custo: "wallet",
  ai: "sparkles", ia: "sparkles", "artificial-intelligence": "brain-circuit",
  brain: "brain", cerebro: "brain", cérebro: "brain",
  lamp: "lightbulb", lampada: "lightbulb", lâmpada: "lightbulb", idea: "lightbulb", ideia: "lightbulb",
  speedometer: "gauge", velocidade: "gauge", rapido: "zap", rápido: "zap", speed: "gauge",
  "rocket-ship": "rocket", foguete: "rocket", lancamento: "rocket", lançamento: "rocket", startup: "rocket",
  people: "users", pessoas: "users", team: "users", time: "users", equipe: "users",
  usuarios: "users", usuários: "users", person: "user", pessoa: "user", cliente: "user",
  security: "shield-check", seguranca: "shield-check", segurança: "shield-check", protecao: "shield", proteção: "shield",
  lock: "lock", cadeado: "lock", chave: "key", key: "key",
  growth: "trending-up", crescimento: "trending-up", subida: "trending-up", lucro: "trending-up",
  drop: "trending-down", queda: "trending-down", perda: "trending-down",
  chart: "bar-chart-2", grafico: "bar-chart-3", gráfico: "bar-chart-3", barras: "bar-chart-2",
  pie: "pie-chart", pizza: "pie-chart", rosca: "circle",
  check: "check-circle-2", sucesso: "check-circle-2", aprovado: "check-check", ok: "check",
  danger: "alert-triangle", perigo: "alert-triangle", alerta: "alert-triangle", aviso: "alert-circle",
  error: "x-circle", falha: "x-circle", erro: "alert-triangle", cancelar: "x",
  target: "target", alvo: "target", meta: "target", objetivo: "target",
  star: "star", estrela: "star", favorito: "star",
  heart: "heart", coracao: "heart", coração: "heart", amor: "heart", curtir: "heart",
  trophy: "trophy", trofeu: "trophy", troféu: "trophy", premio: "award", prêmio: "award",
  award: "award", medalha: "award", medal: "award",
  zap: "zap", raio: "zap", energia: "zap", eletrico: "zap", elétrico: "zap",
  cpu: "cpu", processador: "cpu", chip: "cpu", hardware: "cpu",
  cloud: "cloud", nuvem: "cloud", servidor: "server", server: "server",
  database: "database", banco: "database", dados: "database", data: "database",
  code: "code-2", codigo: "code-2", código: "code-2", software: "code-2", dev: "code-2",
  mobile: "smartphone", celular: "smartphone", telefone: "phone", phone: "phone",
  laptop: "laptop", computador: "laptop", notebook: "laptop", pc: "monitor",
  globe: "globe", mundo: "globe", global: "globe", terra: "globe", web: "globe", internet: "globe",
  search: "search", busca: "search", pesquisa: "search", lupa: "search",
  calendar: "calendar", calendario: "calendar", calendário: "calendar", agenda: "calendar", data_hora: "clock",
  clock: "clock", tempo: "clock", relogio: "clock", relógio: "clock", hora: "clock",
  message: "message-square", mensagem: "message-square", chat: "message-circle", conversa: "messages-square",
  mail: "mail", email: "mail", correio: "mail",
  eye: "eye", olho: "eye", visao: "eye", visão: "eye",
  file: "file-text", arquivo: "file-text", documento: "file-text",
  folder: "folder", pasta: "folder",
  coffee: "coffee", cafe: "coffee", café: "coffee", pausa: "coffee",
  tool: "wrench", ferramenta: "wrench", ferramentas: "wrench",
  setting: "settings", settings: "settings", config: "settings", configuracao: "settings", configuração: "settings",
  sparkle: "sparkles", sparkles: "sparkles", brilho: "sparkles", magica: "sparkles", mágica: "sparkles",
  presentation: "presentation", slide: "presentation", palestra: "presentation",
  book: "book-open", livro: "book-open", leitura: "book-open", educacao: "graduation-cap", educação: "graduation-cap",
  music: "music", som: "volume-2", audio: "volume-2", áudio: "volume-2", microfone: "mic", mic: "mic",
  video: "video", camera: "camera", câmera: "camera", filme: "film",
  gift: "gift", presente: "gift",
  car: "car-front", carro: "car-front", veiculo: "car-front", veículo: "car-front",
  plane: "plane", aviao: "plane", avião: "plane", viagem: "plane",
  map: "map", mapa: "map", local: "map-pin", pin: "map-pin", gps: "map-pin",
};

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

const warnedIcons = new Set();

export function resolveIconName(rawName) {
  if (!rawName) return "sparkles";
  const clean = String(rawName).toLowerCase().trim().replace(/_/g, "-");

  // 1. Exato
  if (iconExists(clean)) return clean;

  // 2. Sinônimo / Tradução em português
  if (ICON_SYNONYMS[clean] && iconExists(ICON_SYNONYMS[clean])) {
    return ICON_SYNONYMS[clean];
  }

  // 3. Prefixos ou sufixos comuns (ex: icon-name, name-icon)
  const stripped = clean.replace(/^(icon-|ico-)/, "").replace(/(-icon|-ico)$/, "");
  if (iconExists(stripped)) return stripped;
  if (ICON_SYNONYMS[stripped] && iconExists(ICON_SYNONYMS[stripped])) {
    return ICON_SYNONYMS[stripped];
  }

  // 4. Distância de Levenshtein (encontra erro de digitação como 'shiled' -> 'shield')
  const all = listIcons();
  let bestMatch = null;
  let minDistance = 3; // tolerância máxima de 2 caracteres trocados

  for (const ic of all) {
    if (Math.abs(ic.length - clean.length) > 2) continue;
    const dist = levenshtein(clean, ic);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = ic;
      if (dist === 1) break;
    }
  }

  if (bestMatch) return bestMatch;

  // 5. Fallback gracioso para evitar crash do build — mas avisa, senão o erro passa despercebido
  if (!warnedIcons.has(clean)) {
    warnedIcons.add(clean);
    console.warn(`⚠ ícone "${rawName}" não existe; usei "sparkles". Procure o nome certo com: sagadeck icons <palavra>`);
  }
  return "sparkles";
}

// Retorna <svg> com stroke = currentColor, para herdar a cor do tom do slide.
export function iconSVG(name, { size = 96, stroke = 1.75, cls = "" } = {}) {
  const resolved = resolveIconName(name);
  const file = path.join(dir(), `${resolved}.svg`);

  let svg = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "").trim();
  svg = svg
    .replace(/\swidth="\d+"/, ` width="${size}"`)
    .replace(/\sheight="\d+"/, ` height="${size}"`)
    .replace(/stroke-width="[\d.]+"/, `stroke-width="${stroke}"`)
    .replace(/class="[^"]*"/, `class="ico ${cls}"`);
  return svg;
}
