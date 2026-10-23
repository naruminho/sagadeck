// O roteiro de implantação no Oracle (scripts/implantar-oracle.mjs). Antes ele era feito à mão, e um git sem sudo
// (a pasta é do root) falhava sem ninguém ver, enquanto o npm ci rodava sem precisar. Aqui o roteiro roda de verdade
// num servidor de mentira: git de verdade, e sudo, systemctl, curl e npm trocados por versões que só anotam.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { remoteScript, parseArgs, INSTANCIAS } from "../scripts/implantar-oracle.mjs";

test("implantação no Oracle: o roteiro usa git como root, o dev vai antes do estável e o estável só avança sem desvio", () => {
  const s = remoteScript();
  assert.ok(!/^\s*git /m.test(s), "todo git passa pelo sudo (a pasta é do root)");
  assert.match(s, /merge -q --ff-only/);
  assert.match(s, /checkout -q -B dev/);
  assert.ok(s.indexOf("implantar 'sagadeck-dev'") < s.indexOf("implantar 'sagadeck'"), "o dev primeiro");
  assert.ok(s.includes('[ "$(dependencias "$pasta" "$antes")" != "$(dependencias "$pasta" HEAD)" ]'), "npm ci só quando as dependências mudam");
  assert.match(s, /delete l\.version; if \(l\.packages\?\.\[""\]\) delete l\.packages\[""\]\.version/, "o número da versão sozinho não pede npm ci");
  const soDev = remoteScript({ instancias: INSTANCIAS.filter((i) => i.dev) }).split("\n").filter((l) => l.startsWith("implantar "));
  assert.deepEqual(soDev.map((l) => l.split(" ")[1]), ["'sagadeck-dev'"], "--so-dev não toca no estável");
  assert.deepEqual(parseArgs(["--so-dev", "--ref", "v1.11.4"]), { host: "claudia", ref: "v1.11.4", soDev: true, mostrar: false });
  assert.throws(() => parseArgs(["--ref", "x; rm -rf /"]), /Versão inválida/);
  assert.throws(() => parseArgs(["--qualquer"]), /Opção desconhecida/);
});

const bash = process.platform === "win32" ? null : spawnSync("bash", ["--version"]).status === 0;

test("implantação no Oracle: roda num servidor de mentira (atualiza, reinstala só se precisa, para no desvio)", { skip: !bash && "precisa de bash (roda no Linux e no macOS)" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-implantar-"));
  try {
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1", HOME: tmp };
    const git = (cwd, ...args) => { const r = spawnSync("git", args, { cwd, env, encoding: "utf8" }); assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
    const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, v); };
    // a origem, com a versão 1.0.0, e as duas instalações clonadas dela
    const work = path.join(tmp, "trabalho"), origin = path.join(tmp, "origem.git");
    git(tmp, "init", "-q", "--bare", "-b", "main", origin);
    git(tmp, "clone", "-q", origin, work);
    write(path.join(work, "package.json"), JSON.stringify({ name: "sagadeck", version: "1.0.0" }));
    write(path.join(work, "package-lock.json"), '{"lock":1}');
    git(work, "add", "."); git(work, "commit", "-q", "-m", "1.0.0"); git(work, "push", "-q", "origin", "HEAD:main");
    const dev = path.join(tmp, "opt", "sagadeck-dev"), prod = path.join(tmp, "opt", "sagadeck");
    for (const d of [dev, prod]) { git(tmp, "clone", "-q", origin, d); fs.mkdirSync(path.join(d, "node_modules")); }
    git(dev, "checkout", "-q", "-B", "dev");
    // o servidor de mentira: sudo só repassa; systemctl, npm e journalctl anotam; curl responde a versão da pasta
    const bin = path.join(tmp, "bin"), log = path.join(tmp, "log.txt");
    write(path.join(bin, "sudo"), '#!/bin/sh\nexec "$@"\n');
    write(path.join(bin, "systemctl"), `#!/bin/sh\necho "systemctl $*" >> ${log}\n`);
    write(path.join(bin, "journalctl"), `#!/bin/sh\necho "journalctl $*" >> ${log}\n`);
    write(path.join(bin, "npm"), `#!/bin/sh\necho "npm $* em $(basename "$PWD")" >> ${log}\n`);
    write(path.join(bin, "curl"), `#!/bin/sh\nfor a; do last=$a; done\ncase "$last" in *:3518/*) d=${dev};; *) d=${prod};; esac\n[ -f "$d/.fora-do-ar" ] && exit 7\nprintf '{"app":"sagadeck-studio","version":"%s"}' "$(node -p "require('$d/package.json').version")"\n`);
    for (const f of fs.readdirSync(bin)) fs.chmodSync(path.join(bin, f), 0o755);
    const instancias = [{ servico: "sagadeck-dev", pasta: dev, porta: 3518, dev: true }, { servico: "sagadeck", pasta: prod, porta: 3517, dev: false }];
    const run = (opts = {}) => {
      fs.rmSync(log, { force: true });
      const r = spawnSync("bash", ["-s"], { input: remoteScript({ instancias, tentativas: 2, nodeBin: bin, ...opts }), env: { ...env, PATH: `${bin}:${process.env.PATH}` }, encoding: "utf8" });
      return { ...r, log: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "" };
    };
    const release = (version, lock) => {
      write(path.join(work, "package.json"), JSON.stringify({ name: "sagadeck", version }));
      if (lock) write(path.join(work, "package-lock.json"), lock);
      git(work, "commit", "-qam", version); git(work, "push", "-q", "origin", "HEAD:main");
    };

    // 1.0.1 sem mudar dependências: os dois atualizam e reiniciam, o dev primeiro, sem npm ci
    release("1.0.1");
    let r = run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ok: sagadeck-dev 1\.0\.1[^]*ok: sagadeck 1\.0\.1[^]*implantação concluída/);
    assert.deepEqual(r.log.trim().split("\n"), ["systemctl restart sagadeck-dev", "systemctl restart sagadeck"]);
    assert.equal(git(dev, "branch", "--show-current"), "dev");
    assert.equal(git(prod, "rev-parse", "HEAD"), git(work, "rev-parse", "HEAD"));

    // 1.0.2 com dependência nova: npm ci nas duas pastas
    release("1.0.2", '{"lock":2}');
    r = run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.log, /npm ci --omit=dev [^\n]* em sagadeck-dev\n[^]*npm ci --omit=dev [^\n]* em sagadeck\n/);

    // o dev não sobe na versão nova: para ali, mostra o log e o estável nem é tocado
    release("1.0.3");
    write(path.join(dev, ".fora-do-ar"), "");
    r = run();
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /ERRO: sagadeck-dev não respondeu com a versão 1\.0\.3 em 2 s/);
    assert.match(r.log, /journalctl -u sagadeck-dev/);
    assert.ok(!r.log.includes("restart sagadeck\n"), "o estável não reinicia");
    assert.equal(JSON.parse(fs.readFileSync(path.join(prod, "package.json"), "utf8")).version, "1.0.2");
    fs.rmSync(path.join(dev, ".fora-do-ar"));

    // alguém fez um commit direto na pasta do estável: o merge --ff-only recusa e nada reinicia nele
    write(path.join(prod, "local.txt"), "mexi aqui");
    git(prod, "add", "."); git(prod, "commit", "-q", "-m", "mexida local");
    release("1.0.4");
    r = run();
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /ok: sagadeck-dev 1\.0\.4/);
    assert.ok(!r.log.includes("restart sagadeck\n"), "o estável com desvio não reinicia");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
