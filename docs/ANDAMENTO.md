# Trabalho em andamento

Diário de bordo das frentes longas: o que já entrou, o que falta e as decisões tomadas. Serve para qualquer
sessão (Claude, GPT, pessoa) continuar de onde a outra parou, sem depender de conversa ou de máquina.

**Regra:** ao terminar uma etapa, atualize este arquivo no mesmo commit. Ao abrir uma sessão nova, leia antes de
começar. Trabalho em curso vai para o GitHub (commit + push) a cada etapa, nunca só no disco local.

---

## Frente F: fontes embutidas (sem Google) e modo simples no Studio — 28/09/2026

- **Fontes**: o `base.css` importava 6 famílias de `fonts.googleapis.com`. Na rede do banco (proxy barrando o Google)
  o tema perdia a letra, abrir/exportar podia esperar a fonte e cada abertura avisava o Google. Agora as fontes (OFL,
  pacotes `@fontsource` em devDependencies) ficam em `src/runtime/fonts/<família>.css` em base64, só o subconjunto
  latino (`scripts/vendor-fonts.mjs` gera; `index.json` lista). O HTML leva só as famílias que o CSS do deck cita
  (`fontsCSSFor` em `build.js`: um deck do sinal não leva a letra do rabisco); o Studio carrega todas uma vez em
  `/fonts.css`. Licenças no `THIRD_PARTY_NOTICES.md`. Efeito colateral bom: os testes de UI da nuvem pararam de
  falhar por "fonte do Google barrada".
- **Modo simples** (padrão): as ferramentas de especialista (`[data-adv]` no `index.html`: Abrir YAML, tom e textura,
  API ao vivo, Última fileira/Mapa de atenção, Ritmo, Guias, YAML, Sons) ficam guardadas; "Mais opções" (à direita
  das abas) mostra tudo e o navegador lembra (`simpleMode`). Nada foi removido.
- Testes: `fonts.test.js` (nenhum tema pede fonte à internet; deck leva só as suas; com a internet cortada o rabisco
  desenha com Caveat; Studio serve `/fonts.css`), `studio.test.js` (modo simples esconde, Mais opções mostra e lembra).

## Frente E (preguiçoso): Nova em 3 caminhos, vitrine única, prévia do tema e "Baixar tudo" — 28/09/2026

- **Nova (biblioteca)**: o menu tinha 16 entradas. Agora: *Descrever com IA*, *A partir de um arquivo ou link*,
  *Modelo pronto*, e embaixo *Em branco* / *Importar*. `startNew()` em `library.js` é a porta única.
- **Vitrine "Modelo pronto"** (`galleryDialog`): coleções, estilos prontos (as experiências de
  `src/experiences.js`, que antes não tinham porta: o "Escolher um estilo" abria o seletor de importar), demonstrações
  e exemplos, com filtro. Mesmos `data-new` de antes (`model-*`, `example-*`) e `exp-<id>` para os estilos.
- **Diálogo de IA da biblioteca** (era só um campo de texto; a Frente A tinha melhorado só o modal do editor): assunto,
  minutos (mostra "≈ N slides", mesma conta de `slidesForMinutes`), estilo (Automático = a IA escolhe o tema pelo
  assunto, ou uma coleção) e material de apoio (arquivos e link, via `/api/ai/context`). "A partir de um arquivo" é o
  mesmo diálogo, que já abre o seletor de arquivo e aceita gerar só com o anexo.
- **Bug**: "Deck com IA" do editor gravava o deck gerado solto na pasta do deck aberto (ou na pasta atual do servidor),
  fora da biblioteca. Agora editor e biblioteca usam `generateIntoLibrary()` (pasta própria, no tópico do deck aberto;
  falhou, vai para a lixeira). Teste em `storage.test.js` (falhava antes: o deck ia para `/tmp`).
- **Prévia do tema/paleta ao passar o mouse** (aba Design): o slide aberto aparece com o visual, com o selo
  "Prévia: … Clique para aplicar."; nada é gravado; tirar o mouse volta; o clique aplica (`previewLook`/`endPreview`
  em `app.js`, CSS da prévia numa `<style>` à parte).
- **Baixar tudo** (Arquivo, primeiro item): um .zip com o PowerPoint (com notas), o PDF e o roteiro
  (`/api/export/tudo`; também na biblioteca por `kind=tudo`).
