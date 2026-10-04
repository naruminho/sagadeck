import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webOperation,webOnlyRunner} from '../src/ai/web-operation.js';
import {commandRequest,runCommand,COMMAND_RULES} from '../src/ai/commands.js';
import {tempDeck} from './helpers.js';

test('chat tem busca e leitura reais, com resultados e erros explícitos',async()=>{
  const previous=process.env.SAGADECK_WEB;delete process.env.SAGADECK_WEB;
  try {
    const web={search:async q=>[{title:'Crítica informal',url:'https://example.test/meme',query:q}],fetch:async()=>({text:'opinião '.repeat(5000),detail:'página'})};
    assert.equal((await webOperation({action:'search',query:'meme'},{web})).results[0].title,'Crítica informal');
    assert.equal((await webOperation({action:'read',url:'https://example.test/meme'},{web})).text.length,20000);
    assert.equal(commandRequest({language:'web',code:'{"action":"search","query":"meme"}'}).language,'web');
    assert.match(COMMAND_RULES,/ferramenta real de busca/);
    process.env.SAGADECK_WEB='0';
    const deck=tempDeck();
    try {const result=await runCommand({language:'web',code:'{"action":"search","query":"meme"}'},{cwd:deck.dir});assert.equal(result.exitCode,1);assert.match(result.stderr,/desligada/);} finally {deck.cleanup();}
  } finally {if(previous==null)delete process.env.SAGADECK_WEB;else process.env.SAGADECK_WEB=previous;}
});

test('Oracle pode pesquisar sem liberar comandos arbitrários de outros usuários',async()=>{
  const previous=process.env.SAGADECK_WEB;delete process.env.SAGADECK_WEB;
  try {
    const runner=webOnlyRunner({web:{search:async()=>[{title:'Fonte',url:'https://example.test'}]}});
    const result=await runner({language:'web',code:'{"action":"search","query":"fonte"}'});
    assert.equal(result.exitCode,0);assert.match(result.stdout,/Fonte/);
    assert.equal((await runner({language:'javascript',code:'console.log(1)'})).denied,true);
    assert.match(runner.description,/comandos estão indisponíveis/);
  } finally {if(previous==null)delete process.env.SAGADECK_WEB;else process.env.SAGADECK_WEB=previous;}
});
