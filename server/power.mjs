import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Energia do computador:
// 1) Aviso de suspensão: o serviço confere o relógio a cada poucos segundos. Um salto grande (o PC dormiu ou hibernou)
//    vira um aviso na tela, porque nesse tempo o acesso pelo celular, as rotinas e as tarefas ficaram paradas.
// 2) Manter acordado (opcional, desligado por padrão): enquanto houver tarefa rodando, um ajudante pede ao Windows para não dormir.
//    O ajudante se encerra sozinho se o Code Room fechar, então nunca deixa o PC preso acordado.
export const TICK_MS = 5000;
export const SLEEP_GAP_MS = 60000;       // salto de relógio a partir do qual consideramos suspensão
export const NOTICE_MIN_MS = 10 * 60000; // suspensões curtas só avisam se havia tarefa rodando

export function fmtDuration(ms) {
  const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60), mi = m % 60, d = Math.floor(h / 24);
  if (d) return `${d} d ${h % 24} h`;
  return h ? `${h} h${mi ? ` ${String(mi).padStart(2, '0')} min` : ''}` : `${mi} min`;
}
const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Script do ajudante (PowerShell). ES_CONTINUOUS | ES_SYSTEM_REQUIRED = 0x80000001. Sai quando o processo pai some.
export const helperScript = parentPid => {
  if (!Number.isInteger(parentPid) || parentPid <= 0) throw new Error('PID inválido.');
  return 'Add-Type -Namespace CR -Name P -MemberDefinition \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);\';'
    + `$pp=${parentPid};while($true){if(-not (Get-Process -Id $pp -ErrorAction SilentlyContinue)){break};[void][CR.P]::SetThreadExecutionState(0x80000001);Start-Sleep -Seconds 20}`;
};

export class Power {
  constructor({ store, countRunning, spawnImpl = spawn, now = Date.now, platform = process.platform, pid = process.pid, tickMs = TICK_MS }) {
    Object.assign(this, { store, countRunning, spawnImpl, now, platform, pid, tickMs });
    this.last = now(); this.timer = null; this.helper = null;
  }
  get keepAwake() { return this.store.get('settings', 'power')?.keepAwake === true; }
  setKeepAwake(on) { this.store.put('settings', { id: 'power', keepAwake: on === true }); this.sync(); return this.status(); }
  status() { return { keepAwake: this.keepAwake, holding: !!this.helper, supported: this.platform === 'win32', lastSleep: this.store.get('settings', 'power-last') || null }; }
  start() { if (this.timer) return; this.last = this.now(); this.timer = setInterval(() => this.tick(), this.tickMs); this.timer.unref?.(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.release(); }
  tick() {
    const t = this.now(), gap = t - this.last; this.last = t;
    if (gap > SLEEP_GAP_MS) this.onSleep(t - gap, t);
    this.sync();
  }
  onSleep(from, to) {
    const running = this.countRunning(), dur = to - from;
    this.store.put('settings', { id: 'power-last', from: new Date(from).toISOString(), to: new Date(to).toISOString(), running });
    if (dur < NOTICE_MIN_MS && !running) return;
    const tail = running
      ? `${running} tarefa${running > 1 ? 's estavam' : ' estava'} em andamento: confira se terminou${running > 1 ? 'm' : ''} ou se precisa repetir.`
      : 'Nenhuma tarefa estava em andamento. Nesse tempo o acesso pelo celular e as rotinas ficaram parados.';
    this.store.put('notices', { id: randomUUID(), kind: 'sleep', title: 'O computador esteve em suspensão', text: `De ${hhmm(from)} a ${hhmm(to)} (${fmtDuration(dur)}). ${tail}`, at: new Date(to).toISOString(), seen: false });
  }
  sync() {
    const want = this.keepAwake && this.platform === 'win32' && this.countRunning() > 0;
    if (want && !this.helper) this.hold(); else if (!want && this.helper) this.release();
  }
  hold() {
    let h;
    try { h = this.spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', helperScript(this.pid)], { windowsHide: true, stdio: 'ignore' }); } catch { return; }
    this.helper = h; h.on?.('exit', () => { if (this.helper === h) this.helper = null; }); h.on?.('error', () => { if (this.helper === h) this.helper = null; }); h.unref?.();
  }
  release() { const h = this.helper; this.helper = null; try { h?.kill(); } catch {} }
}
