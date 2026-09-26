// Experiências completas, locais e editáveis. A direção muda a narrativa, não só a paleta.
// Os dados ilustrativos ficam identificados; nenhuma experiência depende de IA ou de imagens remotas.

export const EXPERIENCES = [
  { id: "executivo", name: "Sala de decisão", subtitle: "Clareza que convence.", description: "Uma recomendação, evidências e a decisão. Elegância sóbria para reuniões importantes.", theme: "noite", accent: "#E4B660", background: "#0F1115", color: "#EDEBE6", font: "Segoe UI", category: "executive", tags: ["Estratégia", "Dados", "Sóbrio"], slideCount: 8 },
  { id: "editorial", name: "Matéria de capa", subtitle: "Uma história bem contada.", description: "Tipografia editorial, enquadramentos amplos e pistas que se revelam até a virada.", theme: "editorial", accent: "#E0432B", background: "#FAF9F6", color: "#141414", font: "Georgia", category: "creative", tags: ["Storytelling", "Editorial", "Autoral"], slideCount: 8 },
  { id: "palco", name: "Modo espetáculo", subtitle: "A próxima ideia já vem.", description: "Contraste, pausas dramáticas e participação da plateia. Feito para ocupar o palco.", theme: "aurora", accent: "#00F2FE", background: "#0A0D17", color: "#F8FAFC", font: "Segoe UI", category: "stage", tags: ["Keynote", "Impacto", "Interativo"], slideCount: 8 },
  { id: "pop", name: "Clube criativo", subtitle: "Ideias que saem da linha.", description: "Formas geométricas, cores primárias e um workshop com espaço para experimentar.", theme: "bauhaus", accent: "#D93A2B", background: "#F3EEE3", color: "#1A1A1A", font: "Century Gothic", category: "creative", tags: ["Workshop", "Geométrico", "Divertido"], slideCount: 8 },
  { id: "aula", name: "Laboratório vivo", subtitle: "Entender. Prever. Experimentar.", description: "Código por etapas, terminal, screenshot com foco e desafios para ensinar programação.", theme: "terminal", accent: "#FFB224", background: "#0D0E0D", color: "#DAD6CC", font: "Cascadia Mono", category: "code", tags: ["Programação", "Código", "Aulas"], slideCount: 9 },
  { id: "minimal", name: "Essencial", subtitle: "Só o que importa.", description: "Uma ideia por vez. Muito espaço, tipografia precisa e detalhes que deixam o conteúdo respirar.", theme: "prata", accent: "#0071E3", background: "#F5F5F7", color: "#1D1D1F", font: "Segoe UI", category: "executive", tags: ["Clean", "Produto", "Respiro"], slideCount: 8 },
];

const svg = (body, width = 700, height = 700) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">${body}</svg>`;
const gold = svg('<g fill="none" stroke="#E4B660"><circle cx="365" cy="335" r="235" stroke-width="1" opacity=".25"/><circle cx="365" cy="335" r="160" stroke-width="1" opacity=".45"/><path d="M85 490 255 405 390 438 610 165" stroke-width="8"/><path d="m540 165 70 0 0 70" stroke-width="8"/></g><circle cx="255" cy="405" r="10" fill="#E4B660"/><circle cx="390" cy="438" r="10" fill="#E4B660"/>');
const bauhaus = svg('<circle cx="220" cy="235" r="172" fill="#D93A2B"/><path d="M320 100h290v290H320z" fill="#1F4AA8"/><path d="m90 645 240-350 240 350z" fill="#F2B33D"/><circle cx="535" cy="525" r="92" fill="none" stroke="#1A1A1A" stroke-width="30"/>');
const orbit = svg('<g fill="none"><ellipse cx="520" cy="370" rx="465" ry="185" stroke="#00F2FE" stroke-width="3" transform="rotate(-28 520 370)"/><ellipse cx="520" cy="370" rx="310" ry="300" stroke="#7F00FF" stroke-width="38" opacity=".6"/><ellipse cx="520" cy="370" rx="170" ry="440" stroke="#FF007A" stroke-width="3" transform="rotate(48 520 370)"/></g><circle cx="860" cy="170" r="22" fill="#00F2FE"/>', 1050, 760);
const magazine = svg('<path d="M1060 0h860v1080h-860z" fill="#E0432B"/><circle cx="1510" cy="450" r="365" fill="#F7D9D2"/><path d="m1270 775 240-540 240 540z" fill="#141414"/><circle cx="1510" cy="560" r="130" fill="#E0432B"/><path d="M80 960h900" stroke="#141414" stroke-width="2"/>', 1920, 1080);
const quiet = svg('<circle cx="355" cy="330" r="215" fill="#E8E8ED"/><circle cx="355" cy="330" r="148" fill="#F5F5F7"/><circle cx="505" cy="180" r="40" fill="#0071E3"/>');
const terminal = svg('<rect x="55" y="130" width="590" height="425" rx="16" fill="#171816" stroke="#393A35" stroke-width="2"/><path d="M55 195h590" stroke="#393A35" stroke-width="2"/><g fill="#85817A"><circle cx="95" cy="164" r="8"/><circle cx="125" cy="164" r="8"/><circle cx="155" cy="164" r="8"/></g><path d="m125 290 75 65-75 65m125 0h125" fill="none" stroke="#FFB224" stroke-width="17"/><rect x="420" y="270" width="150" height="200" rx="8" fill="#252821"/><path d="m450 366 25 25 65-65" fill="none" stroke="#9EC5A6" stroke-width="15"/>');

