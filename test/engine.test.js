// Motor (sem navegador): layouts, marcação, auto-correção, patch da IA, YAML.
// Rode com: npm test   (ou só esta parte: npm run test:unit)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LAYOUTS } from "../src/layouts.js";
import { renderSlide, buildHTML, wordCount, loadSpec } from "../src/build.js";
import { md, plain } from "../src/markup.js";
import { autofixSlide, recordAuto } from "../src/fiscal/autofix.js";
import { applyPatch, toYaml, countImagePrompts, extractYaml } from "../src/ai/deck-ai.js";
import { THEMES } from "../src/themes.js";
import { LAYOUT_INFO, LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { displayCodeLanguage, inferCodeLanguage, normalizeCodeLanguage, resolveCodeLanguage } from "../src/code-language.js";
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

test("código guiado preserva código literal, destaques, etapas e resumo estático", () => {
  const out = html({ layout: "codewalk", title: "Aula", code: "if (a < 2) {\n  return '<script>literal</script>';\n}", steps: [
    { title: "Condição", text: "Compare o valor", highlight: [1], output: "<resultado>" },
    { title: "Retorno", highlight: [2], output: "Final" },
  ] });
  assert.match(out, /data-lesson-count="2"/);
  assert.match(out, /data-highlight="\[2\]"/);
  assert.match(out, /a <span class="tok tok-operator">&lt;<\/span> <span class="tok tok-number">2/);
  assert.match(out, /&lt;script&gt;literal&lt;\/script&gt;/);
  assert.doesNotMatch(out, /<script>literal/);
  assert.match(out, /Saída esperada · simulação/);
  assert.match(out, /lesson-summary/);
  assert.match(out, /data-lesson-go="1"/);
});

test("linguagens de código são inferidas pela extensão e aceitam aliases comuns", () => {
  assert.equal(inferCodeLanguage("src/exemplo.py"), "Python");
  assert.equal(inferCodeLanguage("C:\\aulas\\Main.java"), "Java");
  assert.equal(inferCodeLanguage("api.mjs"), "JavaScript");
  assert.equal(inferCodeLanguage("types.d.ts"), "TypeScript");
  assert.equal(inferCodeLanguage("Program.cs"), "C#");
  assert.equal(inferCodeLanguage("sem-extensao"), "");
  assert.equal(normalizeCodeLanguage("Node.js"), "JavaScript");
  assert.equal(resolveCodeLanguage("C#", "main.py"), "C#");
  assert.equal(resolveCodeLanguage("", "main.py"), "Python");
  assert.equal(resolveCodeLanguage("cURL", "main.py"), "");
  assert.equal(displayCodeLanguage("cURL", "main.py"), "cURL");
});

test("codewalk infere a linguagem, destaca sintaxe e escapa conteúdo do código", () => {
  const out = html({ layout: "codewalk", filename: "main.py", code: "def greet(name):\n    # saudação\n    return f'<{name}>'" });
  assert.match(out, /class="codewalk-language f-label">Python/);
  assert.match(out, /data-language="Python"/);
  assert.match(out, /tok-keyword">def</);
  assert.match(out, /tok-function">greet</);
  assert.match(out, /tok-comment"># saudação</);
  assert.match(out, /tok-string">f'&lt;\{name\}&gt;'/);
  assert.doesNotMatch(out, /<\{name\}/);

  const curl = html({ layout: "codewalk", filename: "request.sh", language: "cURL", code: "curl -X GET" });
  assert.match(curl, /class="codewalk-language f-label">cURL/);
  assert.doesNotMatch(curl, /class="tok tok-/);
});

test("foco guiado limita regiões à imagem e aceita figura sem dependência externa", () => {
  const out = html({ layout: "spotlight", hotspots: [{ title: "Detalhe", x: -40, y: 98, width: 300, height: 90 }] });
  assert.match(out, /left:0%;top:96%;width:100%;height:4%/);
  assert.match(out, /<svg/);
  assert.match(out, /data-spotlight-region="0"/);
  assert.match(html({ layout: "spotlight", hotspots: [] }), /data-lesson-count="1"/);
  assert.match(html({ layout: "codewalk", steps: [] }), /data-lesson-count="1"/);
});

test("tipografia cinética normaliza batidas, limita opções e inclui resumo estático", () => {
  const out = html({ layout: "kinetic", autoplay: false, interval: 9000, beats: [
    "Uma frase",
    { text: "Próxima", style: "neon", position: "right", color: "cyan", size: "medium", tag: "Agora" },
    { text: "<script>alert(1)</script>", style: "desconhecido", position: "fora", color: "red", size: "gigante" },
  ] });
  assert.match(out, /data-lesson-count="3"/);
  assert.match(out, /data-kinetic-interval="5000"/);
  assert.match(out, /data-kinetic-autoplay="false"/);
  assert.match(out, /data-style="neon" data-color="cyan" data-size="medium"/);
  assert.match(out, /data-position="right"/);
  assert.match(out, /Agora/);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(out, /<script>alert/);
  assert.match(out, /kinetic-summary/);
  const single = html({ layout: "kinetic", beats: ["Uma frase"] });
  assert.match(single, /data-kinetic-autoplay="false"/);
  assert.match(single, /data-kinetic-toggle[^>]*disabled/);
});

test("tipografia cinética usa título e ocupa a área inteira sem duplicar a frase", () => {
  const out = renderSlide({ layout: "kinetic", kicker: "Uma seção", title: "Uma ideia clara", figure: { icon: "rocket" } }, 0, spec);
  assert.match(out.html, /class="free"/);
  assert.match(out.html, /Uma ideia clara/);
  assert.match(out.html, /Uma seção/);
  assert.match(out.html, /kinetic-scene/);
  assert.doesNotMatch(out.html, /kinetic-echo|Sua frase entra em cena/);
  const story = html({ layout: "kinetic", title: "Impulsionando a Eficiência do ==Desenvolvimento==", subtitle: "Proposta de Piloto para Assistente de Código" });
  assert.match(story, /data-lesson-count="4"/);
  assert.match(story, /Impulsionando a Eficiência/);
  assert.match(story, /do <mark>Desenvolvimento<\/mark>/);
  assert.match(story, /data-kinetic-autoplay="true"/);
  assert.match(story, /data-style="editorial"/);
  assert.match(story, /data-position="left"/);
  assert.match(story, /data-size="medium"/);
  assert.doesNotMatch(story, /data-style="outline"/);
});

test("página inteira: image_prompt sem imagem vira placeholder (não some)", () => {
  const out = html({ layout: "full", image_prompt: "uma sala de controle", title: "X" });
  assert.match(out, /fig-pending/);
});

test("imagem local ausente não impede abrir a apresentação e fica explícita no slide/avisos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-imagem-ausente-"));
  try {
    const built = buildHTML({
      _dir: dir,
      title: "Aula",
      slides: [{ layout: "cover", title: "Revolucionando o Código", figure: { image: "images/ia-011c8dc4.png" } }],
    });
    assert.match(built.html, /class="fig fig-pending fig-missing"/);
    assert.match(built.html, /aria-label="Imagem não encontrada: images\/ia-011c8dc4\.png"/);
    assert.ok(built.warnings.some((warning) => warning.includes('Imagem "images/ia-011c8dc4.png" não encontrada')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("títulos preservam palavras inteiras sem hifenização automática", () => {
  const out = buildHTML({
    title: "Português",
    lang: "pt-BR",
    slides: [{ layout: "cover", title: "Revolucionando o Código" }],
  }).html;
  assert.match(out, /<html lang="pt-BR">/);
  assert.match(out, /\.ttl\{[^}]*word-break:normal;overflow-wrap:normal;hyphens:none;text-wrap:balance/);
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

test("a apresentação tem ícone próprio (sem pedir /favicon.ico, que dava 404)", () => {
  const { html } = buildHTML({ title: "t", slides: [{ text: "oi" }] });
  assert.ok(html.includes('<link rel="icon" href="data:image/svg+xml,'));
});

test("interface sem emoji nem símbolo unicode fazendo papel de ícone (use ícone desenhado)", () => {
  // setas, símbolos técnicos, formas geométricas, símbolos diversos, dingbats (✕ ✓ ✨ ✏), emoji
  const GLYPH = /[←-⇿⌀-⏿■-◿☀-➿⬀-⯿\u{1F300}-\u{1FAFF}️]/gu;
  const pub = path.join(ROOT, "src", "studio", "public");
  const files = [
    ...fs.readdirSync(pub).filter((f) => /\.(js|html|css)$/.test(f) && f !== "ui-icons.js").map((f) => path.join(pub, f)),
    ...["runtime/runtime.js", "runtime/api-ui.js", "runtime/base.css", "build.js", "chrome.js", "studio/server.js"].map((f) => path.join(ROOT, "src", f)),
  ];
  const found = [];
  for (const file of files) {
    fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const t = line.trim();
      if (/^(\/\/|\/?\*)/.test(t)) return; // comentário
      const clean = line.replace(/<kbd>[^<]*<\/kbd>/g, ""); // nome de tecla (→ ←) pode
      const m = clean.match(GLYPH);
      if (m) found.push(`${path.relative(ROOT, file)}:${i + 1} ${[...new Set(m)].join(" ")}`);
    });
  }
  assert.deepEqual(found, [], "troque por <i class=\"ic\" data-ic=\"…\"> (Studio) ou SVG inline (apresentação)");
});
