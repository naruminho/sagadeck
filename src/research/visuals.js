import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';
import { checkUrl, fetchWebImage } from '../ai/context.js';
import { findBrowser } from '../export/browser.js';

// Só URLs observadas na fonte; o modelo recebe o inventário, não adivinha caminhos de imagens.
export function pageVisuals(html,base){
  const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  const attr=(tag,key)=>decode(tag.match(new RegExp(`(?:^|\\s)${key}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1]);
  const found=[];
  const add=(url,alt,kind)=>{try{const u=new URL(url,base);if(!/^https?:$/.test(u.protocol)||!url||found.some(v=>v.url===u.href))return;found.push({url:u.href,alt:alt||'',kind,source:base});}catch{}};
  for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const tag=m[0];if(/^(og:image|twitter:image)$/.test(attr(tag,'property')||attr(tag,'name')))add(attr(tag,'content'),'Imagem de divulgação','social');}
  for(const m of html.matchAll(/<a\b[^>]*>/gi)){const url=attr(m[0],'href');if(/\.(svg|png|jpe?g|webp)(?:[?#]|$)/i.test(url||''))add(url,attr(m[0],'title'),'original');}
  for(const m of html.matchAll(/<img\b[^>]*>/gi)){const tag=m[0];if(Number(attr(tag,'width'))&&Number(attr(tag,'width'))<100)continue;add(attr(tag,'src')||attr(tag,'data-src'),attr(tag,'alt'),'image');}
  return found.slice(0,20);
}

export async function captureWebPage(url,{selector,allowLocal=false}={}){
  const safe=await checkUrl(url,{allowLocal});let browser;
  try{
    browser=await chromium.launch({executablePath:findBrowser()});const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
    const checked=new Map();
    await page.route('**/*',async route=>{const req=route.request();if(!/^https?:/.test(req.url()))return route.abort();try{let ok=checked.get(req.url());if(!ok){ok=checkUrl(req.url(),{allowLocal});checked.set(req.url(),ok);}await ok;await route.continue();}catch{await route.abort();}});
    await page.goto(safe.href,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await page.evaluate(()=>document.fonts.ready);
    if(/captcha|access denied|just a moment/i.test(await page.title()))throw new Error('A fonte bloqueou a captura automática.');
    const target=selector?page.locator(selector).first():page.locator('body');if(selector)await target.waitFor({state:'visible',timeout:5000});
    const data=selector?await target.screenshot({type:'png',timeout:10000}):await page.screenshot({type:'png',fullPage:false,timeout:10000});
    return{data,mime:'image/png',url:page.url(),title:await page.title(),kind:'capture',selector:selector||null};
  }finally{if(browser)await browser.close();}
}

export function webVisualNodes(obj,out=[]){if(Array.isArray(obj))obj.forEach(x=>webVisualNodes(x,out));else if(obj&&typeof obj==='object'){if(obj.web_image||obj.web_capture)out.push(obj);Object.values(obj).forEach(x=>webVisualNodes(x,out));}return out;}
export async function materializeWebVisuals(spec,{baseDir,assetsDir,max=4,onProgress,fetchImage=fetchWebImage,capture=captureWebPage}={}){
  const done=[],failed=[];baseDir=baseDir||spec._dir;const nodes=webVisualNodes(spec.slides||[]);
  for(const node of nodes.slice(0,max)){
    const request=node.web_capture||node.web_image,captureMode=!!node.web_capture,url=typeof request==='string'?request:request.url;
    try{
      if(!baseDir)throw new Error('Salve a apresentação na biblioteca antes de importar referências visuais.');
      if(process.env.SAGADECK_WEB==='0')throw new Error('Pesquisa web desligada.');onProgress?.(`${captureMode?'Capturando página':'Importando imagem real'}: ${url}`);
      const result=captureMode?await capture(url,{selector:request.selector}):await fetchImage(url);
      const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[result.mime];if(!ext)throw new Error('Formato visual não suportado.');
      const dir=assetsDir||path.join(baseDir,'imagens','web');fs.mkdirSync(dir,{recursive:true});const hash=crypto.createHash('sha256').update(result.data).digest('hex').slice(0,16),file=path.join(dir,`web-${hash}.${ext}`);fs.writeFileSync(file,result.data);
      node.image=path.relative(baseDir,file).split(path.sep).join('/');node.image_source={url:result.url||url,page:request.source||url,kind:captureMode?'capture':'image',title:result.title||request.alt||'',accessed:new Date().toISOString(),...(request.selector?{selector:request.selector}:{})};
      if(!node.alt)node.alt=request.alt||result.title||'Referência visual da fonte';delete node.web_image;delete node.web_capture;done.push({prompt:`Referência real: ${url}`,file});
    }catch(e){failed.push({prompt:`Referência real: ${url}`,error:e.message});}
  }
  if(done.length){fs.mkdirSync(path.join(baseDir,'contexto','pesquisa'),{recursive:true});const provenance=webImages(spec);fs.writeFileSync(path.join(baseDir,'contexto','pesquisa','visuais.json'),JSON.stringify(provenance,null,2));}
  return{done,failed};
}
function webImages(obj,out=[]){if(Array.isArray(obj))obj.forEach(x=>webImages(x,out));else if(obj&&typeof obj==='object'){if(obj.image_source)out.push({image:obj.image,...obj.image_source});Object.values(obj).forEach(x=>webImages(x,out));}return out;}
