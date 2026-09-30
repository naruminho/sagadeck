/* Inspetor de propriedades (como o Object Inspector do Delphi / o painel da direita do Figma).
   Mostra só o que faz sentido para o que está selecionado no slide; Slide e Apresentação ficam sempre à vista.
   Categorias recolhíveis (o que fica aberto é lembrado neste navegador). Toda mudança grava no deck. */
(function () {
  let host, ctx, pending = false;
  const KEY = "sagadeck.inspectorOpen";
  const openCats = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
  const saveOpen = () => { try { localStorage.setItem(KEY, JSON.stringify(openCats)); } catch {} };
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ic = (name) => `<i class="ic" data-ic="${name}"></i>`;

  // ---------- o que existe para cada tipo de objeto ----------
  const is = {
    text: (els) => els.every((n) => n.classList.contains("t")),
    shape: (els) => els.every((n) => n.classList.contains("shape")),
    drawn: (els) => els.every((n) => n.querySelector(":scope > .shape-svg")),
    image: (els) => els.every((n) => n.classList.contains("fig-img") || n.querySelector(":scope > img")),
  };
  const WEIGHTS = [["", "Do tema"], ["400", "Normal"], ["500", "Médio"], ["600", "Semibold"], ["700", "Negrito"], ["800", "Extra"]];
  const ALIGNS = [["", "Do layout"], ["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"], ["justify", "Justificado"]];
  const SHADOWS = [["", "Nenhuma"], ["suave", "Suave"], ["forte", "Forte"]];
  const ANIMS = [["", "Do tema"], ["fade", "Aparecer"], ["pop", "Pular"], ["left", "Da esquerda"], ["right", "Da direita"], ["down", "De cima"], ["zoom", "Zoom"], ["none", "Sem animação"]];

  function objectCats(els) {
    const cats = [{ id: "obj-pos", title: "Posição e tamanho", rows: [
      { k: "dx", label: "Mover na horizontal", type: "num", unit: "px" },
      { k: "dy", label: "Mover na vertical", type: "num", unit: "px" },
      { k: "w", label: "Largura", type: "num", unit: "px", min: 20 },
      { k: "h", label: "Altura", type: "num", unit: "px", min: 20 },
      { k: "rotate", label: "Rotação", type: "num", unit: "°", min: -360, max: 360 },
      { k: "z", label: "Camada (frente/trás)", type: "num", step: 1 },
    ] }];
    if (is.text(els)) cats.push({ id: "obj-text", title: "Texto", rows: [
      { k: "size", label: "Tamanho", type: "num", unit: "px", min: 10, max: 500 },
      { k: "color", label: "Cor", type: "color" },
      { k: "weight", label: "Peso", type: "select", options: WEIGHTS, num: true },
      { k: "italic", label: "Itálico", type: "bool" },
      { k: "align", label: "Alinhamento", type: "select", options: ALIGNS },
      { k: "lineHeight", label: "Entrelinha", type: "num", unit: "×", step: 0.05, min: 0.7, max: 3 },
      { k: "letterSpacing", label: "Espaço entre letras", type: "num", unit: "em", step: 0.01, min: -0.1, max: 0.5 },
      { k: "uppercase", label: "Tudo maiúsculo", type: "bool" },
    ] });
    if (is.shape(els)) cats.push({ id: "obj-shape", title: "Preenchimento e contorno", rows: [
      { k: "fill", label: "Preenchimento", type: "color" },
      { k: "stroke", label: "Contorno", type: "color" },
      { k: "strokeWidth", label: "Espessura do contorno", type: "num", unit: "px", min: 0, max: 40 },
      ...(is.drawn(els) ? [] : [{ k: "radius", label: "Cantos arredondados", type: "num", unit: "px", min: 0 }]),
    ] });
    const look = [
      { k: "opacity", label: "Opacidade", type: "range", unit: "%", scale: 100 },
      { k: "shadow", label: "Sombra", type: "select", options: SHADOWS },
    ];
    if (is.image(els)) look.push({ k: "radius", label: "Cantos arredondados", type: "num", unit: "px", min: 0 }, { k: "stroke", label: "Borda", type: "color" }, { k: "strokeWidth", label: "Espessura da borda", type: "num", unit: "px", min: 0, max: 40 });
    cats.push({ id: "obj-look", title: "Aparência", rows: look });
    cats.push({ id: "obj-anim", title: "Animação", rows: [
      { k: "step", label: "Aparece no clique", type: "num", step: 1, min: 1, hint: "vazio = já aparece ao entrar no slide" },
      { k: "anim", label: "Entrada", type: "select", options: ANIMS },
    ] });
    cats.push({ id: "obj-adv", title: "Avançado", rows: [
      { k: "hidden", label: "Oculto", type: "bool" },
      { k: "__key", label: "Identificador", type: "readonly" },
      { k: "__clear", label: "Ajustes deste objeto", type: "action", text: "Limpar tudo" },
    ] });
    return cats;
  }

  function slideCats() {
    const S = ctx.state, slide = S.deck?.slides?.[S.currentSlideIndex] || {};
    const opt = (sel) => [...(document.getElementById(sel)?.options || [])].map((o) => [o.value, o.textContent]);
    return [{ id: "slide", title: `Slide ${S.currentSlideIndex + 1}`, target: "slide", rows: [
      { k: "layout", label: "Layout", type: "select", options: ctx.layouts(), noEmpty: true },
      { k: "tone", label: "Tom", type: "select", options: [["", "Do layout"], ...opt("tone-select")] },
      { k: "deco", label: "Textura", type: "select", options: [["", "Do tema"], ...opt("deco-select")] },
      { k: "density", label: "Densidade", type: "select", options: [["", "Padrão"], ["compact", "Compacta"], ["dense", "Mais conteúdo"]] },
      { k: "time", label: "Tempo", type: "num", unit: "min", step: 0.5, min: 0 },
      { k: "transition", label: "Transição", type: "select", options: [["", "Esmaecer"], ["cut", "Corte seco"]] },
      { k: "maxWords", label: "Limite de palavras", type: "num", min: 10, max: 600, step: 10, hint: "vazio = o da apresentação" },
      { k: "footer", label: "Rodapé", type: "select", options: [["", "Automático"], ["true", "Mostrar"], ["false", "Esconder"]], bool3: true },
      { k: "theme", label: "Tema só neste slide", type: "select", options: [["", "O da apresentação"], ...ctx.themes()] },
      { k: "palette", label: "Paleta só neste slide", type: "select", options: [["", "A da apresentação"], ...ctx.palettes()] },
      { k: "bg", label: "Cor de fundo", type: "color" },
    ] }, { id: "deck", title: "Apresentação", target: "deck", rows: [
      { k: "aspect", label: "Proporção do slide", type: "select", hint: "16:9, 4:3, retrato… ou personalizada (L:A). Ao trocar, os layouts se ajustam sozinhos e o que tem posição livre é reescalado.", options: ctx.aspects?.() || [["", "16:9"]] },
      { k: "purpose", label: "Uso do material", type: "select", hint: "Para apresentar: letra grande, pouco texto, para não dar sono. Para estudar depois: o material vai ser enviado e usado como fonte de estudo, então cabe bastante texto no slide.", options: [["", "Para apresentar: letra grande, pouco texto"], ...ctx.purposes()] },
      { k: "maxWords", label: "Limite de palavras por slide", type: "num", min: 10, max: 600, step: 10, hint: "vazio = o do tipo de material" },
      { k: "theme", label: "Tema", type: "select", options: ctx.themes(), noEmpty: true },
      { k: "palette", label: "Paleta", type: "select", options: [["", "A do tema"], ...ctx.palettes()] },
      { k: "markStyle", label: "Estilo do ==destaque==", type: "select", options: [["", "Marca-texto"], ["sublinhado", "Sublinhado"], ["cor", "Só cor"], ["negrito", "Negrito colorido"], ["nenhum", "Sem destaque"]] },
      { k: "motion", label: "Animações", type: "select", options: [["", "Suaves"], ["none", "Sem animação"], ["expressive", "Expressivas"]] },
      { k: "duration", label: "Duração", type: "num", unit: "min", min: 1, max: 600 },
      { k: "author", label: "Autor", type: "text" },
      { k: "date", label: "Data", type: "text", placeholder: "AAAA-MM-DD" },
      { k: "fit.minCodePt", label: "Mínimo do código ao encolher", type: "num", unit: "pt", min: 6, max: 24, hint: "vazio = o das Preferências" },
      { k: "fit.minTextPt", label: "Mínimo do texto ao encolher", type: "num", unit: "pt", min: 6, max: 30 },
      { k: "fit.wrapCode", label: "Quebrar linhas longas de código", type: "select", options: [["", "O das Preferências"], ["true", "Sim"], ["false", "Não"]], bool3: true },
    ] }];
  }

  // ---------- valores ----------
  const getPath = (o, k) => k.split(".").reduce((v, p) => (v == null ? undefined : v[p]), o);
  // "fit.minCodePt" = o.fit.minCodePt; undefined apaga (e tira o objeto fit se ficou vazio)
  function setPath(o, k, v) {
    const [a, b] = k.split(".");
    if (!b) { if (v === undefined) delete o[a]; else o[a] = v; return; }
    if (v === undefined) { if (o[a]) { delete o[a][b]; if (!Object.keys(o[a]).length) delete o[a]; } return; }
    o[a] = { ...(o[a] && typeof o[a] === "object" ? o[a] : {}), [b]: v };
  }
  const idOf = (catId, k) => `ip-${catId}-${k}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  function objValue(els, k) {
    if (k === "__key") return els.map((n) => n.dataset.vkey).join(", ");
    const vals = els.map((n) => window.SagaVisual.edits(n)[k]);
    return vals.every((v) => JSON.stringify(v) === JSON.stringify(vals[0])) ? vals[0] : "__varios";
  }
  function parse(row, raw, el) {
    if (row.type === "bool") return el.checked ? true : undefined;
    if (raw === "" || raw == null) return undefined;
    if (row.bool3) return raw === "true";
    if (row.type === "num" || row.type === "range" || row.num) { let n = Number(raw); if (!Number.isFinite(n)) return undefined; if (row.scale) n /= row.scale; return n; }
    if (row.type === "color") return raw;
    return String(raw);
  }

  function control(row, value, catId) {
    const id = idOf(catId, row.k);
    const many = value === "__varios", v = many ? undefined : value;
    const shown = row.scale && v != null ? Math.round(v * row.scale) : v;
    const attrs = `id="${id}" data-k="${esc(row.k)}" aria-label="${esc(row.label)}"`;
    switch (row.type) {
      case "bool": return `<input type="checkbox" ${attrs}${v ? " checked" : ""}${many ? ' class="ip-many"' : ""}>`;
      case "select": return `<select ${attrs}>${row.options.map(([ov, ol]) => `<option value="${esc(ov)}"${String(shown ?? "") === String(ov) ? " selected" : ""}>${esc(ol)}</option>`).join("")}${many ? '<option value="__varios" selected>vários</option>' : ""}</select>`;
      case "color": return `<span class="ip-color"><input type="color" ${attrs} value="${/^#[0-9a-f]{6}$/i.test(v || "") ? v : "#888888"}"><span class="ip-hex">${many ? "vários" : v ? esc(v) : "padrão"}</span></span>`;
      case "range": return `<span class="ip-range"><input type="range" min="0" max="100" step="1" ${attrs} value="${shown ?? 100}"><span class="ip-unit">${many ? "vários" : `${shown ?? 100}%`}</span></span>`;
      case "readonly": return `<span class="ip-ro" title="${esc(v)}">${esc(v)}</span>`;
      case "action": return `<button type="button" class="ip-action" ${attrs}>${esc(row.text)}</button>`;
      case "text": return `<input type="text" ${attrs} value="${esc(shown ?? "")}" placeholder="${esc(row.placeholder || "")}">`;
      default: return `<span class="ip-num"><input type="number" ${attrs} value="${shown ?? ""}" placeholder="${many ? "vários" : esc(row.hint ? "—" : "")}"${row.min != null ? ` min="${row.min}"` : ""}${row.max != null ? ` max="${row.max}"` : ""} step="${row.step ?? 1}">${row.unit ? `<span class="ip-unit">${esc(row.unit)}</span>` : ""}</span>`;
    }
  }

  function catHTML(cat, valueOf) {
    const isOpen = openCats[cat.id] !== false;
    const rows = cat.rows.map((row) => {
      const value = valueOf(row.k);
      const set = value !== undefined && value !== "__varios" && row.type !== "readonly" && row.type !== "action";
      return `<div class="ip-row" data-row="${esc(row.k)}"${row.hint ? ` title="${esc(row.hint)}"` : ""}><label class="ip-l" for="${idOf(cat.id, row.k)}">${esc(row.label)}</label><div class="ip-v">${control(row, value, cat.id)}</div><button type="button" class="ip-reset" data-reset="${esc(row.k)}" title="Voltar ao padrão" aria-label="Voltar ${esc(row.label)} ao padrão"${set ? "" : " hidden"}>${ic("rotate-ccw")}</button></div>`;
    }).join("");
    return `<details class="ip-cat" data-cat="${cat.id}"${isOpen ? " open" : ""}><summary>${esc(cat.title)}</summary><div class="ip-rows">${rows}</div></details>`;
  }

  function render() {
    if (!host || !ctx?.state?.deck) return;
    if (host.contains(document.activeElement) && document.activeElement.matches("input[type=number], input[type=text]")) { pending = true; return; } // digitando: não redesenha
    pending = false;
    const els = window.SagaVisual?.selection() || [];
    const S = ctx.state, slide = S.deck.slides[S.currentSlideIndex] || {};
    let html = "";
    if (els.length) {
      const kind = is.text(els) ? "Texto" : is.shape(els) ? "Forma" : is.image(els) ? "Imagem" : "Objeto";
      const name = els.length > 1 ? `${els.length} objetos` : `${kind}${els[0].textContent.trim() ? `: “${els[0].textContent.trim().slice(0, 28)}”` : ""}`;
      html += `<section class="ip-sec" data-sec="obj"><h4>${ic(kind === "Texto" ? "type" : kind === "Forma" ? "square" : kind === "Imagem" ? "image" : "shapes")}<span>${esc(name)}</span></h4>${objectCats(els).map((c) => catHTML(c, (k) => objValue(els, k))).join("")}</section>`;
    }
    // o conteúdo do slide (itens do carrossel, fotos, destaques do screenshot, dados do gráfico…) mora no Formatar
    html += `<button type="button" class="ip-content" data-open-content>${ic("pencil")}<span>Editar o conteúdo do slide</span></button>`;
    const [sc, dc] = slideCats();
    html += `<section class="ip-sec" data-sec="slide">${catHTML(sc, (k) => { const v = getPath(slide, k); return v === undefined ? undefined : typeof v === "boolean" ? String(v) : v; })}</section>`;
    html += `<section class="ip-sec" data-sec="deck">${catHTML(dc, (k) => { const v = getPath(S.deck, k); return v === undefined ? undefined : typeof v === "boolean" ? String(v) : v; })}</section>`;
    host.innerHTML = html;
    ctx.hydrate(host);
    bind(els);
  }

  function rowOf(k, secId) {
    const cats = secId === "obj" ? objectCats(window.SagaVisual.selection()) : slideCats();
    for (const c of cats) { const r = c.rows.find((x) => x.k === k); if (r && (secId === "obj" || c.target === secId)) return r; }
    return null;
  }

  function apply(sec, row, value) {
    if (sec === "obj") {
      if (row.k === "__clear") { window.SagaVisual.clearEdits(); return; }
      window.SagaVisual.setProp(row.k, value ?? null); // grava, com Desfazer, em todos os selecionados
      return;
    }
    const S = ctx.state;
    if (sec === "slide") {
      const slide = S.deck.slides[S.currentSlideIndex];
      if (row.k === "layout") return ctx.changeLayout(value);
      if (row.k === "theme" || row.k === "palette") return value === undefined ? ctx.applyLook(row.k, slide[row.k], "reset") : ctx.applyLook(row.k, value, "slide");
      setPath(slide, row.k, row.k === "bg" && value ? value.replace("#", "") : value);
    } else {
      if (row.k === "aspect") {
        const v = value === "__custom" ? window.prompt("Proporção personalizada (largura:altura), ex.: 5:4 ou 1200:900", "5:4") : value;
        if (v == null) return render();
        return ctx.changeAspect(v || "16:9");
      }
      if (row.k === "theme") return ctx.applyLook("theme", value, "all");
      if (row.k === "palette") return ctx.applyLook("palette", value ?? "tema", "all");
      setPath(S.deck, row.k, value);
    }
    ctx.commit();
  }

  function bind() {
    host.querySelector("[data-open-content]")?.addEventListener("click", () => ctx.openContent?.());
    // grava já no clique (o evento toggle chega depois, e um recarregamento logo em seguida o perderia)
    host.querySelectorAll("details.ip-cat").forEach((d) => {
      d.querySelector(":scope > summary").addEventListener("click", () => { openCats[d.dataset.cat] = !d.open; saveOpen(); });
      d.addEventListener("toggle", () => { openCats[d.dataset.cat] = d.open; saveOpen(); });
    });
    host.querySelectorAll("[data-k]").forEach((el) => {
      const sec = el.closest(".ip-sec").dataset.sec, row = rowOf(el.dataset.k, sec);
      if (!row) return;
      if (row.type === "action") { el.onclick = () => apply(sec, row); return; }
      if (row.type === "range") el.addEventListener("input", () => { el.nextElementSibling.textContent = `${el.value}%`; });
      el.addEventListener("change", () => { if (el.value === "__varios") return; apply(sec, row, parse(row, el.value, el)); });
      if (el.matches("input[type=number], input[type=text]")) {
        el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
        el.addEventListener("blur", () => { if (pending) setTimeout(render, 0); });
      }
    });
    host.querySelectorAll("[data-reset]").forEach((b) => {
      const sec = b.closest(".ip-sec").dataset.sec, row = rowOf(b.dataset.reset, sec);
      b.onclick = () => row && apply(sec, row, undefined);
    });
  }

  function setup(container, context) {
    host = container; ctx = context;
    window.SagaVisual?.onSelect((els, why) => { ctx.onSelection?.(els, why); render(); });
    render();
  }
  window.SagaInspector = { setup, refresh: render };
})();
