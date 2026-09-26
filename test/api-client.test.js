// Executor do slide "api" (Node): ambientes, token que expira, máscara, erros compreensíveis, gravações.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiEnvironments, readRecordings, writeRecording, recordingsFile } from "../src/api-client.js";
import { startMockApi, envFileFor } from "./mock-api.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-api-"));

async function setup(extra, mockOpts) {
  const mock = await startMockApi(mockOpts);
  const file = path.join(tmp(), "ambientes.yaml");
  fs.writeFileSync(file, `# meus ambientes (comentário que tem que sobreviver)\n${envFileFor(mock, extra)}`);
  return { mock, file, api: new ApiEnvironments(file) };
}

test("sem arquivo de ambientes: estado vazio e erro que diz o que criar", async () => {
  const api = new ApiEnvironments(path.join(tmp(), "nao-existe.yaml"));
  const st = api.state();
  assert.equal(st.exists, false);
  assert.deepEqual(st.envs, []);
  await assert.rejects(api.send({ url: "http://x" }), /Nenhum ambiente configurado\. Crie .*nao-existe\.yaml/);
});

test("ambientes do arquivo: dev e hom com cores; escolher um guarda no arquivo sem perder comentários", async () => {
  const { mock, file, api } = await setup();
  try {
    const st = api.state();
    assert.equal(st.current, "hom");
    assert.deepEqual(st.envs.map((e) => [e.name, e.kind, e.token]), [["dev", "dev", true], ["hom", "hom", true]]);
    assert.equal(st.envs[1].vars.wf, "resumo");
    api.use("dev");
    assert.equal(api.state().current, "dev");
    const txt = fs.readFileSync(file, "utf8");
    assert.match(txt, /^current: dev/m);
    assert.match(txt, /comentário que tem que sobreviver/);
    assert.throws(() => api.use("prod"), /não existe/);
  } finally { await mock.close(); }
});

test("pedido síncrono: token obtido sozinho e reaproveitado; JSON de volta; token nunca exposto", async () => {
  const { mock, api } = await setup();
  try {
    const r = await api.send({ method: "POST", url: `${mock.url}/v1/sync`, body: { messages: [{ role: "user", content: "oi" }] } });
    assert.equal(r.status, 200);
    assert.equal(r.body.choices[0].message.content, "eco: oi");
    assert.match(r.sent.headers.Authorization, /^Bearer ••••\w{4}$/, "o cabeçalho enviado aparece mascarado");
    assert.equal(r.sent.headers["Content-Type"], "application/json");
    assert.ok(r.ms >= 0 && r.size > 0);
    await api.send({ method: "POST", url: `${mock.url}/v1/sync`, body: {} });
    assert.equal(mock.state.tokensIssued, 1, "o token é reaproveitado até perto de vencer");
    assert.ok(api.tokenInfo("hom").expiresIn > 1700);
    const leak = await api.send({ url: `${mock.url}/v1/vaza` });
    assert.doesNotMatch(JSON.stringify(leak), /tok-1-/, "o token não aparece nem se o serviço devolver ele");
    assert.match(leak.body.debug, /seu token é ••••/);
  } finally { await mock.close(); }
});

test("token vencido no meio da apresentação: renova e repete o pedido uma vez", async () => {
  const { mock, api } = await setup();
  try {
    await api.send({ url: `${mock.url}/v1/headers` });
    mock.expireTokens();
    const r = await api.send({ url: `${mock.url}/v1/headers` });
    assert.equal(r.status, 200);
    assert.equal(mock.state.tokensIssued, 2);
  } finally { await mock.close(); }
});

test("auth: false não manda token; credencial errada vira mensagem clara", async () => {
  const { mock, api } = await setup(`  errado:\n    vars: {}\n    token: { url: "URL/token", client_id: "x", client_secret: "y" }\n`.replace("URL", "http://127.0.0.1:1"));
  try {
    const r = await api.send({ url: `${mock.url}/v1/headers`, auth: false });
    assert.equal(r.status, 401);
    assert.equal(mock.state.tokensIssued, 0);
    const bad = new ApiEnvironments(api.file);
    fs.writeFileSync(api.file, envFileFor({ ...mock, clientSecret: "senha-errada-999" }));
    await assert.rejects(bad.send({ url: `${mock.url}/v1/sync` }), (e) => e.kind === "token" && /HTTP 401/.test(e.message) && !/senha-errada-999/.test(e.message));
  } finally { await mock.close(); }
});

test("sem VPN / serviço fora do ar: erro 'offline' que sugere a VPN", async () => {
  const api = new ApiEnvironments(path.join(tmp(), "a.yaml"));
  fs.writeFileSync(api.file, `environments:\n  dev:\n    vars: {}\n`);
  await assert.rejects(api.send({ url: "http://127.0.0.1:1/x", auth: false }), (e) => e.kind === "offline" && /VPN/.test(e.message));
  await assert.rejects(api.send({ url: "ftp://x/y", auth: false }), /Só http e https/);
});

