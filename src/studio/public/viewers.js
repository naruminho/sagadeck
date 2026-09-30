/* Visualizadores do explorador (window.SagaViewers), leves e sem dependência de fora:
   - codeEditor: editor de texto com números de linha e realce por linguagem (json, yaml, md, js/ts, py, css, html,
     xml/svg, sql, sh, ini, csv/tsv com cada coluna de uma cor)
   - pdfView: páginas do PDF (pdf.js servido pelo Studio; sem ele, o leitor do navegador)
   - docxView: o .docx convertido em HTML pelo servidor (só leitura)
   - sheetGrid: planilha como no Excel (letras nas colunas, números nas linhas, editar, colar do Excel, desfazer) */
(function () {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // ------------------------------------------------------------------ linguagem pelo nome
  const EXT_LANG = { json: "json", yaml: "yaml", yml: "yaml", md: "md", markdown: "md", js: "js", mjs: "js", cjs: "js", jsx: "js", ts: "js", tsx: "js", py: "py", css: "css", html: "html", htm: "html", xml: "xml", svg: "xml", sql: "sql", sh: "sh", bash: "sh", bat: "sh", ps1: "sh", ini: "ini", toml: "ini", cfg: "ini", csv: "csv", tsv: "tsv", java: "c", c: "c", h: "c", cpp: "c", cs: "c", go: "c", rs: "c", r: "py", m: "m", tex: "tex", bib: "tex" };
  const langOf = (name) => EXT_LANG[(String(name).match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase()] || "plain";

  const KW = {
    js: "break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of static get set null true false undefined from as interface type enum implements",
    py: "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self",
    c: "auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class public private protected new delete this try catch throw namespace using bool true false null package import func var let fn mut impl pub struct string",
    sh: "if then else elif fi for while do done case esac function in echo export local return exit set cd ls rm cp mv mkdir sudo param foreach",
    sql: "select from where group by order having insert into values update set delete create table drop alter join left right inner outer full on as and or not null is in like limit offset distinct union all case when then else end primary key foreign references index view",
    m: "function end if elseif else for while switch case otherwise break continue return global persistent try catch",
  };
  const COMMENT = { js: ["//", "/*"], c: ["//", "/*"], py: ["#"], sh: ["#"], sql: ["--", "/*"], m: ["%"], ini: ["#", ";"], tex: ["%"] };
  const span = (cls, s) => `<span class="hl-${cls}">${esc(s)}</span>`;

  function codeHL(text, lang) {
    const kw = new Set((KW[lang] || "").split(" "));
    const cm = COMMENT[lang] || [];
    const parts = [];
    if (cm.includes("/*")) parts.push(String.raw`\/\*[\s\S]*?(?:\*\/|$)`);
    for (const c of cm.filter((c) => c !== "/*")) parts.push(`${c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}[^\\n]*`);
    const commentRe = parts.join("|") || "(?!)";
    const strRe = lang === "py" ? String.raw`"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rbfu]{0,2}"(?:\\.|[^"\\\n])*"?|[rbfu]{0,2}'(?:\\.|[^'\\\n])*'?`
      : lang === "js" ? String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?`
      : String.raw`"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?`;
    const re = new RegExp(`(${commentRe})|(${strRe})|(\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)|([A-Za-z_$][\\w$]*)|(@[A-Za-z_]\\w*)`, "g");
    let out = "", last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index === re.lastIndex) { re.lastIndex++; continue; }
      out += esc(text.slice(last, m.index));
      if (m[1]) out += span("com", m[1]);
      else if (m[2]) out += span("str", m[2]);
      else if (m[3]) out += span("num", m[3]);
      else if (m[4]) out += kw.has(lang === "sql" ? m[4].toLowerCase() : m[4]) ? span("kw", m[4]) : /^\s*\(/.test(text.slice(re.lastIndex, re.lastIndex + 40)) ? span("fn", m[4]) : esc(m[4]);
      else if (m[5]) out += span("dec", m[5]);
      last = re.lastIndex;
    }
    return out + esc(text.slice(last));
  }
  function jsonHL(text) {
    return text.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([&<>])/g, (all, s, colon, lit, num, ch) => {
      if (s) return colon ? span("key", s) + colon : span("str", s);
      if (lit) return span("kw", lit);
      if (num) return span("num", num);
      return esc(ch);
    });
  }
  function yamlHL(text) {
    return text.split("\n").map((line) => {
      if (/^\s*#/.test(line)) return span("com", line);
      const m = /^(\s*)(- )?([^\s:#][^:#]*?)(:)(\s.*)?$/.exec(line);
      const val = (v) => {
        const [body, com] = (() => { const k = v.search(/\s#/); return k >= 0 ? [v.slice(0, k), v.slice(k)] : [v, ""]; })();
        let h = /^\s*(true|false|null|~|yes|no)\s*$/i.test(body) ? span("kw", body) : /^\s*-?\d+(\.\d+)?\s*$/.test(body) ? span("num", body) : /^\s*["']/.test(body) ? span("str", body) : esc(body);
        return h + (com ? span("com", com) : "");
      };
      if (m) return `${m[1]}${m[2] ? span("punc", "- ") : ""}${span("key", m[3])}${m[4]}${m[5] ? val(m[5]) : ""}`;
      const d = /^(\s*)(- )(.*)$/.exec(line);
      if (d) return `${d[1]}${span("punc", "- ")}${val(d[3])}`;
      return val(line);
    }).join("\n");
  }
  function mdHL(text) {
    let fence = false;
    return text.split("\n").map((line) => {
      if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return span("com", line); }
      if (fence) return span("str", line);
      if (/^#{1,6}\s/.test(line)) return span("key", line);
      if (/^\s*>/.test(line)) return span("com", line);
      let h = esc(line);
      h = h.replace(/^(\s*)([-*+]|\d+[.)])(\s)/, (a, s, b, c) => `${s}<span class="hl-punc">${b}</span>${c}`);
      h = h.replace(/(`[^`]+`)/g, '<span class="hl-str">$1</span>').replace(/(\*\*[^*]+\*\*|__[^_]+__)/g, '<span class="hl-kw">$1</span>').replace(/(\[[^\]]+\]\([^)]+\))/g, '<span class="hl-fn">$1</span>');
      return h;
    }).join("\n");
  }
  function markupHL(text) {
    return text.replace(/(<!--[\s\S]*?(?:-->|$))|(<\/?)([\w:.-]+)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)(\s*\/?>)?|([&<>])/g, (all, com, open, tag, attrs, close, ch) => {
      if (com) return span("com", com);
      if (tag) {
        const a = (attrs || "").replace(/([\w:.-]+)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s>]+)?/g, (x, n, eq, v) => (n ? span("fn", n) : "") + (eq ? esc(eq) : "") + (v ? span("str", v) : ""));
        return span("punc", open) + span("kw", tag) + a + (close ? span("punc", close) : "");
      }
      return esc(ch);
    });
  }
  function cssHL(text) {
    return text.replace(/(\/\*[\s\S]*?(?:\*\/|$))|("[^"]*"|'[^']*')|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|([\w-]+)(\s*:)|([&<>])/g, (all, com, str, num, prop, colon, ch) => {
      if (com) return span("com", com);
      if (str) return span("str", str);
      if (num) return span("num", num);
      if (prop) return span("key", prop) + colon;
      return esc(ch);
    });
  }
  function iniHL(text) {
    return text.split("\n").map((l) => {
      if (/^\s*[#;]/.test(l)) return span("com", l);
      if (/^\s*\[.*\]\s*$/.test(l)) return span("kw", l);
      const m = l.match(/^(\s*[^=:\s][^=:]*?)(\s*[=:])(.*)$/);
      return m ? span("key", m[1]) + esc(m[2]) + span("str", m[3]) : esc(l);
    }).join("\n");
  }
  // CSV: cada coluna de uma cor (como o Rainbow CSV do VS Code), respeitando aspas
  function csvHL(text, delim) {
    const d = delim || (window.SagaCSV ? window.SagaCSV.detect(text) : ",");
    let out = "", col = 0, q = false, cell = "";
    const flush = () => { if (cell) out += `<span class="hl-c${col % 8}">${esc(cell)}</span>`; cell = ""; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { q = !q; cell += c; continue; }
      if (!q && c === d) { flush(); out += `<span class="hl-punc">${esc(c)}</span>`; col++; continue; }
      if (!q && c === "\n") { flush(); out += "\n"; col = 0; continue; }
      cell += c;
    }
    flush();
    return out;
  }
  function highlight(lang, text, opts = {}) {
    if (text.length > 400000) return esc(text);
    switch (lang) {
      case "json": return jsonHL(text);
      case "yaml": return yamlHL(text);
      case "md": return mdHL(text);
      case "html": case "xml": return markupHL(text);
      case "css": return cssHL(text);
      case "ini": return iniHL(text);
      case "csv": return csvHL(text, opts.delimiter);
      case "tsv": return csvHL(text, "\t");
      case "plain": return esc(text);
      default: return codeHL(text, lang);
    }
  }

  // ------------------------------------------------------------------ editor de código
  function codeEditor({ text = "", lang = "plain", readOnly = false, onInput, highlighter } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "cv-editor";
    wrap.innerHTML = `<div class="cv-gutter" aria-hidden="true"></div><div class="cv-area"><pre class="cv-hl" aria-hidden="true"></pre><textarea class="cv-text" spellcheck="false" wrap="off"${readOnly ? " readonly" : ""}></textarea></div>`;
    const ta = wrap.querySelector("textarea"), hl = wrap.querySelector("pre"), gutter = wrap.querySelector(".cv-gutter");
    ta.value = text;
    let lines = -1, raf = 0;
    const paint = () => {
      raf = 0;
      const v = ta.value;
      hl.innerHTML = (highlighter ? highlighter(v) : highlight(lang, v)) + "\n";
      const n = v.split("\n").length;
      if (n !== lines) { lines = n; gutter.innerHTML = Array.from({ length: n }, (_, i) => `<div>${i + 1}</div>`).join(""); }
      sync();
    };
    const sync = () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop; };
    ta.addEventListener("scroll", sync);
    ta.addEventListener("input", () => { if (!raf) raf = requestAnimationFrame(paint); onInput?.(ta.value); });
    ta.addEventListener("keydown", (ev) => {
      if (ev.key === "Tab" && !readOnly) { // Tab indenta como no VS Code (Shift+Tab tira)
        ev.preventDefault();
        const { selectionStart: a, selectionEnd: b, value: v } = ta;
        const ind = lang === "py" || lang === "c" ? "    " : "  ";
        if (!ev.shiftKey && a === b) { ta.setRangeText(ind, a, b, "end"); }
        else {
          const ls = v.lastIndexOf("\n", a - 1) + 1, block = v.slice(ls, b);
          const next = ev.shiftKey ? block.replace(/^( {1,4}|\t)/gm, "") : block.replace(/^/gm, ind);
          ta.setRangeText(next, ls, b, "select");
        }
        ta.dispatchEvent(new Event("input"));
      }
    });
    paint();
    return { wrap, ta, paint, setText: (t) => { ta.value = t; paint(); } };
  }

  // ------------------------------------------------------------------ PDF
  let pdfjs = null;
  async function loadPdfjs() {
    if (pdfjs) return pdfjs;
    const mod = await import(new URL("vendor/pdf.min.mjs", location.href).href);
    mod.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", location.href).href;
    pdfjs = mod;
    return mod;
  }
  async function pdfView(host, url, { name = "" } = {}) {
    host.innerHTML = `<div class="pv-bar"><span class="pv-count">abrindo…</span><span class="pv-grow"></span><button type="button" class="btn btn-small" data-zoom="-1" title="Diminuir"><i class="ic" data-ic="zoom-out"></i></button><span class="pv-zoom">100%</span><button type="button" class="btn btn-small" data-zoom="1" title="Aumentar"><i class="ic" data-ic="zoom-in"></i></button><button type="button" class="btn btn-small" data-zoom="0" title="Largura da tela"><i class="ic" data-ic="maximize-2"></i></button></div><div class="pv-pages"></div>`;
    const pages = host.querySelector(".pv-pages");
    let lib;
    try { lib = await loadPdfjs(); }
    catch { host.innerHTML = `<iframe class="pv-native" src="${esc(url)}" title="${esc(name)}"></iframe>`; return; }
    const doc = await lib.getDocument({ url, isEvalSupported: false }).promise;
    host.querySelector(".pv-count").textContent = `${doc.numPages} ${doc.numPages === 1 ? "página" : "páginas"}`;
    const first = await doc.getPage(1);
    const base = first.getViewport({ scale: 1 });
    let zoom = 0; // 0 = largura da tela
    const scaleNow = () => (zoom || Math.max(0.3, (pages.clientWidth - 48) / base.width));
    const slots = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const slot = document.createElement("div");
      slot.className = "pv-page"; slot.dataset.page = i;
      pages.append(slot); slots.push(slot);
    }
    const drawn = new Map();
    const layout = () => {
      const s = scaleNow();
      host.querySelector(".pv-zoom").textContent = `${Math.round(s * 100)}%`;
      for (const slot of slots) { slot.style.width = `${base.width * s}px`; slot.style.height = `${base.height * s}px`; }
      drawn.clear(); slots.forEach((sl) => (sl.innerHTML = ""));
      io.disconnect(); slots.forEach((sl) => io.observe(sl));
    };
    const draw = async (slot) => {
      const n = +slot.dataset.page, s = scaleNow();
      if (drawn.get(n) === s) return;
      drawn.set(n, s);
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: s * (window.devicePixelRatio || 1) });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      if (drawn.get(n) !== s) return;
      slot.innerHTML = ""; slot.append(c);
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && draw(e.target)), { root: pages, rootMargin: "600px 0px" });
    host.querySelectorAll("[data-zoom]").forEach((b) => (b.onclick = () => {
      const d = +b.dataset.zoom;
      zoom = d === 0 ? 0 : Math.min(4, Math.max(0.25, (zoom || scaleNow()) * (d > 0 ? 1.25 : 0.8)));
      layout();
    }));
    new ResizeObserver(() => { if (!zoom) layout(); }).observe(pages);
    layout();
    return { doc };
  }

  // ------------------------------------------------------------------ DOCX (HTML vindo do servidor)
  function docxView(host, html) {
    host.innerHTML = `<div class="dx-scroll"><article class="dx-page">${html || '<p class="dx-empty">Documento sem texto.</p>'}</article></div>`;
  }

  // ------------------------------------------------------------------ planilha como no Excel
  const colName = (i) => { let s = ""; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  const looksNum = (v) => /^\s*[-+]?(R\$\s*)?(\d{1,3}(\.\d{3})+(,\d+)?|\d+([.,]\d+)?)\s*%?\s*$/.test(String(v ?? ""));
  function sheetGrid(host, { rows, editable = false, hasHeader = false, maxRender = 3000, onChange, types = [] } = {}) {
    let data = rows.map((r) => [...r]);
    const undo = [], redo = [];
    let sel = { r: 0, c: 0, r2: 0, c2: 0 }, editing = null;
    host.innerHTML = `<div class="sg-wrap" tabindex="0"><table class="sg"></table></div>`;
    const wrap = host.querySelector(".sg-wrap"), table = host.querySelector("table");
    const width = () => Math.max(1, ...data.map((r) => r.length));
    const snapshot = () => { undo.push(JSON.stringify(data)); if (undo.length > 100) undo.shift(); redo.length = 0; };
    const changed = () => { render(); onChange?.(data); };
    function render() {
      const W = width(), R = Math.min(data.length, maxRender);
      const colW = Array.from({ length: W }, (_, c) => Math.min(280, Math.max(64, 9 + 7.2 * Math.max(...data.slice(0, 200).map((r) => String(r[c] ?? "").length), 1))));
      table.innerHTML = `<colgroup><col class="sg-n-col">${colW.map((w) => `<col style="width:${w}px">`).join("")}</colgroup>
        <thead><tr><th class="sg-corner"></th>${Array.from({ length: W }, (_, c) => `<th data-col="${c}">${colName(c)}${types[c] ? `<span class="sh-type t-${types[c].type}">${esc(types[c].label)}</span>` : ""}</th>`).join("")}</tr></thead>
        <tbody>${data.slice(0, R).map((r, i) => `<tr${hasHeader && i === 0 ? ' class="sg-head"' : ""}><th data-row="${i}">${i + 1}</th>${Array.from({ length: W }, (_, c) => { const v = r[c] ?? ""; return `<td data-r="${i}" data-c="${c}"${looksNum(v) && !(hasHeader && i === 0) ? ' class="num"' : ""}>${esc(v)}</td>`; }).join("")}</tr>`).join("")}</tbody>`;
      paintSel();
    }
    const cell = (r, c) => table.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    function paintSel() {
      table.querySelectorAll(".sel, .cur").forEach((e) => e.classList.remove("sel", "cur"));
      table.querySelectorAll("th.on").forEach((e) => e.classList.remove("on"));
      const [r1, r2] = [Math.min(sel.r, sel.r2), Math.max(sel.r, sel.r2)], [c1, c2] = [Math.min(sel.c, sel.c2), Math.max(sel.c, sel.c2)];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cell(r, c)?.classList.add("sel");
      const cur = cell(sel.r, sel.c); cur?.classList.add("cur");
      for (let c = c1; c <= c2; c++) table.querySelector(`thead th[data-col="${c}"]`)?.classList.add("on");
      for (let r = r1; r <= r2; r++) table.querySelector(`tbody th[data-row="${r}"]`)?.classList.add("on");
      cur?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    const setCell = (r, c, v) => { while (data.length <= r) data.push(Array(width()).fill("")); const row = data[r]; while (row.length <= c) row.push(""); row[c] = v; };
    function startEdit(initial) {
      if (!editable) return;
      const td = cell(sel.r, sel.c); if (!td) return;
      const inp = document.createElement("input");
      inp.className = "sg-input"; inp.value = initial ?? (data[sel.r]?.[sel.c] ?? "");
      td.textContent = ""; td.append(inp); inp.focus();
      if (initial == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
      editing = { inp, r: sel.r, c: sel.c };
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === "Tab") { ev.preventDefault(); commit(); move(ev.key === "Enter" ? (ev.shiftKey ? -1 : 1) : 0, ev.key === "Tab" ? (ev.shiftKey ? -1 : 1) : 0); }
        else if (ev.key === "Escape") { ev.preventDefault(); editing = null; render(); wrap.focus(); }
        ev.stopPropagation();
      });
      inp.addEventListener("blur", () => editing && commit());
    }
    function commit() {
      const e = editing; if (!e) return;
      editing = null;
      if ((data[e.r]?.[e.c] ?? "") !== e.inp.value) { snapshot(); setCell(e.r, e.c, e.inp.value); changed(); } else render();
      wrap.focus();
    }
    function move(dr, dc, extend = false) {
      const r = Math.max(0, Math.min(data.length - (editable ? 0 : 1), sel.r2 + dr)), c = Math.max(0, Math.min(width() - (editable ? 0 : 1), sel.c2 + dc));
      if (extend) { sel.r2 = r; sel.c2 = c; } else sel = { r, c, r2: r, c2: c };
      if (r >= data.length || c >= width()) { setCell(r, c, data[r]?.[c] ?? ""); render(); } else paintSel();
    }
    const range = () => { const [r1, r2] = [Math.min(sel.r, sel.r2), Math.max(sel.r, sel.r2)], [c1, c2] = [Math.min(sel.c, sel.c2), Math.max(sel.c, sel.c2)]; return { r1, r2, c1, c2 }; };
    table.addEventListener("mousedown", (ev) => {
      const td = ev.target.closest("td"), th = ev.target.closest("th");
      if (td && !td.querySelector("input")) {
        const r = +td.dataset.r, c = +td.dataset.c;
        if (ev.shiftKey) { sel.r2 = r; sel.c2 = c; } else sel = { r, c, r2: r, c2: c };
        paintSel(); wrap.focus(); ev.preventDefault();
        const over = (e2) => { const t2 = e2.target.closest?.("td"); if (t2) { sel.r2 = +t2.dataset.r; sel.c2 = +t2.dataset.c; paintSel(); } };
        table.addEventListener("mouseover", over);
        window.addEventListener("mouseup", () => table.removeEventListener("mouseover", over), { once: true });
      } else if (th?.dataset.col) { const c = +th.dataset.col; sel = { r: 0, c, r2: data.length - 1, c2: c }; paintSel(); wrap.focus(); }
      else if (th?.dataset.row) { const r = +th.dataset.row; sel = { r, c: 0, r2: r, c2: width() - 1 }; paintSel(); wrap.focus(); }
    });
    table.addEventListener("dblclick", (ev) => { if (ev.target.closest("td")) startEdit(); });
    wrap.addEventListener("keydown", (ev) => {
      if (editing) return;
      const k = ev.key, mod = ev.ctrlKey || ev.metaKey;
      const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (arrows[k]) { ev.preventDefault(); move(...arrows[k], ev.shiftKey); }
      else if (k === "Enter") { ev.preventDefault(); if (editable && !ev.shiftKey) startEdit(); else move(ev.shiftKey ? -1 : 1, 0); }
      else if (k === "Tab") { ev.preventDefault(); move(0, ev.shiftKey ? -1 : 1); }
      else if (k === "F2") { ev.preventDefault(); startEdit(); }
      else if ((k === "Delete" || k === "Backspace") && editable) {
        ev.preventDefault(); snapshot();
        const { r1, r2, c1, c2 } = range();
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (data[r] && c < data[r].length) data[r][c] = "";
        changed();
      } else if (mod && k.toLowerCase() === "z" && editable) { ev.preventDefault(); if (undo.length) { redo.push(JSON.stringify(data)); data = JSON.parse(undo.pop()); changed(); } }
      else if (mod && k.toLowerCase() === "y" && editable) { ev.preventDefault(); if (redo.length) { undo.push(JSON.stringify(data)); data = JSON.parse(redo.pop()); changed(); } }
      else if (mod && k.toLowerCase() === "a") { ev.preventDefault(); sel = { r: 0, c: 0, r2: data.length - 1, c2: width() - 1 }; paintSel(); }
      else if (editable && k.length === 1 && !mod && !ev.altKey) { ev.preventDefault(); startEdit(k); }
    });
    // copiar e colar no formato do Excel (tab entre colunas, quebra entre linhas)
    wrap.addEventListener("copy", (ev) => {
      if (editing) return;
      const { r1, r2, c1, c2 } = range();
      const tsv = data.slice(r1, r2 + 1).map((r) => Array.from({ length: c2 - c1 + 1 }, (_, k) => r[c1 + k] ?? "").join("\t")).join("\n");
      ev.clipboardData.setData("text/plain", tsv); ev.preventDefault();
    });
    wrap.addEventListener("paste", (ev) => {
      if (editing || !editable) return;
      const text = ev.clipboardData.getData("text/plain"); if (!text) return;
      ev.preventDefault(); snapshot();
      const block = window.SagaCSV ? window.SagaCSV.parse(text, text.includes("\t") ? "\t" : undefined).rows : text.split(/\r?\n/).map((l) => l.split("\t"));
      block.forEach((row, i) => row.forEach((v, j) => setCell(sel.r + i, sel.c + j, v)));
      sel.r2 = sel.r + block.length - 1; sel.c2 = sel.c + Math.max(...block.map((r) => r.length)) - 1;
      changed();
    });
    // botão direito: linhas e colunas, como no Excel
    host.addEventListener("contextmenu", (ev) => {
      const td = ev.target.closest("td, th"); if (!td || !editable || !window.SagaViewers.contextMenu) return;
      ev.preventDefault();
      if (td.dataset.r != null && !(+td.dataset.r >= Math.min(sel.r, sel.r2) && +td.dataset.r <= Math.max(sel.r, sel.r2) && +td.dataset.c >= Math.min(sel.c, sel.c2) && +td.dataset.c <= Math.max(sel.c, sel.c2))) { const r = +td.dataset.r, c = +td.dataset.c; sel = { r, c, r2: r, c2: c }; paintSel(); }
      const { r1, r2, c1, c2 } = range();
      const op = (fn) => () => { snapshot(); fn(); changed(); };
      window.SagaViewers.contextMenu(ev, [
        { label: "Inserir linha acima", ic: "arrow-up", fn: op(() => data.splice(r1, 0, Array(width()).fill(""))) },
        { label: "Inserir linha abaixo", ic: "arrow-down", fn: op(() => data.splice(r2 + 1, 0, Array(width()).fill(""))) },
        { label: "Inserir coluna à esquerda", ic: "arrow-left", fn: op(() => data.forEach((r) => r.splice(c1, 0, ""))) },
        { label: "Inserir coluna à direita", ic: "arrow-right", fn: op(() => data.forEach((r) => r.splice(c2 + 1, 0, ""))) },
        { sep: true },
        { label: r2 > r1 ? `Excluir ${r2 - r1 + 1} linhas` : "Excluir linha", ic: "trash-2", danger: true, fn: op(() => { data.splice(r1, r2 - r1 + 1); if (!data.length) data.push([""]); sel = { r: Math.min(r1, data.length - 1), c: sel.c, r2: Math.min(r1, data.length - 1), c2: sel.c }; }) },
        { label: c2 > c1 ? `Excluir ${c2 - c1 + 1} colunas` : "Excluir coluna", ic: "trash-2", danger: true, fn: op(() => { data.forEach((r) => r.splice(c1, c2 - c1 + 1)); sel = { r: sel.r, c: Math.max(0, c1 - 1), r2: sel.r, c2: Math.max(0, c1 - 1) }; }) },
      ]);
    });
    render();
    if (data.length > maxRender) host.insertAdjacentHTML("beforeend", `<div class="sh-more">mostrando ${maxRender} de ${data.length} linhas</div>`);
    return { get rows() { return data; }, focus: () => wrap.focus(), select: (r, c) => { sel = { r, c, r2: r, c2: c }; paintSel(); } };
  }

  window.SagaViewers = { langOf, highlight, codeEditor, pdfView, docxView, sheetGrid, colName, contextMenu: null };
})();