// Mockup local de uma ferramenta de rede; mantém screenshot + focos disponíveis offline.
const networkImage = `data:image/svg+xml;base64,${Buffer.from(svg('<rect width="1280" height="800" rx="20" fill="#171B22"/><path d="M0 92h1280" stroke="#343B48" stroke-width="2"/><text x="45" y="57" fill="#F4F6FA" font-size="25" font-family="Consolas,monospace">DevTools · Network</text><rect x="45" y="128" width="1190" height="65" rx="10" fill="#252D3B"/><text x="75" y="169" fill="#99ACCA" font-size="23" font-family="Consolas,monospace">GET /api/profile</text><rect x="45" y="240" width="450" height="480" rx="12" fill="#202631"/><text x="75" y="292" fill="#9EC5A6" font-size="25" font-family="Consolas,monospace">200 OK</text><text x="75" y="347" fill="#F4F6FA" font-size="23" font-family="Consolas,monospace">Content-Type:</text><text x="75" y="387" fill="#FFB224" font-size="23" font-family="Consolas,monospace">application/json</text><text x="75" y="481" fill="#99ACCA" font-size="22" font-family="Consolas,monospace">Duration: 124 ms</text><text x="75" y="526" fill="#99ACCA" font-size="22" font-family="Consolas,monospace">Size: 52 B</text><rect x="530" y="240" width="705" height="480" rx="12" fill="#0E1219"/><text x="565" y="295" fill="#99ACCA" font-size="22" font-family="Consolas,monospace">Response</text><g fill="#E9EDF5" font-size="27" font-family="Consolas,monospace"><text x="565" y="358">{</text><text x="600" y="413">"id": 42,</text><text x="600" y="468">"name": "Ada",</text><text x="600" y="523">"active": true</text><text x="565" y="578">}</text></g>', 1280, 800)).toString("base64")}`;

