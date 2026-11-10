# Gera os pacotes para Windows em dist\:
#   Code-Room-<versao>-portatil-win-x64.zip   (descompactar e dar dois cliques)
#   Code-Room-<versao>-Setup.exe              (instalador; só se o Inno Setup 6 estiver instalado)
#   SHA256SUMS.txt                            (código de verificação de cada arquivo)
# O Node vem da máquina de build (runtime\node.exe, licença MIT, cópia da licença incluída).
# Uso:  powershell -ExecutionPolicy Bypass -File installer\build.ps1 [-NodePath C:\caminho\node.exe] [-OutDir dist]
param([string]$NodePath = '', [string]$OutDir = 'dist')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$out = Join-Path $repo $OutDir; $stage = Join-Path $out 'CodeRoom'
New-Item -ItemType Directory -Path $out -Force | Out-Null
# Substitui somente a área de staging e os artefatos desta versão. Não apaga
# arquivos independentes que o usuário possa manter no diretório de saída.
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
$zip = Join-Path $out "Code-Room-$version-portatil-win-x64.zip"
$versionSetup = Join-Path $out "Code-Room-$version-Setup.exe"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

# 1) Só o que o app precisa para rodar (sem testes, docs de desenvolvimento nem scripts de teste).
foreach ($d in 'server', 'public') { Copy-Item -LiteralPath $d -Destination (Join-Path $stage $d) -Recurse }
New-Item -ItemType Directory -Path (Join-Path $stage 'scripts') -Force | Out-Null
foreach ($f in 'start.ps1', 'stop.ps1', 'criar-atalhos.ps1', 'atualizar.ps1', 'bandeja.ps1', 'iniciar-com-windows.ps1') { Copy-Item -LiteralPath (Join-Path 'scripts' $f) -Destination (Join-Path $stage 'scripts') }
foreach ($f in 'package.json', 'LICENSE', 'README.md', 'README.en.md', 'INSTALAR.md', 'Iniciar-Code-Room.cmd', 'Criar-Atalhos.cmd') { Copy-Item -LiteralPath $f -Destination $stage }
New-Item -ItemType Directory -Force (Join-Path $stage 'docs') | Out-Null; Copy-Item -LiteralPath 'docs\ASSISTENTE.md' -Destination (Join-Path $stage 'docs')
Copy-Item -LiteralPath 'installer\code-room.ico' -Destination $stage

# 2) Node embutido + licença
$rt = Join-Path $stage 'runtime'; New-Item -ItemType Directory -Path $rt -Force | Out-Null
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $rt 'node.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LICENSE-node.txt') -Destination $rt
$nodeVersion = (& $NodePath -v).Trim()

# 3) Zip portátil
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal
Write-Host ("zip: {0} ({1:N1} MB, Node {2})" -f $zip, ((Get-Item $zip).Length / 1MB), $nodeVersion)

# 4) Instalador (Inno Setup 6), se existir
$iscc = $null
$candidates = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")
foreach ($candidate in $candidates) {
  try { if (Test-Path -LiteralPath $candidate) { $iscc = $candidate; break } }
  catch { continue } # caminhos protegidos podem negar acesso; ainda verificamos as outras instalações conhecidas
}
$setup = $null
if ($iscc) {
  if (Test-Path -LiteralPath $versionSetup) { Remove-Item -LiteralPath $versionSetup -Force }
  & $iscc "/DAppVersion=$version" "/DStageDir=$stage" "/DOutDir=$out" (Join-Path $PSScriptRoot 'code-room.iss')
  if ($LASTEXITCODE -ne 0) { throw 'O Inno Setup falhou.' }
  $setup = Join-Path $out "Code-Room-$version-Setup.exe"
  Write-Host ("instalador: {0} ({1:N1} MB)" -f $setup, ((Get-Item $setup).Length / 1MB))
} else { Write-Host 'Inno Setup 6 não encontrado: gerei só o zip portátil.' }

# 5) SHA-256 de cada arquivo entregue (no GitHub, roda de novo depois da assinatura: installer\sums.ps1)
& (Join-Path $PSScriptRoot 'sums.ps1') -OutDir $out
