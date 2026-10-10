// Editor do mapa no Studio: uma tela própria, por cima do Studio (pedido de Narumi: "não consigo clicar pra editar, não
// sei como edita, não sei se tem uma tela diferente"). Carregado só no primeiro "Editar mapa" (map-data.js).
//  - esquerda: as camadas (tipo, nome, quantos itens; o olho esconde só aqui) e "Nova camada";
//  - meio: o mapa grande, sem a escala da prévia (clicar acerta o lugar), com as ferramentas Selecionar, Ponto, Linha,
//    Área e Régua e, embaixo, a dica do que fazer agora;
//  - direita: as propriedades do que está selecionado (ponto, linha, área, região: os campos, com o que cada um faz no
//    mapa) ou, sem seleção, da camada (cor, tamanho, rótulo, cartão, quando aparece) e do mapa (fundo, enquadramento).
// Edita o que está escrito no slide (pontos e formas) e o que está em arquivo do projeto (planilha CSV, GeoJSON); GPX e
// KML só se leem. Modelo em prévia: a primeira gravação cria a cópia (o servidor faz, o Studio avisa).
// Nada aqui inventa coordenada: vem do clique, do serviço de rotas ou do arquivo.
window.SagaMapEditor = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const LAT = ["lat", "latitude"], LON = ["lon", "lng", "long", "longitude"], ADDR = ["endereco", "address", "logradouro", "rua", "enderecocompleto"];
  const isLat = (h) => LAT.includes(norm(h)), isLon = (h) => LON.includes(norm(h));
  const post = async (url, body) => { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`); return j; };
  const getJSON = async (url) => { const r = await fetch(url); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`); return j; };
  const ic = (n) => `<i class="ic" data-ic="${n}"></i>`;
  const plain = (s) => String(s ?? "").replace(/==|\*\*|__/g, "").replace(/\s+/g, " ").trim();
  const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);
  const fmtArea = (a) => (a >= 1e6 ? `${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km²` : a >= 1e4 ? `${(a / 1e4).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha` : `${Math.round(a)} m²`);
  const R = 6371008.8, rad = Math.PI / 180;
  // área de um anel [lat, lon] na esfera (m²) e comprimento de uma linha [lon, lat] (m)
  const ringArea = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const [la1, lo1] = pts[i], [la2, lo2] = pts[(i + 1) % pts.length]; s += (lo2 - lo1) * rad * (2 + Math.sin(la1 * rad) + Math.sin(la2 * rad)); } return Math.abs((s * R * R) / 2); };
  const lineLen = (c) => c.reduce((s, p, i) => { if (!i) return 0; const [lo1, la1] = c[i - 1], [lo2, la2] = p; const a = Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2; return s + 2 * R * Math.asin(Math.sqrt(a)); }, 0);
  const asValue = (v) => (/^-?\d+([.,]\d+)?$/.test(String(v).trim()) ? Number(String(v).trim().replace(",", ".")) : v);
  // cores do tema que o mapa usa (src/map.js, MAP_COLORS): vêm do slide para a tela do editor
  const THEME_VARS = ["bg", "fg", "muted", "line", "surface", "hi", "em", "on-hi", "alert", "c-c1", "c-c2", "c-c3", "c-c4", "c-c5", "c-accent", "c-alert", "c-ink", "c-paper"];
  const SWATCHES = [["c1", "Cor 1"], ["c2", "Cor 2"], ["c3", "Cor 3"], ["c4", "Cor 4"], ["c5", "Cor 5"], ["em", "Destaque"], ["hi", "Realce"], ["alert", "Alerta"]];
  const KINDS = { pontos: ["map-pin", "Pontos", "ponto", "pontos"], formas: ["spline", "Linhas e áreas", "forma", "formas"], regioes: ["map", "Regiões por valor", "região", "regiões"], arquivo: ["route", "Trajeto", "forma", "formas"] };
  const kindOf = (l) => (l?.points != null ? "pontos" : l?.areas != null ? "regioes" : l?.geojson != null ? "formas" : l?.gpx || l?.kml ? "arquivo" : "");
  const srcText = (l) => typeof l.points === "string" ? `Planilha ${l.points}` : Array.isArray(l.points) ? "Escritos no próprio slide" : typeof l.geojson === "string" ? `Arquivo ${l.geojson}` : l.geojson ? "Desenhadas no próprio slide" : l.areas ? "Valores no próprio slide" : l.gpx ? `Arquivo GPX ${l.gpx}: só se lê aqui` : l.kml ? `Arquivo KML ${l.kml}: só se lê aqui` : "";
  const editable = (l) => ["pontos", "formas", "regioes"].includes(kindOf(l));
  const TIPS = {
    selecionar: "Clique num ponto, linha, área ou região para ver e mudar o que ele tem. Arraste um ponto para mudar o lugar.",
    ponto: "Clique no mapa onde fica o ponto.",
    linha: "Clique em cada ponto do caminho. Duplo clique ou Enter termina; Esc desfaz.",
    area: "Clique nos cantos da área. Duplo clique ou Enter fecha; Esc desfaz.",
    regua: "Clique para medir uma distância. Esc zera.",
  };

  let S = null; // { root, mbox, map, entries, box, slide, commit, ctx, mode, sel, layer, hidden, draft, … }

  // ---------------------------------------------------------------- a tela
  function open(box, slide, commit, ctx) {
    if (S) close();
    S = { box, slide, commit, ctx, key: slide.uid || slide.title, mode: "selecionar", sel: null, layer: 0, hidden: new Set(), ruas: true, modo: "pe", draft: null, handles: [] };
    const first = (slide.layers || []).findIndex(editable);
    S.layer = first >= 0 ? first : 0;
    const root = document.createElement("div");
    root.className = "mpe"; root.tabIndex = -1;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Editar mapa");
    root.innerHTML = `<header class="mpe-top"><span class="mpe-title">${ic("map")} Editar mapa</span><span class="mpe-sub" data-sub></span><span class="mpe-state" data-state></span>
        <button type="button" class="btn btn-primary" data-fim>${ic("check")} Concluir</button></header>
      <aside class="mpe-side mpe-left"><div class="mpe-h">Camadas</div><ul class="mpe-layers" data-layers></ul>
        <button type="button" class="btn mpe-new" data-nova>${ic("plus")} Nova camada</button><p class="mpe-note">A última da lista fica por cima no mapa.</p></aside>
      <main class="mpe-stage"><div class="mpe-tools" role="toolbar" aria-label="Ferramentas do mapa">${[["selecionar", "mouse-pointer-2", "Selecionar"], ["ponto", "map-pin", "Ponto"], ["linha", "spline", "Linha"], ["area", "pentagon", "Área"], ["regua", "ruler", "Régua"]].map(([m, i, t]) => `<button type="button" data-mode="${m}" title="${t}">${ic(i)}<span>${t}</span></button>`).join("")}</div>
        <div class="mpe-mapwrap" data-mapwrap></div>
        <div class="mpe-tip"><span data-tip></span><span class="mpe-route" data-route hidden><label><input type="checkbox" data-ruas checked> Seguir as ruas</label><select data-modo aria-label="Como andar"><option value="pe">a pé</option><option value="carro">de carro</option><option value="bicicleta">de bicicleta</option></select></span>
          <span class="mpe-draft" data-draftbtns hidden><button type="button" class="btn btn-small btn-primary" data-terminar>Terminar</button><button type="button" class="btn btn-small" data-cancelar>Desfazer</button></span></div></main>
      <aside class="mpe-side mpe-right" data-props></aside>`;
    document.body.append(root);
    S.root = root;
    // atalhos do Studio (setas trocam de slide, Delete apaga o slide…) não valem aqui dentro
    root.addEventListener("keydown", onKey);
    root.querySelector("[data-fim]").onclick = close;
    root.querySelector("[data-nova]").onclick = newLayerMenu;
    root.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    root.querySelector("[data-ruas]").onchange = (e) => { S.ruas = e.target.checked; };
    root.querySelector("[data-modo]").onchange = (e) => { S.modo = e.target.value; };
    root.querySelector("[data-terminar]").onclick = () => finishShape();
    root.querySelector("[data-cancelar]").onclick = () => { clearDraft(); tipFor(); };
    root.querySelector("[data-layers]").onclick = onLayersClick;
    const props = root.querySelector("[data-props]");
    props.addEventListener("change", onPropsChange);
    props.addEventListener("click", onPropsClick);
    S.ctx.hydrate?.(root);
    root.focus();
    mountMap();
    renderAll();
    setMode("selecionar");
  }
  function close() {
    if (!S) return;
    clearDraft(); clearHandles();
    if (S.mbox) window.SagaMap.dispose(S.mbox);
    S.root.remove();
    const box = S.box; S = null;
    window.SagaMapData?.editorStopped?.(box);
  }
  // o slide redesenhou (gravou algo): a tela continua, com os dados novos e a mesma vista
  function resume(box, slide, commit, ctx) {
    if (!S || (slide.uid || slide.title) !== S.key) return;
    Object.assign(S, { box, slide, commit, ctx });
    mountMap();
    renderAll();
    state("Gravado");
  }

  function renderAll() {
    S.root.querySelector("[data-sub]").textContent = plain(S.slide.title) || "Mapa";
    renderLayers();
    renderProps();
    tipFor();
  }
  const state = (t, bad = false) => { const s = S?.root.querySelector("[data-state]"); if (s) { s.textContent = t || ""; s.classList.toggle("bad", !!bad); } };
  const tip = (t) => { const s = S?.root.querySelector("[data-tip]"); if (s) s.textContent = t; };
  function tipFor() {
    if (!S) return;
    let t = TIPS[S.mode];
    const l = S.slide.layers?.[S.layer];
    if (S.mode === "ponto") t += kindOf(l) === "pontos" ? ` Ele entra em "${l.name || "Pontos"}".` : " Ele entra numa camada nova de pontos.";
    if (S.mode === "linha" || S.mode === "area") t += kindOf(l) === "formas" ? ` Vai para "${l.name || "Desenhos"}".` : " Vai para uma camada nova de desenhos.";
    if (S.joinFrom) t = "Clique na outra linha para juntar as duas. Esc desiste.";
    tip(t);
    S.root.querySelector("[data-route]").hidden = S.mode !== "linha";
    S.root.querySelector("[data-draftbtns]").hidden = !S.draft || S.mode === "regua";
  }

  // ---------------------------------------------------------------- o mapa grande (o mesmo motor da apresentação)
  function mountMap() {
    const keep = S.map ? { c: S.map.getCenter(), z: S.map.getZoom() } : null;
    clearHandles();
    if (S.mbox) window.SagaMap.dispose(S.mbox);
    const wrap = S.root.querySelector("[data-mapwrap]");
    const box = document.createElement("div");
    box.className = "map-box mpe-box";
    box.dataset.basemap = S.box.dataset.basemap || "ruas"; // o filtro do fundo "claro"/"escuro" segue o slide
    const data = document.createElement("script");
    data.type = "application/json"; data.className = "map-data";
    data.textContent = S.box.querySelector(".map-data")?.textContent || '{"layers":[]}';
    const live = document.createElement("div"); live.className = "map-live";
    box.append(data, live);
    const cs = getComputedStyle(S.box);
    for (const v of THEME_VARS) { const val = cs.getPropertyValue(`--${v}`); if (val) box.style.setProperty(`--${v}`, val); }
    wrap.replaceChildren(box);
    S.mbox = box; S.map = null; S.entries = [];
    window.SagaMap.mount(box).then(() => {
      if (!S || S.mbox !== box) return;
      const inst = window.SagaMap.instance(box);
      if (!inst?.map) return;
      S.map = inst.map; S.entries = inst.layers;
      if (keep) S.map.setView(keep.c, keep.z, { animate: false });
      wire();
      renderLayers();
      if (S.pendingSel) { const p = S.pendingSel; S.pendingSel = null; select(p.li, p.id, { focus: p.focus }); }
      else if (S.sel) select(S.sel.li, S.sel.id);
      box.dataset.mpeReady = "1";
    });
  }
  const idOf = (e, f) => { const p = f?.properties || {}; return e.layer.kind === "points" ? p._linha : e.layer.kind === "areas" ? p._cod : p._i; };
  function wire() {
    const map = S.map;
    map.on("click", onMapClick);
    map.on("dblclick", (ev) => { if (S.mode === "linha" || S.mode === "area") { window.L.DomEvent.stop(ev); finishShape(); } });
    map.doubleClickZoom.disable();
    for (const e of S.entries) {
      e.on = true; if (e.legend) e.legend.hidden = false;
      if (S.hidden.has(e.layer.index)) map.removeLayer(e.g); else if (!map.hasLayer(e.g)) e.g.addTo(map);
      e.g.eachLayer((lyr) => {
        lyr.off("click"); lyr.unbindPopup?.();
        lyr._mpe = { color: lyr.options.color, weight: lyr.options.weight };
        const li = e.layer.index, id = idOf(e, lyr.feature);
        lyr.on("click", (ev) => {
          window.L.DomEvent.stop(ev);
          if (S.noClick) return;
          if (S.joinFrom) return joinWith(li, id);
          if (S.mode === "selecionar") select(li, id); else onMapClick(ev);
        });
        if (lyr.getLatLng && kindOf(S.slide.layers[li]) === "pontos") lyr.on("mousedown", (ev) => { if (S.mode === "selecionar") dragPoint(lyr, li, id, ev); });
      });
    }
    window.SagaMap.instance(S.mbox)?.pointsOnTop?.(); // pontos por cima de áreas e raios: clicar no ponto pega o ponto
  }
  function highlight() {
    for (const e of S.entries || []) e.g.eachLayer((lyr) => {
      const on = S.sel && S.sel.li === e.layer.index && String(S.sel.id) === String(idOf(e, lyr.feature));
      if (!lyr._mpe) return;
      lyr.setStyle(on ? { color: "#7c5cff", weight: (lyr._mpe.weight || 2) + 3 } : { color: lyr._mpe.color, weight: lyr._mpe.weight });
      if (on) lyr.bringToFront?.();
    });
  }
  function featureOf(li, id) {
    for (const e of S.entries || []) if (e.layer.index === li) {
      let found = null;
      e.g.eachLayer((lyr) => { if (String(idOf(e, lyr.feature)) === String(id)) found = { e, lyr, f: lyr.feature }; });
      if (found) return found;
      const f = e.layer.data.features.find((x) => String(idOf(e, x)) === String(id));
      if (f) return { e, lyr: null, f };
    }
    return null;
  }

  // ---------------------------------------------------------------- seleção
  function select(li, id, { focus = false } = {}) {
    if (!featureOf(li, id)) { S.sel = null; highlight(); renderProps(); return; }
    S.sel = { li, id }; S.layer = li;
    highlight();
    renderLayers();
    renderProps();
    showHandles();
    if (focus) S.root.querySelector("[data-props] input:not([disabled])")?.focus();
  }
  function unselect() { S.sel = null; clearHandles(); highlight(); renderLayers(); renderProps(); }

  function setMode(m) {
    S.mode = m;
    S.joinFrom = null;
    clearDraft();
    S.root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x.dataset.mode === m));
    S.root.classList.toggle("mpe-drawing", m !== "selecionar");
    tipFor();
  }
  function onKey(e) {
    e.stopPropagation();
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.key === "Enter" && S.draft) { e.preventDefault(); finishShape(); }
    else if (e.key === "Escape") { if (S.joinFrom) { S.joinFrom = null; tipFor(); } else if (S.draft) { clearDraft(); tipFor(); } else if (S.sel) unselect(); else if (S.mode !== "selecionar") setMode("selecionar"); }
    else if ((e.key === "Delete" || e.key === "Backspace") && S.sel) { e.preventDefault(); deleteFeature(); }
  }

  // ---------------------------------------------------------------- gravação
  // arquivo do projeto: em prévia, o servidor cria a cópia antes de gravar e devolve "materialized" (o Studio avisa)
  async function fileWrite(url, body) {
    const j = await post(url, body);
    if (j.materialized) S.ctx.materialized?.(j.materialized);
    return j;
  }
  // gravou: o Studio grava o deck e redesenha o slide; a tela volta com os dados novos (resume)
  function changed() { state("Gravando…"); S.commit(); }
  async function guarded(fn) {
    try { await fn(); } catch (e) { state(`Não gravou: ${e.message}`, true); S?.ctx.toast?.(`Não gravou: ${e.message}`, 6000); }
  }
  async function exists(p) { try { return (await fetch(`api/project/file?path=${encodeURIComponent(p)}`, { method: "HEAD" })).ok; } catch { return false; } }

  // pontos: o cabeçalho e as linhas de onde a camada lê (planilha ou lista no slide) e como gravar de volta.
  // _linha (do motor) = posição da linha em rows + 1
  async function pointRows(li) {
    const l = S.slide.layers[li];
    if (typeof l.points === "string") {
      const j = await getJSON(`api/project/sheet?path=${encodeURIComponent(l.points)}&all=1`).catch(() => null);
      const rows = j?.sheets?.[0]?.rows?.length ? j.sheets[0].rows.map((r) => r.map((c) => String(c ?? ""))) : [["nome", "endereco", "latitude", "longitude"]];
      return { rows, save: (rows) => fileWrite("api/project/sheet-write", { path: l.points, rows }) };
    }
    const list = Array.isArray(l.points) ? l.points : [];
    const head = [...new Set(list.flatMap((p) => Object.keys(p || {})))];
    if (!head.length) head.push("nome");
    if (!head.some(isLat)) head.push("lat");
    if (!head.some(isLon)) head.push("lon");
    const rows = [head, ...list.map((p) => head.map((h) => String(p?.[h] ?? "")))];
    return { rows, save: async (rows) => { const h = rows[0]; l.points = rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, asValue(r[i] ?? "")]).filter(([, v]) => v !== ""))); } };
  }
  // linhas e áreas: o FeatureCollection de onde a camada lê (arquivo ou slide); _i = posição em features
  async function shapeSet(li) {
    const l = S.slide.layers[li];
    if (typeof l.geojson === "string") {
      let fc = { type: "FeatureCollection", features: [] };
      const r = await fetch(`api/project/file?path=${encodeURIComponent(l.geojson)}`);
      if (r.ok) { try { const j = await r.json(); fc = j.type === "FeatureCollection" ? j : { type: "FeatureCollection", features: j.type === "Feature" ? [j] : j.coordinates ? [{ type: "Feature", properties: {}, geometry: j }] : [] }; } catch { /* arquivo vazio ou inválido: começa do zero */ } }
      return { fc, save: (fc) => fileWrite("api/project/write", { path: l.geojson, text: JSON.stringify(fc, null, 1) }) };
    }
    const g = l.geojson;
    const fc = !g ? { type: "FeatureCollection", features: [] } : g.type === "FeatureCollection" ? structuredClone(g) : g.type === "Feature" ? { type: "FeatureCollection", features: [structuredClone(g)] } : { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: structuredClone(g) }] };
    return { fc, save: async (fc) => { l.geojson = fc; } };
  }
  const slideLayer = (li) => S.slide.layers?.[li];

  async function newLayer(kind) {
    const layers = (S.slide.layers ||= []);
    let layer;
    if (kind === "regioes") layer = { name: "Regiões", areas: {} };
    else {
      const [base, ext] = kind === "pontos" ? ["pontos", "csv"] : ["desenhos", "geojson"];
      let p = `contexto/${base}.${ext}`;
      for (let n = 2; await exists(p); n++) p = `contexto/${base}-${n}.${ext}`;
      if (kind === "pontos") { await fileWrite("api/project/sheet-write", { path: p, rows: [["nome", "endereco", "latitude", "longitude"]] }); layer = { name: "Pontos", points: p, label: "nome" }; }
      else { await fileWrite("api/project/write", { path: p, text: JSON.stringify({ type: "FeatureCollection", features: [] }, null, 1) }); layer = { name: "Desenhos", geojson: p, label: "nome" }; }
    }
    layers.push(layer);
    S.layer = layers.length - 1;
    return S.layer;
  }
  // camada que recebe o que a pessoa cria: a escolhida, se for do tipo certo; senão a primeira do tipo; senão uma nova
  async function targetFor(kind) {
    const l = S.slide.layers?.[S.layer];
    if (l && kindOf(l) === kind) return S.layer;
    const other = (S.slide.layers || []).findIndex((x) => kindOf(x) === kind);
    if (other >= 0) return (S.layer = other);
    return newLayer(kind);
  }

  async function addPoint(ll) {
    await guarded(async () => {
      const li = await targetFor("pontos");
      const src = await pointRows(li);
      const rows = src.rows, head = rows[0];
      let iLat = head.findIndex(isLat), iLon = head.findIndex(isLon);
      if (iLat < 0 || iLon < 0) { head.push("latitude", "longitude"); iLat = head.length - 2; iLon = head.length - 1; }
      const row = head.map(() => "");
      row[iLat] = ll.lat.toFixed(6); row[iLon] = ll.lng.toFixed(6);
      const iAddr = head.findIndex((h) => ADDR.includes(norm(h)));
      if (iAddr >= 0) { tip("Procurando o endereço deste lugar…"); try { row[iAddr] = (await post("api/mapa/endereco", { lat: ll.lat, lon: ll.lng })).endereco || ""; } catch (e) { tip(`Endereço não achado: ${e.message}`); } }
      rows.push(row);
      S.pendingSel = { li, id: rows.length, focus: true };
      setMode("selecionar");
      await src.save(rows);
      changed();
    });
  }
  function dragPoint(lyr, li, id, ev) {
    window.L.DomEvent.stop(ev);
    const map = S.map, start = ev.containerPoint;
    let moved = false;
    map.dragging.disable();
    const move = (m) => { if (!moved && m.containerPoint.distanceTo(start) < 4) return; moved = true; lyr.setLatLng(m.latlng); };
    const up = () => {
      map.off("mousemove", move); map.off("mouseup", up); map.dragging.enable();
      if (!moved) return;
      S.noClick = true; setTimeout(() => { if (S) S.noClick = false; }, 60);
      const ll = lyr.getLatLng();
      S.pendingSel = { li, id };
      guarded(async () => {
        const src = await pointRows(li), rows = src.rows, head = rows[0];
        const iLat = head.findIndex(isLat), iLon = head.findIndex(isLon);
        if (iLat < 0 || iLon < 0 || !rows[id - 1]) return;
        rows[id - 1][iLat] = ll.lat.toFixed(6); rows[id - 1][iLon] = ll.lng.toFixed(6);
        await src.save(rows);
        changed();
      });
    };
    map.on("mousemove", move); map.on("mouseup", up);
  }

  // ---------------------------------------------------------------- desenho (linha, área, régua)
  function clearDraft() { if (!S?.draft) return; S.draft.layer.remove(); S.draft.marks.forEach((x) => x.remove()); S.draft = null; }
  function onMapClick(ev) {
    if (!S || S.noClick) return;
    if (S.mode === "selecionar") { if (S.sel) unselect(); return; }
    if (S.mode === "ponto") return addPoint(ev.latlng);
    addVertex(ev.latlng);
  }
  async function addVertex(ll) {
    const L = window.L;
    if (!S.draft) S.draft = { pts: [], layer: (S.mode === "area" ? L.polygon([], { color: "#7c5cff", weight: 4, fillOpacity: 0.15 }) : L.polyline([], { color: "#7c5cff", weight: 5, dashArray: S.mode === "regua" ? "8 8" : null })).addTo(S.map), marks: [] };
    const d = S.draft, last = d.pts.at(-1);
    if (S.mode === "linha" && S.ruas && last) {
      tip("Procurando o caminho pelas ruas…");
      try { const r = await post("api/mapa/rota", { pontos: [last, [ll.lat, ll.lng]], modo: S.modo }); d.pts.push(...r.coords.slice(1).map(([lon, lat]) => [lat, lon])); }
      catch (e) { tip(`${e.message} Desligue "Seguir as ruas" para ligar em linha reta.`); return; }
    } else d.pts.push([ll.lat, ll.lng]);
    d.marks.push(L.circleMarker(ll, { radius: 5, color: "#7c5cff", fillOpacity: 1 }).addTo(S.map));
    d.layer.setLatLngs(d.pts);
    const len = lineLen(d.pts.map(([a, b]) => [b, a]));
    tipFor();
    tip(S.mode === "area" && d.pts.length > 2 ? `Área: ${fmtArea(ringArea(d.pts))}. Duplo clique ou Enter fecha; Esc desfaz.` : `Comprimento: ${fmtLen(len)}.${S.mode === "regua" ? " Esc zera." : " Duplo clique ou Enter termina; Esc desfaz."}`);
  }
  async function finishShape() {
    const d = S.draft;
    if (!d) return;
    if (S.mode === "regua") { clearDraft(); tipFor(); return; }
    if (d.pts.length < (S.mode === "area" ? 3 : 2)) { tip(S.mode === "area" ? "Uma área precisa de pelo menos 3 cantos." : "Uma linha precisa de pelo menos 2 pontos."); return; }
    const coords = d.pts.map(([lat, lon]) => [lon, lat]);
    const geometry = S.mode === "area" ? { type: "Polygon", coordinates: [[...coords, coords[0]]] } : { type: "LineString", coordinates: coords };
    clearDraft();
    await guarded(async () => {
      const li = await targetFor("formas");
      const src = await shapeSet(li);
      src.fc.features.push({ type: "Feature", properties: { nome: "" }, geometry });
      S.pendingSel = { li, id: src.fc.features.length - 1, focus: true };
      setMode("selecionar");
      await src.save(src.fc);
      changed();
    });
  }

  // ---------------------------------------------------------------- vértices da forma selecionada; juntar linhas
  function clearHandles() { S?.handles?.forEach((h) => h.remove()); if (S) S.handles = []; }
  function showHandles() {
    clearHandles();
    const { li, id } = S.sel || {};
    const l = slideLayer(li);
    if (kindOf(l) !== "formas" || !S.map) return;
    const hit = featureOf(li, id), g = hit?.f.geometry;
    if (!g || (g.type !== "LineString" && g.type !== "Polygon")) return;
    const L = window.L, isArea = g.type === "Polygon";
    const ring = (isArea ? g.coordinates[0].slice(0, -1) : g.coordinates).map((c) => [...c]);
    const save = (mut) => guarded(async () => {
      const src = await shapeSet(li), f = src.fc.features[id];
      if (!f) return;
      mut(f, src.fc);
      S.pendingSel = { li, id };
      await src.save(src.fc);
      changed();
    });
    const setRing = (f) => { f.geometry.coordinates = isArea ? [[...ring, ring[0]]] : ring; };
    S.handles = ring.map(([lon, lat], i) => {
      const h = L.marker([lat, lon], { draggable: true, icon: L.divIcon({ className: "me-vertex", iconSize: [14, 14] }) }).addTo(S.map);
      h.on("dragend", () => { const q = h.getLatLng(); ring[i] = [q.lng, q.lat]; save(setRing); });
      h.on("contextmenu", async (e) => {
        L.DomEvent.stop(e);
        const opts = isArea || i === 0 || i === ring.length - 1 ? ["Apagar este ponto"] : ["Apagar este ponto", "Dividir a linha aqui"];
        const choice = await menu(opts);
        if (choice === "Apagar este ponto" && ring.length > (isArea ? 3 : 2)) { ring.splice(i, 1); save(setRing); }
        if (choice === "Dividir a linha aqui") save((f, fc) => {
          f.geometry.coordinates = ring.slice(0, i + 1);
          fc.features.splice(id + 1, 0, { type: "Feature", properties: { ...f.properties, nome: `${f.properties?.nome || "linha"} (2)` }, geometry: { type: "LineString", coordinates: ring.slice(i) } });
        });
      });
      return h;
    });
  }
  // juntar: a linha selecionada com a próxima linha clicada (da mesma camada), pelas pontas mais próximas
  async function joinWith(li, id2) {
    const from = S.joinFrom; S.joinFrom = null; tipFor();
    if (!from || from.li !== li || from.id === id2) { tip("Só junto duas linhas diferentes da mesma camada."); return; }
    await guarded(async () => {
      const src = await shapeSet(li), a = src.fc.features[from.id], b = src.fc.features[id2];
      if (!a || !b || a.geometry?.type !== "LineString" || b.geometry?.type !== "LineString") { tip("Só junto linhas."); return; }
      const A = a.geometry.coordinates, B = b.geometry.coordinates;
      const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
      const opts = [[A, B], [A, [...B].reverse()], [[...A].reverse(), B], [[...A].reverse(), [...B].reverse()]];
      const [x, y] = opts.reduce((best, o) => (d(o[0].at(-1), o[1][0]) < d(best[0].at(-1), best[1][0]) ? o : best));
      a.geometry.coordinates = [...x, ...y.slice(d(x.at(-1), y[0]) < 1e-9 ? 1 : 0)];
      src.fc.features.splice(id2, 1);
      S.pendingSel = { li, id: from.id < id2 ? from.id : from.id - 1 };
      await src.save(src.fc);
      changed();
    });
  }
  function menu(items) {
    return new Promise((res) => {
      const d = document.createElement("dialog"); d.className = "md-dialog";
      d.innerHTML = `<div class="me-menu">${items.map((t) => `<button type="button" class="btn" data-i="${esc(t)}">${esc(t)}</button>`).join("")}<button type="button" class="btn" data-i="">Cancelar</button></div>`;
      document.body.append(d); d.addEventListener("close", () => d.remove()); d.showModal();
      d.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { res(b.dataset.i || null); d.close(); }));
    });
  }

  // ---------------------------------------------------------------- camadas (esquerda)
  function renderLayers() {
    const ul = S.root.querySelector("[data-layers]");
    const layers = S.slide.layers || [];
    if (!layers.length) { ul.innerHTML = `<li class="mpe-empty">Nenhuma camada ainda. Escolha Ponto, Linha ou Área e clique no mapa, ou use Nova camada.</li>`; return; }
    ul.innerHTML = layers.map((l, i) => {
      const k = KINDS[kindOf(l)] || ["map", "Camada", "item", "itens"];
      const n = S.entries?.find((e) => e.layer.index === i)?.layer.data.features.length;
      const count = n == null ? "" : `${n} ${n === 1 ? k[2] : k[3]}`;
      return `<li class="${i === S.layer ? "on" : ""}"><button type="button" class="mpe-l" data-pick="${i}" title="${esc(srcText(l))}">${ic(k[0])}<span class="mpe-ln">${esc(l.name || k[1])}</span><small>${esc(count)}</small></button>
        <button type="button" class="mpe-eye" data-eye="${i}" title="${S.hidden.has(i) ? "Mostrar" : "Esconder"} aqui no editor (não muda a apresentação)" aria-label="${S.hidden.has(i) ? "Mostrar" : "Esconder"} ${esc(l.name || k[1])}">${ic(S.hidden.has(i) ? "eye-off" : "eye")}</button></li>`;
    }).join("");
    S.ctx.hydrate?.(ul);
  }
  function onLayersClick(e) {
    const pick = e.target.closest("[data-pick]"), eye = e.target.closest("[data-eye]");
    if (eye) {
      const i = Number(eye.dataset.eye);
      S.hidden.has(i) ? S.hidden.delete(i) : S.hidden.add(i);
      const en = S.entries?.find((x) => x.layer.index === i);
      if (en && S.map) { if (S.hidden.has(i)) S.map.removeLayer(en.g); else { en.g.addTo(S.map); window.SagaMap.instance(S.mbox)?.pointsOnTop?.(); } }
      renderLayers();
    } else if (pick) { S.layer = Number(pick.dataset.pick); S.sel = null; clearHandles(); highlight(); renderLayers(); renderProps(); tipFor(); }
  }
  async function newLayerMenu() {
    const choice = await menu(["Pontos (uma planilha)", "Linhas e áreas (desenho)", "Regiões por valor (estados ou países)"]);
    if (!choice) return;
    const kind = choice.startsWith("Pontos") ? "pontos" : choice.startsWith("Linhas") ? "formas" : "regioes";
    await guarded(async () => {
      await newLayer(kind);
      S.sel = null;
      setMode(kind === "pontos" ? "ponto" : kind === "formas" ? "linha" : "selecionar");
      changed();
    });
  }

  // ---------------------------------------------------------------- propriedades (direita)
  const entryOf = (li) => S.entries?.find((x) => x.layer.index === li);
  function columnsOf(li) {
    return [...new Set((entryOf(li)?.layer.data.features || []).flatMap((f) => Object.keys(f.properties || {})))].filter((c) => !c.startsWith("_"));
  }
  function hintFor(l, col, cols) {
    const out = [];
    if (ADDR.includes(norm(col))) out.push("veio do lugar clicado; corrija se precisar");
    if (l.label === col) out.push("aparece escrito ao lado, no mapa");
    if (l.color === col) out.push("define a cor (cada valor, uma cor)");
    if (l.size === col) out.push("número: define o tamanho do ponto");
    const popup = Array.isArray(l.popup) ? l.popup.includes(col) : l.popup !== false && cols.indexOf(col) < 8;
    if (popup && l.label !== col) out.push("aparece no cartão ao clicar");
    if (!out.length) return "Fica guardado, mas não aparece no mapa (escolha em Rótulo ou Cartão, na camada).";
    const t = out.join("; ");
    return t[0].toUpperCase() + t.slice(1) + ".";
  }
  function renderProps() {
    const el = S.root.querySelector("[data-props]");
    el.innerHTML = S.sel ? featureProps() : layerProps() + mapProps();
    S.ctx.hydrate?.(el);
  }
  function featureProps() {
    const { li, id } = S.sel, l = slideLayer(li), hit = featureOf(li, id);
    if (!hit || !l) return "";
    const kind = kindOf(l), f = hit.f, g = f.geometry || {};
    const ro = !editable(l);
    if (kind === "regioes") {
      return `<section class="mpe-sec"><div class="mpe-kick">${ic("map")} Região · em "${esc(l.name || "Regiões")}"</div><h3>${esc(f.properties?.nome || id)}</h3>
        <label class="mpe-f"><span>Valor</span><input data-region="${esc(id)}" value="${esc(l.areas?.[id] ?? "")}" inputmode="decimal"><small>A cor da região vem deste número: quanto maior, mais forte.</small></label>
        <button type="button" class="btn mpe-del" data-del>${ic("trash-2")} Tirar esta região</button></section>`;
    }
    const isPt = g.type === "Point";
    const what = isPt ? "Ponto" : /Polygon/.test(g.type) ? "Área" : "Linha";
    const cols = columnsOf(li);
    const fields = (cols.length ? cols : ["nome"]).map((c) => {
      const vals = l.color === c ? [...new Set((hit.e.layer.data.features || []).map((x) => String(x.properties?.[c] ?? "").trim()).filter(Boolean))] : [];
      return `<label class="mpe-f"><span>${esc(c)}</span><input data-fp="${esc(c)}" value="${esc(f.properties?.[c] ?? "")}" ${vals.length ? `list="mpe-dl-${esc(norm(c))}"` : ""} ${ro ? "disabled" : ""}><small>${esc(hintFor(l, c, cols))}</small></label>${vals.length ? `<datalist id="mpe-dl-${esc(norm(c))}">${vals.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>` : ""}`;
    }).join("");
    let measure = "";
    if (isPt) { const [lon, lat] = g.coordinates; measure = `Posição ${lat.toFixed(5)}, ${lon.toFixed(5)}.${ro ? "" : " Arraste o ponto no mapa para mudar."}`; }
    else if (g.type === "LineString") measure = `Comprimento ${fmtLen(lineLen(g.coordinates))}.${ro ? "" : " Arraste os pontos brancos para mudar o traçado; botão direito num deles: apagar ou dividir."}`;
    else if (g.type === "Polygon") measure = `Área ${fmtArea(ringArea(g.coordinates[0].map(([a, b]) => [b, a])))}.${ro ? "" : " Arraste os cantos brancos para mudar; botão direito num deles: apagar."}`;
    const where = typeof l.points === "string" ? `Planilha ${l.points}, linha ${id}` : typeof l.geojson === "string" ? `Arquivo ${l.geojson}` : srcText(l);
    return `<section class="mpe-sec"><div class="mpe-kick">${ic(isPt ? "map-pin" : what === "Área" ? "pentagon" : "spline")} ${what} · em "${esc(l.name || KINDS[kind]?.[1] || "Camada")}"</div>
      <p class="mpe-src">${esc(where)}</p>
      ${ro ? `<p class="mpe-help">Este trajeto vem de um arquivo ${l.gpx ? "GPX" : "KML"}: aqui ele só se mostra. Para mudar, edite no programa de origem.</p>` : `<p class="mpe-help">Cada campo é uma informação deste ${what === "Área" ? "desenho" : what.toLowerCase()} (uma coluna da camada). Todos são opcionais.</p>`}
      ${fields}
      ${ro ? "" : `<div class="mpe-addf"><input data-newcol placeholder="Campo novo (ex.: status)" aria-label="Nome do campo novo"><button type="button" class="btn btn-small" data-addcol>${ic("plus")} Adicionar</button></div>`}
      <p class="mpe-measure">${esc(measure)}</p>
      <div class="mpe-row">${!ro && g.type === "LineString" ? `<button type="button" class="btn btn-small" data-join>Juntar com outra linha</button>` : ""}
      ${ro ? "" : `<button type="button" class="btn btn-small mpe-del" data-del>${ic("trash-2")} Excluir</button>`}</div></section>`;
  }
  function layerProps() {
    const layers = S.slide.layers || [];
    const l = layers[S.layer];
    if (!l) return `<section class="mpe-sec"><div class="mpe-kick">${ic("layers")} Camada</div><p class="mpe-help">Este mapa ainda não tem camadas. Escolha Ponto, Linha ou Área na coluna das ferramentas e clique no mapa: a camada nasce sozinha.</p></section>`;
    const kind = kindOf(l), k = KINDS[kind] || ["map", "Camada"];
    const cols = columnsOf(S.layer);
    const byCol = l.color && cols.includes(l.color);
    const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(cur ?? "") === v ? "selected" : ""}>${esc(t)}</option>`;
    const feats = entryOf(S.layer)?.layer.data.features || [];
    const nums = cols.filter((c) => feats.some((f) => String(f.properties?.[c] ?? "").trim()) && feats.every((f) => { const v = String(f.properties?.[c] ?? "").trim(); return !v || /^-?\d+([.,]\d+)?$/.test(v); }));
    const popup = Array.isArray(l.popup) ? l.popup : l.popup === false ? [] : cols.slice(0, 8);
    let style = "";
    if (kind === "regioes") {
      const rows = Object.entries(l.areas || {}).map(([c, v]) => `<tr><td>${esc(c)}</td><td><input data-region="${esc(c)}" value="${esc(v)}" inputmode="decimal" aria-label="Valor de ${esc(c)}"></td><td><button type="button" class="mpe-x" data-delregion="${esc(c)}" aria-label="Tirar ${esc(c)}">${ic("x")}</button></td></tr>`).join("");
      style = `<div class="mpe-h2">Valores</div><table class="mpe-table"><thead><tr><th>Sigla</th><th>Valor</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <div class="mpe-addf"><input data-newregion placeholder="SP, RJ… ou BR, PT…" aria-label="Sigla do estado ou país"><input data-newregionv placeholder="valor" inputmode="decimal" aria-label="Valor"><button type="button" class="btn btn-small" data-addregion>${ic("plus")} Pôr</button></div>
        <p class="mpe-help">Estados pela sigla (SP, MG…) ou países pelo código (BR, PT…). A cor mais forte é o maior valor.</p>
        <label class="mpe-f"><span>Unidade na legenda</span><input data-lp="legend" value="${esc(l.legend || "")}" placeholder="ex.: MW, mil habitantes"></label>`;
    } else if (kind) {
      style = `<div class="mpe-h2">Cor</div>
        <div class="mpe-seg"><button type="button" data-colormode="fixa" class="${byCol ? "" : "on"}">Uma cor</button><button type="button" data-colormode="coluna" class="${byCol ? "on" : ""}" ${cols.length ? "" : "disabled"}>Pela coluna</button></div>
        ${byCol ? `<label class="mpe-f"><select data-lp="color" aria-label="Coluna da cor">${cols.map((c) => opt(c, c, l.color)).join("")}</select><small>Cada valor ganha uma cor (número vira escala). A legenda mostra as cores.</small></label>`
          : `<div class="mpe-sw">${SWATCHES.map(([c, t]) => `<button type="button" data-swatch="${c}" class="${(l.color || "c1") === c ? "on" : ""}" title="${t}" aria-label="${t}" style="--sw:var(--c-${c},var(--${c},#888))"></button>`).join("")}</div>`}
        ${kind === "pontos" ? `<label class="mpe-f"><span>Tamanho do ponto</span><select data-lp="size">${opt("", "Todos iguais", l.size)}${nums.map((c) => opt(c, `Pela coluna ${c}`, l.size)).join("")}</select></label>` : ""}
        <label class="mpe-f"><span>Rótulo escrito no mapa</span><select data-lp="label">${opt("", "Nenhum", l.label)}${cols.map((c) => opt(c, c, l.label)).join("")}</select></label>
        ${cols.length ? `<div class="mpe-h2">O cartão (ao clicar) mostra</div><div class="mpe-checks">${cols.map((c) => `<label><input type="checkbox" data-popup="${esc(c)}" ${popup.includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>` : ""}`;
    }
    return `<section class="mpe-sec"><div class="mpe-kick">${ic(k[0])} Camada: ${esc(k[1])}</div>
      <label class="mpe-f mpe-big"><span>Nome na legenda</span><input data-lp="name" value="${esc(l.name || "")}"></label>
      <p class="mpe-src">${esc(srcText(l))}</p>
      ${kind === "pontos" || kind === "formas" || kind === "arquivo" ? `<p class="mpe-help">Clique num item no mapa para ver e mudar o que ele tem.</p>` : ""}
      ${style}
      <div class="mpe-h2">Ao apresentar</div>
      <label class="mpe-f"><span>Aparece</span><select data-lp="step">${opt("", S.slide.build ? "No clique, na ordem da lista" : "Desde o começo", l.step)}${[1, 2, 3, 4, 5, 6].map((n) => opt(String(n), `No ${n}º clique`, l.step)).join("")}</select></label>
      <label class="mpe-chk"><input type="checkbox" data-lp="viewfit" ${l.view === "fit" ? "checked" : ""}> Quando aparece, a câmera vai até esta camada</label>
      <div class="mpe-row"><button type="button" class="btn btn-small" data-move="-1" ${S.layer === 0 ? "disabled" : ""}>${ic("arrow-up")} Subir</button><button type="button" class="btn btn-small" data-move="1" ${S.layer === layers.length - 1 ? "disabled" : ""}>${ic("arrow-down")} Descer</button>
        <button type="button" class="btn btn-small mpe-del" data-dellayer>${ic("trash-2")} Tirar do mapa</button></div></section>`;
  }
  function mapProps() {
    const s = S.slide, opt = (v, t) => `<option value="${v}" ${(s.basemap || "ruas") === v ? "selected" : ""}>${t}</option>`;
    const fixed = s.view && s.view !== "fit";
    return `<section class="mpe-sec"><div class="mpe-kick">${ic("map")} O mapa</div>
      <label class="mpe-f"><span>Fundo</span><select data-mp="basemap">${opt("ruas", "Ruas")}${opt("claro", "Claro")}${opt("escuro", "Escuro")}${opt("satelite", "Satélite (se configurado)")}${opt("nenhum", "Sem fundo")}</select></label>
      <label class="mpe-chk"><input type="checkbox" data-mp="build" ${s.build ? "checked" : ""}> Uma camada por clique ao apresentar</label>
      <div class="mpe-h2">Enquadramento</div>
      <p class="mpe-help">${fixed ? "Fixo: abre como você deixou." : "Automático: mostra todos os dados."}</p>
      <div class="mpe-row"><button type="button" class="btn btn-small" data-vista>${ic("crosshair")} Usar a vista de agora</button>${fixed ? `<button type="button" class="btn btn-small" data-autovista>Voltar ao automático</button>` : ""}</div></section>`;
  }

  async function setFeatureProp(li, id, col, value) {
    const l = slideLayer(li);
    S.pendingSel = { li, id };
    if (kindOf(l) === "pontos") {
      const src = await pointRows(li), rows = src.rows;
      let c = rows[0].indexOf(col);
      if (c < 0) { rows[0].push(col); c = rows[0].length - 1; }
      if (!rows[id - 1]) return;
      rows[id - 1][c] = value;
      await src.save(rows);
    } else {
      const src = await shapeSet(li), f = src.fc.features[id];
      if (!f) return;
      f.properties = { ...(f.properties || {}), [col]: value };
      await src.save(src.fc);
    }
    changed();
  }
  async function deleteFeature() {
    const { li, id } = S.sel || {};
    const l = slideLayer(li);
    if (!l || !editable(l)) return;
    await guarded(async () => {
      S.sel = null; clearHandles();
      if (kindOf(l) === "regioes") { const a = { ...l.areas }; delete a[id]; l.areas = a; }
      else if (kindOf(l) === "pontos") { const src = await pointRows(li); src.rows.splice(id - 1, 1); await src.save(src.rows); }
      else { const src = await shapeSet(li); src.fc.features.splice(id, 1); await src.save(src.fc); }
      changed();
    });
  }
  function onPropsChange(e) {
    const t = e.target;
    if (t.dataset.newcol != null || t.dataset.newregion != null || t.dataset.newregionv != null) return;
    const l = slideLayer(S.layer);
    guarded(async () => {
      if (t.dataset.fp != null && S.sel) return setFeatureProp(S.sel.li, S.sel.id, t.dataset.fp, t.value.trim());
      if (t.dataset.region != null) { const reg = slideLayer(S.sel?.li ?? S.layer); reg.areas = { ...reg.areas, [t.dataset.region]: asValue(t.value) }; if (S.sel) S.pendingSel = { ...S.sel }; return changed(); }
      if (t.dataset.popup != null) {
        const cols = columnsOf(S.layer), cur = Array.isArray(l.popup) ? l.popup : l.popup === false ? [] : cols.slice(0, 8);
        l.popup = t.checked ? [...new Set([...cur, t.dataset.popup])] : cur.filter((c) => c !== t.dataset.popup);
        return changed();
      }
      if (t.dataset.lp) {
        const k = t.dataset.lp, v = t.type === "checkbox" ? t.checked : t.value.trim();
        if (k === "viewfit") { if (v) l.view = "fit"; else delete l.view; }
        else if (k === "step") { if (v === "") delete l.step; else l.step = Number(v); }
        else if (v === "" || v === false) delete l[k]; else l[k] = v;
        return changed();
      }
      if (t.dataset.mp) {
        const k = t.dataset.mp, v = t.type === "checkbox" ? t.checked : t.value;
        if (k === "build") { if (v) S.slide.build = true; else delete S.slide.build; } else S.slide[k] = v;
        return changed();
      }
    });
  }
  function onPropsClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const l = slideLayer(S.layer);
    if (b.dataset.del != null) return deleteFeature();
    if (b.dataset.join != null) { S.joinFrom = { ...S.sel }; tipFor(); return; }
    if (b.dataset.addcol != null) {
      const col = S.root.querySelector("[data-newcol]").value.trim();
      if (!col || !S.sel) return;
      return guarded(() => setFeatureProp(S.sel.li, S.sel.id, col, ""));
    }
    guarded(async () => {
      if (b.dataset.colormode === "coluna") { const c = columnsOf(S.layer)[0]; if (c) { l.color = c; return changed(); } }
      if (b.dataset.colormode === "fixa") { l.color = "c1"; delete l.colors; return changed(); }
      if (b.dataset.swatch) { l.color = b.dataset.swatch; delete l.colors; return changed(); }
      if (b.dataset.delregion) { const a = { ...l.areas }; delete a[b.dataset.delregion]; l.areas = a; return changed(); }
      if (b.dataset.addregion != null) {
        const code = S.root.querySelector("[data-newregion]").value.trim().toUpperCase(), v = S.root.querySelector("[data-newregionv]").value;
        if (!code) return;
        l.areas = { ...(l.areas || {}), [code]: asValue(v || 0) };
        return changed();
      }
      if (b.dataset.move) {
        const to = S.layer + Number(b.dataset.move), layers = S.slide.layers;
        if (to < 0 || to >= layers.length) return;
        [layers[S.layer], layers[to]] = [layers[to], layers[S.layer]];
        S.layer = to; S.hidden.clear();
        return changed();
      }
      if (b.dataset.dellayer != null) {
        const ok = await menu([`Tirar "${l.name || "esta camada"}" do mapa`]);
        if (!ok) return;
        S.slide.layers.splice(S.layer, 1);
        S.layer = Math.max(0, S.layer - 1); S.hidden.clear();
        return changed();
      }
      if (b.dataset.vista != null && S.map) { const c = S.map.getCenter(); S.slide.view = { center: [Number(c.lat.toFixed(5)), Number(c.lng.toFixed(5))], zoom: Math.round(S.map.getZoom() * 4) / 4 }; return changed(); }
      if (b.dataset.autovista != null) { delete S.slide.view; return changed(); }
    });
  }

  // compatível com map-data.js: start abre a tela; stop fecha; resume volta depois de gravar
  return { start: open, stop: close, resume, active: () => !!S, key: () => S?.key };
})();
