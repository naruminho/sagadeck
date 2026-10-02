# Trabalho em andamento

Diário de bordo das frentes longas: o que já entrou, o que falta e as decisões tomadas. Serve para qualquer
sessão (Claude, GPT, pessoa) continuar de onde a outra parou, sem depender de conversa ou de máquina.

**Regra:** ao terminar uma etapa, atualize este arquivo no mesmo commit. Ao abrir uma sessão nova, leia antes de
começar. Trabalho em curso vai para o GitHub (commit + push) a cada etapa, nunca só no disco local.

---

## PLANO (para aprovar): pesquisa na web para gerar material (estilo deep research) — 02/10/2026

- Pedido: "faça um tutorial de interpretabilidade com SHAP" e o sagadeck pesquisa, baixa páginas, PDFs, artigos e
  figuras de fontes confiáveis (documentação oficial, repositório, artigos, livros de referência; nunca o blog que
  "delira"), lê, tira prints/figuras, plota e desenha esquemas que não existem, e gera os slides com a fonte de cada
  informação. Opção caseira: no banco a internet é barrada e a tarefa avisa claramente (cole links/anexe arquivos).
- Forma: uma tarefa em etapas comandada pelo código, como a transformação (salva em disco, retomável, limites de
  chamadas/tokens/minutos, relatório), dentro do sagadeck. Não é o runtime de agente compartilhado (adiado em 29/09).
- Etapas: planejar (perguntas e roteiro) → buscar (buscador trocável: DuckDuckGo, que já existe; busca do Gemini
  com grounding; pesquisa web do OpenRouter) → filtrar fontes (oficial > acadêmico > referência; o resto descarta ou
  marca como contexto) → baixar para `contexto/pesquisa/` (texto limpo, PDF, figuras com legenda; origem e data) →
  ler e extrair (notas com citação; visão nas figuras; o Chrome fotografa o trecho da documentação ou a figura da
  página do artigo) → gerar (figura original com crédito quando é a melhor; gráfico dos dados; esquema/ciclo novo;
  imagem de IA só ilustrativa) → conferir (fiscal, visão e toda afirmação com número/fato vinda de fonte lida).
- Fases: 1) busca com filtro, ler páginas e PDFs, slides com fonte, print de página oficial; 2) figuras de dentro
  dos artigos, plot dos dados, esquemas novos; 3) outros buscadores e o aviso do banco refinado.

## Link para ver, só leitura (compartilhar com a Mary) — 01/10/2026

- Pedido: no servidor da Oracle (login do portal), mandar o link de UMA apresentação para a Mary, só para ver.
- `src/studio/share-routes.js`: Arquivo › Compartilhar link (`share-ui.js`, janela própria; app.js no limite). Código
  de 144 bits por link, em `<biblioteca>/.compartilhados.json` (dono, id do deck, público?, com as notas?).
  `/ver/<código>`: no multiusuário exige o usuário do portal; `/publico/<código>`: só se o link é público. A página é
  a apresentação montada na hora (a versão atual), sem as notas (a não ser que marcado), com noindex, no-referrer e
  no-store. Revogar: só o dono; o de outra pessoa nem aparece.
- oraculo-workspace: nginx `location /sagadeck/ver/` (`auth_request /_session`: qualquer logado, mesmo sem o app
  sagadeck) e `/sagadeck/publico/` (sem sessão, cabeçalho de usuário vazio, só GET); `infra/DEPLOY-sagadeck.md`.
- Quem recebe também baixa (pedido: "quero q ela consiga baixar pra ela se precisar nos formatos possiveis"): botão
  Baixar na página do link (`<link>/baixar/<formato>`): PDF, PowerPoint, HTML para apresentar sem internet, material de
  estudo (PDF e HTML) e `.sagadeck`; roteiro e "tudo" só no link com as notas (são feitos delas). Sem as notas, nenhum
  arquivo as leva. Um arquivo por vez por link (PDF/PPTX usam o Chrome do servidor). Mesmas regras de acesso do link.
- Teste: `test/share.test.js` (Studio local pelo menu; multiusuário por HTTP), `tests/test_portal_app_access.py`.

## Revisão das 4 versões da Aula 1 pelo fiscal: acabamento do motor e transformação mais rápida — 01/10/2026

- Método: o fiscal do sagadeck (`src/export/shots.js: check`) em todos os slides das 4 versões + fotos dos acusados.
  Antes: melhorada Flash 22 achados, Pro 36, recriada Flash 10, Pro 18. Depois: melhorada Flash 0 (o resto é letra
  miúda pedida pelo conteúdo e casos pontuais). As correções são do motor: valem para os decks já gerados.
- **Faixa do título do mestre** cortava a perna do q/g/ç e a 2ª linha, e não encolhia: o título do estilo vem com
  `font-size !important` e o ajuste mudava `style.fontSize` sem efeito. Agora `setProperty(..., "important")`, sem
  tolerância quando a caixa esconde a sobra, `data-fit-self` (encolhe só pelo próprio tamanho), cabeçalho da faixa sem
  o gap/padding do layout e folga de .1em embaixo.
- **Largura que não cabe** (`fit.js: fitWide`): fórmula `$$…$$` mais larga que o slide encolhe até caber; palavra
  maior que a caixa (rótulo ENTÃO de 64 px em 140 px, "probabilidade" num cartão) encolhe até 50% (o Chrome daqui
  não hifeniza português; partir a palavra ficou feio). Antes o "encolher tudo" deixava o slide inteiro miúdo.
- **Cor `hi` como texto**: em estilo tirado do PowerPoint era azul-bebê no branco; `--hi-ink` (o hi se dá para ler,
  senão a ênfase, senão o texto).
- **Tabela em markdown** (`| a | b |`, com `|---|`) em qualquer texto vira tabela de verdade (a IA escrevia assim
  dentro de passo do `solution` e saía cru).
- **`solution`**: dado e "pede-se" em frase saem como texto ("ver tabela" virava "vertabela" em itálico); os passos
  encolhem (até 60%) antes de cortar o primeiro no último clique, e sem o esmaecido quando cabem; "Pede-se" não
  quebra no hífen. Fórmula no meio do texto no tamanho da letra (o KaTeX aumentava 21%).
- **Imagem**: solta no `add` com `w: 100%` ocupava tudo e espremia o layout até altura 0 (agora 420 px no máximo,
  como sem tamanho; esse caso antes não tinha teste); figura sem `fit` cabe inteira quando o corte passaria de 20%
  (gráfico perdia eixo e legenda), medido no navegador com a caixa real (`data-autofit`, `fitImages`).
