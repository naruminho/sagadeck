// Foco guiado ancorado pela visão (src/ai/ground.js): a recriação desenha as imagens depois da escrita e de novo
// depois da correção; o slide que a correção não mexeu era localizado outra vez (uma chamada de visão à toa por foco
// guiado, e a resposta podia sair diferente da primeira).
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { groundSpotlights } from "../src/ai/ground.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const spot = () => ({ layout: "spotlight", title: "A bacia no mapa", figure: { image: "imagens/mapa.png" }, hotspots: [{ x: 50, y: 50, width: 20, height: 20, title: "Exutório", text: "a saída" }] });

test("o mesmo foco guiado nas duas passadas (escrita e correção): a visão é chamada uma vez e a caixa é a mesma", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-ground-"));
  try {
    fs.mkdirSync(path.join(dir, "imagens")); fs.writeFileSync(path.join(dir, "imagens", "mapa.png"), PNG);
    let calls = 0;
    const ask = async () => { calls++; return `{"itens": [{"i": 1, "achou": true, "x": ${40 + calls}, "y": 30, "width": 4, "height": 4}]}`; };
    const memo = new Map();
    const a = [spot()], b = [spot()];
    await groundSpotlights(a, { baseDir: dir, ask, memo });
    await groundSpotlights(b, { baseDir: dir, ask, memo });
    assert.equal(calls, 1);
    assert.deepEqual([b[0].hotspots[0].x, b[0].hotspots[0].y], [41, 30]);
    // destaque diferente na mesma figura: olha de novo
    const c = [spot()]; c[0].hotspots[0].title = "Divisor";
    await groundSpotlights(c, { baseDir: dir, ask, memo });
    assert.equal(calls, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("figure como o caminho da imagem direto também é localizada; a visão que não responde é avisada (não some em silêncio)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-ground-"));
  try {
    fs.mkdirSync(path.join(dir, "imagens")); fs.writeFileSync(path.join(dir, "imagens", "mapa.png"), PNG);
    const a = [{ ...spot(), figure: "imagens/mapa.png" }];
    await groundSpotlights(a, { baseDir: dir, ask: async () => '{"itens": [{"i": 1, "achou": true, "x": 47.8, "y": 50.2, "width": 3.4, "height": 3.5}]}' });
    assert.deepEqual([a[0].hotspots[0].x, a[0].hotspots[0].y], [47.8, 50.2]);
    const fails = [], b = [spot()];
    await groundSpotlights(b, { baseDir: dir, ask: async () => "", onFail: (t, e) => fails.push(t) });
    assert.deepEqual(fails, ["A bacia no mapa"]);
    assert.equal(b[0].hotspots[0].x, 50, "a caixa da escrita fica");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("caixa do tamanho da figura inteira não destaca nada: fica a da escrita", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-ground-"));
  try {
    fs.mkdirSync(path.join(dir, "imagens")); fs.writeFileSync(path.join(dir, "imagens", "mapa.png"), PNG);
    const a = [spot()];
    await groundSpotlights(a, { baseDir: dir, ask: async () => '{"itens": [{"i": 1, "achou": true, "x": 0, "y": 0, "width": 100, "height": 100}]}' });
    assert.deepEqual([a[0].hotspots[0].x, a[0].hotspots[0].width], [50, 20]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
