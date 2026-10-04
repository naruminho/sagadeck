import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {videoFrame} from '../src/ai/video-frames.js';
import {VIDEO_COMMAND_RULES} from '../src/ai/commands.js';
test('direção de vídeo distingue loop ambiente de abertura e preserva frame e camadas',()=>{
 assert.match(VIDEO_COMMAND_RULES,/loop: false/);assert.match(VIDEO_COMMAND_RULES,/DEPOIS do vídeo/);assert.match(VIDEO_COMMAND_RULES,/texto NOVO/);assert.match(VIDEO_COMMAND_RULES,/mediaTime/);
});
test('frame para vídeo usa slide nativo, salva localmente e não depende de provedor',async()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'sagadeck-video-frame-'));fs.writeFileSync(path.join(cwd,'deck.yaml'),'slides:\n  - {layout: cover, title: Evento}\n');
 try{let captured;const snapshot=async(spec,index,options)=>{captured={spec,index,options};return [{dataUrl:'data:image/jpeg;base64,YWJj'}]};const result=await videoFrame({slide:1,out:'imagens/inicio.jpg'},{cwd,snapshot});assert.equal(result.costIncurred,false);assert.equal(captured.spec.slides[0].title,'Evento');assert.equal(captured.index,0);assert.equal(captured.options.width,1920);assert.equal(fs.readFileSync(path.join(cwd,result.file),'utf8'),'abc');await assert.rejects(videoFrame({slide:1,out:'../fora.jpg'},{cwd,snapshot}),/pasta da apresentação/);await assert.rejects(videoFrame({slide:2},{cwd,snapshot}),/slide existente/);}
 finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
