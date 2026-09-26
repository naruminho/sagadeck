// Conversa em tempo real (WebSocket): o Studio faz a ponte com o serviço; na apresentação, falar (microfone
// falso do Chrome) ou digitar, ver a transcrição, ouvir a resposta e o registro das mensagens.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { newPage, startStudio } from "./helpers.js";
import { startMockApi, envFileFor } from "./mock-api.js";
import { ApiEnvironments } from "../src/api-client.js";

test("ponte: abre o WebSocket com o token do ambiente; recusa e endereço errado viram mensagens claras", async () => {
  const mock = await startMockApi();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-rt-")), "a.yaml");
  fs.writeFileSync(file, envFileFor(mock));
  const api = new ApiEnvironments(file);
  try {
    const r = await api.openRealtime({ url: "{{ws}}/realtime" });
    const got = [];
    r.conn.on("message", (m) => got.push(JSON.parse(m).type));
    r.conn.send(JSON.stringify({ type: "session.update", session: {} }));
    await new Promise((res) => setTimeout(res, 150));
    assert.deepEqual(got, ["session.updated"]);
    assert.equal(mock.state.tokensIssued, 1, "token do ambiente no cabeçalho");
    r.conn.close();
    mock.expireTokens();
    const q = await api.openRealtime({ url: "{{ws}}/realtime", auth: "query:token" }).catch((e) => e);
    assert.match(String(q.message || ""), /recusou a conexão \(HTTP 401\)/, "token vencido: o serviço recusa (o Studio reusa até renovar)");
    await assert.rejects(api.openRealtime({ url: "{{base}}/realtime" }), /precisa de ws:\/\/ ou wss:\/\//);
  } finally { await mock.close(); }
});

test("conversa em tempo real na apresentação", { timeout: 90000 }, async (t) => {
  const { findBrowser } = await import("../src/export/browser.js");
  let exe;
  try { exe = findBrowser(); } catch { return t.skip("sem Chrome/Edge"); }
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: exe, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const mock = await startMockApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-rt-"));
  const deck = path.join(dir, "rt.yaml");
  fs.writeFileSync(process.env.SAGADECK_AMBIENTES, envFileFor(mock));
  fs.writeFileSync(deck, YAML.stringify({ title: "Tempo real", slides: [
    { layout: "api", id: "voz", title: "Conversa", mode: "realtime", realtime: { url: "{{ws}}/realtime", open: [{ type: "session.update", session: { voice: "alloy" } }] } },
  ] }));
  const studio = await startStudio(deck);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/preview`, { width: 1920, height: 1080 });
    const s = `.slide[data-idx="0"]`;
    await p.waitForFunction(() => window.sagadeckApi && window.sagadeckApi.state.live);

    await t.test("antes de conectar: Conectar, microfone e texto desligados; abas Ao conectar, Mensagens, wscat", async () => {
      assert.match(await p.innerText(`${s} [data-api-run]`), /Conectar/);
      assert.equal(await p.isDisabled(`${s} [data-rt-mic]`), true);
      const tabs = await p.$$eval(`${s} [data-tab]`, (els) => els.map((e) => e.textContent));
      assert.deepEqual(tabs, ["Ao conectar", "Mensagens", "wscat", "Python", "Python comentado"]);
      await p.click(`${s} [data-tab="curl"]`);
      assert.match(await p.innerText(`${s} [data-pane="curl"]`), /wscat -c "ws:\/\/127\.0\.0\.1:\d+\/v1\/realtime"/);
    });

    await t.test("conectar: status conectado e a configuração vai ao serviço", async () => {
      await p.click(`${s} [data-api-run]`);
      await p.waitForSelector(`${s} [data-rt-mic]:not([disabled])`);
      assert.match(await p.innerText(`${s} .api-status`), /conectado/);
      assert.match(await p.innerText(`${s} [data-api-run]`), /Desconectar/);
      await p.click(`${s} [data-tab="log"]`);
      await p.waitForFunction((sel) => /session\.updated/.test(document.querySelector(`${sel} .api-log`).textContent), s);
      assert.match(await p.innerText(`${s} .api-log`), /session\.update/);
    });

    await t.test("falar: transcrição do que foi dito, resposta em texto e o áudio tocando", async () => {
      await p.click(`${s} [data-rt-mic]`);
      await p.waitForSelector(`${s} [data-rt-mic].rec`);
      await p.waitForTimeout(1200);
      await p.click(`${s} [data-rt-mic]`);
      await p.waitForSelector(`${s} .api-bub.user`, { timeout: 10000 });
      assert.match(await p.innerText(`${s} .api-bub.user`), /você falou por \d,\d s/);
      await p.waitForFunction((sel) => { const b = document.querySelector(`${sel} .api-bub.bot`); return b && !b.classList.contains("live") && /segundos de áudio/.test(b.textContent); }, s, { timeout: 10000 });
      assert.ok(mock.state.realtime.received.filter((x) => x === "input_audio_buffer.append").length >= 3, "o áudio foi em pedaços");
      assert.ok(mock.state.realtime.received.includes("input_audio_buffer.commit"));
      const log = await p.innerText(`${s} .api-log`);
      assert.match(log, /response\.audio\.delta ×4/, "pedaços de áudio viram uma linha só");
      assert.doesNotMatch(log, /[A-Za-z0-9+/]{300}/, "o áudio não despeja base64 no registro");
    });

    await t.test("digitar: vai como mensagem de texto e volta resposta", async () => {
      await p.fill(`${s} [data-rt-text]`, "qual o horário do workshop?");
      await p.press(`${s} [data-rt-text]`, "Enter");
      await p.waitForFunction((sel) => [...document.querySelectorAll(`${sel} .api-bub.bot`)].some((b) => /horário do workshop/.test(b.textContent) && !b.classList.contains("live")), s, { timeout: 10000 });
      const users = await p.$$eval(`${s} .api-bub.user`, (els) => els.map((e) => e.textContent));
      assert.equal(users.at(-1), "qual o horário do workshop?");
    });

    await t.test("desconectar: a conversa fica gravada e o áudio tocou", async () => {
      await p.click(`${s} [data-api-run]`);
      await p.waitForFunction(() => window.sagadeckApi.rtLast);
      const last = await p.evaluate(() => window.sagadeckApi.rtLast);
      assert.ok(last.played >= 8, `pedaços de áudio tocados: ${last.played}`);
      assert.equal(last.talk.length, 4);
      assert.equal(await p.isDisabled(`${s} [data-rt-mic]`), true);
      const rec = JSON.parse(fs.readFileSync(path.join(dir, "rt.respostas.json"), "utf8"));
      assert.equal(rec.voz.mode, "realtime");
      assert.equal(rec.voz.talk.length, 4);
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    await mock.close();
  }
});
