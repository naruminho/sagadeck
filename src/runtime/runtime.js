/* sagadeck · runtime do navegador (navegação, cliques/builds, apresentador, widgets) */
(function () {
  "use strict";
  const DATA = JSON.parse(document.getElementById("sagadeck-data").textContent);
  const KEY = "sagadeck:" + DATA.id;
  const EXPORT = /[?&]export/.test(location.search) || location.hash === "#export";
  const PRESENTER = location.hash.startsWith("#presenter");
  const MOTION = ["none", "subtle", "expressive"].includes(DATA.motion) ? DATA.motion : "subtle";
  document.documentElement.dataset.motion = MOTION;
  const reducedMotion = () => MOTION === "none" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const stage = $("#stage");
  const slides = $$("#stage > .slide");
  const N = slides.length;
  let cur = 0, step = 0;
  const hooks = slides.map(() => ({ enter: [], leave: [], step: [] }));

  // ---------- armazenamento (localStorage pode falhar em file:// restrito) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(KEY + ":" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(KEY + ":" + k, JSON.stringify(v)); } catch (e) {} broadcast({ type: "store", k }); },
  };

  // ---------- passos ----------
  function stepsOf(s) {
    let m = +s.dataset.steps || 0;
    $$("[data-step]", s).forEach((e) => { m = Math.max(m, +e.dataset.step); });
    $$("[data-exit]", s).forEach((e) => { m = Math.max(m, +e.dataset.exit); });
    $$("[data-lesson]", s).forEach((e) => { m = Math.max(m, (+e.dataset.lessonCount || 1) - 1); });
    return m;
  }
  const STEPS = slides.map(stepsOf);

  function hiddenByStep(el, root) {
    for (let p = el; p && p !== root; p = p.parentElement) {
      if (p.dataset && p.dataset.step && !p.classList.contains("in")) return true;
      if (p.classList && p.classList.contains("out")) return true;
    }
    return false;
  }

  function applyStep(s, k, opts = {}) {
    // !! obrigatório: toggle(nome, undefined) INVERTE a classe em vez de desligar — "false || undefined"
    // fazia cada clique inverter os itens ainda escondidos (tudo, 1º, tudo, último…).
    $$("[data-step]", s).forEach((e) => e.classList.toggle("in", !!(k >= +e.dataset.step || opts.all)));
    $$("[data-exit]", s).forEach((e) => e.classList.toggle("out", !opts.all && k >= +e.dataset.exit));
    $$(".pl, mark, .chart", s).forEach((e) => {
      if (!hiddenByStep(e, s)) play(e, opts.instant);
    });
  }

  function resetPlay(s) {
    $$(".play", s).forEach((e) => { e.classList.remove("play"); e.dataset.played = ""; });
    $$(".timer", s).forEach(stopTimer);
    $$(".counter", s).forEach((c) => { c.dataset.played = ""; });
  }

  function play(e, instant) {
    if (e.classList.contains("play")) return;
    e.classList.add("play");
    if (e.classList.contains("counter")) runCounter(e, instant);
    if (e.classList.contains("timer") && e.dataset.auto === "1" && !EXPORT) startTimer(e);
  }

  // ---------- contador ----------
  function fmtNum(v, dec) { return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  function runCounter(c, instant) {
    const to = +c.dataset.to, from = +c.dataset.from, dec = +c.dataset.dec, cv = $(".cv", c);
    const pre = c.dataset.prefix, suf = c.dataset.suffix;
    if (instant || EXPORT || reducedMotion()) { cv.textContent = pre + fmtNum(to, dec) + suf; return; }
    const t0 = performance.now(), dur = 1700;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(2, -10 * p);
      cv.textContent = pre + fmtNum(from + (to - from) * (p >= 1 ? 1 : e), dec) + suf;
      if (p < 1 && c.classList.contains("play")) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- timer ----------
  function drawTimer(t, left) {
    const total = +t.dataset.seconds;
    $(".tv", t).textContent = Math.floor(left / 60) + ":" + String(Math.max(0, left % 60)).padStart(2, "0");
    $(".tr-fg", t).style.strokeDashoffset = String(-(1 - left / total));
  }
  function startTimer(t) {
    if (t._iv) return;
    let left = t._left ?? +t.dataset.seconds;
    drawTimer(t, left);
    t._iv = setInterval(() => {
      left = Math.max(0, left - 1); t._left = left; drawTimer(t, left);
      if (left === 0) { clearInterval(t._iv); t._iv = null; t.classList.add("done"); }
    }, 1000);
  }
  function stopTimer(t) { clearInterval(t._iv); t._iv = null; t._left = null; t.classList.remove("done"); drawTimer(t, +t.dataset.seconds); }
  $$(".timer").forEach((t) => t.addEventListener("click", () => { if (t._iv) { clearInterval(t._iv); t._iv = null; } else startTimer(t); }));

  // ---------- enquete ----------
  function renderPoll(p) {
    const id = p.dataset.poll, vals = store.get("poll:" + id, []);
    const cmp = p.dataset.compare ? store.get("poll:" + p.dataset.compare, []) : null;
    const rows = $$(".po-row", p);
    const sum = vals.reduce((a, b) => a + (+b || 0), 0);
    const csum = cmp ? cmp.reduce((a, b) => a + (+b || 0), 0) : 0;
    rows.forEach((r, i) => {
      const v = +vals[i] || 0, pct = sum ? (100 * v) / sum : 0;
      $(".po-fill", r).style.width = pct + "%";
      const valEl = $(".po-val", r);
      if (!valEl.querySelector("input")) {
        valEl.innerHTML = sum ? Math.round(pct) + "%" : "—";
        if (cmp && csum && sum) {
          const cp = (100 * (+cmp[i] || 0)) / csum, d = Math.round(pct - cp);
          valEl.innerHTML += `<span class="po-delta">${d > 0 ? "+" : ""}${d} pts</span>`;
        }
      }
      const g = $(".po-ghost", r);
      if (cmp && csum) { g.style.left = (100 * (+cmp[i] || 0)) / csum + "%"; g.style.opacity = 1; } else g.style.opacity = 0;
    });
  }
  $$(".poll").forEach((p) => {
    renderPoll(p);
    $$(".po-val", p).forEach((v, i) => v.addEventListener("click", () => {
      if (v.querySelector("input")) return;
      const vals = store.get("poll:" + p.dataset.poll, []);
      v.innerHTML = `<input type="number" min="0" value="${vals[i] ?? ""}">`;
      const inp = v.querySelector("input"); inp.focus(); inp.select();
      const done = () => { const vs = store.get("poll:" + p.dataset.poll, []); vs[i] = inp.value === "" ? 0 : +inp.value; store.set("poll:" + p.dataset.poll, vs); v.innerHTML = ""; $$(".poll").forEach(renderPoll); };
      inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); done(); const nx = $$(".po-val", p)[i + 1]; if (nx && e.key === "Tab") nx.click(); } if (e.key === "Escape") { v.innerHTML = ""; renderPoll(p); } });
      inp.addEventListener("blur", () => { if (v.querySelector("input")) done(); });
    }));
  });

  // ---------- ajuste para caber (src/runtime/fit.js, o mesmo código do Studio) ----------
  function fitAll(root = document) {
    window.SagadeckFit.fitText(root);
    $$(".slide", root).forEach((s) => window.SagadeckFit.shrink(s));
  }

  // ---------- escala ----------
  function scale() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${k})`;
  }

  // ---------- navegação ----------
  function setBg() {
    const bg = getComputedStyle(slides[cur]).backgroundColor;
    $("#viewport").style.background = bg;
    document.body.style.background = bg;
  }
  function goto(i, k = 0, opts = {}) {
    i = Math.max(0, Math.min(N - 1, i));
    k = Math.max(0, Math.min(STEPS[i], k));
    const changed = i !== cur || opts.force;
    if (changed) {
      const prev = slides[cur];
      prev.classList.remove("current");
      hooks[cur].leave.forEach((f) => f());
      resetPlay(prev);
      cur = i;
      slides.forEach((s, j) => s.classList.toggle("current", j === i));
      if (opts.instant) slides[i].style.transition = "none";
      redrawSlideDrawings(i);
    }
    step = k;
    applyStep(slides[i], k, opts);
    if (changed) hooks[i].enter.forEach((f) => f(k));
    hooks[i].step.forEach((f) => f(k));
    if (opts.instant) { void slides[i].offsetWidth; slides[i].style.transition = ""; }
    setBg();
    const bar = $("#hud .bar"); if (bar) bar.style.width = ((i + (STEPS[i] ? k / (STEPS[i] + 1) : 0)) / Math.max(1, N - 1)) * 100 + "%";
    if (!EXPORT && !PRESENTER) history.replaceState(null, "", "#" + (i + 1) + (k ? "." + k : ""));
    broadcast({ type: "state", i, k });
    if (PRESENTER && document.getElementById("pv")) presenterState(i, k);
  }
  const next = () => (step < STEPS[cur] ? goto(cur, step + 1) : cur < N - 1 && goto(cur + 1, 0));
  const prev = () => (step > 0 ? goto(cur, step - 1) : cur > 0 && goto(cur - 1, STEPS[cur - 1], { instant: true }));

  // ---------- mensagens com a janela do apresentador ----------
  let pwin = null;
  function broadcast(msg) {
    try { if (pwin && !pwin.closed) pwin.postMessage({ sagadeck: DATA.id, ...msg }, "*"); } catch (e) {}
    try { if (PRESENTER && window.opener) window.opener.postMessage({ sagadeck: DATA.id, ...msg }, "*"); } catch (e) {}
  }
  function openPresenter() {
    pwin = window.open(location.href.split("#")[0] + "#presenter", "sagadeck-apresentador", "width=1400,height=860");
    toast(pwin ? "Janela do apresentador aberta" : "O navegador bloqueou a janela (libere pop-ups)");
  }

  // ---------- UI ----------
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 1800); }
  function overview() {
    const ov = $("#overview");
    if (document.body.classList.toggle("ov")) {
      ov.innerHTML = "";
      slides.forEach((s, j) => {
        const it = document.createElement("div"); it.className = "ov-item" + (j === cur ? " cur" : "");
        const sc = document.createElement("div"); sc.className = "ov-scale";
        const cl = s.cloneNode(true); cl.classList.add("current"); applyStatic(cl, STEPS[j]);
        sc.appendChild(cl); it.appendChild(sc);
        it.insertAdjacentHTML("beforeend", `<span class="ov-n">${j + 1}</span>`);
        it.onclick = () => { document.body.classList.remove("ov"); goto(j, 0); };
        ov.appendChild(it);
        requestAnimationFrame(() => { sc.style.transform = `scale(${it.clientWidth / 1920})`; });
      });
      $(".ov-item.cur", ov)?.scrollIntoView({ block: "center" });
    }
  }
  function applyStatic(node, k) {
    $$("[data-step]", node).forEach((e) => e.classList.toggle("in", k >= +e.dataset.step));
    $$("[data-exit]", node).forEach((e) => e.classList.toggle("out", k >= +e.dataset.exit));
    $$(".pl, mark, .chart", node).forEach((e) => e.classList.add("play"));
    $$(".e", node).forEach((e) => (e.style.animation = "none"));
    $$(".counter", node).forEach((c) => { $(".cv", c).textContent = c.dataset.prefix + fmtNum(+c.dataset.to, +c.dataset.dec) + c.dataset.suffix; });
    $$("[data-lesson]", node).forEach((root) => renderLesson(root, k));
  }

  // ---------- cenas de aula: o clique da apresentação também é a etapa da explicação ----------
  function renderLesson(root, requested) {
    const n = +root.dataset.lessonCount || 1, index = Math.max(0, Math.min(n - 1, +requested || 0));
    root.dataset.lessonIndex = String(index);
    $$("[data-lesson-panel]", root).forEach((panel, i) => {
      panel.classList.toggle("active", i === index);
      panel.setAttribute("aria-hidden", String(i !== index));
    });
    $$("[data-lesson-go]", root).forEach((button) => {
      const active = +button.dataset.lessonGo === index;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "step" : "false");
    });
    const prev = $("[data-lesson-prev]", root), next = $("[data-lesson-next]", root);
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === n - 1;
    const panel = $(".lesson-panel.active", root);
    const highlight = new Set(JSON.parse(panel?.dataset.highlight || "[]"));
    $$(".code .cl", root).forEach((line, i) => {
      line.classList.toggle("hl", highlight.has(i + 1));
      line.classList.toggle("dim", highlight.size > 0 && !highlight.has(i + 1));
    });
  }
  function fitSpotlight(root) {
    const canvas = $(".spotlight-canvas", root), img = $(".spotlight-image img", root), regions = $(".spotlight-regions", root);
    if (!canvas || !img?.naturalWidth || !regions) return;
    // As regiões seguem a imagem real, inclusive com barras laterais em um screenshot vertical.
    const scale = Math.min(canvas.clientWidth / img.naturalWidth, canvas.clientHeight / img.naturalHeight);
    const width = img.naturalWidth * scale, height = img.naturalHeight * scale;
    regions.style.cssText = `width:${width}px;height:${height}px;left:${(canvas.clientWidth - width) / 2}px;top:${(canvas.clientHeight - height) / 2}px;`;
  }
  function mountLessons() {
    slides.forEach((slide, si) => $$("[data-lesson]", slide).forEach((root) => {
      renderLesson(root, 0);
      hooks[si].step.push((k) => { renderLesson(root, k); fitSpotlight(root); });
      root.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button || !root.contains(button) || button.disabled) return;
        const index = +root.dataset.lessonIndex || 0;
        let target;
        if (button.hasAttribute("data-lesson-go")) target = +button.dataset.lessonGo;
        else if (button.hasAttribute("data-lesson-prev")) target = index - 1;
        else if (button.hasAttribute("data-lesson-next")) target = index + 1;
        if (target == null) return;
        event.stopPropagation();
        goto(si, target);
      });
      // Enter/Espaço em um botão deve acioná-lo; setas continuam a navegação da apresentação.
      root.addEventListener("keydown", (event) => {
        if (event.target.closest("button") && ["Enter", " "].includes(event.key)) event.stopPropagation();
      });
      root.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
      root.addEventListener("touchend", (event) => event.stopPropagation(), { passive: true });
      const img = $(".spotlight-image img", root);
      if (img) img.addEventListener("load", () => fitSpotlight(root));
      fitSpotlight(root);
    }));
    window.addEventListener("resize", () => $$("[data-lesson='spotlight']").forEach(fitSpotlight));
  }

  // ---------- caneta e anotações ao vivo (live drawing) ----------
  const drawCanvas = $("#draw-canvas");
  const drawCtx = drawCanvas ? drawCanvas.getContext("2d") : null;
  let isDrawingMode = false;
  let drawTool = "pen"; // "pen" | "highlighter"
  let drawColor = "#ef4444";
  let isDrawingDown = false;
  let activeStroke = null;
  const slideDrawings = {}; // { [slideIndex]: [strokes] }

  function toggleDrawing(forceState, tool = "pen") {
    if (!drawCanvas) return;
    isDrawingMode = typeof forceState === "boolean" ? forceState : !isDrawingMode;
    if (tool) drawTool = tool;
    document.body.classList.toggle("drawing", isDrawingMode);
    const tb = $("#draw-toolbar");
    const fab = $("#draw-fab");
    if (tb) tb.style.display = isDrawingMode ? "flex" : "none";
    if (fab) fab.style.display = isDrawingMode ? "none" : "";
    if (isDrawingMode) {
      updateDrawUI();
      toast(drawTool === "highlighter" ? "🖍️ Marca-texto ativo (D: caneta, C: limpar)" : "✏️ Caneta ativa (M: marca-texto, C: limpar)");
    }
  }

  function updateDrawUI() {
    $("#draw-btn-pen")?.classList.toggle("active", drawTool === "pen");
    $("#draw-btn-highlighter")?.classList.toggle("active", drawTool === "highlighter");
    $$(".draw-color").forEach((b) => b.classList.toggle("active", b.dataset.color === drawColor));
  }

  function getDrawCoords(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const sx = 1920 / rect.width;
    const sy = 1080 / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  }

  function renderStroke(s) {
    if (!drawCtx || !s.points || s.points.length < 2) return;
    drawCtx.save();
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    if (s.tool === "highlighter") {
      drawCtx.globalAlpha = 0.38;
      drawCtx.strokeStyle = s.color;
      drawCtx.lineWidth = s.width || 28;
    } else {
      drawCtx.globalAlpha = 1.0;
      drawCtx.strokeStyle = s.color;
      drawCtx.lineWidth = s.width || 5;
    }

    drawCtx.beginPath();
    drawCtx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      const p1 = s.points[i - 1];
      const p2 = s.points[i];
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      drawCtx.quadraticCurveTo(p1.x, p1.y, mx, my);
    }
    const last = s.points[s.points.length - 1];
    drawCtx.lineTo(last.x, last.y);
    drawCtx.stroke();
    drawCtx.restore();
  }

  function redrawSlideDrawings(slideIdx) {
    if (!drawCtx) return;
    drawCtx.clearRect(0, 0, 1920, 1080);
    const strokes = slideDrawings[slideIdx] || [];
    for (const s of strokes) {
      renderStroke(s);
    }
  }

  function undoDrawing() {
    const strokes = slideDrawings[cur] || [];
    if (strokes.length > 0) {
      strokes.pop();
      redrawSlideDrawings(cur);
      toast("Último traço desfeito");
    }
  }

  function clearDrawing() {
    slideDrawings[cur] = [];
    if (drawCtx) drawCtx.clearRect(0, 0, 1920, 1080);
    toast("Anotações do slide limpas");
  }

  function initDrawing() {
    if (!drawCanvas) return;
    drawCanvas.addEventListener("pointerdown", (e) => {
      if (!isDrawingMode) return;
      e.preventDefault();
      isDrawingDown = true;
      const pt = getDrawCoords(e);
      activeStroke = {
        tool: drawTool,
        color: drawColor,
        width: drawTool === "highlighter" ? 28 : 5,
        points: [pt, pt],
      };
      if (!slideDrawings[cur]) slideDrawings[cur] = [];
      slideDrawings[cur].push(activeStroke);
      renderStroke(activeStroke);
    });

    drawCanvas.addEventListener("pointermove", (e) => {
      if (!isDrawingDown || !activeStroke) return;
      e.preventDefault();
      const pt = getDrawCoords(e);
      activeStroke.points.push(pt);
      redrawSlideDrawings(cur);
    });

    const endDraw = () => {
      isDrawingDown = false;
      activeStroke = null;
    };
    drawCanvas.addEventListener("pointerup", endDraw);
    drawCanvas.addEventListener("pointercancel", endDraw);

    $("#draw-fab")?.addEventListener("click", () => toggleDrawing(true, "pen"));
    $("#draw-btn-pen")?.addEventListener("click", () => { drawTool = "pen"; updateDrawUI(); });
    $("#draw-btn-highlighter")?.addEventListener("click", () => { drawTool = "highlighter"; updateDrawUI(); });
    $("#draw-btn-undo")?.addEventListener("click", undoDrawing);
    $("#draw-btn-clear")?.addEventListener("click", clearDrawing);
    $("#draw-btn-close")?.addEventListener("click", () => toggleDrawing(false));
    $$(".draw-color").forEach((btn) => {
      btn.addEventListener("click", () => {
        drawColor = btn.dataset.color || "#ef4444";
        updateDrawUI();
      });
    });
  }

  let jump = "";
  function onKey(e) {
    if (e.target.closest && e.target.closest("input,textarea,[contenteditable]")) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && isDrawingMode) {
      e.preventDefault();
      undoDrawing();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) { jump += k; return; }
    if (k === "Enter" && jump) { goto(+jump - 1, 0); jump = ""; return; }
    jump = "";
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) { e.preventDefault(); cmd("next"); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) { e.preventDefault(); cmd("prev"); }
    else if (k === "Home") cmd("first");
    else if (k === "End") cmd("last");
    else if (k === "f" || k === "F") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
    else if (k === "p" || k === "P") { if (!PRESENTER) openPresenter(); }
    else if (k === "g" || k === "G") { if (!PRESENTER) overview(); }
    else if (k === "Escape") {
      if (isDrawingMode) toggleDrawing(false);
      document.body.classList.remove("ov", "help", "blank", "white", "laser");
    }
    else if (k === "b" || k === "B" || k === ".") cmd("blank");
    else if (k === "w" || k === "W") cmd("white");
    else if (k === "l" || k === "L") { document.body.classList.toggle("laser"); }
    else if (k === "d" || k === "D") { toggleDrawing(isDrawingMode && drawTool === "pen" ? false : true, "pen"); }
    else if (k === "m" || k === "M") { toggleDrawing(isDrawingMode && drawTool === "highlighter" ? false : true, "highlighter"); }
    else if (isDrawingMode && (k === "c" || k === "C" || k === "e" || k === "E")) { clearDrawing(); }
    else if (isDrawingMode && (k === "z" || k === "Z")) { undoDrawing(); }
    else if (k === "h" || k === "H" || k === "?") document.body.classList.toggle("help");
    else if (k === "r" || k === "R") { $$(".timer", slides[cur]).forEach((t) => { stopTimer(t); }); toast("Timer zerado"); }
    else if (k.length === 1) cmd("key", k);
  }
  function cmd(c, arg) {
    if (PRESENTER && window.opener && !window.opener.closed) { window.opener.postMessage({ sagadeck: DATA.id, type: "cmd", c, arg }, "*"); return; }
    local(c, arg);
  }
  function local(c, arg) {
    if (c === "next") next(); else if (c === "prev") prev();
    else if (c === "first") goto(0, 0); else if (c === "last") goto(N - 1, 0);
    else if (c === "goto") goto(arg[0], arg[1]);
    else if (c === "blank") { document.body.classList.remove("white"); document.body.classList.toggle("blank"); }
    else if (c === "white") { document.body.classList.remove("blank"); document.body.classList.toggle("white"); }
    else if (c === "key") { (hooks[cur].keys || []).forEach((f) => f(arg)); }
  }
  window.addEventListener("message", (ev) => {
    const m = ev.data; if (!m || m.sagadeck !== DATA.id) return;
    if (m.type === "cmd" && !PRESENTER) local(m.c, m.arg);
    if (m.type === "hello" && !PRESENTER) { pwin = ev.source; broadcast({ type: "state", i: cur, k: step }); }
    if (m.type === "state" && PRESENTER) presenterState(m.i, m.k);
    if (m.type === "store") $$(".poll").forEach(renderPoll);
  });

  // ---------- widgets ----------
  const WIDGETS = {};
  const queued = (window.Sagadeck && window.Sagadeck._q) || [];
  window.Sagadeck = {
    widget(name, def) { WIDGETS[name] = def; },
    store, toast, get slide() { return cur; }, get step() { return step; }, exportMode: EXPORT,
  };
  queued.forEach(([n, d]) => (WIDGETS[n] = d));
  function mountWidgets() {
    slides.forEach((s, si) => {
      hooks[si].keys = [];
      $$(".widget", s).forEach((w) => {
        const def = WIDGETS[w.dataset.widget];
        if (!def) { w.innerHTML = `<div style="padding:30px;border:3px dashed var(--em);color:var(--em);font:24px system-ui">widget "${w.dataset.widget}" não registrado</div>`; return; }
        const opts = JSON.parse(w.dataset.opts || "{}");
        const api = {
          slide: si, exportMode: EXPORT, store, toast,
          onEnter: (f) => hooks[si].enter.push(f), onLeave: (f) => hooks[si].leave.push(f),
          onStep: (f) => hooks[si].step.push(f), onKey: (f) => hooks[si].keys.push(f),
          get step() { return step; }, get current() { return cur === si; },
        };
        try { def.mount(w, opts, api); } catch (err) { console.error(err); w.textContent = "erro no widget: " + err.message; }
      });
    });
  }

  // ---------- apresentador ----------
  let pvState = { i: 0, k: 0 }, t0 = null, paused = 0, pausedAt = null;
  function presenterState(i, k) {
    pvState = { i, k };
    if (t0 == null && (i > 0 || k > 0)) t0 = Date.now();
    const cl = (sel, idx, kk) => {
      const box = $(sel), sc = $(".pv-scale", box);
      sc.innerHTML = "";
      if (idx >= N) { sc.innerHTML = `<div style="color:#777;font:600 60px system-ui;padding:80px">fim</div>`; return; }
      const node = slides[idx].cloneNode(true); node.classList.add("current"); applyStatic(node, kk);
      $$("[data-step]", node).forEach((e) => e.classList.toggle("in", kk >= +e.dataset.step));
      sc.appendChild(node);
      sc.style.transform = `scale(${box.clientWidth / 1920})`;
    };
    cl(".pv-cur", i, k);
    const nextIdx = k < STEPS[i] ? i : i + 1, nextK = k < STEPS[i] ? k + 1 : 0;
    cl(".pv-next", nextIdx, nextK);
    $(".pv-nextlbl").textContent = k < STEPS[i] ? `Próximo clique (${k + 1}/${STEPS[i]})` : "Próximo slide";
    const d = DATA.slides[i] || {};
    $(".pv-notes").innerHTML = `<div class="pv-step">Slide ${i + 1}/${N}${STEPS[i] ? ` · clique ${k}/${STEPS[i]}` : ""}${d.time ? ` · ${d.time} min planejados` : ""}</div>` + (d.notes || "<p style='color:#777'>Sem notas.</p>");
    $(".pv-title").textContent = d.title || "";
  }
  function presenterUI() {
    document.body.classList.add("presenter");
    const root = document.createElement("div"); root.id = "pv";
    root.innerHTML = `<div class="pv-top"><span class="pv-clock">00:00</span><span class="pv-el">⏱ <b class="pv-elv">00:00</b> / ${DATA.duration || "?"}:00</span><span class="pv-pace">no ritmo</span><span class="pv-pace" style="background:#1e293b;color:#38bdf8;border:1px solid rgba(56,189,248,0.3);" title="Anti-Bloqueio corporativo ativo: a tela não será bloqueada por inatividade do Windows">🛡️ Anti-Bloqueio</span>
      <button class="pv-start">Iniciar</button><button class="pv-reset">Zerar</button><button class="pv-black">Tela preta (B)</button><span class="pv-title"></span></div>
      <div><div class="pv-lbl">Agora</div><div class="pv-cur pv-box" style="aspect-ratio:16/9"><div class="pv-scale"></div></div></div>
      <div class="pv-side"><div><div class="pv-lbl pv-nextlbl">Próximo</div><div class="pv-next pv-box"><div class="pv-scale"></div></div></div><div class="pv-lbl">Notas / roteiro</div><div class="pv-notes"></div></div>`;
    document.body.appendChild(root);
    const fmt = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
    setInterval(() => {
      const now = new Date();
      $(".pv-clock").textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const el = t0 == null ? 0 : (pausedAt || Date.now()) - t0 - paused;
      $(".pv-elv").textContent = fmt(el);
      const plan = DATA.slides.slice(0, pvState.i).reduce((a, s) => a + (s.time || 0), 0) * 60000;
      const pace = $(".pv-pace"), diff = el - plan;
      if (t0 == null) { pace.textContent = "aguardando início"; pace.className = "pv-pace"; }
      else if (Math.abs(diff) < 60000) { pace.textContent = "no ritmo"; pace.className = "pv-pace ahead"; }
      else { pace.textContent = (diff > 0 ? "atrasado " : "adiantado ") + fmt(Math.abs(diff)); pace.className = "pv-pace " + (diff > 0 ? "behind" : "ahead"); }
    }, 500);
    $(".pv-start").onclick = (e) => {
      if (t0 == null) { t0 = Date.now(); e.target.textContent = "Pausar"; }
      else if (pausedAt) { paused += Date.now() - pausedAt; pausedAt = null; e.target.textContent = "Pausar"; }
      else { pausedAt = Date.now(); e.target.textContent = "Continuar"; }
    };
    $(".pv-reset").onclick = () => { t0 = null; paused = 0; pausedAt = null; $(".pv-start").textContent = "Iniciar"; };
    $(".pv-black").onclick = () => cmd("blank");
    window.addEventListener("resize", () => presenterState(pvState.i, pvState.k));
    if (window.opener) window.opener.postMessage({ sagadeck: DATA.id, type: "hello" }, "*");
  }

  // ---------- Bloqueio de Suspensão / Anti-Lock corporativo ----------
  let wakeLock = null;
  let keepAwakeVideo = null;

  async function requestWakeLock() {
    if (EXPORT) return;
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
        return true;
      }
    } catch (err) {}

    // Fallback: beacon de vídeo silencioso 1x1 inibe suspensão em navegadores corporativos
    try {
      if (!keepAwakeVideo) {
        keepAwakeVideo = document.createElement("video");
        keepAwakeVideo.setAttribute("playsinline", "");
        keepAwakeVideo.setAttribute("muted", "");
        keepAwakeVideo.setAttribute("loop", "");
        keepAwakeVideo.style.cssText = "position:fixed;width:1px;height:1px;top:-10px;left:-10px;opacity:0.01;pointer-events:none;";
        keepAwakeVideo.src = "data:video/webm;base64,GkXfo0AgQoaBAUL3gQDu4vqcgQdUaW5mb1ZAdYGAZW5jb2RpbmdlcHVibGlzaGVyX2FwcGxpY2F0aW9uY2hhcnNldAB4h5C5kIEYQoEB2QCQA4N1c2WDZkZlZmVmZmVmZmVmZmVmZmVmZmVmZmVmZg==";
        document.body.appendChild(keepAwakeVideo);
        keepAwakeVideo.play().catch(() => {});
      }
    } catch (e) {}
    return false;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestWakeLock();
  });

  // ---------- inicialização ----------
  function parseHash() {
    const m = location.hash.match(/^#(\d+)(?:\.(\d+))?/);
    return m ? [Math.max(0, +m[1] - 1), +(m[2] || 0)] : [0, 0];
  }
  function init() {
    if (EXPORT) document.documentElement.classList.add("export");
    scale(); window.addEventListener("resize", scale);
    mountWidgets();
    mountLessons();
    initDrawing();
    requestWakeLock();
    document.addEventListener("keydown", onKey);
    let mt; document.addEventListener("mousemove", (e) => {
      document.body.classList.add("mouse"); clearTimeout(mt); mt = setTimeout(() => document.body.classList.remove("mouse"), 1600);
      const l = $("#laser"); l.style.left = e.clientX + "px"; l.style.top = e.clientY + "px";
    });
    let tx = null; document.addEventListener("touchstart", (e) => (tx = e.touches[0].clientX));
    document.addEventListener("touchend", (e) => { if (tx == null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) cmd(d < 0 ? "next" : "prev"); tx = null; });
    const [i, k] = parseHash();
    slides.forEach((s) => s.classList.remove("current"));
    cur = -1;
    const start = () => { fitAll(); cur = 0; slides[0].classList.add("current"); goto(i, k, { force: true, instant: true }); };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);
    if (PRESENTER) presenterUI();
    window.sagadeck = {
      n: N, steps: (j) => STEPS[j], get cur() { return cur; }, get step() { return step; },
      goto: (j, kk, all) => { goto(j, kk, { instant: true, force: true, all }); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); },
      fit: fitAll, data: DATA,
    };
  }
  init();
})();
