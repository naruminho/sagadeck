// Gerar uma apresentação pelo caminho do Studio ("Criar com IA" e chat de deck novo): Preferências, anexos guardados
// na pasta do deck (com o inventário visual), imagens, revisão pelos slides renderizados e pesquisa. Fica fora do
// servidor para a avaliação ao vivo (test/bench-live.test.js) medir exatamente o que a pessoa recebe.
import path from "node:path";
import { generateDeck } from "../ai/deck-ai.js";
import { prepareDocumentMaterials } from "../ai/document-materials.js";
import { reviewExperience } from "../ai/quality.js";
import { stageBoard } from "../ai/progress.js";
import { loadPreferences } from "../preferences.js";
import { slideSnapshots, diagramCheck } from "./snapshot.js";

const DOCUMENT = /\.(pdf|docx?)$/i;

// b: o corpo do pedido (briefing, answer, theme, style, slides, duration, direction); materials: [{ name, text, detail, bytes }]
// O inventário do documento (a visão lendo página a página: minutos num paper) corre JUNTO com o resto: entender o
// pedido, pesquisar e a leitura crítica usam só o texto; a escrita espera o inventário. Parou antes (a IA perguntou,
// deu erro): o inventário é cancelado e a pasta fica livre.
export async function generateForStudio(b, { dir, materials = [], emit, prefs = loadPreferences().ia, prepare = prepareDocumentMaterials } = {}) {
  const board = stageBoard((ev) => emit?.(ev));
  const stop = new AbortController();
  const withBytes = materials.some((m) => m.bytes);
  const pending = withBytes ? board.run("Lendo o documento", (onProgress) => prepare(materials, dir, { onProgress, signal: stop.signal })) : null;
  pending?.catch(() => {}); // quem espera é a geração; se ela parou antes, o erro do cancelamento não importa
  // enquanto isso, o texto do documento (o binário fica com o inventário); `document` marca que é um documento
  const text = materials.map(({ bytes, ...m }) => (bytes && DOCUMENT.test(m.name || "") ? { ...m, document: true } : m));
  try {
    const gen = await generateDeck(String(b.briefing || ""), {
      ask: prefs.perguntar !== false && !b.answer, answer: b.answer ? String(b.answer).slice(0, 500) : "",
      author: prefs.autor || "", language: prefs.idioma || "auto",
      theme: b.theme || undefined,
      style: b.style || undefined,
      slides: Number(b.slides) || undefined,
      duration: Number(b.duration) || undefined,
      direction: b.direction || undefined,
      materials: text,
      pendingMaterials: pending,
      board,
      images: prefs.imagens !== false, // o briefing diz se quer imagens (e onde); Preferências podem desligar
      imageOptions: { baseDir: dir, assetsDir: path.join(dir, "imagens") },
      onEvent: emit,
      drawCheck: diagramCheck,
      reviewCheck: (deck, indices, o = {}) => reviewExperience({ ...deck, _dir: dir }, indices, { snapshot: slideSnapshots, onProgress: o.onProgress || emit, briefing: b.briefing }),
      // pesquisa na web quando a IA decidir que precisa (Preferências › IA pode desligar; SAGADECK_WEB=0 no banco);
      // as fontes lidas ficam em contexto/pesquisa/ do deck
      research: prefs.pesquisa === false ? false : "auto",
      researchDir: dir,
    });
    return gen;
  } finally {
    stop.abort();
    await pending?.catch(() => {});
  }
}
