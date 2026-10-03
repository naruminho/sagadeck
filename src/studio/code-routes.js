import path from 'node:path';
import { runCommand, logCommand } from '../ai/commands.js';
import { downloadYoutube } from './video-download.js';

// O botão Executar é a autorização do apresentador. Mesmas permissões do chat.
export async function codeRoutes({ req, res, pathname, W, readJSON, commandsAllowed, commandEnv, isBundledTemplate }) {
  if (!['/api/code/state','/api/code/run','/api/video/download'].includes(pathname)) return false;
  const send = (status, data) => { res.writeHead(status, {'Content-Type':'application/json'});res.end(JSON.stringify(data)); };
  const allowed = commandsAllowed(req, W) && !!W.file && !isBundledTemplate(W.file);
  if (pathname.endsWith('/state') && req.method === 'GET') {send(200,{allowed, engines:['python','javascript']});return true;}
  if (req.method !== 'POST') {send(405,{error:'Use POST para executar.'});return true;}
  if (!allowed) {send(403,{error:'Execução nativa indisponível neste workspace.'});return true;}
  try {
    const b = await readJSON(req);
    if (pathname === '/api/video/download') {send(200,await downloadYoutube(b.url,path.dirname(W.file)));return true;}
    if (!['python','javascript'].includes(b.language)) throw new Error('Escolha Python ou JavaScript.');
    const {env,mask} = await commandEnv(W);
    const started = Date.now();
    const result = await runCommand({language:b.language,code:b.code,why:'Execução no laboratório da apresentação'}, {cwd:path.dirname(W.file),env,mask});
    logCommand({language:b.language,code:b.code,output:result.stdout+'\n'+result.stderr,exitCode:result.exitCode,source:'codelab'},{mask});
    send(200,{...result,elapsedMs:Date.now()-started});
  } catch (e) {send(400,{error:e.message});}
  return true;
}
