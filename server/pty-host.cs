// Ponte de terminal do Code Room (pseudo-console do Windows, ConPTY), para o terminal DENTRO do app funcionar
// com programas interativos (Claude, Codex, Gemini, PowerShell), como num terminal de verdade.
// Compilado uma vez pelo próprio Windows (csc do .NET Framework, via PowerShell Add-Type) na pasta de dados.
//
// Uso: cr-pty.exe <colunas> <linhas> <pasta> <linha de comando>
// Entrada padrão: mensagens [tipo 1 byte][tamanho 4 bytes LE][conteúdo]. Tipo 1 = teclas (UTF-8); tipo 2 = tamanho
// (colunas u16 LE, linhas u16 LE). Saída padrão: os bytes que o terminal desenha (sequências VT), sem alteração.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static class CrPty {
  [StructLayout(LayoutKind.Sequential)] struct COORD { public short X; public short Y; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO { public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX; public int dwY; public int dwXSize; public int dwYSize; public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute; public int dwFlags; public short wShowWindow; public short cbReserved2; public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId; }

  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out SafeFileHandle r, out SafeFileHandle w, IntPtr a, int s);
  [DllImport("kernel32.dll", SetLastError = true)] static extern int CreatePseudoConsole(COORD size, SafeFileHandle input, SafeFileHandle output, uint flags, out IntPtr hpc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern int ResizePseudoConsole(IntPtr hpc, COORD size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern void ClosePseudoConsole(IntPtr hpc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attr, IntPtr value, IntPtr size, IntPtr prev, IntPtr retSize);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcessW(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr h, uint code);

  static IntPtr hpc = IntPtr.Zero;

  static COORD Size(int c, int r) { COORD s = new COORD(); s.X = (short)Math.Max(10, Math.Min(500, c)); s.Y = (short)Math.Max(3, Math.Min(300, r)); return s; }

  public static int Main(string[] args) {
    if (args.Length < 4) { Console.Error.WriteLine("uso: cr-pty <colunas> <linhas> <pasta> <comando>"); return 2; }
    int cols = int.Parse(args[0]), rows = int.Parse(args[1]); string cwd = args[2], cmd = args[3];
    SafeFileHandle inRead, inWrite, outRead, outWrite;
    if (!CreatePipe(out inRead, out inWrite, IntPtr.Zero, 0) || !CreatePipe(out outRead, out outWrite, IntPtr.Zero, 0)) { Console.Error.WriteLine("CreatePipe falhou"); return 3; }
    int hr = CreatePseudoConsole(Size(cols, rows), inRead, outWrite, 0, out hpc);
    if (hr != 0) { Console.Error.WriteLine("CreatePseudoConsole falhou: " + hr); return 4; }
    inRead.Dispose(); outWrite.Dispose();   // agora pertencem ao pseudo-console

    IntPtr size = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
    STARTUPINFOEX si = new STARTUPINFOEX(); si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
    // Sem isto o programa filho herda a entrada/saída deste ajudante (os canais do Code Room) e lê as mensagens cruas.
    si.StartupInfo.dwFlags = 0x00000100; si.StartupInfo.hStdInput = IntPtr.Zero; si.StartupInfo.hStdOutput = IntPtr.Zero; si.StartupInfo.hStdError = IntPtr.Zero;
    si.lpAttributeList = Marshal.AllocHGlobal(size);
    if (!InitializeProcThreadAttributeList(si.lpAttributeList, 1, 0, ref size)) { Console.Error.WriteLine("lista de atributos falhou"); return 5; }
    if (!UpdateProcThreadAttribute(si.lpAttributeList, 0, (IntPtr)0x00020016, hpc, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) { Console.Error.WriteLine("atributo do pseudo-console falhou"); return 6; }
    PROCESS_INFORMATION pi;
    if (!CreateProcessW(null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0x00080000 | 0x00000400, IntPtr.Zero, cwd, ref si, out pi)) { Console.Error.WriteLine("não consegui iniciar: " + cmd + " (erro " + Marshal.GetLastWin32Error() + ")"); return 7; }

    Stream stdout = Console.OpenStandardOutput(), stdin = Console.OpenStandardInput();
    FileStream fromPty = new FileStream(outRead, FileAccess.Read), toPty = new FileStream(inWrite, FileAccess.Write);
    Thread saida = new Thread(delegate() {
      byte[] buf = new byte[16384];
      try { int n; while ((n = fromPty.Read(buf, 0, buf.Length)) > 0) { stdout.Write(buf, 0, n); stdout.Flush(); } } catch { }
    });
    saida.IsBackground = true; saida.Start();
    Thread entrada = new Thread(delegate() {
      byte[] head = new byte[5];
      try {
        while (true) {
          if (!LerTudo(stdin, head, 5)) break;
          int len = BitConverter.ToInt32(head, 1); if (len < 0 || len > 1048576) break;
          byte[] body = new byte[len]; if (!LerTudo(stdin, body, len)) break;
          if (head[0] == 1) { toPty.Write(body, 0, len); toPty.Flush(); }
          else if (head[0] == 2 && len >= 4) ResizePseudoConsole(hpc, Size(BitConverter.ToUInt16(body, 0), BitConverter.ToUInt16(body, 2)));
        }
      } catch { }
      // O Code Room fechou a entrada: encerra o programa do terminal.
      try { TerminateProcess(pi.hProcess, 1); } catch { }
    });
    entrada.IsBackground = true; entrada.Start();

    WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
    uint code; GetExitCodeProcess(pi.hProcess, out code);
    Thread.Sleep(150);
    ClosePseudoConsole(hpc);
    saida.Join(1000);
    return (int)code;
  }

  static bool LerTudo(Stream s, byte[] b, int n) { int o = 0; while (o < n) { int k = s.Read(b, o, n - o); if (k <= 0) return false; o += k; } return true; }
}
