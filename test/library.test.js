// Biblioteca (pasta de tópicos e apresentações): o mesmo código no Windows do banco e no servidor.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { openLibrary, safeName, defaultLibraryRoot, TRASH_DAYS } from "../src/library.js";
import { packDeck } from "../src/package.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-lib-"));
const deck = (title, n = 2) => ({ title, theme: "bauhaus", slides: Array.from({ length: n }, (_, i) => ({ layout: "statement", text: `slide ${i + 1}` })) });
const byTitle = (lib, t) => lib.list().decks.find((d) => d.title === t);

test("tópicos e apresentações: criar, listar (com contagem, cor, slides) e pasta real no disco", () => {
  const lib = openLibrary(tmp());
  const t = lib.createTopic("Palestras", "#d33a2c");
  const id = lib.createDeck(t, deck("E se o humano for o bug?", 39));
  assert.equal(id, "Palestras/E se o humano for o bug/E se o humano for o bug.yaml", "o '?' some do nome da pasta (Windows)");
  assert.ok(fs.existsSync(path.join(lib.root, ...id.split("/"))));
  const l = lib.list();
  assert.deepEqual(l.topics.map((x) => [x.name, x.color, x.count]), [["Palestras", "#d33a2c", 1]]);
  assert.deepEqual({ ...l.decks[0], edited: 0 }, { id, topic: "Palestras", title: "E se o humano for o bug?", slides: 39, theme: "bauhaus", edited: 0, folder: true });
});

test("nova sem tópico vai para 'Sem tópico'; nomes do Windows são respeitados", () => {
  const lib = openLibrary(tmp());
  const id = lib.createDeck("", deck("Resultados: Q3/2026"));
  assert.match(id, /^Sem tópico\/Resultados Q3 2026\//);
  assert.equal(safeName("CON"), "Sem título");
  assert.equal(safeName("  a<b>c.  "), "a b c");
  const again = lib.createDeck("", deck("Resultados: Q3/2026"));
  assert.match(again, /Resultados Q3 2026 \(2\)/, "mesmo nome não sobrescreve");
});

test("o que foi criado pelo Explorer aparece: pasta com .yaml (ou .sagadeck extraído) e .yaml solto", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "Aulas", "SQL básico"), { recursive: true });
  fs.writeFileSync(path.join(root, "Aulas", "SQL básico", "outro-nome.yaml"), YAML.stringify(deck("SQL básico", 5)));
  fs.writeFileSync(path.join(root, "Aulas", "SQL básico", "sagadeck.json"), JSON.stringify({ main: "outro-nome.yaml" }));
  fs.writeFileSync(path.join(root, "Aulas", "rascunho.yaml"), YAML.stringify(deck("Rascunho", 1)));
  fs.writeFileSync(path.join(root, "solto na raiz.yaml"), YAML.stringify(deck("Solto", 1)));
  fs.mkdirSync(path.join(root, ".cache"));
  const l = openLibrary(root).list();
  assert.deepEqual(l.topics.map((t) => [t.name, t.count]), [["Aulas", 2]]);
  const ids = l.decks.map((d) => [d.id, d.topic, d.folder]).sort();
  assert.deepEqual(ids, [["Aulas/SQL básico/outro-nome.yaml", "Aulas", true], ["Aulas/rascunho.yaml", "Aulas", false], ["solto na raiz.yaml", "", false]]);
});

test("mover (pasta inteira, com imagens), renomear e duplicar", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Palestras"); lib.createTopic("Trabalho");
  let id = lib.createDeck("Palestras", deck("Piloto IA"));
  fs.mkdirSync(path.join(lib.root, "Palestras", "Piloto IA", "imagens"));
  fs.writeFileSync(path.join(lib.root, "Palestras", "Piloto IA", "imagens", "a.png"), "x");
  id = lib.moveDeck(id, "Trabalho");
  assert.equal(id, "Trabalho/Piloto IA/Piloto IA.yaml");
  assert.ok(fs.existsSync(path.join(lib.root, "Trabalho", "Piloto IA", "imagens", "a.png")), "as imagens foram junto");
  id = lib.renameDeck(id, "Piloto de IA 2027");
  assert.equal(id, "Trabalho/Piloto de IA 2027/Piloto de IA 2027.yaml");
  assert.equal(byTitle(lib, "Piloto de IA 2027").id, id, "o título dentro do .yaml também mudou");
  const copy = lib.duplicateDeck(id);
  assert.equal(copy, "Trabalho/Piloto de IA 2027 (cópia)/Piloto de IA 2027 (cópia).yaml");
  assert.ok(fs.existsSync(path.join(lib.root, "Trabalho", "Piloto de IA 2027 (cópia)", "imagens", "a.png")));
  assert.equal(lib.list().decks.length, 2);
});

