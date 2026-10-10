# Saga · sagadeck — gerador de apresentações

Você (ou uma IA) escreve um arquivo `.yaml` com o conteúdo. O sagadeck gera:

| saída | pra quê |
|---|---|
| **`.html`** | a apresentação "de verdade": animada, com cliques, enquetes, timers, jogos, modo apresentador. Um arquivo só, funciona offline, abre com duplo clique. |
| **`.pptx`** | PowerPoint **editável** e fiel ao HTML: texto em caixas nativas com as mesmas fontes, formas nativas, figuras em PNG nítido, animações de clique e transições, notas do apresentador (ou sem elas, para mandar a alguém). |
| **`.pdf`** | um slide por página, para mandar depois da palestra |
| **`- roteiro.pdf`** | roteiro do apresentador: miniatura de cada slide + fala + interações + relógio planejado |

Ele vem com 11 temas (incluindo prata limpo e respirável, artesanal desenhado à mão, azul elétrico vivo e pop alegre), 23 layouts (incluindo KPIs e fluxos de processo), 2.100+ ícones, pictogramas e cenas geradas na hora, diagramas, 7 tipos de gráfico, e um **fiscal automático** que detecta texto estourado, sobreposição, contraste baixo e slides com texto demais ("anti-sono").

## Instalação

```bash
npm install -g sagadeck
```
Requer **Node.js 18+** e **Chrome ou Edge** instalados (o PDF, o PNG e as conferências visuais usam o navegador).
É tudo Node: não precisa de Python. (O pacote do PyPI parou na 1.5.0.)

## Comece aqui

```bash
sagadeck studio
```
O navegador abre sozinho em **http://127.0.0.1:3517** (se não abrir, abra esse endereço). **Essa é a página do
sagadeck**: a biblioteca das suas apresentações, o editor (estilo PowerPoint) e o chat com a IA. Não há outra interface
para abrir nem para criar. Deixe o terminal aberto enquanto usa; `--sem-navegador` não abre o navegador.

