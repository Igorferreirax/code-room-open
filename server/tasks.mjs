import { randomUUID } from 'node:crypto';
import { cleanModel, cleanEffort } from './effort.mjs';
import { isAbsolute, normalize } from 'node:path';
import { approvedExtraDir } from './external-access.mjs';

// Estados da tarefa lógica. A tentativa de execução (kind "runs") tem os seus próprios estados.
export const TRANSITIONS = {
  waiting_dependency: ['queued', 'blocked', 'cancelled'],
  queued: ['running', 'waiting_dependency', 'blocked', 'cancelled', 'failed'],
  running: ['completed', 'failed', 'cancelled', 'cancelling', 'interrupted', 'needs_decision'],
  cancelling: ['cancelled', 'failed'],
  needs_decision: ['queued', 'cancelled', 'failed'],
  interrupted: ['queued', 'cancelled'],
  failed: ['queued'],
  blocked: ['queued', 'waiting_dependency', 'cancelled'],
  completed: [],
  cancelled: []
};
export const ACTIVE = ['running', 'cancelling'];
export const FINAL_BAD = ['failed', 'cancelled', 'interrupted', 'blocked'];
export const DEFAULT_LIMITS = { timeoutMs: 20 * 60 * 1000, maxAttempts: 1, maxDelegations: 3 };
const now = () => new Date().toISOString();

export function transition(store, task, to, patch = {}) {
  if (!TRANSITIONS[task.status]?.includes(to)) throw new Error(`Transição inválida: ${task.status} → ${to}`);
  const from = task.status;
  Object.assign(task, patch, { status: to, updatedAt: now() });
  store.put('tasks', task);
  store.event(task.id, { type: 'task', from, to, reason: patch.reason ?? null, at: task.updatedAt });
  return task;
}

