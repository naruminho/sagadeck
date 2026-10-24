// Pedidos de desenho do editor (o slide da tela e as miniaturas) sem baixar de novo o CSS que a página já tem.
// O servidor (render-routes.js) devolve os hashes do CSS base e do CSS dos temas e só manda o texto quando o hash que
// o editor informou é outro. Aqui o CSS fica guardado e volta preenchido na resposta: quem chama recebe baseCSS e
// themeCSS como antes. Antes, cada troca de slide baixava ~170 kB (o CSS base inteiro), e cada miniatura era um pedido
// com o deck inteiro: pela internet, navegar nos slides ficava lento.
(function () {
  "use strict";
  const css = { base: null, theme: null, baseHash: null, themeHash: null };

  function absorb(data) {
    if (typeof data.baseCSS === "string") { css.base = data.baseCSS; css.baseHash = data.baseHash || null; }
    if (typeof data.themeCSS === "string") { css.theme = data.themeCSS; css.themeHash = data.themeHash || null; }
    return { ...data, baseCSS: css.base ?? "", themeCSS: css.theme ?? "" };
  }
  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, baseHash: css.base != null ? css.baseHash : undefined, themeHash: css.theme != null ? css.themeHash : undefined }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return absorb(await res.json());
  }

  window.SagaRender = {
    // o slide da tela: { slide, index, spec } -> resposta do render-slide, com baseCSS/themeCSS preenchidos
    slide: (body) => post("api/render-slide", body),
    // miniaturas em lote: { indices, spec } -> { slides: [{ index, html }], baseCSS, themeCSS }
    slides: (body) => post("api/render-slides", body),
    // para os testes: o que está guardado
    _cache: css,
  };
})();
