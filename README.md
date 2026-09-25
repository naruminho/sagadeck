# Saga · sagadeck — gerador de apresentações

Você (ou uma IA) escreve um arquivo `.yaml` com o conteúdo. O sagadeck gera:

| saída | pra quê |
|---|---|
| **`.html`** | a apresentação "de verdade": animada, com cliques, enquetes, timers, jogos, modo apresentador. Um arquivo só, funciona offline, abre com duplo clique. |
| **`.pptx`** | PowerPoint **editável** e fiel ao HTML: texto em caixas nativas com as mesmas fontes, formas nativas, figuras em PNG nítido, animações de clique e transições, notas do apresentador. |
| **`.pdf`** | um slide por página, para mandar depois da palestra |
| **`- roteiro.pdf`** | roteiro do apresentador: miniatura de cada slide + fala + interações + relógio planejado |

Ele vem com 11 temas (incluindo estilo Keynote Apple em prata clean e respirável, artesanal desenhado à mão, azul elétrico vivo e pop alegre), 23 layouts (incluindo KPIs e fluxos de processo), 2.100+ ícones, pictogramas e cenas geradas na hora, diagramas, 7 tipos de gráfico, e um **fiscal automático** que detecta texto estourado, sobreposição, contraste baixo e slides com texto demais ("anti-sono").

## Instalação

```bash
pip install sagadeck
```
Requer **Node.js 18+** e **Chrome ou Edge** instalados (o motor é JavaScript e vem empacotado no pacote Python).

## Como usar

```bash
sagadeck new minha-palestra.yaml --theme=editorial
```
```bash
sagadeck all minha-palestra.yaml
```

Comandos:

```
sagadeck new <deck.yaml> [--theme=sinal]     cria um deck de exemplo
sagadeck studio [deck.yaml] [--port=3000]    abre o estúdio web visual estilo PowerPoint com chat lateral IA
sagadeck autofix <deck.yaml> [--out=pasta]   auto-corrige sobreposições, margens e excesso de texto no YAML
sagadeck build <deck.yaml>                   gera o .html
sagadeck watch <deck.yaml>                   recompila o .html a cada vez que você salva o YAML
sagadeck check <deck.yaml>                   fiscal: estouro de texto, sobreposição, contraste, excesso de texto
sagadeck shots <deck.yaml> [--steps]         PNG de cada slide + folhas de contato (para revisar)
sagadeck pptx <deck.yaml> [--native-charts]  PowerPoint editável
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
sagadeck.studio("palestra.yaml", port=3000)     # abre o estúdio PowerPoint interativo
sagadeck.export("palestra.yaml", out="saida")   # {'html': …, 'pptx': …, 'pdf': …, 'roteiro': …}
print(sagadeck.check("palestra.yaml"))           # relatório do fiscal em texto
contexto = sagadeck.reference()                  # referência do YAML para colocar no prompt
```

## IA de verdade (LLM)

O chat lateral do Studio, o Napkin (texto → slide), o **"✨ Deck com IA"** e a geração de imagens usam um LLM quando há um disponível; sem LLM, o chat e o Napkin continuam funcionando com as regras locais.

O sagadeck fala com qualquer endpoint compatível com OpenAI (`/v1/chat/completions`). O caminho recomendado é o [modelrelay](https://github.com/naruminho/modelrelay), que decide pela configuração dele para onde as chamadas vão (OpenRouter, OpenAI, gateway corporativo), sem nada disso no sagadeck:

```bash
pip install git+https://github.com/naruminho/modelrelay
modelrelay init
```

No `~/.modelrelay/config.toml`, defina os apelidos que o sagadeck usa:

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
sagadeck new palestra.yaml --prompt "Palestra de 15 min para gerentes sobre IA com segurança. Ilustre onde fizer sentido." --slides=10
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

`sinal` (sinalização, DIN condensada, amarelo de aviso) · `editorial` (revista, serifada, vermelho-tomate) · `noite` (escuro elegante, latão) · `bauhaus` (geométrico, cores primárias) · `terminal` (dados, monoespaçada, âmbar — sem neon) · `jornal` (manchete, Franklin Gothic, azul-tinta).
Veja todos lado a lado com `sagadeck themes`. Dá para criar o seu estendendo um tema — veja `docs/REFERENCIA.md`.

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

- O PPTX usa as fontes do Windows/Office dos temas. Aberto num Mac sem essas fontes, o PowerPoint troca a fonte (o HTML e o PDF continuam iguais).
- Widgets interativos (jogos, simuladores) viram imagem do estado final no PowerPoint e no PDF — a interação existe só no HTML.
- Gráficos entram como imagem nítida no PPTX; com `--native-charts`, barras/colunas/linhas/rosca viram gráficos nativos editáveis (com visual mais simples).
