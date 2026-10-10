# Trabalho em andamento

Diário de bordo das frentes longas: o que já entrou, o que falta e as decisões tomadas. Serve para qualquer
sessão (Claude, GPT, pessoa) continuar de onde a outra parou, sem depender de conversa ou de máquina.

**Regra:** ao terminar uma etapa, atualize este arquivo no mesmo commit. Ao abrir uma sessão nova, leia antes de
começar. Trabalho em curso vai para o GitHub (commit + push) a cada etapa, nunca só no disco local.

---

## Próximas frentes (levantadas em 08/10/2026, ainda não começadas)

**Para quem pega isto numa sessão nova, sem a conversa de origem.** O projeto é o **sagadeck**:
- Repositório GitHub `naruminho/sagadeck`, clonado em `C:\Users\narum\src\sagadeck`, branch `main`.
- Publicado no npm como `sagadeck` (1.7.1: a IA diz por que o `ia.json` não serve e, no servidor, não mostra a configuração; o PyPI parou na 1.5.0).
- Ferramenta Node (ESM) que transforma apresentações escritas em YAML em HTML/PPTX.
- Tem um editor web, o Studio (`sagadeck studio`, porta 3517).
- Tem uma IA embutida (provedor direto, configurado em `~/.sagadeck/ia.json` pela tela Configurar IA) que cria e edita decks, inclusive a partir de PDFs de
  artigos científicos para apresentar em congresso.

Os itens abaixo vieram de duas rodadas de 08/10/2026, ambas descritas nas seções logo abaixo deste diário:
- **Paper → congresso.** Geramos decks a partir de três PDFs, olhamos o resultado e corrigimos o motor (figuras,
  equações, crítica, autoria, idioma).
- **Biblioteca no OneDrive.** A pasta das apresentações passou de `C:\Users\narum\sagadeck` para a pasta Documentos
  do Windows, que nesta máquina é redirecionada para o OneDrive: `C:\Users\narum\OneDrive\Documents\sagadeck`. O
  caminho antigo virou junção.

**Ordem combinada com quem mantém o projeto (Narumi):** 1, depois 4, depois 8: os três entraram em 08/10 (seções
datadas abaixo). O resto fica para depois e só entra se for pedido. Antes de começar, leia o `CLAUDE.md`
(regras). Para cada item:
- teste que falha antes da correção;
- `npm test` passando;
- uma branch por item, PR e merge na hora, sem perguntar;
- este diário atualizado no mesmo commit. Item feito sai desta lista e vira uma seção datada com o que entrou.

**OneDrive (a biblioteca agora mora em `C:\Users\narum\OneDrive\Documents\sagadeck` e sincroniza)**

2. **Cache fora da nuvem.** O prazo da lixeira virou preferência (seção "Lixeira com prazo nas Preferências"). Sobram `.cache`
   (5 MB) e `.historico` indo para o OneDrive; só pesa se a pasta Documentos estiver no OneDrive (comum no Windows 11
   e em empresa, mas não universal). O histórico de versões talvez deva continuar junto do deck (portável).
3. **Arquivos só na nuvem (Files On-Demand).** Com espaço liberado, o OneDrive deixa só o marcador do arquivo, e
   ler o conteúdo força o download. Conferir se listar a biblioteca (`openLibrary`, `/api/library`) lê o YAML de
   cada deck; se lê, listar só pelo nome/metadado e abrir o conteúdo sob demanda.

## Frente: mapa (planejada em 10/10/2026, em andamento)

Pedido de Narumi, depois de muita conversa. **Leia antes de mexer.** Recurso de nicho, mas completo: mostrar e
explicar algo geográfico (pontos de interesse de qualquer tipo, linhas, áreas), com a IA montando a partir de dados.
Não é um QGIS: análise pesada fica lá; aqui é apresentar bem, com contas simples feitas pelo código.

**Decisões (não reabrir):**
- **Internet não é limitação.** Recurso online é bem-vindo e fica disponível onde funciona; onde não funciona, some ou
  avisa. Nada de "assar/chapar" o mapa de fundo no deck (ela odiou): mapa **ao vivo** (Leaflet, embutido no pacote).
- **Nada bancário nem de setor nenhum**: pontos de interesse genéricos (sensor, hidrômetro, placa solar, cinema,
  órgão público…). Exemplos, REFERENCIA e testes com casos variados.
- **A planilha é a fonte, o mapa é a vista**: pontos em CSV do projeto (`contexto/*.csv`, importa XLSX); linhas e
  polígonos em GeoJSON do projeto (importa GPX/KML). O slide diz qual arquivo e quais colunas (posição, cor, tamanho,
  rótulo). A mesma planilha serve tabela e gráfico.
- **Carregamento preguiçoso** em quatro níveis: o Leaflet só entra no HTML de deck com mapa; o mapa só liga (e só pede
  tiles) quando o slide aparece; o editor de mapa no Studio vem por import dinâmico; os módulos de serviço no servidor
  só no primeiro pedido. Teste para os três primeiros.
- **Uma tentativa e para**: erro de autorização ou bloqueio (401, 403, 407, recusa, certificado, até 429) marca o
  serviço indisponível na sessão; só volta com "Tentar de novo" ou reabrindo o Studio. Tiles: se os primeiros falham
  sem nenhum sucesso, a camada de fundo desliga e aparece aviso (camadas continuam). **Sem teste proativo** de
  serviço: o primeiro uso real é o teste. Teste: serviço com 403 recebe exatamente um pedido.
- **Pedidos saem do navegador no Studio local** (mesmo caminho/proxy do Google Maps, que abre na rede do trabalho; o
  Node não usa o proxy do sistema). No multiusuário, do servidor (a chave não vai para a página dos outros).
- **Serviços padrão gratuitos**, todos configuráveis em **Configurar mapa** (`~/.sagadeck/mapa.json`, como o ia.json):
  tiles do OpenStreetMap, Nominatim (endereço↔coordenada), Overpass (busca de lugares/linhas/áreas), OSRM
  (rotas, encaixe de GPS) e OpenRouteService (rotas e isócronas; chave da Narumi já está no mapa.json desta máquina,
  nunca no repositório). Respeitar as políticas: atribuição visível "© colaboradores do OpenStreetMap", identificação
  do sagadeck, Nominatim 1/s e cache obrigatório (lote grande: avisar e sugerir provedor com chave), nada de baixar
  tiles fora da tela. Públicos de OSRM/Overpass são não comerciais: para uso no trabalho, servidor da empresa ou chave.
- **A IA**: recebe no prompt o estado de cada serviço (funcionando, não usado, bloqueado) e decide; o código recusa
  sem pedido de rede o que está bloqueado. Pergunta antes de mandar **dados da pessoa** a serviço de fora (primeira vez
  por planilha) e antes de lote grande (tempo estimado). Geometria nunca inventada: vem de dados, do OSM ou do cálculo.
  Testes: mock (encanamento) e ao vivo (decisão).
- PDF/PPTX capturam o mapa como está na tela na exportação; camada por clique vira animação no PPTX.

**Entregas (uma branch/PR cada, com testes e CI verde):**
1. **Feita (10/10).** Slide `map`: motor `src/map.js` (CSV com colunas de posição achadas pelo nome, GeoJSON, GPX,
   KML, `areas` por UF/país com os contornos embutidos `src/runtime/vendor/geo-contornos.json`; cor por categoria
   na paleta do tema `c1…c5` ou escala por número, tamanho, rótulo, cartão; prévia SVG para miniaturas), mapa ao vivo
   `src/runtime/map.js` (Leaflet 1.9.4 embutido por `scripts/vendor-map.mjs`, só em deck com mapa; monta só no slide
   atual; testa **um** tile antes de ligar o fundo e, se falhar, nenhum outro mapa da sessão tenta; legenda que liga e
   desliga; camada por clique com marcadores `data-step` e câmera por camada), configuração da máquina
   `src/map-config.js` (`~/.sagadeck/mapa.json`; só o fundo vai para o deck), exportação abrindo o deck com mapa por
   endereço local (Referer) e esperando o mapa de cada slide (`settleSlide`), formulário `map-fields.js`, REFERENCIA,
   exemplo de layout (entra no Conheça o SagaDeck). Testes: `test/map.test.js` (motor, apresentação com servidor de
   tiles falso, 403 recebe exatamente um pedido, exportação) e `studio.test.js` (inserir mapa, monta, trocar fundo
   salva). Achados no caminho: coordenada "-46.702" lida como milhar pelo leitor de números (agora `coordNum`); a
   classe `widget` na caixa fazia o runtime trocar o conteúdo; rota do `map.js` com cache servia código velho.
   Pendente para depois: geocodificar `at: "Recife"` (entrega 2) e contornos de reserva quando o fundo falha.
2. **Feita (10/10).** A tela de dados é a planilha da aba Arquivos (`sheetGrid`, já editável e colando do Excel),
   com as ferramentas de mapa (`src/studio/public/map-data.js`): **Pôr no mapa** (adivinha cor pela coluna de
   categorias que se repetem e rótulo pela de nome; `.xlsx` ganha um CSV ao lado), **Achar coordenadas** (pergunta o
   plano antes e mostra quantos endereços, para qual serviço e quanto tempo; só envia com o sim; progresso; o que não
   achou fica listado; cache em `.sagadeck/geocodificacao.json`, consentimento em `.sagadeck/mapa-consentimento.json`)
   e a **seleção ligada** (clicar no ponto seleciona a linha; selecionar a linha abre o cartão). Servidor:
   `src/map-services.js` (pedidos identificados `sagadeck/versão`, uma tentativa e para, estado de cada serviço) e
   `src/studio/geo-routes.js` (`/api/mapa`, `/api/mapa/tentar`, `/api/mapa/geocode` em ndjson). Tela **Configurar
   mapa** (`map-settings.js`, botão no formulário do mapa). Decisão: a busca de endereço sai do servidor do Studio
   (a política do Nominatim pede identificação, que o navegador não deixa mudar); os tiles saem do navegador.
   Testes: `test/map-data.test.js`. Fica para depois: abrir GeoJSON como tabela.
3. **Feita (10/10).** Editor `src/studio/public/map-editor.js`, carregado só no clique em **Editar no mapa** (botão e
   barra no `#canvas-viewport`, fora do slide escalado): Mover (arrastar ponto atualiza a linha da planilha; clicar
   numa linha/área abre os vértices: arrastar, apagar, dividir; juntar linhas pelas pontas mais próximas), Ponto
   (linha nova na planilha da camada, endereço pelo `/reverse`), Linha e Área (GeoJSON da camada ou
   `contexto/desenhos.geojson`; "Seguir as ruas" a pé/carro/bicicleta pelo `/api/mapa/rota`), Régua, Usar esta vista
   (grava `view` no slide); comprimento e área ao vivo. O Studio guarda a vista entre redesenhos (`keepView`). Rotas,
   endereço de um ponto e área alcançável em `src/map-routing.js` (OpenRouteService com chave, testado ao vivo com a
   chave da Narumi: 817 m a pé, isócrona de 5 min; ou OSRM). Chave do mapa como a da IA: tela Configurar mapa com
   "Usar o OpenRouteService" e Testar, botão na biblioteca, `keyEnv` (variável de ambiente, para o servidor). README
   com a seção "Mapa (opcional)". Achados: o editor visual capturava o clique no mapa (agora ignora `.map-live`); o
   projeto não gravava `.geojson/.gpx/.kml` como texto. Testes: `test/map-editor.test.js` e `map-data.test.js`.
4. **Feita (10/10).** A IA que edita o deck pede dados com um bloco `mapa:` (como o `ver:` do material; nenhuma
   chamada a mais quando o pedido não é de mapa): `lugares` e `linhas` (Overpass, com o filtro de tags que ela
   escolhe e o centro achado no Nominatim), `contorno` (Nominatim com polígono), `web` (a pesquisa existente + uma
   extração que só usa o que leu, com a URL de cada linha; as coordenadas vêm depois) e `coordenadas` (planilha da
   pessoa; sem `confirmado: true`, o código pergunta "Posso enviar?" com opções e não envia nada). O Studio executa
   (`src/ai/map-data.js`), grava em `contexto/` com a coluna `fonte` e chama a IA de novo (até 2 rodadas). O prompt
   (`mapDataPrompt`) leva o estado de cada serviço; bloqueado não recebe pedido e a IA fica sabendo. Testes:
   `test/map-ai.test.js` (encanamento, LLM falso) e 3 ao vivo em `test/ai-live.test.js` (pede `amenity=cinema` perto
   de Campinas; não se dá o sim sozinha; com a busca bloqueada, não pede e oferece alternativa), todos passando com o
   modelo de verdade. Conferido com o OpenStreetMap real: 5 cinemas num raio de 8 km do centro de Campinas (o
   Overpass público às vezes responde 504 por sobrecarga; o sagadeck registra e não insiste).
5. **Feita (10/10), no mesmo PR da 4.** Contas puras em `src/map-analysis.js` (haversine, mais próximo, raio, ponto em
   polígono com buraco, distância a linha, círculo, faixa em volta de linha para desenhar, "onde instalar" por grade e
   escolha gulosa) e as ações do bloco `mapa:` em `src/ai/map-analysis-run.js`: `mais_proximo` (CSV com
   `mais_proximo` e `distancia_m`), `contar` (por área ou raio, grava o círculo), `faixa` (GeoJSON da faixa e quantos
   pontos dentro, pela distância exata à linha), `sugerir` (CSV de sugestões, avisando que é geométrico), `rota`
   (distância e tempo), `alcance` (isócronas, só com OpenRouteService) e `encaixar` (OSRM `/match`, amostrando até 100
   pontos). A IA só narra os números. Achado: pontos todos alinhados deixavam o "onde instalar" sem resposta (retângulo
   de altura zero). Testes: `test/map-analysis.test.js` e o ao vivo "qual loja fica mais perto de cada pedido" (pede
   `mais_proximo`).

## Conheça o SagaDeck — 10/10/2026

Pergunta de Narumi: a pessoa nem sabe o que dá para gerar. Agora a biblioteca tem, na lateral, **Conheça o
SagaDeck** (também na vitrine, em Recursos do SagaDeck): uma apresentação com um slide por recurso, agrupada em
seções, que abre em prévia (nada é gravado; "Usar como base" cria a cópia em Modelos).

