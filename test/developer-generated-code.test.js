import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile, execFileSync } from "node:child_process";
import "../src/runtime/api-core.js";
import "../src/studio/public/developer-authoring.js";

const C = globalThis.SagadeckApiCore, { parseCurl } = globalThis.SagaDeveloperAuthoring;
const execute = (file, args, options) => new Promise((resolve, reject) => execFile(file, args, { encoding: "utf8", timeout: 20000, ...options }, (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout)));

test("cURL importado sem segredos continua curto e preserva literais do shell", () => {
  const slide = { request: parseCurl("curl 'https://example.test/literal/$SAGADECK_LITERAL_EXAMPLE/$(literal)' -H 'X-Example: $SAGADECK_LITERAL_EXAMPLE `literal`'").request };
  const code = C.code(slide, "curl").code;
  assert.match(code, /'https:\/\/example.test\/literal\/\$SAGADECK_LITERAL_EXAMPLE\/\$\(literal\)'/);
  assert.match(code, /'X-Example: \$SAGADECK_LITERAL_EXAMPLE `literal`'/);
  assert.doesNotMatch(code, /node -e|SAGA_SECRET|@@SECRET|%40%40SECRET|\{\{secret\./);
  assert.ok(code.split("\n").length <= 3);
});

test("exemplos copiáveis importados: cURL, JavaScript e Python enviam segredos com encoding correto", { timeout: 120000 }, async t => {
  const received = [], server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received.push({ url: req.url, body: Buffer.concat(chunks).toString("utf8"), headers: req.headers });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`, dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-generated-"));
  const secret = 'review"quoted\\secretç', querySecret = 'query&"ação', headerSecret = 'header&"key';
  const environment = { ...process.env, CORPO_PASSWORD: secret, URL_API_KEY: querySecret, CABECALHO_X_API_KEY: headerSecret, SAGADECK_LITERAL_EXAMPLE: "must-not-expand" };
  const bash = process.env.SAGADECK_BASH || (process.platform === "win32" ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe") : "bash");
  const python = process.env.SAGADECK_PYTHON || "python";
  // Transporte mínimo stdlib para o contrato requests usado pelo exemplo. A interpolação e
  // a codificação são do código gerado; este adaptador somente manda os bytes ao HTTP real.
  fs.writeFileSync(path.join(dir, "requests.py"), `import json as _json\nimport urllib.request as _http\nclass Reply:\n def __init__(self, response):\n  self.content = response.read()\n  self.status_code = response.status\n def raise_for_status(self):\n  if self.status_code >= 400: raise RuntimeError(self.status_code)\n def json(self): return _json.loads(self.content)\ndef _send(method, url, headers=None, data=None, json=None, timeout=60):\n if json is not None: data = _json.dumps(json).encode("utf-8")\n elif isinstance(data, str): data = data.encode("utf-8")\n return Reply(_http.urlopen(_http.Request(url, data=data, headers=headers or {}, method=method), timeout=timeout))\ndef get(url, **kwargs): return _send("GET", url, **kwargs)\ndef post(url, **kwargs): return _send("POST", url, **kwargs)\n`);
  try {
    for (const language of ["curl", "javascript", "python"]) await t.test(language, async sub => {
      try { if (language === "curl") execFileSync(bash, ["--version"], { stdio: "ignore" }); if (language === "python") execFileSync(python, ["--version"], { stdio: "ignore" }); }
      catch { sub.skip(language === "curl" ? "sem Bash instalado para executar o exemplo curl" : "sem Python instalado para executar o exemplo Python"); return; }
      const run = async source => {
        const slide = { request: parseCurl(source).request }, code = C.code(slide, language, {}).code;
        assert.doesNotMatch(code, /@@SECRET|%40%40SECRET|\{\{\s*secret\./);
        const file = path.join(dir, language === "curl" ? "example.sh" : language === "python" ? "example.py" : "example.mjs"); fs.writeFileSync(file, code);
        await execute(language === "curl" ? bash : language === "python" ? python : process.execPath, [language === "curl" ? file.replace(/\\/g, "/") : file], { cwd: dir, env: environment });
        return received.at(-1);
      };
      let sent = await run(`curl '${base}/json' --json '{ "password": "placeholder", "id": 9007199254740993 }' -H 'X-Api-Key: placeholder'`);
      assert.equal(JSON.parse(sent.body).password, secret); assert.match(sent.body, /9007199254740993/); assert.equal(sent.headers["x-api-key"], headerSecret);
      sent = await run(`curl '${base}/form' --data-urlencode 'password=a&b'`);
      assert.equal(new URLSearchParams(sent.body).get("password"), secret); assert.equal([...new URLSearchParams(sent.body)].length, 1);
      sent = await run(`curl -G '${base}/query' --data-urlencode 'api_key={{secret.url_api_key}}'`);
      assert.equal(new URL(sent.url, base).searchParams.get("api_key"), querySecret);
      sent = await run(`curl '${base}/literal/$SAGADECK_LITERAL_EXAMPLE/$(literal)' -H 'X-Example: $SAGADECK_LITERAL_EXAMPLE'`);
      assert.equal(sent.url, "/literal/$SAGADECK_LITERAL_EXAMPLE/$(literal)"); assert.equal(sent.headers["x-example"], "$SAGADECK_LITERAL_EXAMPLE");
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});
