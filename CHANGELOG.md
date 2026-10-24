# Histórico de versões

O que muda em cada versão publicada no npm. O diário completo (decisões, bastidores, o que já entrou
em cada frente) vive em [`docs/ANDAMENTO.md`](docs/ANDAMENTO.md) — este arquivo é o resumo para quem
pula de versão em versão.

## [1.11.7] — 24/10/2026

### Desempenho
- **Fotos e vídeos sem descer de novo a cada clique**: no editor, a imagem ia embutida no desenho de cada slide e de
  cada miniatura: um slide com foto passava de 5 MB por clique. Agora vai por endereço, e o navegador baixa uma vez e
  guarda (o mesmo slide: 5 kB). A apresentação e as exportações continuam com tudo embutido.
- **Navegar nos slides pelo servidor ficou leve**: cada troca de slide baixava ~170 kB (o CSS inteiro, igual em todo
  clique) e subia o deck inteiro duas vezes. Agora o CSS desce uma vez; trocar de slide 10 vezes passou de ~1,7 MB
  para ~24 kB.
- **Respostas comprimidas e guardadas no navegador**: o Studio comprime o que manda (gzip) e os arquivos da página
  respondem "não mudou" na visita seguinte. Abrir o editor de novo passou de ~1,3 MB para ~55 kB; a apresentação, de
  257 kB para 64 kB (e zero, se o deck não mudou). Versão nova do sagadeck continua chegando na hora.
- **Miniaturas em lote**: um pedido para várias miniaturas, com o deck subindo uma vez, em vez de um pedido (e o deck
  inteiro) por miniatura.

### Segurança
- No servidor multiusuário, o desenho do slide lia as imagens da pasta que o navegador indicava: dava para pedir
  arquivos da biblioteca de outra pessoa. Agora a pasta é sempre a do deck aberto, e o endereço das imagens só entrega
  imagem ou vídeo da biblioteca da própria pessoa, da pasta do deck e dos modelos do sagadeck.

## [1.11.6] — 23/10/2026

Correções que saíram de uma rodada de uso real: quatro apresentações geradas pela IA no servidor (uma aula técnica,
um pitch, um guia de consulta e uma palestra), revisadas slide a slide.

### Correções
- **Indicadores perdiam a unidade**: num slide de indicadores (`stats`), "12 h" e "4%" apareciam como "12" e "4". O
  `stats` passa a aceitar `prefix` e `suffix`, como o número grande, o gráfico e o contador.
- **Comando cortado no hífen**: no código que quebra linha, `git commit --amend --no-edit` aparecia como `--no-` numa
  linha e `edit` na outra. A linha não quebra mais depois de hífen, e o texto copiado do slide continua o mesmo.
- **Barras em destaque quase sumindo**: em temas de papel, a barra pintada com a cor de destaque saía no tom claro do
  marca-texto, mais fraca que as barras de fundo. Agora usa a versão com contraste, como o texto.
- **Aviso falso em material de consulta**: guias e apostilas (`purpose: consulta`) eram cobrados de "slide de
  impacto", "respiro" e alternância de tom, que a própria regra de consulta dispensa.

## [1.11.5] — 23/10/2026

### Correções
- **Reiniciar o servidor deixava o sagadeck 90 s fora do ar** e matava à força o que estivesse rodando: depois de
  abrir o Chrome uma vez (capas, exportação), o Studio não saía quando o sistema pedia para parar. Agora ele para de
  aceitar conexões, dá alguns segundos para o que está em andamento, fecha o Chrome e sai.
- **Biblioteca no OneDrive com "arquivos só na nuvem"**: abrir a biblioteca lia todas as apresentações, o que baixava
  cada uma da nuvem. Agora só relê a que mudou (vale também depois de reiniciar o Studio).
- **Capas fora da nuvem**: com a biblioteca no OneDrive, as capas e a lista (que se refazem sozinhas) ficam na pasta
  local do Windows, sem ocupar a cota nem sincronizar a cada capa nova.

## [1.11.4] — 23/10/2026

### Correções
- **Exportar no Windows ficava parado 15 a 20 s antes de começar** (PDF, PPTX, imagens, roteiro, material de estudo e
  a conferência dos slides): o antivírus segurava a releitura do HTML que o sagadeck acabara de gravar. A abertura no
  navegador agora usa o texto que já está na memória.

