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
$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem('Code Room · ativo'); $statusItem.Enabled = $false; [void]$menu.Items.Add($statusItem)
[void]$menu.Items.Add('-')
$abrir = $menu.Items.Add('Abrir o Code Room'); $abrir.Font = New-Object System.Drawing.Font($abrir.Font, [System.Drawing.FontStyle]::Bold)
[void]$menu.Items.Add('-')
$inicio = New-Object System.Windows.Forms.ToolStripMenuItem('Iniciar com o Windows'); $inicio.CheckOnClick = $true; [void]$menu.Items.Add($inicio)
[void]$menu.Items.Add('-')
$fechar = $menu.Items.Add('Fechar o Code Room')
$ni.ContextMenuStrip = $menu

$abrir.add_Click({ Invoke-Script 'start.ps1' })
$ni.add_DoubleClick({ Invoke-Script 'start.ps1' })
$ni.add_BalloonTipClicked({ Invoke-Script 'start.ps1' })
$menu.add_Opening({ $inicio.Checked = Test-Inicio })
$inicio.add_Click({ if ($inicio.Checked) { Invoke-Script 'iniciar-com-windows.ps1' -Wait } else { Invoke-Script 'iniciar-com-windows.ps1' @('-Remover') -Wait } })
$fechar.add_Click({
  $ni.Visible = $false
  $env:CODE_ROOM_NO_PAUSE = '1'
  Invoke-Script 'stop.ps1' -Wait
  [System.Windows.Forms.Application]::Exit()
})

$seenFail = @{}
$seenDone = @{}
$bootAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
function Update-StatusBandeja {
  $kf = Join-Path $env:CODE_ROOM_DATA 'access.key'
  if (-not (Test-Path -LiteralPath $kf)) { return }
  try {
    $k = (Get-Content -LiteralPath $kf -Raw).Trim()
    $st = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/state" -Headers @{ 'X-Code-Room-Key' = $k } -TimeoutSec 2
    $runs = @($st.runs)
    $act = @($runs | Where-Object { $_.status -eq 'running' -or $_.status -eq 'cancelling' }).Count
    $wait = @($runs | Where-Object { $_.status -eq 'queued' -or $_.status -eq 'waiting_dependency' }).Count
    $txt = if ($act -gt 0) { "Code Room · $act rodando" + $(if ($wait -gt 0) { " · $wait fila" } else { '' }) } elseif ($wait -gt 0) { "Code Room · $wait na fila" } else { 'Code Room · pronto' }
    if ($txt.Length -gt 63) { $txt = $txt.Substring(0, 63) }
    $ni.Text = $txt
    $statusItem.Text = $txt
    foreach ($r in ($runs | Select-Object -First 8)) {
      if (($r.status -eq 'failed' -or $r.status -eq 'blocked') -and -not $script:seenFail.ContainsKey($r.id)) {
        $script:seenFail[$r.id] = $true
        $ag = if ($r.agent.name) { $r.agent.name } else { 'Agente' }
        $ni.ShowBalloonTip(5000, "Code Room · $ag parou", ([string]$r.prompt).Substring(0, [Math]::Min(90, ([string]$r.prompt).Length)), [System.Windows.Forms.ToolTipIcon]::Warning)
        break
      }
      if ($r.status -eq 'completed' -and $null -ne $r.qaScore -and -not $script:seenDone.ContainsKey($r.id)) {
        $script:seenDone[$r.id] = $true
        $updMs = try { [DateTimeOffset]::Parse([string]$r.updatedAt).ToUnixTimeMilliseconds() } catch { 0 }
        if ($updMs -ge $script:bootAt) {
          $ag = if ($r.agent.name) { $r.agent.name } else { 'Agente' }
          $qaLbl = if ($r.qaStatus -eq 'ok') { "Qualidade $($r.qaScore)% OK" } else { "Qualidade $($r.qaScore)% (revisar)" }
          $ni.ShowBalloonTip(4000, "Code Room · $ag concluiu ($qaLbl)", ([string]$r.prompt).Substring(0, [Math]::Min(90, ([string]$r.prompt).Length)), [System.Windows.Forms.ToolTipIcon]::Info)
          break
        }
      }
    }
  } catch {}
}

