# Plano de melhorias — sagadeck

Avaliação do repositório em 11/10/2026 (branch `arena/349f2d88-sagadeck`, base `main` em 8ff7005).
**Nenhum código foi alterado** — este documento é o entregável: diagnóstico + sugestões de melhoria,
ordenadas por impacto, com esforço e risco estimados.

---

## 1. Radiografia do projeto

| área | tamanho |
|---|---|
| `src/` (JS, incl. vendor embutido) | ~48 mil linhas |
| `src/` sem vendor | ~40 mil linhas |
| testes (136 arquivos) | ~20 mil linhas, 808 testes |
| `bin/sagadeck.js` | 555 linhas (CLI inteira) |
| `docs/` | ~3,4 mil linhas (REFERENCIA 1.164 + ANDAMENTO 2.122) |

Maioria Node puro (ESM), sem build de frontend (o Studio serve JS cru — bom para depurar).
Dependências de runtime enxutas e usadas: `yaml`, `jszip`, `pptxgenjs`, `katex`, `pdfjs-dist`,
`qrcode-generator`, `playwright-core`, `plotly.js-dist-min`, `lucide-static` (as duas últimas via
arquivos copiados do `node_modules` pelos scripts `vendor-*`).

## 2. Pontos fortes — manter exatamente como está

1. **Cultura de teste exemplar.** `test/isolate.js` blinda biblioteca, credenciais e preferências de
   quem roda; mock de LLM (`mock-llm.js`) testa encanamento e teste ao vivo (`SAGADECK_LIVE=1`) testa
   decisão; regra "bug sem teste que reproduza não entra"; teste de UI exige zero erros de JS e confere
   o resultado **no deck salvo**. É acima da média de projetos comerciais.
2. **CI séria.** Linux + Windows (onde quebraria barra invertida e acento), Node 24, concorrência
   cancelando runs antigos, publish npm com trusted publishing + provenance, regra "só merge com CI verde".
3. **Segurança do Studio local bem pensada.** `server.js` restringe a loopback **e** fixa Origin/Host
   contra DNS rebinding (comentário no código mostra que a ameaça foi estudada). Chaves de IA e mapas
   moram em `~/.sagadeck/`, nunca no repositório nem na biblioteca.
4. **Convenções guardadas por teste.** `guards.test.js` e `engine.test.js` falham se aparecer emoji-ícone,
   menção proibida, fonte via CDN, layout sem exemplo/descrição ou recurso fora do `docs/REFERENCIA.md`.
   A REFERENCIA como fonte única do prompt da IA é um design particularmente elegante.
5. **Edição segura de decks.** `writeDeckFile` (patch de nós + gravação atômica + releitura), patch da IA
   com trava `sanitizeCheck` e junção a três (`merge-decks.js`) para o que a pessoa muda enquanto a IA pensa.
6. **Disciplina de rede.** "Uma tentativa e para" em serviços externos, consentimento antes de enviar
   dados da pessoa, cache de geocodificação. Regras claras e testadas.

## 3. Diagnóstico — o que pode melhorar

### A. Testes que precisam do navegador *falham* em vez de *pularem* (prioridade alta)

Rodei a suíte completa nesta máquina (sem Chrome/Edge): **532 passaram, 271 pularam, 5 falharam**.
As 5 falhas não são bugs de `main` — são testes que dependem de Chromium indiretamente:

- `test/ground.test.js` (2 falhas) e trechos de `ai.test.js`, `document-visuals.test.js`,
  `pedidos-0210.test.js` passam por `imagesAsDataUrls`/`cropRegions` (`src/import/crop.js`), que
  **lança um Chromium via playwright-core só para redimensionar/recortar PNG** (`canvas.toDataURL`).
- Os testes de UI já têm o guard correto (`t.skip("sem Chrome/Edge")` em `helpers.js`); esses não têm.
  No CI passa porque o runner tem Chrome — mas qualquer pessoa clonando sem navegador vê a suíte vermelha
  e não sabe por quê.

**Sugestões:**
1. Aplicar o mesmo guard `skip` nesses testes (consistência com o padrão já existente).
2. (Melhor ainda) Tirar o navegador do caminho de "foto reduzida para a visão": um redimensionador em
   JS puro (decoder/encoder PNG/JPEG) resolve o caso de uso; o Chromium ficaria só para o que realmente
   precisa dele (PDF, capturas, crop de regiões de slides do Office).

### B. Nenhuma ferramenta de qualidade estática (prioridade alta, esforço baixo)

