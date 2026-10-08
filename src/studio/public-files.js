// Scripts do Studio: todo .js direto na pasta public (só nome simples, sem subir de pasta). Decidido a cada pedido,
// olhando o disco: com uma lista fixa na memória, um Studio aberto antes de atualizar o código entregava o app.js
// novo e dava 404 no módulo novo que ele chama (o app.js quebrava e nenhum slide abria).
import fs from "node:fs";
import path from "node:path";

export function publicScript(dir, pathname) {
  if (!/^\/[a-z0-9][a-z0-9-]*\.js$/.test(pathname)) return null;
  const file = path.join(dir, pathname.slice(1));
  return fs.existsSync(file) ? file : null;
}