- `src/studio/tour.js` monta-se sozinha dos exemplos de layout (`LAYOUT_SAMPLES`): layout novo entra sem ninguém
  lembrar; layout fora dos grupos cai em "Mais recursos". Fecha com o que não é layout (criar e conversar com a IA,
  leitura crítica, importar PowerPoint, gráfico da planilha, temas, apresentador, PDF/PowerPoint, link).
- Cada slide traz nas **notas** (visíveis abaixo do slide no Studio e na visão do apresentador) o nome, a descrição e
  a frase para pedir à IA (`LAYOUT_ASK` em `layout-samples.js`, exemplos de áreas variadas); no rodapé (`source`)
  também, nos layouts que o desenham. Os links de navegação dos exemplos saem (apontariam para slides inexistentes).
- Testes: `engine.test.js` (todo layout tem pedido e aparece no tour, com nome e pedido; renderiza) e
  `library-ui.test.js` (a lateral abre em prévia e nada é criado na biblioteca).

## Sem citar o programa de apresentações da maçã (1.7.1) — 10/10/2026

Pedido de Narumi: o código e a documentação não citam o programa de apresentações da maçã, a empresa nem os
aparelhos dela. O tema `prata` passa a se descrever como "limpo e espaçoso"; o `aluminio`, como "lançamento de
aparelho premium". O exemplo virou `templates/exemplo-prata.yaml`, e o tipo padrão do `scaffold` (CLI e MCP) virou
`lancamento` (tipo desconhecido continua caindo nele). Saiu também o slogan da empresa do esqueleto. Ficam só os nomes
técnicos (a fonte do sistema no CSS, a identificação de navegador da pesquisa). `guards.test.js` falha se voltar
(olha os arquivos do repositório, menos bibliotecas de terceiros); regra no `CLAUDE.md`.

## No servidor, a configuração da IA não sai para quem usa (1.7.1) — 10/10/2026

No multiusuário (portal do Oracle), `/api/ia` e `/api/ai/status` mostravam a qualquer usuário o provedor, o endereço,
os modelos, o caminho do `ia.json` e os 4 últimos caracteres da chave, embora ele não pudesse editar nada.

- `/api/ia` no multiusuário devolve só `{ editable: false, configured }`; `/api/ai/status`, só `{ available,
  configured, server: true }`.
