// "Conheça o SagaDeck": a apresentação que todo usuário acha na biblioteca, com tudo o que dá para fazer. Monta-se
// sozinha dos exemplos de layout (layout-samples.js): layout novo entra aqui sem ninguém lembrar (engine.test.js
// confere). Cada slide diz o nome do recurso e a frase para pedir à IA. Abre em prévia, como os modelos da vitrine.
import { LAYOUT_INFO, LAYOUT_SAMPLES, LAYOUT_ASK } from "./layout-samples.js";
import { circle, lineBuffer } from "../map-analysis.js";

export const TOUR_TITLE = "Conheça o SagaDeck";

// os grupos na ordem em que fazem sentido para quem está conhecendo; layout que não estiver em nenhum entra em "Mais"
const GROUPS = [
  ["Abrir e fechar", "capa, seções, agenda e encerramento", ["cover", "section", "agenda", "end", "references"]],
  ["Uma ideia por vez", "frases, números e palavras que ocupam o palco", ["statement", "headline", "quote", "definition", "number"]],
  ["Organizar o conteúdo", "listas, cartões, etapas, comparações e linhas do tempo", ["list", "cards", "mosaic", "ribbon", "bento", "split", "compare", "matrix", "steps", "timeline", "calendar", "hub", "infographic", "pyramid", "funnel"]],
  ["Números e dados", "indicadores, gráficos, tabelas e painéis", ["stats", "chart", "table", "onepage", "status", "poster"]],
  ["Mapas", "pontos, linhas e áreas sobre o mapa ao vivo, com a IA buscando dados e fazendo as contas", ["map"], () => mapDemos()],
  ["Imagem e vídeo", "fotos, vídeos e foco guiado", ["image", "full", "spotlight", "carousel", "video"]],
  ["Com a plateia", "perguntas, enquetes e experiências interativas", ["question", "poll", "decisionlab", "playground", "portal"]],
  ["Código e tecnologia", "código, APIs ao vivo, Git e diagramas", ["code", "codewalk", "codelab", "api", "duel", "terminals", "turns", "diagram", "graphlab", "algo", "dossier"]],
  ["Aula e ciência", "fórmulas que viram curva, calculadoras e exercícios", ["science", "calc", "solution"]],
  ["Do seu jeito", "monte o slide livremente", ["blocks", "canvas"]],
];

// o que não é layout, mas a pessoa precisa saber que existe
const EXTRAS = [
  ["sparkles", "Criar com IA", "De um tema, de um arquivo (PDF, Word, planilha, PowerPoint) ou de um link: a IA monta a apresentação inteira."],
  ["message-circle", "Conversar com a IA", "No chat, peça mudanças no slide ou no deck todo; cada mudança vira uma versão que dá para desfazer."],
  ["search-check", "Leitura crítica", "A IA revisa a apresentação e aponta o que melhorar, slide a slide, com Aplicar e Ignorar."],
  ["globe", "Pesquisa na web", "Quando o assunto é recente ou de nicho, a IA pesquisa, lê as fontes e cita de onde veio cada dado."],
  ["history", "Versões e desfazer", "Cada mudança, sua ou da IA, vira uma versão: compare e volte quando quiser."],
  ["book-open", "Material de consulta", "Transforme a apresentação de palco em material para a plateia guardar e ler depois."],
  ["file-up", "Importar PowerPoint", "Traga um .pptx e continue editando aqui, com as imagens e a ordem do original."],
  ["table", "Gráfico da planilha", "Cole do Excel ou use a planilha do projeto: o Studio sugere gráficos e atualiza quando o arquivo muda."],
  ["palette", "Temas e paletas", "Troque o visual inteiro com um clique; o conteúdo se rearruma sozinho."],
  ["presentation", "Modo apresentador", "Notas, próximo slide, cronômetro e caneta para desenhar ao vivo."],
  ["download", "PDF e PowerPoint", "Exporte para PDF ou para um PowerPoint editável, com as animações de clique."],
  ["link", "Compartilhar link", "Um link só de leitura, para quem não precisa editar."],
];

// os exemplos de navegação (hub, cartões) apontam para slides que não existem aqui: o link sai, o desenho fica
const semLinks = (v) => (Array.isArray(v) ? v.map(semLinks) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "goto").map(([k, x]) => [k, semLinks(x)])) : v);

const asked = (ask) => `Peça à IA: “${ask}”`;

