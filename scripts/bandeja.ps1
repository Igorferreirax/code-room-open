# Ícone do Code Room na bandeja do sistema (perto do relógio). Sem dependências: usa só o Windows.
# Menu: Abrir o Code Room, Iniciar com o Windows (liga/desliga) e Fechar o Code Room.
# Quem inicia é o start.ps1. Só existe um ícone por Code Room (se já houver, este processo sai na hora).
# O ícone some sozinho quando o serviço deixa de responder, então nunca sobra um ícone "fantasma".
# Usa CODE_ROOM_DATA e CODE_ROOM_PORT do ambiente (o start.ps1 já deixa definidos).
param([int]$IntervaloSeg = 10, [int]$FalhasMax = 3)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$port = [int]$env:CODE_ROOM_PORT
if (-not $port -or -not $env:CODE_ROOM_DATA) { exit 0 }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$mutex = New-Object System.Threading.Mutex($false, "Local\CodeRoomBandeja-$port")
if (-not $mutex.WaitOne(0)) { exit 0 }
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$iconPath = Join-Path $root 'code-room.ico'
if (-not (Test-Path -LiteralPath $iconPath)) { $iconPath = Join-Path $root 'installer\code-room.ico' }

function Invoke-Script([string]$name, [string[]]$extra = @(), [switch]$Wait) {
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ('"' + (Join-Path $PSScriptRoot $name) + '"')) + $extra
  if ($Wait) { Start-Process -FilePath $ps -ArgumentList $a -WindowStyle Hidden -Wait } else { Start-Process -FilePath $ps -ArgumentList $a -WindowStyle Hidden }
}
function Test-Servico { try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $port); $c.Close(); $true } catch { $false } }
function Test-Inicio { $o = & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'iniciar-com-windows.ps1') -Estado 2>$null; ($o | Select-Object -Last 1) -eq 'ligado' }

$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Text = 'Code Room'
$ni.Icon = if (Test-Path -LiteralPath $iconPath) { New-Object System.Drawing.Icon($iconPath) } else { [System.Drawing.SystemIcons]::Application }
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$abrir = $menu.Items.Add('Abrir o Code Room'); $abrir.Font = New-Object System.Drawing.Font($abrir.Font, [System.Drawing.FontStyle]::Bold)
[void]$menu.Items.Add('-')
$inicio = New-Object System.Windows.Forms.ToolStripMenuItem('Iniciar com o Windows'); $inicio.CheckOnClick = $true; [void]$menu.Items.Add($inicio)
[void]$menu.Items.Add('-')
$fechar = $menu.Items.Add('Fechar o Code Room')
$ni.ContextMenuStrip = $menu

$abrir.add_Click({ Invoke-Script 'start.ps1' })
$ni.add_DoubleClick({ Invoke-Script 'start.ps1' })
$menu.add_Opening({ $inicio.Checked = Test-Inicio })
$inicio.add_Click({ if ($inicio.Checked) { Invoke-Script 'iniciar-com-windows.ps1' -Wait } else { Invoke-Script 'iniciar-com-windows.ps1' @('-Remover') -Wait } })
$fechar.add_Click({
  $ni.Visible = $false
  $env:CODE_ROOM_NO_PAUSE = '1'
  Invoke-Script 'stop.ps1' -Wait
  [System.Windows.Forms.Application]::Exit()
})

$falhas = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [Math]::Max(1, $IntervaloSeg) * 1000
$timer.add_Tick({
  if (Test-Servico) { $script:falhas = 0 } else { $script:falhas++ }
  if ($script:falhas -ge $FalhasMax) { $ni.Visible = $false; [System.Windows.Forms.Application]::Exit() }
})
$ni.Visible = $true
$timer.Start()
try { [System.Windows.Forms.Application]::Run() }
finally { $timer.Stop(); $ni.Visible = $false; $ni.Dispose(); $mutex.ReleaseMutex(); $mutex.Dispose() }
