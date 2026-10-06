// Chat lateral com IA: bolhas, anexos, comandos, histórico e envio.
// Saiu do app.js pela trava de tamanho dos monolitos; o comportamento é o mesmo.
// Fábrica no molde de slide-select.js: recebe o estado e os ajudantes, devolve a API.
window.SagaChat = function ({ state, dom, escHtml, hydrateIcons, showToast, openPane, currentPane,
  streamAI, syncDeckToServer, renderThumbnails, renderCurrentSlide, trackDeck, fitRendered, refreshAIStatus }) {
  let chatJob = null;
  const getChatJob = () => chatJob;
  // ==========================================================================
  // --------------------------------------------------------------------------
  // CONVERSA (brainstorm) sem escolher modo: o servidor percebe se é pedido de mudança ou conversa
  // (src/ai/intent.js). Resposta de conversa não mexe no deck, traz opções clicáveis e libera
  // "Transformar em slides".
  // --------------------------------------------------------------------------
  function updateBrainstormApply() {
    const recent = state.chatHistory.slice(-4);
    document.getElementById("btn-brainstorm-apply").classList.toggle("hidden", !recent.some((m) => m.talk));
  }

  function renderChatOptions(msg, options) {
    if (!options?.length) return;
    const row = document.createElement("div");
    row.className = "bs-options";
    for (const o of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bs-option";
      b.textContent = o;
      b.onclick = () => {
        row.querySelectorAll("button").forEach((x) => (x.disabled = true));
        dom.chatInput.value = o;
        handleChatSubmit();
      };
      row.append(b);
    }
    // nenhuma das opções serve: a pessoa escreve a sua (a IA entende texto livre)
    const other = document.createElement("button");
    other.type = "button";
    other.className = "bs-option bs-option-other";
    other.innerHTML = '<i class="ic" data-ic="pencil"></i><span>Outra resposta…</span>';
    other.onclick = () => {
      dom.chatInput.value = "";
      dom.chatInput.placeholder = "Escreva a sua resposta…";
      dom.chatInput.focus();
    };
    row.append(other);
    hydrateIcons(row);
    msg.querySelector(".ai-content").append(row);
  }

  // atalho depois de uma conversa: autoriza a IA a aplicar o que foi combinado
  function applyBrainstorm() {
    dom.chatInput.value = "Pode fazer: aplique nos slides o que combinamos nesta conversa.";
    handleChatSubmit();
  }

  // Versões de um slide lado a lado; nada muda até escolher uma
  async function renderVariants(msg, variants) {
    const box = document.createElement("div");
    box.className = "variants";
    msg.querySelector(".ai-content").append(box);
    for (const [k, v] of variants.options.entries()) {
      const card = document.createElement("div");
      card.className = "variant";
      card.innerHTML = `<div class="variant-prev"><div class="thumb-render"></div></div><div class="variant-foot"><b></b><button type="button" class="btn btn-secondary btn-sm">Usar esta</button></div>`;
      card.querySelector("b").textContent = v.label;
      if (v.direction) { card.querySelector('b').title = v.direction.rationale; card.querySelector('button').textContent = 'Usar direção no deck'; }
      const btn = card.querySelector("button");
      btn.dataset.variant = k;
      btn.onclick = () => {
        const s = JSON.parse(JSON.stringify(v.slide));
        if (v.direction) { state.deck.theme = v.direction.theme; delete state.deck.palette; delete s.theme; }
        if (variants.insert) state.deck.slides.splice(variants.index, 0, s);
        else state.deck.slides[variants.index] = s;
        state.currentSlideIndex = variants.index;
        box.querySelectorAll(".variant").forEach((c) => c.classList.toggle("chosen", c === card));
        box.querySelectorAll("button").forEach((b) => (b.disabled = true));
        btn.textContent = "Escolhida";
        state.chatHistory.push({ role: "user", text: `Escolhi a versão "${v.label}" (já apliquei no slide ${variants.index + 1}).` });
        saveChatHistory();
        syncDeckToServer();
        renderThumbnails();
        renderCurrentSlide();
        showToast(`Versão "${v.label}" aplicada no slide ${variants.index + 1}`, 2200);
      };
      box.append(card);
      try {
        const r = await (await fetch("api/render-slide", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide: v.slide, index: variants.index }) })).json();
        const prev = card.querySelector(".variant-prev");
        prev.querySelector(".thumb-render").innerHTML = r.html;
        requestAnimationFrame(() => fitRendered(prev));
        prev.style.setProperty("--thumb-scale", String(prev.clientWidth / 1920));
        if (v.direction) window.SagaArtPreview(prev, r, v.label);
      } catch {}
    }
    box.scrollIntoView({ block: "nearest" });
  }

  async function handleChatSubmit(e) {
    if (e) e.preventDefault();
    if (chatJob) { if(e?.type === "submit") chatJob.stop(); return; }
    const message = dom.chatInput.value.trim();
    if (state.chatAttachments.some(a => a.t === "doc" && !a.id)) { showToast("Aguarde a leitura do anexo antes de enviar.", 4000); return; }
    if (!message) return;

    // Adicionar bolha do usuário (com os anexos: imagens e documentos)
    const bubble = appendChatMessage("user", message);
    if (state.chatAttachments.length) {
      const row = document.createElement("div");
      row.className = "msg-atts";
      state.chatAttachments.forEach((a) => {
        if (a.t === "img") { const img = document.createElement("img"); img.src = a.url; row.appendChild(img); }
        else { const chip = document.createElement("span"); chip.className = "msg-doc"; chip.innerHTML = `<i class="ic" data-ic="file-text"></i> `; hydrateIcons(chip); chip.appendChild(document.createTextNode(a.name)); row.appendChild(chip); }
      });
      bubble.querySelector(".user-content")?.appendChild(row);
    }
    dom.chatInput.value = "";
    autoGrowChat();

    // a IA sempre sabe qual slide está na tela; outros slides (ou o deck todo) a pessoa diz no pedido
    const targetIdx = state.currentSlideIndex;

    // Indicador de progresso ao vivo (etapa, segundos, texto chegando)
    const job = chatJob = { file: state.file, id: crypto.randomUUID(), controller: new AbortController() };
    job.stop = async () => {
      job.controller.abort();
      await fetch("api/ai/chat/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: job.id }) }).catch(() => {});
    };
    const work = createProgressBubble(state.ai.available
      ? `Enviando para o LLM (${state.ai.textModel})…`
      : "Verificando se a IA está no ar…");
    dom.chatSend.disabled = false;
    dom.chatSend.title = 'Parar processamento'; dom.chatSend.setAttribute('aria-label','Parar');
    dom.chatSend.innerHTML = '<i class="ic" data-ic="square"></i>'; hydrateIcons(dom.chatSend);
    dom.chatInput.disabled = false;
    // a conversa inteira deste deck (o servidor compacta as mensagens antigas; nada é esquecido)
    const history = state.chatHistory.slice();
    const baseDeck = JSON.parse(JSON.stringify(state.deck));
    if (state.chatAttachments.some((a) => a.t === "doc" && !a.id)) {
      showToast("Aguarde a leitura do anexo antes de enviar.", 4000);
      return;
    }
    state.chatHistory.push({ role: "user", text: message });
    // imagens vão embutidas (como antes); documentos vão por id (o texto já está no servidor)
    const attachments = state.chatAttachments.map((a) => (a.t === "img" ? a.url : { type: "doc", id: a.id }));
    clearChatAttachments();

    try {
      const data = await streamAI("api/ai/chat", {
        message, requestId: job.id,
        targetSlide: targetIdx,
        spec: state.deck,
        issues: state.issues,
        history,
        attachments,
        renderNotes: state.renderNotes || [],
        autoRun: !!state.autoRunCommands, // a pessoa liberou os comandos desta conversa (só enquanto a página está aberta)
        expectFile: state.file,
      }, (ev) => { if (!commandEvent(ev)) work.update(ev); }, job.controller.signal);
      if (state.file !== job.file) { work.done(); showToast("O pedido terminou na apresentação em que começou; a apresentação atual foi preservada.", 6000); return; }
      if (!data.spec) throw new Error(data.error || "resposta sem deck");
      // conversa salva antes de dispensar o indicador: quem espera o fim da resposta já encontra o arquivo gravado
      const finishWork = async () => { await saveChatHistory(); work.done(); };
      if (data.variants) {
        state.chatHistory.push({ role: "assistant", text: `${data.reply}\n(versões: ${data.variants.options.map((o) => o.label).join(" | ")})`, talk: true });
        await finishWork();
        const msg = appendChatMessage("ai", data.reply, data.actions);
        await renderVariants(msg, data.variants);
        updateBrainstormApply();
        return;
      }
      if (data.talk) {
        // conversa: nada muda nos slides (com a IA desligada o aviso não entra na conversa com o modelo)
        if (data.mode === "off") state.chatHistory.pop();
        else state.chatHistory.push({ role: "assistant", text: data.reply + (data.options?.length ? `\n(opções: ${data.options.join(" | ")})` : ""), talk: true });
        await finishWork();
        const msg = appendChatMessage("ai", data.reply, data.actions);
        msg.classList.add("bs");
        const tag = document.createElement("div");
        tag.className = "bs-tag";
        tag.innerHTML = '<i class="ic" data-ic="message-square-text"></i> Conversa — nada mudou nos slides'; hydrateIcons(tag);
        msg.querySelector(".ai-content").prepend(tag);
        renderChatOptions(msg, data.options);
        // a IA criou uma apresentação nova (recriar): um clique para abrir
        if (data.createdDeck?.id) {
          tag.innerHTML = '<i class="ic" data-ic="presentation"></i> Apresentação nova na biblioteca'; hydrateIcons(tag);
          const open = document.createElement("button");
          open.type = "button"; open.className = "btn btn-primary btn-sm chat-open-deck";
          open.innerHTML = '<i class="ic" data-ic="folder-open"></i> Abrir a apresentação nova'; hydrateIcons(open);
          open.onclick = () => { location.href = `editor?deck=${encodeURIComponent(data.createdDeck.id)}`; };
          msg.querySelector(".ai-content").append(open);
        }
        updateBrainstormApply();
        if (data.mode === "off") refreshAIStatus(); // o selo "IA ligada/desligada" acompanha
        return;
      }
      state.chatHistory.push({ role: "assistant", text: data.reply });

      // Atualizar o deck com as modificações da IA sem perder o que a pessoa mexeu enquanto ela pensava
      // (junção a três: base = o deck quando o pedido saiu; ver merge-decks.js)
      const merged = window.SagadeckMerge.mergeDecks(baseDeck, state.deck, data.spec);
      state.deck = merged.deck;
      trackDeck("Assistente de IA");
      if (JSON.stringify(merged.deck) !== JSON.stringify(data.spec)) syncDeckToServer();
      const conflicts = [...(data.conflicts || []), ...merged.conflicts];
      if (merged.kept || data.kept) showToast("Você reorganizou os slides enquanto a IA trabalhava: mantive a sua versão. Peça de novo se quiser a mudança dela.", 7000);
      else if (conflicts.length) showToast(`O slide ${[...new Set(conflicts)].map((i) => i + 1).join(", ")} mudou dos dois lados enquanto a IA trabalhava: ficou a sua versão.`, 7000);
      if (typeof data.targetSlide === "number" && data.targetSlide < state.deck.slides.length) {
        state.currentSlideIndex = data.targetSlide;
      }

      // Re-renderizar
      renderThumbnails();
      await renderCurrentSlide();

      // Substituir o indicador pela resposta completa
      await finishWork();
      const reply = appendChatMessage("ai", data.reply, data.actions);
      // depois de melhorar seguindo o estilo do original: salvar esse estilo para usar em outras apresentações
      if (data.offerStyle && reply) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn btn-sm chat-save-style";
        b.innerHTML = '<i class="ic" data-ic="swatch-book"></i> Salvar este estilo'; hydrateIcons(b);
        b.title = "Guarda a moldura, as cores e as fontes do original para usar em outras apresentações (Design › Estilo)";
        b.onclick = async () => {
          const name = window.prompt("Nome do estilo", data.offerStyle.name);
          if (!name) return;
          try { const r = await fetch("api/styles/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.status); b.disabled = true; showToast(`Estilo "${j.name}" salvo: Design › Estilo aplica em outra apresentação ou usa em toda nova.`, 6000); } catch (e) { showToast(e.message); }
        };
        reply.querySelector(".ai-content")?.append(b);
      }
      updateBrainstormApply();
    } catch (err) {
      if (job.controller.signal.aborted) { work.done(); appendChatMessage("ai", "Parado a pedido. Nenhuma resposta pendente foi aplicada."); await saveChatHistory(); }
      else work.fail(err.message);
    } finally {
      chatJob = null;
      dom.chatSend.title = "Enviar (Enter)"; dom.chatSend.setAttribute("aria-label","Enviar");
      dom.chatSend.innerHTML = '<i class="ic" data-ic="send"></i>'; hydrateIcons(dom.chatSend);
      dom.chatSend.disabled = false;
      dom.chatInput.disabled = false;
      dom.chatInput.focus();
      await saveChatHistory();
    }
  }

  // A conversa é desta apresentação e fica ao lado dela (<deck>.conversa.json): volta ao reabrir o deck.
  // Devolve a promise: quem chama espera antes de liberar a tela, senão recarregar na mesma hora perde a troca.
  function saveChatHistory() {
    return fetch("api/chat/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history: state.chatHistory }) }).catch(() => {});
  }
  // ---- comandos da IA: a pessoa vê o código e clica para rodar (a liberação vale só nesta página e neste deck).
  // Ações gratuitas de vídeo (plan/status/frame/download) rodam direto, sem clique; só o que pode cobrar pede.
  state.autoRunCommands = false;
  function commandCard(cmd) {
    const msg = appendChatMessage("ai", "");
    msg.classList.add("cmd-msg");
    const box = msg.querySelector(".ai-content");
    box.innerHTML = `<div class="cmd-head"><i class="ic" data-ic="terminal"></i><b></b></div><div class="cmd-why"></div><pre class="cmd-code"></pre><div class="cmd-actions"></div>`;
    box.querySelector("b").textContent = `A IA quer rodar um comando (${cmd.language})`;
    box.querySelector(".cmd-why").textContent = cmd.why || "";
    box.querySelector(".cmd-code").textContent = cmd.code && typeof cmd.code === "object" ? JSON.stringify(cmd.code, null, 1) : cmd.code;
    hydrateIcons(box);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    return box;
  }
  function commandEvent(ev) {
    if (ev.type !== "progress") return false;
    if (ev.phase === "approve" && ev.command) {
      const box = commandCard(ev.command), acts = box.querySelector(".cmd-actions");
      if (ev.cost) {
        const tag = document.createElement("div");
        tag.className = "cmd-cost";
        tag.textContent = `Custo estimado: ${ev.cost} (só cobra se executar)`;
        acts.before(tag);
      }
      acts.innerHTML = `<button type="button" class="btn btn-primary" data-d="run"><i class="ic" data-ic="play"></i> Executar</button><button type="button" class="btn" data-d="always">Executar e liberar os próximos</button><button type="button" class="btn" data-d="deny"><i class="ic" data-ic="x"></i> Não executar</button>`;
      hydrateIcons(acts);
      acts.querySelectorAll("[data-d]").forEach((b) => b.onclick = async () => {
        const decision = b.dataset.d;
        if (decision === "always") state.autoRunCommands = true;
        acts.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        try { await fetch("api/ai/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, decision }) }); } catch {}
        acts.innerHTML = `<span class="cmd-state">${decision === "deny" ? "Não executado" : decision === "always" ? "Executando (próximos liberados nesta conversa)" : "Executando…"}</span>`;
        if (decision !== "deny") box.dataset.waiting = "1"; // o resultado vem para este cartão
      });
      return false; // a linha de progresso também mostra "Esperando você autorizar"
    }
    if (ev.phase === "command" && ev.command) {
      // aprovado agora: o cartão já está na tela; liberado antes: aparece um cartão novo, já rodando
      if (!document.querySelector(".cmd-msg [data-waiting]")) {
        const box = commandCard(ev.command);
        box.dataset.waiting = "1";
        box.querySelector(".cmd-actions").innerHTML = `<span class="cmd-state">Executando (liberado nesta conversa)…</span>`;
      }
      return false;
    }
    if (ev.phase === "command-result") {
      const box = document.querySelector(".cmd-msg [data-waiting]");
      if (box) {
        delete box.dataset.waiting;
        const r = ev.result || {}, ok = r.exitCode === 0 && !r.timedOut;
        const st = box.querySelector(".cmd-state") || box.querySelector(".cmd-actions");
        st.textContent = r.timedOut ? "Tempo esgotado" : ok ? "Rodou (saída 0)" : `Rodou com erro (saída ${r.exitCode ?? "?"})`;
        st.classList.toggle("cmd-bad", !ok);
        const out = document.createElement("details");
        out.className = "cmd-out";
        out.innerHTML = "<summary>Ver a saída</summary><pre></pre>";
        out.querySelector("pre").textContent = [r.stdout, r.stderr].filter(Boolean).join("\n").slice(0, 6000) || "(sem saída)";
        box.appendChild(out);
      }
      return false;
    }
    return false;
  }

  async function loadChatHistory() {
    state.autoRunCommands = false; // outra apresentação: nada fica liberado
    try {
      const { history } = await (await fetch("api/chat/history")).json();
      state.chatHistory = Array.isArray(history) ? history : [];
      state.loadingHistory = true; // conversa guardada não é resposta nova (o atalho do chat não acende)
      setTimeout(() => { state.loadingHistory = false; });
      // o que ficou entre parênteses no fim ("opções: …") é para o modelo; na tela, só a mensagem
      for (const m of state.chatHistory) appendChatMessage(m.role === "user" ? "user" : "ai", String(m.text).replace(/\n\((opções|versões): [^\n]*\)$/, ""));
    } catch { state.chatHistory = []; }
  }

  // ---- anexos do chat (imagem: colar/arrastar/escolher · documento: escolher → o servidor lê) ----
  state.chatAttachments = [];
  function clearChatAttachments() {
    state.chatAttachments = [];
    renderChatAttachments();
  }
  function renderChatAttachments() {
    const box = dom.chatAttachments;
    box.hidden = !state.chatAttachments.length;
    box.innerHTML = "";
    state.chatAttachments.forEach((a, i) => {
      const it = document.createElement("div");
      it.className = "chat-att";
      if (a.t === "img") {
        it.innerHTML = `<img alt=""><button type="button" title="Remover"><i class="ic" data-ic="x"></i></button>`; hydrateIcons(it);
        it.querySelector("img").src = a.url;
      } else {
        it.innerHTML = `<span class="chat-doc" title="${escHtml(a.name)}"><i class="ic" data-ic="file-text"></i><b>${escHtml(a.name)}</b><small>${a.chars} caracteres</small></span><button type="button" title="Remover"><i class="ic" data-ic="x"></i></button>`; hydrateIcons(it);
      }
      it.querySelector("button").onclick = () => { state.chatAttachments.splice(i, 1); renderChatAttachments(); };
      box.appendChild(it);
    });
  }
  // reduz para no máximo 1280 px (a IA não precisa de mais, e a requisição fica leve)
  function addChatImage(file) {
    if (!file || !file.type.startsWith("image/")) return;
    if (state.chatAttachments.length >= 4) { showToast("Até 4 imagens por mensagem."); return; }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      state.chatAttachments.push({ t: "img", url: c.toDataURL("image/jpeg", 0.85) });
      URL.revokeObjectURL(img.src);
      renderChatAttachments();
      openPane("chat");
    };
    img.src = URL.createObjectURL(file);
  }
  // documento (pdf, docx, xlsx, pptx, txt…): sobe na hora; o servidor extrai o texto e devolve um id.
  // O binário nunca vai para a IA — só o texto extraído, na hora de enviar a mensagem.
  function addChatDoc(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast("Arquivo grande demais (limite 15 MB)."); return; }
    const provisional = { t: "doc", id: null, name: file.name, chars: "lendo…" };
    state.chatAttachments.push(provisional);
    renderChatAttachments();
    openPane("chat");
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const res = await fetch("api/ai/context", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, dataUrl: rd.result }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
        Object.assign(provisional, { id: data.id, chars: data.chars });
      } catch (e) {
        state.chatAttachments.splice(state.chatAttachments.indexOf(provisional), 1);
        showToast(`Não deu para ler "${file.name}": ${e.message}`, 6000);
      }
      renderChatAttachments();
    };
    rd.readAsDataURL(file);
  }
  function addChatFile(file) {
    if (!file) return;
    window.SagaProject?.uploadFile(file, "contexto").then(() => window.SagaProject.refreshTree()).catch(() => {}); // sem projeto: só na conversa
    if (file.type.startsWith("image/")) addChatImage(file);
    else addChatDoc(file);
  }
  // Altura da caixa do chat = o conteúdo (ou o placeholder, se vazia) + a borda; barra de rolagem só no limite.
  function autoGrowChat() {
    const el = dom.chatInput;
    const empty = !el.value;
    if (empty) el.value = el.placeholder; // scrollHeight ignora o placeholder: mede com ele no lugar
    el.style.height = "auto";
    const need = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    if (empty) el.value = "";
    el.style.height = `${Math.min(180, need)}px`;
    el.style.overflowY = need > 180 ? "auto" : "hidden";
  }

  function appendChatMessage(sender, text, actions = []) {
    dom.chatEmpty?.remove();
    // resposta da IA com o chat fora da vista: o atalho flutuante acende (some quando o chat abre)
    if (sender !== "user" && !state.loadingHistory && currentPane() !== "chat") document.getElementById("chat-badge")?.classList.add("show");
    const msgDiv = document.createElement("div");
    msgDiv.className = sender === "user" ? "user-msg" : "ai-msg";

    const avatar = document.createElement("div");
    avatar.className = sender === "user" ? "user-avatar" : "ai-avatar";
    if (sender === "user") avatar.textContent = "EU"; else { avatar.innerHTML = '<i class="ic" data-ic="sparkles"></i>'; hydrateIcons(avatar); }
    msgDiv.appendChild(avatar);

    const content = document.createElement("div");
    content.className = sender === "user" ? "user-content" : "ai-content";

    // Formatar quebras de linha e negritos
    const formatted = String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/\n/g, "<br>");
    content.innerHTML = formatted;

    // Exibir badges de ações realizadas pela IA
    if (actions && actions.length > 0) {
      const actionsContainer = document.createElement("div");
      actionsContainer.style.marginTop = "8px";
      actions.forEach((a) => {
        const pill = document.createElement("span");
        pill.className = "action-badge-pill";
        pill.innerHTML = `<i class="ic" data-ic="${/falhou|falha|erro|não enxerga/i.test(a) ? "circle-alert" : "check"}"></i> ${escHtml(a)}`; hydrateIcons(pill);
        actionsContainer.appendChild(pill);
      });
      content.appendChild(actionsContainer);
    }

    msgDiv.appendChild(content);
    dom.chatMessages.appendChild(msgDiv);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    return msgDiv;
  }
  // Bolha de progresso do chat e de outros fluxos (transformação usa a mesma).
  const createProgressBubble = window.SagaChatProgress({ dom, appendChatMessage, hydrateIcons, getChatJob });
  const api = { getChatJob, handleChatSubmit, loadChatHistory, saveChatHistory, appendChatMessage,
    createProgressBubble, commandEvent, updateBrainstormApply, renderVariants, applyBrainstorm,
    renderChatOptions, clearChatAttachments, renderChatAttachments, addChatImage, addChatDoc,
    addChatFile, autoGrowChat, commandCard };
  return api;
};
