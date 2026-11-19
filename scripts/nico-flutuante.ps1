# Nico de mesa: o assistente que fica fora do Code Room, desenhado pelo próprio Windows (janela transparente, sempre por
# cima, que nunca rouba o foco do campo em que você está). Sem dependências.
# - Code Room aberto mas atrás de outro programa: ilha no topo da tela com o Nico e o que está rodando.
# - Code Room minimizado: só o Nico, solto; arraste para onde quiser (a posição fica guardada).
# - Segurando Ctrl direito: vira a esfera neural enquanto ouve e volta a ser o bot quando você solta.
# - Pedido de permissão: anel âmbar; tarefa concluída: pulinho. Clique na ilha (ou dois cliques no Nico) volta ao Code Room.
# Carregado pela bandeja.ps1 (usa $port e $menu de lá).

Add-Type -ReferencedAssemblies 'System.Windows.Forms', 'System.Drawing', 'System.Web.Extensions' -TypeDefinition @"
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Web.Script.Serialization;
public class CrNicoMesa : Form {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [StructLayout(LayoutKind.Sequential)] struct PT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct SZ { public int cx, cy; }
  [StructLayout(LayoutKind.Sequential, Pack = 1)] struct BLEND { public byte op, flags, alpha, format; }
  [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr h, IntPtr dst, ref PT pos, ref SZ size, IntPtr src, ref PT srcPos, int key, ref BLEND b, int flags);

  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams { get { CreateParams cp = base.CreateParams; cp.ExStyle |= 0x80000 | 0x08000000 | 0x80 | 0x8; return cp; } }

  public static CrNicoMesa Eu; public static bool Ligado = true; public static Action AoEsconder; public static Action<string> AoPedir;
  static string Base = "", ChaveArq = "", PosArq = "";
  static IntPtr Janela = IntPtr.Zero;
  static volatile Dictionary<string, object> pulso;

  float S = 1f; int modo = -1; Bitmap bmp; int bw, bh;
  double t, listen, listenAlvo, escreve, squish, squishV, blink, nextBlink = 2, dizzy, jump, lookX, lookY, amp, doneT;
  int prevRunning, prevApprovals; List<DateTime> cliques = new List<DateTime>(); string nome = "Nico", status = "pronto", humor = "idle";
  Point livre; bool temLivre, apertado, arrastou; Point apertoTela, janelaNoAperto;
  Stopwatch relogio = Stopwatch.StartNew(); double ultimo;
  double[] px, py, pz, ps; Random rnd = new Random();
  System.Windows.Forms.Timer quadro; ContextMenuStrip menu;

