import { randomUUID } from 'node:crypto';
import { watch, statSync } from 'node:fs';
import { sep, extname } from 'node:path';

// Rotinas: execuções agendadas por horário ou manuais. Fuso fixo America/Sao_Paulo (UTC-3; o Brasil não usa horário de verão desde 2019).
// Só roda com o serviço ligado: se a hora marcada passou com o PC desligado, a execução é registrada como "perdida", não disparada atrasada.
export const TZ = 'America/Sao_Paulo';
export const MISSED_GRACE_MS = 10 * 60 * 1000;
const OFFSET = '-03:00';
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, dow: DOW[p.weekday] };
}

export function validateRoutine(input, old = null) {
  const text = (v, max, label, req = true) => { if (v == null || v === '') { if (req) throw new Error(`${label}: obrigatório.`); return ''; } if (typeof v !== 'string' || v.length > max) throw new Error(`${label}: texto inválido (até ${max} caracteres).`); return v.trim(); };
  const name = text(input.name, 120, 'Nome'), objective = text(input.objective, 5000, 'Objetivo');
  const t = input.trigger || {};
  let trigger;
  if (t.type === 'manual') trigger = { type: 'manual' };
  else if (t.type === 'time') {
    if (!['daily', 'weekly'].includes(t.freq)) throw new Error('Frequência inválida (daily ou weekly).');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time || '')) throw new Error('Horário inválido (HH:MM).');
    if (t.freq === 'weekly' && !(Number.isInteger(t.day) && t.day >= 0 && t.day <= 6)) throw new Error('Dia da semana inválido (0 a 6).');
    trigger = { type: 'time', freq: t.freq, time: t.time, ...(t.freq === 'weekly' ? { day: t.day } : {}) };
  } else if (t.type === 'file') {
    const ext = String(t.ext || '').trim().toLowerCase().replace(/^[.]/, '');
    if (ext && !/^[a-z0-9]{1,8}$/.test(ext)) throw new Error('Extensão inválida (até 8 letras ou números, sem ponto).');
    trigger = { type: 'file', ext };
  }
  else throw new Error('Disparo inválido.');
  const target = input.target || {};
  if (!['agent', 'team', 'recipe'].includes(target.type) || typeof target.id !== 'string') throw new Error('Escolha um agente, uma equipe ou uma receita.');
  const attempts = Number.isInteger(input.attempts) ? Math.min(3, Math.max(1, input.attempts)) : 1;
  const dv = input.deliver === undefined ? (old?.deliver || {}) : (input.deliver || {}), deliver = { telegram: dv.telegram === true, email: dv.email === true };   // onde o resultado chega além do Code Room
  return { id: old?.id || randomUUID(), name, description: text(input.description, 300, 'Descrição', false), projectId: text(input.projectId, 100, 'Projeto'), target: { type: target.type, id: target.id }, objective, criteria: (input.criteria || []).slice(0, 12).map(c => text(c, 500, 'Critério')), trigger, overlap: 'skip_if_running', attempts, deliver, status: old?.status || (trigger.type === 'manual' ? 'ready' : 'active'), lastSlot: old?.lastSlot || null, history: old?.history || [], createdAt: old?.createdAt || new Date().toISOString() };
}

// O que fazer agora com esta rotina? Função pura, testável.
export function evaluate(routine, now, { running = false } = {}) {
  if (routine.status !== 'active' || routine.trigger.type !== 'time') return null; // por arquivo e manual não têm horário
  const { freq, time, day } = routine.trigger, p = localParts(now);
  if (p.time < time) return null;
  if (freq === 'weekly' && p.dow !== day) return null;
  const slot = `${p.date}T${time}`;
  if (routine.lastSlot === slot) return null;
  const due = new Date(`${slot}:00${OFFSET}`);
  if (now - due > MISSED_GRACE_MS) return { action: 'skip', slot, reason: 'Hora marcada passou com o serviço desligado; não foi executada com atraso.' };
  if (running && routine.overlap === 'skip_if_running') return { action: 'skip', slot, reason: 'A execução anterior ainda estava em andamento.' };
  return { action: 'fire', slot };
}

