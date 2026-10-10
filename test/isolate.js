// Blindagem de TODO teste (carregado antes de qualquer arquivo de teste pelo `npm test`: --import ./test/isolate.js;
// o helpers.js também carrega, para quem roda um arquivo sozinho). Nenhum teste lê ou grava o que é de quem roda: a
// biblioteca, os ambientes do slide "api" (credenciais), as Preferências, a configuração da IA (chave) e o registro
// de comandos. Antes só os arquivos que importavam o helpers.js ficavam isolados, e um teste da lixeira leu as
// Preferências reais da máquina (lixeira em 1 dia) e falhou só ali.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.SAGADECK_TEST_ISOLATED) {
  process.env.SAGADECK_TEST_ISOLATED = "1";
  process.env.SAGADECK_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-home-"));
  process.env.SAGADECK_AMBIENTES = path.join(process.env.SAGADECK_HOME, "ambientes-de-teste.yaml");
  process.env.SAGADECK_PREFERENCIAS = path.join(process.env.SAGADECK_HOME, "preferencias-de-teste.json");
  // nos testes ao vivo (SAGADECK_LIVE=1), a IA de verdade desta máquina vale
  if (process.env.SAGADECK_LIVE !== "1") {
    process.env.SAGADECK_IA = path.join(process.env.SAGADECK_HOME, "ia-de-teste.json");
    process.env.MODELRELAY_CONFIG = path.join(process.env.SAGADECK_HOME, "modelrelay-de-teste.toml");
  }
  process.env.SAGADECK_COMANDOS_LOG = path.join(process.env.SAGADECK_HOME, "comandos-de-teste.log");
  // serviços do mapa (tiles, endereços, rotas): os testes apontam para servidores falsos, nunca os desta máquina
  if (process.env.SAGADECK_LIVE !== "1") {
    process.env.SAGADECK_MAPA = path.join(process.env.SAGADECK_HOME, "mapa-de-teste.json");
    // sem fundo (nenhum tile é pedido) e serviços numa porta fechada: quem testa o mapa sobe servidores falsos
    const fechado = "http://127.0.0.1:9";
    fs.writeFileSync(process.env.SAGADECK_MAPA, JSON.stringify({ tiles: null, geocoder: { url: fechado }, busca: { url: fechado }, rotas: { url: fechado } }));
  }
}
