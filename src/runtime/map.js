// Mapa ao vivo do slide `map` (dados montados por src/map.js). Regras:
//  - preguiçoso: só monta quando o slide aparece (na apresentação) ou quando o Studio pede (prévia grande); o Leaflet
//    só carrega na primeira vez (no HTML exportado ele já vem embutido);
//  - uma tentativa e para: se os primeiros tiles falham sem nenhum sucesso, o fundo sai (as camadas ficam), aparece o
//    aviso, e nenhum outro mapa desta sessão tenta de novo até alguém clicar em "Tentar de novo";
//  - nada de baixar tiles fora da tela; atribuição sempre visível.
(function () {
  const FALHAS = 6; // tiles que podem falhar, sem nenhum sucesso, antes de desligar o fundo
  const KEY = "sagadeck.mapa.fundo";
  const store = { get() { try { return sessionStorage.getItem(KEY); } catch { return null; } }, set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* sem armazenamento: só nesta página */ } } };
  let broken = store.get() === "falhou";
  let loader;

  function load() {
    if (window.L) return Promise.resolve();
    return loader ||= new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-leaflet]')) { const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "leaflet.css"; css.dataset.leaflet = "1"; document.head.append(css); }
      const s = document.createElement("script"); s.src = "leaflet.js"; s.onload = resolve;
      s.onerror = () => { loader = null; s.remove(); reject(new Error("Não foi possível carregar o mapa.")); };
      document.head.append(s);
    });
  }

  // cor do tema (s1…, em, #hex) em rgb, lida do próprio slide
  function resolver(box) {
    const probe = document.createElement("i"); probe.style.display = "none"; box.append(probe);
    const cache = {};
    const rgb = (c) => {
      if (cache[c]) return cache[c];
      // a mesma regra de src/map.js (mapColorCSS): paleta do tema c1…c5 com recuo no destaque
      probe.style.color = /^#?[0-9a-f]{6}$/i.test(c) ? `#${c.replace("#", "")}` : /^(c\d|accent|alert|ink|paper)$/.test(c) ? `var(--c-${c},var(--em))` : `var(--${c})`;
      const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) || [0, 0, 0];
      return (cache[c] = m.slice(0, 3).map(Number));
    };
    const css = (c) => `rgb(${rgb(c).join(",")})`;
    const mix = (a, b, t) => `rgb(${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t)).join(",")})`;
    return { css, mix, done: () => probe.remove() };
  }
  const num = (v) => { const s = String(v ?? "").trim().replace(/^R\$/i, "").replace(/%$/, "").replace(/\s/g, ""); const n = Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".")); return s !== "" && Number.isFinite(n) ? n : null; };
  const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString(document.documentElement.lang || "pt-BR", { maximumFractionDigits: 1 }) : "");
  const escHTML = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // exportando (PDF, PowerPoint, fotos) também sem animação: a foto sai no lugar final
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "none" || document.documentElement.classList.contains("export");

  const live = new Map(); // .map-box -> estado
  let readyResolve, readyPromise = Promise.resolve();

  function notice(box, text, retry) {
    let n = box.querySelector(".map-notice");
    if (!n) { n = document.createElement("div"); n.className = "map-notice f-label"; box.append(n); }
    n.innerHTML = `<span>${escHTML(text)}</span>${retry ? '<button type="button">Tentar de novo</button>' : ""}`;
    n.querySelector("button")?.addEventListener("click", (e) => { e.stopPropagation(); store.set(null); broken = false; n.remove(); const st = live.get(box); if (st) { dispose(box); mount(box.closest(".slide") || box.parentElement, { force: true }); } });
  }

  async function mountBox(box) {
    if (live.has(box) || box.dataset.mapMounted) return;
    box.dataset.mapMounted = "pending";
    let m;
    try { m = JSON.parse(box.querySelector(".map-data").textContent); } catch { box.dataset.mapMounted = "error"; return; }
    let settle; const settled = new Promise((r) => (settle = r));
    const st = { m, settled, map: null, layers: [], tilesDone: false };
    live.set(box, st);
    try { await load(); } catch (e) { notice(box, e.message); box.dataset.mapMounted = "error"; settle(); return; }
    const L = window.L;
    const el = box.querySelector(".map-live");
    const map = L.map(el, { zoomControl: true, attributionControl: true, keyboard: false, worldCopyJump: true, zoomSnap: 0.25, fadeAnimation: !reduced(), zoomAnimation: !reduced() });
    st.map = map;
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    // a roda e o arrastar mexem no mapa, não trocam de slide
    for (const ev of ["wheel", "pointerdown", "mousedown", "touchstart", "click", "keydown"]) el.addEventListener(ev, (e) => e.stopPropagation());

    // fundo: antes de ligar a camada, testa UM tile (o do centro). Se ele falha, nenhum outro é pedido e nenhum
    // outro mapa desta sessão tenta; se passa, a camada liga (e ainda desiste se os primeiros falharem todos)
    const wantSat = m.basemap === "satelite";
    const tiles = m.basemap === "nenhum" ? null : (wantSat && m.tiles?.satelite) || m.tiles?.tiles || null;
    if (wantSat && !m.tiles?.satelite) notice(box, "Satélite não configurado nesta máquina (Configurar mapa); mostrando as ruas.");
    const giveUp = () => {
      broken = true; store.set("falhou"); box.dataset.mapTiles = "falhou";
      notice(box, "Mapa de fundo indisponível nesta rede. As camadas continuam.", true);
      st.tilesDone = true; settle();
    };
    const startTiles = () => {
      if (!tiles) { st.tilesDone = true; return; }
      if (broken) { box.dataset.mapTiles = "falhou"; notice(box, "Mapa de fundo indisponível nesta rede. As camadas continuam.", true); st.tilesDone = true; return; }
      const z = Math.round(map.getZoom()), c = map.project(map.getCenter(), z).divideBy(256).floor();
      const probe = new Image();
      probe.onerror = () => { if (live.get(box) === st) giveUp(); };
      probe.onload = () => {
        if (live.get(box) !== st) return;
        let ok = 0, fail = 0;
        const t = L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom || 19 });
        t.on("tileload", () => { ok++; });
        t.on("tileerror", () => { fail++; if (!ok && fail >= FALHAS) { map.removeLayer(t); giveUp(); } });
        t.on("load", () => { st.tilesDone = true; settle(); });
        t.addTo(map);
      };
      probe.src = L.Util.template(tiles.url, { z, x: c.x, y: c.y, s: "a", r: "" });
    };

    // camadas
    const col = resolver(box);
    const legend = document.createElement("div"); legend.className = "map-legend f-body";
    m.layers.forEach((layer, i) => {
      const s = layer.style;
      const hidden = new Set();
      const colorOf = (f) => {
        const v = s.colorBy ? f.properties?.[s.colorBy] : null;
        if (s.scale) { const n = num(v); const t = n == null || s.scale.max === s.scale.min ? 1 : (n - s.scale.min) / (s.scale.max - s.scale.min); return col.mix("surface", "em", 0.2 + 0.8 * t); }
        const cat = s.categories?.find((c) => c.value === String(v ?? "").trim());
        return col.css(cat?.color || s.color || "c1");
      };
      const radius = (f) => { if (!s.sizeBy) return 14; const n = num(f.properties?.[s.sizeBy]); const r = s.sizeScale; return n == null || r.max === r.min ? 16 : 9 + 24 * Math.sqrt((n - r.min) / (r.max - r.min)); }; // em px do slide (1920)
      const card = (f) => {
        const p = f.properties || {};
        const title = s.label ? p[s.label] : p.nome || p.name || "";
        const rows = s.popup.filter((c) => c !== s.label).map((c) => `<tr><th>${escHTML(c)}</th><td>${escHTML(p[c])}</td></tr>`).join("");
        return `<div class="map-card-in">${title ? `<b>${escHTML(title)}</b>` : ""}${rows ? `<table>${rows}</table>` : ""}</div>`;
      };
      const g = L.geoJSON(layer.data, {
        filter: (f) => !s.colorBy || !hidden.has(String(f.properties?.[s.colorBy] ?? "").trim()),
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: radius(f), color: col.css("bg"), weight: 2.5, fillColor: colorOf(f), fillOpacity: 0.92 }),
        style: (f) => (f.geometry.type.includes("Polygon") ? { color: colorOf(f), weight: 2, fillColor: colorOf(f), fillOpacity: layer.kind === "areas" ? 0.75 : 0.32 } : { color: colorOf(f), weight: 5, opacity: 0.95 }),
        onEachFeature: (f, lyr) => {
          if (s.popup.length || s.label) lyr.bindPopup(card(f), { className: "map-card", maxWidth: 420 });
          // no Studio, clicar no ponto seleciona a linha da planilha aberta (map-data.js)
          lyr.on("click", () => document.dispatchEvent(new CustomEvent("sagamap:ponto", { detail: { path: layer.source, linha: f.properties?._linha } })));
          if (s.label && f.properties?.[s.label] != null && layer.data.features.length <= 60) lyr.bindTooltip(escHTML(f.properties[s.label]), { permanent: true, direction: "top", offset: [0, -10], className: "map-label" });
        },
      });
      const entry = { layer, g, on: layer.step == null, hidden };
      st.layers.push(entry);
      if (entry.on) g.addTo(map);
      // legenda: o nome liga/desliga a camada; cada categoria liga/desliga os seus pontos
      const item = document.createElement("div"); item.className = "map-leg-layer"; item.dataset.layer = i;
      const cats = s.categories ? s.categories.map((c) => `<button type="button" class="map-leg-cat" data-cat="${escHTML(c.value)}"><i style="background:${col.css(c.color)}"></i>${escHTML(c.value)}</button>`).join("") : "";
      const scale = s.scale ? `<div class="map-leg-scale"><span>${escHTML(layer.prefix + fmt(s.scale.min) + layer.suffix)}</span><i style="background:linear-gradient(90deg,${col.mix("surface", "em", 0.2)},${col.css("em")})"></i><span>${escHTML(layer.prefix + fmt(s.scale.max) + layer.suffix)}</span></div>` : "";
      item.innerHTML = `<button type="button" class="map-leg-name">${!s.categories && !s.scale ? `<i style="background:${col.css(s.color || "c1")}"></i>` : ""}${escHTML(layer.name)}${layer.legend ? ` <small>${escHTML(layer.legend)}</small>` : ""}</button>${cats}${scale}`;
      item.querySelector(".map-leg-name").onclick = (e) => { e.stopPropagation(); entry.manualOff = !entry.manualOff; sync(entry); item.classList.toggle("off", entry.manualOff); };
      item.querySelectorAll(".map-leg-cat").forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        const v = b.dataset.cat; hidden.has(v) ? hidden.delete(v) : hidden.add(v); b.classList.toggle("off", hidden.has(v));
        g.clearLayers(); g.addData(layer.data);
      }));
      item.hidden = !entry.on;
      entry.legend = item;
      legend.append(item);
    });
    col.done();
    if (m.layers.length) box.append(legend);
    const sync = (entry) => {
      const show = entry.on && !entry.manualOff;
      if (show && !map.hasLayer(entry.g)) entry.g.addTo(map); else if (!show && map.hasLayer(entry.g)) map.removeLayer(entry.g);
      if (entry.legend) entry.legend.hidden = !entry.on;
    };

    // enquadramento: o do slide, senão os dados, senão o mundo
    const fit = (b, fly) => { if (!b) return; const opts = { padding: [48, 48], maxZoom: 17 }; fly && !reduced() ? map.flyToBounds(b, { ...opts, duration: 1.6 }) : map.fitBounds(b, opts); };
    const go = (v, fly) => { if (!v) return; if (v === "fit") return; fly && !reduced() ? map.flyTo([v.center[0], v.center[1]], v.zoom, { duration: 1.6 }) : map.setView([v.center[0], v.center[1]], v.zoom); };
    if (m.view && m.view !== "fit") go(m.view); else if (m.bounds) fit(m.bounds); else map.setView([0, 0], 2);
    startTiles();

    // camada por clique: os marcadores invisíveis data-step do slide ganham "in" (src/runtime/runtime.js)
    const steps = [...box.querySelectorAll(".map-step")];
    const apply = (fly) => {
      let lastView = null;
      for (const s of steps) {
        const entry = st.layers[Number(s.dataset.layer)]; if (!entry) continue;
        const on = s.classList.contains("in");
        if (on !== entry.on) { entry.on = on; sync(entry); if (on && entry.layer.view) lastView = entry; }
      }
      if (lastView && fly) lastView.layer.view === "fit" ? fit(lastView.g.getBounds(), true) : go(lastView.layer.view, true);
    };
    apply(false);
    st.observer = new MutationObserver(() => apply(true));
    steps.forEach((s) => st.observer.observe(s, { attributes: true, attributeFilter: ["class"] }));

    box.dataset.mapMounted = "ready";
    requestAnimationFrame(() => map.invalidateSize());
    if (st.tilesDone) settle();
    setTimeout(settle, 8000); // a exportação não espera para sempre
  }

  // linha selecionada na planilha (Studio) -> abre o cartão do ponto dessa linha
  document.addEventListener("sagamap:linha", (e) => {
    const { path, linha } = e.detail || {};
    for (const st of live.values()) for (const entry of st.layers) {
      if (!path || entry.layer.source !== path || !st.map?.hasLayer(entry.g)) continue;
      entry.g.eachLayer((lyr) => { if (lyr.feature?.properties?._linha === linha) { lyr.openPopup(); if (lyr.getLatLng) st.map.panTo(lyr.getLatLng()); } });
    }
  });

  function mount(root = document, { force = false } = {}) {
    const boxes = [...root.querySelectorAll(".map-box")];
    if (root.classList?.contains("map-box")) boxes.push(root);
    const jobs = boxes.filter((b) => force || !live.has(b)).map(mountBox);
    readyPromise = Promise.all(jobs).then(() => Promise.all(boxes.map((b) => live.get(b)?.settled)));
    return readyPromise;
  }
  function dispose(root = document) {
    const boxes = root.classList?.contains("map-box") ? [root] : [...root.querySelectorAll(".map-box")];
    for (const b of boxes) {
      const st = live.get(b); if (!st) continue;
      st.observer?.disconnect(); st.map?.remove(); live.delete(b);
      delete b.dataset.mapMounted; b.querySelector(".map-legend")?.remove();
      b.querySelector(".map-notice")?.remove();
    }
  }

  // na apresentação: só o slide atual monta (o resto não pede tile nenhum); a exportação espera o "pronto"
  function watchDeck() {
    const slides = [...document.querySelectorAll("#stage > .slide")].filter((s) => s.querySelector(".map-box"));
    if (!slides.length) return;
    const check = () => { for (const s of slides) if (s.classList.contains("current")) mount(s); };
    const obs = new MutationObserver(check);
    slides.forEach((s) => obs.observe(s, { attributes: true, attributeFilter: ["class"] }));
    check();
  }
  window.SagaMap = {
    mount, dispose,
    // a exportação chama depois de ir a um slide: espera o mapa dele (tiles ou desistência), no máximo 8 s
    settled: () => { const cur = document.querySelector("#stage > .slide.current"); return cur ? mount(cur) : Promise.resolve(); },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchDeck); else watchDeck();
})();
