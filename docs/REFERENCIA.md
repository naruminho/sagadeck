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
| `api` | `title, request: {method, url, body/form, headers, auth}, mode, answer, save, token, polling, steps, file, mic, audio, similarity, fields` | requisição ao vivo (tipo Postman) com código curl/Python; ver [Slide api](#slide-api-requisição-ao-vivo) |
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

## Slide `api`: requisição ao vivo

Um slide tipo Postman: mostra o pedido (URL, corpo, cabeçalhos) e o código equivalente (curl, Python e
Python comentado), e o botão **Executar** roda o pedido de verdade e mostra a resposta. Serve para aula
de API: a plateia vê o código, o status mudando e o resultado.

Os pedidos saem do **Studio** (Node, na sua máquina), nunca do navegador: sem problema de CORS, com o
certificado da empresa e com o token fora da página. Sem o Studio (HTML exportado, PDF, servidor
multiusuário), o slide mostra a **última resposta gravada** e o botão vira *Reproduzir gravação*.

No Studio: **Biblioteca → Nova → Exemplo: aula de APIs ao vivo** cria um deck com um slide de cada tipo;
no editor, **Inserir → Slide de API** insere um deles e **Inserir → Ambientes** edita os ambientes. Os
exemplos rodam no ambiente embutido **ENSAIO**, uma API de mentira que o Studio local sobe sozinho (não vai
para o seu arquivo de ambientes; o seu ambiente com o mesmo nome, se existir, vence).

```yaml
- layout: api
  kicker: Ao vivo
  title: Pergunte ao ==modelo==
  request:
    method: POST                     # padrão: POST se tiver corpo, senão GET
    url: "{{base}}/chat"             # {{variáveis}} vêm do ambiente e dos slides anteriores
    body: { messages: [ { role: user, content: "Explique RAG em uma frase" } ] }
    headers: { X-Canal: workshop }   # opcional
    auth: true                       # manda o token do ambiente (padrão)
  answer: "$.choices[0].message.content"   # o campo em destaque na resposta
  save: { resposta_id: "$.id" }            # guarda para os próximos slides: {{resposta_id}}
  portal: "https://…"                      # botão "Abrir no portal"
  notes: …
```

| Campo | O que faz |
|---|---|
| `mode` | `sync` (padrão), `polling` (inicia e consulta até terminar), `stream` (texto chega aos poucos, SSE) ou `realtime` (conversa por WebSocket, abaixo) |
| `request` | `method, url, headers, body` (JSON) ou `form` (upload multipart), `auth` |
| `answer` | caminho do campo em destaque (`$.a.b[0].c`) |
| `save` | `{ nome: "$.caminho" }`: guarda valores da resposta para `{{nome}}` nos slides seguintes (ex.: o `path_id` do upload no OCR e no indexador) |
| `token` | este slide gera o token (ex.: Identity): `token: "$.access_token"`. O token passa a ser o do ambiente; a tela mostra o JWT decodificado e a contagem até expirar, nunca o token |
| `polling` | `id` (código da execução no início), `check: { method, url }` (use `{{id}}`), `status`, `done: [..]`, `failed: [..]`, `interval` (s), `timeout` (s) |
| `steps`, `stepTitle`, `stepText` | lista de etapas na resposta final: vira um cartão por etapa (ex.: OCR → LLM) |
| `stream` | `{ text: "$.choices[0].delta.content" }`: onde está o texto de cada pedaço |
| `file` | arquivo padrão, ao lado do deck. No corpo: `{{file.base64}}`, `{{file.name}}`, `{{file.type}}`; no `form`: `"@file"`. Dá para trocar arrastando outro arquivo no slide |
| `mic` | `true`: botão **Gravar** (microfone). Ao parar, envia a gravação como o arquivo do slide (STT) |
| `audio` | a resposta é áudio (TTS): toca no slide, com a onda; no código, salva em `audio: fala.mp3` |
| `similarity` | embeddings: `{ reference, texts: [..], vector: "$.data[0].embedding" }`; o corpo usa `{{text}}`. Mostra o vetor e a similaridade por cosseno de cada frase |
| `fields` | aba **Parâmetros**: `{ "$.campo": "o que faz" }`, com o valor atual de cada campo |
| `code` | abas de código: `[curl, python, python-comentado]` (padrão: as três) |
| `tab` | aba aberta ao entrar: `body`, `headers`, `fields`, `texts`, `curl`, `python`, `python-comentado` |
| `tokenVar` | nome da variável de ambiente do token no código gerado (padrão `API_TOKEN`) |
| `id` | chave da gravação (padrão: título + URL) |

Na apresentação: a URL e o corpo são editáveis na hora (a execução usa o que está na tela); o código
das abas acompanha. Com `polling`, as linhas do código acendem na fase que está rodando (início, laço de
consulta, resultado) enquanto a linha do tempo mostra cada status.

### Conversa em tempo real (`mode: realtime`, WebSocket)

O Studio abre o WebSocket com o serviço (token no cabeçalho ou na URL, certificado da empresa) e faz a
ponte com a apresentação. No slide: **Conectar**, **Falar** (microfone, com o volume), campo de texto, a
conversa em balões (o que foi dito, transcrito, e a resposta enquanto o áudio toca) e a aba **Mensagens**
com cada evento que passou, nos dois sentidos (o áudio aparece resumido).

```yaml
- layout: api
  title: Conversa por voz
  mode: realtime
  realtime:
    url: "{{ws}}/realtime?model=…"
    auth: header                 # header (Authorization: Bearer) | query:<parâmetro> | none
    open:                        # mensagens mandadas ao conectar
      - { type: session.update, session: { voice: alloy } }
    audio:                       # microfone → PCM16 mono nesta taxa, em pedaços de ~200 ms
      rate: 24000
      send: { type: input_audio_buffer.append, audio: "{{audio}}" }                 # {{audio}} = pedaço em base64
      commit: [ { type: input_audio_buffer.commit }, { type: response.create } ]   # ao clicar em Parar
    text:                        # ao digitar ({{text}})
      - { type: conversation.item.create, item: { type: message, role: user, content: [ { type: input_text, text: "{{text}}" } ] } }
      - { type: response.create }
    receive:                     # como reconhecer o que chega
      type: "$.type"
      audio: { type: [response.audio.delta], data: "$.delta" }                 # PCM16 na mesma taxa
      text:  { type: [response.audio_transcript.delta, response.text.delta], data: "$.delta" }
      user:  { type: [conversation.item.input_audio_transcription.completed], data: "$.transcript" }
      done:  [response.done]
      error: { type: [error], data: "$.error.message" }
```

Só `url` é obrigatório: os padrões acima seguem o formato mais comum dessas APIs; troque o que o seu
serviço fizer diferente. O código gerado é Python (`websockets`) e `wscat`. A conversa fica gravada (em
texto) para o modo sem Studio.

### Ambientes: `~/.sagadeck/ambientes.yaml`

Endereços, credenciais e segredos ficam **na máquina**, nunca no deck (o deck pode ir para o GitHub).
Outro lugar: variável `SAGADECK_AMBIENTES`. O selo no slide (DEV, HOM…) troca o ambiente. No Studio,
**Inserir → Ambientes** mostra o arquivo (ou um modelo comentado, se ele ainda não existe), confere o YAML
antes de gravar e troca o ambiente em uso.

```yaml
current: hom
environments:
  dev:
    vars: { base: "https://api-dev.exemplo.com/v1", wf: "resumo" }   # {{base}}, {{wf}} nos slides
    token:                                # opcional: token que expira (client credentials)
      url: "https://identidade-dev.exemplo.com/token"
      client_id: "meu-id"
      client_secret_env: MINHA_SECRET     # ou client_secret: "…"
      field: "$.access_token"             # onde está o token na resposta
      ttl_minutes: 30                     # renovado 2 min antes de vencer
      # format: form | json (padrão), id_field, secret_field, extra: {…}, header, prefix
    secrets: { client_secret: { env: MINHA_SECRET } }   # {{secret.client_secret}} nos slides
    ca: "C:/certs/empresa.pem"            # certificado da empresa (inspeção TLS); ou NODE_EXTRA_CA_CERTS
    timeout: 60
  hom:
    vars: { base: "https://api-hom.exemplo.com/v1" }
    token: { url: "…", client_id: "…", client_secret_env: MINHA_SECRET }
```

- `vars` vão para a tela (URLs, nomes); **segredo nunca vai em `vars`**. Segredos ficam em `secrets:` e
  entram no slide como `{{secret.nome}}`: quem troca pelo valor é o Studio, na hora de enviar. No código
  gerado aparecem como `$NOME` (curl) e `os.environ["NOME"]` (Python).
- Tokens, segredos e cabeçalhos do ambiente saem **mascarados** (`••••x9Qa`) em tudo o que aparece: pedido
  enviado, resposta, gravação.
- A última resposta boa de cada slide fica em `<deck>.respostas.json`, ao lado do deck (sem tokens).

### Segurança

Executar só funciona no Studio **local**: escutando em `127.0.0.1`, chamado pela própria página
(outros sites e HTML aberto do disco são recusados), só com JSON. No modo multiusuário (servidor) e com
`--host` aberto para a rede, o slide só mostra gravações.

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
