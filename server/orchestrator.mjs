import { randomUUID, createHash } from 'node:crypto';
import { proposeSubtasks } from './subtasks.mjs';
import { createTask, transition } from './tasks.mjs';
import { emptyContext, mayShare } from './context.mjs';
import { planPrompt, parsePlan, validatePlan } from './supervisor.mjs';

const STOP_RE = /SEM PEND[ÊE]NCIAS|VEREDITO:\s*APROVADO/i, DEFAULT_HOPS = 3;
export const ROLES = ['desenvolvedor', 'revisor', 'editor', 'pesquisador', 'financeiro', 'operacoes', 'supervisor'];
const now = () => new Date().toISOString();
const verdictOf = text => { const all = [...String(text || '').matchAll(/\b(APROVADO|REPROVADO)\b/g)]; return all.length ? (all.at(-1)[1] === 'APROVADO' ? 'approved' : 'rejected') : 'unknown'; };

export class Orchestrator {
  constructor(store, { moduleAvailable = () => true, agentAvailable = () => true } = {}) { this.store = store; this.runner = null; this.moduleAvailable = moduleAvailable; this.agentAvailable = agentAvailable; }
  hooks() { return { handoffsFor: t => this.handoffsFor(t), onFinal: t => this.onFinal(t) }; }
  attach(runner) { this.runner = runner; }
  pump() { void this.runner?.pump(); }

  // ---------- equipes: papel separado de provedor, modelo, skills e permissões (que vivem no agente) ----------
  saveTeam(input) {
    const name = typeof input.name === 'string' && input.name.trim() && input.name.length <= 100 ? input.name.trim() : null;
    if (!name) throw new Error('Nome da equipe obrigatório.');
    if (!Array.isArray(input.members) || !input.members.length || input.members.length > 12) throw new Error('Informe de 1 a 12 membros.');
    const members = input.members.map(m => {
      if (!ROLES.includes(m.role)) throw new Error(`Papel inválido: ${m.role}. Use ${ROLES.join(', ')}.`);
      if (!this.store.get('agents', m.agentId)) throw new Error('Agente inexistente na equipe.');
      return { role: m.role, agentId: m.agentId };
    });
    const old = input.id ? this.store.get('teams', input.id) : null;
    if (input.id && !old) throw new Error('Equipe inexistente.');
    return this.store.put('teams', { id: old?.id || randomUUID(), name, members, revision: (old?.revision || 0) + 1 });
  }
  projectTeamIds(project) {
    const ids = Array.isArray(project.teamIds) ? project.teamIds : this.store.list('flows').filter(f => f.projectId === project.id && f.teamId).map(f => f.teamId);
    const known = new Set(this.store.list('teams').map(t => t.id));
    return new Set(ids.filter(id => known.has(id)));
  }

  // ---------- fluxo sequencial: desenvolvedor → revisor, com correção limitada ----------
  startSequential(input) {
    const requestId = String(input.requestId || '');
    if (!requestId) throw new Error('requestId obrigatório.');
    const existing = this.store.list('flows').find(f => f.requestId === requestId);
    if (existing) return { flow: existing, duplicate: true };
    const project = this.store.get('projects', input.projectId), team = this.store.get('teams', input.teamId);
    if (!project || !team) throw new Error('Escolha projeto e equipe.');
    const dev = team.members.find(m => m.role === 'desenvolvedor'), reviewer = team.members.find(m => m.role === 'revisor');
    if (!dev || !reviewer) throw new Error('A equipe precisa de um desenvolvedor e um revisor.');
    for (const m of [dev, reviewer]) if (!mayShare(project.area || 'Geral', this.store.get('agents', m.agentId).room)) throw new Error('Projeto financeiro: o agente não é do ambiente financeiro.');
    const common = { projectId: project.id, criteria: input.criteria || [], limits: input.limits };
    const flow = { id: randomUUID(), kind: 'sequential', requestId, projectId: project.id, teamId: team.id, objective: String(input.objective || '').trim(), criteria: common.criteria, round: 1, maxReviewRounds: Math.min(3, Math.max(1, Math.trunc(input.maxReviewRounds) || 1)), taskIds: [], status: 'running', verdict: null, createdAt: now() };
    if (!flow.objective) throw new Error('Objetivo obrigatório.');
    this.store.put('projects', { ...project, teamIds: [...new Set([...this.projectTeamIds(project), team.id])] });
    const t1 = createTask(this.store, { ...common, requestId: `${requestId}:dev:1`, agentId: dev.agentId, objective: flow.objective, inputs: input.inputs, flowId: flow.id, step: 'dev' }).task;
    const t2 = this.reviewTask(flow, t1, reviewer.agentId, 1);
    flow.taskIds = [t1.id, t2.id];
    this.store.put('flows', flow);
    this.pump();
    return { flow, duplicate: false };
  }
  reviewTask(flow, devTask, reviewerId, round) {
    return createTask(this.store, {
      projectId: flow.projectId, requestId: `${flow.requestId}:review:${round}`, agentId: reviewerId, dependsOn: [devTask.id], flowId: flow.id, step: 'review', handoffFrom: devTask.id, criteria: flow.criteria, limits: devTask.limits,
      objective: `Revise a entrega recebida (rodada ${round}). Leia os arquivos reais citados, confira cada critério de conclusão com evidência (arquivo e trecho) e liste problemas. Não modifique arquivos. Termine com uma linha "VEREDITO: APROVADO" ou "VEREDITO: REPROVADO".`
    }).task;
  }

