// Edição visual sobre a imagem original. Só aplica alterações ao confirmar.
(function () {
  "use strict";
  window.ScreenshotEditor = { open };
  function open(slide = {}, file) {
    return new Promise(resolve => {
      const draft = JSON.parse(JSON.stringify(slide));
      let spots = draft.hotspots || [], selected = spots.length ? 0 : -1, mode = "point", image = draft.image || "", drag, loading = false;
      const previous = document.activeElement;
      const dlg = document.createElement("dialog");
      dlg.className = "shot-dialog";
      dlg.setAttribute("aria-labelledby", "shot-title");
      dlg.innerHTML = `<header><div><small>SCREENSHOT INTERATIVO</small><h2 id="shot-title">Mostre exatamente onde olhar.</h2></div><button data-close aria-label="Fechar"><i class="ic" data-ic="x"></i></button></header>
        <div class="shot-tools"><button data-file>Escolher imagem</button><span class="shot-divider"></span><button data-mode="point" aria-pressed="true"><i class="ic" data-ic="crosshair"></i> Ponto</button><button data-mode="area" aria-pressed="false"><i class="ic" data-ic="square-dashed"></i> Área</button><span class="shot-hint">Clique para marcar. Arraste um ponto para reposicionar.</span></div>
        <div class="shot-work"><div class="shot-stage"><div class="shot-empty"><b>Cole seu screenshot aqui</b><span>Ctrl+V, arraste ou escolha uma imagem</span><small>PNG, JPEG ou WebP · até 8 MB</small></div><div class="shot-image-wrap" hidden><img alt="Screenshot para marcar"><div class="shot-marks"></div></div></div>
        <aside><label>Título da cena<input data-title placeholder="Ex.: Configure seu workflow" maxlength="160"></label><label>Legenda da imagem<input data-caption placeholder="Opcional" maxlength="300"></label><div class="shot-steps-head"><b>Passos da explicação</b><span data-count>0</span></div><div class="shot-list"></div><div class="shot-fields" hidden><label>Destaque<input data-label maxlength="120" placeholder="Ex.: Clique em Executar"></label><label>Explicação<textarea data-text rows="3" placeholder="O que a pessoa precisa saber?"></textarea></label><div class="shot-order"><button data-up aria-label="Mover passo para cima"><i class="ic" data-ic="arrow-up"></i></button><button data-down aria-label="Mover passo para baixo"><i class="ic" data-ic="arrow-down"></i></button><button data-delete>Remover passo</button></div></div><p class="shot-tip">Na aula, um destaque por vez. No PDF, todos numerados com suas explicações.</p></aside></div>
        <footer><span class="shot-status" role="status"></span><button data-cancel>Cancelar</button><button data-apply class="shot-primary">Usar screenshot</button></footer><input data-input type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
      document.body.appendChild(dlg);
      // ícones desenhados (pacote do Studio), nunca caractere unicode
      dlg.querySelectorAll(".ic[data-ic]").forEach((el) => { const svg = (window.UI_ICONS || {})[el.dataset.ic]; if (svg) el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`; });
      const $ = s => dlg.querySelector(s);
      const img = $("img"), wrap = $(".shot-image-wrap"), stage = $(".shot-stage"), marks = $(".shot-marks");
      $("[data-title]").value = draft.title || "";
      $("[data-caption]").value = draft.caption || "";
      const status = text => { $(".shot-status").textContent = text; };
      function finish(value) { observer.disconnect(); dlg.close(); dlg.remove(); previous?.focus(); resolve(value); }
      $("[data-close]").onclick = $("[data-cancel]").onclick = () => finish(null);
      dlg.addEventListener("cancel", e => { e.preventDefault(); finish(null); });
      dlg.addEventListener("keydown", e => {
        e.stopPropagation();
        if (!["Delete", "Backspace"].includes(e.key) || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target.closest("input, textarea, select, [contenteditable]")) return;
        e.preventDefault();
        removeSelected();
      });
      function fit() {
        if (!img.naturalWidth) return;
        const factor = Math.min((stage.clientWidth - 32) / img.naturalWidth, (stage.clientHeight - 32) / img.naturalHeight);
        wrap.style.width = Math.max(1, img.naturalWidth * factor) + "px";
        wrap.style.height = Math.max(1, img.naturalHeight * factor) + "px";
      }
      const observer = new ResizeObserver(fit); observer.observe(stage);
      img.onload = () => { loading = false; wrap.hidden = false; $(".shot-empty").hidden = true; fit(); paint(); status("Imagem pronta. Marque os pontos importantes."); };
      img.onerror = () => { loading = false; wrap.hidden = true; $(".shot-empty").hidden = false; status("Não foi possível abrir a imagem. Escolha o arquivo do screenshot."); };
      async function read(file) {
        if (!file) return;
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return status("Escolha uma imagem PNG, JPEG ou WebP.");
        if (file.size > 8 * 1024 * 1024) return status("Essa imagem passa de 8 MB. Salve uma versão menor.");
        if (image && spots.length && !window.confirm("Trocar a imagem remove os destaques atuais. Continuar?")) return;
        loading = true;
        status("Abrindo imagem…");
        const reader = new FileReader();
        reader.onerror = () => { loading = false; status("Não foi possível ler esse arquivo."); };
        reader.onload = () => { image = reader.result; spots = []; selected = -1; img.src = image; };
        reader.readAsDataURL(file);
      }
      $("[data-file]").onclick = () => $("[data-input]").click();
      $("[data-input]").onchange = e => { read(e.target.files[0]); e.target.value = ""; };
      dlg.addEventListener("paste", e => {
        const item = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith("image/"));
        if (item) { e.preventDefault(); e.stopPropagation(); read(item.getAsFile()); }
      });
      dlg.addEventListener("dragover", e => { e.preventDefault(); });
      dlg.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); read(e.dataTransfer.files[0]); });
      dlg.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
        mode = b.dataset.mode;
        dlg.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        $(".shot-hint").textContent = mode === "point" ? "Clique para marcar. Arraste um ponto para reposicionar." : "Arraste para contornar a área importante.";
      });
      function paint() {
        marks.replaceChildren(); $(".shot-list").replaceChildren();
        spots.forEach((p, i) => {
          const mark = document.createElement("button"); mark.type = "button";
          mark.className = `shot-mark ${p.kind === "point" ? "point" : "area"} ${selected === i ? "active" : ""}`;
          mark.dataset.index = i; mark.textContent = i + 1; mark.setAttribute("aria-label", `Destaque ${i + 1}`);
          Object.assign(mark.style, { left: `${p.x}%`, top: `${p.y}%`, width: p.kind === "point" ? "32px" : `${p.width}%`, height: p.kind === "point" ? "32px" : `${p.height}%` });
          mark.onclick = e => { e.stopPropagation(); selected = i; paint(); marks.children[i]?.focus(); };
          mark.onkeydown = e => {
            const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (!delta) return;
            e.preventDefault(); p.x = Math.max(0, Math.min(100 - (p.kind === "point" ? 0 : p.width), p.x + delta[0])); p.y = Math.max(0, Math.min(100 - (p.kind === "point" ? 0 : p.height), p.y + delta[1])); paint(); marks.children[i].focus();
          };
          marks.appendChild(mark);
          const row = document.createElement("button"); row.type = "button"; row.className = "shot-step" + (selected === i ? " active" : ""); row.textContent = `${i + 1}. ${p.title || "Sem legenda"}`; row.onclick = () => { selected = i; paint(); }; $(".shot-list").appendChild(row);
        });
        $("[data-count]").textContent = spots.length;
        const p = spots[selected]; $(".shot-fields").hidden = !p;
        if (p) { $("[data-label]").value = p.title || ""; $("[data-text]").value = p.text || ""; }
        $("[data-up]").disabled = selected <= 0; $("[data-down]").disabled = selected < 0 || selected >= spots.length - 1;
      }
      function coords(e) { const r = wrap.getBoundingClientRect(); return { x: Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y: Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)) }; }
      wrap.onpointerdown = e => {
        if (e.button !== 0) return;
        e.preventDefault(); const pos = coords(e), target = e.target.closest("[data-index]");
        if (target) { selected = +target.dataset.index; drag = { start: pos, index: selected, original: { ...spots[selected] } }; }
        else if (spots.length >= 8) return status("Até 8 destaques por cena. Para mais passos, use outra cena.");
        else { drag = { start: pos, index: spots.length, fresh: true }; spots.push({ kind: mode, x: pos.x, y: pos.y, width: 4, height: 4, title: `Passo ${spots.length + 1}`, text: "" }); selected = spots.length - 1; }
        wrap.setPointerCapture(e.pointerId); paint();
      };
      wrap.onpointermove = e => {
        if (!drag) return;
        const pos = coords(e), p = spots[drag.index];
        if (drag.fresh && mode === "area") { p.x = Math.min(pos.x, drag.start.x); p.y = Math.min(pos.y, drag.start.y); p.width = Math.max(2, Math.abs(pos.x - drag.start.x)); p.height = Math.max(2, Math.abs(pos.y - drag.start.y)); }
        else if (!drag.fresh) { p.x = Math.max(0, Math.min(100 - (p.kind === "point" ? 0 : p.width), drag.original.x + pos.x - drag.start.x)); p.y = Math.max(0, Math.min(100 - (p.kind === "point" ? 0 : p.height), drag.original.y + pos.y - drag.start.y)); }
        paint();
      };
      wrap.onpointerup = e => { if (drag) { const p = spots[drag.index]; if (p.kind !== "point") { p.x = Math.min(p.x, 96); p.y = Math.min(p.y, 96); p.width = Math.max(4, Math.min(p.width, 100 - p.x)); p.height = Math.max(4, Math.min(p.height, 100 - p.y)); } drag = null; wrap.releasePointerCapture(e.pointerId); paint(); marks.children[selected]?.focus(); } };
      wrap.onpointercancel = () => { drag = null; };
      $("[data-label]").oninput = e => { if (spots[selected]) { spots[selected].title = e.target.value; $(".shot-list").children[selected].textContent = `${selected + 1}. ${e.target.value || "Sem legenda"}`; } };
      $("[data-text]").oninput = e => { if (spots[selected]) spots[selected].text = e.target.value; };
      function removeSelected() {
        if (selected < 0 || selected >= spots.length || drag) return;
        spots.splice(selected, 1); selected = Math.min(selected, spots.length - 1); paint();
        (marks.children[selected] || $("[data-mode='point']")).focus();
        status("Destaque removido. Clique em Usar screenshot para confirmar ou Cancelar para descartar.");
      }
      $("[data-delete]").onclick = removeSelected;
      $("[data-delete]").title = "Excluir destaque selecionado (Delete ou Backspace)";
      for (const [sel, delta] of [["[data-up]", -1], ["[data-down]", 1]]) $(sel).onclick = () => { const to = selected + delta; if (to < 0 || to >= spots.length) return; [spots[selected], spots[to]] = [spots[to], spots[selected]]; selected = to; paint(); };
      $("[data-apply]").onclick = () => {
        if (loading || !img.naturalWidth || !image) return status("Escolha uma imagem válida primeiro.");
        const result = { ...draft, layout: spots.length ? "spotlight" : "image", fit: "contain", title: $("[data-title]").value.trim(), caption: $("[data-caption]").value.trim(), image, hotspots: spots };
        delete result.figure; finish(result);
      };
      dlg.showModal(); paint();
      if (file) read(file); else if (image) { loading = true; img.src = image; }
    });
  }
})();