test("streaming: a resposta chega aberta, em pedaços", async () => {
  const { mock, api } = await setup();
  try {
    const { res } = await api.open({ method: "POST", url: `${mock.url}/v1/stream`, body: { stream: true } });
    let chunks = 0, text = "";
    for await (const c of res) { chunks++; text += c; }
    assert.ok(chunks >= 3, `chegou em ${chunks} pedaços`);
    assert.match(text, /data: \[DONE\]/);
  } finally { await mock.close(); }
});

test("gravações ficam ao lado do deck (<deck>.respostas.json)", () => {
  const deck = path.join(tmp(), "Aula.yaml");
  assert.equal(recordingsFile(deck), deck.replace(".yaml", ".respostas.json"));
  writeRecording(deck, "s1", { env: "hom", mode: "sync", result: { status: 200 } });
  const r = readRecordings(deck);
  assert.equal(r.s1.env, "hom");
  assert.ok(Date.parse(r.s1.at));
  assert.deepEqual(readRecordings(path.join(tmp(), "outro.yaml")), {});
});

test("slide do Identity (captureToken): o token gerado passa a ser o do ambiente; a tela recebe só o JWT decodificado", async () => {
  const { mock, api } = await setup();
  try {
    const r = await api.send({ method: "POST", url: `${mock.url}/identity`, auth: false, body: { client_id: mock.clientId, client_secret: mock.clientSecret }, captureToken: "$.data.token" });
    assert.equal(r.status, 200);
    assert.equal(r.jwt.isJwt, true);
    assert.equal(r.jwt.payload.scope, "llm ocr");
    assert.ok(r.jwt.exp > Date.now() / 1000);
    assert.match(r.body.data.token, /^••••XyZw$/, "o token volta mascarado");
    assert.doesNotMatch(JSON.stringify(r), /assinatura1/);
    const next = await api.send({ url: `${mock.url}/v1/headers` });
    assert.equal(next.status, 200);
    assert.match(next.sent.headers.Authorization, /••••XyZw$/, "o slide seguinte usa o token do Identity (mesmo final)");
    assert.equal(mock.state.tokensIssued, 1, "não pediu outro token");
    assert.equal(api.tokenInfo("hom").fromSlide, true);
  } finally { await mock.close(); }
});

test("arquivo: upload multipart devolve path_id; o OCR aceita path_id ou base64", async () => {
  const { mock, api } = await setup();
  try {
    const file = { name: "contrato.txt", type: "text/plain", data: Buffer.from("cláusula 1: prazo de 30 dias") };
    const up = await api.send({ url: `${mock.url}/v1/upload`, form: { file: "@file", pasta: "workshop" }, file });
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(up.body.path_id, "store/contrato.txt");
    assert.deepEqual(up.sent.file, { name: "contrato.txt", type: "text/plain", size: file.data.length });
    const byId = await api.send({ url: `${mock.url}/v1/ocr`, body: { path_id: up.body.path_id } });
    assert.equal(byId.body.text, "lido: cláusula 1: prazo de 30 dias");
    const b64 = await api.send({ url: `${mock.url}/v1/ocr`, body: { content: "{{file.base64}}", nome: "{{file.name}}" }, file });
    assert.equal(b64.body.via, "base64");
    assert.equal(b64.body.text, "lido: cláusula 1: prazo de 30 dias");
    await assert.rejects(api.send({ url: `${mock.url}/v1/upload`, form: { file: "@file" } }), /precisa de um arquivo/);
  } finally { await mock.close(); }
});

test("{{secret.x}}: o Studio troca pelo valor na hora de enviar; nada volta para a tela; segredo que falta é explicado", async () => {
  const { mock, api } = await setup(`  lab:\n    vars: {}\n    secrets: { client_secret: "${"segredo-teste-123"}", do_ambiente: { env: SAGADECK_TESTE_SEGREDO } }\n`);
  try {
    process.env.SAGADECK_TESTE_SEGREDO = "valor-da-variavel-777";
    api.use("lab");
    const r = await api.send({ method: "POST", url: `${mock.url}/identity`, auth: false, headers: { "X-Extra": "{{secret.do_ambiente}}" }, body: { client_id: mock.clientId, client_secret: "{{secret.client_secret}}" }, captureToken: "$.data.token" });
    assert.equal(r.status, 200, "o serviço recebeu o segredo de verdade");
    const got = mock.state.requests.find((x) => x.path === "/identity");
    assert.equal(got.headers["x-extra"], "valor-da-variavel-777");
    assert.doesNotMatch(JSON.stringify(r), /segredo-teste-123|valor-da-variavel-777/);
    await assert.rejects(api.send({ url: `${mock.url}/v1/sync`, body: { k: "{{secret.nao_tem}}" } }), /não tem nao_tem em secrets/);
  } finally { delete process.env.SAGADECK_TESTE_SEGREDO; await mock.close(); }
});
