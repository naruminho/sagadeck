// Frame nativo da apresentação: referência visual local para gerar um clipe.
import fs from 'node:fs';
import path from 'node:path';
import {loadSpec} from '../build.js';
import {slideSnapshots} from '../studio/snapshot.js';

export async function videoFrame(request,{cwd,snapshot=slideSnapshots}={}) {
 if(!cwd)throw Error('Abra uma apresentação salva para capturar um frame.');
 const root=path.resolve(cwd);
 const within=name=>{const file=path.resolve(root,name),rel=path.relative(root,file);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('O frame e o deck devem ficar na pasta da apresentação.');return file;};
 const files=fs.readdirSync(root).filter(name=>/\.ya?ml$/i.test(name));
 const name=request.deck||files.find(name=>path.basename(name,path.extname(name))===path.basename(root))||(files.length===1?files[0]:null);
 if(!name)throw Error('Informe deck com o nome do YAML desta apresentação.');
 const spec=loadSpec(within(name));
 const index=Number(request.slide)-1;
 if(!Number.isInteger(index)||!spec.slides[index])throw Error('slide deve ser o número de um slide existente, começando em 1.');
 const output=within(request.out||`imagens/frame-slide-${index+1}.jpg`);
 if(!/\.jpe?g$/i.test(output))throw Error('O frame nativo deve ser salvo como JPG.');
 if(fs.existsSync(output))throw Error('O frame de saída já existe; escolha outro nome.');
 const frames=await snapshot(spec,index,{mode:'final',width:1920,maxFrames:1});
 if(!frames[0]?.dataUrl?.startsWith('data:image/jpeg;base64,'))throw Error('Não foi possível capturar o slide.');
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.from(frames[0].dataUrl.split(',')[1],'base64'),{flag:'wx'});
 return {action:'frame',costIncurred:false,slide:index+1,file:path.relative(root,output).split(path.sep).join('/'),width:1920};
}