- **`science` só com equação** (`plot: false`) espremia os cartões do `add` por baixo da fórmula.
- **Fiscal**: contraste pelo que está de fato embaixo do texto (a pílula SVG do infográfico; antes "branco no
  branco"), marca-texto no título não é estouro. Falso alarme virava correção à toa da IA.
- **Transformação**: a conferência roda o fiscal nos slides escritos (problema exato, com o texto do objeto, para a
  correção) antes da visão; blocos em paralelo (3; `SAGADECK_TRANSFORM_PARALLEL`); no fim, pendente por fato é
  conferido de novo contra todos os itens irmãos prontos (o fato que outro bloco levou não é pendência).
- CI do Windows: o teste do modelo lavanda contava a imagem da prévia antes de ela entrar.
- **Recriada sem a moldura antiga**: na Aula 1 a moldura foi copiada slide a slide (sem `deco`), então o filtro por
  `deco` não tirava nada. `repeatedFrame` (src/master.js, a mesma detecção do estilo) acha o que se repete na mesma
  posição; o motor não desenha isso nos originais de um deck `recreatedFrom` (vale para as recriadas já geradas) e a
  transformação tira ao montar. Número da página, data e rodapé do original também saem. Na detecção, elemento que
  não é imagem/desenho/caixa de texto tinha a chave "?" + posição (dois conteúdos no mesmo lugar viravam moldura).
- Visão (VER) também em lotes paralelos.
- Pergunta: "você pediu para seguir um tema?". Sim (tema prata ou manual, paleta floresta ou mar, purpose consulta);
  a IA escolheu manual, mas a paleta se perdia (o plano só tinha "tema") e o propósito era sempre palestra (fixo no
  código e numa regra do prompt). Agora o plano devolve `paleta` (recriar) e `proposito`, e quem escreve recebe a
  regra do propósito escolhido.
- Rodada ao vivo (01/10, Flash, código e37b1bf, figuras do cache): pedido curto em 26 min (antes 63), 81 slides, 4
  pendentes, 17 pontos de desenho, tema prata, fiscal só com 5 letras pequenas. O pedido detalhado parou no PLANO:
  `SAGADECK_LLM_TIMEOUT` era o tempo TOTAL da chamada, e em streaming o relay só manda os cabeçalhos quando o modelo
  começa a escrever. Agora são dois limites (llm.js): até a 1ª palavra (`SAGADECK_LLM_FIRST_TIMEOUT`, 600 s) e sem
  chegar nada (`SAGADECK_LLM_TIMEOUT`, 180 s). `test/llm-timeout.test.js`. Achados para depois: pendente falso por
  coordenada de mapa (7606, 7608…) e por palavra comum com maiúscula ("Para", "Seção", "Hidrográfica"); correção que
  falha por formato de gráfico e por YAML nas notas; visão "sem JSON".
- Na 2ª tentativa do pedido detalhado, o chat gravou o resultado na recriada da rodada 1 (81 → 130 slides): o Studio
  local tem UMA apresentação aberta para todas as abas e aparelhos; depois do reinício, uma aba aberta na recriada a
  reabriu logo depois de o script abrir o original, e o chat grava em W.file (o aberto naquele instante), não no que
  quem pediu estava vendo. A rodada 1 foi remontada da tarefa salva (os 69 itens prontos; montar é código, sem
  modelo; mesmo resultado: 81 slides, 4 pendentes, 17 a conferir). Correção: a aba manda `expectFile` (o arquivo que
  está vendo) ao salvar, no YAML e no chat; se o Studio está com outro aberto, 409 e "Recarregue" (nada é gravado).
  `test/stale-tab.test.js`.
- Retorno da pessoa sobre a recriada da rodada 1 (10 pontos + "tema sem graça"), causas e correções:
  - tabela numa linha só (o YAML juntou as linhas), fórmula entre \( \) e \[ \], \frac (barra dobrada vira
    quebra de linha no LaTeX): `md` aceita os três;
  - legenda por cima do gráfico no layout `image`: com `fit: contain`, a legenda vai embaixo (foto segue com o cartão);
  - tabela do `add` espremendo o layout e ficando por cima do texto: no máximo 45% da altura (a letra encolhe); o
    ajuste e o fiscal veem a tabela;
  - equação e tabela repetidas como imagem e slides "versão alternativa"/"imagem original": a conferência cobrava
    TODA imagem do plano ("faltou imagens") e a IA repunha; não cobra mais. O que a visão leu numa figura vira dica na
    correção, não pendência (fim das pendências por coordenada de mapa). Regra nova: critério de designer (redesenhar
    quando dá sem perder nada, manter só o insubstituível, nunca as duas);
  - ciclo hidrológico em fluxograma (setas de volta cruzando tudo): infográfico `ciclo` novo (etapas numa elipse,
    setas curvas na cor de cada uma) e a referência manda ciclos para ele;
  - recriar sem tema pedido: visual marcante e diferente do original (cor, paleta viva ligada ao assunto).
- Rodada 02/10 (pedido curto, a11fc5a): 24 min, 81 slides, 3 pendentes; tabelas reais, fórmulas certas, curvas IDF
  redesenhadas pela equação (science). Ainda: tema manual (branco) apesar da regra; ciclo ainda em diagram; gráfico
  em `image` sem `fit: contain` (legenda por cima); exercício novo com série INVENTADA (120, 95, 150…), que não
  existe no original. Correções: regra explícita de ciclo → `shape: ciclo`; exercício novo prefere os
  dados do material quando houver; imagem do original que a visão viu como não-foto sai `fit: contain` por código
  (wholeFigures). Tema: a pessoa corrigiu, "colorido" era a preferência DELA para esta aula, não regra: o recriar
  segue o tema/jeito que o pedido disser e, sem nada, a IA escolhe; o "bonito e colorido" vai no pedido do chat.
  Também não obrigar "dados fictícios" (é comum pedir material completo com dados, exemplos e exercícios gerados).
- Retorno sobre a rodada 02/10 (a11fc5a), causas e correções:
  - capa velha antes da nova e "Componentes do ciclo" com desenhos velhos semi-transparentes: no recriar, pendência
    punha o original ao lado e "juntar" guardava os desenhos do original. Agora juntar vira escrever e pendência
    vira proposta marcada "revisar" (com o que faltou), sem o original;
  - setas do Mermaid em degraus ("raio do Darkseid") e pontas tortas: ligações curvas por padrão (`curve: angulo`
    ou `reta` por slide); rótulo com parênteses sem aspas (quebrava o diagrama da delimitação) ganha aspas;
  - gráfico com o tipo como chave (`{ line: {…} }`) sumia em silêncio: desenha; sem tipo, erro para a IA;
  - dois gráficos num row com 300 px: dividem a largura; `title` do gráfico e `caption` do blocks aparecem;
  - ícone sozinho no split parecia sujeira: grande, num disco; regra para preferir gráfico/esquema do conceito;
  - statement com parágrafo em letra de título: tamanho pelo comprimento; layout novo `definition` (verbete) para
    "o que é X" (termo, origem em partes, definição, ícone);
  - layout image com figura inteira: título no alto e legenda pequena embaixo (não a frase gigante);
  - faixas claras fora da capa na apresentação: slide com moldura até a borda (canvas, mestre) tem fundo escuro fora;
  - erros de digitação ("Méodo", "Refrências"): quem escreve confere a ortografia e a conferência visual aponta.
- Rodada colorida 7381869 (02/10, 48 min): nenhum original voltou ao lado, mas 4 lotes perderam a correção (YAML
  quebrado: `mudou: "Ajute" corrigido…` e texto com ": " que segue na linha de baixo; a correção desistia na 1ª) e 4
  ficaram sem conferência visual (sem JSON duas vezes). Agora: o conserto de YAML pega os dois casos; a correção
  volta com o erro e tenta de novo; a visão sem JSON confere em duas metades. `$2$` (número sozinho) é fórmula;
  `t~c~` e `m^2^` (índice/expoente, a IA usa sozinha) desenham.
- **As rodadas "Flash" de 01-10 e 02-10 escreveram com o Pro**: o `modelrelay serve` não relê o config editado à mão
  (só o salvo pela tela dele) e seguia com `text = deepseek-v4-pro`. Renomeadas para "Pro · rodada…". O Pro (pelo
  OpenRouter) come letras ao escrever, ~0,5% das palavras ("Ajute", "probailidade", 40 na melhorada Pro); o Flash,
  medido na mesma tarefa, nenhuma. A conferência por código (`typosOf`: palavra do original com uma letra a menos no
  meio, ou sem acento) vai como DICA na correção (acha também palavras certas: "estão" de "gestão"). modelrelay 0.2.1:
  o fim do stream diz o modelo resolvido (o relatório mostrava só "text"); falta publicar no PyPI.
- Na mesma rodada: kicker `^^…^^` sumia nos temas com pílula (oceano, sinal…: a ênfase tinha a cor da pílula; a
  "pílula vazia" do ciclo). Cartões da mesma grade encolhiam cada um por si (`fitWide`, palavra comprida num cartão
  estreito) e ficavam de tamanhos diferentes: agora os irmãos ficam com o menor.
  Gráfico de linhas: o eixo arredondava para inteiro (0 a 1 mostrava só "0" e "1"): marcações redondas (`niceTicks`,
  com as casas do passo); linhas que terminam juntas (as curvas hipsométricas em 1) empilhavam os nomes: legenda em
  cima (também com `legend: true`); rótulo numérico do eixo x com vírgula. Rodapé numa linha só (reticências).
- Pedido (02/10): figura de xerox/escaneada não é para virar diagrama nem ficar feia: **redesenhar como ilustração
  com o modelo de imagem**, a partir dela. A visão marca `qualidade: ruim`; o escritor pede `image_prompt` +
  `image_ref` (a figura original como base); o lote gera em `imagens/ia/` ANTES da conferência visual (que compara
  o redesenho com o original); falhou, volta a figura de base. Teste à mão com o mapa de ruas (image8): pedindo
  "contornar por cima, mesma proporção, rótulo letra por letra" sai fiel (erra 2 ou 3 rótulos); sem isso, o modelo
  reenquadra e inventa rótulos. Também: em deck novo, pedido que não fala de imagem → a IA decide onde ilustrar
  (antes nunca gerava). Paralelismo do transform: 8 lotes (até 16).
- Pedidos de 02/10, analisados slide a slide (decks em `Pedidos de teste/`):
  - **brigadeiro "one page tipo Nature"**: a IA usou o `onepage` (de projeto: jornada, problema, solução) e a receita
    saiu "brigadeiro de festa × gourmet", letra miúda, sem ilustração. Layout novo **`poster`**: ilustração principal
    e painéis com letra (a, b, c), desenho, texto curto, números e setas; a referência manda usar este para
    infográfico de uma página. Na versão 2 a IA usou o pôster, mas pôs título/tema/paleta dentro de `deck:` (o jeito
    do patch) e o deck saiu "Nova apresentação" no tema padrão: a geração agora entende o `deck:`. Com ilustração
    principal, no máximo 3 colunas (2 até 4 painéis).
  - **regressão logística para 11 anos**: a versão 1 dizia "olha as pistas, dá uma nota, responde" sem o
    mecanismo. Regra no prompt de geração: ensinar como algo funciona = o mecanismo inteiro, um exemplo de números do
    começo ao fim, a conta de cada passo, uma simulação e uma rodada do ajuste; criança: simplificar as palavras,
    nunca os passos. A versão 2 ensina (pontos por pista, soma, curva em S, 50%, ajuste, calculadora).
  - motor: `:x:` (ícone de uma letra) no diagrama; `{ text: nuvens, vento, umidade }` virava campos vazios;
    unidade `%` quebrava a fórmula do exercício resolvido; passos anteriores miúdos mesmo com espaço (agora só quando
    não cabem); compare com texto curto virava dois cartões vazios do tamanho do slide; eixo do Plotly com vírgula;
    ilustração gerada sem `fit` (era sempre `cover` e cortava a criança da capa); gráficos empilhados no `blocks`
    (rótulo + gráfico vira título; dois ou mais lado a lado); `$1 - P(X \geq x)$` cru (regra do Pandoc para `$`);
    anos no eixo sem ponto de milhar.
  - rodada colorida com o Flash de verdade (1107fd1, 72 slides): nenhum lote falhou, 1 erro de grafia ("LENCOL").
  - rodada com redesenho (ddde26a, 102 slides): só 1 figura redesenhada, porque a visão marcou 1 de 72 como "ruim"
    (achou boa até o mapa de xerox) e a regra só valia para figura específica (o ciclo da água, genérico, virava
    diagrama). Agora a visão diz a `aparencia` (digital, foto, escaneada, pixelada) e ILUSTRAÇÃO escaneada ou
    pixelada, genérica ou específica, volta como ilustração. Ilustração nova sai sem texto (o modelo escrevia
    rótulos em inglês e palavras sem sentido); o redesenho mantém os rótulos.
  - na mesma rodada: correção sem bloco ("nada a corrigir") contava como falha → fica como está; lote cuja
    resposta parava no meio perdia os itens → os que faltaram vão de novo, um por vez. Respostas que não serviram
    ficam em `.sagadeck/transform/falhas/` (as 40 últimas).
- Infográfico: o palco (1680 × 700) cabe na altura que sobra quando há algo no `add` (vazava por baixo do aviso;
  `fitStages`); as caixas de texto dele encolhem só pelo próprio tamanho (`data-fit-self`: a descrição caía para 13 px
  por causa de outro texto); o texto do `aviso` tem `.t` (o ajuste e o fiscal não o viam). Fiscal lê `color(srgb …)`
  (color-mix) de 0 a 1 (dava "baixo contraste" em texto escuro no cinza-claro); rótulos do `solution` com 20 px.
- Fiscal final (01/10): melhorada Flash 0, recriada Flash 0, melhorada Pro 5, recriada Pro 7. O resto é conteúdo
  grande demais (exercício com uma tabela enorme por passo, que nem a 60% cabe: dividir) e letra miúda pedida no
  slide; numa transformação nova o fiscal devolve isso para a IA.
- Testes: `fit-wide.test.js`, `check.test.js`, faixa em `style.test.js`, tabela em `markup-math.test.js`, solution em
  `lessons.test.js`, paralelo e fiscal em `transform.test.js`.

## Relatório do GPT, 1º pacote: identidade persistente e transformação confiável — 30/09/2026

- **Identidade**: todo slide tem `uid` (`src/uid.js`, dado no GET do deck e ao gravar; `data-uid` no HTML). A
  chave do ajuste visual passou a ser pelo CONTEÚDO do objeto (`grupo~impressão`, `~2` para iguais), não pela
  ordem: inserir, reordenar ou apagar outro objeto não passa o ajuste para quem não era. Chave antiga (`grupo-N`)
  continua valendo e é convertida ao abrir (`src/studio/visual-keys.js`: `migrateLegacyKeys`); texto do objeto
  mudou: o ajuste acompanha (`carryVisualEdits`, no POST do deck e no chat). A junção com a IA é por uid, campo a
  campo, e os ajustes por chave (`merge-decks.js`). Teste: `test/identity.test.js`.
- **Transformação** (`src/ai/transform.js`): tarefa persistente em `.sagadeck/transform/tarefa-<modo>.json` (salva a
  cada etapa e bloco; pedir de novo retoma sem replanejar; o melhorar retomado parte de `original/original.yaml`);
  Parar de verdade (signal até o `fetch` do modelo: `AbortSignal.any` no llm.js; botão Parar na bolha do chat;
  `/api/ai/transform/cancel`); a tarefa segue no servidor se o navegador fechar e a página reaberta acompanha
  (`/api/ai/transform/status`); limites de chamadas, tokens e minutos (`SAGADECK_TRANSFORM_CALLS/TOKENS/MINUTES`)
  com resultado parcial (o que não saiu fica como no original); cache das figuras pela foto (sha1 + versão da
  análise; falha não entra); conferência visual de novo depois de cada correção; faltou fato do original mesmo
  depois da correção: o original fica e a proposta vem `review: pendente` (aceitar tira o original do par,
  desfazer tira a proposta); problema de desenho: `revisar`; estados da tarefa concluido / parcial / revisar; mapa
  de cobertura `original/cobertura-<modo>.md/.json` (cada texto, fórmula, tabela, imagem e nota do original e em
  que slide novo foi parar). Recriar retomado atualiza a MESMA apresentação nova.
- **Faixa Design** transbordava abaixo de ~1450 px (as duas galerias exigiam 3 cartões cada): agora encolhem até 1
  cartão; dica "botão direito" saiu do rótulo (já está no tooltip do cartão); aviso das fontes limitado na janela
  estreita. `test/ribbon-fit.test.js`: todas as abas de 1920 a 900 px (1093 = 1366 com zoom de 125%).
- **Instância local única** (`src/studio/instance.js`): porta 3517 no CLI, `npm run dev` e `sagadeck.studio()`;
  `/api/instance` diz app, versão, processo e biblioteca; `sagadeck studio` com um aberto na porta (mesma
  biblioteca e versão) só mostra a URL dele (com `?deck=` se pediu um deck); outra biblioteca ou versão: avisa e
  não sobe outro. Versão e processo no log de início. `test/instance.test.js`.
- **Desfazer / refazer único** (`src/studio/public/history.js`): toda mudança do deck (formulário, tela, YAML,
  assistente de IA, revisão, estilo, proporção, imagem gerada) é um passo com rótulo da origem; botões na barra de
  título, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z e na busca de comandos; dentro de campo de texto vale o do campo; digitação
  no mesmo campo junta num passo (mesmos caminhos no deck, 1,5 s), arrastar e apagar são dois; o editor visual
  deixou de ter um desfazer próprio. `test/undo.test.js` e o passo da IA em `studio-ai.test.js`.
- **Ao vivo (Aula 1, 83 slides)**: o Flash caiu aos 5 min numa chamada: o `fetch` do Node desiste se os cabeçalhos
  não chegam em 300 s. Agora a transformação chama em streaming (e mostra os caracteres chegando), a chamada comum
  refaz em streaming nesse caso, erro passageiro (rede, 5xx, 429) tenta de novo uma vez e um bloco que não sai fica
  registrado sem derrubar a tarefa (parcial; pedir de novo faz só ele).
- **Editor visual sem YAML** (`visual-editor.js`, `inspector.js`, `visual-edits.js`): alinhar (6) e distribuir;
  copiar/colar estilo (Ctrl+Alt+C/V); travar (clique atravessa; `deco` do PowerPoint já vem travado); lista
  **Objetos do slide** no inspetor (seleciona o travado, oculta, trava); guias magnéticas no arrasto (bordas e
  centro do slide e dos objetos; Alt solta); trocar imagem com encaixe e ponto de foco (a chave do objeto não muda);
  clique sem arrastar num dos selecionados fica só com ele. Texto, tabela e desenho importados do PowerPoint
  (`tbx`, `tbx-table`, `drw`) passaram a ser objetos ajustáveis. `test/editor-tools.test.js`.
- **Palco × estudo** (`src/export/estudo.js`): campo `consulta:` do slide (escrito ao lado das anotações) só vai
  no material de estudo; Arquivo › material de estudo (PDF ou HTML), "Ver o que o aluno recebe" na busca de
  comandos, `sagadeck estudo deck.yaml [--html]`; cada slide inteiro (tudo revelado) + o texto de consulta, sem as
  notas do apresentador. A referência pede para a IA pôr o aprofundamento em `consulta` numa palestra.
  `test/estudo.test.js`.
- **Ao vivo, melhorar a Aula 1 pelo chat** (text = Pro × Flash; visão = Flash): Pro 47 min, 78 slides, 13
  pendentes, 1 alerta; Flash 30 min (com queda e retomada), 85 slides, 6 pendentes, 5 alertas (achou a fórmula de
  São Carlos do slide 68 e o Kf que não fecha nas unidades). Os dois: 394 e 402 de 454 trechos do original achados
  como estavam. Defeitos do sagadeck achados e corrigidos: visão cortando o JSON (16 mil tokens, leitura tolerante,
  refaz um a um); "MÁXIMA" virando sigla "XIMA"; palavra comum tomada por nome próprio; caminho de imagem com erro
  de digitação; slide que quebra por formato sem dizer o que o layout espera; **linha do título do mestre cortando o
  título e o texto** (faixa do título: `titleBand` em `src/master.js`, o cabeçalho vai acima do fio e o conteúdo
  começa abaixo, vale para deck já gerado); capa repetindo logo e instituição da moldura e `dossier` (letra miúda)
  numa palestra (regras no prompt; aprofundamento em `consulta`).
- **Arquitetura**: CI também no Windows (matriz ubuntu + windows); o CI estava vermelho desde o #59 (o motor
  empacotado não achava o package.json); desempenho com 10/80/200 slides (`test/perf.test.js`: montar o HTML
  200 slides < 0,1 s aqui; Studio com 200 abre em ~2,5 s e troca de slide em 0,1–0,4 s).
