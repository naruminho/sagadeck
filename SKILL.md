---
name: sagadeck
description: Gera apresentações bonitas (HTML animado + PowerPoint editável + PDF + roteiro do apresentador) a partir de um arquivo YAML, com estúdio visual web estilo PowerPoint, chat lateral com IA e motor de auto-correção geométrica (detector de sobreposição e quebra de margens).
---

# sagadeck — como um agente de IA deve gerar e editar apresentações

O sagadeck gera apresentações profissionais a partir de um arquivo YAML, oferecendo tanto linha de comando (CLI), estúdio web visual no estilo PowerPoint, quanto protocolo MCP para integração com IDEs agênticos (Claude Code, Cursor, Windsurf, Cline, Roo Code).

## Comandos Disponíveis

| comando | o que faz |
|---|---|
| `sagadeck studio [deck.yaml] [--port=3000]` | **Abre o estúdio web estilo PowerPoint** com canvas visual 16:9, edição WYSIWYG direta, detector de sobreposição em tempo real e **chat lateral com IA**. |
| `sagadeck autofix <deck.yaml>` | **Auto-cura do layout**: detecta e repara automaticamente sobreposição entre elementos, elementos fora das margens seguras (120px) e excesso de texto. |
| `sagadeck mcp` | **Servidor MCP**: expõe ferramentas padronizadas (JSON-RPC) para IDEs agênticos criarem, lerem, fiscalizarem e editarem decks. |
| `sagadeck new deck.yaml [--theme=sinal]` | cria um deck de exemplo estruturado |
| `sagadeck build deck.yaml` | compila `deck.html` standalone (abre no navegador; tecla P = modo apresentador) |
| `sagadeck check deck.yaml` | fiscal: texto estourado, sobreposição, contraste, fonte pequena, excesso de texto |
| `sagadeck pptx deck.yaml` | gera `deck.pptx` **totalmente editável** no PowerPoint com formas e caixas nativas |
| `sagadeck pdf deck.yaml` | gera `deck.pdf` (um slide por página) |
| `sagadeck roteiro deck.yaml` | gera `deck - roteiro.pdf` (miniaturas + falas + relógio planejado) |
| `sagadeck all deck.yaml` | compila tudo: html + check + autofix + pptx + pdf + roteiro |
| `sagadeck themes` | vitrine com os 6 temas visuais |
| `sagadeck icons <filtro>` | busca ícones na biblioteca embutida (2.100+) |
| `sagadeck ref` / `sagadeck skill` | referência completa do formato YAML / esta skill |

---

## O Estúdio Visual SagaDeck (Página estilo PowerPoint)

Ao rodar `sagadeck studio [deck.yaml]`:
1. **Trilho de Miniaturas (Esquerda)**: lista todos os slides com número, badge de layout, miniatura ao vivo, botões de mover (↑/↓), duplicar e excluir.
2. **Palco Central (Canvas 16:9)**:
   - Renderização fiel do slide em resolução lógica de 1920×1080 com zoom/escala responsiva automática (auto-fit).
   - **Edição direta (WYSIWYG)**: clique em qualquer título, kicker, subtítulo, cartão ou número para editar o texto na hora.
   - **Suporte ao layout livre `canvas`**: posicionamento com coordenadas `(x, y, w, h)`.
   - **Guias de Margem**: linha tracejada indicando a margem segura de 120px (esquerda/direita) e 92px/104px (topo/base).
3. **Barra de Notas Inferior**: editor de roteiro do apresentador (`notes:`) com contador de palavras anti-sono em tempo real.
4. **Chat Lateral com IA (Direita)**:
   - Permite pedir à IA qualquer alteração no slide atual, em slides específicos ou em toda a apresentação.
   - **Poder total**: a IA consegue fazer tudo que você faz na mão (trocar layouts, editar textos, mudar temas, criar/remover slides, alterar tons, etc.).
   - **Auto-visão e Auto-cura**: a IA inspeciona as caixas delimitadoras (*bounding boxes*) dos elementos. Se houver sobreposição ou estouro de margem, ela corrige automaticamente antes de entregar a resposta!

---

## Capacidade de Auto-Inspeção e Auto-Correção ("Se enxergar e corrigir sozinho")

O motor do SagaDeck possui fiscalização geométrica embutida:

### 1. Detecção em Tempo Real
- **Sobreposição (*collision*)**: calcula a interseção entre retângulos de elementos visíveis. Se a área sobreposta exceder o limiar de tolerância (8px) e os elementos não forem intencionais, sinaliza alerta de sobreposição (`A ⟂ B`).
- **Margem Segura (*safe area*)**: se o conteúdo ultrapassar a base da safe area (976px no eixo vertical) ou as laterais (1800px), calcula o overflow exato em pixels.
- **Estouro de Tela (*out of bounds*)**: elementos com coordenadas negativas ou maiores que 1920×1080.
- **Estouro de Texto (*clipping*)**: textos onde `scrollWidth > clientWidth`.
- **Baixo Contraste**: verificação do ratio WCAG entre texto e fundo.

### 2. Algoritmo de Auto-Cura (`autofix`)
Quando acionado pela IA ou pelo comando `sagadeck autofix`:
- **Em caso de sobreposição no `canvas`**: empurra o elemento inferior para `B.y = A.y + A.h + 24px`, alinhando horizontalmente se atingir o limite vertical.
- **Em layouts padrão**: reduz automaticamente o `titleSize` e redistribui o espaçamento vertical.
- **Em caso de quebra da margem inferior**:
  - Reduz `titleSize` (ex.: de 140 para 96 ou 72).
  - Em layout `cards`: reorganiza para 3 ou 4 colunas horizontais em vez de empilhar verticalmente.
  - Em textos longos: compacta o texto visível e transfere explicações detalhadas para as notas do apresentador (`notes:`).
- **Em caso de baixo contraste**: ajusta o `tone` do slide para manter a legibilidade.

---

## Integração com IDEs Agênticos (Cursor, Windsurf, Claude Code, Cline)

Um IDE agêntico pode interagir com o SagaDeck de 3 formas:

### 1. Via Protocolo MCP (`sagadeck mcp`)
Configure o servidor MCP no seu cliente (ex.: `.cursor/mcp.json` ou `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "sagadeck": {
      "command": "node",
      "args": ["/caminho/para/sagadeck/bin/sagadeck.js", "mcp"]
    }
  }
}
```
Ferramentas disponíveis no MCP:
- `sagadeck_create_deck`: cria um novo deck YAML.
- `sagadeck_read_deck`: lê e decompõe um deck existente.
- `sagadeck_inspect_deck`: executa o fiscal e retorna relatório de sobreposições e margens.
- `sagadeck_autofix_deck`: executa a auto-cura geométrica no arquivo YAML.
- `sagadeck_build_html`: compila o arquivo `.html` interativo.
- `sagadeck_launch_studio`: abre o SagaDeck Studio na web.

### 2. Via Linha de Comando (CLI)
O agente no terminal deve seguir o fluxo:
1. Escrever o `deck.yaml` usando layouts apropriados.
2. Rodar `sagadeck autofix deck.yaml` para assegurar geometria perfeita.
3. Rodar `sagadeck check deck.yaml` para confirmar ausência de avisos.
4. Rodar `sagadeck all deck.yaml` para gerar todas as entregas.

### 3. Via API Python
```python
import sagadeck
sagadeck.autofix("palestra.yaml")
sagadeck.build("palestra.yaml")
sagadeck.studio("palestra.yaml", port=3000)
```

---

## Decisão de Arquitetura: Mesmo Repositório vs. Repositório Separado

### Por que o Estúdio deve ficar no **mesmo repositório** (`sagadeck`):
1. **Fonte Única da Verdade**: Os 21 layouts, os 6 temas, as regras de tipografia e as rotinas de verificação geométrica residem no mesmo código (`src/layouts.js`, `src/themes.js`, `src/fiscal/autofix.js`). Qualquer alteração ou novo layout adicionado ao compilador fica disponível **instantaneamente** no estúdio visual.
2. **Zero Descompasso de Versões**: Em repositórios separados, quando o formato YAML ou os temas do SagaDeck evoluem, a interface visual quebra ou fica desatualizada até que alguém publique e atualize dependências externas.
3. **Experiência de Uso (DX) Imediata**: O desenvolvedor ou agente clona o repositório ou roda `pip install sagadeck` / `npm install` e tem **tudo num só lugar**: linha de comando (`sagadeck build`), estúdio visual (`sagadeck studio`), servidor de agentes (`sagadeck mcp`) e fiscal (`sagadeck check`).
4. **Leve e Modular**: A interface web foi construída com tecnologias nativas leves (Vanilla JS, CSS moderno e servidor HTTP embutido do Node.js sem frameworks pesados). Isso mantém o pacote pequeno (~1.1 MB empacotado) sem impactar o desempenho do compilador.
