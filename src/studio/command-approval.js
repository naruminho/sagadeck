// Política de aprovação dos comandos da IA (quem pede o quê, e o que roda direto).
// Ações gratuitas (ex.: consultar status do vídeo) nunca pedem; só o que pode
// custar tempo sensível, gastar dinheiro ou mexer fora da pasta pede clique.
import crypto from "node:crypto";
import { videoFreeRun, envName } from "../ai/commands.js";

export const needsApproval = ({ autoRun, command }) => !autoRun && !videoFreeRun(command);

export const approvalLabel = ({ autoRun, command }) =>
  autoRun ? "liberado" : videoFreeRun(command) ? "livre" : "aprovado";

// variáveis, segredos e token do ambiente ativo para o comando (a IA só conhece
// os nomes; a saída volta mascarada)
export async function commandEnv(W, apiEnv) {
  try {
    const e = apiEnv.env(), env = {};
    for (const [k, v] of Object.entries({ ...(W.apiVars || {}), ...(e.vars || {}) })) if (v != null && typeof v !== "object") env[`SAGA_VAR_${envName(k)}`] = String(v);
    for (const [k, v] of Object.entries(apiEnv.secretVars(e))) env[`SAGA_SECRET_${envName(k.replace(/^secret\./, ""))}`] = v;
    try { const t = await apiEnv.token(e); if (t) env.SAGA_TOKEN = String(t); } catch {}
    return { env, mask: (s) => apiEnv.maskText(e, s) };
  } catch { return { env: {}, mask: (s) => s }; }
}

// preço estimado de um submit de vídeo (catálogo é de graça; null se não der)
export async function estimateSubmitCost(command, { commandEnv, W }) {
  try {
    const req = typeof command.code === "object" && command.code !== null ? command.code : JSON.parse(String(command.code || "{}"));
    if (String(command.language || "").toLowerCase() !== "video" || req?.action !== "submit") return null;
    const { estimateVideoCost } = await import("../ai/video-generation.js");
    const { env } = await commandEnv(W).catch(() => ({ env: {} }));
    const key = env.SAGADECK_VIDEO_KEY || env.OPENROUTER_API_KEY || process.env.SAGADECK_VIDEO_KEY || process.env.OPENROUTER_API_KEY;
    return await estimateVideoCost({ model: req.model, duration: req.duration, resolution: req.resolution }, { key });
  } catch { return null; }
}

// espera a pessoa no chat (10 min sem resposta = recusado); aborta junto com o pedido.
// cost (opcional): texto de custo estimado exibido junto ao pedido ("~$4.00").
export async function awaitApproval({ command, cost, user, signal, emit, approvals }) {
  const id = crypto.randomUUID();
  const decision = await new Promise((resolve) => {
    const timer = setTimeout(() => { approvals.delete(id); resolve("deny"); }, 10 * 60 * 1000);
    const abort = () => { clearTimeout(timer); approvals.delete(id); resolve("deny"); };
    signal?.addEventListener("abort", abort, { once: true });
    approvals.set(id, { user: user || "", answer: (d) => { clearTimeout(timer); approvals.delete(id); resolve(d); } });
    emit({ phase: "approve", id, command, cost: cost || null, text: "Esperando você autorizar o comando…" });
  });
  return decision;
}
