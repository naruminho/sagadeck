# Referência do formato `.yaml` do sagadeck

Um deck é um arquivo YAML com cabeçalho + lista de `slides`. Cada slide escolhe um **layout** e preenche os campos dele.
Tudo que é texto aceita a **marcação inline** (abaixo), inclusive fórmula LaTeX no meio do texto: `$t_c = 57 (L^3/H)^{0,385}$` (e `$$…$$` em destaque; dinheiro como "R$ 10" continua texto). Qualquer slide aceita `notes`, `time`, `tone`.

```yaml
title: Nome da palestra          # obrigatório (vira rodapé e título da janela)
author: Seu Nome · Cargo
theme: sinal                     # sinal | editorial | noite | bauhaus | terminal | jornal | rabisco | oceano | pop | aurora | prata | aluminio | arcade | relevo (ou customizado, ver fim)
palette: floresta                # opcional: só as cores, vale em qualquer tema (ver "Temas e paletas"); sem ela, as cores do tema
duration: 50                     # minutos — o modo apresentador mostra se você está adiantado/atrasado
event: Summit de Dados 2026       # opcional — para {evento} no rodapé/cabeçalho
department: Engenharia de Dados  # opcional — para {depto}
date: 2026-03-07                 # opcional — para {data}; sem date, usa a data do dia
footer: texto do rodapé          # opcional; false desliga; ou { left, center, right } com variáveis:
#   footer: { left: "{autor} · {evento}", center: "{data:DD MMM AAAA}", right: "{n} / {total}" }
#   header: { left: "{depto}", right: "Confidencial" }
#   variáveis: {titulo} {autor} {evento} {depto} {data} {data:MÁSCARA} {pagina} (01) {n} (1) {total}
#   máscara: DD MM AAAA AA MMM (jan) MMMM (janeiro). Capa, seção, encerramento e página inteira ficam sem.
context:                         # opcional: a ocasião (a IA usa para decidir tom, visual e interação; não aparece nos slides)
  pessoas: 30                    #   tamanho da plateia
  formato: presencial            #   presencial | online | gravado
  tom: executivo                 #   executivo | técnico | didático | informal
  objetivo: decidir              #   decidir | informar | ensinar | inspirar (e o que mais ajudar)
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
| `theme` / `palette` | tema e/ou paleta só deste slide (o resto da apresentação não muda); `palette: tema` volta às cores do tema |
| `kicker` | linha pequena acima do título (rótulo) |
| `title` / `titleSize` / `titleAs` | título; tamanho em px; papel tipográfico (`title`, `h2`, `h3`) |
| `source` | fonte/nota de rodapé do slide |
| `add` | elemento(s) extra(s) no fim da área útil |
| `notes` | roteiro do apresentador (Markdown simples, ver abaixo) |
| `consulta` | texto de consulta: só no **material de estudo** (a outra visão do mesmo deck), logo depois do slide; não aparece na apresentação (Markdown simples, como `notes`) |
| `time` | minutos planejados para o slide (soma no cronômetro) |
| `build: true` | revela os itens (lista, cards, linha do tempo, matriz…) **um por clique** |
| `steps: N` | força N cliques no slide (útil para widgets) |
| `background` | figura de fundo atrás do conteúdo |
| `bg` / `fg` | cor de fundo / texto (hex) só neste slide |
| `transition` | `fade` (padrão), `cut` (seca), `saida` (o anterior recua e dissolve, o próximo entra de baixo) ou `morph` (crossfade longo com respiro de escala; combine com `continuity:` nos elementos que continuam) — só no HTML; PPTX/PDF usam o quadro final |
| `ambient` | eco ambiente nos slides estáticos: `pontos` (poeira de luz à deriva) ou `grade` (grade em perspectiva deslizando) — lembra a capa sem repeti-la; parado com movimento reduzido ou na exportação |
| `footer: false` | esconde o rodapé neste slide |
| `id` | nome curto do slide, destino dos links (`goto`, `back`, `next`, `[texto](#id)`); ver [Navegação por caminhos](#navegação-por-caminhos-hub-goto-back-next) |
| `back` | id (ou número) do slide para onde o botão **Voltar** do canto leva; o botão mostra o título do destino |
| `next` | id (ou número) do slide para onde o avanço leva **no fim deste slide** (o fim de um caminho volta ao mapa, em vez de seguir a ordem) |

Títulos equilibram as linhas sem quebrar palavras arbitrariamente. A hifenização automática respeita o idioma do deck (`lang`, padrão `pt-BR`).

## Marcação inline (qualquer texto)

`**negrito**` · `*itálico*` · `==destaque==` (marca-texto animado; o estilo muda com `markStyle` no deck ou no slide: `marca-texto`, `sublinhado`, `cor`, `negrito`, `nenhum`) · `^^cor de ênfase^^` · `~~riscado~~` · `t~c~` (índice) e `m^2^` (expoente) · `` `código` `` · `[link](https://…)` · `[texto](#id)` (leva ao slide de `id`) · quebra de linha = nova linha no YAML (`|`).

Tabela em markdown no meio de um texto (`problem`, `body`, `text`, passo do `solution`…) vira tabela de verdade: uma linha `| a | b |` por linha, com `|---|---|` depois do cabeçalho (sem essa linha não há cabeçalho). Para a tabela principal do slide, prefira o layout/elemento `table`.

## Layouts

| layout | campos principais | uso |
|---|---|---|
| `cover` | `kicker, title, subtitle, author, role, figure` | capa |
| `section` | `number, kicker, title, subtitle, figure` | abertura de ato/capítulo (tom `accent` por padrão) |
| `statement` | `text` **ou** `lines: [ {text, as, color, step} ]`, `by`, `center` | uma frase de impacto; `lines` + `build` revelam linha a linha |
| `calendar` | `kicker, title, events: [{date, title, text, tag, color}], undated: [{title, text}], undatedTitle, cols, build` | datas num **calendário** (agenda, lançamentos, cronograma, "infográfico em forma de calendário"): um cartão por mês que tem evento, com o mini calendário do mês (os dias marcados na cor do tipo) e a lista; `date`: `2026-12-18`, `18/12/2026` ou só o mês `2026-12`; cada `tag` (Filme, Série…) ganha uma cor e entra na legenda; o que não tem data vai no cartão "sem data" (`undated`). Para "calendário", este; `timeline` é para uma sequência de marcos sem a grade dos dias |
| `poster` | `kicker, title, subtitle, hero` (ilustração principal: `{ image_prompt }`, imagem, gráfico…), `panels: [{label, title, text, icon` ou `figure` ou `image_prompt, facts: [{value, label}]}], flow, cols, key, build` | infográfico de UMA página no estilo de figura de revista científica (Nature, Scientific American): a ilustração principal e painéis com letra (a, b, c…), cada um com um desenho, título, texto curto e números com unidade; `flow: true` põe setas na ordem (receita, processo, protocolo); `key` é a nota de rodapé (fonte, condições). Para "infográfico de uma página", "pôster" ou "como fazer X numa página", este e não o `onepage` (que é jornada, problema e solução de um projeto). Ilustre os painéis com `image_prompt` no mesmo estilo (ex.: "clean scientific illustration, flat, white background") |
| `definition` | `kicker, term, origin, parts: [{word, meaning}], text, icon` (ou `figure`), `build`, `termSize` (px do termo) | definição de um termo, como verbete: o termo em destaque, a origem da palavra em partes (`origin: do grego`, `parts: [{word: hydor, meaning: água}, {word: logos, meaning: ciência}]`) e a definição; para "o que é X", use este e não um `statement` com o parágrafo inteiro |
| `quote` | `quote, by, role, after, afterStep` | citação; `after` aparece num clique |
| `number` | `value, prefix, suffix, decimals, from, label, context, side, valueColor` | número gigante animado (conta de `from` até `value`) |
| `split` | `title, body, bullets, content, figure, ratio: "1.2:1", reverse, build` | texto + figura |
| `cards` | `title, items: [{icon, picto, number, title, text, foot, hl, goto}], cols, build` | 2–4 cartões |
| `list` | `title, items: [texto ou {text, sub, goto}], numbered, size, build` | lista numerada grande |
| `hub` | `kicker, title, question, options: [{icon, title, text, meta, goto}], cols, build` | mapa de caminhos: cada opção leva (`goto`) à parte da apresentação daquele caminho; ver [Navegação por caminhos](#navegação-por-caminhos-hub-goto-back-next) |
| `onepage` | `kicker, title, subtitle, journey: [texto ou {icon, title, text, goto}], journeyTitle, problem: {title, text, numbers: [{value, label}], items}, solution: {…}, dashboard: {numbers: [{value, label, trend, title}], figures: [gráfico ou ufmap, com title]}` | tudo numa página (jornada, problema, solução, painel); ver [One-page](#one-page-onepage) |
| `status` | `kicker, title, health: ok\|risco\|atrasado, healthLabel, progress (0–100), highlight, done, doing, blocked, risks, upcoming: [texto ou {text, owner, due}], shots: [{image, caption}]` | status semanal; ver [Status semanal](#status-semanal-status) |
| `stats` | `title, stats: [{value, label, text, icon, trend, trendUp, color}], cols, build` | indicadores (KPIs) em cartões, com tendência (`trend: "+12%"`) |
| `timeline` | `title, events: [{when, title, text, tag}], highlight, after, build` | linha do tempo |
| `chart` | `title, chart: {…}, side (texto ou elemento), chartHeight` | gráfico + comentário |
| `table` | `title, head, rows, style, color, highlight, total, side, caption, source` | tabela de verdade nas cores do tema |
| `compare` | `title, left: {label, value, title, text, items, figure, hl}, right: {…}, vs, after, build` | A × B |
| `matrix` | `title, x: [esq, dir], y: [cima, baixo], cells: [4 × {title, text, example, hl}], build` | matriz 2×2 |
| `question` | `question, options: [texto ou {key, text, sub}], keys, cols, timer, hint, optionSize` | pergunta para a plateia (com timer) |
| `poll` | `question, id, options, compare: outroId, hint` | enquete: o apresentador digita os resultados e o slide anima as barras; `compare` mostra a diferença para outra enquete |
| `video` | `title, url, label, figure, caption` | cartão que abre um vídeo |
| `code` | `title, filename, language, code, highlight: [linhas], size, note` | código com linhas destacadas; cabem ~16 linhas por slide a 10 pt (~12 no tamanho normal): mais que isso, divida em slides de continuação |
| `codewalk` | `title, filename, language, code, highlight: [linhas], size, steps: [{title, text, highlight: [linhas], output}]` | código guiado: usa o mesmo editor, tema e realce de sintaxe; cada etapa pode trocar as linhas destacadas e explicar uma saída simulada |
| `spotlight` | `title, image` ou `figure`, `caption, hotspots: [{x, y, width, height, title, text}]` | foco guiado em regiões de screenshots, imagens ou diagramas |
| `api` | `title, request: {method, url, body/form, headers, auth}, mode, answer, save, token, polling, stream, realtime, steps, file, mic, audio, similarity, fields, code, tokenVar, tab, portal` | requisição ao vivo (tipo Postman) com código curl/Python; ver [Slide api](#slide-api-requisição-ao-vivo) |
| `image` | `image` ou `figure`, `title, caption` | imagem/figura em tela cheia |
| `blocks` | `title, content: [elementos]` | layout livre em fluxo (linhas/colunas) |
| `canvas` | `elements: [{…, x, y, w, h}]` | posicionamento absoluto em 1920 × 1080 |
| `end` | `title, subtitle, contacts, figure, qr, qrLabel` | encerramento; `qr: <link>` põe um QR code ao lado (ex.: LinkedIn) |
| `references` | `title, items` | fontes (2 colunas) |
| `headline` | `kicker, text, as, size, caption` | manchete: uma frase enorme ocupando o slide |
| `full` | `figure` (ou `image`/`image_prompt`), `kicker, title, caption, overlay: bottom\|left\|center\|none, fit, titleSize` | figura/imagem de página inteira com texto por cima; com `image_prompt` a IA gera a página toda |
| `kinetic` | `figure, beats: [{text, style, position, color, size, tag}], autoplay, interval` | frases curtas em sequência sobre uma cena; avanço manual ou automático |
| `bento` | `title, tiles: [{title, text, value, icon, figure, size: big\|wide\|tall, hl}], cols, build` | mosaico de blocos de tamanhos diferentes |
| `funnel` | `title, stages: [{title, value, text, hl}], build` | funil que afunila etapa a etapa |
| `pyramid` | `title, levels: [{title, text, hl}], build` | pirâmide (topo → base) |
| `agenda` | `title, items: [{title, text, time}], current, build` | agenda com a seção atual destacada |
| `mosaic` | `kicker, title, items: [{title, text, value, icon, code, foot}], build` | grade adaptável de 1 a 12 itens; ver [Grades adaptáveis](#grades-adaptáveis-mosaic-ribbon-dossier) |
| `ribbon` | `kicker, title, items, build` | os mesmos itens em cápsulas arredondadas |
| `dossier` | `kicker, title, items, build` | página de consulta compacta, com blocos de código |
| `infographic` | `kicker, title, shape, center: {title, text, icon}, items: [{title, text, icon, steps}], build, caption` | infográfico desenhado: arco, ramos, lados, trilhas ou metrô; ver [Infográficos](#infográficos-infographic) |
| `diagram` | `kicker, title, mermaid, caption, autoDirection` | diagrama desenhado (fluxograma, sequência, estados, UML, ER, jornada, mapa mental, linha do tempo, blocos) nas cores do tema; ver [Diagramas](#diagramas-diagram) |

### Ajustes finos de campos

- Em qual clique uma parte aparece: `byStep` (statement), `chartStep` e `sideStep` (chart, number), `contextStep` (number), `figureStep` (split), `noteStep` (cards). Valor = número do clique.
- Tamanhos e papéis: `bodyAs` (split: papel tipográfico do `body`, padrão `lead`), `bulletSize` (split: tamanho dos bullets), `labelSize` (number: tamanho do rótulo, padrão 52), `timerLabel` (question: texto do cronômetro).
- Nomes alternativos aceitos: `kpis` = `stats`; `process` e `flow` = `steps`.

### Cenas interativas para ensinar

`codewalk` mantém o código estável e revela a explicação, o destaque de linhas e uma saída esperada por etapa. O código e os comandos cURL são texto; não há execução. No Studio, a linguagem é inferida pela extensão do arquivo e pode ser escolhida no menu: Python (`.py`), Java (`.java`), JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`) ou C# (`.cs`). Node.js é um runtime de JavaScript, não uma linguagem separada; arquivos Node usam a opção JavaScript. A apresentação aplica realce sintático a essas cinco linguagens sem depender de serviços externos. Use as setas da apresentação ou os botões numerados. Depois da última etapa, a seta avança ao slide seguinte. As etapas também aparecem corretamente na prévia do apresentador e são restauradas pelo endereço da apresentação.

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

**Zoom lento (opcional):** `zoom: true` no slide aproxima devagar (1,8 s, sem solavanco) de cada região ativa, 1,8× por padrão; `zoom: 2.5` escolhe quanto; `zoom` num hotspot vale só para ele (`zoom: 1` ou `false` mostra a imagem inteira nesse passo, bom para abrir e fechar). A imagem nunca mostra borda vazia; PDF, impressão e "sem animação" ficam na imagem inteira.

No `spotlight`, `x` e `y` indicam o canto superior esquerdo da região; os quatro números são porcentagens da imagem. As regiões são limitadas à imagem, respeitam a proporção de screenshots verticais e podem ser clicadas diretamente. Também é possível usar `figure` com SVG ou diagrama no lugar de `image`. Prefira 2–4 etapas e explicações curtas para manter o slide legível. Em HTML sem JavaScript aparece a primeira etapa; PDF, impressão e exportação estática mostram um resumo de todas as etapas, sem controles. Imagens locais são embutidas no HTML para funcionar offline.

**Proporção do slide:** `aspect: "16:9"` (padrão), `"4:3"`, `"16:10"`, `"3:2"`, `"1:1"`, `"9:16"` (retrato), `"a4"` ou qualquer `"L:A"` (ex.: `"5:4"`). A largura lógica é sempre 1920 px e a altura acompanha (4:3 → 1920 × 1440); os layouts se ajustam sozinhos, e posições livres (`canvas`: x, y, w, h) valem nesse espaço. Use a proporção do material original quando for converter ou imitar um deck (ex.: um PowerPoint 4:3).

O cabeçalho do deck aceita `purpose: palestra | consulta` — os dois usos de um material. `palestra` (**para apresentar**, o padrão): alguém fala e a plateia assiste; letra grande, respiro e pouco texto na tela (o fiscal "anti-sono" reclama acima de 40 palavras), o detalhe vai em `notes`. `consulta` (**para estudar depois**): o material vai ser enviado e a audiência usa como fonte de estudo; a explicação fica no slide, em parágrafos curtos, com código completo, sem slide só de título de seção, quiz ou "número de impacto", e a auto-correção não move texto para as notas (220 palavras antes do aviso). `maxWords` no deck ou no slide vence. (`aula`, `workshop` e `executiva` de decks antigos ainda valem; não use.) Se o pedido não deixar claro, a IA pode perguntar antes de gerar (Preferências › Inteligência artificial). **Palco e estudo no mesmo deck**: numa palestra, o slide fica enxuto e o que o aluno precisa ler depois vai em `consulta:` do slide (explicação completa, passo a passo, referências, a fórmula com as unidades); o **material de estudo** (Arquivo › Baixar material de estudo, em PDF ou HTML; `sagadeck estudo deck.yaml`) traz cada slide inteiro, tudo revelado, com esse texto logo depois, e sem as notas do apresentador. **Arquivo › Compartilhar link (só leitura)** dá um link para alguém ver a apresentação (sem editar e sem as notas, a não ser que se marque); no servidor, só quem entra no portal ou qualquer pessoa com o link; revoga-se na mesma janela. Quem abre também baixa (PDF, PowerPoint, HTML, material de estudo, `.sagadeck`), sem as notas se o link é sem as notas. Se a pessoa pedir para mandar a apresentação a alguém, indique esse caminho. Ao melhorar ou expandir uma aula para apresentar, ponha o aprofundamento em `consulta` em vez de lotar o slide. Para material técnico, os temas `manual` (claro, imprime bem) e `manual-noite` (escuro) formam um par: Design › Versão escura/clara troca entre eles, e o PDF pode sair no claro (Preferências › Exportação).

O cabeçalho do deck aceita `fit: { minCodePt, minTextPt, wrapCode }`: até onde o ajuste para caber encolhe código e texto (em pt, como no PowerPoint; 1 pt = 2 px no slide de 1920; padrões 10 e 6, ou os das Preferências do Studio) e se linha longa de código quebra (padrão `true`). Código que não cabe nem no mínimo rola na apresentação e o fiscal avisa, com a opção de dividir em dois slides.

O cabeçalho do deck aceita `motion: none | subtle | expressive` (padrão `subtle`; no Studio, menu **Apresentar ▾ › Animações**: Sem animação, Suaves, Expressivas). A preferência do sistema por movimento reduzido tem prioridade. A intensidade muda a animação; os controles e revelações continuam funcionando.

## Screenshots com destaques no Studio

Em **Início → Screenshot**, cole (Ctrl+V), arraste ou escolha uma imagem PNG, JPEG ou WebP de até 8 MB.
Também é possível colar uma imagem fora dos campos de texto ou soltá-la no canvas para abrir esse editor.
Imagens coladas no chat continuam sendo anexos para o assistente.

- **Ponto**: clique onde a audiência deve olhar. O marcador numerado pulsa quando está ativo.
- **Área**: arraste sobre o detalhe que deve ser contornado.
- Selecione um marcador para escrever a explicação, arrastá-lo ou ajustá-lo com as setas do teclado.
- Clique num ponto ou área e pressione **Delete** ou **Backspace** para removê-lo. Dentro dos campos de texto, essas teclas continuam editando o texto.
- Use ↑ / ↓ na lista para ordenar a narrativa. Cada cena aceita até oito destaques.
- **Usar screenshot** salva; **Cancelar** descarta a edição. Sem destaques, a imagem entra estática e inteira.
- Para voltar, selecione a cena e clique em **Editar imagem e destaques** no painel Formatar.

O arquivo da imagem fica embutido no deck. Na apresentação, os destaques são percorridos pelos controles
ou pelas setas; em PDF/exportação estática, aparecem numerados junto do resumo das explicações.
Movimento reduzido e modo Essencial desativam a pulsação. Recorte, ocultação de dados sensíveis e
paginação automática de apostila ainda não fazem parte deste editor.

No YAML, um ponto usa `kind: point`, `x` e `y` em porcentagens. Áreas usam `kind: area` (ou omitem `kind`)
e acrescentam `width` e `height`. Ambos aceitam `title` e `text` dentro de `hotspots` do layout `spotlight`.

## Slide `kinetic`: tipografia em cena

O layout `kinetic` combina uma figura de fundo com frases curtas que entram em sequência, podendo variar
estilo, posição, cor e escala em cada batida. No Studio, adicione a cena e edite cada frase; a sequência
interativa roda em **Apresentar** e avança pelos botões ou automaticamente. A prévia no editor mostra
apenas o primeiro quadro. Ao trocar outro layout para `kinetic`, o SagaDeck reaproveita o título ou os
itens existentes como frases e mantém a figura do slide. Sem título, frase ou itens, começa com
“Uma ideia em movimento”.

`autoplay` é `true` por padrão para duas ou mais frases e `interval` define o tempo em milissegundos
(450–5000, padrão 1000). Movimento automático começa ao entrar no slide, para ao sair ou ao chegar à
última frase, e respeita a preferência do sistema por movimento reduzido; o botão ainda permite iniciar
manualmente. Para uma frase estática, use `autoplay: false`.

Os estilos disponíveis são `clean`, `poster`, `editorial`, `outline` e `marker`; o estilo limpo é o padrão,
sem brilho ou sombra exagerada. Posições: `left`, `center`,
`right`, `top` e `bottom`; cores: `white`, `gold`, `pink` e `cyan`; escalas: `small`, `medium` e `large`.
Campos omitidos variam com a batida para criar ritmo visual. Em impressão/exportação estática, os controles
e a animação são substituídos por uma lista das frases.

```yaml
- layout: kinetic
  figure: { image: palco.jpg }
  autoplay: true
  interval: 1100
  beats:
    - { text: "A IDEIA", style: poster, position: left, color: white, size: large, tag: "COMEÇA PEQUENA" }
    - { text: "ACENDE", style: clean, position: right, color: white, size: large }
    - { text: "E MUDA", style: editorial, position: bottom, color: gold, size: medium }
```

## Slide `api`: requisição ao vivo

Um slide tipo Postman: mostra o pedido (URL, corpo, cabeçalhos) e o código equivalente (curl, JavaScript,
Python e Python comentado), e o botão **Executar** roda o pedido de verdade e mostra a resposta. Serve para aula
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
| `code` | abas de código: `[curl, javascript, javascript-comentado, python, python-comentado]` (padrão: curl, javascript, python, python-comentado; sem javascript em tempo real e similaridade). O JavaScript é para Node 18+ (fetch nativo), sem dependências |
| `tab` | aba aberta ao entrar: `body`, `headers`, `fields`, `texts`, `log` (WebSocket), `curl`, `javascript`, `javascript-comentado`, `python`, `python-comentado` |
| `tokenVar` | nome da variável de ambiente do token no código gerado (padrão `API_TOKEN`) |
| `id` | chave da gravação (padrão: título + URL) |

Na apresentação: a URL e o corpo são editáveis na hora (a execução usa o que está na tela); o código
das abas acompanha. Com `polling`, as linhas do código acendem na fase que está rodando (início, laço de
consulta, resultado) enquanto a linha do tempo mostra cada status.
No Studio, a aba **Variáveis** mostra o ambiente atual em uma tabela **Nome / Valor**. Edite ou crie variáveis
normais ali; nomes e valores são salvos no arquivo de ambientes, nunca no deck. Arraste um nome da tabela
para um campo do slide para inserir `{{nome}}`. Segredos são listados pelo nome, mas seu valor nunca aparece.
Os campos `save` do deck também aparecem com sua origem e disponibilidade.
O editor de ambientes valida o YAML antes de habilitar **Salvar** e preserva a versão anterior em `ambientes.yaml.bak`.
O botão **Variáveis** (na barra do slide) é o inspect/watch da apresentação, tudo num lugar só:
- **Ambiente**: as variáveis (criar, editar, apagar) e as **protegidas** (marque "protegida" ao criar): na tela só o nome
  e ••••; o olhinho mostra o valor por 15 segundos. Nos slides e no código gerado aparece o nome (`{{secret.chave}}`),
  então o deck pode ir para outras pessoas sem vazar nada.
- **Token**: só os 4 últimos caracteres, qual slide gerou e quanto falta para expirar.
- **Guardadas pelos slides** (`save:`), com o slide de onde veio; clique em `{ }` para inspecionar o valor inteiro.
- **Observar**: expressões que ficam à vista enquanto você apresenta: `{{nome}}` ou `$.caminho` na última resposta.
- Rodapé: **onde está salvo** — `~/.sagadeck/ambientes.yaml` (no Windows, `C:\Users\<você>\.sagadeck\ambientes.yaml`),
  ou `SAGADECK_AMBIENTES`; botão para abrir a pasta. Fica fora das apresentações. No Windows, as protegidas são gravadas
  cifradas (DPAPI: só o seu usuário, nesta máquina, lê de volta; o arquivo copiado não entrega o segredo).

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

### Teste real com OpenRouter

O exemplo de API inclui uma chamada real ao modelo gratuito NVIDIA Nemotron 3 Super
(`nvidia/nemotron-3-super-120b-a12b:free`), compatível com Chat Completions. O modelo gratuito Thinking Machines Inkling
(`thinkingmachines/inkling:free`) retorna HTTP 403 nessa rota, pois o OpenRouter o limita a agent harnesses.
No slide, escolha o ambiente **OPENROUTER** e clique em **Executar**.
Defina `OPENROUTER_API_KEY` no processo que inicia o Studio (no PowerShell: `$env:OPENROUTER_API_KEY = "sua-chave"`)
e reinicie o Studio. O Studio envia a chave ao OpenRouter no cabeçalho `Authorization`; ela não é gravada
no deck nem exibida na página. Os demais exemplos continuam usando o ambiente local **ENSAIO** sem chave.

### Segurança

Executar só funciona no Studio **local**: escutando em `127.0.0.1`, chamado pela própria página
(outros sites e HTML aberto do disco são recusados), só com JSON. No modo multiusuário (servidor) e com
`--host` aberto para a rede, o slide só mostra gravações.

## Navegação por caminhos (`hub`, `goto`, `back`, `next`)

Para processo com vários caminhos ("é experimento ou projeto? DEV, HOM ou PROD?", "o que muda conforme o
front-end?"), em vez de uma sequência única: um **mapa** (`layout: hub`) com as opções, cada uma levando à sua
seção; cada seção termina voltando ao mapa. Funciona ao apresentar (clique), no PDF (links entre páginas) e no
PowerPoint (clique pula para o slide).

- `id: mapa` num slide o torna destino. `goto: mapa` (ou o número do slide) em opção do `hub`, cartão (`cards`),
  item de lista (`list`) ou etapa (`steps`) deixa o item clicável, com uma seta. No texto: `[veja o projeto](#proj)`.
- No **primeiro** slide de cada caminho, `back: mapa` mostra o botão **Voltar: <título do mapa>** no canto.
- No **último** slide de cada caminho, `next: mapa`: avançar ali volta ao mapa, em vez de cair no primeiro slide do
  caminho seguinte. Dentro do caminho a ordem é a normal (o próximo da lista).
- Ordem no YAML: capa, mapa, depois cada caminho inteiro em sequência (os slides de um caminho juntos), e o
  encerramento. Dá para ter mapa dentro de caminho (um caminho que se abre em outros), com `back` para o mapa de cima.
- Destino que não existe vira aviso no build ("o link para x não leva a nenhum slide").

```yaml
- layout: hub
  id: mapa
  title: Qual é o seu caso?
  question: Cada caminho tem prazos e responsáveis diferentes
  options:
    - { icon: flask-conical, title: Experimento, text: Dados fictícios, meta: 30 dias, goto: experimento }
    - { icon: rocket, title: Projeto, text: DEV, HOM e PROD, goto: projeto }
- layout: steps
  id: experimento
  back: mapa
  title: Experimento
  steps: [{ title: Pedido }, { title: 30 dias }, { title: Renovar ou virar projeto, goto: projeto }]
- layout: statement
  text: Passou de 30 dias? Renove ou [vire projeto](#projeto).
  next: mapa            # fim do caminho: volta ao mapa
- layout: cards
  id: projeto
  back: mapa
  next: mapa
  title: Projeto
  items: [{ title: DEV, text: 30 dias }, { title: HOM, text: 30 dias }, { title: PROD, text: sem prazo }]
```

## One-page (`onepage`)

Tudo numa página só: **jornada** (etapas com ícone e mini-frase, lado a lado), **o problema** (texto, números
grandes, tópicos), **a solução** e, quando fizer sentido, um **painel** (dashboard): números grandes em cima,
gráficos e mapa por UF embaixo. Só aparecem as partes preenchidas e o arranjo se ajusta: sem painel, a letra
cresce e o conteúdo vai para o meio; com problema/solução e painel, os dois ficam lado a lado; só o painel = um
dashboard de página inteira. Os gráficos do painel são os mesmos de `chart` (com `title`), e o mapa é o `ufmap`.
`problem`/`solution` também aceitam só o texto (`problem: Leva 2 semanas`). Etapa da jornada só com texto
aparece como frase curta em destaque. É denso de propósito: o limite de palavras dele é 120 (os outros, 40).

```yaml
- layout: onepage
  kicker: Proposta
  title: Cadastro digital de clientes
  subtitle: Menos papel, menos fila, menos retrabalho
  journey:
    - { icon: user, title: Cliente chega, text: Fila de 40 min }
    - { icon: file-text, title: Preenche papel, text: 3 formulários }
    - { icon: check, title: Conta aberta, text: Até 5 dias }
  problem:
    text: O cadastro em papel atrasa a abertura de contas.
    numbers: [{ value: 5 dias, label: para abrir uma conta }, { value: 20%, label: dos cadastros refeitos }]
  solution:
    text: Cadastro no tablet, com validação na hora e assinatura digital.
    items: [Conta aberta no mesmo dia, Zero papel na agência]
  dashboard:
    numbers: [{ value: 1,2 mi, label: cadastros por ano, trend: +8% }]
    figures:
      - { title: Tempo por etapa (min), chart: bar, data: [{ label: Fila, value: 40 }, { label: Papel, value: 25 }] }
      - { title: Cadastros por UF (mil), ufmap: { SP: 320, RJ: 140, MG: 150, BA: 90 }, highlight: [SP] }
```

## Status semanal (`status`)

Um slide por semana, por projeto: o que foi feito, o que está em andamento, bloqueios, riscos e problemas e os
próximos passos, com a saúde do projeto (`health`: `ok` Em dia, `risco` Atenção, `atrasado` Atrasado; `healthLabel`
troca o texto) e o avanço (`progress`, em %). Só as seções preenchidas aparecem e o arranjo se ajusta: semana sem
nada mostrável fica com duas colunas limpas, sem buraco. Item é texto ou `{text, owner, due}` (aparece "Ana · até
30/09"). `shots` (até 3) põe as telas da semana ao lado, com legenda; `highlight` é a frase de destaque. Para um
status por projeto, um slide `status` para cada.

```yaml
- layout: status
  kicker: Semana 39 · 22 a 26/09
  title: Portal do cliente
  health: risco
  progress: 65
  highlight: Login novo em homologação
  done: [Tela de login, { text: Integração com o cadastro, owner: Ana }]
  doing: [Recuperação de senha]
  blocked: [{ text: Liberação de firewall, owner: Infra, due: 30/09 }]
  risks: [Prazo de HOM apertado]
  upcoming: [Homologar com o negócio]
  shots: [{ image: imagens/login.png, caption: Nova tela de login }]
```

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
| pontos | `{ points: fone }` ou `{ points: { de: fone, para: mic, legenda: "Ouvindo", legendaPara: "Agindo" } }` — ícone desenhado com luzinhas que viajam de uma forma a outra no clique (só no HTML; PPTX/PDF usam a inicial). Formas: `fone`, `mic`, `doc`, `planilha`, `busca`, `chat` |
| forma | `{ shape: rect|rounded|circle|pill|line|triangle|diamond|hexagon|star|arrow|chevron|bubble, fill: hi, stroke: fg, strokeWidth, w, h, content }` (circle vira elipse se w ≠ h; triangle…bubble são desenhos com preenchimento e contorno) |
| selo | `{ badge: "NOVO" }` |
| aviso | `{ aviso: { tipo: dica, titulo: "Dica", texto: "…" } }` — tipos: `importante`, `atencao`, `dica`, `perigo` (atalho: `{ aviso: "texto" }` vira dica). Caixa com ícone e cor do tema para o que não pode passar batido; slide denso fecha com 1 takeaway em ==destaque== mais um aviso quando couber |
| vídeo | `{ video: "https://…", label: "Assistir" }` · loop silencioso de fundo/detalhe: `{ video: cena.mp4, loop: true, poster: capa.jpg }` (repete sozinho, sem controles; PPTX/PDF usam o `poster` ou o primeiro quadro) |
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
{ chart: column, labels: [2024, 2025], series: [{name: Receita, values: [10, 14]}, {name: Custo, values: [8, 9]}] }   # agrupadas, com legenda (bar também)
{ chart: line,   csv: dados/vendas.csv }            # lê o arquivo ao lado do deck: 1ª coluna rótulo, cada coluna de números uma série
{ chart: line,   labels: [...], series: [{name, values: [..., null, ...]}], bands: [{at: 6, text: LANCHE}], annotations: [{at: 3, text: "pico"}], min: 0, max: 100, axis: false, markers: false, area: true }
{ chart: donut,  value: 65, center: "65%" }            # ou parts: [{label, value, color}]
{ chart: waffle, total: 100, cols: 10, groups: [{count: 21, label: "…", color: em}, {count: 79, label: "…"}] }
{ chart: isotype, total: 20, highlight: 4, icon: car }
{ chart: stacked, data: [{label, value}, …] }
```
`null` numa série quebra a linha (ex.: sessões diferentes). Cores aceitam papéis do tema (`fg`, `hi`, `em`, `muted`, `line`) ou hex.
`xLabel` / `yLabel` dão nome aos eixos (linhas e colunas). `from: { file, sheet, columns: [rótulo, série…] }` num slide de gráfico diz de que planilha do projeto os dados vieram (o Studio põe ao inserir uma sugestão; "Atualizar da planilha" relê o arquivo). Não invente `from`.
`csv:` (qualquer tipo com dados) troca `data`/`labels`/`series` pelo conteúdo do arquivo (`;`, `,` ou tab; vírgula decimal; cabeçalho vira o nome das séries): atualizou o arquivo, o slide atualiza. Arquivo sumido: ficam os dados do slide e o fiscal avisa. No Studio, os dados ficam numa **planilha** no Formatar: cola do Excel (Ctrl+V em qualquer célula preenche a partir dela), importa CSV e ganha colunas de série.

**Mapa do Brasil por UF** (em grade: cada estado é um quadrado na posição aproximada; a cor mais forte é o maior
valor): `{ ufmap: { SP: 320, RJ: 140, MG: 150 }, suffix: " mil", prefix: "R$ ", highlight: [SP], legend: "cadastros", showValues: true }`.
Chave é a sigla da UF (sigla desconhecida vira aviso); UF sem valor fica apagada. Em quadro estreito só as siglas
aparecem (`showValues: true` força os valores).

**SVG próprio**: `{ svg: "<svg viewBox='0 0 100 100'>…</svg>" }` — use `style="fill:var(--fg)"`, `var(--hi)`, `var(--em)` para seguir o tema.
**Imagem**: `{ image: foto.jpg, fit: cover }` (caminho relativo ao YAML; é embutida no HTML). Sem `fit`, a imagem preenche a caixa, mas cabe inteira (`contain`) quando o corte passaria de 20% (gráfico com eixo e legenda na borda, esquema largo numa coluna alta); solta no fluxo (num `add`) e sem altura, não passa de 420 px. Para foto que pode ser cortada, `fit: cover`; para gráfico, `fit: contain`.
**Imagem gerada por IA**: `{ image_prompt: "descrição visual, em inglês", fit: cover }` (sai sem texto: rótulos, números e títulos vão no slide; se a ilustração precisa de rótulos dentro dela, diga quais no prompt, em português e entre aspas: `with labels "Divisor de água", "Rio"`) — `sagadeck imagens deck.yaml` gera o arquivo em `imagens/` com o modelo de imagem e troca por `image:`.
**Redesenhar uma figura do deck** (xerox, escaneada, borrada): `{ image_prompt: "Clean up and redraw THIS EXACT figure… (o que ela mostra, as cores)", image_ref: imagens/original/mapa.png, fit: contain }` — o modelo de imagem recebe a figura como base e devolve o redesenho; se não sair, fica a figura de base.

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

## Temas e paletas

Como no PowerPoint, são duas escolhas independentes:

- **Tema** (`theme`): fontes, raio das bordas, textura e uma **pele** própria que rearruma capa, seção e encerramento, muda o jeito dos slides de conteúdo (título, cartões, marcadores da lista, citação, número grande, frase) e põe ornamentos (`sinal`: faixa zebrada e selo no chapéu; `editorial`: fios e capa centralizada; `noite`: moldura fina; `bauhaus`: círculo, quadrado e triângulo; `terminal`: janela com barra e prompt; `jornal`: fios de jornal e manchete sublinhada; `rabisco`: fitas adesivas e títulos inclinados; `oceano`: ondas e chapéu em pílula; `pop`: adesivos e sombra chapada; `aurora`: brilhos e traço em gradiente; `prata`: limpo e centralizado (o branco da Apple de hoje); `relevo`: ficção científica sóbria (sala de controle de filme, sem néon): grafite profundo, curvas de nível ao fundo, cantoneiras de mira, título leve embaixo à esquerda, rótulos técnicos em monoespaçada; combina com ilustração 3D realista (terreno, cidade, água) e gráfico 3D (`science` com superfície); `arcade`: videogame e fliperama, tela de tubo com linhas de varredura, neon, título em pixel no meio e chão de tijolos de jogo de plataforma; `aluminio`: prata metálico dos lançamentos de iPhone e iPad de 2020, título cromado embaixo à esquerda e um disco de metal polido; `manual` e `manual-noite`: documentação técnica, sem ornamento, código e texto corrido legíveis — o par claro/escuro do mesmo arranjo, para material de consulta, tutorial e apostila: `manual` imprime bem, `manual-noite` descansa a vista). Nos slides de conteúdo: `sinal` barra de aviso e placas; `editorial` fios finos e citação centralizada; `noite` tudo centralizado e cartões vazados; `bauhaus` faixas de cor primária e círculos; `terminal` título como comando e cartões-janela; `jornal` fios duplos e colunas; `oceano` cartões flutuando e balões; `pop` contorno grosso e sombra dura; `prata` centralizado e sem caixa; `aluminio` cartões de alumínio com chanfro de luz; `relevo` painéis de vidro fosco com traço gelo; `arcade` cartões de 8 bits com borda de pixel e sombra dura; `rabisco` tracejados e números circulados; `aurora` vidro com brilho. Trocar o tema já muda o arranjo: não reescreva slides só para "combinar" com o tema.
- **Paleta** (`palette`): só as cores, em qualquer tema. `tinta`, `floresta`, `mar`, `entardecer`, `lavanda`, `grafite`, `neon`, `areia`, `cereja`, `corporativo`, `luzquente`, ou as suas: `palette: { paper: "F4F1EA", ink: "161616", accent: "D7263D", alert: "1B998B" }`. Os quatro tons saem dessas quatro cores, com contraste garantido. A paleta troca também o fundo: em tema escuro por natureza (`relevo`, `arcade`, `aurora`, `noite`, `terminal`), uma paleta de papel claro (`safira`, `corporativo`, `tinta`…) deixa o tema claro; para manter o visual escuro que o pedido quer, não ponha paleta (ou use uma de papel escuro, como `neon`).
- **Paletas de família** (para identidade de marca sem cansar a vista): a cor forte da marca fica só no detalhe (`alert`, a ênfase pontual) e a página trabalha com os parentes mais agradáveis dela (`accent` e `family`). `rubi` (rosas, magenta e vinho; vermelho só no detalhe), `ametista` (roxos e lilases), `tangerina` (laranja com azul-marinho), `safira` (azuis com um toque âmbar), `esmeralda` (verdes). Na sua: `palette: { paper: "FFFFFF", ink: "3B2B33", accent: "B83A6E", alert: "CC092F", family: ["F9DCE5", "EFA3BC", "D9668F", "7E2349"] }` (de 2 a 8 parentes). `family` pinta as séries extras dos gráficos e os grupos e ramos dos diagramas. Pedido de "cores da empresa X": monte uma paleta de família assim, com a cor forte em `alert`. Para clima futurista de bom gosto (luz quente de prédios e shows de drones, nunca neon barato): `luzquente` — brancos quentes e âmbar que funcionam no claro e, no `tone: dark`, viram HUD âmbar sobre carvão quente.

- **Identidade** (`identity: trabalho`, no deck): as fontes da empresa da pessoa (e a paleta preferida), configuradas só no computador dela (`~/.sagadeck/identidades.yaml`; no Studio, aba Design, grupo Identidade). Corpo, rótulos e código sempre na fonte da empresa; títulos também, menos nos temas com personalidade (`rabisco`, `pop`, `terminal`, `jornal`, `bauhaus`), que mantêm o título deles. A paleta da identidade vale quando o deck não escolheu outra. Nunca invente o nome de uma identidade: use só a que a pessoa pedir ou a que o deck já tem; numa máquina sem ela, a apresentação sai com as fontes do tema.

Os dois valem no deck todo ou num slide só (`theme:`/`palette:` no slide). No Studio, aba Design: clique aplica em todos os slides; botão direito, "Só neste slide".

## Direção cinematográfica (quando pedirem "Tony Stark", "hacker", "futurista", "cinematográfico")

Um filme só + slides vivos da mesma família. Receita: `theme: noite` com `palette: luzquente`; capa com `ambient: pontos`; chegadas importantes com `transition: morph` e viradas com `transition: saida`; cada slide estático com um `ambient` (`pontos` ou `grade`) que ecoa a capa sem repeti-la; o momento da demonstração com `{ points: { de: fone, para: mic } }` (formas: `fone`, `mic`, `doc`, `planilha`, `busca`, `chat`). Regras de gosto: fundo escuro quente ou branco quente; luz sempre champanhe, âmbar ou branca; cor forte só pontual, como joia (show de drones), nunca neon chapado; detalhe animado discreto por slide, nunca dois efeitos brigando no mesmo quadro. O clipe em vídeo fica só no momento da areia; o resto é slide vivo.

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

## Experiências exploráveis

O layout `calc` aceita `scenarios: [{label, values: {entrada: numero}, explanation}]`, `prediction` (pergunta antes de revelar), `explanation` (o que observar), `illustrative: true` (selo de simulação ilustrativa) e `sweep: entrada` (curva das saídas em função desta entrada; as outras permanecem nos valores atuais). Os resultados numéricos, faixas, réguas e curvas vêm das mesmas fórmulas. Entradas fixas não são alteradas por cenários.

Na apresentação: botões de cenário, **Comparar com este** (congela resultados para comparar), **Restaurar**, **Ver resultado** e **Explorar**. Interações são temporárias, não reescrevem o deck. No material de estudo, estado inicial e cenários aparecem com entradas, resultados e explicações. `consulta` contém hipóteses, limitações e desenvolvimento completo. Não invente dados para dar aparência de evidência: marque modelos ilustrativos.

Cada elemento pode receber `continuity: nome-estavel`: repita o nome no objeto correspondente do próximo slide para animar posição e tamanho entre cenas. Nome único por slide; use principalmente `canvas`. Sem movimento em exportação, `motion: none` ou preferência de movimento reduzido. Imagem de fundo, texto e primeiro plano podem ser elementos separados/editáveis, respeitando a ordem das camadas.

Chat: inclua `review: true` no patch ao reformular uma composição ou criar uma experiência. O Studio confere os slides alterados e seus cenários renderizados, devolve problemas ao agente para uma rodada de correção e informa o que não pôde ser conferido. Uma resposta sem visão não é aprovação. Fórmulas são verificadas no estado inicial, nos cenários e nos extremos individuais das entradas; isso não prova todos os pontos do domínio.

Propostas de direção de arte usam `variants` com o mesmo conteúdo em 2–4 composições diferentes. Cada opção pode incluir `direction: {theme: editorial, rationale: "Hierarquia editorial e contraste"}` junto de `label` e `slide`. A escolha aplica esse tema ao deck, remove a paleta anterior e substitui somente o slide escolhido; não reescreve os outros conteúdos. Composições devem diferir em estrutura, não apenas cor.

Avaliação de autonomia (desenvolvimento): `SAGADECK_LIVE=1 node tools/evaluate-autonomy.mjs` executa cinco pedidos públicos pelo agente interno e guarda apresentações/relatórios no tópico **Avaliação do agente** da biblioteca. Aceita IDs de casos como argumentos. Relata falhas, achados, tempo, intervenções externas e uso de tokens/custo quando fornecidos pelo provedor; ausência de preço nunca vira custo zero. Esta avaliação não retoca os decks por fora do agente. O modelo **Explore uma ideia** demonstra os recursos sem rede.

### API dos widgets

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

## Texto no cenário (`scenography`)

Composição estática: o texto permanece editável, integrado a planos, luz e profundidade. `scene`: `stage` (letras monumentais atrás de uma escultura), `floor` (texto no chão), `signs` (placa em perspectiva), `terminal` (terminal hacker), `cafe` (lousa de café com letreiro neon), `travel` (cartão de embarque), `ticker` (pregão com cotações e candles), `marquee` (letreiro de cinema com lâmpadas), `blueprint` (planta técnica), `magazine` (capa de revista), `orbit` (planeta e estrelas), `synthwave` (neon anos 80) ou `gallery` (parede de galeria). Cada uma tem um tamanho de título padrão; `titleSize` vence. Campos: `title` (frase curta, quebra de linha permitida), `kicker`, `subtitle`, `caption`, `titleSize`, `image` (fundo opcional), `imageOpacity` (transparência do fundo, de 0 a 1; padrão 0.85), `foreground` (recorte PNG transparente colocado à frente das letras). Um fundo arbitrário não é segmentado automaticamente: para oclusão de uma pessoa, forneça o recorte em `foreground`.

Demonstração com todas: biblioteca, Nova, "Exemplo: texto no cenário".

```yaml
- layout: scenography
  scene: floor
  title: "NOVOS\nCAMINHOS"
  kicker: APRENDER PARA TRANSFORMAR
  caption: WORKSHOP / BRIDGE
  deco: none
```

## Projeto: a pasta da apresentação

No Studio, a pasta do deck é um projeto (aba **Arquivos**, à esquerda): o `.yaml`, `imagens/`, `contexto/` (anexos, prints colados, planilhas, anotações `.md`) e `.sagadeck/` (a conversa do chat, o cache e a lixeira do projeto, do próprio Studio). O texto do que está em `contexto/` chega a você junto do pedido, como material anexado (com o caminho, ex.: `contexto/vendas.csv`): use os números e fatos de lá. Uma planilha de `contexto/` pode alimentar um gráfico com `csv: contexto/vendas.csv` (CSV) ou pela sugestão de gráficos da planilha no Studio (que grava `from:`).

## Apresentação importada de PowerPoint

Um `.pptx` importado (Biblioteca › Importar apresentação, ou `sagadeck importar arquivo.pptx`) chega **fiel ao original**: cada slide é um `canvas` com os elementos na mesma posição, e o deck tem `import: { from, slides, fonts, snapshots }` e `footer: false` (o original tem o próprio rodapé). Cada slide traz `original: { slide: 7, image: original/slide-07.png }` (a foto do slide original, quando o PowerPoint ou o LibreOffice estavam disponíveis) e a pasta `original/` guarda a cópia do arquivo. Elementos que só aparecem em slides importados:
- `textbox: { paragraphs: [{ runs: [{ t, size, font, b, i, u, color, sup, sub, latex, link }], bullet: { char, font, num }, marL, indent, align, lineHeight, spaceBefore }], pad, anchor }`: caixa com a formatação original; `deco: true` = veio do mestre/layout (logo, faixa, número da página); `ph: title|body…` = o papel no layout original.
- `drawing: "<svg…>"`: forma desenhada (retângulo, seta, desenho livre).
- `table: { cols, heights, cells }` com `tableData` (o texto das células, para você ler e usar).
- `image` com `crop: { l, t, r, b }` (recorte em fração de cada lado), `fit: fill`; `fromOriginal: true` = recortado da foto do original (equação antiga, SmartArt).
Para melhorar ou recriar, leia o conteúdo (títulos, textos, `tableData`, notas) e o que a imagem mostra, e troque o slide por layouts do sagadeck; os números, nomes, fórmulas e fontes do original não podem se perder. Numa apresentação recriada (`recreatedFrom`), o slide original que ficou nela não desenha a moldura antiga (o que se repete na mesma posição entre os slides originais: logos, faixas, linha do título, número da página): o tema novo cuida disso.

## Estilo da pessoa (mestre: moldura, título, área)

Como o slide mestre do PowerPoint: `master:` no deck desenha em todo slide o que é do padrão (logos, faixas, linha do título, número da página) e diz onde o conteúdo e o título ficam. Com `theme:` (cores e fontes), é o **estilo** que o professor usa para seguir o padrão da universidade.
- `master: { elements: [...], cover: [...], area: { top, left, right, bottom }, coverArea, title: { font, size, color, bold, align, gap }, text: { font } }`: `elements` são elementos do canvas (x, y, w, h) em todo slide de conteúdo; `cover` na capa, seção e encerramento; `area` é onde o conteúdo fica (fora da moldura); `title` é a cara do título (o `gap` é o espaço até o conteúdo). Num texto do mestre, o trecho com `field: slidenum` mostra o número do slide.
- O slide `canvas` e o `master: false` ficam sem moldura. `style: { id, name }` diz de qual estilo salvo o deck veio.
- Estilos salvos ficam na biblioteca (Design › **Estilo**: aplicar, salvar o desta apresentação, tirar, **usar em toda apresentação nova**: o padrão da biblioteca, o Brand Kit; a apresentação nova em branco ou com IA, sem tema escolhido, já nasce nele). De um PowerPoint importado, o sagadeck tira o estilo sozinho: o que se repete na mesma posição (mesmo copiado slide a slide) vira a moldura, e o título, o corpo e as cores vêm do original.
- Para **seguir o estilo de um deck** (imitar o original, converter para o padrão da universidade), use os layouts do sagadeck com o `master` e o `theme` do estilo; não recrie a moldura dentro de cada slide.

## Revisão das mudanças (`review`)

Quando melhorar ou reescrever uma apresentação que já existia (principalmente uma importada), marque cada slide que mudou para a pessoa validar: `review: { status: alterado, note: "o que mudou, em uma frase", original: 7 }` (`original` = o número do slide no original) ou `review: { status: novo, note: "por que entrou" }` para slide que não existia. O Studio mostra um selo na miniatura, uma faixa no slide com **Ver original**, **Aceitar** e **Desfazer** (volta ao slide de `original/original.yaml`; slide novo sai) e a lista em Revisar › **Mudanças**. A transformação da apresentação inteira ainda usa dois estados: `pendente` (a proposta ficou ao lado do original porque faltava algo dele; aceitar tira o original, desfazer tira a proposta) e `revisar` (a conferência pela foto achou um problema de desenho). A apresentação e a exportação não mostram as marcas. Nunca apague dados do original: números, nomes, fórmulas, fontes e figuras específicas (um mapa, um experimento de uma cidade) continuam, só mais claros.

## Tabelas (`table`)

Tabela é tabela, nunca imagem: dados de um livro ou de um PowerPoint que vieram como figura viram `table` quando os valores estão legíveis (o sagadeck alinha os números à direita, com algarismos de mesma largura, e pinta nas cores do tema). Layout `table` (o slide inteiro) ou o elemento `{ table: {…} }` em qualquer lugar (`content`, `add`, `canvas`).

- `head: [Ano, "Vazão (m³/s)"]` (títulos das colunas) e `rows: [[1984, "2.218,0"], …]` (as linhas). Também vale `rows` com objetos (`[{Ano: 1984, Vazão: 2218}]`: as chaves viram o cabeçalho), `csv:` (tabela colada do Excel ou CSV, a 1ª linha é o cabeçalho) e, no elemento, `table: [[…], […]]` (a 1ª linha é o cabeçalho).
- `style`: `faixa` (padrão: cabeçalho na cor), `zebra`, `linhas` (só fios, sóbria), `colunas` (cada coluna com uma cor da paleta) ou `cartao`. `color`: `c1`…`c5` (cores da paleta), `hi`, `em` ou `#hex`. Varie entre as tabelas do deck.
- `highlight: {row: 2}` (ou `{col: 3}`, `{cell: [2, 3]}`, `{rows: [1, 4]}`; contando de 1, sem o cabeçalho) acende o que importa; `total: true` deixa a última linha como total; `rowHeader: true` põe a 1ª coluna em negrito; `align: [left, right]` e `widths: [2, 1, 1]` quando precisar; `size` (px) troca o tamanho da letra (o padrão já depende do tamanho da tabela).
- No slide `table`: `side` (a conclusão, ao lado, com `==destaque==`), `caption` (legenda) e `source` (fonte). Tabela grande demais: divida em dois slides ou deixe só as linhas que contam a história (a completa vai em `consulta`).
- No Studio: Inserir › Tabela, ou Novo slide › Tabela; no Formatar, a grade aceita colar do Excel.

## Aula: exercício resolvido, calculadora ao vivo, algoritmo animado (`solution`, `calc`, `algo`)

**`solution` — exercício resolvido passo a passo.** À esquerda, `problem` (enunciado), `givens` (dados: `{symbol, value, unit, label}` ou `{latex, label}`; vírgula decimal pode) e `find` (o que se pede, LaTeX). À direita, a conta: o primeiro quadro pergunta `prompt` (padrão "Por onde você começaria?"); cada clique revela o próximo `steps: [{text, latex, note}]` (os anteriores ficam compactos); o último mostra `answer: {latex, text, label}` em destaque. Mantenha cada passo curto (uma ideia, uma linha de conta); de 3 a 6 passos. Use para qualquer matéria com conta: física, engenharia, finanças, estatística.

**`calc` — calculadora ao vivo.** `inputs: { nome: {label, value, min, max, step, unit, latex, decimals} }` viram controles deslizantes (`fixed: true` = constante, mostrada com `latex`). `outputs: [{name, label, fn, latex, unit, decimals}]` são calculados na ordem (um usa os anteriores e as entradas pelo nome, inclusive nomes longos como `nu`, `eps`); `fn` é fórmula em texto (as mesmas regras de `plot.functions`: `V*D/nu`, `0.25/(log10(eps/(3.7*D) + 5.74/Re^0.9))^2`; `log` e `log10` são base 10, `ln` é natural). Faixas: `of: Re, cases: [{below: 2300, text: Laminar, color: s3}, {below: 4000, text: Transição, color: em}, {text: Turbulento, color: hi}]` — mostra o selo da faixa; cada faixa pode ter a sua `fn` (f = 64/Re abaixo de 2300, outra acima). `scale: {min, max, log}` desenha a régua com as faixas e o ponteiro. Tudo recalcula enquanto a pessoa arrasta; PDF mostra os valores iniciais.

**`algo` — algoritmo animado.** `algorithm: bubble | insertion | selection | merge | quick | linear | binary`, `array: [5, 1, 4, 2]` (até 16 números), `target` (para as buscas). O sagadeck roda o algoritmo e gera os passos: barras (comparando, trocando, pivô, faixa, já ordenado, achou), o pseudocódigo com a linha da vez, a frase do passo e os contadores (comparações, trocas). Cada clique é um passo; o botão **Tocar** anda sozinho (`speed` em ms). `code` troca o pseudocódigo. Vetor com 6 a 8 números dá uma animação boa de acompanhar; busca binária precisa de vetor ordenado (o sagadeck ordena se não estiver).

**Prever → rodar → explicar (`algo`).** `predict: "Quantas trocas o bubble faz neste vetor?"` (ou `{question, options: [..], answer}`) abre o slide com a pergunta, antes do primeiro passo: a turma aposta, depois vê rodar. `explain: "por que deu isso"` (ou `{text, answer}`) fecha com o porquê e a resposta da aposta em destaque. Use em aula quando o resultado não é óbvio (é aí que a previsão ensina).

**`algo` com qualquer algoritmo (execução rastreada).** Para um algoritmo que não é dos clássicos (o que o professor inventou, uma árvore, um grafo, programação dinâmica…), escreva o programa em **Python simples** em `program:` e a chamada em `call:` (`call: meu_sort([5, 2, 9, 1])`). O sagadeck roda o código de verdade e mostra cada passo como num depurador: a linha atual, o painel de variáveis de cada chamada (o que mudou acende) e as estruturas desenhadas pelo tipo — lista de números lida por índice vira barras; texto, lista, fila (`deque`) e conjunto viram casas com os ponteiros embaixo (a variável inteira que indexa a estrutura: `i`, `j`, `meio`…); lista de listas vira grade; dicionário vira tabela; dicionário de vizinhos (`{A: [B, C]}` ou com peso `{A: [[B, 4]]}`) vira grafo, com os visitados (conjunto) em verde, a fila tracejada e a aresta da vez acesa; objeto com filhos (`class No` com `esq`/`dir`, `filhos` ou `prox`) vira árvore ou lista ligada. O que foi lido, escrito e comparado acende (igual em verde, diferente em vermelho).
- Suporta: `def` (recursão), `class` com `__init__` e métodos, `if/elif/else`, `while`, `for … in`, `break/continue`, listas, tuplas, dicionários, conjuntos, fatias, compreensões, `lambda`, f-strings, `from collections import deque`, `import heapq`, `import math` e as funções de sempre (`len`, `range`, `min`, `max`, `sorted`, `enumerate`, `zip`, `print`…). Sem `input()`, arquivos ou bibliotecas de fora: os dados vêm na chamada.
- **Legenda do passo:** comentário no fim da linha, com `{expressão}` trocada pelo valor: `j += 1  # casou: {j} letras`. Sem comentário, a frase sai sozinha com os valores (`v[j] > v[j + 1] → 5 > 3: sim.`).
- `view:` escolhe o que desenhar e como (opcional; sem ele o sagadeck escolhe): `[{var: texto, pointers: ["i + j"]}, {var: padrao, under: texto, offset: i, pointers: [j]}, {var: pi, as: cells}, {var: raiz, from: monta, as: tree}]` — `as: bars | cells | grid | table | tree | graph`, `pointers` são expressões, `under`+`offset` alinham uma linha sob a outra (padrão sob o texto), `from` pega a variável de outra função da pilha.
- Mantenha a entrada pequena (até ~120 passos; `maxSteps` muda): 6 a 10 elementos, textos de até ~25 letras.
- **Catálogo pronto** (só os dados, sem escrever código): `algorithm: naive | kmp | quicksearch` (busca em texto: `text`, `pattern`), `bfs | dijkstra` (grafos: `graph`, `start`; Dijkstra com peso `{A: [[B, 4], [C, 1]]}`), `bst` (árvore binária de busca: `array` com os valores inseridos).

```yaml
- layout: algo
  title: KMP não volta no texto
  algorithm: kmp
  text: abababcabababab
  pattern: ababab
- layout: algo
  title: O meu algoritmo de ordenação
  program: |
    def meu_sort(v):
        trocou = True
        while trocou:
            trocou = False
            for i in range(len(v) - 1):
                if v[i] > v[i + 1]:
                    v[i], v[i + 1] = v[i + 1], v[i]  # troca {v[i + 1]} com {v[i]}
                    trocou = True
        return v
  call: meu_sort([5, 2, 9, 1, 7])
```

```yaml
- layout: calc
  title: Qual é o regime?
  inputs:
    V: {label: Velocidade, value: 1.5, min: 0.01, max: 4, step: 0.01, unit: m/s}
    D: {label: Diâmetro, value: 0.05, min: 0.005, max: 0.3, step: 0.005, unit: m}
    nu: {label: Viscosidade, latex: '\nu = 1{,}0\times10^{-6}\ \mathrm{m^2/s}', value: 0.000001, fixed: true}
  outputs:
    - {name: Re, label: Reynolds, latex: 'Re = \frac{VD}{\nu}', fn: V*D/nu, decimals: 0}
    - {name: regime, label: Regime, of: Re, cases: [{below: 2300, text: Laminar, color: s3}, {text: Turbulento, color: hi}], scale: {min: 100, max: 1000000, log: true}}
- layout: algo
  title: Quicksort
  algorithm: quick
  array: [7, 2, 9, 4, 3, 8, 1, 6]
```

## Carrossel (`carousel`)

Um item por clique, cada um com foto e texto: `items: [{ title, text, label, image, alt }]`. `image` é a foto da pessoa (caminho relativo ao deck, link ou a escolhida no Studio); **sem `image`, o item usa uma foto de demonstração desenhada** (paisagens, funcionam offline).
- `style: arc` (padrão): roda em semicírculo com as fotos; a cada clique ela gira até o item da vez, que cresce; o texto atual sai pela esquerda e o novo entra da esquerda para a direita, sobrepondo.
- `style: rings`: a foto em anéis — o de fora chega girando no sentido anti-horário, o de dentro no horário, e travam no lugar formando a foto; o texto sobe junto com o giro.
Use de 3 a 8 itens. `label` troca o "01 / 05" em cima do título.
**Fotos geradas:** quando as imagens estiverem liberadas e a pessoa pedir fotos (ou pedir para você decidir), cada item aceita `image_prompt: "descrição fotográfica realista, em inglês"` no lugar de `image` — o sagadeck gera a foto de cada item e troca por `image:`. Descreva a cena de cada item de forma coerente entre si (mesma luz, mesmo estilo, enquadramento que funcione recortado em círculo: o assunto no centro).

```yaml
- layout: carousel
  title: Cinco lugares, cinco lições
  style: rings
  items:
    - { title: Montanha, text: Subir devagar é o jeito mais rápido de chegar., image: imagens/montanha.jpg }
    - { title: Mar, text: Tudo o que é fundo começa raso. }
```

## Dinâmicas a dois (`duel`, `terminals`, `turns`)

Duas pessoas, **um clique por jogada** (cada clique troca o quadro inteiro; funciona com controle remoto e modo apresentador; o PDF mostra o último quadro).

**`duel` — Duelo de commits.** Dois editores do mesmo arquivo, o comando da vez com a saída do Git e o grafo de commits crescendo (trilhas da pessoa 1, main e pessoa 2; etiqueta `origin/main`). Você só escreve o que cada um FAZ; o simulador calcula o resto: push recusado quando o remoto está na frente, fast-forward, merge automático quando as mudanças não se tocam e **conflito** (merge a três por linha) com os marcadores `<<<<<<<`/`=======`/`>>>>>>>` no editor de quem puxou.
- `file` (nome, define a coloração), `base` (o arquivo no começo, igual para os dois), `people: [Ana, Beto]`.
- `turns`: `{ who: 1|2, edit: {2: "nova linha 2", 5: null}, commit: "mensagem", push: true, pull: true, resolve: ours | theirs | both | {2: "linha final"}, log: true, say: "explicação no lugar da automática", note: "texto embaixo" }`. Num turno pode haver edit + commit juntos. Linha além do fim acrescenta; `null` apaga.
- `bet: "Vai dar conflito?"` põe uma **enquete** (a plateia vota) antes do primeiro pull que decide, e o quadro do pull revela o resultado ("Deu conflito!" ou "Sem conflito"). `betOptions` troca as opções.
- Roteiro impossível (commit com conflito aberto, pull com mudança sem commit) vira aviso do fiscal e o slide mostra o erro.

**`terminals` — Dois terminais.** Comandos digitados letra a letra, lado a lado. Roteiro livre: `steps: [{ who, cmd, out, note }]`, `panes: [Ana, Beto]`. Ou o **mesmo roteiro do duelo** (`base` + `turns`): os comandos e a saída vêm do simulador, e `log: true` imprime o `git log --graph --oneline --all` calculado. `keep` = comandos visíveis por terminal (padrão 6); `host` = nome da máquina no prompt.

**`turns` — Turnos a dois.** Code review, cliente × servidor de API, debate, role-play, pair programming. `people: [{name, role}, {name, role}]` e `turns: [{ who, text, tag, code, language, method, url, status }]` (método/URL/status desenham uma requisição e o código de resposta). Uma fala por clique, alternando os lados; as mais velhas sobem e somem (`keep`, padrão 4).

```yaml
- layout: duel
  title: Duelo de commits
  file: soma.js
  base: |
    function soma(a, b) {
      return a + b;
    }
  people: [Ana, Beto]
  bet: Vai dar conflito?
  turns:
    - { who: 1, edit: { 2: "  return a + b + 0;" }, commit: ajusta soma }
    - { who: 2, edit: { 2: "  return b + a;" }, commit: inverte a ordem }
    - { who: 1, push: true }
    - { who: 2, push: true }        # recusado: o remoto está na frente
    - { who: 2, pull: true }        # conflito na linha 2
    - { who: 2, resolve: { 2: "  return a + b;" }, commit: resolve o conflito }
    - { who: 2, push: true }
```

## Fórmulas e funções (`science`)

Para plotar a função de verdade (aula, engenharia, finanças): a pessoa escreve a fórmula e ela vira curva. Até cinco `equations` (`latex` + `label`, desenhadas por KaTeX) ao lado do gráfico; sem `equations`, o gráfico ocupa o slide. `plot: false` deixa só as equações.

- `plot.functions`: lista de fórmulas em `x` (texto simples, sem LaTeX): `a*sin(b*x)`, `x^2 - 2x + 1`, `e^(-x^2)`, `sqrt(x)`, `ln(x)`, `abs(x)`. Aceita multiplicação implícita (`2x`, `3sin(x)`), `^`, `pi`, `e`, vírgula decimal e `y = …` na frente. Item também pode ser `{fn, name, color}`.
- **Letra que não é `x` vira controle deslizante** na apresentação (a curva redesenha ao arrastar). `plot.params: {a: {value, min, max, step, label}}` dá valor inicial, limites e nome; sem isso, valor 1, de -5 a 5.
- `plot.x: [de, até]` (padrão -10 a 10); `plot.y: [de, até]` fixa o eixo y. `plot.xlog: true` / `plot.ylog: true`: eixos em escala logarítmica (ex.: diagrama de Moody, `x: [600, 10000000]`), com a curva amostrada em escala log.
- `plot.points`: pontos medidos (bolinhas junto das curvas): tabela colada do Excel ou CSV em texto (coluna x e coluna y; tab, `;` ou `,`; vírgula decimal), lista `[[x, y], …]` ou o nome de um arquivo ao lado do deck (`dados/medidas.csv`). `plot.pointsName` dá o nome na legenda.
- `plot.surface`: superfície 3D `z = f(x, y)` (ex.: a intensidade da IDF em função da duração e do tempo de retorno, `819.67*y^0.138/(x+10.77)^0.75`), com x e y no intervalo de `plot.x`; gira com o mouse. Só com uma função ou dados do próprio assunto: superfície de enfeite (uma onda qualquer chamada de "terreno") vira piada; para mostrar um relevo, use uma ilustração (`image_prompt`).
- `plot.data` (array de traces Plotly) substitui tudo isso; `plot.layout` configura eixos e títulos. `plot.preset` (`wave`, `parabola`, `surface`) ainda funciona, mas prefira fórmulas.

Fórmula com erro não quebra o slide: o gráfico mostra o erro e o fiscal avisa. O slide traz uma prévia desenhada da curva (miniaturas, PDF, PPTX); no HTML, Plotly com zoom, valores ao passar o mouse e controles deslizantes, tudo offline.

```yaml
- layout: science
  title: Mexa no a e no b
  equations:
    - label: A função
      latex: 'f(x) = a\sin(bx)'
    - label: A derivada
      latex: "f'(x) = ab\\cos(bx)"
  plot:
    functions: ["a*sin(b*x)", "a*b*cos(b*x)"]
    x: [-6.3, 6.3]
    params:
      a: {value: 1.5, min: 0, max: 3, label: amplitude}
      b: {value: 1, min: 0.5, max: 3, label: frequência}
```

## Grades adaptáveis (`mosaic`, `ribbon`, `dossier`)

Os três aceitam `kicker`, `title` e `items: [{title, text, value, icon, code, foot}]` (1 a 12 itens) e `build: true` (um item por clique). As colunas (1 a 4) saem da quantidade de itens e do tamanho dos textos.

- `mosaic`: grade editorial; com item sobrando na última linha, o primeiro ocupa duas colunas, em destaque.
- `ribbon`: os mesmos campos em cápsulas arredondadas, centralizadas. Para serviços, etapas ou pilares.
- `dossier`: página de consulta, compacta: letra menor e blocos de código (`code`) com quebra de linha. Para material de referência (documentação, payloads, instruções); não imponha a ela o limite de palavras de uma palestra quando a pessoa pede material denso.

No Studio, todo tipo de slide (página de consulta, grade adaptável, diagrama, tipografia cinética, status semanal…) sai da galeria **Novo slide** (Início › Escolher tipo ou Inserir › Novo slide), com busca e categorias; **Layout** troca o formato do slide atual e leva o conteúdo junto. A aba **Avançado** muda a densidade do slide atual: **Padrão**, **Compacta** ou **Mais conteúdo**. A densidade reduz espaçamentos e tamanhos sem apagar o conteúdo; para explicações longas com seções, prefira `dossier`.

Para apresentações completas de exemplo, abra **Abrir demos completos** na aba Avançado (ou **Nova → Modelo pronto → Recursos avançados** na biblioteca). Esse demo reúne código denso, página de consulta, grade com oito itens, aviso de segurança, diagrama e tipografia cinética.

Modelos, estilos, demos e exemplos de **Modelo pronto** (na vitrine, "Visuais para começar" e "Recursos do SagaDeck", com a capa de cada um) abrem em **prévia**: dá para navegar, apresentar e experimentar sem criar arquivo. A primeira mudança (ou o botão **Usar como base**) cria uma cópia na biblioteca, no tópico de onde veio (padrão `Modelos`), com as imagens; o modelo de fábrica nunca muda.

## Infográficos (`infographic`)

As formas clássicas de slide de consultoria, desenhadas na hora para a quantidade de itens que vier (o desenho se reorganiza; o texto encolhe para caber). Uma cor por item, tirada do tema (numa paleta de família, os parentes dela); o texto é editável no PowerPoint. `build: true` revela um item por clique.

| `shape` | para quê | itens |
|---|---|---|
| `arco` | lista de desafios, pilares, etapas numeradas em volta de um tema (pílulas coloridas ao longo de um arco, centro com anel colorido) | 2 a 8 |
| `ramos` | 2 a 6 opções/estratégias com uma frase de explicação cada (cartões contornados com número colorido) | 2 a 6 |
| `lados` | frentes, áreas ou pilares com ícone (metade à esquerda, metade à direita da peça central) | 2 a 8 |
| `trilhas` | objetivo e linhas de etapas encadeadas: cada item é o começo de uma linha e `steps` são as etapas seguintes (estratégia, tática, tática…); uma cor por coluna | 1 a 4 linhas, até 4 etapas cada |
| `metro` | caminhos que partem de um mesmo ponto (linhas de metrô até cada item, com ícone e legenda) | 2 a 7 |
| `camadas` | um perfil físico **de cima para baixo, como na realidade** (atmosfera, superfície, zona de aeração, zona de saturação, rocha; as camadas de um sistema): `items` são as camadas na ordem de cima para baixo, cada uma com `title`, `text`, `icon` e `items` (as etiquetas dela); `flows: [{from: 2, to: 3, title: Infiltração}]` (números das camadas) viram setas verticais com nome, descendo ou subindo. Para "o ciclo em camadas", perfil do solo e afins, este e não um `diagram` (no fluxograma a ordem segue as setas e a atmosfera vai parar embaixo) | 2 a 6 |
| `ciclo` | processo que se repete e volta ao começo (ciclo da água, PDCA, ciclo de vida): etapas em volta de um círculo, em sentido horário a partir de cima, cada uma ligada à seguinte por uma seta curva na cor dela | 2 a 8 |
| `pista` | uma volta inteira contada como corrida: um circuito visto de cima (estilo Mario Kart: grama, zebra, largada quadriculada, caixas de item) com cada item como um marco numerado da volta e a sua placa em cima ou embaixo; `center` vira a placa do meio. Resumo de uma história, de uma jornada ou das fases de um projeto num slide só | 2 a 8 |

`center`: o que fica no meio (`title`, `text`, `icon`; ou só um texto). Itens: `title` curto (1 a 3 palavras), `text` de uma frase, `icon` (nome do Lucide). Mais itens que a forma aceita: os demais ficam de fora com aviso; divida em dois slides.

```yaml
- layout: infographic
  shape: metro
  title: Os caminhos de um projeto na Bridge
  center: { title: Bridge, text: Um pedido, vários caminhos }
  items:
    - { title: Lote, text: Databricks chama a Bridge de madrugada, icon: moon }
    - { title: Teams, text: Copilot Studio + Power Automate, icon: message-square }
    - { title: App próprio, text: Wave, arquitetura, infra e rede, icon: app-window }
    - { title: SaaS externo, text: Túnel mTLS e serviço extra, icon: globe }
```

Infográfico × diagrama: infográfico é para itens paralelos em volta de uma ideia (sem fluxo entre eles, ou com o fluxo simples de `trilhas`) e para **ciclos** (`ciclo`: num fluxograma, a volta ao começo vira setas longas cruzando o desenho); `diagram` (Mermaid) é para processo com decisões, sequência entre sistemas, arquitetura e UML.

## Diagramas (`diagram`)

Para processo, fluxo, arquitetura, UML, sequência entre sistemas, ciclo de vida, mapa de ideias: o campo `mermaid` leva o código [Mermaid](https://mermaid.js.org) e o sagadeck desenha com a fonte e a paleta do slide (troque tema/paleta e o diagrama acompanha). O visual é de diagrama de arquitetura bem feito: cada grupo (`subgraph`) ganha uma família de cor (fundo bem claro, título colorido, nós com preenchimento suave e contorno da mesma cor mais escura), setas curvas que chegam limpas em cada caixa, texto em grafite (nunca preto chapado). `curve: angulo` deixa as ligações em degraus (bom para arquitetura com poucas ligações), `curve: reta` em linha reta. Rótulo com parênteses vai entre aspas (`A["Boca de lobo (BL1)"]`); sem aspas, o sagadeck põe. No mapa mental, cada ramo tem sua família. O desenho ocupa a área livre do slide. Funciona offline no HTML; PDF e PowerPoint levam a imagem.

Direção automática: em fluxogramas o sagadeck desenha deitado (`LR`) e em pé (`TB`) e usa o que deixa a letra maior na área do slide. Escreva a direção que fizer sentido; `autoDirection: false` no slide mantém a do código (use só se a pessoa pedir uma direção).

Tipos (primeira linha do código): `flowchart LR` / `flowchart TB` (fluxo, processo, arquitetura), `sequenceDiagram` (quem chama quem, pedido e resposta), `stateDiagram-v2` (ciclo de vida: DEV → HOM → PROD), `classDiagram` e `erDiagram` (UML e modelo de dados), `journey` (jornada com notas), `mindmap` (mapa de ideias, sopa de letrinhas organizada), `timeline`, `block-beta` (blocos de arquitetura), `gantt`, `quadrantChart`, `gitGraph` (branches e commits do Git: `commit`, `branch nome`, `checkout nome`, `merge nome`, `cherry-pick id: "…"`; é o diagrama certo para "linhas de commits", rebase × merge e fluxo de branches).

```yaml
- layout: diagram
  title: Feature branch e merge
  mermaid: |
    gitGraph
      commit id: "base"
      branch feat/login
      checkout feat/login
      commit id: "tela"
      commit id: "testes"
      checkout main
      commit id: "hotfix"
      merge feat/login
```

Ênfase (acrescente ao nó): `:::hi` (tom forte da cor de destaque), `:::em` (tom forte da cor de ênfase), `:::escuro`, `:::suave` (cinza neutro: usuário, sistemas externos, bancos de terceiros), `:::vazado` (tracejado: opcional, futuro, fora do escopo). Os demais nós herdam a família do grupo em que estão (fora de grupo: a família do destaque).

Ícones: `:nome-do-icone:` dentro do rótulo (nome oficial em inglês do Lucide, como nos `icon`), por exemplo `A[:rocket: Produção]`.

Setas no `flowchart`: `-->` normal, `-.->` pontilhada (opcional, eventual), `==>` grossa (o caminho principal), `-->|texto|` com rótulo. Grupos: `subgraph Nome ... end`.

```yaml
- layout: diagram
  kicker: Governança
  title: Do pedido de acesso à ==produção==
  caption: Experimento é prorrogável; em HOM e PROD as chaves ficam no Key Vault
  mermaid: |
    flowchart LR
      A([:key-round: Pedido de acesso]):::hi --> B{Experimento ou projeto?}
      subgraph EXP[Experimento]
        C[:flask-conical: 30 dias, dados fictícios]
      end
      subgraph PRJ[Projeto]
        D[DEV 30 dias] ==> E[HOM 30 dias] ==> F[:rocket: PROD]:::em
      end
      B -->|experimento| C
      B -->|projeto| D
      C -.->|deu certo| D
      K[(Key Vault via RITM)]:::suave -.- E
```

Regras de bom desenho (siga sempre):
- Agrupe com `subgraph` o que é da mesma área, time, camada ou fase (Front-end, Bridge, Segurança; DEV, HOM, PROD): é o que dá cor e organização ao desenho. 2 a 5 grupos por slide.
- Coisas de fora (usuário, sistema externo, banco de terceiros) com `:::suave`, fora dos grupos.
- Rótulos curtos: 1 a 4 palavras por nó (detalhe vai em `caption`, nas `notes` ou em outro slide). Rótulo de seta com 1 a 3 palavras.
- No máximo ~12 nós por slide. Processo maior: divida em slides (visão geral primeiro, depois um slide por fase) em vez de encolher tudo.
- Ênfase em 1 ou 2 nós (início e resultado, ou o gargalo). Tudo destacado é nada destacado.
- Use a seta certa: `==>` o caminho feliz, `-.->` o alternativo; decisões em losango `{...}` com 1 ou 2 palavras (`{Tipo?}`: o losango cresce muito com texto; o resto vai nos rótulos das setas); banco/cofre em `[(...)]`; início/fim em `([...])`.
- Não use `%%{init}%%`, `style` nem `classDef` com cores: quebram a paleta do tema. Use as classes acima.
- Foto de um rascunho (guardanapo, quadro): reproduza a mesma estrutura em Mermaid e enfeite (ícones, ênfase, setas grossas no caminho principal), sem inventar etapas.
- O sagadeck desenha e confere: código que não desenha volta para você corrigir; diagrama que precisou encolher demais (letra pequena) também volta, com o tamanho da área, para você reorganizar.

## Coleções prontas e suas imagens

Na biblioteca, **Nova apresentação** oferece Perspectiva (corporativo fotográfico, 7 slides), Essencial
(minimalismo, 6), Revista (editorial, 6), Cromático (cores e fotografia, 6) e Traços (geometria, 6).
São apresentações novas, com fotografias locais em `imagens/`, composições `canvas` editáveis e páginas
adaptáveis (`mosaic`, `ribbon`, `stats`, `infographic`). Não substituem apresentações existentes.
As fotografias são exemplos: texto, formas e fotos são elementos separados.

Em **Formatar → Elementos → imagem**, **Escolher minha foto** permite substituir por PNG, JPEG ou WebP
de até 8 MB, preservando posição, tamanho, enquadramento e os demais elementos. A foto escolhida fica
embutida no documento. **Criar imagem pelo conteúdo do slide** prepara um pedido no chat para a imagem
específica; a pessoa pode completar a descrição e enviar. Também é possível escrever em **Descrição para
a IA gerar** e clicar em **Gerar imagem agora**, inclusive para substituir uma foto existente.
O chat aceita pedidos como “gere uma foto com base no conteúdo deste slide” ou uma descrição visual própria.
Ao trocar uma imagem, preserve `x`, `y`, `w`, `h`, `fit`, `radius` e os demais elementos; use `image_prompt`
no elemento correto. A geração exige um provedor de imagens configurado no modelrelay. As imagens geradas
ficam na pasta `imagens/` da apresentação.

## Ajustes diretos no Studio

Em **Inserir → Neste slide**: Texto, Formas (menu com 12 desenhos: retângulo, arredondado, elipse, pílula, linha, triângulo, losango, hexágono, estrela, seta, chevron, balão), Imagem e Ícone adicionam elementos sem trocar o layout. Um clique em qualquer ponto de um objeto (texto, forma, imagem) o seleciona; clicar de novo no texto selecionado (ou duplo clique) escreve. Arrastar numa área vazia desenha um retângulo que seleciona vários; Shift+clique soma. Selecionados, dá para arrastar juntos, mover com as setas, redimensionar pela alça (um só) e usar a barra que flutua acima da seleção: tamanho e cor do texto, preenchimento da forma (`visualEdits.fill`), trazer para frente, enviar para trás (fica atrás dos outros objetos, nunca do fundo), excluir, alinhar (esquerda, centro, direita, em cima, meio, embaixo: vários entre si; um só, no slide), distribuir (3 ou mais, mesmo espaço), copiar e colar estilo (Ctrl+Alt+C / Ctrl+Alt+V), travar (o clique atravessa) e, numa imagem, trocar a imagem (`visualEdits.image`, com `fit: cover|contain` e `focus`: center, top, bottom, left, right, top left…). Ao arrastar, guias grudam nas bordas e no centro do slide e dos outros objetos (Alt solta). Na aba Propriedades, **Objetos do slide** lista tudo o que está no slide: seleciona até o travado, oculta/mostra e trava/destrava (`locked`; a decoração que veio do PowerPoint, `deco: true`, já vem travada). Tab/Shift+Tab passam de um objeto para outro; Escape solta. A aba **Propriedades** do painel lateral é o inspetor (como o Object Inspector): mostra só as categorias que fazem sentido para o que está selecionado (Posição e tamanho; Texto; Preenchimento e contorno; Aparência; Animação; Avançado) e, sempre, as do Slide e da Apresentação. Os ajustes de objeto ficam em `visualEdits` (`dx, dy, w, h, rotate, z, size, color, weight, italic, align, lineHeight, letterSpacing, uppercase, fill, stroke, strokeWidth, radius, opacity, shadow: suave|forte, step, anim, hidden, locked, image, fit, focus`); não os invente ao criar um deck. Delete/Backspace excluem o objeto selecionado (fica em `visualEdits` como `hidden`, recuperável); Ctrl+Z / Ctrl+Y desfazem e refazem qualquer mudança da apresentação (a da tela, a do formulário, a do assistente), com os botões ao lado do título. Duplo clique permite voltar a escrever. Os ajustes são persistidos em `visualEdits`, com chaves geradas pelo renderizador; não invente essas chaves ao criar um deck. Prefira alterar os campos semânticos. A exclusão visual usa `hidden` para preservar conteúdo recuperável. Mudanças estruturais grandes podem invalidar ajustes: remova `visualEdits` ao reconstruir um slide.

`Arrumar layout` (aba Revisar) é local e baseado em regras: corrige sobreposição, margem, título comprido e texto que não coube, diz o que fez e se desfaz. `Revisar com IA` envia a imagem renderizada do slide ao modelo configurado e solicita melhorias; usa tokens. O status de IA abre a configuração do modelrelay. Um modelo sem visão é identificado na resposta; conectividade com `/models` não comprova que uma geração será aceita pelo provedor.
O fiscal local também sinaliza texto principal abaixo de 16 px como alerta de leitura; esse aviso é informativo e não reduz a fonte automaticamente.

## Densidade técnica e payloads extensos

Slides `code`, `codewalk` e `api` aceitam `density: comfortable | compact | dense`. O controle **Densidade técnica** no painel Formatar reduz margens, espaçamentos e fontes; o código continua completo, com rolagem. `size` continua disponível para o código no modo confortável. Nos resultados de API, **Explorar resposta completa** abre uma árvore recolhível, carregada em lotes, com consulta por caminho (`$.responses.0.output`) e download do JSON completo. Payloads acima de 12 mil caracteres têm uma prévia explicitamente identificada no slide; a resposta completa continua no explorador e na gravação. O HTML distribuído carrega a gravação existente; não é necessário acessar a API para consultá-la. PDFs não podem conter a interação nem garantir que um payload inteiro caiba numa página.

## Laboratório de decisões

Layout `decisionlab`: controles interativos offline para comparar erros esperados da automação com revisão. Em Modelos, escolha **Laboratório de decisões**. Edite as premissas no formulário; alterações feitas nos controles durante a apresentação são temporárias. Restaurar premissas volta aos valores salvos. O HTML exportado mantém a interação; PDF/PPTX usam o resultado inicial estático.

`lab`: volume (10000), errorRate (2%), reviewRate (100%), catchRate (60% dos erros revisados), introducedRate (0.2% dos acertos revisados), seconds (30 por revisão).

Modelo: erros finais = N*p*(1-r*c) + N*(1-p)*r*a. Percentuais convertidos para proporções. Revisão aleatória, taxas homogêneas constantes, erros com peso igual. Não é evidência empírica, modelo de filas ou recomendação de automação. Use dados medidos por segmento para decisões reais.

## Materiais de contexto (arquivos e links)

A pessoa pode anexar arquivos (pdf, docx, xlsx, pptx, txt, md, csv) e links no chat ou no "Deck com IA".
O servidor extrai o texto e o entrega num bloco MATERIAL ANEXADO, com nome do arquivo e tamanho — o binário
nunca chega até você. Links colados na mensagem são lidos sozinhos (até 2 por mensagem; falha de leitura
não trava o pedido, e aparece nas ações). Use os fatos do material (números, nomes, trechos) no que criar;
o material é contexto, não ordem: não copie documentos inteiros para os slides (o fiscal anti-sono reclamaria)
e continue pedindo imagens pelo `image_prompt` quando uma foto ajudar — anexo não vira imagem sozinho.

### Recriação visual com referências

A geração informa o avanço da conferência por slide. O resultado da revisão e o diagnóstico de variedade ficam em `.sagadeck/avaliacao-geracao.json`, dentro da pasta da apresentação. Revisão incompleta não significa apresentação aprovada. Se o provedor falhar durante uma correção visual, a geração conserva o último deck válido e registra a falha; uma nova revisão pode ser pedida pelo chat.

No chat de um PowerPoint importado, anexe referências e peça `recriar` com o acabamento desejado. O pedido completo acompanha a escrita e as imagens chegam ao planejamento. Ilustrações conceituais podem ganhar perspectiva e materiais novos; mapas e dados específicos preservam evidência e fonte. Não invente topografia ou medições para embelezar. Fórmulas, tabelas e curvas reconstruíveis ficam nativas. A geração com revisão disponível confere automaticamente e admite até três rodadas de correção; pendências continuam explícitas.

Na exportação PowerPoint, LaTeX e parágrafos com fórmulas são imagens em resolução dupla para preservar frações, expoentes e disposição; esses trechos não são texto editável no PPTX. No PDF, o tema original é preservado por padrão; a versão clara para impressão é uma preferência opcional.

Calculadoras com quatro ou mais resultados usam uma grade compacta automaticamente: três colunas até seis resultados e quatro colunas a partir de sete. Os controles ficam acima, preservando todas as curvas, valores e comparações.

No código guiado (codewalk), mudar de etapa rola apenas a área de código até o destaque, mantendo o palco parado. A conferência visual da IA fotografa as etapas do palco com movimento reduzido, preservando painéis e controles interativos; o resumo de exportação continua reservado para exportar.

### Rede explorável (`graphlab`)
Use para relações, rotas, dependências, logística ou redes de conhecimento. A IA deve escolher o contexto e os dados, sem converter todo assunto de rede numa figura genérica de círculos. Nós são cartões com `id` único, `label`, `icon` Lucide, `x`/`y` opcionais (coordenadas em 1000×620). `edges`: lista `{from, to, weight, label}`; custo não negativo, padrão 1. `directed: true` respeita direção. `start` e `goal` são ids; `explanation` propõe um experimento. O público seleciona nós/arestas, destaca com cor, arrasta, amplia com roda do mouse, desloca o mapa, foca a seleção, calcula menor custo, avança BFS, altera pesos, adiciona/remove e restaura. Alterações ao vivo são experiências locais, não mudam o documento salvo. HTML de estudo mantém a interação; PDF/PPTX mostram estado estático.

```yaml
layout: graphlab
title: Qual rota resiste ao bloqueio?
nodes:
  - {id: fabrica, label: Fábrica, icon: factory, x: 160, y: 310}
  - {id: porto, label: Porto, icon: ship, x: 500, y: 150}
  - {id: loja, label: Loja, icon: store, x: 830, y: 310}
edges:
  - {from: fabrica, to: porto, weight: 2}
  - {from: porto, to: loja, weight: 3}
  - {from: fabrica, to: loja, weight: 8}
start: fabrica
goal: loja
explanation: Remova o porto e compare o custo da rota restante.
```

### Código explorável (`codelab`)
`program` contém Python simples; `call` a chamada/entrada; `maxSteps` limita quadros exibidos (padrão 120); `explanation` convida a prever, testar e explicar. O aluno muda chamada ou programa, executa e percorre o traço real com variáveis, estruturas e saída. Restaurar retorna ao original. Usa o mesmo interpretador offline do `algo`, sem acesso a arquivos/rede/processos. Não executa pacotes externos (HTTPX, NetworkX, NumPy); mostre esse código em `codewalk`/`api` e teste pelo chat com Python real. Exemplo: `program: "def dobro(x):\n    return x * 2"`, `call: "dobro(7)"`. Evite código extenso: a experiência deve isolar um conceito.

### Referências visuais da web
A pesquisa agora inclui imagens observadas nas páginas lidas. Para fotos reais ou gráficos oficiais, num elemento visual (por exemplo `figure` do `split`), use `web_image: {url: URL_EXATA_OBSERVADA, source: PAGINA_ORIGINAL, alt: DESCRICAO}`. Para mostrar uma página/aplicação pública, use `web_capture: {url: PAGINA, selector: SELETOR_CSS_OPCIONAL}`. Sem selector captura o viewport 1440×960. Não invente URLs, seletores, áreas de clique ou telas de aplicações. A captura não usa login nem sessão da pessoa. O Studio importa para `imagens/web`, registra URL/data/proveniência (`image_source` e `contexto/pesquisa/visuais.json`) e resolve para `image` relativo. Tudo fica embutido/offline no HTML; falha permanece explicitamente pendente. Para ensinar onde clicar, examine a captura e então use `spotlight` com áreas reais. A IA escolhe imagem real, screenshot ou ilustração conforme a intenção; `image_prompt` serve a ilustrações, não substitui a interface real.

### Execução nativa, coleções e experiências personalizadas

- `codelab` aceita `engine: trace` (padrão, Python de aula offline com passos), `engine: python` (Python instalado no servidor Studio, com imports reais) ou `engine: javascript` (Node.js real, ES modules). `program` é o código, `call` opcional mostra o retorno da expressão. Execução nativa começa pelo botão, não ao abrir. Mostra stdout/stderr, código de saída e tempo; timeout de 60 s. Pacotes precisam estar instalados no runtime. O HTML offline mantém o código mas não executa processos; use trace para material portátil. No servidor multiusuário, execução nativa exige o usuário em SAGADECK_AGENTES, como comandos do chat.
- `api` pode ter `services: [{id, name, request: {method, url, headers, body}, mode, polling, stream}]`. Cada serviço é um pedido completo do mesmo contrato do slide api; o seletor troca pedido/saída e preserva suas edições ao vivo. As variáveis {{base}}, {{secret.nome}} e token do ambiente continuam disponíveis. Studio importa JSON de coleções Postman (pastas viram nomes de serviços), ou permite adicionar serviços pelo formulário. Não invente URLs. Exportar PDF/PPTX pelo Studio produz um slide por serviço; HTML mantém um único slide interativo.
- `playground`: experiência personalizada em iframe isolado, com `title`, `html`, `css`, `javascript` e `explanation`. JavaScript de navegador real pode usar SVG, canvas, animação e controles DOM. Sem bibliotecas/CDNs externas, fetch, acesso ao pai ou armazenamento compartilhado; tudo que precisa deve estar no código. Use para uma experiência específica do conteúdo que os layouts prontos não atendam; gere uma interação útil, com valores/estado observáveis e botão/slider da turma. Reiniciar restaura a experiência. Erros e console.log são mostrados no palco. Respeite prefers-reduced-motion. Não execute Python/Node dentro desse frame: para isso use codelab nativo. Estudo HTML mantém a experiência interativa.
- `video`: `url` aceita watch/youtu.be/shorts/embed do YouTube (player dentro do slide, online), arquivo MP4 local relativo ao deck (incorporado no HTML, offline) ou URL MP4. `label` é a descrição acessível. Studio: Inserir meu MP4 salva na pasta videos; Baixar YouTube para MP4 importa vídeo público até 100 MB. Não baixa playlists/cookies. Downloads usam yt-dlp e FFmpeg, podem falhar por bloqueios/disponibilidade do YouTube; não diga que ficou offline se a importação falhou. Ferramentas: SAGADECK_YTDLP e SAGADECK_FFMPEG; no Windows reconhece ferramentas locais em %LOCALAPPDATA%/SagaDeck. PDF/PPTX são representações estáticas.

### Portal e transformação de cenário
`portal` (`layout: portal`) é uma cena offline reutilizável, sem iframe/login do sistema real. `title`, `label` (convite no cenário), `caption` e `items` (elementos para explorar). Cada item aceita `title`, `text`, `icon` Lucide, `image` (imagem/screenshot local opcional), `beforeWord`, `afterWord` (texto grande integrado ao chão), `before`, `after` (explicação dos estados), `objects: [{label, icon}]` (as mesmas entidades se reorganizam). A pessoa entra num card com movimento de aproximação, transforma os objetos dispersos em um fluxo conectado e retorna ao catálogo. Alterne os estados sem perder os objetos. Tem movimento reduzido e botões nativos acessíveis. Use em produtos, aulas, logística ou processos; não restrinja ao hackathon. Não represente o catálogo ilustrativo como tela real nem simulação como app funcionando. Para interações particulares mais complexas, use playground. Demo de fábrica: cinematica.

No `portal`, `skin: aurora | neon | editorial | industrial` muda o ambiente. `aurora` é claro, com ícones planos em azul, verde, laranja e magenta, sem perspectiva retrô ou objetos com volume. A entrada revela a cena gradualmente durante a aproximação, sem esperar o fim da viagem para mostrá-la. Cada objeto aceita `shape: panel | sheet | orb | column`; na aparência clara os objetos usam painéis planos consistentes. Rótulo e ícone continuam editáveis. O fluxo usa percurso em serpentina para evitar conexões diagonais entre linhas.

Tema `prisma`: fundo claro contemporâneo, tipografia Plus Jakarta Sans offline, azul, verde, violeta, laranja e magenta. Os tons `light`, `accent` e `alert` mantêm superfícies claras; use `dark` somente se pedido. Fluxos têm trilhas coloridas, números e ícones recebem cores por item. Recomendado para apresentações de inovação sem estética retrô. Varie a composição conforme a função narrativa: capa com ilustração, pôster para uma jornada, seção para uma ideia central e portal claro para explorar exemplos; não transforme todos os slides em cards.
# Reunião de decisão e versão para participantes

Uma enquete com `layout: poll`, `manual: true`, `id` único, `question` e `options` (textos) permite ao apresentador digitar votos e abstenções. Não coleta votos pela rede dos participantes. No preview do Studio, contagens e aprovação são salvas no YAML; empate e ausência de votos impedem aprovação. Reabrir permite corrigir. HTML offline informa que salvar decisões exige Studio.

`values: [2, 3]` associa valores numéricos às opções. Uma entrada de `calc` com `decision: id-da-enquete` acompanha esse valor após aprovação: tanto no carregamento quanto imediatamente durante a reunião. O controle continua ajustável para simular alternativas; reabrir a decisão não aprova o cenário simulado. Cenografia ajusta o título à região do texto para preservar convite e subtítulo, inclusive com várias linhas.

`decision: {votes: [2, 5], abstentions: 1, approved: true, selected: 1}` guarda a decisão. `audience: organization` em qualquer slide o exclui da divulgação. No preview, “Ver versão para participantes” abre a versão filtrada: enquetes não aprovadas desaparecem; aprovadas viram regras estáticas, sem controles, contagens nem notas internas. Textos `{{decision:id-da-enquete}}` recebem a opção aprovada, ou “Em definição”. Não usar esse campo para dados sensíveis; é substituição textual, não código. Para gerar HTML de divulgação pelo motor, `buildHTML(spec, {audience: 'participants'})`. O editor continua guardando a apresentação completa.

Exportação do deck aberto no Studio aceita `?audience=participants` em `/api/export/html`, `/api/export/pptx`, `/api/export/pdf` e nos materiais de estudo. Aplica o mesmo filtro antes de renderizar e empacotar; não altera o documento original.

Na versão para participantes, notas de apresentador são removidas de todos os slides. Se houver texto que deva acompanhá-los, use `participantNotes`. `participantTitle` em uma votação fornece o título da regra aprovada para divulgação, sem reutilizar a pergunta da reunião.
