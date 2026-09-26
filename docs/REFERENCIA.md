# Referência do formato `.yaml` do sagadeck

Um deck é um arquivo YAML com cabeçalho + lista de `slides`. Cada slide escolhe um **layout** e preenche os campos dele.
Tudo que é texto aceita a **marcação inline** (abaixo). Qualquer slide aceita `notes`, `time`, `tone`.

```yaml
title: Nome da palestra          # obrigatório (vira rodapé e título da janela)
author: Seu Nome · Cargo
theme: sinal                     # sinal | editorial | noite | bauhaus | terminal | jornal  (ou tema customizado, ver fim)
duration: 50                     # minutos — o modo apresentador mostra se você está adiantado/atrasado
event: Summit de Dados 2026       # opcional — para {evento} no rodapé/cabeçalho
department: Engenharia de Dados  # opcional — para {depto}
date: 2026-03-07                 # opcional — para {data}; sem date, usa a data do dia
footer: texto do rodapé          # opcional; false desliga; ou { left, center, right } com variáveis:
#   footer: { left: "{autor} · {evento}", center: "{data:DD MMM AAAA}", right: "{n} / {total}" }
#   header: { left: "{depto}", right: "Confidencial" }
#   variáveis: {titulo} {autor} {evento} {depto} {data} {data:MÁSCARA} {pagina} (01) {n} (1) {total}
#   máscara: DD MM AAAA AA MMM (jan) MMMM (janeiro). Capa, seção, encerramento e página inteira ficam sem.
markStyle: marca-texto           # como o ==destaque== aparece: marca-texto | sublinhado | cor | negrito | nenhum
tone: light                      # tom padrão dos slides (light | dark | accent | alert)
maxWords: 40                     # alerta "anti-sono" quando um slide passa disso
css: [estilo.css]                # CSS extra (opcional)
widgets: [widgets/jogo.js]       # widgets interativos próprios (opcional, ver fim)
slides:
  - layout: cover
    title: …
```

## Campos comuns a todo slide

| campo | o que faz |
|---|---|
| `layout` | um dos layouts abaixo (se omitido, o sagadeck adivinha pelo conteúdo) |
| `tone` | `light` (padrão), `dark`, `accent` (cor forte do tema), `alert` |
| `kicker` | linha pequena acima do título (rótulo) |
| `title` / `titleSize` / `titleAs` | título; tamanho em px; papel tipográfico (`title`, `h2`, `h3`) |
| `source` | fonte/nota de rodapé do slide |
| `add` | elemento(s) extra(s) no fim da área útil |
| `notes` | roteiro do apresentador (Markdown simples, ver abaixo) |
| `time` | minutos planejados para o slide (soma no cronômetro) |
| `build: true` | revela os itens (lista, cards, linha do tempo, matriz…) **um por clique** |
| `steps: N` | força N cliques no slide (útil para widgets) |
| `background` | figura de fundo atrás do conteúdo |
| `bg` / `fg` | cor de fundo / texto (hex) só neste slide |
| `transition` | `fade` (padrão) ou `cut` |
| `footer: false` | esconde o rodapé neste slide |

## Marcação inline (qualquer texto)

`**negrito**` · `*itálico*` · `==destaque==` (marca-texto animado; o estilo muda com `markStyle` no deck ou no slide: `marca-texto`, `sublinhado`, `cor`, `negrito`, `nenhum`) · `^^cor de ênfase^^` · `~~riscado~~` · `` `código` `` · `[link](https://…)` · quebra de linha = nova linha no YAML (`|`).

## Layouts

