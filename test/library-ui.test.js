// Biblioteca no Studio, de ponta a ponta (Chrome), e o modo multiusuário (uma biblioteca por usuário).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio } from "./helpers.js";
import { packDeck } from "../src/package.js";

test("biblioteca no Studio", { timeout: 240000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null); // sem deck: "/" é a biblioteca
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const lib = () => p.evaluate(async () => (await (await fetch("/api/library")).json()));
    const settle = (ms = 500) => p.waitForTimeout(ms);
    const dlgOk = async (value) => { await p.fill("#dlg-name", value); await p.click("#dlg-ok"); await settle(700); };

    await t.test("biblioteca vazia explica o que fazer (sem texto de manual com o caminho da pasta)", async () => {
      assert.match(await p.innerText("#main"), /Sua biblioteca está vazia/);
      assert.doesNotMatch(await p.innerText("#side"), new RegExp(path.basename(studio.library)));
      assert.equal(await p.isVisible("#user"), false, "sem multiusuário, sem o chip de usuário");
    });

    await t.test("criar tópico (nome + cor) vira uma pasta de verdade", async () => {
      await p.click("[data-empty-topic]");
      await p.click('.sw[data-c="#0f6cbd"]');
      await dlgOk("Palestras");
      const l = await lib();
      assert.deepEqual(l.topics.map((x) => [x.name, x.color]), [["Palestras", "#0f6cbd"]]);
      assert.ok(fs.existsSync(path.join(studio.library, "Palestras")));
      assert.match(await p.innerText("#main"), /Nenhuma apresentação em Palestras/);
    });

    await t.test("nova em branco abre no editor e salva na pasta da biblioteca", async () => {
      await p.click("[data-empty-new]");
      await p.click('[data-new="blank"]');
      await Promise.all([p.waitForURL(/\/editor\?deck=/, { timeout: 30000, waitUntil: "commit" }), dlgOk("Minha palestra")]);
      await p.waitForSelector("#rendered-slide-container .slide", { timeout: 30000 });
      assert.equal(await p.inputValue("#deck-title-input"), "Minha palestra");
      const file = path.join(studio.library, "Palestras", "Minha palestra", "Minha palestra.yaml");
      assert.ok(fs.existsSync(file));
      // editar no editor salva no arquivo da biblioteca
      await p.fill("#deck-title-input", "Minha palestra v2");
      await p.press("#deck-title-input", "Tab");
      await settle(1200);
      assert.match(fs.readFileSync(file, "utf8"), /title: Minha palestra v2/);
    });

    await t.test("voltar à biblioteca pelo ícone: cartão com capa de verdade", async () => {
      await Promise.all([p.waitForURL((u) => u.pathname === "/biblioteca"), p.click("#btn-library")]);
      await p.click('[data-view="recentes"]');
      await p.waitForSelector(".card[data-id] img");
      await p.waitForFunction(() => { const i = document.querySelector(".card[data-id] img"); return i && i.complete && i.naturalWidth > 100; }, null, { timeout: 30000 });
      assert.match(await p.innerText(".card[data-id] .name"), /Minha palestra v2/);
    });

    await t.test("renomear, duplicar e mover (arrastando para outro tópico)", async () => {
      await p.click("#new-topic"); await dlgOk("Trabalho");
      await p.click('[data-view="Palestras"]');
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="rename"]'); await dlgOk("Palestra final");
      assert.ok((await lib()).decks.some((d) => d.title === "Palestra final"));
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="dup"]'); await settle(700);
      assert.equal((await lib()).decks.length, 2);
      await p.dragAndDrop('.card[data-id]:not(.new-card) >> nth=0', '.nav[data-topic="Trabalho"]');
      await settle(900);
      const l = await lib();
      assert.deepEqual(l.topics.map((x) => [x.name, x.count]).sort(), [["Palestras", 1], ["Trabalho", 1]]);
    });

    await t.test("lixeira: esvaziar tudo de uma vez (com confirmação)", async () => {
      const id1 = await p.evaluate(async () => (await (await fetch("/api/library/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Some 1" }) })).json()).id);
      const id2 = await p.evaluate(async () => (await (await fetch("/api/library/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Some 2" }) })).json()).id);
      for (const id of [id1, id2]) await p.evaluate(async (id) => fetch("/api/library/decks/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }), id);
      const antes = (await lib()).trash.length;
      assert.ok(antes >= 2);
      await p.reload(); await p.click('[data-view="lixeira"]');
      p.once("dialog", (d) => { assert.match(d.message(), /Não dá para desfazer/); d.dismiss(); });
      await p.click("[data-empty-trash]"); await settle(400);
      assert.equal((await lib()).trash.length, antes, "cancelar não apaga nada");
      p.once("dialog", (d) => d.accept());
      await p.click("[data-empty-trash]"); await settle(700);
      assert.equal((await lib()).trash.length, 0);
      assert.equal(fs.readdirSync(path.join(studio.library, ".lixeira")).filter((f) => !f.startsWith(".")).length, 0, "as pastas saíram do disco");
      assert.equal(await p.locator("[data-empty-trash]").count(), 0, "lixeira vazia: sem o botão");
    });

    await t.test("lixeira: excluir e restaurar", async () => {
      await p.click('[data-view="Trabalho"]');
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="trash"]'); await settle(700);
      assert.equal((await lib()).trash.length, 1);
      await p.click('[data-view="lixeira"]');
      await p.click("[data-restore]"); await settle(700);
      const l = await lib();
      assert.equal(l.trash.length, 0);
      assert.equal(l.decks.filter((d) => d.topic === "Trabalho").length, 1);
    });

    await t.test("menu do cartão: Baixar PowerPoint sem as notas pede o arquivo sem as notas", { timeout: 120000 }, async () => {
      await p.click('[data-view="Trabalho"]');
      await p.click(".card[data-id] [data-more]");
      const [req] = await Promise.all([p.waitForRequest(/api\/library\/download/), p.click('[data-dl="pptx"][data-notas="0"]', { noWaitAfter: true })]); // o download é "navegação": numa máquina lenta, o PPTX demora mais que o limite do clique
      const u = new URL(req.url());
      assert.equal(u.searchParams.get("kind"), "pptx");
      assert.equal(u.searchParams.get("notas"), "0");
      const head = await p.evaluate(async (href) => { const r = await fetch(href); return { ok: r.ok, type: r.headers.get("content-type") }; }, req.url());
      assert.ok(head.ok && /presentationml/.test(head.type), JSON.stringify(head));
    });

    await t.test("baixar .sagadeck pelo menu do cartão e importar de volta", async () => {
      await p.click('[data-view="Trabalho"]');
      await p.click(".card[data-id] [data-more]");
      const [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-dl="sagadeck"]')]);
      assert.match(dl.suggestedFilename(), /\.sagadeck$/);
      const file = path.join(studio.library, "..", `baixado-${Date.now()}.sagadeck`);
      await dl.saveAs(file);
      await p.click("#btn-new"); await p.click('[data-new="import"]').catch(() => {});
      await p.setInputFiles("#import-input", file);
      await p.waitForFunction(() => document.querySelectorAll(".card[data-id]").length >= 2, null, { timeout: 10000 });
      assert.equal((await lib()).decks.filter((d) => d.topic === "Trabalho").length, 2);
    });

    await t.test("busca por título", async () => {
      await p.click('[data-view="todas"]');
      await p.fill("#q", "final");
      assert.ok((await p.locator(".card[data-id]").count()) >= 1);
      await p.fill("#q", "não existe nada assim");
      assert.match(await p.innerText("#main"), /Nada encontrado/);
      await p.fill("#q", "");
    });

    await t.test("Apresentar pelo cartão abre o editor já no modo apresentação", async () => {
      await p.click('[data-view="Palestras"]');
      await p.hover(".card[data-id]:not(.new-card)");
      await Promise.all([p.waitForURL(/\/editor\?deck=/, { timeout: 30000, waitUntil: "commit" }), p.click(".card[data-id]:not(.new-card) [data-present]", { noWaitAfter: true })]);
      await p.waitForSelector("#presentation-modal:not(.hidden)", { timeout: 15000 });
      await p.keyboard.press("Escape");
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
  }
});

