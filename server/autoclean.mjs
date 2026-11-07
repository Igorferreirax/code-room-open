import { randomUUID } from 'node:crypto';
import { retentionClean } from './retention.mjs';

// Limpeza automática (opcional, DESLIGADA por padrão): uma vez por dia apaga só o que a limpeza com prévia já apagaria
// (tarefas internas do Assistente com mais de 7 dias, pacotes de atualização já baixados, a cópia da versão anterior depois
// de 7 dias e avisos antigos já vistos). Entregas, projetos, suas tarefas, conversas, agentes e a lixeira nunca são tocados.
export const CHECK_MS = 6 * 3600e3;      // confere de tempos em tempos
export const MIN_GAP_MS = 22 * 3600e3;   // e roda no máximo uma vez por dia
const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

export class AutoClean {
  constructor({ store, dataDir, appDir, now = Date.now, clean = retentionClean }) {
    Object.assign(this, { store, dataDir, appDir, now, clean }); this.timer = null; this.first = null; this.running = false;
  }
  get enabled() { return this.store.get('settings', 'cleanup')?.auto === true; }
  status() { const s = this.store.get('settings', 'cleanup') || {}; return { auto: s.auto === true, lastRun: s.lastRun || null, last: s.last || null }; }
  setEnabled(on) { const s = this.store.get('settings', 'cleanup') || { id: 'cleanup' }; this.store.put('settings', { ...s, id: 'cleanup', auto: on === true }); return this.status(); }
  async tick() {
    if (!this.enabled || this.running) return null;
    const s = this.store.get('settings', 'cleanup') || {}, t = this.now();
    if (s.lastRun && t - Date.parse(s.lastRun) < MIN_GAP_MS) return null;
    this.running = true;
    try {
      const r = await this.clean({ store: this.store, dataDir: this.dataDir, appDir: this.appDir, now: t });
      const n = r.removed.tasks + r.removed.runs + r.removed.files + r.removed.notices + (r.removed.anterior ? 1 : 0);
      this.store.put('settings', { ...(this.store.get('settings', 'cleanup') || { id: 'cleanup' }), id: 'cleanup', lastRun: new Date(t).toISOString(), last: { items: n, freedBytes: r.freedBytes } });
      if (n > 0) this.store.put('notices', { id: randomUUID(), kind: 'cleanup', title: 'Limpeza automática', text: `Apaguei ${n} ${n === 1 ? 'item antigo' : 'itens antigos'}${r.freedBytes ? ` e liberei ${fmt(r.freedBytes)}` : ''}. Nada seu foi tocado (entregas, projetos e conversas ficam).`, at: new Date(t).toISOString(), seen: false });
      return r;
    } catch { return null; } finally { this.running = false; }
  }
  start() {
    if (this.timer) return;
    this.first = setTimeout(() => void this.tick(), 2 * 60e3); this.first.unref?.();
    this.timer = setInterval(() => void this.tick(), CHECK_MS); this.timer.unref?.();
  }
  stop() { clearTimeout(this.first); clearInterval(this.timer); this.timer = this.first = null; }
}
