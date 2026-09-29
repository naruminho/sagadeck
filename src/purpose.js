// Para que serve o material (deck.purpose): quem decide é a IA, lendo o pedido (ou a pessoa, no Studio). Muda quanto
// texto cabe num slide antes do fiscal "anti-sono" reclamar e o que a IA e a auto-correção fazem com o texto:
// material de consulta/aula guarda a explicação NO slide; palestra e executiva deixam pouco texto e o resto em notes.
export const PURPOSES = {
  consulta: { label: "Material de consulta", hint: "apostila, documentação, guia para distribuir", maxWords: 220, dense: true },
  aula: { label: "Aula ou tutorial", hint: "explicação na tela, com exemplos e código", maxWords: 160, dense: true },
  workshop: { label: "Workshop", hint: "mão na massa: passos, comandos e exercícios", maxWords: 110, dense: false },
  palestra: { label: "Palestra", hint: "para apresentar: uma ideia por slide", maxWords: 40, dense: false },
  executiva: { label: "Apresentação executiva", hint: "decisão, números e recomendação", maxWords: 40, dense: false },
};

const LAYOUT_WORDS = { onepage: 120, status: 90 }; // densos por natureza (uma página com tudo)

// Limite de palavras na tela de um slide: o do slide > o do deck > o do propósito (ou do layout, se maior) > 40
export function wordLimit(s = {}, spec = {}, layout = s.layout) {
  if (s.maxWords) return s.maxWords;
  if (spec.maxWords) return spec.maxWords;
  return Math.max(PURPOSES[spec.purpose]?.maxWords || 0, LAYOUT_WORDS[layout] || 0) || 40;
}

export const isDense = (spec = {}) => !!PURPOSES[spec.purpose]?.dense;
