/* ==========================================================================
   SagaDeck Studio — editor visual do slide (painel "Formatar").
   Um formulário por layout (campos em src/layouts.js e src/elements.js), com listas editáveis,
   editor de elementos (figuras, blocos livres) e, para qualquer campo que o formulário não
   conheça, um editor genérico em "Outros campos" — assim tudo o que existe no YAML é editável.

   API: SlideForm.render(container, slide, ctx)
     ctx.commit(structural)   o slide mudou; structural = mudou a estrutura (reconstruir o formulário)
     ctx.pickIcon(cb)         abre a biblioteca de ícones e chama cb(nome)
     ctx.layoutLabel(nome)    nome do layout em português
   ========================================================================== */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------------------------
  // Vocabulário
  // ---------------------------------------------------------------------------------------------
  const TEXT_ROLES = [
    ["hero", "Enorme"], ["title", "Título grande"], ["h2", "Título"], ["h3", "Subtítulo"], ["lead", "Destaque"],
    ["body", "Corpo"], ["small", "Pequeno"], ["label", "Rótulo"], ["quote", "Citação"], ["number", "Número"],
    ["mono", "Monoespaçado"], ["tiny", "Mínimo"],
  ];
  const COLOR_ROLES = ["fg", "hi", "em", "muted", "line", "bg"];
  const POSES = [["stand", "Em pé"], ["walk", "Andando"], ["run", "Correndo"], ["sit", "Sentado"], ["drive", "Dirigindo"],
    ["phone", "No telefone"], ["watch", "Olhando"], ["point", "Apontando"], ["raise", "Mão levantada"], ["shrug", "Braços abertos"],
    ["think", "Pensando"], ["stamp", "Carimbando"], ["cheer", "Comemorando"], ["sleep", "Dormindo"]];
  const CAR_SEAT = [["human", "Pessoa"], ["human-watch", "Pessoa observando"], ["human-phone", "Pessoa no celular"], ["machine", "Máquina"], ["none", "Vazio"]];
  const ANIMS = [["", "Padrão (subir)"], ["fade", "Aparecer"], ["pop", "Saltar"], ["left", "Da esquerda"], ["right", "Da direita"], ["down", "De cima"], ["zoom", "Zoom"], ["none", "Sem animação"]];

  // ---------------------------------------------------------------------------------------------
  // Construtores de esquema
  // ---------------------------------------------------------------------------------------------
  const f = {
    text: (k, label, o = {}) => ({ k, label, type: "text", ...o }),
    area: (k, label, o = {}) => ({ k, label, type: "textarea", ...o }),
    num: (k, label, o = {}) => ({ k, label, type: "number", ...o }),
    bool: (k, label, o = {}) => ({ k, label, type: "bool", ...o }),
    select: (k, label, options, o = {}) => ({ k, label, type: "select", options, ...o }),
    color: (k, label, o = {}) => ({ k, label, type: "color", ...o }),
    icon: (k, label, o = {}) => ({ k, label, type: "icon", ...o }),
    nums: (k, label, o = {}) => ({ k, label, type: "nums", ...o }),         // "2, 3" <-> [2, 3]
    pair: (k, label, labels, o = {}) => ({ k, label, type: "pair", labels, ...o }), // [a, b]
    list: (k, label, item, o = {}) => ({ k, label, type: "list", item, ...o }),
    obj: (k, label, fields, o = {}) => ({ k, label, type: "object", fields, ...o }),
    el: (k, label, o = {}) => ({ k, label, type: "element", ...o }),
    els: (k, label, o = {}) => ({ k, label, type: "elements", ...o }),
    chart: (k, label, o = {}) => ({ k, label, type: "chart", ...o }),
    more: (fields) => ({ type: "more", fields }),
  };
  // item de lista: texto simples | campos de objeto | texto-ou-objeto (string vira {text}) | elemento
  const T = "text";
  const TA = "textarea";
  const obj = (fields, o = {}) => ({ fields, ...o });
  const textOrObj = (fields, o = {}) => ({ fields, textOrObj: true, ...o });

  const CARD = [f.icon("icon", "Ícone"), f.text("title", "Título"), f.area("text", "Texto"),
    f.more([f.text("number", "Número"), f.text("foot", "Rodapé"), f.text("badge", "Selo"), f.bool("hl", "Destacar"), f.num("step", "Aparece no clique")])];
  const STAT = [f.text("value", "Valor"), f.text("label", "Rótulo"), f.text("trend", "Tendência"), f.icon("icon", "Ícone"),
    f.more([f.bool("trendUp", "Tendência positiva"), f.color("color", "Cor")])];
  const STEP = [f.text("title", "Título"), f.area("text", "Texto"), f.icon("icon", "Ícone"), f.more([f.text("tag", "Etiqueta")])];
  const TIMELINE_EV = [f.text("when", "Quando"), f.text("title", "Título"), f.area("text", "Texto"), f.text("tag", "Etiqueta")];
  const COMPARE_SIDE = [f.text("label", "Rótulo"), f.text("value", "Valor grande"), f.text("title", "Título"), f.area("text", "Texto"),
    f.list("items", "Itens", T), f.el("figure", "Figura"), f.bool("hl", "Destacar")];
  const MATRIX_CELL = [f.text("title", "Título"), f.area("text", "Texto"), f.text("example", "Exemplo"), f.icon("icon", "Ícone"), f.bool("hl", "Destacar")];
  const COMMON_MORE = [f.select("markStyle", "Estilo do ==destaque== neste slide", [["marca-texto", "Marca-texto"], ["sublinhado", "Sublinhado"], ["cor", "Só cor"], ["negrito", "Negrito colorido"], ["nenhum", "Sem destaque"]], { empty: "O do deck" }),
    f.num("titleSize", "Tamanho do título (px)"), f.bool("fit", "Encolher o título para caber"), f.text("source", "Fonte (rodapé)"), f.text("transition", "Transição", { datalist: ["fade", "slide", "zoom", "none"] }),
    f.els("add", "Elementos extras no fim"), f.el("background", "Figura de fundo")];

  // Campos de cada layout (o que src/layouts.js lê). "more" = recolhido em "Mais opções".
  const LAYOUTS = {
    cover: [f.text("kicker", "Chapéu"), f.area("title", "Título"), f.text("subtitle", "Subtítulo"), f.text("author", "Autor"), f.text("role", "Cargo do autor"),
      f.el("figure", "Figura"), f.more([f.num("titleSize", "Tamanho do título (px)")])],
    section: [f.text("number", "Número"), f.text("kicker", "Chapéu"), f.area("title", "Título"), f.text("subtitle", "Subtítulo"), f.el("figure", "Figura"),
      f.more([f.num("titleSize", "Tamanho do título (px)")])],
    statement: [f.text("kicker", "Chapéu"), f.area("text", "Frase", { hint: "Ou use Linhas para revelar uma frase por clique." }),
      f.list("lines", "Linhas (uma por clique)", textOrObj([f.area("text", "Texto"), f.select("as", "Estilo", TEXT_ROLES, { empty: "Título grande" }), f.color("color", "Cor"), f.num("step", "Clique")]), { addLabel: "Adicionar linha" }),
      f.text("by", "Assinatura"),
      f.more([f.bool("center", "Centralizar"), f.select("as", "Estilo da frase", TEXT_ROLES, { empty: "Título grande" }), f.num("size", "Tamanho (px)"), f.num("byStep", "Assinatura no clique")])],
    quote: [f.text("kicker", "Chapéu"), f.area("quote", "Citação"), f.text("by", "Autor"), f.text("role", "Cargo"), f.text("after", "Comentário (depois de um clique)"),
      f.more([f.num("afterStep", "Comentário no clique"), f.num("size", "Tamanho (px)")])],
    number: [f.text("kicker", "Chapéu"), f.num("value", "Valor"), f.text("prefix", "Antes do número"), f.text("suffix", "Depois do número"), f.text("label", "Rótulo"),
      f.area("context", "Contexto"), f.el("side", "Ao lado"),
      f.more([f.num("decimals", "Casas decimais"), f.num("from", "Contar a partir de"), f.color("valueColor", "Cor do número"), f.num("size", "Tamanho (px)"),
        f.num("labelSize", "Tamanho do rótulo (px)"), f.num("contextStep", "Contexto no clique"), f.num("sideStep", "Lado no clique")])],
    split: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.area("body", "Texto"), f.list("bullets", "Tópicos", T, { addLabel: "Adicionar tópico" }),
      f.el("figure", "Figura"), f.els("content", "Blocos abaixo do texto"),
      f.more([f.text("ratio", "Proporção texto:figura", { placeholder: "1:1" }), f.bool("reverse", "Figura à esquerda"), f.bool("build", "Tópicos um por clique"),
        f.select("bodyAs", "Estilo do texto", TEXT_ROLES, { empty: "Destaque" }), f.num("bulletSize", "Tamanho dos tópicos (px)"),
        f.select("titleAs", "Estilo do título", TEXT_ROLES, { empty: "Título" }), f.num("figureStep", "Figura no clique")])],
    cards: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("items", "Cartões", obj(CARD), { addLabel: "Adicionar cartão", newItem: () => ({ icon: "star", title: "Novo cartão", text: "" }) }),
      f.more([f.num("cols", "Colunas"), f.bool("build", "Um por clique")])],
    stats: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list(["stats", "kpis", "items"], "Indicadores", obj(STAT), { addLabel: "Adicionar indicador", newItem: () => ({ value: "100%", label: "Indicador" }) }),
      f.more([f.num("cols", "Colunas"), f.bool("build", "Um por clique")])],
    steps: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list(["steps", "process", "flow", "items"], "Etapas", obj(STEP), { addLabel: "Adicionar etapa", newItem: () => ({ title: "Nova etapa", text: "" }) }),
      f.more([f.num("cols", "Colunas"), f.bool("build", "Uma por clique")])],
    list: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("items", "Itens", textOrObj([f.area("text", "Texto"), f.text("sub", "Detalhe")]), { addLabel: "Adicionar item" }),
      f.more([f.bool("numbered", "Numerada", { default: true }), f.bool("build", "Um por clique"), f.num("size", "Tamanho (px)")])],
    timeline: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("events", "Eventos", obj(TIMELINE_EV), { addLabel: "Adicionar evento", newItem: () => ({ when: "2025", title: "Evento" }) }),
      f.text("after", "Frase final (depois de um clique)"),
      f.more([f.nums("highlight", "Destacar eventos (posições, a partir de 0)"), f.bool("build", "Um por clique"), f.num("afterStep", "Frase final no clique")])],
    chart: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.chart("chart", "Gráfico"), f.el("side", "Ao lado", { stringAs: "text" }),
      f.more([f.num("chartHeight", "Altura do gráfico (px)"), f.num("chartStep", "Gráfico no clique"), f.num("sideStep", "Lado no clique")])],
    compare: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.obj("left", "Lado A", COMPARE_SIDE), f.text("vs", "Entre os lados", { placeholder: "×" }),
      f.obj("right", "Lado B", COMPARE_SIDE), f.text("after", "Frase final (depois de um clique)"),
      f.more([f.bool("build", "Um lado por clique"), f.num("afterStep", "Frase final no clique")])],
    matrix: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.pair("x", "Eixo horizontal", ["Esquerda", "Direita"]), f.pair("y", "Eixo vertical", ["Em cima", "Embaixo"]),
      f.list("cells", "Quadrantes", obj(MATRIX_CELL), { addLabel: "Adicionar quadrante", max: 4, newItem: () => ({ title: "Quadrante" }) }),
      f.more([f.bool("build", "Um por clique")])],
    question: [f.text("kicker", "Chapéu"), f.area("question", "Pergunta"), f.text("context", "Contexto"),
      f.list("options", "Opções", textOrObj([f.text("text", "Texto"), f.text("sub", "Detalhe"), f.text("key", "Letra")]), { addLabel: "Adicionar opção" }),
      f.num("timer", "Timer (segundos)"), f.text("hint", "Dica"),
      f.more([f.num("cols", "Colunas"), f.text("keys", "Letras das opções", { placeholder: "ABCD" }), f.text("timerLabel", "Rótulo do timer"), f.num("optionSize", "Tamanho das opções (px)"),
        f.num("titleSize", "Tamanho da pergunta (px)"), f.bool("build", "Uma opção por clique")])],
    poll: [f.text("kicker", "Chapéu"), f.area("question", "Pergunta"), f.text("context", "Contexto"), f.list("options", "Opções", T, { addLabel: "Adicionar opção" }), f.text("hint", "Dica"),
      f.more([f.text("id", "Identificador da enquete"), f.text("compare", "Comparar com a enquete (identificador)"), f.num("titleSize", "Tamanho da pergunta (px)")])],
    image: [f.text("image", "Imagem (arquivo ou link)"), f.select("fit", "Enquadramento", [["cover", "Preencher"], ["contain", "Caber inteira"]], { empty: "Preencher" }),
      f.text("kicker", "Chapéu"), f.text("title", "Título"), f.text("caption", "Legenda"), f.more([f.el("figure", "Figura no lugar da imagem")])],
    code: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.area("code", "Código", { mono: true, rows: 8 }), f.nums("highlight", "Linhas destacadas"), f.el("note", "Nota ao lado", { stringAs: "text" }),
      f.more([f.num("size", "Tamanho (px)"), f.num("noteStep", "Nota no clique")])],
    blocks: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.els("content", "Blocos"), f.more([f.select("titleAs", "Estilo do título", TEXT_ROLES, { empty: "Título" })])],
    end: [f.text("kicker", "Chapéu"), f.area("title", "Título", { placeholder: "Obrigado." }), f.text("subtitle", "Subtítulo"), f.list("contacts", "Contatos", T, { addLabel: "Adicionar contato" }),
      f.el("figure", "Figura"), f.more([f.num("titleSize", "Tamanho do título (px)")])],
    references: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("items", "Referências", TA, { addLabel: "Adicionar referência" })],
    video: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.text("url", "Link do vídeo"), f.text("label", "Texto do botão", { placeholder: "Assistir" }), f.text("caption", "Legenda"), f.el("figure", "Figura")],
    canvas: [f.els("elements", "Elementos", { positioned: true })],
  };
  const SLIDE_RESERVED = new Set(["layout", "tone", "deco", "notes", "time", "auto"]);

  // ---------------------------------------------------------------------------------------------
  // Elementos (src/elements.js): tipos, como reconhecer e campos
  // ---------------------------------------------------------------------------------------------
  const EL_MORE = (positioned) => [
    f.num("step", "Aparece no clique"), f.num("exit", "Some no clique"), f.select("anim", "Animação", ANIMS),
    ...(positioned ? [f.num("x", "X (px)"), f.num("y", "Y (px)")] : []),
    f.num("w", "Largura (px)"), f.num("h", "Altura (px)"), f.color("color", "Cor"), f.color("bg", "Fundo"),
    f.select("align", "Alinhamento", [["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"]]),
    f.select("card", "Moldura", [["true", "Cartão"], ["hi", "Cartão destacado"]], { parse: (v) => (v === "true" ? true : v) }),
    f.num("flex", "Peso (flex)"), f.num("pad", "Espaço interno (px)"),
  ];
  const ELEMENT_KINDS = [
    { id: "icon", label: "Ícone", is: (e) => e.icon, tpl: () => ({ icon: "star", size: 200 }),
      fields: [f.icon("icon", "Ícone"), f.num("size", "Tamanho (px)"), f.num("stroke", "Espessura do traço")] },
    { id: "picto", label: "Pessoa / cena", is: (e) => e.picto, tpl: () => ({ picto: "human", pose: "stand" }),
      fields: [f.select("picto", "Tipo", [["human", "Pessoa"], ["crowd", "Multidão"], ["scene", "Cena"], ["machine", "Máquina"]]),
        f.select("pose", "Pose", POSES, { when: (e) => e.picto === "human" || e.picto === "crowd" }),
        f.select("sign", "Placa atrás", [["circle", "Círculo"], ["square", "Quadrado"], ["triangle", "Triângulo"]], { when: (e) => e.picto === "human" }),
        f.select("name", "Cena", [["console", "Mesa de controle"], ["desk", "Mesa de trabalho"], ["pair", "Dupla na mesa"], ["judge", "Juiz"], ["elevator", "Elevador"], ["car-top", "Carro visto de cima"]], { when: (e) => e.picto === "scene" }),
        f.text("screen", "Texto na tela", { when: (e) => e.name === "console" }), f.num("screenSize", "Tamanho do texto da tela", { when: (e) => e.name === "console" }),
        f.bool("alarm", "Alarme", { when: (e) => e.name === "console" }),
        f.select("driver", "Motorista", CAR_SEAT, { when: (e) => e.name === "car-top" }), f.select("passenger", "Passageiro", CAR_SEAT, { when: (e) => e.name === "car-top" }),
        f.select("back", "Banco de trás", [["sleep", "Pessoa dormindo"], ["human", "Pessoa"], ["none", "Vazio"]], { when: (e) => e.name === "car-top" }),
        f.bool("button", "Botão de parada", { when: (e) => e.name === "car-top" || e.name === "elevator" }),
        f.num("count", "Quantidade", { when: (e) => e.picto === "crowd" }), f.num("highlight", "Destacados", { when: (e) => e.picto === "crowd" })] },
    { id: "image", label: "Imagem", is: (e) => e.image || e.image_prompt, tpl: () => ({ image: "", fit: "cover" }),
      fields: [f.text("image", "Arquivo ou link"), f.area("image_prompt", "Descrição para a IA gerar", { hint: "Gerada com “sagadeck imagens” ou pelo assistente com imagens ligadas." }),
        f.select("fit", "Enquadramento", [["cover", "Preencher"], ["contain", "Caber inteira"]]), f.text("alt", "Texto alternativo"), f.num("radius", "Cantos (px)")] },
    { id: "chart", label: "Gráfico", is: (e) => e.chart, tpl: () => ({ chart: "bar", data: [{ label: "A", value: 10 }, { label: "B", value: 20 }] }), chart: true },
    { id: "diagram", label: "Diagrama", is: (e) => e.diagram, tpl: () => ({ diagram: "flow", steps: ["Início", "Meio", "Fim"] }),
      fields: [f.select("diagram", "Tipo", [["flow", "Fluxo"], ["loop", "Ciclo"], ["spectrum", "Espectro"], ["venn", "Venn"]]),
        f.list("steps", "Etapas", T, { when: (e) => e.diagram === "flow" }), f.num("highlight", "Etapa destacada", { when: (e) => e.diagram === "flow" }),
        f.list("nodes", "Pontos do ciclo", T, { when: (e) => e.diagram === "loop" }), f.select("actor", "Pessoa no ciclo", [["in", "Dentro"], ["on", "No ciclo"], ["out", "Fora"]], { when: (e) => e.diagram === "loop" }),
        f.list("stops", "Pontos do espectro", T, { when: (e) => e.diagram === "spectrum" }), f.text("left", "Extremo esquerdo", { when: (e) => e.diagram === "spectrum" }), f.text("right", "Extremo direito", { when: (e) => e.diagram === "spectrum" }),
        f.num("at", "Posição marcada", { when: (e) => e.diagram === "loop" || e.diagram === "spectrum" }),
        f.text("a", "Conjunto A", { when: (e) => e.diagram === "venn" }), f.text("b", "Conjunto B", { when: (e) => e.diagram === "venn" }), f.text("both", "Interseção", { when: (e) => e.diagram === "venn" })] },
    { id: "svg", label: "SVG", is: (e) => e.svg, tpl: () => ({ svg: "<svg viewBox='0 0 100 100'></svg>" }), fields: [f.area("svg", "SVG", { mono: true, rows: 6 })] },
    { id: "text", label: "Texto", is: (e) => e.text != null || textRole(e), tpl: () => ({ body: "Texto" }), text: true },
    { id: "row", label: "Linha (lado a lado)", is: (e) => e.row, tpl: () => ({ row: [{ body: "Esquerda" }, { body: "Direita" }] }),
      fields: [f.els("row", "Itens da linha"), f.num("gap", "Espaço entre itens (px)"),
        f.select("valign", "Alinhamento vertical", [["stretch", "Esticar"], ["flex-start", "Topo"], ["center", "Centro"], ["flex-end", "Base"]]),
        f.select("justify", "Distribuição", [["flex-start", "Início"], ["center", "Centro"], ["space-between", "Espalhar"], ["flex-end", "Fim"]])] },
    { id: "col", label: "Coluna (empilhado)", is: (e) => e.col, tpl: () => ({ col: [{ body: "Primeiro" }, { body: "Segundo" }] }),
      fields: [f.els("col", "Itens da coluna"), f.num("gap", "Espaço entre itens (px)"),
        f.select("justify", "Distribuição", [["flex-start", "Início"], ["center", "Centro"], ["space-between", "Espalhar"], ["flex-end", "Fim"]]),
        f.select("items", "Alinhamento horizontal", [["stretch", "Esticar"], ["flex-start", "Esquerda"], ["center", "Centro"], ["flex-end", "Direita"]])] },
    { id: "counter", label: "Contador animado", is: (e) => e.counter != null, tpl: () => ({ counter: 100, from: 0 }),
      fields: [f.num("counter", "Valor"), f.num("from", "Contar a partir de"), f.text("prefix", "Antes"), f.text("suffix", "Depois"), f.num("decimals", "Casas decimais"), f.num("size", "Tamanho (px)"), f.text("label", "Rótulo")] },
    { id: "timer", label: "Timer", is: (e) => e.timer != null, tpl: () => ({ timer: 30 }),
      fields: [f.num("timer", "Segundos"), f.text("label", "Rótulo"), f.bool("auto", "Começa sozinho", { default: true }), f.num("size", "Tamanho (px)")] },
    { id: "poll", label: "Enquete", is: (e) => e.poll, tpl: () => ({ poll: "enquete-1", options: ["Sim", "Não"] }),
      fields: [f.text("poll", "Identificador"), f.list("options", "Opções", T), f.text("compare", "Comparar com (identificador)"), f.text("hint", "Dica")] },
    { id: "list", label: "Lista", is: (e) => e.list, tpl: () => ({ list: ["Primeiro", "Segundo"] }),
      fields: [f.list("list", "Itens", textOrObj([f.area("text", "Texto"), f.text("sub", "Detalhe")])), f.bool("numbered", "Numerada"), f.bool("build", "Um por clique"), f.num("size", "Tamanho (px)")] },
    { id: "cards", label: "Cartões", is: (e) => e.cards, tpl: () => ({ cards: [{ icon: "star", title: "Cartão" }] }),
      fields: [f.list("cards", "Cartões", obj(CARD), { newItem: () => ({ icon: "star", title: "Cartão" }) }), f.num("cols", "Colunas"), f.bool("build", "Um por clique")] },
    { id: "stats", label: "Indicadores", is: (e) => e.stats || e.kpis, tpl: () => ({ stats: [{ value: "100%", label: "Indicador" }] }),
      fields: [f.list(["stats", "kpis"], "Indicadores", obj(STAT), { newItem: () => ({ value: "100%", label: "Indicador" }) }), f.num("cols", "Colunas"), f.bool("build", "Um por clique")] },
    { id: "steps", label: "Etapas", is: (e) => e.steps || e.process || e.flow, tpl: () => ({ steps: [{ title: "Etapa 1" }, { title: "Etapa 2" }] }),
      fields: [f.list(["steps", "process", "flow"], "Etapas", obj(STEP), { newItem: () => ({ title: "Etapa" }) }), f.num("cols", "Colunas"), f.bool("build", "Uma por clique")] },
    { id: "progress", label: "Barra de progresso", is: (e) => e.progress != null, tpl: () => ({ progress: 60, label: "Progresso" }),
      fields: [f.num("progress", "Valor (%)"), f.text("label", "Rótulo")] },
    { id: "tags", label: "Etiquetas", is: (e) => e.tags || e.chips, tpl: () => ({ tags: ["Etiqueta"] }), fields: [f.list(["tags", "chips"], "Etiquetas", T)] },
    { id: "rating", label: "Avaliação", is: (e) => e.rating != null, tpl: () => ({ rating: 4 }), fields: [f.num("rating", "Nota"), f.text("label", "Rótulo")] },
    { id: "code", label: "Código", is: (e) => e.code, tpl: () => ({ code: "print('olá')" }), fields: [f.area("code", "Código", { mono: true, rows: 6 }), f.nums("highlight", "Linhas destacadas"), f.num("size", "Tamanho (px)")] },
    { id: "shape", label: "Forma", is: (e) => e.shape, tpl: () => ({ shape: "rounded", w: 300, h: 160, fill: "hi" }),
      fields: [f.select("shape", "Forma", [["rect", "Retângulo"], ["rounded", "Arredondado"], ["circle", "Círculo"], ["pill", "Pílula"], ["line", "Linha"]]), f.color("fill", "Preenchimento"), f.color("stroke", "Contorno")] },
    { id: "badge", label: "Selo", is: (e) => e.badge, tpl: () => ({ badge: "NOVO" }), fields: [f.text("badge", "Texto")] },
    { id: "video", label: "Vídeo", is: (e) => e.video, tpl: () => ({ video: "https://", label: "Assistir" }), fields: [f.text("video", "Link"), f.text("label", "Texto do botão")] },
    { id: "widget", label: "Widget", is: (e) => e.widget, tpl: () => ({ widget: "" }), fields: [f.text("widget", "Nome do widget")] },
    { id: "html", label: "HTML", is: (e) => e.html, tpl: () => ({ html: "<div></div>" }), fields: [f.area("html", "HTML", { mono: true, rows: 6 })] },
    { id: "spacer", label: "Espaço", is: (e) => e.spacer != null, tpl: () => ({ spacer: 40 }), fields: [f.num("spacer", "Tamanho (px) — vazio = empurrar")] },
  ];
  const TEXT_KEYS = TEXT_ROLES.map(([r]) => r);
  function textRole(e) {
    return TEXT_KEYS.find((r) => e[r] != null && typeof e[r] !== "object") || null;
  }
  function kindOf(e) {
    if (e == null) return null;
    if (typeof e !== "object") return ELEMENT_KINDS.find((k) => k.id === "text");
    // mesma ordem de el() em src/elements.js: figuras, texto, estruturas, widgets, atalhos de texto
    const order = ["icon", "picto", "diagram", "chart", "svg", "image", "text", "row", "col", "counter", "timer", "poll", "list", "cards", "stats", "steps",
      "progress", "tags", "rating", "code", "shape", "badge", "video", "widget", "html", "spacer"];
    for (const id of order) {
      const k = ELEMENT_KINDS.find((x) => x.id === id);
      if (id === "text" ? e.text != null : k.is(e)) return k;
    }
    return textRole(e) ? ELEMENT_KINDS.find((k) => k.id === "text") : null;
  }
  // chaves que cada tipo usa (o resto do elemento aparece em "Outros campos")
  const EL_COMMON_KEYS = ["step", "exit", "anim", "x", "y", "w", "h", "color", "bg", "align", "card", "flex", "pad", "class", "style", "id", "opacity", "rotate"];

  // Gráficos (src/figures/charts.js)
  const CHART_TYPES = [["bar", "Barras"], ["column", "Colunas"], ["line", "Linhas"], ["donut", "Rosca"], ["waffle", "Waffle"], ["isotype", "Ícones"], ["stacked", "Empilhado"]];
  const DATA_ITEM = obj([f.text("label", "Rótulo"), f.num("value", "Valor"), f.color("color", "Cor")]);
  const CHART_FIELDS = {
    bar: [f.list("data", "Dados", DATA_ITEM, { newItem: () => ({ label: "Novo", value: 0 }) }), f.text("suffix", "Unidade"), f.num("max", "Máximo"), f.nums("highlight", "Destacar (posições)")],
    column: [f.list("data", "Dados", DATA_ITEM, { newItem: () => ({ label: "Novo", value: 0 }) }), f.text("suffix", "Unidade"), f.num("max", "Máximo"), f.nums("highlight", "Destacar (posições)")],
    stacked: [f.list("data", "Dados", DATA_ITEM, { newItem: () => ({ label: "Novo", value: 0 }) }), f.text("suffix", "Unidade")],
    line: [f.list("labels", "Rótulos do eixo", T), f.list("series", "Séries", obj([f.text("name", "Nome"), f.nums("values", "Valores (vírgula; vazio = sem dado)", { allowNull: true }), f.color("color", "Cor")]), { newItem: () => ({ name: "Série", values: [] }) }),
      f.num("min", "Mínimo"), f.num("max", "Máximo"), f.nums("ticks", "Marcas do eixo (valores)"), f.text("suffix", "Unidade"), f.bool("area", "Preencher área"), f.bool("markers", "Marcadores", { default: true }), f.bool("axis", "Eixo", { default: true }),
      f.list("bands", "Faixas", obj([f.num("at", "Posição"), f.text("text", "Texto")]), { newItem: () => ({ at: 0, text: "Faixa" }) }),
      f.list("annotations", "Anotações", obj([f.num("at", "Posição"), f.text("text", "Texto")]), { newItem: () => ({ at: 0, text: "Nota" }) })],
    donut: [f.num("value", "Valor (%)"), f.text("center", "Texto no centro"), f.list("parts", "Partes (no lugar do valor)", DATA_ITEM, { newItem: () => ({ label: "Parte", value: 10 }) })],
    waffle: [f.num("total", "Total de quadrados"), f.num("cols", "Colunas"), f.list("groups", "Grupos", obj([f.num("count", "Quantidade"), f.text("label", "Rótulo"), f.color("color", "Cor")]), { newItem: () => ({ count: 10, label: "Grupo" }) })],
    isotype: [f.num("total", "Total"), f.num("highlight", "Destacados"), f.icon("icon", "Ícone")],
  };

  // ---------------------------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------------------------
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const icon = (name) => h("i", { class: "ic", "data-ic": name });

  const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  function setKey(o, k, v) {
    if (isEmpty(v)) delete o[k];
    else o[k] = v;
  }
  // campo de lista que aceita nomes alternativos (stats|kpis|items): usa o que existir
  const listKey = (o, k) => (Array.isArray(k) ? k.find((x) => Array.isArray(o[x])) || k[0] : k);

  // ---------------------------------------------------------------------------------------------
  // Renderização
  // ---------------------------------------------------------------------------------------------
  let CTX = null;
  let typingTimer = null;
  const commitSoon = () => { clearTimeout(typingTimer); typingTimer = setTimeout(() => CTX.commit(false), 350); };
  // microtask: roda depois de todos os handlers do mesmo evento (ex.: o que devolve "texto ou objeto" ao array)
  const commitNow = () => { clearTimeout(typingTimer); queueMicrotask(() => CTX.commit(false)); };
  const commitStructure = () => { clearTimeout(typingTimer); queueMicrotask(() => CTX.commit(true)); };

  // Item recolhível com cabeçalho próprio (botões no cabeçalho não abrem/fecham o item)
  function collapsible(path, title, controls, body, extraClass = "") {
    const wrap = h("div", { class: `sf-item ${extraClass}` });
    const toggle = h("button", { class: "sf-item-toggle", type: "button", "aria-expanded": "false" }, icon("chevron-down"), h("span", { class: "sf-item-title", text: title }));
    const set = (open) => {
      wrap.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      open ? openGroups.add(path) : openGroups.delete(path);
    };
    toggle.onclick = () => set(!wrap.classList.contains("open"));
    wrap.append(h("div", { class: "sf-item-head" }, toggle, ...controls), h("div", { class: "sf-item-body" }, body));
    set(openGroups.has(path));
    return wrap;
  }
  const openGroups = new Set(); // grupos "Mais opções"/itens abertos, por caminho — sobrevive a reconstruções

  function fieldWrap(spec, control, extraClass = "") {
    return h("div", { class: `sf-field ${extraClass}` },
      h("label", { class: "sf-label", text: spec.label }), control,
      spec.hint ? h("div", { class: "sf-hint", text: spec.hint }) : null);
  }

  function renderField(o, spec, path) {
    if (spec.when && !spec.when(o)) return null;
    switch (spec.type) {
      case "text": case "textarea": return textField(o, spec);
      case "number": return numberField(o, spec);
      case "bool": return boolField(o, spec);
      case "select": return selectField(o, spec);
      case "color": return textField(o, { ...spec, datalist: COLOR_ROLES, placeholder: spec.placeholder || "fg, hi, em… ou #hex" });
      case "icon": return iconField(o, spec);
      case "nums": return numsField(o, spec);
      case "pair": return pairField(o, spec);
      case "list": return listField(o, spec, path);
      case "object": return objectField(o, spec, path);
      case "element": return elementField(o, spec, path);
      case "elements": return elementsField(o, spec, path);
      case "chart": return chartField(o, spec, path);
      case "more": return moreGroup(o, spec.fields, path + ".more");
      default: return null;
    }
  }

  function textField(o, spec) {
    const v = o[spec.k];
    const multiline = spec.type === "textarea" || (typeof v === "string" && v.includes("\n"));
    const input = multiline
      ? h("textarea", { class: `form-control ${spec.mono ? "mono" : ""}`, rows: spec.rows || Math.min(8, Math.max(2, String(v ?? "").split("\n").length)), placeholder: spec.placeholder })
      : h("input", { type: "text", class: `form-control ${spec.mono ? "mono" : ""}`, placeholder: spec.placeholder });
    input.value = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    let listId = null;
    if (spec.datalist) {
      listId = `dl-${spec.k}-${Math.random().toString(36).slice(2, 7)}`;
      input.setAttribute("list", listId);
    }
    input.addEventListener("input", () => { setKey(o, spec.k, input.value); commitSoon(); });
    input.addEventListener("change", commitNow);
    return fieldWrap(spec, h("div", { class: "sf-ctl" }, input, listId ? h("datalist", { id: listId }, spec.datalist.map((d) => h("option", { value: d }))) : null));
  }

  function numberField(o, spec) {
    const input = h("input", { type: "number", class: "form-control", step: "any", placeholder: spec.placeholder });
    input.value = o[spec.k] ?? "";
    input.addEventListener("input", () => { setKey(o, spec.k, input.value === "" ? null : Number(input.value)); commitSoon(); });
    input.addEventListener("change", commitNow);
    return fieldWrap(spec, input, "sf-narrow");
  }

  function boolField(o, spec) {
    const def = spec.default ?? false;
    const input = h("input", { type: "checkbox" });
    input.checked = o[spec.k] ?? def;
    input.addEventListener("change", () => {
      if (input.checked === def) delete o[spec.k];
      else o[spec.k] = input.checked;
      commitNow();
    });
    return h("label", { class: "sf-check" }, input, spec.label);
  }

  function selectField(o, spec) {
    const sel = h("select", { class: "form-control" }, h("option", { value: "", text: spec.empty || "—" }), spec.options.map(([v, l]) => h("option", { value: v, text: l })));
    const cur = o[spec.k];
    sel.value = cur == null ? "" : String(cur);
    if (cur != null && sel.value !== String(cur)) { // valor fora da lista: mostra mesmo assim
      sel.append(h("option", { value: String(cur), text: String(cur) }));
      sel.value = String(cur);
    }
    sel.addEventListener("change", () => { setKey(o, spec.k, spec.parse ? spec.parse(sel.value) : sel.value); commitNow(); });
    return fieldWrap(spec, sel);
  }

  function iconField(o, spec) {
    const input = h("input", { type: "text", class: "form-control", placeholder: "ex.: rocket" });
    input.value = o[spec.k] ?? "";
    input.addEventListener("input", () => { setKey(o, spec.k, input.value); commitSoon(); });
    input.addEventListener("change", commitNow);
    const pick = h("button", { class: "btn-small", type: "button", title: "Escolher na biblioteca" }, "Escolher");
    pick.onclick = () => CTX.pickIcon((name) => { o[spec.k] = name; input.value = name; commitNow(); });
    return fieldWrap(spec, h("div", { class: "sf-inline" }, input, pick));
  }

  function numsField(o, spec) {
    const input = h("input", { type: "text", class: "form-control", placeholder: spec.placeholder || "ex.: 1, 3" });
    const cur = o[spec.k];
    input.value = cur == null ? "" : [].concat(cur).map((x) => (x == null ? "" : x)).join(", ");
    const parse = () => {
      const raw = input.value.trim();
      if (!raw) return null;
      const parts = raw.split(/[,;]\s*/).map((x) => (x.trim() === "" ? (spec.allowNull ? null : NaN) : Number(x)));
      return parts.some((x) => Number.isNaN(x)) ? undefined : parts;
    };
    input.addEventListener("input", () => {
      const v = parse();
      input.classList.toggle("invalid", v === undefined);
      if (v !== undefined) { setKey(o, spec.k, v && v.length === 1 && !Array.isArray(cur) && spec.k === "highlight" ? v[0] : v); commitSoon(); }
    });
    input.addEventListener("change", commitNow);
    return fieldWrap(spec, input);
  }

  function pairField(o, spec) {
    const cur = Array.isArray(o[spec.k]) ? o[spec.k] : ["", ""];
    const inputs = spec.labels.map((ph, i) => {
      const input = h("input", { type: "text", class: "form-control", placeholder: ph });
      input.value = cur[i] ?? "";
      input.addEventListener("input", () => {
        const v = inputs.map((x) => x.value);
        setKey(o, spec.k, v.every((x) => !x) ? null : v);
        commitSoon();
      });
      input.addEventListener("change", commitNow);
      return input;
    });
    return fieldWrap(spec, h("div", { class: "sf-inline" }, inputs));
  }

  function objectField(o, spec, path) {
    if (!o[spec.k] || typeof o[spec.k] !== "object") o[spec.k] = {};
    const target = o[spec.k];
    return h("fieldset", { class: "sf-object" }, h("legend", { text: spec.label }), renderFields(target, spec.fields, `${path}.${spec.k}`));
  }

  function moreGroup(o, fields, path) {
    const det = h("details", { class: "sf-more" }, h("summary", { text: "Mais opções" }), renderFields(o, fields, path));
    det.open = openGroups.has(path);
    det.addEventListener("toggle", () => (det.open ? openGroups.add(path) : openGroups.delete(path)));
    return det;
  }

  // ---- listas ----
  function listField(o, spec, path) {
    const key = listKey(o, spec.k);
    const arr = Array.isArray(o[key]) ? o[key] : [];
    const item = spec.item;
    const box = h("div", { class: "sf-list" });
    const head = h("div", { class: "sf-list-head" }, h("span", { class: "sf-label", text: `${spec.label}${arr.length ? ` (${arr.length})` : ""}` }));
    const canAdd = !spec.max || arr.length < spec.max;
    if (canAdd) {
      const add = h("button", { class: "btn-small", type: "button" }, spec.addLabel || "Adicionar");
      add.onclick = () => {
        const next = spec.newItem ? spec.newItem() : item === T || item === TA ? "" : item.textOrObj ? "" : {};
        o[key] = [...arr, next];
        openGroups.add(`${path}.${key}.${arr.length}`);
        commitStructure();
      };
      head.append(add);
    }
    box.append(head);
    arr.forEach((val, i) => box.append(listItem(o, key, arr, i, item, `${path}.${key}.${i}`)));
    return box;
  }

  function itemControls(arr, i, o, key) {
    const move = (d) => () => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; commitStructure(); };
    const del = () => { arr.splice(i, 1); if (!arr.length) delete o[key]; commitStructure(); };
    return h("div", { class: "sf-item-ctl" },
      h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Subir", onclick: move(-1), disabled: i === 0 || null }, icon("arrow-up")),
      h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Descer", onclick: move(1), disabled: i === arr.length - 1 || null }, icon("arrow-down")),
      h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Remover", onclick: del }, icon("trash-2")));
  }

  function listItem(o, key, arr, i, item, path) {
    // item de texto simples: uma linha com os controles
    if (item === T || item === TA) {
      const input = item === TA ? h("textarea", { class: "form-control", rows: 2 }) : h("input", { type: "text", class: "form-control" });
      input.value = arr[i] == null ? "" : String(arr[i]);
      input.addEventListener("input", () => { arr[i] = input.value; commitSoon(); });
      input.addEventListener("change", commitNow);
      return h("div", { class: "sf-item sf-item-simple" }, input, itemControls(arr, i, o, key));
    }
    if (item === "element") return elementCard(arr, i, path, { removable: true, o, key });
    // item objeto (ou texto-ou-objeto: string vira {text} e volta a ser string se só tiver texto)
    const isStr = typeof arr[i] !== "object" || arr[i] == null;
    const target = isStr ? { text: arr[i] == null ? "" : String(arr[i]) } : arr[i];
    if (isStr && !item.textOrObj) arr[i] = target;
    const proxyCommit = () => {
      if (item.textOrObj) {
        const keys = Object.keys(target).filter((k) => !isEmpty(target[k]));
        arr[i] = keys.length === 1 && keys[0] === "text" ? target.text : keys.length ? target : "";
      }
    };
    return collapsible(path, itemSummary(target, i), [itemControls(arr, i, o, key)], renderFields(target, item.fields, path, proxyCommit));
  }

  function itemSummary(t, i) {
    const s = t.title || t.text || t.label || t.when || t.value || t.name || t.icon || "";
    return `${i + 1}. ${String(s).replace(/==|\*\*|\^\^|~~|`/g, "").slice(0, 60) || "(vazio)"}`;
  }

  // ---- elementos ----
  function elementField(o, spec, path) {
    const cur = o[spec.k];
    const box = h("div", { class: "sf-list" }, h("div", { class: "sf-list-head" }, h("span", { class: "sf-label", text: spec.label })));
    if (cur == null) {
      box.firstChild.append(kindMenu("Adicionar", (tpl) => { o[spec.k] = tpl; openGroups.add(`${path}.${spec.k}`); commitStructure(); }));
      return box;
    }
    // atalhos em texto: figura "foto.jpg" = imagem; nota/lado "texto" = texto
    if (typeof cur !== "object") o[spec.k] = spec.stringAs === "text" ? { lead: String(cur) } : { image: String(cur) };
    const holder = [o[spec.k]];
    box.append(elementCard(holder, 0, `${path}.${spec.k}`, {
      removable: true, onRemove: () => { delete o[spec.k]; commitStructure(); },
      onReplace: (v) => { o[spec.k] = v; }, positioned: spec.positioned,
    }));
    return box;
  }

  function elementsField(o, spec, path) {
    let arr = o[spec.k];
    if (arr != null && !Array.isArray(arr)) arr = o[spec.k] = [arr];
    arr = arr || [];
    const box = h("div", { class: "sf-list" });
    const head = h("div", { class: "sf-list-head" }, h("span", { class: "sf-label", text: `${spec.label}${arr.length ? ` (${arr.length})` : ""}` }),
      kindMenu("Adicionar", (tpl) => {
        if (spec.positioned) Object.assign(tpl, { x: 160, y: 160 });
        o[spec.k] = [...arr, tpl];
        openGroups.add(`${path}.${spec.k}.${arr.length}`);
        commitStructure();
      }));
    box.append(head);
    arr.forEach((_, i) => box.append(elementCard(arr, i, `${path}.${spec.k}.${i}`, { removable: true, o, key: spec.k, positioned: spec.positioned })));
    return box;
  }

  function kindMenu(label, onPick) {
    const sel = h("select", { class: "form-control form-control-sm sf-kind-add", title: label },
      h("option", { value: "", text: `${label}…` }), ELEMENT_KINDS.map((k) => h("option", { value: k.id, text: k.label })));
    sel.addEventListener("change", () => {
      const k = ELEMENT_KINDS.find((x) => x.id === sel.value);
      if (k) onPick(k.tpl());
    });
    return sel;
  }

  function elementCard(arr, i, path, opts = {}) {
    let e = arr[i];
    if (typeof e !== "object" || e == null) e = arr[i] = { body: e == null ? "" : String(e) };
    const kind = kindOf(e);
    // trocar o tipo: começa do modelo do novo tipo, mantendo posição/clique
    const kindSel = h("select", { class: "form-control form-control-sm", title: "Tipo do elemento" },
      ELEMENT_KINDS.map((k) => h("option", { value: k.id, text: k.label })), kind ? null : h("option", { value: "", text: "Desconhecido" }));
    kindSel.value = kind ? kind.id : "";
    kindSel.addEventListener("change", () => {
      const k = ELEMENT_KINDS.find((x) => x.id === kindSel.value);
      if (!k) return;
      const keep = Object.fromEntries(EL_COMMON_KEYS.filter((c) => e[c] != null).map((c) => [c, e[c]]));
      const next = { ...k.tpl(), ...keep };
      arr[i] = next;
      opts.onReplace?.(next);
      openGroups.add(path);
      commitStructure();
    });
    const ctl = [];
    if (opts.removable) {
      if (opts.onRemove) ctl.push(h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Remover", onclick: opts.onRemove }, icon("trash-2")));
      else ctl.push(itemControls(arr, i, opts.o, opts.key));
    }
    const body = h("div", { class: "sf-stack" }); // o collapsible já dá o .sf-item-body
    if (!kind) body.append(h("div", { class: "sf-hint", text: "Tipo não reconhecido — edite os campos abaixo." }));
    else if (kind.text) body.append(textElementFields(e));
    else if (kind.chart) body.append(chartFields(e, path, "chart"));
    else body.append(renderFields(e, kind.fields, path));
    body.append(moreGroup(e, EL_MORE(opts.positioned), `${path}.more`));
    const used = new Set([...(kind?.fields || []).flatMap((s) => [].concat(s.k || [])), ...EL_COMMON_KEYS, ...(kind?.text ? ["text", "as", "size", "weight", "upper", "face", "lh", "fit", ...TEXT_KEYS] : []),
      ...(kind?.chart ? chartKeys(e) : [])]);
    const extra = genericFields(e, used, `${path}.other`);
    if (extra) body.append(extra);
    return collapsible(path, elementSummary(e, kind), [kindSel, ...ctl], body, "sf-element");
  }

  function elementSummary(e, kind) {
    const role = textRole(e);
    const s = e.text ?? (role ? e[role] : null) ?? e.icon ?? e.picto ?? e.image ?? e.badge ?? e.label ?? e.title ?? "";
    return String(s).replace(/==|\*\*|\^\^|~~|`/g, "").slice(0, 40) || kind?.label || "Elemento";
  }

  // Texto: { h2: "…" } ou { text: "…", as: h2 } — o estilo troca a chave (ou o `as`) sem perder o texto
  function textElementFields(e) {
    const frag = document.createDocumentFragment();
    const getRole = () => (e.text != null ? e.as || "body" : textRole(e) || "body");
    const ta = h("textarea", { class: "form-control", rows: 2 });
    ta.value = e.text != null ? e.text : e[textRole(e)] ?? "";
    ta.addEventListener("input", () => {
      if (e.text != null) e.text = ta.value;
      else e[textRole(e) || "body"] = ta.value;
      commitSoon();
    });
    ta.addEventListener("change", commitNow);
    frag.append(fieldWrap({ label: "Texto" }, ta));
    const sel = h("select", { class: "form-control" }, TEXT_ROLES.map(([v, l]) => h("option", { value: v, text: l })));
    sel.value = getRole();
    sel.addEventListener("change", () => {
      if (e.text != null) e.as = sel.value;
      else { const r = textRole(e); const v = e[r]; delete e[r]; e[sel.value] = v; }
      commitNow();
    });
    frag.append(fieldWrap({ label: "Estilo" }, sel));
    frag.append(renderFields(e, [f.num("size", "Tamanho (px)"), f.num("weight", "Peso da fonte")], ""));
    return frag;
  }

  // ---- gráficos ----
  const CHART_MORE = [f.text("prefix", "Antes do valor"), f.num("decimals", "Casas decimais"), f.bool("legend", "Legenda"), f.num("fontSize", "Tamanho do texto (px)"),
    f.num("valueSize", "Tamanho dos valores (px)"), f.num("labelWidth", "Largura dos rótulos (px)"), f.num("barHeight", "Altura das barras (px)"), f.num("barWidth", "Largura das barras (px)"),
    f.num("thickness", "Espessura (rosca)"), f.num("centerSize", "Tamanho do centro (px)"), f.color("color", "Cor"), f.num("cw", "Largura do gráfico (px)"), f.num("ch", "Altura do gráfico (px)")];
  function chartKeys(c) {
    const type = c.chart || c.type || "bar";
    return ["chart", "type", ...(CHART_FIELDS[type] || []).flatMap((s) => [].concat(s.k)), ...CHART_MORE.map((s) => s.k)];
  }
  function chartFields(c, path, typeKey) {
    const frag = document.createDocumentFragment();
    const tk = c.type != null && c.chart == null ? "type" : typeKey;
    const sel = h("select", { class: "form-control" }, CHART_TYPES.map(([v, l]) => h("option", { value: v, text: l })));
    sel.value = c[tk] || "bar";
    sel.addEventListener("change", () => { c[tk] = sel.value; commitStructure(); });
    frag.append(fieldWrap({ label: "Tipo de gráfico" }, sel));
    frag.append(renderFields(c, CHART_FIELDS[c[tk] || "bar"] || [], `${path}.chart`));
    frag.append(moreGroup(c, CHART_MORE, `${path}.chart.more`));
    return frag;
  }
  function chartField(o, spec, path) {
    if (!o[spec.k] || typeof o[spec.k] !== "object") o[spec.k] = { chart: "bar", data: [] };
    const c = o[spec.k];
    const fs = h("fieldset", { class: "sf-object" }, h("legend", { text: spec.label }), chartFields(c, path, "chart"));
    const extra = genericFields(c, new Set(chartKeys(c)), `${path}.chart.other`);
    if (extra) fs.append(extra);
    return fs;
  }

  // ---- genérico: qualquer campo que o formulário não conhece ----
  function genericFields(o, used, path, hint) {
    const keys = Object.keys(o).filter((k) => !used.has(k) && !k.startsWith("_"));
    if (!keys.length) return null;
    const box = h("div", {}, hint ? h("div", { class: "sf-hint", text: hint }) : null);
    keys.forEach((k) => box.append(genericField(o, k)));
    const det = h("details", { class: "sf-more" }, h("summary", { text: `Outros campos (${keys.length})` }), box);
    det.open = openGroups.has(path);
    det.addEventListener("toggle", () => (det.open ? openGroups.add(path) : openGroups.delete(path)));
    return det;
  }

  function genericField(o, k) {
    const v = o[k];
    if (typeof v === "boolean") return boolField(o, { k, label: k });
    if (typeof v === "number") return numberField(o, { k, label: k });
    if (typeof v === "string") return textField(o, { k, label: k });
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return listField(o, { k, label: k, item: T }, "gen");
    // estruturas: edição como JSON validado
    const ta = h("textarea", { class: "form-control mono", rows: Math.min(10, JSON.stringify(v, null, 2).split("\n").length) });
    ta.value = JSON.stringify(v, null, 2);
    const hint = h("div", { class: "sf-hint" });
    ta.addEventListener("input", () => {
      try { o[k] = JSON.parse(ta.value); ta.classList.remove("invalid"); hint.textContent = ""; commitSoon(); }
      catch (err) { ta.classList.add("invalid"); hint.textContent = "JSON inválido — não aplicado"; }
    });
    return h("div", { class: "sf-field" }, h("label", { class: "sf-label", text: k }), ta, hint);
  }

  // ---- montagem ----
  function renderFields(o, fields, path, onAnyChange) {
    const frag = document.createDocumentFragment();
    for (const spec of fields) {
      const node = renderField(o, spec, path);
      if (!node) continue;
      if (onAnyChange) { node.addEventListener("input", onAnyChange); node.addEventListener("change", onAnyChange); }
      frag.append(node);
    }
    return frag;
  }

  function schemaKeys(fields) {
    const out = new Set();
    for (const s of fields) {
      if (s.type === "more") schemaKeys(s.fields).forEach((k) => out.add(k));
      else [].concat(s.k || []).forEach((k) => out.add(k));
    }
    return out;
  }

  function render(container, slide, ctx) {
    CTX = ctx;
    container.innerHTML = "";
    const layout = slide.layout || "blocks";
    const fields = LAYOUTS[layout] || LAYOUTS.blocks;
    container.append(renderFields(slide, fields.filter((s) => s.type !== "more"), "slide"));
    const own = fields.find((s) => s.type === "more")?.fields || [];
    const ownKeys = schemaKeys(own);
    container.append(moreGroup(slide, [...own, ...COMMON_MORE.filter((s) => !ownKeys.has(s.k))], "slide.more"));
    const used = new Set([...schemaKeys(fields), ...schemaKeys(COMMON_MORE), ...SLIDE_RESERVED]);
    const extra = genericFields(slide, used, "slide.other", "Campos que este layout não usa ou que o editor ainda não conhece. Continuam no YAML.");
    if (extra) container.append(extra);
  }

  window.SlideForm = { render, LAYOUTS, ELEMENT_KINDS };
})();
