// Para que serve o material (deck.purpose): quem decide é a IA, lendo o pedido (ou a pessoa, no Studio). Muda quanto
// texto cabe num slide antes do fiscal "anti-sono" reclamar e o que a IA e a auto-correção fazem com o texto:
// material de consulta/aula guarda a explicação NO slide; palestra e executiva deixam pouco texto e o resto em notes.
// São dois usos: apresentar (letra grande, respiro, pouco texto, para não dar sono) ou estudar depois (o material é
// enviado e vira fonte de estudo: conteúdo denso). aula, workshop e executiva são de decks antigos: continuam valendo,
// mas nem o Studio nem a IA oferecem mais.
export const PURPOSES = {
  palestra: { label: "Para apresentar", hint: "letra grande e pouco texto: a apresentação fica dinâmica e não dá sono", maxWords: 40, dense: false },
  consulta: { label: "Para estudar depois", hint: "o material vai ser enviado e usado como fonte de estudo: conteúdo denso", maxWords: 220, dense: true },
  aula: { label: "Aula (antigo)", hint: "", maxWords: 160, dense: true, legacy: true },
  workshop: { label: "Workshop (antigo)", hint: "", maxWords: 110, dense: false, legacy: true },
  executiva: { label: "Executiva (antigo)", hint: "", maxWords: 40, dense: false, legacy: true },
};

const LAYOUT_WORDS = { onepage: 120, status: 90, solution: 140, calc: 90, algo: 60 }; // densos por natureza (uma página com tudo; exercício resolvido se revela aos poucos)

// Limite de palavras na tela de um slide: o do slide > o do deck > o do propósito (ou do layout, se maior) > 40
export function wordLimit(s = {}, spec = {}, layout = s.layout) {
  if (s.maxWords) return s.maxWords;
  if (spec.maxWords) return spec.maxWords;
  return Math.max(PURPOSES[spec.purpose]?.maxWords || 0, LAYOUT_WORDS[layout] || 0) || 40;
}

export const isDense = (spec = {}) => !!PURPOSES[spec.purpose]?.dense;