export function tourDeck() {
  const all = Object.keys(LAYOUT_SAMPLES);
  const used = new Set(GROUPS.flatMap(([, , names]) => names));
  const groups = [...GROUPS.map(([title, sub, names, demos]) => [title, sub, names.filter((n) => LAYOUT_SAMPLES[n]), demos])];
  const rest = all.filter((n) => !used.has(n));
  if (rest.length) groups.push(["Mais recursos", "os layouts mais novos", rest]);

  const slides = [{
    layout: "cover", kicker: "SAGADECK · TOUR", title: TOUR_TITLE,
    subtitle: "Tudo o que dá para fazer, um slide por recurso. Cada um diz como pedir à IA.",
    figure: { icon: "compass", size: 320 },
    notes: "Navegue à vontade: nada aqui cria arquivo. Embaixo de cada slide (nestas notas) está o nome do recurso e a frase para pedir à IA na sua apresentação.",
  }];
  groups.forEach(([title, sub, names, demos], i) => {
    if (!names.length) return;
    const extra = demos ? demos() : [];
    const n = names.length + extra.length;
    slides.push({ layout: "section", number: i + 1, kicker: `${n} recurso${n === 1 ? "" : "s"}`, title, subtitle: sub });
    for (const name of names) {
      const sample = semLinks(structuredClone(LAYOUT_SAMPLES[name]));
      const [label, desc] = LAYOUT_INFO[name] || [name, ""];
      const ask = LAYOUT_ASK[name] || "";
      slides.push({
        ...sample,
        layout: name,
        tour: name,
        source: `**${label}**: ${desc}. ${asked(ask)}`,
        // as notas ficam visíveis logo abaixo do slide no Studio (e na visão do apresentador): valem para todo layout,
        // inclusive os que não desenham o rodapé (capa, citação, vídeo…)
        notes: [`${label}: ${desc}.`, asked(ask), sample.notes].filter(Boolean).join("\n\n"),
      });
    }
    slides.push(...extra);
  });
  slides.push({ layout: "section", number: groups.length + 1, kicker: "Além dos slides", title: "O que mais o SagaDeck faz", subtitle: "IA, importação, exportação e apresentação" });
  slides.push({ layout: "cards", title: "Com a IA", cols: 3, items: EXTRAS.slice(0, 3).map(([icon, title, text]) => ({ icon, title, text })) });
  slides.push({ layout: "cards", title: "A IA pesquisa e guarda", cols: 3, items: EXTRAS.slice(3, 6).map(([icon, title, text]) => ({ icon, title, text })) });
  slides.push({ layout: "cards", title: "Com os seus arquivos", cols: 3, items: EXTRAS.slice(6, 9).map(([icon, title, text]) => ({ icon, title, text })) });
  slides.push({ layout: "cards", title: "Na hora de apresentar", cols: 3, items: EXTRAS.slice(9).map(([icon, title, text]) => ({ icon, title, text })) });
  slides.push({ layout: "end", title: "Agora é a sua vez.", subtitle: "Crie uma apresentação e peça à IA o que você viu aqui." });
  return { title: TOUR_TITLE, theme: "sinal", duration: 30, maxWords: 140, slides };
}

