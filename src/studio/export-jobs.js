// Gerações pertencem à pessoa, não à aba. O arquivo fica fora da biblioteca/nuvem por até 24 h,
// enquanto este Studio estiver ligado. Uma geração por vez limita o uso de Chrome e memória.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateExport, exportHeaders } from './exporting.js';

export const EXPORT_KINDS = ['sagadeck', 'pptx', 'pdf', 'roteiro', 'tudo', 'estudo', 'estudo-html'];
const TTL = 24 * 3600_000;
export function createExportJobs({ generate = generateExport, now = () => Date.now(), ttl = TTL } = {}) {
  const jobs = new Map(), queue = [];
  let active = null, closed = false, dir;
  const visible = j => ({ id: j.id, kind: j.kind, name: j.name, title: j.title, status: j.status,
    progress: j.progress, createdAt: j.createdAt, finishedAt: j.finishedAt || null,
    expiresAt: j.finishedAt ? j.finishedAt + ttl : null, error: j.error || null, warnings: j.warnings || [] });
  const remove = j => { if (j.path) fs.rmSync(j.path, { force: true }); jobs.delete(j.id); };
  function prune() {
    for (const j of jobs.values()) if (j.finishedAt && now() - j.finishedAt >= ttl) remove(j);
  }
  const timer = setInterval(prune, 60_000); timer.unref();
  async function run(j) {
    j.status = 'running';
    try {
      const result = await generate(j.kind, j.spec, j.name, { ...j.options, onProgress: p => { j.progress = { ...j.progress, ...p }; } });
      if (closed) return;
      dir ||= fs.mkdtempSync(path.join(os.tmpdir(), 'sagadeck-export-jobs-'));
      j.path = path.join(dir, j.id);
      fs.writeFileSync(j.path, result.body, { mode: 0o600 });
      j.headers = exportHeaders(result);
      j.name = result.file;
      j.warnings = [...(result.warnings || []), ...(result.missing || []).map(file => `Arquivo não encontrado: ${file}`)];
      j.progress = { ...j.progress, phase: 'ready', completed: j.progress.total };
      j.status = 'ready';
    } catch (e) {
      j.status = 'failed'; j.error = e.message || String(e);
    } finally {
      j.finishedAt = now(); delete j.spec; delete j.options;
      // Mantém as dez exportações recentes da pessoa; não guarda arquivos sem limite.
      const done = [...jobs.values()].filter(x => x.owner === j.owner && x.finishedAt).sort((a, b) => b.finishedAt - a.finishedAt);
      for (const old of done.slice(10)) remove(old);
    }
  }
  function drain() {
    if (closed || active || !queue.length) return;
    const j = queue.shift();
    active = run(j).finally(() => { active = null; setImmediate(drain); });
  }
  return {
    create(owner, kind, spec, name, options = {}) {
      if (closed) throw new Error('O Studio está encerrando. Tente novamente depois de reiniciar.');
      if (!EXPORT_KINDS.includes(kind)) throw new Error('Formato de exportação inválido.');
      prune();
      const key = crypto.createHash('sha256').update(JSON.stringify([kind, spec, name, options])).digest('hex');
      const pending = [...jobs.values()].filter(j => !j.finishedAt);
      const same = pending.find(j => j.owner === owner && j.key === key);
      if (same) return visible(same);
      if (pending.filter(j => j.owner === owner).length >= 4 || pending.length >= 32) throw new Error('Há muitas exportações em andamento. Espere uma delas terminar.');
      const j = { id: crypto.randomUUID(), owner, key, kind, spec: structuredClone(spec), name, title: spec.title || name,
        options: { ...options }, status: 'queued', createdAt: now(), progress: { phase: 'queued', completed: 0, total: spec.slides?.length || 0 } };
      jobs.set(j.id, j); queue.push(j); setImmediate(drain);
      return visible(j);
    },
    list(owner) { prune(); return [...jobs.values()].filter(j => j.owner === owner).sort((a, b) => b.createdAt - a.createdAt).map(visible); },
    download(owner, id, res) {
      prune();
      const j = jobs.get(id);
      const code = !j || j.owner !== owner ? 404 : j.status !== 'ready' ? 409 : 200;
      if (code !== 200) {
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: code === 404 ? 'Exportação não encontrada ou expirada. Gere novamente.' : j.error || 'A exportação ainda não terminou.' }));
        return;
      }
      res.writeHead(200, { ...j.headers, 'Content-Length': fs.statSync(j.path).size });
      const stream = fs.createReadStream(j.path);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy()); stream.pipe(res);
    },
    async close() {
      closed = true; clearInterval(timer); queue.length = 0;
      await active;
      jobs.clear(); if (dir) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
