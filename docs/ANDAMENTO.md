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
- `%%{init}%%` é removido (fugiria da paleta). Escala de cores sem tons do meio (contraste testado).
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

### 2. One-page: A FAZER (próxima etapa)

### 3. Status semanal: A FAZER

### 4 e 5. Governança navegável: A FAZER

---

## Como rodar os testes numa sessão na nuvem

`npm ci`, depois `SAGADECK_BROWSER=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm test`
(sem essa variável, os testes de navegador são pulados em silêncio).
