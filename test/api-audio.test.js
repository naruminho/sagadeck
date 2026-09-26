// Slide "api" com áudio: TTS (a resposta toca, com a onda) e STT (grava do microfone e envia).
// O microfone é o falso do Chrome (--use-fake-device-for-media-stream).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { newPage, startStudio } from "./helpers.js";
import { startMockApi, envFileFor } from "./mock-api.js";
import "../src/runtime/api-core.js";

const C = globalThis.SagadeckApiCore;

test("código do TTS salva o áudio; STT com microfone conta como slide de arquivo", () => {
  const tts = { audio: "fala.mp3", request: { url: "u/tts", body: { text: "oi" } } };
  assert.match(C.code(tts, "curl", {}).code, /--output "fala\.mp3"/);
  assert.match(C.code(tts, "python", {}).code, /open\("fala\.mp3", "wb"\)\.write\(resposta\.content\)/);
  assert.doesNotMatch(C.code(tts, "python", {}).code, /resposta\.json\(\)/);
  assert.ok(C.usesFile({ mic: true, request: { url: "u", form: { audio: "@file" } } }));
  assert.equal(C.normalize({ audio: true, request: { url: "u" } }).audio, "fala.mp3");
});

test("TTS e STT na apresentação", { timeout: 120000 }, async (t) => {
  const { findBrowser } = await import("../src/export/browser.js");
  let exe;
  try { exe = findBrowser(); } catch { return t.skip("sem Chrome/Edge"); }
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: exe, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const mock = await startMockApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-audio-"));
  const deck = path.join(dir, "audio.yaml");
  fs.writeFileSync(process.env.SAGADECK_AMBIENTES, envFileFor(mock));
  fs.writeFileSync(deck, YAML.stringify({ title: "Áudio", slides: [
    { layout: "api", id: "tts", title: "TTS", audio: "fala.wav", request: { url: "{{base}}/tts", body: { text: "Bom dia, pessoal" } } },
    { layout: "api", id: "stt", title: "STT", mic: true, request: { url: "{{base}}/stt", form: { audio: "@file", idioma: "pt-BR" } }, answer: "$.text" },
  ] }));
  const studio = await startStudio(deck);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/preview`, { width: 1920, height: 1080 });
    await p.waitForFunction(() => window.sagadeckApi && window.sagadeckApi.state.live);

    await t.test("TTS: a resposta em áudio vira um player que toca, com a onda desenhada", async () => {
      const s = `.slide[data-idx="0"]`;
      await p.click(`${s} [data-api-run]`);
      await p.waitForSelector(`${s} .api-audio audio`);
      assert.match(await p.getAttribute(`${s} .api-audio audio`, "src"), /^data:audio\/wav;base64,UklGR/);
      assert.ok(await p.$(`${s} .api-audio canvas`));
      await p.waitForFunction((sel) => { const a = document.querySelector(`${sel} .api-audio audio`); return a && a.duration > 0.3; }, s, { timeout: 10000 });
      assert.match(await p.innerText(`${s} .api-status`), /200/);
    });

    await t.test("STT: grava do microfone, mostra o nível, envia sozinho ao parar e mostra a transcrição", async () => {
      await p.evaluate(() => window.sagadeck.goto(1, 0));
      const s = `.slide[data-idx="1"]`;
      await p.click(`${s} [data-api-mic]`);
      await p.waitForSelector(`${s} [data-api-mic].rec`);
      assert.equal(await p.isVisible(`${s} .api-level`), true, "o medidor de volume aparece");
      await p.waitForTimeout(900);
      await p.click(`${s} [data-api-mic]`);
      await p.waitForSelector(`${s} .api-answer`, { timeout: 15000 });
      assert.match(await p.innerText(`${s} .api-answer`), /transcrição de gravacao\.(webm|ogg|m4a) \(audio\//);
      assert.match(await p.innerText(`${s} .api-file-name`), /gravacao\./);
      assert.equal(await p.isVisible(`${s} .api-level`), false);
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    await mock.close();
  }
});
