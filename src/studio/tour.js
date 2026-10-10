// "Conheça o SagaDeck": a apresentação que todo usuário acha na biblioteca, com tudo o que dá para fazer. Monta-se
// sozinha dos exemplos de layout (layout-samples.js): layout novo entra aqui sem ninguém lembrar (engine.test.js
// confere). Cada slide diz o nome do recurso e a frase para pedir à IA. Abre em prévia, como os modelos da vitrine.
import { LAYOUT_INFO, LAYOUT_SAMPLES, LAYOUT_ASK } from "./layout-samples.js";

export const TOUR_TITLE = "Conheça o SagaDeck";

// os grupos na ordem em que fazem sentido para quem está conhecendo; layout que não estiver em nenhum entra em "Mais"
const GROUPS = [
  ["Abrir e fechar", "capa, seções, agenda e encerramento", ["cover", "section", "agenda", "end", "references"]],
  ["Uma ideia por vez", "frases, números e palavras que ocupam o palco", ["statement", "headline", "quote", "definition", "number", "kinetic", "scenography"]],
  ["Organizar o conteúdo", "listas, cartões, etapas, comparações e linhas do tempo", ["list", "cards", "mosaic", "ribbon", "bento", "split", "compare", "matrix", "steps", "timeline", "calendar", "hub", "infographic", "pyramid", "funnel"]],
  ["Números e dados", "indicadores, gráficos, tabelas e painéis", ["stats", "chart", "table", "map", "onepage", "status", "poster"]],
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
  const groups = [...GROUPS.map(([title, sub, names]) => [title, sub, names.filter((n) => LAYOUT_SAMPLES[n])])];
  const rest = all.filter((n) => !used.has(n));
  if (rest.length) groups.push(["Mais recursos", "os layouts mais novos", rest]);

  const slides = [{
    layout: "cover", kicker: "SAGADECK · TOUR", title: TOUR_TITLE,
    subtitle: "Tudo o que dá para fazer, um slide por recurso. Cada um diz como pedir à IA.",
    figure: { icon: "compass", size: 320 },
    notes: "Navegue à vontade: nada aqui cria arquivo. Embaixo de cada slide (nestas notas) está o nome do recurso e a frase para pedir à IA na sua apresentação.",
  }];
  groups.forEach(([title, sub, names], i) => {
    if (!names.length) return;
    slides.push({ layout: "section", number: i + 1, kicker: `${names.length} recurso${names.length === 1 ? "" : "s"}`, title, subtitle: sub });
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
  });
  slides.push({ layout: "section", number: groups.length + 1, kicker: "Além dos slides", title: "O que mais o SagaDeck faz", subtitle: "IA, importação, exportação e apresentação" });
  slides.push({ layout: "cards", title: "Com a IA", cols: 3, items: EXTRAS.slice(0, 3).map(([icon, title, text]) => ({ icon, title, text })) });
  slides.push({ layout: "cards", title: "Com os seus arquivos", cols: 3, items: EXTRAS.slice(3, 6).map(([icon, title, text]) => ({ icon, title, text })) });
  slides.push({ layout: "cards", title: "Na hora de apresentar", cols: 3, items: EXTRAS.slice(6).map(([icon, title, text]) => ({ icon, title, text })) });
  slides.push({ layout: "end", title: "Agora é a sua vez.", subtitle: "Crie uma apresentação e peça à IA o que você viu aqui." });
  return { title: TOUR_TITLE, theme: "sinal", duration: 30, maxWords: 140, slides };
}
