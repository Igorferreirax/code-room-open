# Teste da bandeja e do "Iniciar com o Windows", numa CÓPIA do app em pasta temporária (nunca mexe no seu Code Room de verdade:
# o stop.ps1 só encerra o serviço da pasta onde está, e aqui essa pasta é a cópia).
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\test-bandeja.ps1
$ErrorActionPreference = 'Stop'
$src = Split-Path $PSScriptRoot -Parent
$tmp = Join-Path $env:TEMP ('cr-bandeja-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$app = Join-Path $tmp 'app'; $data = Join-Path $tmp 'dados'; $atalhos = Join-Path $tmp 'atalhos'
New-Item -ItemType Directory -Path $app, $data, $atalhos -Force | Out-Null
foreach ($d in 'server', 'public', 'scripts', 'installer') { Copy-Item -LiteralPath (Join-Path $src $d) -Destination (Join-Path $app $d) -Recurse }
Copy-Item -LiteralPath (Join-Path $src 'package.json') -Destination $app
$script:ok = 0; $script:bad = 0
function Check($nome, $cond) { if ($cond) { $script:ok++; Write-Host "OK    $nome" } else { $script:bad++; Write-Host "FALHA $nome" } }
function Wait-Until([scriptblock]$c, [int]$s = 15) { $t = [DateTime]::Now.AddSeconds($s); while ([DateTime]::Now -lt $t) { if (& $c) { return $true }; Start-Sleep -Milliseconds 300 }; $false }
$port = Get-Random -Minimum 31000 -Maximum 39000
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$env:CODE_ROOM_DATA = $data; $env:CODE_ROOM_PORT = "$port"; $env:CODE_ROOM_ATALHOS_DIR = $atalhos
$env:CODE_ROOM_NO_BROWSER = '1'; $env:CODE_ROOM_NO_PROMPT = '1'; $env:CODE_ROOM_NO_PAUSE = '1'
function Trays { $alvo = (Join-Path $app 'scripts\bandeja.ps1').ToLowerInvariant(); @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($alvo) }) }
function Servidor { $alvo = (Join-Path $app 'server\main.mjs').ToLowerInvariant(); @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($alvo) }) }
try {
  # 1) iniciar com o Windows: cria, lê o estado e remove (na pasta de teste)
  $s = & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\iniciar-com-windows.ps1') -Estado
  Check 'inicio: começa desligado' (($s | Select-Object -Last 1) -eq 'desligado')
  & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\iniciar-com-windows.ps1') | Out-Null
  $lnk = Join-Path $atalhos 'Startup\Code Room.lnk'
  Check 'inicio: cria o atalho' (Test-Path $lnk)
  $l = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  Check 'inicio: o atalho abre só o serviço, sem janela (-Silencioso), pela pasta do app' ($l.Arguments -match '-Silencioso' -and $l.Arguments -match 'start\.ps1' -and $l.WindowStyle -eq 7)
  $s = & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\iniciar-com-windows.ps1') -Estado
  Check 'inicio: estado ligado' (($s | Select-Object -Last 1) -eq 'ligado')
  & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\iniciar-com-windows.ps1') -Remover | Out-Null
  Check 'inicio: remover apaga o atalho' (-not (Test-Path $lnk))

  # 2) start.ps1 -Silencioso: sobe o serviço e a bandeja, sem abrir janela
  Start-Process -FilePath $ps -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ('"' + (Join-Path $app 'scripts\start.ps1') + '"'), '-Silencioso') -WindowStyle Hidden
  Check 'start -Silencioso: o serviço sobe' (Wait-Until { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $port); $c.Close(); $true } catch { $false } } 30)
  Check 'start -Silencioso: a bandeja sobe' (Wait-Until { @(Trays).Count -ge 1 } 15)
  if (@(Trays).Count -lt 1) { Write-Host '   (diagnóstico) powershells com "bandeja" na linha de comando:'; Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'bandeja' } | ForEach-Object { Write-Host ('   ' + $_.CommandLine) }; Write-Host "   alvo procurado: $((Join-Path $app 'scripts\bandeja.ps1'))" }
  Start-Sleep -Seconds 2
  Check 'bandeja: continua viva (não caiu ao abrir)' (@(Trays).Count -ge 1)

  # 3) segunda bandeja para o mesmo Code Room sai na hora (um ícone só)
  Start-Process -FilePath $ps -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ('"' + (Join-Path $app 'scripts\bandeja.ps1') + '"')) -WindowStyle Hidden
  Start-Sleep -Seconds 4
  Check 'bandeja: só uma instância por Code Room' (@(Trays).Count -eq 1)

  # 4) stop.ps1 fecha o serviço E a bandeja
  & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\stop.ps1') | Out-Null
  Check 'stop: o serviço fechou' (Wait-Until { @(Servidor).Count -eq 0 } 10)
  Check 'stop: a bandeja fechou junto' (Wait-Until { @(Trays).Count -eq 0 } 10)

  # 5) bandeja some sozinha quando o serviço morre (sem ícone fantasma)
  Start-Process -FilePath $ps -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ('"' + (Join-Path $app 'scripts\bandeja.ps1') + '"'), '-IntervaloSeg', '1', '-FalhasMax', '2') -WindowStyle Hidden
  Check 'fantasma: a bandeja sobe mesmo sem serviço e sai sozinha depois das falhas' ((Wait-Until { @(Trays).Count -ge 1 } 8) -and (Wait-Until { @(Trays).Count -eq 0 } 20))
}
finally {
  foreach ($p in (Trays)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  foreach ($p in (Servidor)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host ("`n{0} verificações ok, {1} falha(s)" -f $script:ok, $script:bad)
exit $(if ($script:bad) { 1 } else { 0 })
