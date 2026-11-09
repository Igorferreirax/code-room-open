import { createHash } from 'node:crypto';
import { createTask } from './tasks.mjs';

// Agente pede ajuda a outro agente — SEMPRE com a sua aprovação. O agente termina a resposta com um bloco:
//   ```code-room-subtask
//   {"agente": "Nome exato do agente", "objetivo": "o que o outro deve fazer"}
//   ```
// O Code Room valida (agente existe, é outro agente, mesmo projeto, objetivo razoável) e cria um PEDIDO. Nada roda até a pessoa aprovar.
// Ao aprovar, nasce uma tarefa filha (parentTaskId): limites de profundidade e de pedidos por tarefa já valem no createTask.
export const MAX_PER_TASK = 3, MAX_OPEN = 20;
const BLOCK = /```code-room-subtask[^\n]*\n([\s\S]*?)```/g;

export function parseSubtasks(answer) {
  const out = [];
  for (const m of String(answer || '').matchAll(BLOCK)) {
    if (out.length >= MAX_PER_TASK) break;
    try { const j = JSON.parse(m[1].replace(/^﻿/, '')); if (j && typeof j === 'object' && !Array.isArray(j)) out.push({ agente: String(j.agente ?? '').trim().slice(0, 100), objetivo: String(j.objetivo ?? '').trim() }); } catch {}
  }
  return out;
}

const lc = s => String(s ?? '').trim().toLowerCase();
// Cria pedidos "proposed" a partir da resposta de uma tarefa concluída. Devolve os pedidos criados (nunca lança).
export function proposeSubtasks(store, task, answer) {
  const made = [];
  try {
    if (!task || task.status !== 'completed' || task.kind !== 'work' || task.project?.id === 'assistant-internal') return made;
    const open = store.list('subtasks').filter(s => s.status === 'proposed');
    for (const raw of parseSubtasks(answer)) {
      if (open.length + made.length >= MAX_OPEN) break;
      const obj = raw.objetivo; if (!obj || obj.length > 3000) continue;
      const hit = store.list('agents').filter(a => !a.internal && lc(a.name) === lc(raw.agente)); if (hit.length !== 1) continue;
      const ag = hit[0]; if (ag.id === task.agent.id) continue;
      const id = 'st' + createHash('sha1').update(`${task.id}|${ag.id}|${obj}`).digest('hex').slice(0, 14);
      if (store.get('subtasks', id)) continue;
      made.push(store.put('subtasks', { id, parentTaskId: task.id, projectId: task.project.id, projectName: task.project.name, fromAgent: task.agent.name, agentId: ag.id, agentName: ag.name, objective: obj, status: 'proposed', at: new Date().toISOString() }));
    }
  } catch {}
  return made;
}

// Aprova: cria a tarefa filha, com o resumo e os arquivos do pai (passagem registrada). Erros (limite, agente apagado…) mantêm o pedido aberto.
export function approveSubtask(store, orchestrator, id) {
  const s = store.get('subtasks', id); if (!s) throw new Error('Pedido não encontrado.'); if (s.status !== 'proposed') throw new Error('Este pedido já foi tratado.');
  const parent = store.get('tasks', s.parentTaskId); if (!parent) throw new Error('A tarefa original não existe mais.');
  if (!store.get('agents', s.agentId)) throw new Error('O agente pedido não existe mais.');
  const { task } = createTask(store, { projectId: s.projectId, agentId: s.agentId, requestId: `sub:${s.id}`, parentTaskId: parent.id, rootObjective: parent.rootObjective || parent.objective,
    objective: `${s.fromAgent} pediu a sua ajuda durante a tarefa dele. Faça só a sua parte e responda de forma objetiva.\n\nPedido: ${s.objective}\n\nTarefa original de ${s.fromAgent}: ${String(parent.objective).slice(0, 600)}` });
  try { const files = (parent.result?.deliverables?.files || []).filter(f => f.change !== 'deleted'), summary = (orchestrator.attemptAnswer?.(parent) || parent.result?.summary || '').slice(0, 4000);
    const h = orchestrator.createHandoff({ from: parent, to: task, type: 'repasse', summary, files }); if (h.blocked) store.event(task.id, { type: 'diagnostic', text: `Passagem de contexto bloqueada: ${h.blocked}`, at: new Date().toISOString() }); } catch {}
  store.put('subtasks', { ...s, status: 'approved', taskId: task.id, decidedAt: new Date().toISOString() });
  return task;
}
export function dismissSubtask(store, id) {
  const s = store.get('subtasks', id); if (!s) throw new Error('Pedido não encontrado.'); if (s.status !== 'proposed') throw new Error('Este pedido já foi tratado.');
  return store.put('subtasks', { ...s, status: 'dismissed', decidedAt: new Date().toISOString() });
}
