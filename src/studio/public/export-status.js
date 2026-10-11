// A mesma fila acompanha exportações no editor e na biblioteca, inclusive ao voltar à página.
(function () {
  'use strict';
  const labels = { pptx: 'PowerPoint', pdf: 'PDF', roteiro: 'Roteiro', estudo: 'Material de estudo', 'estudo-html': 'Material de estudo', tudo: 'PowerPoint, PDF e roteiro', sagadeck: 'Apresentação' };
  const jobs = new Map(), rows = new Map(), automatic = new Set(), dismissed = new Set();
  let panel, list, heading, toggle, hint, minimized = false, busy = false;
  const elapsed = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
  async function json(url, options) {
    let res;
    try { res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); }
    catch (e) {
      if (['TimeoutError', 'AbortError'].includes(e.name)) throw new Error('O Studio não respondeu a tempo. Se a geração começou, ela aparecerá nesta lista quando a conexão voltar.');
      throw new Error('Não foi possível conectar ao Studio. Confira a conexão e tente novamente.');
    }
    let body; try { body = await res.json(); } catch { throw new Error('O servidor não respondeu como esperado. Tente novamente.'); }
    if (!res.ok) throw new Error(body.error || `Não foi possível concluir o pedido (${res.status}).`);
    return body;
  }
  function mount() {
    if (panel) return;
    const style = document.createElement('style');
    style.textContent = `
      #export-status{position:fixed;right:22px;bottom:22px;z-index:40;width:min(390px,calc(100vw - 32px));background:var(--chrome,#fff);color:var(--text,#242424);border:1px solid var(--ui-line,#ddd);border-radius:12px;box-shadow:var(--shadow-3,0 8px 32px #0002);font:13px/1.5 system-ui,sans-serif}
      body:not(.lib) #export-status[data-minimized=true]{top:64px;bottom:auto}
      #export-status[hidden],#export-status [hidden]{display:none!important}
      #export-status header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;gap:12px}
      #export-status button{font:inherit;cursor:pointer;border:1px solid var(--ui-line,#ddd);border-radius:6px;padding:4px 9px;background:transparent;color:inherit}
      #export-status button:focus-visible{outline:2px solid var(--brand,#0f6cbd);outline-offset:2px}
      #export-status button:disabled{opacity:.6;cursor:wait}
      #export-status .export-list{max-height:330px;overflow:auto;padding:0 14px}
      #export-status article{padding:12px 0;border-top:1px solid var(--ui-line,#ddd)}
      #export-status .export-name{display:block;overflow-wrap:anywhere}
      #export-status p{margin:4px 0}
      #export-status progress{display:block;width:100%;height:8px;margin:8px 0;accent-color:var(--brand,#0f6cbd)}
      #export-status .export-actions{display:flex;align-items:center;gap:8px;margin-top:8px}
      #export-status .export-download{background:var(--brand-fill,#0f6cbd);color:var(--on-brand,#fff);border-color:var(--brand-fill,#0f6cbd)}
      #export-status .export-error{color:var(--err,#b42318)}
      #export-status small{opacity:.8}
      #export-status .export-hint{padding:8px 14px 12px;font-size:11px;margin:0}
      #export-status details{margin-top:6px;overflow-wrap:anywhere}
    `;
    document.head.append(style);
    panel = document.createElement('section'); panel.id = 'export-status'; panel.setAttribute('aria-label', 'Exportações');
    panel.innerHTML = '<header><strong>Exportações</strong><button type="button" aria-expanded="true">Recolher</button></header><div class="export-list"></div><p class="export-hint">Você pode continuar trabalhando e baixar depois pela biblioteca. Arquivos disponíveis por até 24 h, enquanto o Studio estiver ligado (10 mais recentes).</p>';
    document.body.append(panel);
    heading = panel.querySelector('strong'); list = panel.querySelector('.export-list'); toggle = panel.querySelector('header button'); hint = panel.querySelector('.export-hint');
    toggle.onclick = () => { minimized = !minimized; render(); };
  }
  function message(j) {
    if (j.status === 'failed') return (j.id.startsWith('starting-') ? 'Não deu para iniciar: ' : 'Falhou: ') + j.error;
    if (j.status === 'ready') return 'Pronto para baixar';
    if (j.status === 'expired') return 'Arquivo não disponível. Gere novamente.';
    const p = j.progress || {};
    const prefix = p.format ? (labels[p.format] || '') + ': ' : '';
    if (p.phase === 'slides') return prefix + `Preparando slide ${p.slide || p.completed + 1} de ${p.total}`;
    if (p.phase === 'packing') return prefix + 'Concluindo o arquivo';
    if (p.phase === 'opening') return prefix + 'Abrindo a apresentação para exportar';
    if (j.status === 'queued') return 'Na fila para gerar';
    return 'Preparando a exportação';
  }
  async function download(id) {
    const row = rows.get(id); if (!row || row.downloading) return;
    row.downloading = true; row.button.disabled = true; row.note.textContent = 'Recebendo o arquivo para baixar';
    try {
      const res = await fetch(`api/export/jobs/${id}/download`);
      if (!res.ok) { let error; try { error = (await res.json()).error; } catch {} throw new Error(error || 'Não foi possível receber o arquivo.'); }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || jobs.get(id).name);
      const a = document.createElement('a'); const url = URL.createObjectURL(blob);
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      row.note.textContent = 'Download enviado ao navegador. Você pode baixar novamente.';
    } catch (e) { row.note.textContent = 'Não deu para baixar: ' + e.message; }
    finally { row.downloading = false; row.button.disabled = false; }
  }
  function render() {
    const shown = [...jobs.values()].filter(j => !dismissed.has(j.id));
    if (!shown.length && !panel) return;
    mount(); panel.hidden = !shown.length;
    panel.dataset.minimized = String(minimized);
    const running = shown.filter(j => ['queued', 'running', 'starting'].includes(j.status)).length;
    heading.textContent = running ? `Exportações (${running} em andamento)` : 'Exportações';
    list.hidden = hint.hidden = minimized; toggle.textContent = minimized ? 'Expandir' : 'Recolher'; toggle.setAttribute('aria-expanded', String(!minimized));
    for (const j of shown) {
      let row = rows.get(j.id);
      if (!row) {
        const el = document.createElement('article'); el.dataset.exportJob = j.id;
        el.innerHTML = '<strong class="export-name"></strong><p class="export-message" role="status" aria-live="polite"></p><progress aria-label="Preparação dos slides e conclusão do arquivo"></progress><small class="export-time"></small><details hidden><summary>Avisos da exportação</summary><p></p></details><div class="export-actions"><button class="export-download" type="button">Baixar arquivo</button><button class="export-dismiss" type="button">Ocultar</button></div><p class="export-note"></p>';
        row = { el, name: el.querySelector('strong'), status: el.querySelector('.export-message'), bar: el.querySelector('progress'), time: el.querySelector('small'), warnings: el.querySelector('details'), button: el.querySelector('.export-download'), dismiss: el.querySelector('.export-dismiss'), note: el.querySelector('.export-note') };
        row.button.onclick = () => download(j.id);
        row.dismiss.onclick = () => { dismissed.add(j.id); render(); };
        list.append(el); rows.set(j.id, row);
      }
      row.el.hidden = false; row.name.textContent = `${labels[j.kind] || 'Arquivo'} — ${j.title || j.name || 'Apresentação'}`;
      const text = message(j); if (row.status.textContent !== text) row.status.textContent = text;
      row.status.classList.toggle('export-error', ['failed', 'expired'].includes(j.status));
      row.time.textContent = `${j.finishedAt ? 'Duração' : 'Tempo decorrido'}: ${elapsed((j.finishedAt || Date.now()) - j.createdAt)}`;
      row.button.hidden = j.status !== 'ready'; row.dismiss.hidden = ['queued', 'running', 'starting'].includes(j.status);
      row.bar.hidden = ['failed', 'expired'].includes(j.status);
      const p = j.progress || {};
      if (j.status === 'ready' || p.phase === 'slides' || p.phase === 'packing') {
        row.bar.max = Math.max(1, (p.total || 0) + 1); row.bar.value = j.status === 'ready' ? row.bar.max : p.completed || 0;
      } else row.bar.removeAttribute('value');
      row.warnings.hidden = !j.warnings?.length; row.warnings.querySelector('p').textContent = (j.warnings || []).join('; ');
      if (j.status === 'ready' && automatic.delete(j.id)) download(j.id);
    }
    for (const [id, row] of rows) {
      if (!jobs.has(id)) { row.el.remove(); rows.delete(id); }
      else if (dismissed.has(id)) row.el.hidden = true;
    }
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    const known = new Set(jobs.keys()); // uma resposta atrasada não apaga a geração iniciada depois do pedido
    try {
      const { jobs: latest } = await json('api/export/jobs');
      const ids = new Set(latest.map(j => j.id));
      for (const j of jobs.values()) if (known.has(j.id) && !ids.has(j.id) && !j.id.startsWith('starting-')) {
        j.status = 'expired'; automatic.delete(j.id);
      }
      for (const j of latest) jobs.set(j.id, j);
      if (panel) panel.removeAttribute('data-disconnected');
      for (const row of rows.values()) if (row.note.dataset.connection) { row.note.textContent = ''; delete row.note.dataset.connection; }
      render();
    } catch {
      if (jobs.size) {
        mount(); panel.dataset.disconnected = 'true';
        for (const [id, row] of rows) if (['queued', 'running'].includes(jobs.get(id)?.status)) {
          row.note.dataset.connection = 'true'; row.note.textContent = 'Sem conexão com o Studio. A geração pode continuar no servidor; o acompanhamento volta quando a conexão retornar.';
        }
      }
    } finally { busy = false; }
  }
  window.SagadeckExports = {
    async start(options, { beforeStart } = {}) {
      const id = 'starting-' + crypto.randomUUID();
      jobs.set(id, { id, kind: options.kind, title: options.title || 'Apresentação', status: 'starting', createdAt: Date.now() }); minimized = false; render();
      try {
        await beforeStart?.();
        const { job } = await json('api/export/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) });
        jobs.delete(id); jobs.set(job.id, job); dismissed.delete(job.id); automatic.add(job.id); render(); refresh();
        return job;
      } catch (e) {
        const j = jobs.get(id); j.status = 'failed'; j.error = e.message; j.finishedAt = Date.now(); render(); throw e;
      }
    },
  };
  // Espaço suficiente entre pedidos para que a página descanse; relógio não depende da resposta de rede.
  setInterval(() => { if (jobs.size) render(); }, 1000);
  setInterval(refresh, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
})();
