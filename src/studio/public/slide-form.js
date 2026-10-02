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
    codeLanguage: (k, label, filenameKey) => ({ k, label, type: "codeLanguage", filenameKey }),
    color: (k, label, o = {}) => ({ k, label, type: "color", ...o }),
    icon: (k, label, o = {}) => ({ k, label, type: "icon", ...o }),
    nums: (k, label, o = {}) => ({ k, label, type: "nums", ...o }),         // "2, 3" <-> [2, 3]
    pair: (k, label, labels, o = {}) => ({ k, label, type: "pair", labels, ...o }), // [a, b]
    list: (k, label, item, o = {}) => ({ k, label, type: "list", item, ...o }),
    obj: (k, label, fields, o = {}) => ({ k, label, type: "object", fields, ...o }),
    el: (k, label, o = {}) => ({ k, label, type: "element", ...o }),
    els: (k, label, o = {}) => ({ k, label, type: "elements", ...o }),
    chart: (k, label, o = {}) => ({ k, label, type: "chart", ...o }),
    plot: (k, label, o = {}) => ({ k, label, type: "plot", ...o }),
    photo: (k, label, o = {}) => ({ k, label, type: "photo", ...o }),     // foto da pessoa (arquivo escolhido) ou vazia = de demonstração
    lines: (k, label, o = {}) => ({ k, label, type: "linemap", ...o }), // {2: "texto", 5: null} <-> "2: texto" por linha
    tablegrid: (label, o = {}) => ({ k: ["head", "rows"], label, type: "tablegrid", ...o }), // tabela de texto (layout table)
    sheet: (label, o = {}) => ({ k: ["data", "labels", "series", "parts"], label, type: "sheet", ...o }), // planilha dos dados do gráfico       // fórmulas, pontos e superfície (slide science)
    json: (k, label, o = {}) => ({ k, label, type: "json", ...o }),        // objeto editado como JSON validado
    more: (fields) => ({ type: "more", fields }),
    action: (label, run, o = {}) => ({ type: "action", label, run, ...o }),
  };
  // item de lista: texto simples | campos de objeto | texto-ou-objeto (string vira {text}) | elemento
  const T = "text";
  const TA = "textarea";
  const obj = (fields, o = {}) => ({ fields, ...o });
  const textOrObj = (fields, o = {}) => ({ fields, textOrObj: true, ...o });

  // dinâmicas a dois: quem fala/age e o roteiro do Git (o simulador calcula diff, push recusado, merge e conflito)
  const WHO = f.select("who", "Quem", [["1", "Pessoa 1"], ["2", "Pessoa 2"]], { empty: false, default: "1", parse: Number });
  const DUEL_FIELDS = [f.pair("people", "As duas pessoas", ["Ana", "Beto"]), f.text("file", "Arquivo", { placeholder: "soma.js" }), f.area("base", "Arquivo no começo (igual para os dois)", { mono: true, rows: 5 }),
    f.list("turns", "Turnos (um por clique)", obj([WHO, f.lines("edit", "Linhas que muda", { hint: "Uma por linha: 2: novo texto (2: (apagar) apaga)" }), f.text("commit", "Commit (mensagem)"),
      f.bool("push", "git push"), f.bool("pull", "git pull"), f.lines("resolve", "Resolve o conflito", { hint: "ours (fica a sua), theirs (a do remoto), both, ou as linhas: 2: texto final" }),
      f.bool("log", "git log --graph"), f.more([f.text("say", "Explicação no lugar da automática"), f.text("note", "Nota embaixo")])]),
      { addLabel: "Adicionar turno", newItem: () => ({ who: 1, commit: "" }) })];
  const CARD = [f.icon("icon", "Ícone"), f.text("title", "Título"), f.area("text", "Texto"),
    f.more([f.text("number", "Número"), f.text("foot", "Rodapé"), f.text("badge", "Selo"), f.bool("hl", "Destacar"), f.num("step", "Aparece no clique"), f.text("goto", "Ao clicar, ir para", { hint: "Id do slide de destino (ou o número dele): navegação por caminhos." })])];
  const STAT = [f.text("value", "Valor"), f.text("label", "Rótulo"), f.text("trend", "Tendência"), f.icon("icon", "Ícone"),
    f.more([f.bool("trendUp", "Tendência positiva"), f.color("color", "Cor")])];
  const STEP = [f.text("title", "Título"), f.area("text", "Texto"), f.icon("icon", "Ícone"), f.more([f.text("tag", "Etiqueta"), f.text("goto", "Ao clicar, ir para", { hint: "Id do slide de destino (ou o número dele): navegação por caminhos." })])];
  // bloco do one-page (problema, solução): texto, números grandes e tópicos
  const OP_BLOCK = [f.text("title", "Título"), f.area("text", "Texto"),
    f.list("numbers", "Números", obj([f.text("value", "Valor"), f.text("label", "Rótulo")]), { addLabel: "Adicionar número", newItem: () => ({ value: "10%", label: "" }) }),
    f.list("items", "Tópicos", T, { addLabel: "Adicionar tópico" })];
  // item do status semanal: texto, com responsável e prazo opcionais
  const STATUS_ITEM = textOrObj([f.area("text", "Texto"), f.text("owner", "Responsável"), f.text("due", "Prazo")]);
  // opção do mapa de caminhos (layout hub): leva à seção do caminho
  const HUB_OPTION = [f.icon("icon", "Ícone"), f.text("title", "Título"), f.area("text", "Texto"), f.text("meta", "Detalhe", { hint: "Ex.: 30 dias, prorrogável" }), f.text("goto", "Ao clicar, ir para", { hint: "Id do slide de destino (ou o número dele): navegação por caminhos." })];
  const TIMELINE_EV = [f.text("when", "Quando"), f.text("title", "Título"), f.area("text", "Texto"), f.text("tag", "Etiqueta")];
  const COMPARE_SIDE = [f.text("label", "Rótulo"), f.text("value", "Valor grande"), f.text("title", "Título"), f.area("text", "Texto"),
    f.list("items", "Itens", T), f.el("figure", "Figura"), f.bool("hl", "Destacar")];
  const MATRIX_CELL = [f.text("title", "Título"), f.area("text", "Texto"), f.text("example", "Exemplo"), f.icon("icon", "Ícone"), f.bool("hl", "Destacar")];
  const COMMON_MORE = [f.text("id", "Id do slide", { hint: "Nome curto para os links (goto, Voltar) chegarem aqui. Ex.: mapa, dev" }),
    f.text("back", "Botão Voltar para", { hint: "Id do slide (ex.: mapa): mostra 'Voltar' no canto" }),
    f.text("next", "No fim, avançar para", { hint: "Id do slide: o fim de um caminho volta ao mapa em vez de seguir a ordem" }),
    f.select("markStyle", "Estilo do ==destaque== neste slide", [["marca-texto", "Marca-texto"], ["sublinhado", "Sublinhado"], ["cor", "Só cor"], ["negrito", "Negrito colorido"], ["nenhum", "Sem destaque"]], { empty: "O do deck" }),
    f.num("titleSize", "Tamanho do título (px)"), f.bool("fit", "Encolher o título para caber"), f.text("source", "Fonte (rodapé)"), f.text("transition", "Transição", { datalist: ["fade", "slide", "zoom", "none"] }),
    f.els("add", "Elementos extras no fim"), f.el("background", "Figura de fundo")];

  // Campos de cada layout (o que src/layouts.js lê). "more" = recolhido em "Mais opções".
  // grades adaptáveis (src/adaptive-layouts.js): os mesmos campos nas três
  const ADAPTIVE = [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("items", "Itens", obj([f.text("title", "Título"), f.area("text", "Texto"), f.text("value", "Valor"), f.icon("icon", "Ícone"), f.area("code", "Código (opcional)", { mono: true, rows: 4 }), f.text("foot", "Nota")]), { addLabel: "Adicionar item", newItem: () => ({ title: "Novo item", text: "" }), max: 12 }), f.bool("build", "Revelar por clique")];
  const CODE_SOURCE_FIELDS = [
    f.text("filename", "Nome do arquivo", { placeholder: "exemplo.py" }),
    f.codeLanguage("language", "Linguagem", "filename"),
    f.area("code", "Código", { mono: true, rows: 10, hint: "O código é exibido, sem execução." }),
    f.nums("highlight", "Linhas destacadas (a partir de 1)"),
  ];
  const CODE_SIZE_FIELDS = [f.num("size", "Tamanho do código (px)")];
  const LAYOUTS = {
    mosaic: ADAPTIVE, ribbon: ADAPTIVE, dossier: ADAPTIVE,
    cover: [f.text("kicker", "Chapéu"), f.area("title", "Título"), f.text("subtitle", "Subtítulo"), f.text("author", "Autor"), f.text("role", "Cargo do autor"),
      f.el("figure", "Figura"), f.more([f.num("titleSize", "Tamanho do título (px)")])],
    section: [f.text("number", "Número"), f.text("kicker", "Chapéu"), f.area("title", "Título"), f.text("subtitle", "Subtítulo"), f.el("figure", "Figura"),
      f.more([f.num("titleSize", "Tamanho do título (px)")])],
    definition: [f.text("kicker", "Chapéu"), f.text("term", "Termo"), f.text("origin", "Origem", { hint: "Ex.: do grego, do latim" }),
      f.list("parts", "Partes da palavra", obj([f.text("word", "Parte"), f.text("meaning", "Significado")]), { addLabel: "Adicionar parte", newItem: () => ({ word: "", meaning: "" }) }),
      f.area("text", "Definição"), f.icon("icon", "Ícone"), f.el("figure", "Figura (no lugar do ícone)"), f.more([f.bool("build", "Revelar por cliques"), f.num("termSize", "Tamanho do termo (px)")])],
    poster: [f.text("kicker", "Chapéu"), f.area("title", "Título"), f.text("subtitle", "Subtítulo"), f.el("hero", "Ilustração principal"),
      f.list("panels", "Painéis", obj([f.text("label", "Letra"), f.text("title", "Título"), f.area("text", "Texto"), f.icon("icon", "Ícone"), f.el("figure", "Figura (no lugar do ícone)"),
        f.list("facts", "Números", obj([f.text("value", "Valor"), f.text("label", "Legenda")]), { addLabel: "Adicionar número", newItem: () => ({ value: "", label: "" }) })]),
        { addLabel: "Adicionar painel", newItem: () => ({ title: "", text: "", icon: "circle" }) }),
      f.area("key", "Nota de rodapé"), f.more([f.bool("flow", "Setas entre os painéis"), f.num("cols", "Colunas"), f.bool("build", "Revelar por cliques")])],
    statement: [f.text("kicker", "Chapéu"), f.area("text", "Frase", { hint: "Ou use Linhas para revelar uma frase por clique." }),
      f.list("lines", "Linhas (uma por clique)", textOrObj([f.area("text", "Texto"), f.select("as", "Estilo", TEXT_ROLES, { empty: "Título grande" }), f.color("color", "Cor"), f.num("step", "Clique")]), { addLabel: "Adicionar linha" }),
      f.text("by", "Assinatura"),
      f.more([f.bool("center", "Centralizar"), f.select("as", "Estilo da frase", TEXT_ROLES, { empty: "Título grande" }), f.num("size", "Tamanho (px)"), f.num("byStep", "Assinatura no clique")])],
    hub: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.text("question", "Pergunta"),
      f.list(["options", "items"], "Caminhos", obj(HUB_OPTION), { addLabel: "Adicionar caminho", newItem: () => ({ icon: "signpost", title: "Novo caminho", text: "", goto: "" }) }),
      f.more([f.num("cols", "Colunas"), f.bool("build", "Um caminho por clique")])],
    onepage: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.text("subtitle", "Subtítulo"),
      f.list("journey", "Jornada", textOrObj([f.icon("icon", "Ícone"), f.text("title", "Título"), f.text("text", "Mini-frase"), f.text("goto", "Ao clicar, ir para")]),
        { addLabel: "Adicionar etapa da jornada", newItem: () => ({ icon: "circle", title: "Etapa", text: "" }) }),
      f.obj("problem", "O problema", OP_BLOCK, { stringAs: "text" }), f.obj("solution", "A solução", OP_BLOCK, { stringAs: "text" }),
      f.obj("dashboard", "Painel", [f.list("numbers", "Números grandes", obj([f.text("value", "Valor"), f.text("label", "Rótulo"), f.text("trend", "Tendência", { hint: "Ex.: +12% (com - na frente fica vermelho)" }), f.text("title", "Título")]),
          { addLabel: "Adicionar número", newItem: () => ({ value: "100", label: "Indicador" }) }),
        f.list("figures", "Gráficos e mapa", "element", { addLabel: "Adicionar gráfico ou mapa", newItem: () => ({ title: "Gráfico", chart: "bar", data: [{ label: "A", value: 10 }, { label: "B", value: 20 }] }) })]),
      f.more([f.text("journeyTitle", "Título da jornada", { placeholder: "Jornada" })])],
    status: [f.text("kicker", "Chapéu", { hint: "Ex.: Semana 39 · 22 a 26/09" }), f.text("title", "Título"),
      f.select("health", "Saúde", [["ok", "Em dia"], ["risco", "Atenção"], ["atrasado", "Atrasado"]], { empty: "Sem indicador" }), f.num("progress", "Avanço (%)"),
      f.text("highlight", "Destaque da semana"),
      f.list("done", "Feito", STATUS_ITEM, { addLabel: "Adicionar feito" }), f.list("doing", "Em andamento", STATUS_ITEM, { addLabel: "Adicionar em andamento" }),
      f.list("blocked", "Bloqueios", STATUS_ITEM, { addLabel: "Adicionar bloqueio" }), f.list("risks", "Riscos e problemas", STATUS_ITEM, { addLabel: "Adicionar risco" }),
      f.list("upcoming", "Próximos passos", STATUS_ITEM, { addLabel: "Adicionar próximo passo" }),
      f.list("shots", "Telas da semana (até 3)", obj([f.text("image", "Imagem (arquivo ou link)"), f.text("caption", "Legenda")]), { addLabel: "Adicionar tela", max: 3, newItem: () => ({ image: "", caption: "" }) }),
      f.more([f.text("healthLabel", "Texto da saúde", { hint: "Troca o rótulo, ex.: Atrasado 1 semana" })])],
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
    list: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("items", "Itens", textOrObj([f.area("text", "Texto"), f.text("sub", "Detalhe"), f.text("goto", "Ao clicar, ir para", { hint: "Id do slide de destino (ou o número dele): navegação por caminhos." })]), { addLabel: "Adicionar item" }),
      f.more([f.bool("numbered", "Numerada", { default: true }), f.bool("build", "Um por clique"), f.num("size", "Tamanho (px)")])],
    timeline: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("events", "Eventos", obj(TIMELINE_EV), { addLabel: "Adicionar evento", newItem: () => ({ when: "2025", title: "Evento" }) }),
      f.text("after", "Frase final (depois de um clique)"),
      f.more([f.nums("highlight", "Destacar eventos (posições, a partir de 0)"), f.bool("build", "Um por clique"), f.num("afterStep", "Frase final no clique")])],
    table: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.tablegrid("Tabela", { hint: "A primeira linha é o cabeçalho. Cole do Excel numa célula." }),
      f.select("style", "Estilo", [["", "Faixa (cabeçalho colorido)"], ["zebra", "Zebra"], ["linhas", "Só linhas"], ["colunas", "Uma cor por coluna"], ["cartao", "Cartão"]]),
      f.select("color", "Cor", [["", "Do tema"], ["c1", "Cor 1 da paleta"], ["c2", "Cor 2 da paleta"], ["c3", "Cor 3 da paleta"], ["c4", "Cor 4 da paleta"], ["c5", "Cor 5 da paleta"], ["hi", "Destaque"]]),
      f.bool("total", "Última linha é o total"), f.el("side", "Ao lado (a conclusão)", { stringAs: "text" }), f.text("caption", "Legenda"), f.text("source", "Fonte"),
      f.more([f.num("size", "Tamanho da letra (px)"), f.bool("rowHeader", "Primeira coluna em negrito")])],
    chart: [f.action("Atualizar da planilha", () => CTX.refreshFrom?.(), { when: (s) => s.from?.file }), f.text("kicker", "Chapéu"), f.text("title", "Título"), f.chart("chart", "Gráfico"), f.el("side", "Ao lado", { stringAs: "text" }),
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
    image: [f.action("Editar imagem e destaques", (s) => CTX.editScreenshot?.(s)), f.text("image", "Imagem (arquivo ou link)"), f.select("fit", "Enquadramento", [["cover", "Preencher"], ["contain", "Caber inteira"]], { empty: "Preencher" }),
      f.text("kicker", "Chapéu"), f.text("title", "Título"), f.text("caption", "Legenda"), f.more([f.el("figure", "Figura no lugar da imagem")])],
    code: [f.text("kicker", "Chapéu"), f.text("title", "Título"), ...CODE_SOURCE_FIELDS, f.el("note", "Nota ao lado", { stringAs: "text" }),
      f.more([...CODE_SIZE_FIELDS, f.num("noteStep", "Nota no clique")])],
    api: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.text("text", "Explicação curta"),
      f.select("mode", "Modo", [["sync", "Síncrono (responde na hora)"], ["polling", "Polling (inicia e consulta até terminar)"], ["stream", "Streaming (chega aos poucos)"], ["realtime", "Tempo real (conversa por WebSocket)"]], { empty: "Síncrono (responde na hora)", structural: true }),
      f.obj("request", "Requisição", [f.select("method", "Método", [["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"], ["PATCH", "PATCH"], ["DELETE", "DELETE"]], { empty: "POST se tiver corpo" }),
        f.text("url", "Endereço", { hint: "{{base}} e outras variáveis vêm do ambiente (Inserir › Ambientes). Segredo: {{secret.nome}}." }),
        f.json("body", "Corpo (JSON)", { placeholder: '{ "messages": [ { "role": "user", "content": "Olá" } ] }', hint: "Também dá para editar direto no slide, na hora de apresentar." }),
        f.bool("auth", "Enviar o token do ambiente", { default: true }),
        f.more([f.json("headers", "Cabeçalhos (JSON)", { placeholder: '{ "X-Canal": "workshop" }' }), f.json("form", "Formulário multipart (JSON, no lugar do corpo)", { placeholder: '{ "file": "@file", "pasta": "workshop" }' })])],
        { when: (s) => s.mode !== "realtime" }),
      f.json("realtime", "Conexão (WebSocket)", { when: (s) => s.mode === "realtime", placeholder: '{ "url": "{{ws}}/realtime" }', hint: "Só url é obrigatório; os outros campos seguem o formato mais comum (veja a referência)." }),
      f.json("polling", "Polling", { when: (s) => s.mode === "polling", placeholder: '{ "id": "$.executionId", "check": { "url": "{{base}}/status/{{id}}" }, "status": "$.status", "done": ["FINISHED"] }' }),
      f.json("stream", "Leitura do texto no streaming", { when: (s) => s.mode === "stream", placeholder: '{ "text": "$.choices[0].delta.content" }', hint: "Caminho do texto em cada pedaço SSE." }),
      f.text("answer", "Campo da resposta em destaque", { hint: "ex.: $.choices[0].message.content", when: (s) => s.mode !== "realtime" }),
      f.json("save", "Guardar para os próximos slides", { placeholder: '{ "path_id": "$.path_id" }', hint: "Viram {{nome}} nos slides seguintes", rows: 2 }),
      f.text("file", "Arquivo padrão (ao lado do deck)", { hint: "para upload (@file) ou {{file.base64}}" }),
      f.text("portal", "Link \"Abrir no portal\""),
      f.more([f.text("token", "Este slide gera o token (caminho na resposta)", { hint: "ex.: $.access_token — os slides seguintes usam esse token" }),
        f.text("steps", "Lista de etapas na resposta", { hint: "ex.: $.responses" }), f.text("stepText", "Texto de cada etapa", { hint: "ex.: $.output" }),
        f.bool("mic", "Botão Gravar (microfone, para STT)"), f.text("audio", "A resposta é áudio (TTS): nome do arquivo", { placeholder: "fala.mp3" }),
        f.select("tab", "Aba aberta ao entrar", [["body", "Corpo"], ["headers", "Cabeçalhos"], ["fields", "Parâmetros"], ["texts", "Frases (embeddings)"], ["log", "Mensagens (WebSocket)"], ["curl", "curl"], ["javascript", "JavaScript"], ["javascript-comentado", "JavaScript comentado"], ["python", "Python"], ["python-comentado", "Python comentado"]], { empty: "Corpo" }),
        f.text("id", "Identificador (para guardar a gravação)"),
        f.text("stepTitle", "Título de cada etapa (caminho)", { hint: "ex.: $.name — padrão tenta name, step, service e type" }),
        f.text("tokenVar", "Nome da variável do token no código", { placeholder: "API_TOKEN" }),
        f.json("fields", "Parâmetros documentados", { placeholder: '{ "$.campo": "O que este campo faz" }', hint: "Exibe a aba Parâmetros com caminho, valor atual e explicação." }),
        f.json("similarity", "Comparação por embeddings", { placeholder: '{ "reference": "frase de referência", "texts": ["outra frase"], "vector": "$.data[0].embedding" }', hint: "O corpo deve usar {{text}}; compara cada frase com a referência." }),
        f.json("code", "Abas de código", { placeholder: '["curl", "javascript", "python", "python-comentado"]', hint: "Lista de linguagens: curl, javascript, javascript-comentado, python, python-comentado." })])],
    carousel: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.select("style", "Estilo", [["arc", "Roda em semicírculo"], ["rings", "Foto em anéis que giram"]], { empty: false, default: "arc" }),
      f.list("items", "Itens (um por clique)", obj([f.photo("image", "Foto"), f.text("title", "Título"), f.area("text", "Texto"), f.text("label", "Chapéu do item", { placeholder: "01 / 05" })]),
        { addLabel: "Adicionar item", newItem: () => ({ title: "Novo item", text: "" }) })],
    // aula (src/lessons.js): exercício resolvido, calculadora ao vivo, algoritmo animado
    solution: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.area("problem", "Enunciado"),
      f.list("givens", "Dados", obj([f.text("symbol", "Símbolo (LaTeX)", { mono: true }), f.text("value", "Valor", { placeholder: "0,05" }), f.text("unit", "Unidade"), f.text("label", "Nome"), f.more([f.text("latex", "Ou a linha inteira em LaTeX", { mono: true })])]), { addLabel: "Adicionar dado", newItem: () => ({ symbol: "x", value: "1", unit: "" }) }),
      f.text("find", "Pede-se (LaTeX)", { mono: true }),
      f.list("steps", "Passos (um por clique)", obj([f.text("text", "O que se faz"), f.area("latex", "A conta (LaTeX)", { mono: true, rows: 2 }), f.text("note", "Observação")]), { addLabel: "Adicionar passo", newItem: () => ({ text: "Próximo passo", latex: "" }) }),
      f.obj("answer", "Resposta", [f.text("latex", "Resultado (LaTeX)", { mono: true }), f.text("text", "Em palavras"), f.text("label", "Rótulo", { placeholder: "Resposta" })]),
      f.more([f.text("prompt", "Pergunta antes do primeiro passo", { placeholder: "Por onde você começaria?" })])],
    calc: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.json("inputs", "Entradas", { rows: 8, hint: "{ V: { label, value, min, max, step, unit, latex }, nu: { value, fixed: true } } — cada entrada vira um controle deslizante (fixed: constante)." }),
      f.list("outputs", "Resultados (na ordem: um pode usar os anteriores)", obj([f.text("name", "Nome (para usar nas fórmulas)", { mono: true }), f.text("label", "Rótulo"), f.text("fn", "Fórmula", { mono: true, placeholder: "V*D/nu" }), f.text("latex", "Fórmula para mostrar (LaTeX)", { mono: true }), f.text("unit", "Unidade"), f.num("decimals", "Casas decimais"),
        f.more([f.text("of", "Faixas de qual valor?", { mono: true }), f.json("cases", "Faixas", { hint: "[{ below: 2300, text: Laminar, color: s3 }, { text: Turbulento, color: hi }] — ou fn por faixa" }), f.json("scale", "Régua", { hint: "{ min: 100, max: 1000000, log: true }" })])]),
        { addLabel: "Adicionar resultado", newItem: () => ({ name: "r", label: "Resultado", fn: "" }) }),
      f.text("note", "Nota embaixo")],
    algo: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.select("algorithm", "Algoritmo", [["bubble", "Bubble sort"], ["insertion", "Insertion sort"], ["selection", "Selection sort"], ["merge", "Merge sort"], ["quick", "Quicksort"], ["linear", "Busca linear"], ["binary", "Busca binária"],
        ["naive", "Busca em texto: ingênua"], ["kmp", "Busca em texto: KMP"], ["quicksearch", "Busca em texto: Quick Search"], ["bfs", "Grafo: busca em largura"], ["dijkstra", "Grafo: Dijkstra"], ["bst", "Árvore binária de busca"], ["program", "Meu código (Python)"]], { empty: false, default: "bubble", structural: true }),
      f.nums("array", "Números (até 16)", { when: (s) => !s.program && !["naive", "kmp", "quicksearch", "bfs", "dijkstra", "program"].includes(s.algorithm) }),
      f.num("target", "Número procurado (busca)", { when: (s) => ["linear", "binary"].includes(s.algorithm) }),
      f.text("text", "Texto", { mono: true, when: (s) => ["naive", "kmp", "quicksearch"].includes(s.algorithm) }), f.text("pattern", "Padrão procurado", { mono: true, when: (s) => ["naive", "kmp", "quicksearch"].includes(s.algorithm) }),
      f.json("graph", "Grafo (vizinhos de cada nó)", { hint: "{ A: [B, C], B: [D] } — com peso: { A: [[B, 4], [C, 1]] }", when: (s) => ["bfs", "dijkstra"].includes(s.algorithm) }), f.text("start", "Começa em", { when: (s) => ["bfs", "dijkstra"].includes(s.algorithm) }),
      f.area("program", "Programa (Python simples)", { mono: true, rows: 12, hint: "Comentário no fim da linha vira a legenda do passo; {expressão} mostra o valor.", when: (s) => s.program != null || s.algorithm === "program" }),
      f.text("predict", "Pergunta antes de rodar", { hint: "A turma aposta antes de ver; abre o slide (predict)", when: (s) => s.predict == null || typeof s.predict === "string" }),
      f.area("explain", "Por quê (no fim)", { rows: 3, hint: "Fecha o slide depois do último passo (explain)", when: (s) => s.explain == null || typeof s.explain === "string" }),
      f.text("call", "Chamada", { mono: true, placeholder: "meu_sort([5, 2, 9, 1])", when: (s) => s.program != null || s.algorithm === "program" }),
      f.more([f.num("speed", "Velocidade do Tocar (ms por passo)"), f.area("code", "Código no lugar do pseudocódigo", { mono: true, rows: 6, when: (s) => !s.program && ["bubble", "insertion", "selection", "merge", "quick", "linear", "binary"].includes(s.algorithm || "bubble") }), f.text("name", "Nome mostrado"),
        f.json("view", "O que desenhar", { hint: "[{ var: texto, pointers: [i] }, { var: padrao, under: texto, offset: i }, { var: raiz, as: tree }]", when: (s) => !["bubble", "insertion", "selection", "merge", "quick", "linear", "binary"].includes(s.algorithm || "bubble") || s.program }), f.num("maxSteps", "Máximo de passos")])],
    // dinâmicas a dois (src/dynamics): um quadro por clique
    duel: [f.text("kicker", "Chapéu"), f.text("title", "Título"), ...DUEL_FIELDS, f.text("bet", "Aposta antes do pull (enquete)", { placeholder: "Vai dar conflito?" })],
    terminals: [f.text("kicker", "Chapéu"), f.text("title", "Título"),
      f.list("steps", "Comandos (roteiro livre)", obj([WHO, f.text("cmd", "Comando", { mono: true }), f.area("out", "Saída", { mono: true, rows: 3 }), f.text("note", "Nota para a plateia")]),
        { addLabel: "Adicionar comando", newItem: () => ({ who: 1, cmd: "git status", out: "" }), when: (s) => s.base == null }),
      f.pair("panes", "Nomes dos terminais", ["Pessoa A", "Pessoa B"], { when: (s) => s.base == null }),
      f.action("Usar o roteiro do duelo (o Git calcula a saída)", (s) => { s.base = s.base ?? "linha 1\nlinha 2\nlinha 3"; s.file = s.file || "arquivo.txt"; s.turns = s.turns || [{ who: 1, edit: { 2: "mudança da A" }, commit: "muda a linha 2" }, { who: 1, push: true }, { who: 2, pull: true }, { who: 2, log: true }]; delete s.steps; CTX.commit(true); }, { when: (s) => s.base == null }),
      ...DUEL_FIELDS.map((x) => ({ ...x, when: (s) => s.base != null })), f.more([f.text("host", "Nome da máquina no prompt", { placeholder: "dev" }), f.num("keep", "Comandos visíveis por terminal")])],
    turns: [f.text("kicker", "Chapéu"), f.text("title", "Título"),
      f.list("people", "As duas pessoas", obj([f.text("name", "Nome"), f.text("role", "Papel", { placeholder: "revisor, cliente, servidor…" })]), { max: 2, addLabel: "Adicionar pessoa", newItem: () => ({ name: "Pessoa", role: "" }) }),
      f.list("turns", "Falas (uma por clique)", obj([WHO, f.area("text", "Fala"), f.text("tag", "Etiqueta", { placeholder: "pergunta, aprovado, erro…" }),
        f.more([f.text("method", "Método HTTP", { datalist: ["GET", "POST", "PUT", "PATCH", "DELETE"] }), f.text("url", "URL"), f.text("status", "Status da resposta"), f.area("code", "Código ou JSON", { mono: true, rows: 3 }), f.text("language", "Linguagem do código")])]),
        { addLabel: "Adicionar fala", newItem: () => ({ who: 1, text: "" }) }),
      f.more([f.num("keep", "Falas visíveis ao mesmo tempo")])],
    codewalk: [f.text("kicker", "Chapéu"), f.text("title", "Título"), ...CODE_SOURCE_FIELDS,
      f.list("steps", "Etapas da explicação", obj([f.text("title", "Título da etapa"), f.area("text", "Explicação"), f.nums("highlight", "Linhas destacadas (a partir de 1)"), f.area("output", "Saída esperada (simulação)", { mono: true, rows: 3 })]),
        { addLabel: "Adicionar etapa", newItem: () => ({ title: "Próximo passo", text: "", highlight: [1] }) }),
      f.more(CODE_SIZE_FIELDS)],
    spotlight: [f.action("Editar imagem e destaques", (s) => CTX.editScreenshot?.(s)), f.text("kicker", "Chapéu"), f.text("title", "Título"),
      f.text("caption", "Legenda"), f.bool("zoom", "Aproximar devagar de cada detalhe (zoom)"), f.more([f.text("image", "Imagem (arquivo ou link)"), f.list("hotspots", "Detalhes em foco", obj([f.select("kind", "Tipo", [["area", "Área"], ["point", "Ponto"]]), f.text("title", "Título do detalhe"), f.area("text", "Explicação"),
        f.num("x", "Posição horizontal (%)", { min: 0, max: 96 }), f.num("y", "Posição vertical (%)", { min: 0, max: 96 }),
        f.num("width", "Largura (%)", { min: 4, max: 100 }), f.num("height", "Altura (%)", { min: 4, max: 100 }), f.num("zoom", "Zoom neste detalhe (1 = imagem inteira)", { min: 1, max: 4 })]),
        { addLabel: "Adicionar detalhe", newItem: () => ({ title: "Novo detalhe", text: "", x: 10, y: 10, width: 30, height: 25 }) })]),
      f.more([f.el("figure", "Figura no lugar da imagem")])],
    decisionlab: [f.text("title", "Título"), f.obj("lab", "Premissas iniciais", [f.num("volume", "Número de decisões"), f.num("errorRate", "Erros da automação (%)"), f.num("reviewRate", "Casos revisados (%)"), f.num("catchRate", "Erros corrigidos (%)"), f.num("introducedRate", "Acertos estragados (%)"), f.num("seconds", "Segundos por revisão")])],
    infographic: [f.select("shape", "Forma", [["arco", "Arco (pílulas numeradas)"], ["ramos", "Ramos (cartões)"], ["lados", "Lados (ícones dos dois lados)"], ["trilhas", "Trilhas (objetivo e etapas)"], ["metro", "Metrô (linhas até cada item)"], ["ciclo", "Ciclo (etapas em volta, com setas)"]]),
      f.text("kicker", "Texto menor"), f.text("title", "Título"),
      f.obj("center", "Centro", [f.text("title", "Texto"), f.text("text", "Detalhe"), f.icon("icon", "Ícone")]),
      f.list("items", "Itens (2 a 8)", obj([f.text("title", "Título"), f.area("text", "Texto"), f.icon("icon", "Ícone"),
        f.list("steps", "Etapas seguintes (só na forma Trilhas)", obj([f.text("title", "Título"), f.area("text", "Texto"), f.icon("icon", "Ícone")]), { addLabel: "Adicionar etapa", newItem: () => ({ title: "Etapa" }), max: 3 })]),
        { addLabel: "Adicionar item", newItem: () => ({ title: "Novo item", text: "" }), max: 8 }),
      f.text("caption", "Legenda")],
    diagram: [f.text("kicker", "Texto menor"), f.text("title", "Título"), f.area("mermaid", "Diagrama (Mermaid: flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, mindmap…)", { mono: true, rows: 12 }), f.select("curve", "Ligações", [["curva", "Curvas"], ["angulo", "Em ângulo"], ["reta", "Retas"]], { empty: "Curvas" }), f.text("caption", "Legenda")],
    science: [f.action("Atualizar da planilha", () => CTX.refreshFrom?.(), { when: (s) => s.from?.file }), f.text("title", "Título"), f.list("equations", "Equações (até 5)", obj([f.text("label", "Legenda"), f.area("latex", "Equação em LaTeX", {mono:true, rows:2})]), {addLabel:"Adicionar equação", newItem:()=>({latex:"E = mc^2"}), max:5}), f.action("Adicionar gráfico", s=>{s.plot={functions:["a*sin(b*x)"]};CTX.commit(true);}, {when:s=>s.plot===false}), f.action("Remover gráfico", s=>{s.plot=false;CTX.commit(true);}, {when:s=>s.plot!==false}), f.plot("plot", "Gráfico", {when:s=>s.plot!==false}), f.text("caption", "Nota")],
    scenography: [f.select("scene", "Composição", [["stage","Palco e profundidade"],["floor","Chão em perspectiva"],["signs","Placas na cidade"],["terminal","Terminal hacker"],["cafe","Lousa de café"],["travel","Cartão de embarque"],["ticker","Pregão financeiro"],["marquee","Letreiro de cinema"],["blueprint","Planta técnica"],["magazine","Capa de revista"],["orbit","Órbita"],["synthwave","Neon anos 80"],["gallery","Parede de galeria"]]), f.area("title", "Texto no cenário", {rows:2}), f.text("kicker", "Texto menor"), f.text("subtitle", "Subtítulo"), f.text("caption", "Assinatura"), f.text("image", "Imagem de fundo (arquivo ou link)"), f.num("imageOpacity", "Transparência do fundo (0 a 1; padrão 0.85)", { placeholder: "0.85" }), f.text("foreground", "Recorte em primeiro plano (PNG transparente)"), f.num("titleSize", "Tamanho do texto (px)")],
    kinetic: [f.el("figure", "Cena de fundo"), f.list("beats", "Frases da sequência", obj([
      f.area("text", "Frase", { rows: 2 }),
      f.select("style", "Estilo tipográfico", [["clean", "Limpo"], ["poster", "Pôster"], ["editorial", "Editorial"], ["outline", "Contorno"], ["marker", "Marca-texto"]], { empty: "Limpo" }),
      f.select("position", "Posição", [["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"], ["top", "Alto"], ["bottom", "Baixo"]], { empty: "Variar automaticamente" }),
      f.select("color", "Cor", [["white", "Branco"], ["gold", "Dourado"], ["pink", "Rosa"], ["cyan", "Ciano"]], { empty: "Branco" }),
      f.select("size", "Escala", [["small", "Pequena"], ["medium", "Média"], ["large", "Grande"]], { empty: "Grande" }),
      f.text("tag", "Microlegenda (opcional)"),
    ]), { addLabel: "Adicionar frase", newItem: () => ({ text: "Nova frase" }) }),
      f.more([f.num("interval", "Tempo por frase (ms)", { min: 450, max: 5000, placeholder: "1000" }), f.bool("autoplay", "Reproduzir automaticamente", { default: true })])],
    blocks: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.els("content", "Blocos"), f.more([f.select("titleAs", "Estilo do título", TEXT_ROLES, { empty: "Título" })])],
    end: [f.text("kicker", "Chapéu"), f.area("title", "Título", { placeholder: "Obrigado." }), f.text("subtitle", "Subtítulo"), f.list("contacts", "Contatos", T, { addLabel: "Adicionar contato" }),
      f.text("qr", "QR code (link)", { hint: "Ex.: seu LinkedIn. Aparece ao lado, pronto para a câmera do celular." }), f.text("qrLabel", "Legenda do QR code"),
      f.el("figure", "Figura"), f.more([f.num("titleSize", "Tamanho do título (px)")])],
    references: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("items", "Referências", TA, { addLabel: "Adicionar referência" })],
    video: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.text("url", "Link do vídeo"), f.text("label", "Texto do botão", { placeholder: "Assistir" }), f.text("caption", "Legenda"), f.el("figure", "Figura")],
    canvas: [f.els("elements", "Elementos", { positioned: true })],
    headline: [f.text("kicker", "Chapéu"), f.area("text", "Frase"), f.text("caption", "Legenda"),
      f.more([f.select("as", "Estilo", TEXT_ROLES, { empty: "Enorme" }), f.num("size", "Tamanho máximo (px)")])],
    full: [f.area("image_prompt", "Imagem gerada pela IA (descreva a página)", { hint: "A IA gera a imagem que ocupa o slide inteiro." }),
      f.action("Gerar imagem agora", (s, btn) => CTX.generateImage?.(s, btn), { when: (s) => !s.image }),
      f.text("image", "…ou arquivo/link da imagem"), f.el("figure", "…ou uma figura (ícone, gráfico, diagrama)"), f.text("kicker", "Chapéu"), f.area("title", "Título por cima"), f.text("caption", "Legenda"),
      f.select("overlay", "Posição do texto", [["bottom", "Embaixo"], ["left", "À esquerda"], ["center", "No centro"], ["none", "Sem texto"]], { empty: "Automático" }),
      f.more([f.select("fit", "Enquadramento", [["cover", "Preencher"], ["contain", "Caber inteira"]]), f.num("titleSize", "Tamanho do título (px)")])],
    funnel: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("stages", "Etapas do funil", obj([f.text("title", "Etapa"), f.text("value", "Valor"), f.text("text", "Comentário"), f.bool("hl", "Destacar")]),
      { addLabel: "Adicionar etapa", newItem: () => ({ title: "Etapa", value: "" }) }), f.more([f.bool("build", "Uma por clique")])],
    pyramid: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.list("levels", "Níveis (do topo para a base)", obj([f.text("title", "Nível"), f.text("text", "Comentário"), f.bool("hl", "Destacar")]),
      { addLabel: "Adicionar nível", newItem: () => ({ title: "Nível" }) }), f.more([f.bool("build", "Um por clique")])],
    agenda: [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.num("current", "Seção atual (número)"),
      f.list("items", "Seções", obj([f.text("title", "Seção"), f.text("text", "Detalhe"), f.text("time", "Tempo")]), { addLabel: "Adicionar seção", newItem: () => ({ title: "Seção" }) }),
      f.more([f.bool("build", "Uma por clique")])],
    bento: [f.text("kicker", "Chapéu"), f.text("title", "Título"),
      f.list("tiles", "Blocos", obj([f.text("title", "Título"), f.text("value", "Número grande"), f.area("text", "Texto"), f.icon("icon", "Ícone"),
        f.select("size", "Tamanho", [["big", "Grande (2×2)"], ["wide", "Largo (2×1)"], ["tall", "Alto (1×2)"]], { empty: "Normal" }), f.bool("hl", "Destacar"),
        f.more([f.el("figure", "Figura (no lugar do ícone)")])]), { addLabel: "Adicionar bloco", newItem: () => ({ title: "Bloco", icon: "star" }) }),
      f.more([f.num("cols", "Colunas"), f.bool("build", "Um por clique")])],
  };
  const SLIDE_RESERVED = new Set(["layout", "tone", "deco", "notes", "consulta", "time", "auto", "density", "visualEdits", "from", "fiscalOk", "uid", "review", "original"]); // uid: identidade do slide; review/original: revisão e origem (importação) // from: de que planilha veio o gráfico (Atualizar da planilha)

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
      fields: [f.action("Escolher minha foto", (e) => CTX.chooseImage?.(e)),
        f.action("Criar imagem pelo conteúdo do slide", (e) => CTX.imageChat?.(e)),
        f.text("image", "Arquivo ou link"), f.area("image_prompt", "Descrição para a IA gerar", { hint: "Descreva a nova imagem. A geração substitui a foto e preserva sua posição." }),
        f.action("Gerar imagem agora", (e, btn) => CTX.generateImage?.(e, btn)),
        f.select("fit", "Enquadramento", [["cover", "Preencher"], ["contain", "Caber inteira"]]), f.text("alt", "Texto alternativo"), f.num("radius", "Cantos (px)")] },
    { id: "chart", label: "Gráfico", is: (e) => e.chart, tpl: () => ({ chart: "bar", data: [{ label: "A", value: 10 }, { label: "B", value: 20 }] }), chart: true },
    { id: "ufmap", label: "Mapa por UF", is: (e) => e.ufmap, tpl: () => ({ ufmap: { SP: 30, RJ: 15, MG: 18 } }),
      fields: [f.json("ufmap", "Valores por UF", { placeholder: '{ "SP": 120, "RJ": 80 }', hint: "Sigla da UF e o valor; a cor mais forte é o maior." }),
        f.text("prefix", "Antes do valor"), f.text("suffix", "Depois do valor"), f.list("highlight", "Destacar UFs", T, { addLabel: "Adicionar UF" }), f.text("legend", "Legenda"),
        f.bool("showValues", "Mostrar os valores")] },
    { id: "diagram", label: "Diagrama", is: (e) => e.diagram, tpl: () => ({ diagram: "flow", steps: ["Início", "Meio", "Fim"] }),
      fields: [f.select("diagram", "Tipo", [["flow", "Fluxo"], ["loop", "Ciclo"], ["spectrum", "Espectro"], ["venn", "Venn"]]),
        f.list("steps", "Etapas", T, { when: (e) => e.diagram === "flow" }), f.num("highlight", "Etapa destacada", { when: (e) => e.diagram === "flow" }),
        f.list("nodes", "Pontos do ciclo", T, { when: (e) => e.diagram === "loop" }), f.select("actor", "Pessoa no ciclo", [["in", "Dentro"], ["on", "No ciclo"], ["out", "Fora"]], { when: (e) => e.diagram === "loop" }),
        f.list("stops", "Pontos do espectro", T, { when: (e) => e.diagram === "spectrum" }), f.text("left", "Extremo esquerdo", { when: (e) => e.diagram === "spectrum" }), f.text("right", "Extremo direito", { when: (e) => e.diagram === "spectrum" }),
        f.num("at", "Posição marcada", { when: (e) => e.diagram === "loop" || e.diagram === "spectrum" }),
        f.text("a", "Conjunto A", { when: (e) => e.diagram === "venn" }), f.text("b", "Conjunto B", { when: (e) => e.diagram === "venn" }), f.text("both", "Interseção", { when: (e) => e.diagram === "venn" })] },
    { id: "qr", label: "QR code", is: (e) => e.qr, tpl: () => ({ qr: "https://", size: 360, label: "Aponte a câmera" }),
      fields: [f.text("qr", "Link ou texto", { hint: "Ex.: seu LinkedIn — https://linkedin.com/in/voce" }), f.text("label", "Legenda"), f.num("size", "Tamanho (px)")] },
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
    { id: "aviso", label: "Aviso", is: (e) => e.aviso,
      tpl: () => ({ aviso: { tipo: "dica", titulo: "Dica", texto: "Texto do aviso" } }),
      fields: [f.obj("aviso", "Aviso", [f.select("tipo", "Tipo", [["importante", "Importante"], ["atencao", "Atenção"], ["dica", "Dica"], ["perigo", "Perigo"]]), f.text("titulo", "Título"), f.area("texto", "Texto")])] },
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
      "progress", "tags", "rating", "code", "shape", "badge", "aviso", "video", "widget", "html", "spacer"];
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
    bar: [f.sheet("Dados"), f.text("suffix", "Unidade"), f.num("max", "Máximo"), f.nums("highlight", "Destacar (posições)")],
    column: [f.sheet("Dados"), f.text("suffix", "Unidade"), f.num("max", "Máximo"), f.nums("highlight", "Destacar (posições)")],
    stacked: [f.sheet("Dados", { single: true }), f.text("suffix", "Unidade")],
    line: [f.sheet("Dados", { multi: true }),
      f.num("min", "Mínimo"), f.num("max", "Máximo"), f.nums("ticks", "Marcas do eixo (valores)"), f.text("suffix", "Unidade"), f.bool("area", "Preencher área"), f.bool("markers", "Marcadores", { default: true }), f.bool("axis", "Eixo", { default: true }),
      f.list("bands", "Faixas", obj([f.num("at", "Posição"), f.text("text", "Texto")]), { newItem: () => ({ at: 0, text: "Faixa" }) }),
      f.list("annotations", "Anotações", obj([f.num("at", "Posição"), f.text("text", "Texto")]), { newItem: () => ({ at: 0, text: "Nota" }) })],
    donut: [f.num("value", "Valor (%)"), f.text("center", "Texto no centro"), f.sheet("Partes (no lugar do valor)", { single: true, key: "parts" })],
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

  function renderField(o, spec, path, controls) {
    if (spec.when && !spec.when(o)) return null;
    switch (spec.type) {
      case "text": case "textarea": {
        const node = textField(o, spec);
        if (spec.k) controls?.set(spec.k, node);
        return node;
      }
      case "number": return numberField(o, spec);
      case "bool": return boolField(o, spec);
      case "select": return selectField(o, spec);
      case "codeLanguage": return codeLanguageField(o, spec, controls?.get(spec.filenameKey));
      case "color": return textField(o, { ...spec, datalist: COLOR_ROLES, placeholder: spec.placeholder || "fg, hi, em… ou #hex" });
      case "icon": return iconField(o, spec);
      case "nums": return numsField(o, spec);
      case "pair": return pairField(o, spec);
      case "list": return listField(o, spec, path);
      case "object": return objectField(o, spec, path);
      case "element": return elementField(o, spec, path);
      case "elements": return elementsField(o, spec, path);
      case "chart": return chartField(o, spec, path);
      case "plot": return plotField(o, spec);
      case "sheet": return sheetField(o, spec);
      case "tablegrid": return tableGridField(o, spec);
      case "linemap": return lineMapField(o, spec);
      case "photo": return photoField(o, spec);
      case "json": return jsonField(o, spec);
      case "more": return moreGroup(o, spec.fields, path + ".more");
      case "action": {
        const b = h("button", { class: "btn btn-secondary sf-action", type: "button" }, spec.label);
        b.onclick = () => spec.run(o, b);
        return b;
      }
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

  // estrutura (corpo de requisição, polling…) como JSON: só aplica quando é JSON válido; vazio apaga o campo
  function jsonField(o, spec) {
    const text = o[spec.k] == null ? "" : JSON.stringify(o[spec.k], null, 2);
    const ta = h("textarea", { class: "form-control mono", rows: spec.rows || Math.min(10, Math.max(3, text.split("\n").length)), placeholder: spec.placeholder, spellcheck: "false" });
    ta.value = text;
    const err = h("div", { class: "sf-hint sf-error" });
    ta.addEventListener("input", () => {
      const v = ta.value.trim();
      try {
        setKey(o, spec.k, v ? JSON.parse(v) : null);
        ta.classList.remove("invalid"); err.textContent = ""; commitSoon();
      } catch { ta.classList.add("invalid"); err.textContent = "JSON inválido — não aplicado"; }
    });
    ta.addEventListener("change", () => { if (!ta.classList.contains("invalid")) commitNow(); });
    return fieldWrap(spec, h("div", { class: "sf-ctl" }, ta, err));
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
    // "padrão" com o mesmo texto de uma opção (ex.: Síncrono): essa opção É o padrão, aparece uma vez só e escolhê-la
    // tira o campo do YAML
    const dflt = spec.empty ? spec.options.find(([, l]) => l === spec.empty)?.[0] : undefined;
    const opts = spec.options.map(([v, l]) => h("option", { value: v === dflt ? "" : v, text: l }));
    const sel = h("select", { class: "form-control" }, ...(spec.empty === false || dflt !== undefined ? [] : [h("option", { value: "", text: spec.empty || "—" })]), opts);
    const cur0 = o[spec.k] ?? spec.default;
    const cur = cur0 != null && String(cur0) === String(dflt) ? null : cur0;
    sel.value = cur == null ? "" : String(cur);
    if (cur != null && sel.value !== String(cur)) { // valor fora da lista: mostra mesmo assim
      sel.append(h("option", { value: String(cur), text: String(cur) }));
      sel.value = String(cur);
    }
    // structural: outros campos dependem deste (when), então o formulário se refaz
    sel.addEventListener("change", () => { setKey(o, spec.k, spec.parse ? spec.parse(sel.value) : sel.value); (spec.structural ? commitStructure : commitNow)(); });
    return fieldWrap(spec, sel);
  }

  function inferCodeLanguage(filename) {
    const basename = String(filename || "").trim().split(/[\\/]/).pop() || "";
    const dot = basename.lastIndexOf(".");
    if (dot <= 0) return "";
    const extension = basename.slice(dot).toLowerCase();
    return ({ ".py": "Python", ".pyw": "Python", ".java": "Java", ".js": "JavaScript", ".jsx": "JavaScript",
      ".mjs": "JavaScript", ".cjs": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript",
      ".cts": "TypeScript", ".cs": "C#" })[extension] || "";
  }

  function normalizeCodeLanguage(language) {
    const key = String(language || "").trim().toLowerCase().replace(/[\s._-]/g, "");
    return ({ python: "Python", py: "Python", java: "Java", javascript: "JavaScript", js: "JavaScript",
      node: "JavaScript", nodejs: "JavaScript", typescript: "TypeScript", ts: "TypeScript",
      "c#": "C#", csharp: "C#", cs: "C#" })[key] || "";
  }

  function codeLanguageField(o, spec, filenameField) {
    const options = ["Python", "Java", "JavaScript", "TypeScript", "C#"];
    const autoOption = h("option", { value: "", text: "Inferir pela extensão" });
    const select = h("select", { class: "form-control" }, autoOption, options.map((language) => h("option", { value: language, text: language })));
    const detect = () => inferCodeLanguage(o[spec.filenameKey]);
    const initialLanguage = normalizeCodeLanguage(o[spec.k]);
    let automatic = !initialLanguage || initialLanguage === detect();
    select.value = automatic ? detect() : initialLanguage;
    const updateAutoLabel = () => {
      const language = detect();
      autoOption.textContent = language ? `Inferir pela extensão · ${language}` : "Inferir pela extensão";
    };
    updateAutoLabel();

    const filenameInput = filenameField?.querySelector("input, textarea");
    filenameInput?.addEventListener("input", () => {
      if (!automatic) return;
      const language = inferCodeLanguage(filenameInput.value);
      select.value = language;
      setKey(o, spec.k, language || null);
      updateAutoLabel();
    });
    select.addEventListener("change", () => {
      automatic = !select.value;
      setKey(o, spec.k, select.value || null);
      updateAutoLabel();
      (spec.structural ? commitStructure : commitNow)();
    });
    return fieldWrap({ ...spec, hint: "Detectada pela extensão do arquivo; você pode escolher outra linguagem." }, select);
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
    // atalho em texto (ex.: problem: "Leva 2 semanas") vira { text: … } sem perder o conteúdo
    if (typeof o[spec.k] === "string" && spec.stringAs) o[spec.k] = { [spec.stringAs]: o[spec.k] };
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

  // ---- planilha do gráfico de dados: Rótulo + uma coluna por série; cola do Excel como no Excel ----
  // Uma série: data: [{label, value}] (ou parts, na rosca). Várias: labels + series [{name, values}] (linhas, barras e
  // colunas agrupadas). Colar em qualquer célula preenche a partir dela; a primeira linha com texto vira o nome das séries.
  const cellNum = (c) => {
    const t = String(c ?? "").trim().replace(/\s/g, "").replace(/^R\$/, "").replace(/%$/, "");
    if (!t) return null;
    const n = Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };
  const parseCells = (text) => {
    const lines = String(text ?? "").replace(/\r/g, "").split("\n");
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    const sep = lines.some((l) => l.includes("\t")) ? "\t" : lines.some((l) => l.includes(";")) ? ";" : ",";
    return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1")));
  };
  function sheetRead(c, spec) {
    const key = spec.key || "data";
    if (Array.isArray(c.series) && Array.isArray(c.labels) && !spec.single)
      return { names: c.series.map((x, i) => x.name ?? `Série ${i + 1}`), rows: c.labels.map((l, i) => [String(l ?? ""), ...c.series.map((x) => x.values?.[i] ?? null)]), colors: c.series.map((x) => x.color) };
    const d = (Array.isArray(c[key]) ? c[key] : []).map((x) => (typeof x === "number" ? { label: "", value: x } : x || {}));
    return { names: [spec.single ? "Valor" : c.seriesName || "Valor"], rows: d.map((x) => [String(x.label ?? ""), x.value ?? null]), colors: [], itemColors: d.map((x) => x.color) };
  }
  function sheetWrite(c, spec, t) {
    const key = spec.key || "data";
    const rows = t.rows.filter((r) => String(r[0] ?? "").trim() || r.slice(1).some((v) => v != null));
    const multi = !spec.single && (spec.multi || t.names.length > 1);
    delete c.data; delete c.parts; delete c.values;
    if (multi) {
      c.labels = rows.map((r) => r[0]);
      c.series = t.names.map((name, j) => ({ name, values: rows.map((r) => r[j + 1] ?? null), ...(t.colors?.[j] ? { color: t.colors[j] } : {}) }));
    } else {
      delete c.labels; delete c.series;
      c[key] = rows.map((r, i) => ({ label: r[0], value: r[1] ?? 0, ...(t.itemColors?.[i] ? { color: t.itemColors[i] } : {}) }));
    }
  }
  // Tabela de texto como no Excel: a primeira linha é o cabeçalho; Enter/setas andam; a última linha em branco cria a
  // próxima; colar do Excel (tab) ou de um CSV preenche a partir da célula; + coluna, − linha/coluna
  function tableGridField(o, spec) {
    const cols = Math.max(1, (o.head || []).length, ...(o.rows || []).map((r) => (Array.isArray(r) ? r.length : 0)));
    const grid = [[...(o.head || [])], ...(o.rows || []).map((r) => (Array.isArray(r) ? [...r] : [r]))].map((r) => Array.from({ length: cols }, (_, j) => (r[j] == null ? "" : String(r[j]))));
    if (!grid.length) grid.push(Array(cols).fill(""));
    grid.push(Array(cols).fill(""));
    const wrapEl = h("div", { class: "sf-sheet-wrap sf-tgrid" });
    const save = (structure) => {
      const rows = grid.filter((r, i) => i === 0 || r.some((v) => String(v).trim()));
      o.head = rows[0];
      o.rows = rows.slice(1).map((r) => r.map((v) => (/^-?\d+([.,]\d+)?$/.test(String(v).trim()) && !/^0\d/.test(String(v).trim()) ? String(v).trim() : v)));
      if (!o.head.some((v) => String(v).trim())) delete o.head;
      structure ? commitStructure() : commitSoon();
    };
    const focusCell = (i, j) => { const el = wrapEl.querySelector(`[data-tcell="${i},${j}"]`); if (el) { el.focus(); el.select(); } };
    const draw = () => {
      const n = grid[0].length;
      const top = h("tr", {}, ...grid[0].map((_, j) => h("th", { class: "sf-sheet-act" }, n > 1 ? h("button", { class: "icon-btn icon-btn-sm", type: "button", title: `Remover a coluna ${j + 1}`, onclick: () => { grid.forEach((r) => r.splice(j, 1)); save(true); draw(); } }, icon("x")) : null)),
        h("th", { class: "sf-sheet-act" }, h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Adicionar coluna", "data-tgrid-addcol": "", onclick: () => { grid.forEach((r) => r.push("")); save(true); draw(); } }, icon("plus"))));
      const body = grid.map((r, i) => h("tr", { class: i === 0 ? "sf-tgrid-head" : "" }, ...r.map((v, j) => {
        const inp = h("input", { class: "sf-sheet-in", value: v, "data-tcell": `${i},${j}`, "aria-label": i === 0 ? `Título da coluna ${j + 1}` : `Linha ${i}, coluna ${j + 1}`, placeholder: i === 0 ? `Coluna ${j + 1}` : "", spellcheck: "false" });
        inp.addEventListener("input", () => {
          r[j] = inp.value;
          if (i === grid.length - 1 && inp.value.trim()) { grid.push(Array(r.length).fill("")); save(false); draw(); const el = wrapEl.querySelector(`[data-tcell="${i},${j}"]`); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); return; }
          save(false);
        });
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); focusCell(i + 1, j); }
          else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(i - 1, j); }
        });
        inp.addEventListener("paste", (e) => {
          const text = e.clipboardData?.getData("text/plain") || "";
          if (!/[\t\n;]/.test(text)) return;
          const cells = parseCells(text);
          if (!cells.length) return;
          e.preventDefault();
          const need = j + Math.max(...cells.map((c) => c.length));
          grid.forEach((row) => { while (row.length < need) row.push(""); });
          cells.forEach((c, k) => { while (grid.length <= i + k + 1) grid.push(Array(grid[0].length).fill("")); c.forEach((val, q) => { grid[i + k][j + q] = String(val ?? ""); }); });
          save(true); draw();
        });
        return h("td", {}, inp);
      }), h("td", { class: "sf-sheet-act" }, i > 0 && grid.length > 2 ? h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Remover linha", onclick: () => { grid.splice(i, 1); save(true); draw(); } }, icon("trash-2")) : null)));
      wrapEl.replaceChildren(h("table", { class: "sf-sheet" }, h("thead", {}, top), h("tbody", {}, body)));
      CTX.hydrate?.(wrapEl);
    };
    draw();
    return fieldWrap(spec, wrapEl, "sf-sheet-field");
  }

  function sheetField(c, spec) {
    const t = sheetRead(c, spec);
    t.rows.push(["", ...t.names.map(() => null)]); // sempre uma linha em branco no fim: digitar nela cria a próxima
    const canMulti = !spec.single;
    const wrapEl = h("div", { class: "sf-sheet-wrap" });
    const status = h("div", { class: "sf-hint", "data-sheet-status": "" });
    const save = (structure) => { sheetWrite(c, spec, t); structure ? commitStructure() : commitSoon(); };
    const draw = () => {
      const width = t.names.length + 1;
      t.rows.forEach((r) => { while (r.length < width) r.push(null); r.length = width; });
      const head = h("tr", {}, h("th", { class: "sf-sheet-corner", text: "Rótulo" }), ...t.names.map((name, j) => {
        const inp = h("input", { class: "sf-sheet-in sf-sheet-name", value: name, "aria-label": `Nome da série ${j + 1}`, "data-sheet-name": String(j), spellcheck: "false" });
        inp.addEventListener("input", () => { t.names[j] = inp.value; save(false); });
        const del = t.names.length > 1 ? h("button", { class: "icon-btn icon-btn-sm", type: "button", title: `Remover a série ${name}`, onclick: () => { t.names.splice(j, 1); t.colors?.splice(j, 1); t.rows.forEach((r) => r.splice(j + 1, 1)); save(true); } }, icon("x")) : null;
        return h("th", {}, h("div", { class: "sf-sheet-th" }, inp, del));
      }), h("th", { class: "sf-sheet-act" }));
      const body = t.rows.map((r, i) => h("tr", {}, ...r.map((v, j) => {
        const inp = h("input", { class: `sf-sheet-in${j ? " num" : ""}`, value: v == null ? "" : j ? String(v).replace(".", ",") : v, "aria-label": j ? `${t.names[j - 1]}, linha ${i + 1}` : `Rótulo da linha ${i + 1}`, "data-cell": `${i},${j}`, spellcheck: "false", inputmode: j ? "decimal" : "text" });
        inp.addEventListener("input", () => {
          if (j === 0) r[0] = inp.value;
          else { const n = cellNum(inp.value); inp.classList.toggle("invalid", Number.isNaN(n)); if (Number.isNaN(n)) return; r[j] = n; }
          if (i === t.rows.length - 1 && inp.value.trim()) { t.rows.push(Array(r.length).fill(null)); t.rows.at(-1)[0] = ""; save(false); draw(); focusCell(i, j, false); return; }
          save(false);
        });
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); focusCell(i + 1, j); }
          else if (e.key === "ArrowDown") { e.preventDefault(); focusCell(i + 1, j); }
          else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(i - 1, j); }
        });
        return h("td", {}, inp);
      }), h("td", { class: "sf-sheet-act" }, t.rows.length > 1 ? h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Remover linha", onclick: () => { t.rows.splice(i, 1); save(true); } }, icon("trash-2")) : null)));
      const table = h("table", { class: "sf-sheet" }, h("thead", {}, head), h("tbody", {}, body));
      wrapEl.replaceChildren(table);
      CTX.hydrate?.(wrapEl);
    };
    const focusCell = (i, j, select = true) => { const el = wrapEl.querySelector(`[data-cell="${i},${j}"]`); if (!el) return; el.focus(); if (select) el.select(); else el.setSelectionRange(el.value.length, el.value.length); };
    // colar do Excel: a partir da célula onde a pessoa colou (no cabeçalho, com nomes das séries)
    const paste = (text, i0, j0) => {
      const cells = parseCells(text);
      if (!cells.length) return false;
      let start = 0;
      const valueCols = cells[0].slice(j0 === 0 ? 1 : 0);
      if (i0 === 0 && valueCols.length && valueCols.every((v) => v === "" || Number.isNaN(cellNum(v)) || cellNum(v) == null) && cells.length > 1) {
        // primeira linha é cabeçalho: nomes das séries
        const names = valueCols.map((v, k) => v || `Série ${k + 1}`);
        const need = (j0 === 0 ? 0 : j0 - 1) + names.length;
        if (canMulti) while (t.names.length < need) t.names.push(`Série ${t.names.length + 1}`);
        names.forEach((n, k) => { const at = (j0 === 0 ? 0 : j0 - 1) + k; if (at < t.names.length) t.names[at] = n; });
        start = 1;
      }
      const body = cells.slice(start);
      const width = Math.max(...body.map((r) => r.length));
      const needCols = j0 + width - 1;
      if (canMulti) while (t.names.length < needCols) t.names.push(`Série ${t.names.length + 1}`);
      let dropped = 0;
      body.forEach((row, k) => {
        const i = i0 + k;
        while (t.rows.length <= i) t.rows.push(Array(t.names.length + 1).fill(null).map((v, q) => (q ? null : "")));
        row.forEach((val, q) => {
          const j = j0 + q;
          if (j > t.names.length) { dropped++; return; }
          if (j === 0) t.rows[i][0] = val;
          else { const n = cellNum(val); t.rows[i][j] = Number.isNaN(n) ? null : n; }
        });
      });
      // valores com % colados e sem unidade: a unidade vira %
      if (!c.suffix && /%/.test(text) && spec.key !== "parts") c.suffix = "%";
      t.rows = t.rows.filter((r, idx) => idx === t.rows.length - 1 || String(r[0] ?? "").trim() || r.slice(1).some((v) => v != null));
      if (String(t.rows.at(-1)[0] ?? "").trim() || t.rows.at(-1).slice(1).some((v) => v != null)) t.rows.push(Array(t.names.length + 1).fill(null).map((v, q) => (q ? null : "")));
      status.textContent = dropped ? `Este tipo de gráfico usa uma coluna de valores: ${dropped} célula(s) ficaram de fora. Linhas ou Colunas aceitam várias séries.` : `Colado: ${body.length} linha(s).`;
      save(true);
      return true;
    };
    wrapEl.addEventListener("paste", (e) => {
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!/[\t\n;]/.test(text.trim())) return; // um valor só: cola normal na célula
      const cell = e.target.closest("[data-cell]"), name = e.target.closest("[data-sheet-name]");
      const [i0, j0] = cell ? cell.dataset.cell.split(",").map(Number) : name ? [0, Number(name.dataset.sheetName) + 1] : [0, 0];
      e.preventDefault();
      paste(text, i0, j0);
    });
    draw();
    const file = h("input", { type: "file", accept: ".csv,.tsv,.txt,text/csv", hidden: true });
    file.addEventListener("change", async () => {
      const text = await file.files[0]?.text(); if (text == null) return;
      t.rows = [["", null]]; t.names = [t.names[0] || "Valor"];
      paste(text, 0, 0);
    });
    const tools = h("div", { class: "sf-sheet-tools" },
      canMulti ? h("button", { class: "btn btn-small", type: "button", "data-sheet-add-series": "", onclick: () => { t.names.push(`Série ${t.names.length + 1}`); t.rows.forEach((r) => r.push(null)); save(true); } }, icon("plus"), " Série") : null,
      h("button", { class: "btn btn-small", type: "button", onclick: () => file.click() }, icon("upload"), " Importar CSV"), file);
    return fieldWrap({ label: spec.label, hint: "Copie as células no Excel (ou Google Planilhas) e cole aqui com Ctrl+V. A primeira coluna é o rótulo; cada coluna de números é uma série." }, h("div", { class: "sf-ctl" }, wrapEl, tools, status));
  }

  // ---- foto de um item (carrossel): miniatura + Escolher foto; sem foto, o slide usa uma de demonstração ----
  function photoField(o, spec) {
    const cur = o[spec.k];
    const thumb = cur ? h("img", { class: "sf-photo-thumb", src: /^(data:|https?:)/.test(cur) ? cur : "", alt: "" }) : h("span", { class: "sf-photo-empty", text: "de demonstração" });
    const pick = h("button", { class: "btn btn-small", type: "button", "data-photo-pick": "", onclick: () => CTX.chooseImage?.(o) }, icon("image"), cur ? " Trocar foto" : " Escolher foto");
    const clear = cur ? h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Voltar para a foto de demonstração", onclick: () => { delete o[spec.k]; delete o.alt; commitStructure(); } }, icon("trash-2")) : null;
    return fieldWrap(spec, h("div", { class: "sf-ctl sf-photo" }, thumb, pick, clear));
  }

  // ---- linhas de um arquivo: {2: "texto", 5: null} editado como "2: texto" por linha; ours/theirs/both passam direto ----
  function lineMapField(o, spec) {
    const cur = o[spec.k];
    const toText = (v) => (typeof v === "string" ? v : v && typeof v === "object" ? Object.entries(v).map(([n, t]) => `${n}: ${t === null ? "(apagar)" : t}`).join("\n") : "");
    const ta = h("textarea", { class: "form-control mono", rows: 2, spellcheck: "false", placeholder: "2: novo texto da linha 2" });
    ta.value = toText(cur);
    const err = h("div", { class: "sf-hint sf-error" });
    ta.addEventListener("input", () => {
      const raw = ta.value.trim();
      if (!raw) { delete o[spec.k]; err.textContent = ""; commitSoon(); return; }
      if (/^(ours|theirs|both)$/i.test(raw)) { o[spec.k] = raw.toLowerCase(); err.textContent = ""; commitSoon(); return; }
      const map = {}, bad = [];
      raw.split("\n").forEach((l) => { const m = l.match(/^\s*(\d+)\s*:\s?(.*)$/); if (!m) { if (l.trim()) bad.push(l.trim()); return; } map[m[1]] = /^\(apagar\)$/i.test(m[2].trim()) ? null : m[2]; });
      err.textContent = bad.length ? `Use o número da linha e dois pontos: 2: texto ("${bad[0]}")` : "";
      if (!bad.length) { o[spec.k] = map; commitSoon(); }
    });
    ta.addEventListener("change", () => { if (!err.textContent) commitNow(); });
    return fieldWrap(spec, h("div", { class: "sf-ctl" }, ta, err));
  }

  // ---- gráfico de fórmulas (slide science): escreve a*sin(b*x) e plota; cada letra vira controle deslizante ----
  const PLOT_PRESETS = { wave: { functions: ["sin(x)"], x: [-6.3, 6.3] }, parabola: { functions: ["x^2"], x: [-4, 4] }, surface: { surface: "sin(sqrt(x^2+y^2))", x: [-4, 4] } };
  function plotField(o, spec) {
    if (!o[spec.k] || typeof o[spec.k] !== "object") o[spec.k] = {};
    const pl = o[spec.k];
    // exemplo antigo (preset) vira fórmula editável
    if (pl.preset && PLOT_PRESETS[pl.preset]) { const pre = PLOT_PRESETS[pl.preset]; delete pl.preset; for (const [k, v] of Object.entries(pre)) if (pl[k] == null) pl[k] = v; }
    const F = window.SagaFormula;
    const check = (src, vars) => { try { return { params: F.compile(src, vars).params }; } catch (e) { return { error: e.message }; } };
    const box = h("fieldset", { class: "sf-object sf-plot" }, h("legend", { text: spec.label }));
    pl.functions = [].concat(pl.functions ?? []).map((x) => (typeof x === "string" ? x : x?.fn ?? ""));
    // fórmulas: uma por linha; o erro aparece embaixo enquanto digita
    const list = h("div", { class: "sf-plot-fns" });
    const drawFns = () => {
      list.replaceChildren(...pl.functions.map((src, i) => {
        const input = h("input", { type: "text", class: "form-control mono", placeholder: "a*sin(b*x)", spellcheck: "false", "aria-label": `Fórmula ${i + 1}`, "data-plot-fn": String(i) });
        input.value = src;
        const err = h("div", { class: "sf-hint sf-error" });
        const validate = () => { const r = input.value.trim() ? check(input.value, ["x"]) : {}; err.textContent = r.error ? `Não entendi: ${r.error}` : ""; input.classList.toggle("invalid", !!r.error); return r; };
        validate();
        input.addEventListener("input", () => { pl.functions[i] = input.value; if (!validate().error) commitSoon(); });
        // ao sair do campo: letra nova vira controle deslizante (o formulário se refaz)
        input.addEventListener("change", () => { pl.functions = pl.functions.filter((x) => x.trim()); commitStructure(); });
        const del = h("button", { class: "icon-btn icon-btn-sm", type: "button", title: "Remover fórmula", onclick: () => { pl.functions.splice(i, 1); commitStructure(); } }, icon("trash-2"));
        return h("div", { class: "sf-plot-fn" }, h("span", { class: "sf-plot-y mono", text: "y =" }), input, del, err);
      }));
      CTX.hydrate?.(list);
    };
    drawFns();
    const add = h("button", { class: "btn btn-small", type: "button", "data-plot-add": "", onclick: () => { pl.functions.push(""); drawFns(); list.lastElementChild?.querySelector("input")?.focus(); } }, icon("plus"), " Adicionar fórmula");
    box.append(fieldWrap({ label: "Fórmulas", hint: "Ex.: a*sin(b*x), x^2 - 2x + 1, e^(-x^2). Letra que não é x vira controle deslizante na apresentação." }, h("div", { class: "sf-ctl" }, list, add)));
    const range = pairField(pl, { k: "x", label: "Intervalo de x", labels: ["de (-10)", "até (10)"] });
    range.addEventListener("input", () => { if (Array.isArray(pl.x)) pl.x = pl.x.map((v) => (String(v).trim() === "" ? "" : Number(String(v).replace(",", ".")))); });
    box.append(range);
    // parâmetros: os que aparecem nas fórmulas; valor inicial, mínimo, máximo e nome
    const names = new Set();
    pl.functions.forEach((src) => { if (src.trim()) (check(src, ["x"]).params || []).forEach((n) => names.add(n)); });
    if (String(pl.surface || "").trim()) (check(pl.surface, ["x", "y"]).params || []).forEach((n) => names.add(n));
    if (names.size) {
      if (!pl.params || typeof pl.params !== "object") pl.params = {};
      const rows = [...names].map((n) => {
        const cur = typeof pl.params[n] === "number" ? { value: pl.params[n] } : pl.params[n] || {};
        const cell = (k, ph) => {
          const input = h("input", { type: "text", inputmode: k === "label" ? "text" : "decimal", class: "form-control", placeholder: ph, "aria-label": `${n}: ${k}`, "data-plot-param": `${n}.${k}` });
          input.value = cur[k] ?? "";
          input.addEventListener("input", () => {
            const raw = input.value.trim();
            const v = raw === "" ? null : k === "label" ? raw : Number(raw.replace(",", "."));
            const p = (pl.params[n] = pl.params[n] && typeof pl.params[n] === "object" ? pl.params[n] : {});
            if (v == null || Number.isNaN(v)) delete p[k]; else p[k] = v;
            if (!Object.keys(p).length) delete pl.params[n];
            if (!Object.keys(pl.params).length) delete pl.params;
            commitSoon();
          });
          return input;
        };
        return h("tr", {}, h("th", { class: "mono", text: n }), h("td", {}, cell("value", "1")), h("td", {}, cell("min", "-5")), h("td", {}, cell("max", "5")), h("td", {}, cell("label", "nome")));
      });
      box.append(fieldWrap({ label: "Controles deslizantes" }, h("table", { class: "sf-plot-params" },
        h("thead", {}, h("tr", {}, ["", "Valor", "Mín.", "Máx.", "Nome"].map((t) => h("th", { text: t })))), h("tbody", {}, rows))));
    }
    // pontos: colar do Excel (x e y), CSV, ou o nome de um arquivo .csv ao lado do deck
    const pts = h("textarea", { class: "form-control mono", rows: 4, placeholder: "Cole do Excel: coluna x e coluna y", spellcheck: "false", "data-plot-points": "" });
    pts.value = Array.isArray(pl.points) ? pl.points.map((q) => (Array.isArray(q) ? q : [q.x, q.y]).join("\t")).join("\n") : pl.points ?? "";
    pts.addEventListener("input", () => { setKey(pl, "points", pts.value.trim() ? pts.value : null); commitSoon(); });
    const file = h("input", { type: "file", accept: ".csv,.tsv,.txt,text/csv", hidden: true });
    file.addEventListener("change", async () => { const t = await file.files[0]?.text(); if (t != null) { pts.value = t; setKey(pl, "points", t); commitNow(); } });
    box.append(fieldWrap({ label: "Pontos medidos (opcional)", hint: "Aparecem como bolinhas junto das curvas. Também aceita o nome de um arquivo ao lado do deck, como dados/medidas.csv." },
      h("div", { class: "sf-ctl" }, pts, h("button", { class: "btn btn-small", type: "button", onclick: () => file.click() }, icon("upload"), " Importar CSV"), file)));
    box.append(moreGroup(pl, [f.text("surface", "Superfície 3D: z =", { placeholder: "sin(x)*cos(y)", hint: "Usa x e y no mesmo intervalo; troca as curvas por uma superfície que gira." }),
      f.pair("y", "Eixo y fixo", ["de", "até"]), f.text("pointsName", "Nome dos pontos"),
      f.json("data", "Dados Plotly (avançado)", { hint: "Array de traces Plotly: substitui fórmulas e pontos." }), f.json("layout", "Eixos e aparência Plotly (avançado)")], "slide.plot.more"));
    return box;
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
    const controls = new Map();
    for (const spec of fields) {
      const node = renderField(o, spec, path, controls);
      if (!node) continue;
      if (spec.k) controls.set(spec.k, node);
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
    if (["code", "codewalk", "api"].includes(layout)) container.append(renderFields(slide, [f.select("density", "Densidade técnica", [["comfortable","Confortável"],["compact","Compacta"],["dense","Mais conteúdo"]], {empty:false, default:"comfortable"})], "slide.density"));
    const own = fields.find((s) => s.type === "more")?.fields || [];
    const ownKeys = schemaKeys(own);
    container.append(moreGroup(slide, [...own, ...COMMON_MORE.filter((s) => !ownKeys.has(s.k))], "slide.more"));
    const used = new Set([...schemaKeys(fields), ...schemaKeys(COMMON_MORE), ...SLIDE_RESERVED]);
    const extra = genericFields(slide, used, "slide.other", "Campos que este layout não usa ou que o editor ainda não conhece. Continuam no YAML.");
    if (extra) container.append(extra);
  }

  window.SlideForm = { render, LAYOUTS, ELEMENT_KINDS };
})();
