// Gravar o deck sem estragar o arquivo: só os nós que mudaram são trocados (comentários e formatação do resto ficam
// idênticos), o resultado relido é igual ao deck (senão cai na escrita completa) e a troca é atômica (nunca fica
// um arquivo pela metade).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { writeDeckFile } from "../src/deck-file.js";
import { ROOT } from "./helpers.js";

const ORIGINAL = `# Minha palestra (comentário do topo)
title: Deck de teste
theme: bauhaus   # tema escolhido a dedo
slides:
  # ---- abertura ----
  - layout: cover
    title: "Título da capa"   # não mexer
    subtitle: Subtítulo
  - layout: cards
    kicker: Pilares
    title: Três pilares
    items:
      - { icon: shield, title: Seguro, text: Criptografia }   # linha em estilo compacto
      - { icon: zap, title: Rápido, text: Latência baixa }
  # ---- fim ----
  - layout: end
    title: Obrigado
`;

const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-file-")); const f = path.join(d, "deck.yaml"); fs.writeFileSync(f, ORIGINAL); return f; };
const clone = (o) => JSON.parse(JSON.stringify(o));

test("mudar um campo de um slide: só aquela linha muda; comentários e o resto do arquivo ficam idênticos", () => {
  const f = tmp();
  const spec = YAML.parse(ORIGINAL);
  spec.slides[1].title = "Dois pilares";
  writeDeckFile(f, spec);
  const out = fs.readFileSync(f, "utf8");
  assert.deepEqual(YAML.parse(out), spec);
  const diff = ORIGINAL.split("\n").filter((l, i) => l !== out.split("\n")[i]);
  assert.deepEqual(diff, ["    title: Três pilares"], "só a linha do título mudou");
});

test("inserir, apagar e reordenar slides preserva os slides intocados como estavam (com comentários)", () => {
  const f = tmp();
  const spec = YAML.parse(ORIGINAL);
  spec.slides.splice(1, 0, { layout: "statement", text: "Uma ideia nova" });
  spec.slides.splice(2, 1); // apaga os cards (depois do inserido)
  writeDeckFile(f, spec);
  const out = fs.readFileSync(f, "utf8");
  assert.deepEqual(YAML.parse(out), spec);
  assert.match(out, /# Minha palestra \(comentário do topo\)/);
  assert.match(out, /title: "Título da capa" {3}# não mexer/);
  assert.match(out, /theme: bauhaus {3}# tema escolhido a dedo/);
  assert.doesNotMatch(out, /Pilares/);
});

test("remover um campo e mudar um item de lista", () => {
  const f = tmp();
  const spec = YAML.parse(ORIGINAL);
  delete spec.slides[0].subtitle;
  spec.slides[1].items[1].text = "Latência baixíssima";
  writeDeckFile(f, spec);
  const out = fs.readFileSync(f, "utf8");
  assert.deepEqual(YAML.parse(out), spec);
  assert.match(out, /- \{ icon: shield, title: Seguro, text: Criptografia \} {3}# linha em estilo compacto/);
});

test("nada mudou: o arquivo continua byte a byte igual; campos internos (_) nunca vão para o arquivo", () => {
  const f = tmp();
  writeDeckFile(f, { ...YAML.parse(ORIGINAL), _dir: "x", _file: "y" });
  assert.equal(fs.readFileSync(f, "utf8"), ORIGINAL);
});

test("gravação atômica: não sobra temporário; arquivo novo ou com YAML quebrado é escrito inteiro", () => {
  const f = tmp();
  const spec = YAML.parse(ORIGINAL); spec.title = "Outro";
  writeDeckFile(f, spec);
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ["deck.yaml"]);
  fs.writeFileSync(f, "title: [quebrado\n");
  writeDeckFile(f, spec);
  assert.deepEqual(YAML.parse(fs.readFileSync(f, "utf8")), spec);
  const novo = path.join(path.dirname(f), "novo.yaml");
  writeDeckFile(novo, spec);
  assert.deepEqual(YAML.parse(fs.readFileSync(novo, "utf8")), spec);
});

test("muitas mudanças seguidas nos decks de exemplo: o arquivo relido é sempre igual ao deck", () => {
  for (const name of ["exemplo.yaml", "exemplo-prata.yaml", "ensaio-api.yaml", "cenario-e-ciencia.yaml"]) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-file-ex-")), f = path.join(d, "deck.yaml");
    fs.copyFileSync(path.join(ROOT, "templates", name), f);
    let spec = YAML.parse(fs.readFileSync(f, "utf8"));
    const muda = [
      (s) => { s.title = s.title + " (v2)"; },
      (s) => { s.slides[0].title = "Nova capa"; },
      (s) => { s.slides.splice(2, 1); },
      (s) => { s.slides.splice(1, 0, { layout: "statement", text: "Inserido" }); },
      (s) => { const x = s.slides.find((sl) => Array.isArray(sl.items)); if (x) x.items = x.items.slice().reverse(); },
      (s) => { s.slides.push(s.slides.shift()); },
      (s) => { delete s.slides[1].notes; s.slides[1].tone = "dark"; },
    ];
    for (const m of muda) {
      spec = clone(spec); m(spec);
      writeDeckFile(f, spec);
      assert.deepEqual(YAML.parse(fs.readFileSync(f, "utf8")), spec, `${name}`);
    }
  }
});

test("salvar pelo Studio preserva os comentários do arquivo e muda só o que mudou", { timeout: 30000 }, async () => {
  const { startStudio, tempDeck } = await import("./helpers.js");
  const d = tempDeck();
  const before = fs.readFileSync(d.file, "utf8");
  const studio = await startStudio(d.file);
  try {
    const { spec } = await (await fetch(`${studio.url}/api/deck`)).json();
    spec.slides[1].title = "Pilares revistos";
    const r = await fetch(`${studio.url}/api/deck`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec }) });
    assert.equal(r.status, 200);
    const after = fs.readFileSync(d.file, "utf8");
    assert.match(after, /^# Deck de teste da suíte/m, "o comentário do topo continua");
    // a primeira gravação também escreve a identidade de cada slide (uid: uma linha a mais por slide, uma vez só)
    const lines = after.split("\n").filter((l) => !/^\s+uid: s[a-z0-9]+$/.test(l));
    assert.equal(after.split("\n").length - lines.length, YAML.parse(after).slides.length, "um uid por slide");
    const changed = lines.filter((l, i) => l !== before.split("\n")[i]);
    assert.equal(changed.length, 1, changed.join("\n"));
    assert.match(changed[0], /Pilares revistos/);
    assert.doesNotMatch(after, /_dir|_file/, "campos internos não vão para o arquivo");
  } finally { await studio.close(); d.cleanup(); }
});

