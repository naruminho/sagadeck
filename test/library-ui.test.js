// Biblioteca no Studio, de ponta a ponta (Chrome), e o modo multiusuário (uma biblioteca por usuário).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { browserOrSkip, newPage, startStudio } from "./helpers.js";
import { packDeck } from "../src/package.js";

test("biblioteca no Studio", { timeout: 240000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const studio = await startStudio(null); // sem deck: "/" é a biblioteca
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const lib = () => p.evaluate(async () => (await (await fetch("/api/library")).json()));
    const settle = (ms = 500) => p.waitForTimeout(ms);
    const dlgOk = async (value) => { await p.fill("#dlg-name", value); await p.click("#dlg-ok"); await settle(700); };

    await t.test("biblioteca vazia explica o que fazer e mostra onde fica a pasta", async () => {
      assert.match(await p.innerText("#main"), /Sua biblioteca está vazia/);
      assert.match(await p.innerText("#side"), new RegExp(path.basename(studio.library)));
    });

    await t.test("criar tópico (nome + cor) vira uma pasta de verdade", async () => {
      await p.click("[data-empty-topic]");
      await p.click('.sw[data-c="#0f6cbd"]');
      await dlgOk("Palestras");
      const l = await lib();
      assert.deepEqual(l.topics.map((x) => [x.name, x.color]), [["Palestras", "#0f6cbd"]]);
      assert.ok(fs.existsSync(path.join(studio.library, "Palestras")));
      assert.match(await p.innerText("#main"), /Nenhuma apresentação em Palestras/);
    });

    await t.test("nova em branco abre no editor e salva na pasta da biblioteca", async () => {
      await p.click("[data-empty-new]");
      await p.click('[data-new="blank"]');
      await Promise.all([p.waitForURL(/\/editor\?deck=/), dlgOk("Minha palestra")]);
      await p.waitForSelector("#rendered-slide-container .slide");
      assert.equal(await p.inputValue("#deck-title-input"), "Minha palestra");
      const file = path.join(studio.library, "Palestras", "Minha palestra", "Minha palestra.yaml");
      assert.ok(fs.existsSync(file));
      // editar no editor salva no arquivo da biblioteca
      await p.fill("#deck-title-input", "Minha palestra v2");
      await p.press("#deck-title-input", "Tab");
      await settle(1200);
      assert.match(fs.readFileSync(file, "utf8"), /title: Minha palestra v2/);
    });

    await t.test("voltar à biblioteca pelo ícone: cartão com capa de verdade", async () => {
      await Promise.all([p.waitForURL((u) => u.pathname === "/biblioteca"), p.click("#btn-library")]);
      await p.click('[data-view="recentes"]');
      await p.waitForSelector(".card[data-id] img");
      await p.waitForFunction(() => { const i = document.querySelector(".card[data-id] img"); return i && i.complete && i.naturalWidth > 100; }, null, { timeout: 30000 });
      assert.match(await p.innerText(".card[data-id] .name"), /Minha palestra v2/);
    });

    await t.test("renomear, duplicar e mover (arrastando para outro tópico)", async () => {
      await p.click("#new-topic"); await dlgOk("Trabalho");
      await p.click('[data-view="Palestras"]');
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="rename"]'); await dlgOk("Palestra final");
      assert.ok((await lib()).decks.some((d) => d.title === "Palestra final"));
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="dup"]'); await settle(700);
      assert.equal((await lib()).decks.length, 2);
      await p.dragAndDrop('.card[data-id]:not(.new-card) >> nth=0', '.nav[data-topic="Trabalho"]');
      await settle(900);
      const l = await lib();
      assert.deepEqual(l.topics.map((x) => [x.name, x.count]).sort(), [["Palestras", 1], ["Trabalho", 1]]);
    });

    await t.test("lixeira: excluir e restaurar", async () => {
      await p.click('[data-view="Trabalho"]');
      await p.click(".card[data-id] [data-more]"); await p.click('[data-a="trash"]'); await settle(700);
      assert.equal((await lib()).trash.length, 1);
      await p.click('[data-view="lixeira"]');
      await p.click("[data-restore]"); await settle(700);
      const l = await lib();
      assert.equal(l.trash.length, 0);
      assert.equal(l.decks.filter((d) => d.topic === "Trabalho").length, 1);
    });

    await t.test("baixar .sagadeck pelo menu do cartão e importar de volta", async () => {
      await p.click('[data-view="Trabalho"]');
      await p.click(".card[data-id] [data-more]");
      const [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-dl="sagadeck"]')]);
      assert.match(dl.suggestedFilename(), /\.sagadeck$/);
      const file = path.join(studio.library, "..", `baixado-${Date.now()}.sagadeck`);
      await dl.saveAs(file);
      await p.click("#btn-new"); await p.click('[data-new="import"]').catch(() => {});
      await p.setInputFiles("#import-input", file);
      await p.waitForFunction(() => document.querySelectorAll(".card[data-id]").length >= 2, null, { timeout: 10000 });
      assert.equal((await lib()).decks.filter((d) => d.topic === "Trabalho").length, 2);
    });

    await t.test("busca por título", async () => {
      await p.click('[data-view="todas"]');
      await p.fill("#q", "final");
      assert.ok((await p.locator(".card[data-id]").count()) >= 1);
      await p.fill("#q", "não existe nada assim");
      assert.match(await p.innerText("#main"), /Nada encontrado/);
      await p.fill("#q", "");
    });

    await t.test("Apresentar pelo cartão abre o editor já no modo apresentação", async () => {
      await p.click('[data-view="Palestras"]');
      await p.hover(".card[data-id]:not(.new-card)");
      await Promise.all([p.waitForURL(/\/editor\?deck=/), p.click(".card[data-id]:not(.new-card) [data-present]")]);
      await p.waitForSelector("#presentation-modal:not(.hidden)", { timeout: 15000 });
      await p.keyboard.press("Escape");
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
  }
});

test("multiusuário: cada usuário vê só a sua biblioteca; sem o cabeçalho do proxy, nada", async () => {
  const studio = await startStudio(null, { multiuser: true });
  try {
    const as = (user, p, body) => fetch(studio.url + p, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(user ? { "X-Sagadeck-User": user } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await as(null, "/api/library")).status, 401, "sem usuário: 401");
    assert.equal((await as(null, "/api/deck")).status, 401);
    await as("ana", "/api/library/topics", { name: "Aulas" });
    await as("ana", "/api/library/decks", { topic: "Aulas", title: "Da Ana" });
    await as("bia", "/api/library/decks", { topic: "", title: "Da Bia" });
    const ana = await (await as("ana", "/api/library")).json(), bia = await (await as("bia", "/api/library")).json();
    assert.deepEqual(ana.decks.map((d) => d.title), ["Da Ana"]);
    assert.deepEqual(bia.decks.map((d) => d.title), ["Da Bia"]);
    assert.equal(ana.user, "ana");
    assert.ok(fs.existsSync(path.join(studio.library, "usuarios", "ana", "Aulas", "Da Ana")));
    // o deck aberto também é por usuário
    await as("ana", "/api/library/open", { id: ana.decks[0].id });
    await as("bia", "/api/library/open", { id: bia.decks[0].id });
    assert.equal((await (await as("ana", "/api/deck")).json()).spec.title, "Da Ana");
    assert.equal((await (await as("bia", "/api/deck")).json()).spec.title, "Da Bia");
    // a Bia não abre o deck da Ana nem pelo id
    const r = await as("bia", "/api/library/open", { id: ana.decks[0].id });
    assert.equal(r.status, 400);
  } finally {
    await studio.close();
  }
});