- Ícones `link` e `paperclip` incluídos (o chip de link do chat, da Frente B, aparecia sem ícone).
- Testes: `library-ui.test.js` (3 caminhos, vitrine com filtro, estilo pronto vira deck, IA manda minutos/estilo/anexo,
  "a partir de um arquivo" só com o anexo), `studio-themes.test.js` (prévia sem gravar, clique aplica),
  `studio.test.js` (Baixar tudo: zip com pptx com notas, pdf e roteiro), `storage.test.js` (gerado na biblioteca).

Falta da lista: modo simples por padrão (avançado dobrável) e as fontes do Google embutidas (a rede do banco barra
`fonts.googleapis.com`: temas perdem a letra, abrir/exportar pode esperar, e cada abertura avisa o Google).

## Frente D (preguiçoso): trocar o tema muda o arranjo dos slides de conteúdo — 28/09/2026

- Antes a pele de cada tema (`src/runtime/skins/<tema>.css`) só rearrumava capa, seção e encerramento; no resto a
  troca era cor e fonte. Agora cada tema tem o seu jeito para título (`.hd`), cartões e KPIs, marcador da lista,
  citação, número grande e frase: barra de aviso e placas (sinal), fios e centralizado (editorial), vazado e
  simétrico (noite), faixas primárias e círculos (bauhaus), prompt e janelinhas (terminal), fios duplos e colunas
  (jornal), balões e sombra suave (oceano), contorno grosso e sombra dura (pop), centralizado sem caixa (prata),
  tracejado e circulado à mão (rabisco), vidro e brilho (aurora). Só CSS (vale no HTML, PDF e PPTX pela coleta),
  zero token, a geometria do YAML não muda.
- Bug achado no caminho (`src/runtime/fit.js`): elemento escondido (`display:none`, ex.: a aspas que o tema esconde)
  contava como "texto fora da área" e o ajuste encolhia a citação até o mínimo.
- Mermaid na troca de tema: conferido que é só repintura no navegador (`paint()` com a paleta), sem IA. Nada a fazer.
- Teste: `themes-skin.test.js` monta 6 slides de conteúdo nos 11 temas e exige ao menos 8 arranjos diferentes por
  tipo (ignorando cor, fonte e raio), nada fora do slide, nada vazando e texto curto sem encolher. REFERENCIA.md
  descreve o que cada tema faz (a IA não reescreve slides só para "combinar").
- Frentes A, B e C (abaixo) foram feitas por outro agente (opencode); a suíte na `main` foi conferida antes: só as
  falhas de ambiente da nuvem (fontes do Google barradas, nome do download no Chrome headless).

Próximas (mesma lista do "preguiçoso"): prévia do tema ao passar o mouse; "Baixar tudo" (PPTX + PDF + roteiro);
menu Nova com 3 caminhos e vitrine única de modelos; modo simples por padrão (avançado dobrável); estilo escolhido
pela IA pelo briefing quando a pessoa não escolhe.

## Frente C (preguiçoso): elemento aviso: + regras de prompt + auditoria da referência — 28/09/2026

- Elemento novo `{ aviso: { tipo, titulo, texto } }` (tipos: importante/atencao/dica/perigo; atalho `{ aviso: "texto" }`
  vira dica; "atenção" com ou sem acento): caixa com ícone e cor do tema em `src/elements.js` + CSS em
  `src/runtime/base.css` (o PPTX/PDF herdam pela coleta do HTML). Formulário ganha o tipo "Aviso" (com
  `f.obj` aninhado) e a ordem de tipos.
- Prompt (vale para chat e geração): slide denso fecha com 1 takeaway em ==destaque== e usa `aviso` para o que
  não pode passar batido; ==palavras-chave== no texto em vez de negrito em excesso. REFERENCIA.md documenta
  o elemento (vira chave válida) e os materiais da Frente B.
- Auditoria da preocupação "o chat conhece as ferramentas?": todos os 38 layouts são citados na referência,
  cenas com exemplos, comandos via prompt do deck-ai. Buraco real era só o `aviso:` (agora documentado).
- Testes: `engine.test.js` (4 tipos, atalho, acento, tipo inválido, markdown e SVG), `studio.test.js` (adiciona
  pelo formulário, salva no YAML, desenha a caixa), `ai.test.js` (regra no prompt do sistema). `npm run bundle` passou.
