// Biblioteca (pasta de tópicos e apresentações): o mesmo código no Windows do banco e no servidor.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { openLibrary, safeName, defaultLibraryRoot, migrateLegacyLibrary, TRASH_DAYS, libraryCacheDir } from "../src/library.js";
import { packDeck } from "../src/package.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-lib-"));
const deck = (title, n = 2) => ({ title, theme: "bauhaus", slides: Array.from({ length: n }, (_, i) => ({ layout: "statement", text: `slide ${i + 1}` })) });
const byTitle = (lib, t) => lib.list().decks.find((d) => d.title === t);

test("repetir a criação de tópico reutiliza a pasta e preserva sua cor", () => {
  const lib = openLibrary(tmp());
  assert.equal(lib.createTopic("Laboratório", "#d33a2c"), "Laboratório");
  assert.equal(lib.createTopic(" laboratório ", "#0f6cbd"), "Laboratório");
  assert.deepEqual(lib.list().topics.map(t => [t.name, t.color]), [["Laboratório", "#d33a2c"]]);
});

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

// Com a biblioteca no OneDrive e "arquivos só na nuvem", ler o conteúdo de um .yaml baixa o arquivo: a listagem lia
// todos a cada abertura da biblioteca. Agora só relê o que mudou (data, tamanho e inode), também depois de reiniciar.
test("listar a biblioteca só relê a apresentação que mudou (arquivos só na nuvem não são baixados à toa)", () => {
  const root = tmp();
  const lib = openLibrary(root);
  const a = lib.createDeck("Aulas", deck("Hidráulica", 3)), b = lib.createDeck("Aulas", deck("Hidrologia", 2));
  const yamlReads = (fn) => {
    const orig = fs.readFileSync; let n = 0;
    fs.readFileSync = function (p, ...rest) { if (typeof p === "string" && /\.ya?ml$/i.test(p)) n++; return orig.call(this, p, ...rest); };
    try { return [fn(), n]; } finally { fs.readFileSync = orig; }
  };
  const [first] = yamlReads(() => lib.list());
  assert.deepEqual(first.decks.map((d) => [d.title, d.slides]).sort((x, y) => x[0].localeCompare(y[0], "pt-BR")), [["Hidráulica", 3], ["Hidrologia", 2]]);
  const [again, reads] = yamlReads(() => lib.list());
  assert.equal(reads, 0, "nada mudou: nenhum .yaml relido");
  assert.deepEqual(again.decks.map((d) => d.title).sort((x, y) => x.localeCompare(y, "pt-BR")), ["Hidráulica", "Hidrologia"]);
  // o Studio reiniciou: vale o que ficou em .cache/lista.json
  const [, afterRestart] = yamlReads(() => openLibrary(root).list());
  assert.equal(afterRestart, 0, "depois de reiniciar, também não relê");
  // mudou uma: só ela é relida, e a listagem mostra o novo
  const fileA = path.join(root, ...a.split("/"));
  fs.writeFileSync(fileA, YAML.stringify(deck("Hidráulica básica", 5)));
  const [changed, oneRead] = yamlReads(() => lib.list());
  assert.equal(oneRead, 1, "só a que mudou");
  assert.deepEqual(changed.decks.find((d) => d.id === a), { ...changed.decks.find((d) => d.id === a), title: "Hidráulica básica", slides: 5 });
  // apagada por fora: some da listagem e do cache
  fs.rmSync(path.dirname(path.join(root, ...b.split("/"))), { recursive: true });
  assert.deepEqual(lib.list().decks.map((d) => d.id), [a]);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, ".cache", "lista.json"), "utf8"))), [a]);
  // cache estragado: lê tudo de novo, sem erro
  fs.writeFileSync(path.join(root, ".cache", "lista.json"), "{quebrado");
  assert.equal(openLibrary(root).list().decks[0].title, "Hidráulica básica");
});

