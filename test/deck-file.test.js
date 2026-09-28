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
  for (const name of ["exemplo.yaml", "exemplo-keynote.yaml", "ensaio-api.yaml", "cenario/Texto no cenário.yaml"]) {
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
    const changed = after.split("\n").filter((l, i) => l !== before.split("\n")[i]);
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

test("o deck demo copiado para outra pasta monta sem faltar nada", async () => {
  const { buildHTML, loadSpec } = await import("../src/build.js");
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-copiado-"));
  fs.cpSync(path.join(ROOT, "templates", "cenario"), dest, { recursive: true });
  const { warnings } = buildHTML(loadSpec(path.join(dest, "Texto no cenário.yaml")));
  assert.deepEqual(warnings.filter((w) => /não encontrad/.test(w)), []);
});

// Junção a três (base = o deck quando a IA começou; meu = o que a pessoa tem agora; ia = o que a IA devolveu)
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
    "src/library.js": 1,        // createDeck: pasta nova, nome único
    "src/mcp/server.js": 2,     // create/scaffold: newDeckPath({ unique: true })
    "src/studio/server.js": 1,  // deck gerado pela IA (editor e biblioteca): pasta nova da biblioteca (generateIntoLibrary)
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
