// Execução rastreada: o Python simples (src/pytrace.js) roda o código do professor e grava cada passo; o layout algo
// desenha as estruturas pelo tipo (src/trace-view.js); o catálogo (src/algo-catalog.js) traz buscas em texto,
// grafos e árvore prontos.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { runProgram, PyError } from "../src/pytrace.js";
import { CATALOG } from "../src/algo-catalog.js";
import { tracePlan } from "../src/trace-view.js";
import { buildHTML, renderSlide } from "../src/build.js";
import { browserOrSkip, newPage, startStudio, tempDeck, novoSlide } from "./helpers.js";

const result = (src, call) => runProgram(src, { call }).steps.at(-1).ret;

test("Python simples: recursão, classes, compreensões, dicionário, conjunto, fatias, f-string, deque e heapq", () => {
  assert.equal(result("def fat(n):\n    return 1 if n <= 1 else n * fat(n - 1)", "fat(6)"), "720");
  assert.equal(result("def f(v):\n    return [x * x for x in v if x % 2 == 1]", "f([1, 2, 3, 4, 5])"), "[1, 9, 25]");
  assert.equal(result("def f(s):\n    c = {}\n    for ch in s:\n        c[ch] = c.get(ch, 0) + 1\n    return sorted(c.items(), key=lambda p: -p[1])[0]", "f('banana')"), "('a', 3)");
  assert.equal(result("def f(v):\n    return v[::-1], v[1:3], len({1, 2, 2, 3})", "f([1, 2, 3, 4])"), "([4, 3, 2, 1], [2, 3], 3)");
  assert.equal(result("def f(n):\n    x = 7\n    return f'{n} e {x * 2} e {3.14159:.2f}'", "f(1)"), "'1 e 14 e 3.14'");
  assert.equal(result("from collections import deque\ndef f():\n    q = deque([1, 2])\n    q.append(3)\n    q.appendleft(0)\n    return q.popleft(), list(q)", "f()"), "(0, [1, 2, 3])");
  assert.equal(result("import heapq\ndef f(v):\n    h = []\n    for x in v:\n        heapq.heappush(h, x)\n    return [heapq.heappop(h) for _ in range(len(h))]", "f([5, 1, 4, 2])"), "[1, 2, 4, 5]");
  assert.equal(result("class P:\n    def __init__(self, x):\n        self.x = x\n    def dobro(self):\n        return self.x * 2\ndef f():\n    return P(21).dobro()", "f()"), "42");
  assert.equal(result("def f(a, b=10):\n    total = 0\n    i = 0\n    while True:\n        i += 1\n        if i > 5:\n            break\n        if i % 2 == 0:\n            continue\n        total += i\n    return total + b, 7 // 2, -7 // 2, -7 % 3, 2 ** 10, 7 / 2", "f(0)"), "(19, 3, -4, 2, 1024, 3.5)");
  const out = runProgram("print('oi', 1 + 1)\nfor i in range(2):\n    print(i)").output;
  assert.deepEqual(out, ["oi 2", "0", "1"]);
});

test("Python simples: erro claro com a linha (índice, laço sem fim, nome, import, sintaxe) e sem acesso a nada de fora", () => {
  const err = (src, call) => { try { runProgram(src, { call }); } catch (e) { assert.ok(e instanceof PyError, e.message); return e.message; } assert.fail("devia falhar"); };
  assert.match(err("v = [1, 2]\nx = v[5]"), /linha 2: índice 5 fora da lista/);
  assert.match(err("while True:\n    x = 1"), /laço sem fim/);
  assert.match(err("def f():\n    return y", "f()"), /linha 2: "y" não existe/);
  assert.match(err("import os"), /módulo os não é suportado/);
  assert.match(err("x = (1, 2"), /linha 1/);
  assert.match(err("x = input()"), /input\(\) não existe/);
  assert.match(err("x = open('a.txt')"), /"open" não existe/);
  assert.match(err("x = __import__('os')"), /"__import__" não existe/);
  assert.match(err("def f(n):\n    return f(n + 1)", "f(0)"), /recursão funda demais/);
});

