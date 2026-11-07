# Inicia o Code Room (serviço local) e abre o navegador já autenticado.
# - Se existir runtime\node.exe (pacote Windows), usa esse Node: não precisa ter Node instalado.
# - Pacote Windows: os dados ficam em %LOCALAPPDATA%\CodeRoom\data (fora da pasta do programa, para atualizar sem perder nada).
#   Rodando pelo código-fonte, ficam em .data\ dentro do projeto. CODE_ROOM_DATA e CODE_ROOM_PORT têm prioridade.
# - CODE_ROOM_NO_BROWSER=1 não abre o navegador (usado nos testes).
# - No primeiro uso do pacote Windows pergunta se quer o ícone na área de trabalho (uma vez só).
# -Silencioso: só inicia o serviço e o ícone da bandeja (sem abrir janela nem perguntar nada). É o que o "Iniciar com o Windows" usa.
param([switch]$Silencioso)
if ($Silencioso) { $env:CODE_ROOM_NO_BROWSER = '1'; $env:CODE_ROOM_NO_PROMPT = '1' }
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$bundledNode = Join-Path $projectRoot 'runtime\node.exe'
$packaged = Test-Path -LiteralPath $bundledNode
$nodePath = if ($packaged) { $bundledNode } else { (Get-Command node.exe -ErrorAction Stop).Source }
if ($packaged) { $env:PATH = $env:PATH + ';' + (Join-Path $projectRoot 'runtime') }   # no fim: o Node do sistema, se houver, tem prioridade
$dataDir = if ($env:CODE_ROOM_DATA) { $env:CODE_ROOM_DATA } elseif ($packaged) { Join-Path $env:LOCALAPPDATA 'CodeRoom\data' } else { Join-Path $projectRoot '.data' }
# Porta: CODE_ROOM_PORT manda. Sem ela, usa 4780 (ou a última escolhida, guardada em port.txt). Se a porta estiver
# ocupada por outro programa (inclusive outro Code Room), escolhe a próxima livre entre 4781 e 4799.
function Test-PortaEmUso([int]$p) { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); $true } catch { $false } }
function Show-Erro([string]$msg) { try { Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($msg, 'Code Room', 'OK', 'Error') } catch {}; Write-Host $msg }
trap { Show-Erro ("O Code Room não abriu.`n`n" + $_.Exception.Message); exit 1 }
$portFile = Join-Path $dataDir 'port.txt'
$portaExplicita = [bool]$env:CODE_ROOM_PORT
$port = 4780
if ($env:CODE_ROOM_PORT) { $port = [int]$env:CODE_ROOM_PORT }
elseif (Test-Path -LiteralPath $portFile) { try { $port = [int](Get-Content -LiteralPath $portFile -Raw).Trim() } catch { $port = 4780 } }
$env:CODE_ROOM_DATA = $dataDir
$keyFile = Join-Path $dataDir 'access.key'
$reachable = $false
function Test-NossoServico([int]$p) {
  if (-not (Test-Path -LiteralPath $keyFile)) { return $false }
  try { $k = (Get-Content -LiteralPath $keyFile -Raw).Trim(); $null = Invoke-RestMethod -Uri "http://127.0.0.1:$p/api/state" -Headers @{'X-Code-Room-Key'=$k} -TimeoutSec 2; $true } catch { $false }
}
if (-not $portaExplicita -and (Test-PortaEmUso $port) -and -not (Test-NossoServico $port)) {
  $livre = 4781..4799 | Where-Object { -not (Test-PortaEmUso $_) } | Select-Object -First 1
  if (-not $livre) { throw "As portas 4780 a 4799 estão ocupadas. Feche outro Code Room ou defina CODE_ROOM_PORT." }
  $port = $livre
}
$env:CODE_ROOM_PORT = [string]$port
if (-not $portaExplicita) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null; Set-Content -LiteralPath $portFile -Value $port }
$base = "http://127.0.0.1:$port"
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
  # Logs: com o serviço parado, guarda o log grande como .1 (um só de reserva) para a pasta de dados não crescer sem limite.
  foreach ($lf in 'server.log', 'server-error.log') { $lp = Join-Path $dataDir $lf; try { if ((Test-Path -LiteralPath $lp) -and ((Get-Item -LiteralPath $lp).Length -gt 5MB)) { Move-Item -LiteralPath $lp -Destination ($lp + '.1') -Force } } catch {} }
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
# Primeiro uso do pacote Windows: pergunta UMA vez se quer o ícone na área de trabalho (e no menu Iniciar).
# CODE_ROOM_NO_PROMPT=1 não pergunta (testes); CODE_ROOM_ATALHOS_AUTO=1 responde "sim" sozinho (testes).
$asked = Join-Path $dataDir 'atalhos-perguntado'
if ($packaged -and -not (Test-Path -LiteralPath $asked) -and $env:CODE_ROOM_NO_PROMPT -ne '1') {
  try {
    $yes = $true
    if ($env:CODE_ROOM_ATALHOS_AUTO -ne '1') {
      Add-Type -AssemblyName System.Windows.Forms
      $yes = [System.Windows.Forms.MessageBox]::Show("Quer criar um ícone do Code Room na área de trabalho e no menu Iniciar?`n`nVocê pode apagar o ícone quando quiser.", 'Code Room', 'YesNo', 'Question') -eq 'Yes'
    }
    if ($yes) { & (Join-Path $PSScriptRoot 'criar-atalhos.ps1') | Out-Null }
    Set-Content -LiteralPath $asked -Value (Get-Date -Format o)
  } catch {}
}
# Ícone na bandeja do sistema (um só por Code Room; CODE_ROOM_SEM_BANDEJA=1 desliga, usado nos testes).
if ($env:CODE_ROOM_SEM_BANDEJA -ne '1' -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'bandeja.ps1'))) {
  try { Start-Process -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ('"' + (Join-Path $PSScriptRoot 'bandeja.ps1') + '"')) -WindowStyle Hidden } catch {}
}
# Abre como janela de app (sem abas nem barra de endereço) com o Edge ou o Chrome, que já existem na maioria dos PCs.
# Se não achar nenhum, ou com CODE_ROOM_JANELA=navegador, abre no navegador padrão. Fechar a janela NÃO encerra o serviço.
function Find-Navegador {
  $achados = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
  foreach ($c in $achados) { try { if (Test-Path -LiteralPath $c) { return $c } } catch {} }
  $null
}
if ($env:CODE_ROOM_NO_BROWSER -ne '1') {
  $url = "$base/#" + $key
  $nav = if ($env:CODE_ROOM_JANELA -eq 'navegador') { $null } else { Find-Navegador }
  if ($nav) { Start-Process -FilePath $nav -ArgumentList @("--app=$url", '--window-size=1366,880') }
  else { Start-Process -FilePath $url }
}