test("multiusuário: cada usuário vê só a sua biblioteca; sem o cabeçalho do proxy, nada", async () => {
  const studio = await startStudio(null, { multiuser: true });
  try {
    const as = (user, p, body) => fetch(studio.url + p, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(user ? { "X-Sagadeck-User": user } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await as(null, "/api/library")).status, 401, "sem usuário: 401");
    assert.equal((await as(null, "/api/deck")).status, 401);
    await as("ana", "/api/library/topics", { name: "Aulas" });
    await as("ana", "/api/library/decks", { topic: "Aulas", title: "Da Ana" });
    await as("bia", "/api/library/decks", { topic: "", title: "Da Bia" });
    const ana = await (await as("ana", "/api/library")).json(), bia = await (await as("bia", "/api/library")).json();
    assert.deepEqual(ana.decks.map((d) => d.title), ["Da Ana"]);
    assert.deepEqual(bia.decks.map((d) => d.title), ["Da Bia"]);
    assert.equal(ana.user, "ana");
    assert.ok(fs.existsSync(path.join(studio.library, "usuarios", "ana", "Aulas", "Da Ana")));
    // o deck aberto também é por usuário
    await as("ana", "/api/library/open", { id: ana.decks[0].id });
    await as("bia", "/api/library/open", { id: bia.decks[0].id });
    assert.equal((await (await as("ana", "/api/deck")).json()).spec.title, "Da Ana");
    assert.equal((await (await as("bia", "/api/deck")).json()).spec.title, "Da Bia");
    // a Bia não abre o deck da Ana nem pelo id
    const r = await as("bia", "/api/library/open", { id: ana.decks[0].id });
    assert.equal(r.status, 400);
  } finally {
    await studio.close();
  }
});

