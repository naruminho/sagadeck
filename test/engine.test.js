// Motor (sem navegador): layouts, marcação, auto-correção, patch da IA, YAML.
// Rode com: npm test   (ou só esta parte: npm run test:unit)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LAYOUTS } from "../src/layouts.js";
import { renderSlide, buildHTML, wordCount, loadSpec } from "../src/build.js";
import { md, plain } from "../src/markup.js";
import { autofixSlide, recordAuto } from "../src/fiscal/autofix.js";
import { applyPatch, toYaml, countImagePrompts, extractYaml } from "../src/ai/deck-ai.js";
import { THEMES } from "../src/themes.js";
import { LAYOUT_INFO, LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { textToVisualSlide } from "../src/diagram/napkin.js";
import { NAPKIN_EXAMPLES } from "../src/diagram/napkin-examples.js";
import { fillTokens, formatDate } from "../src/chrome.js";
import { varietyReport, CREATIVE_DIRECTIONS, pickDirection } from "../src/ai/variety.js";
import { ROOT, FIXTURE } from "./helpers.js";

const spec = { title: "Teste", theme: "bauhaus", slides: [] };
const html = (slide) => renderSlide(slide, 0, spec).html;

// ---------------------------------------------------------------- layouts
test("todo layout tem nome, descrição e exemplo na galeria", () => {
  for (const name of Object.keys(LAYOUTS)) {
    assert.ok(LAYOUT_INFO[name], `LAYOUT_INFO sem "${name}" — a galeria mostraria o layout sem nome`);
    assert.ok(LAYOUT_SAMPLES[name], `LAYOUT_SAMPLES sem "${name}" — a galeria mostraria uma prévia vazia`);
  }
});

test("o exemplo de cada layout renderiza sem erro em todos os temas", () => {
  for (const theme of Object.keys(THEMES)) {
    for (const [name, sample] of Object.entries(LAYOUT_SAMPLES)) {
      const out = renderSlide(sample, 0, { ...spec, theme });
      assert.match(out.html, new RegExp(`data-layout="${name}"`), `${name} no tema ${theme}`);
    }
  }
});

test("layouts criativos desenham a estrutura própria", () => {
  assert.match(html(LAYOUT_SAMPLES.headline), /L-headline/);
  assert.match(html(LAYOUT_SAMPLES.bento), /bt-/);
  assert.equal((html(LAYOUT_SAMPLES.funnel).match(/fn-bar/g) || []).length >= 3, true, "funil com 3 etapas");
  assert.equal((html(LAYOUT_SAMPLES.pyramid).match(/py-bar/g) || []).length >= 3, true, "pirâmide com 3 níveis");
  assert.match(html(LAYOUT_SAMPLES.agenda), /ag-/);
});

test("página inteira: image_prompt sem imagem vira placeholder (não some)", () => {
  const out = html({ layout: "full", image_prompt: "uma sala de controle", title: "X" });
  assert.match(out, /fig-pending/);
});

test("página inteira: figura desenhada com texto à esquerda não fica por baixo do texto", () => {
  assert.match(html({ layout: "full", figure: { icon: "star" }, title: "X", overlay: "left" }), /fl-shift/);
  assert.doesNotMatch(html({ layout: "full", image: "https://exemplo.com/foto.jpg", title: "X", overlay: "left" }), /fl-shift/);
});

test("página inteira e manchete não têm rodapé", () => {
  for (const layout of ["full", "headline"]) {
    const out = buildHTML({ title: "Rodapé visível", theme: "bauhaus", slides: [{ layout, text: "A", title: "A", figure: { icon: "star" } }] }).html;
    const section = out.slice(out.indexOf("<section"), out.indexOf("</section>"));
    assert.doesNotMatch(section, /Rodapé visível/, layout);
  }
});

// ---------------------------------------------------------------- marcação e destaque
test("marcação inline", () => {
  assert.equal(md("**a**"), "<b>a</b>");
  assert.equal(md("==a=="), "<mark>a</mark>");
  assert.equal(md("^^a^^"), '<span class="em">a</span>');
  assert.equal(md("~~a~~"), "<s>a</s>");
  assert.equal(plain("**a** ==b== ^^c^^"), "a b c");
});

test("markStyle muda o estilo do ==destaque== (deck e slide)", () => {
  const deck = { ...spec, markStyle: "sublinhado" };
  assert.match(renderSlide({ layout: "statement", text: "==x==" }, 0, deck).html, /ms-sublinhado/);
  assert.match(renderSlide({ layout: "statement", text: "==x==", markStyle: "cor" }, 0, deck).html, /ms-cor/);
  assert.doesNotMatch(renderSlide({ layout: "statement", text: "==x==" }, 0, spec).html, /ms-/);
});

// ---------------------------------------------------------------- auto-correção
test("auto-correção registra o que mudou em `auto` (campo, antes, motivo)", () => {
  const before = { layout: "statement", text: "a", titleSize: 110 };
  const after = { ...before, titleSize: 86 };
  const log = recordAuto(before, after, ["Reduzido titleSize"]);
  assert.equal(log.length, 1);
  assert.deepEqual({ campo: log[0].campo, antes: log[0].antes, por: log[0].por }, { campo: "titleSize", antes: 110, por: "auto-correção" });
  // uma segunda mudança no mesmo campo mantém o valor ORIGINAL (para o desfazer voltar ao início)
  const log2 = recordAuto({ ...after, auto: log }, { ...after, titleSize: 70 }, ["de novo"]);
  assert.equal(log2.length, 1);
  assert.equal(log2[0].antes, 110);
});

test("auto-correção de sobreposição fica registrada no slide", () => {
  const slide = { layout: "statement", text: "Uma frase" };
  const r = autofixSlide(slide, spec, [{ kind: "sobreposicao", text: "x" }]);
  assert.ok(r.modified);
  assert.ok(r.slide.auto?.some((e) => e.campo === "titleSize"), JSON.stringify(r.slide.auto));
});

test("auto-correção não mutila título (sem cortar em 5 palavras nem inserir ==destaque==)", () => {
  const title = "Um sistema de detecção de fraudes que aprende com cada caso analisado pela equipe";
  const r = autofixSlide({ layout: "cards", title, items: [{ title: "a" }, { title: "b" }] }, spec, []);
  const t = r.slide.title ?? title;
  assert.doesNotMatch(t, /==/);
  assert.ok(t.split(/\s+/).length > 5, `título cortado: "${t}"`);
});

test("o registro `auto` não conta como palavras do slide", () => {
  const s = { layout: "statement", text: "duas palavras" };
  assert.equal(wordCount({ ...s, auto: [{ campo: "text", antes: "muitas outras palavras aqui", motivo: "x y z" }] }), wordCount(s));
});

// ---------------------------------------------------------------- IA: patch e YAML
test("applyPatch: troca, insere e apaga slides pelo número", () => {
  const base = { title: "D", slides: [{ layout: "statement", text: "1" }, { layout: "statement", text: "2" }, { layout: "statement", text: "3" }] };
  const { spec: out } = applyPatch(base, {
    deck: { theme: "prata" },
    slides: { 2: { layout: "statement", text: "dois" } },
    insert: [{ after: 0, slide: { layout: "section", title: "novo" } }],
    delete: [3],
  });
  assert.equal(out.theme, "prata");
  assert.deepEqual(out.slides.map((s) => s.text ?? s.title), ["novo", "1", "dois"]);
  assert.throws(() => applyPatch(base, { slides: { 9: { layout: "statement" } } }), /não existe/);
});

test("extractYaml acha o bloco yaml na resposta do LLM", () => {
  const r = extractYaml("Mudei o título.\n```yaml\nslides:\n  1:\n    layout: cover\n```\n");
  assert.match(r.yaml, /layout: cover/);
  assert.equal(r.prose, "Mudei o título.");
});

test("toYaml esconde campos internos (_dir, _file)", () => {
  const y = toYaml({ title: "x", _dir: "/tmp", _file: "/tmp/a.yaml", slides: [] });
  assert.doesNotMatch(y, /_dir|_file/);
});

test("countImagePrompts acha pedidos de imagem em qualquer nível", () => {
  assert.equal(countImagePrompts({ slides: [{ layout: "full", image_prompt: "a" }, { layout: "split", figure: { image_prompt: "b" } }] }), 2);
});

// ---------------------------------------------------------------- decks reais
test("o deck de teste e os exemplos do pacote constroem sem erro", () => {
  const files = [FIXTURE, ...fs.readdirSync(path.join(ROOT, "templates")).filter((f) => f.endsWith(".yaml")).map((f) => path.join(ROOT, "templates", f))];
  for (const f of files) {
    const out = buildHTML(loadSpec(f));
    assert.ok(out.html.includes("<section"), f);
  }
});

// ---------------------------------------------------------------- diagrama de texto (regras locais, sem IA)
test("diagrama de texto: cada exemplo vira o layout certo e renderiza", () => {
  for (const [key, ex] of Object.entries(NAPKIN_EXAMPLES)) {
    const { slide } = textToVisualSlide(ex.text, {});
    assert.equal(slide.layout, ex.layout, key);
    assert.doesNotThrow(() => html(slide), key);
  }
});

test("diagrama de texto: saída só com campos que os layouts leem", () => {
  for (const [key, ex] of Object.entries(NAPKIN_EXAMPLES)) {
    const json = JSON.stringify(textToVisualSlide(ex.text, {}).slide);
    assert.doesNotMatch(json, /"(desc|cards|step)":/, `${key}: ${json}`); // step = animação por clique que ninguém pediu
    assert.doesNotMatch(json, /PILARES FUNDAMENTAIS|FLUXO DE TRABALHO|Processo manual lento/, `${key}: conteúdo inventado`);
  }
});

test("diagrama de texto: preserva o conteúdo (números e frases inteiras)", () => {
  const stats = JSON.stringify(textToVisualSlide(NAPKIN_EXAMPLES.stats.text, {}).slide);
  assert.match(stats, /R\$ 8,4 mi/);
  const steps = textToVisualSlide(NAPKIN_EXAMPLES.steps.text, {}).slide.steps;
  assert.equal(steps[0].title, "Cliente abre chamado pelo app");
  const tl = textToVisualSlide(NAPKIN_EXAMPLES.timeline.text, {}).slide.events;
  assert.deepEqual(tl.map((e) => e.when), ["2019", "2021", "2023", "2026"]);
});

// ---------------------------------------------------------------- QR code
test("QR code: figura e campo qr do encerramento viram SVG; sem link, erro claro", () => {
  assert.match(html({ layout: "blocks", content: [{ qr: "https://exemplo.com", label: "Site" }] }), /qr-svg[\s\S]*Site/);
  assert.match(html({ layout: "end", title: "Obrigado", qr: "https://linkedin.com/in/x", qrLabel: "LinkedIn" }), /qr-svg/);
  assert.throws(() => html({ layout: "blocks", content: [{ qr: " " }] }), /informe o texto ou link/);
});

test("markStyle vale também na apresentação/exportação (buildHTML), não só no editor", () => {
  const out = buildHTML({ title: "x", theme: "bauhaus", markStyle: "sublinhado", slides: [{ layout: "statement", text: "==a==" }, { layout: "statement", text: "==b==", markStyle: "cor" }] }).html;
  assert.match(out, /<section[^>]*ms-sublinhado/);
  assert.match(out, /<section[^>]*ms-cor/);
});

// ---------------------------------------------------------------- cabeçalho e rodapé

test("rodapé padrão continua título + número", () => {
  const out = renderSlide({ layout: "statement", text: "x" }, 2, { title: "Meu deck", theme: "bauhaus", slides: [{}, {}, {}] }).html;
  assert.match(out, /class="foot[^"]*"[^>]*>.*Meu deck.*>03</s);
  assert.doesNotMatch(out, /headbar/);
});

test("rodapé e cabeçalho com variáveis e máscara de data", () => {
  const spec = { title: "Deck", author: "Narumi", event: "Summit", department: "Dados", date: "2026-03-07", slides: [{}, {}, {}, {}] };
  assert.equal(fillTokens("{autor} · {evento} · {depto}", spec, 0, 4), "Narumi · Summit · Dados");
  assert.equal(fillTokens("{n} / {total} — {pagina}", spec, 1, 4), "2 / 4 — 02");
  assert.equal(fillTokens("{data}", spec, 0, 4), "07/03/2026");
  assert.equal(fillTokens("{data:DD MMM AAAA}", spec, 0, 4), "07 mar 2026");
  assert.equal(fillTokens("{data:MMMM 'YY}", spec, 0, 4), "março '26");
  assert.equal(formatDate("hoje", "AAAA").length, 4);
  const out = renderSlide({ layout: "statement", text: "x" }, 1, { ...spec, theme: "bauhaus",
    footer: { left: "{autor}", center: "{evento}", right: "{n}/{total}" }, header: { right: "{depto} · {data:MM/AAAA}" } }).html;
  assert.match(out, /bar-left[^>]*>Narumi</);
  assert.match(out, /bar-center[^>]*>Summit</);
  assert.match(out, /bar-right[^>]*>2\/4</);
  assert.match(out, /headbar[\s\S]*Dados · 03\/2026/);
});

test("footer: false tira rodapé; capa não tem rodapé nem cabeçalho", () => {
  assert.doesNotMatch(renderSlide({ layout: "statement", text: "x" }, 0, { title: "D", footer: false, slides: [{}] }).html, /class="foot/);
  const cover = renderSlide({ layout: "cover", title: "x" }, 0, { title: "D", header: { left: "Confidencial" }, slides: [{}] }).html;
  assert.doesNotMatch(cover, /class="(foot|headbar)/);
});

// ---------------------------------------------------------------- interface do Studio
test("todo ícone usado na interface existe no pacote de ícones (scripts/vendor-ui-icons.mjs)", () => {
  const pub = path.join(ROOT, "src", "studio", "public");
  const src = ["index.html", "app.js", "slide-form.js", "library.html", "library.js"].filter((f) => fs.existsSync(path.join(pub, f))).map((f) => fs.readFileSync(path.join(pub, f), "utf8")).join("\n");
  const have = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(pub, "ui-icons.js"), "utf8").match(/UI_ICONS = (\{.*\});/s)[1])));
  const used = new Set([...src.matchAll(/data-ic="([a-z0-9-]+)"/g)].map((m) => m[1]));
  used.delete("nome"); // exemplo num comentário
  const missing = [...used].filter((n) => !have.has(n));
  assert.deepEqual(missing, [], "adicione em NAMES de scripts/vendor-ui-icons.mjs e rode o script");
});

