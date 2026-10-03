import {esc} from './markup.js';
import {iconSVG} from './figures/icons.js';
import {el} from './elements.js';

export const portalExample={layout:'portal',title:'Entre. Descubra. Transforme.',caption:'Catálogo ilustrativo · funciona offline, sem login ou iframe de um portal real.',items:[
 {title:'Documentos em movimento',icon:'files',text:'Uma pilha de documentos vira informação organizada.',beforeWord:'RUÍDO',afterWord:'CLAREZA',before:'Arquivos dispersos, leitura repetida, informação difícil de encontrar.',after:'As mesmas informações agora têm uma ordem e um caminho.',objects:[{label:'Documentos',icon:'files',shape:'sheet'},{label:'Leitura',icon:'scan-text'},{label:'Informação',icon:'database',shape:'column'},{label:'Busca',icon:'search',shape:'orb'},{label:'Resposta',icon:'message-square'}]},
 {title:'Uma entrega, vários caminhos',icon:'truck',text:'Da fábrica até quem espera pelo pedido.',beforeWord:'DISTÂNCIA',afterWord:'CONEXÃO',before:'O pedido atravessa etapas que parecem desconectadas.',after:'Cada etapa tem seu lugar. A jornada fica visível.',objects:[{label:'Fábrica',icon:'factory'},{label:'Depósito',icon:'warehouse'},{label:'Rota',icon:'route'},{label:'Entrega',icon:'truck'}]},
 {title:'Dentro de uma aplicação',icon:'app-window',text:'Atravesse a interface e revele o fluxo por trás dela.',beforeWord:'INTERFACE',afterWord:'SISTEMA',before:'Você vê a interface. O que acontece depois do clique?',after:'Pedido, processamento e resposta formam uma sequência.',objects:[{label:'Interface',icon:'app-window'},{label:'Requisição',icon:'send'},{label:'Serviço',icon:'server'},{label:'Resposta',icon:'check'}]}
]};

export function portalHTML(s,ctx,head){
 const items=s.items||[];if(!items.length)throw new Error('portal: adicione pelo menos um elemento para explorar.');
 return `<div class="L-portal" data-portal data-view="catalog" data-skin="${esc(['neon','editorial','industrial'].includes(s.skin)?s.skin:'neon')}">${head(s)}<div class="portal-stage"><div class="portal-atmosphere" aria-hidden="true"><div class="portal-orbit"></div><div class="portal-grid"></div></div>
 <div class="portal-catalog"><div class="portal-sign">${esc(s.label||'ESCOLHA UM MUNDO PARA EXPLORAR')}</div><div class="portal-cards">${items.map((item,i)=>`<button class="portal-card" data-portal-enter="${i}" aria-label="Entrar em ${esc(item.title||'elemento')}"><span class="portal-card-art">${item.image?el({image:item.image,fit:'cover'},ctx):iconSVG(item.icon||'app-window',64)}</span><strong>${esc(item.title||`Elemento ${i+1}`)}</strong><span>${esc(item.text||'Explore esta cena.')}</span><small>Entrar ${iconSVG('arrow-up-right',20)}</small></button>`).join('')}</div></div>
 <div class="portal-inside" hidden><div class="portal-scene-title"></div><div class="portal-floor-word" aria-hidden="true"></div><svg class="portal-paths" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"></svg><div class="portal-objects"></div></div></div>
 <div class="portal-controls"><button data-portal-back hidden>${iconSVG('arrow-left',20)} Voltar ao catálogo</button><button data-portal-transform hidden>${iconSVG('sparkles',20)} Transformar cenário</button><button data-portal-reset>Restaurar</button><output data-portal-description aria-live="polite">${esc(s.caption||'Escolha um elemento para entrar na cena.')}</output></div>
 <script class="portal-model" type="application/json">${JSON.stringify(items.map(item=>({...item,objects:item.objects?.map(node=>({...node,glyph:iconSVG(node.icon||'box',30)}))}))).replace(/</g,'\\u003c')}</script></div>`;
}

export function portalDemo(){return{title:'Demo — mundos que se transformam',theme:'manual-noite',slides:[portalExample,{layout:'portal',title:'A ideia muda. A cena acompanha.',skin:'editorial',label:'UM NOVO CONTEXTO',caption:'O mesmo recurso aplicado a uma aula de processos.',items:[{...portalExample.items[2],title:'O caminho de uma solicitação',beforeWord:'POR QUÊ?',afterWord:'AGORA ENTENDI'}]}]};}