Para usar a IA (gerar apresentações, conversar com o chat), clique em **Configurar IA** (a biblioteca mostra uma faixa
enquanto ela não está configurada). **Usar a recomendação** preenche o OpenRouter com modelos que funcionam; cole a
chave, clique em **Testar** e **Salvar**. Se nem a recomendação responder, o problema é a rede ou a chave. Depois,
troque pelo provedor e pelos modelos que quiser. Detalhes em
[IA de verdade](#ia-de-verdade-llm).

## Como usar

Toda apresentação mora na **biblioteca**: `SAGADECK_HOME`, senão a pasta `sagadeck` dentro de **Documentos** no Windows (a pasta Documentos que o Explorer mostra, mesmo redirecionada para o OneDrive ou outro disco) e `~/sagadeck` no Mac e no Linux. Quem usava a biblioteca antiga em `C:\Users\<você>\sagadeck` tem ela movida para Documentos na primeira execução; o caminho antigo continua levando até lá. Uma pasta por tópico, uma por apresentação.

```bash
sagadeck new "Minha palestra" --topic=Palestras --theme=editorial
```
```bash
sagadeck all "~/sagadeck/Palestras/Minha palestra/Minha palestra.yaml"
```

Comandos:

```
sagadeck new <nome> [--topic=T] [--theme=x]  cria um deck de exemplo na biblioteca
sagadeck studio [deck.yaml] [--port=3517]    sem arquivo: a biblioteca; com arquivo: o editor com chat IA (já aberto: usa o aberto)
sagadeck ensaio-api [--port=3000]            exemplo de slides de API rodando contra uma API de mentira
sagadeck autofix <deck.yaml> [--out=pasta]   auto-corrige sobreposições, margens e excesso de texto no YAML
sagadeck diff <a.yaml> <b.yaml> [--json]      o que entrou, saiu, mudou e andou entre dois decks (por uid)
sagadeck enxugar <deck.yaml> [--fix]          palavras por slide contra o limite do material (--fix: excedente para as notas)
sagadeck build <deck.yaml>                   gera o .html
sagadeck watch <deck.yaml>                   recompila o .html a cada vez que você salva o YAML
sagadeck check <deck.yaml>                   fiscal: estouro de texto, sobreposição, contraste, excesso de texto
sagadeck shots <deck.yaml> [--steps]         PNG de cada slide + folhas de contato (para revisar)
sagadeck pptx <deck.yaml> [--native-charts] [--sem-notas] [--mac-fonts]  PowerPoint editável (--sem-notas: para mandar sem a sua cola; --mac-fonts: fontes dos dois sistemas, para abrir igual no Mac)
sagadeck pdf <deck.yaml>                     PDF
sagadeck roteiro <deck.yaml>                 roteiro do apresentador em PDF
sagadeck all <deck.yaml>                     tudo acima
sagadeck mcp                                 servidor MCP para IDEs agênticos (Cursor, Claude Code, Cline)
sagadeck themes                              vitrine com os 6 temas
sagadeck icons [filtro]                      lista os ícones (ex.: sagadeck icons car)
sagadeck links <deck.yaml>                  confere se as fontes da pesquisa (contexto/pesquisa) continuam de pe
sagadeck ref                                 referência completa do YAML
sagadeck skill                               instruções para agentes de IA
```
Opção `--out=pasta` muda onde os arquivos são salvos.

## Com agentes de IA e IDEs Agênticos

O sagadeck foi projetado para ser usado por humanos e por agentes de IA:

1. **Pelo Terminal / Skill**: O agente lê as instruções (`sagadeck skill`, também em [`SKILL.md`](SKILL.md)), a referência (`sagadeck ref`), escreve o YAML e roda `autofix` → `check` → `all`. Para Claude Code, basta copiar `SKILL.md` para `~/.claude/skills/sagadeck/SKILL.md`.
2. **Pelo Estúdio Visual**: Execute `sagadeck studio palestra.yaml` para abrir a interface web estilo PowerPoint, onde você pode editar visualmente no canvas 16:9 e conversar com a IA no chat lateral. A IA se auto-corrige e nunca deixa elementos sobrepostos ou fora das margens.
3. **Pelo Protocolo MCP**: Execute `sagadeck mcp` para que IDEs agênticos (Cursor, Windsurf, Cline, Roo Code) descubram e invoquem diretamente as ferramentas de criação, leitura, fiscalização e auto-cura de apresentações.

## IA de verdade (LLM)

O chat lateral do Studio, o Napkin (texto → slide), o **"Deck com IA"** e a geração de imagens usam um LLM quando há um configurado; sem ele, o chat e o Napkin continuam funcionando com as regras locais.

O sagadeck fala direto com qualquer provedor compatível com a API da OpenAI (`/v1/chat/completions`): OpenRouter,
OpenAI, o proxy de IA da empresa. Não há serviço à parte para instalar nem para manter rodando.

**Pela tela** (o jeito mais fácil): **Configurar IA**, no alto da biblioteca, ou **IA desligada / IA ligada**, no
editor. Escolha o provedor (OpenRouter, OpenAI ou "outro compatível", com o endereço), cole a chave e diga o modelo
de cada papel:

| papel | para quê | |
|---|---|---|
| texto | chat, Napkin, geração e revisão de decks | obrigatório |
| visão | ver o slide renderizado e as imagens coladas | opcional; vazio = o de texto |
| imagem | ilustrações (`image_prompt`) | opcional |
| busca | pesquisa na web da geração (no OpenRouter, um modelo `:online`) | opcional; sem ele, buscadores diretos |

**Testar** faz uma pergunta curta com o que está na tela antes de salvar. A configuração fica só nesta máquina, em
`~/.sagadeck/ia.json` (fora do código e fora da biblioteca, que pode sincronizar com a nuvem); a chave nunca volta
inteira para a página. No modo multiusuário, quem configura é quem administra o servidor.

**À mão**, o mesmo arquivo:

```json
{
  "provider": "openrouter",
  "url": "https://openrouter.ai/api/v1",
  "keyEnv": "OPENROUTER_API_KEY",
  "models": { "text": "deepseek/deepseek-v4.1-flash", "image": "google/gemini-3.1-flash-image" }
}
```
A chave vai em `key` ou numa variável de ambiente indicada em `keyEnv`. `headers` acrescenta cabeçalhos fixos.

**Provedor que não segue a API da OpenAI** (outro jeito de autenticar, outro endereço): em vez de mexer no sagadeck,
aponte `"adaptador"` para um arquivo `.mjs` seu cujo `export default` recebe `(url, init)` e devolve a resposta (como
o `fetch`). O resto do pedido segue no formato da OpenAI.

**Quem usava o modelrelay**: na primeira vez, o sagadeck traz a configuração dele (`~/.modelrelay/config.toml`:
provedor, chave e os modelos do sagadeck) para o `~/.sagadeck/ia.json`. Depois disso o modelrelay não é mais usado.

**Modelo sem visão** (ex.: DeepSeek V4 Flash): o assistente manda uma foto do slide e as imagens que você cola.
Se o modelo recusar imagem, o sagadeck refaz o pedido sem as imagens, avisa na resposta ("não enxerga imagens")
e não insiste nesse modelo até reiniciar. Tudo funciona, só que a IA não vê o slide renderizado.

Na linha de comando, `new`, `napkin` e `imagens` usam a mesma configuração:

```bash
sagadeck new palestra --prompt "Palestra de 15 min para gerentes sobre IA com segurança. Ilustre onde fizer sentido." --slides=10
sagadeck napkin "1) cliente abre chamado 2) triagem por IA 3) analista revisa"   # --rules força as regras
sagadeck imagens palestra.yaml    # gera as imagens pedidas com image_prompt: no YAML
```

As variáveis abaixo valem por cima da configuração (útil em servidor e em testes):

| variável | |
|---|---|
| `SAGADECK_LLM_URL` | qualquer API compatível com OpenAI (ex.: `https://openrouter.ai/api/v1`) |
| `SAGADECK_LLM_KEY` | a chave (bearer token) |
| `SAGADECK_TEXT_MODEL` / `SAGADECK_VISION_MODEL` / `SAGADECK_IMAGE_MODEL` / `SAGADECK_SEARCH_MODEL` | os modelos de cada papel |
| `SAGADECK_LLM_TIMEOUT` | segundos por chamada (padrão `180`) |
| `SAGADECK_IA` | outro arquivo de configuração (padrão `~/.sagadeck/ia.json`) |

**Imagens geradas: você pede no texto**, no chat, no briefing do "Deck com IA" ou no `--prompt`; não há caixa para marcar.
"Com fotos em todos os slides" ilustra todos; "você decide onde ilustrar" deixa a IA escolher só os slides em que uma imagem
ajuda (capa, abertura, um momento marcante) e usar ícones, gráficos e diagramas no resto; sem falar de imagens, ela não gera
nenhuma (gerar custa) e, quando uma foto ajudaria muito, oferece. Na linha de comando, `--images` equivale a "você decide onde
ilustrar" e `--no-images` proíbe. Imagens só são geradas para os slides que a IA acabou de criar ou alterar.

Todo YAML vindo do LLM é validado (renderiza cada slide); se falhar, o erro volta para o LLM corrigir (até 3 tentativas). Decks gerados passam por uma rodada de enxugamento quando o fiscal anti-sono reclamaria.

## Mapa (opcional)

O slide de mapa (`layout: map`) mostra pontos, linhas e áreas sobre um mapa ao vivo: sensores, medidores, unidades de
atendimento, cinemas, trajetos, bairros, o que for. Os dados vêm de uma planilha do projeto (CSV com latitude e
longitude, ou só com o endereço) ou de arquivos GeoJSON, GPX e KML. **Nada aqui é obrigatório**: quem não usa mapa
não precisa configurar coisa nenhuma, e o sagadeck não pede nada à internet por causa dele.

**Sem chave nenhuma, já funciona** com os serviços públicos gratuitos do OpenStreetMap:

| serviço | para quê | padrão (sem configurar) |
|---|---|---|
| mapa de fundo | as ruas por baixo das camadas | OpenStreetMap |
| endereço e coordenada | **Achar coordenadas** de uma planilha só com endereço | Nominatim (1 endereço por segundo) |
| busca de lugares | achar cinemas, escolas, unidades de saúde… pelo nome do tipo | Overpass |
| rotas | "seguir as ruas" ao desenhar, distância e tempo | OSRM (servidor de demonstração) |

**Chave opcional: OpenRouteService**, para rotas a pé, de carro e de bicicleta e para a **área alcançável em X
minutos**. É gratuita:
1. Crie a conta em [openrouteservice.org](https://openrouteservice.org) e confirme o e-mail.
2. No painel, gere um token do plano gratuito (Standard).
3. No Studio, **Configurar mapa** (no alto da biblioteca, ou no formulário do slide de mapa) › Rotas › **Usar o
   OpenRouteService**, cole a chave e clique em **Testar**.

A configuração fica só nesta máquina, em `~/.sagadeck/mapa.json` (como a da IA); a chave nunca volta inteira para a
página e nunca vai para dentro da apresentação. Também vale pôr a chave numa variável de ambiente e indicar o nome dela
em `keyEnv` (no servidor, por exemplo):

```json
{ "rotas": { "provedor": "openrouteservice", "url": "https://api.openrouteservice.org", "keyEnv": "OPENROUTESERVICE_API_KEY" } }
```

Os serviços públicos têm regras de uso que o sagadeck respeita sozinho: identifica cada pedido, mostra a atribuição
"© colaboradores do OpenStreetMap", busca um endereço por segundo, guarda o que já achou e nunca baixa mapa fora da
tela. Eles são para uso leve e não comercial; no trabalho, prefira o servidor de mapas da empresa ou um provedor com
chave (os endereços se trocam em **Configurar mapa**). Antes de mandar os endereços de uma planilha sua para um
serviço de fora, o sagadeck pergunta.

Se a rede barrar um serviço (autorização negada, proxy, bloqueio), o sagadeck faz **uma tentativa e para**: avisa
na tela, as camadas continuam desenhadas e nada é tentado de novo até você clicar em **Tentar de novo**.

## Desenvolvimento

```bash
npm install
node bin/sagadeck.js build templates/exemplo.yaml
npm test                # suíte inteira: motor + runtime + Studio (clicando num Chrome headless)
npm run test:unit       # só o motor (rápido, sem navegador)
SAGADECK_LIVE=1 npm test  # inclui os testes que chamam o LLM de verdade (o configurado em Configurar IA)
```
**Toda funcionalidade nova entra com teste** em `test/` — é o que garante que um refactor não apague o que já funciona. Veja [CLAUDE.md](CLAUDE.md).

Publicação: com a CI verde, crie uma release `vX.Y.Z` no GitHub; o workflow `.github/workflows/publish.yml` publica no npm (*trusted publishing*). A versão fica em `package.json`.

## Arquivo `.sagadeck` (a apresentação inteira)

Uma apresentação é o YAML **mais** os arquivos que ele usa: imagens (inclusive as geradas pela IA em
`imagens/`), CSS próprio (`css:`) e widgets (`widgets:`). Baixar só o YAML quebraria o deck em outra máquina.
O `.sagadeck` junta tudo num arquivo só. Por dentro é um .zip, como `.pptx` e `.docx`:

```text
sagadeck.json        manifesto: formato, versão, YAML principal, título, data
<nome>.yaml          a apresentação (sem caminhos da máquina de quem salvou)
imagens/ widgets/ …  os arquivos, nos mesmos caminhos do YAML
assets/              arquivos que estavam fora da pasta do deck (o YAML do pacote aponta para cá)
FALTANDO.txt         o que o deck usa mas não existia ao salvar (se houver)
```

```bash
sagadeck pack palestra.yaml                 # -> palestra.sagadeck
sagadeck unpack palestra.sagadeck [pasta]   # extrai (nunca sobrescreve)
sagadeck studio palestra.sagadeck           # extrai ao lado e abre no Studio
```

No Studio: **Arquivo › Baixar apresentação (.sagadeck)**. O **Abrir do computador** aceita `.sagadeck` e `.zip`;
o arquivo entra na biblioteca, no tópico **Importados**, e as edições são salvas lá. Um arquivo salvo por uma versão mais nova do
formato avisa para atualizar o sagadeck. Se um filtro de e-mail barrar a extensão, renomeie para `.zip`: abre igual.

## Biblioteca

`sagadeck studio` sem arquivo abre a biblioteca: suas apresentações organizadas em tópicos, com capa, busca,
lixeira (30 dias; o prazo se muda em Preferências) e o menu **⋯** de cada cartão (apresentar, renomear, duplicar, mover, baixar tudo/.sagadeck/PPTX/PDF).

**Nova apresentação** tem três caminhos: *Descrever com IA* (o assunto, quanto tempo você tem, que vira o número de
slides, o estilo e, se quiser, material de apoio: PDF, Word, PowerPoint, Excel ou um link), *A partir de um arquivo
ou link* (o mesmo, começando pelo anexo) e *Modelo pronto* (coleções, estilos, demonstrações e exemplos, com filtro).
No editor, **Arquivo › Baixar tudo** entrega num .zip o PowerPoint (com notas), o PDF e o roteiro. O editor abre no
modo simples; **Mais opções**, ao lado das abas, mostra as ferramentas de especialista (YAML, API ao vivo…).
Arraste um cartão para um tópico para movê-lo. O ícone da biblioteca, no canto do editor, volta para ela.

Não tem banco de dados: a biblioteca é uma pasta comum, que dá para abrir no Explorer e fazer backup.

```text
Documentos/sagadeck/         (Windows; ~/sagadeck no Mac/Linux; ou SAGADECK_HOME, ou --library=PASTA)
  Palestras/                 tópico = pasta (a cor fica em .topico.json)
    Minha palestra/          apresentação = pasta com o YAML e os arquivos dela
      Minha palestra.yaml
      imagens/
  solta.yaml                 YAML solto também aparece ("Sem tópico")
  .lixeira/  .cache/         excluídas e capas geradas
```

O Studio escuta só em `127.0.0.1` por padrão; `--host=0.0.0.0` abre para a rede (a biblioteca inteira junto).
Só a própria página usa o Studio: sem CORS, pedidos de outro site para `/api/*` levam 403, e ele não pode ser
embutido em iframe de outra origem.

**Comandos da IA (para testar APIs de verdade):** no chat do Studio, a IA pode pedir para rodar um trecho de JavaScript, Python, PowerShell ou shell — por exemplo, testar a API cuja documentação você colou, ajustar o contrato e só então montar o slide. Nada roda sem você ver o código e clicar em **Executar** (ou em *Executar e liberar os próximos*, que vale até recarregar o Studio ou trocar de apresentação). O comando roda na pasta da apresentação e recebe as variáveis do ambiente ativo (`SAGA_VAR_*`, `SAGA_SECRET_*`, `SAGA_TOKEN`); a IA só vê os nomes, e a saída volta para ela com os segredos mascarados. No servidor multiusuário, só quem estiver em `--agentes=usuario1,usuario2` (ou `SAGADECK_AGENTES`) tem comandos, e eles rodam **na máquina do servidor**; os demais usam o resto normalmente.

**Vários usuários (servidor):** `sagadeck studio --multiuser --library=/srv/sagadeck` dá uma biblioteca por pessoa
(`usuarios/<nome>/`), identificada pelo cabeçalho `X-Sagadeck-User` (ou `--user-header=...`) que o proxy de login
(nginx) coloca. Sem o cabeçalho, nada é servido. Por confiar nesse cabeçalho, só roda escutando em `127.0.0.1`,
atrás do proxy. Se o nginx troca o `Host`, mande o endereço do portal em `X-Forwarded-Host` (`proxy_set_header
X-Forwarded-Host $host;`): é com ele que o Studio reconhece a própria página.

**Link para ver (só leitura):** Arquivo › Compartilhar link cria um link para uma apresentação: quem abre vê a
apresentação pronta, sem o editor, sem a biblioteca e sem as notas do apresentador (a não ser que se marque).
No servidor, `/ver/<código>` exige o usuário do portal (o proxy pede a sessão e manda `X-Sagadeck-User`) e
`/publico/<código>` abre para qualquer pessoa, só se o link foi criado como público (o proxy deixa passar sem
sessão e sem o cabeçalho). Os links ficam em `<biblioteca>/.compartilhados.json`; revogar apaga na hora. Quem abre baixa pelo botão Baixar da página (`<link>/baixar/pdf|pptx|html|estudo|estudo-html|sagadeck`, e `roteiro`/`tudo` só no link com as notas), um arquivo por vez por link. As páginas
vão com `noindex` e sem Referer. No Studio local, o link abre para quem alcança o Studio (com `--host=0.0.0.0`, a
rede da casa).

**Baixar para apresentar (HTML)** é outra coisa: um HTML único, com tudo embutido, para apresentar em qualquer
navegador, mas não para editar.

## Slides para devs: API ao vivo

O layout `api` é um slide tipo Postman: mostra o pedido (URL, corpo, cabeçalhos) e o código equivalente
(curl, Python e Python comentado), e o botão **Executar** roda o pedido de verdade na frente da plateia:
síncrono, polling com linha do tempo, streaming, upload, token (JWT decodificado), embeddings, TTS/STT e
conversa em tempo real por WebSocket. Os pedidos saem do Studio (na sua máquina), então não tem CORS e o
token nunca vai para a página.

Para ver funcionando sem configurar nada:

- **Biblioteca → Nova → Exemplo: aula de APIs ao vivo.** Cria um deck com um slide de cada tipo, que roda no
  ambiente **ENSAIO**: uma API de mentira que o Studio sobe sozinho (sem VPN, sem chave). Apresente e clique
  em **Executar**. (`sagadeck ensaio-api` faz o mesmo pela linha de comando.) O deck também traz um slide
  **OpenRouter (real)** com `nvidia/nemotron-3-super-120b-a12b:free`. Para usá-lo, defina `OPENROUTER_API_KEY` no
  processo que inicia o Studio e escolha o ambiente **OPENROUTER** no selo do slide. A chave fica fora do
  deck; no PowerShell, por exemplo, defina `$env:OPENROUTER_API_KEY = "sua-chave"` antes de iniciar o
  Studio e reinicie-o depois de definir a variável.
- **No editor, Inserir → Slide de API:** os mesmos exemplos, um de cada vez, entram depois do slide atual.
  O painel **Formatar** edita o endereço, o corpo em JSON, o modo (síncrono, polling, streaming, tempo real)
  e o que guardar para os próximos slides.
- **Inserir → Ambientes:** onde ficam os endereços (`{{base}}`), tokens e segredos do *seu* serviço
  (dev, hom, prod). Preenche-se por campos: endereço base, variáveis, segredos (guardados cifrados) e a
  autenticação (nenhuma, token fixo ou token que expira), com **Testar**; quem prefere edita o YAML na aba
  "Como texto". É gravado em `~/.sagadeck/ambientes.yaml`, na sua máquina, nunca no deck. Sem ambiente seu, o
  **ENSAIO** (API de mentira) já funciona. O selo no slide (DEV, HOM, ENSAIO…) troca o ambiente na hora. No
  servidor multiusuário o botão não aparece (lá os slides de API não executam).

Executar só funciona no Studio local; no HTML exportado e no modo multiusuário, o slide mostra a última
resposta gravada. Todos os campos estão na [referência](docs/REFERENCIA.md#slide-api-requisição-ao-vivo).

## Apresentando (HTML)

| tecla | ação |
|---|---|
| `→` `espaço` / `←` | avança / volta (inclusive cliques dentro do slide) |
| `P` | abre a **janela do apresentador**: slide atual, próximo, notas, relógio, cronômetro com "adiantado/atrasado" |
| `F` | tela cheia |
| `G` | visão geral de todos os slides |
| `B` / `W` | tela preta / branca |
| `L` | apontador laser |
| `R` | zera o timer do slide |
| `5` `Enter` | vai para o slide 5 |
| `H` | ajuda |

**No Teams:** compartilhe só a janela do deck (a janela do apresentador fica com você). Se tiver um monitor só, deixe a janela do apresentador ao lado e compartilhe a janela do deck. Para vídeos com som, compartilhe com "incluir som do computador".

## Temas

`sinal` (sinalização, DIN condensada, amarelo de aviso) · `editorial` (revista, serifada, vermelho-tomate) · `noite` (escuro elegante, latão) · `bauhaus` (geométrico, cores primárias) · `terminal` (dados, monoespaçada, âmbar — sem neon) · `jornal` (manchete, Franklin Gothic, azul-tinta) · `rabisco` · `oceano` · `pop` · `aurora` · `prata`.
Trocar o tema muda o arranjo, não só cor e fonte: capa, seção, título, cartões, lista, citação e número grande têm o
jeito de cada tema. No Studio, passar o mouse num tema mostra a prévia no slide; o clique aplica.
As fontes dos temas vêm embutidas (licença OFL): a apresentação não pede nada à internet e funciona numa rede que
barra o Google. Veja todos lado a lado com `sagadeck themes`. Dá para criar o seu estendendo um tema — veja `docs/REFERENCIA.md`.

## Arquivos

```
bin/sagadeck.js            linha de comando
src/themes.js           temas (cores, tons, fontes para navegador e PowerPoint)
src/layouts.js          os 21 layouts
src/elements.js         elementos (texto, contador, timer, enquete, cartões…)
src/figures/            pictogramas, diagramas, gráficos, ícones — tudo gerado em SVG
src/runtime/            o motor que roda no navegador (navegação, cliques, apresentador, widgets)
src/export/             PowerPoint, PDF, imagens, roteiro e o fiscal
templates/exemplo.yaml  deck de exemplo com todos os layouts
docs/REFERENCIA.md      referência completa do YAML
SKILL.md                instruções para IAs gerarem decks com o sagadeck
tools/ppt-render.ps1    renderiza um .pptx pelo PowerPoint (para conferir fidelidade)
tools/test-live.mjs     teste automático do modo apresentação e dos widgets
```

## Limitações conhecidas

- O PPTX usa as fontes do Windows/Office dos temas. Para abrir igual num Mac sem Office, exporte com `sagadeck pptx deck.yaml --mac-fonts` (só o PPTX troca as fontes por equivalentes dos dois sistemas; o HTML e o PDF continuam iguais).
- Widgets interativos (jogos, simuladores) viram imagem do estado final no PowerPoint e no PDF — a interação existe só no HTML.
- Gráficos entram como imagem nítida no PPTX; com `--native-charts`, barras/colunas/linhas/rosca viram gráficos nativos editáveis (com visual mais simples).