- **Interação didática: prever → rodar → explicar** no `algo` (`predict:` abre com a aposta e as opções,
  `explain:` fecha com o porquê e a resposta; vale para o rastreado); campos no formulário; `lessons.test.js`.
- **Variedade de conteúdo**: cada tipo de slide com o exemplo e com conteúdo longo, em 16:9 e 4:3
  (`test/lengths.test.js`): o longo só pode deixar a letra menor, nada de vazar/cortar/sobrepor novo. Hoje passa
  em todos. Rótulo do grupo do Estilo: "Organização".
- **Tabela de verdade** (`src/table.js`): layout `table` e elemento `table` (head/rows, objetos, csv colado,
  lista de listas); cabeçalho na cor do tema com texto legível pela luminância, números à direita (algarismos de
  mesma largura), zebra, destaque de linha/coluna/célula, total, estilos faixa/zebra/linhas/colunas/cartão, cor
  c1–c5; encolhe para caber. Studio: Novo slide › Tabela, Inserir › Tabela, grade no Formatar que cola do Excel.
  Transformação: a visão transcreve tabela em imagem inteira e a IA reescreve como `table` (recorte de livro vira
  tabela real). `test/table.test.js`.
- **Recriar ao vivo, 1ª rodada**: a internet caiu no meio (DNS do openrouter) e os dois ficaram parciais
  (retomáveis). Achados corrigidos: YAML da IA com ": " sem aspas e LaTeX em aspas duplas (`rac` virava caractere
  de controle em silêncio) → consertado no parse; a IA pediu `table` (não existia); conferência visual "sem JSON"
  tenta de novo e, no recriar, não cobra a moldura do original; fórmula `$…$` no meio do texto (KaTeX) em qualquer
  campo.