function str(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}: texto obrigatório (até ${max} caracteres).`);
  return value.trim();
}

// Referências de entrada são relativas à pasta do projeto; caminhos absolutos ou com ".." são recusados.
export function cleanInputs(inputs = []) {
  if (!Array.isArray(inputs) || inputs.length > 30) throw new Error('Entradas: até 30 referências.');
  return inputs.map(i => {
    const path = typeof i === 'string' ? i : i?.path;
    if (typeof path !== 'string' || !path || path.length > 500) throw new Error('Entrada inválida.');
    const n = normalize(path);
    if (isAbsolute(n) || n.startsWith('..') || n.includes(':')) throw new Error(`Entrada fora do projeto: ${path}`);
    return { path: n.replace(/\\/g, '/') };
  });
}

export function cleanLimits(limits = {}, settings = null) {
  const clamp = (v, lo, hi, d) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.trunc(v))) : d;
  return {
    timeoutMs: clamp(limits.timeoutMs, 1000, 60 * 60 * 1000, settings?.timeoutMs ?? DEFAULT_LIMITS.timeoutMs),
    maxAttempts: clamp(limits.maxAttempts, 1, 3, DEFAULT_LIMITS.maxAttempts),
    maxDelegations: clamp(limits.maxDelegations, 0, 5, DEFAULT_LIMITS.maxDelegations)
  };
}

export function dependencyState(store, task) {
  const deps = (task.dependsOn || []).map(id => store.get('tasks', id));
  const index = deps.findIndex(d => !d || FINAL_BAD.includes(d.status));
  if (index >= 0) {
    const bad = deps[index];
    return { status: 'blocked', reason: bad ? `Dependência ${bad.id} está ${bad.status}.` : `Dependência ${task.dependsOn[index]} inexistente.` };
  }
  if (deps.every(d => d.status === 'completed')) return { status: 'queued' };
  return { status: 'waiting_dependency' };
}

export function createTask(store, input) {
  const requestId = str(input.requestId, 100, 'requestId');
  const previous = store.list('tasks').find(t => t.requestId === requestId);
  if (previous) return { task: previous, duplicate: true };
  const project = store.get('projects', input.projectId), agent = store.get('agents', input.agentId);
  if (!project || !agent) throw new Error('Escolha projeto e agente.');
  if (agent.browser && agent.browser !== 'off' && project.area === 'Financeiro') throw new Error('Projeto financeiro: agentes com navegador não são permitidos (uma página poderia mandar ordens ao agente e levar os dados).');
  if (agent.web && project.area === 'Financeiro') throw new Error('Projeto financeiro: agentes com pesquisa na web não são permitidos.');
  if ((agent.mcpTools || []).length && project.area === 'Financeiro') throw new Error('Projeto financeiro: agentes com ferramentas MCP externas não são permitidos.');
  if (agent.provider === 'agy' && project.area === 'Financeiro') throw new Error('Projeto financeiro: o Antigravity pesquisa na web por conta própria e isso não pode ser desligado. Use um agente do Codex ou do Claude Code neste projeto.');
  if (['hermes'].includes(agent.provider) && project.area === 'Financeiro') throw new Error('Projeto financeiro: dados financeiros não são enviados a um provedor remoto (Hermes).');
  if (input.extraDir && (input.isolate || !['codex', 'claude', 'agy'].includes(agent.provider))) throw new Error('Pasta extra só pode ser autorizada para Codex, Claude Code ou Antigravity, sem worktree.');
  const extraDir = input.extraDir ? approvedExtraDir(input.extraDir, project) : null;
  // Valide os ajustes da missão antes de avançar o contador ou gravar qualquer registro.
  const missionModel = input.model ? cleanModel(input.model) : agent.model;
  const missionEffort = input.effort ? cleanEffort(agent.provider, input.effort) : agent.effort;
  const dependsOn = [...new Set(input.dependsOn || [])];
  for (const id of dependsOn) {
    const dep = store.get('tasks', id);
    if (!dep) throw new Error(`Dependência inexistente: ${id}`);
    if (dep.project.id !== project.id) throw new Error('Dependência de outro projeto não é permitida.');
  }
  // Continuação de conversa: só retoma a sessão se for o MESMO provedor e o MESMO projeto; senão a tarefa começa limpa (e recebe resumo por passagem de contexto).
  let resume = null;
  if (input.resumeFrom) {
    const src = store.get('tasks', input.resumeFrom);
    if (src && src.project.id === project.id && src.agent.provider === agent.provider) {
      const att = [...(src.attempts || [])].reverse().map(id => store.get('runs', id)).find(a => a?.sessionId);
      if (att) resume = { fromTask: src.id, sessionId: att.sessionId };
    }
  }
  let depth = 0;
  if (input.parentTaskId) {
    const parent = store.get('tasks', input.parentTaskId);
    if (!parent) throw new Error('Tarefa original inexistente.');
    if (parent.project.id !== project.id) throw new Error('Subtarefa de outro projeto não é permitida.');
    depth = (parent.depth || 0) + 1;
    if (depth > 2) throw new Error('Limite de profundidade de delegação atingido.');
    const children = store.list('tasks').filter(t => t.parentTaskId === parent.id).length;
    if (children >= (parent.limits?.maxDelegations ?? DEFAULT_LIMITS.maxDelegations)) throw new Error('Limite de pedidos de ajuda desta tarefa atingido.');
  }
  const queued = store.list('tasks').filter(t => ['queued', 'waiting_dependency'].includes(t.status)).length;
  if (queued >= 50) throw new Error('Fila cheia. Aguarde ou cancele tarefas.');
  const counter = store.get('settings', 'counter') || { id: 'counter', n: 0 };
  store.put('settings', { ...counter, n: counter.n + 1 });
  const task = {
    id: input.id || randomUUID(), order: counter.n + 1, requestId, kind: input.kind === 'plan' ? 'plan' : 'work',
    project: { id: project.id, name: project.name, path: project.path, area: project.area || 'Geral' },
    agent: { ...agent, model: missionModel, effort: missionEffort }, environment: agent.room || 'Geral',
    objective: str(input.objective ?? input.prompt, 30000, 'Objetivo'),
    criteria: (input.criteria || []).map(c => str(c, 500, 'Critério')).slice(0, 12),
    inputs: cleanInputs(input.inputs), dependsOn, limits: cleanLimits(input.limits, store.get('settings', 'limits')),
    parentTaskId: input.parentTaskId || null, depth, flowId: input.flowId || null, step: input.step || null,
    handoffFrom: input.handoffFrom || null, isolate: input.isolate === true, resume, extraDir,
    hops: Number.isInteger(input.hops) ? input.hops : 0, linkFrom: input.linkFrom || null, rootObjective: typeof input.rootObjective === 'string' ? input.rootObjective.slice(0, 2000) : null,
    extraSkillIds: Array.isArray(input.skillIds) ? [...new Set(input.skillIds.filter(s => typeof s === 'string' && /^[a-f0-9]{24}$/.test(s)))].slice(0, 8) : [],
    attempts: [], attemptCount: 0, result: null, reason: null, createdAt: now(), updatedAt: now()
  };
  Object.assign(task, { status: 'queued', ...dependencyState(store, { dependsOn }) });
  store.put('tasks', task);
  store.event(task.id, { type: 'task', from: null, to: task.status, reason: task.reason ?? null, at: task.createdAt });
  return { task, duplicate: false };
}

// Chamado quando uma tarefa chega a um estado final: libera ou bloqueia as dependentes.
export function settleDependents(store, taskId) {
  const changed = [];
  for (const t of store.list('tasks')) {
    if (!t.dependsOn?.includes(taskId) || !['waiting_dependency', 'queued'].includes(t.status)) continue;
    const next = dependencyState(store, t);
    if (next.status !== t.status) { transition(store, t, next.status, { reason: next.reason ?? null }); changed.push(t.id); }
  }
  return changed;
}

export function retryTask(store, id) {
  const task = store.get('tasks', id);
  if (!task) throw new Error('Tarefa não encontrada.');
  if (task.attemptCount >= task.limits.maxAttempts) throw new Error(`Limite de ${task.limits.maxAttempts} tentativa(s) atingido.`);
  // Nova tentativa depois de falha começa limpa: uma sessão que falhou pode estar incompleta ou inexistente.
  const queued = transition(store, task, 'queued', { reason: null, error: null, resume: null });
  // Quem ficou bloqueado só porque esta tarefa tinha falhado ou sido interrompida volta a esperar por ela.
  for (const d of store.list('tasks')) if (d.dependsOn?.includes(id) && d.status === 'blocked') transition(store, d, 'waiting_dependency', { reason: null });
  return queued;
}
