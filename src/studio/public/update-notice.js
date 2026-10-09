// Aviso "o sagadeck foi atualizado": o servidor compara a impressão do código de quando subiu com a de agora
// (src/studio/code-version.js). Mudou (git pull, npm update): o Studio aberto ainda é o velho e pode quebrar com os
// arquivos novos; a faixa pede para fechar e abrir de novo. Confere ao abrir, ao voltar para a aba e a cada 30 s.
(() => {
  let bar = null;
  const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${(window.UI_ICONS || {})[n] || ""}</svg>`;
  function show() {
    if (bar) return;
    bar = document.createElement("div");
    bar.className = "update-notice";
    bar.setAttribute("role", "status");
    bar.style.cssText = "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:100000;display:flex;align-items:center;gap:10px;max-width:min(720px,calc(100vw - 32px));padding:10px 14px;border-radius:10px;background:#fef3c7;color:#78350f;border:1px solid #f59e0b;box-shadow:0 6px 24px rgba(0,0,0,.18);font:14px/1.4 system-ui,sans-serif";
    bar.innerHTML = `<i class="ic" style="width:18px;height:18px;flex:none">${svg("refresh-cw")}</i><span>O sagadeck foi atualizado. Feche e abra o Studio de novo para usar a versão nova; até lá, algo pode não funcionar.</span><button type="button" aria-label="Fechar aviso" style="flex:none;border:0;background:none;color:inherit;cursor:pointer;width:22px;height:22px;padding:0">${svg("x")}</button>`;
    bar.querySelector("button").onclick = () => bar.remove();
    document.body.append(bar);
  }
  async function check() {
    if (bar) return;
    try { const j = await (await fetch("api/code-version", { cache: "no-store" })).json(); if (j.changed) show(); } catch { /* servidor fora: outro aviso cuida */ }
  }
  setInterval(check, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  check();
  window.SagaUpdateNotice = { check };
})();
