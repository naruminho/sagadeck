// Padrão de armazenamento: toda apresentação nova do sagadeck vai para a biblioteca (SAGADECK_HOME ou ~/sagadeck,
// no Windows C:\Users\<você>\sagadeck). Nada de deck em pasta temporária, na pasta atual ou dentro do repositório:
// cópias espalhadas foram o que fez .js e imagens "sumirem". Um caminho de fora da biblioteca vira só o nome.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { ROOT } from "./helpers.js";
import { newDeckPath } from "../src/library.js";
import { handleToolCall } from "../src/mcp/server.js";

const lib = () => fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-padrao-"));
const inside = (root, f) => { const r = path.relative(root, f); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };

test("newDeckPath: fora da biblioteca vira <biblioteca>/<tópico>/<nome>/<nome>.yaml; dentro, é respeitado", () => {
  const root = lib();
  assert.equal(newDeckPath(path.join(os.tmpdir(), "x", "palestra.yaml"), { root }), path.join(root, "Sem tópico", "palestra", "palestra.yaml"));
  assert.equal(newDeckPath("C:/Users/fulano/src/sagadeck/deck.yaml", { root, topic: "Aulas" }), path.join(root, "Aulas", "deck", "deck.yaml"));
  assert.equal(newDeckPath("C:\\Users\\fulano\\Desktop\\aula.yaml", { root, topic: "Aulas" }), path.join(root, "Aulas", "aula", "aula.yaml"), "barra invertida do Windows, em qualquer sistema");
  assert.equal(newDeckPath(null, { root, title: "Ensaio: APIs de IA ao vivo" }), path.join(root, "Sem tópico", "Ensaio APIs de IA ao vivo", "Ensaio APIs de IA ao vivo.yaml"));
  assert.equal(newDeckPath("Minha palestra", { root }), path.join(root, "Sem tópico", "Minha palestra", "Minha palestra.yaml"));
  const dentro = path.join(root, "Trabalho", "ia", "ia.yaml");
  assert.equal(newDeckPath(dentro, { root }), dentro);
  // já existe e pediu único: não sobrescreve
  fs.mkdirSync(path.dirname(dentro), { recursive: true });
  fs.writeFileSync(dentro, "title: x\n");
  assert.equal(newDeckPath(dentro, { root, unique: true }), path.join(root, "Trabalho", "ia (2)", "ia (2).yaml"));
});

test("sagadeck new sem caminho, ou com caminho de fora, grava na biblioteca e não na pasta atual", () => {
  const home = lib(), cwd = lib();
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, "bin", "sagadeck.js"), ...a], { cwd, encoding: "utf8", env: { ...process.env, SAGADECK_HOME: home } });
  let r = run("new", "Minha palestra");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(home, "Sem tópico", "Minha palestra", "Minha palestra.yaml")), r.stdout);
  r = run("new", path.join(cwd, "solto.yaml"), "--topic=Aulas");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(home, "Aulas", "solto", "solto.yaml")), r.stdout);
  r = run("scaffold", "esqueleto.yaml");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(home, "Sem tópico", "esqueleto", "esqueleto.yaml")), r.stdout);
  assert.deepEqual(fs.readdirSync(cwd), [], "nada na pasta atual");
});

test("ferramentas MCP de criar deck gravam na biblioteca e nunca sobrescrevem", async () => {
  const home = process.env.SAGADECK_HOME;
  const fora = path.join(lib(), "agente", "deck.yaml");
  const a = await handleToolCall("sagadeck_create_deck", { path: fora, title: "Deck do agente" });
  assert.ok(inside(home, a.created), a.created);
  assert.equal(fs.existsSync(fora), false);
  const b = await handleToolCall("sagadeck_create_deck", { path: fora, title: "Deck do agente" });
  assert.notEqual(b.created, a.created, "o segundo não sobrescreve o primeiro");
  const s = await handleToolCall("sagadeck_scaffold_deck", { path: fora, title: "Esqueleto" });
  assert.ok(inside(home, s.path), s.path);
  assert.equal(YAML.parse(fs.readFileSync(s.path, "utf8")).title, "Esqueleto");
});
