# Voz segurando a tecla, em qualquer programa: segure Ctrl direito e fale; ao soltar, o texto é colado no campo com foco.
# Com chave do Groq (Biblioteca de APIs), o próprio Windows grava o microfone (MCI, sem dependências) e o Code Room
# transcreve pelo Groq. Sem chave, a tela do Code Room ouve pelo navegador, como no atalho Ctrl+Shift+Espaço.
# Se outra tecla for apertada junto (Ctrl+C, por exemplo), a gravação é descartada: é um atalho comum, não fala.
# Carregado pela bandeja.ps1 (usa $port, $menu, $ni e Get-Chave de lá).

Add-Type -ReferencedAssemblies 'System.Windows.Forms', 'System.Web.Extensions' -TypeDefinition @"
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Web.Script.Serialization;
public static class CrVozSegurar {
  delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int c, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string n);
  [DllImport("winmm.dll", CharSet = CharSet.Unicode)] static extern int mciSendString(string cmd, StringBuilder ret, int len, IntPtr cb);
  [StructLayout(LayoutKind.Sequential)] struct KB { public uint vk, scan, flags, time; public IntPtr extra; }
  const uint VK_RCONTROL = 0xA3; const int MIN_MS = 350, MAX_MS = 120000;

  static HookProc proc; static IntPtr hook = IntPtr.Zero; static Control ui;
  static bool down, other, gravando, web; static DateTime t0; static string webId;
  static System.Windows.Forms.Timer limite;
  public static string Base = "", ChaveArq = "", Tmp = "";
  public static bool Ligado = true, Groq = false;
  public static Action<string> Aviso;

  public static void Iniciar(int port, string dataDir) {
    Base = "http://127.0.0.1:" + port; ChaveArq = Path.Combine(dataDir, "access.key"); Tmp = Path.Combine(dataDir, "tmp");
    ui = new Control(); ui.CreateControl(); IntPtr _ = ui.Handle;
    limite = new System.Windows.Forms.Timer(); limite.Interval = MAX_MS; limite.Tick += delegate { limite.Stop(); if (down) { down = false; Soltou(); } };
    proc = Gancho; hook = SetWindowsHookEx(13, proc, GetModuleHandle(null), 0);
    AtualizarConfig();
  }
  public static void Parar() { if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; } Descartar(); }

  // O gancho só anota e devolve na hora (o Windows derruba ganchos lentos); o trabalho vai para a fila da interface.
  static IntPtr Gancho(int code, IntPtr w, IntPtr l) {
    if (code >= 0 && Ligado) {
      KB k = (KB)Marshal.PtrToStructure(l, typeof(KB)); int msg = (int)w;
      bool injetada = (k.flags & 0x10) != 0, aperta = msg == 0x100 || msg == 0x104, solta = msg == 0x101 || msg == 0x105;
      if (!injetada) {
        if (k.vk == VK_RCONTROL) {
          if (aperta && !down) { down = true; other = false; t0 = DateTime.Now; ui.BeginInvoke((MethodInvoker)Apertou); }
          else if (solta && down) { down = false; ui.BeginInvoke((MethodInvoker)Soltou); }
        } else if (aperta && down && !other) { other = true; ui.BeginInvoke((MethodInvoker)Descartar); }
      }
    }
    return CallNextHookEx(hook, code, w, l);
  }

  static string Mci(string c) { StringBuilder r = new StringBuilder(128); mciSendString(c, r, 128, IntPtr.Zero); return r.ToString(); }
  static void Apertou() {
    if (other) return;
    web = !Groq;
    if (web) { Post("/api/voice/global", "{\"action\":\"start\"}", delegate(string r) { webId = Campo(r, "id"); }); }
    else {
      Mci("close crvoz");
      Mci("open new type waveaudio alias crvoz");
      Mci("set crvoz bitspersample 16 channels 1 samplespersec 16000 bytespersec 32000 alignment 2");
      Mci("record crvoz"); gravando = true;
      Post("/api/voice/native", "{\"state\":\"listening\"}", null);
    }
    limite.Stop(); limite.Start();
  }
  static void Descartar() {
    limite.Stop();
    if (gravando) { gravando = false; Mci("stop crvoz"); Mci("close crvoz"); Post("/api/voice/native", "{\"state\":\"\"}", null); }
    if (web) { web = false; Post("/api/voice/global", "{\"action\":\"cancel\"}", null); }
  }
  static void Soltou() {
    limite.Stop();
    if (other) return;
    bool curto = (DateTime.Now - t0).TotalMilliseconds < MIN_MS;
    if (web) {
      web = false;
      if (curto) { Post("/api/voice/global", "{\"action\":\"cancel\"}", null); return; }
      Post("/api/voice/global", "{\"action\":\"stop\"}", delegate(string r) { string id = Campo(r, "id"); if (id != "") EsperarTexto(id, DateTime.Now.AddSeconds(12)); });
      return;
    }
    if (!gravando) return;
    gravando = false; Mci("stop crvoz");
    if (curto) { Mci("close crvoz"); Post("/api/voice/native", "{\"state\":\"\"}", null); return; }
    Directory.CreateDirectory(Tmp); string arq = Path.Combine(Tmp, "voz-" + Guid.NewGuid().ToString("N") + ".wav");
    Mci("save crvoz \"" + arq + "\""); Mci("close crvoz");
    Post("/api/voice/native", "{\"state\":\"transcribing\"}", null);
    ThreadPool.QueueUserWorkItem(delegate {
      string texto = "", erro = "";
      try {
        byte[] audio = File.ReadAllBytes(arq);
        HttpWebRequest q = (HttpWebRequest)WebRequest.Create(Base + "/api/voice/transcribe");
        q.Method = "POST"; q.ContentType = "audio/wav"; q.Headers["X-Code-Room-Key"] = Chave(); q.Timeout = 40000; q.Proxy = null;
        using (Stream s = q.GetRequestStream()) s.Write(audio, 0, audio.Length);
        texto = Campo(Ler(q), "text");
      } catch (WebException e) {
        string r = ""; try { using (StreamReader sr = new StreamReader(e.Response.GetResponseStream(), Encoding.UTF8)) r = sr.ReadToEnd(); } catch {}
        erro = Campo(r, "error"); if (erro == "") erro = "Não consegui transcrever: " + e.Message;
        if (r.Contains("\"fallback\":true")) Groq = false;
      } catch (Exception e) { erro = "Não consegui transcrever: " + e.Message; }
      finally { try { File.Delete(arq); } catch {} }
      Post("/api/voice/native", "{\"state\":\"\"}", null);
      ui.BeginInvoke((MethodInvoker)delegate { if (texto != "") Colar(texto); else if (erro != "" && Aviso != null) Aviso(erro); });
    });
  }
  // Sem Groq: a tela do Code Room ouviu; busca o texto e cola.
  static void EsperarTexto(string id, DateTime ate) {
    ThreadPool.QueueUserWorkItem(delegate {
      while (DateTime.Now < ate) {
        Thread.Sleep(250);
        try {
          HttpWebRequest q = (HttpWebRequest)WebRequest.Create(Base + "/api/voice/result?id=" + Uri.EscapeDataString(id));
          q.Headers["X-Code-Room-Key"] = Chave(); q.Timeout = 3000; q.Proxy = null; string r = Ler(q);
          if (r.Contains("\"ready\":true")) { string t = Campo(r, "text"); ui.BeginInvoke((MethodInvoker)delegate { Colar(t); }); return; }
        } catch {}
      }
      ui.BeginInvoke((MethodInvoker)delegate { if (Aviso != null) Aviso("Não recebi o texto. Deixe o Code Room aberto no navegador com o microfone liberado, ou cadastre uma chave do Groq para o ditado rápido."); });
    });
  }
  // Cola pelo Ctrl+V e devolve à área de transferência o que ela tinha antes.
  static void Colar(string t) {
    if (string.IsNullOrEmpty(t)) return;
    string antes = null; try { if (Clipboard.ContainsText()) antes = Clipboard.GetText(); } catch {}
    try { Clipboard.SetText(t); } catch { return; }
    SendKeys.SendWait("^v");
    System.Windows.Forms.Timer v = new System.Windows.Forms.Timer(); v.Interval = 400;
    v.Tick += delegate { v.Stop(); v.Dispose(); if (antes != null) { try { Clipboard.SetText(antes); } catch {} } };
    v.Start();
  }
  public static void AtualizarConfig() {
    ThreadPool.QueueUserWorkItem(delegate {
      try { HttpWebRequest q = (HttpWebRequest)WebRequest.Create(Base + "/api/voice/config"); q.Headers["X-Code-Room-Key"] = Chave(); q.Timeout = 3000; q.Proxy = null; Groq = Ler(q).Contains("\"groq\":true"); } catch {}
    });
  }
  static string Chave() { try { return File.ReadAllText(ChaveArq).Trim(); } catch { return ""; } }
  static string Ler(HttpWebRequest q) { using (WebResponse r = q.GetResponse()) using (StreamReader sr = new StreamReader(r.GetResponseStream(), Encoding.UTF8)) return sr.ReadToEnd(); }
  static string Campo(string json, string nome) {
    try { var d = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json); object v; return d != null && d.TryGetValue(nome, out v) && v != null ? v.ToString() : ""; } catch { return ""; }
  }
  static void Post(string rota, string corpo, Action<string> depois) {
    ThreadPool.QueueUserWorkItem(delegate {
      try {
        HttpWebRequest q = (HttpWebRequest)WebRequest.Create(Base + rota); q.Method = "POST"; q.ContentType = "application/json"; q.Headers["X-Code-Room-Key"] = Chave(); q.Timeout = 4000; q.Proxy = null;
        byte[] b = Encoding.UTF8.GetBytes(corpo); using (Stream s = q.GetRequestStream()) s.Write(b, 0, b.Length);
        string r = Ler(q); if (depois != null) ui.BeginInvoke((MethodInvoker)delegate { depois(r); });
      } catch {}
    });
  }
}
"@

[CrVozSegurar]::Aviso = [Action[string]] { param($m) $ni.ShowBalloonTip(5000, 'Nico', $m, [System.Windows.Forms.ToolTipIcon]::Info) }
[CrVozSegurar]::Iniciar($port, $env:CODE_ROOM_DATA)
$vozCfgTimer = New-Object System.Windows.Forms.Timer; $vozCfgTimer.Interval = 30000; $vozCfgTimer.add_Tick({ [CrVozSegurar]::AtualizarConfig() }); $vozCfgTimer.Start()

$vozItem = New-Object System.Windows.Forms.ToolStripMenuItem('Falar segurando Ctrl direito'); $vozItem.CheckOnClick = $true; $vozItem.Checked = $true
$vozItem.add_Click({ [CrVozSegurar]::Ligado = $vozItem.Checked })
$menu.Items.Insert(3, $vozItem)
