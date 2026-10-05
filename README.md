# Saga · sagadeck — gerador de apresentações

Você (ou uma IA) escreve um arquivo `.yaml` com o conteúdo. O sagadeck gera:

| saída | pra quê |
|---|---|
| **`.html`** | a apresentação "de verdade": animada, com cliques, enquetes, timers, jogos, modo apresentador. Um arquivo só, funciona offline, abre com duplo clique. |
| **`.pptx`** | PowerPoint **editável** e fiel ao HTML: texto em caixas nativas com as mesmas fontes, formas nativas, figuras em PNG nítido, animações de clique e transições, notas do apresentador (ou sem elas, para mandar a alguém). |
| **`.pdf`** | um slide por página, para mandar depois da palestra |
| **`- roteiro.pdf`** | roteiro do apresentador: miniatura de cada slide + fala + interações + relógio planejado |

Ele vem com 11 temas (incluindo estilo Keynote Apple em prata clean e respirável, artesanal desenhado à mão, azul elétrico vivo e pop alegre), 23 layouts (incluindo KPIs e fluxos de processo), 2.100+ ícones, pictogramas e cenas geradas na hora, diagramas, 7 tipos de gráfico, e um **fiscal automático** que detecta texto estourado, sobreposição, contraste baixo e slides com texto demais ("anti-sono").

## Instalação

```bash
pip install sagadeck
```
Requer **Node.js 18+** e **Chrome ou Edge** instalados (o motor é JavaScript e vem empacotado no pacote Python).

## Como usar