- O Configurar IA, no servidor, vira um aviso: quem configura é quem administra, e se a IA está configurada. O
  indicador do editor diz "A IA deste servidor está ligada" (ou "não está respondendo / não está configurada. Avise
  quem administra"), sem endereço nem modelo; o progresso do chat diz "Enviando para a IA".
- Teste (`test/library-ui.test.js`): com a IA configurada no servidor, nada de chave, modelo, endereço ou arquivo nas
  respostas nem na página do editor; o diálogo não tem campos. Falha sem a mudança.

## ia.json ilegível diz o motivo — 10/10/2026

Na migração do Oracle (o modelrelay saiu; os serviços `sagadeck` e `sagadeck-dev` falam direto com o OpenRouter, cada
um com seu `ia.json`), o arquivo foi criado como root e o serviço, que roda com usuário próprio, não conseguia lê-lo:
o sagadeck dizia só "IA não configurada", como se o arquivo nem existisse.

- `readIA` (`src/ai/ia-config.js`) separa "não existe" (só não configurada) de "existe e não serve": sem permissão,
  ilegível, JSON quebrado, sem `url`. O motivo vai em `llmConfig().problem`.
- Aparece ao subir (`studioBanner`, a linha "IA: não configurada. …", que é o que quem administra vê no log), no erro
  da chamada à IA, em `/api/ia` e `/api/ai/status`, na faixa da biblioteca, no Configurar IA e no indicador do editor.
- A faixa da biblioteca quebra o texto longo (o caminho do arquivo empurrava o botão para baixo de outro elemento).
- Testes: `test/ia-config.test.js` (pasta no lugar do arquivo, sem permissão fora do Windows, JSON quebrado, sem
  endereço) e `test/library-ui.test.js` (faixa e Configurar IA dizem "Não deu para ler"). Falham sem a correção.

## CI verde de novo (e a regra: merge só com a CI verde) — 09/10/2026

A CI do GitHub estava vermelha havia dias (desde antes da 1.4.0) e 13 PRs foram mergeados e a 1.5.0 publicada assim.
Regra nova no CLAUDE.md: merge e release só com a CI verde nas duas máquinas. As falhas, uma por uma:

- **Python 3.12** (Ubuntu): escape inválido numa docstring; corrigido antes da 1.5.0 (seção abaixo).
- **Cópia de mídia entre apresentações** (Windows): defeito real. `copySlideAssets` comparava o caminho real do
  arquivo com o caminho da pasta sem resolver; deck aberto por junção (o `C:\Users\narum\sagadeck` antigo é uma) ou
  por nome curto do Windows (`RUNNER~1`, a pasta temporária da CI) recusava toda mídia como "fora da apresentação".
  Compara os dois resolvidos. Teste com uma junção de verdade (`test/studio-chat-jobs.test.js`).
- **Animações paradas** (Windows): o Windows Server vem com "mostrar animações" desligado, o Chrome informa
  `prefers-reduced-motion: reduce` e as cenas ficam paradas, de propósito. Os testes herdavam a preferência da máquina:
  `newPage` (`test/helpers.js`) fixa "sem preferência", e quem testa o movimento reduzido pede `reducedMotion: "reduce"`.
- **Defeito real achado no caminho**: com o sistema pedindo movimento reduzido, a cena às vezes animava sem parar. O
  iframe dizia "ready" antes de o script da página escutar; a página nunca respondia (nem "slide atual", nem "movimento
  reduzido"). A página agora fala com cada cena assim que se liga a ela (`src/runtime/motion.js`) e a cena acompanha a
  mudança da preferência (`src/motion.js`). Teste novo: sistema com movimento reduzido deixa o holograma parado
  (falhava 3 em 4 sem a correção; 5 em 5 com).
- **"Parar a transformação"** (os dois): o teste esperava um texto do aviso de progresso para recarregar a página "no
  meio". Agora espera o modelo (falso) ter recebido o pedido de escrever os slides.
- **Animações paradas no Windows da CI, a causa de verdade** (achada com o diagnóstico que os testes passaram a
  imprimir, inclusive o estado interno da cena, `window.__sagaMotion`): na CI a cena ficava com "parada" ligado para
  sempre, embora a preferência dissesse "sem redução": ouviu "movimento reduzido" no carregamento (do sistema, antes de
  a preferência do teste valer) e o código só sabia ligar esse estado, nunca desligar. Defeito real: religar as
  animações com a apresentação aberta não descongelava nada. Agora "parada" se recalcula (deck `motion: none`, página
  pedindo, preferência do sistema) sempre que um deles muda, nos dois sentidos; a página sempre diz sim ou não e repete
  quando a preferência muda. Teste: movimento reduzido que deixa de valer faz a cena voltar a animar (falhava antes).
- **Baixar PowerPoint sem as notas** (Windows): o clique esperava a "navegação" do download, e o PPTX numa máquina
  lenta passa do limite do clique; o teste só precisa do pedido (`noWaitAfter`).

## Pacote Python: escape inválido numa docstring — 09/10/2026

Antes da release 1.5.0. `python/sagadeck/api.py` tinha "Documentos\sagadeck" numa docstring: `\s` é escape inválido,
`SyntaxWarning` no Python 3.12 (a CI no Linux acusava; aqui, no 3.11, passava calado) e erro nas versões seguintes.
Virou "Documentos/sagadeck". Teste novo em `test/python-relay.test.js`: compila todo o pacote com `-W error` (qualquer
Python; falhava antes).

## Lixeira com prazo nas Preferências (padrão 30 dias) — 09/10/2026

A "Lixeira de um dia" (abaixo) foi pedida pelos 407 MB de decks de teste numa máquina, mas saiu na 1.5.0 para todo
mundo: quem atualizasse perdia de vez, no primeiro uso, o que estava na lixeira havia mais de um dia. Agora o prazo é
uma preferência da máquina: **Preferências › Biblioteca › Quanto tempo a lixeira guarda** (1, 7, 30 ou 90 dias;
`biblioteca.lixeiraDias`, padrão 30). `openLibrary` lê o prazo a cada limpeza (`trashDays` só nos testes) e
`/api/library` devolve `trashDays`, que a tela da lixeira e o aviso ao excluir mostram.

- Testes: `test/library.test.js` (com 1 dia, anteontem some do disco e a de uma hora fica; sem escolha, 30 dias) e
  `test/studio.test.js` (escolher "1 dia" nas Preferências grava no arquivo, a biblioteca passa a usar e a dizer "Fica
  aqui por um dia"; falha sem o recurso).

## Crítica acionável: cada ponto vira um cartão com Aplicar e Ignorar — 09/10/2026

Item 7 das próximas frentes. A leitura crítica (botão do chat) chegava como um texto único, com opções gerais ("leve
os achados para os slides").

- Cada ponto vem com `id` e, quando o deck vai junto, o `slide` a que se liga (antes só o tipo "slide a rever" tinha;
  regra no prompt de `critiqueMaterials`; número que não existe no deck é descartado).
- No chat, cada ponto é um cartão: tipo, título, texto, o trecho conferido e "Slide N" (leva até ele). **Aplicar**
  vai ao slide e pede à IA só aquele ponto, mirando aquele slide (a autoria decide: achado no slide, crítica e
  pergunta nas notes). **Ignorar** fica gravado (`/api/ai/critique/item`, `status` no `.sagadeck/leitura-critica.json`)
  e o ponto sai do material que acompanha os próximos pedidos (`critiqueMaterial`).
- Teste (`test/studio-critique.test.js`): dois pontos viram dois cartões; slide inexistente não vira link; Ignorar
  grava e tira o ponto do próximo pedido; Aplicar vai ao slide 2, pede o ponto e grava "aplicado". Falha sem a mudança.
- **Item 5 (equações que a visão não listou) já estava feito**: `assignEquations` põe as numeradas esquecidas em
  `missed`, elas entram no inventário com a caixa exata do texto e passam pela mesma releitura do recorte
  (`transcribeEquation`) que escreve o LaTeX das outras. Saiu da lista.

## Primeiro uso: navegador abre sozinho, "Para começar" e a recomendação de IA — 09/10/2026

Pergunta de Narumi: quem instala pelo npm sabe pôr no ar, sabe a URL, precisa editar arquivo para a IA? Antes: um
comando (`sagadeck studio`), mas o navegador não abria, o `sagadeck` sozinho mostrava o `studio` como 19º item de uma
lista longa, e os campos de modelo do Configurar IA vinham vazios (ninguém sabe o nome exato de um modelo).

- `sagadeck studio` **abre o navegador** na página (`src/studio/open-browser.js`), inclusive quando já está aberto;
  só para quem está no terminal: nunca em serviço/teste (sem TTY), CI, multiusuário, Linux sem tela ou
  `--sem-navegador` / `SAGADECK_NO_BROWSER=1`. A primeira linha continua sendo o endereço.
- `sagadeck` sozinho começa com **"Para começar: sagadeck studio"** (o que faz, o endereço, deixar o terminal aberto).
- **Configurar IA** com a recomendação (`RECOMMENDED` em `src/ai/ia-config.js`: OpenRouter, DeepSeek para texto e
  visão, Gemini para imagem, `:online` para busca) e **Usar a recomendação**, que preenche provedor e modelos. Ela é
  também o teste da instalação: se nem com ela a IA responde, o problema é rede ou chave. Os campos trazem exemplos e
  a tela diz que imagem e busca dependem do provedor. Sem listar os modelos do provedor (decisão: endereço próprio ou
  de empresa pode não ter a lista, ou ser bloqueado).
- **Faixa "Configure a IA"** na biblioteca enquanto não está configurada (só onde se pode configurar; some ao salvar).
- Testes: `test/instance.test.js` (quando abre o navegador e o comando de cada sistema; `sagadeck` sozinho),
  `test/library-ui.test.js` (faixa, recomendação preenche, salvar some a faixa).
- **Testes isolados de verdade**: a suíte completa falhou só nesta máquina num teste da lixeira, que leu as
  Preferências reais (lixeira em 1 dia). 41 arquivos de teste não carregavam o isolamento (só os que importavam o
  `helpers.js`). Agora `test/isolate.js` (biblioteca, ambientes, Preferências, IA e registro de comandos em pasta
  temporária) é carregado antes de tudo pelo `npm test` (`--import`) e importado por todo arquivo de teste;
  `guards.test.js` reprova arquivo de teste que não carregue.
- A avaliação ao vivo (`test/bench-live.test.js`) não fechava o navegador da revisão dos slides: o processo ficava
  pendurado (dias). Fecha no fim; `guards.test.js` exige isso de todo teste que gera pelo caminho do Studio.
## Ambientes por campos e sem o botão no servidor — 09/10/2026

Pergunta de Narumi: quem instala do zero sabe preencher o `ambientes.yaml` (slides de API)? O lugar já era automático
(o Studio grava em `~/.sagadeck/ambientes.yaml`), mas preencher era editar YAML numa caixa de texto. E no servidor
(multiusuário) o botão abria a janela com "O serviço recusou o acesso…", parecendo defeito.

- **Por campos** (`src/studio/public/api-envs-form.js`, aba padrão): um cartão por ambiente com endereço base,
  variáveis, segredos (digitado vai cifrado; em branco mantém; ou o nome de uma variável de ambiente), autenticação
  (nenhuma; token fixo, que vira `Authorization: Bearer {{secret.token}}`; token que expira, client credentials) e
  **Testar** (salva, chama o endereço base e pede o token). Sem ambiente próprio, a tela explica que o ENSAIO já
  funciona. A aba **Como texto** é o editor de YAML de antes.
- Motor (`src/api-client.js`): `formState`/`saveForm` (o mesmo arquivo, preservando comentários e o que o
  formulário não conhece: `ca`, outros cabeçalhos), `check` (o Testar), cabeçalhos do ambiente com `{{secret.…}}` e
  client secret do token cifrado. Rotas `/api/http/ambientes/form` e `/api/http/ambientes/testar`.
- **No servidor o botão some** (o slide de API não executa lá; `/api/http/state` diz `live: false`).
- Testes: `test/api-client.test.js` (salvar e ler de volta sem o valor dos segredos, comentários e `ca` preservados,
  token fixo no pedido, segredo mantido em branco, Testar), `test/studio.test.js` (instalação do zero pela tela, até o
  Testar confirmar com o token chegando na API), `test/studio-scripts.test.js` (botão some no multiusuário; falhava
  sem o módulo).

## IA embutida, só npm e o Studio como a página do sagadeck — 09/10/2026

Pedido de Narumi, depois de um agente (Copilot) instalar o sagadeck, abrir a página do modelrelay e, sem achar a
interface, criar uma do zero: deixar claro que a página é o Studio; tirar o pip (o pacote Python só chamava o Node);
e tirar o modelrelay (Python, outro repositório, versão para sincronizar), mantendo uma camada separada onde a pessoa
põe a chave e o modelo sem mexer no código.

- **IA embutida** (`src/ai/ia-config.js`): provedor, chave e modelos desta máquina em `~/.sagadeck/ia.json`
  (`SAGADECK_IA`), fora do código e da biblioteca. Chave no arquivo ou numa variável (`keyEnv`); papéis `text`,
  `vision`, `image`, `search` viram os modelos configurados (`resolveModel`); `headers` fixos; e `adaptador`: um `.mjs`
  da pessoa cujo default `(url, init) => Response` faz o envio (provedor fora do padrão da OpenAI, sem código no
  sagadeck). Variáveis `SAGADECK_LLM_*` valem por cima (servidor, testes). Sem nada configurado, a IA fica desligada.
- **Migração**: na primeira vez, o `~/.modelrelay/config.toml` vira o `ia.json` (provedor padrão, chave ou
  `api_key_env`, `[models]` com `[apps.sagadeck.models]` por cima); não sobrescreve nada.
- **Configurar IA** (`src/studio/public/ai-settings.js`, `src/studio/ia-routes.js`): mesma tela na biblioteca (botão
  Configurar IA) e no editor (IA desligada/ligada): provedor, endereço, chave (nunca volta inteira: `••••1234`),
  modelos, **Testar** (pergunta curta com o que está na tela) e **Salvar**. No multiusuário não aparece e não grava.
- **Saiu**: `src/ai/relay.js` (subir o `modelrelay serve`), o cabeçalho `X-Modelrelay-App`, a rota `/api/ai/setup`,
  a pasta `python/`, o `pyproject.toml`, `scripts/bundle.mjs` e os testes deles; a publicação vai só para o npm.
- **O Studio é a página** (`src/studio/banner.js`): a primeira linha do `sagadeck studio` é "Abra no navegador:
  http://127.0.0.1:3517"; a IA aparece depois (provedor e modelo, ou onde configurar). README com "Comece aqui";
  SKILL.md com "Para agentes: deixar pronto para usar" (Studio, nunca criar interface própria, Configurar IA) e a
  porta certa (dizia 3000).
- Testes: `test/ia-config.test.js` (migração com o config.toml real, chave mascarada, llmConfig e papéis),
  `test/ai.test.js` (chamada direta com a chave e o modelo configurados; adaptador faz o envio),
  `test/library-ui.test.js` (Configurar IA de ponta a ponta: testa, salva, a chave não volta, multiusuário bloqueia),
  `test/instance.test.js` (primeira linha do `sagadeck studio`; SKILL.md com porta, npm e a regra).

## Studio avisa quando o código mudou por baixo dele — 09/10/2026

Continuação do incidente "nenhum slide abre" de 08/10: um Studio aberto antes de uma atualização segue com o servidor
velho, enquanto os arquivos da página vêm novos do disco. Corrigir a lista de scripts resolveu aquele caso, mas
qualquer mudança de API quebraria do mesmo jeito, em silêncio.

- `src/studio/code-version.js`: impressão do código (caminho, data e tamanho de cada arquivo de `src/`; no pacote do
  pip, do motor empacotado). O Studio guarda a de quando subiu; `/api/code-version` diz se mudou (recalcula no máximo
  a cada 3 s).
- `update-notice.js` (editor e biblioteca): confere ao abrir, ao voltar para a aba e a cada 30 s; mudou, mostra a
  faixa "O sagadeck foi atualizado. Feche e abra o Studio de novo…", que dá para fechar.
- Teste (`test/studio-scripts.test.js`): o Studio sobe com uma raiz de código temporária (`codeRoot`, só para testes,
  para não acender o aviso num Studio de verdade aberto ao lado); sem mudança, sem aviso; mudou a data de um arquivo,
  editor e biblioteca mostram a faixa e ela fecha; zero erros de JavaScript. Falha sem o recurso.

## Testes instáveis sob carga — 09/10/2026

Item 9 das próximas frentes. Testes que passavam sozinhos e caíam com a suíte inteira trocaram tempo fixo por espera
da condição de verdade:

- `developer-labs` (frame executa JavaScript): o clique chegava antes de o script do iframe ligar o `onclick` e o
  resultado ficava 0. Espera o `onclick` existir e o texto virar 1 (e 0 depois do reinício).
- `motion-scenes`: comparava o quadro da animação depois de 100–300 ms. Agora espera o quadro mudar (anima) ou parar
  de mudar (pausou fora do slide), com prazo.
- `library-ui` (aula de APIs ao vivo): só clica em Executar com o slide montado.
- **Defeito de verdade achado no caminho**: com `motion: none`, a cena de terminal começava digitando ("first l_")
  porque só sabia do movimento reduzido pela mensagem da página, que sob carga chegava tarde. A cena agora nasce
  sabendo (`still` no documento dela, `motionHTML` em `src/motion.js`). O teste de captura confere que, no instante em
  que o texto aparece, ele já está completo; e um teste rápido confere o `still` no documento (falhava antes).

## Geração por etapas: o aviso diz a etapa e o documento é lido em paralelo — 08/10/2026

Item 6 das próximas frentes. Gerar com documento leva minutos e a tela ficava em "Pensando…" sem dizer pensando em
quê; e o inventário do documento (a visão lendo página a página) rodava inteiro antes de qualquer outra coisa.

- **Quadro de etapas** (`src/ai/progress.js`, `stageBoard`): `generateDeck` passa cada etapa por ele (Entendendo o
  pedido, Pesquisa, Leitura crítica, Lendo o documento, Escrevendo a apresentação, Conferindo as figuras do material,
  Conferindo os números, Imagens, Revisão dos slides). Todo aviso sai como "Etapa: detalhe"; duas etapas ao mesmo
  tempo aparecem juntas ("Lendo o documento: página 3 de 12… · Leitura crítica: …"). O evento leva `stages` (as em
  curso) e `done` (as terminadas). A biblioteca mostra também o tempo decorrido.
- **Em paralelo** (`generateForStudio`): o inventário começa na hora e corre junto com entender o pedido, a pesquisa
  e a leitura crítica (que usam só o texto; `worthCritique` aceita documento ainda sem inventário, marcado
  `document`). A escrita espera o inventário (`pendingMaterials`). Se a geração para antes (a IA perguntou, deu
  erro), o inventário é cancelado (`AbortController`) e a pasta fica livre.
- Testes (`test/ai.test.js`): o quadro com duas etapas juntas; a crítica começa enquanto o inventário ainda não
  terminou (o inventário falso só termina depois que a crítica começa: com a ordem antiga, travava), a escrita recebe
  o material inventariado e nenhum aviso sai sem etapa; e a pergunta antes de escrever cancela o inventário.

## Lixeira de um dia — 08/10/2026

Pedido de Narumi: a lixeira da biblioteca guardava 30 dias e estava com 407 MB (23 apresentações, quase todas
gerações de teste), tudo sincronizando com o OneDrive. Agora guarda um dia (`TRASH_DAYS = 1` em `src/library.js`;
`purgeOld` apaga de vez o que passou disso). Textos da biblioteca e README falam em um dia. A lixeira do projeto
(`.sagadeck/lixeira`, arquivos dentro de uma apresentação) não muda. Teste: `test/library.test.js` (excluída há uma
hora continua restaurável; há dois dias some do disco).

## Studio aberto antes da atualização não abria slide — 08/10/2026

Retorno logo depois do item 8: "tentando abrir um slide e não abre". O Studio da pessoa tinha subido antes do merge.
O servidor lia o `app.js` do disco a cada pedido (veio o novo, que chama `window.SagaHeaderFooter`), mas a lista de
scripts que ele entregava (`PUBLIC_SCRIPTS`) era fixa na memória: `header-footer.js` e `preferences-ui.js` davam 404,
o `app.js` quebrava ao carregar e nada abria. Reiniciar o Studio resolvia; a correção evita a próxima vez.

- `publicScript` (`src/studio/public-files.js`): todo `.js` direto na pasta `public` é entregue, decidido a cada
  pedido olhando o disco (só nome simples: nada de subir de pasta). A lista fixa acabou; módulo novo não precisa
  mais ser registrado em lugar nenhum além do `index.html`.
- Teste (`test/studio-scripts.test.js`): todo `<script src>` do `index.html` e do `library.html` responde 200, e um
  módulo criado depois que o Studio subiu também (falhava com 404 antes); `..`, arquivo inexistente e nome estranho
  não passam.

## Bancada de qualidade da geração a partir de paper — 08/10/2026

Item 4 das próximas frentes. Saber se a geração a partir de PDF melhorou dependia de gerar decks e olhar um por um.
Agora há uma avaliação repetível do motor: gera a partir de PDFs quaisquer e dá nota ao que saiu.

- **Nota** (`src/ai/bench.js`, `scoreDeck`): de 0 a 100 por quesito, com as mesmas ferramentas da autocrítica:
  figuras/tabelas numeradas com slide (`uncoveredVisuals`), recorte de figura sem legenda nem "Fonte:" dentro (linha
  de legenda/crédito da camada de texto do PDF cruzando a caixa do recorte), equações numeradas do texto com LaTeX
  (`equationGroups` × inventário), números na tela sem base no documento (`unsupportedNumbers`), autor do documento
  e não o das Preferências, sem votação em deck acadêmico, sem slide de frase gigante (`auditText`) e idioma pedido
  (texto e `lang`). Quesito sem como medir fica "—" (não conta como bom). Total = média.
- **Mesmo caminho do Studio**: as opções da geração saíram do servidor para `src/studio/generate.js`
  (`generateForStudio`: Preferências, anexos com inventário na pasta do deck, revisão pelos slides renderizados); o
  `generateIntoLibrary` e a bancada usam a mesma função. A bancada passa Preferências fixas (autor de mentira para
  pegar autor errado, sem perguntar, sem imagens geradas).
- **Rodar** (lento; ao vivo): `SAGADECK_LIVE=1 SAGADECK_BENCH_DIR=<pasta com PDFs> node --test test/bench-live.test.js`.
  Gera a partir de cada PDF da pasta com um pedido genérico (`SAGADECK_BENCH_PEDIDO` troca; `SAGADECK_BENCH_IDIOMA`
  liga a conferência de idioma). Os PDFs são exemplos quaisquer: nada de caso fixo, nome de paper ou de pessoa no
  repositório. O objetivo é medir o motor, não acertar um deck.
- **Relatório**: `<data>-<versão>.json` e `.md` em `SAGADECK_BENCH_OUT` (senão `<SAGADECK_BENCH_DIR>\sagadeck-bancada`),
  com o quadro PDF × quesito, a diferença para a rodada anterior (a média só quando os PDFs são os mesmos) e o que
  puxou cada nota para baixo (figura que faltou, recorte com legenda, número sem base).
- Testes: `test/bench.test.js` (cada quesito num deck e material montados à mão, legenda na coluna vizinha não
  conta, relatório com a comparação) e `test/bench-live.test.js` (só com `SAGADECK_LIVE=1` e `SAGADECK_BENCH_DIR`).

## app.js abaixo do limite: Preferências e Cabeçalho/Rodapé em módulos — 08/10/2026

Item 8 das próximas frentes. O `src/studio/public/app.js` estava com 249.491 dos 250.000 bytes que a trava do monólito
(`test/guards.test.js`) permite: qualquer acréscimo quebrava. O chat já tinha saído (`chat.js`); saíram dois blocos
inteiros e autocontidos, no molde de `slide-select.js` (fábrica que recebe o estado e os ajudantes e devolve a API):

- `header-footer.js` (`window.SagaHeaderFooter`): modelos prontos, campos com variáveis e prévia do cabeçalho/rodapé.
- `preferences-ui.js` (`window.SagaPrefs`): a tela única de Preferências, com busca e gravação automática.
- Carregados no `index.html`, antes do `app.js` (o servidor entrega todo `.js` da pasta `public`; ver a seção
  seguinte).
- `app.js` foi a 235.619 bytes; o limite desceu para 240.000 (a trava continua sendo catraca: sobra espaço para
  ajustes pequenos, recurso novo vai para módulo próprio).
- Testes: os de Preferências e de cabeçalho e rodapé do `test/studio.test.js` (clicam de verdade e conferem o deck e
  o arquivo salvos, sem erro de JavaScript) passam iguais; comportamento não mudou.

## Gravação tolerante a arquivo travado (OneDrive) — 08/10/2026

Item 1 das próximas frentes. Com a biblioteca no OneDrive, a sincronização (e antivírus, indexador) segura o arquivo
por um instante e o `rename` falha com `EPERM`/`EBUSY`/`EACCES`: o salvamento da pessoa se perdia com erro.

- `renameRetry` (`src/fs-retry.js`): tenta de novo só nesses três códigos, com espera curta e crescente (20 → 450 ms,
  ~1 s no total); outro erro (disco cheio, destino inexistente) sobe na hora. Espera síncrona (`Atomics.wait`), para
  servir aos chamadores síncronos sem mudar a assinatura deles.
- Usado em todo rename do código: `writeDeckFile`, biblioteca (lixeira, restaurar, mover, renomear deck e tópico,
  publicar a geração, migração), arquivos do projeto, Preferências, conversa do chat, links compartilhados e
  ambientes do slide api.
- Testes (`test/deck-file.test.js`, `test/library.test.js`): stub do `fs.renameSync` que falha N vezes com cada código
  e o deck é gravado; erro de outro tipo sobe na primeira tentativa; trava que não solta desiste em ~1 s sem estragar
  o arquivo; lixeira/restaurar/mover/renomear com a pasta travada; e uma trava de código: `fs.renameSync` direto em
  `src/` ou `bin/` faz o teste falhar.

## Biblioteca padrão em Documentos\sagadeck — 08/10/2026

Pedido: a biblioteca padrão no Windows é a pasta `sagadeck` dentro de Documentos (antes, `~/sagadeck`, direto na
pasta do usuário). `defaultLibraryRoot`: `SAGADECK_HOME`, senão `<Documentos>\sagadeck` no Windows (a pasta
conhecida "Personal" do registro: a que o Explorer mostra, inclusive redirecionada; aqui é
`C:\Users\narum\OneDrive\Documents`, então a biblioteca sincroniza com o OneDrive) e `~/sagadeck` fora dele.
`migrateLegacyLibrary` (na partida do `sagadeck`): move a biblioteca antiga inteira (mesma unidade: instantâneo) e
deixa uma junção no caminho antigo; não mistura se as duas têm conteúdo; falhou, a antiga continua valendo (nunca
abre vazia). CLAUDE.md, README, ajuda, MCP e Python atualizados. Teste: `test/library.test.js`.

## Apresentação da Maria Clara em inglês — 08/10/2026

Gerada pelo caminho do Studio ("…que a Maria Clara vai fazer no ICFM10 sobre o artigo dela, em inglês"): 19 slides,
`lang: en`, autor "Maria Clara Fava et al.", sem votação, figuras inteiras, trade-off em gráfico. Problemas do motor:

- **Números em português num deck em inglês**: contador, gráficos, mapas, calculadora e laboratório de decisão
  formatavam sempre em pt-BR ("1.403", "0,93"). `src/locale.js`: o idioma do deck (`lang`) vale para os números
  (build define antes de renderizar; na apresentação, `<html lang>`); ler "1,403"/"37.67%" segue o idioma. Deck
  gerado sem `lang` ganha o idioma pelo texto (`guessDeckLang`, palavras de ligação).
- **Precisão do paper perdida**: "0.90" sem aspas virava 0.9 no YAML (tabela do NSE em inglês com 0.9, 7.8, 0.2).
  Em tabela (rows/head/cells) e em value exibido, o número fica como foi escrito; dado de gráfico continua número. E o
  gráfico mostrava 1 casa abaixo de 10 (0.93 → 0.9) e 0 acima (37.67 → 38): agora as casas do próprio valor, até 2.
- **Texto vazando da caixa do diagrama flow** ("Low-lying areas near the drainage network" a 36 px fixos):
  `boxFontSize` simula a quebra e desce até caber.
- Nome da pasta cortado no meio da palavra ("…Urban Flood Predic"): corta no último espaço antes de 80.
- Sem texto do motor em português no HTML (conferido no build: nenhum rótulo automático em pt).

## Retorno dos decks do ICFM10: autor errado, figura cortada, "^^≠^^", votação — 08/10/2026

- **Autor**: os dois decks saíram "Narumi Abe" (o autor das Preferências), não Maria Clara Fava. Bug da rodada
  anterior: a regra "autor = a pessoa apresenta o próprio trabalho" + o autor padrão viraram "quem usa é o autor do
  artigo". Agora, com documento anexado, o autor das Preferências não vai como padrão nem é colado no deck; regra:
  quem assina é quem assina o documento (o primeiro apresenta em `autor`; em `livre`, quem apresenta vai em `role`).
- **Figura 2 cortada**: a caixa da visão era larga demais (a imagem cobria 44% dela) e a regra exigia 50%: caía no
  corte pela camada de texto, que comia a ponta do mapa e trazia um pedaço da linha de cima. Imagem de tamanho de
  figura (≥ 1% da página) que cobre um quarto da caixa já é a figura.
- **"^^≠^^"** no compare: o `vs` saía com esc(), sem a marcação. Corrigido, e a revisão de texto agora renderiza o
  slide e acusa qualquer marcação crua visível (^^, ==, **), fora dos slides de código: pega os outros campos assim.
- **Votação no journal club**: apresentação acadêmica (deck de artigo, congresso, defesa, seminário, journal club)
  não leva enquete, votação, quiz ou cronômetro sem pedido de interação: regra no prompt e achado da revisão.
- Prova ao vivo ("apresentação que a Maria Clara vai fazer no ICFM10 sobre o artigo dela"): capa "Maria Clara Fava et
  al. · UFSCar", `autoria: autor`, sem votação, Figura 2 inteira. Achou outro defeito: duas capas idênticas (até as
  notes; o "slide repetido" que o diário já registrava). Cópia exata sai na geração (`dropDuplicateSlides`), e
  mesmo layout + mesmo título vira achado da revisão.
- **Opinião sem foco** ("o que você acha desse slide?"): a foto do slide puxava a resposta para o design. Regra 1c:
  responder conteúdo PRIMEIRO (fiel ao material? falta o porquê, o número? o que a banca pergunta?) e forma depois,
  com opções para aprofundar cada um; foco dito pela pessoa vale sozinho. Ao vivo, no slide da Tabela 1 do ICFM10:
  apontou que o achado mais forte (HYMOD empata com o HEC-HMS) passava batido e só depois o texto lateral longo.
- Biblioteca: os decks de teste do ICFM10 superados foram para a lixeira (recuperáveis); ficaram o do congresso
  (Maria Clara) e o do journal club.

## Leitura crítica do material, autoria e origem do conteúdo — 08/10/2026

Retorno: num brainstorm pelo chat, a IA achou o que a geração não achou (o resumo do ICFM10 promete variáveis
socioeconômicas que o método não usa; o trade-off pico × volume escondido na tabela; o donut mostrando composição da
amostra como resultado). Pedido: por que a geração não fez isso; é válido "interferir" se o original é ruim; botão de
criticar; saber o que é do paper e o que é inclusão do sagadeck; e liberdade total fora do caso "autor apresenta o
próprio paper".

- Causa: a geração lia o paper para APRESENTAR, nunca para criticar. Agora há uma etapa de **leitura crítica**
  (`src/ai/critique.js`): inconsistências, achados que passam batido, perguntas prováveis, limitações, slide que
  representa mal o material e pontos fortes, cada item com trecho LITERAL do material, conferido pelo código (letras
  e números, tolerando os espaços e hifens do PDF): sem trecho no texto, o item é descartado (anti-alucinação).
  Roda na geração quando há documento (vai no pedido e fica em `.sagadeck/leitura-critica.json`) e no botão
  **Leitura crítica** do chat (`/api/ai/critique`, ícone scan-search): vira mensagem com opções, nada muda nos slides,
  e acompanha os próximos pedidos rotulada "feita pelo sagadeck, NÃO pelo autor".
- **Autoria** (`context.autoria`): `autor` (congresso, simpósio, defesa: fiel ao material; o achado do material vai ao
  slide, a crítica e as perguntas vão nas notes "Prepare-se: …") × `livre` (aula sobre o trabalho de outros, journal
  club, resenha, divulgação, tema geral: conteúdo próprio liberado). Responde à dúvida "é válido interferir": no
  modo autor, o sagadeck não reescreve a ciência do paper, prepara o autor; a decisão de mudar é da pessoa.
- **Origem** (`provenance: material | derivado | proprio` + `provenanceNote`; `origin` já era a etimologia do layout
  definition): selo na miniatura do Studio para o que o sagadeck incluiu ou calculou; a apresentação não mostra.
- Ao vivo (deck do ICFM10): 12 pontos em 153 s, todos com trecho conferido; repetiu os do brainstorm e achou mais:
  PEV e PBIAS idênticos na Tabela 1 (conferido no PDF: mesmas linhas, sinais trocados), validação com um evento só,
  resumo promete "flood extents" que não existem, bacia "com poucos dados" muito bem instrumentada, referência
  interna errada (2.1.1 × 2.2.1).
- Geração ao vivo, mesmo paper, dois pedidos: "apresentação oral em congresso" → `autoria: autor`, todo slide com
  provenance, o trade-off virou slide ("Volume simples, pico detalhado"), o donut virou "a base de treino tem três
  classes bem desiguais" (derivado), e a crítica foi para as notes como "PREPARE-SE" (PEV = PBIAS no slide da
  tabela, socioeconômicas no das variáveis, referência errada nas limitações). "Journal club da disciplina" →
  `autoria: livre`: a crítica virou conteúdo marcado `proprio` (Prometido × entregue; Os números que não fecham;
  Três furos no desenho; pergunta para a turma). Essa levou 43 min: o modelo travou pensando e a tentativa sem
  raciocínio (da rodada anterior) destravou a tarefa.
- Testes: `test/critique.test.js` (trecho conferido × inventado, bloco no prompt, geração com a leitura),
  `test/studio-critique.test.js` (botão, trecho na conversa, arquivo salvo, próximo pedido leva a leitura, selo).

## O chat pode VER o material anexado (ver:) — 08/10/2026

Retorno: no chat do deck do ICFM10, "vc tem acesso ao pdf?" levou a IA a dizer que "consegue ler as figuras
recortadas e abrir a página inteira", o que era falso: do documento o chat recebe o texto e o inventário (legendas,
caminhos), nunca as imagens. Sem jeito de olhar, ela não conseguia consultar o material de verdade.

- `ver: [arquivos]` na resposta da IA (como o `test:` dos slides api): o Studio carrega as imagens pedidas (só de
  dentro da pasta da apresentação, até 6: recortes em items[].image e páginas inteiras em pages), chama de novo com
  elas anexadas ("material: <arquivo>") e a IA responde já vendo; até 2 rodadas (`lookableFiles`, `ai-chat-route.js`).
- Regra no formato da resposta: pedir para ver antes de responder sobre o que a figura mostra; nunca dizer que viu o
  que não pediu; nunca dizer que não tem acesso ao material.
- Ao vivo (deck do ICFM10, modelo de verdade): "qual a ordem das 5 variáveis mais importantes da Figura 4b?" — pediu
  o recorte e a página 6, leu hand ≈ 100, elevation ≈ 45… e avisou que são leituras do eixo; 22 s, nada mudou.
- Teste: `test/document-visuals.test.js` (pede, recebe a imagem rotulada, caminho para fora da pasta recusado).

## Paper para congresso, 2ª rodada: equações, redesenho com volta ao original, dados corrompidos — 08/10/2026

Pedido: equação não precisa de recorte se vira LaTeX (e, se precisar, que o recorte preste); gráfico pode ser
redesenhado, desde que o chat consiga voltar ao original; a IA cria gráficos dos números do texto por iniciativa.
Teste com o paper do eucalipto (o das equações) e o ICFM10 (Aricanduva).

- **Equação pela camada de texto** (`equationGroups`, `assignEquations`): equação de Word/LaTeX é texto (𝑑, 𝜋, ∑);
  os grupos de caracteres matemáticos da página dão a caixa exata (sem a vizinha, a prosa e o "(4)"). A visão punha
  as caixas deslocadas uma equação para baixo (a Eq. 4 sumia e a 5 levava o recorte e o LaTeX da 6): agora casa
  pelo número impresso, depois pelo conteúdo (letras do LaTeX × texto do PDF, 𝑅𝑀𝑆𝐸→RMSE), por último pela
  posição. Numerada que a visão esqueceu entra; item repetido sai; equação como imagem cai na régua da imagem.
- **Releitura no recorte** (`transcribeEquation`): cada equação é relida na própria imagem; a leitura que encolhe
  (recorte parcial) não troca a da página; "\quad (3)" sai. Com LaTeX, o inventário vai ao modelo SEM o arquivo do
  recorte (`promptInventory`): o slide usa a fórmula nativa. Resultado: 16/16 equações dos dois papers corretas.
- **Tabela sem rows** relida no recorte (`transcribeTable`): vira table nativa e a cobertura reconhece.
- Um item com caixa inválida sai sozinho (antes a página inteira virava uma imagem só).
- "Figure 5 shows…" não é legenda (`captionLineStrict`): parava de cobrar "legenda sem arte" na página.
- **Redesenho com volta**: `sourcePx` (tamanho nativo da imagem embutida) no inventário; regra: esquema → diagram
  nativo, gráfico com valores no paper → chart nativo, gráfico sem dados/ilustração → modelo de imagem, mapa e foto
  ficam. O redesenho guarda `original` no elemento (antes o caminho sumia com o image_ref); reconstrução nativa
  leva `sourceFigure` no slide; "volte ao original" troca o visual por ele (REFERENCIA). Iniciativa: números do
  texto/tabelas viram chart criado pela IA, com `source`.
- **Dado corrompido**: `[07/04/2017, HEC-HMS, 0,93, 0,97]` partia "0,93" em 0 e 93 (YAML) e a tabela do ICFM saiu
  com NSE 0 e R² 93, colunas deslocadas, sem erro. `quoteFlowDecimals` põe entre aspas "dígitos,dígitos" sem espaço
  em lista separada por ", " (`[10,20,30]` fica); `sanitizeCheck` recusa tabela com linha de tamanho diferente do
  cabeçalho (volta para a IA).
- **"NaN" e "km^2^"**: `number` com valor "37,67%" ou "1521 km^2^" mostrava NaN (o contador só aceitava número):
  `parseCounterValue` lê no formato brasileiro e separa prefixo/sufixo; expoente/índice viram ²/₂; valor do
  `stats` passa pela marcação.
- **Título encolhido pela IA** (titleSize 40 "para dar espaço à figura"): regra no prompt e achado da revisão.
- **Tarefa parada horas em "Pensando…"**: o relay manda "estou vivo" e o raciocínio enquanto o modelo pensa, e cada
  pedaço zerava o relógio; um modelo em laço nunca terminava. Agora o limite da 1ª palavra de TEXTO (600 s) vale
  mesmo com os sinais de vida (`AI_THINKING_LOOP`), e a chamada ganha uma tentativa a mais SEM raciocínio (a mesma
  tarefa sai em segundos). Aconteceu duas vezes seguidas com o DeepSeek Flash na conferência de cobertura.
- **Checagem de números** (`unsupportedNumbers` + `checkNumbers`, na geração e no chat com anexo): todo número
  visível (texto e dados de gráfico/tabela) que não está no material volta para a IA corrigir, mostrar a conta ou
  tirar; arredondamento do valor do paper vale, contagem pequena não é cobrada. Pegou "ANOVA p = 0,109" que o artigo
  do eucalipto não tem (lido errado do gráfico); nos outros dois decks, nenhum alarme falso.
- Resultado (mesmos PDFs): eucalipto com o fluxograma como diagram nativo (`sourceFigure`), equações nativas com as
  variáveis explicadas, dois gráficos criados dos números do texto; ICFM10 com a tabela certa, km² e todas as
  figuras. "Volte para a figura original" pelo chat (modelo de verdade) trocou o donut pelo mapa em 8 s, citando o
  `sourcePx` baixo. Regra nova: gráfico criado por iniciativa não substitui mapa ou foto.

## Apresentação de congresso a partir de paper: figuras, cobertura e frase gigante — 08/10/2026

Retorno de quem usa: figuras ignoradas, com a legenda junto, cortadas ou fora de proporção; conteúdo fraco (contexto,
objetivos, metodologia); slides de uma frase gigante; a IA sem senso crítico/ferramenta para se corrigir. Método:
dois PDFs quaisquer (Rev. Bras. Cartogr. 2025, volume de eucalipto por ETR; RBGF 2020, LiDAR na bacia do Beberibe)
gerados pelo caminho do Studio (`/api/ai/context` + `/api/library/decks/ai`, modelo do modelrelay), tópico
"Laboratório congresso" da biblioteca. Os decks são diagnóstico, não foram retocados.

- **Recorte pela imagem embutida** (`snapToImages`, `pdfLayout` em `src/ai/document-visuals.js`): o pdf.js dá a
  posição exata de cada imagem da página (lista de operações). Caixa da visão sobre imagem(ns) vira a imagem (ou a
  união dos painéis): sem legenda, sem "Fonte:", sem prosa, proporção do original. Antes: legenda de cima curta
  (ABNT, centralizada) entrava sempre (a regra exigia linha mais larga que meia figura), "Fonte: Os autores" e o
  parágrafo de baixo também, e os mapas de dois painéis do RBGF saíam em dois recortes com tira do vizinho.
  Fundo de página escaneada e logo pequeno não servem de régua; prancha enorme fica com a caixa aparada.
- **Duplicatas fundidas** (`mergeDuplicateCrops`): dois itens no mesmo recorte viram um, com a legenda numerada.
- **Camada de texto** (gráfico vetorial, tabela, equação): legenda de cima de qualquer largura e linha de crédito
  (`creditLineStart`: Fonte/Source/Elaboração) ficam de fora; linha de prosa passando pela borda não estica o recorte.
- **Margem branca aparada** no recorte (`cropRegions` com `trim`; a tinta é medida antes de aparar) e o inventário
  traz `width`/`height` do recorte. Cache do inventário: `visualVersion` 5 (recorta de novo o que já foi anexado).
- **Cobertura** (`uncoveredVisuals` + `coverDocumentVisuals` em `deck-ai.js`): `ensureVisualCoverage` existia mas
  ninguém chamava. Agora, depois do rascunho, figura/tabela NUMERADA sem slide volta para a IA encaixar no ponto da
  narrativa (uma rodada; o resto vai em `coverage.missing`, sem slide enfiado no fim). Vale no Criar com IA e no
  chat quando a mensagem anexa documento e a resposta monta a maior parte do deck (`changed` exposto pelo editDeck).
- **Revisão de texto sem visão** (`auditText` em `src/ai/quality.js`, sempre roda dentro da revisão): frase longa
  em statement/headline/quote e excesso de telas de frase única (mais de 2 ou 15%) viram achados para a correção.
- **Legenda colada na imagem** (`clearCaptionEdges`): a caixa de texto do pdf.js termina na linha de base, então as
  pernas da legenda logo acima da imagem entravam como uma tira; linha de legenda/crédito na borda empurra a borda.
- **Motor**: `full` com figura do documento (ou `fit: contain`) e texto vira a composição de figura inteira (título
  no alto, legenda embaixo; decidido em `inferLayout` via `fullAsFigure`, para a casca do slide não ser a de página
  inteira que escondia o título), mesmo com `overlay: none`; `headline` longa sai em title/h2 (era o objetivo
  inteiro a 300 px); cartão cujo texto é só fórmula mostra a fórmula grande (`cd-math`).
- **Proporção e corte**: figura do documento é sempre `contain` (o cover automático de até 20% comia eixo e
  legenda; `fill`/`stretch` achatavam o mapa). `crop:` em caixa de outra proporção esticava: a apresentação mede a
  caixa e encaixa a região inteira (`fitCrops` em `src/runtime/fit.js`, `data-crop` no `<img>`).
- Antes × depois (mesmos PDFs, mesmo modelo): Beberibe 16 → 24 slides, 4 → 7 figuras, nenhuma com texto por cima,
  objetivo virou lista com três objetivos, arco completo; eucalipto 21 slides, todas as figuras limpas (antes com
  legenda, "Fonte" e prosa no recorte). Ainda aberto: recorte de equação pela visão é impreciso (pega a vizinha e a
  prosa); como toda equação vem com `latex`, o slide usa a fórmula nativa e o recorte não aparece.
- Testes antigos que falhavam na main: `api-ai-loop` (o mock não previa a decisão de pesquisa do chat, fase 2) e
  o da exploração (mesmo achado em todas as rodadas, desde a regra "achado idêntico encerra as tentativas").
- **Prompt**: arco de apresentação de paper (contexto com dado, lacuna, objetivo geral/específicos em slide de
  conteúdo, área/dados, método com variáveis e unidades, cada figura numerada no seu resultado com título-afirmação,
  discussão, conclusões, limitações) e composição pela proporção do recorte. REFERENCIA: `full` e `headline`.
- Testes: `test/document-visuals.test.js` (PDF real do Chrome com legenda, imagem 2:1, "Fonte" e painel duplicado;
  snap, fusão, crédito, legenda curta, borda da legenda, cobertura pelo chat), `test/ai.test.js` (cobertura na
  geração, auditText), `test/engine.test.js` (full, headline, cartão com fórmula), `test/fit-wide.test.js` (figura
  do documento contain, crop sem esticar, no navegador).

## Avaliação fora da hidrologia — 03/10/2026

- Plano: `docs/PLANO-TESTE-DESINFORMACAO.md`.
- Tema novo: Como uma mentira vira verdade na internet? Duas versões, executiva e estudante, geradas pela API do Studio na biblioteca oficial.
- Em curso: geração real com imagens e conferência visual. Casos fictícios e referência conceitual da UNESCO; sem reescrita externa de slides.
- Verificação planejada: conteúdo e sequência, controles e estados extremos, estudo, erros de navegador e composição. Falhas serão registradas antes de corrigir o produto.
- Executiva gerada e corrigida pelo próprio chat: gráfico com zoom/hover, escalas completa e recortada, caminhos com retorno. Conferência visual aprovada; navegação e cálculo testados no navegador e estudo offline.
- Falhas reproduzidas e corrigidas no produto: resultado válido perdido em queda do provedor durante reparo; revisão sem avanço por slide e sem relatório persistido; painel de calculadora cortado com duas curvas/comparação.
- Estudantil independente guardada como diagnóstico por mudar exemplos/ordem e manter duas pendências. Versões finais com 11 slides: editorial e Bauhaus; conteúdo, dados, fórmulas e navegação iguais, conferência visual aprovada e zero erros JavaScript nos dois HTMLs.
- Contagem anti-sono também corrigida: texto de `consulta`, que só vai para estudo, não conta como texto do palco. Relatórios pessoais e apresentações permanecem na biblioteca; código e plano vão para GitHub após validação final.

## Exportação PPTX/PDF — 03/10/2026

- Diagnóstico com decks sintéticos de dois slides; a aula de 80 slides não foi usada nesta rodada.
- LaTeX no PowerPoint preservado como imagem em resolução dupla: fórmula isolada ou parágrafo inteiro com fórmulas, mantendo também o texto entre elas. Evita reconstrução incorreta de frações, expoentes e fontes KaTeX.
- Exportação aguarda gráficos, diagramas, fontes e decodificação de imagens, com limite de 15 s na preparação. PDF também espera as imagens das páginas antes de imprimir. Navegadores são fechados em finally, inclusive em erro.
- PPTX emite estado inicial oculto para entradas por clique. Widgets escapam fechamento de script. Falha de salvar retorna 500; arquivos temporários têm identificador único e são limpos.
- PDF preserva o tema por padrão; a preferência explícita de impressão clara continua disponível.
- Verificação pontual: downloads HTTP PPTX/PDF válidos, PDF aberto por parser com duas páginas e imagens em ambas; PowerPoint instalado abriu e renderizou frações, integrais, derivadas e fórmulas inline. Entradas e saídas abriram com três efeitos. Downloads pelo menu do Studio também passaram.
- Validação final: npm test, 700 testes (680 passaram, 20 pulados, zero falhas); regressão adicional de preferências passou. Bundle Python atualizado. A preferência local PDF claro foi desativada pela API do Studio para manter o visual do HTML.
- Otimizações de singleton, cache e refatorações amplas ficaram fora desta correção, para manter diagnóstico e mudança pontuais.

## Recriação visual fiel — 02/10/2026

- Em curso: testar a aula PPTX de 83 slides pelo próprio SagaDeck, sem retoques manuais no deck. Importada uma cópia na biblioteca, tópico Laboratório de recriação.
- Regressões encontradas: prompt de recriação proibia image_prompt enquanto outras regras exigiam imagens; escritor recebia apenas itens do plano, perdendo o pedido visual completo. Teste reproduziu a proibição.
- Plano: corrigir instruções gerais; gerar a aula pelo chat; conferir conteúdo e figuras contra originais; corrigir falhas reproduzíveis no produto; repetir avaliações reais de capacidade/algoritmo/consulta; suíte, bundle, publicação e reinício na 3517.
- Referências visuais: acabamento de maquete/corte 3D para conceitos; mapas específicos precisam manter evidência, sem inventar geografia.
- Implementado: referências anexadas chegam à visão no planejamento, pedido completo chega à escrita; geração revisa automaticamente quando há ferramenta de revisão e admite três correções; resultado revelado tem estado explícito; curvas têm contraste e traços distinguíveis.
- Revisão: JSON com texto ao redor é aceito; indisponibilidade registra motivo, e achados contraditórios passam por confirmação semântica. Não se declara conferido quando uma revisão falha.
- Testes específicos desta frente: 57 passaram. A suíte anterior encontrou uma asserção desatualizada que examinava a revisão como se fosse o pedido de geração; ajustada para conferir a chamada correta.
- Avaliações reais: capacidade teve revisão posterior aprovada; algoritmo e consulta ainda têm pendências. A validação integral da aula permanece pendente; o pedido de 03/10 mudou a prioridade para exportações pequenas, sem novos testes na aula longa.

## Experiências exploráveis e autonomia — 02/10/2026

Plano completo e estado de retomada: `docs/PLANO-EXPERIENCIAS.md`. Pedido do usuário: implementar as sete frentes, registrar avanços e publicar etapas validadas.

- Publicado e mergeado: PR #115, main 5b7e20d. Sem mudanças em decks pessoais ou no Oracle.
- Implementado e validado: calc com cenários, comparação congelada, restaurar, previsão/revelação, curva ligada às entradas e selo ilustrativo; formulário; demo Explore uma ideia; estados e explicações no material de estudo.
- Agente: validação de fórmulas em estados/extremos; `review: true` fotografa estados e devolve achados ao agente para uma correção. Revisão indisponível permanece explicitamente sem conferência.
- Elementos: continuidade de posição/tamanho por nome entre cenas, respeitando movimento reduzido.
- Direção de arte: variantes podem propor tema para o conjunto com composição do conteúdo real, aplicação explícita na escolha.
- Avaliação: cinco pedidos independentes em `src/ai/evaluation.js`, execução real por `tools/evaluate-autonomy.mjs`, relatórios e decks na biblioteca. Tokens/custo medidos em escopo isolado por tarefa, quando informados pelo provedor; ausência não vira zero.
- Validação final: npm test, 691 testes; 671 passaram, 20 pulados, zero falhas. Testes específicos adicionais de Studio, IA, contraste, continuidade, estudo offline e medição concorrente passaram. Bundle atualizado.
- Avaliação real: duas rodadas de cinco casos. Segunda rodada: geometria e narrativa conferidas; demais com pendências explícitas. A avaliação identificou contraste ruim de resultados alterados e escala ausente na curva: corrigidos no motor, sem retocar os exemplos.
- Formulário extraído para calc-fields.js; prévias de direção em iframe isolado (art-preview.js), sem vazamento de CSS. Limite de tamanho do formulário reduzido.
- Porta atual por instrução expressa do usuário: 3517. O processo SagaDeck anterior foi substituído; wotan-router em 3001 preservado. Demo: /editor?model=explorar. Sem deploy remoto.


## Senso crítico da recriação: a IA ganha ferramentas para se corrigir — 02/10/2026

Feedback da versão "escalafobética" da Aula 1 (relevo): foco guiado todo fora do lugar, mapa do posto
fluviométrico ainda em xerox, hidrograma com a imagem da equação de P, "[object Object]", texto gigante, superfície
3D de enfeite ("girar o relevo") e o ciclo em camadas de cabeça para baixo. A conferência visual procurava
informação faltando, não desenho, e a IA não tinha como medir onde ficava cada coisa na figura.

- **Foco guiado ancorado pela visão** (`src/ai/ground.js`): depois das imagens prontas, a visão localiza cada
  destaque na imagem (caixa em % da figura); recriação e geração usam. Antes as coordenadas eram chutadas.
- **A visão vê arquivo por arquivo**: com mais de uma imagem no slide, cada uma vai com o nome; cada figura sai com
  `arquivo`. A escritora recebe `(arquivo X)` antes de cada figura (pegava a fórmula no lugar do hidrograma).
- **Redesenho automático** da ilustração escaneada/pixelada que a escritora deixou como estava (`image_prompt` +
  `image_ref`, copiando os rótulos lidos pela visão).
- **Imagem de equação** num slide novo volta para a correção: escrever em LaTeX.
- `table.side` aceita elemento (era o "[object Object]"); `statement` não deixa a IA pôr frase longa em `h2`.
- Infográfico **`camadas`**: perfil físico de cima para baixo com setas de fluxo (`flows`). Regras: camadas
  físicas vão nele; `plot.surface` só com função/dado do material.
- Conferência visual com "crítica de desenho": destaque fora do lugar, figura errada, equação como imagem, gráfico
  de enfeite, ordem física invertida, texto gigante.
- Testes: `test/camadas.test.js`, `test/transform.test.js` (visão por arquivo, equação, foco ancorado),
  `test/retorno-recriada.test.js`.

**2ª rodada (mesmo dia): a autocrítica não respondia.** A conferência visual falhou em 5 lotes ("resposta sem JSON").
Sondado com o modelo de verdade: com o lote inteiro numa chamada, o DeepSeek Flash pensava até estourar o limite
(16 mil tokens de raciocínio, texto vazio) ou aprovava tudo sem olhar; até de um slide só entrava em laço. Sem
raciocínio, a mesma conferência sai em 1–2 s e acha o que importa (título repetido, metade vazia, texto cortado).

- `chat(..., { think: false })` pede `reasoning: {enabled: false}`; provedor que recusa o campo (400) leva a chamada
  de novo sem ele, e o sagadeck lembra. Usado na conferência visual e na localização dos destaques.
- Conferência visual: um slide novo por chamada (com o original dele), 4 em paralelo; slide sem resposta fica só ele
  sem conferência (aviso no relatório); a resposta sem JSON fica em `falhas/conferencia-N.txt`; vale a lista de
  problemas mesmo com `"ok": true` junto (o achado se perdia).
- Foco guiado: a mesma figura com os mesmos destaques não é localizada de novo a cada rodada de correção (memo);
  `figure: caminho.png` (texto, não objeto) também é localizada (o Vacununga ficava com as caixas chutadas); a visão
  que não responde vira aviso no relatório; caixa do tamanho da figura inteira não vale (fica a da escrita).
- Redesenho automático: sem a moldura de print (janela do leitor de PDF, barra de ferramentas); o texto alternativo
  é o que a figura mostra, não o pedido ao modelo de imagem.
- Dois gráficos em colunas lado a lado dividem a linha por igual (o primeiro saía minúsculo).
- Limites da tarefa: `calls` (300) conta só as chamadas que escrevem e pensam; as de olhar (`think: false`) têm o
  próprio `looks` (2000). A rodada 3 parou no "Limite de 300 chamadas" com a conferência por slide.
- Rodada 4 (19 min, completa): os 7 pontos do retorno resolvidos. Duas regras novas de prompt: tema com identidade
  própria não leva paleta sem pedido de cores ("sóbrio" virou `grafite` e o relevo saiu claro, destaques em tarja
  cinza); quebra de linha do PowerPoint no meio da frase é juntada (frases picadas nos slides de chuva de projeto).
- Rodada 5 caiu no plano: "nada chegou em 180 s" duas vezes. O modelrelay descartava os keep-alives e o
  raciocínio, e o modelo que pensa por minutos parecia morto. modelrelay 0.2.2 (naruminho/modelrelay#8): evento
  `alive` e o comentário SSE `: alive` enquanto ele pensa; aqui `MIN_MODELRELAY` e o extra `ia` foram para 0.2.2.
- Ainda abertos: slides repetidos às vezes (declividade em dois slides seguidos); equação pequena num canto
  (IDF de São Carlos); o modelo pede pouca ilustração nova mesmo quando o pedido quer "imagens realistas".
- Testes: `test/llm-raciocinio.test.js`, `test/ground.test.js`, `test/blocks-graficos.test.js`, `test/transform.test.js`.

---

## Pesquisa na web para gerar material (estilo deep research) — fase 1 feita em 02/10/2026

- Aprovado e pedido: a IA distingue quando o que ela sabe basta (hash table) e quando pesquisar (ranking das IAs de
  fronteira, calendário dos próximos filmes, tecnologia que só existe em artigo: o paper, e o preprint se o artigo
  estiver fechado), e transforma o material denso em reportagem (Superinteressante), lendo vários formatos.
- `src/research/research.js`: decidir (com a data de hoje; acadêmico ou não; buscas) → buscar (DuckDuckGo e, no
  acadêmico, a API do arXiv) → escolher as fontes (oficial, acadêmica, imprensa séria, referência; descarta blog,
  fazenda de conteúdo, agregador) → ler (`fetchUrlDoc`: página, PDF até 15 MB, docx, pptx, xlsx, texto; artigo que só
  deu o resumo vai ao preprint) → anotar (fatos com o trecho). Materiais [F1]… num bloco próprio ("FONTES DA PESQUISA
  NA WEB"), a regra de citar no slide e fechar com `references`, e tudo em `contexto/pesquisa/` (fontes.json,
  notas.md, o texto de cada fonte). Sem internet ou `SAGADECK_WEB=0` (a rede do banco): avisa, não inventa dado
  recente e pede links/anexos. Preferências › IA › "Pesquisar na web quando precisar"; `sagadeck new --sem-pesquisa`.
- Ligado na geração de deck (Studio: Criar com IA e biblioteca; `sagadeck new --prompt`). Falta (fases 2 e 3): no chat
  de um deck aberto; figuras de dentro dos artigos e prints de páginas oficiais; outros buscadores.
- Testes: `test/research.test.js` (web e LLM falsos; ao vivo, a decisão nos 4 exemplos da pessoa).

### O plano original (02/10)

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
- Casos de 02/10 (decks em `Pedidos de teste/`):
  - **Prateado**: o `prata` achado sem graça. Tema novo **`aluminio`**: a cara
    de lançamento de aparelho premium (prata metálico com brilho de estúdio, alumínio escovado, título
    cromado com a cor sólida em `color` para o fiscal medir, disco de metal polido na capa e na seção, cartões de
    alumínio com chanfro, seção em azul-pacífico, escuro em grafite).
  - **história dos videogames em 5 slides, temática, o último como mapa de Mario Kart visto de cima**: saiu no tema
    alegre genérico e o último era um ciclo de bolinhas. Infográfico novo **`pista`** (circuito visto de cima: grama,
    zebra, asfalto, largada quadriculada, caixas de item; os itens como marcos da volta e as placas em fila em cima e
    embaixo, sem encavalar) e tema **`arcade`** (tela de tubo com linhas de varredura, neon, títulos em Press Start 2P,
    rótulos em VT323, cartões de 8 bits, chão de tijolos na capa; fontes OFL embutidas).
  - **transformers denso como aula**: bom de conteúdo (intuição, tokens, atenção com números, softmax, Python, tabela
    da próxima palavra, temperatura, perda, limites). Ficou para depois: fluxo de 10 a 12 caixas em fila sai miúdo.
  - **calendário dos próximos filmes da Marvel** (pesquisa): a IA fez linha do tempo porque não havia calendário.
    Layout novo **`calendar`**: um cartão por mês com evento, o mini calendário com os dias marcados na cor do tipo
    (Filme, Série: cores de item do tema, com legenda), a lista embaixo e o cartão "sem data". A versão nova da
    pesquisa leu 7 fontes e montou o calendário de verdade.
  - correção: a igualdade de tamanho entre cartões irmãos agrupava pela primeira classe do texto, que às vezes é a
    genérica `t` (todo texto do cartão ia para o menor: o mês do calendário com 15 px); agora agrupa pelo papel.
  - **versão escalafobética da aula da Maria** (imagens realistas e tecnológicas, gráficos de ficção científica sem
    néon, 3D bonito como um bloco de terreno): tema novo **`relevo`** (grafite profundo, curvas de nível, cantoneiras
    de mira, vidro fosco, rótulos técnicos em monoespaçada, título leve). A IA escolheu o relevo, gerou 11 ilustrações 3D realistas
    e 3 gráficos 3D; mas pôs a paleta `safira` (clara) e o texto saiu escuro no fundo escuro: as peles com fundo
    desenhado (relevo, arcade, aluminio) pintavam cores fixas e ignoravam a paleta; o fiscal não viu (mede contra a
    cor declarada). Agora o fundo, o metal e o vidro saem de --bg/--fg/--hi/--surface; `test/temas-paleta.test.js`
    mede o PIXEL do fundo (relevo+safira dava 1,22). A referência avisa que paleta clara deixa o tema escuro claro.
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
- Correção adicional motivada pelo print: calc com oito resultados passa a usar grade adaptativa, preservando curvas e controles; reprodução automatizada e conferência no deck real passaram. Relatório de geração extraído para módulo próprio, mantendo o limite de tamanho do Studio.
- Validação final da avaliação de narrativas: 705 testes, 685 passaram, 20 pulados, zero falhas. Bundle atualizado e servidor local reiniciado na 3517.

### Aulas técnicas — primeira etapa validada (03/10/2026)
- Rolagem até a linha ativa do codewalk e revisão visual do estado real do palco corrigidas. Suíte: 707 testes, 687 aprovados, 20 pulados, zero falhas; bundle atualizado.
- Próxima etapa solicitada: eliminar piscada no traço, ampliar exploração de grafos e experimentos de programação, integrar imagens e capturas reais da pesquisa. As aulas servem para avaliar recursos gerais, preservando conteúdo existente.

### Laboratórios interativos — implementação e validação em curso
- Causa da piscada reproduzida: a entrada do quadro completo reiniciava em cada passo. Removida apenas no algo, preservando destaque de escritas/comparações.
- Recursos gerais graphlab e codelab implementados, catalogados, formulários de Studio e referência da IA atualizados. Rede com cartões semânticos, menor custo, BFS, vizinhança, zoom/pan, foco, arraste, edição de custos e nós e restauração. Código usa o interpretador offline existente e aceita alteração de programa/entrada, sem prometer pacotes Python externos.
- Pesquisa conserva URLs de imagens observadas; importador de imagens reais e captura pública com navegador, arquivos locais, proveniência e erros explícitos. Não desenhar interfaces fictícias no lugar de screenshots.
- Material de estudo HTML incorpora experiências. Teste revelou history/wake lock inválidos no iframe sandbox; corrigido com isolamento mantido. 65 testes de motor/laboratórios aprovados, zero falhas; 29 regressões de pesquisa/exploração passaram na rodada anterior.
- Chat nativo aplicando novos recursos à aula de grafos, com URLs reais da documentação Neo4j e galeria NetworkX. Nenhuma edição do YAML por script próprio.

## Próxima etapa autorizada — execução, coleções e mídia
- [x] Python nativo e JavaScript nativo, com saída real e erros visíveis.
- [x] Coleções de APIs: importar/adicionar, selecionar serviço, editar pedido e executar; avaliar expansão para PDF/PPTX.
- [x] Player do YouTube e importação opcional de vídeo MP4 para a biblioteca.
- [x] Quadro isolado de HTML/CSS/JavaScript para animações personalizadas geradas pelo agente.
- [x] Validar código e interações reais, documentar limites, publicar e reiniciar na porta 3517.

- Laboratórios validados: suíte completa com 716 testes, 696 aprovados, 20 pulados e zero falhas. Formulários extraídos para lab-fields.js; teste de conteúdo longo preserva identificadores e programas, sem duplicar nós. Regressões específicas: 26 aprovadas.
- Aula de grafos ampliada pelo chat, preservando os slides anteriores: dois grafos exploráveis e telas reais oficiais de Neo4j Browser e galeria NetworkX, importadas localmente com proveniência.

### Execução e mídia — integração em curso
- Etapa anterior publicada e mergeada no PR #119 (a234dbb).
- Implementados codelab Python/Node nativos, coleções Postman/seletor e expansão estática no Studio, playground HTML/CSS/JS isolado e player YouTube/MP4 local. Formulários dedicados e permissões do chat reutilizadas.
- Download real validado com vídeo da documentação YouTube: MP4 de 57.498.089 bytes, áudio e vídeo reunidos via FFmpeg. Ferramentas instaladas em AppData/SagaDeck, checksum yt-dlp validado. Testes de navegador/Studio em andamento.

- Novo caso do usuário: divulgação do hackathon AI Apps. Usuário esclareceu que é somente brainstorm, sem gerar apresentação. Dados de agenda/regulamento ainda inexistentes; autorizou exemplos fictícios claramente identificados. Não criar deck de hackathon nesta etapa.
- Oito testes novos de execução nativa, coleções/importação no Studio, exportação por serviço, frame isolado e MP4 real passaram. Nova rodada completa pendente.

### Cena cinematográfica reutilizável — 03/10/2026
- Usuário autorizou prosseguir com portal, transformação do cenário e tipografia integrada. Implementação genérica portal com catálogo ilustrativo, imagem própria por elemento, objetos persistentes antes/depois, movimento reduzido e demo cinematica; não criar a apresentação completa do hackathon.
- Próximos passos: validar interação/formulário salvo e aspectos, revisar visualmente, suíte completa, publicar e reiniciar na 3517.

### Reuniões com decisões e divulgação — implementação em curso
- Novo pedido autoriza gerar a apresentação do evento e avaliar/corrigir a saída; substitui a restrição anterior de somente brainstorm. Conteúdo e planejamento pessoal ficam fora do repositório.
- Enquete manual ampliada: contagens e abstenções salvas, aprovação explícita, empate bloqueado, reabertura e versão para participantes sem pendências internas. Valores aprovados atualizam calculadoras para simular consequências; exportação respeita o mesmo filtro.
- Revisão visual real encontrou fonte inconsistente nos controles e convite cortado na cenografia. Corrigidos no motor; teste cenográfico falhou antes e passou depois. Votação, persistência, vinculação numérica e PPTX público passaram nos testes específicos.
- Suíte completa anterior: 726 testes, 705 passaram, 20 pulados, uma falha no tamanho de ícone do portal; correção confirmada pelos testes específicos. Nova suíte em execução, publicação ainda pendente.

### Validação final da etapa
- Suíte completa: 729 testes, 709 passaram, 20 pulados, zero falhas (918,6 s). Correções finais de publicação/legibilidade verificadas novamente em testes específicos; anotações internas não entram na versão pública.
- Revisão de apresentação real: 22 slides percorridos, sem texto ou controles fora da área útil, portal e experiência personalizados conferidos no navegador. Documento e evidências somente na biblioteca pessoal.
- Recursos genéricos prontos: execução Python/Node, coleções, vídeo, frame isolado, portais e decisões persistentes; falta somente concluir publicação da etapa no GitHub.

- Entrega publicada e mergeada: PR #120 (https://github.com/naruminho/sagadeck/pull/120), merge 1fb5a6f. Bundle atualizado, serviço local reiniciado na 3517. HTML de divulgação verificado sem controles de votação ou notas internas. CI remoto em andamento no momento do merge; suíte local e regressões finais aprovadas conforme acima.

### Transições A/B capa→próximo (saida × morph) — em curso na feat/light-portal-direction
- Pedido do Naru para o hackathon: comparar duas transições high-tech entre slides — A) capa sai / próximo entra, B) morph que se transforma no próximo — com a IA do sagadeck refazendo só pelo que vê no `ref`.
- Implementado: `transition: saida` (anterior recua com escala 1.06 e dissolve em 450ms, próximo sobe 48px em 600ms) e `transition: morph` (crossfade 850ms com respiro de escala + FLIP de `continuity:` já existente) em `src/runtime/base.css` + gancho no `goto()` em `src/runtime/runtime.js` (sem movimento em `instant`, exportação ou preferência reduzida). Documentado em `docs/REFERENCIA.md`; formulário do Studio trocou a lista fantasma (`slide/zoom/none`, que nunca existiram) pelas reais (`fade/cut/saida/morph`).
- Testes: `data-tr` emitido (`engine.test.js`) + classes de saída aplicadas/removidas e zero erros JS (`runtime.test.js`, navegação por teclado como a pessoa usa — o `goto` exposto é sempre `instant`). Suítes afetadas verdes: engine 59/59, runtime 34/34.
- Publicado: commit 80da025 na feat/light-portal-direction (só os arquivos desta etapa; o trabalho anterior da branch continua no disco).
- Paleta `luzquente` (etapa 2, mesmo branch): brancos quentes + âmbar com família, para futurista de bom gosto sem neon barato; no `tone: dark` vira HUD âmbar sobre carvão quente. Doc no `ref`; engine 61/61.
- Eco `ambient: pontos|grade` (etapa 2): camada viva discreta atrás do conteúdo (poeira de luz à deriva / grade em perspectiva), com `data-ambient`, aviso em valor inválido, campo no formulário e testes de motor + navegador.
- Figura `{ points: forma }` e morph `{ points: { de: fone, para: mic } }` (etapa 2): `src/figures/points.js` rasteriza 6 formas (`fone`, `mic`, `doc`, `planilha`, `busca`, `chat`) em luzinhas SVG ordenadas por ângulo; `src/runtime/points.js` viaja cada ponto no clique/Enter com legenda que troca; parado com movimento reduzido; PPTX/PDF usam a inicial. Testes de motor + navegador verdes; runtime 38/38.
- Falta nesta frente: aplicar no deck do hackathon (com o Naru conferindo), `npm run bundle` + suíte completa antes de publicar.
- IA preparada para gerar o cinema sozinha (etapa 3): nova direção criativa "Cinema hacker de bom gosto" (`src/ai/variety.js`) + seção "Direção cinematográfica" no `ref` mapeando "Tony Stark/hacker/futurista" para noite+luzquente+ambient+morph+points e as regras de gosto. Prompt verificado: Tony Stark, luzquente, points, morph e a regra anti-neon presentes no `reference()`. Teste novo: toda direção indica tema existente. Engine 62/62.
- Areia fina como a foto (etapa 4): pontos vazados em passo 0.25 com opacidade variada e joias, brilho sutil, legenda embaixo; slide do deck com fundo preto puro e legendas de serviço (`SPEECH TO TEXT` → `RESUMO COM AÇÕES`). Visto em screenshot: mic de contorno dourado no preto, morph para o balão, zero erros.
- Suporte a vídeo (etapa 5, sem gastar): `{ video: cena.mp4, loop: true, poster }` repete sozinho sem controles; `tools/generate-video.mjs` envia/polla/baixa via OpenRouter (`--dry-run` valida no catálogo de graça — passou). Roteiro dos 3 clipes em `docs/PLANO-VIDEO-CINEMA.md`. Aguardando liberação: 1 clipe curtinho de teste, depois o brief do filme da areia.
- Prova com vídeo real (etapa 6, sem gastar): capa Stark demo (noite+luzquente+ambient) e trailer do Sintel (52 s, 6,4 MB) baixado do YouTube, embutido em loop e visto em screenshots — player com loop/autoplay/muted e readyState 4, zero erros e zero avisos de build. Achados: yt-dlp exige runtime JS (o sagadeck já passa o node) e sem ffmpeg a junção falhava — `downloadYoutube` agora cai para arquivo único; testes cobrem os dois ramos.

