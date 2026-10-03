// Importador compartilhado por Node e Studio; preserva variáveis, nunca inventa endpoints.
(function(g){
  function importCollection(raw){
    if(typeof raw==='string')raw=JSON.parse(raw);
    const services=[];
    function walk(items,prefix=''){
      for(const item of items||[]){
        const name=[prefix,item.name].filter(Boolean).join(' / ');
        if(item.item){walk(item.item,name);continue;}
        const r=item.request;if(!r)continue;
        const url=typeof r.url==='string'?r.url:r.url?.raw;
        if(!url)throw new Error(`URL ausente em ${name}`);
        const headers=Object.fromEntries((r.header||[]).filter(h=>!h.disabled).map(h=>[h.key,h.value]));
        let body=r.body?.raw;
        if(body){try{body=JSON.parse(body)}catch{}}
        const form=r.body?.mode==='urlencoded'?Object.fromEntries((r.body.urlencoded||[]).filter(x=>!x.disabled).map(x=>[x.key,x.value])):undefined;
        if(r.body?.mode==='formdata')throw new Error(`Importação de ${name}: use o campo de arquivo do slide para multipart.`);
        services.push({id:`servico-${services.length+1}`,name:name||`Serviço ${services.length+1}`,request:{method:r.method||'GET',url,headers,...(body!=null?{body}:{}),...(form?{form}:{})}});
      }
    }
    if(Array.isArray(raw.services))return structuredClone(raw.services);
    walk(raw.item);
    if(!services.length)throw new Error('A coleção precisa ter pedidos Postman ou uma lista services.');
    if(services.length>100)throw new Error('Divida a coleção: limite de 100 serviços por slide.');
    return services;
  }
  g.SagaApiCollections={importCollection};
})(globalThis);
