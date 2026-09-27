# Trabalho em andamento

Diário de bordo das frentes longas: o que já entrou, o que falta e as decisões tomadas. Serve para qualquer
sessão (Claude, GPT, pessoa) continuar de onde a outra parou, sem depender de conversa ou de máquina.

**Regra:** ao terminar uma etapa, atualize este arquivo no mesmo commit. Ao abrir uma sessão nova, leia antes de
começar. Trabalho em curso vai para o GitHub (commit + push) a cada etapa, nunca só no disco local.

---

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
  `rubi`, `ametista`, `tangerina`, `oceano`, `esmeralda` em `src/themes.js`.
- Campo `family` (2 a 8 parentes) em qualquer paleta: vira `--c-f1..` e as séries 3 a 5 dos gráficos
  (`familySeriesCSS`); nos diagramas, grupos e ramos usam os parentes (`familyOf`/`visible` em
  `src/runtime/diagram.js`: parente claro demais escurece mantendo o matiz; faltando parentes, variações pequenas
  de matiz/luminosidade, nunca o arco-íris). A ênfase (`alert`) nunca vira grupo nem ramo.
- Testes: `engine.test.js` (variáveis e séries), `diagram.test.js` (tudo na família, ênfase na cor forte).

### Fila combinada (próximas etapas, nesta ordem)

1. ~~PowerPoint sem as notas do apresentador~~ FEITO: menu Arquivo e cartão da biblioteca ("Baixar PowerPoint sem as notas", `?notas=0`), CLI `--sem-notas`, `exportPptx({ notes: false })`. As notas continuam no deck.
2. **Identidade (fontes da empresa)**: arquivo local `~/.sagadeck/identidades.yaml` (fica na máquina do
   trabalho, nunca no repositório), com fontes por papel (título, corpo, compacta) em ordem de preferência e a
   paleta preferida. Opcional e por deck (`identidade: nome`; Studio: Design → Identidade). Corpo e rótulos sempre
   na fonte da empresa; títulos grandes só nos temas sóbrios (os de personalidade mantêm a fonte do tema).
   Fallback: fontes digitadas → fonte do tema → genérica; aviso no Studio se nenhuma estiver instalada. Sem
   embutir o arquivo da fonte (licença). Fontes mais largas (rabisco/sketch): o ajuste de texto já remede quando a
   fonte chega; o diagrama agora espera `document.fonts.ready`.
3. One-page, status semanal, governança navegável (abaixo).

Decisão pendente com Naruminho: manter MIT ou trocar para AGPL-3.0 (proteção contra uso fechado como serviço).
Versões já publicadas como MIT continuam MIT.

### 2. One-page: A FAZER

### 3. Status semanal: A FAZER

### 4 e 5. Governança navegável: A FAZER

---

## Como rodar os testes numa sessão na nuvem

`npm ci`, depois `SAGADECK_BROWSER=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test`
(sem essa variável, os testes de navegador são pulados em silêncio).
