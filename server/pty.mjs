// Terminais DENTRO do Code Room (como na Alethe): cada sessão é um programa rodando num pseudo-console do Windows
// (cr-pty.exe, compilado de pty-host.cs na primeira vez), com a tela desenhada pelo xterm.js no navegador.
// A saída vai em bytes brutos por uma resposta HTTP contínua; as teclas chegam por POST. Só no computador (chave principal).
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'pty-host.cs');
const MAX_SESSIONS = 8, MAX_BUFFER = 512 * 1024;

// Monta a linha de comando do programa que roda no terminal (o mesmo plano do terminal externo).
export function commandLine(plan) {
  const q = s => `"${String(s).replace(/"/g, '\\"')}"`;
  return [q(plan.ps), ...plan.inner.map(a => (/[\s"&']/.test(a) ? q(a) : a))].join(' ');
}

// Compila o ajudante uma vez por versão do código (o nome leva o hash do .cs). Usa o csc do próprio Windows.
export async function ensureHelper(binDir, { source = SOURCE, run = execFile } = {}) {
  const hash = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 12);
  const exe = join(binDir, `cr-pty-${hash}.exe`);
  if (existsSync(exe) && statSync(exe).size > 0) return exe;
  mkdirSync(binDir, { recursive: true });
  const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const cmd = `Add-Type -TypeDefinition ([IO.File]::ReadAllText('${source.replace(/'/g, "''")}')) -OutputAssembly '${exe.replace(/'/g, "''")}' -OutputType ConsoleApplication`;
  await new Promise((ok, fail) => run(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { windowsHide: true, timeout: 120000 }, (err, _o, stderr) => err ? fail(new Error(`Não consegui preparar o terminal: ${String(stderr || err.message).slice(0, 300)}`)) : ok()));
  if (!existsSync(exe)) throw new Error('Não consegui preparar o terminal (o Windows não gerou o ajudante).');
  return exe;
}

const frame = (type, payload) => { const b = Buffer.alloc(5 + payload.length); b[0] = type; b.writeInt32LE(payload.length, 1); payload.copy(b, 5); return b; };

export class Terminals {
  constructor({ binDir, launch = spawn, helper = null } = {}) { this.binDir = binDir; this.launch = launch; this.helper = helper; this.items = new Map(); }
  list() { return [...this.items.values()].map(t => this.view(t)); }
  view(t) { return { id: t.id, title: t.title, cwd: t.cwd, cli: t.cli, unrestricted: t.unrestricted, project: t.project, alive: !t.exited, exitCode: t.exitCode, createdAt: t.createdAt }; }
  get(id) { const t = this.items.get(String(id)); if (!t) throw Object.assign(new Error('Terminal não encontrado (ele pode ter sido fechado).'), { status: 404 }); return t; }

  async open(plan, { cols = 100, rows = 30, project = '' } = {}) {
    if ([...this.items.values()].filter(t => !t.exited).length >= MAX_SESSIONS) throw new Error(`Limite de ${MAX_SESSIONS} terminais abertos. Feche um para abrir outro.`);
    for (const [id, t] of this.items) if (t.exited) this.items.delete(id);   // os já encerrados saem da lista
    const exe = this.helper || await ensureHelper(this.binDir);
    const id = randomUUID(), cmd = commandLine(plan);
    // Logo depois de compilar, o Windows (antivírus examinando o .exe novo) às vezes recusa executar: "spawn UNKNOWN"/EBUSY/EPERM.
    // Tenta de novo por até ~9 s (com a máquina ocupada, o exame do antivírus demora mais) antes de desistir.
    let child;
    for (let i = 0; ; i++) {
      try { child = this.launch(exe, [String(cols | 0), String(rows | 0), plan.cwd, cmd], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); break; }
      catch (e) { if (i >= 16 || !/UNKNOWN|EBUSY|EPERM|EACCES/.test(`${e.code} ${e.message}`)) throw e; await new Promise(r => setTimeout(r, 250 + i * 40)); }
    }
    const t = { id, child, cwd: plan.cwd, cli: plan.cli, unrestricted: !!plan.unrestricted, project, title: `${plan.label}${plan.unrestricted ? ' (irrestrito)' : ''}`, chunks: [], size: 0, subs: new Set(), exited: false, exitCode: null, createdAt: new Date().toISOString() };
    const push = buf => {
      t.chunks.push(buf); t.size += buf.length;
      while (t.size > MAX_BUFFER && t.chunks.length > 1) t.size -= t.chunks.shift().length;
      for (const res of t.subs) { try { res.write(buf); } catch {} }
    };
    child.stdout.on('data', push);
    child.stderr.on('data', b => push(Buffer.from(`\r\n\x1b[31m${b.toString('utf8').trim()}\x1b[0m\r\n`)));
    child.on('error', e => push(Buffer.from(`\r\n\x1b[31mNão consegui abrir o terminal: ${e.message}\x1b[0m\r\n`)));
    child.on('exit', code => { t.exited = true; t.exitCode = code; push(Buffer.from(`\r\n\x1b[90m[terminal encerrado${code ? ` · código ${code}` : ''}]\x1b[0m\r\n`)); for (const res of t.subs) { try { res.end(); } catch {} } t.subs.clear(); });
    this.items.set(id, t);
    return this.view(t);
  }
  // Saída: primeiro o que já foi escrito (para reabrir a aba sem perder a tela), depois ao vivo.
  attach(id, res) {
    const t = this.get(id);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const c of t.chunks) res.write(c);
    if (t.exited) return res.end();
    t.subs.add(res); res.on('close', () => t.subs.delete(res));
  }
  // Últimas linhas do terminal em texto simples (sem cores nem códigos de controle), para o Nico ler o resultado.
  tail(id, chars = 1500) {
    const t = this.get(id), raw = Buffer.concat(t.chunks.slice(-40)).toString('utf8');
    return raw
      .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')   // títulos de janela (OSC)
      .replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '')        // cores e movimento de cursor (CSI)
      .replace(/\x1b[@-_]/g, '')
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n')
      .slice(-chars);
  }
  input(id, data) { const t = this.get(id); if (t.exited) throw new Error('Este terminal já foi encerrado.'); const s = String(data ?? ''); if (s.length > 65536) throw new Error('Texto grande demais.'); t.child.stdin.write(frame(1, Buffer.from(s, 'utf8'))); }
  resize(id, cols, rows) { const t = this.get(id); if (t.exited) return; const b = Buffer.alloc(4); b.writeUInt16LE(Math.max(10, Math.min(500, cols | 0)), 0); b.writeUInt16LE(Math.max(3, Math.min(300, rows | 0)), 2); t.child.stdin.write(frame(2, b)); }
  close(id) { const t = this.get(id); if (!t.exited) { try { t.child.stdin.end(); } catch {} setTimeout(() => { if (!t.exited) try { t.child.kill(); } catch {} }, 1500); } this.items.delete(t.id); return { ok: true }; }
  closeAll() { for (const id of [...this.items.keys()]) { try { this.close(id); } catch {} } }
}
