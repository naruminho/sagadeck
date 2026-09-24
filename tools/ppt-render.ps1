# Renderiza um .pptx pelo PowerPoint instalado (Windows) em PNGs — usado para conferir
# se o PowerPoint desenha igual ao navegador. Uso:
#   powershell -File ppt-render.ps1 deck.pptx pasta-saida [largura]
param([string]$Pptx, [string]$Out, [int]$Width = 1920)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
Get-ChildItem $Out -Filter "ppt-*.png" -ErrorAction SilentlyContinue | Remove-Item -Force
$app = New-Object -ComObject PowerPoint.Application
try {
  $p = $app.Presentations.Open((Resolve-Path $Pptx).Path, $true, $false, $false)
  $h = [int]($Width * 9 / 16)
  foreach ($s in $p.Slides) {
    $n = $s.SlideIndex.ToString("00")
    $s.Export((Join-Path $Out "ppt-$n.png"), "PNG", $Width, $h)
    $anim = $s.TimeLine.MainSequence.Count
    Write-Output "slide $n : $anim efeitos de animação"
  }
  $p.Close()
} finally { $app.Quit() }
