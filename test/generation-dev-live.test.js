import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import "./isolate.js";
import { generateDeck } from "../src/ai/deck-ai.js";

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../src/studio/public/generation-guide.js", import.meta.url), "utf8"), sandbox);

test("IA real: Nova técnica usa Aurora Dev e preserva o cURL fornecido", { skip: process.env.SAGADECK_LIVE !== "1" && "defina SAGADECK_LIVE=1", timeout: 240000 }, async () => {
  const source = ['curl --request POST "https://api.exemplo.test/v1/echo" \\', '  --header "Content-Type: application/json" \\', '  --data-raw \'{"mensagem":"Olá, API"}\''].join("\n");
  const briefing = sandbox.window.SagaGenerationGuide.buildBriefing({
    intent: "apis", audience: "Desenvolvedores iniciantes", route: "explain", source,
    briefing: "Crie uma apresentação curta de 4 slides explicando este cURL. Inclua um slide code com o comando original exatamente como fornecido, inclusive espaços e quebras de linha. Só explique; não execute a chamada. A API é um exemplo fictício. Não invente resultado real.",
  });
  const result = await generateDeck(briefing, { style: "aurora-dev", slides: 4, images: false, research: false });
  assert.equal(result.spec.theme, "aurora-dev");
  assert.ok(result.spec.slides.some(slide => typeof slide.code === "string" && slide.code.trim() === source), "o comando fornecido deve estar copiável e intacto no deck");
});
