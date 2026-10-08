// Selo de origem do conteúdo na miniatura (deck feito de um material anexado). "material" é o normal e não leva selo;
// o que o sagadeck incluiu (provenance: proprio) ou calculou do material (derivado) aparece, para a pessoa saber o
// que não é do paper. Saiu do app.js pela trava de tamanho dos monolitos.
window.SagaProvenance = function (slide, hydrateIcons) {
  if (slide?.provenance !== "proprio" && slide?.provenance !== "derivado") return null;
  const own = slide.provenance === "proprio";
  const pv = document.createElement("span");
  pv.className = `thumb-prov prov-${slide.provenance}`;
  pv.innerHTML = `<i class="ic" data-ic="${own ? "sparkles" : "chart-column"}"></i><span>${own ? "sagadeck" : "derivado"}</span>`;
  hydrateIcons(pv);
  pv.title = `${own ? "Incluído pelo sagadeck: não está no material" : "Feito pelo sagadeck a partir dos números do material"}${slide.provenanceNote ? ` — ${slide.provenanceNote}` : ""}`;
  return pv;
};
