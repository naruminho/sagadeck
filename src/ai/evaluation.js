// Casos públicos e independentes dos decks usados no desenvolvimento.
import { varietyReport } from './variety.js';
import { auditExploration } from '../exploration.js';
import { measureLLM } from './usage.js';
export const AUTONOMY_CASES = [
  { id: 'capacidade', prompt: 'Crie 4 slides para uma reunião de produto. Simulação explicitamente ilustrativa: demanda de 1 a 9 e capacidade de 10 a 20 tarefas/s; tempo médio = 1/(capacidade-demanda), hipótese M/M/1. Permita comparar folga, limite e expansão; explique as hipóteses. Público de negócios, sala pequena. Não pesquise, não pergunte, use só estes dados.' },
  { id: 'geometria', prompt: 'Crie 4 slides para alunos explorarem por que dobrar o raio quadruplica a área de um círculo. Raio entre 1 e 10, área = pi*r^2. Previsão, cenários e explicação para estudo. Aula presencial, adolescentes. Não pesquise nem pergunte.' },
  { id: 'algoritmo', prompt: 'Crie 4 slides para uma aula técnica de busca binária com [2,5,8,12,16,23,38]. Faça prever a busca de 23, acompanhar o algoritmo e explique quando não funciona. Preserve o vetor. Não pesquise nem pergunte.' },
  { id: 'narrativa', prompt: 'Crie 5 slides para apresentar um projeto de horta comunitária: 12 voluntários, 3 canteiros, orçamento de R$ 2400. Dados de um exemplo fictício. Ordem: lugar, pessoas, plano, orçamento, convite. Visual editorial, fotos não disponíveis, sem estatísticas inventadas. Não pesquise nem pergunte.' },
  { id: 'consulta', prompt: 'Crie 3 slides densos para consulta: explique HTTP 202, polling com intervalo e limite de tentativas, exemplo JavaScript sem dependências. API fictícia /jobs e /jobs/id, sem execução real. Preservar código completo e explicar falhas. Não pesquise nem pergunte.' },
];
export async function evaluateAutonomy(cases, { generate, review, record = async () => {} }) {
  const report = [];
  for (const item of cases) {
    const started = Date.now();
    try {
      const measured = await measureLLM(async () => {
        const result = await generate(item.prompt);
        if (!result.spec) throw Error('O agente não entregou uma apresentação.');
        const quality = review ? await review(result.spec) : result.quality || null;
        return { result, quality };
      });
      const { result, quality } = measured.result;
      if (!result.spec) throw Error('O agente não entregou uma apresentação.');
      const validation = result.spec.slides.flatMap((s, i) => auditExploration(s).map(text => ({ slide: i + 1, text })));
      const row = { id: item.id, durationMs: Date.now() - started, slides: result.spec.slides.length, validation, variety: varietyReport(result.spec), quality, humanInterventions: 0, tokens: measured.usage.calls && !measured.usage.missingUsage ? measured.usage.promptTokens + measured.usage.completionTokens : null, cost: measured.usage.calls && !measured.usage.missingCost ? measured.usage.reportedCost : null, usage: measured.usage, measurementNote: 'Tokens e custo somente quando informados pelo provedor em todas as chamadas; tentativas internas de fallback podem não ser contabilizadas. Qualidade semântica requer revisão. Zero intervenções significa execução sem edição externa, não aprovação.', status: validation.length || quality?.issues.length ? 'needs-work' : quality?.verified ? 'reviewed' : 'unverified' };
      report.push(row); await record(row, result.spec);
    } catch (error) { const row = { id: item.id, durationMs: Date.now() - started, status: 'failed', error: error.message }; report.push(row); await record(row); }
  }
  return report;
}
