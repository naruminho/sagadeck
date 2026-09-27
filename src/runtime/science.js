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
  async function mount(root = document) {
    const plots = [...root.querySelectorAll('.science-plot:not([data-mounted])')];
    if (!plots.length) return;
    plots.forEach(p=>p.dataset.mounted='pending');
    try {
      await load();
      await Promise.all(plots.map(async p => {
        const {data,layout} = JSON.parse(p.querySelector('.science-data').textContent);
        const target = p.querySelector('.science-plot-target');
        await window.Plotly.newPlot(target,data,{paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{size:20,color:getComputedStyle(p).color},margin:{t:35,b:65,l:75,r:40},...layout,autosize:true}, {responsive:true,displaylogo:false,scrollZoom:true});
        p.dataset.mounted='ready';
      }));
    } catch (e) { plots.forEach(p=>{p.dataset.mounted='error';p.querySelector('.science-help').textContent=e.message;}); }
  }
  window.SagaScience = {mount, dispose(root) { root.querySelectorAll('.science-plot-target').forEach(p=>window.Plotly?.purge(p)); }};
  window.SagaScienceReady = mount();
})();
