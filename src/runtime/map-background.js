// Fundo vetorial dos mapas claro/escuro. O Leaflet continua cuidando das camadas, dos cliques e do editor.
(function () {
  let loader;
  const files = { js: "maplibre-gl.js", css: "maplibre-gl.css", worker: "maplibre-worker.js", adapter: "maplibre-leaflet.js" };
  const assets = () => { try { return JSON.parse(document.getElementById("map-background-assets")?.textContent || "{}"); } catch { return {}; } };
  const script = (url) => new Promise((resolve, reject) => {
    const s = document.createElement("script"); s.src = url; s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error("Não foi possível carregar o fundo do mapa.")); }; document.head.append(s);
  });
  function load() {
    return loader ||= (async () => {
      const bundled = assets(), url = (key, mime) => bundled[key] ? `data:${mime};base64,${bundled[key]}` : files[key];
      if (!window.maplibregl) {
        const css = document.createElement("link"); css.rel = "stylesheet"; css.href = url("css", "text/css"); document.head.append(css);
        await script(url("js", "text/javascript"));
        // o worker também é local, inclusive no HTML de arquivo único
        window.maplibregl.setWorkerUrl(bundled.worker ? URL.createObjectURL(new Blob([Uint8Array.from(atob(bundled.worker), (c) => c.charCodeAt(0))], { type: "text/javascript" })) : new URL(files.worker, document.baseURI).href);
      }
      if (!window.L.maplibreGL) await script(url("adapter", "text/javascript"));
    })().catch((error) => { loader = null; throw error; });
  }

  // Filtros antigos usam o nome da coluna diretamente; expressões novas usam get. Não misture as duas sintaxes.
  const expression = (f) => Array.isArray(f) && (["get", "match", "coalesce", "geometry-type", "literal", "id", "to-string", "to-number"].includes(f[0]) || f.some(expression));
  function styleForMap(style) {
    return { ...style, layers: style.layers.map((layer) => {
      if (layer.type !== "line" || layer["source-layer"] !== "boundary" && !/^boundary[_-]/.test(layer.id)) return layer;
      const marine = !layer.filter || expression(layer.filter) ? ["!", ["in", ["get", "maritime"], ["literal", [1, true]]]] : ["!in", "maritime", 1, true];
      return { ...layer, filter: ["all", ...(layer.filter ? [layer.filter] : []), marine] };
    }) };
  }

  const absolute = (url, base) => new URL(url, base).href.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  async function json(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  async function prepare(tiles, map, signal) {
    const style = styleForMap(await json(tiles.url, signal));
    const ofm = tiles.url.match(/^https:\/\/tiles\.openfreemap\.org\/styles\/(positron|dark)$/);
    if (ofm) style.layers = style.layers.map((layer) => layer.type === "fill" && layer["source-layer"] === "water" ? { ...layer, paint: { ...layer.paint, "fill-color": ofm[1] === "dark" ? "#162b35" : "#dce9f0" } } : layer);
    style.sources = { ...style.sources };
    if (style.glyphs) style.glyphs = absolute(style.glyphs, tiles.url);
    if (typeof style.sprite === "string") style.sprite = absolute(style.sprite, tiles.url);
    else if (Array.isArray(style.sprite)) style.sprite = style.sprite.map((x) => ({ ...x, url: absolute(x.url, tiles.url) }));
    const zoom = Math.max(0, Math.floor(map.getZoom() - 1));
    const used = new Set(style.layers.filter((x) => x.layout?.visibility !== "none" && (x.minzoom ?? 0) <= zoom && (x.maxzoom ?? 25) > zoom).map((x) => x.source));
    for (const [id, source] of Object.entries(style.sources)) {
      let s = { ...source }, base = tiles.url;
      if (s.url) {
        s.url = absolute(s.url, tiles.url);
        if (used.has(id)) { base = s.url; const metadata = await json(s.url, signal); s = { ...metadata, ...s }; delete s.url; }
      }
      if (s.tiles) s.tiles = s.tiles.map((url) => absolute(url, base));
      if (s.type === "geojson" && typeof s.data === "string") s.data = absolute(s.data, tiles.url);
      if (used.has(id) && s.tiles?.length) {
        // primeiro uso real: uma imagem/tile do centro antes de abrir a camada. Recusa não vira uma rajada.
        const z = Math.min(s.maxzoom ?? zoom, Math.max(s.minzoom ?? 0, zoom)), n = 2 ** z;
        const center = map.getCenter(), lat = Math.max(-85.0511, Math.min(85.0511, center.lat)) * Math.PI / 180;
        const x = ((Math.floor((center.lng + 180) / 360 * n) % n) + n) % n;
        let y = Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n)));
        if (s.scheme === "tms") y = n - y - 1;
        const url = s.tiles[0].replace(/\{([zxy])\}/g, (_, key) => ({ z, x, y })[key]);
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.arrayBuffer();
      }
      style.sources[id] = s;
    }
    return style;
  }

  function mount(map, tiles, { active, done, failed }) {
    const controller = new AbortController();
    let layer, stopped = false, failure;
    const dispose = () => { stopped = true; controller.abort(); if (layer && map.hasLayer(layer)) map.removeLayer(layer); };
    (async () => {
      await load(); if (!active() || stopped) return;
      const style = await prepare(tiles, map, controller.signal); if (!active() || stopped) return;
      layer = window.L.maplibreGL({ style, attributionControl: false, interactive: false, padding: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, fadeDuration: 0 });
      layer.addTo(map);
      map.attributionControl.addAttribution(tiles.attribution);
      const gl = layer.getMaplibreMap();
      gl.on("error", (event) => { if (active() && !stopped) { failure = event.error?.message; dispose(); failed(); } });
      gl.once("idle", () => { if (active() && !stopped) done(); });
    })().catch((error) => { if (error.name !== "AbortError" && active() && !stopped) { failure = error.message; dispose(); failed(); } });
    return { dispose, getMap: () => layer?.getMaplibreMap(), getError: () => failure };
  }
  window.SagaMapBackground = { mount, styleForMap };
})();
