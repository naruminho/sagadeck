import './runtime/decision-lab.js';
import { esc } from './markup.js';
import { formatNumber } from './locale.js';
export const calculateDecisionLab = globalThis.SagaDecisionLab.calculate;
export function decisionLabHTML(input = {}) {
  const v = globalThis.SagaDecisionLab.normalize(input), r = calculateDecisionLab(v);
  const fmt = n => formatNumber(n, { maximumFractionDigits: 1 });
  const controls = [
    ['errorRate', 'Erros da automação (%)', 100, .1],
    ['reviewRate', 'Casos revisados (%)', 100, 1],
    ['catchRate', 'Erros que o revisor corrige (%)', 100, 1],
    ['introducedRate', 'Acertos que o revisor estraga (%)', 100, .1],
  ];
  return `<div class="decision-lab" data-decision-lab="${esc(JSON.stringify(v))}">
    <div class="dl-controls">${controls.map(([key,label,max,step]) => `<label>${label}<output data-output="${key}">${fmt(v[key])}</output><input aria-label="${label}" data-param="${key}" type="range" min="0" max="${max}" step="${step}" value="${v[key]}"></label>`).join('')}<button type="button" data-reset>Restaurar premissas</button></div>
    <div class="dl-results" aria-live="polite"><div class="dl-compare"><article><span>Automação sozinha</span><strong data-output="automatic">${fmt(r.automatic)}</strong><small>erros esperados</small></article><article><span>Com revisão</span><strong data-output="reviewed">${fmt(r.reviewed)}</strong><small>erros esperados</small></article></div>
    <p class="dl-verdict" data-verdict>${fmt(Math.abs(r.delta))} erros ${r.delta > 0 ? 'a mais' : 'a menos'} com revisão</p>
    <p class="dl-detail"><b data-output="caught">${fmt(r.caught)}</b> corrigidos · <b data-output="introduced">${fmt(r.introduced)}</b> introduzidos<br><b data-output="hours">${fmt(r.hours)}</b> horas de revisão</p></div>
    <div class="dl-assumptions">Simulação hipotética · ${fmt(v.volume)} decisões · ${fmt(v.seconds)} s/revisão · taxas constantes, revisão sem seleção por risco. Não estima danos nem filas.</div>
  </div>`;
}
