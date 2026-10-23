#!/usr/bin/env node
// Testes com o modelo de verdade (test/ai-live.test.js): roda a bateria, repete uma vez o que falhar (o modelo varia de
// uma rodada para outra; uma falha que some na repetição é "instável", não regressão) e escreve o resumo.
// Quando roda: antes de publicar toda versão cujo último número é múltiplo de 3 (1.11.3, 1.11.6, 1.12.0…), na máquina
// de quem publica, e o que falhar duas vezes se corrige antes de publicar (regra no CLAUDE.md). A cada três releases a
// bateria cobre tudo o que entrou no intervalo, sem pagar uma rodada por release nem rodar à toa agendada. Na CI, só
// pelo botão (.github/workflows/ai-live.yml, Run workflow).
//
//   node scripts/ai-live-ci.mjs                 roda (precisa da IA configurada: SAGADECK_IA ou ~/.sagadeck/ia.json)
//   node scripts/ai-live-ci.mjs --na-release    só roda se a versão do package.json for múltipla de 3
//   AI_LIVE_FILTRO=contas node scripts/ai-live-ci.mjs    só os testes cujo nome casa com o filtro
//
// Sai com 1 só quando um teste falha duas vezes seguidas. Sem IA configurada, avisa e sai com 0.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "test/ai-live.test.js";

// a versão pede os testes ao vivo? (último número múltiplo de 3: 1.11.3 sim, 1.11.4 não, 1.12.0 sim)
export function liveRelease(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || ""));
  return !!m && Number(m[3]) % 3 === 0;
}

// os testes que falharam, pelo resumo final do node --test ("✖ failing tests:" e uma linha "✖ nome (12.3ms)" por teste)
export function failedTests(output) {
  const lines = String(output).split(/\r?\n/);
  const start = lines.findIndex((l) => /^✖ failing tests:/.test(l));
  if (start < 0) return [];
  const names = [];
  for (const l of lines.slice(start + 1)) {
    const m = /^✖ (.+?) \(\d+(?:\.\d+)?ms\)\s*$/.exec(l);
    if (m && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

// o nome do teste como expressão regular exata (nomes têm parênteses, aspas, setas, "+" e "?")
export const exactPattern = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;

// o resumo em Markdown (vai para o resumo do job do GitHub e para o log)
export function summary({ total, passed, flaky, broken, seconds }) {
  const out = [`## Testes com o modelo de verdade`, "", `${passed} de ${total} passaram de primeira em ${Math.round(seconds / 60)} min.`];
  if (flaky.length) out.push("", `**Instáveis** (falharam e passaram na repetição; o modelo varia):`, ...flaky.map((n) => `- ${n}`));
  if (broken.length) out.push("", `**Falharam duas vezes** (olhar antes de publicar):`, ...broken.map((b) => `- ${b.name}\n\n  \`\`\`\n  ${b.reason.split("\n").join("\n  ")}\n  \`\`\``));
  if (!flaky.length && !broken.length) out.push("", "Nenhuma falha.");
  return out.join("\n");
}

// a mensagem do erro de um teste (as linhas logo depois do "✖ nome" no resumo final)
export function failureReason(output, name) {
  const lines = String(output).split(/\r?\n/);
  const start = lines.findIndex((l) => /^✖ failing tests:/.test(l));
  const at = lines.findIndex((l, i) => i > start && l.startsWith(`✖ ${name} (`));
  if (at < 0) return "(sem detalhe)";
  const body = [];
  for (const l of lines.slice(at + 1, at + 12)) { if (/^✖ /.test(l)) break; if (l.trim()) body.push(l.trim()); }
  return body.slice(0, 6).join("\n").slice(0, 800) || "(sem detalhe)";
}

function run(args) {
  const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...args, FILE], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, SAGADECK_LIVE: "1" }, maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status, output: `${r.stdout || ""}\n${r.stderr || ""}` };
}

async function main() {
  if (process.argv.includes("--na-release")) {
    const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    if (!liveRelease(version)) {
      console.log(`Versão ${version}: os testes com o modelo de verdade rodam só antes das versões múltiplas de 3 (a próxima: ${version.replace(/\d+$/, (p) => String(Math.ceil((Number(p) + 1) / 3) * 3))}).`);
      return 0;
    }
    console.log(`Versão ${version} é múltipla de 3: rodando os testes com o modelo de verdade antes de publicar.`);
  }
  const { readIA, iaFile } = await import("../src/ai/ia-config.js");
  const { config, problem } = readIA(iaFile());
  if (!config) {
    console.log(`${problem || `IA não configurada (${iaFile()})`}: os testes com o modelo de verdade não rodaram.`);
    return 0;
  }
  const t0 = Date.now();
  const filtro = process.env.AI_LIVE_FILTRO ? [`--test-name-pattern=${process.env.AI_LIVE_FILTRO}`] : [];
  const first = run(filtro);
  process.stdout.write(first.output);
  const tests = Number(/ℹ tests (\d+)/.exec(first.output)?.[1] || 0), pass = Number(/ℹ pass (\d+)/.exec(first.output)?.[1] || 0);
  const flaky = [], broken = [];
  for (const name of failedTests(first.output)) {
    const again = run([`--test-name-pattern=${exactPattern(name)}`]);
    if (again.code === 0 && /ℹ pass [1-9]/.test(again.output)) flaky.push(name);
    else broken.push({ name, reason: failureReason(again.output, name) || failureReason(first.output, name) });
  }
  const text = summary({ total: tests, passed: pass, flaky, broken, seconds: (Date.now() - t0) / 1000 });
  console.log(`\n${text}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  for (const b of broken) console.log(`::error title=teste ao vivo falhou duas vezes::${b.name}`);
  return broken.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}