### Preparação de vídeo pelo chat e direção por conteúdo — 03/10/2026
- Usuário rejeitou a aparência de portal/contornos 2D como substituta do filme 3D. Geração paga condicionada a briefing e aprovação; nenhum vídeo gerado nesta etapa.
- Ferramenta nativa de comando `language: video`: operações curtas plan/submit/status/download, jobs persistidos na pasta do deck, catálogo validado, MP4 local reaproveitado. Corrigidos argumentos separados do CLI e URL relativa de polling (sem prefixo duplicado). Testes simulam API, custo zero no planejamento e download sem token no CDN.
- Instruções ao agente agora selecionam formatos por função narrativa, revisam repetição visual e preservam a paleta solicitada. Distinguem SVG 2D, transição CSS e filme volumétrico; não prometem 3D quando só há pontos ou crossfade.
- Poster de vídeo local incorporado no HTML; loop retoma ao voltar ao slide. Regressão reproduzida antes e passou após correção. Portal claro/transição contínua da frente anterior preservados para outros usos, sem insistir nesse recurso para a direção rejeitada.
- Roteiro pessoal da etapa anterior removido do repositório e preservado na biblioteca. Briefing novo fica somente na pasta pessoal. Suíte completa e publicação pendentes.
- Controle de palco incluído: início manual sem autoplay, avanço por clique ou pelo frame/fim do vídeo, revelação da composição por baixo sem recriar título, fade sincronizado ao mediaTime. Formulário do Studio salva início/final; testes verificam título persistente, ausência de timer e geometria/continuidade do vídeo (antes, el descartava x/y/w/h).
- Primeira suíte completa: 750 testes, 727 passaram, 20 pulados, 3 falhas diagnosticadas (descoberta local de FFmpeg interferia no teste sem FFmpeg; quebra CRLF no exemplo da documentação; formato da dica de tema). As três regressões passaram após correção. Nova rodada completa necessária com os controles de palco finais.
- Validação final: 754 testes, 734 passaram, 20 pulados e nenhuma falha. Bundle atualizado. Controles de abertura manual, revelação sincronizada e ferramenta de vídeo prontos para publicação.