// Configurar IA (biblioteca): provedor, chave e modelo desta máquina, com Testar antes de salvar. Grava em
// ~/.sagadeck/ia.json (aqui, o arquivo de teste), a chave nunca volta inteira para a página e a IA passa a responder.
test("Configurar IA: escolher provedor, colar a chave, testar e salvar; a chave não volta inteira; no multiusuário não aparece", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const { startMockLLM } = await import("./mock-llm.js");
  const llm = await startMockLLM(() => "ok");
  const studio = await startStudio(null);
  const keepUrl = process.env.SAGADECK_LLM_URL;
  delete process.env.SAGADECK_LLM_URL; // sem variável: vale a configuração da máquina, que a tela escreve
  fs.rmSync(process.env.SAGADECK_IA, { force: true });
  try {
    assert.equal((await (await fetch(studio.url + "/api/ai/status")).json()).configured, false, "sem configuração: IA desligada");
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.waitForSelector("#btn-ai:not([hidden])");
    assert.equal((await p.innerText("#btn-ai")).trim(), "Configurar IA");
    await p.click("#btn-ai");
    await p.waitForSelector("#ai-settings-dialog[open]");
    await p.selectOption('[data-f="provider"]', "outro");
    await p.fill('[data-f="url"]', llm.url);
    await p.fill('[data-f="key"]', "sk-teste-9876");
    await p.fill('[data-model="text"]', "provedor/modelo");
    await p.click("[data-test]");
    await p.locator("[data-status].ok", { hasText: "Funcionou" }).waitFor();
    assert.equal(llm.requests.at(-1).headers.authorization, "Bearer sk-teste-9876", "o teste usa a chave da tela");
    assert.equal(llm.requests.at(-1).body.model, "provedor/modelo");
    await p.click("[data-save]");
    await p.locator("[data-status].ok", { hasText: "Salvo" }).waitFor();
    const saved = JSON.parse(fs.readFileSync(process.env.SAGADECK_IA, "utf8"));
    assert.equal(saved.url, llm.url);
    assert.equal(saved.key, "sk-teste-9876");
    assert.equal(saved.models.text, "provedor/modelo");
    const info = await (await fetch(studio.url + "/api/ia")).json();
    assert.ok(!JSON.stringify(info).includes("sk-teste-9876"), "a chave não volta inteira");
    assert.equal(info.config.keyHint, "••••9876");
    assert.equal((await (await fetch(studio.url + "/api/ai/status?refresh=1")).json()).available, true, "a IA responde");
    // reabrir: em branco mantém a chave gravada
    await p.click("[data-close]");
    await p.click("#btn-ai");
    await p.waitForSelector("#ai-settings-dialog[open]");
    assert.match(await p.getAttribute('[data-f="key"]', "placeholder"), /••••9876/);
    await p.click("[data-save]");
    await p.locator("[data-status].ok", { hasText: "Salvo" }).waitFor();
    assert.equal(JSON.parse(fs.readFileSync(process.env.SAGADECK_IA, "utf8")).key, "sk-teste-9876");
    assert.deepEqual(errors, []);
  } finally {
    process.env.SAGADECK_LLM_URL = keepUrl;
    fs.rmSync(process.env.SAGADECK_IA, { force: true });
    await browser.close();
    await studio.close();
    await llm.close();
  }
  // multiusuário: quem configura é quem administra (a tela não aparece e não grava)
  const multi = await startStudio(null, { multiuser: true });
  try {
    const r = await fetch(multi.url + "/api/ia", { method: "POST", headers: { "Content-Type": "application/json", "X-Sagadeck-User": "ana" }, body: JSON.stringify({ url: "http://x/v1", models: { text: "m" } }) });
    assert.equal(r.status, 403);
    assert.equal((await (await fetch(multi.url + "/api/ia", { headers: { "X-Sagadeck-User": "ana" } })).json()).editable, false);
  } finally { await multi.close(); }
});

