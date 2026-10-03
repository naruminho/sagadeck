(function () {
  let loader;
  function load() {
    if (window.Plotly) return Promise.resolve();
    return loader ||= new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = 'plotly.min.js'; script.onload = resolve;
      script.onerror = () => { loader = null; script.remove(); reject(new Error('Não foi possível carregar o gráfico.')); };
      document.head.append(script);
    });
  }
  // cores do tema do slide (--s1..--s5) para as curvas; "em", "hi"… como no deck
  function palette(p) {
    const cs = getComputedStyle(p);
    const pick = (n) => cs.getPropertyValue(`--${n}`).trim();
    // Uma cor de preenchimento (hi) pode sumir como traço no mesmo tema.
    const canvas = document.createElement('canvas').getContext('2d');
    const rgb = color => {
      const probe = document.createElement('i'); probe.style.color = color; p.append(probe);
      canvas.fillStyle = getComputedStyle(probe).color; probe.remove();
      canvas.clearRect(0, 0, 1, 1); canvas.fillRect(0, 0, 1, 1);
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = c => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s,v,i) => s + v * [.2126,.7152,.0722][i],0);
    const bg = luminance(rgb(pick('bg') || '#fff'));
    const readable = color => {
      const source = rgb(color), target = bg > .4 ? 0 : 255;
      for (let a = 0; a <= 1.01; a += .05) {
        const c = source.map(v => Math.round(v * (1-a) + target * a));
        const l = luminance(c);
        if ((Math.max(l,bg)+.05)/(Math.min(l,bg)+.05) >= 3) return `rgb(${c.join(',')})`;
      }
      return target ? '#fff' : '#000';
    };
    return { series: [1, 2, 3, 4, 5].map((i) => readable(pick(`s${i}`) || ['#7760ed', '#e0672c', '#1b998b', '#c2185b', '#3d5a80'][i - 1])), named: (c) => readable(pick(c) || c) };
  }
  // fórmula -> traces: a mesma conta do motor (src/science.js), com os valores atuais dos controles
  function formulaTraces(m, values, p) {
    const F = window.SagaFormula, col = palette(p), out = [];
    if (!m.surface) m.functions.forEach((f, i) => { // com superfície 3D, só ela (curva 2D e 3D juntas não combinam)
      if (!f.ok) return;
      const s = F.sample(F.compile(f.fn, ['x']), m.x, values, 400, m.xlog);
      out.push({ type: 'scatter', mode: 'lines', name: f.name, x: s.x, y: s.y, line: { width: 4, dash: ['solid','dash','dot','dashdot'][i % 4], color: f.color ? col.named(f.color) : col.series[i % 5] } });
    });
    if (m.points && !m.surface) out.push({ type: 'scatter', mode: 'markers', name: m.points.name, x: m.points.x, y: m.points.y, marker: { size: 11, color: col.series[out.length % 5] } });
    if (m.surface) {
      const c = F.compile(m.surface, ['x', 'y']), n = 61, xs = Array.from({ length: n }, (_, i) => m.x[0] + ((m.x[1] - m.x[0]) * i) / (n - 1));
      out.push({ type: 'surface', x: xs, y: xs, z: xs.map((y) => xs.map((x) => c.eval({ ...values, x, y }))), colorscale: 'Viridis', showscale: true });
    }
    return out;
  }
  const valuesOf = (p) => Object.fromEntries([...p.querySelectorAll('[data-param]')].map((i) => [i.dataset.param, Number(i.value)]));
  async function mount(root = document) {
    const plots = [...root.querySelectorAll('.science-plot:not([data-mounted])')];
    if (!plots.length) return;
    plots.forEach(p=>p.dataset.mounted='pending');
    try {
      await load();
      await Promise.all(plots.map(async p => {
        const m = JSON.parse(p.querySelector('.science-data').textContent);
        const target = p.querySelector('.science-plot-target');
        const formula = m.kind === 'formula';
        const data = formula ? formulaTraces(m, valuesOf(p), p) : m.data;
        const layout = {separators:',.',paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{size:20,color:getComputedStyle(p).color},margin:{t:35,b:65,l:75,r:40},showlegend:data.length > 1,legend:{orientation:'h',y:1.08},
          ...m.layout, autosize:true};
        // eixos: os do modelo (log, faixa) juntam com o que o deck pôs em layout (títulos), sem um apagar o outro
        if (formula) {
          layout.xaxis = { ...(m.xlog ? { type: 'log', range: m.x.map((v) => Math.log10(v)) } : { range: m.x, zeroline: true }), ...(m.layout.xaxis || {}) };
          layout.yaxis = { ...(m.ylog ? { type: 'log' } : {}), ...(m.y ? { range: m.ylog ? m.y.map((v) => Math.log10(v)) : m.y } : {}), ...(m.layout.yaxis || {}) };
        }
        if (formula && !data.length) return void (p.dataset.mounted = 'ready'); // nada para desenhar: fica a dica
        target.replaceChildren(); // sai a prévia desenhada, entra o gráfico que se explora
        await window.Plotly.newPlot(target,data,layout,{responsive:true,displaylogo:false,scrollZoom:true});
        // controles deslizantes: mudou o valor, a curva redesenha (sem mexer no zoom que a pessoa escolheu)
        p.querySelectorAll('[data-param]').forEach((input) => {
          const stop = (e) => e.stopPropagation(); // setas e espaço no controle não trocam de slide
          input.addEventListener('keydown', stop); input.addEventListener('pointerdown', stop); input.addEventListener('click', stop);
          input.addEventListener('input', () => {
            input.nextElementSibling.textContent = String(+Number(input.value).toFixed(3)).replace('.', ',');
            window.Plotly.react(target, formulaTraces(m, valuesOf(p), p), { ...target.layout, datarevision: Date.now() });
          });
        });
        p.dataset.mounted='ready';
      }));
    } catch (e) { plots.forEach(p=>{p.dataset.mounted='error';p.querySelector('.science-help').textContent=e.message;}); }
  }
  window.SagaScience = {mount, dispose(root) { root.querySelectorAll('.science-plot-target').forEach(p=>window.Plotly?.purge(p)); }};
  window.SagaScienceReady = mount();
})();