// Portátil: mudar a pasta de lugar ou mandar para outra pessoa não pode quebrar nada.
test("caminho absoluto para dentro da pasta do deck vira relativo ao gravar", () => {
  const f = tmp(), dir = path.dirname(f);
  const spec = YAML.parse(ORIGINAL);
  spec.slides[0].figure = { image: path.join(dir, "imagens", "capa.png") };
  spec.slides[1].background = { image: path.join(dir, "imagens", "fundo.jpg").split(path.sep).join("/") };
  spec.css = [path.join(dir, "estilo.css")];
  const fora = path.join(os.tmpdir(), "outra-pasta", "x.png");
  spec.slides[2].figure = { image: fora };
  writeDeckFile(f, spec);
  const out = YAML.parse(fs.readFileSync(f, "utf8"));
  assert.equal(out.slides[0].figure.image, "imagens/capa.png");
  assert.equal(out.slides[1].background.image, "imagens/fundo.jpg");
  assert.deepEqual(out.css, ["estilo.css"]);
  assert.equal(out.slides[2].figure.image, fora, "fora da pasta: fica como está (o .sagadeck empacotado traz para dentro)");
});

test("junção: o que a pessoa mexeu durante a resposta fica; o que só a IA mexeu entra; conflito, vale o da pessoa", async () => {
  await import("../src/studio/public/merge-decks.js");
  const { mergeDecks } = globalThis.SagadeckMerge;
  const base = { title: "T", theme: "sinal", slides: [{ layout: "cover", title: "A" }, { layout: "statement", text: "B" }, { layout: "end", title: "C" }] };
  const c = () => JSON.parse(JSON.stringify(base));
  // ninguém mexeu: vale a IA
  let ia = c(); ia.slides[0].title = "A2";
  assert.deepEqual(mergeDecks(base, c(), ia).deck, ia);
  // a pessoa mudou o título do deck e o slide 3; a IA mudou o slide 1: fica tudo
  let meu = c(); meu.title = "Meu"; meu.slides[2].title = "C meu";
  let r = mergeDecks(base, meu, ia);
  assert.deepEqual(r.deck, { ...base, title: "Meu", slides: [{ layout: "cover", title: "A2" }, base.slides[1], { layout: "end", title: "C meu" }] });
  assert.deepEqual(r.conflicts, []);
  // os dois mexeram no mesmo slide: vale o da pessoa, e o conflito é avisado
  meu = c(); meu.slides[0].title = "A meu";
  r = mergeDecks(base, meu, ia);
  assert.equal(r.deck.slides[0].title, "A meu");
  assert.deepEqual(r.conflicts, [0]);
  // a IA inseriu um slide e a pessoa só mexeu no título do deck: estrutura da IA + título da pessoa
  ia = c(); ia.slides.splice(1, 0, { layout: "number", value: 42 });
  meu = c(); meu.title = "Meu";
  r = mergeDecks(base, meu, ia);
  assert.equal(r.deck.slides.length, 4);
  assert.equal(r.deck.title, "Meu");
  // a IA inseriu e a pessoa mexeu num slide: aplica a inserção e mantém a edição da pessoa no slide certo
  meu = c(); meu.slides[2].title = "C meu";
  r = mergeDecks(base, meu, ia);
  assert.deepEqual(r.deck.slides.map((s) => s.title || s.value || s.text), ["A", 42, "B", "C meu"]);
  // campos internos (_dir) da pessoa continuam
  assert.equal(mergeDecks({ ...base }, { ...base, _dir: "x" }, ia).deck._dir, "x");
});

