import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderSlide} from '../src/build.js';

test('figura informativa usa área dominante e nunca sangra ou cobre a legenda por padrão',()=>{
  const figure={image:'contexto/visuais/source/chart.png'};
  const stacked=renderSlide({layout:'split',title:'Resultado',body:'Resumo',figure},0,{}).html;
  assert.match(stacked,/sp-stacked/);
  const explicit=renderSlide({layout:'split',ratio:'1:2',title:'Resultado',figure},0,{}).html;
  assert.doesNotMatch(explicit,/sp-stacked/);
  const full=renderSlide({layout:'image',title:'Resultado',figure},0,{}).html;
  assert.match(full,/im-contain/);assert.doesNotMatch(full,/class="im-cap"/);
  const decorative=renderSlide({layout:'split',figure:{icon:'star'}},0,{}).html;
  assert.doesNotMatch(decorative,/sp-stacked/);
});

// Retorno de uso (10/11): split empilhado com duas fórmulas em destaque no texto; a tabela virou uma tira ilegível.
test('split empilhado com resumo pesado (fórmula em destaque, texto longo) fica lado a lado', () => {
  const figure = { table: { head: ['Intervenção', 'k'], rows: [['Jardins', '0,35'], ['Pavimentos', '0,12']] } };
  const formula = renderSlide({ layout: 'split', arrangement: 'stacked', title: 'Objetivo 3', body: 'Carga inicial.\n\n$$e_i = e_{max}(1 - e^{-kA})$$\n\ne a carga residual.', figure }, 0, {}).html;
  assert.doesNotMatch(formula, /sp-stacked/);
  const long = renderSlide({ layout: 'split', title: 'Resultado', body: 'palavra '.repeat(40), figure }, 0, {}).html;
  assert.doesNotMatch(long, /sp-stacked/);
  assert.match(renderSlide({ layout: 'split', arrangement: 'stacked', title: 'Resultado', body: 'Resumo curto.', figure }, 0, {}).html, /sp-stacked/);
});
