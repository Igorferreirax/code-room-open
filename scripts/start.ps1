# Inicia o Code Room (serviço local) e abre o navegador já autenticado.
# - Se existir runtime\node.exe (pacote Windows), usa esse Node: não precisa ter Node instalado.
# - Pacote Windows: os dados ficam em %LOCALAPPDATA%\CodeRoom\data (fora da pasta do programa, para atualizar sem perder nada).
#   Rodando pelo código-fonte, ficam em .data\ dentro do projeto. CODE_ROOM_DATA e CODE_ROOM_PORT têm prioridade.
# - CODE_ROOM_NO_BROWSER=1 não abre o navegador (usado nos testes).
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$bundledNode = Join-Path $projectRoot 'runtime\node.exe'
$packaged = Test-Path -LiteralPath $bundledNode
$nodePath = if ($packaged) { $bundledNode } else { (Get-Command node.exe -ErrorAction Stop).Source }
if ($packaged) { $env:PATH = $env:PATH + ';' + (Join-Path $projectRoot 'runtime') }   # no fim: o Node do sistema, se houver, tem prioridade
$dataDir = if ($env:CODE_ROOM_DATA) { $env:CODE_ROOM_DATA } elseif ($packaged) { Join-Path $env:LOCALAPPDATA 'CodeRoom\data' } else { Join-Path $projectRoot '.data' }
$port = if ($env:CODE_ROOM_PORT) { [int]$env:CODE_ROOM_PORT } else { 4780 }
$env:CODE_ROOM_DATA = $dataDir; $env:CODE_ROOM_PORT = [string]$port
$base = "http://127.0.0.1:$port"
$keyFile = Join-Path $dataDir 'access.key'
$reachable = $false
if (Test-Path -LiteralPath $keyFile) {
  try {
    $key = (Get-Content -LiteralPath $keyFile -Raw).Trim()
    $state = Invoke-RestMethod -Uri "$base/api/state" -Headers @{'X-Code-Room-Key'=$key} -TimeoutSec 2
    $reachable = $true
    $expected = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    if ($state.runtime.version -ne $expected) {
      Write-Host "Um Code Room da versao $($state.runtime.version) ainda esta ativo (esperado: $expected)."
      Write-Host 'Feche-o (atalho "Fechar o Code Room" ou o Gerenciador de Tarefas, processo node) e abra de novo. Nada foi encerrado automaticamente.'
      Read-Host 'Pressione Enter para sair'
      exit 1
    }
  } catch {}
}
if (-not $reachable) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  $serverFile = Join-Path $projectRoot 'server\main.mjs'
  $process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDir 'server.log') -RedirectStandardError (Join-Path $dataDir 'server-error.log')
  for ($attempt=0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 300
    if ($process.HasExited) { throw "O serviço não iniciou. Consulte $dataDir\server-error.log." }
    if (Test-Path -LiteralPath $keyFile) {
      try {
        $key = (Get-Content -LiteralPath $keyFile -Raw).Trim()
        $null = Invoke-RestMethod -Uri "$base/api/state" -Headers @{'X-Code-Room-Key'=$key} -TimeoutSec 1
        $reachable=$true; break
      } catch {}
    }
  }
  if (-not $reachable) { throw 'Não foi possível conectar ao Code Room.' }
}
if ($env:CODE_ROOM_NO_BROWSER -ne '1') { Start-Process -FilePath ("$base/#" + $key) }