| layout | campos principais | uso |
|---|---|---|
| `cover` | `kicker, title, subtitle, author, role, figure` | capa |
| `section` | `number, kicker, title, subtitle, figure` | abertura de ato/capítulo (tom `accent` por padrão) |
| `statement` | `text` **ou** `lines: [ {text, as, color, step} ]`, `by`, `center` | uma frase de impacto; `lines` + `build` revelam linha a linha |
| `quote` | `quote, by, role, after, afterStep` | citação; `after` aparece num clique |
| `number` | `value, prefix, suffix, decimals, from, label, context, side, valueColor` | número gigante animado (conta de `from` até `value`) |
| `split` | `title, body, bullets, content, figure, ratio: "1.2:1", reverse, build` | texto + figura |
| `cards` | `title, items: [{icon, picto, number, title, text, foot, hl}], cols, build` | 2–4 cartões |
| `list` | `title, items: [texto ou {text, sub}], numbered, size, build` | lista numerada grande |
| `timeline` | `title, events: [{when, title, text, tag}], highlight, after, build` | linha do tempo |
| `chart` | `title, chart: {…}, side (texto ou elemento), chartHeight` | gráfico + comentário |
| `compare` | `title, left: {label, value, title, text, items, figure, hl}, right: {…}, vs, after, build` | A × B |
| `matrix` | `title, x: [esq, dir], y: [cima, baixo], cells: [4 × {title, text, example, hl}], build` | matriz 2×2 |
| `question` | `question, options: [texto ou {key, text, sub}], keys, cols, timer, hint, optionSize` | pergunta para a plateia (com timer) |
| `poll` | `question, id, options, compare: outroId, hint` | enquete: o apresentador digita os resultados e o slide anima as barras; `compare` mostra a diferença para outra enquete |
| `video` | `title, url, label, figure, caption` | cartão que abre um vídeo |
| `code` | `title, code, highlight: [linhas], note` | código com linhas destacadas |
| `codewalk` | `title, filename, language, code, size, steps: [{title, text, highlight: [linhas], output}]` | código guiado: cada etapa destaca linhas e explica uma saída simulada |
| `spotlight` | `title, image` ou `figure`, `caption, hotspots: [{x, y, width, height, title, text}]` | foco guiado em regiões de screenshots, imagens ou diagramas |
| `image` | `image` ou `figure`, `title, caption` | imagem/figura em tela cheia |
| `blocks` | `title, content: [elementos]` | layout livre em fluxo (linhas/colunas) |
| `canvas` | `elements: [{…, x, y, w, h}]` | posicionamento absoluto em 1920 × 1080 |
| `end` | `title, subtitle, contacts, figure, qr, qrLabel` | encerramento; `qr: <link>` põe um QR code ao lado (ex.: LinkedIn) |
| `references` | `title, items` | fontes (2 colunas) |
| `headline` | `kicker, text, as, size, caption` | manchete: uma frase enorme ocupando o slide |
| `full` | `figure` (ou `image`/`image_prompt`), `kicker, title, caption, overlay: bottom\|left\|center\|none, fit, titleSize` | figura/imagem de página inteira com texto por cima; com `image_prompt` a IA gera a página toda |
| `bento` | `title, tiles: [{title, text, value, icon, figure, size: big\|wide\|tall, hl}], cols, build` | mosaico de blocos de tamanhos diferentes |
| `funnel` | `title, stages: [{title, value, text, hl}], build` | funil que afunila etapa a etapa |
| `pyramid` | `title, levels: [{title, text, hl}], build` | pirâmide (topo → base) |
| `agenda` | `title, items: [{title, text, time}], current, build` | agenda com a seção atual destacada |

### Cenas interativas para ensinar

`codewalk` mantém o código estável e revela a explicação, o destaque de linhas e uma saída esperada por etapa. O código e os comandos cURL são texto; não há execução. Use as setas da apresentação ou os botões numerados. Depois da última etapa, a seta avança ao slide seguinte. As etapas também aparecem corretamente na prévia do apresentador e são restauradas pelo endereço da apresentação.

```yaml
- layout: codewalk
  title: Uma chamada à API
  filename: exemplo.sh
  language: cURL
  code: |
    curl https://api.exemplo.com/aulas \
      -H "Accept: application/json"
  steps:
    - title: Escolha o recurso
      text: A URL identifica a coleção de aulas.
      highlight: [1]
      output: "GET /aulas → 200 OK"
    - title: Combine o formato
      text: O cabeçalho declara o formato desejado.
      highlight: [2]
      output: '{ "aulas": [] }'
- layout: spotlight
  title: O que observar no screenshot
  image: imagens/resposta.png
  caption: Inspecionando uma resposta HTTP
  hotspots:
    - { x: 5, y: 10, width: 90, height: 20, title: Status, text: O servidor confirmou o pedido. }
    - { x: 5, y: 35, width: 70, height: 55, title: Dados, text: Aqui está o corpo da resposta. }
```