- **Do log de conselhos (outro assistente)**, o que fazia sentido: registro de auditoria dos comandos da IA
  (`~/.sagadeck/comandos.log`, com segredo mascarado; recusado/aprovado/liberado, saída e tempo); travas (os 3
  monolitos não crescem: `test/guards.test.js`; todo `visualEdits` do motor está na referência); **Brand Kit**:
  estilo padrão da biblioteca (`.estilos/padrao.json`), deck novo em branco ou com IA sem tema já nasce nele
  (Design › Estilo › Usar em toda apresentação nova). Já estava feito: Plotly/Mermaid só entram no HTML quando o
  deck usa (deck simples ~200 KB). Não feito, com motivo: ESLint/Prettier (reformataria o repositório inteiro,
  com o GPT na mesma pasta), link público na nuvem (precisa de infraestrutura; o uso no banco é offline).
- **Recriar ao vivo, concluído** (retomado 2–3 vezes; a retomada funcionou): Flash 86 slides, 63 min, 6
  pendentes, 5 alertas certos, redesenho mais uniforme (tabelas reais, gráficos dos dados, calculadoras ao vivo de
  Kirpich, Watt e Chow e da IDF de São Carlos); Pro 88 slides, 75 min, 12 pendentes (várias falsas, de títulos em
  caixa alta), mais slides originais mantidos. Correções vindas disso: LaTeX com barras a mais/a menos no YAML,
  `origem` ausente/extra, figura que cortava informação (`cover` → `contain` quando a proporção não bate),
  tabela que encolhia por culpa de outro texto (`data-fit-self`), equações do `science` maiores, regras (fórmula
  em LaTeX sem repetir a imagem; gráfico nunca em `full`), frase em caixa alta não vira sigla, original sem a
  moldura antiga no recriar, resultado no deck certo mesmo trocando de apresentação no meio, painel do token que
  redesenhava sozinho (falhava no CI do Windows), teste do Python em UTF-8 (era a falha "conhecida" do Windows).
- **Biblioteca, tópico "Aula 1 — Manejo de Águas Pluviais"**: original importado + 4 versões (melhorada/recriada
  × Pro/Flash). O melhorar foi refeito com o código atual (a 1ª rodada era de antes das correções).
- Falta: P1 (quebrar `app.js`/`server.js`; só a exportação saiu), comparar as 4 versões ao vivo e relatar; depois
  desfazer unificado, editor visual (trocar/recortar imagem, alinhar e distribuir, guias, travar mestre, camadas,
  paleta de comandos), palco × consulta, variedade, interações didáticas, arquitetura/CI.

## Transformar a apresentação importada (melhorar / recriar) como tarefa agêntica — 30/09/2026

- Pergunta da pessoa: "as apresentações foram geradas 100% pelo sagadeck? o modo agêntico ia visualizar e arrumar
  como você fez?" Resposta: não existiam ainda, e o ciclo ver → comparar → corrigir precisava ser do sagadeck.
- O chat decide (`transform: { mode, pedido }` no PATCH_FORMAT; só para deck importado — senão objeção soft).
  `src/ai/transform.js`: VER (modelo de visão descreve as figuras: genérica × específica, dados legíveis; cache em
  `.sagadeck/transform/`) → PLANEJAR (manter / juntar / escrever / novo; cobertura garantida por código) →
  ESCREVER em blocos de 5 (cada slide com `origem` e `mudou`; imagens só as que existem; todo item precisa sair) →
  CONFERIR (fatos por código: números nas duas leituras 0,385/0.385 e 10.000, siglas, nomes, imagens específicas;
  desenho por visão: slide novo ao lado da foto do original) com uma rodada de correção → MONTAR (melhorar: estilo
  extraído no mestre, `review` em cada mudança, `original/original.yaml`; recriar: deck novo no tópico, imagens
  copiadas; item que não saiu entra como o original era).
- `src/import/merge.js`: juntar slides progressivos num que se monta por cliques (step/exit), sem IA.
- Modelos: papel `vision` no llm.js (chamada com imagem para o modelo de visão quando o de texto não enxerga).
  modelrelay do sagadeck: text = deepseek/deepseek-v4-pro (escreve), vision = deepseek/deepseek-v4.1-flash (vê).
- O chat mostra o prompt dos slides importados resumido (`promptSpec`): o deck inteiro passaria de 300 mil tokens.
- Teste: `test/transform.test.js` (LLM falso roteado por etapa). Próximo: rodar os dois testes da Aula 1 de verdade,
  com Pro e com Flash no texto, e comparar.

## Estilo da pessoa (mestre) e revisão das mudanças — 30/09/2026

- `master:` no deck (src/master.js): moldura em todo slide (`elements`, `cover` para capa/seção/fim), área do conteúdo,
  cara do título; `field: slidenum` numera. Slide `canvas` e `master: false` ficam sem.
- `styleFromImport`: a moldura é o que se repete na mesma posição (mesmo copiado slide a slide — a Aula 1 faz assim);
  aulas misturam fontes, então vale o que aparece em ≥20% dos slides; título/corpo pelos placeholders ou, sem eles, a
  maior fonte no terço de cima; tema com as cores e fontes do original. Importação passou a deduplicar mídias.
- Biblioteca: `.estilos/<id>/estilo.yaml` + imagens (`saveStyle`, `listStyles`, `applyStyleTo` copia para
  `imagens/estilo/<id>/`). Studio: Design › Estilo (aplicar / salvar o desta / tirar).
- `review: { status: novo|alterado, note, original }`: selo na miniatura, faixa com Ver original (a foto de
  `original/slide-NN.png`), Aceitar e Desfazer (volta de `original/original.yaml`), Revisar › Mudanças com a lista.
- Teste: `test/style.test.js`.

## Importar PowerPoint fielmente (fase 1 do plano de importação) — 30/09/2026

- Casos reais (locais, fora do repositório): `Aula 1 - Conceitos Básico - 2026.pptx` (83 slides, 16:9, hidrologia,
  ciclo desenhado com ~90 formas, texturas, tabelas, OLE, OMML) e `Intro01.pptx` (23 slides, 4:3, 4 mestres).
  Comparados lado a lado com a foto do PowerPoint: praticamente iguais.
- `src/import/pptx.js` (leitor puro): herança slide > layout > mestre > txStyles > defaultTextStyle, tema por mestre,
  cores com lumMod/tint/alpha, auto-ajuste (fontScale), marcadores (Wingdings/Symbol desenhados, inclusive dentro do
  texto na faixa F0xx), formas prontas + desenho livre em SVG, texturas (blipFill em padrão) e hachuras, grupos
  achatados, imagens com recorte e contorno, tabelas com estilo do arquivo ou embutido (Light/Medium Style), callouts,
  gráficos simples, OLE (prévia), OMML → LaTeX (`src/import/omml.js`), anotações.
