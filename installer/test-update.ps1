# Teste de ponta a ponta da atualização no PACOTE WINDOWS, em pasta temporária e porta de teste (não toca no seu Code Room).
# Gera uma "versão 0.99.0" a partir do pacote atual e atualiza de verdade, em três cenários:
#   A) atualização boa: troca a versão e os dados continuam;  B) pacote inválido: nada é tocado, o serviço segue no ar;
#   C) versão nova que NÃO abre: volta sozinho para a anterior.
# Uso:  powershell -ExecutionPolicy Bypass -File installer\test-update.ps1   (rode installer\build.ps1 antes)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$zip = Get-ChildItem (Join-Path $repo 'dist') -Filter 'Code-Room-*-portatil-win-x64.zip' | Select-Object -First 1
if (-not $zip) { throw 'Rode installer\build.ps1 antes.' }
$old = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version; $new = '0.99.0'
$work = Join-Path $env:TEMP ('cr-upd-e2e-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory $work | Out-Null
$PORT = 4799; $RPORT = 4798; $script:fails = 0
function Check($name, $ok, $extra = '') { if ($ok) { Write-Host "OK    $name" } else { $script:fails++; Write-Host "FALHA $name $extra" } }
function Open-Port($p) { try { $c = New-Object Net.Sockets.TcpClient; $r = $c.BeginConnect('127.0.0.1', $p, $null, $null); $ok = $r.AsyncWaitHandle.WaitOne(400) -and $c.Connected; $c.Close(); $ok } catch { $false } }
function Wait-Until($cond, $sec) { for ($i = 0; $i -lt $sec * 2; $i++) { if (& $cond) { return $true }; Start-Sleep -Milliseconds 500 }; $false }

# --- fabrica a "versão nova" a partir do pacote atual ---
$src = Join-Path $work 'src'; Expand-Archive -LiteralPath $zip.FullName -DestinationPath $src
function Make-Release($name, [scriptblock]$tweak, [bool]$bom = $false) {
  $stage = Join-Path $work "stage-$name"; New-Item -ItemType Directory $stage | Out-Null; Copy-Item (Join-Path $src 'CodeRoom') $stage -Recurse
  $pj = Join-Path $stage 'CodeRoom\package.json'; $txt = (Get-Content $pj -Raw) -replace '"version":\s*"[^"]+"', "`"version`": `"$new`""; [System.IO.File]::WriteAllText($pj, $txt, (New-Object System.Text.UTF8Encoding($bom)))
  & $tweak (Join-Path $stage 'CodeRoom')
  $out = Join-Path $work "rel-$name"; New-Item -ItemType Directory $out | Out-Null
  Compress-Archive -Path (Join-Path $stage 'CodeRoom') -DestinationPath (Join-Path $out "Code-Room-$new-portatil-win-x64.zip") -CompressionLevel Fastest; $out
}
$relA = Make-Release 'boa' { param($d) Set-Content (Join-Path $d 'NOVO.txt') 'versao nova' }
$relB = Make-Release 'invalido' { param($d) Remove-Item (Join-Path $d 'server\main.mjs') -Force }
$relD = Make-Release 'com-bom' { param($d) Set-Content (Join-Path $d 'NOVO.txt') 'versao nova com BOM' } $true
$relC = Make-Release 'quebrada' { param($d) Set-Content (Join-Path $d 'server\main.mjs') "throw new Error('versao quebrada de proposito');" }

function Run-Scenario($label, $rel) {
  Write-Host "`n=== $label ==="
  $inst = Join-Path $work ('inst-' + [guid]::NewGuid().ToString('N').Substring(0, 6)); New-Item -ItemType Directory $inst | Out-Null
  Copy-Item (Join-Path $src 'CodeRoom') $inst -Recurse; $app = Join-Path $inst 'CodeRoom'; $data = Join-Path $inst 'data'
  $fake = Start-Process node -ArgumentList ('"' + (Join-Path $PSScriptRoot 'fake-releases.mjs') + '" ' + $RPORT + ' "' + $rel + '" ' + $new) -WindowStyle Hidden -PassThru
  $env:CODE_ROOM_PORT = "$PORT"; $env:CODE_ROOM_DATA = $data; $env:CODE_ROOM_NO_BROWSER = '1'; $env:CODE_ROOM_NO_PROMPT = '1'; $env:CODE_ROOM_RELEASES_URL = "http://127.0.0.1:$RPORT/api/latest"
  $oldPath = $env:PATH; $env:PATH = ($env:PATH -split ';' | Where-Object { $_ -and -not (Test-Path (Join-Path $_ 'node.exe')) }) -join ';'
  try {
    Start-Process powershell.exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $app 'scripts\start.ps1') + '"') -WindowStyle Hidden
    if (-not (Wait-Until { Open-Port $PORT } 30)) { throw 'o app instalado nao abriu' }
    $key = (Get-Content (Join-Path $data 'access.key') -Raw).Trim(); $H = @{'X-Code-Room-Key' = $key; 'Content-Type' = 'application/json'}
    $api = { param($p, $b) if ($null -eq $b) { Invoke-RestMethod "http://127.0.0.1:$PORT/api/$p" -Headers $H -TimeoutSec 10 } else { Invoke-RestMethod "http://127.0.0.1:$PORT/api/$p" -Method Post -Headers $H -Body ($b | ConvertTo-Json) -TimeoutSec 30 } }.GetNewClosure()
    $marker = Join-Path $inst 'projeto-marcador'; New-Item -ItemType Directory $marker | Out-Null
    $null = & $api 'projects' @{ name = 'Projeto de teste'; path = ($marker -replace '\\', '/'); area = 'Geral' }
    $v0 = (& $api 'state' $null).runtime.version; Check "antes: versao $old rodando do pacote instalado" ($v0 -eq $old) $v0
    $s = & $api 'updates/check' @{}; Check 'consulta ao Release falso acha a versao nova' ($s.hasUpdate -and $s.latest.version -eq $new) ($s | ConvertTo-Json -Depth 3 -Compress)
    Check 'a instalacao em um clique esta disponivel (pacote Windows)' ($s.canInstall -eq $true)
    $null = & $api 'updates/download' @{}; $ok = Wait-Until { (& $api 'updates' $null).download.state -in 'ready', 'error' } 60; $d = (& $api 'updates' $null).download
    Check 'download concluido e SHA-256 conferido' ($d.state -eq 'ready' -and $d.sha256) ($d | ConvertTo-Json -Compress)
    $null = & $api 'updates/install' @{}
    return @{ api = $api; inst = $inst; app = $app; data = $data; marker = $marker; fake = $fake; oldPath = $oldPath }
  } catch { $script:fails++; Write-Host "FALHA $($_.Exception.Message)"; Stop-Process -Id $fake.Id -Force -ErrorAction SilentlyContinue; $env:PATH = $oldPath; return $null }
}
function Finish($ctx) {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($ctx.inst) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $ctx.fake.Id -Force -ErrorAction SilentlyContinue; $env:PATH = $ctx.oldPath
}
function Version-Now($ctx) { try { (& $ctx.api 'state' $null).runtime.version } catch { $null } }
function Log-Of($ctx) { $f = Join-Path $ctx.data 'update.log'; if (Test-Path $f) { Get-Content $f -Raw } else { '' } }

