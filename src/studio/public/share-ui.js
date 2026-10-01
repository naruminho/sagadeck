// Arquivo › Compartilhar link (só leitura): cria, copia e revoga links para ver a apresentação aberta
// (src/studio/share-routes.js). Independente do app.js: só usa a API e a janela #modal-share do index.html.
(function () {
  const $ = (id) => document.getElementById(id);
  const icon = (name) => `<i class="ic" data-ic="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${(window.UI_ICONS || {})[name] || ""}</svg></i>`;
  const absolute = (rel) => new URL(rel, location.href.replace(/[?#].*$/, "").replace(/\/(editor|biblioteca)\/?$/, "/")).href;
  let multiuser = false;

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch { // http na rede (sem área de transferência do navegador): seleciona para o Ctrl+C
      const input = btn.closest("li")?.querySelector("input");
      input?.select(); document.execCommand?.("copy");
    }
    btn.classList.add("done"); btn.title = "Copiado";
    setTimeout(() => { btn.classList.remove("done"); btn.title = "Copiar o link"; }, 1600);
  }

  function render(links) {
    const list = $("share-list");
    list.innerHTML = "";
    for (const l of links) {
      const url = absolute(l.path);
      const li = document.createElement("li");
      li.className = "share-item";
      li.dataset.token = l.token;
      const who = !multiuser ? "Quem alcança este Studio" : l.publico ? "Qualquer pessoa com o link" : "Só quem entra no portal";
      li.innerHTML = `<span class="share-kind" title="${who}${l.notas ? " · com as notas" : ""}">${icon(!multiuser || !l.publico ? "lock" : "globe")}</span>
        <input class="form-control share-url" readonly value="${url.replace(/"/g, "&quot;")}" aria-label="Link">
        <button class="icon-btn share-copy" title="Copiar o link" aria-label="Copiar o link">${icon("copy")}</button>
        <a class="icon-btn share-open" href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer" title="Abrir como a pessoa vai ver" aria-label="Abrir">${icon("eye")}</a>
        <button class="icon-btn share-revoke" title="Revogar: o link para de funcionar na hora" aria-label="Revogar">${icon("trash-2")}</button>`;
      li.querySelector(".share-copy").onclick = (e) => copy(url, e.currentTarget);
      li.querySelector(".share-url").onfocus = (e) => e.target.select();
      li.querySelector(".share-revoke").onclick = async () => {
        const r = await (await fetch("api/share/revoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: l.token }) })).json();
        render(r.links || []);
      };
      list.appendChild(li);
    }
  }

  async function open() {
    const r = await (await fetch("api/share")).json(); // antes de mostrar: sem piscar a escolha de quem vê
    multiuser = !!r.multiuser;
    $("share-who").hidden = !multiuser; // no Studio local não há portal: o link abre para quem alcança o Studio
    $("share-create").disabled = !r.saved;
    $("share-create").title = r.saved ? "" : "Salve a apresentação na biblioteca antes de compartilhar";
    render(r.links || []);
    $("modal-share").classList.remove("hidden");
  }

  async function create() {
    const publico = multiuser && document.querySelector('input[name="share-who"]:checked')?.value === "publico";
    const res = await fetch("api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publico, notas: $("share-notas").checked }) });
    const r = await res.json();
    if (!res.ok) { $("share-create").title = r.error || ""; return; }
    render(r.links || []);
    const first = [...$("share-list").children].find((li) => li.dataset.token === r.link.token);
    first?.querySelector(".share-url")?.select();
  }

  function init() {
    if (!$("menu-share") || !$("modal-share")) return;
    $("menu-share").addEventListener("click", (e) => { e.preventDefault(); open(); });
    $("share-close").onclick = () => $("modal-share").classList.add("hidden");
    $("modal-share").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden"); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal-share").classList.contains("hidden")) $("modal-share").classList.add("hidden"); });
    $("share-create").onclick = create;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
