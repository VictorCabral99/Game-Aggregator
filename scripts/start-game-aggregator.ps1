# Game Aggregator (branch main / Next.js) — sobe o server, abre janela app e encerra ao fechar
$ErrorActionPreference = "Stop"

$proj = Split-Path -Parent $PSScriptRoot
if (-not $proj) { $proj = "C:\Projetos\game-aggregator-web" }

$UiPort = 3000
$Url = "http://localhost:$UiPort"
$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$Edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$ProfileDir = Join-Path $env:TEMP "game-aggregator-web-app-profile"

function Test-GaggUi([string]$u) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -ge 200 -and $r.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-GaggUi([string]$u, [int]$seconds = 60) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if (Test-GaggUi $u) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Stop-Tree([int]$processId) {
  if ($processId -le 0) { return }
  try {
    & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
  } catch {}
}

Set-Location $proj
$env:GAGG_WEB_PORT = "$UiPort"
$env:PORT = "$UiPort"

$started = $false
$serverProc = $null

try {
  if (-not (Test-GaggUi $Url)) {
    $serverProc = Start-Process -FilePath "cmd.exe" `
      -ArgumentList "/c `"$PSScriptRoot\run-web.cmd`"" `
      -WorkingDirectory $proj `
      -WindowStyle Minimized `
      -PassThru
    $started = $true
  }

  [void](Wait-GaggUi $Url 90)

  $browser = $null
  $browserArgs = @(
    "--user-data-dir=$ProfileDir"
    "--no-first-run"
    "--no-default-browser-check"
    "--app=$Url"
  )

  if (Test-Path $Chrome) {
    $browser = $Chrome
  } elseif (Test-Path $Edge) {
    $browser = $Edge
  }

  if ($null -eq $browser) {
    Start-Process $Url
    return
  }

  $null = Start-Process -FilePath $browser `
    -ArgumentList $browserArgs `
    -PassThru `
    -Wait

} finally {
  if ($started -and $serverProc) {
    Stop-Tree $serverProc.Id
  }
}
