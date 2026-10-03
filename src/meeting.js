import {esc} from './markup.js';

export function meetingSpec(raw, audience = raw?.audience || 'organization') {
 if(!Array.isArray(raw?.slides))return raw;
 if(audience!=='participants'&&!raw.slides.some(s=>(s.layout==='poll'&&s.manual)||s.audience==='organization'))return raw;
 const spec=structuredClone(raw),decisions=spec.slides.filter(s=>s.layout==='poll'&&s.manual&&s.decision?.approved),approved=new Map(decisions.map(s=>[s.id,s.options?.[s.decision.selected]])),numbers=new Map(decisions.map(s=>[s.id,s.values?.[s.decision.selected]]));
 for(const s of spec.slides)for(const input of Object.values(s.inputs||{}))if(input&&typeof input==='object'&&Number.isFinite(numbers.get(input.decision)))input.value=numbers.get(input.decision);
 const known=new Set(spec.slides.filter(s=>s.layout==='poll'&&s.manual).map(s=>s.id));
 const replace=v=>typeof v==='string'?v.replace(/\{\{decision:([^}]+)\}\}/g,(literal,id)=>known.has(id)?approved.get(id)||'Em definição':literal):Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v;
 spec.slides=spec.slides.flatMap(s=>{
  if(audience!=='participants')return [s];
  if(s.audience==='organization')return [];
  if(s.layout==='poll'&&s.manual){if(!s.decision?.approved)return [];return [{layout:'statement',id:s.id,title:s.participantTitle||s.question,text:s.options[s.decision.selected],kicker:'REGRA APROVADA',tone:s.tone,notes:s.participantNotes||''}];}
  return [{...s,notes:s.participantNotes||''}];
 }).map(replace);spec.audience=audience;return spec;
}

export function manualPollHTML(s,head){
 if(!s.id||!s.options?.length)throw new Error('Votação manual precisa de id e opções.');
 const d=s.decision||{},votes=s.options.map((_,i)=>Number(d.votes?.[i])||0);
 return `<div class="L-meeting f-body" data-meeting="${esc(s.id)}">${head({...s,title:s.question||s.title})}<p class="meeting-context">${esc(s.context||'Registre os votos da reunião. A maioria apurada é uma proposta até a aprovação explícita.')}</p><div class="meeting-options">${s.options.map((label,i)=>`<label class="meeting-option"><span>${esc(label)}</span><input aria-label="Votos: ${esc(label)}" type="number" min="0" max="100000" step="1" data-vote="${i}" value="${votes[i]}"><span class="meeting-bar"><i></i></span></label>`).join('')}</div><div class="meeting-actions"><label>Abstenções <input type="number" min="0" max="100000" step="1" data-abstain value="${Number(d.abstentions)||0}"></label><button data-meeting-approve>Aprovar resultado</button><button data-meeting-reopen>Reabrir decisão</button><output aria-live="polite" data-meeting-status></output></div><script type="application/json" class="meeting-state">${JSON.stringify(d).replace(/</g,'\\u003c')}</script></div>`;
}

export function meetingPreview(html,spec,audience){
 const link=spec.slides.some(s=>s.manual)&&audience!=='participants'?'<details style="position:fixed;right:20px;top:10px;z-index:9999;background:#182234;color:white;padding:10px 16px;border-radius:10px;font:14px system-ui"><summary style="cursor:pointer">Versão para participantes</summary><nav style="display:grid;gap:12px;padding-top:14px"><a style="color:white" href="/preview?audience=participants" data-participant-preview>Ver prévia</a><a style="color:white" href="/api/export/html?audience=participants">Baixar HTML interativo</a><a style="color:white" href="/api/export/pdf?audience=participants">Baixar PDF</a><a style="color:white" href="/api/export/pptx?audience=participants">Baixar PowerPoint</a></nav></details>':'';
 return html.replace('</body>',link+'</body>');
}

export async function meetingRoutes({req,res,pathname,W,readJSON,persist}){
 if(pathname!=='/api/meeting')return false;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(req.method!=='POST'){send(405,{error:'Use POST.'});return true;}
 const b=await readJSON(req),s=W.spec?.slides.find(s=>s.layout==='poll'&&s.manual&&s.id===b.id);
 if(!W.file){send(409,{error:'Salve uma cópia na biblioteca antes de registrar decisões.'});return true;}
 if(!s){send(404,{error:'Votação não encontrada.'});return true;}
 const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
 if(!Array.isArray(b.votes)||b.votes.length!==s.options.length||!b.votes.every(valid)||!valid(b.abstentions)){send(400,{error:'Informe contagens inteiras entre zero e 100000.'});return true;}
 const max=Math.max(...b.votes),winners=b.votes.flatMap((v,i)=>v===max?[i]:[]);
 if(b.approved&&(max===0||winners.length!==1)){send(400,{error:'Sem votos ou empate: a decisão permanece aberta.'});return true;}
 const before=s.decision;s.decision={votes:b.votes,abstentions:b.abstentions,approved:!!b.approved,selected:b.approved?winners[0]:null};
 try{persist(W);send(200,{ok:true,decision:s.decision,...(s.decision.approved&&Number.isFinite(s.values?.[s.decision.selected])?{value:s.values[s.decision.selected]}:{})});}catch(e){s.decision=before;send(500,{error:e.message});}return true;
}
