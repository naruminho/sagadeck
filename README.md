# Saga · sagadeck — gerador de apresentações

Você (ou uma IA) escreve um arquivo `.yaml` com o conteúdo. O sagadeck gera:

| saída | pra quê |
|---|---|
| **`.html`** | a apresentação "de verdade": animada, com cliques, enquetes, timers, jogos, modo apresentador. Um arquivo só, funciona offline, abre com duplo clique. |
| **`.pptx`** | PowerPoint **editável** e fiel ao HTML: texto em caixas nativas com as mesmas fontes, formas nativas, figuras em PNG nítido, animações de clique e transições, notas do apresentador. |
| **`.pdf`** | um slide por página, para mandar depois da palestra |
| **`- roteiro.pdf`** | roteiro do apresentador: miniatura de cada slide + fala + interações + relógio planejado |

Ele vem com 6 temas, 21 layouts, 2.100+ ícones, pictogramas e cenas geradas na hora, diagramas, 7 tipos de gráfico, e um **fiscal automático** que detecta texto estourado, sobreposição, contraste baixo e slides com texto demais ("anti-sono").

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
sagadeck build <deck.yaml>                   gera o .html
sagadeck watch <deck.yaml>                   recompila o .html a cada vez que você salva o YAML
sagadeck check <deck.yaml>                   fiscal: estouro de texto, sobreposição, contraste, excesso de texto
sagadeck shots <deck.yaml> [--steps]         PNG de cada slide + folhas de contato (para revisar)
sagadeck pptx <deck.yaml> [--native-charts]  PowerPoint editável
sagadeck pdf <deck.yaml>                     PDF
sagadeck roteiro <deck.yaml>                 roteiro do apresentador em PDF
sagadeck all <deck.yaml>                     tudo acima
sagadeck themes                              vitrine com os 6 temas
sagadeck icons [filtro]                      lista os ícones (ex.: sagadeck icons car)
sagadeck ref                                 referência completa do YAML
sagadeck skill                               instruções para agentes de IA
```
Opção `--out=pasta` muda onde os arquivos são salvos.

## Com agentes de IA

O caminho principal é o agente usar o **terminal**: ele lê as instruções (`sagadeck skill`, também em [`SKILL.md`](SKILL.md)), a referência (`sagadeck ref`), escreve o YAML e roda `check` → `shots` → `all`. Para Claude Code, basta copiar `SKILL.md` para `~/.claude/skills/sagadeck/SKILL.md`.

Se o código de uma ferramenta em Python quiser chamar o sagadeck diretamente (sem montar comandos de terminal), há uma API mínima:

```python
import sagadeck
sagadeck.export("palestra.yaml", out="saida")   # {'html': …, 'pptx': …, 'pdf': …, 'roteiro': …}
print(sagadeck.check("palestra.yaml"))           # relatório do fiscal em texto
contexto = sagadeck.reference()                  # referência do YAML para colocar no prompt
```

## Desenvolvimento

```bash
npm install
node bin/sagadeck.js build templates/exemplo.yaml
npm run bundle          # empacota o motor em python/sagadeck/engine
npm run build:py        # gera dist/*.whl e dist/*.tar.gz
```
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