  // ---------- passagem de contexto registrada e inspecionável ----------
  createHandoff({ from, to, type, summary, files }) {
    const dedupKey = `${from.flowId || from.id}:${from.id}->${to.id}`;
    const id = createHash('sha256').update(dedupKey).digest('hex').slice(0, 24);
    if (this.store.get('messages', id)) return this.store.get('messages', id);
    if (!mayShare(from.project.area, to.agent.room)) {
      const reason = 'Dados de projeto financeiro não são compartilhados automaticamente com agentes de outros ambientes.';
      this.store.event(to.id, { type: 'diagnostic', text: reason, at: now() });
      return { blocked: reason };
    }
    return this.store.put('messages', { id, flowId: from.flowId, fromTask: from.id, toTask: to.id, fromAgent: from.agent.name, toAgent: to.agent.name, type, objective: from.objective, criteria: from.criteria, summary: summary.slice(0, 3000), files, createdAt: now(), deliveredAt: null });
  }
  handoffsFor(task) {
    const out = [];
    for (const m of this.store.list('messages').filter(m => m.toTask === task.id)) {
      m.deliveredAt ||= now(); this.store.put('messages', m); out.push(m);
    }
    return out;
  }

  attemptAnswer(task) { return task.result?.attemptId ? this.store.get('runs', task.result.attemptId)?.answer || '' : ''; }

  onFinal(task) {
    if (task.status === 'completed' && task.kind === 'work' && !task.batchId) { try { this.social?.proposePosts(task, this.attemptAnswer(task)).catch(() => {}); } catch {} }   // propostas de postagem do agente (+conta): só viram post se a pessoa aprovar
    if (task.status === 'completed' && task.kind === 'work' && !task.batchId) { try { proposeSubtasks(this.store, task, this.attemptAnswer(task)); } catch {} }   // pedidos de ajuda entre agentes: só viram tarefa se a pessoa aprovar
    if (task.batchId) { try { this.batches?.onFinal(task); } catch (e) { this.store.event(task.id, { type: 'diagnostic', text: `Falha no lote: ${e.message}`, at: new Date().toISOString() }); } return; }
    if (task.status === 'completed' && task.kind === 'work' && (task.step !== 'review' || task.result.deliverables.files.length)) this.recordDeliverable(task);
    if (task.kind === 'plan') return this.onPlanFinished(task);
    if (!task.flowId && String(task.requestId || '').startsWith('routine:') && ['completed', 'failed', 'blocked', 'interrupted'].includes(task.status)) { try { this.routineDone?.({ requestId: task.requestId, status: task.status, text: task.status === 'completed' ? this.attemptAnswer(task) || task.result?.summary : task.reason || task.result?.summary, project: task.project }); } catch {} }
    if (!task.flowId) return this.forwardLinks(task);
    const flow = this.store.get('flows', task.flowId); if (!flow) return;
    if (task.status === 'completed') {
      for (const next of this.store.list('tasks').filter(t => t.handoffFrom === task.id || t.handoffFromAll?.includes(task.id))) {
        const handoff = this.createHandoff({ from: task, to: next, type: task.step === 'review' ? 'revisao' : 'entrega', summary: task.step === 'review' ? this.attemptAnswer(task) : task.result.summary, files: (task.result.deliverables.files || []).filter(f => f.change !== 'deleted') });
        if (handoff.blocked) transition(this.store, next, 'blocked', { reason: handoff.blocked });
      }
      if (flow.kind === 'sequential' && task.step === 'review') this.afterReview(flow, task);
    }
    const f = this.refreshFlow(flow.id);
    if (f.status !== 'running' && String(f.requestId || '').startsWith('routine:') && !f.notifiedAt) {   // rotina com equipe: avisa uma vez, com a última entrega do desenvolvedor
      f.notifiedAt = now(); this.store.put('flows', f);
      const dev = f.taskIds.map(id => this.store.get('tasks', id)).filter(t => t?.status === 'completed' && t.step !== 'review').at(-1);
      try { this.routineDone?.({ requestId: f.requestId, status: f.status, text: dev ? this.attemptAnswer(dev) || dev.result?.summary : '', project: task.project }); } catch {}
    }
  }