// ---- a demonstração dos mapas (além do exemplo do layout): estados por valor com câmera, linhas e áreas, cobertura
// com raios calculados pelo código e o que a IA e o Studio fazem. Valores ilustrativos e traçados aproximados, ditos
// na própria tela; os dados de verdade vêm da planilha, de arquivos ou das buscas da IA.
const demo = (slide, label, desc, ask) => ({ ...slide, layout: "map", demo: "mapa", source: `**${label}**: ${desc}. ${asked(ask)}`, notes: [`${label}: ${desc}.`, asked(ask)].join("\n\n") });
const ESTACOES = [
  { nome: "Centro", lat: -23.5489, lon: -46.6388 }, { nome: "Pinheiros", lat: -23.5614, lon: -46.702 },
  { nome: "Ibirapuera", lat: -23.5874, lon: -46.6576 }, { nome: "Mooca", lat: -23.5596, lon: -46.5996 }, { nome: "Santana", lat: -23.5027, lon: -46.6252 },
];
// calculadas uma vez pelo serviço de rotas (OpenRouteService, dados do OpenStreetMap), em 10/10/2026, e gravadas aqui:
// a rota a pé do MASP ao Parque Ibirapuera e a área alcançável em 15 minutos a pé do MASP. Nada desenhado à mão.
const ROTA = [[-46.65582,-23.56144],[-46.65663,-23.56304],[-46.65731,-23.56503],[-46.65747,-23.56534],[-46.65836,-23.56627],[-46.65844,-23.5662],[-46.65849,-23.56624],[-46.65847,-23.5663],[-46.65908,-23.56693],[-46.65888,-23.56709],[-46.65891,-23.56717],[-46.66039,-23.56866],[-46.66049,-23.56883],[-46.66022,-23.56911],[-46.66029,-23.56923],[-46.65977,-23.56985],[-46.66047,-23.57058],[-46.6604,-23.57064],[-46.66044,-23.57077],[-46.65929,-23.57188],[-46.65928,-23.57211],[-46.66009,-23.57294],[-46.6601,-23.57307],[-46.65897,-23.57415],[-46.65902,-23.57428],[-46.65957,-23.57482],[-46.65923,-23.57522],[-46.65931,-23.57529],[-46.65833,-23.57626],[-46.65837,-23.57631],[-46.6583,-23.57645],[-46.65882,-23.57697],[-46.65953,-23.57755],[-46.65954,-23.57765],[-46.65966,-23.57768],[-46.66046,-23.57843],[-46.66149,-23.57921],[-46.66151,-23.57933],[-46.6614,-23.57948],[-46.66136,-23.57974],[-46.66108,-23.58011],[-46.66121,-23.58034],[-46.66105,-23.58041],[-46.661,-23.5805],[-46.66124,-23.58067],[-46.66175,-23.58087],[-46.66215,-23.58119],[-46.66237,-23.58158],[-46.66246,-23.58195],[-46.66237,-23.58289],[-46.66228,-23.58305],[-46.6619,-23.58328],[-46.6614,-23.5833],[-46.66122,-23.58341],[-46.66114,-23.58356],[-46.66115,-23.58377],[-46.66147,-23.58427],[-46.66154,-23.58531],[-46.66071,-23.58577],[-46.66056,-23.58616],[-46.66028,-23.58644],[-46.66002,-23.58654],[-46.65852,-23.5868],[-46.65757,-23.58736]];
const ALCANCE = [[-46.66431,-23.5613],[-46.66432,-23.56766],[-46.66418,-23.5698],[-46.66378,-23.57178],[-46.66291,-23.57199],[-46.66122,-23.57207],[-46.65645,-23.57178],[-46.65422,-23.56956],[-46.64949,-23.56588],[-46.64924,-23.56436],[-46.64736,-23.55976],[-46.64561,-23.55634],[-46.64587,-23.55489],[-46.64616,-23.5541],[-46.64761,-23.55261],[-46.65241,-23.55134],[-46.65448,-23.55097],[-46.65624,-23.55082],[-46.65696,-23.55115],[-46.66012,-23.55392],[-46.66234,-23.55606],[-46.66431,-23.5613]];
const ROTA_KM = "4,0 km", ROTA_MIN = "48 min";
const MASP = { nome: "MASP", lat: -23.5614, lon: -46.6559 }, IBIRAPUERA = { nome: "Parque Ibirapuera", lat: -23.5874, lon: -46.6576 };
// o público de cada região (ilustrativo) dá o tamanho da bolha
const PUBLICO = [{ nome: "Centro", lat: -23.5489, lon: -46.6388, publico: 42 }, { nome: "Pinheiros", lat: -23.5614, lon: -46.702, publico: 28 },
  { nome: "Mooca", lat: -23.5596, lon: -46.5996, publico: 12 }, { nome: "Santana", lat: -23.5027, lon: -46.6252, publico: 18 }, { nome: "Santo Amaro", lat: -23.6536, lon: -46.7095, publico: 9 }];

