// "Sobre o SagaDeck" (Ajuda › Sobre, no editor; botão Sobre, na biblioteca): a versão que está rodando e o essencial
// para dar suporte (commit, Node, desde quando, a biblioteca, se a IA está configurada), com Copiar informações.
window.SagaAbout = (() => {
  const css = `.about-dlg{margin:auto;max-width:min(520px,calc(100vw - 32px));width:100%;border:1px solid var(--border,#c9ced6);border-radius:12px;padding:20px 22px;background:var(--panel,var(--bg,#fff));color:var(--text,#1d2433);font:14px/1.45 system-ui,sans-serif}
.about-dlg::backdrop{background:rgba(0,0,0,.35)}.about-dlg h2{margin:0;font-size:20px}.about-dlg .ver{margin:2px 0 14px;font-size:15px;color:var(--text-2,#555)}
.about-dlg .ver b{color:var(--text,#1d2433);font-size:22px}.about-dlg dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 14px}
.about-dlg dt{color:var(--text-3,#777)}.about-dlg dd{margin:0;overflow-wrap:anywhere}.about-dlg code{font:12px ui-monospace,Consolas,monospace}
.about-dlg .links{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 6px}.about-dlg .links a{color:var(--brand,#5b4bdb)}
.about-dlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.about-dlg button{padding:7px 14px;border-radius:8px;border:1px solid var(--border,#c9ced6);background:transparent;color:inherit;cursor:pointer;font:inherit}
.about-dlg button.primary{background:var(--brand,#5b4bdb);border-color:var(--brand,#5b4bdb);color:#fff}.about-dlg [data-copied]{color:#15803d;align-self:center;margin-right:auto}`;
  const REPO = "https://github.com/naruminho/sagadeck";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let dialog;

  function build() {
    if (!document.getElementById("about-style")) { const st = document.createElement("style"); st.id = "about-style"; st.textContent = css; document.head.append(st); }
    dialog = document.createElement("dialog");
    dialog.className = "about-dlg";
    dialog.id = "about-dialog";
    dialog.setAttribute("aria-labelledby", "about-title");
    document.body.append(dialog);
  }

  // o que o servidor diz de si (versão, commit, Node, desde quando) e se a IA está configurada
  async function facts() {
    const get = async (u) => { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? r.json() : {}; } catch { return {}; } };
    const [inst, ia] = await Promise.all([get("api/instance"), get("api/ia")]);
    return { ...inst, ia: ia.configured == null ? null : !!ia.configured };
  }
  const text = (f) => [`SagaDeck ${f.version || "?"} (commit ${f.commit || "?"})`, `Node ${f.node || "?"} · ${f.platform || "?"}`,
    f.started ? `No ar desde ${new Date(f.started).toLocaleString("pt-BR")} (processo ${f.pid || "?"})` : "",
    f.multiuser ? "Servidor multiusuário" : f.library ? `Biblioteca: ${f.library}` : "",
    f.ia == null ? "" : `IA: ${f.ia ? "configurada" : "não configurada"}`].filter(Boolean).join("\n");

  async function open() {
    if (!dialog) build();
    dialog.innerHTML = `<h2 id="about-title">Sobre o SagaDeck</h2><p class="ver">Carregando…</p><div class="row"><button type="button" data-close>Fechar</button></div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
    const f = await facts();
    const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
    dialog.innerHTML = `<h2 id="about-title">Sobre o SagaDeck</h2>
      <p class="ver">Versão <b data-version>${esc(f.version || "?")}</b></p>
      <dl>
        ${row("Commit", f.commit ? `<code>${esc(f.commit)}</code>` : "")}
        ${row("Node", f.node ? `${esc(f.node)} · ${esc(f.platform || "")}` : "")}
        ${row("No ar desde", f.started ? esc(new Date(f.started).toLocaleString("pt-BR")) : "")}
        ${row("Biblioteca", !f.multiuser && f.library ? `<code>${esc(f.library)}</code>` : f.multiuser ? "neste servidor (multiusuário)" : "")}
        ${row("IA", f.ia == null ? "" : f.ia ? "configurada (para testar cada recurso: <code>sagadeck ia-check</code>)" : "não configurada")}
      </dl>
      <div class="links">
        <a href="${REPO}/blob/main/CHANGELOG.md" target="_blank" rel="noopener">O que mudou em cada versão</a>
        <a href="${REPO}" target="_blank" rel="noopener">Código e problemas</a>
        <a href="https://www.npmjs.com/package/sagadeck" target="_blank" rel="noopener">Pacote no npm</a>
      </div>
      <div class="row"><span data-copied hidden>Copiado.</span><button type="button" data-copy>Copiar informações</button><button type="button" class="primary" data-close>Fechar</button></div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    dialog.querySelector("[data-copy]").onclick = async () => {
      try { await navigator.clipboard.writeText(text(f)); dialog.querySelector("[data-copied]").hidden = false; }
      catch { dialog.querySelector("[data-copied]").textContent = "Não deu para copiar."; dialog.querySelector("[data-copied]").hidden = false; }
    };
  }
  // qualquer botão ou link com data-about abre (Ajuda › Sobre no editor, o botão da biblioteca)
  document.addEventListener("click", (e) => { const b = e.target.closest?.("[data-about]"); if (b) { e.preventDefault(); open(); } });
  return { open };
})();
