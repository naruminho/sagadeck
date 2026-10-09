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