// As capas e a lista se refazem sozinhas: com a biblioteca no OneDrive, ocupavam a cota e sincronizavam a cada capa
// nova (5,8 MB na biblioteca da Narumi). Ficam na pasta local do Windows; fora do OneDrive, onde sempre ficaram.
test("cache da biblioteca: fora da nuvem quando ela está no OneDrive, e o que ficou lá dentro sai", () => {
  const base = tmp(), cloud = path.join(base, "OneDrive"), local = path.join(base, "AppData", "Local");
  const env = { OneDrive: cloud, LOCALAPPDATA: local };
  const inCloud = path.join(cloud, "Documents", "sagadeck"), outside = path.join(base, "Documentos", "sagadeck");
  const dir = libraryCacheDir(inCloud, { env, platform: "win32" });
  assert.ok(dir.startsWith(path.join(local, "sagadeck", "cache") + path.sep), dir);
  assert.notEqual(dir, libraryCacheDir(path.join(cloud, "Outra", "sagadeck"), { env, platform: "win32" }), "uma pasta por biblioteca");
  assert.equal(libraryCacheDir(outside, { env, platform: "win32" }), path.join(outside, ".cache"), "fora do OneDrive, como sempre");
  assert.equal(libraryCacheDir(inCloud, { env, platform: "linux" }), path.join(inCloud, ".cache"), "fora do Windows, como sempre");
  assert.equal(libraryCacheDir(inCloud, { env: { OneDriveCommercial: cloud, LOCALAPPDATA: local }, platform: "win32" }), dir, "OneDrive da empresa também");
  // a biblioteca de verdade no OneDrive: as capas antigas saem, o que não é do sagadeck fica, e a lista vai para fora
  if (process.platform !== "win32") return;
  const saved = { OneDrive: process.env.OneDrive, LOCALAPPDATA: process.env.LOCALAPPDATA };
  Object.assign(process.env, env);
  try {
    fs.mkdirSync(path.join(inCloud, ".cache", "capas"), { recursive: true });
    fs.writeFileSync(path.join(inCloud, ".cache", "capas", "x.jpg"), "capa");
    const lib = openLibrary(inCloud);
    assert.ok(!fs.existsSync(path.join(inCloud, ".cache")), "o cache antigo saiu da nuvem");
    assert.equal(lib.cacheDir, dir);
    lib.createDeck("Aulas", deck("Hidráulica", 2));
    lib.list();
    assert.ok(fs.existsSync(path.join(dir, "lista.json")), "a lista mora fora da nuvem");
    fs.mkdirSync(path.join(inCloud, ".cache"), { recursive: true });
    fs.writeFileSync(path.join(inCloud, ".cache", "meu.txt"), "da pessoa");
    openLibrary(inCloud);
    assert.ok(fs.existsSync(path.join(inCloud, ".cache", "meu.txt")), "só apaga o que é do sagadeck");
  } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

test("nova sem tópico vai para 'Sem tópico'; nomes do Windows são respeitados", () => {
  const lib = openLibrary(tmp());
  const id = lib.createDeck("", deck("Resultados: Q3/2026"));
  assert.match(id, /^Sem tópico\/Resultados Q3 2026\//);
  assert.equal(safeName("CON"), "Sem título");
  assert.equal(safeName("  a<b>c.  "), "a b c");
  // nome longo corta entre palavras, nunca no meio ("…Urban Flood Predic")
  assert.equal(safeName("Integrated Methodologies for Flood Susceptibility Mapping and Urban Flood Prediction in São Paulo"), "Integrated Methodologies for Flood Susceptibility Mapping and Urban Flood");
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

// Trava que o renameRetry já cobre no rename: no Windows o antivírus/sincronização segura o arquivo recém-criado
// por um instante e a cópia do duplicar estourava EPERM (flake do CI: "mover (pasta inteira...), renomear e duplicar").
test("duplicar não desiste com o arquivo travado por um instante (antivírus/sincronização), como o rename", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Trabalho");
  const id = lib.createDeck("Trabalho", deck("Relatório"));
  fs.mkdirSync(path.join(lib.root, "Trabalho", "Relatório", "imagens"));
  fs.writeFileSync(path.join(lib.root, "Trabalho", "Relatório", "imagens", "a.png"), "x");
  const real = fs.copyFileSync;
  let travou = 0;
  fs.copyFileSync = (...args) => {
    if (++travou <= 2) { const e = new Error("locked"); e.code = "EPERM"; throw e; }
    return real(...args);
  };
  try {
    const copy = lib.duplicateDeck(id);
    assert.equal(copy, "Trabalho/Relatório (cópia)/Relatório (cópia).yaml");
    assert.ok(fs.existsSync(path.join(lib.root, "Trabalho", "Relatório (cópia)", "imagens", "a.png")), "as imagens foram junto");
    assert.ok(travou >= 3, "tentou de novo em vez de desistir no primeiro EPERM");
  } finally { fs.copyFileSync = real; }
});

// rmSync/cpSync recursivos têm código nativo que no Windows mata o processo (0xC0000409) ou copia/apaga nada com
// caminho acentuado (nodejs/node#54476, #61878) — "Relatório (cópia)" é o caso da vida real. copyRetry/removeRetry
// caminham na mão (libuv) e toleram o travamento; este teste trava a remoção e usa acento nos dois caminhos.
test("apagar de vez pasta com acento no nome tolera o arquivo travado por um instante", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Ações");
  const id = lib.createDeck("Ações", deck("Relatório anual"));
  const slot = lib.trashDeck(id);
  const real = fs.unlinkSync;
  let travou = 0;
  fs.unlinkSync = (...args) => {
    if (++travou <= 1) { const e = new Error("locked"); e.code = "EBUSY"; throw e; }
    return real(...args);
  };
  try {
    lib.purgeDeck(slot);
    assert.ok(travou >= 2, "tentou de novo em vez de desistir no primeiro EBUSY");
  } finally { fs.unlinkSync = real; }
  assert.equal(lib.list().trash.length, 0);
  assert.ok(!fs.existsSync(path.join(lib.root, ".lixeira", slot)), "a pasta foi embora do disco");
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

test("pasta padrão: SAGADECK_HOME, senão Documentos\\sagadeck no Windows e ~/sagadeck fora dele", () => {
  assert.equal(defaultLibraryRoot({ SAGADECK_HOME: "D:/decks" }), path.resolve("D:/decks"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-home-")), docs = path.join(home, "OneDrive", "Documents");
  try {
    assert.equal(defaultLibraryRoot({}, { platform: "linux", home, documents: null }), path.join(home, "sagadeck"));
    assert.equal(defaultLibraryRoot({}, { platform: "win32", home, documents: docs }), path.join(docs, "sagadeck"), "Windows sem biblioteca antiga: Documentos");
    // biblioteca antiga com apresentações e ainda não movida: continua valendo (nunca abre vazia)
    fs.mkdirSync(path.join(home, "sagadeck", "Palestras"), { recursive: true });
    assert.equal(defaultLibraryRoot({}, { platform: "win32", home, documents: docs }), path.join(home, "sagadeck"));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("biblioteca antiga (~/sagadeck) vai para Documentos\\sagadeck uma vez, e o caminho antigo continua levando até ela", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-mig-")), docs = path.join(home, "OneDrive", "Documents");
  const opt = { platform: "win32", home, documents: docs };
  try {
    const deck = path.join(home, "sagadeck", "Palestras", "Minha", "Minha.yaml");
    fs.mkdirSync(path.dirname(deck), { recursive: true });
    fs.writeFileSync(deck, "title: Minha\nslides: []\n");
    const m = migrateLegacyLibrary({}, opt);
    assert.equal(m.moved, true, JSON.stringify(m));
    assert.ok(fs.existsSync(path.join(docs, "sagadeck", "Palestras", "Minha", "Minha.yaml")), "a apresentação está em Documentos");
    assert.equal(defaultLibraryRoot({}, opt), path.join(docs, "sagadeck"));
    assert.equal(fs.readFileSync(deck, "utf8"), "title: Minha\nslides: []\n", "o caminho antigo ainda chega ao arquivo (junção)");
    assert.equal(migrateLegacyLibrary({}, opt).skipped, "nada a mover", "a segunda vez não faz nada");
    assert.equal(migrateLegacyLibrary({ SAGADECK_HOME: "D:/x" }, opt).skipped, "SAGADECK_HOME");
    assert.equal(migrateLegacyLibrary({}, { ...opt, platform: "linux", documents: null }).skipped, "fora do Windows");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("pasta da biblioteca apagada por fora (Explorer, limpeza): volta a existir em vez de quebrar", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-lib-sumiu-"));
  const L = openLibrary(path.join(root, "usuarios", "ana"));   // já aberta, como no servidor
  fs.rmSync(root, { recursive: true, force: true });
  assert.deepEqual(L.list().decks, []);                        // antes: ENOENT scandir
  L.createTopic("Aulas");
  assert.deepEqual(L.list().topics.map((t) => t.name), ["Aulas"]);
  fs.rmSync(root, { recursive: true, force: true });           // e criar direto, sem listar antes
  L.createTopic("Palestras");
  assert.deepEqual(L.list().topics.map((t) => t.name), ["Palestras"]);
});

test("mover para 'sem tópico' vai para a pasta Sem tópico: na raiz só tópicos, nunca a pasta de uma apresentação", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Palestras");
  const id = lib.createDeck("Palestras", deck("Piloto IA"));
  const moved = lib.moveDeck(id, "");
  assert.equal(moved, "Sem tópico/Piloto IA/Piloto IA.yaml");
  const l = lib.list();
  assert.deepEqual(l.topics.map((t) => t.name).sort(), ["Palestras", "Sem tópico"]);
  assert.ok(!l.topics.some((t) => t.name === "Piloto IA"), "a pasta da apresentação não virou tópico");
  // um .yaml solto na raiz (deixado pelo Explorer) continua onde está, sem tópico
  fs.writeFileSync(path.join(lib.root, "solta.yaml"), YAML.stringify(deck("Solta")));
  assert.equal(byTitle(lib, "Solta").topic, "");
  assert.equal(lib.moveDeck("solta.yaml", ""), "solta.yaml", "já está sem tópico: não mexe");
});

test("geração em andamento é invisível: trabalha em pasta oculta e só aparece publicada", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Pedidos");
  const { dir, file } = lib.createStagingDeck("Pedidos");
  assert.ok(dir.includes(".gerando"), "pasta oculta de trabalho");
  assert.deepEqual(lib.list().decks, [], "nada a meio fazer aparece na biblioteca");
  // a IA escreve o deck e as imagens na pasta oculta…
  fs.mkdirSync(path.join(dir, "imagens"), { recursive: true });
  fs.writeFileSync(path.join(dir, "imagens", "ia-1.png"), "png");
  fs.writeFileSync(file, YAML.stringify(deck("Enchentes no Aricanduva", 3)));
  const id = lib.publishStagedDeck("Pedidos", dir, "Enchentes no Aricanduva");
  assert.equal(id, "Pedidos/Enchentes no Aricanduva/Enchentes no Aricanduva.yaml");
  assert.ok(fs.existsSync(path.join(lib.root, ...id.split("/"))));
  assert.ok(fs.existsSync(path.join(lib.root, "Pedidos", "Enchentes no Aricanduva", "imagens", "ia-1.png")), "imagens acompanham");
  assert.deepEqual(byTitle(lib, "Enchentes no Aricanduva").slides, 3);
});

test("publicar sem slides não publica nada; interromper vai para a lixeira (restaurável)", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Pedidos");
  const vazio = lib.createStagingDeck("Pedidos");
  fs.writeFileSync(vazio.file, YAML.stringify({ title: "x", slides: [] }));
  assert.throws(() => lib.publishStagedDeck("Pedidos", vazio.dir, "X"), /não produziu slides/);
  assert.deepEqual(lib.list().decks, [], "falha não deixa resto visível");
  const slot = lib.discardStaging("Pedidos", vazio.dir);
  assert.ok(lib.listTrash().some((t) => t.id === slot && t.staging), "na lixeira, visível");
  const id = lib.restoreDeck(slot);
  assert.match(id, /Pedidos\//, "restaura no tópico");
  assert.throws(() => lib.publishStagedDeck("Pedidos", "../fora", "X"), /inválida/, "pasta fora do .gerando não publica");
});

test("na subida, órfãs vão para a lixeira em vez de sumir ou sobrar para sempre", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Pedidos");
  const { dir, file } = lib.createStagingDeck("Pedidos");
  fs.writeFileSync(file, YAML.stringify(deck("Quase pronta", 5)));
  assert.deepEqual(lib.list().decks, []);
  const moved = lib.recoverStaging();
  assert.equal(moved.length, 1);
  assert.ok(!fs.existsSync(dir), "nada sobra na pasta temporária");
  assert.ok(lib.listTrash().some((t) => t.staging && t.slides === 5), "órfã na lixeira, recuperável");
  const id = lib.restoreDeck(moved[0]);
  assert.equal(byTitle(lib, "Quase pronta").slides, 5, "nada se perdeu");
});

// OneDrive segurando a pasta enquanto sincroniza: excluir, restaurar, mover e renomear tentam de novo em vez de falhar
test("pasta travada pelo OneDrive (EPERM/EBUSY por um instante): lixeira, restaurar, mover e renomear funcionam", () => {
  const lib = openLibrary(tmp());
  lib.createTopic("Aulas"); lib.createTopic("Outro");
  const real = fs.renameSync;
  let travas = 0;
  fs.renameSync = (...a) => { if (travas++ % 3 < 2) { const e = new Error("EBUSY: resource busy or locked"); e.code = travas % 2 ? "EBUSY" : "EPERM"; throw e; } return real(...a); };
  try {
    let id = lib.createDeck("Aulas", deck("Aula 1"));
    id = lib.moveDeck(id, "Outro");
    id = lib.renameDeck(id, "Aula renomeada");
    const slot = lib.trashDeck(id);
    assert.equal(lib.list().decks.length, 0);
    id = lib.restoreDeck(slot);
    assert.equal(lib.updateTopic("Outro", { name: "Outro nome" }), "Outro nome");
  } finally { fs.renameSync = real; }
  assert.deepEqual(lib.list().decks.map((d) => [d.title, d.topic]), [["Aula renomeada", "Outro nome"]]);
});

// A lixeira guarda pelo prazo escolhido em Preferências › Biblioteca (padrão 30 dias): excluída há uma hora continua
// restaurável; passou do prazo, é apagada do disco (não só escondida).
test("lixeira guarda pelo prazo das Preferências (padrão 30 dias) e depois apaga de vez", () => {
  const age = (lib, slot, ms) => {
    const meta = path.join(lib.root, ".lixeira", slot, ".origem.json");
    fs.writeFileSync(meta, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, "utf8")), deleted: Date.now() - ms }));
  };
  // um dia (a escolha de quem gera muito deck de teste)
  const curta = openLibrary(tmp(), { trashDays: 1 });
  curta.createTopic("Aulas");
  const recente = curta.trashDeck(curta.createDeck("Aulas", deck("Excluída agora há pouco")));
  const velha = curta.trashDeck(curta.createDeck("Aulas", deck("Excluída anteontem")));
  age(curta, recente, 3600e3);
  age(curta, velha, 2 * 864e5);
  assert.deepEqual(curta.list().trash.map((t) => t.title), ["Excluída agora há pouco"]);
  assert.equal(fs.existsSync(path.join(curta.root, ".lixeira", velha)), false, "apagada do disco, não só escondida");
  assert.equal(curta.list().trashDays, 1);
  // sem escolha: 30 dias (anteontem continua lá)
  assert.equal(TRASH_DAYS, 30);
  const padrao = openLibrary(tmp());
  padrao.createTopic("Aulas");
  const slot = padrao.trashDeck(padrao.createDeck("Aulas", deck("Excluída anteontem")));
  age(padrao, slot, 2 * 864e5);
  assert.deepEqual(padrao.list().trash.map((t) => t.title), ["Excluída anteontem"]);
  assert.equal(padrao.list().trashDays, 30);
});

// Quem administra o servidor manda a versão revisada para a biblioteca de outra pessoa (antes, à mão pelo terminal):
// apresentação nova com "(versão revisada)", pasta inteira (imagens, contexto/), sem a conversa, as versões e os
// avisos da criação de quem fez a cópia, e nunca por cima do que a outra pessoa já tem.
test("enviar cópia para outra biblioteca: pasta inteira, sem conversa/versões/avisos, título com sufixo, nunca sobrescreve", () => {
  const from = openLibrary(tmp()), to = openLibrary(tmp());
  const id = from.createDeck(from.createTopic("Aulas"), { ...deck("Hidráulica"), notes: "comentário" });
  const dir = path.dirname(from.resolveId(id));
  fs.mkdirSync(path.join(dir, "imagens"));
  fs.writeFileSync(path.join(dir, "imagens", "foto.png"), "png");
  fs.mkdirSync(path.join(dir, "contexto"));
  fs.writeFileSync(path.join(dir, "contexto", "apostila.md"), "# material");
  fs.mkdirSync(path.join(dir, ".sagadeck", "versoes"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".sagadeck", "lixeira"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".sagadeck", "versoes", "v1.yaml"), "title: velho");
  fs.writeFileSync(path.join(dir, ".sagadeck", "lixeira", "apagado.md"), "x");
  fs.writeFileSync(path.join(dir, ".sagadeck", "conversa.json"), "[]");
  fs.writeFileSync(path.join(dir, ".sagadeck", "avaliacao-geracao.json"), "{}");
  fs.writeFileSync(path.join(dir, ".sagadeck", "geracao.json"), JSON.stringify({ pedido: "aula" }));
  fs.writeFileSync(path.join(dir, "Hidráulica.conversa.json"), "[]");
  // o que a outra pessoa já tem com o mesmo nome continua intacto
  const mine = to.createDeck(to.createTopic("aulas"), deck("Hidráulica (versão revisada)", 7));
  const before = fs.readFileSync(to.resolveId(mine), "utf8");

  const sent = from.sendDeckTo(id, to);
  assert.equal(sent.title, "Hidráulica (versão revisada)");
  assert.equal(sent.id, "aulas/Hidráulica (versão revisada) (2)/Hidráulica (versão revisada) (2).yaml", "tópico de mesmo nome, nome livre");
  assert.equal(fs.readFileSync(to.resolveId(mine), "utf8"), before, "não sobrescreve");
  const out = path.dirname(to.resolveId(sent.id));
  const spec = YAML.parse(fs.readFileSync(to.resolveId(sent.id), "utf8"));
  assert.equal(spec.title, "Hidráulica (versão revisada)");
  assert.equal(spec.slides.length, 2);
  assert.equal(spec.notes, "comentário");
  assert.equal(fs.readFileSync(path.join(out, "imagens", "foto.png"), "utf8"), "png");
  assert.equal(fs.readFileSync(path.join(out, "contexto", "apostila.md"), "utf8"), "# material");
  assert.ok(fs.existsSync(path.join(out, ".sagadeck", "geracao.json")), "o pedido da criação vai junto");
  for (const gone of [".sagadeck/conversa.json", ".sagadeck/versoes", ".sagadeck/lixeira", ".sagadeck/avaliacao-geracao.json", "Hidráulica.conversa.json"]) {
    assert.ok(!fs.existsSync(path.join(out, ...gone.split("/"))), `${gone} fica de fora`);
  }
  // a original não mudou
  assert.equal(YAML.parse(fs.readFileSync(from.resolveId(id), "utf8")).title, "Hidráulica");
  assert.ok(fs.existsSync(path.join(dir, ".sagadeck", "conversa.json")));
  // mandar de novo: outra apresentação, sem "(versão revisada) (versão revisada)"
  const again = from.sendDeckTo(id, to);
  assert.notEqual(again.id, sent.id);
  const resent = to.sendDeckTo(sent.id, from);
  assert.equal(resent.title, "Hidráulica (versão revisada)", "o sufixo não dobra");
  assert.deepEqual(to.list().decks.map((d) => d.title).sort(), ["Hidráulica (versão revisada)", "Hidráulica (versão revisada)", "Hidráulica (versão revisada)"]);
  assert.throws(() => from.sendDeckTo(id, openLibrary(from.root)), /esta mesma/);
});
