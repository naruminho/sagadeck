// Medição por tarefa, isolada de outras pessoas/requisições concorrentes.
import { AsyncLocalStorage } from 'node:async_hooks';
const scope = new AsyncLocalStorage();
export const currentUsage = () => scope.getStore();
export async function measureLLM(run) {
  const usage = { calls: 0, failedCalls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0, reportedCost: 0, missingCost: 0 };
  const result = await scope.run(usage, run);
  return { result, usage };
}
export function recordUsage(metrics, result) {
  const u = result?.usage;
  if (Number.isFinite(u?.prompt_tokens) && Number.isFinite(u?.completion_tokens)) {
    metrics.promptTokens += u.prompt_tokens; metrics.completionTokens += u.completion_tokens;
  } else metrics.missingUsage++;
  if (Number.isFinite(u?.cost)) metrics.reportedCost += u.cost;
  else metrics.missingCost++;
}