- Validação ao vivo (nemotron-3-ultra-550b:free; o 120b e o qwen gratuitos estavam sobrecarregados/limitados):
  "adicione um aviso de perigo…" → `{aviso:{tipo:perigo,…}}` exato no slide.
- CI acusou 2 falhas no Linux (ambas verdes no Windows): (1) teste do Aviso não achava o campo visível —
  blindado abrindo o cartão do elemento antes de digitar, como a pessoa faria; (2) conversa salva depois do
  indicador sumir (race real: recarregar na mesma hora perdia a troca) — agora a conversa grava antes de
  dispensar o indicador, nos 3 caminhos de resposta.

## Frente B (preguiçoso): chat e Nova leem pdf/docx/xlsx/pptx e links — 28/09/2026

- Novo `src/ai/context.js`: extração de texto no servidor (txt/md/csv direto; docx/xlsx/pptx via jszip;
  pdf via pdfjs-dist, dependência nova); links com anti-SSRF (sem rede local/metadata, redirects revalidados,
  2 MB, 15 s), HTML virando texto e PDF linkado valendo; bloco MATERIAL ANEXADO rotulado e truncado (12 mil
  caracteres no prompt). O binário nunca vai para o modelo.
- `POST /api/ai/context` guarda o texto na sessão e devolve id; chat manda ids (imagens continuam embutidas);
  links colados na mensagem são lidos sozinhos (até 2, falha não trava, aparece nas ações); `editDeck` e
  `generateDeck` aceitam `materials`; modal "Deck com IA" tem anexos de arquivo + link.
- UI: chips de documento no chat e no modal, trava de envio enquanto lê, placeholders e accepts atualizados.
  REFERENCIA.md documenta os materiais (vai no prompt da IA).
- Testes: `test/context.test.js` novo (extração, SSRF, fetch local, truncamento); `ai.test.js` (bloco no pedido);
  `studio-ai.test.js` (docx anexado chega ao modelo sem o zip; link lido sozinho sem script); `studio.test.js`
  (anexo no modal vai no corpo do pedido). `npm run bundle` passou (3,4 MB).
- Validação ao vivo (nemotron-3-super-120b:free, só texto): docx com "40 por cento / 3 bilhões" → slide editado
  com os dois números em `==destaque==`. Na primeira tentativa o provedor gratuito devolveu 503 (sobrecarga);
  passou na segunda.

## Frente A (preguiçoso): Nova em 1 tela — minutos, estilo e placeholder — 28/09/2026

- Modal "Deck com IA" agora pede **minutos** (slides saem daqui: ~1 a cada 1,5 min, `slidesForMinutes()` em
  `src/ai/deck-ai.js`; ajuste fino manual vale até trocar os minutos) e **estilo** (as 5 coleções →
  `COLLECTION_STYLE` em `template-collections.js`: tema + direção criativa; tema explícito continua vencendo).
- Encanamento: modal manda `duration`+`style`, servidor repassa (`direction` resolvida no `generateDeck`);
  sem minutos/slides, o servidor calcula os slides da duração (vale para o CLI `--duration`, que já existia).
- Ajuda do CLI menciona `--duration`. Placeholder do briefing com exemplo melhor.
- Testes: `ai.test.js` (regra, prompt com duration/style, precedência de explícitos), `template-collections.test.js`
  (um estilo por coleção, tema válido), `studio.test.js` (modal: auto, sugestão de tema, corpo do pedido).
- Validação ao vivo (nemotron-3-super-120b:free, sem imagens): 10 min + estilo essencial → 7 slides variados,
  tema prata, soma dos tempos = 10, em 1,6 min. `npm run bundle` passou.

## Rótulos grudados na faixa de opções — 28/09/2026

- Reclamação: vários botões do editor com palavras grudadas ("Diagramade texto", "Cabeçalhoe rodapé",
  "Deckcom IA", "Últimafileira", "Mapa deatenção").
- Causa: os rótulos usavam `<br>` para quebrar em duas linhas, mas o `studio-next.css` escondia o `<br>`
  (`.studio-next .rbtn-lg br { display: none }`, do wip do visual novo) — as palavras colavam numa linha só.
- Correção: rótulos em linha única com espaço de verdade (`index.html`) e remoção da regra morta do CSS.
  A faixa já rola na horizontal (`overflow-x`), então os botões mais largos não quebram nada.
