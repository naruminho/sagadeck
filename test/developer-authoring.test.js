import { test } from "node:test";
import assert from "node:assert/strict";
import "./isolate.js";
import "../src/studio/public/developer-authoring.js";

const { parseCurl, makeSlide, selectionLines, inferLanguage, normalizeLanguage } = globalThis.SagaDeveloperAuthoring;

test("importador cURL preserva aspas, JSON e corpo multiline sem executar", () => {
  const body = '{\n  "message": "a \\\"quote\\\" and a \\\\path",\n  "count": 2\n}';
  const { request, secrets } = parseCurl(["curl 'https://example.test/tasks'", "-X POST", "-H 'Content-Type: application/json'", `--data-raw '${body}'`].join(" \\\n"));
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://example.test/tasks");
  assert.equal(request.body, body);
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.equal(request.auth, false);
  assert.deepEqual(secrets, []);
});

test("importador cURL aceita argumentos anexados e --json com aspas duplas", () => {
  const parsed = parseCurl('curl.exe --url=https://example.test/tasks -XPATCH -H"X-Canal: aula" --json "{\\"name\\":\\"Naru\\"}"');
  assert.equal(parsed.request.method, "PATCH");
  assert.deepEqual(JSON.parse(parsed.request.body), { name: "Naru" });
  assert.deepEqual(parsed.request.headers, { "X-Canal": "aula", "Content-Type": "application/json", Accept: "application/json" });
});

test("importador cURL respeita GET, --data-urlencode, query anterior e fragmento", () => {
  const { request } = parseCurl("curl -G 'https://example.test/search?lang=pt#results' --data-urlencode 'q=código & API' --data-urlencode 'limit=10'");
  assert.equal(request.method, "GET");
  assert.equal(request.url, "https://example.test/search?lang=pt&q=c%C3%B3digo%20%26%20API&limit=10#results");
  assert.equal(request.body, undefined);
  assert.equal(parseCurl("curl -X DELETE --get 'https://example.test/task' -d 'id=2'").request.method, "DELETE");
});

test("importador cURL suporta continuacao do Windows sem descartar conteudo", () => {
  const parsed = parseCurl('curl.exe "https://example.test/echo" ^\r\n -H "X-Context: a b" ^\r\n --data-raw "a=um dois"');
  assert.equal(parsed.request.method, "POST");
  assert.equal(parsed.request.body, "a=um dois");
  assert.equal(parsed.request.headers["X-Context"], "a b");
});

test("importador cURL substitui credenciais do cabecalho, URL e JSON por variaveis", () => {
  const parsed = parseCurl(`curl 'https://example.test/login?api_key=secret-url&normal=ok' -H 'Authorization: Bearer secret-bearer' -H 'X-Api-Key: secret-header' -H 'Cookie: session=secret-cookie' --json '{"client_secret":"secret-client","nested":{"password":"secret-password"},"message":"exemplo"}'`);
  assert.equal(parsed.request.headers.Authorization, "Bearer {{secret.token}}");
  assert.equal(parsed.request.headers["X-Api-Key"], "{{secret.cabecalho_x_api_key}}");
  assert.match(parsed.request.url, /api_key=\{\{secret.url_api_key\}\}&normal=ok/);
  assert.equal(JSON.parse(parsed.request.body).nested.password, "{{secret.corpo_nested_password}}");
  assert.equal(parsed.secrets.length, 6);
  assert.doesNotMatch(JSON.stringify(parsed), /secret-(url|bearer|header|cookie|client|password)/);
});

test("importador cURL protege formulario e preserva variaveis existentes", () => {
  const parsed = parseCurl("curl '{{base}}/login' -H 'Authorization: Bearer {{secret.token}}' -d 'client_secret=literal&name=Ana'");
  assert.equal(parsed.request.headers.Authorization, "Bearer {{secret.token}}");
  assert.equal(parsed.request.body, "client_secret={{secret.corpo_client_secret}}&name=Ana");
  assert.deepEqual(parsed.secrets, [{ name: "corpo_client_secret", location: "corpo", field: "client_secret" }]);
});

