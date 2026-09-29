# Componentes de terceiros

O pacote Python `sagadeck` distribui o motor JavaScript empacotado, que inclui:

| componente | licença | uso |
|---|---|---|
| [pptxgenjs](https://github.com/gitbrent/PptxGenJS) | MIT | escrita de arquivos .pptx |
| [jszip](https://github.com/Stuk/jszip) | MIT (dual MIT/GPLv3; usado sob MIT) | pós-processamento do .pptx |
| [yaml](https://github.com/eemeli/yaml) | ISC | leitura dos decks |
| [lucide-static](https://github.com/lucide-icons/lucide) | ISC | ícones |
| [Material Symbols](https://github.com/google/material-design-icons) (Google LLC) | Apache-2.0 | glifos de pessoa das poses de `picto: human` (só os caminhos usados, em `src/figures/material-pictos.js`) |
| [Mermaid](https://github.com/mermaid-js/mermaid) | MIT (`engine/runtime/vendor/MERMAID-LICENSE.txt`; o arquivo embute d3 (ISC), dagre (MIT), cytoscape (MIT) e DOMPurify (Apache-2.0/MPL-2.0), com os avisos dentro de `mermaid.min.js`) | desenho dos diagramas (layout `diagram`) |
| [KaTeX](https://github.com/KaTeX/KaTeX) | MIT (`engine/runtime/vendor/KATEX-LICENSE.txt`) | equações (layout `science`) |
| [Plotly.js](https://github.com/plotly/plotly.js) | MIT (`engine/runtime/vendor/PLOTLY-LICENSE.txt`) | gráficos interativos (layout `science`) |
| Fontes [Caveat](https://github.com/googlefonts/caveat), [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand), [Comic Neue](https://github.com/crozynski/comicneue), [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans), [Fredoka](https://github.com/hafontia-zz/Fredoka) e [Inter](https://github.com/rsms/inter), via [Fontsource](https://fontsource.org) | SIL Open Font License 1.1 | letras dos temas, embutidas nas apresentações (`engine/runtime/fonts/`, só o subconjunto latino; geradas por `scripts/vendor-fonts.mjs`) |
| [playwright-core](https://github.com/microsoft/playwright) | Apache-2.0 (LICENSE e NOTICE em `engine/node_modules/playwright-core/`) | controle do Chrome/Edge para exportar PNG/PDF/PPTX |

Os avisos de licença de cada componente embutido no arquivo único estão no fim de `engine/sagadeck.mjs`.
