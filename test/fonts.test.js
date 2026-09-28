// Fontes dos temas embutidas (OFL, vindas do @fontsource): nada de fonts.googleapis.com. Na rede de uma empresa
// (proxy barrando o Google) o tema perdia a letra, abrir/exportar podia ficar esperando a fonte, e cada abertura da
// apresentação avisava o Google. Agora a apresentação funciona 100% offline, com a letra certa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { THEMES } from "../src/themes.js";
import { ROOT, browserOrSkip, startStudio } from "./helpers.js";

const COVER = { layout: "cover", title: "Título da capa", subtitle: "Subtítulo" };

test("nenhum tema pede fonte à internet; cada deck leva só as fontes que os temas dele usam", () => {
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "src", "runtime", "base.css"), "utf8"), /@import|url\(\s*["']?https?:/, "base.css sem pedido externo");
  for (const theme of Object.keys(THEMES)) {
    const { html } = buildHTML({ theme, slides: [COVER] });
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, `tema ${theme} pede fonte ao Google`);
  }
  const rabisco = buildHTML({ theme: "rabisco", slides: [COVER] }).html;
  for (const f of ["Caveat", "Patrick Hand"]) assert.match(rabisco, new RegExp(`@font-face\\{font-family:'${f}';[^}]*src:url\\(data:font/woff2;base64,`), `rabisco leva ${f}`);
  const sinal = buildHTML({ theme: "sinal", slides: [COVER] }).html;
  assert.doesNotMatch(sinal, /font-family:'Caveat'/, "sinal não carrega a fonte do rabisco");
  // tema de um slide só também traz a fonte dele
  assert.match(buildHTML({ theme: "sinal", slides: [COVER, { ...COVER, theme: "pop" }] }).html, /@font-face\{font-family:'Fredoka'/);
});

test("offline de verdade: com a internet cortada, o rabisco desenha com Caveat", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const externos = [];
    await p.route("**/*", (r) => (/^(file|data):/.test(r.request().url()) ? r.continue() : (externos.push(r.request().url()), r.abort())));
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-fontes-")), "d.html");
    fs.writeFileSync(file, buildHTML({ theme: "rabisco", slides: [COVER] }).html);
    await p.goto("file://" + file);
    await p.evaluate(() => document.fonts.ready);
    const ok = await p.evaluate(() => ["700 60px Caveat", "400 30px 'Patrick Hand'"].map((f) => document.fonts.check(f) && [...document.fonts].some((ff) => ff.status === "loaded" && f.includes(ff.family.replace(/"/g, "")))));
    assert.deepEqual(ok, [true, true], "fontes carregadas do próprio arquivo");
    assert.deepEqual(externos, [], "nenhum pedido para fora");
  } finally { await browser.close(); }
});

test("Studio: as fontes dos temas vêm do próprio Studio (fonts.css), sem Google", async () => {
  const studio = await startStudio(null);
  try {
    const css = await (await fetch(studio.url + "/fonts.css")).text();
    for (const f of ["Caveat", "Patrick Hand", "Comic Neue", "Plus Jakarta Sans", "Fredoka", "Inter"]) assert.match(css, new RegExp(`font-family:'${f}'`), f);
    for (const page of ["index.html", "library.html"]) assert.match(fs.readFileSync(path.join(ROOT, "src", "studio", "public", page), "utf8"), /href="fonts\.css"/, page);
  } finally { await studio.close(); }
});
