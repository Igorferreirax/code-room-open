# Fecha o serviço do Code Room que foi iniciado a partir ESTA pasta (não mexe em nenhum outro processo node).
# Se houver tarefa rodando, não fecha sem perguntar: pelo atalho aparece uma pergunta; com -Seguro (uso em scripts) recusa com código 3; -Forcar fecha mesmo assim.
param([switch]$Seguro, [switch]$Forcar)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$serverFile = (Join-Path $projectRoot 'server\main.mjs').ToLowerInvariant()
$found = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($serverFile) })
if ($found.Count -eq 0) { Write-Host 'O Code Room não está rodando.'; if ($env:CODE_ROOM_NO_PAUSE -ne '1') { Start-Sleep -Seconds 2 }; exit 0 }
function Get-TarefasAtivas {
  try {
    $data = if ($env:CODE_ROOM_DATA) { $env:CODE_ROOM_DATA } else { Join-Path $projectRoot '.data' }
    $keyFile = Join-Path $data 'access.key'; if (-not (Test-Path -LiteralPath $keyFile)) { return 0 }
    $port = 4780; $portFile = Join-Path $data 'port.txt'; if (Test-Path -LiteralPath $portFile) { $v = (Get-Content -LiteralPath $portFile -Raw).Trim(); if ($v -match '^\d+$') { $port = [int]$v } }
    $key = (Get-Content -LiteralPath $keyFile -Raw).Trim()
    $st = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/state" -Headers @{ 'X-Code-Room-Key' = $key } -TimeoutSec 4
    return @($st.runs | Where-Object { $_.status -in 'running', 'queued', 'cancelling' }).Count
  } catch { return 0 }
}
$ativas = Get-TarefasAtivas
if ($ativas -gt 0 -and -not $Forcar) {
  if ($Seguro) { Write-Host "Há $ativas tarefa(s) rodando. Nada foi fechado (use -Forcar para fechar mesmo assim)."; exit 3 }
  if ($env:CODE_ROOM_NO_PAUSE -ne '1') {
    Add-Type -AssemblyName System.Windows.Forms
    $r = [System.Windows.Forms.MessageBox]::Show("Há $ativas tarefa(s) rodando. Se fechar agora, elas serão interrompidas e talvez precisem ser repetidas.`n`nFechar mesmo assim?", 'Code Room', 'YesNo', 'Warning', 'Button2')
    if ($r -ne 'Yes') { Write-Host 'O Code Room continua aberto.'; exit 3 }
  }
}
foreach ($p in $found) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
$bandeja = (Join-Path $PSScriptRoot 'bandeja.ps1').ToLowerInvariant()
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($bandeja) -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Code Room fechado ($($found.Count) processo)."
if ($env:CODE_ROOM_NO_PAUSE -ne '1') { Start-Sleep -Seconds 2 }
exit 0
