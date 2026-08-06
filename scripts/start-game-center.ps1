# Game Center — Electron launcher (branch develop)
$ErrorActionPreference = "Stop"

$proj = Split-Path -Parent $PSScriptRoot
if (-not $proj) { $proj = "C:\Projetos\game-aggregator" }

function Stop-Tree([int]$processId) {
  if ($processId -le 0) { return }
  try { & taskkill.exe /PID $processId /T /F 2>$null | Out-Null } catch {}
}

Set-Location $proj

# Garante packages compilados (rápido se já existirem)
$coreOut = Join-Path $proj "packages\core\dist\index.js"
$metaOut = Join-Path $proj "packages\providers-meta\dist\index.js"
if (-not (Test-Path $coreOut)) {
  & npm run build -w @gagg/core
  if ($LASTEXITCODE -ne 0) { throw "Falha ao buildar @gagg/core" }
}
if (-not (Test-Path $metaOut)) {
  & npm run build -w @gagg/providers-meta
  if ($LASTEXITCODE -ne 0) { throw "Falha ao buildar @gagg/providers-meta" }
}

$proc = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c `"$PSScriptRoot\run-desktop.cmd`"" `
  -WorkingDirectory $proj `
  -WindowStyle Minimized `
  -PassThru

try {
  # Mantém vivo enquanto o processo do electron-vite / electron existir
  Wait-Process -Id $proc.Id
} finally {
  Stop-Tree $proc.Id
}