Não há ESLint/Prettier/Biome, `.editorconfig`, `jsconfig/tsconfig` nem checagem de tipos. O estilo se
mantém por disciplina, e já há ruído: helper `esc` reimplementado **~10 vezes** (com semânticas
diferentes de entidades em cada uma — `markup.js`, `docx.js`, `api-ui.js`, `ai-settings.js`…),
aspas simples/duplas misturadas, `console.log` solto em 9 arquivos de `src/`.

**Sugestões:**
1. **Biome** (lint + format num binário só, rápido, zero configuração pesada) ou ESLint+Prettier.
   Entrar em modo tolerante (warnings) e apertar arquivo por arquivo — nunca um reformat de 48 mil linhas
   de uma vez (destruiria o `git blame` num projeto com diário de mudanças).
2. `// @ts-check` + JSDoc incremental nos módulos puros e de contrato estável: `fiscal/*`, `markup.js`,
   `aspect.js`, `uid.js`, `csv.js`, `deck-file.js`, `figures/points.js`. Contratos como `spec`/`slide`/
   `hotspots` hoje vivem só na cabeça de quem escreveu.
3. `.editorconfig` (final de linha, indentação) — ajuda quem contribui de outro editor.
4. Um logger único com nível (`SAGADECK_DEBUG`) no lugar dos `console.log` e, nos `catch {}` (são **76**
   hoje; muitos intencionais, mas o padrão vira hábito), logar em debug o que foi engolido — principal
   fonte de "bug que some".

### C. Arquivos gigantes e prompts embutidos (prioridade média)

| arquivo | linhas | sugestão |
|---|---|---|
| `src/studio/public/app.js` | 4.571 | É um IIFE monólito; o resto do Studio já são ES modules em `public/*.js` (gallery, chat, map-editor…). Dividir em `state.js`, `gallery.js`, `canvas.js`, `inspector.js`, `history.js`… — hoje qualquer mudança no editor toca esse arquivo inteiro. |
| `src/ai/deck-ai.js` | 1.390 | Prompts gigantes inline (linhas de centenas de caracteres). Extrair para `src/ai/prompts/*.md` — revisão do prompt vira diff legível, e dá para testar o prompt como golden file. |
| `src/ai/transform.js` | 907 | Mesmo caso (prompts + pipeline misturados). |
| `bin/sagadeck.js` | 555 | Parsing de flags + todos os comandos num arquivo; fatiar em `src/cli/` (um módulo por comando). |
| `test/studio.test.js` | 2.330 | Fatiar por área (biblioteca, editor, chat, dados) para rodar em paralelo e localizar falha mais rápido. |

`src/studio/server.js` (1.318) já está bem servido por módulos de rotas (`ia-routes`, `geo-routes`…)
— o padrão usado lá vale como referência para as divisões acima.

### D. Velocidade da suíte e da CI (prioridade média)

- `npm test` roda com `--test-concurrency=1` (serial): ~2 min mesmo pulando navegador; com Chrome
  deve ser bem mais. Os testes já se isolam em tmpdir e portas livres — dá para paralelizar com segurança.
- Sugestão: **jobs separados na CI** por família (`engine` / `runtime` / `studio` / `ai` + `guards`),
  cada um com seu arquivo — a matriz Ubuntu×Windows passa a rodar 4× mais rápido em wall-clock e a falha
  aponta o arquivo direto.
- Cobertura: `node --test --experimental-test-coverage` já existe nativo; começar reportando (badge) e
  só depois impor piso nos módulos puros.

### E. Matriz de Node enganosa (prioridade média, esforço baixo)

`package.json` declara `engines: node >=18`, mas a CI testa **só Node 24**. Ou testar 20/22/24 na
matriz (recomendado — custo barato com jobs paralelos), ou subir `engines` para `>=20` e dizer isso
na README. Hoje ninguém sabe se 18/20/22 realmente funcionam.

### F. Dependências e segurança contínua (prioridade média, esforço baixo)

`npm outdated` hoje: atualizações menores disponíveis (`playwright-core` 1.64, `pdfjs-dist` 6.4,
`plotly.js-dist-min` 4.1.2, `lucide-static` 1.55, `katex` 0.18.10) e **major** (`mermaid` 12).
Não há Dependabot/Renovate nem `npm audit` na CI.

**Sugestões:**
1. `npm audit --omit=dev` como step informativo na CI (não travar de início).
2. Dependabot (ou Renovate) agrupado: "patch/minor semanal, major sob demanda" — casa com a regra de
   só publicar release com CI verde.
