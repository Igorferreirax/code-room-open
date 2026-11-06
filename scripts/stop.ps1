# Fecha o serviço do Code Room que foi iniciado a partir ESTA pasta (não mexe em nenhum outro processo node).
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$serverFile = (Join-Path $projectRoot 'server\main.mjs').ToLowerInvariant()
$found = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($serverFile) })
if ($found.Count -eq 0) { Write-Host 'O Code Room não está rodando.'; if ($env:CODE_ROOM_NO_PAUSE -ne '1') { Start-Sleep -Seconds 2 }; exit 0 }
foreach ($p in $found) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Code Room fechado ($($found.Count) processo)."
if ($env:CODE_ROOM_NO_PAUSE -ne '1') { Start-Sleep -Seconds 2 }
