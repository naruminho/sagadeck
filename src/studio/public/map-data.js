// Planilha × mapa no Studio (aba Arquivos, planilha aberta): "Pôr no mapa" cria o slide de mapa a partir dela,
// "Achar coordenadas" preenche latitude e longitude pelo endereço (pergunta antes de mandar os endereços para o
// serviço de fora; mostra o progresso; o que não achou fica listado), e a seleção anda junto: clicar num ponto do
// mapa seleciona a linha da planilha aberta, e selecionar a linha abre o cartão do ponto.
window.SagaMapData = (() => {
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const LAT = ["lat", "latitude"], LON = ["lon", "lng", "long", "longitude"], COORD = ["coordenadas", "coordenada", "coords", "latlon", "latlong", "posicao", "localizacao"];
  const ADDR = ["endereco", "address", "logradouro", "rua", "enderecocompleto"], NAME = ["nome", "name", "titulo", "local", "estacao", "unidade", "ponto", "descricao"];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const find = (head, names) => head.findIndex((h) => names.includes(norm(h)));

  // o que a planilha tem: posição, endereço, uma coluna boa para cor (2 a 8 categorias) e uma para o nome
  function guess(rows) {
    const head = (rows[0] || []).map((h) => String(h).trim()), body = rows.slice(1).filter((r) => r.some((c) => String(c).trim()));
    const lat = find(head, LAT), lon = find(head, LON), coord = find(head, COORD), addr = find(head, ADDR);
    const pos = new Set([lat, lon, coord, addr]);
    const distinct = (i) => new Set(body.map((r) => String(r[i] ?? "").trim()).filter(Boolean)).size;
    const isNum = (i) => body.length && body.every((r) => !String(r[i] ?? "").trim() || /^[-+]?\d+([.,]\d+)?$/.test(String(r[i]).trim()));
    // o nome primeiro (coluna "nome"… ou a de texto com valores quase todos diferentes); a cor vai para uma coluna
    // de categorias de verdade: valores que se repetem, de 2 a 8
    let label = find(head, NAME);
    if (label < 0) label = head.findIndex((h, i) => !pos.has(i) && !isNum(i) && distinct(i) > Math.min(8, body.length / 2));
    const color = head.findIndex((h, i) => !pos.has(i) && i !== label && !isNum(i) && distinct(i) >= 2 && distinct(i) <= 8 && distinct(i) < body.length);
    const withPos = lat >= 0 && lon >= 0 ? body.filter((r) => String(r[lat] ?? "").trim() && String(r[lon] ?? "").trim()).length : coord >= 0 ? body.filter((r) => String(r[coord] ?? "").trim()).length : 0;
    return { head, lat, lon, coord, addr, color, label, total: body.length, withPos };
  }

  function dialog(html) {
    const d = document.createElement("dialog");
    d.className = "md-dialog";
    d.innerHTML = html;
    document.body.append(d);
    d.addEventListener("close", () => d.remove());
    d.showModal();
    return d;
  }

  async function geocode(t, g, { api, ctx, status, reload }) {
    const call = (extra) => fetch("api/mapa/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: t.path, ...extra }) });
    const plano = await call({ planejar: true });
    if (!plano.ok) { const e = await plano.json().catch(() => ({})); ctx.toast(e.error || `Não deu (HTTP ${plano.status}).`, 6000); return; }
    const p = await plano.json();
    let confirmo = false;
    if (p.precisaConfirmar) {
      const d = dialog(`<h3>Achar as coordenadas pelo endereço</h3>
        <p>Vou enviar <b>${p.enviar} endereço${p.enviar === 1 ? "" : "s"}</b> desta planilha (coluna <b>${esc(p.coluna)}</b>) ao serviço <b>${esc(p.servico)}</b> para achar latitude e longitude. Os endereços saem desta máquina.</p>
        <p>Leva cerca de ${p.segundos <= 1 ? "1 segundo" : p.segundos < 90 ? `${p.segundos} segundos` : `${Math.ceil(p.segundos / 60)} minutos`}, no ritmo que o serviço aceita.${p.cache ? ` ${p.cache} já estavam guardados e não serão enviados de novo.` : ""}</p>
        <div class="md-row"><button type="button" class="btn" data-no>Cancelar</button><button type="button" class="btn btn-primary" data-yes>Enviar e achar</button></div>`);
      const ok = await new Promise((r) => { d.querySelector("[data-yes]").onclick = () => { d.close(); r(true); }; d.querySelector("[data-no]").onclick = () => { d.close(); r(false); }; });
      if (!ok) return;
      confirmo = true;
    }
    const res = await call({ confirmo });
    if (!res.ok) { const e = await res.json().catch(() => ({})); ctx.toast(e.error || `Não deu (HTTP ${res.status}).`, 6000); return; }
    // progresso linha a linha (ndjson)
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", end = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "plano") status.textContent = `procurando ${ev.total} endereço${ev.total === 1 ? "" : "s"}…`;
        if (ev.type === "progresso") status.textContent = `${ev.feitos} de ${ev.total} · ${ev.ok} achado${ev.ok === 1 ? "" : "s"}`;
        if (ev.type === "fim") end = ev;
      }
    }
    if (!end) return;
    const msg = end.bloqueado ? `O serviço parou de responder: ${end.bloqueado}. Não tentei de novo; o que já tinha achado foi gravado.` : `${end.ok} achado${end.ok === 1 ? "" : "s"}${end.falhas.length ? `, ${end.falhas.length} sem resultado` : ""}.`;
    if (end.falhas.length || end.bloqueado) {
      const d = dialog(`<h3>Coordenadas pelo endereço</h3><p>${esc(msg)}</p>${end.falhas.length ? `<p>Sem resultado (corrija o endereço e tente de novo):</p><ul class="md-list">${end.falhas.slice(0, 50).map((f) => `<li>linha ${f.linha}: ${esc(f.endereco)}</li>`).join("")}</ul>` : ""}<div class="md-row"><button type="button" class="btn btn-primary" data-ok>Fechar</button></div>`);
      d.querySelector("[data-ok]").onclick = () => d.close();
    } else ctx.toast(msg, 5000);
    if (end.path !== t.path) ctx.toast(`Gravei as coordenadas em ${end.path} (o xlsx não se edita aqui).`, 6000);
    reload(end.path);
  }

  // botões na cabeça da planilha aberta (explorer.js chama ao mostrar uma planilha)
  function sheetTools(view, { t, rows, grid, api, ctx, reload }) {
    const g = guess(rows);
    current = { path: t.path, grid, g };
    if (g.lat < 0 && g.coord < 0 && g.addr < 0) return;
    const head = view.querySelector(".dv-head");
    const bar = document.createElement("span");
    bar.className = "md-tools";
    const canMap = (g.lat >= 0 && g.lon >= 0) || g.coord >= 0;
    bar.innerHTML = `${canMap ? `<button type="button" class="btn btn-small" data-to-map title="Cria um slide de mapa com os pontos desta planilha"><i class="ic" data-ic="map-pin"></i> Pôr no mapa</button>` : ""}${g.addr >= 0 && g.withPos < g.total ? `<button type="button" class="btn btn-small" data-geocode title="Preenche latitude e longitude pelo endereço"><i class="ic" data-ic="search"></i> Achar coordenadas</button>` : ""}<span class="md-status f-label"></span>`;
    head.append(bar);
    ctx.hydrate?.(bar);
    const status = bar.querySelector(".md-status");
    bar.querySelector("[data-to-map]")?.addEventListener("click", async () => {
      const name = t.name.replace(/\.[a-z0-9]+$/i, "");
      // o mapa lê CSV: uma planilha .xlsx ganha um CSV ao lado (o original fica como está)
      let points = t.path;
      if (!/\.(csv|tsv)$/i.test(t.path)) {
        points = t.path.replace(/\.[^.]+$/, "") + ".csv";
        try { await api("api/project/sheet-write", { path: points, rows }); } catch (e) { ctx.toast(`Não consegui gravar ${points}: ${e.message}`, 6000); return; }
      }
      const layer = { name, points, ...(g.color >= 0 ? { color: g.head[g.color] } : {}), ...(g.label >= 0 ? { label: g.head[g.label] } : {}) };
      ctx.insertSlide({ layout: "map", title: name, layers: [layer] });
      ctx.toast(points === t.path ? "Mapa inserido depois do slide atual, ligado à planilha (mudou a planilha, o mapa acompanha)." : `Mapa inserido, ligado a ${points} (o mapa lê CSV; gravei a cópia ao lado da planilha).`, 6000);
    });
    const geoBtn = bar.querySelector("[data-geocode]");
    geoBtn?.addEventListener("click", async () => {
      geoBtn.disabled = true;
      try { await geocode(t, g, { api, ctx, status, reload }); } finally { geoBtn.disabled = false; }
    });
  }

  // seleção ligada: ponto clicado no mapa -> linha da planilha aberta (se for a mesma planilha)
  let current = null;
  document.addEventListener("sagamap:ponto", (e) => {
    const { path, linha } = e.detail || {};
    if (!current || !linha || path !== current.path) return;
    current.grid?.select(linha - 1, 0);
  });
  // linha selecionada na planilha -> cartão do ponto no mapa da prévia
  const selectRow = (path, linha) => document.dispatchEvent(new CustomEvent("sagamap:linha", { detail: { path, linha } }));

  // botão "Editar no mapa" na prévia grande; o editor (map-editor.js) só carrega no primeiro clique
  let editorLoad;
  const loadEditor = () => (window.SagaMapEditor ? Promise.resolve() : (editorLoad ||= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "map-editor.js"; s.onload = res;
    s.onerror = () => { editorLoad = null; s.remove(); rej(new Error("Não foi possível carregar o editor do mapa.")); };
    document.head.append(s);
  })));
  function attach(container, slide, commit, ctx) {
    const E = window.SagaMapEditor;
    if (slide?.layout !== "map") { if (E?.active()) E.stop(); document.querySelectorAll("#canvas-viewport > .me-open").forEach((b) => b.remove()); return; }
    const box = container.querySelector(".map-box");
    if (!box) return;
    // o botão e a barra ficam fora do slide escalado (a prévia do Studio fica a ~40%): no #canvas-viewport
    const host = document.getElementById("canvas-viewport") || box;
    host.querySelectorAll(":scope > .me-open").forEach((b) => b.remove());
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "me-open"; btn.innerHTML = '<i class="ic" data-ic="pencil"></i> Editar no mapa';
    for (const ev of ["pointerdown", "mousedown", "click", "dblclick"]) btn.addEventListener(ev, (e) => e.stopPropagation());
    btn.onclick = async () => {
      try { await loadEditor(); btn.hidden = true; window.SagaMapEditor.start(box, slide, commit, ctx); }
      catch (e) { ctx.toast(e.message, 5000); }
    };
    host.append(btn);
    ctx.hydrate?.(btn);
    // o slide redesenhou com o editor aberto (gravou algo): volta no mesmo modo
    if (E?.active()) { if (E.key() === (slide.uid || slide.title)) { btn.hidden = true; E.resume(box, slide, commit, ctx); } else E.stop(); }
  }
  const editorStopped = () => { const b = document.querySelector("#canvas-viewport > .me-open"); if (b) b.hidden = false; };

  return { guess, sheetTools, selectRow, attach, editorStopped };
})();
