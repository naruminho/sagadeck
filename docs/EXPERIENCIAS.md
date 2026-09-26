# Experiências do SagaDeck

Na biblioteca, escolha uma experiência para abrir um roteiro pronto e editável. A criação é local: não depende de configurar IA nem de baixar imagens. O roteiro é um exemplo, e as notas orientam sua adaptação; informar um título não reescreve automaticamente o conteúdo.

| Experiência | Uso | Linguagem visual e recursos |
|---|---|---|
| Sala de decisão | Estratégia e diretoria | Grafite e ouro, gráficos limpos, recomendação → evidências → riscos → decisão |
| Matéria de capa | História e investigação | Serifas, papel claro, enquadramentos amplos, pistas e virada narrativa |
| Modo espetáculo | Palco e keynote | Contraste luminoso, escala monumental, pausas, escolhas da plateia e revelação por clique |
| Clube criativo | Workshop | Formas primárias, composição geométrica, desafios e timer |
| Laboratório vivo | Programação | Código por etapas, saída ilustrativa, screenshot com focos e previsão antes da resposta |
| Essencial | Produto e comunicação objetiva | Espaço vazio, uma ideia por vez, tipografia discreta e comparação |

Cada modelo tem de 8 a 9 slides e notas do apresentador. Os dados de exemplo são identificados como ilustrativos. As figuras ficam no próprio YAML, para a apresentação continuar funcionando offline.

## Código e screenshots

O Laboratório vivo demonstra `codewalk`, que destaca linhas e revela explicações e saídas preparadas, e `spotlight`, que guia o olhar por regiões de uma imagem. O código e as saídas são material de aula: não são executados pelo navegador da apresentação. As perguntas vêm antes da explicação, para criar espaço de previsão e discussão.

## Variedade entre decks gerados por IA

A geração automática alterna doze direções criativas em uma ordem embaralhada. Nesta sessão do servidor, todas são usadas antes de repetir; a passagem entre ciclos também evita duas direções idênticas seguidas. As direções variam a estrutura da história, a abertura, a tipografia, as imagens e o ritmo. O briefing, o público e o tema explicitamente escolhido continuam tendo precedência. Uma direção explícita é preservada.

Esse estado é pequeno, fica na memória e reinicia com o servidor. A decisão final de composição continua sendo do modelo; a revisão de ritmo identifica excesso de listas, repetição de layouts e ausência de pausas visuais.

## API e uso em JavaScript

`GET /api/experiences` retorna `{ experiences: [...] }`, com metadados para a galeria.

`POST /api/library/experience` aceita `{ experience: "aula", title: "Minha aula" }` e salva um novo deck na biblioteca. `topic` é um contexto opcional do briefing, sem geração de conteúdo.

```js
import { EXPERIENCES, createExperienceDeck } from "../src/experiences.js";

const deck = createExperienceDeck("aula", { title: "Minha aula de APIs" });
// deck é a especificação nativa; salvar em YAML mantém a edição por slide.
```

Cada chamada cria objetos independentes: editar uma apresentação não altera o catálogo nem outra apresentação.