const PRESETS = {
  executivo: {
    title: "Libere tempo.\nCrie valor.", duration: 12, markStyle: "cor",
    slides: (title) => [
      { layout: "cover", title, kicker: "Estratégia · uma decisão", subtitle: "Um piloto pequeno. Uma mudança relevante.", figure: { svg: gold }, notes: "Modelo ilustrativo: substitua os dados pelo seu cenário. Abra com a decisão que você precisa, antes de mostrar o diagnóstico." },
      { layout: "statement", kicker: "A recomendação", text: "Aprovar um piloto de ==30 dias==.", size: 145, notes: "Diga qual decisão precisa ser tomada nesta reunião. Defina o responsável e o teto de investimento." },
      { layout: "number", value: 12, suffix: " h", label: "por semana em tarefas repetitivas", context: "Tempo que poderia voltar para o cliente.", source: "Cenário ilustrativo · substitua pela sua medição", notes: "Explique como mediu o tempo. Um número só: não empilhe métricas de apoio neste slide." },
      { layout: "chart", title: "Comece onde há mais atrito.", chart: { chart: "bar", data: [{ label: "Retrabalho", value: 6 }, { label: "Busca", value: 4 }, { label: "Repasse", value: 2 }], suffix: " h", highlight: [0] }, side: "Retrabalho concentra ==metade== do tempo.", source: "Cenário ilustrativo · horas por semana", notes: "Mostre a evidência que sustenta a prioridade. Substitua os valores pela análise da equipe." },
      { layout: "compare", tone: "dark", title: "Uma mudança com limite claro.", left: { label: "Hoje", value: "Manual", valueSize: 104, text: "A equipe confere cada caso." }, right: { label: "Piloto", value: "Assistido", valueSize: 104, text: "A equipe decide as exceções.", hl: true }, notes: "O escopo do piloto deve ser pequeno o suficiente para reverter, e relevante o suficiente para aprender." },
      { layout: "matrix", title: "Risco visível. Resposta pronta.", x: ["Baixa exposição", "Alta exposição"], y: ["Alto impacto", "Baixo impacto"], cells: [{ title: "Validar", text: "Revisão humana nas exceções.", hl: true }, { title: "Limitar", text: "Sem decisões irreversíveis." }, { title: "Observar", text: "Métricas toda semana." }, { title: "Simplificar", text: "Menos integrações no piloto." }], notes: "A matriz é um ponto de partida. Troque os riscos genéricos pelos riscos concretos do projeto." },
      { layout: "timeline", title: "Trinta dias para aprender.", events: [{ when: "01", title: "Medir", text: "Definir a linha de base." }, { when: "15", title: "Testar", text: "Operar com um grupo." }, { when: "30", title: "Decidir", text: "Expandir, ajustar ou parar." }], highlight: [2], notes: "Defina agora a data da próxima decisão. O piloto termina com um critério, não com uma promessa." },
      { layout: "end", tone: "accent", title: "Vamos testar?", subtitle: "Aprovar o piloto · nomear o responsável · marcar a revisão", notes: "Feche repetindo a decisão pedida, o responsável e o próximo marco." },
    ],
  },
  editorial: {
    title: "O detalhe\nque muda tudo.", duration: 10, markStyle: "sublinhado",
    slides: (title) => [
      { layout: "full", title, titleSize: 148, kicker: "Ensaio visual · 01", caption: "Uma investigação sobre aquilo que deixamos de ver.", overlay: "left", figure: { image: `data:image/svg+xml;base64,${Buffer.from(magazine).toString("base64")}` }, notes: "Apresente um detalhe aparentemente comum que será explicado no final. Este ensaio é um modelo de narrativa, não uma reportagem factual." },
      { layout: "quote", quote: "Todo mundo olhava para a tela. Ninguém olhava para a espera.", by: "Uma cena para investigar", notes: "Conte uma situação concreta. A frase é autoral e ilustrativa: substitua pela voz real de alguém do seu projeto." },
      { layout: "section", tone: "light", number: "01", title: "A pista", subtitle: "O problema não estava onde procurávamos.", notes: "Mude o enquadramento. O próximo slide deve mostrar uma evidência, não uma opinião." },
      { layout: "compare", title: "O que vemos × o que acontece", left: { label: "Na tela", value: "3 passos", valueSize: 120, text: "Parece simples." }, right: { label: "Na experiência", value: "8 esperas", valueSize: 120, text: "Parece interminável.", hl: true }, source: "Exemplo narrativo · substitua pela sua observação", notes: "Dê um exemplo de contraste. Números ilustrativos: use os resultados da sua investigação." },
      { layout: "full", figure: { diagram: "flow", steps: ["Observar", "Perguntar", "Redesenhar"], highlight: 1 }, overlay: "bottom", kicker: "A virada", title: "Uma pergunta melhor.", titleSize: 104, notes: "Explique a mudança de método. A seta conduz a leitura antes de você detalhar cada etapa." },
      { layout: "statement", tone: "dark", text: "O detalhe não era pequeno.\nEra ==invisível==.", size: 132, notes: "Faça uma pausa. Deixe a conclusão ocupar a tela antes de avançar." },
      { layout: "split", title: "Ver de novo.", body: "Volte ao começo.\nAgora procure o que falta.", figure: { svg: gold }, notes: "Revisite a cena de abertura usando o novo enquadramento. Troque a ilustração por uma imagem relevante ao seu assunto." },
      { layout: "end", tone: "light", title: "O que você\nainda não viu?", subtitle: "A próxima boa ideia pode começar por aí.", notes: "Termine com uma pergunta aberta que conecte a história à realidade da audiência." },
    ],
  },
  palco: {
    title: "A próxima\nvirada.", duration: 10, markStyle: "cor",
    slides: (title) => [
      { layout: "headline", title, text: title, size: 246, kicker: "Uma ideia para levar além", caption: "Começa com uma pergunta.", background: { svg: orbit }, backgroundStyle: "opacity:.32;left:44%;width:65%;", notes: "Espere a sala ficar em silêncio. Abra com a pergunta do próximo slide, sem antecipar a resposta." },
      { layout: "question", tone: "dark", kicker: "Mãos para cima", question: "O que prende você\nem uma história?", options: ["Uma surpresa", "Um conflito", "Uma possibilidade"], notes: "Peça uma votação com as mãos. Use a resposta da sala para conectar a sua abertura ao tema." },
      { layout: "statement", tone: "accent", lines: [{ text: "Primeiro, uma tensão.", size: 112 }, { text: "Depois, uma ==possibilidade==.", size: 112, step: 1 }], notes: "Leia a primeira linha. Pause antes do clique que revela a segunda. O ritmo vem da fala, não de um avanço automático." },
      { layout: "number", value: 1, label: "ideia que vale lembrar amanhã", size: 430, context: "O restante existe para sustentá-la.", notes: "Defina a sua ideia central em uma frase. Não é uma estatística: o número representa a escolha de foco." },
      { layout: "full", tone: "dark", figure: { svg: orbit }, title: "Faça a ideia\nganhar espaço.", titleSize: 145, overlay: "left", notes: "Este é o momento de demonstração: substitua pela sua imagem, produto ou visualização. Deixe espaço para a audiência olhar." },
      { layout: "compare", title: "De assistir a participar.", left: { label: "Uma tela", value: "Olhar", valueSize: 145 }, right: { label: "Uma experiência", value: "Agir", valueSize: 145, hl: true }, build: true, notes: "Revele as duas colunas separadamente. Mostre a ação que a audiência pode realizar depois da palestra." },
      { layout: "question", tone: "alert", question: "Qual seria o seu\nprimeiro movimento?", options: ["Testar uma ideia", "Mudar uma pergunta", "Chamar alguém"], timer: 20, notes: "Reserve vinte segundos para uma escolha pessoal. A pausa prepara a chamada final." },
      { layout: "end", title: "Agora é\ncom você.", subtitle: "Uma ideia. Um primeiro movimento.", figure: { svg: orbit }, notes: "Feche com uma ação pequena e concreta, em vez de uma lista de promessas." },
    ],
  },
  pop: {
    title: "Bora tirar\na ideia do papel?", duration: 20, markStyle: "marca-texto",
    slides: (title) => [
      { layout: "cover", title, titleSize: 159, kicker: "Clube criativo · oficina", subtitle: "Curiosidade é o único pré-requisito.", figure: { svg: bauhaus }, notes: "Convide o grupo a experimentar. Ninguém precisa ter uma ideia pronta para começar." },
      { layout: "question", tone: "alert", question: "Se sua ideia fosse\numa forma…", options: ["Um círculo", "Um triângulo", "Um quadrado"], timer: 15, notes: "Quebra-gelo rápido: peça uma escolha e uma frase de explicação. Não há resposta certa." },
      { layout: "headline", tone: "accent", text: "Rascunho\nnão morde.", size: 246, caption: "Dê uma chance à primeira versão.", notes: "Normalize uma primeira tentativa imperfeita. Evite alongar este momento: o exercício vem agora." },
      { layout: "steps", title: "Três movimentos. Uma ideia.", steps: [{ title: "Misture", text: "Junte duas coisas distantes.", icon: "shuffle" }, { title: "Desenhe", text: "Mostre em vez de explicar.", icon: "pencil" }, { title: "Teste", text: "Conte para alguém.", icon: "message-circle" }], build: true, notes: "Revele cada etapa enquanto explica a dinâmica. O grupo deve passar mais tempo fazendo do que ouvindo." },
      { layout: "bento", title: "Seu kit de possibilidades", tiles: [{ title: "E se…?", text: "A pergunta que abre espaço.", size: "big", hl: true }, { icon: "scissors", title: "Corte" }, { icon: "refresh-cw", title: "Inverta" }, { icon: "plus", title: "Combine" }, { icon: "maximize", title: "Exagere" }], notes: "Cada pessoa escolhe uma operação. Use as opções como gatilhos, não como uma lista obrigatória." },
      { layout: "question", tone: "light", question: "Mostre a ideia\nem um rabisco.", context: "Papel, caneta e um minuto.", options: ["Sem apagar", "Sem explicar", "Sem perfeição"], timer: 60, notes: "Inicie o timer ao começar a atividade. Circule pela sala ou desenhe junto na tela com a caneta do apresentador." },
      { layout: "compare", title: "A ideia muda quando circula.", left: { label: "Meu começo", value: "E se…", valueSize: 140 }, right: { label: "Nossa próxima versão", value: "E também!", valueSize: 110, hl: true }, notes: "Peça que cada pessoa acrescente algo ao rascunho de outra. Comentários devem construir uma possibilidade." },
      { layout: "end", tone: "alert", title: "Leve uma ideia.\nDeixe outra.", subtitle: "O próximo rascunho pode ser o melhor.", notes: "Cada pessoa sai com um próximo experimento e compartilha uma descoberta do processo." },
    ],
  },
  aula: {
    title: "Da requisição\nà resposta.", duration: 25, markStyle: "cor",
    slides: (title) => [
      { layout: "cover", title, titleSize: 153, kicker: "Laboratório 01 · APIs", subtitle: "Uma conversa entre o navegador e o servidor.", figure: { svg: terminal }, notes: "Aula de exemplo, executável como apresentação sem servidor de API. As saídas do terminal são ilustrações, não comandos executados." },
      { layout: "question", question: "O que chega primeiro?", options: ["O corpo em JSON", "A resposta HTTP", "O console.log"], hint: "Faça uma previsão antes de ler o código.", notes: "Colete hipóteses sem revelar a resposta. Retome esta pergunta depois do código por etapas." },
      { layout: "split", title: "Um pedido.\nUma resposta.", body: "O navegador pede.\nO servidor responde.", figure: { diagram: "flow", steps: ["Navegador", "API", "JSON"], highlight: 1 }, notes: "Desenhe o caminho do pedido com a caneta. A API responde HTTP; JSON é um possível formato do corpo, não a resposta inteira." },
      { layout: "codewalk", title: "Leia o código em três tempos.", filename: "profile.js", language: "JavaScript", code: "const response = await fetch('/api/profile');\nif (!response.ok) throw new Error('Falha HTTP');\nconst profile = await response.json();\nconsole.log(profile.name);", steps: [{ title: "1. Pedir", text: "fetch resolve com a resposta HTTP. Confira o status.", highlight: [1, 2], output: "HTTP 200 OK" }, { title: "2. Interpretar", text: "Ler o corpo também é uma operação assíncrona.", highlight: [3], output: '{ "id": 42, "name": "Ada", "active": true }' }, { title: "3. Usar", text: "Agora temos um objeto JavaScript.", highlight: [4], output: "Ada" }], notes: "Use os botões de etapa ou as setas. As saídas são previstas para o exemplo; o slide não executa código nem faz requisições.", maxWords: 110 },
      { layout: "spotlight", title: "O pedido por dentro.", image: networkImage, caption: "Exemplo ilustrativo do painel Network.", hotspots: [{ x: 3.5, y: 16, width: 93, height: 8, title: "A rota", text: "GET identifica a leitura de /api/profile." }, { x: 3.5, y: 30, width: 35, height: 24, title: "O contrato", text: "Status e Content-Type descrevem a resposta." }, { x: 42, y: 38, width: 54, height: 38, title: "O corpo", text: "Este JSON vira o objeto profile." }], notes: "Explore cada ponto da imagem. Troque o mockup por um screenshot do seu projeto mantendo os focos nas mesmas coordenadas.", maxWords: 100 },
      { layout: "code", kicker: "A mesma conversa, no terminal", title: "Sem navegador. Com curl.", code: "curl -i http://localhost:3000/api/profile\n\nHTTP/1.1 200 OK\nContent-Type: application/json\n\n{ \"id\": 42, \"name\": \"Ada\" }", highlight: [1, 3, 4], size: 33, note: "-i mostra os cabeçalhos junto com o corpo.", notes: "Saída ilustrativa. Para testar de verdade, substitua a URL pela sua API local e execute o comando no seu terminal." },
      { layout: "question", tone: "accent", question: "E se a API devolver 404?", options: ["fetch lança sozinho", "response.ok é false", "O JSON fica vazio"], timer: 30, notes: "Resposta: response.ok é false. fetch não rejeita só por um status HTTP 404; falhas de rede podem rejeitar. Retome a linha 2 do exemplo." },
      { layout: "compare", title: "Duas falhas. Duas pistas.", left: { label: "HTTP 404", value: "Resposta", valueSize: 100, text: "O servidor respondeu: recurso não encontrado." }, right: { label: "Falha de rede", value: "Rejeição", valueSize: 100, text: "fetch não obteve uma resposta utilizável.", hl: true }, notes: "Diferencie o contrato HTTP de um problema de transporte. CORS, desconexão e DNS também podem aparecer como erro de rede no navegador." },
      { layout: "end", title: "Agora investigue\num pedido seu.", subtitle: "Preveja → observe → explique com suas palavras.", notes: "Atividade: abra Network, escolha um pedido e identifique método, status e corpo. Não exponha tokens ou dados pessoais em capturas compartilhadas." },
    ],
  },
  minimal: {
    title: "Menos ruído.\nMais clareza.", duration: 8, markStyle: "cor",
    slides: (title) => [
      { layout: "statement", title, text: title, size: 165, center: true, kicker: "Essencial", notes: "Uma abertura com espaço. Diga em uma frase o que a audiência vai compreender ao final." },
      { layout: "number", value: 1, label: "ideia por vez", size: 360, notes: "O número é uma regra de composição, não uma estatística. Qual ideia este slide precisa deixar?" },
      { layout: "split", title: "Espaço\ntambém fala.", body: "Uma imagem.\nUma mensagem.", figure: { svg: quiet }, notes: "Troque a ilustração por um visual relacionado ao seu assunto. Retire explicações que podem ser ditas em voz alta." },
      { layout: "compare", title: "A diferença aparece no foco.", left: { label: "Antes", value: "Tudo", valueSize: 150, text: "Muitas mensagens competindo." }, right: { label: "Depois", value: "O centro", valueSize: 132, text: "Uma hierarquia clara.", hl: true }, notes: "Mostre um antes e depois real do seu produto, processo ou ideia." },
      { layout: "statement", tone: "dark", text: "Se tudo é importante,\nnada ==se destaca==.", size: 137, center: true, notes: "Uma pausa visual para fixar a tese. Segure este slide por alguns segundos." },
      { layout: "steps", title: "Um caminho simples.", steps: [{ title: "Escolher", text: "O que precisa ficar." }, { title: "Organizar", text: "O que vem primeiro." }, { title: "Retirar", text: "O que pode sair." }], notes: "Apresente três movimentos para colocar a ideia em prática. Se não forem necessários três, remova um." },
      { layout: "quote", quote: "Qual parte você\nquer que lembrem?", notes: "Esta é uma pergunta para a audiência, sem autoria atribuída. Convide uma pessoa a responder." },
      { layout: "end", tone: "light", title: "É isso.", subtitle: "Uma ideia que fica.", notes: "Repita a ideia central e termine. O silêncio também encerra bem uma apresentação." },
    ],
  },
};

/** Cria uma cópia independente. O título personaliza a abertura; o roteiro continua sendo um exemplo editável. */
export function createExperienceDeck(id, options = {}) {
  const experience = EXPERIENCES.find((item) => item.id === id);
  if (!experience) throw new Error(`Experiência desconhecida: ${id}`);
  const preset = PRESETS[id];
  const title = typeof options.title === "string" && options.title.trim() ? options.title.trim() : preset.title;
  return {
    title,
    theme: experience.theme,
    experience: id,
    lang: "pt-BR",
    duration: preset.duration,
    markStyle: preset.markStyle,
    maxWords: 48,
    defaults: { transition: "fade", footer: false },
    ...(typeof options.topic === "string" && options.topic.trim() ? { briefing: options.topic.trim() } : {}),
    slides: preset.slides(title),
  };
}