- Não eram bug (só innerText de elemento escondido): selo "0" do fiscal (absoluto, some quando limpo),
  "Aa+nome" dos cartões de tema (posicionamento absoluto) e título+descrição do menu Nova (descrição em bloco).
- Teste: `studio.test.js` abre cada aba (Inserir, Design, IA, Revisar) e confere o texto visível dos botões,
  mais uma guarda contra minúscula seguida de maiúscula nos rótulos da faixa.
- Validação: `npm test` — 405 testes, 391 passaram, 14 pulados (ao vivo), zero falhas; `npm run bundle` passou.

## Coleções visuais — 28/09/2026

- Pedido anterior interrompido após revisão e merge por Claude; nova frente limitada aos templates dos cinco
  screenshots e à troca de imagens solicitada durante a execução. Nenhuma palestra pessoal reescrita.
- Cinco coleções em `src/studio/template-collections.js`: Perspectiva, Essencial, Revista, Cromático e Traços;
  31 slides editáveis, fotografias originais locais, capas, agendas, capítulos, colagens, encerramentos e
  páginas adaptáveis. Menu Nova apresentação; cada cópia recebe seus recursos em `imagens/` na biblioteca.
- Formatar → imagem: escolher foto própria sem perder geometria; atalho que prepara no chat a geração pelo
  conteúdo do slide; geração por descrição disponível também para substituir uma imagem existente.
- Testes: criação das cinco coleções pela UI com conferência de YAML/arquivos, substituição da foto com
  preservação da geometria, pedido contextual no chat, renderização de todos os slides sem imagens faltantes,
  formas transparentes por cores inválidas, texto fora do palco ou erros JS. Revisão visual dos 31 slides.
- Validação concluída: `npm test` — 404 testes, 390 passaram, 14 pulados, zero falhas; `npm run bundle` passou.
- Reinício local solicitado, mas o comando foi recusado pela revisão automática de permissões
  (`blocked by policy`); não confirmado nesta etapa. O Studio permanece em `http://127.0.0.1:3001`.

## Frente: diagramas, one-page e apresentações do dia a dia

Pedido original (Naruminho, set/2026), em cinco partes:

1. **Diagramas de verdade**: setas (linha, pontilhada, grossa), fluxogramas, UML; menos rígido que os layouts;
   a IA faz 95% e a pessoa só pede ajuste; foto de rascunho no guardanapo vira diagrama bonito.
2. **One-page** (uma página só com tudo): jornada com ícones e mini-frases, problema com números, solução;
   às vezes um dashboard (números grandes, mapa de região, barras comparativas, linhas de tendência).
3. **Status semanal**: feito, bloqueios, problemas, avanço, screenshots quando há front-end; muito variável
   (tem semana sem nada "mostrável").
4. **Governança da Bridge**: pedido de acesso (SharePoint) → experimento (30 dias, prorrogável, dados
   fictícios) ou projeto (DEV 30 dias, HOM 30 dias, PROD sem prazo); em HOM/PROD as chaves do Identity ficam
   no Key Vault, cadastradas via RITM/Change no ServiceNow.
5. **Caminhos que se abrem conforme o front-end**: lote (Databricks de madrugada, autocontido); front-end
   próprio (Wave → arquitetura → infra → rede/firewall → infra de namespace/ARO → DBA do DER → DBA de
   implantação → sistemas/devs, cada área com seu formulário/artefato: throughput, segurança, cyber,
   sustentação com playbook/runbook, governança com descomissionamento/curadoria/data shift); Teams (curso e
   licença Copilot Studio premium + Power Automate); SaaS externo (túnel mTLS + serviço extra na Bridge).
   Pergunta: como deixar isso navegável, organizado e útil?

### 1. Diagramas: FEITO (branch `claude/focused-albattani-vdll01`)

- Layout `diagram` com código Mermaid (`mermaid:`), desenhado no navegador por `src/runtime/diagram.js`
  com a fonte e a paleta do slide. Biblioteca embutida (`src/runtime/vendor/mermaid.min.js`, via
  `scripts/vendor-science.mjs`), funciona offline.
- Ênfase por classe (`:::hi`, `:::em`, `:::escuro`, `:::suave`, `:::vazado`); ícones `:nome:` nos rótulos
  (o espaço do ícone é medido como texto "MM" antes do desenho e trocado depois: o nó não corta o rótulo).
