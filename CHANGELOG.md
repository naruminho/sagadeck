# Histórico de versões

O que muda em cada versão publicada no npm. O diário completo (decisões, bastidores, o que já entrou
em cada frente) vive em [`docs/ANDAMENTO.md`](docs/ANDAMENTO.md) — este arquivo é o resumo para quem
pula de versão em versão.

## [Não lançado]

### Correções
- **Duplicar apresentação não desiste com o arquivo preso por um instante** (antivírus/sincronização no
  Windows): a cópia agora tem a mesma tolerância do rename (`copyRetry`), que já cobria mover, renomear,
  lixeira e restaurar. Era o flake do CI em "mover (pasta inteira...), renomear e duplicar".

### Melhorias
- **Testes que precisam de navegador pulam sem Chrome/Edge**, em vez de falhar: os testes do foco guiado,
  do redesenho de figura (`image_ref`), do "ver o material" e dos rótulos do redesenho passam pela foto
  reduzida no navegador (`src/import/crop.js`) e fora do CI quebravam a suíte inteira. Novo guard
  `skipWithoutBrowser` em `test/helpers.js`, com o mesmo aviso dos testes de UI.
- **`engines` corrigido para Node 22.13+** (era `>=18`, mas `pdfjs-dist` 6 exige 22.13+/24 e
  `playwright-core` exige 20+; a promessa antiga não se cumpria). README e SKILL atualizados; a CI agora
  testa Node 22 e 24, no Linux e no Windows.
- **Auditoria de dependências na CI** (`npm audit --omit=dev`, informativa) e **Dependabot semanal**
  (patch/minor agrupados numa PR; major sob demanda).
- **Vulnerabilidade do `image-size` resolvida por `overrides`**: o pptxgenjs 4.0.1 declara `image-size`
  mas nunca o importa (dependência morta); a versão corrigida (2.0.4) entra por override e o audit fica
  em zero, sem tocar no código do gerador.
- `.editorconfig` (charset, final de linha, indentação) e `keywords`/`homepage`/`bugs` no `package.json`
  (descoberta no npm e links oficiais).

## [1.8.0] — 10/10/2026

### Novidades
- **Mapas ao vivo** (`layout: map`): pontos, linhas e áreas a partir de CSV/GeoJSON/GPX/KML, fundo vetorial
  embutido, IA que monta e analisa com dados, "Pôr no mapa" e "Achar coordenadas" na tela de dados,
  serviços configuráveis em `~/.sagadeck/mapa.json` (uma tentativa e para; consentimento antes de enviar
  dados). Exportação captura o mapa como está na tela.
- Editor de mapa no Studio, camada por clique vira animação no PPTX, e o carregamento é preguiçoso
  (só quem tem mapa no deck paga o custo).

## [1.5.0] e anteriores

Histórico anterior em [`docs/ANDAMENTO.md`](docs/ANDAMENTO.md) e nas
[releases do GitHub](https://github.com/naruminho/sagadeck/releases).
