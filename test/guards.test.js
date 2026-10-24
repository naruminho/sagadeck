// Travas de qualidade que não dependem de ferramenta externa:
//  - os três arquivos grandes do Studio não podem crescer mais (código novo vai para um módulo próprio: history.js,
//    visual-keys.js, instance.js, table.js…). Diminuiu? Baixe o limite junto.
//  - todo ajuste visual que o motor entende (src/visual-edits.js) está na lista da referência (a IA e o
//    inspetor falam a mesma língua).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { ROOT, listenSafe, unsafeForBrowser } from "./helpers.js";

test("servidor de teste nunca fica numa porta que o Chrome bloqueia (a CI do Windows entregou a 10080)", async () => {
  assert.ok(unsafeForBrowser(10080) && unsafeForBrowser(6667) && unsafeForBrowser(80));
  assert.ok(!unsafeForBrowser(3517) && !unsafeForBrowser(54321));
  const ports = [10080, 6000, 41234], seen = [];
  let current;
  const fake = { listen: (_p, _h, cb) => { current = ports.shift(); seen.push(current); cb(); }, address: () => ({ port: current }), close: (cb) => cb() };
  assert.equal(await listenSafe(fake), 41234);
  assert.deepEqual(seen, [10080, 6000, 41234]);
});

const LIMITS = { // bytes
  "src/studio/public/app.js": 240_000,
  "src/studio/server.js": 100_000,
  "src/studio/public/slide-form.js": 109_200,
};

test("monolitos do Studio não crescem (o novo vai para um módulo próprio)", () => {
  for (const [file, max] of Object.entries(LIMITS)) {
    const size = fs.statSync(path.join(ROOT, file)).size;
    assert.ok(size <= max, `${file}: ${size} bytes (limite ${max}). Tire uma parte para um módulo novo em vez de aumentar o limite.`);
  }
});

test("todo ajuste visual do motor está na referência", () => {
  const code = fs.readFileSync(path.join(ROOT, "src", "visual-edits.js"), "utf8");
  const keys = [...new Set([...code.matchAll(/\be\.([a-zA-Z]+)/g)].map((m) => m[1]))];
  const ref = fs.readFileSync(path.join(ROOT, "docs", "REFERENCIA.md"), "utf8");
  const list = ref.match(/Os ajustes de objeto ficam em `visualEdits` \(`([^`]+)`\)/)?.[1] || "";
  const documented = new Set(list.split(/[,\s:|]+/).filter(Boolean));
  assert.deepEqual(keys.filter((k) => !documented.has(k)), []);
});

// Todo arquivo de teste roda isolado das configurações de quem roda (biblioteca, Preferências, IA, ambientes): ou
// importa o helpers.js, ou o isolate.js. Um teste da lixeira leu as Preferências reais (lixeira em 1 dia) e falhou só
// numa máquina.
test("todo arquivo de teste carrega o isolamento (helpers.js ou isolate.js)", () => {
  const dir = path.join(ROOT, "test");
  const faltam = fs.readdirSync(dir).filter((f) => f.endsWith(".test.js"))
    .filter((f) => !/from\s+["']\.\/helpers\.js["']|import\s+["']\.\/isolate\.js["']/.test(fs.readFileSync(path.join(dir, f), "utf8")));
  assert.deepEqual(faltam, []);
  assert.equal(process.env.SAGADECK_TEST_ISOLATED, "1");
  assert.ok(process.env.SAGADECK_PREFERENCIAS.startsWith(os.tmpdir()), process.env.SAGADECK_PREFERENCIAS);
});

// Quem gera pelo caminho do Studio (generateForStudio) passa pela revisão dos slides, que abre um navegador: o teste
// tem que fechá-lo (closeSnapshots), senão o processo fica pendurado para sempre (a avaliação ao vivo ficou dias aberta).
test("testes que geram pelo caminho do Studio fecham o navegador da revisão", () => {
  const dir = path.join(ROOT, "test");
  const faltam = fs.readdirSync(dir).filter((f) => f.endsWith(".test.js"))
    .filter((f) => { const s = fs.readFileSync(path.join(dir, f), "utf8"); return /generateForStudio/.test(s) && !/closeSnapshots/.test(s); });
  assert.deepEqual(faltam, []);
});

// Decisão de quem mantém o projeto: o código e a documentação não citam o programa de apresentações da maçã nem a
// empresa (o tema prata se descreve pelo que é). Ficam só os nomes técnicos: a fonte do sistema no CSS e a
// identificação de navegador da pesquisa. As palavras vêm em pedaços para este arquivo não se acusar.
test("nenhuma menção ao programa de apresentações da maçã no código e na documentação", () => {
  const proibido = new RegExp([["key", "note"], ["ap", "ple(?!-system|webkit)"], ["\\bi", "phone"], ["\\bi", "pad\\b"], ["pense ", "diferente"]]
    .map((p) => p.join("")).join("|"), "i");
  // só o que está no repositório (sobras locais, como .artifacts/, não contam); bibliotecas de terceiros ficam de fora
  const arquivos = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean)
    .filter((f) => !/(^|\/)(vendor|fonts)\//.test(f));
  const texto = /\.(js|mjs|cjs|css|html|md|mdc|yaml|yml|json|py|txt|toml)$|(^|\/)\.cursorrules$/;
  const achados = [];
  for (const f of arquivos) {
    if (proibido.test(f)) achados.push(f);
    const p = path.join(ROOT, f);
    if (!texto.test(f) || !fs.existsSync(p) || fs.statSync(p).size > 5_000_000) continue;
    fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((linha, i) => { if (proibido.test(linha)) achados.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(achados, []);
});

// Fotos geradas pela IA nos testes ao vivo caíam na pasta atual (o repositório) e entraram em commits das versões
// 1.11.2 e 1.11.3. O repositório não guarda imagens de deck: a pasta fica fora do git e a bateria roda num temporário.
test("imagens geradas pela IA nunca entram no repositório", () => {
  const tracked = execFileSync("git", ["ls-files", "imagens"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(tracked, "", "imagens/ na raiz do repositório está no git");
  assert.match(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8"), /^\/imagens\/$/m);
  assert.match(fs.readFileSync(path.join(ROOT, "test", "ai-live.test.js"), "utf8"), /process\.chdir\(fs\.mkdtempSync\(/, "a bateria ao vivo roda numa pasta temporária");
});

// O teste das identidades clicava em Configurar e abria uma janela de verdade do Explorador na pasta temporária; a
// pasta era apagada e a janela ficava na Temp. Em dois dias, 19 janelas, ~6 GB e muita CPU: a máquina toda lenta.
// Todo explorer.exe do Studio passa por src/studio/reveal.js, que nunca abre nos testes.
test("o Explorador do Windows só abre por reveal.js, e nunca nos testes", async () => {
  const { reveal } = await import("../src/studio/reveal.js");
  assert.equal(process.env.SAGADECK_TEST_ISOLATED, "1");
  assert.equal(reveal("C:\qualquer", { platform: "win32" }), false, "nos testes, não abre janela");
  assert.equal(reveal("/tmp", { platform: "linux", env: {} }), false, "fora do Windows, não há Explorador");
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "vendor") walk(p); } else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } };
  walk(path.join(ROOT, "src"));
  const outros = files.filter((f) => !f.endsWith(path.join("studio", "reveal.js")) && /explorer\.exe/i.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(outros.map((f) => path.relative(ROOT, f)), [], "abra pelo reveal (src/studio/reveal.js)");
});
