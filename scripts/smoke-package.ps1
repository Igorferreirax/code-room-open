param([string]$ArchivePath = (Join-Path $PSScriptRoot '..\dist\Code-Room-0.2.1-portatil-win-x64.zip'))
$ErrorActionPreference = 'Stop'

$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
$work = Join-Path $tempRoot ('code-room-package-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$workFull = [IO.Path]::GetFullPath($work).TrimEnd('\')
if (-not $workFull.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'A pasta temporária saiu de TEMP; abortando para proteger outros arquivos.' }

$process = $null
$envNames = 'CODE_ROOM_DATA', 'CODE_ROOM_PORT', 'CODE_ROOM_NO_BROWSER'
$oldEnv = @{}
foreach ($name in $envNames) { $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  Expand-Archive -LiteralPath $archive -DestinationPath $workFull
  $app = Join-Path $workFull 'CodeRoom'
  $node = Join-Path $app 'runtime\node.exe'
  if (-not (Test-Path -LiteralPath $node)) { throw 'O pacote não contém o Node embutido.' }

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
  $data = Join-Path $workFull 'isolated-data'
  $env:CODE_ROOM_DATA = $data; $env:CODE_ROOM_PORT = [string]$port; $env:CODE_ROOM_NO_BROWSER = '1'
  $process = Start-Process -FilePath $node -ArgumentList 'server\main.mjs' -WorkingDirectory $app -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $workFull 'server.log') -RedirectStandardError (Join-Path $workFull 'server-error.log')
  $base = "http://127.0.0.1:$port"
  $state = $null
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($process.HasExited) { throw "O Code Room do pacote encerrou ao iniciar. $((Get-Content -LiteralPath (Join-Path $workFull 'server-error.log') -Raw -ErrorAction SilentlyContinue))" }
    $keyFile = Join-Path $data 'access.key'
    if (Test-Path -LiteralPath $keyFile) {
      try {
        $key = (Get-Content -LiteralPath $keyFile -Raw).Trim()
        $state = Invoke-RestMethod -Uri "$base/api/state" -Headers @{'X-Code-Room-Key' = $key} -TimeoutSec 2
        break
      } catch {}
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $state) { throw 'O serviço do pacote não respondeu em 12,5 segundos.' }
  if ($state.runtime.version -ne '0.2.1') { throw "Versão inesperada no pacote: $($state.runtime.version)." }
  $usage = (Invoke-WebRequest -Uri "$base/views2.js" -TimeoutSec 3 -UseBasicParsing).Content
  $onboarding = (Invoke-WebRequest -Uri "$base/onboarding.js" -TimeoutSec 3 -UseBasicParsing).Content
  $css = (Invoke-WebRequest -Uri "$base/style.css" -TimeoutSec 3 -UseBasicParsing).Content
  if ($usage -notmatch 'quota-board' -or $usage -match 'class="limtab"' -or $usage -notmatch 'routineReportRows' -or $css -notmatch '\.quota-grid') { throw 'O painel compacto de Uso, a remoção da tabela duplicada ou o relatório de rotinas não estão presentes no pacote.' }
  if ($onboarding -notmatch 'onb-video-check') { throw 'A checagem opcional do ambiente de vídeo está ausente no pacote.' }
  Write-Host "OK: pacote portátil iniciou isolado, API autenticada respondeu v$($state.runtime.version), Uso sem tabela duplicada e checagem de vídeo presentes."
}
finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue; [void]$process.WaitForExit(5000) }
  foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $oldEnv[$name], 'Process') }
  $resolvedTemp = [IO.Path]::GetFullPath($work).TrimEnd('\')
  if ($resolvedTemp.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
}
