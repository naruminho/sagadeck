import {test} from 'node:test';import assert from 'node:assert/strict';
import {rasterizeWebSVG} from '../src/research/svg-image.js';
import {browserOrSkip} from './helpers.js';
import http from 'node:http';
import {fetchWebImage} from '../src/ai/context.js';
import {pageVisuals} from '../src/research/visuals.js';
test('pesquisa oferece arquivo vetorial original observado no link da página',()=>{
 const images=pageVisuals('<a href="/original.svg">Original file</a><a href="/other.html">Página</a>','https://example.test/logo');assert.equal(images.length,1);assert.equal(images[0].url,'https://example.test/original.svg');
});

test('SVG web vira PNG transparente com proporção preservada e rejeita conteúdo ativo',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;await browser.close();
 const png=await rasterizeWebSVG(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><path fill="red" d="M0 0h200v50H0z"/></svg>'));
 assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),1600);assert.equal(png.readUInt32BE(20),400);
 await assert.rejects(rasterizeWebSVG(Buffer.from('<svg><script>alert(1)</script></svg>')),/ativo/);
 await assert.rejects(rasterizeWebSVG(Buffer.from('<svg><image href="https://example.test/track"/></svg>')),/autocontido/);
});
test('importador web aceita SVG e devolve imagem PNG com URL original',async t=>{
 const browser=await browserOrSkip(t);if(!browser)return;await browser.close();
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="red"/></svg>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${server.address().port}/logo.svg`,result=await fetchWebImage(url,{allowLocal:true});assert.equal(result.mime,'image/png');assert.equal(result.url,url);assert.equal(result.data.readUInt32BE(16),1600);}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
