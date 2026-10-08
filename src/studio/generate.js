// Gerar uma apresentação pelo caminho do Studio ("Criar com IA" e chat de deck novo): Preferências, anexos guardados
// na pasta do deck (com o inventário visual), imagens, revisão pelos slides renderizados e pesquisa. Fica fora do
// servidor para a bancada de qualidade (test/bench-live.test.js) medir exatamente o que a pessoa recebe.
import path from "node:path";
import { generateDeck } from "../ai/deck-ai.js";
import { prepareDocumentMaterials } from "../ai/document-materials.js";
import { reviewExperience } from "../ai/quality.js";
import { loadPreferences } from "../preferences.js";
import { slideSnapshots, diagramCheck } from "./snapshot.js";

// b: o corpo do pedido (briefing, answer, theme, style, slides, duration, direction); materials: [{ name, text, detail, bytes }]
export async function generateForStudio(b, { dir, materials = [], emit, prefs = loadPreferences().ia } = {}) {
  return generateDeck(String(b.briefing || ""), {
    ask: prefs.perguntar !== false && !b.answer, answer: b.answer ? String(b.answer).slice(0, 500) : "",
    author: prefs.autor || "", language: prefs.idioma || "auto",
    theme: b.theme || undefined,
    style: b.style || undefined,
    slides: Number(b.slides) || undefined,
    duration: Number(b.duration) || undefined,
    direction: b.direction || undefined,
    materials: await prepareDocumentMaterials(materials, dir, { onProgress: emit }),
    images: prefs.imagens !== false, // o briefing diz se quer imagens (e onde); Preferências podem desligar
    imageOptions: { baseDir: dir, assetsDir: path.join(dir, "imagens") },
    onEvent: emit,
    drawCheck: diagramCheck,
    reviewCheck: (deck, indices) => reviewExperience({ ...deck, _dir: dir }, indices, { snapshot: slideSnapshots, onProgress: emit, briefing: b.briefing }),
    // pesquisa na web quando a IA decidir que precisa (Preferências › IA pode desligar; SAGADECK_WEB=0 no banco);
    // as fontes lidas ficam em contexto/pesquisa/ do deck
    research: prefs.pesquisa === false ? false : "auto",
    researchDir: dir,
  });
}
