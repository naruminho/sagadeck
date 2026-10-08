// Cabeçalho e rodapé do deck: modelos prontos, campos com variáveis ({autor}, {data:…}, {n}) e prévia do slide atual.
// Saiu do app.js pela trava de tamanho dos monolitos; o comportamento é o mesmo.
// Fábrica no molde de slide-select.js: recebe o estado e os ajudantes, devolve a API.
window.SagaHeaderFooter = function ({ state, fitRendered, syncDeckToServer, renderCurrentSlide, renderThumbnails, showToast }) {
  const HF_PRESETS = [
    { id: "padrao", name: "Padrão", desc: "Título e número", footer: null, header: null },
    { id: "autor", name: "Autor e evento", desc: "Autor · evento e 3 / 20", footer: { left: "{autor} · {evento}", right: "{n} / {total}" }, header: null },
    { id: "evento", name: "Evento e data", desc: "Evento, data e número", footer: { left: "{evento}", center: "{data:DD MMM AAAA}", right: "{pagina}" }, header: null },
    { id: "corp", name: "Corporativo", desc: "Área e Confidencial em cima; título, data e página embaixo",
      header: { left: "{depto}", right: "Confidencial" }, footer: { left: "{titulo}", center: "{data:MM/AAAA}", right: "{n} / {total}" } },
    { id: "numero", name: "Só o número", desc: "Número discreto no canto", footer: { right: "{n}" }, header: null },
    { id: "nenhum", name: "Nenhum", desc: "Slides limpos", footer: false, header: null },
  ];
  const HF_TOKENS = [["{titulo}", "Título"], ["{autor}", "Autor"], ["{evento}", "Evento"], ["{depto}", "Departamento"], ["{data:DD/MM/AAAA}", "Data"],
    ["{data:DD MMM AAAA}", "Data por extenso"], ["{pagina}", "Página (01)"], ["{n}", "Página (1)"], ["{total}", "Total"]];
  const HF_SLOTS = ["header.left", "header.center", "header.right", "footer.left", "footer.center", "footer.right"];
  const hfModal = () => document.getElementById("modal-hf");
  let hfLastInput = null;
  let hfTimer = null;

  // footer/header do deck -> valores dos 6 campos (o padrão sem footer = título + número)
  function hfSlotsFrom(v, kind, deck) {
    if (v === false) return { left: "", center: "", right: "" };
    if (v == null) return kind === "footer" ? { left: "{titulo}", center: "", right: "{pagina}" } : { left: "", center: "", right: "" };
    if (typeof v === "string") return { left: v, center: "", right: "{pagina}" };
    return { left: v.left || "", center: v.center || "", right: v.right || "" };
  }

  function hfFill(deckLike) {
    const m = hfModal();
    for (const k of ["author", "event", "department", "date"]) m.querySelector(`[data-deck="${k}"]`).value = deckLike[k] || "";
    for (const kind of ["header", "footer"]) {
      const v = hfSlotsFrom(deckLike[kind], kind, deckLike);
      for (const pos of ["left", "center", "right"]) m.querySelector(`[data-slot="${kind}.${pos}"]`).value = v[pos];
    }
  }

  // o que os campos do modal significam como deck (footer/header "limpos": null = padrão, false = nenhum)
  function hfRead() {
    const m = hfModal();
    const out = {};
    for (const k of ["author", "event", "department", "date"]) out[k] = m.querySelector(`[data-deck="${k}"]`).value.trim();
    for (const kind of ["header", "footer"]) {
      const v = Object.fromEntries(["left", "center", "right"].map((p) => [p, m.querySelector(`[data-slot="${kind}.${p}"]`).value.trim()]));
      const empty = !v.left && !v.center && !v.right;
      if (kind === "footer" && v.left === "{titulo}" && !v.center && v.right === "{pagina}") out.footer = null;
      else if (empty) out[kind] = kind === "footer" ? false : null;
      else out[kind] = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
    }
    return out;
  }

  function hfApplyTo(deck, vals) {
    for (const [k, v] of Object.entries(vals)) {
      if (v == null || v === "") delete deck[k];
      else deck[k] = v;
    }
    return deck;
  }

  function openHeaderFooter() {
    const m = hfModal();
    const presets = m.querySelector(".hf-presets");
    if (!presets.childElementCount) {
      for (const p of HF_PRESETS) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hf-preset";
        b.dataset.preset = p.id;
        b.innerHTML = `<b></b><span></span>`;
        b.querySelector("b").textContent = p.name;
        b.querySelector("span").textContent = p.desc;
        b.onclick = () => {
          const cur = hfRead();
          hfFill({ ...cur, footer: p.footer, header: p.header });
          presets.querySelectorAll(".hf-preset").forEach((x) => x.classList.toggle("active", x === b));
          hfPreview();
        };
        presets.append(b);
      }
      const chips = m.querySelector(".hf-tokens");
      for (const [tok, label] of HF_TOKENS) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "hf-token";
        c.dataset.token = tok;
        c.textContent = label;
        c.title = tok;
        c.onmousedown = (e) => e.preventDefault(); // não rouba o foco do campo
        c.onclick = () => {
          const inp = hfLastInput || m.querySelector('[data-slot="footer.left"]');
          const a = inp.selectionStart ?? inp.value.length, z = inp.selectionEnd ?? a;
          inp.value = inp.value.slice(0, a) + tok + inp.value.slice(z);
          inp.focus();
          inp.setSelectionRange(a + tok.length, a + tok.length);
          hfPreview();
        };
        chips.append(c);
      }
      m.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("focus", () => { if (inp.dataset.slot) hfLastInput = inp; });
        inp.addEventListener("input", () => { clearTimeout(hfTimer); hfTimer = setTimeout(hfPreview, 250); });
      });
    }
    hfFill(state.deck);
    m.classList.remove("hidden");
    hfPreview();
  }

  function closeHeaderFooter() {
    hfModal().classList.add("hidden");
  }

  async function hfPreview() {
    const stage = hfModal().querySelector(".hf-stage");
    const spec = hfApplyTo(JSON.parse(JSON.stringify(state.deck)), hfRead());
    // na prévia, um slide que mostra rodapé (a capa não mostra)
    let i = state.currentSlideIndex;
    const NO_BARS = ["cover", "section", "end", "image", "canvas", "full", "headline"];
    if (NO_BARS.includes(spec.slides[i]?.layout)) i = Math.max(0, spec.slides.findIndex((s) => !NO_BARS.includes(s.layout)));
    try {
      const r = await (await fetch("api/render-slide", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide: spec.slides[i], index: i, spec }) })).json();
      stage.innerHTML = `<div class="thumb-render">${r.html}</div>`;
      requestAnimationFrame(() => fitRendered(stage));
      stage.style.setProperty("--thumb-scale", String(stage.clientWidth / 1920));
    } catch {}
  }

  function applyHeaderFooter() {
    hfApplyTo(state.deck, hfRead());
    closeHeaderFooter();
    syncDeckToServer();
    renderCurrentSlide();
    renderThumbnails();
    showToast("Cabeçalho e rodapé aplicados em todos os slides", 2200);
  }

  return { openHeaderFooter, closeHeaderFooter, applyHeaderFooter };
};
