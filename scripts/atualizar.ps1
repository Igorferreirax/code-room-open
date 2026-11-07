# Instala uma atualização do pacote Windows. Chamado pelo próprio Code Room (botão "Atualizar") com o zip JÁ baixado e conferido (SHA-256).
# Ordem de segurança: 1) valida o pacote novo sem tocar em nada; 2) fecha o serviço; 3) guarda a versão atual em "<pasta>.anterior";
# 4) coloca a nova; 5) abre e confere a versão; 6) se algo falhar, VOLTA para a versão anterior sozinho. Os dados (projetos, agentes,
# chave) ficam fora da pasta do programa e nunca são tocados. Log: <dados>\update.log
param(
  [Parameter(Mandatory)][string]$Zip, [Parameter(Mandatory)][string]$AppDir, [Parameter(Mandatory)][string]$Data,
  [Parameter(Mandatory)][string]$Version, [int]$Port = 4780
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $Data 'update.log'
function Log($m) { try { Add-Content -LiteralPath $log -Value ('{0:s} {1}' -f (Get-Date), $m) } catch {} }
function Port-Open { try { $c = New-Object Net.Sockets.TcpClient; $r = $c.BeginConnect('127.0.0.1', $Port, $null, $null); $ok = $r.AsyncWaitHandle.WaitOne(400) -and $c.Connected; $c.Close(); $ok } catch { $false } }
function Stop-Service-In($dir) { $env:CODE_ROOM_NO_PAUSE = '1'; Start-Process powershell.exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $dir 'scripts\stop.ps1') + '"') -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue; for ($i = 0; $i -lt 40 -and (Port-Open); $i++) { Start-Sleep -Milliseconds 500 } }
function Start-Service-In($dir) { $env:CODE_ROOM_NO_BROWSER = '1'; $env:CODE_ROOM_NO_PROMPT = '1'; $env:CODE_ROOM_DATA = $Data; $env:CODE_ROOM_PORT = [string]$Port; Start-Process powershell.exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $dir 'scripts\start.ps1') + '"') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Data 'update-start.log') -RedirectStandardError (Join-Path $Data 'update-start-erro.log') }
function Wait-Version($want, $seconds) {
  $key = (Get-Content -LiteralPath (Join-Path $Data 'access.key') -Raw).Trim(); $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (-not (Port-Open)) { $script:ultimo = 'a porta ' + $Port + ' ficou fechada'; continue }   # porta ainda fechada: não perde tempo chamando a API
    try { $s = Invoke-RestMethod "http://127.0.0.1:$Port/api/state" -Headers @{'X-Code-Room-Key' = $key} -TimeoutSec 3; $script:ultimo = 'o serviço respondeu na versão ' + $s.runtime.version; if ($s.runtime.version -eq $want) { return $true } } catch { $script:ultimo = 'a API recusou: ' + $_.Exception.Message }
  }
  $false
}

$backup = $AppDir.TrimEnd('\') + '.anterior'; $work = Join-Path $env:TEMP ('cr-update-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); $swapped = $false
try {
  Log "inicio: versao $Version a partir de $Zip"
  # 1) valida o pacote novo ANTES de mexer em qualquer coisa
  Expand-Archive -LiteralPath $Zip -DestinationPath $work -Force
  $new = Join-Path $work 'CodeRoom'
  foreach ($f in 'server\main.mjs', 'runtime\node.exe', 'scripts\start.ps1', 'scripts\stop.ps1', 'package.json') { if (-not (Test-Path -LiteralPath (Join-Path $new $f))) { throw "Pacote invalido: falta $f" } }
  $pv = (Get-Content -LiteralPath (Join-Path $new 'package.json') -Raw | ConvertFrom-Json).version
  if ($pv -ne $Version) { throw "Versao do pacote ($pv) diferente da esperada ($Version)" }
  Log 'pacote validado'

  # 2) fecha o serviço atual e 3) guarda a versão atual
  Stop-Service-In $AppDir
  if (Port-Open) { throw 'O servico atual nao fechou.' }
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
  Move-Item -LiteralPath $AppDir -Destination $backup; $swapped = $true
  Log "versao atual guardada em $backup"

  # 4) coloca a nova e 5) abre e confere
  Move-Item -LiteralPath $new -Destination $AppDir
  Start-Service-In $AppDir
  if (-not (Wait-Version $Version 40)) { throw "A versao nova nao respondeu como $Version (ultimo estado: $script:ultimo)" }
  Log "OK: agora na versao $Version"
} catch {
  Log ('ERRO: ' + $_.Exception.Message)
  # guarda o que a versão nova escreveu antes de a reinicialização da versão anterior sobrescrever esses arquivos
  foreach ($n in 'server-error.log', 'server.log', 'update-start-erro.log', 'start-error.log') { try { $f = Join-Path $Data $n; if ((Test-Path -LiteralPath $f) -and (Get-Item -LiteralPath $f).Length -gt 0) { Log ("$n da versao nova: " + ((Get-Content -LiteralPath $f -Raw -ErrorAction Stop).Trim() -replace '[
]+', ' | ').Substring(0, [Math]::Min(500, (Get-Content -LiteralPath $f -Raw).Trim().Length))) } } catch {} }
  # 6) volta para a versão anterior
  try {
    if ($swapped) {
      if (Test-Path -LiteralPath $AppDir) { Stop-Service-In $AppDir; Remove-Item -LiteralPath $AppDir -Recurse -Force }
      Move-Item -LiteralPath $backup -Destination $AppDir; Log 'VOLTOU para a versao anterior'
    }
    if (-not (Port-Open)) { Start-Service-In $AppDir }
  } catch { Log ('ERRO no retorno: ' + $_.Exception.Message) }
} finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