- `src/import/index.js`: grava mídias (WMF/EMF → PNG pelo Windows, `office.js`), cópia em `original/`, fotos do
  original (PowerPoint numa cópia só leitura; ou LibreOffice → PDF → pdf.js, `pdf-render.js`) e recorta da foto o
  que não sai igual (`crop.js`). `outlineOf` dá o roteiro para a IA.
- Entradas: `sagadeck importar arquivo.pptx`, Biblioteca › Importar apresentação (.pptx), `library.importOffice`.
- Elementos novos no motor: `textbox`, `table` (importada), `drawing`, `image.crop/flipH`.
- Teste: `test/import.test.js`. Próximo: estilo do usuário (mestre), marcas de mudança e os dois desafios da aula.

## Arquivos do projeto como no VS Code: código com realce, CSV como o Excel, PDF e DOCX — 30/09/2026

- Pedido: ver e editar .txt/.md/.json/.yaml com realce; ver PDF; ler .docx (editar só formato nativo, sem pesar);
  CSV igual ao Excel, descobrindo vírgula, ponto e vírgula ou tab.
- `src/csv.js`: separador descoberto pela consistência das colunas (e a linha `sep=` do Excel), aspas com
  separador/quebra de linha, BOM e fim de linha preservados ao gravar. O motor (`parseTable`) usa o mesmo leitor.
- `src/studio/public/viewers.js`: editor com números de linha, Tab/Shift+Tab e realce (json, yaml, md, js/ts, py,
  css, html/xml/svg, sql, sh, ini, csv com cada coluna de uma cor); grade tipo Excel (letras/números, editar
  digitando, Enter/Tab/setas, colar bloco do Excel, Ctrl+Z/Y, menu de linhas/colunas) que grava em
  `/api/project/sheet-write` no formato original; PDF pelo pdf.js servido em `/vendor/` (sem ele, o leitor do
  navegador); DOCX convertido pelo servidor (`src/docx.js`: títulos, listas, negrito, links, tabelas, imagens).
- Teste: `test/viewers.test.js`.

## Algoritmo rastreado genérico: qualquer código, como num depurador — 30/09/2026

- Pedido: além dos clássicos, mostrar um algoritmo qualquer (o que o professor inventou, árvore, grafo) com o
  "inspect" das variáveis. Decisão: um núcleo genérico (execução rastreada) + catálogo por área crescendo em cima.
- `src/pytrace.js`: Python simples interpretado em JS, sem eval (def/recursão, class, if/while/for, listas,
  tuplas, dict, set, fatias, compreensões, lambda, f-string, deque, heapq, math). Grava cada passo: linha, variáveis
  de cada chamada, leituras/escritas por índice e atributo, comparações igual/diferente, print, expressões
  observadas (`watch`). Comentário no fim da linha vira legenda (`{expr}` troca pelo valor); sem ele, a frase sai
  com os valores (`v[j] > v[j + 1] → 5 > 3: sim.`), sem recalcular nada com efeito colateral.
- `src/trace-view.js`: desenho pelo tipo (barras, casas com ponteiros aprendidos, padrão alinhado sob o texto,
  grade, tabela, grafo em camadas com visitados/fila/aresta da vez, árvore e lista ligada), código com a linha e
  painel de variáveis por chamada (o que mudou acende). `view:` escolhe quando precisar.
- `src/algo-catalog.js`: naive, kmp, quicksearch (texto), bfs, dijkstra (grafos), bst (árvore). Algoritmo novo no
  catálogo = mais um programa + a chamada com os dados do slide.
- Studio: o formulário do `algo` ganhou o catálogo e "Meu código (Python)" (programa + chamada).
- Teste: `test/trace.test.js` (interpretador, erros com linha, rastro, catálogo contra a busca ingênua em 40
  textos, desenho de cada tipo, apresentação com Tocar, Studio gravando o programa).

## Proporção do slide: 16:9, 4:3, retrato e qualquer L:A — 30/09/2026

- `deck.aspect` (src/aspect.js): largura lógica fixa em 1920 e a altura acompanha (4:3 → 1440; 9:16 → 3413).
  CSS usa `--sh`/`--aspect` (no `<html>` da apresentação e no Studio); runtime, desenho, fotos, PDF (página do
  tamanho do slide) e PPTX (layout próprio, 13,333 pol de largura) leem o tamanho do deck.
- Trocar a proporção (Propriedades › Apresentação, com "Personalizada…") passa por `convertAspect`: o layout `canvas`
  (y, h) e os deslocamentos do Studio (`visualEdits.dy`) são reescalados; o resto se ajusta sozinho.
- Retrato (`data-orient="portrait"`): o que era lado a lado vira pilha; grades com poucos itens ampliadas.
- Próximo: etapa 1 do plano de importar PPTX/PDF (leitura fiel + foto pelo PowerPoint / leitor de PDF do Windows).

## Aula: exercício resolvido, calculadora ao vivo, algoritmo animado; demos de hidráulica e algoritmos — 30/09/2026

- Exercício da pessoa: professor de hidráulica (Navier–Stokes, laminar → turbulento) e de computação (ordenação e
  busca). O que já dava: equações, curvas com controles, comparação, código guiado, gráfico de complexidade. O que
  frustraria: resolver o exercício passo a passo, uma calculadora para a turma mexer e ver o algoritmo rodando.
- `solution` (src/lessons.js): enunciado + dados + "pede-se"; um passo da conta por clique (os anteriores compactos,
  a lista ancorada embaixo); resposta em destaque. Dado numérico vira LaTeX com vírgula decimal, milhar e 10 elevado.
- `calc` (src/lessons.js + src/runtime/calc.js, a mesma conta no motor e na apresentação): entradas com controle,
  saídas por fórmula (nomes longos como `nu`, `eps` valem), `cases` por faixa (texto, cor e fórmula por faixa) e
  régua (`scale`, log). Bug de caminho: rótulos da régua eram `.t` e se encostavam; o ajuste encolhia o slide a 61%.
- `algo` (src/algo-trace.js): o motor roda bubble/insertion/selection/merge/quick e busca linear/binária e grava os
  passos (comparar, trocar, escrever, pivô, faixa, achou) + pseudocódigo com a linha da vez + contadores. Botão
  Tocar genérico no runtime (`[data-autoplay]`).
- Fórmulas: `plot.xlog`/`ylog` (amostragem e eixos log; diagrama de Moody). Os títulos de eixo do deck não apagam
  mais o tipo/faixa do eixo.
- Limite de palavras próprio: solution 140, calc 90, algo 60. Galeria: "Aula: exercícios e algoritmos".
- Demos "Aula de hidráulica" e "Aula de algoritmos"; cada demo da vitrine com tema, tom e figura de capa próprios
  (antes todas iguais). Barra da esquerda abre sempre nos slides.
- Teste ao vivo: pedindo as duas aulas ao modelo, ele usou `solution`, `calc` e `algo` sozinho.

## Painel, menus de botão direito, "Deixar assim" que dura, dois usos do material — 30/09/2026

- "Deixar assim" grava `fiscalOk` (impressão digital do conteúdo do slide) no deck: sem aviso, contador nem
  marcação até o slide mudar, inclusive depois de recarregar.
- `purpose` passa a ter dois usos na tela e na IA: `palestra` (para apresentar: letra grande, pouco texto) e
  `consulta` (para estudar depois: conteúdo denso). aula/workshop/executiva de decks antigos continuam valendo.
- Painel direito abre no chat; fora dele, um atalho flutuante (direita, no meio) volta, com um ponto quando a IA
  respondeu. `paneOnLoad` só existe para os testes antigos (que esperam o Formatar).
- Bug: trocar de slide com um objeto selecionado deixava o painel preso em Propriedades (sem os campos do carrossel,
  do screenshot etc.). Seleção vazia por qualquer motivo volta ao Formatar; duplo clique fora do texto abre o
  conteúdo; Propriedades tem "Editar o conteúdo do slide".
- Botão direito: no slide (conteúdo, IA, layout, arrumar, novo, duplicar, apresentar, excluir), no objeto
  (propriedades, frente/trás, excluir) e na miniatura (mover, duplicar…). Escuta no documento pelo ponto do clique
  (a pílula de texto flutua por cima e o editor redesenha ao apertar).
- Árvore no estilo VS Code: renomear e criar no próprio item (sem prompt), ações ao passar o mouse, setas/Enter/
  F2/Delete, apagar sem pergunta (lixeira do projeto + Desfazer), menu com copiar caminho e enviar para cá.
- Carrossel em roda com fotos maiores (300 px; a ativa 1,8×); a IA pode gerar as fotos (`image_prompt` por item).
- Bug achado nos testes: o observador do selo do chat mexia na própria classe e travava a página em laço.

## Projeto no estilo VS Code, planilhas estilo JMP, esvaziar lixeira, demo de novidades — 30/09/2026

