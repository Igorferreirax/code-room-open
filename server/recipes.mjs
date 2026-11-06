import { randomUUID } from 'node:crypto';
import { createTask } from './tasks.mjs';

// Receita = passos que se repetem. Cada passo é de um agente (vira tarefa normal) ou seu (você faz por fora e marca "concluí").
// Qualquer passo pode pedir a sua aprovação antes de começar. A execução de uma receita é um registro "recipeRuns" que anda um passo por vez.
export const KINDS = ['video', 'app', 'outro'];
const now = () => new Date().toISOString();
const text = (v, max, label, required = true) => {
  if (v == null || v === '') { if (required) throw new Error(`${label}: obrigatório.`); return ''; }
  if (typeof v !== 'string' || v.length > max) throw new Error(`${label}: texto de até ${max} caracteres.`);
  const t = v.trim(); if (required && !t) throw new Error(`${label}: obrigatório.`); return t;
};

export function cleanRecipe(store, b, old = null) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('Receita inválida.');
  const kind = KINDS.includes(b.kind) ? b.kind : 'outro';
  if (!Array.isArray(b.steps) || !b.steps.length || b.steps.length > 8) throw new Error('A receita precisa de 1 a 8 passos.');
  const projectId = b.projectId ? String(b.projectId) : '';
  if (projectId && !store.get('projects', projectId)) throw new Error('Projeto inexistente.');
  const steps = b.steps.map((s, i) => {
    const type = s?.type === 'manual' ? 'manual' : 'agent', title = text(s?.title, 100, `Passo ${i + 1}: título`);
    if (type === 'agent') {
      if (!projectId) throw new Error('Passos de agente precisam de um projeto na receita.');
      if (!store.get('agents', String(s.agentId))) throw new Error(`Passo ${i + 1}: escolha um agente.`);
    }
    return { type, title, agentId: type === 'agent' ? String(s.agentId) : null, prompt: text(s?.prompt, 5000, `Passo ${i + 1}: instrução`, type === 'agent'), approval: s?.approval === true || type === 'manual' };
  });
  return { id: old?.id || randomUUID(), name: text(b.name, 100, 'Nome'), kind, projectId, description: text(b.description, 500, 'Descrição', false), outside: text(b.outside, 500, 'Onde trabalho por fora', false), steps, createdAt: old?.createdAt || now(), updatedAt: now() };
}

export class Recipes {
  constructor(store, { pump = () => {} } = {}) {
    this.store = store; this.pump = pump;
    store.bus.on('record', (kind, id) => { if (kind === 'tasks') { try { this.onTask(store.get('tasks', id)); } catch (e) { console.error('Receita:', e.message); } } });
  }
  save(b) { const old = b.id ? this.store.get('recipes', b.id) : null; return this.store.put('recipes', cleanRecipe(this.store, b, old)); }
  remove(id) { this.store.remove('recipes', id); }
  start(id, b = {}) {
    const r = this.store.get('recipes', id); if (!r) throw new Error('Receita inexistente.');
    const objective = text(b.objective, 5000, 'O que esta rodada precisa entregar');
    const run = { id: randomUUID(), recipeId: r.id, name: r.name, kind: r.kind, projectId: r.projectId, objective, i: 0, status: 'running', steps: r.steps.map(s => ({ ...s, status: 'pending', taskId: null, result: null, approved: false })), createdAt: now(), updatedAt: now() };
    return this.advance(run);
  }
  save2(run) { run.updatedAt = now(); return this.store.put('recipeRuns', run); }
  // Anda até o próximo ponto em que precisa esperar (você ou um agente).
  advance(run) {
    const s = run.steps[run.i];
    if (!s) { run.status = 'done'; return this.save2(run); }
    if (s.approval && !s.approved) { s.status = 'waiting'; run.status = 'waiting'; return this.save2(run); }
    if (s.type === 'manual') { s.status = 'done'; run.i++; return this.advance(run); }
    const prev = run.steps.slice(0, run.i).reverse().find(x => x.taskId);
    const objective = `${s.prompt}\n\nObjetivo desta rodada: ${run.objective}${prev?.result ? `\n\nResultado do passo anterior (${prev.title}):\n${prev.result}` : ''}`;
    try {
      const { task } = createTask(this.store, { projectId: run.projectId, agentId: s.agentId, requestId: `recipe:${run.id}:${run.i}`, objective, handoffFrom: prev?.taskId || null });
      s.taskId = task.id; s.status = 'running'; run.status = 'running';
    } catch (e) { s.status = 'failed'; s.result = e.message; run.status = 'failed'; }
    this.save2(run); this.pump(); return run;
  }
  approve(runId) {
    const run = this.need(runId), s = run.steps[run.i];
    if (run.status !== 'waiting' || !s) throw new Error('Esta rodada não está esperando você.');
    s.approved = true; return this.advance(run);
  }
  cancel(runId) { const run = this.need(runId); if (['done', 'cancelled'].includes(run.status)) return run; run.status = 'cancelled'; return this.save2(run); }
  need(id) { const r = this.store.get('recipeRuns', id); if (!r) throw new Error('Rodada inexistente.'); return r; }
  onTask(task) {
    if (!task || !['completed', 'failed', 'cancelled'].includes(task.status)) return;
    const run = this.store.list('recipeRuns').find(r => !['done', 'cancelled'].includes(r.status) && r.steps[r.i]?.taskId === task.id);
    if (!run) return;
    const s = run.steps[run.i];
    if (task.status === 'completed') { s.status = 'done'; s.result = String(task.result?.summary ?? task.result?.text ?? (typeof task.result === 'string' ? task.result : '')).slice(0, 3000); run.i++; this.advance(run); }
    else { s.status = 'failed'; s.result = task.reason || task.error || `Tarefa ${task.status}.`; run.status = 'failed'; this.save2(run); }
  }
}
