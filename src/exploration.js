// Contrato compartilhado por apresentação, agente e material de estudo.
import { calcModel, calcEvaluate } from './lessons.js';

export function explorationStates(slide) {
  const model = calcModel(slide);
  const base = Object.fromEntries(model.inputs.map(i => [i.name, i.value]));
  return [{ label: 'Inicial', values: base, explanation: slide.explanation || '' },
    ...(slide.scenarios || []).map(s => ({ label: String(s.label || 'Cenário'), values: { ...base, ...s.values }, explanation: String(s.explanation || '') }))]
    .map(s => ({ ...s, results: calcEvaluate(model, s.values) }));
}

export function auditExploration(slide) {
  if (slide.layout !== 'calc') return [];
  const model = calcModel(slide), errors = [];
  const names = model.inputs.map(i => i.name);
  if (slide.sweep && !names.includes(slide.sweep)) errors.push('O eixo da curva precisa ser uma entrada existente.');
  for (const i of model.inputs) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(i.name)) errors.push(`Entrada inválida: ${i.name}`);
    if (![i.value, i.min, i.max, i.step].every(Number.isFinite) || i.min >= i.max || i.step <= 0 || (!i.fixed && (i.value < i.min || i.value > i.max))) errors.push(`Faixa inválida: ${i.name}`);
  }
  const all = [...names, ...model.outputs.map(o => o.name)];
  if (new Set(all).size !== all.length) errors.push('Entradas e resultados precisam de nomes únicos.');
  for (const s of slide.scenarios || []) for (const [name, value] of Object.entries(s.values || {})) {
    const i = model.inputs.find(i => i.name === name);
    if (!i || i.fixed || !Number.isFinite(value) || value < i.min || value > i.max) errors.push(`Cenário ${s.label}: valor inválido de ${name}`);
  }
  const samples = explorationStates(slide);
  for (const i of model.inputs.filter(i => !i.fixed)) for (const value of [i.min, (i.min + i.max) / 2, i.max]) samples.push({ label: `${i.name}=${value}`, results: calcEvaluate(model, { [i.name]: value }) });
  for (const s of samples) for (const [name, r] of Object.entries(s.results)) if (r.error || (r.value != null && !Number.isFinite(r.value))) errors.push(`${s.label}, ${name}: ${r.error || 'resultado não finito'}`);
  return [...new Set(errors)];
}
