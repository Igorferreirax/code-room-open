# Nico flutuante do Windows: quando o Code Room é minimizado, o Nico aparece sozinho numa pílula sempre por cima,
# no topo da tela (canto direito), mostrando o que roda e os pedidos de permissão. Clicar no Nico volta ao Code Room;
# o microfone liga a voz em qualquer programa sem tirar o foco do campo em que você está. Dá para arrastar.
# Carregado pela bandeja.ps1 (usa $port, $root, $menu, Get-Chave e Invoke-NicoVoz de lá).

Add-Type -ReferencedAssemblies 'System.Windows.Forms', 'System.Drawing' -TypeDefinition @"
using System;
using System.Text;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class CrNicoBolha : Form {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ReleaseCapture();
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  // Não rouba o foco: o campo em que a pessoa está continua ativo (necessário para a voz colar no lugar certo).
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams { get { CreateParams cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x80 | 0x8; return cp; } }
  public static IntPtr Janela = IntPtr.Zero;
  // 0 = Code Room minimizado; 1 = visível; 2 = não está aberto. Janela do app: título "Code Room" ou "(N) Code Room".
  public static int Estado() {
    int vis = 0, min = 0; IntPtr achada = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder t = new StringBuilder(256); GetWindowText(h, t, 256); string s = t.ToString();
      if (!(s == "Code Room" || s.EndsWith(") Code Room"))) return true;
      StringBuilder c = new StringBuilder(128); GetClassName(h, c, 128); if (!c.ToString().StartsWith("Chrome_WidgetWin")) return true;
      if (IsIconic(h)) { min++; if (achada == IntPtr.Zero) achada = h; } else { vis++; achada = h; }
      return true;
    }, IntPtr.Zero);
    Janela = achada;
    return vis > 0 ? 1 : (min > 0 ? 0 : 2);
  }
  public static void Restaurar() { if (Janela != IntPtr.Zero) { ShowWindow(Janela, 9); SetForegroundWindow(Janela); } }
  public void Arrastar() { ReleaseCapture(); SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); }
}
"@

$script:bolhaLigada = $true; $script:bolhaFase = 0; $script:pulso = $null; $script:pulsoEm = [DateTime]::MinValue; $script:bolhaPos = $null
$bolha = New-Object CrNicoBolha
$bolha.FormBorderStyle = 'None'; $bolha.ShowInTaskbar = $false; $bolha.TopMost = $true; $bolha.StartPosition = 'Manual'
$bolha.Size = New-Object System.Drawing.Size(250, 60); $bolha.BackColor = [System.Drawing.Color]::FromArgb(11, 20, 38); $bolha.Text = 'Nico · Code Room'
$path = New-Object System.Drawing.Drawing2D.GraphicsPath; $r = 28
$path.AddArc(0, 0, $r * 2, $r * 2, 90, 180); $path.AddArc(250 - $r * 2, 0, $r * 2, $r * 2, 270, 180); $path.CloseFigure()
$bolha.Region = New-Object System.Drawing.Region($path)

$rosto = New-Object System.Windows.Forms.PictureBox; $rosto.Size = New-Object System.Drawing.Size(48, 48); $rosto.Location = New-Object System.Drawing.Point(8, 6); $rosto.SizeMode = 'Zoom'; $rosto.Cursor = 'Hand'
$img = Join-Path $root 'public\assets\nico-face.png'; if (Test-Path -LiteralPath $img) { $rosto.Image = [System.Drawing.Image]::FromFile($img) }
$titulo = New-Object System.Windows.Forms.Label; $titulo.Location = New-Object System.Drawing.Point(60, 9); $titulo.Size = New-Object System.Drawing.Size(132, 20); $titulo.ForeColor = [System.Drawing.Color]::FromArgb(232, 238, 252); $titulo.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10); $titulo.Text = 'Nico'; $titulo.Cursor = 'Hand'
$estado = New-Object System.Windows.Forms.Label; $estado.Location = New-Object System.Drawing.Point(60, 30); $estado.Size = New-Object System.Drawing.Size(132, 18); $estado.ForeColor = [System.Drawing.Color]::FromArgb(143, 163, 199); $estado.Font = New-Object System.Drawing.Font('Segoe UI', 8.5); $estado.Text = 'pronto'; $estado.Cursor = 'Hand'
$mic = New-Object System.Windows.Forms.Button; $mic.Size = New-Object System.Drawing.Size(40, 40); $mic.Location = New-Object System.Drawing.Point(198, 10); $mic.FlatStyle = 'Flat'; $mic.FlatAppearance.BorderSize = 1
$mic.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(43, 91, 181); $mic.BackColor = [System.Drawing.Color]::FromArgb(19, 35, 66); $mic.ForeColor = [System.Drawing.Color]::White; $mic.Font = New-Object System.Drawing.Font('Segoe UI Emoji', 13); $mic.Text = [char]::ConvertFromUtf32(0x1F3A4); $mic.Cursor = 'Hand'
$dica = New-Object System.Windows.Forms.ToolTip
$dica.SetToolTip($mic, 'Falar e colar onde está o cursor (ou Ctrl+Shift+Espaço)'); $dica.SetToolTip($rosto, 'Voltar ao Code Room'); $dica.SetToolTip($titulo, 'Voltar ao Code Room (arraste para mudar de lugar)')
$bolha.Controls.AddRange(@($rosto, $titulo, $estado, $mic))