# A) boa
$c = $null; if (-not $env:CR_ONLY -or $env:CR_ONLY -eq 'A') { $c = Run-Scenario 'A) atualizacao boa' $relA }
if ($c) {
  $okv = Wait-Until { (Version-Now $c) -eq $new } 90
  Check "depois: o servico voltou sozinho na versao $new" $okv (Version-Now $c)
  if (-not $okv) { Write-Host '--- update.log:'; Write-Host (Log-Of $c); Write-Host '--- server-error.log:'; Get-Content (Join-Path $c.data 'server-error.log') -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object { Write-Host $_ }; Write-Host ('--- arquivos em data: ' + ((Get-ChildItem $c.data -ErrorAction SilentlyContinue).Name -join ', ')) }
  Check 'os dados continuam (projeto cadastrado antes da atualizacao)' (@((& $c.api 'state' $null).projects | Where-Object { $_.name -eq 'Projeto de teste' }).Count -eq 1)
  Check 'a pasta do programa e a nova (arquivo NOVO.txt) e a anterior ficou guardada' ((Test-Path (Join-Path $c.app 'NOVO.txt')) -and (Test-Path ($c.app + '.anterior\package.json')))
  $lg = Wait-Until { (Log-Of $c) -match "OK: agora na versao $new" } 40; Check 'update.log registra OK' $lg (Log-Of $c)
  Finish $c
}
# A2) package.json com BOM (acontece ao editar no Bloco de Notas): a versão nova precisa abrir normalmente
$c = $null; if (-not $env:CR_ONLY -or $env:CR_ONLY -eq 'A2') { $c = Run-Scenario 'A2) versao nova cujo package.json tem BOM' $relD }
if ($c) { $okv = Wait-Until { (Version-Now $c) -eq $new } 90; Check "o servico abriu na versao $new mesmo com BOM" $okv (Version-Now $c); Finish $c }
# B) pacote invalido
$c = $null; if (-not $env:CR_ONLY -or $env:CR_ONLY -eq 'B') { $c = Run-Scenario 'B) pacote invalido (falta server\main.mjs)' $relB }
if ($c) {
  $lg = Wait-Until { (Log-Of $c) -match 'Pacote invalido' } 120
  Check "o servico continuou na versao $old (nunca foi parado)" ((Version-Now $c) -eq $old) (Version-Now $c)
  Check 'a pasta do programa nao foi tocada (sem .anterior, sem NOVO)' (-not (Test-Path ($c.app + '.anterior'))); Check 'update.log explica o motivo' $lg (Log-Of $c)
  Finish $c
}
# C) versao nova que nao abre -> volta
$c = $null; if (-not $env:CR_ONLY -or $env:CR_ONLY -eq 'C') { $c = Run-Scenario 'C) versao nova que nao abre (deve VOLTAR sozinha)' $relC }
if ($c) {
  $back = Wait-Until { (Test-Path (Join-Path $c.data 'update.log')) -and ((Log-Of $c) -match 'VOLTOU') } 120
  Check 'update.log registra o retorno' $back (Log-Of $c)
  $okv = Wait-Until { (Version-Now $c) -eq $old } 40
  Check "voltou para a versao $old e o servico esta no ar" $okv (Version-Now $c)
  Check 'os dados continuam' (@((& $c.api 'state' $null).projects | Where-Object { $_.name -eq 'Projeto de teste' }).Count -eq 1)
  Check 'a pasta do programa e a antiga de novo (sem NOVO.txt)' (-not (Test-Path (Join-Path $c.app 'NOVO.txt')))
  Finish $c
}
Remove-Item Env:CODE_ROOM_RELEASES_URL, Env:CODE_ROOM_PORT, Env:CODE_ROOM_DATA -ErrorAction SilentlyContinue
Set-Location $env:TEMP; if ($env:CR_KEEP) { Write-Host "pasta de teste mantida: $work" } else { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host ("`n" + $(if ($script:fails -eq 0) { 'TUDO OK' } else { "$($script:fails) FALHA(S)" }))
exit $script:fails