test("rastro: linha, variáveis por chamada, leituras e escritas, comparação igual/diferente, legenda do comentário com {expressão}", () => {
  const src = "def troca(v):\n    if v[0] > v[1]:\n        v[0], v[1] = v[1], v[0]  # agora v[0] = {v[0]}\n    return v";
  const { steps } = runProgram(src, { call: "troca([3, 1])", watch: ["v[0] + 1"] });
  const call = steps.find((s) => s.kind === "call");
  assert.equal(call.frames.at(-1).name, "troca");
  assert.deepEqual(call.frames.at(-1).params, ["v"]);
  const test_ = steps.find((s) => s.kind === "test");
  assert.equal(test_.line, 2);
  assert.equal(test_.text, "v[0] > v[1] → 3 > 1: sim.");
  assert.equal(test_.reads.length, 2, "leu v[0] e v[1]");
  const sw = steps.find((s) => s.line === 3);
  assert.equal(sw.text, "agora v[0] = 1", "o comentário vira legenda com o valor");
  assert.deepEqual(sw.writes.map((w) => w[1]), [0, 1]);
  const ref = sw.frames.at(-1).vars.v.ref;
  assert.deepEqual(sw.heap[ref].items, [1, 3]);
  assert.equal(sw.watch["v[0] + 1"], 2, "expressão observada a cada passo");
  const m = runProgram("def f(a, b):\n    return a[0] == b[0], a[1] == b[1]", { call: "f('xy', 'xz')" }).steps.find((s) => s.kind === "return");
  assert.deepEqual(m.matches.map((x) => x.eq), [true, false]);
  // a legenda não recalcula o que tem efeito colateral (pop, função do programa)
  const q = runProgram("def f(v):\n    if v.pop() > 1:\n        return len(v)", { call: "f([1, 2, 3])" });
  assert.equal(q.steps.at(-1).ret, "2", "o pop rodou uma vez só");
});

test("catálogo: as buscas em texto acham o mesmo que a busca ingênua; BFS, Dijkstra e árvore dão o resultado certo", () => {
  const find = (k, s) => { const p = tracePlan({ algorithm: k, ...s }); return runProgram(p.program, { call: p.call }).steps.at(-1).ret; };
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 40; n++) {
    const text = Array.from({ length: 6 + Math.floor(rnd() * 14) }, () => "ab"[Math.floor(rnd() * 2)]).join("");
    const pattern = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => "ab"[Math.floor(rnd() * 2)]).join("");
    const truth = [];
    for (let i = 0; i + pattern.length <= text.length; i++) if (text.slice(i, i + pattern.length) === pattern) truth.push(i);
    const want = `[${truth.join(", ")}]`;
    for (const k of ["naive", "kmp", "quicksearch"]) assert.equal(find(k, { text, pattern }), want, `${k} em "${text}" / "${pattern}"`);
  }
  assert.equal(find("bfs", {}), "['A', 'B', 'C', 'D', 'E', 'F']");
  assert.equal(find("bfs", { graph: { 1: [2, 3], 2: [4], 3: [4], 4: [] }, start: 1 }), "[1, 2, 3, 4]");
  assert.equal(find("dijkstra", {}), "{'A': 0, 'B': 3, 'C': 1, 'D': 8}");
  const bst = tracePlan({ algorithm: "bst", array: [5, 3, 8] });
  const last = runProgram(bst.program, { call: bst.call }).steps.at(-1);
  assert.equal(last.ret, "No(5)");
  for (const k of Object.keys(CATALOG)) assert.ok(CATALOG[k].name && CATALOG[k].area && CATALOG[k].program, k);
});

