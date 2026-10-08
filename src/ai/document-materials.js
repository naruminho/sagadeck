import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractDocumentVisuals } from './document-visuals.js';

export function takeMaterials(W, ids) {
  if (!(W.contextDocs instanceof Map)) return [];
  return (Array.isArray(ids) ? ids : []).map(a => {
    const d = W.contextDocs.get(typeof a === 'string' ? a : a?.id);
    return d ? {name:d.name,text:d.text,detail:d.detail,...(d.bytes ? {bytes:d.bytes} : {})} : null;
  }).filter(Boolean);
}

// Persistência na própria apresentação: nada depende da sessão ou da aba que anexou.
export async function prepareDocumentMaterials(materials, dir, options = {}) {
  const out = [];
  for (const material of materials) {
    if (!material.bytes) { out.push(material); continue; }
    const name = path.basename(material.name), bytes = material.bytes;
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12);
    const folder = path.join(dir,'contexto','documentos',hash);
    const cached = path.join(folder,'material.saga.json');
    if (fs.existsSync(cached)) {
      try {
        const saved = JSON.parse(fs.readFileSync(cached,'utf8'));
        if (saved.visualVersion === 5 && !saved.inventory?.items?.some(item => item.needsReview)) { out.push(saved); continue; }
      } catch { /* refaz inventário interrompido */ }
    }
    fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,name),bytes);
    const inventory = /\.(pdf|docx?)$/i.test(name) ? await extractDocumentVisuals(name,bytes,dir,options) : null;
    const metadata = {name,text:material.text,detail:material.detail,visualVersion:5,...(inventory ? {inventory} : {})};
    fs.writeFileSync(path.join(folder,'material.saga.json'),JSON.stringify(metadata));
    out.push(metadata);
  }
  return out;
}

export function storedDocumentMaterials(dir) {
  const root = path.join(dir,'contexto','documentos');
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root,entry.name,'material.saga.json');
    if (fs.existsSync(file)) try { out.push(JSON.parse(fs.readFileSync(file,'utf8'))); } catch { /* arquivo incompleto não substitui a fonte */ }
  }
  return out;
}
