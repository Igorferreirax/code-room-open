param(
  [string]$ArchivePath = (Join-Path $PSScriptRoot ("..\dist\Code-Room-" + (Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json).version + "-portatil-win-x64.zip")),
  [string]$AppPath = ''
)
$ErrorActionPreference = 'Stop'

$archive = if ($AppPath) { $null } else { (Resolve-Path -LiteralPath $ArchivePath).Path }
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
  if ($AppPath) {
    $app = (Resolve-Path -LiteralPath $AppPath).Path
  } else {
    Expand-Archive -LiteralPath $archive -DestinationPath $workFull
    $app = Join-Path $workFull 'CodeRoom'
  }
  $node = Join-Path $app 'runtime\node.exe'
  if (-not (Test-Path -LiteralPath $node)) { throw 'O pacote não contém o Node embutido.' }

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
  $data = Join-Path $workFull 'isolated-data'
  $env:CODE_ROOM_DATA = $data; $env:CODE_ROOM_PORT = [string]$port; $env:CODE_ROOM_NO_BROWSER = '1'
  $process = Start-Process -FilePath $node -ArgumentList 'server\main.mjs' -WorkingDirectory $app -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $workFull 'server.log') -RedirectStandardError (Join-Path $workFull 'server-error.log')
  $base = "http://127.0.0.1:$port"
  $state = $null
  $lastRequestError = ''
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($process.HasExited) { throw "O Code Room do pacote encerrou ao iniciar. $((Get-Content -LiteralPath (Join-Path $workFull 'server-error.log') -Raw -ErrorAction SilentlyContinue))" }
    $keyFile = Join-Path $data 'access.key'
    if (Test-Path -LiteralPath $keyFile) {
      try {
        $key = (Get-Content -LiteralPath $keyFile -Raw).Trim()
        $state = Invoke-RestMethod -Uri "$base/api/state" -Headers @{'X-Code-Room-Key' = $key} -TimeoutSec 2
        break
      } catch { $lastRequestError = $_.Exception.Message }
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $state) {
    $errorLog = Get-Content -LiteralPath (Join-Path $workFull 'server-error.log') -Raw -ErrorAction SilentlyContinue
    $outputLog = Get-Content -LiteralPath (Join-Path $workFull 'server.log') -Raw -ErrorAction SilentlyContinue
    throw "O serviço do pacote não respondeu em 12,5 segundos. Processo ativo: $(-not $process.HasExited). Chave criada: $(Test-Path -LiteralPath (Join-Path $data 'access.key')). Última requisição: $lastRequestError Saída: $outputLog Erros: $errorLog"
  }
  if ($state.runtime.version -ne (Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json).version) { throw "Versão inesperada no pacote: $($state.runtime.version)." }
  $library = Invoke-RestMethod -Uri "$base/api/skills/library" -Headers @{'X-Code-Room-Key' = $key} -TimeoutSec 5
  if ($library.Count -ne 3 -or @($library | Where-Object { -not $_.available }).Count -gt 0) { throw 'A biblioteca de skills iniciais não está completa no pacote.' }
  $starter = Invoke-RestMethod -Method Post -Uri "$base/api/skills/library/install" -Headers @{'X-Code-Room-Key' = $key} -ContentType 'application/json' -Body '{"id":"planejar-entrega"}' -TimeoutSec 5
  if (-not $starter.installed -or -not (Test-Path -LiteralPath (Join-Path $data 'minhas-skills\planejar-entrega\SKILL.md'))) { throw 'O pacote não conseguiu instalar uma skill inicial na pasta de dados isolada.' }
  $usage = (Invoke-WebRequest -Uri "$base/views2.js" -TimeoutSec 3 -UseBasicParsing).Content
  $onboarding = (Invoke-WebRequest -Uri "$base/onboarding.js" -TimeoutSec 3 -UseBasicParsing).Content
  $updates = (Invoke-WebRequest -Uri "$base/updates-ui.js" -TimeoutSec 3 -UseBasicParsing).Content
  $index = (Invoke-WebRequest -Uri $base -TimeoutSec 3 -UseBasicParsing).Content
  $css = (Invoke-WebRequest -Uri "$base/style.css" -TimeoutSec 3 -UseBasicParsing).Content
  if ($usage -notmatch 'quota-board' -or $usage -match 'class="limtab"' -or $usage -notmatch 'routineReportRows' -or $css -notmatch '\.quota-grid') { throw 'O painel compacto de Uso, a remoção da tabela duplicada ou o relatório de rotinas não estão presentes no pacote.' }
  if ($onboarding -notmatch 'onb-video-check') { throw 'A checagem opcional do ambiente de vídeo está ausente no pacote.' }
  if ($onboarding -notmatch 'workspace-name' -or $onboarding -notmatch 'displayName') { throw 'A personalização do nome no primeiro acesso está ausente no pacote.' }
  if ($updates -notmatch 'update-settings-card' -or $updates -notmatch 'Verificar agora') { throw 'O cartão Atualizações em Configurações está ausente no pacote.' }
  foreach ($asset in 'radio-tocando.webp', 'radio-volume.webp', 'radio-next.webp') {
    if (-not (Test-Path -LiteralPath (Join-Path $app "public\assets\$asset"))) { throw "Arte do rádio ausente no pacote: $asset." }
    $image = Invoke-WebRequest -Uri "$base/assets/$asset" -TimeoutSec 5 -UseBasicParsing
    if ($image.StatusCode -ne 200 -or $image.Headers['Content-Type'] -notmatch 'image/webp') { throw "O servidor não entregou $asset como WebP." }
  }
  if ($index -notmatch 'data-playing-src="/assets/radio-tocando\.webp"') { throw 'O índice não aponta o player para as imagens WebP locais.' }
  $source = if ($AppPath) { 'instalação isolada' } else { 'pacote portátil' }
  Write-Host "OK: $source iniciou, API autenticada respondeu v$($state.runtime.version), biblioteca de skills instalou em dados isolados, Uso sem tabela duplicada, primeiro acesso, atualizações e rádio presentes."
}
finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue; [void]$process.WaitForExit(5000) }
  foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $oldEnv[$name], 'Process') }
  $resolvedTemp = [IO.Path]::GetFullPath($work).TrimEnd('\')
  if ($resolvedTemp.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
}
