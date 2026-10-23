#!/usr/bin/env node
// Implanta o sagadeck no servidor Oracle (os dois serviços atrás do portal: sagadeck-dev na 3518 e sagadeck na 3517;
// guia completo em oraculo-workspace/infra/DEPLOY-sagadeck.md). Sempre do mesmo jeito, para não depender de lembrar
// os detalhes: git como root (a pasta é do root; git sem sudo recusa a pasta e falha), npm ci só quando as
// dependências mudaram, o dev primeiro e o estável só se o dev subiu na versão certa.
//
//   node scripts/implantar-oracle.mjs                 dev e estável, com a origin/main
//   node scripts/implantar-oracle.mjs --so-dev        só o dev (agentes, durante o trabalho)
//   node scripts/implantar-oracle.mjs --ref v1.11.4   outra versão (vale para os dois)
//   node scripts/implantar-oracle.mjs --host outro    outro servidor do ~/.ssh/config (padrão: claudia)
//   node scripts/implantar-oracle.mjs --mostrar       só mostra o roteiro que rodaria no servidor
//
// O estável só avança pela main sem desvio (merge --ff-only): se alguém mexeu na pasta, para e avisa. O dev segue o
// costume do guia (branch dev apontando para a versão em teste). Sai com 1 se alguma etapa falhar.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const INSTANCIAS = [
  { servico: "sagadeck-dev", pasta: "/opt/sagadeck-dev", porta: 3518, dev: true },
  { servico: "sagadeck", pasta: "/opt/sagadeck", porta: 3517, dev: false },
];
export const NODE_BIN = "/opt/sagadeck-runtime/bin";
// usuário só para a conferência da versão (/api/instance exige um; a pasta dele já existe nos dois serviços)
export const USUARIO_CONFERENCIA = "verificacao";

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const LOCK_SEM_VERSAO = 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => { const l = JSON.parse(s); delete l.version; if (l.packages?.[""]) delete l.packages[""].version; process.stdout.write(JSON.stringify(l)); });';

// o roteiro bash que roda no servidor (vai pela entrada do ssh: nada fica gravado lá)
export function remoteScript({ instancias = INSTANCIAS, ref = "origin/main", tentativas = 30, nodeBin = NODE_BIN } = {}) {
  const linhas = [
    "set -euo pipefail",
    `export PATH=${nodeBin}:$PATH`,
    // as dependências de uma versão: o package-lock.json sem o número da versão (toda versão nova muda esse número no
    // package.json e no lock, e isso sozinho não pede npm ci)
    "dependencias() {",
    `  sudo git -C "$1" show "$2:package-lock.json" | node -e ${q(LOCK_SEM_VERSAO)}`,
    "}",
    "implantar() {",
    '  local servico=$1 pasta=$2 porta=$3 dev=$4 ref=$5',
    '  echo "== $servico ($pasta)"',
    '  sudo git -C "$pasta" fetch -q origin --tags',
    '  local antes; antes=$(sudo git -C "$pasta" rev-parse HEAD)',
    '  if [ "$dev" = 1 ]; then sudo git -C "$pasta" checkout -q -B dev "$ref"',
    '  else sudo git -C "$pasta" merge -q --ff-only "$ref"; fi',
    '  local depois; depois=$(sudo git -C "$pasta" rev-parse --short HEAD)',
    '  if [ ! -d "$pasta/node_modules" ] || [ "$(dependencias "$pasta" "$antes")" != "$(dependencias "$pasta" HEAD)" ]; then',
    '    echo "   dependências mudaram: npm ci"',
    '    (cd "$pasta" && sudo env PATH="$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error)',
    "  fi",
    '  local versao; versao=$(node -p "require(\'$pasta/package.json\').version")',
    '  sudo systemctl restart "$servico"',
    "  local resposta=''",
    `  for _ in $(seq 1 ${tentativas}); do`,
    `    resposta=$(curl -s -H "x-sagadeck-user: ${USUARIO_CONFERENCIA}" "http://127.0.0.1:$porta/api/instance" || true)`,
    '    case "$resposta" in *"\\"version\\":\\"$versao\\""*) echo "   ok: $servico $versao ($depois)"; return 0;; esac',
    "    sleep 1",
    "  done",
    '  echo "   ERRO: $servico não respondeu com a versão $versao em ' + tentativas + ' s: ${resposta:0:200}"',
    '  sudo journalctl -u "$servico" -n 20 --no-pager || true',
    "  return 1",
    "}",
  ];
  // o dev primeiro: se ele não subir, o estável fica como está (set -e para no primeiro erro)
  for (const i of [...instancias].sort((a, b) => Number(b.dev) - Number(a.dev))) {
    linhas.push(`implantar ${q(i.servico)} ${q(i.pasta)} ${i.porta} ${i.dev ? 1 : 0} ${q(ref)}`);
  }
  linhas.push('echo "implantação concluída"');
  return linhas.join("\n") + "\n";
}

export function parseArgs(argv) {
  const opts = { host: "claudia", ref: "origin/main", soDev: false, mostrar: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--so-dev") opts.soDev = true;
    else if (a === "--mostrar") opts.mostrar = true;
    else if (a === "--host" || a === "--ref") { const v = argv[++i]; if (!v || v.startsWith("--")) throw new Error(`${a} precisa de um valor.`); opts[a.slice(2)] = v; }
    else throw new Error(`Opção desconhecida: ${a}`);
  }
  if (!/^[\w./-]+$/.test(opts.ref)) throw new Error(`Versão inválida: ${opts.ref}`);
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const script = remoteScript({ instancias: INSTANCIAS.filter((i) => !opts.soDev || i.dev), ref: opts.ref });
  if (opts.mostrar) { process.stdout.write(script); return 0; }
  const r = spawnSync("ssh", ["-o", "BatchMode=yes", opts.host, "bash", "-s"], { input: script, stdio: ["pipe", "inherit", "inherit"] });
  if (r.error) { console.error(`Não consegui rodar o ssh: ${r.error.message}`); return 1; }
  return r.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
