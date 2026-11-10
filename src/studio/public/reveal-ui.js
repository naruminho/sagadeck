// Revelar sem spoiler e cor por ato, do lado do Studio: o seletor de cliques do editor, as miniaturas que acompanham
// a paleta "deste slide em diante" (sectionPalette) e os campos do formulário comuns a todo slide.
(function () {
  const PALETTES = ["tema", "tinta", "floresta", "mar", "entardecer", "lavanda", "grafite", "neon", "areia", "cereja", "corporativo", "rubi", "ametista", "tangerina", "safira", "esmeralda", "luzquente"];

  // quantos cliques o slide tem: o que entra (data-step), o que sai (data-exit) e o cartão que vira (data-flip-step)
  function totalSteps(root) {
    let m = 0;
    for (const [sel, key] of [["[data-step]", "step"], ["[data-exit]", "exit"], ["[data-flip-step]", "flipStep"]])
      root.querySelectorAll(sel).forEach((e) => { m = Math.max(m, +e.dataset[key] || 0); });
    return m;
  }

  // mostra o slide como a plateia vê no clique k (Infinity = "Tudo", a visão de edição)
  function applyStep(root, k) {
    const all = k === Infinity;
    root.querySelectorAll("[data-step]").forEach((e) => e.classList.toggle("in", k >= +e.dataset.step));
    root.querySelectorAll("[data-exit]").forEach((e) => e.classList.toggle("out", !all && k >= +e.dataset.exit));
    // pergunta que dá lugar à resposta (titleAfter, guess): em "Tudo" fica só a resposta, senão as duas se sobrepõem
    if (all) root.querySelectorAll(".swap-q").forEach((e) => e.classList.add("out"));
    root.querySelectorAll("[data-flip-step]").forEach((e) => e.classList.toggle("flipped", !all && k >= +e.dataset.flipStep));
  }

  // paleta do ato que vale no slide idx (o sectionPalette mais próximo, dele para trás), como texto para chave de cache
  function actPaletteAt(slides, idx) {
    for (let k = Math.min(idx, (slides || []).length - 1); k >= 0; k--) { const v = slides[k]?.sectionPalette; if (v != null && v !== "") return JSON.stringify(v); }
    return "";
  }
  // assinatura de todos os sectionPalette do deck: mudou, as miniaturas dali em diante mudam de cara
  const actSignature = (slides) => JSON.stringify((slides || []).map((x, i) => (x?.sectionPalette != null && x.sectionPalette !== "" ? [i, x.sectionPalette] : 0)).filter(Boolean));

  // campos comuns a todo slide (entram em "Mais opções" do formulário)
  const commonFields = (f) => [
    f.num("sourceStep", "Fonte no clique", { hint: "Quando o nome do estudo entregaria a resposta antes da hora" }),
    f.text("titleAfter", "Título depois do clique (a conclusão)", { hint: "O título vira este no clique: pergunte em cima, responda aqui" }),
    f.num("titleAfterStep", "Trocar o título no clique"),
    f.bool("optional", "Opcional (pode pular se o tempo apertar)"),
    f.text("sectionPalette", "Paleta deste slide em diante", { datalist: PALETTES, hint: "Vale até o próximo slide que também tiver uma. Use no slide de seção: uma cor por parte" }),
  ];

  // número grande: o palpite antes do valor
  const numberFields = (f) => [
    f.text("guess", "Pergunta antes do número (palpite)", { hint: "Aparece com um ? no lugar do número; o valor entra no clique" }),
    f.num("valueStep", "Número no clique"),
  ];
  // cartões: de uma vez, um por clique, ou um por clique virando no seguinte
  const cardsBuild = (f) => f.select("build", "Revelar", [["true", "Um por clique"], ["flip", "Um por clique, e vira no seguinte"]], { empty: "Todos de uma vez", parse: (v) => (v === "true" ? true : v) });

  window.SagaReveal = { totalSteps, applyStep, actPaletteAt, actSignature, common: commonFields, number: numberFields, cards: cardsBuild };
})();
