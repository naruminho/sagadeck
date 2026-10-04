window.SagaChatProgress = function ({ dom, appendChatMessage, hydrateIcons, getChatJob }) {
  function createProgressBubble(initial) {
    const el = appendChatMessage("ai", "");
    el.classList.add("ai-working");
    const content = el.querySelector(".ai-content");
    content.innerHTML = `<div class="work-line"><span class="work-dots"><i></i><i></i><i></i></span><span class="work-text"></span><span class="work-time">0s</span></div><div class="work-preview"></div>`;
    const text = content.querySelector(".work-text");
    const time = content.querySelector(".work-time");
    const preview = content.querySelector(".work-preview");
    const started = Date.now();
    text.textContent = initial;
    const timer = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      time.textContent = `${s}s`;
    }, 500);
    return {
      el,
      update(ev) {
        if (ev.type !== "progress") return;
        text.textContent = ev.chars ? `${ev.text} (${(ev.chars / 1000).toFixed(1)} mil caracteres)` : ev.text;
        // transformação da apresentação inteira: pode levar muitos minutos, então dá para parar (o feito fica guardado)
        if (String(ev.phase || "").startsWith("transform") && !getChatJob() && !content.querySelector(".work-stop")) {
          const stop = document.createElement("button");
          stop.type = "button"; stop.className = "btn btn-ghost btn-sm work-stop";
          stop.title = "Parar; o que já ficou pronto fica guardado e pedir de novo continua de onde parou";
          stop.innerHTML = '<i class="ic" data-ic="square"></i> Parar'; hydrateIcons(stop);
          stop.onclick = async () => { stop.disabled = true; await fetch("api/ai/transform/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: ev.mode }) }).catch(() => {}); };
          content.querySelector(".work-line").append(stop);
        }
        if (ev.preview) preview.textContent = ev.preview;
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      },
      done() { clearInterval(timer); el.remove(); },
      fail(msg) {
        clearInterval(timer);
        el.classList.remove("ai-working");
        content.innerHTML = "";
        const span = document.createElement("span");
        span.style.color = "var(--danger)";
        span.textContent = `Erro: ${msg}`;
        content.appendChild(span);
      },
    };
  }

return createProgressBubble;
};