Toda apresentação mora na **biblioteca**: `SAGADECK_HOME`, ou `~/sagadeck` (no Windows, `C:Users<você>sagadeck`). Uma pasta por tópico, uma por apresentação.

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
sagadeck ref                                 referência completa do YAML
sagadeck skill                               instruções para agentes de IA
```
Opção `--out=pasta` muda onde os arquivos são salvos.

## Com agentes de IA e IDEs Agênticos

O sagadeck foi projetado para ser usado por humanos e por agentes de IA:

1. **Pelo Terminal / Skill**: O agente lê as instruções (`sagadeck skill`, também em [`SKILL.md`](SKILL.md)), a referência (`sagadeck ref`), escreve o YAML e roda `autofix` → `check` → `all`. Para Claude Code, basta copiar `SKILL.md` para `~/.claude/skills/sagadeck/SKILL.md`.
2. **Pelo Estúdio Visual**: Execute `sagadeck studio palestra.yaml` para abrir a interface web estilo PowerPoint, onde você pode editar visualmente no canvas 16:9 e conversar com a IA no chat lateral. A IA se auto-corrige e nunca deixa elementos sobrepostos ou fora das margens.
3. **Pelo Protocolo MCP**: Execute `sagadeck mcp` para que IDEs agênticos (Cursor, Windsurf, Cline, Roo Code) descubram e invoquem diretamente as ferramentas de criação, leitura, fiscalização e auto-cura de apresentações.

Se o código de uma ferramenta em Python quiser chamar o sagadeck diretamente (sem montar comandos de terminal), há uma API mínima:

```python
import sagadeck
sagadeck.autofix("palestra.yaml")               # corrige sobreposições e margens automaticamente
sagadeck.studio()                               # abre a biblioteca (~/sagadeck)
sagadeck.studio("palestra.yaml", port=3517)     # abre direto o editor de um deck
sagadeck.export("palestra.yaml", out="saida")   # {'html': …, 'pptx': …, 'pdf': …, 'roteiro': …}
print(sagadeck.check("palestra.yaml"))           # relatório do fiscal em texto
contexto = sagadeck.reference()                  # referência do YAML para colocar no prompt
```

## IA de verdade (LLM)

O chat lateral do Studio, o Napkin (texto → slide), o **"✨ Deck com IA"** e a geração de imagens usam um LLM quando há um disponível; sem LLM, o chat e o Napkin continuam funcionando com as regras locais.

O sagadeck fala com qualquer endpoint compatível com OpenAI (`/v1/chat/completions`). O caminho recomendado é o [modelrelay](https://github.com/naruminho/modelrelay), que decide pela configuração dele para onde as chamadas vão (OpenRouter, OpenAI, gateway corporativo), sem nada disso no sagadeck:

```bash
pip install "sagadeck[ia]"      # o sagadeck com o modelrelay na versão que ele exige
# ou só o modelrelay:  pip install -U modelrelay
```

Com um modelrelay mais velho do que o exigido, o sagadeck avisa ao abrir e mostra o comando para atualizar.
Quem desenvolve o modelrelay e o instalou direto do clone (`pip install -e .` na pasta dele, a "instalação
editável": o Python lê o código da pasta, sem cópia) atualiza só com `git pull` ali, e o aviso diz isso, com a
pasta. `pip install -e .` de novo só quando o modelrelay ganhar uma dependência nova.

O jeito mais fácil de configurar é pela tela: abra `sagadeck studio` e clique em **modelrelay** no alto da
biblioteca (ou abra http://127.0.0.1:8765/ com um `modelrelay serve` rodando). Lá você escolhe o provedor
(OpenRouter, OpenAI, Google, DeepSeek, o gateway da empresa…), cola a chave, testa e diz qual modelo faz
**texto** e qual faz **imagem**. A tela grava o `~/.modelrelay/config.toml`, que também dá para editar à mão
(`modelrelay init` cria um modelo comentado). O botão só aparece quando o modelrelay roda nesta máquina; no
modo multiusuário, quem configura é o admin.

À mão, no `~/.modelrelay/config.toml`, os apelidos que o sagadeck usa são:

```toml
[models]
"text"  = "google/gemini-2.5-flash"         # chat, Napkin e geração de deck
"image" = "google/gemini-2.5-flash-image"   # imagens
```

O sagadeck se identifica para o modelrelay (cabeçalho `X-Modelrelay-App: sagadeck`), então dá para usar
modelos diferentes só nele, sem afetar outros apps que usam o mesmo modelrelay:

```toml
[apps.sagadeck.models]                      # só o que muda para o sagadeck; o resto vem de [models]
"text" = "deepseek/deepseek-v4-flash"
```

Confira com `modelrelay show --app sagadeck`. Detalhes na seção *Per-app models* do README do modelrelay.

**Modelo sem visão** (ex.: DeepSeek V4 Flash): o assistente manda uma foto do slide e as imagens que você cola.
Se o modelo recusar imagem, o sagadeck refaz o pedido sem as imagens, avisa na resposta ("não enxerga imagens")
e não insiste nesse modelo até reiniciar. Tudo funciona, só que a IA não vê o slide renderizado.

Pronto: com o modelrelay instalado no mesmo Python, `sagadeck studio`, `new`, `napkin` e `imagens` sobem um `modelrelay serve` sozinhos enquanto rodam. Rodando o motor Node direto (`node bin/sagadeck.js`), deixe um `modelrelay serve` aberto em outro terminal.

```bash
sagadeck new palestra --prompt "Palestra de 15 min para gerentes sobre IA com segurança. Ilustre onde fizer sentido." --slides=10
sagadeck napkin "1) cliente abre chamado 2) triagem por IA 3) analista revisa"   # --rules força as regras
sagadeck imagens palestra.yaml    # gera as imagens pedidas com image_prompt: no YAML
```

| variável | padrão | |
|---|---|---|
| `SAGADECK_LLM_URL` | `http://127.0.0.1:8765/v1` | qualquer API compatível com OpenAI (ex.: `https://openrouter.ai/api/v1`) |
| `SAGADECK_LLM_KEY` | — | bearer token, se apontar direto para um provedor |
| `SAGADECK_TEXT_MODEL` / `SAGADECK_IMAGE_MODEL` | `text` / `image` | nomes dos modelos |
| `SAGADECK_LLM_TIMEOUT` | `180` | segundos por chamada |
| `SAGADECK_NO_RELAY` | — | `1` impede o pacote Python de subir o modelrelay |
| `SAGADECK_APP` | `sagadeck` | nome com que o sagadeck se identifica ao modelrelay (`[apps.<nome>.models]`) |

