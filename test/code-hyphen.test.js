import "./isolate.js";
// Rodada de uso real (23/10/2026): no guia de Git, o cartão "Esqueci um arquivo no commit" mostrava
// "git commit --amend --no-" numa linha e "edit" na outra. Quem copia do slide digita um comando que não existe.
// No navegador de verdade: o código que quebra linha não quebra depois de hífen, e o texto copiado é o mesmo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const ITEMS = [
  { title: "Commitei com a mensagem errada", code: 'git commit --amend \\\n  -m "nova mensagem"' },
  { title: "Esqueci um arquivo no commit", code: "git add arquivo.txt\ngit commit --amend --no-edit" },
  { title: "Quero desfazer o último commit", text: "Com --soft, mantendo as alterações preparadas; com --hard, descartando tudo.", code: "git reset --soft HEAD^\ngit reset --hard HEAD" },
  { title: "Tirei um arquivo do index sem querer", code: "git restore --staged arquivo.txt" },
  { title: "Apaguei um arquivo e quero ele de volta", code: "git restore --source=HEAD~1 arquivo.txt" },
  { title: "O merge deu conflito e quero desistir", code: "git merge --abort" },
  { title: "O merge já foi commitado e quero voltar", code: "git reset --hard ORIG_HEAD" },
  { title: "Preciso desfazer um commit que já foi enviado", code: "# troque 4f2a1c pelo commit que quer desfazer\ngit revert 4f2a1c" },
];

test("código que quebra linha não quebra depois do hífen (dossier do guia de Git), e copiar dá o comando certo", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { openDeck, writeDeckHTML } = await import("../src/export/browser.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-hifen-"));
  try {
    const file = path.join(dir, "d.html");
    writeDeckHTML(file, buildHTML({ title: "Git", theme: "manual", slides: [{ layout: "dossier", kicker: "Cola rápida", title: "Deu errado: o comando para cada situação", items: ITEMS }] }).html);
    const { browser: b, page } = await openDeck(file);
    try {
      const blocks = await page.evaluate(() => [...document.querySelectorAll(".adaptive-code")].map((pre) => {
        // as linhas como aparecem na tela: cada caractere pela altura em que foi desenhado
        const rows = new Map(), r = document.createRange();
        const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) for (let i = 0; i < c.length; i++) { r.setStart(c, i); r.setEnd(c, i + 1); const rect = r.getBoundingClientRect(); if (!rect.width && c.data[i] !== " ") continue; const y = Math.round(rect.top); rows.set(y, (rows.get(y) || "") + c.data[i]); } else walk(c); } };
        walk(pre);
        return { copied: pre.innerText, rows: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s) };
      }));
      assert.equal(blocks.length, ITEMS.length);
      for (const [i, blk] of blocks.entries()) {
        assert.equal(blk.copied.replace(/\n$/, ""), ITEMS[i].code, "o texto copiado é o código, sem caractere escondido");
        for (const row of blk.rows.slice(0, -1)) assert.doesNotMatch(row, /\S-$/, `linha cortada no hífen: ${JSON.stringify(blk.rows)}`);
      }
      // a coluna é estreita de verdade: algum comando passou para a linha de baixo (senão o teste não prova nada)
      assert.ok(blocks.some((blk, i) => blk.rows.length > ITEMS[i].code.split("\n").length), JSON.stringify(blocks.map((x) => x.rows)));
    } finally { await b.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
