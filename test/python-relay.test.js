// Pacote Python: o modelrelay embutido (quando o sagadeck roda via pip) sobe na porta padrão, mesmo
// sem configuração, para a tela de configuração ter sempre o mesmo endereço.
// Precisa de um Python com o modelrelay: SAGADECK_TEST_PYTHON, ou o .venv do repositório vizinho.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync, spawnSync } from "node:child_process";
import { ROOT } from "./helpers.js";

function pythonWithRelay() {
  const candidates = [process.env.SAGADECK_TEST_PYTHON,
    path.join(ROOT, "..", "modelrelay", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")];
  for (const py of candidates.filter(Boolean)) {
    try { execFileSync(py, ["-c", "import modelrelay.console"], { stdio: "ignore" }); return py; } catch {}
  }
  return null;
}

const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

test("modelrelay embutido: porta padrão e tela no ar, mesmo sem config", async (t) => {
  const py = pythonWithRelay();
  if (!py) return t.skip("sem Python com modelrelay (defina SAGADECK_TEST_PYTHON)");
  const port = await freePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-relay-"));
  const script = `
import json, urllib.request, sagadeck.llm as llm
llm.DEFAULT_PORT = ${port}
with llm.llm_env("studio", {"MODELRELAY_CONFIG": r"${path.join(home, "config.toml")}"}) as env:
    url = env["SAGADECK_LLM_URL"]
    page = urllib.request.urlopen(url.replace("/v1", "/api/console/config")).read()
    print(json.dumps({"url": url, "exists": json.loads(page)["exists"]}))
`;
  const out = execFileSync(py, ["-c", script], { env: { ...process.env, PYTHONPATH: path.join(ROOT, "python"), MODELRELAY_CONFIG: path.join(home, "config.toml") }, encoding: "utf8" });
  const r = JSON.parse(out.trim().split("\n").pop());
  assert.equal(r.url, `http://127.0.0.1:${port}/v1`);
  assert.equal(r.exists, false, "sem config: a tela está lá para criar");
});

// Mudou o modelrelay, o sagadeck exige a versão nova: a mínima mora em dois lugares (o aviso em llm.py e o extra "ia"
// do pyproject.toml) e os dois têm de bater. Quem tiver um modelrelay mais velho é avisado, com o comando para atualizar.
test("versão mínima do modelrelay: a mesma no aviso e no extra ia; modelrelay velho gera aviso com o comando", (t) => {
  const llm = fs.readFileSync(path.join(ROOT, "python", "sagadeck", "llm.py"), "utf8");
  const min = llm.match(/^MIN_MODELRELAY = "([\d.]+)"/m)?.[1];
  assert.ok(min, "MIN_MODELRELAY em llm.py");
  const extra = fs.readFileSync(path.join(ROOT, "pyproject.toml"), "utf8").match(/^ia = \["modelrelay>=([\d.]+)"\]/m)?.[1];
  assert.equal(extra, min, "o extra ia do pyproject.toml exige a mesma versão do aviso");
  let py = null;
  for (const c of ["python3", "python"]) { try { execFileSync(c, ["--version"], { stdio: "ignore" }); py = c; break; } catch {} }
  if (!py) return t.skip("sem Python");
  // um modelrelay de mentira, velho, só com o que o sagadeck usa
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-relay-velho-"));
  fs.mkdirSync(path.join(fake, "modelrelay"));
  fs.writeFileSync(path.join(fake, "modelrelay", "__init__.py"), '__version__ = "0.1.0"\n');
  fs.writeFileSync(path.join(fake, "modelrelay", "server.py"), [
    "class S:", "    url = 'http://127.0.0.1:1/v1'", "    def serve_forever(self): pass", "    def shutdown(self): pass", "    def server_close(self): pass",
    "def make_server(port=0): return S()", ""].join("\n"));
  const run = (version) => {
    fs.writeFileSync(path.join(fake, "modelrelay", "__init__.py"), `__version__ = "${version}"\n`);
    const r = spawnSync(py, ["-c", "import sagadeck.llm as llm\nllm.DEFAULT_PORT = 1\nwith llm.llm_env('studio', {}) as env: print(env['SAGADECK_LLM_URL'])"],
      { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1", PYTHONPATH: [fake, path.join(ROOT, "python")].join(path.delimiter) }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stderr;
  };
  const velho = run("0.1.0");
  assert.match(velho, new RegExp(`modelrelay 0\\.1\\.0 está desatualizado: este sagadeck precisa do ${min.replace(/\./g, "\\.")}`));
  assert.match(velho, /pip install -U "modelrelay>=/);
  assert.doesNotMatch(velho, /git pull/, "instalado pelo pip: nada de git pull");
  assert.equal(run(min), "", "na versão exigida, nenhum aviso");
  // instalação editável (pip install -e, direto do clone): o código vem da pasta do repositório, então quem atualiza
  // é o git pull ali; pip install -U baixaria outra cópia do PyPI por cima (pergunta do Naruminho no laptop)
  fs.mkdirSync(path.join(fake, ".git"));
  fs.writeFileSync(path.join(fake, "pyproject.toml"), '[project]\nname = "modelrelay"\n');
  const clone = run("0.1.0");
  assert.match(clone, /modelrelay 0\.1\.0 está desatualizado/);
  assert.match(clone, /git pull/);
  assert.ok(clone.includes(fake), `diz a pasta do clone: ${clone}`);
  assert.doesNotMatch(clone, /pip install -U/);
  // cópia no site-packages não é clone, mesmo com um .venv dentro de um repositório git
  const venv = path.join(fake, ".venv", "lib", "python3.12", "site-packages", "modelrelay");
  fs.mkdirSync(venv, { recursive: true });
  const r = spawnSync(py, ["-c", `import sagadeck.llm as llm; print(llm.relay_clone(r"${path.join(venv, "__init__.py")}"))`],
    { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1", PYTHONPATH: path.join(ROOT, "python") }, encoding: "utf8" });
  assert.equal(r.stdout.trim(), "None", r.stderr);
});
