# sagadeck — regras do repositório

## Testes são parte do DNA do código

**Nenhuma funcionalidade entra sem teste, e nenhum bug é corrigido sem um teste que o reproduza.**
Recurso sem teste some no próximo refactor, e ninguém percebe.

- `npm test` roda tudo. Precisa passar antes de qualquer commit.
- Onde colocar o teste:
  - `test/engine.test.js`: motor sem navegador (layouts, marcação, auto-correção, patch da IA, YAML). Rápido; prefira aqui sempre que der.
  - `test/runtime.test.js`: a apresentação num Chrome headless (cliques, animações, `window.sagadeck`).
  - `test/studio.test.js`: o Studio de ponta a ponta. Sobe o servidor com `test/fixtures/deck.yaml` numa pasta temporária e clica de verdade.
- Bug corrigido: primeiro escreva o teste que falha com o bug, depois corrija. Confira que ele falha sem a correção.
- Layout novo: entra em `src/layouts.js`, `src/studio/layout-samples.js` (nome, descrição e exemplo), no formulário `src/studio/public/slide-form.js` e em `docs/REFERENCIA.md`. `engine.test.js` já falha se faltar o exemplo ou a descrição.
- Recurso novo no Studio: um `t.test(...)` em `studio.test.js` que usa o recurso como a pessoa usaria (clique, digitação) e confere o resultado **no deck salvo**, não só na tela.
- Todo teste de UI termina exigindo zero erros de JavaScript na página.
- Testes que chamam o LLM de verdade só rodam com `SAGADECK_LIVE=1`. Sem isso, pule com `{ skip: ... }`.
- Os decks do usuário são dados de teste, não bugs. Corrija o app, não o conteúdo.

## Outras convenções

- Textos da interface e comentários em português.
- `npm run bundle` depois de mudar o motor ou o Studio: o pacote Python usa a cópia em `python/sagadeck/engine`.