- Projeto = a pasta do deck (`src/studio/project.js`): `<nome>.yaml`, `imagens/`, `contexto/` (anexos, prints,
  planilhas, `.md`) e `.sagadeck/` (conversa.json, cache/, lixeira/). `.sagadeck` e o `.yaml` são protegidos
  (não se apagam nem renomeiam pelo Studio); caminho fora da pasta é recusado; apagar vai para
  `.sagadeck/lixeira` com Desfazer. Deck solto numa pasta com outros decks não vira projeto. A conversa passou de
  `<deck>.conversa.json` para `.sagadeck/conversa.json` (migra sozinha). O pacote `.sagadeck` continua levando só o
  que o deck usa.
- Studio: barra da esquerda alterna Slides | Arquivos (árvore com criar, renomear F2, apagar Delete, enviar,
  arrastar para mover/enviar). Abas no centro: Apresentação fixa; o `.yaml` abre com o slide ao lado e atualiza
  enquanto digita; `.md` com prévia; imagem com "Usar num slide". Ctrl+V de print: na aba Arquivos só guarda em
  `contexto/`; nos Slides abre o editor de screenshot e também guarda. Anexo do chat também vai para `contexto/`.
  O texto de `contexto/` (md, csv, xlsx, pdf, docx…) vai para a IA como material (cache em `.sagadeck/cache`).
- Planilha (CSV/TSV/XLSX, várias abas, sem biblioteca: o xlsx é lido como zip): grade com o tipo de cada coluna
  (tempo, número, porcentagem, categoria, texto) e sugestões com prévia (linha no tempo, barras ordenadas, rosca
  de partes, colunas agrupadas, dispersão). "Sugerir com IA": o modelo recebe só o resumo das colunas, corrige tipos
  e escolhe gráficos, títulos e eixos. "Inserir no slide" grava `from:`; "Atualizar da planilha" relê o arquivo.
  Gráficos ganharam `xLabel`/`yLabel`; números de planilha entendem `40%` e `R$ 1.234,5`.
- Biblioteca: "Esvaziar lixeira" (com confirmação). Vitrine: "Novidades" (`model-novidades`), um slide de cada
  recurso novo; a cópia traz `contexto/vendas.csv` e `contexto/leia-me.md`.

## Zoom lento no foco e animações menos secas — 30/09/2026

- Spotlight: `zoom: true` (slide) ou `zoom: N` / `false` (foco). Camada `.spotlight-zoom` com imagem + regiões; o
  runtime (`zoomSpotlight`) centraliza o foco sem mostrar fundo vazio, 1,8 s com aceleração suave; a borda do
  destaque não engorda. PDF/export e "sem animação" ficam na imagem inteira.
- Modo padrão (subtle) era só fade de 0,38 s e passos de 0,25 s sem movimento ("seco"). Agora: entrada sobe 14 px
  com o desfoque sumindo (0,85 s, escalonado), cliques com o mesmo movimento, troca de slide com fade de 0,6 s e
  assentamento de escala, painéis de etapa suaves. Export sem transformações.

## Carrossel em semicírculo e em anéis — 30/09/2026

- `carousel` (`src/carousel.js`): um item por clique com foto e texto. `arc`: roda com o centro fora do slide gira até
  o item (que cresce); o texto sai pela esquerda e o novo entra da esquerda, sobrepondo. `rings`: a foto em anel
  externo (anti-horário) e disco interno (horário) que travam formando a foto; o texto sobe junto.
- Runtime: `renderLesson` põe `--lesson-i` no slide e `active`/`past` em `[data-lesson-k]` (genérico).
- Sem foto: paisagens desenhadas em SVG (offline). Foto da pessoa: `image:` ou Escolher foto no Formatar.

## Dinâmicas a dois: duelo de commits, dois terminais, turnos — 30/09/2026

- Pedido da pessoa (brainstorm de dinâmicas para aula de Git; a ideia 2, QR ao vivo, ficou de fora).
- `src/dynamics/git-sim.js`: simulador (duas pessoas + origin/main + um arquivo). O slide só diz o que cada um faz;
  ele calcula push recusado, fast-forward, merge automático, conflito (merge a três por linha, com marcadores),
  commit de dois pais, `git log --graph` e o grafo em SVG. Linhas mudadas no turno por LCS.
- `duel`, `terminals`, `turns` (`src/dynamics/layouts.js`): um quadro por clique (data-lesson). Aposta
  (`bet:`) vira enquete antes do primeiro pull que decide; o quadro seguinte carimba "Deu conflito!". Terminal digita
  o comando. Galeria: categoria "Dinâmicas a dois". Formulário com "Linhas que muda" (2: texto).

## Criar com IA = o mesmo caminho do chat — 30/09/2026

