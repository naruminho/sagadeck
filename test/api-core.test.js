// Núcleo do slide "api": caminhos JSON, variáveis, ambientes e o código gerado (curl / Python).
import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/runtime/api-core.js";

const C = globalThis.SagadeckApiCore;

test("caminhos JSON: ler e escrever ($.a.b[0], aspas, sem $)", () => {
  const o = { choices: [{ message: { content: "oi" } }], "com espaço": { x: 1 } };
  assert.equal(C.get(o, "$.choices[0].message.content"), "oi");
  assert.equal(C.get(o, "choices[0].message.content"), "oi");
  assert.equal(C.get(o, "$['com espaço'].x"), 1);
  assert.equal(C.get(o, "$.nada[3].x"), undefined);
  assert.deepEqual(C.get(o, "$"), o);
  const b = {};
  C.set(b, "$.messages[0].content", "pergunta");
  assert.deepEqual(b, { messages: [{ content: "pergunta" }] });
});

test("variáveis {{nome}} em URL, cabeçalhos e corpo; as que faltam são apontadas", () => {
  const req = { url: "{{base}}/workflows/{{wf}}", headers: { "X-App": "{{app}}" }, body: { q: "{{pergunta}}", n: 3 } };
  const vars = { base: "https://api.exemplo", wf: "resumo", pergunta: "o que é RAG?" };
  assert.deepEqual(C.render(req, vars), { url: "https://api.exemplo/workflows/resumo", headers: { "X-App": "{{app}}" }, body: { q: "o que é RAG?", n: 3 } });
  assert.deepEqual(C.missing(req, vars), ["app"]);
});

test("ambientes pelo nome: dev, hom, prod (e o resto)", () => {
  assert.deepEqual(["dev", "desenvolvimento", "hom", "HML", "homologacao", "prod", "producao", "PRD", "lab"].map(C.envKind),
    ["dev", "dev", "hom", "hom", "hom", "prod", "prod", "prod", "other"]);
  assert.equal(C.mask("eyJhbGciOiJIUzI1NiJ9.segredo.assinaturaX9Qa"), "••••X9Qa");
  assert.equal(C.mask("curto"), "••••");
});

test("padrões do slide: método pelo corpo, auth ligado, status de polling comuns", () => {
  const a = C.normalize({ request: { url: "x", body: { a: 1 } }, mode: "polling" });
  assert.equal(a.request.method, "POST");
  assert.equal(a.request.auth, true);
  assert.ok(a.polling.done.includes("FINISHED") && a.polling.failed.includes("ERROR"));
  assert.equal(C.normalize({ request: { url: "x" } }).request.method, "GET");
  assert.equal(C.key({ id: "meu-slide" }), "meu-slide");
  assert.equal(C.key({ title: "A", request: { url: "u" } }), C.key({ title: "A", request: { url: "u" } }));
  assert.notEqual(C.key({ title: "A", request: { url: "u" } }), C.key({ title: "B", request: { url: "u" } }));
});

const SYNC = { request: { method: "POST", url: "{{base}}/llm/chat", body: { messages: [{ role: "user", content: "Oi" }], stream: false, temperature: null } }, answer: "$.choices[0].message.content" };
const POLL = {
  mode: "polling",
  request: { url: "{{base}}/start", body: { workflow: "resumo-it's" } },
  polling: { id: "$.executionId", check: { url: "{{base}}/status/{{id}}" }, status: "$.data.status", done: ["FINISHED"], failed: ["ERROR"], interval: 2 },
  steps: "$.data.responses", stepText: "$.output",
};