  // ---------- ligações entre agentes (Canvas): o trabalho concluído de A vira tarefa de B, com resumo e arquivos ----------
  // Só para tarefas avulsas (fluxos de equipe têm o próprio encadeamento). Limites: repasses máximos por ligação (padrão 3) e parada
  // quando o agente escreve "SEM PENDÊNCIAS" ou "VEREDITO: APROVADO". Com ligações A→B e B→A eles se respondem até um dos limites.
  forwardLinks(task) {
    if (task.status !== 'completed' || task.kind !== 'work') return;
    const links = this.store.list('links').filter(l => l.enabled !== false && l.projectId === task.project.id && l.from === task.agent.id);
    if (!links.length) return;
    const answer = this.attemptAnswer(task) || task.result?.summary || '';
    // Ligação com condição: "sempre" (padrão) para quando o agente diz SEM PENDÊNCIAS; "aprovado" só segue se o resultado for APROVADO; "reprovado" só se for REPROVADO.
    const stop = STOP_RE.test(answer), verdict = verdictOf(answer);
    if (stop && !links.some(l => l.when === 'approved')) { this.store.event(task.id, { type: 'diagnostic', text: 'Cadeia encerrada: o agente sinalizou que não há pendências.', at: now() }); return; }
    const hops = (task.hops || 0) + 1, files = (task.result?.deliverables?.files || []).filter(f => f.change !== 'deleted');
    for (const l of links) {
      const max = l.maxHops || DEFAULT_HOPS, to = this.store.get('agents', l.to);
      if (!to) continue;
      const when = l.when || 'always', ok = when === 'approved' ? verdict === 'approved' : when === 'rejected' ? verdict === 'rejected' : !stop;
      if (!ok) { if (when !== 'always') this.store.event(task.id, { type: 'diagnostic', text: `Ligação para ${to.name} não seguiu: a condição “${when === 'approved' ? 'só se aprovado' : 'só se reprovado'}” não foi atendida (resultado: ${verdict === 'approved' ? 'aprovado' : verdict === 'rejected' ? 'reprovado' : 'sem veredito'}).`, at: now() }); continue; }
      if (hops > max) { this.store.event(task.id, { type: 'diagnostic', text: `Limite de ${max} repasse(s) atingido; a cadeia parou aqui para não gastar à toa.`, at: now() }); continue; }
      try {
        const root = task.rootObjective || task.objective;
        const next = createTask(this.store, { projectId: task.project.id, agentId: to.id, requestId: `link:${l.id}:${task.id}`, criteria: task.criteria, hops, linkFrom: task.id, handoffFrom: task.id, rootObjective: root,
          objective: `Você recebeu o trabalho de ${task.agent.name} (${task.agent.role}) por uma ligação entre agentes. Faça a sua parte como ${to.role}: leia o material recebido (resumo e arquivos), continue, revise ou responda. Se não houver mais nada a ajustar, termine com a linha "SEM PENDÊNCIAS".\nObjetivo original: ${root}` }).task;
        const h = this.createHandoff({ from: task, to: next, type: 'repasse', summary: answer, files });
        if (h.blocked) transition(this.store, next, 'blocked', { reason: h.blocked });
        else this.store.event(task.id, { type: 'diagnostic', text: `Repassado para ${to.name} (repasse ${hops} de ${max}).`, at: now() });
      } catch (e) { this.store.event(task.id, { type: 'diagnostic', text: `Não foi possível repassar a ${to.name}: ${e.message}`, at: now() }); }
    }
    this.pump();
  }
  // Rejeitado e ainda dentro do limite → uma nova rodada (correção + revisão). Fora do limite → fim, com o veredito registrado.
  afterReview(flow, review) {
    flow.verdict = verdictOf(this.attemptAnswer(review));
    if (flow.verdict === 'rejected' && flow.round < flow.maxReviewRounds) {
      const team = this.store.get('teams', flow.teamId);
      const dev = team.members.find(m => m.role === 'desenvolvedor'), reviewer = team.members.find(m => m.role === 'revisor');
      flow.round += 1;
      const fix = createTask(this.store, { projectId: flow.projectId, requestId: `${flow.requestId}:dev:${flow.round}`, agentId: dev.agentId, dependsOn: [review.id], flowId: flow.id, step: 'dev', handoffFrom: review.id, criteria: flow.criteria, objective: `Corrija a entrega conforme a revisão recebida (rodada ${flow.round}). Objetivo original: ${flow.objective}` }).task;
      const again = this.reviewTask(flow, fix, reviewer.agentId, flow.round);
      flow.taskIds.push(fix.id, again.id); flow.verdict = null;
    }
    this.store.put('flows', flow);
  }
  refreshFlow(id) {
    const flow = this.store.get('flows', id);
    const tasks = flow.taskIds.map(t => this.store.get('tasks', t));
    const s = tasks.map(t => t.status);
    flow.status = s.some(x => ['running', 'queued', 'waiting_dependency', 'cancelling', 'needs_decision'].includes(x)) ? 'running'
      : s.some(x => ['failed', 'blocked', 'interrupted'].includes(x)) ? 'failed' : s.includes('cancelled') ? 'cancelled' : 'completed';
    flow.updatedAt = now();
    this.store.put('flows', flow);
    return flow;
  }
  flowView(id) {
    const flow = this.store.get('flows', id); if (!flow) return null;
    const tasks = flow.taskIds.map(t => this.store.get('tasks', t));
    const isReview = t => t.step === 'review' || t.agent.capabilities?.includes('review');
    const review = [...tasks].reverse().find(t => isReview(t) && t.status === 'completed');
    // Entregas = arquivos criados/alterados por qualquer passo concluído; o mais recente de cada caminho prevalece.
    const files = new Map();
    for (const t of tasks) if (t.status === 'completed') for (const f of t.result?.deliverables?.files || []) if (f.change !== 'deleted') files.set(f.path, f);
    return {
      ...flow,
      steps: tasks.map(t => ({ taskId: t.id, step: t.step, agent: t.agent.name, status: t.status, reason: t.reason, durationMs: (t.currentAttemptId && this.store.get('runs', t.currentAttemptId)?.durationMs) ?? null, summary: t.result?.summary?.slice(0, 600) ?? null })),
      deliverables: [...files.values()],
      review: review ? { taskId: review.id, verdict: verdictOf(this.attemptAnswer(review)), report: this.attemptAnswer(review) } : null,
      messages: this.store.list('messages').filter(m => m.flowId === id)
    };
  }
  recordDeliverable(task) {
    if (task.project.id === 'assistant-internal') return;   // as respostas do Assistente não viram "entregas" (inflavam o prompt de cada pergunta)
    const ctx = this.store.get('contexts', task.project.id) || emptyContext(task.project.id);
    ctx.deliverables = [...ctx.deliverables, { taskId: task.id, agent: task.agent.name, summary: task.result.summary.slice(0, 400), files: (task.result.deliverables.files || []).map(f => f.path), at: now() }].slice(-20);
    this.store.put('contexts', ctx);
  }

