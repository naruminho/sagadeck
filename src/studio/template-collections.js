// Coleções originais: composições livres editáveis + páginas de conteúdo adaptável.
// Fotografias acompanham cada cópia na biblioteca; não dependem de URLs externas.
export const COLLECTION_NAMES = {
  perspectiva: 'Perspectiva — corporativo fotográfico',
  essencial: 'Essencial — minimalismo',
  revista: 'Revista — editorial',
  cromatico: 'Cromático — cor e fotografia',
  tracos: 'Traços — geometria criativa',
};
export const COLLECTION_ASSETS = {
  perspectiva: ['colecao-equipe.png'],
  essencial: ['colecao-arquitetura.png'],
  revista: ['colecao-arquitetura.png'],
  cromatico: ['colecao-cor.png'],
  tracos: ['colecao-equipe.png'],
};

const color = value => ['paper', 'ink', 'accent', 'alert'].includes(value) ? `c-${value}` : value;
const txt = (text, x, y, w, size = 40, extra = {}) => ({ text, x, y, w, size, fit: true, lh: 1.12, ...extra, ...(extra.color ? { color: color(extra.color) } : {}) });
const box = (x, y, w, h, fill, extra = {}) => ({ shape: 'rect', x, y, w, h, fill: color(fill), ...extra });
const photo = (name, x, y, w, h, extra = {}) => ({ image: `imagens/colecao-${name}.png`, alt: name === 'equipe' ? 'Mãos organizando ideias em uma mesa de trabalho' : name === 'cor' ? 'Xícara amarela e frutas em um cenário colorido' : 'Arquitetura de pedra com arcos e luz natural', x, y, w, h, fit: 'cover', ...extra });
const page = (title, elements) => ({ layout: 'canvas', title, tone: 'light', elements, notes: 'Modelo editável: troque os textos e as fotos pelos seus. Os números são ilustrativos.' });
const label = (text, x = 120, y = 90, color = 'ink') => txt(text, x, y, 1400, 24, { color, as: 'label' });
const heading = (text, x, y, w, size = 100, extra = {}) => txt(text, x, y, w, size, { as: 'title', ...extra });
const item = (title, text, value) => ({ title, text, ...(value ? { value } : {}) });
const priorities = [item('Uma pergunta melhor', 'Entenda o que precisa mudar antes de escolher a solução.', '01'), item('Um teste pequeno', 'Aprenda com uma experiência simples e um resultado observável.', '02'), item('Uma decisão clara', 'Combine o próximo passo, o responsável e o momento de revisar.', '03')];
const agenda = ['O contexto', 'A oportunidade', 'O experimento', 'O próximo passo'];
const palette = (paper, ink, accent, alert, family) => Object.fromEntries(Object.entries({ paper, ink, accent, alert, family }).map(([key, value]) => [key, Array.isArray(value) ? value.map(c => c.replace('#', '')) : value.replace('#', '')]));

