import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { llmConfig } from '../ai/llm.js';
import { loadPreferences } from '../preferences.js';
import { renameRetry } from '../fs-retry.js';

// O pedido que originou a apresentação (.sagadeck/geracao.json), para dar para auditar depois: foi um prompt ou um
// material? o que a pessoa pediu? Grava o briefing exatamente como foi para a IA (e se era o texto padrão da tela),
// a resposta à pergunta da IA, duração, estilo, os anexos (nome, tipo, tamanho, onde ficaram em contexto/), as
// Preferências que mudam a geração e os modelos. Nada de chave: do provedor, só o endereço sem usuário e senha.
// Recriar pelo chat grava por cima; o pedido anterior vai para `anteriores` (os 10 últimos).
export const REQUEST_FILE = path.join('.sagadeck', 'geracao.json');

const text = (v, max = 20000) => (v == null || v === '' ? undefined : String(v).slice(0, max));
const num = (v) => (Number(v) > 0 ? Number(v) : undefined);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// onde o anexo ficou guardado (mesma pasta de prepareDocumentMaterials: contexto/documentos/<sha256 12>/<nome>)
function storedPath(dir, name, bytes) {
  if (!bytes) return undefined;
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const rel = ['contexto', 'documentos', hash, path.basename(name)].join('/');
  return fs.existsSync(path.join(dir, ...rel.split('/'))) ? rel : undefined;
}

function material(dir, m) {
  const name = String(m.name || '');
  const ext = path.extname(name).slice(1).toLowerCase();
  return clean({
    nome: name,
    tipo: /^https?:/i.test(name) ? 'link' : ext || 'texto',
    detalhe: text(m.detail, 200),
    tamanho: m.bytes ? m.bytes.length : undefined, // bytes do arquivo anexado
    caracteres: String(m.text || '').length || undefined, // texto que a IA leu
    caminho: storedPath(dir, name, m.bytes),
  });
}

// o endereço do provedor, sem usuário, senha nem parâmetros (onde às vezes vai uma chave)
function provider(cfg) {
  if (cfg.adaptador) return 'adaptador';
  try { const u = new URL(cfg.url); return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`; } catch { return undefined; }
}

// origem: "biblioteca" | "editor" | "chat"; pedido: o corpo do pedido (briefing, answer, duration, style…);
// materials: os anexos como vieram (com bytes); spec: a apresentação gerada (tema e título finais)
export function saveGenerationRequest(dir, { origem, pedido = {}, materials = [], spec = null, research = null, prefs = loadPreferences().ia, cfg = llmConfig() } = {}) {
  if (!dir) return null;
  const guide = pedido.guide && typeof pedido.guide === 'object' ? pedido.guide : {};
  const entry = clean({
    data: new Date().toISOString(),
    origem,
    briefing: String(pedido.briefing || ''),
    briefingPadrao: !!guide.padrao,
    guia: clean({ intencao: text(guide.intent, 40), publico: text(guide.audience, 500), objetivo: text(guide.goal, 500), roteiro: text(guide.route, 40) }),
    resposta: text(pedido.answer, 500),
    duracao: num(pedido.duration),
    slides: num(pedido.slides),
    tema: text(pedido.theme, 80),
    estilo: text(pedido.style, 80),
    direcao: text(pedido.direction && typeof pedido.direction === 'object' ? JSON.stringify(pedido.direction) : pedido.direction, 4000),
    materiais: materials.map((m) => material(dir, m)),
    preferencias: clean({ idioma: prefs?.idioma || 'auto', imagens: prefs?.imagens !== false, pesquisa: prefs?.pesquisa !== false, perguntar: prefs?.perguntar !== false, autor: text(prefs?.autor, 120) }),
    pesquisa: research?.fontes?.length ? research.fontes.map((f) => clean({ site: text(f.site, 200), url: text(f.url, 500) })) : undefined,
    modelos: clean({ texto: cfg.textModel, visao: cfg.visionModel, imagem: cfg.imageModel, busca: cfg.searchModel || undefined }),
    provedor: provider(cfg),
    resultado: spec ? clean({ titulo: text(spec.title, 200), tema: text(spec.theme, 80), slides: Array.isArray(spec.slides) ? spec.slides.length : undefined }) : undefined,
  });
  if (!Object.keys(entry.guia).length) delete entry.guia;
  const file = path.join(dir, REQUEST_FILE);
  let anteriores = [];
  try { const old = JSON.parse(fs.readFileSync(file, 'utf8')); anteriores = [{ ...old, anteriores: undefined }, ...(old.anteriores || [])].slice(0, 10); } catch { /* primeiro pedido */ }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = { ...entry, ...(anteriores.length ? { anteriores: JSON.parse(JSON.stringify(anteriores)) } : {}) };
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
  renameRetry(tmp, file);
  return out;
}
