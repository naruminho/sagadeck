// Formulário das experiências; carregado antes de slide-form.js.
window.SagaCalcFields = (f, obj) => [f.text("kicker", "Chapéu"), f.text("title", "Título"), f.json("inputs", "Entradas", { rows: 8, hint: "{ V: { label, value, min, max, step, unit, latex }, nu: { value, fixed: true } } — cada entrada vira um controle deslizante (fixed: constante)." }),
      f.list("outputs", "Resultados (na ordem: um pode usar os anteriores)", obj([f.text("name", "Nome (para usar nas fórmulas)", { mono: true }), f.text("label", "Rótulo"), f.text("fn", "Fórmula", { mono: true, placeholder: "V*D/nu" }), f.text("latex", "Fórmula para mostrar (LaTeX)", { mono: true }), f.text("unit", "Unidade"), f.num("decimals", "Casas decimais"),
        f.more([f.text("of", "Faixas de qual valor?", { mono: true }), f.json("cases", "Faixas", { hint: "[{ below: 2300, text: Laminar, color: s3 }, { text: Turbulento, color: hi }] — ou fn por faixa" }), f.json("scale", "Régua", { hint: "{ min: 100, max: 1000000, log: true }" })])]),
        { addLabel: "Adicionar resultado", newItem: () => ({ name: "r", label: "Resultado", fn: "" }) }),
      f.text("prediction", "Pergunta antes de revelar"),
      f.text("sweep", "Entrada no eixo da curva", { hint: "Nome da entrada; as outras ficam nos valores atuais." }),
      f.text("explanation", "O que observar ao explorar"),
      f.bool("illustrative", "Simulação ilustrativa"),
      f.list("scenarios", "Cenários", obj([f.text("label", "Nome"), f.json("values", "Valores das entradas", { hint: '{ "V": 0.02 }' }), f.text("explanation", "O que este cenário mostra")]), { addLabel: "Adicionar cenário", newItem: () => ({ label: "Novo cenário", values: {} }) }),
      f.text("note", "Nota embaixo")];
