import {chromium} from 'playwright-core';
import {findBrowser} from '../export/browser.js';

// SVG remoto vira PNG: não entra como documento ativo no HTML portátil.
export async function rasterizeWebSVG(data){
 const source=data.toString('utf8');
 if(!/<svg[\s>]/i.test(source)||/<!DOCTYPE|<!ENTITY|<script[\s>]|<foreignObject[\s>]|\son\w+\s*=/i.test(source))throw new Error('SVG contém conteúdo ativo ou formato inválido.');
 for(const ref of source.matchAll(/(?:href\s*=\s*["']([^"']*)["']|url\(\s*["']?([^)'"]+))/gi))if(!(ref[1]??ref[2]).trim().startsWith('#'))throw new Error('SVG precisa ser autocontido, sem referências externas.');
 let browser;
 try{
  browser=await chromium.launch({executablePath:findBrowser()});const page=await browser.newPage({viewport:{width:1600,height:1600}});
  await page.route('**/*',route=>route.abort());
  await page.setContent('<style>body{margin:0}img{display:block}</style><img alt="">');
  await page.locator('img').evaluate(async(img,url)=>{img.src=url;await img.decode();const scale=1600/Math.max(img.naturalWidth,img.naturalHeight);img.style.width=img.naturalWidth*scale+'px';img.style.height=img.naturalHeight*scale+'px';},'data:image/svg+xml;base64,'+data.toString('base64'));
  return await page.locator('img').screenshot({type:'png',omitBackground:true,timeout:10000});
 }finally{await browser?.close();}
}