### Abertura de palco e pesquisa sem espera indefinida — 03/10/2026
- `controls: stage`: início e avanço por clique ou teclado, sem controles visíveis para a audiência. O primeiro comando inicia; outro permite pular. O próximo slide pode ser a capa final nativa. Campo exposto no formulário e documentado para o agente.
- Regressão reproduzida antes da correção: controles denunciavam a abertura e Espaço avançava em vez de iniciar. Teste de navegador agora verifica espera, ausência de controles, início, avanço e zero erros. Formulário salva o modo no deck.
- Pesquisa: “Anotando…” era uma chamada ao LLM, com respostas de até 12 mil tokens e tentativas longas. Anotação agora curta, sem raciocínio adicional, com prazo total de 45s compartilhado pelas tentativas; ao esgotar avisa e continua. Teste com provedor lento falhou antes e passa após a correção, sem chamada repetida.
- Geração: quantidade e formato explicitamente pedidos prevalecem sobre estimativa de duração; slide único não recebe capas/encerramentos/referências extras. Teste confere o prompt e resultado de um slide, sem heurística de palavras no código.
- Testes focados passaram. Suíte completa em execução; dados pessoais, frames e vídeos permanecem somente na biblioteca.
- Validação concluída: suíte completa com 757 testes, 737 passaram, 20 pulados e zero falhas. Bundle atualizado; abertura de palco e pesquisa com prazo prontas para publicação.

