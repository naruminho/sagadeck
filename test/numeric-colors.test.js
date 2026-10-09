import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {el} from '../src/elements.js';
import {chart} from '../src/figures/charts.js';
import {motionOptions} from '../src/motion.js';
test('cores hex somente com dígitos permanecem válidas quando YAML produz número',()=>{
 assert.match(el({text:'Título',color:123456}),/color:#123456/);
 assert.match(el({shape:'rect',bg:123456,w:100,h:50}),/background:#123456/);
 assert.match(chart({chart:'bar',data:[{label:'A',value:10,color:123456}]}),/#123456/);
 assert.equal(motionOptions({type:'hologram',foreground:123456}).foreground,'#123456');
});
