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

test("editar uma variável de um ambiente de exemplo (embutido) cria a sua cópia completa dele no arquivo, com a mudança", () => {
  const file = path.join(tmp(), "ambientes.yaml");
  const api = new ApiEnvironments(file);
  api.builtin.ensaio = { label: "API de mentira", vars: { base: "http://127.0.0.1:9/v1", client_id: "id-teste" }, secrets: { client_secret: "segredo-teste" } };
  api.use("ensaio");
  const st = api.setVar("base", "http://127.0.0.1:9999/v1");
  const ensaio = st.envs.find((e) => e.name === "ensaio");
  assert.equal(ensaio.builtin, undefined, "virou um ambiente seu");
  assert.equal(ensaio.vars.base, "http://127.0.0.1:9999/v1", "a mudança vale");
  assert.equal(ensaio.vars.client_id, "id-teste", "as outras variáveis vieram junto");
  assert.deepEqual(ensaio.secrets, ["client_secret"], "o segredo também");
  assert.equal(api.reveal("client_secret"), "segredo-teste");
  // apagar uma variável do exemplo também vira cópia (sem aquela variável)
  const api2 = new ApiEnvironments(path.join(tmp(), "ambientes.yaml"));
  api2.builtin.ensaio = { vars: { a: "1", b: "2" } };
  api2.use("ensaio");
  assert.deepEqual(api2.deleteVar("a").envs.find((e) => e.name === "ensaio").vars, { b: "2" });
});