### Bastidores
- CI em 3 partes por sistema, ao mesmo tempo (`scripts/test-parte.mjs`): o PR deixa de esperar 37 min no Windows.
- Implantação no servidor por roteiro (`scripts/implantar-oracle.mjs`): o dev primeiro, o estável só se o dev subir
  na versão certa, `npm ci` só quando as dependências mudam.

## [1.11.3] — 23/10/2026

### Novidades
- **Enviar cópia para…** (Studio multiusuário): quem administra manda uma cópia de uma apresentação para a biblioteca de
  outra pessoa, como apresentação nova "(versão revisada)", sem substituir nada dela. A conversa, as versões e o
  relatório de avisos não vão junto. Quem administra: `--admins` (ou `SAGADECK_ADMINS`); sem isso, os `--agentes`.
- **Corrigir tudo com IA** no painel Revisar › Conferência: manda num pedido só as pendências que ainda valem,
  agrupadas por slide.
- **Testes com o modelo de verdade a cada 3 versões**: antes de publicar uma versão múltipla de 3,
  `node scripts/ai-live-ci.mjs --na-release` roda a bateria, repete o que falhar e resume; o que falhar duas vezes se
  corrige antes de publicar. Na CI, só pelo botão (Actions › ai-live). Nesta versão: 27 de 27 de primeira.

## [1.11.2] — 23/10/2026

### Correções
- **Decks saíam todos no mesmo tom (claro)**: o prompt passa a pedir, como regra dura, pelo menos um slide escuro ou
  de destaque nos momentos-chave em decks de 6+ slides (material de consulta pode ficar todo claro). No teste com o
  modelo de verdade, o deck variado passou 3 de 3 (antes, nenhuma vez).
- Teste ao vivo de imagens alinhado à regra do prompt: sem falar de imagem, a IA decide e ilustra poucos slides.

## [1.11.1] — 23/10/2026

### Novidades
- **Rótulos de desenho medidos na revisão**: a foto da revisão mede a fonte na tela dos textos dos desenhos SVG do
  deck; abaixo de 20 px (numa tela de 1920) vira achado com os textos e os tamanhos, e a correção automática recebe
  isso. A referência ensina a dimensionar a fonte pelo viewBox (40 ou mais num viewBox de 1000).

- **"N a conferir" na biblioteca**: o cartão da apresentação mostra quantos avisos da conferência ainda faltam ver
  (contas, números sem base, revisão visual que ainda vale, figuras de fora), antes de abrir.

### Correções
- **Carrossel encolhia para 61%** na apresentação e no editor: os textos empilhados que ainda não apareceram contavam
  como vazamento no ajuste de caber.
- **Troca de slide em deck grande**: o slide da tela passa na frente da fila das miniaturas; o ajuste das miniaturas
  roda em fatias; cada miniatura é isolada no layout (`contain`); diagramas das miniaturas esperam o navegador ficar
  livre. No deck de 200 slides, nenhuma tarefa trava mais de 0,5 s (antes, uma de 2,6 s segurava o clique).
- **Gravação**: mudar só o título regravava todas as linhas de texto longo (a reemissão desfazia as quebras do YAML);
  agora fica a formatação que preserva as linhas do arquivo.

## [1.11.0] — 23/10/2026

### Novidades
- **Conferência das contas**: na criação com IA e no chat, a IA escreve cada resultado do deck como fórmula a partir
  dos dados e o sagadeck calcula (o mesmo compilador do `calc`, sem eval) e compara com o slide. O que não bate volta
  para a IA corrigir em todos os campos onde aparece, inclusive gráficos e resumos que citam o número; o que sobrar
  vira aviso. No chat, peça "confira as contas" (a IA usa `contas:`). A conversão de unidades (L/s e m³/s, cm e m)
  só evita alarme falso: só é acusado o que não bate de jeito nenhum.
- **Contas do material na leitura crítica**: gabarito ou resultado do material que não fecha com os próprios dados
  vira inconsistência, com o trecho literal (duas conferências independentes precisam concordar).
- **Painel Revisar › Conferência**: tudo o que as checagens acharam, por slide, com Ir ao slide, Corrigir com IA,
  Ignorar e Conferir de novo. Os avisos da criação também aparecem no chat na primeira abertura.
- **Exercício resolvido calculado**: passos do `solution` com `fn` são calculados pelo motor (`{{nome}}` no LaTeX)
  e podem ser interativos: mudar um dado recalcula os passos.
