// Slide "api" de ponta a ponta: o Studio executa contra uma API de mentira e a apresentação (Chrome)
// mostra token, polling, streaming, upload encadeado, troca de ambiente e a gravação no HTML exportado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio } from "./helpers.js";
import { startMockApi, envFileFor } from "./mock-api.js";
import { buildHTML, loadSpec } from "../src/build.js";

const DECK = (mock) => ({
  title: "Workshop de APIs",
  theme: "sinal",
  slides: [
    { layout: "api", id: "identity", title: "Identity: o token", request: { method: "POST", url: "{{base}}/../identity", auth: false, body: { client_id: mock.clientId, client_secret: mock.clientSecret } }, token: "$.data.token" },
    { layout: "api", id: "llm", title: "LLM síncrono", request: { method: "POST", url: "{{base}}/sync", body: { messages: [{ role: "user", content: "o que é RAG?" }] } }, answer: "$.choices[0].message.content", save: { resposta_id: "$.id" } },
    { layout: "api", id: "wf", title: "Workflow com polling", mode: "polling", tab: "python",
      request: { url: "{{base}}/start", body: { workflow: "{{wf}}" } },
      polling: { id: "$.executionId", check: { url: "{{base}}/status/{{id}}" }, status: "$.status", done: ["FINISHED"], failed: ["ERROR"], interval: 0.2 },
      steps: "$.responses", stepText: "$.output" },
    { layout: "api", id: "stream", title: "Streaming", mode: "stream", request: { method: "POST", url: "{{base}}/stream", body: { stream: true } } },
    { layout: "api", id: "upload", title: "FileManager", file: "contrato.txt", request: { url: "{{base}}/upload", form: { file: "@file", pasta: "workshop" } }, save: { path_id: "$.path_id" } },
    { layout: "api", id: "ocr", title: "OCR pelo path_id", request: { url: "{{base}}/ocr", body: { path_id: "{{path_id}}" } }, answer: "$.text" },
    { layout: "api", id: "fora", title: "Serviço fora do ar", request: { url: "http://127.0.0.1:1/x", auth: false } },
    { layout: "api", id: "emb", title: "Embeddings", request: { url: "{{base}}/embeddings", body: { model: "emb", input: "{{text}}" } },
      similarity: { reference: "Quero abrir uma conta no banco", texts: ["Vai chover amanhã em São Paulo?", "Como faço para abrir uma conta?"] } },
    { layout: "api", id: "idx", title: "Indexar Excel linha a linha", request: { url: "{{base}}/sync", body: { mode: "rows", sheet: { name: "Plan1", header_row: 1 } } },
      fields: { "$.mode": "rows = cada linha vira um documento", "$.sheet.header_row": "linha do cabeçalho (começa em 1)", "$.sheet.nao_tem": "não enviado" } },
  ],
});

async function setup() {
  const mock = await startMockApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-apiui-"));
  const deckFile = path.join(dir, "workshop.yaml");
  fs.writeFileSync(deckFile, YAML.stringify(DECK(mock)));
  fs.writeFileSync(path.join(dir, "contrato.txt"), "cláusula 7: multa de 2%");
  fs.writeFileSync(process.env.SAGADECK_AMBIENTES, envFileFor(mock));
  const studio = await startStudio(deckFile);
  return { mock, dir, deckFile, studio };
}