test("curl: token por variável de ambiente, JSON no -d, aspas simples escapadas", () => {
  const { code } = C.code(SYNC, "curl", { base: "https://api.x" });
  assert.match(code, /^curl -s -X POST "https:\/\/api\.x\/llm\/chat"/);
  assert.match(code, /-H "Authorization: Bearer \$API_TOKEN"/);
  assert.match(code, /-H "Content-Type: application\/json"/);
  assert.match(code, /-d '\{\n {2}"messages"/);
  const poll = C.code(POLL, "curl", { base: "https://api.x" }).code;
  assert.match(poll, /resumo-it'\\''s/, "aspas simples dentro do -d");
  assert.match(poll, /"https:\/\/api\.x\/status\/\$ID"/);
  assert.doesNotMatch(C.code({ request: { url: "u", auth: false } }, "curl").code, /Authorization/);
});

test("Python síncrono: requests, token de os.environ, corpo como dicionário Python, campo da resposta", () => {
  const { code, marks } = C.code(SYNC, "python", { base: "https://api.x" });
  assert.match(code, /import requests/);
  assert.match(code, /TOKEN = os\.environ\["API_TOKEN"\]/);
  assert.match(code, /"Authorization": f"Bearer \{TOKEN\}"/);
  assert.match(code, /json=\{\n\s+"messages": \[/);
  assert.match(code, /"stream": False,\n\s+"temperature": None,/, "True/False/None do Python");
  assert.match(code, /print\(dados\["choices"\]\[0\]\["message"\]\["content"\]\)/);
  assert.ok(marks.start.length && marks.done.length);
  assert.doesNotMatch(code, /^#/m, "sem comentários na versão enxuta");
});

test("Python com polling: laço while com status, fim, erro e pausa; as linhas de cada fase são marcadas", () => {
  const { code, marks } = C.code(POLL, "python", { base: "https://api.x" });
  const lines = code.split("\n");
  assert.match(code, /execucao = inicio\.json\(\)\["executionId"\]/);
  assert.match(code, /r = requests\.get\(f"https:\/\/api\.x\/status\/\{execucao\}", headers=HEADERS, timeout=60\)/);
  assert.match(code, /status = dados\["data"\]\["status"\]/);
  assert.match(code, /if status in \("FINISHED",\):\n\s+break/);
  assert.match(code, /if status in \("ERROR",\):/);
  assert.match(code, /time\.sleep\(2\)/);
  assert.match(code, /for etapa in dados\["data"\]\["responses"\]:\n\s+print\(etapa\["output"\]\)/);
  assert.match(lines[marks.poll[0] - 1], /^while True:/, "a marca de polling começa no while");
  assert.ok(marks.start.every((n) => n < marks.poll[0]) && marks.done.every((n) => n > marks.poll.at(-1)));
});

test("Python comentado: explica cada passo em português, e as marcas acompanham os comentários", () => {
  const plain = C.code(POLL, "python", {}).code;
  const { code, marks, comments } = C.code(POLL, "python-comentado", {});
  assert.match(code, /# 2\. consulta o andamento até terminar \(polling\)/);
  assert.match(code, /# o token de acesso vem de uma variável de ambiente/);
  assert.ok(comments.length >= 8);
  assert.equal(code.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"), plain, "o código em si é o mesmo");
  assert.match(code.split("\n")[marks.poll[0] - 1], /^# 2\./, "o comentário acende junto com a fase");
});

test("Python com streaming: iter_lines, data:, [DONE] e o caminho do texto", () => {
  const { code } = C.code({ mode: "stream", request: { url: "u", body: { stream: true } }, stream: { text: "$.choices[0].delta.content" } }, "python", {});
  assert.match(code, /with requests\.post\(\n[\s\S]*stream=True,[\s\S]*\) as r:/);
  assert.match(code, /if dado == "\[DONE\]":/);
  assert.match(code, /pedaco = json\.loads\(dado\)\["choices"\]\[0\]\["delta"\]\["content"\]/);
  assert.match(C.code({ mode: "stream", request: { url: "u", body: {} } }, "curl").code, /^curl -sN/);
});

test("comentários dentro do laço ficam na mesma indentação do código", () => {
  const { code } = C.code(POLL, "python-comentado", {});
  assert.match(code, /\n {4}# o status atual da execução\n {4}status = /);
  assert.doesNotMatch(code, /^#\s{2,}/m);
  assert.match(code, /# requests faz as chamadas HTTP[^\n]*\nimport requests/);
});

test("upload (form com @file): curl -F e Python files=; o nome do arquivo vem do slide", () => {
  const s = { title: "FileManager", file: "docs/contrato.pdf", request: { url: "{{base}}/upload", form: { file: "@file", pasta: "workshop" } }, save: { path_id: "$.path_id" } };
  assert.equal(C.normalize(s).request.method, "POST");
  assert.ok(C.usesFile(s));
  const curl = C.code(s, "curl", { base: "https://x" }).code;
  assert.match(curl, /-F "file=@contrato\.pdf"/);
  assert.match(curl, /-F "pasta=workshop"/);
  assert.doesNotMatch(curl, /Content-Type: application\/json/);
  const py = C.code(s, "python", { base: "https://x" }).code;
  assert.match(py, /files=\{"file": open\("contrato\.pdf", "rb"\)\}/);
  assert.match(py, /data=\{"pasta": "workshop"\}/);
});

test("{{file.base64}} no JSON: nunca despeja o conteúdo; Python lê e codifica o arquivo", () => {
  const s = { file: "nota.png", request: { url: "u", body: { content: "{{file.base64}}", name: "{{file.name}}" } } };
  assert.ok(C.usesFile(s));
  const py = C.code(s, "python", {}).code;
  assert.match(py, /import base64/);
  assert.match(py, /CONTEUDO = base64\.b64encode\(open\("nota\.png", "rb"\)\.read\(\)\)\.decode\(\)/);
  assert.match(py, /"content": CONTEUDO,\n\s+"name": "nota\.png",/);
  const curl = C.code(s, "curl", {}).code;
  assert.match(curl, /# o arquivo vai dentro do JSON, em base64 \(gere com: base64 -w0 nota\.png\)/);
  assert.match(curl, /"content": "<nota\.png em base64>"/);
  assert.ok(!C.usesFile({ request: { url: "u", body: { a: 1 } } }));
});

test("{{secret.x}}: o valor nunca aparece no código — $X no curl (fora das aspas simples), os.environ no Python", () => {
  const s = { request: { method: "POST", url: "{{base}}/identity", auth: false, headers: { "X-Chave": "{{secret.api_key}}" }, body: { client_id: "abc", client_secret: "{{secret.client_secret}}" } } };
  const curl = C.code(s, "curl", { base: "https://x" }).code;
  assert.match(curl, /"client_secret": "'"\$CLIENT_SECRET"'"/, "fecha a aspa simples para o shell expandir");
  assert.match(curl, /-H "X-Chave: \$API_KEY"/);
  const py = C.code(s, "python", { base: "https://x" }).code;
  assert.match(py, /"client_secret": os\.environ\["CLIENT_SECRET"\],/);
});