test("lixeira: excluir, restaurar no tópico de origem, apagar de vez e limpeza depois de 30 dias", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Aulas");
  const id = lib.createDeck("Aulas", deck("Aula 1"));
  const slot = lib.trashDeck(id);
  assert.equal(lib.list().decks.length, 0);
  assert.deepEqual(lib.list().trash.map((t) => [t.title, t.topic]), [["Aula 1", "Aulas"]]);
  assert.equal(lib.restoreDeck(slot), id);
  const slot2 = lib.trashDeck(id);
  lib.purgeDeck(slot2);
  assert.equal(lib.list().trash.length, 0);
  // expira: a lixeira se limpa sozinha depois de 30 dias
  const id3 = lib.createDeck("Aulas", deck("Aula velha"));
  const slot3 = lib.trashDeck(id3);
  const meta = path.join(lib.root, ".lixeira", slot3, ".origem.json");
  const o = JSON.parse(fs.readFileSync(meta, "utf8"));
  fs.writeFileSync(meta, JSON.stringify({ ...o, deleted: Date.now() - (TRASH_DAYS + 1) * 864e5 }));
  assert.equal(lib.list().trash.length, 0);
});

test("tópico: renomear, trocar cor; só exclui se estiver vazio", () => {
  const lib = openLibrary(tmp());
  const t = lib.createTopic("Palstras");
  const t2 = lib.updateTopic(t, { name: "Palestras", color: "#0f6cbd" });
  assert.equal(t2, "Palestras");
  assert.equal(lib.list().topics[0].color, "#0f6cbd");
  lib.createDeck("Palestras", deck("X"));
  assert.throws(() => lib.deleteTopic("Palestras"), /não está vazio/);
  lib.trashDeck(lib.list().decks[0].id);
  lib.deleteTopic("Palestras");
  assert.equal(lib.list().topics.length, 0);
});

test("importar .sagadeck num tópico (com as imagens)", async () => {
  const src = tmp();
  fs.mkdirSync(path.join(src, "imagens"));
  fs.writeFileSync(path.join(src, "imagens", "f.png"), "png");
  const spec = { ...deck("Importada"), slides: [{ layout: "split", title: "x", figure: { image: "imagens/f.png" } }] };
  const { zip } = await packDeck(spec, { baseDir: src, name: "Importada" });
  const lib = openLibrary(tmp());
  lib.createTopic("Trabalho");
  const id = await lib.importPackage(zip, "Trabalho", "Importada.sagadeck");
  assert.match(id, /^Trabalho\/Importada\//);
  assert.ok(fs.existsSync(path.join(lib.root, "Trabalho", "Importada", "imagens", "f.png")));
  const noTopic = await lib.importPackage(zip, "", "Outra.sagadeck");
  assert.match(noTopic, /^Importados\/Outra\//);
});

test("não dá para sair da biblioteca por um id malicioso", () => {
  const lib = openLibrary(tmp());
  for (const bad of ["../fora.yaml", "a/../../fora.yaml", "C:/Windows/win.ini", ""]) {
    assert.throws(() => lib.moveDeck(bad, ""), /fora da biblioteca|não encontrada|inválido/, bad);
  }
});

test("pasta padrão: SAGADECK_HOME, senão ~/sagadeck", () => {
  assert.equal(defaultLibraryRoot({ SAGADECK_HOME: "D:/decks" }), path.resolve("D:/decks"));
  assert.equal(defaultLibraryRoot({}), path.join(os.homedir(), "sagadeck"));
});
