import fs from 'node:fs';
import path from 'node:path';
import { generateDeck } from '../src/ai/deck-ai.js';
import { evaluateAutonomy, AUTONOMY_CASES } from '../src/ai/evaluation.js';
import { reviewExperience } from '../src/ai/quality.js';
import { slideSnapshots, closeSnapshots } from '../src/studio/snapshot.js';
import { newDeckPath } from '../src/library.js';
import { writeDeckFile } from '../src/deck-file.js';

if (process.env.SAGADECK_LIVE !== '1') throw Error('Defina SAGADECK_LIVE=1 para executar a avaliação com IA real.');
const selected = process.argv.slice(2);
const cases = selected.length ? AUTONOMY_CASES.filter(c => selected.includes(c.id)) : AUTONOMY_CASES;
if (!cases.length) throw Error('Caso desconhecido. Opções: ' + AUTONOMY_CASES.map(c => c.id).join(', '));
const reports = [];
try {
  await evaluateAutonomy(cases, {
    generate: prompt => generateDeck(prompt, { images: false, research: false, reviewCheck: (spec, indices) => reviewExperience(spec, indices, { snapshot: slideSnapshots }) }),
    review: spec => reviewExperience(spec, spec.slides.map((_, i) => i), { snapshot: slideSnapshots }),
    record: async (report, spec) => {
      reports.push(report);
      const file = newDeckPath(`Avaliação ${report.id}`, { topic: 'Avaliação do agente', unique: true });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (spec) writeDeckFile(file, spec);
      fs.writeFileSync(path.join(path.dirname(file), 'avaliacao.json'), JSON.stringify(report, null, 2));
      console.log(`${report.id}: ${report.status} (${report.durationMs} ms) — ${path.dirname(file)}`);
    },
  });
} finally { await closeSnapshots(); }
if (reports.some(r => r.status !== 'reviewed')) process.exitCode = 1;
