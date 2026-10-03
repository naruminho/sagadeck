for(const root of document.querySelectorAll('[data-api-collection]')) {
  const select=root.querySelector('[data-api-service]'), panels=[...root.querySelectorAll('.api-collection-panel')];
  select.onchange=()=>panels.forEach((panel,i)=>{panel.hidden=i!==Number(select.value)});
  select.addEventListener('keydown',e=>e.stopPropagation());
}
