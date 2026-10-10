// Formulário do slide de mapa (layout: map); carregado antes de slide-form.js. Cada camada diz de onde vêm os dados
// (planilha CSV, GeoJSON, GPX, KML do projeto, ou valores por estado/país) e quais colunas viram cor, tamanho e rótulo.
window.SagaMapFields = (f, obj) => [
  f.text("kicker", "Chapéu"), f.text("title", "Título"),
  f.select("basemap", "Fundo", [["ruas", "Ruas"], ["claro", "Claro"], ["escuro", "Escuro"], ["satelite", "Satélite (se configurado)"], ["nenhum", "Sem fundo"]], { empty: false, default: "ruas" }),
  f.list("layers", "Camadas (na ordem: a última fica por cima)", obj([
    f.text("name", "Nome na legenda"),
    f.text("points", "Planilha de pontos (CSV do projeto)", { mono: true, placeholder: "contexto/sensores.csv", hint: "Colunas de latitude e longitude são achadas pelo nome." }),
    f.text("geojson", "Linhas e áreas (GeoJSON)", { mono: true, placeholder: "contexto/rede.geojson" }),
    f.text("gpx", "Trajeto de GPS (GPX)", { mono: true }), f.text("kml", "KML", { mono: true }),
    f.json("areas", "Valores por estado ou país", { rows: 3, hint: '{ "SP": 320, "RJ": 140 } ou { "BR": 10, "PT": 4 }: a cor mais forte é o maior.' }),
    f.text("color", "Cor por coluna (ou uma cor: s1, em, hi, #1F6FB2)"), f.text("size", "Tamanho por coluna (número)"), f.text("label", "Rótulo (coluna)"),
    f.more([f.text("lat", "Coluna da latitude"), f.text("lon", "Coluna da longitude"), f.json("colors", "Cor de cada categoria", { hint: "{ ativo: s3, desligado: alert }" }),
      f.json("popup", "Campos do cartão ao clicar", { hint: '["nome", "status"] (vazio: as primeiras colunas)' }), f.text("legend", "Unidade na legenda"), f.text("prefix", "Prefixo dos valores"), f.text("suffix", "Sufixo dos valores"),
      f.num("step", "Aparece no clique"), f.json("view", "Câmera quando aparece", { hint: '"fit" (enquadra a camada) ou { center: [-23.55, -46.63], zoom: 14 }' })]),
  ]), { addLabel: "Adicionar camada", newItem: () => ({ name: "Pontos", points: "contexto/pontos.csv" }) }),
  f.bool("build", "Uma camada por clique"),
  f.json("view", "Enquadramento", { hint: 'Vazio: enquadra os dados. Ou { center: [-23.55, -46.63], zoom: 13 }' }),
  f.text("caption", "Nota"),
  f.action("Configurar mapa", () => window.SagaMapSettings?.open()),
];
