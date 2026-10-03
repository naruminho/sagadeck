import fs from 'node:fs';
import path from 'node:path';

export function saveGenReport(dir, generation) {
  const reportDir = path.join(dir, '.sagadeck');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'avaliacao-geracao.json'), JSON.stringify({
    createdAt: new Date().toISOString(), quality: generation.quality, variety: generation.variety,
  }, null, 2), 'utf8');
}
