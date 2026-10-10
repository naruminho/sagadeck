// "Conheça o SagaDeck": a apresentação que todo usuário acha na biblioteca, com tudo o que dá para fazer. Monta-se
// sozinha dos exemplos de layout (layout-samples.js): layout novo entra aqui sem ninguém lembrar (engine.test.js
// confere). Cada slide diz o nome do recurso e a frase para pedir à IA. Abre em prévia, como os modelos da vitrine.
import { LAYOUT_INFO, LAYOUT_SAMPLES, LAYOUT_ASK } from "./layout-samples.js";
import { circle } from "../map-analysis.js";

export const TOUR_TITLE = "Conheça o SagaDeck";

// os grupos na ordem em que fazem sentido para quem está conhecendo; layout que não estiver em nenhum entra em "Mais"
const GROUPS = [
  ["Abrir e fechar", "capa, seções, agenda e encerramento", ["cover", "section", "agenda", "end", "references"]],
  ["Uma ideia por vez", "frases, números e palavras que ocupam o palco", ["statement", "headline", "quote", "definition", "number", "scenography"]],
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
function mapDemos() {
  return [
    demo({ kicker: "Valores por estado", title: "Geração solar por ==estado==", basemap: "claro", build: true, caption: "Valores ilustrativos. Uma região por clique; a câmera vai até ela.", layers: [
      { name: "Sudeste", areas: { SP: 4200, MG: 5100, RJ: 1100, ES: 600 }, legend: "MW", view: "fit" },
      { name: "Nordeste", areas: { BA: 2900, PE: 1200, CE: 1500, RN: 900, PI: 1300 }, legend: "MW", view: "fit" },
    ] }, "Estados por valor", "Estados ou países pintados pelo número, uma camada por clique, com a câmera indo até cada uma", "Pinte os estados pela potência instalada da planilha e mostre uma região por clique"),
    demo({ kicker: "Linhas e áreas", title: "O trajeto e a ==área== do evento", basemap: "ruas", build: true, caption: "Traçados aproximados, desenhados para a demonstração.", layers: [
      { name: "Trajeto da corrida", color: "em", geojson: { type: "Feature", properties: { nome: "Avenida Paulista" }, geometry: { type: "LineString", coordinates: [[-46.6611, -23.5578], [-46.6559, -23.5613], [-46.6496, -23.5655], [-46.6422, -23.5707]] } } },
      { name: "Área do evento", color: "c3", geojson: { type: "Feature", properties: { nome: "Parque Ibirapuera" }, geometry: { type: "Polygon", coordinates: [[[-46.6618, -23.5833], [-46.6531, -23.5826], [-46.6497, -23.5913], [-46.6586, -23.5952], [-46.6618, -23.5833]]] } } },
    ] }, "Linhas e áreas", "Trajetos, redes e áreas de GeoJSON, GPX ou KML; no Studio, Editar mapa desenha seguindo as ruas", "Desenhe o trajeto da corrida pelas ruas e a área do evento"),
    demo({ kicker: "Cobertura", title: "Quem fica a até ==1 km== de uma estação?", basemap: "claro", build: true, caption: "Os raios são calculados pelo sagadeck, não desenhados à mão.", layers: [
      { name: "Estações", points: ESTACOES, label: "nome", color: "em" },
      { name: "Raio de 1 km", color: "c4", geojson: { type: "FeatureCollection", features: ESTACOES.map((e) => ({ type: "Feature", properties: { nome: `${e.nome}: 1 km` }, geometry: circle([e.lat, e.lon], 1000) })) } },
    ] }, "Análises", "Raio, mais próximo, faixa em volta de uma linha, rota com tempo e onde instalar o próximo: o código calcula e a IA explica", "Mostre a área a 1 km de cada estação e quantas escolas ficam fora"),
    { layout: "cards", demo: "mapa", title: "Mapas com a IA", cols: 3, notes: "A IA pede os dados que faltam e o Studio busca, grava na pasta da apresentação com a fonte de cada linha e faz as contas.", items: [
      { icon: "search", title: "Buscar lugares", text: "Cinemas, escolas, unidades de saúde: vêm do OpenStreetMap, com a fonte de cada um." },
      { icon: "map", title: "Contornos e linhas", text: "O bairro, o parque, as ciclovias, o rio: o contorno de verdade, nunca inventado." },
      { icon: "globe", title: "Lista da web", text: "Uma lista com endereços na web vira pontos no mapa, com o link de onde veio." },
      { icon: "map-pin", title: "Coordenadas da planilha", text: "Endereços da sua planilha viram pontos; a IA pergunta antes de enviar." },
      { icon: "ruler", title: "Contas de verdade", text: "O mais próximo, quantos no raio, a faixa em volta de uma linha, onde instalar o próximo." },
      { icon: "route", title: "Rotas e alcance", text: "Tempo a pé, de carro ou de bicicleta, e a área alcançável em X minutos." },
    ] },
    { layout: "cards", demo: "mapa", title: "Mapas no Studio", cols: 3, notes: "O mapa funciona sem configurar nada. A chave gratuita do OpenRouteService (Configurar mapa) só acrescenta rotas e área alcançável.", items: [
      { icon: "pencil", title: "Editar mapa", text: "Uma tela só do mapa: camadas à esquerda, o mapa grande no meio e, à direita, o que cada ponto, linha ou área tem." },
      { icon: "table", title: "Planilha ligada", text: "Pôr no mapa a partir da planilha; clicar no ponto mostra a linha, e vice-versa." },
      { icon: "settings", title: "Configurar mapa", text: "Opcional: o servidor de mapas da empresa ou a chave de rotas, como a da IA." },
    ] },
  ];
}