test("slide API ao vivo na apresentação", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const { mock, dir, deckFile, studio } = await setup();
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/preview`, { width: 1920, height: 1080 });
    const go = async (i) => { await p.evaluate((n) => window.sagadeck.goto(n, 0), i); return `.slide[data-idx="${i}"]`; };
    const run = async (sel) => { await p.click(`${sel} [data-api-run]`); await p.waitForFunction((s) => !document.querySelector(`${s} .L-api`).classList.contains("running"), sel, { timeout: 20000 }); };
    const txt = (sel) => p.innerText(sel);

    await t.test("o ambiente aparece (HOM) e o código já vem com as variáveis resolvidas", async () => {
      await p.waitForFunction(() => window.sagadeckApi && window.sagadeckApi.state.live);
      const s = await go(1);
      assert.equal((await txt(`${s} .api-env-name`)).trim(), "HOM");
      await p.click(`${s} [data-tab="curl"]`);
      assert.match(await txt(`${s} [data-pane="curl"]`), new RegExp(`${mock.url.replace(/[.:/]/g, "\\$&")}/v1/sync`));
      assert.match(await txt(`${s} [data-pane="curl"]`), /Bearer \$API_TOKEN/);
    });

    await t.test("Identity: gera o JWT, mostra o conteúdo decodificado e a contagem; o token nunca aparece", async () => {
      const s = await go(0);
      await run(s);
      const out = await txt(`${s} .api-res`);
      assert.match(out, /token JWT gerado/i);
      assert.match(out, /llm ocr/);
      assert.match(out, /expira em (29|30):/);
      assert.doesNotMatch(await p.content(), /assinatura1XyZw/, "o token não está em lugar nenhum da página");
    });

    await t.test("LLM: usa o token do Identity (não pede outro) e destaca a resposta", async () => {
      const s = await go(1);
      await run(s);
      assert.match(await txt(`${s} .api-answer`), /eco: o que é RAG\?/);
      assert.match(await txt(`${s} .api-status`), /200/);
      assert.equal(mock.state.tokensIssued, 1, "só o token do Identity");
      assert.match(await txt(`${s} .api-saved`), /\{\{resposta_id\}\} = r1/);
    });

    await t.test("polling: linha do tempo STARTED → RUNNING → FINISHED, cartões das etapas e o código acendendo", async () => {
      const s = await go(2);
      const seenRun = p.waitForFunction((sel) => !!document.querySelector(`${sel} [data-pane="python"] .cl.run`) && /while True/.test(document.querySelector(`${sel} [data-pane="python"] .cl.run`).textContent), s, { timeout: 15000 });
      await p.click(`${s} [data-api-run]`);
      await seenRun; // durante as consultas, o laço while está aceso
      await p.waitForFunction((sel) => !document.querySelector(`${sel} .L-api`).classList.contains("running"), s, { timeout: 20000 });
      const rows = await p.$$eval(`${s} .api-tl-s`, (els) => els.map((e) => e.textContent));
      assert.deepEqual(rows, ["início", "STARTED", "RUNNING", "RUNNING", "FINISHED"]);
      const steps = await p.$$eval(`${s} .api-step-t`, (els) => els.map((e) => e.textContent));
      assert.deepEqual(steps, ["ocr", "llm"]);
      assert.match(await txt(`${s} .api-steps`), /resumo em 3 linhas/);
      assert.match(await txt(`${s} .api-status`), /4 consultas/);
    });

    await t.test("streaming: o texto chega em pedaços", async () => {
      const s = await go(3);
      await run(s);
      assert.equal((await txt(`${s} .api-stream`)).trim(), "Olá, isto chegou aos poucos.");
      assert.match(await txt(`${s} .api-status`), /6 pedaços/);
    });

    await t.test("upload do arquivo padrão devolve o path_id, e o OCR do slide seguinte usa ele", async () => {
      let s = await go(4);
      assert.match(await txt(`${s} .api-file-name`), /contrato\.txt/);
      await p.click(`${s} [data-tab="python"]`);
      assert.match(await txt(`${s} [data-pane="python"]`), /files=\{"file": open\("contrato\.txt", "rb"\)\}/);
      await run(s);
      assert.match(await txt(`${s} .api-saved`), /\{\{path_id\}\} = store\/contrato\.txt/);
      s = await go(5);
      assert.match(await p.inputValue(`${s} [data-api-body]`), /\{\{path_id\}\}/, "o slide mostra a variável");
      await p.click(`${s} [data-tab="curl"]`);
      assert.match(await txt(`${s} [data-pane="curl"]`), /"path_id": "store\/contrato\.txt"/, "o código já mostra o valor guardado");
      await run(s);
      assert.match(await txt(`${s} .api-answer`), /lido: cláusula 7: multa de 2%/);
    });

    await t.test("arquivo trocado na hora (arrastado/escolhido) vai no lugar do padrão", async () => {
      const s = await go(4);
      const other = path.join(dir, "outro.txt");
      fs.writeFileSync(other, "outro conteúdo");
      await p.setInputFiles(`${s} [data-api-input]`, other);
      await p.waitForFunction((sel) => document.querySelector(`${sel} .api-file-name`).textContent === "outro.txt", s);
      await run(s);
      assert.match(await txt(`${s} .api-saved`), /store\/outro\.txt/);
    });

    await t.test("embeddings: vetor em faixa colorida e similaridade por cosseno, a mais parecida em destaque", async () => {
      const s = await go(7);
      assert.equal(await p.getAttribute(`${s} [data-tab="texts"]`, "aria-selected"), "true", "abre na aba Frases");
      await p.click(`${s} [data-tab="python"]`);
      assert.match(await txt(`${s} [data-pane="python"]`), /def cosseno\(a, b\):/);
      await p.click(`${s} [data-tab="texts"]`);
      await p.fill(`${s} [data-api-texts]`, "Vai chover amanhã em São Paulo?\nComo faço para abrir uma conta?\nAbrir conta no banco hoje");
      await run(s);
      assert.equal(await p.$$eval(`${s} .api-vec i`, (els) => els.length), 48);
      assert.match(await txt(`${s} .api-sim-ref`), /vetor com 64 números/i);
      const rows = await p.$$eval(`${s} .api-sim-row`, (els) => els.map((e) => [e.querySelector(".api-sim-t").textContent, +e.dataset.score, e.classList.contains("win")]));
      assert.equal(rows.length, 3);
      assert.ok(rows[0][1] >= rows[1][1] && rows[1][1] >= rows[2][1], "ordenado da mais parecida para a menos");
      assert.match(rows[0][0], /conta/);
      assert.equal(rows[0][2], true, "a vencedora fica em destaque");
      assert.match(rows[2][0], /chover/);
      assert.match(await txt(`${s} .api-status`), /4 embeddings/);
    });

    await t.test("parâmetros: a tabela explica cada campo e acompanha o corpo editado", async () => {
      const s = await go(8);
      await p.click(`${s} [data-tab="fields"]`);
      const rows = await p.$$eval(`${s} [data-field]`, (els) => els.map((e) => [...e.querySelectorAll("td")].map((td) => td.textContent)));
      assert.deepEqual(rows[0], ["mode", '"rows"', "rows = cada linha vira um documento"]);
      assert.deepEqual(rows[1], ["sheet.header_row", "1", "linha do cabeçalho (começa em 1)"]);
      assert.equal(rows[2][1], "—");
      await p.click(`${s} [data-tab="body"]`);
      await p.fill(`${s} [data-api-body]`, JSON.stringify({ mode: "pdf", sheet: { header_row: 2 } }));
      await p.click(`${s} [data-tab="fields"]`);
      assert.equal(await txt(`${s} [data-field="$.sheet.header_row"] .api-fv`), "2");
    });

    await t.test("serviço fora do ar: mensagem que fala da VPN", async () => {
      const s = await go(6);
      await run(s);
      assert.match(await txt(`${s} .api-error`), /Sem conexão.*VPN/s);
    });

    await t.test("editar o corpo na hora vale para a execução; digitar não troca de slide", async () => {
      const s = await go(1);
      await p.click(`${s} [data-tab="body"]`);
      await p.fill(`${s} [data-api-body]`, JSON.stringify({ messages: [{ role: "user", content: "pergunta da plateia" }] }, null, 2));
      await p.type(`${s} [data-api-url]`, "");
      await p.focus(`${s} [data-api-body]`);
      await p.keyboard.press("ArrowRight");
      assert.equal(await p.evaluate(() => window.sagadeck.cur), 1);
      await run(s);
      assert.match(await txt(`${s} .api-answer`), /eco: pergunta da plateia/);
    });

    await t.test("trocar de ambiente pelo selo: DEV", async () => {
      const s = await go(1);
      await p.click(`${s} [data-api-env]`);
      await p.click(`${s} .api-menu [data-env="dev"]`);
      await p.waitForFunction((sel) => document.querySelector(`${sel} .api-env-name`).textContent === "DEV", s);
      assert.match(fs.readFileSync(process.env.SAGADECK_AMBIENTES, "utf8"), /^current: dev/m);
    });

    await t.test("as respostas boas ficam gravadas ao lado do deck", () => {
      const rec = JSON.parse(fs.readFileSync(deckFile.replace(".yaml", ".respostas.json"), "utf8"));
      assert.ok(rec.llm && rec.wf && rec.stream && rec.upload && rec.ocr && rec.emb, Object.keys(rec).join(","));
      assert.equal(rec.emb.sim.items.length, 3);
      assert.equal(rec.wf.polls.length, 4);
      assert.doesNotMatch(JSON.stringify(rec), /tok-\d|assinatura\dXyZw/, "nenhum token na gravação");
      assert.ok(!rec.fora, "falha não é gravada");
    });

    await t.test("sem erros de JavaScript (fora os pedidos que falham de propósito)", () => {
      assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
    });

    await t.test("HTML exportado (sem Studio) reproduz a gravação", async () => {
      const html = buildHTML(loadSpec(deckFile)).html;
      const file = path.join(dir, "workshop.html");
      fs.writeFileSync(file, html);
      const { page: q, errors: e2 } = await newPage(browser, "file:///" + file.replace(/\\/g, "/"), { width: 1920, height: 1080 });
      await q.evaluate(() => window.sagadeck.goto(2, 0));
      const s = `.slide[data-idx="2"]`;
      await q.waitForSelector(`${s} .api-rec`);
      assert.match(await q.innerText(`${s} .api-rec`), /gravado/i);
      assert.match(await q.innerText(`${s} [data-api-run]`), /Reproduzir gravação/);
      assert.deepEqual(await q.$$eval(`${s} .api-step-t`, (els) => els.map((x) => x.textContent)), ["ocr", "llm"]);
      await q.click(`${s} [data-api-run]`);
      await q.waitForFunction((sel) => document.querySelectorAll(`${sel} .api-tl`).length === 5, s, { timeout: 10000 });
      assert.deepEqual(e2, []);
    });
  } finally {
    await browser.close();
    await studio.close();
    await mock.close();
  }
});

test("segurança: só a própria página, só nesta máquina, nada no multiusuário", async () => {
  const mock = await startMockApi();
  fs.writeFileSync(process.env.SAGADECK_AMBIENTES, envFileFor(mock));
  const studio = await startStudio(null);
  const multi = await startStudio(null, { multiuser: true });
  try {
    const send = (base, headers = {}) => fetch(`${base}/api/http/send`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ request: { url: `${mock.url}/v1/headers` } }) });
    assert.equal((await send(studio.url)).status, 200, "a própria página executa");
    assert.equal((await send(studio.url, { Origin: "https://site-malicioso.exemplo" })).status, 403, "outro site: bloqueado");
    assert.equal((await send(studio.url, { Origin: "null" })).status, 403, "HTML aberto do disco: bloqueado");
    const port = new URL(studio.url).port;
    assert.equal((await send(studio.url, { Host: `malicioso.exemplo:${port}`, Origin: `http://malicioso.exemplo:${port}` })).status, 403, "DNS rebinding: bloqueado");
    const plain = await fetch(`${studio.url}/api/http/send`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    assert.equal(plain.status, 415, "formulário comum de outro site não passa");
    const st = await (await fetch(`${multi.url}/api/http/state`, { headers: { "X-Sagadeck-User": "ana" } })).json();
    assert.equal(st.live, false);
    assert.deepEqual(st.envs, [], "no servidor, nem os ambientes aparecem");
    assert.equal((await send(multi.url, { "X-Sagadeck-User": "ana" })).status, 403);
    assert.ok(mock.state.requests.filter((r) => r.path === "/v1/headers").length === 1, "só o pedido legítimo chegou na API");
  } finally {
    await studio.close();
    await multi.close();
    await mock.close();
  }
});