test("layout algo com programa: barras, casas com ponteiro e padrão alinhado, tabela, grafo e árvore; código e variáveis; erro vira aviso", () => {
  const ctx = { warnings: [] };
  const sort = renderSlide({ layout: "algo", title: "x", program: "def s(v):\n    for i in range(len(v) - 1):\n        if v[i] > v[i + 1]:\n            v[i], v[i + 1] = v[i + 1], v[i]\n    return v", call: "s([3, 1, 2])" }, 0, ctx).html;
  assert.match(sort, /L-trace/); assert.match(sort, /algo-bars/, "lista de números lida por índice vira barras");
  assert.match(sort, /class="algo-bar swp"/, "troca anima");
  assert.match(sort, /<span class="tr-ptr">i<\/span>/, "i aprendido como ponteiro de v");
  assert.match(sort, /tr-frame now/); assert.match(sort, /<dd class="chg">/, "variável que mudou acende");
  assert.match(sort, /<li class="now">/);
  const kmp = renderSlide({ layout: "algo", algorithm: "kmp", text: "abab", pattern: "ab" }, 0, ctx).html;
  assert.match(kmp, /tr-cell[^"]*under/, "padrão desenhado sob o texto");
  assert.match(kmp, /tr-cell eq/); assert.match(kmp, /tr-cell ne/);
  assert.match(kmp, /class="tr-ptr" style="grid-column:\d+">q/);
  const qs = renderSlide({ layout: "algo", algorithm: "quicksearch" }, 0, ctx).html;
  assert.match(qs, /tr-table tr-horiz/, "tabela de saltos");
  const bfs = renderSlide({ layout: "algo", algorithm: "bfs" }, 0, ctx).html;
  assert.match(bfs, /tr-k-graph/); assert.match(bfs, /tr-node[^"]*ok/, "visitado em verde"); assert.match(bfs, /tr-edge hot/, "aresta da vez");
  const dj = renderSlide({ layout: "algo", algorithm: "dijkstra" }, 0, ctx).html;
  assert.match(dj, /class="tr-weight"/, "peso na aresta");
  const tree = renderSlide({ layout: "algo", algorithm: "bst", array: [5, 3, 8, 1] }, 0, ctx).html;
  const lastTree = tree.split('data-lesson-panel="').at(-1);
  assert.equal((lastTree.match(/<g class="tr-node/g) || []).length, 4, "a árvore do fim tem os 4 nós");
  const grid = renderSlide({ layout: "algo", program: "def f(n):\n    t = [[0] * n for _ in range(n)]\n    for i in range(n):\n        t[i][i] = 1\n    return t", call: "f(3)" }, 0, ctx).html;
  assert.match(grid, /tr-k-grid/, "lista de listas vira grade");
  const chain = renderSlide({ layout: "algo", program: "class N:\n    def __init__(self, v, p):\n        self.v = v\n        self.prox = p\ndef f():\n    c = N(3, N(2, N(1, None)))\n    return c", call: "f()" }, 0, ctx).html;
  assert.match(chain, /marker-end="url\(#tr-arrow\)"/, "lista ligada com setas");
  assert.deepEqual(buildHTML({ title: "x", slides: Object.keys(CATALOG).map((k) => ({ layout: "algo", algorithm: k })) }).warnings, []);
  const badSlide = { layout: "algo", program: "def f():\n    return v[3]", call: "f()" };
  assert.match(renderSlide(badSlide, 0, ctx).html, /dyn-error/);
  assert.match(buildHTML({ title: "x", slides: [badSlide] }).warnings.join(" "), /linha 2: "v" não existe/);
  const own = renderSlide({ layout: "algo", algorithm: "program" }, 0, { warnings: [] }).html;
  assert.match(own, /soma/, "Meu código sem programa ainda mostra um exemplo");
});

test("apresentação: passo a passo do rastro anda com a seta e com o Tocar, sem erro", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "tr.html");
    const built = buildHTML({ title: "T", slides: [{ layout: "algo", title: "BFS", algorithm: "bfs", speed: 150 }, { layout: "algo", title: "Árvore", algorithm: "bst", array: [4, 2, 6] }] });
    assert.deepEqual(built.warnings, []);
    fs.writeFileSync(file, built.html);
    const { page: p, errors } = await newPage(browser, null, { width: 1600, height: 900 });
    await p.goto(pathToFileURL(file).href);
    await p.waitForFunction(() => window.sagadeck && window.sagadeck.cur >= 0);
    const n = await p.evaluate(() => window.sagadeck.steps(0));
    assert.ok(n > 20, `BFS tem passos (${n})`);
    const active = () => p.evaluate(() => +document.querySelector('section[data-idx="0"] .lesson-panel.active').dataset.lessonPanel);
    await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
    assert.equal(await active(), 2);
    await p.click('section[data-idx="0"] [data-autoplay]');
    await p.waitForTimeout(700);
    assert.ok(await active() > 3, "o Tocar anda sozinho");
    await p.click('section[data-idx="0"] [data-autoplay]');
    await p.evaluate(() => window.sagadeck.goto(1, 9999));
    const nodes = await p.locator('section[data-idx="1"] .lesson-panel.active .tr-node').count();
    assert.equal(nodes, 3, "no último passo a árvore tem os três nós");
    const box = await p.locator('section[data-idx="1"] .lesson-panel.active .tr-svg').boundingBox();
    assert.ok(box && box.width > 100 && box.height > 100, "a árvore aparece");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test("Studio: escolher Meu código (Python) no formulário, escrever o programa e a chamada grava no deck e desenha", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deckFile = tempDeck(), studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    await p.waitForSelector(".thumb-card");
    await novoSlide(p, "algo");
    const idx = saved().slides.findIndex((s) => s.layout === "algo");
    await p.locator("#slide-fields-form .sf-field").filter({ hasText: "Algoritmo" }).locator("select").first().selectOption("program");
    const prog = p.locator("#slide-fields-form .sf-field").filter({ hasText: "Programa (Python simples)" }).locator("textarea").first();
    await prog.waitFor();
    await prog.fill("def dobra(v):\n    for i in range(len(v)):\n        v[i] = v[i] * 2  # v[{i}] virou {v[i]}\n    return v");
    await prog.blur();
    const call = p.locator("#slide-fields-form .sf-field").filter({ hasText: "Chamada" }).locator("input").first();
    await call.fill("dobra([1, 2, 3])"); await call.blur();
    for (let k = 0; k < 40 && saved().slides[idx].call !== "dobra([1, 2, 3])"; k++) await p.waitForTimeout(100);
    assert.match(saved().slides[idx].program, /def dobra/);
    assert.equal(saved().slides[idx].call, "dobra([1, 2, 3])");
    await p.waitForSelector("#rendered-slide-container .L-trace .algo-bars");
    assert.ok(await p.locator("#rendered-slide-container .L-trace .algo-caption").count());
    assert.deepEqual(errors, []);
  } finally { await studio.close(); await browser.close(); deckFile.cleanup(); }
});