No `spotlight`, `x` e `y` indicam o canto superior esquerdo da região; os quatro números são porcentagens da imagem. As regiões são limitadas à imagem, respeitam a proporção de screenshots verticais e podem ser clicadas diretamente. Também é possível usar `figure` com SVG ou diagrama no lugar de `image`. Prefira 2–4 etapas e explicações curtas para manter o slide legível. Em HTML sem JavaScript aparece a primeira etapa; PDF, impressão e exportação estática mostram um resumo de todas as etapas, sem controles. Imagens locais são embutidas no HTML para funcionar offline.

O cabeçalho do deck aceita `motion: none | subtle | expressive` (padrão `subtle`). A preferência do sistema por movimento reduzido tem prioridade. A intensidade muda a animação; os controles e revelações continuam funcionando.

## Elementos (dentro de `content`, `side`, `add`, `figure`, `elements`…)

Todo elemento aceita: `step` (clique em que aparece), `exit` (clique em que some), `anim` (`up` padrão, `fade`, `pop`, `left`, `right`, `down`, `zoom`, `none`), `w`, `h`, `flex`, `color`, `bg`, `align`, `pad`, `card: true|hi`, `class`, `style` e, no `canvas`, `x`, `y`.

| elemento | exemplo |
|---|---|
| texto | `{ h2: "Título" }` · `{ lead: "…" }` · `{ body: "…" }` · `{ label: "…" }` · `{ quote: "…" }` · `{ number: "65%" }` — ou `{ text: "…", as: h3, size: 60 }` |
| linha / coluna | `{ row: [ … ], gap: 40, valign: center }` · `{ col: [ … ], gap: 20 }` |
| contador | `{ counter: 79, suffix: "%", from: 0, decimals: 0, size: 240 }` |
| timer | `{ timer: 30, size: 200, label: "segundos", auto: true }` (clique pausa; tecla R zera) |
| enquete | `{ poll: id, options: [...], compare: outroId }` |
| lista | `{ list: [...], numbered: true, build: true }` |
| cartões | `{ cards: [...], cols: 3 }` |
| código | `{ code: "…", highlight: [2] }` |
| QR code | `{ qr: "https://linkedin.com/in/voce", size: 360, label: "Meu LinkedIn" }` — sempre escuro sobre claro, legível mesmo em slide escuro |
| forma | `{ shape: rect|rounded|circle|pill|line, fill: hi, stroke: fg, w, h }` |
| selo | `{ badge: "NOVO" }` |
| vídeo | `{ video: "https://…", label: "Assistir" }` |
| HTML livre | `{ html: "<div>…</div>" }` |
| widget | `{ widget: nome, …opções }` |
| espaço | `{ spacer: true }` (empurra) ou `{ spacer: 40 }` |

## Figuras geradas na hora

**Ícones** (2.100+ do Lucide — veja `sagadeck icons carro`): `{ icon: gavel, size: 200, stroke: 1.5, color: em }` — nome oficial em inglês, mas aceita sinônimos comuns em português (`foguete`, `dinheiro`, `equipe`…) e erros de digitação leves; nome desconhecido vira `sparkles` com aviso no terminal.

**Pictogramas** (estilo sinalização):
- `{ picto: human, pose: walk, sign: circle }` — poses: `stand walk run sit drive phone watch point raise shrug think stamp cheer sleep` (também em português: `em pé`, `andando`, `correndo`, `sentado`, `dirigindo`, `no celular`, `olhando`, `apontando`, `mão levantada`, `dando de ombros`, `pensando`, `carimbando`, `comemorando`, `dormindo`); `sign`: `circle | square | triangle` (placa atrás)
- `{ picto: machine }` — a "máquina"
- `{ picto: crowd, count: 20, highlight: 3 }` — bonequinhos, os primeiros destacados
- `{ picto: scene, name: … }` — cenas prontas:
  - `console` (`screen: "TEXTO"`, `alarm: true`) · `desk` (`papers: true`) · `pair` · `judge` · `elevator` (`button: false`)
  - `car-top` — carro visto de cima: `driver` / `passenger`: `human | human-watch | human-phone | machine`, `back: sleep | human`, `button: true`