- **Modelo para conferir** (Configurar IA): as conferências podem usar um modelo de raciocínio mais forte que o de
  escrita.
- **Pedido da criação gravado** em `.sagadeck/geracao.json` (briefing, anexos, escolhas e modelos usados).
- Resposta calculada pela IA leva `provenance: derivado`; a IA confere a ordem de grandeza por um segundo caminho.

### Correções
- **Checagem de números**: resultado pequeno ("≈ 55 m") e decimal do LaTeX (`9{,}45`) não escapam mais.
- **Revisão visual**: a confirmação descarta achado que se contradiz e desproporção que os valores do gráfico desmentem.
- **Aviso falso de conta**: quando a IA que corrige discorda, uma conferência independente decide; unidade mal rotulada
  pelo modelo ou conversão feita à mão (`*1000` para L/s) não vira alarme.
- Índice de várias letras nos dados do exercício (`p_atm`) e marcas do formato de ferramenta (`</parameter>`) no chat.
- **Painel**: aviso visual de slide que já mudou aparece como possivelmente resolvido; o selo não consulta o
  servidor a cada troca de slide.
- **Windows**: gravação tolera arquivo travado por até ~4 s (antivírus, OneDrive); testes não usam porta que o
  Chrome bloqueia.

## [1.10.0] — 13/10/2026

### Novidades
- **Criação técnica mais direta**: Programação e APIs com cURL na biblioteca, exemplos de pedidos,
  código colado, público/objetivo/roteiro opcionais e prévia do pedido antes de gerar. Arquivos de código
  podem ser anexados com espaços e linhas preservados. Ctrl+Enter inicia a geração.
- **Começar sem IA**: duas bases editáveis de cinco slides, com exemplo guiado, saída e terminal animado.
  A base de APIs inclui uma chamada que funciona na API de ensaio do Studio local.
- **Código / cURL em Início e Inserir**: cole o conteúdo e escolha código, explicação guiada ou API.
  Selecionar linhas cria etapas sem editar JSON. O cURL vira requisição sem executar shell; credenciais
  reconhecidas são substituídas por referências aos Segredos do ambiente antes de salvar.
- **Terminal Pro e Aurora Dev**: dois temas para desenvolvimento, com fontes embutidas, código legível,
  janelas de IDE, painéis, rede animada na capa e respeito ao movimento reduzido e à exportação.
- **Realce offline de Bash/cURL, JSON e SQL**, além das cinco linguagens já disponíveis.
- **Node 24+** passa a ser o requisito mínimo; a CI verifica Linux e Windows nessa versão.
- **Ajuda › Sobre o SagaDeck**: a aba Ajuda fecha a faixa do editor (como no PowerPoint) e o Sobre mostra a versão
  que está rodando, com commit, Node, desde quando, a biblioteca e se a IA está configurada, além de Copiar
  informações para pedir ajuda. Na biblioteca, o mesmo Sobre no botão de informação do alto.

### Correções
- **Assistente em modelos abertos pela vitrine**: conversar deixa de falhar por falta de arquivo. Edições e
  documentos usam uma única cópia pessoal, e o editor mantém essa cópia ao recarregar, inclusive no multiusuário.
- **Sobre no tema escuro**: a janela abria com fundo branco e texto claro, quase ilegível. Agora segue as cores do
  tema (claro ou escuro), no editor e na biblioteca.

## [1.9.0] — 12/10/2026

### Novidades
- **Seis temas novos.** `musgo` (laboratório noturno: verde quase preto, âmbar e sálvia, Fraunces, Space Grotesk e
  IBM Plex Mono) e o irmão `wine` (o mesmo em vinho); `caderno` (visual thinking, letra de mão e moldura pastel),
  `lousa` (quadro verde com giz), `cartaz` (cartaz de protesto, faixas vermelhas tortas) e `infografico` (dados
  chapados, números enormes). Fontes livres embutidas: funcionam sem internet.
- **Cartão que vira** (`flip` no cartão): o clique gira e mostra o verso.
- **Botão + com balão** (`pop` em qualquer lugar; `more` no marco da linha do tempo): o detalhe fica guardado até
  alguém clicar.
- **Faixa que corre na capa** (`ticker`), **terminal em cenas** (`motion: {type: console}`, que digita o comando e
  revela a saída) e **rede de nós** atrás da capa (`ambient: rede`).