**Imagens geradas: você pede no texto**, no chat, no briefing do "Deck com IA" ou no `--prompt`; não há caixa para marcar.
"Com fotos em todos os slides" ilustra todos; "você decide onde ilustrar" deixa a IA escolher só os slides em que uma imagem
ajuda (capa, abertura, um momento marcante) e usar ícones, gráficos e diagramas no resto; sem falar de imagens, ela não gera
nenhuma (gerar custa) e, quando uma foto ajudaria muito, oferece. Na linha de comando, `--images` equivale a "você decide onde
ilustrar" e `--no-images` proíbe. Imagens só são geradas para os slides que a IA acabou de criar ou alterar.

Todo YAML vindo do LLM é validado (renderiza cada slide); se falhar, o erro volta para o LLM corrigir (até 3 tentativas). Decks gerados passam por uma rodada de enxugamento quando o fiscal anti-sono reclamaria.

## Desenvolvimento

```bash
npm install
node bin/sagadeck.js build templates/exemplo.yaml
npm run bundle          # empacota o motor em python/sagadeck/engine
npm run build:py        # gera dist/*.whl e dist/*.tar.gz
npm test                # suíte inteira: motor + runtime + Studio (clicando num Chrome headless)
npm run test:unit       # só o motor (rápido, sem navegador)
SAGADECK_LIVE=1 npm test  # inclui os testes que chamam o LLM de verdade (modelrelay)
```
**Toda funcionalidade nova entra com teste** em `test/` — é o que garante que um refactor não apague o que já funciona. Veja [CLAUDE.md](CLAUDE.md).

Publicação: crie uma release `vX.Y.Z` no GitHub (o workflow `.github/workflows/publish.yml` publica no PyPI via *trusted publishing*). A versão fica em `package.json` e `python/sagadeck/__init__.py` (o bundle confere se são iguais).

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
lixeira (30 dias) e o menu **⋯** de cada cartão (apresentar, renomear, duplicar, mover, baixar tudo/.sagadeck/PPTX/PDF).

**Nova apresentação** tem três caminhos: *Descrever com IA* (o assunto, quanto tempo você tem, que vira o número de
slides, o estilo e, se quiser, material de apoio: PDF, Word, PowerPoint, Excel ou um link), *A partir de um arquivo
ou link* (o mesmo, começando pelo anexo) e *Modelo pronto* (coleções, estilos, demonstrações e exemplos, com filtro).
No editor, **Arquivo › Baixar tudo** entrega num .zip o PowerPoint (com notas), o PDF e o roteiro. O editor abre no
modo simples; **Mais opções**, ao lado das abas, mostra as ferramentas de especialista (YAML, API ao vivo…).
Arraste um cartão para um tópico para movê-lo. O ícone da biblioteca, no canto do editor, volta para ela.

Não tem banco de dados: a biblioteca é uma pasta comum, que dá para abrir no Explorer e fazer backup.

```text
~/sagadeck/                  (ou SAGADECK_HOME, ou --library=PASTA)
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
  (dev, hom, prod). É gravado em `~/.sagadeck/ambientes.yaml`, na sua máquina, nunca no deck. O selo no
  slide (DEV, HOM, ENSAIO…) troca o ambiente na hora.

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
python/sagadeck/        pacote Python (CLI + API) que carrega o motor empacotado
scripts/bundle.mjs      empacota o motor para o pip
tools/ppt-render.ps1    renderiza um .pptx pelo PowerPoint (para conferir fidelidade)
tools/test-live.mjs     teste automático do modo apresentação e dos widgets
```

## Limitações conhecidas

- O PPTX usa as fontes do Windows/Office dos temas. Para abrir igual num Mac sem Office, exporte com `sagadeck pptx deck.yaml --mac-fonts` (só o PPTX troca as fontes por equivalentes dos dois sistemas; o HTML e o PDF continuam iguais).
- Widgets interativos (jogos, simuladores) viram imagem do estado final no PowerPoint e no PDF — a interação existe só no HTML.
- Gráficos entram como imagem nítida no PPTX; com `--native-charts`, barras/colunas/linhas/rosca viram gráficos nativos editáveis (com visual mais simples).
