import crypto from 'node:crypto';

const remembered=new WeakMap();
const messages={
  AI_TOKEN_LIMIT:'A IA atingiu o limite de tamanho da resposta. Tente um pedido menor; pode ser necessário ampliar o limite do modelo.',
  AI_INVALID_OUTPUT:'A IA devolveu conteúdo inválido e não conseguiu corrigi-lo automaticamente. Tente novamente com um pedido mais específico.',
  AI_PROVIDER_INTERRUPTED:'O provedor interrompeu a resposta da IA. As tentativas automáticas não resolveram; tente novamente em alguns instantes.',
  TIMEOUT:'O serviço demorou além do tempo permitido. Tente novamente; o limite de espera pode precisar de ajuste.',
  RATE_LIMIT:'O provedor limitou temporariamente os pedidos. Aguarde um pouco antes de tentar novamente.',
  NO_CREDIT:'O provedor informou falta de créditos. O responsável pelo SagaDeck precisa verificar a conta.',
  ACCESS_DENIED:'O serviço recusou o acesso. Sua sessão ou a configuração de acesso precisa ser verificada.',
  SERVICE_UNAVAILABLE:'O serviço está indisponível ou falhou ao responder. Tente novamente em alguns instantes.',
  CONNECTION_FAILED:'Não foi possível conectar ao serviço. Verifique a conexão e tente novamente.',
  FILE_NOT_FOUND:'Um arquivo necessário não foi encontrado. Reabra a apresentação ou envie o arquivo novamente.',
  STORAGE_FULL:'Não há espaço disponível para salvar o arquivo. O responsável precisa liberar espaço.',
  FILE_PERMISSION:'O serviço não tem permissão para acessar ou salvar o arquivo.',
  APP_UNKNOWN:'Não foi possível concluir a operação. A causa não foi determinada.',
};

export function errorDiagnostic(error,{status}={}) {
  const e=error instanceof Error?error:new Error(String(error));
  if(remembered.has(e))return remembered.get(e);
  const causes=[];for(let c=e;c&&causes.length<8;c=c.cause)causes.push(c);
  if(e.aborted||causes.some(c=>c.name==='AbortError'))return {error:'Operação interrompida.',diagnostic:{code:'CANCELLED'}};
  const http=e.status||status;
  let code=messages[e.code]?e.code:null;
  if(!code)code=causes.some(c=>c.name==='TimeoutError'||['ETIMEDOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(c.code))?'TIMEOUT'
    :http===429?'RATE_LIMIT':http===402?'NO_CREDIT':[401,403].includes(http)?'ACCESS_DENIED'
    :causes.some(c=>c.code==='ENOENT')?'FILE_NOT_FOUND':causes.some(c=>c.code==='ENOSPC')?'STORAGE_FULL'
    :causes.some(c=>['EACCES','EPERM'].includes(c.code))?'FILE_PERMISSION'
    :causes.some(c=>['ECONNREFUSED','ENOTFOUND','ECONNRESET','EAI_AGAIN'].includes(c.code))?'CONNECTION_FAILED'
    :http===503||http===502||(e.name==='LLMError'&&http>=500)?'SERVICE_UNAVAILABLE':http===400?'INVALID_INPUT':http===404?'NOT_FOUND':'APP_UNKNOWN';
  const id=crypto.randomUUID().slice(0,8);
  const summary=code==='INVALID_INPUT'||code==='NOT_FOUND'||http===409?e.message:messages[code];
  const result={error:`${summary} Código: ${code} · ${id}. Se persistir, contate o responsável pelo SagaDeck e informe esse código.`,diagnostic:{code,id}};
  remembered.set(e,result);
  // Sem chaves, prompts, documentos ou resposta bruta do provedor no diagnóstico.
  console.error(`[SagaDeck ${id}] ${code}`,JSON.stringify({status:http,name:e.name,causeCode:e.cause?.code}));
  return result;
}

export function installErrorResponses(res) {
  let contentType='';
  const writeHead=res.writeHead.bind(res);
  res.writeHead=(status,...args)=>{
    const headers=typeof args[0]==='string'?args[1]:args[0];
    if(headers&&!Array.isArray(headers))contentType=String(Object.entries(headers).find(([key])=>key.toLowerCase()==='content-type')?.[1]||contentType);
    return writeHead(status,...args);
  };
  const end=res.end.bind(res);
  res.end=(data,...args)=>{
    if(typeof data==='string'&&String(res.getHeader('Content-Type')||contentType).includes('application/json')) {
      try {
        const payload=JSON.parse(data);
        if(payload?.error&&!payload.diagnostic&&!payload.kind) data=JSON.stringify({...payload,...errorDiagnostic(payload.error,{status:res.statusCode})});
      } catch { /* respostas que não são JSON mantêm seu formato */ }
    }
    return end(data,...args);
  };
}

export function chatErrorResult(error,spec,targetSlide) {
  const diagnostic=errorDiagnostic(error);
  return {reply:`A IA falhou e não mudei nada: ${diagnostic.error}`,diagnostic:diagnostic.diagnostic,spec,actions:[],targetSlide,mode:'error'};
}
