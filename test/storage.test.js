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

// "Deck com IA" no editor gravava o deck novo solto na pasta do deck aberto (ou na pasta atual do servidor), fora da
// estrutura da biblioteca. Pelo editor ou pela biblioteca, o gerado vai para uma pasta própria, no tópico do deck aberto.
test("gerar com IA (editor e biblioteca) grava numa pasta própria da biblioteca, com minutos, estilo e anexos", async () => {
  const { startStudio } = await import("./helpers.js");
  const { startMockLLM } = await import("./mock-llm.js");
  const DECK = "```yaml\ntitle: Deck gerado\ntheme: editorial\nduration: 12\nslides:\n  - layout: cover\n    title: Deck gerado\n    notes: abertura\n    time: 6\n  - layout: statement\n    text: Uma ideia\n    notes: fechamento\n    time: 6\n```";
  const llm = await startMockLLM(() => DECK);
  const fora = lib();
  fs.writeFileSync(path.join(fora, "aberto.yaml"), "title: Aberto\nslides:\n  - layout: cover\n    title: Aberto\n");
  const studio = await startStudio(path.join(fora, "aberto.yaml"), { llmUrl: llm.url });
  const post = async (p, body) => { const r = await fetch(studio.url + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
  try {
    // editor: o deck aberto está fora da biblioteca, então o gerado vai para "Sem tópico", numa pasta com o nome dele
    let [status, r] = await post("/api/ai/generate", { briefing: "palestra sobre pix", duration: 12, style: "revista" });
    assert.equal(status, 200, JSON.stringify(r));
    assert.ok(inside(studio.library, r.file), r.file);
    assert.equal(typeof r.quality?.verified, 'boolean', 'o editor recebe o resultado da conferência');
    const reviewFile = path.join(path.dirname(r.file), '.sagadeck', 'avaliacao-geracao.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(reviewFile, 'utf8')).quality, r.quality, 'a conferência acompanha a apresentação salva');
    assert.equal(path.basename(path.dirname(r.file)) + ".yaml", path.basename(r.file), "pasta própria");
    assert.deepEqual(fs.readdirSync(fora), ["aberto.yaml"], "nada solto ao lado do deck aberto");
    let pedido = llm.requests.findLast(r => /Crie a apresentação inteira/.test(r.lastUser)).lastUser;
    assert.match(pedido, /Use o tema "editorial"/);
    assert.match(pedido, /Duração planejada: 12 minutos/);
    assert.match(pedido, /Cerca de 8 slides/, "12 min → 8 slides");

    // biblioteca: minutos, estilo e o material anexado chegam ao modelo
    [status, r] = await post("/api/ai/context", { name: "dados.txt", dataUrl: "data:text/plain;base64," + Buffer.from("Receita de 3 bilhões em 2025").toString("base64") });
    assert.equal(status, 200, JSON.stringify(r));
    [status, r] = await post("/api/library/decks/ai", { topic: "", briefing: "resultado do ano", duration: 20, style: "essencial", materials: [r.id] });
    assert.equal(status, 200, JSON.stringify(r));
    const file = path.join(studio.library, ...r.id.split("/"));
    assert.ok(fs.existsSync(file), file);
    assert.equal(typeof r.quality?.verified, 'boolean', 'a biblioteca também recebe o resultado da conferência');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(path.dirname(file), '.sagadeck', 'avaliacao-geracao.json'), 'utf8')).quality, r.quality);
    pedido = llm.requests.findLast(r => /Crie a apresentação inteira/.test(r.lastUser)).lastUser;
    assert.match(pedido, /Receita de 3 bilhões/, "o anexo vai no pedido");
    assert.match(pedido, /Use o tema "prata"/, "estilo essencial → tema prata");
    assert.match(pedido, /Duração planejada: 20 minutos/);
  } finally {
    await studio.close();
    await llm.close();
  }
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