export class Routines {
  // launch(routine, slotKey) cria a tarefa ou o fluxo e devolve { taskId } ou { flowId }. A idempotência vem do requestId.
  constructor(store, launch, { intervalMs = 20000, now = () => new Date(), debounceMs = 4000, cooldownMs = 60000 } = {}) { Object.assign(this, { store, launch, intervalMs, now, debounceMs, cooldownMs }); this.timer = null; this.watchers = new Map(); }
  start() { this.sync(); this.timer = setInterval(() => { try { this.tick(); this.sync(); } catch {} }, this.intervalMs); this.timer.unref?.(); }
  stop() { clearInterval(this.timer); for (const w of this.watchers.values()) w.close(); this.watchers.clear(); }
  // Observa a pasta do projeto de cada rotina ativa com gatilho por arquivo. Só reage a arquivo NOVO que bate com a extensão,
  // ignora .git/node_modules/.data, não dispara enquanto a rotina ainda executa e respeita um intervalo mínimo entre disparos.
  sync() {
    const wanted = new Map();
    for (const r of this.store.list('routines')) if (r.status === 'active' && r.trigger.type === 'file') { const p = this.store.get('projects', r.projectId); if (p) wanted.set(r.id, { r, path: p.path }); }
    for (const [id, w] of this.watchers) if (!wanted.has(id) || wanted.get(id).path !== w.path) { w.close(); this.watchers.delete(id); }
    for (const [id, { path }] of wanted) if (!this.watchers.has(id)) this.watchers.set(id, this.watchFolder(id, path));
  }
  watchFolder(id, path) {
    let timer = null, last = 0, pending = null;
    const ignore = f => f.split(sep).some(seg => ['.git', 'node_modules', '.data'].includes(seg));
    let watcher = null;
    try {
      watcher = watch(path, { recursive: true }, (event, file) => {
        if (!file || event !== 'rename' || ignore(file)) return;
        const r = this.store.get('routines', id); if (!r || r.status !== 'active') return;
        if (r.trigger.ext && extname(file).toLowerCase() !== '.' + r.trigger.ext) return;
        try { if (!statSync(path + sep + file).isFile()) return; } catch { return; }      // removido ou renomeado para fora
        if (this.isRunning(r)) return;                                                     // os próprios arquivos da execução não disparam de novo
        pending = file; clearTimeout(timer);
        timer = setTimeout(() => {
          if (Date.now() - last < this.cooldownMs) return;
          const fresh = this.store.get('routines', id); if (!fresh || fresh.status !== 'active' || this.isRunning(fresh)) return;
          last = Date.now(); const when = this.now().toISOString();
          try { const out = this.launch(fresh, `file-${when}`); this.record(fresh, { slot: `file-${when}`, status: 'started', reason: `Novo arquivo: ${pending}`, ...out }); }
          catch (e) { this.record(fresh, { slot: `file-${when}`, status: 'failed_to_start', reason: e.message }); }
        }, this.debounceMs);
        timer.unref?.();
      });
      watcher.on('error', () => {});
    } catch { /* pasta indisponível: tenta de novo no próximo sync */ }
    return { path, close: () => { clearTimeout(timer); try { watcher?.close(); } catch {} } };
  }
  isRunning(r) { return this.store.list('tasks').some(t => t.requestId.startsWith(`routine:${r.id}:`) && ['queued', 'running', 'waiting_dependency', 'cancelling'].includes(t.status)); }
  record(r, entry) { r.history = [{ at: this.now().toISOString(), ...entry }, ...r.history].slice(0, 30); this.store.put('routines', r); }
  tick() {
    const when = this.now();
    for (const r of this.store.list('routines')) {
      const a = evaluate(r, when, { running: this.isRunning(r) }); if (!a) continue;
      r.lastSlot = a.slot;
      if (a.action === 'skip') { this.record(r, { slot: a.slot, status: 'skipped', reason: a.reason }); continue; }
      this.run(r, a.slot);
    }
  }
  run(r, slot) {
    const key = slot || `manual-${this.now().toISOString()}`;
    try { const out = this.launch(r, key); this.record(r, { slot: key, status: 'started', ...out }); return out; }
    catch (e) { this.record(r, { slot: key, status: 'failed_to_start', reason: e.message }); throw e; }
  }
  save(input) {
    const old = input.id ? this.store.get('routines', input.id) : null;
    if (input.id && !old) throw new Error('Rotina inexistente.');
    const r = validateRoutine(input, old);
    if ((r.deliver.telegram || r.deliver.email) && this.store.get('projects', r.projectId)?.area === 'Financeiro') throw new Error('Projetos financeiros não enviam resultados por Telegram ou e-mail.');
    const saved = this.store.put('routines', r); this.sync(); return saved;
  }
  setStatus(id, status) {
    const r = this.store.get('routines', id); if (!r) throw new Error('Rotina inexistente.');
    if (r.trigger.type === 'manual') throw new Error('Rotina manual não tem estado ativo/pausado.');
    r.status = status; const saved = this.store.put('routines', r); this.sync(); return saved;
  }
  remove(id) { if (!this.store.get('routines', id)) throw new Error('Rotina inexistente.'); this.store.remove('routines', id); this.sync(); }
}