3. Rever `mermaid` 12 com calma (vendor embutido por `scripts/vendor-*.mjs` — o fluxo de vendorização
   já existe e ajuda aqui).

### G. Documentação e convivência (prioridade baixa)

1. **`docs/ANDAMENTO.md` tem 2.122 linhas e não para de crescer.** Arquivar por mês
   (`ANDAMENTO-2026-10.md`) mantendo o índice no topo — o diário é um dos maiores ativos do projeto e
   está virando uma parede de texto.
2. **`AGENTS.md`/`CLAUDE.md` citam caminhos da máquina da mantenedora** (`C:\Users\narum\…`). Num
   repositório público, vale generalizar ("a pasta oficial do repositório", "a biblioteca") e deixar o
   caminho concreto num arquivo local não versionado — os agentes continuam funcionando e o repo fica
   acolhedor a contribuintes.
3. `package.json` sem `keywords`, `homepage`, `bugs` — descoberta no npm e links oficiais.
4. Sem `CHANGELOG.md` — as releases do GitHub são o histórico hoje; um CHANGELOG curto (mantido à mão
   ou por release) ajuda quem pula versões. A README já documenta muito bem o *como*; falta o *o que mudou*.

## 4. Plano em fases

### Fase 0 — suíte verde em qualquer máquina (1 sessão)
- Guard `skip` nos testes que dependem de navegador sem o guard (itens A.1).
- Investigar se as 5 falhas observadas aqui reproduzem em máquina com Chrome (no CI deve estar verde;
  se não estiver, é bug real — a regra do CLAUDE.md manda consertar antes de tudo).

### Fase 1 — qualidade estática barata (1–2 sessões)
- Biome (ou ESLint+Prettier) em modo tolerante + `.editorconfig`.
- `npm audit` na CI (informativo) + Dependabot agrupado.
- Matriz de Node corrigida (testar 20/22+24 ou subir `engines`).
- `CHANGELOG.md` + `keywords`/`homepage`/`bugs` no package.json.
- Logger único + revisão dos 76 `catch {}` (log em `SAGADECK_DEBUG` onde engole erro de fs/rede).

### Fase 2 — contratos e desmontagem dos monólitos (2–4 sessões)
- `@ts-check` + JSDoc nos módulos puros (`fiscal/*`, `markup`, `aspect`, `uid`, `csv`, `deck-file`).
- Extrair prompts de `deck-ai.js`/`transform.js` para `src/ai/prompts/` (sem mudar o texto — só o local),
  com teste que garante o prompt completo indo para o LLM.
- Dividir `app.js` (state → módulos), depois `slide-form.js`, `bin/sagadeck.js`, `test/studio.test.js`.
- Unificar `esc`/helpers de escape em `markup.js`, documentando as exceções de propósito.

### Fase 3 — velocidade (1 sessão, depois da Fase 1)
- CI em jobs paralelos por família de teste.
- Relatório de cobertura (badge) e piso nos módulos da Fase 2.
- Considerar `--test-concurrency` maior nos grupos já isolados.

### Fase 4 — produto e convivência (contínuo, sob demanda)
- Redimensionador de imagem sem navegador (corta o peso do playwright-core do caminho quente da IA).
- Arquivamento mensal do ANDAMENTO; generalização dos caminhos de máquina nos .md de regras.
- `mermaid` 12 quando couber; revisão de majors junto das releases.

## 5. O que NÃO mexer (decisões já tomadas e guardadas por teste)

- Nada de emoji/símbolo como ícone, nada citando a empresa da maçã (`guards.test.js`).
- Nada de CDN/`@import` remoto: fontes e libs embutidas (`fonts.test.js`); recurso online é bem-vindo
  **onde funciona**, com "uma tentativa e para".
- Deck existente só por `writeDeckFile`; a IA edita por patch + `sanitizeCheck`; comportamento da IA se
  decide no prompt, não com regex.
- A interface é o Studio; a REFERENCIA.md é a fonte única do que a IA conhece — recurso novo entra lá
  no mesmo commit.
- Biblioteca em `SAGADECK_HOME`/Documentos; nada de decks fora dela.

Qualquer item deste plano que tocar comportamento entra no ritmo do repositório: teste que falha antes,
branch por item, PR com CI verde (Ubuntu + Windows), `docs/ANDAMENTO.md` atualizado no mesmo commit.