- **Demos de um assunto só**: Mapas, Programação e APIs com curl, primeiras em Demos oficiais. As demos que não
  ensinavam nada claro saíram da vitrine (Explore uma ideia, Novidades, Material de consulta, Recursos avançados e a
  Aula de APIs, que continua no `sagadeck ensaio-api`).
- **`sagadeck ia-check`: o que de IA funciona, em segundos e sem tela.** Texto, visão (o modelo precisa dizer as cores
  de uma imagem), geração de imagem, pesquisa e vídeo, cada um com uma chamada de verdade, todos ao mesmo tempo; cada
  resultado sai assim que chega. `--json` e código de saída para agentes e CI; também como ferramenta do MCP
  (`sagadeck_ia_check`) e `POST /api/ia/check`. Vídeo só é gerado com `--video-real` (é cobrado).
- **Vídeo na mesma camada da IA**: um modelo de vídeo em Configurar IA faz a geração usar o endereço, a chave e o
  adaptador de lá (antes era só OpenRouter, com chave em variável). As variáveis antigas continuam valendo.

### Correções
- A geração de vídeo não depende mais do catálogo de modelos: provedor sem catálogo gera assim mesmo.
- Teste do slide de API que falhava ao acaso quando o identificador sorteado do slide continha "ocr".
- O ajuste para caber não encolhe mais o slide inteiro por causa do verso do cartão ou do balão do +.
- **Duplicar, apagar e limpar pasta no Windows com acento no nome (a norma aqui) paravam de quebrar**: o
  `fs.cpSync`/`fs.rmSync` recursivos do Node têm código nativo que, no Windows, mata o processo sem aviso
  (0xC0000409) ou copia/apaga **nada** quando o caminho tem acento ou caractere fora do ASCII
  (nodejs/node#54476, #61878 — "Relatório (cópia)" é o caso real). Agora `copyRetry`/`removeRetry`
  (`src/fs-retry.js`) caminham na mão por readdir/copyFile/unlink/rmdir, que lidam com acento, e cada
  arquivo ainda tolera o travamento de um instante (antivírus/sincronização), como o rename já fazia.
  Era também o flake do CI em "mover (pasta inteira...), renomear e duplicar" (só aparecia no Node 22).

### Melhorias
- **Testes que precisam de navegador pulam sem Chrome/Edge**, em vez de falhar: os testes do foco guiado,
  do redesenho de figura (`image_ref`), do "ver o material" e dos rótulos do redesenho passam pela foto
  reduzida no navegador (`src/import/crop.js`) e fora do CI quebravam a suíte inteira. Novo guard
  `skipWithoutBrowser` em `test/helpers.js`, com o mesmo aviso dos testes de UI.
- **`engines` corrigido para Node 22.13+** (era `>=18`, mas `pdfjs-dist` 6 exige 22.13+/24 e
  `playwright-core` exige 20+; a promessa antiga não se cumpria). README e SKILL atualizados; a CI agora
  testa Node 22 e 24, no Linux e no Windows.
- **Auditoria de dependências na CI** (`npm audit --omit=dev`, informativa) e **Dependabot semanal**
  (patch/minor agrupados numa PR; major sob demanda).
- **Vulnerabilidade do `image-size` resolvida por `overrides`**: o pptxgenjs 4.0.1 declara `image-size`
  mas nunca o importa (dependência morta); a versão corrigida (2.0.4) entra por override e o audit fica
  em zero, sem tocar no código do gerador.
- `.editorconfig` (charset, final de linha, indentação) e `keywords`/`homepage`/`bugs` no `package.json`
  (descoberta no npm e links oficiais).

## [1.8.0] — 10/10/2026

### Novidades
- **Mapas ao vivo** (`layout: map`): pontos, linhas e áreas a partir de CSV/GeoJSON/GPX/KML, fundo vetorial
  embutido, IA que monta e analisa com dados, "Pôr no mapa" e "Achar coordenadas" na tela de dados,
  serviços configuráveis em `~/.sagadeck/mapa.json` (uma tentativa e para; consentimento antes de enviar
  dados). Exportação captura o mapa como está na tela.
- Editor de mapa no Studio, camada por clique vira animação no PPTX, e o carregamento é preguiçoso
  (só quem tem mapa no deck paga o custo).

## [1.5.0] e anteriores

Histórico anterior em [`docs/ANDAMENTO.md`](docs/ANDAMENTO.md) e nas
[releases do GitHub](https://github.com/naruminho/sagadeck/releases).