- "Criar com IA" / "Deck com IA" saíam bem piores que pedir a mesma coisa no chat (teste da pessoa: "apresentação
  bem humorada de como fritar um ovo como um chef"). A geração tinha caminho próprio: direção criativa sorteada,
  regras rígidas de ritmo, temperatura 0,7, rodadas de enxugamento e de variedade, `autofixDeck` por cima.
- Agora `generateDeck` chama `editDeck` sobre um deck em branco (as mesmas regras, a mesma temperatura, uma chamada).
  Ficam: pergunta de propósito (Preferências), autor, idioma, data, imagens (geradas depois), estilo escolhido e
  materiais. Se a IA preferir perguntar, a pergunta volta com as opções.
- Bug achado no teste ao vivo (vale para o chat também): `{ text: Manteiga, mas sem fumaça }` partia o texto na
  vírgula; chave com espaço e valor vazio volta a ser o fim do texto anterior (`rejoinFlowCommas`).

## Gráficos de verdade: fórmula livre, planilha que cola do Excel, CSV — 30/09/2026

- A pessoa reclamou (com razão) que o brainstorm dos gráficos ficou no papel e que o slide científico só plotava duas
  curvas prontas; e que até elas sumiam (a galeria e as miniaturas não montam o Plotly: o quadro ficava vazio).
- **Fórmulas e funções** (`science`, novo nome): `plot.functions` com a fórmula em texto (`a*sin(b*x)`, `x² - 2x + 1`,
  `h0 - g*x^2/2`). Compilador próprio em `src/runtime/formula.js` (sem eval; tabelas sem protótipo; roda na
  apresentação e no Node). Letra que não é x vira **controle deslizante** que redesenha a curva ao vivo
  (`plot.params` dá valor, limites e nome). `plot.points` (colado do Excel, CSV em texto ou arquivo ao lado do deck),
  `plot.surface` (z = f(x, y)). O slide traz uma **prévia desenhada** em SVG (miniatura, galeria, PDF); o Plotly
  entra por cima. Fórmula com erro: o gráfico diz o erro e o fiscal recebe o aviso. `preset` antigo vira fórmula.
- **Gráfico de dados** (`chart`, novo nome): planilha no Formatar (Rótulo + uma coluna por série); Ctrl+V do Excel em
  qualquer célula preenche a partir dela, primeira linha com texto vira nome de série; número brasileiro (1.234,5);
  Importar CSV. Várias séries em barras/colunas = **agrupadas** com legenda (nativo no PPTX). `csv: dados/x.csv`
  lê o arquivo ao lado do deck.
- Falta do brainstorm: gráfico sugerido pela IA a partir de tabela colada no chat (hoje o chat já monta `chart`, mas
  sem sugestão de tipo com prévia).

## Miniaturas inteiras, Arrumar layout único, abas do painel — 29/09/2026

- Miniaturas do trilho cortavam o slide: a escala era fixa (0,09 = 173 px) num quadro de 156 px. Agora um
  `ResizeObserver` põe `--thumb-scale` pela largura do quadro.
- Revisar: "Corrigir layout" e "Arrumar" eram o mesmo `triggerAutofix` (o Arrumar só somava uma animação e um aviso
  que prometia alinhar). Ficou um botão, **Arrumar layout**, que diz o que fez, tem Desfazer e avisa quando não há
  nada a arrumar.
- Abas do painel lateral: a aberta mostra o nome, as outras só o ícone (as quatro cabem). Avançado é a última aba da
  faixa; os grupos de especialista do Início vêm logo depois dos outros (não vão mais para a outra ponta).
- Variáveis: grade ocupando a aba, sem texto de manual, coluna **Tipo** (Normal/Segredo) que move a variável entre
  `vars:` e `secrets:`.

## Fase 3 do SagaStudio: inspetor de propriedades — 29/09/2026

- `src/studio/public/inspector.js` (aba **Propriedades**): grade compacta com categorias recolhíveis (lembradas no
  navegador). Objeto: só o que faz sentido (texto, forma desenhada ou reta, imagem); vários selecionados mostram o
  valor comum ou "vários" e a edição vale para todos. Slide e Apresentação sempre (layout, tom, textura, densidade,
  tempo, transição, limite de palavras, rodapé, tema/paleta só do slide, fundo; purpose, tema, paleta, destaque,
  animações, duração, autor, data, `fit`). Cada linha alterada tem "voltar ao padrão". Selecionar um objeto com o
  painel em Formatar leva para Propriedades (como no Figma).
- Motor (`src/visual-edits.js`): novas chaves de `visualEdits` (peso, itálico, alinhamento, entrelinha, espaçamento,
  maiúsculas, rotação, opacidade, sombra, cantos, contorno, `step`, `anim`), só valores de lista ou números. Formas
  desenhadas leem `--shape-fill/--shape-stroke/--shape-sw`.
- Editor visual: `SagaVisual.selection/edits/setProp/clearEdits/onSelect/select` para o inspetor (com Desfazer).
- Bug: painel de avisos do fiscal e menu dos temas usavam `var(--panel, #fff)` (variável inexistente): fundo branco
  com texto claro no tema escuro. Agora `var(--chrome)`; teste de contraste no tema escuro.

## Fase 2 do SagaStudio: a IA sabe para que serve o material — 29/09/2026

- Causa do "material de consulta que saiu palestra": o prompt de geração era só de palestra ("pouco texto, detalhe
  em notes, interação, slides de impacto"), a rodada de enxugar cortava para 75% de 40 palavras, a de variedade
  trocava explicação por slide de impacto e a auto-correção movia o corpo para as notas acima do limite.
- `purpose` no deck (`src/purpose.js`): consulta 220 palavras, aula 160, workshop 110, palestra/executiva 40; motor,
  auto-correção, IA e Studio usam `wordLimit`. Consulta/aula: explicação no slide, sem quiz/seção vazia/número de
  impacto, sem a rodada de variedade; notes curtas.
- Decisão pelo modelo (regra do projeto): com Preferências › perguntar ligado, `decidePurpose` faz uma chamada curta
  (JSON) antes de gerar; no pedido longo o modelo tendia a supor. Ambíguo (workshop sem dizer se fica com o pessoal):
  devolve pergunta com opções; biblioteca e "Deck com IA" mostram e geram de novo com a resposta. Quantidade de texto
  dita com todas as letras vence o tipo (grava `maxWords`) e não pergunta. Testes ao vivo em `ai-live.test.js`.
- Contra invenção: nada de número/data/nome sem fonte; `date` = dia da criação; `author` das Preferências.
- Temas `manual` (claro) e `manual-noite` (escuro), com `pair`: Design › Versão clara/escura; PDF no claro
  (Preferências › Exportação, `lightVariant`). Estilo "Documentação técnica" no Criar com IA. `gitGraph` na referência.
- IA › **Material de consulta**: pede ao assistente para reescrever o deck como material para distribuir.

## Fase 1 do SagaStudio: código nunca cortado, fiscal, Preferências — 29/09/2026

- Achado do exercício (material de Git): o slide `code` usa o editor do codewalk, que tinha `overflow:auto` sem barra
  à vista, e o PDF não rola: 18 de 28 linhas sumiam. Agora `fitCode` (`src/runtime/fit.js`) quebra linha longa,
  encolhe até `fit.minCodePt` (pt; `data-min-code` no slide, em px) e, se nem assim couber, rola e marca
  `data-code-cut`. O fiscal do Studio acusa ("Código não coube") e oferece **Dividir em dois slides** (destaques de
  linha acompanham). A 10 pt cabem ~16 linhas num slide de código.
- Vazamento: cartões, itens da grade adaptável e código passam a contar em `leakingIn` e no fiscal (o slide de grade
  invadia o rodapé sem aviso).
- Preferências (`src/preferences.js`, `~/.sagadeck/preferencias.json` ou `SAGADECK_PREFERENCIAS`; `/api/preferences`):
  tela com busca, seções e gravação automática. Texto e código (mínimos em pt, quebrar linha) valem para o motor via
  `setFitDefaults`; o deck (`fit:`) vence. Editor (tema da interface, guias, marcas do fiscal) neste navegador.
- Próximas fases: IA decide o tipo de material (e pergunta), temas técnicos claro/escuro, Object Inspector.

## Marca, faixa sem "Mais opções", fonte que encolhia, grade de variáveis — 29/09/2026

- Marca: "CREATIVE STUDIO" e um logotipo com significado (um deck, dois slides, com o "apresentar" no da frente) na
  biblioteca e no editor (antes: um "Z" e o ícone de camadas).
- Faixa: sem o botão "Mais opções" (modo simples saiu); tudo à vista, e os grupos `[data-adv]` ficam à direita da aba.
- Bug: tamanho escolhido num texto com ajuste para caber (`data-fit`, ex.: o "01" das coleções) era encolhido pelo
  `fit.js` e o campo mostrava o valor encolhido. Agora `visualEdits.size` marca `data-vsize` e o ajuste pula.
- Bug: seletor com o padrão igual a uma opção ("Síncrono") aparecia duplicado; a opção passa a ser o padrão.
- Variáveis: grade no estilo Object Inspector (linha de 22 px, letra 12 px, célula = campo; grava ao sair/Enter, Esc
  desfaz, última linha cria, lixeira na linha). Editar um ambiente de exemplo (ENSAIO) cria a cópia dele no arquivo
  (`adopt` em `src/api-client.js`), em vez de recusar.

## Objetos: cor, preenchimento, "Enviar para trás"; vitrine clara; Criar com IA unificado — 29/09/2026

- Bug: "Atrás" mandava a forma para `z-index` negativo, atrás do fundo do slide (sumia e não dava para excluir). Agora
  `.safe`/`.free` isolam o empilhamento (`isolation:isolate`) e o clique pega o objeto mais de cima naquele ponto
  atravessando as caixas transparentes do layout (`objectAt` com `elementsFromPoint`); Tab/Shift+Tab passam de objeto.
- Bug: a cor só mexia no texto; formas ganharam **Preenchimento** (`visualEdits.fill`: `--shape-fill` nos desenhos SVG,
  fundo nas formas retas). A barra do objeto flutua junto da seleção, em qualquer aba, com rótulos e ícones; a cor
  muda ao vivo e grava ao soltar.
- Vitrine Modelo pronto: capa desenhada de verdade (`/api/library/gallery-cover`, cache em `.cache/vitrine`), dois
  grupos pelo uso ("Visuais para começar", "Recursos do SagaDeck"), sem nome repetido (o estilo "Essencial" virou
  "Uma ideia por vez"). Estilos e exemplos também abrem em prévia (`galleryEntry` no servidor, chave `exp-*`/`example-*`).
- Nova: "Descrever com IA" e "A partir de um arquivo ou link" viraram **Criar com IA**; o modal abre primeiro (sem
  abrir o seletor de arquivo) e aceita arrastar arquivos.

## Modelos abrem em prévia (cópia só na primeira mudança) e limpeza da biblioteca — 29/09/2026

- Decisão: modelo/demo de fábrica é **vitrine**, não arquivo. `Modelo pronto` abre `editor?model=<tipo>&topic=…`
  (`/api/library/decks/model-preview`): o deck vive só na memória do Studio (`W.preview`, `W.file = null`), com as
  imagens lidas de `src/studio/assets/imagens/` (movidas para lá). A primeira mudança que chega em `/api/deck` (ou
  `/api/library/decks/model-use`, botão **Usar como base**, ou a IA indo gravar imagens) cria a cópia no tópico de
  origem (padrão `Modelos`) com as imagens; a URL vira `?deck=<id>`. Abrir, navegar e apresentar não gravam nada.
- "Abrir demos completos" (Avançado) abre `biblioteca?galeria=demo`, a vitrine filtrada nas demonstrações.
- Limpeza: as cópias sem edição (iguais ao modelo de fábrica) foram para a Lixeira; as editadas ficaram.
- Testes: `studio.test.js` (prévia sem arquivo e com imagem; primeira edição cria a cópia com a imagem; o modelo
  continua igual; Usar como base; coleções via prévia; demo avançado e `?galeria=demo`).

## Seleção de objetos, IA local, Novo slide único e Animações — 29/09/2026

- Seleção como no Google Slides/Canva (`visual-editor.js`): um clique em qualquer ponto do objeto seleciona (texto
  também); clicar de novo no texto selecionado ou duplo clique escreve; retângulo numa área vazia seleciona vários
  (o de fora ganha do de dentro); Shift+clique soma; arrastar, setas, Delete e a barra valem para todos. Bug que
  motivou: caixa de texto livre movida não se deixava selecionar (o clique virava escrita). O retângulo converte a
  escala do palco (zoom).
- IA: o `sagadeck studio` em Node sobe o `modelrelay serve` junto (`src/ai/relay.js`), como o sagadeck do pip; nada
  sobe com `SAGADECK_LLM_URL`, `SAGADECK_NO_RELAY=1`, `--multiuser` ou alguém já na 8765. Nesta máquina o modelrelay
  não estava instalado: instalado editável do clone (0.2.0). Teste: `relay-autostart.test.js` (spawn falso).
- "Novo slide" só no Início, botão dividido (em cima: em branco; embaixo: galeria de tipos); saiu do Inserir.
- Essencial/Equilibrado/Palco saiu do topo: menu **Apresentar ▾ › Animações** (Sem animação, Suaves, Expressivas).

## Novo slide × Layout × Inserir, formas, faixas do Design — 29/09/2026

- Decisão: **uma galeria só para criar slide** (a antiga "Modelos", agora "Escolher tipo" no Início e "Novo slide" no
  Inserir), com os 44 tipos em 9 categorias (`SLIDE_GROUPS` em `app.js`) e busca sem acento; Enter insere o primeiro.
  **Layout** troca o formato do slide atual e usa as mesmas categorias. **Inserir** ficou só com o que entra no slide
  atual (Texto, Formas, Imagem, Ícone, Diagrama de texto); os botões de tipo de slide e os atalhos do Avançado saíram.
- Formas: menu com 12 desenhos. O motor ganhou triângulo, losango, hexágono, estrela, seta, chevron e balão
  (SVG com preenchimento e contorno, `bg` vira o preenchimento). "Desfazer objeto" saiu: Delete exclui, Ctrl+Z desfaz.
- Design: faixas de tema e paleta só com cartões inteiros e sem barra de rolagem; setas passam de página e "Ver
  todos" abre a mesma galeria em grade (mesmos cartões: prévia no hover, clique, botão direito). A 1366 px cabem 3.
- Botão de tema claro/escuro do editor foi para o canto direito do topo, como na biblioteca.
- Testes: `engine.test.js` (formas), `studio.test.js` (galeria, busca, categorias, Status semanal pela galeria, menu
  de formas + Delete, faixas do Design, posição do botão de tema); helper `novoSlide(p, tipo)` em `helpers.js`.

## Variáveis em tabela, ambientes protegidos e ajustes do editor — 29/09/2026

- Aba **Variáveis**: tabela Nome / Valor do ambiente atual, editável na linha (nome sem `{{}}`); arrastar o nome
  para um campo do slide escreve `{{nome}}`. Sem botão Inserir. Segredos só pelo nome; valor com cara de token é mascarado.
- **Ambientes** (slides de API): modal maior; o YAML é validado a cada digitação (`POST /api/http/ambientes/validar`,
  mesma regra do salvar, inclusive `secrets` e `current`); **Salvar** só habilita com YAML válido e a versão anterior
  fica em `ambientes.yaml.bak` (0600).
- Texto / Forma / Imagem foram para **Inserir → Objetos livres**, sem o botão "Selecionar objetos" nem instrução
  escrita: clicar num objeto do slide já seleciona. Miniaturas do "Diagrama de texto" com o dobro do tamanho.
  Botão Apresentar e o menu dele com 40 px de altura. Elemento `{ image: "" }` não quebra mais o render.
- Prévia de tema no hover: a da main (`previewLook`, tema e paleta) ficou; a versão paralela da Frente D saiu
  (a main já testa em `studio-themes.test.js`).
- Achados no merge, com teste: (1) escolher um ambiente gravava `current:` no arquivo mas a caixa de texto ficava
  com o antigo, e o Salvar seguinte desfazia a escolha; agora o texto acompanha (com edição pendente, só a linha
  `current:` muda). (2) A caixa do aviso "texto pequeno" bloqueava o clique para editar o texto (agora deixa passar).
  (3) Clique simples no texto voltou a escrever (barra de formatação); apertar e arrastar move o objeto; clique em
  forma/imagem seleciona. Sair com Escape religa a edição dos textos.

## Guia Avançado e demonstrações visíveis — 28/09/2026

- A aba **Avançado** do editor reúne o seletor de densidade do slide, inserção de página de consulta e atalhos
  para grade adaptável, diagrama vivo e tipografia cinética. A seleção compacta o slide atual sem remover texto.
- A galeria **Exemplos do SagaDeck** também inclui página de consulta, grade adaptável, cápsulas e tipografia
  cinética; são cenas inseridas no deck em edição, não apresentações completas.
- Biblioteca: **Abrir demos completos** leva ao tópico `Demos e modelos`; incluído `Recursos avançados` em **Modelo pronto**
  para mostrar texto denso, blocos de código, aviso, grade, diagrama e sequência cinética no deck inteiro.
- Testes verificam seleção/persistência de densidade, inserção de página de consulta e renderização do demo.

## Aviso de modelrelay velho sabe da instalação editável — 28/09/2026

- Pergunta do Naruminho: no laptop o modelrelay roda do clone; precisa `pip install -U`? Não: com `pip install -e`
  o `git pull` basta (o sagadeck lê `modelrelay.__version__` do próprio código). O aviso mandava `pip install -U`
  para todo mundo; agora `relay_clone()` (`python/sagadeck/llm.py`) vê se o pacote vem de uma pasta com `.git` e
  `pyproject.toml` (fora de site-packages) e manda `git pull` naquela pasta. Teste em `python-relay.test.js`
  (clone falso com `.git`; `.venv` dentro de repositório não conta como clone). README explica.

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
3. One-page, status semanal, governança navegável (abaixo): FEITOS.

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

### 2. One-page: FEITO

- Layout `onepage`: jornada (etapas com ícone e mini-frase), o problema (texto, números grandes, tópicos), a solução
  e o painel (`dashboard: {numbers, figures}`): números grandes em cima; gráficos (os mesmos de `chart`, com `title`)
  e mapa por UF embaixo. Só aparece o que foi preenchido (bloco `{}` vazio some); sem painel, letra maior e conteúdo
  no meio; problema/solução + painel lado a lado; só o painel = dashboard de página inteira. Gráficos desenhados na
  proporção do quadro (1,5x e reduzidos, a letra acompanha). Limite de palavras próprio: 120 (status: 90).
- Elemento novo `ufmap` (`src/figures/ufmap.js`): mapa do Brasil em grade (cartograma, sem geodados de fora), cor
  pela escala do `--em` do tema, UF sem valor apagada, `highlight`, legenda; em quadro estreito só as siglas. No
  mapa do one-page ganha coluna própria da altura do painel. Serve em qualquer lugar (`figure`, `side`…).
- Studio: galeria (One-page), formulário (jornada, O problema/A solução com números e tópicos, Painel com números
  grandes e "Gráficos e mapa" como elementos); elemento "Mapa por UF" no seletor de elementos. `f.obj` com
  `stringAs` converte o atalho em texto (`problem: "…"`) em `{text}` sem perder o conteúdo.
- Testes: `onepage.test.js` (motor, mapa, e no navegador cheio/só painel/simples sem nada fora, vazando do quadro
  ou encavalado em sinal, editorial e noite; gráfico não espremido), `studio.test.js` (criar pela galeria, problema
  e número do painel no deck salvo). Exportação PPTX/PDF conferida à mão.

### 3. Status semanal: FEITO

- Layout `status`: saúde (`health` ok/risco/atrasado, com `healthLabel` para trocar o texto), avanço (`progress` %),
  destaque (`highlight`) e as seções feito, em andamento, bloqueios, riscos e problemas, próximos passos; item é texto
  ou `{text, owner, due}` ("Ana · até 30/09"); `shots` (até 3 telas com legenda) ao lado.
- "Muito variável": só aparece o que foi preenchido. Grade de 6 trilhas: a última linha incompleta se reparte inteira
  (5 seções = 3 + 2, sem buraco); semana magra (até 6 itens, sem telas) ganha letra maior e o bloco no meio.
- Studio: galeria (Status semanal) e formulário (saúde, avanço, listas com responsável e prazo, telas).
- Testes: `status.test.js` (motor; no navegador, semana cheia e vazia sem nada fora do slide ou encavalado em
  sinal, editorial e noite), `studio.test.js` (criar pela galeria, saúde, avanço e bloqueio no deck salvo).

### 4 e 5. Governança navegável: FEITO o recurso (navegação por caminhos)

- Pergunta do Naruminho: "como deixar isso navegável, organizado e útil?" (acesso → experimento ou projeto → DEV/HOM/
  PROD; caminhos que se abrem conforme o front-end). Resposta: um **mapa** e seções por caminho, em vez de sequência.
- Layout `hub` (mapa de caminhos: pergunta + opções com ícone, texto, detalhe e seta). `goto` (id ou número) em opção,
  cartão, item de lista e etapa deixa o item clicável; `[texto](#id)` no meio do texto; no slide, `id`, `back`
  (botão "Voltar: <título do destino>" no canto; no terminal fica na barra da janela, no noite dentro da moldura) e
  `next` (o fim do caminho volta ao mapa em vez de seguir a ordem). `navWarnings` avisa destino inexistente e id repetido.
- Funciona na apresentação (runtime: clique; `next` no fim do slide), no PDF (áreas clicáveis por cima das fotos das
  páginas, links internos) e no PowerPoint (`hyperlink: { slide }`, "hlinksldjump").
- Studio: galeria (Mapa de caminhos), formulário do hub, "Ao clicar, ir para" em cartão/etapa/item e, em Mais
  opções de todo slide, "Id do slide", "Botão Voltar para" e "No fim, avançar para". REFERENCIA: seção "Navegação por
  caminhos" com exemplo (a IA sabe montar).
- Testes: `navigation.test.js` (motor, cliques na apresentação, links no PDF e no PPTX), `studio.test.js` (mapa pelo
  formulário, destino e id no deck salvo).
- O deck da governança em si (conteúdo do trabalho) não entra no repositório: vai para a biblioteca da pessoa.

---

## Como rodar os testes numa sessão na nuvem

`npm ci`, depois `SAGADECK_BROWSER=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test`
(sem essa variável, os testes de navegador são pulados em silêncio).
