import { readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Limpeza de dados antigos, SEMPRE com prévia antes de apagar. O que entra:
//  - tarefas internas do Assistente (cada pergunta vira uma tarefa) já terminadas e antigas;
//  - pacotes de atualização baixados há mais de 2 dias (sobram depois de instalar);
//  - a cópia da versão anterior ("<pasta>.anterior", usada para voltar atrás) com mais de 7 dias;
//  - avisos já vistos com mais de 30 dias.
// NÃO são tocados: entregas, projetos, tarefas dos seus projetos, conversas, agentes e a lixeira.
export const INTERNAL_PROJECT = 'assistant-internal';
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'blocked', 'interrupted', 'timeout']);
const DAY = 86400000;
export const UPDATE_FILES = /^(Code-Room-.+-portatil-win-x64\.zip(\.part)?|SHA256SUMS\.txt)$/;
export const UPDATES_MIN_AGE_MS = 2 * DAY, ANTERIOR_MIN_AGE_MS = 7 * DAY, NOTICES_MIN_AGE_MS = 30 * DAY;

export function retentionPlan(store, { days = 7, now = Date.now() } = {}) {
  const d = Math.min(365, Math.max(1, Math.floor(Number(days) || 7))), limit = now - d * DAY;
  const tasks = store.list('tasks').filter(t => t.project?.id === INTERNAL_PROJECT && TERMINAL.has(t.status) && Date.parse(t.updatedAt || t.createdAt || 0) < limit);
  const runs = tasks.flatMap(t => t.attempts || []);
  return { days: d, tasks: tasks.map(t => t.id), runs, counts: { tasks: tasks.length, runs: runs.length } };
}

export function retentionPurge(store, opts) {
  const plan = retentionPlan(store, opts);
  store.transaction(() => {
    for (const id of plan.runs) { store.removeEvents(id); store.remove('runs', id); }
    for (const id of plan.tasks) { store.removeEvents(id); store.remove('tasks', id); }
  });
  return plan.counts;
}

async function dirBytes(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += await dirBytes(p); else if (e.isFile()) n += (await stat(p).catch(() => null))?.size || 0;
  }
  return n;
}

async function scanUpdates(dataDir, now) {
  if (!dataDir) return [];
  const dir = join(dataDir, 'updates'), out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!e.isFile() || !UPDATE_FILES.test(e.name)) continue;
    const st = await stat(join(dir, e.name)).catch(() => null);
    if (st && now - st.mtimeMs > UPDATES_MIN_AGE_MS) out.push({ path: join(dir, e.name), bytes: st.size });
  }
  return out;
}

// A pasta anterior é movida (não copiada) pelo atualizador: a data de modificação continua a antiga, mas a de MUDANÇA (ctime) vira a do
// momento da troca. Usamos a de mudança, senão ofereceríamos apagar o backup logo depois de uma atualização.
async function scanAnterior(appDir, now) {
  if (!appDir) return null;
  const dir = String(appDir).replace(/[\\/]+$/, '') + '.anterior', st = await stat(dir).catch(() => null);
  if (!st?.isDirectory() || now - Math.max(st.ctimeMs, st.birthtimeMs || 0) <= ANTERIOR_MIN_AGE_MS) return null;
  return { path: dir, bytes: await dirBytes(dir) };
}

const oldNotices = (store, now) => store.list('notices').filter(n => n.seen && Date.parse(n.at || 0) < now - NOTICES_MIN_AGE_MS);

// Prévia: o que seria apagado, sem apagar nada. Não devolve caminhos do disco.
export async function retentionScan({ store, dataDir, appDir, days = 7, now = Date.now() }) {
  const a = retentionPlan(store, { days, now }), items = [];
  if (a.counts.tasks) items.push({ id: 'assistant', label: `Tarefas internas do Assistente com mais de ${a.days} dias`, count: a.counts.tasks, detail: `${a.counts.runs} tentativa${a.counts.runs === 1 ? '' : 's'}` });
  const up = await scanUpdates(dataDir, now);
  if (up.length) items.push({ id: 'updates', label: 'Pacotes de atualização já baixados', count: up.length, bytes: up.reduce((s, f) => s + f.bytes, 0) });
  const ant = await scanAnterior(appDir, now);
  if (ant) items.push({ id: 'anterior', label: 'Cópia da versão anterior (serve para voltar atrás)', count: 1, bytes: ant.bytes });
  const nt = oldNotices(store, now);
  if (nt.length) items.push({ id: 'notices', label: 'Avisos já vistos com mais de 30 dias', count: nt.length });
  return { days: a.days, counts: a.counts, items, totalBytes: items.reduce((s, i) => s + (i.bytes || 0), 0) };
}

// Apaga o que a prévia mostrou (recalcula na hora, então só apaga o que ainda vale).
export async function retentionClean({ store, dataDir, appDir, days = 7, now = Date.now() }) {
  const removed = { tasks: 0, runs: 0, files: 0, anterior: false, notices: 0 }; let freedBytes = 0;
  Object.assign(removed, retentionPurge(store, { days, now }));
  for (const f of await scanUpdates(dataDir, now)) { try { await rm(f.path, { force: true }); removed.files++; freedBytes += f.bytes; } catch {} }
  const ant = await scanAnterior(appDir, now);
  if (ant) { try { await rm(ant.path, { recursive: true, force: true }); removed.anterior = true; freedBytes += ant.bytes; } catch {} }
  for (const n of oldNotices(store, now)) { store.remove('notices', n.id); removed.notices++; }
  return { removed, freedBytes };
}