### Movimento declarativo e prova pelo agente — 03/10/2026
- Usuário exige geração pelo próprio chat, não apresentação artesanal como prova. Prévia pessoal aprovada preservada; teste real será feito em estudo separado.
- Plano: (1) elementos nativos wireframe/requests/flow/chat, (2) início manual e handoff para vídeo, (3) referência e instruções do agente, (4) criação/revisão pelo chat real com evidências, (5) regressões + bundle + suíte completa + publicação.
- Implementados `motion` e runtime de controle: geometria 3D projetada, fluxo, requests fictícios sem reiniciar loop, chat determinístico com entrada/envio/pensando/resposta/leitura. Frames isolados sem rede; pausa fora do slide e movimento reduzido.
- Teste de elemento falhou antes da implementação e passa; teste de navegador valida entrada antes do balão, fase de pensamento e avanço. Handoff para vídeo e prova real ainda em validação. Nenhuma nova geração paga de vídeo autorizada nesta etapa.

- Prova real concluída pelo endpoint do próprio chat (modelo real, sem edição externa do YAML): criou abertura, capa e conteúdo nativos; revisão pelo mesmo chat corrigiu contraste e escala do detalhe. Navegador confirmou espera manual, digitação antes do balão, pensamento, avanço automático e zero erros. Evidências e estudos ficam na biblioteca pessoal. Handoff chat → vídeo existente passou em teste de navegador, sem nova geração paga.
- Segundo caso real pelo chat: slide de logística com motion flow, sem referência ao hackathon ou à Bridge; elemento criado pelo modelo. Nenhuma regra de código depende do tema de apresentação.
- Validação final: suíte completa existente com 757 testes (737 passaram, 20 pulados, zero falhas), mais três testes novos de motion executados separadamente e verdes. Testes antigos de movimento preservados. Bundle atualizado; pronto para publicação.
- Preferência confirmada pelo usuário: composição nativa/editável é o padrão sem precisar pedir; conferir saída antes de sugerir experiência personalizada ou mídia paga. Mídia paga não é proibida; benefício, briefing, custo e autorização existente guiam a alternativa. Diretriz adicionada no início da referência do agente.

