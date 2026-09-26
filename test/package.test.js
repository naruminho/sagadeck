// Pacote da apresentação (.zip): YAML + tudo que ele usa do disco; descompactado em outro lugar, funciona igual.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { packDeck, unpackDeck, deckAssets, FORMAT_VERSION } from "../src/package.js";
import { buildHTML, loadSpec } from "../src/build.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function makeDeck() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-pack-"));
  const dir = path.join(root, "minha-palestra");
  fs.mkdirSync(path.join(dir, "imagens"), { recursive: true });
  fs.mkdirSync(path.join(dir, "widgets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "estilo.css"), ".meu-estilo { color: red }");
  fs.writeFileSync(path.join(dir, "widgets", "contador.js"), "window.__widgetCarregado = true;");
  fs.writeFileSync(path.join(dir, "imagens", "ia-123.png"), PNG);
  fs.writeFileSync(path.join(root, "logo-fora.png"), PNG); // fora da pasta do deck
  fs.writeFileSync(path.join(dir, "deck.yaml"), [
    "title: Minha palestra", "theme: bauhaus", "css: [estilo.css]", "widgets: [widgets/contador.js]", "slides:",
    "  - { layout: cover, title: Capa, figure: { image: imagens/ia-123.png } }",
    "  - { layout: full, image: ../logo-fora.png, title: Logo }",
    "  - { layout: split, title: Web, figure: { image: 'https://exemplo.com/foto.jpg' } }",
    "  - { layout: split, title: Falta, figure: { image: imagens/nao-existe.png } }",
  ].join("\n"));
  return { root, dir, file: path.join(dir, "deck.yaml") };
}

test("pacote leva o YAML e tudo que ele usa; descompactado em outro lugar, constrói sem avisos", async () => {
  const src = makeDeck();
  const spec = loadSpec(src.file);
  const { zip, files, missing } = await packDeck(spec, { baseDir: src.dir, name: "minha-palestra" });
  assert.deepEqual(files.sort(), ["assets/logo-fora.png", "estilo.css", "imagens/ia-123.png", "widgets/contador.js"]);
  assert.deepEqual(missing, ["imagens/nao-existe.png"]);

  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-unpack-"));
  const { file, manifest } = await unpackDeck(zip, dest);
  assert.equal(manifest.format, "sagadeck");
  assert.equal(manifest.version, FORMAT_VERSION);
  assert.equal(manifest.main, "minha-palestra.yaml");
  assert.equal(manifest.title, "Minha palestra");
  assert.equal(path.basename(file), "minha-palestra.yaml");
  const yaml = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(yaml, /_dir|_file/, "sem campos internos (caminhos da máquina de quem baixou)");
  assert.match(yaml, /assets\/logo-fora\.png/, "arquivo de fora da pasta foi para assets/ e o YAML aponta para lá");
  assert.match(fs.readFileSync(path.join(path.dirname(file), "FALTANDO.txt"), "utf8"), /nao-existe\.png/);

  // a parte que existe funciona: tira o slide cuja imagem nunca existiu e constrói
  const out = loadSpec(file);
  out.slides = out.slides.filter((s) => s.title !== "Falta");
  const built = buildHTML(out);
  assert.deepEqual(built.warnings.filter((w) => /não encontrado/.test(w)), []);
  assert.match(built.html, /\.meu-estilo/);
  assert.match(built.html, /__widgetCarregado/);
  assert.ok((built.html.match(/data:image\/png;base64/g) || []).length >= 2, "as duas imagens locais embutidas");
});

test("deckAssets ignora links da web e data: e não repete arquivos", () => {
  const src = makeDeck();
  const refs = deckAssets(loadSpec(src.file), src.dir).map((a) => a.ref);
  assert.ok(!refs.some((r) => /^https?:/.test(r)));
  assert.equal(new Set(refs).size, refs.length);
});

test("pacote malicioso (caminho saindo da pasta) é recusado", async () => {
  const z = new JSZip();
  z.file("deck.yaml", "slides: []");
  z.file("..\\..\\fora.txt", "x"); // barra invertida sobrevive no .zip (o JSZip limpa "../"): é o ataque real no Windows
  const buf = await z.generateAsync({ type: "nodebuffer" });
  await assert.rejects(unpackDeck(buf, fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-evil-"))), /sai da pasta/);
});

test("pacote sem .yaml é recusado com mensagem clara", async () => {
  const z = new JSZip();
  z.file("foto.png", PNG);
  await assert.rejects(unpackDeck(await z.generateAsync({ type: "nodebuffer" }), fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-noyaml-"))), /nenhuma apresentação/);
});

test("formato salvo por versão mais nova avisa para atualizar", async () => {
  const z = new JSZip();
  z.file("sagadeck.json", JSON.stringify({ format: "sagadeck", version: FORMAT_VERSION + 1, main: "d.yaml" }));
  z.file("d.yaml", "slides: []");
  await assert.rejects(unpackDeck(await z.generateAsync({ type: "nodebuffer" }), fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-new-"))), /versão mais nova do sagadeck/);
});

test("um .zip comum com um .yaml dentro também abre (sem manifesto)", async () => {
  const z = new JSZip();
  z.file("pasta/palestra.yaml", "title: X\nslides: [{ layout: statement, text: oi }]");
  const { file, manifest } = await unpackDeck(await z.generateAsync({ type: "nodebuffer" }), fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-plain-")));
  assert.equal(manifest, null);
  assert.equal(loadSpec(file).title, "X");
});
