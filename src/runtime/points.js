// Morph da figura de pontos: cada luzinha viaja da forma A para a B (clique ou Enter/Espaço).
for (const root of document.querySelectorAll("[data-points-morph]")) {
  const dots = [...root.querySelectorAll(".pts-dot")];
  const model = JSON.parse(root.querySelector(".pts-model").textContent);
  const legend = root.querySelector(".pts-legend");
  let morphed = false;
  const apply = () => {
    const to = morphed ? model.b : model.a;
    dots.forEach((d, i) => {
      const p = to[i % to.length];
      d.style.transform = `translate(${(p.x - +d.getAttribute("cx")).toFixed(2)}px,${(p.y - +d.getAttribute("cy")).toFixed(2)}px)`;
    });
    root.dataset.morphed = String(morphed);
    if (legend) legend.textContent = morphed ? legend.dataset.legendaB : legend.dataset.legendaA;
  };
  const toggle = () => { morphed = !morphed; apply(); };
  root.addEventListener("click", toggle);
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
}
