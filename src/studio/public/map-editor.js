// Editor do slide de mapa no Studio (carregado só quando alguém clica em "Editar no mapa", por map-data.js).
// Ferramentas: Mover (arrastar pontos e vértices; dividir e juntar linhas), Ponto (clique cria uma linha na planilha da
// camada, com o endereço preenchido), Linha e Área (desenho; "Seguir as ruas" liga os cliques pelo serviço de rotas),
// Régua e "Usar esta vista". Pontos vão para o CSV da camada; linhas e áreas, para o GeoJSON da camada. Comprimento e
// área aparecem enquanto desenha. Nada aqui inventa coordenada: vem do clique, do serviço de rotas ou do arquivo.
window.SagaMapEditor = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const LAT = ["lat", "latitude"], LON = ["lon", "lng", "long", "longitude"], ADDR = ["endereco", "address", "logradouro", "rua"];
  const post = async (url, body) => { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`); return j; };
  const getJSON = async (url) => { const r = await fetch(url); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`); return j; };
  const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);
  const fmtArea = (a) => (a >= 1e6 ? `${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km²` : a >= 1e4 ? `${(a / 1e4).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha` : `${Math.round(a)} m²`);
  // área de um anel [lat, lon] na esfera (m²)
  const ringArea = (pts) => { const R = 6371008.8, rad = Math.PI / 180; let s = 0; for (let i = 0; i < pts.length; i++) { const [la1, lo1] = pts[i], [la2, lo2] = pts[(i + 1) % pts.length]; s += (lo2 - lo1) * rad * (2 + Math.sin(la1 * rad) + Math.sin(la2 * rad)); } return Math.abs((s * R * R) / 2); };

  let S = null; // estado do editor: { box, slide, commit, ctx, map, mode, … }

  function bar() {
    const b = document.createElement("div");
    b.className = "me-bar";
    const L = S.slide.layers || [];
    const pointLayers = L.map((l, i) => [l, i]).filter(([l]) => typeof l.points === "string");
    const shapeLayers = L.map((l, i) => [l, i]).filter(([l]) => typeof l.geojson === "string");
    b.innerHTML = `<div class="me-tools">${[["mover", "Mover"], ["ponto", "Ponto"], ["linha", "Linha"], ["area", "Área"], ["regua", "Régua"]].map(([m, t]) => `<button type="button" data-mode="${m}" class="${S.mode === m ? "on" : ""}">${t}</button>`).join("")}
      <label class="me-ruas" title="Liga os cliques da linha pelas ruas (serviço de rotas)"><input type="checkbox" data-ruas ${S.ruas ? "checked" : ""}> Seguir as ruas</label>
      <select data-modo title="Como andar"><option value="pe">a pé</option><option value="carro">de carro</option><option value="bicicleta">de bicicleta</option></select>
      <button type="button" data-vista title="Grava o enquadramento atual no slide">Usar esta vista</button>
      <button type="button" data-fim class="me-done">Concluir</button></div>
      <div class="me-row"><label>Pontos vão para <select data-alvo-ponto>${pointLayers.map(([l, i]) => `<option value="${i}">${esc(l.name || l.points)}</option>`).join("")}<option value="novo">nova camada (contexto/pontos.csv)</option></select></label>
      <label>Linhas e áreas vão para <select data-alvo-forma>${shapeLayers.map(([l, i]) => `<option value="${i}">${esc(l.name || l.geojson)}</option>`).join("")}<option value="novo">nova camada (contexto/desenhos.geojson)</option></select></label>
      <span class="me-status" data-status></span></div>`;
    b.querySelector("[data-modo]").value = S.modo;
    b.querySelectorAll("[data-mode]").forEach((x) => (x.onclick = () => setMode(x.dataset.mode)));
    b.querySelector("[data-ruas]").onchange = (e) => { S.ruas = e.target.checked; };
    b.querySelector("[data-modo]").onchange = (e) => { S.modo = e.target.value; };
    b.querySelector("[data-vista]").onclick = useView;
    b.querySelector("[data-fim]").onclick = () => { if (S.draft) finishShape(); else stop(); };
    for (const ev of ["pointerdown", "mousedown", "click", "dblclick", "wheel", "keydown"]) b.addEventListener(ev, (e) => e.stopPropagation());
    return b;
  }
  const status = (t) => { const s = S?.host.querySelector(".me-bar [data-status]"); if (s) s.textContent = t || ""; };

  function setMode(m) {
    S.mode = m;
    clearDraft();
    S.host.querySelectorAll(".me-bar [data-mode]").forEach((x) => x.classList.toggle("on", x.dataset.mode === m));
    S.box.classList.toggle("me-drawing", m !== "mover");
    status({ mover: "Arraste um ponto para corrigir a posição; clique numa linha ou área para editar os vértices (botão direito num vértice: apagar, dividir).", ponto: "Clique no mapa onde fica o ponto novo.", linha: "Clique para cada ponto da linha; duplo clique (ou Concluir) termina.", area: "Clique para cada canto da área; duplo clique (ou Concluir) fecha.", regua: "Clique nos pontos para medir; Concluir zera." }[m]);
    S.map.doubleClickZoom[m === "linha" || m === "area" ? "disable" : "enable"]();
  }

  // ---------------------------------------------------------------- desenho (linha, área, régua)
  function clearDraft() { S.draft?.layer.remove(); S.draft?.marks.forEach((x) => x.remove()); S.draft = null; }
  async function addVertex(ll) {
    const L = window.L;
    if (!S.draft) S.draft = { pts: [], layer: (S.mode === "area" ? L.polygon([], { color: "#d6336c", weight: 4, fillOpacity: 0.15 }) : L.polyline([], { color: "#d6336c", weight: 5, dashArray: S.mode === "regua" ? "8 8" : null })).addTo(S.map), marks: [] };
    const d = S.draft;
    const last = d.pts.at(-1);
    if (S.mode === "linha" && S.ruas && last) {
      status("procurando o caminho pelas ruas…");
      try {
        const r = await post("api/mapa/rota", { pontos: [last, [ll.lat, ll.lng]], modo: S.modo });
        d.pts.push(...r.coords.slice(1).map(([lon, lat]) => [lat, lon]));
      } catch (e) { status(e.message); return; }
    } else d.pts.push([ll.lat, ll.lng]);
    d.marks.push(L.circleMarker(ll, { radius: 5, color: "#d6336c", fillOpacity: 1 }).addTo(S.map));
    d.layer.setLatLngs(d.pts);
    const len = d.pts.reduce((s, p, i) => (i ? s + S.map.distance(d.pts[i - 1], p) : 0), 0);
    status(S.mode === "area" && d.pts.length > 2 ? `área: ${fmtArea(ringArea(d.pts))}` : `comprimento: ${fmtLen(len)}`);
  }

  async function finishShape() {
    const d = S.draft;
    if (!d) return;
    if (S.mode === "regua") { clearDraft(); status("Régua zerada."); return; }
    if (d.pts.length < (S.mode === "area" ? 3 : 2)) { status("Faltam pontos."); return; }
    const nome = await ask(S.mode === "area" ? "Nome da área" : "Nome da linha", "");
    if (nome == null) return;
    const coords = d.pts.map(([lat, lon]) => [lon, lat]);
    const geometry = S.mode === "area" ? { type: "Polygon", coordinates: [[...coords, coords[0]]] } : { type: "LineString", coordinates: coords };
    clearDraft();
    await saveShape({ type: "Feature", properties: { nome }, geometry });
  }

  // ---------------------------------------------------------------- gravação
  async function shapeTarget() {
    const sel = S.host.querySelector(".me-bar [data-alvo-forma]").value;
    if (sel !== "novo") return S.slide.layers[Number(sel)].geojson;
    const p = "contexto/desenhos.geojson";
    (S.slide.layers ||= []).push({ name: "Desenhos", geojson: p, label: "nome" });
    return p;
  }
  async function readGeo(p) {
    const r = await fetch(`api/project/file?path=${encodeURIComponent(p)}`);
    if (!r.ok) return { type: "FeatureCollection", features: [] };
    try { const j = await r.json(); return j.type === "FeatureCollection" ? j : { type: "FeatureCollection", features: j.type === "Feature" ? [j] : [] }; } catch { return { type: "FeatureCollection", features: [] }; }
  }
  const writeGeo = (p, fc) => post("api/project/write", { path: p, text: JSON.stringify(fc, null, 1) });
  async function saveShape(feature) {
    const p = await shapeTarget();
    const fc = await readGeo(p);
    fc.features.push(feature);
    try { await writeGeo(p, fc); } catch (e) { status(`Não gravou: ${e.message}`); return; }
    status(`Gravado em ${p}.`);
    S.commit();
  }

  async function savePoint(ll) {
    const sel = S.host.querySelector(".me-bar [data-alvo-ponto]").value;
    let p, rows;
    if (sel === "novo") {
      p = "contexto/pontos.csv";
      const cur = await getJSON(`api/project/sheet?path=${encodeURIComponent(p)}&all=1`).catch(() => null);
      rows = cur?.sheets?.[0]?.rows?.length ? cur.sheets[0].rows : [["nome", "endereco", "latitude", "longitude"]];
      if (!(S.slide.layers || []).some((l) => l.points === p)) (S.slide.layers ||= []).push({ name: "Pontos", points: p, label: "nome" });
    } else {
      p = S.slide.layers[Number(sel)].points;
      rows = (await getJSON(`api/project/sheet?path=${encodeURIComponent(p)}&all=1`)).sheets[0].rows.map((r) => [...r]);
    }
    const head = rows[0].map((h) => String(h).trim());
    let iLat = head.findIndex((h) => LAT.includes(norm(h))), iLon = head.findIndex((h) => LON.includes(norm(h)));
    if (iLat < 0 || iLon < 0) { head.push("latitude", "longitude"); rows[0] = head; iLat = head.length - 2; iLon = head.length - 1; }
    const iAddr = head.findIndex((h) => ADDR.includes(norm(h)));
    let endereco = "";
    if (iAddr >= 0) { status("procurando o endereço deste ponto…"); try { endereco = (await post("api/mapa/endereco", { lat: ll.lat, lon: ll.lng })).endereco || ""; } catch (e) { status(e.message); } }
    const values = await form(head.filter((_, i) => i !== iLat && i !== iLon), { [head[iAddr]]: endereco });
    if (!values) { status(""); return; }
    const row = head.map((h, i) => (i === iLat ? ll.lat.toFixed(6) : i === iLon ? ll.lng.toFixed(6) : values[h] ?? ""));
    rows.push(row);
    try { await post("api/project/sheet-write", { path: p, rows }); } catch (e) { status(`Não gravou: ${e.message}`); return; }
    status(`Ponto gravado em ${p} (linha ${rows.length}).`);
    S.commit();
  }

  async function movePoint(layerIdx, linha, ll) {
    const p = S.slide.layers[layerIdx]?.points;
    if (typeof p !== "string" || !linha) return;
    const rows = (await getJSON(`api/project/sheet?path=${encodeURIComponent(p)}&all=1`)).sheets[0].rows.map((r) => [...r]);
    const head = rows[0].map((h) => String(h).trim());
    const iLat = head.findIndex((h) => LAT.includes(norm(h))), iLon = head.findIndex((h) => LON.includes(norm(h)));
    if (iLat < 0 || iLon < 0 || !rows[linha - 1]) return;
    rows[linha - 1][iLat] = ll.lat.toFixed(6); rows[linha - 1][iLon] = ll.lng.toFixed(6);
    await post("api/project/sheet-write", { path: p, rows });
    status(`Posição atualizada (linha ${linha}).`);
    S.commit();
  }

  // ---------------------------------------------------------------- vértices: arrastar, apagar, dividir, juntar
  async function editShape(entry, lyr) {
    const L = window.L, p = entry.layer.source;
    if (typeof p !== "string" || !/\.geojson$/i.test(p)) { status("Só linhas e áreas de GeoJSON se editam aqui (GPX e KML: abra no programa de origem)."); return; }
    S.handles?.forEach((h) => h.remove());
    const fc = await readGeo(p);
    const idx = entry.layer.data.features.indexOf(lyr.feature);
    const f = fc.features[idx];
    if (!f) return;
    const isArea = f.geometry.type === "Polygon";
    const ring = isArea ? f.geometry.coordinates[0].slice(0, -1) : f.geometry.coordinates;
    const save = async () => {
      f.geometry.coordinates = isArea ? [[...ring, ring[0]]] : ring;
      await writeGeo(p, fc); S.commit();
    };
    S.handles = ring.map(([lon, lat], i) => {
      const h = L.marker([lat, lon], { draggable: true, icon: L.divIcon({ className: "me-vertex", iconSize: [14, 14] }) }).addTo(S.map);
      h.on("dragend", () => { const q = h.getLatLng(); ring[i] = [q.lng, q.lat]; save(); });
      h.on("contextmenu", async (e) => {
        L.DomEvent.stop(e);
        const choice = await menu(isArea || i === 0 || i === ring.length - 1 ? ["Apagar vértice"] : ["Apagar vértice", "Dividir a linha aqui"]);
        if (choice === "Apagar vértice" && ring.length > (isArea ? 3 : 2)) { ring.splice(i, 1); save(); }
        if (choice === "Dividir a linha aqui") {
          const a = ring.slice(0, i + 1), b = ring.slice(i);
          f.geometry.coordinates = a;
          fc.features.splice(idx + 1, 0, { type: "Feature", properties: { ...f.properties, nome: `${f.properties?.nome || "linha"} (2)` }, geometry: { type: "LineString", coordinates: b } });
          await writeGeo(p, fc); S.commit();
        }
      });
      return h;
    });
    if (!isArea) {
      status("Arraste os vértices; botão direito apaga ou divide. Para juntar com outra linha, clique em Juntar e depois na outra.");
      const j = document.createElement("button"); j.type = "button"; j.textContent = "Juntar com outra linha"; j.className = "me-join";
      S.host.querySelector(".me-bar .me-row").append(j);
      j.onclick = () => { S.joinFrom = { p, fc, idx }; status("Clique na outra linha para juntar."); j.remove(); };
    }
  }
  async function joinWith(entry, lyr) {
    const from = S.joinFrom; S.joinFrom = null;
    if (!from || entry.layer.source !== from.p) { status("Só junto linhas da mesma camada."); return; }
    const idx2 = entry.layer.data.features.indexOf(lyr.feature);
    const a = from.fc.features[from.idx], b = from.fc.features[idx2];
    if (!a || !b || a === b || a.geometry.type !== "LineString" || b.geometry.type !== "LineString") return;
    const A = a.geometry.coordinates, B = b.geometry.coordinates;
    const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
    // liga pelas pontas mais próximas
    const opts = [[A, B], [A, [...B].reverse()], [[...A].reverse(), B], [[...A].reverse(), [...B].reverse()]];
    const [x, y] = opts.reduce((best, o) => (d(o[0].at(-1), o[1][0]) < d(best[0].at(-1), best[1][0]) ? o : best));
    a.geometry.coordinates = [...x, ...y.slice(d(x.at(-1), y[0]) < 1e-9 ? 1 : 0)];
    from.fc.features.splice(idx2, 1);
    await writeGeo(from.p, from.fc); S.commit();
  }

  function useView() {
    const c = S.map.getCenter();
    S.slide.view = { center: [Number(c.lat.toFixed(5)), Number(c.lng.toFixed(5))], zoom: Math.round(S.map.getZoom() * 4) / 4 };
    status("Enquadramento gravado no slide.");
    S.commit();
  }

  // ---------------------------------------------------------------- caixinhas (formulário e menu)
  function modal(html) { const d = document.createElement("dialog"); d.className = "md-dialog"; d.innerHTML = html; document.body.append(d); d.addEventListener("close", () => d.remove()); d.showModal(); return d; }
  function ask(label, value) {
    return new Promise((res) => {
      const d = modal(`<h3>${esc(label)}</h3><input class="me-input" value="${esc(value)}"><div class="md-row"><button type="button" class="btn" data-no>Cancelar</button><button type="button" class="btn btn-primary" data-yes>Gravar</button></div>`);
      const i = d.querySelector("input"); i.focus();
      d.querySelector("[data-yes]").onclick = () => { res(i.value.trim()); d.close(); };
      d.querySelector("[data-no]").onclick = () => { res(null); d.close(); };
      i.onkeydown = (e) => { if (e.key === "Enter") d.querySelector("[data-yes]").click(); };
    });
  }
  function form(fields, initial) {
    return new Promise((res) => {
      const d = modal(`<h3>Ponto novo</h3>${fields.map((f) => `<label class="me-field">${esc(f)}<input data-f="${esc(f)}" value="${esc(initial[f] ?? "")}"></label>`).join("")}<div class="md-row"><button type="button" class="btn" data-no>Cancelar</button><button type="button" class="btn btn-primary" data-yes>Gravar</button></div>`);
      d.querySelector("input")?.focus();
      d.querySelector("[data-yes]").onclick = () => { res(Object.fromEntries([...d.querySelectorAll("[data-f]")].map((i) => [i.dataset.f, i.value.trim()]))); d.close(); };
      d.querySelector("[data-no]").onclick = () => { res(null); d.close(); };
    });
  }
  function menu(items) {
    return new Promise((res) => {
      const d = modal(`<div class="me-menu">${items.map((t) => `<button type="button" class="btn" data-i="${esc(t)}">${esc(t)}</button>`).join("")}<button type="button" class="btn" data-i="">Cancelar</button></div>`);
      d.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { res(b.dataset.i || null); d.close(); }));
    });
  }

  // ---------------------------------------------------------------- ligar e desligar
  function wire() {
    const inst = window.SagaMap.instance(S.box);
    if (!inst?.map) return false;
    S.map = inst.map;
    S.box.classList.add("me-on");
    S.host.querySelectorAll(":scope > .me-bar").forEach((b) => b.remove());
    S.host.append(bar());
    S.map.on("click", onClick);
    S.map.on("dblclick", onDbl);
    // pontos arrastáveis (Mover) e formas que abrem os vértices
    inst.layers.forEach((entry, li) => entry.g.eachLayer((lyr) => {
      lyr.off("click"); lyr.closePopup?.(); lyr.unbindPopup?.();
      lyr.on("click", (e) => { window.L.DomEvent.stop(e); if (S.mode !== "mover") return onClick(e); if (S.joinFrom) return joinWith(entry, lyr); if (!lyr.getLatLng) editShape(entry, lyr); });
      if (lyr.getLatLng) lyr.on("mousedown", (e) => {
        if (S.mode !== "mover") return;
        window.L.DomEvent.stop(e);
        S.map.dragging.disable();
        const move = (ev) => lyr.setLatLng(ev.latlng);
        const up = (ev) => { S.map.off("mousemove", move); S.map.off("mouseup", up); S.map.dragging.enable(); movePoint(li, lyr.feature?.properties?._linha, ev.latlng); };
        S.map.on("mousemove", move); S.map.on("mouseup", up);
      });
    }));
    setMode(S.mode);
    return true;
  }
  function onClick(e) {
    if (!S) return;
    if (S.mode === "ponto") savePoint(e.latlng);
    else if (S.mode === "linha" || S.mode === "area" || S.mode === "regua") addVertex(e.latlng);
  }
  function onDbl(e) { if (S && (S.mode === "linha" || S.mode === "area")) { window.L.DomEvent.stop(e); finishShape(); } }

  function start(box, slide, commit, ctx) {
    S = { box, host: document.getElementById("canvas-viewport") || box, slide, commit, ctx, mode: S?.mode || "mover", ruas: S?.ruas ?? true, modo: S?.modo || "pe", key: slide.uid || slide.title };
    if (!wire()) { window.SagaMap.mount(box.closest(".slide") || box).then(() => S && wire()); }
  }
  function stop() {
    if (!S) return;
    clearDraft(); S.handles?.forEach((h) => h.remove());
    S.host.querySelectorAll(":scope > .me-bar").forEach((b) => b.remove());
    S.box.classList.remove("me-on", "me-drawing");
    const box = S.box; S = null;
    window.SagaMapData?.editorStopped?.(box);
  }
  // o slide redesenhou (gravou algo): o editor volta no mesmo modo, na caixa nova
  function resume(box, slide, commit, ctx) { if (S && (slide.uid || slide.title) === S.key) start(box, slide, commit, ctx); }
  return { start, stop, resume, active: () => !!S, key: () => S?.key };
})();
