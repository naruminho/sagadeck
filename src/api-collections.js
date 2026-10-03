import './runtime/api-collections.js';
export const importCollection=globalThis.SagaApiCollections.importCollection;
// Exportação estática mostra cada pedido. O deck e sua ordem permanecem intactos.
export function expandApiCollections(spec) {
  const out={...spec,slides:[]};
  for(const slide of spec.slides||[]) {
    if(slide.layout!=='api'||!slide.services?.length){out.slides.push(slide);continue;}
    for(const [i,service]of slide.services.entries()) {
      const copy={...slide,...service,layout:'api',title:[slide.title,service.name].filter(Boolean).join(' · '),id:service.id||`${slide.id||'collection'}-${i+1}`};
      delete copy.services;out.slides.push(copy);
    }
  }
  return out;
}