$voltar = { [CrNicoBolha]::Restaurar() }
$rosto.add_Click($voltar); $estado.add_Click($voltar)
$titulo.add_MouseDown({ param($s, $e) if ($e.Button -eq 'Left') { if ($e.Clicks -ge 2) { [CrNicoBolha]::Restaurar() } else { $bolha.Arrastar(); $script:bolhaPos = $bolha.Location } } })
$mic.add_Click({ Invoke-NicoVoz; $script:pulsoEm = [DateTime]::MinValue })

function Set-BolhaPosicao {
  if ($script:bolhaPos) { $bolha.Location = $script:bolhaPos; return }
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $bolha.Location = New-Object System.Drawing.Point(($wa.Right - $bolha.Width - 16), ($wa.Top + 12))
}
function Update-Pulso {
  if (((Get-Date) - $script:pulsoEm).TotalSeconds -lt 2) { return }
  $script:pulsoEm = Get-Date
  try { $k = Get-Chave; if ($k) { $script:pulso = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/pulse" -Headers @{ 'X-Code-Room-Key' = $k } -TimeoutSec 2 } } catch {}
}
$bolhaTimer = New-Object System.Windows.Forms.Timer; $bolhaTimer.Interval = 700
$bolhaTimer.add_Tick({
  $st = [CrNicoBolha]::Estado()
  $mostrar = $script:bolhaLigada -and $st -eq 0
  if (-not $mostrar) { if ($bolha.Visible) { $bolha.Hide() }; return }
  if (-not $bolha.Visible) { Set-BolhaPosicao; $bolha.Show() }
  Update-Pulso; $p = $script:pulso
  $ouvindo = [bool]($p -and $p.listening)
  $script:bolhaFase = ($script:bolhaFase + 1) % 4
  if ($p) { $titulo.Text = [string]$p.name }
  if ($ouvindo) { $estado.Text = 'ouvindo' + ('.' * ($script:bolhaFase + 1)); $estado.ForeColor = [System.Drawing.Color]::FromArgb(89, 224, 255); $mic.BackColor = [System.Drawing.Color]::FromArgb(217, 72, 72) }
  elseif ($p -and $p.approvals -gt 0) { $estado.Text = "pede permissão (clique)"; $estado.ForeColor = [System.Drawing.Color]::FromArgb(245, 183, 59); $mic.BackColor = [System.Drawing.Color]::FromArgb(19, 35, 66) }
  else {
    $mic.BackColor = [System.Drawing.Color]::FromArgb(19, 35, 66); $estado.ForeColor = [System.Drawing.Color]::FromArgb(143, 163, 199)
    $estado.Text = if (-not $p) { 'pronto' } elseif ($p.nico) { 'pensando…' } elseif ($p.running -gt 0) { "$($p.running) rodando" + $(if ($p.queued -gt 0) { " · $($p.queued) na fila" } else { '' }) } elseif ($p.queued -gt 0) { "$($p.queued) na fila" } else { 'pronto' }
  }
})
$bolhaTimer.Start()

$bolhaItem = New-Object System.Windows.Forms.ToolStripMenuItem('Nico flutuante ao minimizar'); $bolhaItem.CheckOnClick = $true; $bolhaItem.Checked = $true
$bolhaItem.add_Click({ $script:bolhaLigada = $bolhaItem.Checked; if (-not $script:bolhaLigada) { $bolha.Hide() } })
$menu.Items.Insert(3, $bolhaItem)