test("controle flutuante: janelinha por cima com ambiente, Executar e o resultado; ← → passam os slides", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const mock = await startMockApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-pip-"));
  const deckFile = path.join(dir, "pip.yaml");
  fs.writeFileSync(process.env.SAGADECK_AMBIENTES, envFileFor(mock));
  fs.writeFileSync(deckFile, YAML.stringify({ title: "PiP", slides: [
    { layout: "api", title: "LLM", request: { method: "POST", url: "{{base}}/sync", body: { messages: [{ role: "user", content: "oi" }] } }, answer: "$.choices[0].message.content" },
    { layout: "statement", text: "Sem requisição aqui" },
  ] }));
  const studio = await startStudio(deckFile);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/preview`, { width: 1920, height: 1080 });
    await p.waitForFunction(() => window.sagadeckApi && window.sagadeckApi.state.live);
    const hasPip = await p.evaluate(() => "documentPictureInPicture" in window);
    if (!hasPip) return t.skip("este Chrome não tem Document Picture-in-Picture");
    await p.click('.slide[data-idx="0"] [data-api-pip]');
    await p.waitForFunction(() => window.sagadeckApi.pip && window.sagadeckApi.pip.document.querySelector(".pip-run"));
    const pip = (sel) => p.evaluate((s) => { const e = window.sagadeckApi.pip.document.querySelector(s); return e ? e.textContent : null; }, sel);
    assert.equal((await pip(".pip-env")).trim(), "HOM");
    assert.equal((await pip(".pip-top b")).trim(), "LLM");
    await p.evaluate(() => window.sagadeckApi.pip.document.querySelector(".pip-run").click());
    await p.waitForFunction(() => /eco: oi/.test(window.sagadeckApi.pip.document.querySelector(".pip-out")?.textContent || ""), null, { timeout: 10000 });
    assert.match(await p.innerText('.slide[data-idx="0"] .api-answer'), /eco: oi/, "executou no slide de verdade");
    assert.match(await pip(".pip-status"), /200/);
    await p.evaluate(() => window.sagadeckApi.pip.document.querySelector('[data-go="1"]').click());
    await p.waitForFunction(() => window.sagadeck.cur === 1);
    await p.waitForFunction(() => /não tem requisição/.test(window.sagadeckApi.pip.document.body.textContent));
    assert.match(await pip(".pip-nav span"), /2 \/ 2/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
    await mock.close();
  }
});
