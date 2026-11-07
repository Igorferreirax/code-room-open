# Liga ou desliga "Iniciar o Code Room com o Windows": cria ou remove o atalho na pasta Inicializar do seu usuário.
# Ele abre só o serviço e o ícone da bandeja (sem janela e sem perguntas). Não precisa de administrador.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\iniciar-com-windows.ps1 [-Remover] [-Estado]
param([switch]$Remover, [switch]$Estado)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dir = [Environment]::GetFolderPath('Startup')
if ($env:CODE_ROOM_ATALHOS_DIR) { $dir = Join-Path $env:CODE_ROOM_ATALHOS_DIR 'Startup' }   # só para testes
$link = Join-Path $dir 'Code Room.lnk'
if ($Estado) { if (Test-Path -LiteralPath $link) { 'ligado' } else { 'desligado' }; exit 0 }
if ($Remover) { if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force }; 'desligado'; exit 0 }
$icon = Join-Path $root 'code-room.ico'
if (-not (Test-Path -LiteralPath $icon)) { $icon = Join-Path $root 'installer\code-room.ico' }
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$l = (New-Object -ComObject WScript.Shell).CreateShortcut($link)
$l.TargetPath = $ps
$l.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $root 'scripts\start.ps1') + '" -Silencioso'
$l.WorkingDirectory = $root; $l.Description = 'Inicia o Code Room com o Windows'; $l.WindowStyle = 7
if (Test-Path -LiteralPath $icon) { $l.IconLocation = $icon + ',0' }
$l.Save()
'ligado'