- `%%{init}%%` é removido (fugiria da paleta).
- Visual (pedido de Naruminho, com um diagrama de arquitetura estilo draw.io como referência): famílias de cor
  tiradas do tema, uma por grupo (`subgraph`): fundo bem claro, título colorido, nós com preenchimento suave e
  contorno da mesma cor mais escura; setas em ângulo reto (`curve: step`); nada de preto chapado (texto
  grafite, setas cinza); `:::suave` é cinza neutro (externos). Mapa mental: uma família por ramo (o Mermaid
  pinta o ramo N com a cor N+1; contorno e linha acompanham). Pintura por grupo em `paint()` (geometria:
  cada nó pega a família do menor grupo que o contém).
- Direção automática (pedido de Naruminho: "o gerador tem que decidir a disposição"): o fluxograma é desenhado em
  LR e em TB e fica o que deixa a letra maior (troca só se for 12% melhor); `autoDirection: false` mantém.
- Conferência pelo desenho: `diagramCheck` (`src/studio/snapshot.js`) desenha no Chrome headless; em
  `src/ai/deck-ai.js`, `checkDrawings` devolve à IA o erro de sintaxe (corrigir) e o "encolheu demais"
  (objeção única, soft). Ligado no chat, no gerar deck (Studio, biblioteca e CLI) e no napkin.
- Studio: botão Inserir → Diagrama, formulário, miniatura desenhada, aviso na barra de status quando o
  diagrama encolhe ou tem erro (vai junto para a IA em `renderNotes`).
- PDF/PPTX/foto para a IA esperam `window.SagaDiagramsReady`.
- Referência para a IA: seção "Diagramas (`diagram`)" em `docs/REFERENCIA.md`, com regras de bom desenho.
- Testes: `test/diagram.test.js` (paleta, ênfase, ícone, tipos, contraste, aviso), `test/ai.test.js`
  (erro e objeção voltam para a IA), `test/studio.test.js` (inserir pelo Studio).

Ideias que ficaram para depois (não bloqueiam):
- Setas "gordas" geométricas (chevrons de processo) não são do Mermaid: hoje o layout `steps` cobre; avaliar
  um elemento próprio se a pessoa pedir.
- Editar o diagrama arrastando (tipo draw.io) está fora: a edição é pelo chat/código. Reavaliar com uso real.

### Paletas de família: FEITO

- Pedido: identidade de marca sem cansar a vista (a cor forte da marca só no detalhe; a página trabalha com os
  parentes mais agradáveis dela). Pré-definidas e **sem nome de empresa** (o software é distribuído livremente):
  `rubi`, `ametista`, `tangerina`, `safira`, `esmeralda` em `src/themes.js`.
- Campo `family` (2 a 8 parentes) em qualquer paleta: vira `--c-f1..` e as séries 3 a 5 dos gráficos
  (`familySeriesCSS`); nos diagramas, grupos e ramos usam os parentes (`familyOf`/`visible` em
  `src/runtime/diagram.js`: parente claro demais escurece mantendo o matiz; faltando parentes, variações pequenas
  de matiz/luminosidade, nunca o arco-íris). A ênfase (`alert`) nunca vira grupo nem ramo.
- Testes: `engine.test.js` (variáveis e séries), `diagram.test.js` (tudo na família, ênfase na cor forte).

### Infográficos: FEITO

- Pedido (com 5 prints de templates): formas que o Mermaid não faz, com quantidade variável de itens e ajuste
  automático. Layout `infographic` (`src/infographic.js`), `shape`: `arco`, `ramos`, `lados`, `trilhas`, `metro`.
- Palco de 1680×700: geometria em SVG, textos em HTML por cima (editáveis no PowerPoint). Caixa com `data-fit` e
  tamanhos internos em `em` (encolhem juntos); alinhamento `safe` (o excesso vai para baixo, onde a medida vê).
- Cores `itemColors`: família da paleta ou tons harmônicos ao destaque, sempre com contraste 3 para letra clara.
- Sombra e ponta de seta com id por slide (hash do conteúdo): com id repetido, o navegador usava a definição do
  1º slide, invisível quando outro está na tela.