**Diagramas**: `{ diagram: loop, nodes: [a, b, c, d], actor: in|on|out, at: 2 }` · `{ diagram: spectrum, stops: [...], at: 1, left, right }` · `{ diagram: flow, steps: [...], highlight: 1 }` · `{ diagram: venn, a, b, both }`

**Gráficos** (animados no HTML; com `--native-charts` viram gráficos nativos editáveis no PowerPoint):
```yaml
{ chart: bar,    data: [{label: A, value: 10}, …], suffix: "%", highlight: [2] }
{ chart: column, data: […], max: 100 }
{ chart: line,   labels: [...], series: [{name, values: [..., null, ...]}], bands: [{at: 6, text: LANCHE}], annotations: [{at: 3, text: "pico"}], min: 0, max: 100, axis: false, markers: false, area: true }
{ chart: donut,  value: 65, center: "65%" }            # ou parts: [{label, value, color}]
{ chart: waffle, total: 100, cols: 10, groups: [{count: 21, label: "…", color: em}, {count: 79, label: "…"}] }
{ chart: isotype, total: 20, highlight: 4, icon: car }
{ chart: stacked, data: [{label, value}, …] }
```
`null` numa série quebra a linha (ex.: sessões diferentes). Cores aceitam papéis do tema (`fg`, `hi`, `em`, `muted`, `line`) ou hex.

**SVG próprio**: `{ svg: "<svg viewBox='0 0 100 100'>…</svg>" }` — use `style="fill:var(--fg)"`, `var(--hi)`, `var(--em)` para seguir o tema.
**Imagem**: `{ image: foto.jpg, fit: cover }` (caminho relativo ao YAML; é embutida no HTML).
**Imagem gerada por IA**: `{ image_prompt: "descrição visual, em inglês", fit: cover }` — `sagadeck imagens deck.yaml` gera o arquivo em `imagens/` com o modelo de imagem e troca por `image:`.

## Notas / roteiro (`notes`)

Markdown simples, pensado para ler em voz alta:

```yaml
notes: |
  ## Título de bloco
  > Frase para falar (aparece destacada)
  CLIQUE: o que acontece no próximo clique
  INTERAÇÃO: o que pedir para a plateia
  PLANO B: o que fazer se ninguém participar
  - item de lista
```
Linhas que começam com PALAVRAS EM MAIÚSCULAS seguidas de `:` viram etiquetas coloridas.

## Tema customizado

```yaml
theme:
  extends: editorial
  colors: { accent: "2F6BFF", alert: "2F6BFF" }
  tones: { accent: { bg: accent, fg: "FFFFFF" } }
  faces:
    display: { css: "font-family: 'Rockwell Extra Bold', serif; line-height: .95;", pptx: { face: "Rockwell Extra Bold" } }
```
Cada face tem `css` (navegador) e `pptx` (nome exato da fonte no PowerPoint). Use fontes instaladas no Windows/Office para o PPTX sair idêntico.

## Widgets próprios

```js
// widgets/contador.js
Sagadeck.widget("contador", {
  mount(el, opts, api) {
    let n = 0;
    el.innerHTML = `<button style="font-size:60px">${opts.rotulo}: 0</button>`;
    el.firstChild.onclick = () => (el.firstChild.textContent = `${opts.rotulo}: ${++n}`);
    api.onStep((k) => {});            // chamado a cada clique do slide
    api.onEnter(() => {}); api.onLeave(() => {});
    api.onKey((tecla) => {});         // teclas livres (ex.: [ ] + -)
    api.store.set("x", 1);            // guarda no navegador (sobrevive a recarregar)
  },
});
```
No YAML: `widgets: [widgets/contador.js]` e `{ widget: contador, rotulo: "Votos" }`. No PowerPoint o widget vira uma imagem do estado final.
