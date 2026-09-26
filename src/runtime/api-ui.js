// Slide "api" na apresentação: Executar (síncrono, polling, streaming), ambiente, código que acende
// junto com a fase que está rodando, variáveis entre slides (save:) e a última resposta gravada.
// Os pedidos saem do Studio (api/http/*), nunca direto do navegador. Sem o Studio (HTML exportado,
// servidor multiusuário), o slide reproduz a gravação.
(function () {
  "use strict";
  const C = window.SagadeckApiCore;
  const roots = Array.from(document.querySelectorAll(".L-api[data-api]"));
  if (!C || !roots.length) return;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1).replace(".", ",") + " s" : Math.round(ms) + " ms");
  const fmtSize = (n) => (n >= 1024 ? (n / 1024).toFixed(1).replace(".", ",") + " KB" : n + " B");
  const when = (iso) => { try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  const EMBED = (() => { try { return JSON.parse(($("#sagadeck-api-rec") || {}).textContent || "{}"); } catch { return {}; } })();
  let STATE = { live: false, envs: [], current: null, recordings: EMBED, reason: "Sem o Studio: mostrando a última resposta gravada." };

  // variáveis guardadas por slides anteriores (save:), só nesta sessão do navegador
  const deckId = (window.sagadeck && window.sagadeck.data && window.sagadeck.data.id) || location.pathname;
  const VKEY = "sagadeck-api-vars:" + deckId;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(VKEY) || "{}"); } catch { return {}; } })();
  const persist = () => { try { sessionStorage.setItem(VKEY, JSON.stringify(saved)); } catch {} };
  const envVars = () => ((STATE.envs || []).find((e) => e.name === STATE.current) || {}).vars || {};
  const vars = () => Object.assign({}, envVars(), saved);

  async function call(path, body) {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || "HTTP " + r.status); e.kind = j.kind; throw e; }
    return j;
  }

  // ---------- JSON colorido ----------
  function jsonHTML(v) {
    const txt = typeof v === "string" ? v : JSON.stringify(v, null, 2);
    if (typeof v === "string") return esc(txt);
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    let out = "", last = 0, m;
    while ((m = re.exec(txt))) {
      out += esc(txt.slice(last, m.index));
      if (m[1]) out += `<span class="${m[2] ? "jk" : "js"}">${esc(m[1])}</span>${m[2] || ""}`;
      else out += `<span class="${m[3] ? "jb" : "jn"}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(txt.slice(last));
  }

  // ---------- montagem ----------
  function readReq(root) {
    const cfg = root._cfg;
    const url = $("[data-api-url]", root).value.trim();
    const bodyEl = $("[data-api-body]", root);
    const bodyTxt = bodyEl ? bodyEl.value : "";
    let body;
    if (bodyTxt.trim() !== "" && !cfg.request.form) { // upload: a aba Corpo só mostra os campos do formulário
      try { body = JSON.parse(bodyTxt); }
      catch (e) {
        if (typeof cfg.request.body === "string") body = bodyTxt;
        else throw new Error("O corpo não é um JSON válido: " + e.message);
      }
    }
    const headers = {};
    (($("[data-api-headers]", root) || {}).value || "").split("\n").forEach((l) => { const i = l.indexOf(":"); if (i > 0) headers[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    return Object.assign({}, cfg.request, { url, body: cfg.request.form ? undefined : body, headers });
  }

  function paintCode(root) {
    const cfg = root._cfg;
    let req;
    try { req = readReq(root); } catch { req = cfg.request; }
    const a = Object.assign({}, cfg, { request: req });
    if (cfg.similarity) {
      const ref = $("[data-api-ref]", root), txt = $("[data-api-texts]", root);
      a.similarity = Object.assign({}, cfg.similarity, { reference: ref ? ref.value : cfg.similarity.reference, texts: txt ? txt.value.split("\n").map((t) => t.trim()).filter(Boolean) : cfg.similarity.texts });
    }
    $$(".api-code", root).forEach((pane) => {
      const out = C.code(a, pane.dataset.pane, Object.assign(vars(), root._file ? { "file.name": root._file.name } : {}));
      const cm = new Set(out.comments);
      pane._marks = out.marks;
      pane.innerHTML = out.code.split("\n").map((l, i) => `<div class="cl${cm.has(i + 1) ? " cm" : ""}" data-ln="${i + 1}"><span class="cn">${i + 1}</span><span class="cc">${esc(l) || " "}</span></div>`).join("");
    });
    $$("[data-field]", root).forEach((tr) => { const v = req.body === undefined ? undefined : C.get(req.body, tr.dataset.field); const td = $(".api-fv", tr); if (td) td.textContent = v === undefined ? "—" : JSON.stringify(v); });
    // o endereço de verdade, embaixo do que tem {{variáveis}}
    const res = $("[data-api-resolved]", root);
    if (res) {
      const r = C.render(req.url, vars());
      res.textContent = r !== req.url && !C.missing(r, {}).length ? r : "";
    }
    if (root._phase) light(root, root._phase);
  }

  // acende as linhas do código que correspondem à fase que está rodando (start / poll / done)
  function light(root, phase) {
    root._phase = phase;
    $$(".api-code", root).forEach((pane) => {
      const lines = new Set(((pane._marks || {})[phase]) || []);
      let first = null;
      $$(".cl", pane).forEach((l) => { const on = lines.has(+l.dataset.ln); l.classList.toggle("run", on); if (on && !first) first = l; });
      if (first && !pane.hidden) pane.scrollTop = Math.max(0, first.offsetTop - pane.clientHeight / 4);
    });
  }
  function pulse(root) {
    $$(".api-code .cl.run", root).forEach((l) => { l.classList.remove("pulse"); void l.offsetWidth; l.classList.add("pulse"); });
  }

  function showTab(root, tab) {
    $$("[data-tab]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    $$("[data-pane]", root).forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    if (root._phase) light(root, root._phase);
  }

  function paintEnv(root) {
    const btn = $("[data-api-env]", root);
    const rec = STATE.recordings[root._cfg.key];
    let name, kind, title;
    if (!STATE.live) { name = rec ? "gravado" : "sem Studio"; kind = "off"; title = STATE.reason || ""; }
    else if (!(STATE.envs || []).length) { name = "sem ambiente"; kind = "off"; title = STATE.error || `Crie ${STATE.file || "~/.sagadeck/ambientes.yaml"} com os ambientes (dev, hom…)`; }
    else { name = STATE.current; kind = C.envKind(name); title = "Ambiente: clique para trocar"; }
    btn.dataset.kind = kind;
    btn.title = title;
    $(".api-env-name", btn).textContent = String(name).toUpperCase();
    label(root, !STATE.live && rec ? "Reproduzir gravação" : "Executar");
  }

  function label(root, t) { const sp = $("[data-api-run] span", root); if (sp) sp.textContent = t; }

  function envMenu(root, btn) {
    const old = $(".api-menu", root);
    if (old) { old.remove(); return; }
    if (!STATE.live || (STATE.envs || []).length < 1) { showError(root, btn.title || STATE.reason || "Sem ambientes."); return; }
    const m = document.createElement("div");
    m.className = "api-menu";
    m.innerHTML = STATE.envs.map((e) => `<button type="button" data-env="${esc(e.name)}" data-kind="${C.envKind(e.name)}" aria-current="${e.name === STATE.current}"><span class="api-env-dot"></span>${esc(e.name.toUpperCase())}<small>${esc(Object.values(e.vars || {})[0] || "")}</small></button>`).join("");
    $(".api-bar", root).appendChild(m);
    m.onclick = async (ev) => {
      const b = ev.target.closest("[data-env]");
      if (!b) return;
      m.remove();
      try { const st = await call("api/http/env", { name: b.dataset.env }); STATE = Object.assign({}, STATE, st); } catch (e) { showError(root, e.message); }
      roots.forEach((r) => { paintEnv(r); paintCode(r); });
    };
  }

  // ---------- resposta ----------
  function out(root) { return $(".api-out", root); }
  function status(root, html) { $(".api-status", root).innerHTML = html; }
  function clearOut(root) { out(root).innerHTML = ""; status(root, ""); }

  function statusBar(r, extra) {
    const ok = r.status < 400;
    return `<span class="api-pill ${ok ? "ok" : "err"}">${esc(r.status)} ${esc(r.statusText || "")}</span>` +
      (r.ms != null ? `<span class="api-meta">${fmtMs(r.ms)}</span>` : "") +
      (r.size != null ? `<span class="api-meta">${fmtSize(r.size)}</span>` : "") + (extra || "");
  }

  function stepCards(cfg, body) {
    const list = cfg.steps ? C.get(body, cfg.steps) : null;
    if (!Array.isArray(list) || !list.length) return "";
    return `<div class="api-steps">${list.map((st, i) => {
      const title = cfg.stepTitle ? C.get(st, cfg.stepTitle) : (st && (st.name || st.step || st.service || st.type)) || `Etapa ${i + 1}`;
      const val = cfg.stepText ? C.get(st, cfg.stepText) : st;
      const txt = typeof val === "string" ? esc(val) : `<pre>${jsonHTML(val)}</pre>`;
      return `<div class="api-step" style="--i:${i}"><div class="api-step-n f-label">${String(i + 1).padStart(2, "0")}</div><div class="api-step-t">${esc(title)}</div><div class="api-step-x">${txt}</div></div>`;
    }).join('<div class="api-step-arrow" aria-hidden="true">→</div>')}</div>`;
  }

  function showResult(root, r, badge) {
    const cfg = root._cfg;
    status(root, statusBar(r, badge));
    const ans = cfg.answer && r.body && typeof r.body === "object" ? C.get(r.body, cfg.answer) : undefined;
    const html = (ans != null ? `<div class="api-answer"><div class="f-label">${esc(cfg.answer.replace(/^\$\.?/, ""))}</div><div class="api-answer-t">${esc(typeof ans === "string" ? ans : JSON.stringify(ans))}</div></div>` : "") +
      stepCards(cfg, r.body) +
      `<pre class="api-json f-mono">${jsonHTML(r.body)}</pre>`;
    let box = $(".api-result", root);
    if (!box) { box = document.createElement("div"); box.className = "api-result"; out(root).appendChild(box); }
    box.innerHTML = (r.jwt ? jwtHTML(r.jwt) : "") + html;
    if (r.jwt && r.jwt.exp) countdown(root, r.jwt.exp);
  }

  function jwtHTML(j) {
    if (!j.isJwt) return `<div class="api-answer"><div class="f-label">token gerado</div><div class="api-answer-t">••••${esc(j.last4)} · os próximos slides usam este token</div></div>`;
    return `<div class="api-answer"><div class="f-label">token JWT gerado · os próximos slides usam este</div><div class="api-answer-t">••••${esc(j.last4)} <span class="api-countdown" data-exp="${j.exp || ""}"></span></div></div>
      <div class="api-jwt"><div><div class="f-label">cabeçalho</div><pre>${jsonHTML(j.header)}</pre></div><div><div class="f-label">conteúdo (payload)</div><pre>${jsonHTML(j.payload)}</pre></div></div>`;
  }
  function countdown(root, exp) {
    clearInterval(root._cd);
    const tick = () => {
      const el = $(".api-countdown", root);
      if (!el) return clearInterval(root._cd);
      const left = Math.max(0, Math.round(exp - Date.now() / 1000));
      el.textContent = left ? `expira em ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}` : "expirou";
    };
    tick();
    root._cd = setInterval(tick, 1000);
  }

  // arquivo arrastado ou escolhido na hora (vai em base64 para o Studio)
  function pickFile(root, f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      root._file = { name: f.name, type: f.type || "", base64: String(rd.result).split(",")[1] || "" };
      const n = $(".api-file-name", root); if (n) n.textContent = f.name;
      paintCode(root);
    };
    rd.readAsDataURL(f);
  }

  function showError(root, msg, kind) {
    const rec = STATE.recordings[root._cfg.key];
    const canReplay = rec && (kind === "offline" || kind === "tls" || kind === "network" || !STATE.live);
    const box = document.createElement("div");
    box.className = "api-error";
    box.innerHTML = `<b>${kind === "offline" ? "Sem conexão" : "Não deu"}</b> ${esc(msg)}${canReplay ? ` <button type="button" class="api-replay">Mostrar a última gravação (${esc(when(rec.at))})</button>` : ""}`;
    out(root).appendChild(box);
    const b = $(".api-replay", box);
    if (b) b.onclick = () => replay(root, rec);
  }

  function timeline(root) {
    let t = $(".api-timeline", root);
    if (!t) { t = document.createElement("div"); t.className = "api-timeline"; out(root).prepend(t); }
    return t;
  }
  function row(root, label, info, cls) {
    const t = timeline(root);
    const r = document.createElement("div");
    r.className = "api-tl " + (cls || "");
    r.innerHTML = `<span class="api-tl-s">${esc(label)}</span><span class="api-tl-i">${esc(info || "")}</span>`;
    t.appendChild(r);
    t.scrollTop = t.scrollHeight;
  }

  // ---------- execução ----------
  function payload(root, req) {
    const cfg = root._cfg;
    return { request: Object.assign({}, req, cfg.token ? { captureToken: cfg.token } : {}), file: root._file || undefined, fileRef: root._file ? undefined : cfg.file || undefined };
  }
  async function runSync(root, req) {
    light(root, "start");
    const r = await call("api/http/send", payload(root, req));
    light(root, "done");
    showResult(root, r);
    return r.ok ? { mode: "sync", env: STATE.current, result: r } : null;
  }

  async function runPolling(root, req) {
    const cfg = root._cfg, P = cfg.polling, t0 = performance.now();
    const since = () => fmtMs(performance.now() - t0);
    light(root, "start");
    const start = await call("api/http/send", payload(root, req));
    if (!start.ok) { showResult(root, start); return null; }
    const id = C.get(start.body, P.id);
    if (id == null) throw new Error(`A resposta do início não tem ${P.id} (o código da execução).`);
    row(root, "início", `${start.status} · execução ${id} · ${since()}`, "start");
    status(root, statusBar(start, `<span class="api-meta">execução ${esc(id)}</span>`));
    const check = C.render(P.check, Object.assign(vars(), { id }));
    const polls = [];
    for (;;) {
      if ((performance.now() - t0) / 1000 > P.timeout) throw new Error(`Passou de ${P.timeout} s sem terminar. Aumente polling.timeout se for normal.`);
      light(root, "poll"); pulse(root);
      const r = await call("api/http/send", { request: check });
      if (!r.ok) { showResult(root, r); return null; }
      const st = String(C.get(r.body, P.status));
      const t = Math.round(performance.now() - t0);
      polls.push({ status: st, t });
      const done = P.done.includes(st), failed = P.failed.includes(st);
      row(root, st, since(), done ? "done" : failed ? "failed" : "");
      if (done) {
        light(root, "done");
        showResult(root, r, `<span class="api-meta">${polls.length} consulta${polls.length > 1 ? "s" : ""} · ${since()}</span>`);
        return { mode: "polling", env: STATE.current, start, polls, final: r };
      }
      if (failed) { showResult(root, r); throw new Error(`A execução terminou com ${st}.`); }
      await sleep(P.interval * 1000);
    }
  }

  async function runStream(root, req) {
    const cfg = root._cfg, t0 = performance.now();
    light(root, "start");
    const r = await fetch("api/http/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(root, req)) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); const e = new Error(j.error || "HTTP " + r.status); e.kind = j.kind; throw e; }
    const up = +r.headers.get("X-Api-Status") || 200;
    const box = document.createElement("div");
    box.className = "api-stream";
    out(root).appendChild(box);
    light(root, "poll");
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "", raw = "", n = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const s = dec.decode(value, { stream: true });
      raw += s; buf += s;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        let piece;
        try { piece = C.get(JSON.parse(d), cfg.stream.text); } catch { piece = d; }
        if (piece != null) { text += piece; n++; box.textContent = text; pulse(root); }
      }
      status(root, statusBar({ status: up, ms: performance.now() - t0 }, `<span class="api-meta">${n} pedaços</span>`));
    }
    light(root, "done");
    if (up >= 400) { box.remove(); showResult(root, { status: up, body: raw, ms: performance.now() - t0 }); return null; }
    if (!text && raw) box.textContent = raw;
    const ms = Math.round(performance.now() - t0);
    status(root, statusBar({ status: up, ms }, `<span class="api-meta">${n} pedaços</span>`));
    return { mode: "stream", env: STATE.current, stream: { status: up, text: text || raw, ms, pieces: n } };
  }

  // ---------- embeddings: vetor e similaridade por cosseno ----------
  const pct = (x) => Math.max(0, Math.min(100, x * 100)).toFixed(1) + "%";
  const num = (x) => x.toFixed(2).replace(".", ",");
  function vecHTML(preview, dims) {
    const max = Math.max(1e-9, ...preview.map((v) => Math.abs(v)));
    return `<div class="api-vec">${preview.map((v, k) => `<i style="--k:${k};background:hsl(${v < 0 ? 212 : 24} 85% ${Math.round(92 - (Math.abs(v) / max) * 46)}%)" title="${v}"></i>`).join("")}</div><div class="api-sim-l">vetor com ${Number(dims).toLocaleString("pt-BR")} números · os ${preview.length} primeiros (azul negativo, laranja positivo)</div>`;
  }
  function simBox(root, sim) {
    let box = $(".api-sim", root);
    if (!box) { box = document.createElement("div"); box.className = "api-sim"; out(root).appendChild(box); }
    box.innerHTML = `<div class="api-sim-ref"><div class="f-label">referência</div><div class="api-sim-t">${esc(sim.reference)}</div>${sim.preview ? vecHTML(sim.preview, sim.dims) : ""}</div>` +
      sim.items.map((it) => `<div class="api-sim-row" data-score="${it.score}"><div class="api-sim-t">${esc(it.text)}</div><div class="api-sim-bar"><i style="--w:0%"></i></div><b>${it.score == null ? "…" : num(it.score)}</b></div>`).join("");
    const best = Math.max(...sim.items.map((it) => (it.score == null ? -Infinity : it.score)));
    requestAnimationFrame(() => $$(".api-sim-row", box).forEach((row, i) => {
      const sc = sim.items[i].score;
      if (sc != null) { $("i", row).style.setProperty("--w", pct(sc)); row.classList.toggle("win", sim.items.length > 1 && sc === best && sim.done); }
    }));
  }
  async function runSimilarity(root, req) {
    const cfg = root._cfg;
    const ref = ($("[data-api-ref]", root) || {}).value || cfg.similarity.reference;
    const texts = (($("[data-api-texts]", root) || {}).value || cfg.similarity.texts.join("\n")).split("\n").map((t) => t.trim()).filter(Boolean);
    if (!ref.trim() || !texts.length) throw new Error("Escreva a frase de referência e pelo menos uma para comparar (aba Frases).");
    const embed = async (t) => {
      const r = await call("api/http/send", payload(root, C.render(req, { text: t })));
      if (!r.ok) { showResult(root, r); throw new Error(`O serviço respondeu ${r.status}.`); }
      const v = C.get(r.body, cfg.similarity.vector);
      if (!Array.isArray(v) || !v.length) throw new Error(`A resposta não tem o vetor em ${cfg.similarity.vector}.`);
      return { v, r };
    };
    const t0 = performance.now();
    light(root, "start");
    const first = await embed(ref);
    const sim = { reference: ref, dims: first.v.length, preview: first.v.slice(0, 48).map((x) => +Number(x).toFixed(4)), items: texts.map((t) => ({ text: t, score: null })) };
    simBox(root, sim);
    light(root, "poll");
    for (const it of sim.items) { pulse(root); it.score = C.cosine(first.v, (await embed(it.text)).v); simBox(root, sim); }
    sim.done = true;
    sim.items.sort((a, b) => b.score - a.score);
    simBox(root, sim);
    light(root, "done");
    status(root, statusBar(first.r, `<span class="api-meta">${texts.length + 1} embeddings · ${fmtMs(performance.now() - t0)}</span>`));
    return { mode: "similarity", env: STATE.current, sim };
  }

  function keep(root, rec) {
    const cfg = root._cfg;
    const body = rec.final ? rec.final.body : rec.result ? rec.result.body : null;
    const got = [];
    Object.entries(cfg.save || {}).forEach(([name, path]) => { const v = C.get(body, path); if (v != null) { saved[name] = v; got.push(name); } });
    if (got.length) {
      persist();
      const box = document.createElement("div");
      box.className = "api-saved";
      box.innerHTML = got.map((n) => `<span>guardado <b>{{${esc(n)}}}</b> = ${esc(String(saved[n]).slice(0, 60))}</span>`).join("");
      out(root).appendChild(box);
      roots.forEach(paintCode);
    }
  }

  async function run(root) {
    const btn = $("[data-api-run]", root);
    btn.blur();
    if (root._running) return;
    const cfg = root._cfg;
    const menu = $(".api-menu", root); if (menu) menu.remove();
    if (!STATE.live) {
      const rec = STATE.recordings[cfg.key];
      clearOut(root);
      if (rec) return replay(root, rec, true);
      return showError(root, STATE.reason || "Sem o Studio para executar.");
    }
    let req;
    try { req = C.render(readReq(root), vars()); } catch (e) { clearOut(root); return showError(root, e.message); }
    const miss = C.missing(req, {}).filter((m) => !/^(file|secret)\./.test(m) && !(cfg.similarity && m === "text"));
    if (miss.length) { clearOut(root); return showError(root, `Falta ${miss.map((m) => "{{" + m + "}}").join(", ")}: defina em vars do ambiente, ou execute antes o slide que guarda esse valor (save:).`); }
    root._running = true;
    btn.disabled = true; label(root, "Executando…");
    root.classList.add("running");
    clearOut(root);
    try {
      const rec = cfg.similarity ? await runSimilarity(root, req) : cfg.mode === "polling" ? await runPolling(root, req) : cfg.mode === "stream" ? await runStream(root, req) : await runSync(root, req);
      if (rec) {
        keep(root, rec);
        STATE.recordings[cfg.key] = Object.assign({ at: new Date().toISOString() }, rec);
        call("api/http/record", { key: cfg.key, record: rec }).catch(() => {});
      }
    } catch (e) {
      showError(root, e.message, e.kind);
    } finally {
      root._running = false;
      btn.disabled = false;
      root.classList.remove("running");
      paintEnv(root);
    }
  }

  // a última resposta boa, no mesmo ritmo em que aconteceu (encurtado); instant = sem animação
  async function replay(root, rec, animate) {
    const badge = `<span class="api-rec">gravado ${esc(when(rec.at))}${rec.env ? " · " + esc(String(rec.env).toUpperCase()) : ""}</span>`;
    clearOut(root);
    const wait = (ms) => (animate ? sleep(Math.min(ms, 900)) : Promise.resolve());
    if (rec.mode === "similarity" && rec.sim) {
      light(root, "done");
      simBox(root, Object.assign({}, rec.sim, { done: true }));
      status(root, `<span class="api-meta">${rec.sim.items.length + 1} embeddings</span>${badge}`);
      return;
    }
    if (rec.mode === "polling" && rec.final) {
      light(root, "start");
      row(root, "início", `${rec.start ? rec.start.status : ""} · execução ${C.get(rec.start && rec.start.body, root._cfg.polling.id) ?? ""}`, "start");
      let prev = 0;
      for (const p of rec.polls || []) {
        await wait(p.t - prev); prev = p.t;
        light(root, "poll"); if (animate) pulse(root);
        row(root, p.status, fmtMs(p.t), root._cfg.polling.done.includes(p.status) ? "done" : "");
      }
      light(root, "done");
      showResult(root, rec.final, badge);
    } else if (rec.mode === "stream" && rec.stream) {
      light(root, "poll");
      const box = document.createElement("div");
      box.className = "api-stream";
      out(root).appendChild(box);
      if (animate) { for (let i = 0; i <= rec.stream.text.length; i += 3) { box.textContent = rec.stream.text.slice(0, i); await sleep(12); } }
      box.textContent = rec.stream.text;
      light(root, "done");
      status(root, statusBar({ status: rec.stream.status, ms: rec.stream.ms }, badge));
    } else if (rec.result) {
      light(root, "done");
      showResult(root, rec.result, badge);
    }
  }

  function mount(root) {
    try { root._cfg = JSON.parse(root.dataset.api); } catch { return; }
    $$("[data-tab]", root).forEach((b) => { b.onclick = () => showTab(root, b.dataset.tab); });
    $("[data-api-run]", root).onclick = () => run(root);
    $("[data-api-env]", root).onclick = (e) => envMenu(root, e.currentTarget);
    ["[data-api-url]", "[data-api-body]", "[data-api-headers]", "[data-api-ref]", "[data-api-texts]"].forEach((sel) => { const el = $(sel, root); if (el) el.addEventListener("input", () => paintCode(root)); });
    // Enter/espaço num botão do slide não avançam a apresentação
    const zone = $("[data-api-file]", root);
    if (zone) {
      const inp = $("[data-api-input]", zone);
      $("[data-api-pick]", zone).onclick = () => inp.click();
      inp.onchange = () => pickFile(root, inp.files[0]);
      const req = $(".api-req", root);
      req.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
      req.addEventListener("dragleave", () => zone.classList.remove("drag"));
      req.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("drag"); pickFile(root, e.dataTransfer.files[0]); });
    }
    root.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("button,a,select")) e.stopPropagation(); });
  }

  async function start() {
    roots.forEach(mount);
    if (location.protocol !== "file:") {
      try {
        const st = await call("api/http/state");
        STATE = Object.assign({}, st, { recordings: Object.assign({}, EMBED, st.recordings || {}) });
      } catch {}
    }
    roots.forEach((root) => {
      paintEnv(root);
      paintCode(root);
      const rec = STATE.recordings[root._cfg.key];
      if (!STATE.live && rec) replay(root, rec, false); // HTML exportado / PDF / servidor: mostra o resultado gravado
    });
    window.sagadeckApi = { get state() { return STATE; }, vars, run: (i) => run(roots[i || 0]) };
  }
  start();
})();