// Estética de cada coleção para a geração com IA (modal "Deck com IA": estilo → tema + direção criativa).
export const COLLECTION_STYLE = {
  perspectiva: { theme: 'jornal', direction: 'Corporativo fotográfico: fotografia grande de gente de verdade, contraste firme, uma ideia por slide. Considere jornal.' },
  essencial: { theme: 'prata', direction: 'Minimalismo de estúdio: muito espaço vazio, uma frase por slide, detalhes em preto e branco. Considere prata.' },
  revista: { theme: 'editorial', direction: 'Revista editorial: serifas grandes, capítulos, fotografia e respiro de página. Considere editorial.' },
  cromatico: { theme: 'bauhaus', direction: 'Cor e fotografia: painéis sobrepostos, blocos de cor chapada, energia alegre. Considere bauhaus.' },
  tracos: { theme: 'bauhaus', direction: 'Geometria criativa: molduras, caminhos visuais, números grandes, composição assimétrica. Considere bauhaus.' },
};
export function collectionDeck(kind) {
  if (!Object.hasOwn(COLLECTION_NAMES, kind)) throw new Error('Coleção não encontrada.');
  let theme, colors, slides;
  if (kind === 'perspectiva') {
    theme = 'jornal'; colors = palette('#faf9f6', '#20252b', '#c83c43', '#397684', ['#c83c43', '#397684', '#6b794e']);
    slides = [
      page('Um novo ponto de vista.', [photo('equipe', 780, 0, 1140, 1080), box(0, 0, 830, 1080, 'paper'), box(120, 180, 90, 8, 'accent'), label('PERSPECTIVA / ESTRATÉGIA', 120, 100), heading('Um novo\nponto de\nvista.', 120, 300, 690, 124), txt('Ideias claras. Decisões com contexto.', 120, 800, 620, 36)]),
      page('Nossa conversa', [photo('equipe', 0, 0, 610, 1080, { style: 'filter:grayscale(1);' }), label('O CAMINHO', 730, 100), heading('Nossa conversa', 730, 170, 1050, 94), box(750, 385, 3, 450, 'accent'), ...agenda.flatMap((s, i) => [box(738, 385 + i * 145, 28, 28, 'accent', { shape: 'circle' }), txt(`0${i + 1}`, 810, 375 + i * 145, 100, 28, { color: 'accent' }), txt(s, 940, 366 + i * 145, 760, 46)])]),
      page('O trabalho começa na pergunta.', [photo('equipe', 0, 0, 1920, 1080), box(0, 0, 960, 1080, '#20252b', { opacity: 0.94 }), label('UMA IDEIA PARA LEVAR', 120, 120, '#ffffff'), heading('O trabalho\ncomeça na\npergunta.', 120, 290, 760, 114, { color: '#ffffff' }), txt('Antes de acelerar, escolha a direção.', 120, 810, 740, 38, { color: '#ffffff' })]),
      { layout: 'mosaic', title: 'Três escolhas que importam', items: priorities },
      page('Intenção e ação', [label('DIREÇÃO COMPARTILHADA'), heading('Intenção\ne ação', 120, 250, 650, 122), box(890, 0, 1030, 1080, 'ink'), box(830, 230, 970, 88, 'accent'), txt('O que queremos mudar', 910, 250, 840, 42, { color: '#ffffff', weight: 700 }), txt('Uma experiência mais simples para quem usa e mais clara para quem constrói.', 970, 380, 770, 43, { color: '#ffffff' }), box(830, 620, 970, 88, '#397684'), txt('Como vamos começar', 910, 640, 840, 42, { color: '#ffffff', weight: 700 }), txt('Um piloto com escopo pequeno, resultado visível e espaço para aprender.', 970, 770, 770, 43, { color: '#ffffff' })]),
      { layout: 'ribbon', title: 'Do plano à prática', items: priorities, source: 'Adicione ou remova etapas: a composição se ajusta.' },
      page('Vamos escolher o próximo passo?', [box(0, 0, 1920, 1080, 'ink'), box(120, 155, 160, 12, 'accent'), heading('Vamos escolher\no próximo passo?', 120, 310, 1640, 140, { color: '#ffffff' }), txt('Uma decisão. Um responsável. Uma data.', 120, 820, 1400, 44, { color: '#ffffff' })]),
    ];
  } else if (kind === 'essencial') {
    theme = 'prata'; colors = palette('#fcfcfa', '#222724', '#526652', '#977252', ['#526652', '#977252', '#637581']);
    slides = [
      page('Menos ruído. Mais sentido.', [label('ESSENCIAL / ESTÚDIO DE IDEIAS'), box(120, 155, 1680, 2, '#d5d8d1'), photo('arquitetura', 1180, 275, 580, 610, { style: 'filter:grayscale(1);' }), heading('Menos ruído.\nMais sentido.', 120, 320, 1080, 111), txt('Espaço para a ideia principal aparecer.', 120, 800, 830, 34), label('01 / COMEÇAR', 120, 930)]),
      page('O essencial primeiro', [label('UMA IDEIA, TRÊS PONTOS'), heading('O essencial\nprimeiro', 120, 250, 730, 108), ...priorities.flatMap((s, i) => [box(1020, 235 + i * 230, 740, 2, '#d5d8d1'), txt(s.value, 1020, 265 + i * 230, 90, 26), txt(s.title, 1140, 263 + i * 230, 600, 41, { weight: 600 }), txt(s.text, 1140, 330 + i * 230, 600, 30)])]),
      page('Detalhes que fazem diferença', [label('OLHAR MAIS DE PERTO'), heading('Detalhes que\nfazem diferença', 120, 195, 1000, 88), photo('arquitetura', 120, 485, 900, 410, { style: 'filter:grayscale(1);' }), photo('arquitetura', 1230, 190, 490, 400), txt('Uma mesma ideia pode ser vista por mais de um ângulo.', 1230, 680, 490, 39)]),
      { layout: 'stats', title: 'Poucos números. Com contexto.', stats: [{ value: '03', label: 'hipóteses para testar' }, { value: '01', label: 'experiência por vez' }, { value: '04', label: 'semanas para aprender' }], source: 'Exemplo ilustrativo. Substitua pelos seus indicadores.' },
      { layout: 'mosaic', title: 'O que merece atenção', items: priorities.map(({ value, ...s }) => s) },
      page('Uma ideia para levar', [label('ESSENCIAL / FECHAMENTO'), box(120, 220, 1680, 2, '#d5d8d1'), heading('Clareza também\né uma escolha.', 120, 370, 1660, 130), txt('Qual detalhe você pode simplificar hoje?', 120, 820, 1400, 44)]),
    ];
  } else if (kind === 'revista') {
    theme = 'editorial'; colors = palette('#f7f2ec', '#322d30', '#966575', '#685e4c', ['#966575', '#685e4c', '#5c7276']);
    slides = [
      page('Outras maneiras de olhar', [photo('arquitetura', 710, 0, 1210, 1080), box(0, 0, 720, 1080, 'paper'), label('REVISTA / VOLUME 01'), heading('Outras\nmaneiras\nde olhar', 120, 275, 1000, 125), txt('Uma coleção de ideias,\nângulos e possibilidades.', 120, 825, 600, 36)]),
      page('Nesta edição', [box(0, 0, 770, 1080, '#e4d4d9'), heading('Nesta\nedição', 110, 300, 650, 148), label('SUMÁRIO', 950, 140), ...agenda.flatMap((s, i) => [txt(`0${i + 1}`, 950, 295 + i * 160, 130, 48, { color: 'accent' }), txt(s, 1120, 297 + i * 160, 650, 46), box(950, 388 + i * 160, 810, 2, '#d6c9ca')])]),
      page('01 / Abrir o olhar', [photo('arquitetura', 0, 0, 1920, 1080), box(0, 0, 1110, 1080, 'paper', { style: 'clip-path:polygon(0 0,100% 0,73% 100%,0 100%);' }), label('PRIMEIRO CAPÍTULO'), heading('Abrir\no olhar', 120, 280, 700, 142), txt('01', 120, 715, 500, 190, { as: 'number', color: 'accent' })]),
      page('Entre luz e espaço', [label('ENSAIO VISUAL'), photo('arquitetura', 120, 245, 740, 670), photo('arquitetura', 940, 120, 430, 420), box(1390, 120, 410, 420, '#e4d4d9'), txt('02', 1460, 220, 300, 170, { as: 'number', color: 'accent' }), heading('Entre luz\ne espaço', 940, 615, 810, 90), txt('Encontre a história nos detalhes.', 940, 860, 800, 34)]),
      { layout: 'ribbon', title: 'Um percurso em três atos', items: priorities },
      page('O que fica depois?', [box(0, 0, 1920, 1080, '#e4d4d9'), label('ÚLTIMA PÁGINA / PRÓXIMA CONVERSA'), heading('O que fica\ndepois?', 120, 255, 1550, 170), txt('Uma boa pergunta pode ser o começo de tudo.', 120, 820, 1510, 43)]),
    ];
  } else if (kind === 'cromatico') {
    theme = 'bauhaus'; colors = palette('#fffaf0', '#252a43', '#e2573f', '#236c78', ['#e2573f', '#236c78', '#6751a8']);
    slides = [
      page('Dê cor à sua ideia.', [photo('cor', 0, 0, 1920, 1080), box(105, 165, 970, 680, 'paper'), label('CROMÁTICO / IDEIAS EM MOVIMENTO', 165, 225), heading('Dê cor\nà sua ideia.', 165, 345, 845, 130), box(930, 740, 650, 150, '#f7d64b'), txt('COMECE PELO INESPERADO', 980, 790, 560, 28, { weight: 700 })]),
      page('Pequenos detalhes. Outra energia.', [box(0, 0, 1920, 1080, '#f7d64b'), photo('cor', 860, 125, 930, 780), label('A COR MUDA A CONVERSA'), heading('Pequenos\ndetalhes.\nOutra energia.', 120, 310, 920, 105), box(120, 835, 620, 100, 'paper'), txt('O simples também surpreende.', 155, 865, 560, 29)]),
      page('Três ingredientes', [label('UMA RECEITA PARA EXPERIMENTAR'), heading('Três ingredientes', 120, 170, 1600, 98), ...priorities.flatMap((s, i) => [box(120 + i * 565, 380, 525, 540, ['#f7d64b', '#bce0cd', '#f2b6a5'][i]), txt(s.value, 160 + i * 565, 420, 420, 116, { as: 'number' }), txt(s.title, 160 + i * 565, 610, 420, 43, { weight: 700 }), txt(s.text, 160 + i * 565, 735, 420, 31)])]),
      page('Olhe de novo.', [photo('cor', 0, 0, 1100, 1080), box(1100, 0, 820, 1080, '#bce0cd'), heading('Olhe\nde\nnovo.', 1190, 245, 650, 147), txt('O mesmo objeto.\nUma nova perspectiva.', 1190, 820, 600, 35)]),
      { layout: 'mosaic', title: 'Espaço para mais ideias', items: [...priorities, item('Uma conversa aberta', 'Convide outros olhares para a próxima versão.'), item('Um novo detalhe', 'Observe o que muda na experiência.')], source: 'Esta grade se adapta quando você adiciona ou remove itens.' },
      page('Agora é com você.', [box(0, 0, 1920, 1080, '#f7d64b'), box(1240, 0, 680, 1080, '#e2573f'), box(1300, 280, 500, 500, '#bce0cd', { shape: 'circle' }), label('CROMÁTICO / PRÓXIMO MOVIMENTO'), heading('Agora\né com você.', 120, 310, 1110, 140), txt('Que ideia merece sair do papel?', 120, 825, 1060, 42)]),
    ];
  } else {
    theme = 'bauhaus'; colors = palette('#fafaf5', '#2d304c', '#476d98', '#b6574d', ['#476d98', '#b6574d', '#647d71']);
    const ornaments = () => [box(130, 185, 1660, 700, 'paper', { stroke: '#696080', strokeWidth: 5 }), box(90, 750, 190, 190, '#f1d372', { shape: 'circle' }), ...[0, 1, 2].map(i => box(1510 + i * 80, 690, 28, 220, '#476d98', { rotate: 35 })), box(1510, 135, 40, 160, '#d98777'), box(1580, 135, 40, 160, '#d98777')];
    slides = [
      page('Ideias em construção', [...ornaments(), label('TRAÇOS / GEOMETRIA CRIATIVA', 280, 270), heading('Ideias em\nconstrução', 280, 410, 1300, 125), txt('Pessoas, caminhos e possibilidades.', 280, 750, 1200, 38)]),
      page('Quatro pontos de partida', [label('O QUE NOS MOVE'), box(100, 225, 600, 105, '#f1d372'), heading('Pontos de\npartida', 120, 360, 550, 94), ...['Curiosidade', 'Clareza', 'Colaboração', 'Aprendizado'].flatMap((s, i) => { const x = 820 + (i % 2) * 510, y = 225 + Math.floor(i / 2) * 360; return [txt(`0${i + 1}`, x, y, 430, 100, { color: '#b6574d', as: 'number' }), txt(s, x, y + 130, 430, 39, { weight: 700 }), txt('Um princípio para orientar as escolhas do dia a dia.', x, y + 210, 410, 29)]; })]),
      page('Gente que faz acontecer', [label('PESSOAS / ENCONTROS'), box(1100, 150, 680, 770, '#476d98'), photo('equipe', 1030, 100, 680, 770), heading('Gente que\nfaz acontecer', 120, 290, 830, 103), box(120, 630, 190, 12, '#d98777'), txt('Experiências diferentes.\nUma construção em comum.', 120, 740, 780, 41)]),
      { layout: 'infographic', shape: 'metro', title: 'Caminhos que se conectam', center: { title: 'Uma ideia', icon: 'lightbulb' }, items: priorities },
      { layout: 'mosaic', title: 'Nossos princípios, na prática', items: [...priorities, item('Compartilhar', 'Torne os aprendizados acessíveis a quem vai continuar.') ] },
      page('A próxima forma é sua.', [...ornaments(), label('TRAÇOS / CONTINUA', 280, 270), heading('A próxima\nforma é sua.', 280, 405, 1300, 130), txt('Qual será o seu primeiro movimento?', 280, 755, 1200, 38)]),
    ];
  }
  // Os layouts adaptáveis já numeram os itens; evite repetir a numeração como indicador.
  slides = slides.map(s => s.items ? { ...s, items: s.items.map(({ value, ...rest }) => rest) } : s);
  return { title: COLLECTION_NAMES[kind], theme, palette: colors, duration: 12, maxWords: 140, slides };
}
