// Identificadores determinísticos por classe; ajustes visuais valem no Studio e no HTML exportado.
export function applyVisualEdits(html, edits = {}) {
  const counts = new Map();
  return html.replace(/<(div|span|p|h[1-6])\b([^>]*\bclass="([^"]+)"[^>]*)>/g, (tag,name,attrs,cls) => {
    const classes = cls.split(/\s+/);
    if (!classes.some(c=>['t','fig','shape','scene-sculpture'].includes(c))) return tag;
    const group = classes.filter(c=>c!=='e' && c!=='active').join('-').replace(/[^a-zA-Z0-9_-]/g,'');
    const n = counts.get(group) || 0; counts.set(group,n+1);
    const key = `${group}-${n}`, e = edits[key] || {};
    const num = (v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
    let css = '';
    if (e.hidden) css += 'display:none!important;';
    if (e.dx || e.dy) css += `translate:${num(e.dx)}px ${num(e.dy)}px;`;
    if (e.w != null) css += `width:${Math.max(20,num(e.w,200))}px!important;max-width:none;`;
    if (e.h != null) css += `height:${Math.max(20,num(e.h,100))}px!important;`;
    if (e.size != null) css += `font-size:${Math.max(10,num(e.size,36))}px!important;`;
    if (/^#[0-9a-f]{6}$/i.test(e.color)) css += `color:${e.color}!important;`;
    if (e.z != null) css += `${/position:absolute/.test(attrs) ? '' : 'position:relative;'}z-index:${Math.round(num(e.z))};`;
    if (css) attrs = /\bstyle="/.test(attrs) ? attrs.replace(/style="([^"]*)"/,(_,old)=>`style="${old};${css}"`) : `${attrs} style="${css}"`;
    return `<${name}${attrs} data-vkey="${key}">`;
  });
}
