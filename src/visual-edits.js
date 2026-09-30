// Identificadores determinísticos por classe; ajustes visuais valem no Studio e no HTML exportado.
const SVG_SHAPES = ['triangle','diamond','hexagon','star','arrow','chevron','bubble'].map(k=>`shape-${k}`);
// Propriedades do inspetor do Studio: só valores de uma lista ou números (nada de CSS vindo do deck direto)
const ALIGN = ['left','center','right','justify'], ANIM = ['fade','pop','left','right','down','zoom','none'];
const SHADOW = { suave: 'drop-shadow(0 8px 16px rgb(0 0 0 / .18))', forte: 'drop-shadow(0 18px 36px rgb(0 0 0 / .35))' };
const HEX = /^#[0-9a-f]{6}$/i;
// Chave de um objeto: o grupo (classes) + uma impressão do CONTEÚDO dele (o texto; na figura, a imagem ou o desenho),
// e não a posição: inserir, reordenar ou apagar outro objeto não passa o ajuste para quem não era. Objetos iguais
// no mesmo slide ganham ~2, ~3… A chave antiga (grupo-N, pela ordem) continua valendo para decks de antes; o Studio
// converte na primeira vez que o slide abre (data-vkey-old).
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
function innerOf(html, from, name) {
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'gi');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[1]) { if (--depth === 0) return html.slice(from, m.index); }
    else if (!m[2]) depth++;
  }
  return html.slice(from, from + 2000);
}
function fingerprint(inner) {
  const src = inner.match(/<img[^>]*\bsrc="([^"]{0,4000})/)?.[1];
  if (src) return hash(`img:${src.length}:${src.slice(0, 600)}:${src.slice(-200)}`);
  const text = inner.replace(/<svg[\s\S]*?<\/svg>/gi, (s) => ` svg${hash(s.replace(/\s+id="[^"]*"|url\(#[^)]*\)/g, ''))} `).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return hash(text.slice(0, 400));
}
export function applyVisualEdits(html, edits = {}) {
  const counts = new Map(), seen = new Map();
  return html.replace(/<(div|span|p|h[1-6])\b([^>]*\bclass="([^"]+)"[^>]*)>/g, (tag,name,attrs,cls,offset) => {
    const classes = cls.split(/\s+/);
    if (!classes.some(c=>['t','fig','shape','scene-sculpture'].includes(c))) return tag;
    const group = classes.filter(c=>c!=='e' && c!=='active').join('-').replace(/[^a-zA-Z0-9_-]/g,'');
    const n = counts.get(group) || 0; counts.set(group,n+1);
    const legacy = `${group}-${n}`;
    const base = `${group}~${fingerprint(innerOf(html, offset + tag.length, name))}`;
    const dup = (seen.get(base) || 0) + 1; seen.set(base, dup);
    const key = dup > 1 ? `${base}~${dup}` : base;
    const e = edits[key] || edits[legacy] || {};
    const num = (v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
    let css = '';
    if (e.hidden) css += 'display:none!important;';
    if (e.dx || e.dy) css += `translate:${num(e.dx)}px ${num(e.dy)}px;`;
    if (e.w != null) css += `width:${Math.max(20,num(e.w,200))}px!important;max-width:none;`;
    if (e.h != null) css += `height:${Math.max(20,num(e.h,100))}px!important;`;
    if (e.size != null) css += `font-size:${Math.max(10,num(e.size,36))}px!important;`;
    if (HEX.test(e.color)) css += `color:${e.color}!important;`;
    if ([400, 500, 600, 700, 800].includes(Number(e.weight))) css += `font-weight:${Number(e.weight)}!important;`;
    if (e.italic === true) css += 'font-style:italic!important;';
    if (ALIGN.includes(e.align)) css += `text-align:${e.align}!important;`;
    if (e.lineHeight != null && Number.isFinite(Number(e.lineHeight))) css += `line-height:${Math.min(3, Math.max(0.7, Number(e.lineHeight)))}!important;`;
    if (e.letterSpacing != null && Number.isFinite(Number(e.letterSpacing))) css += `letter-spacing:${Math.min(0.5, Math.max(-0.1, Number(e.letterSpacing)))}em!important;`;
    if (e.uppercase === true) css += 'text-transform:uppercase!important;';
    if (e.rotate) css += `rotate:${Math.round(num(e.rotate)) % 360}deg;`;
    if (e.opacity != null && Number.isFinite(Number(e.opacity))) css += `opacity:${Math.min(1, Math.max(0, Number(e.opacity)))};`;
    if (SHADOW[e.shadow]) css += `filter:${SHADOW[e.shadow]};`;
    if (e.radius != null && Number.isFinite(Number(e.radius))) css += `border-radius:${Math.max(0, Math.round(Number(e.radius)))}px!important;overflow:hidden;`;
    // contorno: desenho (SVG) lê --shape-stroke/--shape-sw; forma reta, imagem ou caixa ganham borda
    if (HEX.test(e.stroke)) {
      const w = Math.max(0, Math.min(40, num(e.strokeWidth, 4)));
      css += classes.some(c=>SVG_SHAPES.includes(c)) ? `--shape-stroke:${e.stroke};--shape-sw:${w}px;` : `border:${w}px solid ${e.stroke}!important;`;
    }
    // Preenchimento de forma: desenho (SVG) usa --shape-fill; retângulo, elipse e pílula pintam o fundo; linha, a cor
    if (/^#[0-9a-f]{6}$/i.test(e.fill) && classes.includes('shape')) css += classes.some(c=>SVG_SHAPES.includes(c)) ? `--shape-fill:${e.fill};` : `background:${e.fill}!important;`;
    if (e.z != null) css += `${/position:absolute/.test(attrs) ? '' : 'position:relative;'}z-index:${Math.round(num(e.z))};`;
    if (css) attrs = /\bstyle="/.test(attrs) ? attrs.replace(/style="([^"]*)"/,(_,old)=>`style="${old};${css}"`) : `${attrs} style="${css}"`;
    // aparece no clique N e animação de entrada: atributos que o runtime já entende (trocam os do elemento)
    let extra = '';
    if (Number.isInteger(Number(e.step)) && Number(e.step) > 0) { attrs = attrs.replace(/\sdata-step="[^"]*"/, ''); extra += ` data-step="${Number(e.step)}"`; }
    if (ANIM.includes(e.anim)) { attrs = attrs.replace(/\sdata-anim="[^"]*"/, ''); extra += ` data-anim="${e.anim}"`; }
    return `<${name}${attrs} data-vkey="${key}"${edits[legacy] && !edits[key] ? ` data-vkey-old="${legacy}"` : ''}${e.size != null ? ' data-vsize' : ''}${extra}>`;
  });
}
