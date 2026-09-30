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
  const out = html({ layout: "codewalk", title: "Aula", filename: "main.js", code: "if (a < 2) {\n  return '<script>literal</script>';\n}", steps: [
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

test("slides de código simples usam o mesmo editor, tema e realce do código guiado", () => {
  const simple = html({ layout: "code", filename: "main.py", code: "def hello():\n    return 'ok'", highlight: [2] });
  const guided = html({ layout: "codewalk", filename: "main.py", code: "def hello():\n    return 'ok'", highlight: [2] });
  for (const out of [simple, guided]) {
    assert.match(out, /class="codewalk-editor"/);
    assert.match(out, /class="codewalk-file f-mono">main\.py/);
    assert.match(out, /class="codewalk-language f-label">Python/);
    assert.match(out, /data-language="Python"/);
    assert.match(out, /class="cl hl"><span class="cn">2<\/span>/);
    assert.match(out, /class="tok tok-keyword">def/);
  }
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
  assert.match(out, /data-style="clean" data-color="cyan" data-size="medium"/);
  assert.doesNotMatch(out, /data-style="neon"/);
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
  assert.match(story, /data-style="clean"/);
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
  assert.match(out, /<html lang="pt-BR"[ >]/);
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

test("elemento aviso: caixa com ícone, título e texto nos 4 tipos (+atalho)", () => {
  const a = (aviso) => html({ layout: "blocks", title: "T", add: [{ aviso }] });
  const dica = a({ tipo: "dica", titulo: "Dica", texto: "Confira **isso**." });
  assert.match(dica, /aviso av-dica/);
  assert.match(dica, /Dica/);
  assert.match(dica, /<b>isso<\/b>/);
  assert.match(dica, /<svg/);
  assert.match(a("só o texto"), /av-dica/);
  assert.match(a({ tipo: "atenção", texto: "x" }), /av-atencao/);
  assert.match(a({ tipo: "inexistente", texto: "x" }), /av-dica/);
  assert.match(a({ tipo: "perigo", texto: "x" }), /av-perigo/);
  assert.match(a({ tipo: "importante", texto: "x" }), /av-importante/);
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

test("imagem opcional vazia em elemento extra não impede abrir a apresentação", () => {
  assert.doesNotThrow(() => html({ layout: "code", title: "Exemplo", code: "print(1)", add: [{ image: "", fit: "cover" }] }));
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
    ...["runtime/runtime.js", "runtime/api-ui.js", "runtime/base.css", "build.js", "chrome.js", "studio/server.js", "elements.js", "layouts.js"].map((f) => path.join(ROOT, "src", f)),
    ...fs.readdirSync(path.join(ROOT, "src", "runtime", "skins")).map((f) => path.join(ROOT, "src", "runtime", "skins", f)),
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

// A IA do sagadeck só usa o que está na referência (docs/REFERENCIA.md vai inteira no prompt). Recurso novo que
// não entra lá é invisível para ela: este teste falha se faltar um layout, composição, tema ou paleta.
test("a IA conhece tudo: todo layout, composição, tema e paleta aparece na referência que vai no prompt", async () => {
  const { reference } = await import("../src/ai/deck-ai.js");
  const { LAYOUTS, SCENES } = await import("../src/layouts.js");
  const { THEMES, PALETTES } = await import("../src/themes.js");
  const ref = reference();
  const missing = [
    ...Object.keys(LAYOUTS).filter((k) => !new RegExp("`" + k + "`|layout: " + k + "\b").test(ref)).map((k) => "layout " + k),
    ...Object.keys(SCENES).filter((k) => !ref.includes("`" + k + "`")).map((k) => "composição " + k),
    ...Object.keys(THEMES).filter((k) => !ref.includes("`" + k + "`") && !ref.includes(" " + k + " ")).map((k) => "tema " + k),
    ...Object.keys(PALETTES).filter((k) => !ref.includes("`" + k + "`")).map((k) => "paleta " + k),
  ];
  assert.deepEqual(missing, []);
  assert.match(ref, /context:/, "o campo de contexto da apresentação");
  // e todo campo que os layouts leem (s.campo) está documentado
  const src = fs.readFileSync(path.join(ROOT, "src", "layouts.js"), "utf8");
  const doc = new Set([...ref.matchAll(/`([^`\n]+)`/g)].flatMap((m) => [...m[1].matchAll(/[A-Za-z_]\w*/g)].map((w) => w[0])));
  const lidos = [...new Set([...src.matchAll(/\bs\.([A-Za-z_]\w*)/g)].map((m) => m[1]))].filter((k) => !/^(length|map|slice|join|filter|some|forEach|concat|find|includes|trim|split|replace)$/.test(k));
  assert.deepEqual(lidos.filter((k) => !doc.has(k)), [], "campos que o código lê e a IA não conhece");
});

// A regra "sem unicode como ícone" vale para o que o sagadeck desenha (interface, setas, selos). O conteúdo da pessoa
// (digitado ou colado de outra IA) passa do jeito que veio: emoji, setas e símbolos no texto não são filtrados.
test("conteúdo da pessoa com emoji e símbolos passa intacto", () => {
  const { html } = buildHTML({ slides: [{ layout: "list", title: "Plano 🚀", items: ["Fase 1 → Fase 2", "✓ feito", "★★★☆☆"] }] });
  for (const t of ["Plano 🚀", "Fase 1 → Fase 2", "✓ feito", "★★★☆☆"]) assert.ok(html.includes(t), t);
});

// Paletas de família: a cor forte da marca vira só o detalhe (alert); os parentes (family) viram variáveis e as
// séries extras dos gráficos, no lugar dos cinzas.
test("paleta de família: parentes viram --c-fN e as séries 3 a 5 dos gráficos; paleta sem família não muda", async () => {
  const { resolveTheme, themeCSS, scopedThemeCSS, PALETTES } = await import("../src/themes.js");
  for (const k of ["rubi", "ametista", "tangerina", "safira", "esmeralda"]) {
    assert.ok(PALETTES[k]?.family?.length >= 2, k);
    assert.doesNotMatch(PALETTES[k].label, /bradesco|nubank|ita[uú]/i, "sem nome de empresa");
  }
  const css = themeCSS(resolveTheme("prata", "rubi"));
  assert.match(css, /--c-f1:#F9DCE5;/);
  const series = css.match(/\[class\*="tone-"\]\{(--s3:#[0-9A-F]{6};--s4:#[0-9A-F]{6};--s5:#[0-9A-F]{6};)\}/);
  assert.ok(series, "séries 3 a 5 da família");
  const fam = PALETTES.rubi.family;
  for (const c of series[1].match(/#[0-9A-F]{6}/g)) assert.ok(fam.includes(c.slice(1)), c);
  assert.match(scopedThemeCSS(resolveTheme("prata", "rubi")), /\.slide\.lk-prata--rubi\[class\*="tone-"\]\{--s3:/, "também num slide com paleta própria");
  // a da pessoa também aceita family; sem family, nada de séries novas
  assert.match(themeCSS(resolveTheme("prata", { paper: "FFFFFF", ink: "222222", accent: "0066CC", alert: "CC0000", family: ["CCE0F5", "3385D6"] })), /--c-f2:#3385D6;/);
  assert.doesNotMatch(themeCSS(resolveTheme("prata", "tinta")), /--s3:/);
});

// Identidade: as fontes da empresa vêm de um arquivo local (nunca do repositório). Corpo e rótulos sempre nelas;
// títulos também, menos nos temas com personalidade. Fallback: a fonte do tema continua na lista.
test("identidade: fontes da empresa por papel, respeitando o tema; paleta dela quando o deck não tem; sem o arquivo, aviso", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-ident-"));
  const old = process.env.SAGADECK_IDENTIDADES;
  process.env.SAGADECK_IDENTIDADES = path.join(dir, "identidades.yaml");
  try {
    fs.writeFileSync(process.env.SAGADECK_IDENTIDADES, `trabalho:\n  nome: Trabalho\n  fontes:\n    titulo: ["Acme Sans", "Acme Sans Compact"]\n    corpo: ["Acme Sans"]\n    compacta: ["Acme Sans Compact"]\n  paleta: rubi\nquebrada:\n  fontes: { corpo: "Outra Sans" }\n  paleta: nao-existe\n`);
    const face = (html, role) => (html.match(new RegExp(`\\.f-${role}\\{font-family:([^;]+);`)) || [])[1] || "";
    const sobrio = buildHTML({ theme: "prata", identity: "trabalho", slides: [{ layout: "statement", text: "x" }] });
    assert.match(face(sobrio.html, "body"), /^ 'Acme Sans', .+/, "corpo na fonte da empresa, com a do tema depois");
    assert.match(face(sobrio.html, "label"), /^ 'Acme Sans Compact',/, "rótulo na compacta");
    assert.match(face(sobrio.html, "display"), /^ 'Acme Sans', 'Acme Sans Compact',/, "tema sóbrio: título também");
    assert.match(sobrio.html, /--c-accent:#B83A6E/, "paleta da identidade");
    assert.deepEqual(sobrio.warnings.filter((w) => /identidade/.test(w)), []);
    const solto = buildHTML({ theme: "rabisco", identity: "trabalho", slides: [{ layout: "statement", text: "x" }] });
    assert.doesNotMatch(face(solto.html, "display"), /Acme/, "tema com personalidade: o título fica com a fonte dele");
    assert.match(face(solto.html, "body"), /^ 'Acme Sans',/);
    const paleta = buildHTML({ theme: "prata", palette: "esmeralda", identity: "trabalho", slides: [{ layout: "statement", text: "x" }] });
    assert.doesNotMatch(paleta.html, /--c-accent:#B83A6E/, "a paleta escolhida no deck vence");
    // arquivo da pessoa com paleta que não existe: não quebra
    assert.match(face(buildHTML({ theme: "prata", identity: "quebrada", slides: [{ layout: "statement", text: "x" }] }).html, "body"), /'Outra Sans'/);
    // deck de outra máquina (identidade que não existe aqui): fontes do tema e um aviso
    const fora = buildHTML({ theme: "prata", identity: "empresa-x", slides: [{ layout: "statement", text: "x" }] });
    assert.doesNotMatch(fora.html, /Acme/);
    assert.ok(fora.warnings.some((w) => /identidade "empresa-x" não está/.test(w)));
    // o PowerPoint recebe o nome da primeira fonte da empresa
    assert.equal(sobrio.theme.faces.body.pptx.face, "Acme Sans");
  } finally {
    if (old === undefined) delete process.env.SAGADECK_IDENTIDADES; else process.env.SAGADECK_IDENTIDADES = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Infográficos: qualquer quantidade de itens (até o máximo da forma), cores do tema com letra clara legível.
test("infographic: todas as formas desenham de 2 ao máximo de itens; excesso vira aviso; cores do tema com contraste", async () => {
  const { INFOGRAPHIC_SHAPES, itemColors } = await import("../src/infographic.js");
  const { resolveTheme } = await import("../src/themes.js");
  const item = (i) => ({ title: `Item ${i + 1}`, text: "Uma frase curta.", icon: "star", steps: [{ title: "Etapa" }] });
  for (const [shape, { max }] of Object.entries(INFOGRAPHIC_SHAPES)) {
    for (const n of [shape === "trilhas" ? 1 : 2, max]) {
      const r = buildHTML({ slides: [{ layout: "infographic", shape, title: "x", center: { title: "Centro" }, items: Array.from({ length: n }, (_, i) => item(i)) }] });
      assert.deepEqual(r.warnings.filter((w) => /infográfico/.test(w)), [], `${shape} ${n}`);
      assert.match(r.html, new RegExp(`ig-${shape}`));
    }
    const muitos = buildHTML({ slides: [{ layout: "infographic", shape, items: Array.from({ length: max + 2 }, (_, i) => item(i)) }] });
    assert.ok(muitos.warnings.some((w) => new RegExp(`infográfico ${shape}: ${max + 2} itens, cabem até ${max}`).test(w)), shape);
  }
  const lum = (h) => { const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const [theme, palette] of [["sinal"], ["prata"], ["noite"], ["prata", "rubi"], ["prata", "tangerina"], ["rabisco", "esmeralda"]]) {
    const t = resolveTheme(theme, palette), cols = itemColors(t, 6);
    for (const c of cols) assert.ok(ratio(c, t.colors.paper) >= 3, `${theme}/${palette}: #${c} com letra clara (${ratio(c, t.colors.paper).toFixed(2)})`);
    assert.ok(new Set(cols).size >= 4, `${theme}/${palette}: cores diferentes para os itens (${cols})`);
  }
});

// Layout que o motor conhece mas o Studio não lista fica escondido da pessoa (só a IA consegue usar).
test("todo layout do motor aparece na galeria do Studio (LAYOUT_NAMES) com nome em português", async () => {
  const { LAYOUTS } = await import("../src/layouts.js");
  const app = fs.readFileSync(path.join(ROOT, "src", "studio", "public", "app.js"), "utf8");
  const names = JSON.parse(app.match(/const LAYOUT_NAMES = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  const labels = app.match(/const LAYOUT_LABELS = \{([\s\S]*?)\};/)[1];
  const fora = Object.keys(LAYOUTS).filter((k) => !names.includes(k) && !["api", "auto"].includes(k));
  assert.deepEqual(fora, [], "faltam na galeria");
  const semNome = names.filter((k) => !new RegExp(`\\b${k}:\\s*"`).test(labels));
  assert.deepEqual(semNome, [], "sem nome na galeria");
});

test("formas livres: triângulo, losango, hexágono, estrela, seta, chevron e balão desenham em SVG com preenchimento e contorno", () => {
  const kinds = ["triangle", "diamond", "hexagon", "star", "arrow", "chevron", "bubble"];
  const r = buildHTML({ slides: [{ layout: "canvas", elements: kinds.map((shape, i) => ({ shape, x: 100 + i * 200, y: 200, w: 180, h: 140, fill: "hi", stroke: "fg" })) }] });
  assert.deepEqual(r.warnings, []);
  for (const k of kinds) assert.match(r.html, new RegExp(`class="shape shape-${k}"[^>]*><svg class="shape-svg"`), k);
  assert.match(r.html, /<polygon points="50,0 100,100 0,100"[^>]*fill="var\(--hi\)"[^>]*stroke="var\(--fg\)"/, "triângulo com cor do tema");
  assert.match(r.html, /<path d="M8,0/, "balão é um caminho");
  // o fundo retangular não vaza por trás do desenho (bg vira o preenchimento)
  const bg = buildHTML({ slides: [{ layout: "canvas", elements: [{ shape: "star", x: 0, y: 0, w: 100, h: 100, bg: "hi" }] }] });
  assert.doesNotMatch(bg.html, /shape-star"[^>]*style="[^"]*background/);
  assert.match(bg.html, /fill="var\(--hi\)"/);
  // as de antes continuam iguais
  assert.match(buildHTML({ slides: [{ layout: "canvas", elements: [{ shape: "circle", x: 0, y: 0, w: 50, h: 50 }] }] }).html, /shape-circle[^>]*border-radius:50%/);
});

test("edições visuais: preenchimento pinta o desenho (--shape-fill) ou o fundo da forma; área do slide isola o empilhamento", () => {
  const slide = (shape) => ({ layout: "canvas", elements: [{ shape, x: 0, y: 0, w: 100, h: 100 }], visualEdits: { [`shape-shape-${shape}-0`]: { fill: "#ff0000", z: -1 } } });
  const star = buildHTML({ slides: [slide("star")] }).html;
  assert.match(star, /shape-star"[^>]*style="[^"]*--shape-fill:#ff0000/);
  assert.doesNotMatch(star, /shape-star"[^>]*style="[^"]*background:#ff0000/, "desenho não ganha retângulo pintado atrás");
  assert.match(buildHTML({ slides: [slide("rect")] }).html, /shape-rect"[^>]*style="[^"]*background:#ff0000!important/);
  assert.match(fs.readFileSync(new URL("../src/runtime/base.css", import.meta.url), "utf8"), /\.free\{[^}]*isolation:isolate/, "z negativo não passa para trás do fundo");
});

test("purpose: material de consulta aceita texto corrido — o fiscal não reclama e a auto-correção não move a explicação para as notas", () => {
  const body = Array.from({ length: 12 }, (_, i) => `Frase ${i + 1} explica por que o rebase reescreve a história da branch.`).join(" "); // ~130 palavras
  const slide = () => ({ layout: "split", title: "Rebase", body, figure: { icon: "git-branch" } });
  const palestra = autofixSlide(slide(), { purpose: "palestra" }, []);
  assert.notEqual(palestra.slide.body, body, "palestra: o excesso vai para as notas");
  const consulta = autofixSlide(slide(), { purpose: "consulta" }, []);
  assert.equal(consulta.slide.body, body, "consulta: a explicação fica no slide");
  assert.equal(buildHTML({ purpose: "consulta", slides: [slide()] }).warnings.filter((w) => /palavras/.test(w)).length, 0, "sem aviso anti-sono em consulta");
  assert.ok(buildHTML({ purpose: "palestra", slides: [slide()] }).warnings.some((w) => /palavras \(limite 40\)/.test(w)), "palestra: limite 40");
});

test("tema com par claro/escuro: o PDF pode sair no claro (manual-noite → manual), no deck e nos slides", async () => {
  const { lightVariant } = await import("../src/studio/server.js");
  assert.equal(THEMES.manual.pair, "manual-noite"); assert.equal(THEMES["manual-noite"].pair, "manual");
  const v = lightVariant({ theme: "manual-noite", slides: [{ layout: "statement", text: "a" }, { layout: "statement", text: "b", theme: "manual-noite" }] });
  assert.equal(v.theme, "manual");
  assert.equal(v.slides[1].theme, "manual");
  assert.equal(lightVariant({ theme: "manual", slides: [{ layout: "statement", text: "a" }] }), null, "já é claro: nada a trocar");
  assert.equal(lightVariant({ theme: "noite", slides: [{ layout: "statement", text: "a" }] }), null, "escuro sem par: fica como está");
});

test("inspetor (visualEdits): cada propriedade vira o CSS ou o atributo certo, no Studio e no HTML exportado", () => {
  const edits = { weight: 700, italic: true, align: "center", lineHeight: 1.3, letterSpacing: 0.05, uppercase: true, rotate: 12, opacity: 0.5, shadow: "forte", radius: 24, step: 2, anim: "zoom" };
  const html = buildHTML({ slides: [{ layout: "canvas", elements: [{ text: "Olá", x: 0, y: 0, w: 400, h: 100, step: 1 }], visualEdits: { "t-f-body-r-body-0": edits } }] }).html;
  const tag = html.match(/<div[^>]*data-vkey-old="t-f-body-r-body-0"[^>]*>/)[0]; // chave antiga (por ordem) ainda vale
  for (const css of ["font-weight:700!important", "font-style:italic!important", "text-align:center!important", "line-height:1.3!important", "letter-spacing:0.05em!important", "text-transform:uppercase!important", "rotate:12deg", "opacity:0.5", "drop-shadow", "border-radius:24px!important"]) assert.ok(tag.includes(css), `${css} em ${tag}`);
  assert.match(tag, /data-step="2"/, "aparece no clique 2 (troca o do elemento)");
  assert.doesNotMatch(tag, /data-step="1"/);
  assert.match(tag, /data-anim="zoom"/);
  // contorno: desenho usa --shape-stroke; forma reta ganha borda
  const star = buildHTML({ slides: [{ layout: "canvas", elements: [{ shape: "star", x: 0, y: 0, w: 100, h: 100 }], visualEdits: { "shape-shape-star-0": { stroke: "#112233", strokeWidth: 6 } } }] }).html;
  assert.match(star, /shape-star"[^>]*--shape-stroke:#112233;--shape-sw:6px/);
  assert.match(star, /stroke:var\(--shape-stroke/, "o desenho lê o contorno do inspetor");
  const rect = buildHTML({ slides: [{ layout: "canvas", elements: [{ shape: "rect", x: 0, y: 0, w: 100, h: 100 }], visualEdits: { "shape-shape-rect-0": { stroke: "#112233", strokeWidth: 6 } } }] }).html;
  assert.match(rect, /shape-rect"[^>]*border:6px solid #112233!important/);
  // valores fora do esperado são ignorados (nada de CSS injetado)
  const lixo = buildHTML({ slides: [{ layout: "canvas", elements: [{ text: "x", x: 0, y: 0 }], visualEdits: { "t-f-body-r-body-0": { align: "red;}", anim: "<x>", weight: "900;x" } } }] }).html;
  assert.doesNotMatch(lixo, /red;\}|<x>|900;x/);
});

test("fórmulas e funções: a fórmula vira curva, letra vira controle, pontos do Excel e CSV ao lado do deck", async () => {
  const { plotHTML, plotModel, plotData, parseTable } = await import("../src/science.js");
  const F = globalThis.SagaFormula;
  const val = (s, v, vars) => F.compile(s, vars).eval(v);
  // o que a pessoa escreve de verdade
  assert.equal(val("y = x² - 2x + 1", { x: 3 }), 4);
  assert.equal(val("2(x+1)(x-1)", { x: 2 }), 6);
  assert.equal(val("-x^2", { x: 3 }), -9, "potência antes do sinal");
  assert.equal(val("3sin x", { x: Math.PI / 2 }), 3);
  assert.equal(val("0,5x", { x: 4 }), 2, "vírgula decimal");
  assert.equal(val("e^x", { x: 1 }), Math.E);
  assert.equal(val("1/x", { x: 0 }), null, "divisão por zero vira buraco, não erro");
  assert.deepEqual(F.compile("a*sin(b*x) + c").params, ["a", "b", "c"]);
  assert.throws(() => F.compile("sin(x"), /parêntese/);
  assert.throws(() => F.compile("x @ 2"), /não entendido/);
  // nada de acessar JS pela fórmula: nome desconhecido vira produto de letras (parâmetros), nunca propriedade
  assert.ok(!F.compile("constructor(x)").params.includes("constructor"));
  assert.equal(F.compile("toString").eval({}), null);
  // letra vira controle deslizante: com os limites dados ou o padrão
  const m = plotModel({ functions: ["a*sin(b*x)"], params: { b: { value: 2, min: 0, max: 4, label: "frequência" } } });
  assert.deepEqual(m.params.a, { value: 1, min: -5, max: 5, step: 0.1 });
  assert.equal(m.params.b.label, "frequência");
  const html = plotHTML({ functions: ["a*sin(b*x)"], params: { b: 2 } });
  assert.match(html, /type="range" data-param="a"/);
  assert.match(html, /data-param="b"[^>]*value="2"/);
  assert.match(html, /<svg class="science-preview"[\s\S]*<path d="M/, "prévia desenhada: a miniatura e o PDF mostram a curva");
  // pontos colados do Excel (tab, vírgula decimal, cabeçalho) e CSV com ponto e vírgula
  assert.deepEqual(parseTable("x\tmedida\n0\t1,5\n1\t2,8"), [["x", "medida"], ["0", "1,5"], ["1", "2,8"]]);
  const pts = plotModel({ points: "x\tmedida\n0\t1,5\n1\t2,8" }).points;
  assert.deepEqual([pts.x, pts.y, pts.name], [[0, 1], [1.5, 2.8], "medida"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-pts-"));
  fs.mkdirSync(path.join(dir, "dados")); fs.writeFileSync(path.join(dir, "dados", "m.csv"), "x;y\n1;10\n2;20\n");
  assert.deepEqual(plotModel({ points: "dados/m.csv" }, { baseDir: dir, warnings: [] }).points.y, [10, 20], "CSV ao lado do deck");
  const warnings = [];
  assert.equal(plotModel({ points: "dados/nao-tem.csv" }, { baseDir: dir, warnings }).points, undefined);
  assert.match(warnings[0], /não encontrado/);
  // fórmula com erro: o slide sai, o gráfico diz o erro e o fiscal recebe o aviso
  const w2 = [];
  assert.match(plotHTML({ functions: ["sin(x"] }, { warnings: w2 }), /Fórmula com erro: .*parêntese/);
  assert.match(w2[0], /gráfico: fórmula 1/);
  // exemplo antigo continua funcionando, agora como fórmula; Plotly bruto ainda manda
  assert.equal(plotData({ preset: "parabola" })[0].y[0], 16);
  assert.deepEqual(plotData({ data: [{ type: "bar", x: [1], y: [2] }] }), [{ type: "bar", x: [1], y: [2] }]);
  assert.match(plotHTML({ surface: "sin(x)*cos(y)", x: [-3, 3] }), /<rect/);
  // o slide inteiro: sem equações, o gráfico ocupa a largura toda
  const slide = renderSlide({ layout: "science", title: "Curva", plot: { functions: ["x^2"] } }, 0, { theme: "sinal", slides: [] }).html;
  assert.match(slide, /science-body plot-only/);
});

test("fórmulas: nome com número (h0, v0) é um parâmetro só", () => {
  const F = globalThis.SagaFormula;
  const c = F.compile("h0 - g*x^2/2");
  assert.deepEqual(c.params, ["h0", "g"]);
  assert.equal(c.eval({ x: 2, h0: 20, g: 10 }), 0);
  assert.deepEqual(F.compile("v0x").params, ["v0"], "v0x = v0·x");
});

test("gráfico de dados: várias séries viram colunas/barras agrupadas (com legenda e nativo no PPTX) e csv: lê o arquivo ao lado do deck", async () => {
  const { chart } = await import("../src/figures/charts.js");
  const { figureHTML } = await import("../src/elements.js");
  const o = { chart: "column", labels: ["2024", "2025"], series: [{ name: "Receita", values: [10, 14] }, { name: "Custo", values: [8, 9] }] };
  const svg = chart(o);
  assert.equal((svg.match(/class="gy"/g) || []).length, 4, "duas séries × dois rótulos");
  assert.match(svg, />Receita</); assert.match(svg, />Custo</);
  const native = JSON.parse(svg.match(/data-chart='([^']*)'/)[1].replace(/&quot;/g, '"'));
  assert.deepEqual(native.series.map((s) => s.name), ["Receita", "Custo"], "PowerPoint recebe as duas séries");
  assert.equal((chart({ ...o, chart: "bar" }).match(/class="gx"/g) || []).length, 4);
  assert.equal((chart({ chart: "column", labels: ["a", "b"], series: [{ values: [1, 2] }] }).match(/class="gy"/g) || []).length, 2, "uma série com labels continua simples");
  // CSV ao lado do deck: com cabeçalho, ponto e vírgula e vírgula decimal
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-csv-"));
  fs.mkdirSync(path.join(dir, "dados"));
  fs.writeFileSync(path.join(dir, "dados", "vendas.csv"), "Mês;Norte;Sul\nJan;10,5;7\nFev;12;9\nMar;15;8\n");
  const ctx = { baseDir: dir, warnings: [] };
  const line = figureHTML({ chart: "line", csv: "dados/vendas.csv" }, ctx, 1200, 600);
  assert.match(line, />Norte</); assert.match(line, />Sul</);
  assert.match(line, />Mar</, "rótulos do eixo vêm do arquivo");
  fs.writeFileSync(path.join(dir, "dados", "um.csv"), "Time,Gols\nA,3\nB,5\n");
  assert.equal((figureHTML({ chart: "column", csv: "dados/um.csv" }, ctx, 1200, 600).match(/class="gy"/g) || []).length, 2);
  assert.match(figureHTML({ chart: "bar", csv: "dados/nao.csv", data: [{ label: "x", value: 1 }] }, ctx, 1200, 600), /class="gx"/, "arquivo sumido: ficam os dados do slide");
  assert.match(ctx.warnings.at(-1), /não encontrado/);
});
