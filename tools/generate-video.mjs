// CLI do mesmo recurso exposto ao chat; cada operação termina sem espera longa.
import {parseVideoArgs,videoOperation} from '../src/ai/video-generation.js';
const args=parseVideoArgs(process.argv.slice(2));
if(args.help){console.log('Uso: node tools/generate-video.mjs --action plan|submit|status|download --prompt "descrição" --out videos/cena.mp4 [--id job] [--dry-run]');process.exit(0);}
try{const result=await videoOperation({...args,action:args['dry-run']?'plan':args.action||'plan'},{cwd:process.cwd()});console.log(JSON.stringify(result,null,2));}
catch(e){console.error(e.message);process.exitCode=1;}
