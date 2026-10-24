// Abre a pasta (ou mostra o arquivo selecionado) no Explorador do Windows: "abrir a pasta" das variáveis, "Configurar"
// das identidades. Nos testes (SAGADECK_TEST_ISOLATED, test/isolate.js), nunca: o teste das identidades clicava em
// Configurar e abria uma janela de verdade na pasta temporária do teste; a pasta era apagada, a janela voltava para a
// Temp e ficava aberta. Em dois dias eram 19 janelas, ~6 GB de memória e muita CPU vigiando a Temp (onde os testes
// criam e apagam milhares de arquivos): a máquina toda ficava lenta. Todo explorer.exe do Studio passa por aqui.
import { spawn } from "node:child_process";

export function reveal(target, { select = false, platform = process.platform, env = process.env } = {}) {
  if (platform !== "win32" || env.SAGADECK_TEST_ISOLATED === "1") return false;
  spawn("explorer.exe", [select ? `/select,${target}` : target], { detached: true, stdio: "ignore" }).unref();
  return true;
}
