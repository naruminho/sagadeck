// Política de aprovação dos comandos da IA (quem pede o quê, e o que roda direto).
// Ações gratuitas (ex.: consultar status do vídeo) nunca pedem; só o que pode
// custar tempo sensível, gastar dinheiro ou mexer fora da pasta pede clique.
import crypto from "node:crypto";
import { videoFreeRun } from "../ai/commands.js";

export const needsApproval = ({ autoRun, command }) => !autoRun && !videoFreeRun(command);

export const approvalLabel = ({ autoRun, command }) =>
  autoRun ? "liberado" : videoFreeRun(command) ? "livre" : "aprovado";

// espera a pessoa no chat (10 min sem resposta = recusado); aborta junto com o pedido
export async function awaitApproval({ command, user, signal, emit, approvals }) {
  const id = crypto.randomUUID();
  const decision = await new Promise((resolve) => {
    const timer = setTimeout(() => { approvals.delete(id); resolve("deny"); }, 10 * 60 * 1000);
    const abort = () => { clearTimeout(timer); approvals.delete(id); resolve("deny"); };
    signal?.addEventListener("abort", abort, { once: true });
    approvals.set(id, { user: user || "", answer: (d) => { clearTimeout(timer); approvals.delete(id); resolve(d); } });
    emit({ phase: "approve", id, command, text: "Esperando você autorizar o comando…" });
  });
  return decision;
}