  // ---------- supervisor: o modelo propõe; o backend valida e só então cria as tarefas ----------
  requestPlan({ projectId, supervisorId, request, requestId, autoAccept = false }) {
    const project = this.store.get('projects', projectId), sup = this.store.get('agents', supervisorId);
    if (!project || !sup) throw new Error('Escolha projeto e supervisor.');
    if (sup.mode !== 'read') throw new Error('O supervisor deve ser um agente somente leitura: ele propõe, não edita.');
    const existing = this.store.list('plans').find(p => p.requestId === requestId);
    if (existing) return { plan: existing, duplicate: true };
    const agents = this.planAgents(project);
    if (!agents.some(a => a.id === sup.id)) throw new Error('Traga o Supervisor para este projeto antes de pedir um plano.');
    const task = createTask(this.store, { projectId, requestId: `${requestId}:plan`, agentId: supervisorId, kind: 'plan', objective: planPrompt({ request, agents, project }), limits: { timeoutMs: 5 * 60 * 1000 } }).task;
    const plan = this.store.put('plans', { id: randomUUID(), requestId, taskId: task.id, projectId, supervisorId, request, autoAccept, status: 'planning', errors: [], plan: null, flowId: null, createdAt: now() });
    this.pump();
    return { plan, duplicate: false };
  }
  planAgentIds(project) {
    const ids = new Set(project.agentIds || []), teams = this.projectTeamIds(project);
    for (const t of this.store.list('teams')) if (teams.has(t.id)) for (const m of t.members || []) ids.add(m.agentId);
    for (const task of this.store.list('tasks')) if (task.project?.id === project.id && task.agent?.id) ids.add(task.agent.id);
    return ids;
  }
  planAgents(project) {
    const ids = this.planAgentIds(project);
    return this.store.list('agents').filter(a => ids.has(a.id) && this.agentAvailable(a) && mayShare(project.area || 'Geral', a.room));
  }
  onPlanFinished(task) {
    const rec = this.store.list('plans').find(p => p.taskId === task.id); if (!rec) return;
    if (task.status !== 'completed') { rec.status = 'failed'; rec.errors = [task.reason || `Tarefa do supervisor terminou como ${task.status}.`]; this.store.put('plans', rec); return; }
    const project = this.store.get('projects', rec.projectId);
    let checked;
    try { checked = validatePlan(parsePlan(this.attemptAnswer(task)), { agents: this.planAgents(project), project, available: c => this.moduleAvailable(c) }); }
    catch (e) { checked = { ok: false, errors: [e.message] }; }
    if (!checked.ok) { rec.status = 'rejected'; rec.errors = checked.errors; this.store.put('plans', rec); return; }
    rec.plan = checked.plan; rec.status = 'proposed'; this.store.put('plans', rec);
    if (rec.autoAccept) this.acceptPlan(rec.id);
  }
  acceptPlan(id) {
    const rec = this.store.get('plans', id);
    if (!rec) throw new Error('Plano não encontrado.');
    if (rec.status !== 'proposed') throw new Error(`O plano está ${rec.status}; só planos validados e propostos podem ser aceitos.`);
    const project = this.store.get('projects', rec.projectId); if (!project) throw new Error('O projeto do plano não existe mais.');
    const allowed = new Set(this.planAgents(project).map(a => a.id));
    if ((rec.plan?.steps || []).some(s => !allowed.has(s.agentId))) throw new Error('Um agente do plano não está mais ligado ou disponível neste projeto. Gere o plano de novo.');
    const flow = { id: randomUUID(), kind: 'supervised', requestId: `${rec.requestId}:flow`, projectId: rec.projectId, planId: rec.id, objective: rec.request, taskIds: [], status: 'running', verdict: null, createdAt: now() };
    const ids = new Map();
    for (const s of rec.plan.steps) {
      const t = createTask(this.store, { projectId: rec.projectId, requestId: `${rec.requestId}:step:${s.id}`, agentId: s.agentId, objective: s.objective, criteria: s.criteria, dependsOn: s.dependsOn.map(d => ids.get(d)), flowId: flow.id, step: s.id }).task;
      ids.set(s.id, t.id); flow.taskIds.push(t.id);
    }
    // Quem depende de uma entrega recebe o resumo e os arquivos dela.
    for (const s of rec.plan.steps) if (s.dependsOn.length) { const t = this.store.get('tasks', ids.get(s.id)); t.handoffFromAll = s.dependsOn.map(d => ids.get(d)); this.store.put('tasks', t); }
    this.store.put('flows', flow);
    Object.assign(rec, { status: 'accepted', flowId: flow.id }); this.store.put('plans', rec);
    this.pump();
    return { plan: rec, flow };
  }
}