### Chat cancelável, apresentações por aba e transferência de slides — 03/10/2026
- Reproduzidos: entrada bloqueada durante IA e abertura de outra apresentação redirecionando contexto global. Contextos agora separados por usuário + aba; tarefa captura arquivo de origem, faz junção com arquivo atual e não aplica resultado cancelado.
- Entrada permanece disponível para preparar mensagem; enviar vira Parar (ícone quadrado), volta ao terminar. Cancelamento chega ao modelo, revisão, transformação e subprocessos; fechar aba corta o chat.
- Copiar/Colar na faixa Início e Ctrl+C/Ctrl+V na lista: slide vai para outra apresentação com novos identificadores e arquivos locais copiados sem colidir; somente mídias referenciadas, não pastas inteiras ou credenciais. Clipboard do Studio separado por usuário.
- Testes regressivos falharam antes e passaram após a correção: cancelamento de chamada pendente, isolamento entre apresentações, cópia entre abas com imagem gravada no destino. Suíte completa e publicação pendentes.
- Validação concluída: npm test com 764 testes, 744 aprovados, 20 pulados e zero falhas. Isolamento por cabeçalho de aba preserva endpoints e autenticação; transformações sobrevivem ao recarregamento, cancelamento explícito continua disponível.

### Documentos como fonte e direção contextual — 03/10/2026
- PDF/Word anexados são persistidos na pasta da apresentação com inventário visual. Word recupera imagens, tabelas e OMML; PDF recorta elementos via visão e preserva a página inteira com aviso quando a identificação falha. Inventário acompanha pedidos futuros no chat.
- Anexos são fonte exclusiva por padrão; pesquisa exige autorização explícita reconhecida pelo modelo. Documentos não fornecem instruções. Seleção, tom, densidade e estilo dependem de conteúdo, público e objetivo; pedido explícito prevalece. Humor permite fontes informais como opinião.
- Compartilhamento: reproduzida corrupção do Mermaid pela inserção do botão de download dentro de uma string `</body>` do fornecedor. Inserção agora ocorre somente no fechamento real do HTML; regressão de compilação JavaScript passou após falhar antes.
- Modelos do Oracle alinhados ao Windows, incluindo configuração de vídeo Veo 3.1 Lite; planejamento validado sem submissão paga. PR #125 publicado e serviço local reiniciado na 3517.
- Limites: gráficos Word sem cache ou de tipos não suportados ficam sinalizados; recortes PDF exigem revisão quando o modelo não enxerga. Aplicação visual completa de template PPTX não implementada nesta etapa.
- Testes focados aprovados: inventário Word/PDF, fallback, seleção editorial, anexo no chat com imagem gravada no slide e reutilização na próxima mensagem, pesquisa exclusiva/complementação. Suíte completa em validação.

- Teste real de paper encontrou respostas de visão truncadas antes do inventário. Visão agora usa orçamento por página configurável, sem raciocínio nessa tarefa, coordenadas explícitas e limites de texto do PDF para proteger rótulos e legendas. Inventário incompleto pode ser refeito; texto do material inventariado não perde conclusões no antigo corte de 12 mil caracteres.
- Barra flutuante acompanha reflow/movimento da seleção, deixando o texto livre. Regressão reproduziu a barra sobre o objeto e testou o segundo clique para digitar.
- Diagnóstico geral: motivo de término preservado em JSON e streaming; tokens, timeout, créditos, acesso, conexão e arquivos distinguíveis. Código e referência para suporte, causa desconhecida explícita, sem resposta bruta/credenciais no aviso. Cancelamento permanece uma ação normal. Testes específicos aprovados; nova suíte completa em andamento.
- Busca web real testada com sucesso após desligar raciocínio na resposta estruturada do buscador. Pesquisa somente leitura continua disponível para usuários sem execução local; teste de permissão atualizado para esse contrato, mantendo isolamento e bloqueio de comandos locais.

Atualização 04/10: screenshots revelaram hierarquia invertida e evidências tratadas como fotografias. Split agora prioriza figura informativa, empilha figuras largas e mantém contain; orientação do agente exige reconstrução de equações/tabelas legíveis sem duplicar original. CHAPTER 4.doc convertido com Word: 19 páginas, 151 objetos OLE de fórmulas, sem OMML. Teste real pelo upload em andamento usando inventário da renderização. Falhas transitórias do LLM têm retry limitado e cancelável; diagnósticos preservam mensagens específicas de APIs e conflitos de aba. Validação final e merge pendentes.

