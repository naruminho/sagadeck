---
name: sagadeck
description: Gera apresentações bonitas (HTML animado + PowerPoint editável + PDF + roteiro do apresentador) a partir de um arquivo YAML, com temas prontos, pictogramas, diagramas e gráficos gerados na hora. Use quando pedirem slides, deck, palestra, apresentação ou PowerPoint.
---

# sagadeck — como um agente de IA deve gerar um deck

Tudo é feito pelo comando `sagadeck` no terminal (instalado com `pip install sagadeck`; precisa de Node.js 18+ e Chrome ou Edge).

Antes de escrever o YAML, **rode `sagadeck ref`** e leia a referência completa (layouts, elementos, figuras, gráficos, temas, widgets).
Para ver um deck completo de exemplo: `sagadeck new exemplo.yaml` e leia o arquivo gerado.

## Comandos

| comando | o que faz |
|---|---|
| `sagadeck new deck.yaml [--theme=sinal]` | cria um deck de exemplo |
| `sagadeck build deck.yaml` | gera `deck.html` |
| `sagadeck check deck.yaml` | fiscal: texto estourado, sobreposição, contraste, fonte pequena, excesso de texto |
| `sagadeck shots deck.yaml` | PNG de cada slide + folhas de contato em `deck-revisao/` |
| `sagadeck all deck.yaml` | html + check + pptx + pdf + roteiro |
| `sagadeck pptx` / `pdf` / `roteiro deck.yaml` | cada saída separada |
| `sagadeck themes` | vitrine dos 6 temas |
| `sagadeck icons <filtro>` | procura ícones (2.100+) |
| `sagadeck ref` / `sagadeck skill` | referência do YAML / estas instruções |

Todos aceitam `--out=pasta`. Código de saída diferente de 0 = erro (a mensagem diz o slide e o campo).

## Fluxo obrigatório

1. **Roteiro antes de slide.** Defina narrativa (gancho → 2–4 blocos → fechamento), duração e público. Distribua `time` por slide somando `duration`.
2. **Escreva o YAML**, um layout por slide. Nunca vários "título + bullets" seguidos: alterne `statement`, `number`, `split`, `chart`, `cards`, `timeline`, `question`, `compare`, `matrix`…
3. `sagadeck check deck.yaml` — corrija TODOS os itens listados e os avisos "anti-sono".
4. `sagadeck shots deck.yaml` e **olhe as imagens** `deck-revisao/folha-*.png` (se você consegue ver imagens). Corrija o que estiver feio, apertado, vazio ou desalinhado. Repita até ficar limpo.
5. `sagadeck all deck.yaml` para gerar as entregas.

## Regras de design (anti-sono)

- **Uma ideia por slide**, até ~40 palavras visíveis; o resto vai para `notes`.
- **Revele aos poucos**: `build: true` em listas, cards e linhas do tempo; `step: N` em elementos avulsos.
- **Números grandes** com `layout: number` (contador animado).
- **Interação a cada 5–7 minutos**: `question` (com `timer`), `poll` (resultado digitado ao vivo; `compare` com outra enquete).
- **Figuras geradas** em vez de fotos: `picto`, `diagram`, `chart`, `icon`; para algo específico, `svg` usando `var(--fg)`, `var(--hi)`, `var(--em)`.
- Alterne tons (`tone: dark`, `accent`) para dar ritmo; capítulos com `section`.
- Cite fontes com `source`. Não invente dados; marque simulações como ilustrativas.

## Notas (roteiro do apresentador)

`notes` é um roteiro real: `> fala em voz alta`, `CLIQUE:`, `INTERAÇÃO:`, `PLANO B:`, `CUIDADO:`, `TRANSIÇÃO:`. O modo apresentador (tecla P no HTML) e o `roteiro.pdf` usam isso.

## Interativos sob medida

Para jogos e simulações, escreva um widget JS (`Sagadeck.widget(nome, { mount(el, opts, api) {…} })`), registre em `widgets:` no cabeçalho do YAML e declare `steps: N` no slide. Detalhes em `sagadeck ref`, seção "Widgets próprios".
