// Guarda de valores protegidos (segredos dos slides de API) no arquivo de ambientes.
//
// No Windows: DPAPI do usuário (ProtectedData, escopo CurrentUser). O texto vira "dpapi:BASE64" e só este usuário,
// nesta máquina, consegue ler de volta — se o arquivo for copiado ou mandado para alguém, o segredo não vai junto.
// O valor passa pelo stdin do PowerShell (nunca pela linha de comando, que outros processos conseguem ver).
// Fora do Windows (ex.: o servidor Linux): fica como está, e o arquivo é gravado só para o dono (0600).
import { execFileSync } from "node:child_process";

export const PROTECTION = process.platform === "win32" ? "dpapi" : "arquivo";
const PREFIX = "dpapi:";
const cache = new Map(); // "dpapi:..." -> texto (decifrar custa um PowerShell; o mesmo valor, uma vez só)

function powershell(script, input) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { input, encoding: "utf8", windowsHide: true, maxBuffer: 1 << 24 }).trim();
}

// uma chamada para vários valores: entra e sai JSON (lista de strings)
function dpapi(values, direction) {
  const op = direction === "protect"
    ? "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v), $null, 'CurrentUser'))"
    : "[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v), $null, 'CurrentUser'))";
  const script = `Add-Type -AssemblyName System.Security; $in = [Console]::In.ReadToEnd() | ConvertFrom-Json; $out = @(); foreach ($v in @($in)) { $out += ${op} }; ConvertTo-Json -Compress -InputObject @($out)`;
  const out = JSON.parse(powershell(script, JSON.stringify(values)));
  return Array.isArray(out) ? out : [out];
}

export const isProtected = (v) => typeof v === "string" && v.startsWith(PREFIX);

export function protect(plain) {
  if (PROTECTION !== "dpapi") return String(plain);
  const [b64] = dpapi([String(plain)], "protect");
  const v = PREFIX + b64;
  cache.set(v, String(plain));
  return v;
}

export function unprotect(value) {
  if (!isProtected(value)) return value;
  if (!cache.has(value)) unprotectAll([value]);
  return cache.get(value);
}

// decifra de uma vez todos os ainda não vistos (um PowerShell só ao abrir o arquivo)
export function unprotectAll(values) {
  const todo = [...new Set(values.filter((v) => isProtected(v) && !cache.has(v)))];
  if (!todo.length) return;
  if (PROTECTION !== "dpapi") throw new Error("Este valor foi protegido no Windows (DPAPI) e só pode ser lido lá, pelo mesmo usuário.");
  const out = dpapi(todo.map((v) => v.slice(PREFIX.length)), "unprotect");
  todo.forEach((v, i) => cache.set(v, out[i]));
}
