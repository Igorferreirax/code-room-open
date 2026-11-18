// Garante que apenas um processo do Code Room use a mesma pasta de dados ao mesmo tempo (evita duplicar tarefas, rotinas e claims no SQLite).
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function isProcessAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  if (n === process.pid) return true;
  try { process.kill(n, 0); return true; }
  catch (e) { return e?.code === 'EPERM'; }
}

export function acquireInstanceLock(dataDir, { port = 4780, pid = process.pid, aliveFn = isProcessAlive } = {}) {
  const file = join(dataDir, 'instance.lock');
  if (existsSync(file)) {
    try {
      const cur = JSON.parse(readFileSync(file, 'utf8'));
      if (cur?.pid && cur.pid !== pid && aliveFn(cur.pid)) {
        const err = new Error(`Outro Code Room já está aberto nesta pasta de dados (PID ${cur.pid}, porta ${cur.port || '?'}). Use a janela existente ou feche-o antes.`);
        err.code = 'EALREADY_RUNNING';
        err.holder = cur;
        throw err;
      }
    } catch (e) {
      if (e.code === 'EALREADY_RUNNING') throw e;
    }
  }
  const payload = { pid, port, startedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(payload), { mode: 0o600 });
  const release = () => {
    try {
      const cur = JSON.parse(readFileSync(file, 'utf8'));
      if (cur?.pid === pid) unlinkSync(file);
    } catch {}
  };
  return { file, release };
}
