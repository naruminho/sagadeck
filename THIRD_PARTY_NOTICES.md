# Componentes de terceiros

O pacote Python `sagadeck` distribui o motor JavaScript empacotado, que inclui:

| componente | licença | uso |
|---|---|---|
| [pptxgenjs](https://github.com/gitbrent/PptxGenJS) | MIT | escrita de arquivos .pptx |
| [jszip](https://github.com/Stuk/jszip) | MIT (dual MIT/GPLv3; usado sob MIT) | pós-processamento do .pptx |
| [yaml](https://github.com/eemeli/yaml) | ISC | leitura dos decks |
| [lucide-static](https://github.com/lucide-icons/lucide) | ISC | ícones |
| [playwright-core](https://github.com/microsoft/playwright) | Apache-2.0 (LICENSE e NOTICE em `engine/node_modules/playwright-core/`) | controle do Chrome/Edge para exportar PNG/PDF/PPTX |

Os avisos de licença de cada componente embutido no arquivo único estão no fim de `engine/sagadeck.mjs`.
