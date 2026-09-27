# sagadeck — regras do repositório

## Testes são parte do DNA do código

**Nenhuma funcionalidade entra sem teste, e nenhum bug é corrigido sem um teste que o reproduza.**
Recurso sem teste some no próximo refactor, e ninguém percebe.

- `npm test` roda tudo. Precisa passar antes de qualquer commit.
- Onde colocar o teste:
  - `test/engine.test.js`: motor sem navegador (layouts, marcação, auto-correção, patch da IA, YAML). Rápido; prefira aqui sempre que der.
  - `test/runtime.test.js`: a apresentação num Chrome headless (cliques, animações, `window.sagadeck`).
  - `test/studio.test.js`: o Studio de ponta a ponta. Sobe o servidor com `test/fixtures/deck.yaml` numa pasta temporária e clica de verdade.
  - `test/ai.test.js`: IA com o LLM falso (`test/mock-llm.js`), que dá respostas roteirizadas. Testa o encanamento: o que vai no prompt, imagens, patch, conversa, versões.
  - `test/studio-ai.test.js`: o assistente no Studio com o LLM falso (editar, conversar, "Pode fazer", versões).
  - `test/ai-live.test.js`: o modelo de verdade decide bem (conversa × ação × versões)? Só com `SAGADECK_LIVE=1` e o modelrelay no ar.
- Comportamento de IA se decide no prompt, pelo modelo, e não com regex ou fluxos fixos. O teste com mock garante o encanamento; o teste ao vivo garante a decisão.
- Bug corrigido: primeiro escreva o teste que falha com o bug, depois corrija. Confira que ele falha sem a correção.
- Layout novo: entra em `src/layouts.js`, `src/studio/layout-samples.js` (nome, descrição e exemplo), no formulário `src/studio/public/slide-form.js` e em `docs/REFERENCIA.md`. `engine.test.js` já falha se faltar o exemplo ou a descrição.
- Recurso novo no Studio: um `t.test(...)` em `studio.test.js` que usa o recurso como a pessoa usaria (clique, digitação) e confere o resultado **no deck salvo**, não só na tela.
- Todo teste de UI termina exigindo zero erros de JavaScript na página.
- Testes que chamam o LLM de verdade só rodam com `SAGADECK_LIVE=1`. Sem isso, pule com `{ skip: ... }`.
- Os decks do usuário são dados de teste, não bugs. Corrija o app, não o conteúdo.

## Onde ficam as apresentações (vale para todo agente: Claude, GPT…)

- **Todo documento de apresentação mora na biblioteca: `C:\Users\narum\sagadeck`** (`SAGADECK_HOME`, senão `~/sagadeck`). Uma pasta por tópico, uma pasta por apresentação (`<tópico>/<nome>/<nome>.yaml`, com `imagens/`, `widgets/`, CSS ao lado).
- Nunca crie, copie ou "salve uma versão" de deck fora dela: nada de `%TEMP%`, pasta atual, dentro do repositório ou `--library` apontando para outro lugar. Cópias espalhadas são o que fazia `.js` e imagens "sumirem".
- Para testar algo com um deck da pessoa, abra o da biblioteca (`sagadeck studio`, sem `--library`). Os testes automáticos usam uma biblioteca temporária própria (`test/helpers.js` define `SAGADECK_HOME`); isso é só da suíte.
- No código: apresentação nova passa por `newDeckPath` (`src/library.js`) ou pela biblioteca (`openLibrary(...).createDeck`). `test/storage.test.js` garante isso no `new`, `scaffold`, `ensaio-api` e nas ferramentas MCP.
- Terminou uma mudança: teste, commit, PR e merge na hora, sem perguntar.

## Escrita do deck (IA e código)

- **Deck existente só se grava com `writeDeckFile`** (`src/deck-file.js`): troca só os nós que mudaram (comentários e formatação do resto ficam), confere relendo e grava de forma atômica. Nada de `fs.writeFileSync(arquivo, YAML.stringify(...))` num deck que já existe (`test/deck-file.test.js` falha).
- A IA nunca edita o arquivo como texto: devolve um patch (`edit:` só com os campos que mudam, o preferido; `slides:` para trocar o slide inteiro; `insert`/`delete`). O código aplica (`applyPatch`), valida (renderiza) e passa pela trava contra lixo (`sanitizeCheck`); o que falha volta para a IA corrigir. Notas, tempo e ajustes do Studio não se perdem quando ela troca um slide inteiro.
- O que a pessoa mexe enquanto a IA pensa não se perde: junção a três (`src/studio/public/merge-decks.js`), no servidor e no Studio.
- A conversa do chat é por apresentação (`<deck>.conversa.json`), vai inteira para o servidor e o modelo recebe as mensagens antigas da pessoa compactadas (`conversationFor`).
- Caminhos de arquivo no deck são relativos à pasta dele (o deck é portátil); ao gravar, absoluto para dentro da pasta vira relativo.

## Outras convenções

- Textos da interface e comentários em português.
- **Nada de emoji ou símbolo unicode como ícone** (✕ ✓ ✨ 🪄 ▶ ↗ ◎ ● ▸ ←→ …): no Studio, `<i class="ic" data-ic="nome">` (Lucide; novos nomes em `scripts/vendor-ui-icons.mjs` e rode o script); na apresentação, SVG inline (`iconSVG` de `src/figures/icons.js`). Em aviso de texto, sem enfeite. Nome de tecla dentro de `<kbd>` pode. `engine.test.js` falha se aparecer. A regra vale para o que o **sagadeck desenha**; o conteúdo da pessoa (digitado ou colado de outra IA) passa como veio, nunca filtre emoji ou símbolo do texto dela.
- **A IA do sagadeck só conhece o que está em `docs/REFERENCIA.md`** (vai inteira no prompt). Recurso novo (layout, campo, composição, tema, paleta, campo do deck) entra lá no mesmo commit. `engine.test.js` falha se faltar layout, composição, tema ou paleta.
- `npm run bundle` depois de mudar o motor ou o Studio: o pacote Python usa a cópia em `python/sagadeck/engine`.
