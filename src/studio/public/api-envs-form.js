// Ambientes dos slides de API por campos: quem instala do zero preenche endereço, variáveis, segredos e autenticação
// sem escrever YAML (o arquivo é o mesmo, ~/.sagadeck/ambientes.yaml; a aba "Como texto" continua para quem prefere).
// Segredo digitado vai cifrado para o arquivo e nunca volta para a página. No servidor multiusuário (ou Studio aberto
// para a rede) os slides de API não executam: o botão Ambientes nem aparece.
window.SagaApiEnvsForm = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const svg = (n) => `<i class="ic" data-ic="${n}"><svg viewBox="0 0 24 24" aria-hidden="true">${(window.UI_ICONS || {})[n] || ""}</svg></i>`;
  let st = null, tab = "form";
  const status = (text, kind = "") => { const el = $("api-envs-status"); if (el) { el.textContent = text; el.className = `sf-hint api-envs-status ${kind}`; } };

  // sem execução neste Studio (multiusuário, aberto para a rede): o botão some
  fetch("api/http/state").then((r) => r.json()).then((s) => { if (s && s.live === false) $("btn-api-envs")?.setAttribute("hidden", ""); }).catch(() => {});

  const row = (kind, item = {}) => kind === "var"
    ? `<div class="aef-row" data-row="var"><input data-k="name" placeholder="nome (ex.: modelo)" value="${esc(item.name)}" spellcheck="false" aria-label="Nome da variável"><input data-k="value" placeholder="valor" value="${esc(item.value)}" spellcheck="false" aria-label="Valor da variável"><button type="button" class="icon-btn" data-del title="Tirar">${svg("x")}</button></div>`
    : `<div class="aef-row" data-row="secret"><input data-k="name" placeholder="nome (ex.: senha)" value="${esc(item.name)}" spellcheck="false" aria-label="Nome do segredo"><input data-k="value" type="password" autocomplete="off" placeholder="${item.set ? "guardado; em branco mantém" : "valor (guardado cifrado)"}" aria-label="Valor do segredo"><input data-k="env" placeholder="ou variável de ambiente" value="${esc(item.env)}" spellcheck="false" aria-label="Variável de ambiente do segredo"><button type="button" class="icon-btn" data-del title="Tirar">${svg("x")}</button></div>`;

  function card(e, current) {
    const a = e.auth || { type: "nenhuma" };
    return `<section class="aef-env" data-env>
      <div class="aef-head"><input data-k="envname" value="${esc(e.name)}" placeholder="nome (dev, hom, prod)" spellcheck="false" aria-label="Nome do ambiente">
        <label class="aef-cur"><input type="radio" name="aef-current" ${e.name === current ? "checked" : ""}> em uso</label>
        <button type="button" class="btn btn-secondary btn-sm" data-test>Testar</button>
        <button type="button" class="icon-btn" data-remove title="Tirar este ambiente">${svg("trash-2")}</button></div>
      <label>Endereço base <small>vira <code>{{base}}</code> nos slides</small></label>
      <input data-k="base" value="${esc(e.base)}" placeholder="https://api.exemplo.com/v1" spellcheck="false">
      <label>Variáveis <small><code>{{nome}}</code> nos slides</small></label>
      <div data-list="var">${(e.vars || []).map((v) => row("var", v)).join("")}</div>
      <button type="button" class="btn-link" data-add="var">+ variável</button>
      <label>Segredos <small><code>{{secret.nome}}</code> nos slides; nunca vão para o deck</small></label>
      <div data-list="secret">${(e.secrets || []).map((v) => row("secret", v)).join("")}</div>
      <button type="button" class="btn-link" data-add="secret">+ segredo</button>
      <label>Autenticação</label>
      <select data-k="auth"><option value="nenhuma">Nenhuma</option><option value="bearer">Token fixo (Authorization: Bearer)</option><option value="token">Token que expira (client credentials)</option></select>
      <div class="aef-auth" data-auth="bearer"><input data-k="bearer" type="password" autocomplete="off" placeholder="${a.type === "bearer" && a.secretSet ? "token guardado; em branco mantém" : "o token"}" aria-label="Token fixo"><input data-k="bearerEnv" placeholder="ou variável de ambiente" value="${esc(a.type === "bearer" ? a.secretEnv : "")}" spellcheck="false" aria-label="Variável do token"></div>
      <div class="aef-auth" data-auth="token"><input data-k="tokenUrl" placeholder="endereço do token (https://…/token)" value="${esc(a.url)}" spellcheck="false" aria-label="Endereço do token"><input data-k="clientId" placeholder="client id" value="${esc(a.client_id)}" spellcheck="false" aria-label="Client id"><input data-k="clientSecret" type="password" autocomplete="off" placeholder="${a.type === "token" && a.secretSet ? "client secret guardado; em branco mantém" : "client secret"}" aria-label="Client secret"><input data-k="clientSecretEnv" placeholder="ou variável de ambiente do secret" value="${esc(a.type === "token" ? a.secretEnv : "")}" spellcheck="false" aria-label="Variável do client secret"><input data-k="field" placeholder="campo do token na resposta (access_token)" value="${esc(a.field)}" spellcheck="false" aria-label="Campo do token"></div>
      ${e.advanced ? '<p class="muted aef-note">Este ambiente tem configurações avançadas (certificado, outros cabeçalhos); elas ficam como estão. Veja na aba Como texto.</p>' : ""}
      <div class="aef-result" data-result></div>
    </section>`;
  }

  function wire(root) {
    root.querySelectorAll("[data-env]").forEach((sec) => {
      const sel = sec.querySelector('[data-k="auth"]');
      const show = () => sec.querySelectorAll("[data-auth]").forEach((d) => { d.hidden = d.dataset.auth !== sel.value; });
      sel.onchange = show;
      sec.querySelector("[data-remove]").onclick = () => { sec.remove(); empty(); };
      sec.querySelector("[data-test]").onclick = () => test(sec);
      sec.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => { sec.querySelector(`[data-list="${b.dataset.add}"]`).insertAdjacentHTML("beforeend", row(b.dataset.add)); wireRows(sec); }));
      wireRows(sec);
      show();
    });
  }
  const wireRows = (sec) => sec.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => b.closest(".aef-row").remove()));
  function empty() {
    const intro = $("api-envs-form").querySelector("[data-intro]");
    if (intro) intro.hidden = !!$("api-envs-form").querySelector("[data-env]");
  }

  function render() {
    const box = $("api-envs-form");
    box.innerHTML = `<div class="aef-intro" data-intro><p><b>Você ainda não tem ambientes seus.</b> O <b>ENSAIO</b> (uma API de mentira que vem com o sagadeck) já funciona nos slides de API, sem configurar nada.</p><p>Para ligar a sua API, adicione um ambiente: o endereço base, as variáveis, os segredos e como ela autentica. Fica gravado nesta máquina, em <code>${esc(st.file)}</code>.</p></div>
      <div data-envs>${st.envs.map((e) => card(e, st.current)).join("")}</div>
      <button type="button" class="btn btn-secondary" data-new>${svg("plus")} Adicionar ambiente</button>`;
    box.querySelectorAll("[data-env]").forEach((sec, i) => { sec.querySelector('[data-k="auth"]').value = st.envs[i].auth?.type || "nenhuma"; });
    box.querySelector("[data-new]").onclick = () => {
      const names = new Set([...box.querySelectorAll('[data-k="envname"]')].map((i) => i.value));
      const name = ["dev", "hom", "prod"].find((n) => !names.has(n)) || `ambiente${names.size + 1}`;
      box.querySelector("[data-envs]").insertAdjacentHTML("beforeend", card({ name, base: "", vars: [], secrets: [], auth: { type: "nenhuma" } }, names.size ? st.current : name));
      wire(box.querySelector("[data-envs]").lastElementChild.parentElement);
      empty();
      box.querySelector("[data-envs]").lastElementChild.querySelector('[data-k="base"]').focus();
    };
    wire(box);
    empty();
  }

  function collect() {
    const envs = [], box = $("api-envs-form");
    let current = null;
    for (const sec of box.querySelectorAll("[data-env]")) {
      const v = (k) => sec.querySelector(`[data-k="${k}"]`)?.value.trim() || "";
      const name = v("envname");
      if (sec.querySelector('input[name="aef-current"]').checked) current = name;
      const rows = (kind) => [...sec.querySelectorAll(`[data-row="${kind}"]`)].map((r) => Object.fromEntries([...r.querySelectorAll("[data-k]")].map((i) => [i.dataset.k, i.value.trim()]))).filter((r) => r.name);
      const type = v("auth");
      const auth = type === "bearer" ? { type, value: v("bearer"), secretEnv: v("bearerEnv") }
        : type === "token" ? { type, url: v("tokenUrl"), client_id: v("clientId"), value: v("clientSecret"), secretEnv: v("clientSecretEnv"), field: v("field") }
        : { type: "nenhuma" };
      envs.push({ name, base: v("base"), vars: rows("var"), secrets: rows("secret"), auth });
    }
    return { envs, current };
  }

  async function save() {
    status("Salvando…");
    const r = await fetch("api/http/ambientes/form", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collect()) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { status(`Não salvou: ${j.error || r.status}`, "err"); return false; }
    st = j;
    render();
    status(`Salvo em ${st.file}. Os slides de API já usam os ambientes novos.`, "ok");
    return true;
  }

  async function test(sec) {
    const out = sec.querySelector("[data-result]");
    out.className = "aef-result"; out.textContent = "Salvando e testando…";
    if (!(await save())) { out.textContent = ""; return; }
    const name = sec.querySelector('[data-k="envname"]')?.value.trim();
    const again = [...$("api-envs-form").querySelectorAll("[data-env]")].find((s) => s.querySelector('[data-k="envname"]').value === name);
    const res = again?.querySelector("[data-result]") || out;
    try {
      const j = await (await fetch("api/http/ambientes/testar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })).json();
      if (j.error) throw new Error(j.error);
      const parts = [j.base ? (j.base.ok ? `endereço respondeu (HTTP ${j.base.status})` : `endereço não respondeu: ${j.base.error}`) : "sem endereço base",
        ...(j.token ? [j.token.ok ? `token obtido (…${j.token.last4})` : `token falhou: ${j.token.error}`] : [])];
      const ok = (!j.base || j.base.ok) && (!j.token || j.token.ok);
      res.className = `aef-result ${ok ? "ok" : "err"}`;
      res.textContent = (ok ? "Funcionou: " : "Problema: ") + parts.join("; ") + ".";
    } catch (e) { res.className = "aef-result err"; res.textContent = `Não testou: ${e.message}`; }
  }

  function setTab(t) {
    tab = t;
    document.querySelectorAll("[data-envs-tab]").forEach((b) => b.classList.toggle("active", b.dataset.envsTab === t));
    $("api-envs-form").hidden = t !== "form";
    $("api-envs-textmode").hidden = t !== "text";
    $("btn-api-envs-save").disabled = false;
    status("");
    if (t === "text") $("api-envs-text").dispatchEvent(new Event("input")); // a aba de texto valida antes de liberar o Salvar
  }

  async function open() {
    document.querySelectorAll("[data-envs-tab]").forEach((b) => (b.onclick = async () => { if (b.dataset.envsTab === "text") { const j = await (await fetch("api/http/ambientes")).json().catch(() => ({})); if (j.text != null) $("api-envs-text").value = j.text; } else await load(); setTab(b.dataset.envsTab); }));
    await load();
    setTab("form");
  }
  async function load() {
    const r = await fetch("api/http/ambientes/form");
    st = await r.json().catch(() => ({ envs: [] }));
    if (!r.ok) { status(st.error || `HTTP ${r.status}`, "err"); st = { envs: [], file: "" }; }
    render();
  }

  return { open, save, active: () => tab === "form" };
})();