### Validação integral pelo chat — 04/10/2026
- Foco confirmado pelo usuário: o agente deve criar abertura com piada, capa tecnológica animada e conteúdo com pequenos movimentos coerentes, somente por instruções no chat. Decks continuam sendo validadores descartáveis, não solução personalizada escrita por fora.
- Nova geração nativa iniciada com sequência completa e briefing consolidado; vídeo pago não será submetido antes de apresentar o prompt detalhado exigido anteriormente.
- Regressões de movimento verificadas: chat digita no campo antes de enviar, pensa, responde e inicia vídeo manual; requests continuam variando; zero erros de navegador. Isso prova o runtime, não a qualidade da composição gerada.

- Prova integral encontrou AI_TOKEN_LIMIT antes de produzir o deck. Implementada recuperação em src/ai/staged-generation.js: planejamento conciso compartilhado, grupos de três slides e rejeição de etapas incompletas. Nenhum roteiro de evento foi hardcodado. Testes focados passaram; nova prova nativa em andamento após bundle/restart3517. Ainda não concluído nem mergeado.
- Revisor recebe recursos de movimento/vídeo dos demais slides, além de títulos, para avaliar coerência da sequência. Pesquisa instruída a não substituir eventos/plataformas internos por homônimos públicos.

- A revisão da prova tentou remover movimentos obrigatórios para corrigir colisões. Reparo agora deve reposicionar/redimensionar recursos explicitamente pedidos, não eliminá-los. Acrescentado motionAccent: região reservada para detalhe nativo pequeno nos layouts seguros; teste real de navegador verifica conteúdo, movimento e rodapé separados.
- Primeira prova completa após reinício gerou 17 slides, mas revisão terminou com 8 achados e faltavam movimentos em vários slides. Não aprovada. Nova prova precisa validar melhorias e conferir visualmente, depois planejar filme via chat.

- A capa criada pelo agente tinha código estático. Recurso genérico motion/terminal implementado: digita roteiro de lines/code, cursor, pausa de leitura, pausa fora do slide; documentação disponível ao agente. Teste no navegador passou.
- Suíte completa: 787 testes, 766 passaram, 20 pulados, uma falha por CRLF no exemplo Mermaid da referência. Normalizado LF; teste de regressão passou. Nova suíte completa necessária após as alterações mais recentes.

- Prova nativa pelo chat executou video/frame e video/plan: captura real do slide em 1920px e consulta ao catálogo Veo, sem submit/custo. Ferramenta frame agora permite ao agente preparar suas próprias referências sem scripts externos. Frames e plano permanecem na biblioteca pessoal.
- Movimento reduzido/exportação comunicam modo poster às cenas isoladas; terminal mostra roteiro completo para não confundir digitação inicial com texto cortado na revisão.
- Nova prova criada em branco pelas APIs nativas e conduzida por /api/ai/chat com referência visual da capa anteriormente aprovada. Avaliação visual e filme final continuam pendentes; não declarar experiência completa.

- A referência aprovada é somente um caso de validação: o usuário reforçou que o chat precisa criar direções variadas, sem receita de capa específica no motor. Prova integral pelo chat gerou 18 slides; inspeção real encontrou título cortado, logo provisório, iframe ambiente maior que seu contêiner e votação com controles sobre a última opção. Ainda não aprovada.
- Regressões reproduzidas e corrigidas: reparo automático agora preserva ferramentas e contexto; iframe ocupa integralmente a região reservada; votação distribui linhas sem sobrepor controles. Testes específicos falharam antes e passaram depois. Direção genérica de vídeo distingue poster/espera manual, texto existente versus letras novas, loop ambiente versus abertura e camadas chat/vídeo.
- Studio reiniciado na 3517; refinamento solicitado pelo próprio chat com busca de logo real e preservação de recursos. Nenhum vídeo pago submetido nesta etapa. Suíte completa e avaliação final pendentes.

- Suíte completa anterior aprovada: 794 testes, 774 passaram, 20 condicionais pulados. Corrigidas depois as falhas reais de camadas/controles/ferramentas, com regressões específicas; nova suíte em curso.
- Referências web agora incluem links observados aos arquivos de imagem originais, além de thumbnails. SVG autocontido é rasterizado em PNG transparente, sem conteúdo ativo/rede externa; testes de proporção, validação e importação aprovados.
- Refinamento nativo falhou por limite de tokens após ferramentas, sem gravar o deck. Chat agora faz uma recuperação limitada, sem raciocínio, mantendo resultados e execução única; orçamento configurável. Regressão reproduziu a falha e passou com a correção, incluindo limite da segunda tentativa. Streaming/progresso continuam depois dos comandos. Nova prova real chegou à revisão das capas.

- Direção transversal implementada no agente, revisão e geradores de imagem/vídeo. Plano de vídeo mostra o prompt completo sem cobrança. Testes focados: 6 passaram; avaliação estética real continua necessária.

- Prova nativa de direção holográfica encontrou cores hex de seis dígitos convertidas em números pelo YAML: reprodução falhou com c.replace; corrigido em elementos, gráficos e motion, teste numeric-colors passou. A criação continua pelo chat, sem edição manual da apresentação.

- Teste nativo encontrou SVG ocultado por tipo anterior após merge: guard devolve renderizadores incompatíveis e pede null ao trocar figura. Outro achado: review:true no slide era ignorado sem flag no topo; agora solicita revisão dos alterados, com opt-out explícito preservado. Ambos reproduzidos antes da correção.

- Chat de vídeo sem burocracia (Rose): plan/status/frame/download rodam sem aprovação, só submit pede; IA resume em frase e só mostra tudo em erro. Achado crítico no caminho: code YAML sem aspas virava objeto e commandRequest destruía em "[object Object]" — preservado para video/web. Teste de chat de verdade no navegador (status livre + submit negado).

### Consolidação 04/10 (Rose): pendências antigas que os merges resolveram- Resolvidas pelos PRs #120–#127: rodadas/suítes "pendentes" das seções de execução e mídia, cena cinematográfica, reuniões com decisões, validação final, abertura de palco, motion declarativo, chat cancelável e documentos como fonte (inclui CHAPTER 4 e staged-generation via #126).
- Seguem ABERTAS de verdade: aprovação da capa (bloqueia vídeo e resto, gerações pausadas pelo Narumi), avaliação estética final da direção holográfica, liberação de budget dos clipes (teste + filme da areia) e a decisão MIT vs AGPL-3.0.

### Autonomia total (Rose): o agente vigia, a pessoa não
- Carimbo do motor na barra de status (versão + commit + início) via /api/instance; aprovação de submit mostra preço do catálogo; direções aprovadas salvas e injetadas no prompt; vigia baixa clipe pronto sozinho e avisa com toast; versões fotografadas a cada save com modal lado a lado e restaurar com rede.
- Caça própria: YAML inexistente no cliente quebrava o init em silêncio (botões mortos); show do servidor agora manda slides prontos. Módulos extraídos para respeitar a trava de 100KB do server.js.

### PPTX legível no Mac sem Office (Rose) — 05/10/2026
- Pedido do Narumi: melhorar export PPTX/PDF, começando pela fidelidade no Mac (limitação conhecida do README: PPTX usava fontes Windows/Office e o PowerPoint trocava a fonte).
- Novo `sagadeck pptx deck.yaml --mac-fonts` (vale no `all`): o PPTX troca as 18 faces só-Windows por equivalentes dos dois sistemas (Bahnschrift→Arial Narrow, Segoe UI→Arial, Cascadia Mono→Courier New, Century Gothic→Verdana, Franklin Gothic Heavy→Arial Black, resto Franklin→Arial, mão→Comic Sans MS, pixel→Courier New); HTML e PDF não mudam. No Studio, `/api/export/pptx?macFonts=1`.
- Código: `PPTX_MAC_SAFE` + `macFallbackFace` em `src/themes.js`, `fontFallback` em `exportPptx` (`src/export/pptx.js`, cobre texto, tabela e o `VARIABLE` do Bahnschrift), `macFonts` em `sendExport` + rota do Studio. Docs em `README.md` e `docs/REFERENCIA.md`.
- Testes: `test/pptx-mac-fonts.test.js` (mapa só-safe em todos os temas sem navegador + export real com/sem flag). Validação: suíte foca verde (export, guards, engine, 74 testes); suíte completa com 780 testes tem as mesmas 5 falhas do baseline sem a mudança (bundle/pip sem esbuild, diagram, retorno-recriada, ribbon-fit, share-link — pré-existentes, ambiente).
- Fronteira do teste: verificado XML do PPTX (sem Bahnschrift/Segoe, com Arial Narrow; tabela segue nativa) e CLI de ponta a ponta; NÃO verificado num Mac de verdade (sem acesso a um) — quem tiver Mac confirma visualmente.

### Suíte verde no Oracle: 5 falhas viram 0 (Rose) — 05/10/2026
- Pedido do Narumi: zerar as 5 falhas pré-existentes da suíte. Diagnóstico com baseline (clone sem a mudança, mesmos 5 fails) + CI (vermelho na main há vários merges) para separar bug de ambiente.
- 4 eram ambiente do Oracle: `bundle` (node_modules sem devDeps → `npm install`), `diagram` e `share` (só fontes DejaVu → instaladas Liberation, métricas compatíveis com Arial) e `retorno-recriada` (Chrome 153 hifeniza pt-BR, CI não: teste aceita encolher OU hifenizar, `test/retorno-recriada.test.js`, mantendo irmãos iguais como invariante).
- 1 era bug de verdade, em todo lugar (CI ubuntu+windows também): a faixa Design estourava em máquina nova. Causas: (a) `flex-shrink` esmagava a nota de identidade a 0px em silêncio (nem o aviso aparecia); travado com `flex-shrink: 0` no grupo Identidade, e o aviso voltou a aparecer; (b) com o aviso à vista, o grupo não cabia: controles compactos só ali (`#identity-select`, `#direction-select`, botões, px fixos para não depender de fonte); (c) em 900px e notebook (1366), blocos compactos em `studio-next.css` (`@media` 1440/1024) para 3 temas + 3 paletas à vista sem rolagem.
- Validação: ribbon, retorno, diagram, engine, guards, pptx-mac (85), share+export (14), studio (87 passed, 1 skip), bundle (5, roda com sudo aqui porque a árvore é de root). `src/runtime/code-lab.js` regenerado pelo teste foi revertido (ruído de versão do esbuild, fora do escopo).
- Fronteira: verde NESTE Oracle (DejaVu+Liberation+Chromium 153). CI tem relatório próprio (motion-scenes, motion-trace, copy/paste, transform — outros responsáveis); o Design do CI deve melhorar com este merge, conferir no próximo run.

### Multisseleção de slides + copiar/colar no botão direito (Rose) — 06/10/2026
- Pedido do Narumi: botão direito no slide copia/cola (estava só na faixa, e o Ctrl+C/V da lista nem funcionava: branch depois do return), Ctrl+click / Shift+click / Ctrl+setas selecionam vários.
- `selectedSlides` em módulo próprio (`src/studio/public/slide-select.js`, pela trava de tamanho do app.js: 273.379 < 274.000): click alterna, Shift faz intervalo, Ctrl+setas estendem, Ctrl+A tudo; Delete exclui o bloco com Desfazer; mover acompanha a seleção; duplicar/novo/colado focam o resultado. Miniaturas marcadas com tracejado (`.selected`).
- Copiar/colar vale para N slides (cliente `slide-clipboard.js` + `slide-copy-routes.js` aceitam lista, com compat para o formato de 1; colados ganham uids novos). Menu do botão direito com Copiar/Colar/Excluir com contagem; Mover/Duplicar só no singular.
- Achado no caminho: `PUBLIC_SCRIPTS` (`src/studio/public-files.js`) barrou o módulo novo com 404 — registrado.
- Testes: `test/slide-select.test.js` (menu copiar/colar, Ctrl+click+Delete+Desfazer, Ctrl+seta). Validação: slide-select (3), guards/engine/delete/undo (74), studio (87+1skip), share+export (14); suíte completa com 820 testes: 796 passed, 3 falhas pré-existentes/ambiente (bundle precisa escrita em árvore root; motion e transform passam isolados, instáveis sob carga — o transform já caía no CI).

### Nome amigável na biblioteca atrás do portal (Rose) — 06/10/2026
- Narumi viu o id cru (`305cc...`, avatar "3") no topo da biblioteca: `api/library` devolve o id e a página mostrava direto.
- A página agora lê o username do `/whoami` do portal (mesma origem, convenção `username || email`, avatar com a inicial maiúscula; sem portal, segue como antes). Sem tocar no filmes-api nem no nginx.
- Detalhe: o fetch só acontece com usuário (no Studio local o 404 sujava o console e quebrava os testes de zero-erro); o proxy fake do teste de prefixo ganhou `/whoami` com `logged_in:false` (portal sem nome → mostra o id, sem pedido quebrado).
- Teste: `biblioteca mostra o username do portal em vez do id cru` (whoami mockado); `library-ui` 27/27.
- Fronteira: verificado com whoami mockado; a confirmação visual no portal de verdade (nome "narumi" no topo) fica com o Narumi.

### Publicação no npm (Rose) — 06/10/2026
- Pedido do Narumi: o app é Node, merece casa no npm (e aposenta a gambiarra do zip/fonte).
- Pacote pronto: nome `sagadeck` livre, `bin` executável, `files` completo (fonte + deps, 11 MB, sem bundle). Instalação via tarball testada de ponta a ponta (`npm i <tgz>` + `sagadeck build` gera o HTML).
- `publish.yml` ganha job `publish-npm` (trusted publishing OIDC + provenance, mesma release). Falta o passo manual único: publicar a 1.2.0 à mão (`npm login` + `npm publish`) e ligar o Trusted Publisher em npmjs.com.
- PyPI continua (público Python + banco); docs no README.

### Legenda e marca-texto — reconciliação Windows + Oracle (Rose)
- Branch dela (`fix/legenda-e-marca`) revisada por diff: mesma causa-raiz na legenda, mas o condicional dela (só maiúsculas) submedia nomes mistos — o CSS prova `text-transform: uppercase` + `letter-spacing` em todo `f-label`, então vale caps sempre. Mantida a estrutura dela (right-aligned + `ch-leg`) com medida sempre-caps; mark 84%/58% dela; teste de navegador dela (getBBox + pixel) + meu teste de cordas. Verdes: chart-legend-mark 2/2, engine 63/63, blocks 1/1.