// Trava: deck EXISTENTE só é gravado por writeDeckFile (só o que mudou, atômico). Regravar o YAML inteiro com
// writeFileSync só é permitido para deck NOVO, nestes lugares conhecidos. Se este teste falhar, use writeDeckFile.
test("nenhum código regrava um deck existente com YAML inteiro (use writeDeckFile)", () => {
  const PERMITIDO = { // arquivo -> quantas gravações de deck novo ele tem (e por quê)
    "src/library.js": 2,        // createDeck e importOffice: pasta nova, nome único (nunca regrava um deck)
    "src/mcp/server.js": 2,     // create/scaffold: newDeckPath({ unique: true })
    "src/studio/server.js": 2,  // deck gerado pela IA (generateIntoLibrary) e original/original.yaml (cópia do original importado, para o Desfazer da revisão)
    "bin/sagadeck.js": 3,       // napkin -o, scaffold e new: arquivo novo
  };
  const achados = {};
  for (const dir of ["src", "bin"]) for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true }).filter((x) => x.endsWith(".js"))) {
    const rel = `${dir}/${f.split(path.sep).join("/")}`;
    const n = (fs.readFileSync(path.join(ROOT, dir, f), "utf8").match(/writeFileSync\([^)\n]*(toYaml|YAML\.stringify)/g) || []).length;
    if (n) achados[rel] = n;
  }
  assert.deepEqual(achados, PERMITIDO);
});

// OneDrive (e antivírus, indexador) seguram o arquivo por um instante enquanto sincronizam: o rename falha com
// EPERM/EBUSY/EACCES. O salvamento tenta de novo em vez de se perder; outro erro sobe na hora.
function travarRename(falhas, code) {
  const real = fs.renameSync;
  const calls = { n: 0 };
  fs.renameSync = (...a) => { calls.n++; if (calls.n <= falhas) { const e = new Error(`${code}: travado`); e.code = code; throw e; } return real(...a); };
  return { calls, restore: () => { fs.renameSync = real; } };
}

test("arquivo travado pelo OneDrive: o deck é gravado depois de algumas tentativas", () => {
  for (const code of ["EPERM", "EBUSY", "EACCES"]) {
    const f = tmp();
    const spec = YAML.parse(ORIGINAL);
    spec.title = `Gravado apesar do ${code}`;
    const trava = travarRename(3, code);
    try { assert.equal(writeDeckFile(f, spec), true); } finally { trava.restore(); }
    assert.equal(trava.calls.n, 4);
    assert.equal(YAML.parse(fs.readFileSync(f, "utf8")).title, `Gravado apesar do ${code}`);
    assert.deepEqual(fs.readdirSync(path.dirname(f)).filter((n) => n.endsWith(".tmp")), [], "sem temporário sobrando");
  }
});

test("rename com outro erro (não é trava) sobe na hora, sem esperar, e não deixa temporário", () => {
  const f = tmp();
  const spec = YAML.parse(ORIGINAL);
  spec.title = "Não grava";
  const trava = travarRename(99, "ENOSPC");
  try { assert.throws(() => writeDeckFile(f, spec), /ENOSPC/); } finally { trava.restore(); }
  assert.equal(trava.calls.n, 1);
  assert.equal(fs.readFileSync(f, "utf8"), ORIGINAL);
  assert.deepEqual(fs.readdirSync(path.dirname(f)).filter((n) => n.endsWith(".tmp")), []);
});

test("trava que não solta: desiste em ~4 s e devolve o erro", () => {
  const f = tmp();
  const spec = YAML.parse(ORIGINAL);
  spec.title = "Travado de vez";
  const trava = travarRename(99, "EPERM");
  const t0 = Date.now();
  try { assert.throws(() => writeDeckFile(f, spec), /EPERM/); } finally { trava.restore(); }
  assert.ok(trava.calls.n > 1 && trava.calls.n < 12, `tentativas: ${trava.calls.n}`);
  assert.ok(Date.now() - t0 < 6000);
  assert.equal(fs.readFileSync(f, "utf8"), ORIGINAL);
});

