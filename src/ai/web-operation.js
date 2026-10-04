import { defaultWeb } from '../research/research.js';

export function webOnlyRunner({signal,onProgress=()=>{},web=defaultWeb}={}) {
  const run = async command => {
    if (command.language !== 'web') return {denied:true,stderr:'Este servidor oferece pesquisa web; execução de código local está indisponível.'};
    onProgress({phase:'command',text:'Pesquisando na web…'});
    try {return {exitCode:0,stdout:JSON.stringify(await webOperation(JSON.parse(command.code),{web,signal})),stderr:''};}
    catch(e) {if(signal?.aborted)throw e;return {exitCode:1,stdout:'',stderr:e.message};}
  };
  run.description = 'PESQUISA WEB disponível: responda com bloco YAML run: {language: web, why: motivo, code: JSON}. JSON aceita {"action":"search","query":"busca"} ou {"action":"read","url":"URL observada"}. Leia a fonte antes de afirmar fatos. Anexos são exclusivos sem autorização explícita para complementar; blogs e memes servem para humor/opiniões. Não afirme falta de acesso sem tentar. Não peça javascript/python/shell/video: esses comandos estão indisponíveis neste servidor.';
  return run;
}

// Ferramenta de leitura explícita: disponível ao chat, sem depender de o LLM ter navegação própria.
export async function webOperation(request,{web=defaultWeb,signal}={}) {
  signal?.throwIfAborted();
  if (process.env.SAGADECK_WEB === '0') throw Error('Pesquisa web desligada neste servidor.');
  if (request.action === 'search') {
    const query = String(request.query || '').trim();
    if (!query || query.length > 1000) throw Error('Informe uma busca de até 1000 caracteres.');
    const results = await web.search(query);
    signal?.throwIfAborted();
    return {query,results:results.slice(0,10)};
  }
  if (request.action === 'read') {
    const doc = await web.fetch(String(request.url || ''));
    signal?.throwIfAborted();
    return {...doc,text:String(doc.text || '').slice(0,20000)};
  }
  throw Error('web.action: use search ou read.');
}
