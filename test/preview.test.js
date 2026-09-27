import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { startStudio } from "./helpers.js";

test("apresentação abre com imagem ausente e avisa sem bloquear os slides de API", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-preview-imagem-ausente-"));
  const file = path.join(dir, "aula.yaml");
  fs.writeFileSync(file, YAML.stringify({
    title: "Aula de API",
    slides: [
      { layout: "cover", title: "Revolucionando o Código", figure: { image: "images/ia-011c8dc4.png" } },
      { layout: "api", title: "Teste real", request: { url: "{{base}}/chat/completions" } },
    ],
  }));
  const studio = await startStudio(file);
  try {
    const preview = await fetch(`${studio.url}/preview`);
    const html = await preview.text();
    assert.equal(preview.status, 200);
    assert.match(html, /class="fig fig-pending fig-missing"/);
    assert.match(html, /data-layout="api"/);

    const status = await (await fetch(`${studio.url}/api/preview-status`)).json();
    assert.equal(status.ok, true);
    assert.ok(status.warnings.some((warning) => warning.includes("ia-011c8dc4.png")));

    const apiState = await (await fetch(`${studio.url}/api/http/state`)).json();
    assert.equal(apiState.live, true);
    assert.ok(apiState.envs.some((env) => env.name === "openrouter"));
  } finally {
    await studio.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
