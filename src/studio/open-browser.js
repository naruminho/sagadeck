// `sagadeck studio` abre o navegador na página certa: quem acabou de instalar não precisa achar o endereço no meio do
// que o terminal escreveu. Só quando faz sentido: alguém no terminal (não um serviço, não um teste, não a CI), sem
// servidor multiusuário e sem --sem-navegador / SAGADECK_NO_BROWSER=1.
import { spawn } from "node:child_process";

export function shouldOpenBrowser({ flags = {}, env = process.env, isTTY = process.stdout.isTTY, multiuser = false, platform = process.platform } = {}) {
  if (flags["sem-navegador"] || flags["no-browser"] || env.SAGADECK_NO_BROWSER === "1") return false;
  if (multiuser || env.CI || !isTTY) return false;
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return false; // servidor sem tela
  return true;
}

export function openBrowser(url, { platform = process.platform, spawnFn = spawn } = {}) {
  const [cmd, args] = platform === "win32" ? ["cmd", ["/c", "start", "", url]] : platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { const child = spawnFn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true }); child.on?.("error", () => {}); child.unref?.(); return true; }
  catch { return false; }
}
