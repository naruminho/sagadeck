import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ART_DIRECTION, MEDIA_FINISH, mediaPrompt} from '../src/ai/art-direction.js';
import {systemPrompt} from '../src/ai/deck-ai.js';
import {reviewExperience} from '../src/ai/quality.js';
import {videoOperation} from '../src/ai/video-generation.js';

test('direção transversal chega ao agente e ao revisor visual',async()=>{
 assert.ok(systemPrompt().includes(ART_DIRECTION));
 const calls=[];
 await reviewExperience({slides:[{layout:'cover',title:'Teste'}]},[0],{snapshot:async()=>[{dataUrl:'data:image/png;base64,a'}],complete:async messages=>{calls.push(messages);return {text:'{"issues":[]}'};}});
 assert.ok(calls[0].some(m=>m.content.includes?.(ART_DIRECTION)));
 assert.match(ART_DIRECTION,/Preserve fotos, dados e figuras originais/);
});
test('plano de vídeo expõe o acabamento enviado ao provedor, sem gerar nem cobrar',async()=>{
 const calls=[];
 const result=await videoOperation({action:'plan',prompt:'Rotating hologram',duration:4},{key:'test',fetcher:async(url,options)=>{calls.push(options.method);return {ok:true,json:async()=>({data:[{id:'google/veo-3.1-lite'}]})};}});
 assert.ok(result.request.prompt.includes(MEDIA_FINISH));
 assert.equal(result.costIncurred,false);assert.deepEqual(calls,['GET']);
 assert.equal(mediaPrompt(mediaPrompt('Scene')),mediaPrompt('Scene'));
});
