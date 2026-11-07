// Limpeza de dados antigos, com prévia. Por enquanto só as tarefas internas do Assistente (cada pergunta vira uma tarefa) já terminadas e antigas.
// Entregas aprovadas, tarefas dos seus projetos, conversas e a lixeira NÃO são tocadas.
export const INTERNAL_PROJECT = 'assistant-internal';
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'blocked', 'interrupted', 'timeout']);

export function retentionPlan(store, { days = 7, now = Date.now() } = {}) {
  const d = Math.min(365, Math.max(1, Math.floor(Number(days) || 7))), limit = now - d * 86400000;
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