// ---------------------------------------------------------------- variedade (anti-repetição)
const card = (t) => ({ layout: "cards", title: t, items: [{ title: "a" }, { title: "b" }] });

test("variedade: deck repetitivo é apontado com o motivo", () => {
  const v = varietyReport({ slides: [{ layout: "cover" }, card(1), card(2), card(3), card(4), { layout: "list" }, { layout: "list" }, { layout: "end" }] });
  assert.equal(v.ok, false);
  const all = v.problems.join(" | ");
  assert.match(all, /4 slides seguidos no mesmo layout \(cards, slides 2–5\)/);
  assert.match(all, /layouts diferentes/);
  assert.match(all, /listas\/cartões/);
  assert.match(all, /nenhum slide de impacto/);
  assert.match(all, /mesmo tom/);
});

test("variedade: deck variado passa (inclusive o deck de teste)", () => {
  const v = varietyReport({ slides: [{ layout: "cover" }, { layout: "headline" }, card(1), { layout: "number", tone: "dark" }, { layout: "timeline" },
    { layout: "compare" }, { layout: "question" }, { layout: "bento" }, { layout: "end" }] });
  assert.deepEqual(v.problems, []);
  assert.equal(varietyReport(loadSpec(FIXTURE)).ok, true);
});

test("direções criativas: várias, e o sorteio cobre todas", () => {
  assert.ok(CREATIVE_DIRECTIONS.length >= 5);
  const seen = new Set(CREATIVE_DIRECTIONS.map((_, k) => pickDirection((k + 0.5) / CREATIVE_DIRECTIONS.length)));
  assert.equal(seen.size, CREATIVE_DIRECTIONS.length);
});

test("API Python: studio escuta só nesta máquina por padrão e aceita a pasta da biblioteca", () => {
  const api = fs.readFileSync(new URL("../python/sagadeck/api.py", import.meta.url), "utf8");
  const sig = api.match(/def studio\(([\s\S]*?)\) -> None:/)[1];
  assert.match(sig, /host: str = "127\.0\.0\.1"/);
  assert.match(sig, /library:/);
  assert.match(api, /--library=/);
});