# Voz em qualquer programa (Ctrl+Shift+Espaço): 1º toque começa a ouvir, 2º toque cola o texto no campo com foco.
# Não traz o Code Room para a frente: o cursor continua no programa que a pessoa escolheu. Quem ouve e transcreve é a
# tela do Code Room (ou a mini-janela do Nico); aqui só ligamos/desligamos e colamos o resultado.
$script:vozId = $null; $script:vozEsperando = $null; $script:vozAte = [DateTime]::MinValue
function Get-Chave { $kf = Join-Path $env:CODE_ROOM_DATA 'access.key'; if (Test-Path -LiteralPath $kf) { (Get-Content -LiteralPath $kf -Raw).Trim() } else { $null } }
function Send-TextoNoFoco([string]$t) {
  if (-not $t) { return }
  $antes = $null; try { if ([System.Windows.Forms.Clipboard]::ContainsText()) { $antes = [System.Windows.Forms.Clipboard]::GetText() } } catch {}
  [System.Windows.Forms.Clipboard]::SetText($t)
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 300
  if ($null -ne $antes) { try { [System.Windows.Forms.Clipboard]::SetText($antes) } catch {} }
}
function Invoke-NicoVoz {
  $k = Get-Chave; if (-not $k) { return }
  try {
    $r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/api/voice/global" -Headers @{ 'X-Code-Room-Key' = $k } -ContentType 'application/json' -Body '{"action":"toggle"}' -TimeoutSec 3
    if ($r.listening) { $script:vozId = $r.id; return }
    if ($r.id) { $script:vozEsperando = $r.id; $script:vozAte = (Get-Date).AddSeconds(12); $vozTimer.Start() }
  } catch {}
}
$vozTimer = New-Object System.Windows.Forms.Timer
$vozTimer.Interval = 300
$vozTimer.add_Tick({
  if (-not $script:vozEsperando) { $vozTimer.Stop(); return }
  if ((Get-Date) -gt $script:vozAte) {
    $vozTimer.Stop(); $script:vozEsperando = $null
    $ni.ShowBalloonTip(4000, 'Nico', 'Não recebi o texto. Deixe o Code Room (ou a mini-janela do Nico) aberto no Chrome ou no Edge, com o microfone liberado.', [System.Windows.Forms.ToolTipIcon]::Info)
    return
  }
  if ([System.Windows.Forms.Control]::ModifierKeys -ne [System.Windows.Forms.Keys]::None) { return }   # espera soltar Ctrl/Shift do atalho
  try {
    $k = Get-Chave
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/voice/result?id=$($script:vozEsperando)" -Headers @{ 'X-Code-Room-Key' = $k } -TimeoutSec 2
    if ($res.ready) { $vozTimer.Stop(); $script:vozEsperando = $null; Send-TextoNoFoco ([string]$res.text) }
  } catch {}
})

Add-Type -ReferencedAssemblies 'System.Windows.Forms' -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class CrHotKeyWin : NativeWindow {
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mod, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  public event Action Pressed;
  public CrHotKeyWin() { CreateHandle(new CreateParams()); }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0312 && Pressed != null) Pressed();
    base.WndProc(ref m);
  }
}
"@
$hk = $null
try {
  $hk = New-Object CrHotKeyWin
  $hk.add_Pressed({ Invoke-NicoVoz })
  [void][CrHotKeyWin]::RegisterHotKey($hk.Handle, 1, 0x4006, 0x20) # Ctrl+Shift+Espaço
} catch {}

# Nico flutuante do Windows (aparece quando o Code Room é minimizado).
try { . (Join-Path $PSScriptRoot 'nico-flutuante.ps1') } catch {}

$falhas = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [Math]::Max(1, $IntervaloSeg) * 1000
$timer.add_Tick({
  if (Test-Servico) { $script:falhas = 0; Update-StatusBandeja } else { $script:falhas++ }
  if ($script:falhas -ge $FalhasMax) { $ni.Visible = $false; [System.Windows.Forms.Application]::Exit() }
})
$ni.Visible = $true
$timer.Start()
try { [System.Windows.Forms.Application]::Run() }
finally { if ($hk) { try { [void][CrHotKeyWin]::UnregisterHotKey($hk.Handle, 1); $hk.DestroyHandle() } catch {} }; $timer.Stop(); $ni.Visible = $false; $ni.Dispose(); $mutex.ReleaseMutex(); $mutex.Dispose() }
