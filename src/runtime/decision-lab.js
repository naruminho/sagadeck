/* Laboratório didático: taxas hipotéticas homogêneas, nunca previsão de produção. */
(function(root) {
  const defaults = { volume: 10000, errorRate: 2, reviewRate: 100, catchRate: 60, introducedRate: .2, seconds: 30 };
  function normalize(input = {}) {
    const result = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      const n = Number(input[key] ?? fallback);
      result[key] = Math.max(0, Math.min(key === 'volume' ? 10000000 : key === 'seconds' ? 3600 : 100, Number.isFinite(n) ? n : fallback));
    }
    return result;
  }
  function calculate(input) {
    const s = normalize(input), p = s.errorRate / 100, r = s.reviewRate / 100;
    const automatic = s.volume * p;
    const caught = automatic * r * s.catchRate / 100;
    const introduced = s.volume * (1-p) * r * s.introducedRate / 100;
    return { ...s, automatic, caught, introduced, reviewed: automatic - caught + introduced,
      hours: s.volume * r * s.seconds / 3600, delta: introduced - caught };
  }
  const fmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  function mount(container = document) {
    container.querySelectorAll('[data-decision-lab]').forEach(el => {
      if (el.dataset.mounted) return;
      el.dataset.mounted = 'true';
      const initial = normalize(JSON.parse(el.dataset.decisionLab));
      function update() {
        const values = { ...initial };
        el.querySelectorAll('input[data-param]').forEach(input => { values[input.dataset.param] = Number(input.value); });
        const result = calculate(values);
        el.querySelectorAll('[data-output]').forEach(out => { out.textContent = fmt(result[out.dataset.output]); });
        const verdict = el.querySelector('[data-verdict]');
        verdict.textContent = Math.abs(result.delta) < .000001 ? 'Mesmo total esperado de erros' : result.delta < 0 ? `${fmt(-result.delta)} erros a menos com revisão` : `${fmt(result.delta)} erros a mais com revisão`;
        verdict.dataset.result = result.delta > 0 ? 'worse' : result.delta < 0 ? 'better' : 'equal';
      }
      el.addEventListener('input', update);
      // As setas ajustam o controle, sem trocar o slide.
      el.addEventListener('keydown', e => { if (e.target.matches('input,button')) e.stopPropagation(); });
      el.querySelector('[data-reset]').addEventListener('click', () => {
        el.querySelectorAll('input[data-param]').forEach(input => { input.value = initial[input.dataset.param]; }); update();
      });
      update();
    });
  }
  root.SagaDecisionLab = { calculate, normalize, mount };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount());
    else mount();
  }
})(globalThis);
