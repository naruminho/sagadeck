import {errorDiagnostic} from './errors.js';

export function cancellable(work, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('Parado a pedido.'),{aborted:true}));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export async function respond(res, stream, work) {
  if (!stream) {
    try {
      const data = await work(() => {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify(errorDiagnostic(e)));
    }
    return;
  }
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");
  const started = Date.now();
  const heartbeat = setInterval(() => send({ type: "tick", elapsed: Date.now() - started }), 1000);
  try {
    const data = await work((ev) => send({ type: "progress", elapsed: Date.now() - started, ...ev }));
    send({ type: "result", data });
  } catch (e) {
    console.error("[Studio] tarefa de IA falhou:", e.message);
    send({ type: "error", ...errorDiagnostic(e) });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
