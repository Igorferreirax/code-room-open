import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Versão 1: records + events. Versão 2: event_id para deduplicação e claims com heartbeat.
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS records(kind TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(kind,id));
   CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, body TEXT NOT NULL);`,
  `ALTER TABLE events ADD COLUMN event_id TEXT;
   CREATE UNIQUE INDEX IF NOT EXISTS events_dedup ON events(run,event_id) WHERE event_id IS NOT NULL;
   CREATE INDEX IF NOT EXISTS events_run ON events(run,seq);
   CREATE TABLE IF NOT EXISTS claims(task_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, executor_id TEXT NOT NULL, heartbeat INTEGER NOT NULL);`
];

const TRACKED = new Set(['projects', 'agents', 'teams', 'plans', 'flows', 'contexts', 'links']);

export class Store {
  constructor(file) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.bus = new EventEmitter();
    this.bus.setMaxListeners(50);
    this.db.exec('PRAGMA journal_mode=WAL;');
    let version = this.db.prepare('PRAGMA user_version').get().user_version;
    for (; version < MIGRATIONS.length; version++) {
      this.db.exec(`BEGIN IMMEDIATE; ${MIGRATIONS[version]} PRAGMA user_version=${version + 1}; COMMIT;`);
    }
  }
  list(kind) { return this.db.prepare('SELECT body FROM records WHERE kind=?').all(kind).map(r => JSON.parse(r.body)); }
  get(kind, id) { if (typeof id !== 'string') return null; const r = this.db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind, id); return r ? JSON.parse(r.body) : null; }
  // Mudanças em cadastros viram evento: o painel reage mesmo quando o cadastro é feito por outro cliente.
  put(kind, value) {
    this.db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?)').run(kind, value.id, JSON.stringify(value));
    this.bus.emit('record', kind, value.id);
    if (TRACKED.has(kind)) this.event('_records', { type: 'record', kind, id: value.id, at: new Date().toISOString() });
    return value;
  }
  remove(kind, id) { this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  // Retorna o seq, ou null quando o eventId já existia para esta execução (mensagem duplicada).
  event(run, value) {
    const { eventId = null, ...body } = value;
    const result = this.db.prepare('INSERT OR IGNORE INTO events(run,body,event_id) VALUES(?,?,?)').run(run, JSON.stringify(body), eventId);
    if (!result.changes) return null;
    const seq = Number(result.lastInsertRowid);
    this.db.prepare('DELETE FROM events WHERE run=? AND seq NOT IN (SELECT seq FROM events WHERE run=? ORDER BY seq DESC LIMIT 1000)').run(run, run);
    this.bus.emit('event', { seq, run, type: body.type });
    return seq;
  }
  events(run) { return this.db.prepare('SELECT seq,body FROM events WHERE run=? ORDER BY seq DESC LIMIT 300').all(run).reverse().map(r => ({ seq: r.seq, ...JSON.parse(r.body) })); }
  eventsSince(seq, limit = 500) { return this.db.prepare('SELECT seq,run,body FROM events WHERE seq>? ORDER BY seq LIMIT ?').all(seq, limit).map(r => ({ seq: r.seq, run: r.run, type: JSON.parse(r.body).type })); }
  lastSeq() { return Number(this.db.prepare('SELECT COALESCE(MAX(seq),0) AS n FROM events').get().n); }
  // Claim atômico: a chave primária garante um único responsável por tarefa.
  claim(taskId, attemptId, executorId) {
    return this.db.prepare('INSERT OR IGNORE INTO claims VALUES(?,?,?,?)').run(taskId, attemptId, executorId, Date.now()).changes === 1;
  }
  release(taskId) { this.db.prepare('DELETE FROM claims WHERE task_id=?').run(taskId); }
  heartbeat(executorId) { this.db.prepare('UPDATE claims SET heartbeat=? WHERE executor_id=?').run(Date.now(), executorId); }
  claims() { return this.db.prepare('SELECT task_id AS taskId, attempt_id AS attemptId, executor_id AS executorId, heartbeat FROM claims').all(); }
  close() { this.db.close(); }
}
