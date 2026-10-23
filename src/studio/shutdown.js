// Parada do Studio quando o sistema pede (SIGTERM do systemd ao reiniciar, SIGHUP ao fechar o terminal). Sem isto,
// o processo não saía: o Playwright, ao abrir o Chrome (miniaturas, fotos, exportação), instala um tratador de SIGTERM
// que só fecha o navegador, e com um tratador instalado o Node deixa de sair sozinho. No servidor, cada reinício
// ficava 90 s fora do ar até o systemd matar à força (SIGKILL), no meio do que estivesse rodando.
// Aqui: para de aceitar conexões, dá `grace` ms para as que estão em uso terminarem (uma resposta da IA ao vivo, uma
// gravação), corta o que sobrar, fecha o Chrome das miniaturas e sai.
export const SINAIS_DE_PARADA = ["SIGTERM", "SIGHUP"];

export function installShutdown(server, { grace = 8000, log = (m) => console.log(m), exit = (code) => process.exit(code), closeBrowsers } = {}) {
  let stopping = null;
  const stop = (signal) => {
    if (stopping) return stopping;
    stopping = (async () => {
      log(`  ${signal}: parando o Studio (até ${Math.round(grace / 1000)} s para o que está em andamento)`);
      const closed = new Promise((resolve) => server.close(() => resolve()));
      // a conexão que termina a resposta fica aberta à espera de outra (keep-alive) e seguraria o close até o prazo
      server.closeIdleConnections?.();
      const idle = setInterval(() => server.closeIdleConnections?.(), 100);
      let timer;
      const late = new Promise((resolve) => { timer = setTimeout(() => { server.closeAllConnections?.(); resolve(); }, grace); });
      await Promise.race([closed, late]);
      clearTimeout(timer); clearInterval(idle);
      try { await (closeBrowsers ?? (async () => (await import("./snapshot.js")).closeSnapshots()))(); } catch { /* o Chrome já fechou */ }
      exit(0);
    })();
    return stopping;
  };
  const handlers = SINAIS_DE_PARADA.map((s) => [s, () => { stop(s); }]);
  for (const [s, h] of handlers) process.on(s, h);
  return { stop, uninstall: () => { for (const [s, h] of handlers) process.off(s, h); } };
}