- Testes: `engine.test.js` (formas, limites, cores), `infographic.test.js` (nada encavala, texto cabe, dentro do
  palco, setas do próprio slide; rode com `IG_THEME=rabisco` para a fonte larga), `studio.test.js` (inserir,
  trocar forma, adicionar item).

### Fila combinada (próximas etapas, nesta ordem)

1. ~~PowerPoint sem as notas do apresentador~~ FEITO: menu Arquivo e cartão da biblioteca ("Baixar PowerPoint sem as notas", `?notas=0`), CLI `--sem-notas`, `exportPptx({ notes: false })`. As notas continuam no deck.
2. ~~Identidade~~ FEITO (`src/identity.js`, `applyIdentity` em `src/themes.js`, grupo Identidade na aba Design, rotas `/api/identities`; paleta `oceano` renomeada para `safira` por colidir com o tema `oceano`). Desenho original: arquivo local `~/.sagadeck/identidades.yaml` (fica na máquina do
   trabalho, nunca no repositório), com fontes por papel (título, corpo, compacta) em ordem de preferência e a
   paleta preferida. Opcional e por deck (`identidade: nome`; Studio: Design → Identidade). Corpo e rótulos sempre
   na fonte da empresa; títulos grandes só nos temas sóbrios (os de personalidade mantêm a fonte do tema).
   Fallback: fontes digitadas → fonte do tema → genérica; aviso no Studio se nenhuma estiver instalada. Sem
   embutir o arquivo da fonte (licença). Fontes mais largas (rabisco/sketch): o ajuste de texto já remede quando a
   fonte chega; o diagrama agora espera `document.fonts.ready`.
   Correção depois: o grupo Identidade ficou alto e as 16 paletas espremeram a galeria de temas até sumir (a faixa
   rolava na vertical). Agora temas e paletas dividem o espaço, cada um com a sua rolagem (`.rgroup-gallery`), e o
   teste "Design: temas e paletas ficam à vista" confere em 1366 e 2000 px.
3. One-page, status semanal, governança navegável (abaixo).

Decisão pendente com Naruminho: manter MIT ou trocar para AGPL-3.0 (proteção contra uso fechado como serviço).
Versões já publicadas como MIT continuam MIT.

### Revisão da branch do GPT (`gpt-adaptativo`) e comandos da IA

- Aproveitado: correção do prompt (dizia que diagrama não é layout); aba JavaScript nos slides api (reescrita
  legível, no molde do Python; testada executando contra uma API de mentira); grades adaptáveis `mosaic`
  ("Grade adaptável"; "Mosaico" já era o bento), `ribbon`, `dossier` (`src/adaptive-layouts.js`; regra do item
  em destaque corrigida para a grade fechar sem buraco); modelos de demonstração (`src/studio/demo-decks.js`,
  capa comprimida de 1,9 MB para 144 KB; menu Nova agora cabe em janela baixa, com rolagem); regras do
  AGENTS.md. Galeria do Studio: teste novo falha se um layout do motor ficar fora dela (pegou também o
  `decisionlab`, que estava escondido).
- Descartado: `scripts/restore-humano-bug.mjs` (alterava o conteúdo de uma palestra da pessoa, com caminhos da
  máquina dela), `scripts/wire-adaptive.mjs` (editava o código-fonte por substituição de texto) e
  `scripts/verify-demo-decks.mjs` (caminhos fixos da máquina).
- Comandos da IA, redesenhados (`src/ai/commands.js`): a IA pede `run: {language, why, code}`; o Studio mostra
  o código e só roda com o clique (Executar / Executar e liberar os próximos / Não executar). Pedido pelo fluxo
  NDJSON (`phase: "approve"`), resposta em `/api/ai/approve`, presa ao usuário que pediu; 10 min sem resposta =
  recusado. Variáveis/segredos/token do ambiente como `SAGA_VAR_*`/`SAGA_SECRET_*`/`SAGA_TOKEN`, saída
  mascarada. Local: liberado para a pessoa da máquina. Multiusuário: só `--agentes` / `SAGADECK_AGENTES`
  (pedido de Naruminho: no servidor Oracle, a Mary usa tudo menos comandos).

### 2. One-page: A FAZER

### 3. Status semanal: A FAZER

### 4 e 5. Governança navegável: A FAZER

---

## Como rodar os testes numa sessão na nuvem

`npm ci`, depois `SAGADECK_BROWSER=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test`
(sem essa variável, os testes de navegador são pulados em silêncio).