// Trava: todo rename do código passa por renameRetry (src/fs-retry.js); fs.renameSync direto volta a perder
// salvamentos com o OneDrive.
test("nenhum código usa fs.renameSync direto (use renameRetry)", () => {
  const achados = [];
  for (const dir of ["src", "bin"]) for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true }).filter((x) => x.endsWith(".js"))) {
    const rel = `${dir}/${f.split(path.sep).join("/")}`;
    if (rel === "src/fs-retry.js" || rel.includes("/public/")) continue;
    if (/\bfs\.renameSync\(/.test(fs.readFileSync(path.join(ROOT, dir, f), "utf8"))) achados.push(rel);
  }
  assert.deepEqual(achados, []);
});

// Trava: cópia e remoção de pasta do mesmo jeito (copyRetry/removeRetry); fs.cpSync e fs.rmSync recursivos
// têm código nativo que no Windows mata o processo (0xC0000409) ou copia/apaga NADA com caminho acentuado
// (nodejs/node#54476, #61878) — e ainda falham com o arquivo preso por um instante (flake do CI no "mover").
test("nenhum código usa fs.cpSync nem fs.rmSync recursivo direto (use copyRetry/removeRetry)", () => {
  const achados = [];
  for (const dir of ["src", "bin"]) for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true }).filter((x) => x.endsWith(".js"))) {
    const rel = `${dir}/${f.split(path.sep).join("/")}`;
    if (rel === "src/fs-retry.js" || rel.includes("/public/")) continue;
    const s = fs.readFileSync(path.join(ROOT, dir, f), "utf8");
    if (/\bfs\.cpSync\(/.test(s) || /\bfs\.rmSync\([^)]*recursive:\s*true/.test(s)) achados.push(rel);
  }
  assert.deepEqual(achados, []);
});

test("gravar o deck tolera o arquivo travado por mais de um segundo (antivírus/OneDrive no Windows)", () => {
  // a CI do Windows perdeu um salvamento: o rename deu EPERM por mais tempo que as tentativas (~1 s) e o teste do
  // formulário do slide api leu o deck sem a última mudança
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-trava-"));
  const file = path.join(dir, "deck.yaml");
  fs.writeFileSync(file, "title: Deck\nslides:\n  - { layout: cover, title: Antes }\n");
  const real = fs.renameSync, start = Date.now();
  fs.renameSync = (from, to) => {
    if (Date.now() - start < 1500) throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
    return real(from, to);
  };
  try {
    writeDeckFile(file, { title: "Deck", slides: [{ layout: "cover", title: "Depois" }] });
  } finally { fs.renameSync = real; }
  assert.match(fs.readFileSync(file, "utf8"), /Depois/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("mudar só o título não reformata o resto: texto longo que o arquivo quebrou em várias linhas fica como estava", () => {
  // na biblioteca, mudar o título de uma cópia regravou 558 linhas: a reemissão desfazia as quebras do YAML em 80
  // colunas (o formato que o próprio sagadeck grava) e cada texto longo "mudava"
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-largura-"));
  const file = path.join(dir, "deck.yaml");
  const longo = "Aplicação da equação de Bernoulli, critério de pressão mínima e dimensionamento de sifões em adutoras";
  const spec = { title: "Aula 5", slides: [{ layout: "cover", title: "Sifões", subtitle: longo }, { layout: "split", title: "Ideia", body: `${longo}. ${longo}.`, notes: `> ${longo}` }] };
  fs.writeFileSync(file, YAML.stringify(spec, { indent: 2 }));
  const before = fs.readFileSync(file, "utf8");
  assert.ok(before.split("\n").length > 8, "o texto longo foi quebrado em várias linhas");
  writeDeckFile(file, { ...spec, title: "Aula 5 (versão revisada)" });
  const after = fs.readFileSync(file, "utf8");
  const changed = after.split("\n").filter((l, i) => l !== before.split("\n")[i]);
  assert.deepEqual(changed, ["title: Aula 5 (versão revisada)"]);
  assert.deepEqual(YAML.parse(after), { ...spec, title: "Aula 5 (versão revisada)" });
  // arquivo escrito à mão com linha longa continua com a linha longa
  const hand = `title: Deck\nslides:\n  - layout: split\n    title: X\n    body: ${longo} ${longo}\n`;
  fs.writeFileSync(file, hand);
  writeDeckFile(file, { title: "Deck 2", slides: [{ layout: "split", title: "X", body: `${longo} ${longo}` }] });
  assert.equal(fs.readFileSync(file, "utf8"), hand.replace("title: Deck\n", "title: Deck 2\n"));
  fs.rmSync(dir, { recursive: true, force: true });
});
