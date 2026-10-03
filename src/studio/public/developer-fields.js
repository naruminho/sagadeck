window.SagaDeveloperFields = {
  poll: (f,T)=>[f.text('kicker','Chapéu'),f.area('question','Pergunta'),f.text('context','Contexto'),f.list('options','Opções',T,{addLabel:'Adicionar opção'}),f.text('hint','Dica'),f.bool('manual','Decisão da reunião (contagens e aprovação salvas)'),f.json('values','Valores numéricos por opção (opcional)'),f.text('participantTitle','Título para divulgação'),f.select('audience','Visibilidade',[['organization','Só organização'],['all','Organização e participantes']],{empty:'Ambos'}),f.more([f.text('id','Identificador da enquete'),f.text('compare','Comparar com a enquete (identificador)'),f.num('titleSize','Tamanho da pergunta (px)')])],
  portal: (f,obj) => [f.text('title','Título'),f.select('skin','Aparência',[['neon','Neon'],['editorial','Editorial'],['industrial','Industrial']],{empty:false,default:'neon'}),f.text('label','Convite no cenário'),f.text('caption','Legenda inicial'),f.list('items','Elementos para explorar',obj([f.text('title','Nome'),f.text('icon','Ícone Lucide'),f.photo('image','Sua imagem ou screenshot'),f.area('text','Descrição'),f.text('beforeWord','Texto integrado antes'),f.text('afterWord','Texto integrado depois'),f.area('before','Explicação antes'),f.area('after','Explicação depois'),f.list('objects','Objetos da transformação',obj([f.text('label','Nome'),f.text('icon','Ícone'),f.select('shape','Forma',[['panel','Painel'],['sheet','Documento'],['orb','Esfera'],['column','Coluna']],{empty:'Painel'})]),{newItem:()=>({label:'Nova etapa'})})]),{newItem:()=>({title:'Novo mundo',beforeWord:'ANTES',afterWord:'DEPOIS',objects:[{label:'Uma ideia'},{label:'Uma solução'}]})})],
  playground: f => [f.text('title','Título'),f.area('html','HTML',{mono:true,rows:8}),f.area('css','CSS',{mono:true,rows:8}),f.area('javascript','JavaScript',{mono:true,rows:12}),f.area('explanation','Convite para explorar')],
  collection: (f,obj,getCtx) => [
    f.action('Importar coleção Postman', (s,button) => {
      const ctx=getCtx(),input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;input.dataset.collectionFile='';document.body.append(input);
      input.onchange=async()=>{try{const file=input.files[0];if(!file)return;s.services=window.SagaApiCollections.importCollection(await file.text());if(button.isConnected)ctx.commit(true);}catch(e){button.textContent=e.message;}finally{input.remove();}};input.click();
    }),
    f.list('services','Serviços da coleção',obj([f.text('name','Nome no seletor'),f.text('id','Identificador'),f.select('mode','Modo',[['sync','Síncrono'],['polling','Polling'],['stream','Streaming']],{empty:'Síncrono'}),f.obj('request','Pedido',[f.select('method','Método',[['GET','GET'],['POST','POST'],['PUT','PUT'],['PATCH','PATCH'],['DELETE','DELETE']],{empty:'GET'}),f.text('url','Endpoint'),f.json('body','Corpo JSON'),f.json('headers','Cabeçalhos JSON')]),f.json('polling','Configuração de polling'),f.json('stream','Configuração de streaming')]),{addLabel:'Adicionar serviço',newItem:()=>({name:'Novo serviço',request:{method:'GET',url:'{{base}}/'}})})
  ],
  video: (f,getCtx) => [f.text('kicker','Chapéu'),f.text('title','Título'),f.text('url','YouTube ou arquivo local'),f.text('label','Descrição do vídeo'),
    f.action('Inserir meu MP4',(s,button)=>{
      const ctx=getCtx(),input=document.createElement('input');input.type='file';input.accept='video/mp4,.mp4';input.hidden=true;input.dataset.videoFile='';document.body.append(input);
      input.onchange=async()=>{try{const file=input.files[0];if(!file)return;const url=await window.SagaProject.uploadFile(file,'videos');if(button.isConnected){s.url=url;ctx.commit(true);}}catch(e){button.textContent=e.message;}finally{input.remove();}};input.click();
    }),
    f.action('Baixar YouTube para MP4',async(s,button)=>{
      const ctx=getCtx(),label=button.textContent;button.disabled=true;button.textContent='Baixando vídeo…';
      try{const r=await fetch('api/video/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:s.url})}),data=await r.json();if(!r.ok)throw new Error(data.error);if(button.isConnected){s.youtubeSource=data.source;s.url=data.url;ctx.commit(true);}}
      catch(e){button.textContent=e.message;return;}finally{button.disabled=false;}button.textContent=label;
    }),f.text('caption','Legenda'),f.el('figure','Figura')]
};
