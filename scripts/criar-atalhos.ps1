# Cria (ou remove) os atalhos do Code Room: "Code Room" na área de trabalho e no menu Iniciar,
# e "Fechar o Code Room" no menu Iniciar. Não precisa de administrador.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\criar-atalhos.ps1 [-SemAreaDeTrabalho] [-Remover]
param([switch]$SemAreaDeTrabalho, [switch]$Remover)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$icon = Join-Path $root 'code-room.ico'
if (-not (Test-Path -LiteralPath $icon)) { $icon = Join-Path $root 'installer\code-room.ico' }   # rodando pelo código-fonte
$desktop = [Environment]::GetFolderPath('Desktop')
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Code Room'
if ($env:CODE_ROOM_ATALHOS_DIR) { $desktop = Join-Path $env:CODE_ROOM_ATALHOS_DIR 'Desktop'; $menu = Join-Path $env:CODE_ROOM_ATALHOS_DIR 'Programs\Code Room' }   # só para testes
$shell = New-Object -ComObject WScript.Shell
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

function New-Link($path, $script, $description) {
  $dir = Split-Path $path -Parent; New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $l = $shell.CreateShortcut($path)
  $l.TargetPath = $ps
  $l.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $root "scripts\$script") + '"'
  $l.WorkingDirectory = $root; $l.Description = $description; $l.WindowStyle = 7
  if (Test-Path -LiteralPath $icon) { $l.IconLocation = $icon + ',0' }
  $l.Save()
}

$links = @(
  @{ path = (Join-Path $menu 'Code Room.lnk');            script = 'start.ps1'; desc = 'Abrir o Code Room'; area = $false },
  @{ path = (Join-Path $menu 'Fechar o Code Room.lnk');   script = 'stop.ps1';  desc = 'Fechar o serviço do Code Room'; area = $false },
  @{ path = (Join-Path $desktop 'Code Room.lnk');         script = 'start.ps1'; desc = 'Abrir o Code Room'; area = $true }
)
foreach ($k in $links) {
  if ($Remover) { if (Test-Path -LiteralPath $k.path) { Remove-Item -LiteralPath $k.path -Force; "removido: $($k.path)" } }
  elseif ($k.area -and $SemAreaDeTrabalho) { continue }
  else { New-Link $k.path $k.script $k.desc; "criado: $($k.path)" }
}
if ($Remover -and (Test-Path -LiteralPath $menu) -and -not (Get-ChildItem -LiteralPath $menu)) { Remove-Item -LiteralPath $menu -Force }