  public static void Iniciar(int port, string dataDir) {
    try { SetProcessDPIAware(); } catch {}
    Base = "http://127.0.0.1:" + port; ChaveArq = Path.Combine(dataDir, "access.key"); PosArq = Path.Combine(dataDir, "nico-mesa.txt");
    Eu = new CrNicoMesa();
    Thread th = new Thread(Pulsar); th.IsBackground = true; th.Start();
  }
  CrNicoMesa() {
    FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; TopMost = true; Text = "Nico · Code Room";
    using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) S = Math.Max(1f, g.DpiX / 96f);
    int n = 300; px = new double[n]; py = new double[n]; pz = new double[n]; ps = new double[n];
    for (int i = 0; i < n; i++) { double y = 1 - (i / (double)(n - 1)) * 2, rr = Math.Sqrt(1 - y * y), th = i * 2.399963; px[i] = Math.Cos(th) * rr; py[i] = y; pz[i] = Math.Sin(th) * rr; ps[i] = rnd.NextDouble(); }
    try { string[] p = File.ReadAllText(PosArq).Split(','); livre = new Point(int.Parse(p[0]), int.Parse(p[1])); temLivre = Screen.FromPoint(livre).WorkingArea.Contains(livre); } catch {}
    menu = new ContextMenuStrip();
    menu.Items.Add("Abrir o Code Room", null, delegate { Restaurar(); });
    menu.Items.Add("Esconder o Nico de mesa", null, delegate { Ligado = false; if (AoEsconder != null) AoEsconder(); });
    quadro = new System.Windows.Forms.Timer(); quadro.Interval = 33; quadro.Tick += delegate { Quadro(); }; quadro.Start();
  }

  // Código do Code Room: 0 = minimizado; 1 = visível; 2 = fechado. Janela do app: título "Code Room" ou "(N) Code Room".
  static int Estado() {
    int vis = 0, min = 0; IntPtr achada = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder tt = new StringBuilder(256); GetWindowText(h, tt, 256); string s = tt.ToString();
      if (!(s == "Code Room" || s.EndsWith(") Code Room"))) return true;
      StringBuilder c = new StringBuilder(128); GetClassName(h, c, 128); if (!c.ToString().StartsWith("Chrome_WidgetWin")) return true;
      if (IsIconic(h)) { min++; if (achada == IntPtr.Zero) achada = h; } else { vis++; achada = h; }
      return true;
    }, IntPtr.Zero);
    Janela = achada; return vis > 0 ? 1 : (min > 0 ? 0 : 2);
  }
  public static void Restaurar() { if (Janela != IntPtr.Zero) { ShowWindow(Janela, 9); SetForegroundWindow(Janela); } }

  static void Pulsar() {
    while (true) {
      try {
        HttpWebRequest q = (HttpWebRequest)WebRequest.Create(Base + "/api/pulse"); q.Timeout = 2000; q.Proxy = null;
        q.Headers["X-Code-Room-Key"] = File.ReadAllText(ChaveArq).Trim();
        using (WebResponse r = q.GetResponse()) using (StreamReader sr = new StreamReader(r.GetResponseStream(), Encoding.UTF8))
          pulso = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(sr.ReadToEnd());
      } catch { pulso = null; }
      Thread.Sleep(450);
    }
  }
  static string Txt(Dictionary<string, object> p, string k) { object v; return p != null && p.TryGetValue(k, out v) && v != null ? v.ToString() : ""; }
  static int Num(Dictionary<string, object> p, string k) { int n; return int.TryParse(Txt(p, k), out n) ? n : 0; }

  void Quadro() {
    double agora = relogio.Elapsed.TotalSeconds, dt = Math.Min(0.06, agora - ultimo); ultimo = agora; t += dt;
    int st = Estado(); Dictionary<string, object> p = pulso;
    string voz = Txt(p, "voice"); bool ouvindo = voz == "listening" || Txt(p, "listening") == "True", escrevendo = voz == "transcribing";
    bool frente = st == 1 && GetForegroundWindow() == Janela;
    int novo = !Ligado ? 0 : st == 0 ? 2 : ((st == 1 && !frente) || ouvindo || escrevendo) ? 1 : 0;
    if (novo != modo) Mudar(novo);
    int running = Num(p, "running"), queued = Num(p, "queued"), approvals = Num(p, "approvals");
    if (prevRunning > 0 && running == 0 && approvals == 0) { doneT = 2.5; jump = 1; }
    prevRunning = running;
    if (approvals > prevApprovals && !frente && AoPedir != null) { try { AoPedir(Txt(p, "approval")); } catch {} }
    prevApprovals = approvals;
    if (modo == 0) return;
    if (p != null) nome = Txt(p, "name") == "" ? "Nico" : Txt(p, "name");
    listenAlvo = ouvindo ? 1 : 0; escreve = escrevendo ? 1 : escreve * 0.9;
    doneT = Math.Max(0, doneT - dt); dizzy = Math.Max(0, dizzy - dt);
    humor = dizzy > 0 ? "dizzy" : doneT > 0 ? "done" : approvals > 0 ? "ask" : (running > 0 || Txt(p, "nico") != "") ? "work" : "idle";
    status = ouvindo ? "ouvindo… solte Ctrl para escrever" : escrevendo ? "escrevendo…" : p == null ? "conectando…"
      : approvals > 0 ? "pede permissão: " + Txt(p, "approval") : Txt(p, "nico") != "" ? "pensando…" : doneT > 0 ? "concluiu" : running > 0 ? running + " rodando" + (queued > 0 ? " · " + queued + " na fila" : "") : queued > 0 ? queued + " na fila" : "pronto";

    listen += (listenAlvo - listen) * (1 - Math.Pow(0.004, dt));
    amp = listenAlvo > 0 ? Math.Max(0, 0.5 + 0.5 * Math.Sin(t * 7) * Math.Sin(t * 2.3) + (rnd.NextDouble() - 0.5) * 0.3) : amp * 0.9;
    squishV += (-squish * 120 - squishV * 9) * dt; squish = Math.Max(-0.6, Math.Min(0.6, squish + squishV * dt * 6));
    nextBlink -= dt; if (nextBlink <= 0) { blink = 1; nextBlink = 2.5 + rnd.NextDouble() * 3.5; } blink = Math.Max(0, blink - dt * 7);
    if (jump > 0) jump = Math.Max(0, jump - dt * 1.4);
    PointF c = Centro(); Point m = Cursor.Position; double lx = 0, ly = 0;
    if (humor == "work") { lx = Math.Sin(t * 1.6); ly = -0.2; }
    else { double dx = m.X - (Left + c.X), dy = m.Y - (Top + c.Y), d = Math.Max(1, Math.Sqrt(dx * dx + dy * dy)), k = Math.Min(1, d / (220 * S)); lx = dx / d * k; ly = dy / d * k; }
    lookX += (lx - lookX) * (1 - Math.Pow(0.002, dt)); lookY += (ly - lookY) * (1 - Math.Pow(0.002, dt));
    Desenhar();
  }

  void Mudar(int novo) {
    modo = novo;
    if (novo == 0) { Hide(); return; }
    bw = (int)((novo == 1 ? 320 : 190) * S); bh = (int)((novo == 1 ? 104 : 190) * S);
    if (bmp != null) bmp.Dispose(); bmp = new Bitmap(bw, bh, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
    Rectangle wa = Screen.PrimaryScreen.WorkingArea;
    if (novo == 1) Location = new Point(wa.Left + (wa.Width - bw) / 2, wa.Top);
    else Location = temLivre ? livre : new Point(wa.Right - bw - (int)(8 * S), wa.Top + (int)(60 * S));
    Size = new Size(bw, bh);
    if (!Visible) Show();
  }
  PointF Centro() { return modo == 1 ? new PointF(36 * S, 33 * S) : new PointF(bw / 2f, bh / 2f - 6 * S); }

  void Desenhar() {
    using (Graphics g = Graphics.FromImage(bmp)) {
      g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit; g.Clear(Color.Transparent);
      PointF c = Centro(); float baseR = (modo == 1 ? 18 : 40) * S, r = baseR * (float)(1 + listen * (modo == 1 ? 0.12 : 0.75));
      float bob = (float)(Math.Sin(t * 2) * baseR * 0.05), jy = jump > 0 ? -(float)(Math.Abs(Math.Sin(jump * Math.PI * 2)) * baseR * 0.7) : 0;
      if (modo == 1) Ilha(g);
      float y = c.Y + bob + jy;
      Anel(g, c.X, y, r); Trabalho(g, c.X, y, r);
      Bola(g, c.X, y, r * (float)(1 - 0.35 * listen), (float)(1 - listen));
      Esfera(g, c.X, y, r, (float)listen);
    }
    Aplicar();
  }
  void Ilha(Graphics g) {
    RectangleF rc = new RectangleF(6 * S, 8 * S, bw - 12 * S, 50 * S);
    using (GraphicsPath gp = Pilula(rc)) {
      using (SolidBrush b = new SolidBrush(Color.FromArgb(236, 6, 9, 17))) g.FillPath(b, gp);
      using (Pen pe = new Pen(Color.FromArgb(humor == "ask" ? 150 : 34, humor == "ask" ? Color.FromArgb(245, 183, 59) : Color.White), 1 * S)) g.DrawPath(pe, gp);
    }
    using (Font f1 = new Font("Segoe UI Semibold", 13 * S, GraphicsUnit.Pixel)) using (Font f2 = new Font("Segoe UI", 12 * S, GraphicsUnit.Pixel))
    using (SolidBrush t1 = new SolidBrush(Color.FromArgb(232, 238, 255))) using (SolidBrush t2 = new SolidBrush(humor == "ask" ? Color.FromArgb(245, 183, 59) : listenAlvo > 0 ? Color.FromArgb(89, 224, 255) : Color.FromArgb(150, 168, 205))) {
      StringFormat sf = new StringFormat(StringFormatFlags.NoWrap); sf.Trimming = StringTrimming.EllipsisCharacter;
      g.DrawString(nome, f1, t1, new RectangleF(66 * S, 14 * S, bw - 84 * S, 18 * S), sf);
      g.DrawString(status, f2, t2, new RectangleF(66 * S, 32 * S, bw - 84 * S, 18 * S), sf);
    }
  }
  static GraphicsPath Pilula(RectangleF r) { GraphicsPath gp = new GraphicsPath(); float d = r.Height; gp.AddArc(r.X, r.Y, d, d, 90, 180); gp.AddArc(r.Right - d, r.Y, d, d, 270, 180); gp.CloseFigure(); return gp; }
  static void Radial(Graphics g, RectangleF area, PointF centro, Color meio, Color borda) {
    using (GraphicsPath gp = new GraphicsPath()) { gp.AddEllipse(area); using (PathGradientBrush b = new PathGradientBrush(gp)) { b.CenterPoint = centro; b.CenterColor = meio; b.SurroundColors = new Color[] { borda }; g.FillPath(b, gp); } }
  }
  void Bola(Graphics g, float x, float y, float r, float a) {
    if (a <= 0.02f) return; int A = (int)(255 * a);
    bool ask = humor == "ask"; Color brilho = ask ? Color.FromArgb(245, 183, 59) : Color.FromArgb(89, 224, 255);
    Radial(g, new RectangleF(x - r * 1.25f, y + r * 0.75f - r * 0.7f, r * 2.5f, r * 1.4f), new PointF(x, y + r * 0.75f), Color.FromArgb((int)(140 * a), brilho), Color.FromArgb(0, brilho));
    GraphicsState sv = g.Save();
    g.TranslateTransform(x, y); g.ScaleTransform((float)(1 + squish * 0.18), (float)(1 - squish * 0.18));
    using (GraphicsPath corpo = new GraphicsPath()) {
      corpo.AddEllipse(-r, -r, 2 * r, 2 * r);
      using (PathGradientBrush b = new PathGradientBrush(corpo)) {
        b.CenterPoint = new PointF(-r * 0.35f, -r * 0.45f);
        ColorBlend cb = new ColorBlend(4); cb.Colors = new Color[] { Color.FromArgb(A, 47, 34, 184), Color.FromArgb(A, 85, 70, 240), Color.FromArgb(A, 143, 132, 255), Color.FromArgb(A, 217, 212, 255) };
        cb.Positions = new float[] { 0f, 0.3f, 0.65f, 1f }; b.InterpolationColors = cb; g.FillPath(b, corpo);
      }
      Region antes = g.Clip; g.SetClip(corpo, CombineMode.Intersect);
      Color aro = ask ? Color.FromArgb(255, 205, 110) : Color.FromArgb(120, 240, 255);
      Radial(g, new RectangleF(-r * 0.95f, r * 0.6f - r * 0.95f, r * 1.9f, r * 1.9f), new PointF(0, r * 0.95f), Color.FromArgb((int)(235 * a), aro), Color.FromArgb(0, aro));
      g.Clip = antes;
    }
    Radial(g, new RectangleF(-r * 0.77f, -r * 0.78f, r * 0.84f, r * 0.6f), new PointF(-r * 0.35f, -r * 0.48f), Color.FromArgb((int)(190 * a), 255, 255, 255), Color.FromArgb(0, 255, 255, 255));
    float ex = (float)(lookX * r * 0.16), ey = (float)(lookY * r * 0.12), gap = r * 0.2f, ew = r * 0.11f;
    using (SolidBrush olho = new SolidBrush(Color.FromArgb(A, 255, 255, 255))) using (Pen pe = new Pen(Color.FromArgb(A, 255, 255, 255), Math.Max(1.5f, r * 0.07f))) {
      pe.StartCap = LineCap.Round; pe.EndCap = LineCap.Round;
      if (humor == "dizzy") {
        for (int s = -1; s <= 1; s += 2) { List<PointF> pts = new List<PointF>(); for (int k = 0; k < 26; k++) { double an = k * 0.5 + t * 8 * s, rad = k * r * 0.006; pts.Add(new PointF((float)(s * gap + Math.Cos(an) * rad), (float)(-r * 0.02 + Math.Sin(an) * rad))); } g.DrawLines(pe, pts.ToArray()); }
      } else if (humor == "done") {
        for (int s = -1; s <= 1; s += 2) g.DrawArc(pe, s * gap + ex - r * 0.1f, ey + r * 0.02f - r * 0.1f, r * 0.2f, r * 0.2f, 207, 126);
      } else {
        float aberto = (float)Math.Max(0.12, 1 - blink) * (humor == "ask" ? 1.15f : 1f), eh = r * 0.34f * aberto;
        for (int s = -1; s <= 1; s += 2) { using (GraphicsPath o = Pilula(new RectangleF(s * gap + ex - ew / 2, ey - eh / 2, ew, Math.Max(ew, eh)))) g.FillPath(olho, o); }
      }
    }
    g.Restore(sv);
  }
  void Esfera(Graphics g, float x, float y, float r, float k) {
    if (k <= 0.02f) return;
    Radial(g, new RectangleF(x - r * 1.5f, y - r * 1.5f, r * 3, r * 3), new PointF(x, y), Color.FromArgb((int)(70 * k), 108, 92, 255), Color.FromArgb(0, 108, 92, 255));
    int n = px.Length; double rot = t * 0.6, ct = Math.Cos(0.35), st = Math.Sin(0.35), c = Math.Cos(rot), s = Math.Sin(rot);
    float[] qx = new float[n], qy = new float[n]; double[] qz = new double[n]; int[] ord = new int[n];
    for (int i = 0; i < n; i++) {
      double X = px[i] * c + pz[i] * s, Z = -px[i] * s + pz[i] * c, Y = py[i] * ct - Z * st; Z = py[i] * st + Z * ct;
      double wob = 1 + amp * 0.35 * Math.Sin(ps[i] * 20 + t * 9) + escreve * 0.25 * Math.Sin(Y * 6 + t * 14), rr = r * (0.55 + 0.45 * k) * wob;
      qx[i] = (float)(x + X * rr); qy[i] = (float)(y + Y * rr); qz[i] = Z; ord[i] = i;
    }
    Array.Sort(qz, ord);
    for (int j = 0; j < n; j++) {
      int i = ord[j]; double d = (qz[j] + 1) / 2; float tam = (float)(r / 46 * (0.6 + 1.3 * d)) * 1.4f;
      Color cor = d > 0.55 ? Color.FromArgb(127, 240, 255) : Color.FromArgb(142, 125, 255);
      using (SolidBrush b = new SolidBrush(Color.FromArgb((int)(255 * k * (0.25 + 0.75 * d)), cor))) g.FillEllipse(b, qx[i] - tam, qy[i] - tam, tam * 2, tam * 2);
    }
  }
  void Anel(Graphics g, float x, float y, float r) {
    if (humor != "ask" || listen > 0.5) return; double p = (Math.Sin(t * 4) + 1) / 2; float rr = r * (float)(1.18 + 0.08 * p);
    using (Pen pe = new Pen(Color.FromArgb((int)(255 * (0.35 + 0.45 * p)), 245, 183, 59), Math.Max(2, r * 0.07f))) g.DrawEllipse(pe, x - rr, y - rr, rr * 2, rr * 2);
  }
  void Trabalho(Graphics g, float x, float y, float r) {
    if (humor != "work" || listen > 0.5) return; double a = t * 3; float d = Math.Max(2, r * 0.08f), cx = (float)(x + Math.Cos(a) * r * 1.3), cy = (float)(y + Math.Sin(a) * r * 0.5 - r * 0.1);
    Radial(g, new RectangleF(cx - d * 3, cy - d * 3, d * 6, d * 6), new PointF(cx, cy), Color.FromArgb(120, 89, 224, 255), Color.FromArgb(0, 89, 224, 255));
    using (SolidBrush b = new SolidBrush(Color.FromArgb(89, 224, 255))) g.FillEllipse(b, cx - d, cy - d, d * 2, d * 2);
  }
  void Aplicar() {
    IntPtr tela = GetDC(IntPtr.Zero), mem = CreateCompatibleDC(tela), hb = bmp.GetHbitmap(Color.FromArgb(0)), velho = SelectObject(mem, hb);
    try { PT pos = new PT(); pos.x = Left; pos.y = Top; SZ sz = new SZ(); sz.cx = bw; sz.cy = bh; PT zero = new PT(); BLEND b = new BLEND(); b.alpha = 255; b.format = 1; UpdateLayeredWindow(Handle, tela, ref pos, ref sz, mem, ref zero, 0, ref b, 2); }
    finally { SelectObject(mem, velho); DeleteObject(hb); DeleteDC(mem); ReleaseDC(IntPtr.Zero, tela); }
  }

  protected override void OnMouseDown(MouseEventArgs e) {
    if (e.Button == MouseButtons.Right) { menu.Show(Cursor.Position); return; }
    if (e.Button != MouseButtons.Left) return;
    apertado = true; arrastou = false; apertoTela = Cursor.Position; janelaNoAperto = Location;
  }
  protected override void OnMouseMove(MouseEventArgs e) {
    if (!apertado || modo != 2) return; Point m = Cursor.Position;
    if (!arrastou && Math.Abs(m.X - apertoTela.X) + Math.Abs(m.Y - apertoTela.Y) > 4 * S) arrastou = true;
    if (arrastou) { Location = new Point(janelaNoAperto.X + m.X - apertoTela.X, janelaNoAperto.Y + m.Y - apertoTela.Y); Aplicar(); }
  }
  protected override void OnMouseUp(MouseEventArgs e) {
    if (!apertado) return; apertado = false;
    if (arrastou) { livre = Location; temLivre = true; try { File.WriteAllText(PosArq, livre.X + "," + livre.Y); } catch {} return; }
    if (modo == 1) { Restaurar(); return; }
    squishV -= 0.9; DateTime agora = DateTime.Now; cliques.RemoveAll(delegate(DateTime d) { return (agora - d).TotalMilliseconds > 900; }); cliques.Add(agora);
    if (cliques.Count >= 3) { dizzy = 2.6; cliques.Clear(); }
  }
  protected override void OnMouseDoubleClick(MouseEventArgs e) { if (modo == 2 && e.Button == MouseButtons.Left) Restaurar(); }
}
"@

[CrNicoMesa]::Iniciar($port, $env:CODE_ROOM_DATA)
$bolhaItem = New-Object System.Windows.Forms.ToolStripMenuItem('Nico de mesa'); $bolhaItem.CheckOnClick = $true; $bolhaItem.Checked = $true
$bolhaItem.add_Click({ [CrNicoMesa]::Ligado = $bolhaItem.Checked })
[CrNicoMesa]::AoEsconder = [Action] { $bolhaItem.Checked = $false }
[CrNicoMesa]::AoPedir = [Action[string]] { param($o) $ni.ShowBalloonTip(6000, 'Code Room precisa de você', $(if ($o) { "$o. Abra o Code Room para permitir ou negar." } else { 'Um agente pediu permissão. Abra o Code Room para responder.' }), [System.Windows.Forms.ToolTipIcon]::Warning) }
$menu.Items.Insert(3, $bolhaItem)
