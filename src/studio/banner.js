// O que o `sagadeck studio` escreve ao subir. A primeira linha é o endereço do Studio, a página que a pessoa abre: antes
// vinha primeiro o endereço de um serviço de IA à parte, e um agente pedido para "deixar pronto para usar" abria a
// página dele ou, sem achar o Studio, saía criando uma interface do zero. A IA se configura dentro do Studio.
import { PROVIDERS } from "../ai/ia-config.js";

const providerName = (ai) => Object.values(PROVIDERS).find((p) => p.url === ai.url)?.label || ai.url;

export function studioBanner({ version, url, library, ai = null, multiuser = false, usersDir = "", pid = process.pid, isLibrary = true }) {
  const iaLine = !ai || !(ai.url || ai.adaptador)
    ? "  IA: não configurada. No Studio, clique em IA desligada (ou Configurar IA na biblioteca) e informe provedor e chave."
    : `  IA: ${providerName(ai)} · texto ${ai.textModel}${ai.source === "variável" ? " (pelas variáveis SAGADECK_LLM_*)" : ""}`;
  return [
    `✓ SagaDeck Studio ${version} pronto. Abra no navegador: ${url}${isLibrary ? "  (biblioteca)" : ""}`,
    multiuser ? `  multiusuário: bibliotecas em ${usersDir}` : `  biblioteca: ${library}`,
    iaLine,
    `  processo ${pid}`,
  ];
}