// No BabsDeck o Studio fica em https://portal/apresentacoes/ (o nginx tira o prefixo). Tudo tem que
// funcionar sob um prefixo: nenhum endereço absoluto ("/api/...") no front.
test("atrás de um proxy com prefixo (/apresentacoes/): biblioteca e editor sem nenhum pedido quebrado", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const http = await import("node:http");
  const studio = await startStudio(null, { multiuser: true });
  const target = new URL(studio.url);
  const proxy = http.createServer((req, res) => {
    // portal sem /whoami (só id): a biblioteca mostra o id e segue, sem pedido quebrado
    if (req.url === "/whoami") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ logged_in: false })); }
    if (!req.url.startsWith("/apresentacoes/")) { res.writeHead(404); return res.end("fora do prefixo: " + req.url); }
    const up = http.request({ host: target.hostname, port: target.port, method: req.method, path: req.url.slice("/apresentacoes".length),
      headers: { ...req.headers, "x-sagadeck-user": "ana" } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(up);
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${proxy.address().port}/apresentacoes/`;
  try {
    const { page: p, errors } = await newPage(browser, base);
    const bad = [];
    p.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    p.on("requestfailed", (r) => bad.push(`falhou ${r.url()}`));
    await p.waitForSelector("[data-empty-new]");
    await p.click("[data-empty-new]");
    await p.click('[data-new="blank"]');
    await Promise.all([p.waitForURL(/\/apresentacoes\/editor\?deck=/), (async () => { await p.fill("#dlg-name", "Sob prefixo"); await p.click("#dlg-ok"); })()]);
    await p.waitForSelector("#rendered-slide-container .slide");
    await Promise.all([p.waitForURL((u) => u.pathname === "/apresentacoes/biblioteca"), p.click("#btn-library")]);
    await p.waitForFunction(() => { const i = document.querySelector(".card[data-id] img"); return i && i.complete && i.naturalWidth > 100; }, null, { timeout: 30000 });
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  } finally {
    proxy.close();
    await browser.close();
    await studio.close();
  }
});

test("sem tópico: a pasta 'Sem tópico' e os .yaml soltos na raiz não aparecem com o mesmo nome; soltar ali não mexe na estrutura", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null);
  try {
    const post = (p, b) => fetch(studio.url + "/" + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    await post("api/library/decks", { topic: "", title: "Sem tópico escolhido" });
    fs.writeFileSync(path.join(studio.library, "solta.yaml"), "title: Solta\nslides:\n  - layout: statement\n    text: oi\n");
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.waitForSelector(".nav[data-view='Sem tópico']");
    const names = await p.$$eval("#side .nav .name", (els) => els.map((e) => e.textContent));
    assert.equal(names.filter((n) => n === "Sem tópico").length, 1, `nomes: ${names}`);
    assert.ok(names.includes("Soltas na pasta"), `nomes: ${names}`);
    assert.equal(await p.$(".nav[data-view=''][data-topic]"), null, "a entrada dos soltos não recebe cartões arrastados");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
  }
});

// Quem nunca viu um slide api precisa de um exemplo que funcione sem configurar nada: o deck de ensaio,
// executando na API de mentira do ambiente embutido ENSAIO (sem ~/.sagadeck/ambientes.yaml, sem VPN).
test("Nova → Exemplo: aula de APIs ao vivo cria o deck (com o arquivo do upload) e ele executa no ambiente ENSAIO", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  fs.rmSync(process.env.SAGADECK_AMBIENTES, { force: true }); // ninguém configurou ambiente nenhum
  const studio = await startStudio(null);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click("#btn-new");
    await p.click('#new-menu [data-new="gallery"]');
    assert.match(await p.innerText(".vit-grid"), /Aula de APIs ao vivo/);
    // o exemplo de aula de APIs é o deck mais pesado da vitrine (muitos slides api + o arquivo do upload): abrir a prévia e
    // copiar para a biblioteca passa dos 8 s padrão numa máquina lenta (Windows da CI); o prazo aqui é o do passo, não um atraso
    await Promise.all([p.waitForURL(/\/editor\?model=example-api/, { timeout: 30000, waitUntil: "commit" }), p.click('.vit-card[data-new="example-api"]', { noWaitAfter: true })]);
    await p.click("#btn-model-use", { noWaitAfter: true, timeout: 30000 }); await p.waitForURL(/\/editor\?deck=/, { timeout: 30000, waitUntil: "commit" }); // prévia → a cópia
    await p.waitForSelector("#rendered-slide-container .slide", { timeout: 30000 });

    // o deck salvo na biblioteca: os slides api do exemplo e, ao lado, o arquivo que o upload envia
    const yamls = fs.readdirSync(studio.library, { recursive: true }).filter((f) => f.endsWith(".yaml"));
    assert.equal(yamls.length, 1, yamls.join(", "));
    const file = path.join(studio.library, yamls[0]);
    const saved = YAML.parse(fs.readFileSync(file, "utf8"));
    assert.ok(saved.slides.filter((s) => s.layout === "api").length >= 10);
    assert.ok(fs.existsSync(path.join(path.dirname(file), "contrato.txt")));
    assert.equal(fs.existsSync(process.env.SAGADECK_AMBIENTES), false, "o ENSAIO não grava nada no arquivo de ambientes");

    // apresentando: ENSAIO no selo, e o Executar funciona de verdade (token → LLM → upload → OCR)
    const contextRequest = p.waitForRequest(r => new URL(r.url()).pathname === '/api/deck');
    await p.evaluate(() => fetch('api/deck'));
    const scope = '?_workspace=' + (await contextRequest).headers()['x-sagadeck-workspace'];
    const { page: pv, errors: pvErrors } = await newPage(browser, `${studio.url}/preview${scope}`, { width: 1920, height: 1080 });
    await pv.waitForFunction(() => window.sagadeckApi && window.sagadeckApi.state.live);
    const idx = (id) => saved.slides.findIndex((s) => s.id === id);
    const run = async (id) => {
      const s = `.slide[data-idx="${idx(id)}"]`;
      await pv.evaluate((n) => window.sagadeck.goto(n, 0), idx(id));
      // sob carga o clique podia chegar antes de o slide montar (sem onclick): nada rodava e a conferência lia vazio
      await pv.waitForFunction((sel) => !!document.querySelector(`${sel} .L-api`)?._cfg && !document.querySelector(`${sel} [data-api-run]`).disabled, s);
      await pv.click(`${s} [data-api-run]`);
      await pv.waitForFunction((sel) => !document.querySelector(`${sel} .L-api`).classList.contains("running"), s, { timeout: 20000 });
      return s;
    };
    let s = await run("identity");
    assert.equal((await pv.innerText(`${s} .api-env-name`)).trim(), "ENSAIO");
    assert.match(await pv.innerText(`${s} .api-res`), /token JWT gerado/i);
    s = await run("llm");
    assert.match(await pv.innerText(`${s} .api-answer`), /eco: O que é RAG, em uma frase\?/);
    s = await run("upload");
    assert.match(await pv.innerText(`${s} .api-saved`), /\{\{path_id\}\} = store\/contrato\.txt/);
    s = await run("ocr");
    assert.match(await pv.innerText(`${s} .api-answer`), /Cláusula 1: prazo de 30 dias/);
    assert.ok(fs.existsSync(file.replace(/\.yaml$/, ".respostas.json")), "a gravação fica ao lado do deck");
    assert.deepEqual(pvErrors, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
  }
});

test("Nova → Exemplo: texto no cenário cria o deck com as imagens de exemplo ao lado", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click("#btn-new");
    await p.click('#new-menu [data-new="gallery"]');
    assert.match(await p.innerText(".vit-grid"), /Texto no cenário/);
    await Promise.all([p.waitForURL(/\/editor\?model=example-cenario/, { timeout: 30000, waitUntil: "commit" }), p.click('.vit-card[data-new="example-cenario"]', { noWaitAfter: true })]);
    await p.click("#btn-model-use", { noWaitAfter: true, timeout: 30000 }); await p.waitForURL(/\/editor\?deck=/, { timeout: 30000, waitUntil: "commit" }); // prévia → a cópia
    await p.waitForSelector("#rendered-slide-container .L-scenography", { timeout: 30000 });
    const yamls = fs.readdirSync(studio.library, { recursive: true }).filter((f) => f.endsWith(".yaml"));
    const file = path.join(studio.library, yamls.find((f) => /cen[aá]rio/i.test(f)));
    const saved = YAML.parse(fs.readFileSync(file, "utf8"));
    assert.ok(saved.slides.filter((s) => s.layout === "scenography").length >= 13);
    for (const img of ["cidade.svg", "pessoa.svg"]) assert.ok(fs.existsSync(path.join(path.dirname(file), "imagens", img)), img);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
  }
});

// O "preguiçoso": Nova tem só três caminhos; o que é pronto mora numa vitrine com filtro; o diálogo de IA pede, numa
// tela só, o assunto, o tempo (os slides saem daí), o estilo e o material de apoio — e tudo isso vai no pedido.
test("Nova: três caminhos, vitrine com filtro e IA com tempo, estilo e anexo numa tela só", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);

    await t.test("o menu tem os três caminhos (e em branco / importar), sem o mural de modelos", async () => {
      await p.click("#btn-new");
      const keys = await p.$$eval("#new-menu [data-new]", (els) => els.map((e) => e.dataset.new));
      assert.deepEqual(keys, ["ai", "gallery", "blank", "import"], "descrever e anexar arquivo viraram um item só");
      await p.keyboard.press("Escape");
    });

    await t.test("Modelo pronto: visuais para começar e recursos do SagaDeck, com a capa de verdade; um estilo abre em prévia e vira apresentação ao usar", async () => {
      await p.click("#btn-new");
      await p.click('#new-menu [data-new="gallery"]');
      await p.waitForSelector('.vit-card[data-new="exp-executivo"]'); // os estilos prontos vêm do servidor
      const kinds = await p.$$eval(".vit-card", (els) => [...new Set(els.map((e) => e.dataset.kind))]);
      assert.deepEqual(kinds.sort(), ["recurso", "visual"], "dois grupos pelo que a pessoa quer fazer");
      const nomes = await p.$$eval(".vit-card b", (els) => els.map((e) => e.textContent));
      assert.equal(new Set(nomes).size, nomes.length, `nome repetido na vitrine: ${nomes.join(", ")}`);
      assert.match(await p.textContent(".vit-intro"), /prévia/);
      // a capa desenhada de verdade no lugar das barras de cor
      await p.waitForFunction(() => { const img = document.querySelector('.vit-card[data-new="model-perspectiva"] .vit-thumb img'); return img && img.complete && img.naturalWidth > 100; }, null, { timeout: 30000 });
      await p.click('.vit-filter[data-kind="recurso"]');
      const visiveis = await p.$$eval(".vit-card", (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.new));
      assert.deepEqual(visiveis, ["model-conheca", "model-explorar", "model-novidades", "model-hidraulica", "model-algoritmos", "model-compacto", "model-avancado", "model-diagramas", "example-api", "example-cenario"]);
      await p.click('.vit-filter[data-kind="visual"]');
      await Promise.all([p.waitForURL(/\/editor\?model=exp-executivo/, { timeout: 30000, waitUntil: "commit" }), p.click('.vit-card[data-new="exp-executivo"]', { noWaitAfter: true })]);
      await p.waitForSelector("#rendered-slide-container .slide", { timeout: 30000 });
      const yamls = () => fs.readdirSync(studio.library, { recursive: true }).filter((f) => f.endsWith(".yaml"));
      assert.equal(yamls().length, 0, "prévia: nada criado");
      await p.click("#btn-model-use", { noWaitAfter: true, timeout: 30000 }); await p.waitForURL(/editor\?deck=/, { timeout: 30000, waitUntil: "commit" });
      await p.waitForSelector("#rendered-slide-container .slide", { timeout: 30000 });
      assert.equal(yamls().length, 1, yamls().join(", "));
      assert.equal(YAML.parse(fs.readFileSync(path.join(studio.library, yamls()[0]), "utf8")).theme, "noite");
    });

    await t.test("Criar com IA: minutos viram slides, estilo e anexo vão no pedido", async () => {
      await p.goto(studio.url + "/biblioteca", { waitUntil: "networkidle" });
      await p.click("#btn-new");
      await p.click('#new-menu [data-new="ai"]');
      await p.fill("#dlg-brief", "resultado do ano para a diretoria");
      await p.fill("#dlg-min", "20");
      assert.match(await p.textContent("#dlg-slides"), /13 slides/);
      await p.selectOption("#dlg-style", "revista");
      await p.setInputFiles("#dlg-files", { name: "numeros.txt", mimeType: "text/plain", buffer: Buffer.from("Receita de 3 bilhões") });
      await p.waitForFunction(() => /numeros\.txt/.test(document.querySelector("#dlg-chips")?.textContent || "") && !document.querySelector("#dlg-ok").disabled);
      // sem LLM nos testes: responde como o servidor responderia
      let body = null;
      await p.route("**/api/library/decks/ai", async (route) => { body = JSON.parse(route.request().postData()); await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "error", error: "sem LLM no teste" }) + "\n" }); });
      await p.click("#dlg-ok");
      await p.waitForFunction(() => /Não deu/.test(document.querySelector("#dlg-status")?.textContent || ""));
      await p.unroute("**/api/library/decks/ai");
      assert.equal(body.duration, 20);
      assert.equal(body.style, "revista");
      assert.equal(body.briefing, "resultado do ano para a diretoria");
      assert.equal(body.materials.length, 1);
      assert.equal(typeof body.materials[0], "string");
      await p.keyboard.press("Escape");
    });

    await t.test("Criar com IA só com anexo: o modal abre primeiro (sem seletor de arquivo de cara) e o anexo basta", async () => {
      await p.click("#btn-new");
      let abriuSeletor = false;
      const marca = () => { abriuSeletor = true; };
      p.on("filechooser", marca);
      await p.click('#new-menu [data-new="ai"]');
      await p.waitForSelector("#dlg-brief"); await p.waitForTimeout(500);
      p.off("filechooser", marca);
      assert.equal(abriuSeletor, false, "o seletor de arquivo não abre sozinho");
      await p.setInputFiles("#dlg-files", { name: "relatorio.md", mimeType: "text/markdown", buffer: Buffer.from("# Relatório\nVendas subiram 40%") });
      await p.waitForFunction(() => /relatorio\.md/.test(document.querySelector("#dlg-chips")?.textContent || "") && !document.querySelector("#dlg-ok").disabled);
      let body = null;
      await p.route("**/api/library/decks/ai", async (route) => { body = JSON.parse(route.request().postData()); await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "error", error: "sem LLM no teste" }) + "\n" }); });
      await p.click("#dlg-ok");
      await p.waitForFunction(() => /Não deu/.test(document.querySelector("#dlg-status")?.textContent || ""));
      await p.unroute("**/api/library/decks/ai");
      assert.match(body.briefing, /material anexado/);
      assert.equal(body.materials.length, 1);
      await p.keyboard.press("Escape");
    });

    await t.test("Criar com IA: se a IA perguntar para que serve o material, as opções aparecem e a resposta vai no pedido seguinte", async () => {
      await p.goto(studio.url + "/biblioteca", { waitUntil: "networkidle" });
      await p.click("#btn-new");
      await p.click('#new-menu [data-new="ai"]');
      await p.fill("#dlg-brief", "um workshop de docker pro time");
      const bodies = [];
      await p.route("**/api/library/decks/ai", async (route) => {
        const body = JSON.parse(route.request().postData()); bodies.push(body);
        const data = body.answer ? { type: "error", error: "sem LLM no teste" } : { type: "result", data: { ok: true, question: { question: "O pessoal vai guardar o material?", options: ["Sim, para consulta", "Não, só a sessão"] } } };
        await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify(data) + "\n" });
      });
      await p.click("#dlg-ok");
      await p.waitForSelector(".dlg-ask");
      assert.match(await p.textContent(".dlg-ask b"), /guardar o material/);
      assert.deepEqual(await p.locator(".dlg-ask-opts button").allTextContents(), ["Sim, para consulta", "Não, só a sessão"]);
      await p.click('.dlg-ask-opts button:has-text("Sim, para consulta")');
      await p.waitForFunction(() => /Não deu/.test(document.querySelector("#dlg-status")?.textContent || ""));
      await p.unroute("**/api/library/decks/ai");
      assert.equal(bodies.length, 2);
      assert.equal(bodies[0].answer, undefined);
      assert.equal(bodies[1].answer, "Sim, para consulta", "a resposta vai no segundo pedido");
      await p.keyboard.press("Escape");
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
  }
});

test("biblioteca mostra o username do portal em vez do id cru", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null, { multiuser: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "X-Sagadeck-User": "305cc6c7416383c8" } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.route("**/whoami", (route) => route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ logged_in: true, id: "305cc6c7416383c8", username: "narumi", email: "naru@exemplo.com", role: "user" }) }));
    await page.goto(studio.url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.getElementById("user").hidden, null, { timeout: 15000 });
    assert.equal(await page.innerText("#uname"), "narumi", "nome amigável, não o id");
    assert.equal(await page.innerText("#avatar"), "N", "avatar com a inicial");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await browser.close();
    await studio.close();
  }
});

// Primeiro uso: sem IA configurada, a biblioteca mostra a faixa "Configure a IA"; a tela tem a recomendação (que também
// testa a instalação) e "Usar a recomendação" preenche provedor e modelos; salvo, a faixa some.
test("primeiro uso: faixa Configure a IA; Usar a recomendação preenche OpenRouter e os modelos; ao salvar, a faixa some", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const { startMockLLM } = await import("./mock-llm.js");
  const llm = await startMockLLM(() => "ok");
  const studio = await startStudio(null);
  const keepUrl = process.env.SAGADECK_LLM_URL;
  delete process.env.SAGADECK_LLM_URL;
  fs.rmSync(process.env.SAGADECK_IA, { force: true });
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.waitForSelector("#ai-banner:not([hidden])");
    assert.match(await p.innerText("#ai-banner"), /A IA ainda não está configurada/);
    await p.click("#ai-banner-btn");
    await p.waitForSelector("#ai-settings-dialog[open]");
    assert.match(await p.innerText("#ai-settings-dialog .rec"), /Recomendado para começar: OpenRouter, com deepseek\/deepseek-v4\.1-flash/);
    assert.match(await p.getAttribute('[data-model="text"]', "placeholder"), /ex\.: deepseek/);
    await p.click("[data-rec]");
    assert.equal(await p.inputValue('[data-f="provider"]'), "openrouter");
    assert.equal(await p.inputValue('[data-f="url"]'), "https://openrouter.ai/api/v1");
    assert.equal(await p.inputValue('[data-model="image"]'), "google/gemini-3.1-flash-image");
    assert.equal(await p.inputValue('[data-model="search"]'), "deepseek/deepseek-v4.1-flash:online");
    assert.match(await p.innerText("[data-status]"), /Cole a chave do OpenRouter/);
    // salva (aqui apontando para o LLM falso, para não depender da internet) e a faixa some
    await p.selectOption('[data-f="provider"]', "outro");
    await p.fill('[data-f="url"]', llm.url);
    await p.fill('[data-f="key"]', "sk-primeiro-uso");
    await p.click("[data-save]");
    await p.locator("[data-status].ok", { hasText: "Salvo" }).waitFor();
    await p.click("[data-close]");
    await p.waitForSelector("#ai-banner", { state: "hidden" });
    assert.deepEqual(errors, []);
  } finally {
    process.env.SAGADECK_LLM_URL = keepUrl;
    fs.rmSync(process.env.SAGADECK_IA, { force: true });
    await browser.close(); await studio.close(); await llm.close();
  }
});

// ia.json que existe mas não pode ser lido (no servidor, criado como root para um serviço de outro usuário): a faixa e
// a tela Configurar IA dizem o motivo, em vez de só "não configurada".
test("ia.json ilegível: a faixa da biblioteca e o Configurar IA dizem que não deu para ler o arquivo", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null);
  const keepUrl = process.env.SAGADECK_LLM_URL;
  delete process.env.SAGADECK_LLM_URL;
  fs.rmSync(process.env.SAGADECK_IA, { recursive: true, force: true });
  fs.mkdirSync(process.env.SAGADECK_IA, { recursive: true }); // uma pasta no lugar do arquivo: a leitura falha em qualquer sistema
  try {
    const status = await (await fetch(studio.url + "/api/ai/status")).json();
    assert.equal(status.configured, false);
    assert.match(status.problem, /Não deu para ler/);
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.waitForSelector("#ai-banner:not([hidden])");
    assert.match(await p.innerText("#ai-banner"), /Não deu para ler .*.json/);
    await p.click("#ai-banner-btn");
    await p.waitForSelector("#ai-settings-dialog[open]");
    assert.match(await p.innerText("#ai-settings-dialog [data-problem]"), /Não deu para ler .*.json/);
    assert.deepEqual(errors, []);
  } finally {
    process.env.SAGADECK_LLM_URL = keepUrl;
    fs.rmSync(process.env.SAGADECK_IA, { recursive: true, force: true });
    await browser.close(); await studio.close();
  }
});

// No servidor (multiusuário) quem configura a IA é quem administra; quem usa o portal não precisa (nem deve) ver
// provedor, endereço, modelos ou o final da chave. Antes, /api/ia e /api/ai/status mostravam tudo para qualquer um.
test("multiusuário: a configuração da IA (provedor, modelos, final da chave) não sai para quem usa; a tela só diz se está ligada", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const { startMockLLM } = await import("./mock-llm.js");
  const { saveIA } = await import("../src/ai/ia-config.js");
  const llm = await startMockLLM(() => "ok");
  const keepUrl = process.env.SAGADECK_LLM_URL;
  const studio = await startStudio(null, { multiuser: true });
  delete process.env.SAGADECK_LLM_URL; // vale o ia.json, como no servidor
  saveIA({ provider: "outro", url: llm.url, key: "sk-servidor-4321", models: { text: "provedor/modelo-secreto" } }, process.env.SAGADECK_IA);
  const segredos = ["4321", "modelo-secreto", new URL(llm.url).host, "ia-de-teste"];
  const vazou = (texto) => segredos.filter((s) => texto.includes(s));
  const as = (p, body) => fetch(studio.url + p, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-Sagadeck-User": "ana" }, body: body ? JSON.stringify(body) : undefined });
  try {
    const ia = await (await as("/api/ia")).json();
    assert.equal(ia.editable, false);
    assert.equal(ia.configured, true);
    assert.deepEqual(vazou(JSON.stringify(ia)), [], "/api/ia não mostra a configuração");
    const status = await (await as("/api/ai/status?refresh=1")).json();
    assert.equal(status.available, true, "a IA responde");
    assert.deepEqual(vazou(JSON.stringify(status)), [], "/api/ai/status não mostra a configuração");
    // no editor: o indicador e a tela Configurar IA só dizem que a IA está ligada e quem configura
    const { id } = await (await as("/api/library/decks", { topic: "", title: "Da Ana" })).json();
    await as("/api/library/open", { id });
    const p = await browser.newPage({ extraHTTPHeaders: { "X-Sagadeck-User": "ana" } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await p.goto(`${studio.url}/editor?deck=${encodeURIComponent(id)}`, { waitUntil: "networkidle" });
    await p.waitForSelector("#ai-status.on");
    assert.deepEqual(vazou(await p.getAttribute("#ai-status", "title")), []);
    await p.click("#ai-status");
    await p.waitForSelector("#ai-settings-dialog[open]");
    const dlg = await p.innerText("#ai-settings-dialog");
    assert.match(dlg, /quem administra/);
    assert.match(dlg, /A IA está configurada/);
    assert.equal(await p.locator("#ai-settings-dialog input, #ai-settings-dialog select").count(), 0, "nada para preencher");
    assert.deepEqual(vazou(await p.content()), [], "nada da configuração na página");
    assert.deepEqual(errors, []);
  } finally {
    process.env.SAGADECK_LLM_URL = keepUrl;
    fs.rmSync(process.env.SAGADECK_IA, { force: true });
    await browser.close(); await studio.close(); await llm.close();
  }
});

// "Conheça o SagaDeck": quem abre a biblioteca acha, na lateral, a apresentação com tudo o que dá para fazer (um
// slide por recurso, cada um dizendo como pedir à IA). Abre em prévia: navegar não cria arquivo na biblioteca.
test("Conheça o SagaDeck: a lateral da biblioteca abre a apresentação de recursos em prévia, sem criar arquivo", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click('#side [data-tour]');
    await p.waitForURL(/editor\?model=conheca/, { timeout: 30000 });
    await p.waitForSelector('.thumb-card[data-idx="60"]', { timeout: 30000 });
    assert.ok(await p.isVisible("#preview-banner"), "abre em prévia");
    assert.match(await p.textContent("#rendered-slide-container"), /Conheça o SagaDeck/);
    await p.click('.thumb-card[data-idx="2"]');
    await p.waitForTimeout(800);
    const lib = await (await fetch(studio.url + "/api/library")).json();
    assert.equal(lib.decks.length, 0, "abrir e navegar não cria apresentação");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); }
});
