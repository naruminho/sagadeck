// Pacote Python: o modelrelay embutido (quando o sagadeck roda via pip) sobe na porta padrão, mesmo
// sem configuração, para a tela de configuração ter sempre o mesmo endereço.
// Precisa de um Python com o modelrelay: SAGADECK_TEST_PYTHON, ou o .venv do repositório vizinho.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";
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
