$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$nodePath = (Get-Command node.exe).Source
$dataDir = Join-Path $projectRoot '.data'
$keyFile = Join-Path $dataDir 'access.key'
$reachable = $false
if (Test-Path -LiteralPath $keyFile) {
  try {
    $key = (Get-Content -LiteralPath $keyFile -Raw).Trim()
    $state = Invoke-RestMethod -Uri 'http://127.0.0.1:4780/api/state' -Headers @{'X-Code-Room-Key'=$key} -TimeoutSec 2
    $reachable = $true
    $expected = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    if ($state.runtime.version -ne $expected) {
      Write-Host "Um Code Room da versao $($state.runtime.version) ainda esta ativo (esperado: $expected)."
      Write-Host 'Feche o processo node server/main.mjs (Gerenciador de Tarefas) e abra de novo. Nada foi encerrado automaticamente.'
      Read-Host 'Pressione Enter para sair'
      exit 1
    }
  } catch {}
}
if (-not $reachable) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  $serverFile = Join-Path $projectRoot 'server\main.mjs'
  $process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDir 'server.log') -RedirectStandardError (Join-Path $dataDir 'server-error.log')
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 300
    if ($process.HasExited) { throw 'O serviço não iniciou. Consulte .data/server-error.log.' }
    if (Test-Path -LiteralPath $keyFile) {
      try {
        $key = (Get-Content -LiteralPath $keyFile -Raw).Trim()
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:4780/api/state' -Headers @{'X-Code-Room-Key'=$key} -TimeoutSec 1
        $reachable=$true; break
      } catch {}
    }
  }
  if (-not $reachable) { throw 'Não foi possível conectar ao Code Room.' }
}
Start-Process -FilePath ('http://127.0.0.1:4780/#' + $key)
