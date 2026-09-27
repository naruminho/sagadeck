// Variáveis e segredos dos slides de API: onde ficam (~/.sagadeck/ambientes.yaml, fora das apresentações),
// como a pessoa cria/edita/apaga pelo painel e como as protegidas são guardadas (cifradas pelo Windows, DPAPI).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiEnvironments, defaultEnvFile } from "../src/api-client.js";
import { protect, unprotect, PROTECTION } from "../src/protect.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-vars-"));
const ARQ = `# meus ambientes (comentário que tem que sobreviver)
current: dev
environments:
  dev:
    vars: { base: "https://dev.exemplo/api" }   # endereço de dev
`;

test("o arquivo continua em ~/.sagadeck/ambientes.yaml (ou SAGADECK_AMBIENTES)", () => {
  const home = tmp();
  assert.equal(defaultEnvFile({}, home), path.join(home, ".sagadeck", "ambientes.yaml"));
  assert.equal(defaultEnvFile({ SAGADECK_AMBIENTES: "D:/x.yaml" }, home), "D:/x.yaml");
});

test("proteger: no Windows o valor é cifrado (DPAPI, só este usuário lê); a volta dá o mesmo texto", () => {
  const v = "segredo-de-verdade-123 ção";
  const p = protect(v);
  if (PROTECTION === "dpapi") { assert.match(p, /^dpapi:/); assert.ok(!p.includes("segredo")); }
  assert.equal(unprotect(p), v);
  assert.equal(unprotect("texto comum"), "texto comum");
});

test("criar, editar, revelar e apagar variáveis pelo painel; protegida não aparece no estado nem em texto puro no arquivo", () => {
  const f = path.join(tmp(), "ambientes.yaml");
  fs.writeFileSync(f, ARQ);
  const api = new ApiEnvironments(f);
  api.setVar("modelo", "gpt-mini");
  api.setVar("chave_teste", "abc-SEGREDO-987", { protected: true });
  const txt = fs.readFileSync(f, "utf8");
  assert.match(txt, /# meus ambientes \(comentário que tem que sobreviver\)/);
  assert.match(txt, /# endereço de dev/);
  if (PROTECTION === "dpapi") assert.doesNotMatch(txt, /abc-SEGREDO-987/);
  const st = api.state();
  const dev = st.envs.find((e) => e.name === "dev");
  assert.equal(dev.vars.modelo, "gpt-mini");
  assert.deepEqual(dev.secrets, ["chave_teste"]);
  assert.doesNotMatch(JSON.stringify(st), /abc-SEGREDO-987/, "o valor protegido nunca vai no estado");
  assert.equal(api.reveal("chave_teste"), "abc-SEGREDO-987");
  assert.equal(api.secretVars(api.env())["secret.chave_teste"], "abc-SEGREDO-987", "os slides usam o valor de verdade");
  // trocar de normal para protegida (e vice-versa) não deixa cópia no outro lugar
  api.setVar("modelo", "gpt-grande", { protected: true });
  assert.equal(api.env().vars?.modelo, undefined);
  assert.equal(api.reveal("modelo"), "gpt-grande");
  api.deleteVar("modelo");
  api.deleteVar("chave_teste");
  assert.deepEqual(api.state().envs.find((e) => e.name === "dev").secrets, []);
  assert.throws(() => api.setVar("nome com espaço", "x"), /nome/);
});

test("sem arquivo ainda: criar a primeira variável cria o arquivo e o ambiente", () => {
  const f = path.join(tmp(), "sub", "ambientes.yaml");
  const api = new ApiEnvironments(f);
  api.setVar("base", "https://x", { env: "dev" });
  assert.equal(api.env("dev").vars.base, "https://x");
});