test("proteger segredo JSON preserva bytes, inteiros grandes, notacao e strings de outros campos", () => {
  const body = '{ "password": "demo-secret", "id": 9007199254740993, "amount": 1.2300e+9, "nested": [{"token":"inner-secret"}], "message": "a \\\"password\\\": \\\"literal\\\"" }';
  const parsed = parseCurl(`curl https://example.test --json '${body}'`);
  assert.equal(parsed.request.body, body.replace('"demo-secret"', '"{{secret.corpo_password}}"').replace('"inner-secret"', '"{{secret.corpo_nested_0_token}}"'));
  assert.match(parsed.request.body, /9007199254740993/);
  assert.equal(parsed.secrets.length, 2);
});

test("data-urlencode preserva variaveis e segredos existentes", () => {
  const parsed = parseCurl("curl -G https://example.test --data-urlencode 'q=antes {{query}} depois' --data-urlencode 'token={{secret.token}}'");
  assert.equal(parsed.request.url, "https://example.test?q=antes%20{{query}}%20depois&token={{secret.token}}");
  assert.deepEqual(parsed.secrets, []);
});

test("importador cURL rejeita opcoes nao suportadas, shell e arquivo sem executar", () => {
  for (const [source, expected] of [
    ["curl https://example.test --insecure", /--insecure.*ainda não/],
    ["curl https://example.test -X", /Falta o valor de -X/],
    ["curl https://example.test --data-binary @payload.json", /arquivo/],
    ["curl https://example.test --data-urlencode name@payload.txt", /arquivo/],
    ["curl https://example.test ; whoami", /uma única chamada/],
    ['curl "https://example.test/$(whoami)"', /Substituição de comandos/],
    ['curl "https://example.test', /fechar uma aspa/],
    ["curl https://user:password@example.test", /usuário ou senha/],
    ["curl https://example.test https://other.test", /uma URL/],
    ["curl https://example.test -H 'X-A: one' -H 'x-a: two'", /duas vezes/],
  ]) assert.throws(() => parseCurl(source), expected, source);
  assert.equal(parseCurl("curl https://example.test --data-raw '@literal'").request.body, "@literal");
});

test("codigo de exibicao e etapas sao preservados; API nao guarda o curl original", () => {
  const source = "\tconst nome = 'Naru';\r\nconsole.log(nome);\r\n";
  const steps = [{ title: "Mostrar", text: "Preservar esta frase", highlight: [2], output: "Naru" }];
  const result = makeSlide({ source, mode: "codewalk", filename: "exemplo.js", steps });
  assert.equal(result.slide.code, source);
  assert.equal(result.slide.language, "JavaScript");
  assert.deepEqual(result.slide.steps, steps);
  result.slide.steps[0].text = "Outra frase";
  assert.equal(steps[0].text, "Preservar esta frase");
  assert.equal(makeSlide({ source, language: "SQL" }).slide.language, "SQL");
  const api = makeSlide({ source: "curl https://example.test -H 'Authorization: Bearer secret-original'", mode: "api" });
  assert.equal(api.slide.layout, "api");
  assert.doesNotMatch(JSON.stringify(api.slide), /secret-original/);
  assert.throws(() => makeSlide({ source: "  " }), /Cole o código/);
});

test("linguagem automatica prioriza arquivo e reconhece curl, SQL, JSON e linguagens de programacao", () => {
  for (const [filename, code, expected] of [
    ["query.sql", "print(1)", "SQL"], ["main.sh", "", "Bash"], ["config.json", "", "JSON"],
    ["", "curl https://example.test", "Bash"], ["", '{"ok":true}', "JSON"], ["", "SELECT * FROM tasks", "SQL"],
    ["", "print('oi')", "Python"], ["", "const name: string = 'Naru'", "TypeScript"],
    ["", "Console.WriteLine(1);", "C#"], ["", "public class Main {}", "Java"], ["", "console.log(1);", "JavaScript"],
  ]) assert.equal(inferLanguage(filename, code), expected);
  assert.equal(normalizeLanguage("cURL"), "Bash");
});

test("selecao de linhas nao inclui linha extra quando termina na quebra", () => {
  const code = "primeira\nsegunda\nterceira\n";
  assert.deepEqual(selectionLines(code, 9, 24), [2, 3]);
  assert.deepEqual(selectionLines(code, 9, 9), [2]);
  assert.deepEqual(selectionLines(code, 0, code.length), [1, 2, 3]);
});
