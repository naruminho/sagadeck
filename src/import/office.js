// O que o sistema oferece para importar melhor (tudo opcional; sem nada disso a importação funciona igual):
//   - Windows: WMF/EMF (figuras antigas do Office) viram PNG pelo próprio Windows (System.Drawing), sem Office.
//   - PowerPoint instalado: a foto fiel de cada slide (para comparar e para a IA ver). Abre uma CÓPIA do arquivo,
//     só para leitura e sem janela; fecha só o que abriu e nunca fecha o PowerPoint de quem está usando.
//   - LibreOffice (comum no Linux): converte o .pptx em PDF, e as páginas viram PNG pelo pdf.js (src/import/pdf-render.js);
//     também converte WMF/EMF.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-import-"));

function powershell(script, args, timeout = 600000) {
  const dir = tmpDir();
  try {
    const ps1 = path.join(dir, "run.ps1"), json = path.join(dir, "args.json");
    fs.writeFileSync(ps1, "\uFEFF" + script, "utf8");
    fs.writeFileSync(json, JSON.stringify(args), "utf8");
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1, json], { encoding: "utf8", timeout, windowsHide: true });
    return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

let officeCache = null;
export function powerPointAvailable() {
  if (!isWin || process.env.SAGADECK_NO_OFFICE) return false;
  if (officeCache != null) return officeCache;
  const r = powershell("$t = [type]::GetTypeFromProgID('PowerPoint.Application'); if ($t) { 'sim' } else { 'nao' }", {}, 30000);
  officeCache = r.ok && r.out === "sim";
  return officeCache;
}
export function libreOfficeBin() {
  if (process.env.SAGADECK_NO_OFFICE) return null;
  const names = isWin ? ["soffice.exe"] : ["soffice", "libreoffice"];
  const dirs = [...String(process.env.PATH || "").split(path.delimiter), ...(isWin ? ["C:\\Program Files\\LibreOffice\\program", "C:\\Program Files (x86)\\LibreOffice\\program"] : ["/usr/bin", "/usr/local/bin", "/opt/libreoffice/program", "/Applications/LibreOffice.app/Contents/MacOS"])];
  for (const d of dirs) for (const n of names) { const f = path.join(d, n); if (d && fs.existsSync(f)) return f; }
  return null;
}

// WMF/EMF → PNG. pairs: [{ src, dst }] (caminhos absolutos). Devolve os dst que ficaram prontos.
export function metafilesToPng(pairs, { maxSide = 2400 } = {}) {
  if (!pairs.length) return [];
  if (isWin && !process.env.SAGADECK_NO_OFFICE) {
    const script = `
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
$a = Get-Content -Raw -Encoding UTF8 $args[0] | ConvertFrom-Json
foreach ($p in $a.pairs) {
  try {
    $m = New-Object System.Drawing.Imaging.Metafile($p.src)
    $w = [double]$m.Width; $h = [double]$m.Height
    if ($w -le 0 -or $h -le 0) { $m.Dispose(); continue }
    $k = [Math]::Min(4.0, [Math]::Max(1.0, $a.maxSide / [Math]::Max($w, $h)))
    if ([Math]::Max($w, $h) * $k -gt $a.maxSide) { $k = $a.maxSide / [Math]::Max($w, $h) }
    $bw = [int][Math]::Max(1, $w * $k); $bh = [int][Math]::Max(1, $h * $k)
    $b = New-Object System.Drawing.Bitmap($bw, $bh)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($m, 0, 0, $bw, $bh)
    $b.Save($p.dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $b.Dispose(); $m.Dispose()
    Write-Output ("ok " + $p.dst)
  } catch { Write-Output ("falhou " + $p.src) }
}`;
    powershell(script, { pairs, maxSide });
    return pairs.filter((p) => fs.existsSync(p.dst)).map((p) => p.dst);
  }
  const lo = libreOfficeBin();
  if (lo) {
    for (const p of pairs) {
      const out = tmpDir();
      spawnSync(lo, ["--headless", "--convert-to", "png", "--outdir", out, p.src], { timeout: 120000 });
      const f = fs.readdirSync(out).find((x) => x.endsWith(".png"));
      if (f) fs.copyFileSync(path.join(out, f), p.dst);
      fs.rmSync(out, { recursive: true, force: true });
    }
    return pairs.filter((p) => fs.existsSync(p.dst)).map((p) => p.dst);
  }
  return [];
}

// Foto de cada slide pelo PowerPoint: outDir/slide-01.png… Devolve a lista de arquivos (vazia se não deu).
export function powerPointSnapshots(pptxFile, outDir, { width = 1920 } = {}) {
  if (!powerPointAvailable()) return [];
  fs.mkdirSync(outDir, { recursive: true });
  const work = tmpDir();
  const copy = path.join(work, "copia" + path.extname(pptxFile));
  fs.copyFileSync(pptxFile, copy); // trabalha numa cópia: o original pode estar aberto (e travado) no PowerPoint
  const script = `
$ErrorActionPreference = 'Stop'
$a = Get-Content -Raw -Encoding UTF8 $args[0] | ConvertFrom-Json
$pp = New-Object -ComObject PowerPoint.Application
$had = $pp.Presentations.Count
$pres = $pp.Presentations.Open($a.file, -1, 0, 0)
try {
  $h = [int]([double]$a.width * $pres.PageSetup.SlideHeight / $pres.PageSetup.SlideWidth)
  for ($i = 1; $i -le $pres.Slides.Count; $i++) {
    $pres.Slides.Item($i).Export((Join-Path $a.out ('slide-{0:D2}.png' -f $i)), 'PNG', [int]$a.width, $h)
  }
  Write-Output $pres.Slides.Count
} finally {
  $pres.Close()
  if ($had -eq 0 -and $pp.Presentations.Count -eq 0) { $pp.Quit() }
}`;
  try {
    const r = powershell(script, { file: copy, out: outDir, width });
    if (!r.ok) return [];
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  return fs.readdirSync(outDir).filter((f) => /^slide-\d+\.png$/.test(f)).sort().map((f) => path.join(outDir, f));
}

// .pptx → .pdf pelo LibreOffice (para fotografar as páginas quando não há PowerPoint)
export function libreOfficeToPdf(file) {
  const lo = libreOfficeBin();
  if (!lo) return null;
  const out = tmpDir();
  spawnSync(lo, ["--headless", "--convert-to", "pdf", "--outdir", out, file], { timeout: 300000 });
  const f = fs.readdirSync(out).find((x) => x.endsWith(".pdf"));
  return f ? { pdf: path.join(out, f), cleanup: () => fs.rmSync(out, { recursive: true, force: true }) } : null;
}