function mapDemos() {
  return [
    demo({ kicker: "Bolhas", title: "Onde o público ==está==", basemap: "claro", build: true, caption: "Valores ilustrativos. O tamanho de cada bolha vem da coluna público da planilha.", layers: [
      { name: "Público (mil pessoas)", points: PUBLICO, size: "publico", label: "nome", color: "em" },
    ] }, "Pontos por tamanho", "Uma coluna de números vira o tamanho do ponto; outra coluna vira a cor, com a legenda clicável", "Faça as bolhas do tamanho do público de cada região"),
    demo({ kicker: "Valores por estado", title: "Geração solar por ==estado==", basemap: "claro", build: true, caption: "Valores ilustrativos. Uma região por clique; a câmera vai até ela.", layers: [
      { name: "Sudeste", areas: { SP: 4200, MG: 5100, RJ: 1100, ES: 600 }, legend: "MW", view: "fit" },
      { name: "Nordeste", areas: { BA: 2900, PE: 1200, CE: 1500, RN: 900, PI: 1300 }, legend: "MW", view: "fit" },
    ] }, "Regiões por valor", "Estados ou países pintados pelo número, uma camada por clique, com a câmera indo até cada uma", "Pinte os estados pela potência instalada da planilha e mostre uma região por clique"),
    demo({ kicker: "Linhas e áreas", title: "O trajeto e a ==área== do evento", basemap: "ruas", build: true, caption: "Traçados aproximados, desenhados para a demonstração.", layers: [
      { name: "Trajeto da corrida", color: "em", geojson: { type: "Feature", properties: { nome: "Avenida Paulista" }, geometry: { type: "LineString", coordinates: [[-46.6611, -23.5578], [-46.6559, -23.5613], [-46.6496, -23.5655], [-46.6422, -23.5707]] } } },
      { name: "Área do evento", color: "c3", geojson: { type: "Feature", properties: { nome: "Parque Ibirapuera" }, geometry: { type: "Polygon", coordinates: [[[-46.6618, -23.5833], [-46.6531, -23.5826], [-46.6497, -23.5913], [-46.6586, -23.5952], [-46.6618, -23.5833]]] } } },
    ] }, "Linhas e áreas", "Trajetos, redes e áreas de GeoJSON, GPX ou KML, ou desenhados no Editar mapa", "Desenhe o trajeto da corrida pelas ruas e a área do evento"),
    demo({ kicker: "Rota e alcance", title: "15 minutos a pé do ==MASP==", basemap: "claro", build: true, caption: `Calculados pelo serviço de rotas (OpenRouteService, dados do OpenStreetMap). A pé até o parque: ${ROTA_KM}, cerca de ${ROTA_MIN}.`, layers: [
      { name: "Pontos", points: [MASP, IBIRAPUERA], label: "nome", color: "fg" },
      { name: "Alcance a pé em 15 min", color: "c4", geojson: { type: "Feature", properties: { nome: "15 minutos a pé" }, geometry: { type: "Polygon", coordinates: [ALCANCE] } }, view: "fit" },
      { name: `Rota a pé (${ROTA_KM})`, color: "em", geojson: { type: "Feature", properties: { nome: `Do MASP ao Ibirapuera: ${ROTA_KM}, ${ROTA_MIN}` }, geometry: { type: "LineString", coordinates: ROTA } }, view: "fit" },
    ] }, "Rota pelas ruas e área alcançável", "O caminho de verdade pelas ruas, com a distância e o tempo, e tudo o que se alcança em X minutos a pé, de carro ou de bicicleta", "Mostre o que dá para alcançar em 15 minutos a pé do MASP e a rota até o Ibirapuera"),
    demo({ kicker: "Cobertura", title: "Quem fica a até ==1 km== de uma estação?", basemap: "claro", build: true, caption: "Os raios são calculados pelo sagadeck, não desenhados à mão.", layers: [
      { name: "Estações", points: ESTACOES, label: "nome", color: "em" },
      { name: "Raio de 1 km", color: "c4", geojson: { type: "FeatureCollection", features: ESTACOES.map((e) => ({ type: "Feature", properties: { nome: `${e.nome}: 1 km` }, geometry: circle([e.lat, e.lon], 1000) })) } },
    ] }, "Raio em volta de pontos", "Raio, mais próximo e onde instalar o próximo: o código calcula e a IA explica", "Mostre a área a 1 km de cada estação e quantas escolas ficam fora"),
    demo({ kicker: "Faixa", title: "Quem mora a até ==200 m== da rota?", basemap: "claro", build: true, caption: "A faixa em volta da linha é calculada pelo sagadeck.", layers: [
      { name: "Faixa de 200 m", color: "hi", geojson: { type: "Feature", properties: { nome: "200 m de cada lado", _faixa: true }, geometry: lineBuffer({ type: "LineString", coordinates: ROTA }, 200) } },
      { name: "Rota a pé", color: "em", geojson: { type: "Feature", properties: { nome: "Do MASP ao Ibirapuera" }, geometry: { type: "LineString", coordinates: ROTA } } },
    ] }, "Faixa em volta de uma linha", "Uma rua, uma rede ou um rio com a faixa de X metros dos dois lados; a IA conta o que fica dentro", "Mostre a faixa de 200 metros em volta da rota e quantas escolas ficam nela"),
    { layout: "cards", demo: "mapa", title: "Mapas com a IA", cols: 3, notes: "A IA pede os dados que faltam e o Studio busca, grava na pasta da apresentação com a fonte de cada linha e faz as contas.", items: [
      { icon: "search", title: "Buscar lugares", text: "Cinemas, escolas, unidades de saúde: vêm do OpenStreetMap, com a fonte de cada um." },
      { icon: "map", title: "Contornos e linhas", text: "O bairro, o parque, as ciclovias, o rio: o contorno de verdade, nunca inventado." },
      { icon: "globe", title: "Lista da web", text: "Uma lista com endereços na web vira pontos no mapa, com o link de onde veio." },
      { icon: "map-pin", title: "Coordenadas da planilha", text: "Endereços da sua planilha viram pontos; a IA pergunta antes de enviar." },
      { icon: "ruler", title: "Contas de verdade", text: "O mais próximo, quantos no raio, a faixa em volta de uma linha, onde instalar o próximo." },
      { icon: "route", title: "Rotas e alcance", text: "Tempo a pé, de carro ou de bicicleta, e a área alcançável em X minutos." },
    ] },
    { layout: "spotlight", demo: "mapa", kicker: "No Studio", title: "Onde se ==edita== o mapa", image: "imagens/tour-mapa-botao.jpg",
      caption: "Selecione o slide do mapa: o botão Editar mapa fica no canto do slide. Dois cliques no mapa também abrem.",
      notes: "Editar mapa: o botão no canto do slide de mapa, ou dois cliques no mapa. Abre uma tela só do mapa.",
      hotspots: [{ x: 71.4, y: 29.7, width: 9.8, height: 5.9, title: "Editar mapa", text: "Abre a tela do mapa: camadas, ferramentas e as propriedades de cada item." },
        { x: 24, y: 46, width: 45.5, height: 26, title: "O mapa no slide", text: "Aqui ele só mostra (o slide fica pequeno). Para mexer, Editar mapa ou dois cliques." }] },
    { layout: "spotlight", demo: "mapa", kicker: "No Studio", title: "A tela do ==mapa==", image: "imagens/tour-mapa-editor.jpg",
      caption: "Clique em cada parte para ver o que ela faz.",
      notes: "Editar mapa: camadas à esquerda, ferramentas e o mapa no meio, propriedades à direita, dica embaixo e Concluir no alto.",
      hotspots: [{ x: 0, y: 5.9, width: 15, height: 36, title: "Camadas", text: "Cada camada com o tipo e quantos itens tem; o olho esconde só aqui. Nova camada: pontos, linhas e áreas ou regiões por valor." },
        { x: 15.9, y: 36.7, width: 4.8, height: 32.6, title: "Ferramentas", text: "Selecionar, Ponto, Linha (pode seguir as ruas), Área e Régua." },
        { x: 80, y: 5.9, width: 20, height: 40, title: "Propriedades", text: "Do item clicado: os campos, com o que cada um faz no mapa. Sem nada clicado: a cor, o tamanho, o rótulo e o cartão da camada, e o fundo do mapa." },
        { x: 15, y: 95.1, width: 65, height: 4.9, title: "A dica", text: "Diz o que fazer com a ferramenta escolhida." },
        { x: 92.6, y: 1.1, width: 6.4, height: 3.6, title: "Concluir", text: "Volta ao slide. Tudo já foi gravado." }] },
    { layout: "cards", demo: "mapa", title: "Mapas no Studio", cols: 3, notes: "O mapa funciona sem configurar nada. A chave gratuita do OpenRouteService (Configurar mapa) só acrescenta rotas e área alcançável.", items: [
      { icon: "pencil", title: "Editar mapa", text: "Uma tela só do mapa: camadas à esquerda, o mapa grande no meio e, à direita, o que cada ponto, linha ou área tem." },
      { icon: "table", title: "Planilha ligada", text: "Pôr no mapa a partir da planilha; clicar no ponto mostra a linha, e vice-versa." },
      { icon: "settings", title: "Configurar mapa", text: "Opcional: o servidor de mapas da empresa ou a chave de rotas, como a da IA." },
    ] },
  ];
}
