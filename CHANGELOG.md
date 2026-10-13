# Histórico de versões

O que muda em cada versão publicada no npm. O diário completo (decisões, bastidores, o que já entrou
em cada frente) vive em [`docs/ANDAMENTO.md`](docs/ANDAMENTO.md) — este arquivo é o resumo para quem
pula de versão em versão.

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
