import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { sep } from 'node:path';
import { command, normalize, classifyFailure, labelUsage } from './connectors.mjs';
import { scanSkills } from './skills.mjs';
import { transition, settleDependents } from './tasks.mjs';
import { snapshot, diffSnapshots } from './deliverables.mjs';
import { killTree, alive, processIdentity } from './procs.mjs';
import { buildPrompt, emptyContext } from './context.mjs';
import { createWorktree } from './worktree.mjs';
import { claudeFromEvent } from './usage.mjs';
import { browserNote } from './browseruse.mjs';

export const DEFAULT_CONCURRENCY = { global: 1, provider: { codex: 1, claude: 1, agy: 1, hermes: 1 }, video: 1 };
const overlap = (a, b) => a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
const now = () => new Date().toISOString();
const fail = (failureKind, message) => Object.assign(new Error(message), { failureKind });

export class Runner {
  // hooks.handoffsFor(task) → mensagens de passagem; hooks.onFinal(task) → orquestração depois do estado final.
  constructor(store, { launch = spawn, buildCommand = command, executorId = `exec-${randomUUID().slice(0, 8)}`, extraEnv = {}, heartbeatMs = 5000, staleMs = 30000, cancelDeadlineMs = 10000, hooks = {}, worktreeDir = null } = {}) {
    Object.assign(this, { store, launch, buildCommand, executorId, extraEnv, heartbeatMs, staleMs, cancelDeadlineMs, hooks, worktreeDir });
    this.active = new Map(); this.pumping = false; this.again = false; this.timer = null;
  }
  async start() {
    await this.recover({ force: true });
    this.timer = setInterval(() => { this.store.heartbeat(this.executorId); this.recover({ force: false }).catch(() => {}); }, this.heartbeatMs);
    this.timer.unref?.();
    return this.pump();
  }
  stop() { clearInterval(this.timer); }

  concurrency() { return { ...DEFAULT_CONCURRENCY, ...(this.store.get('settings', 'concurrency') || {}), provider: { ...DEFAULT_CONCURRENCY.provider, ...(this.store.get('settings', 'concurrency')?.provider || {}) } }; }
  paused() { return !!this.store.get('settings', 'queue')?.paused; }
  // Orçamento local sobre o custo REPORTADO pelos provedores (referência de API, não é fatura): não garante teto de cobrança externa.
  budget() {
    const l = this.store.get('settings', 'limits') || {}, since = Date.now() - (l.budgetDays || 30) * 86400000;
    const spent = this.store.list('tasks').filter(t => t.usage?.cost != null && Date.parse(t.updatedAt) >= since).reduce((n, t) => n + t.usage.cost, 0);
    return { enabled: !!l.budgetEnabled, usd: l.budgetUsd ?? null, days: l.budgetDays || 30, spentUsd: spent, reached: !!l.budgetEnabled && l.budgetUsd != null && spent >= l.budgetUsd };
  }
  event(id, event) { return this.store.event(id, { ...event, text: event.text?.slice(0, 24000), at: now() }); }

  // Executor perdido: claim de outro executor com heartbeat vencido (ou qualquer claim antigo na partida, quando "force").
  async recover({ force }) {
    for (const claim of this.store.claims()) {
      if (claim.executorId === this.executorId) continue;
      if (!force && Date.now() - claim.heartbeat < this.staleMs) continue;
      await this.recoverClaim(claim);
    }
    for (const t of this.store.list('tasks')) {
      if (['running', 'cancelling'].includes(t.status) && !this.active.has(t.id) && !this.store.claims().some(c => c.taskId === t.id)) {
        transition(this.store, t, 'interrupted', { reason: 'Executor perdido: nenhuma execução responsável por esta tarefa.' });
        settleDependents(this.store, t.id); this.hooks.onFinal?.(t);
      }
    }
  }
  async recoverClaim(claim) {
    const attempt = this.store.get('runs', claim.attemptId), task = this.store.get('tasks', claim.taskId);
    let orphan = null;
    // Só encerra um processo órfão se o PID ainda for o mesmo que iniciamos (nome e hora de criação conferem).
    if (attempt?.pid && alive(attempt.pid)) {
      const id = await processIdentity(attempt.pid);
      const created = id?.createdAt ? Date.parse(id.createdAt) : NaN;
      if (id && Math.abs(created - attempt.spawnedAt) < 15000) orphan = { pid: attempt.pid, ...(await killTree(attempt.pid, { deadlineMs: this.cancelDeadlineMs })) };
      else orphan = { pid: attempt.pid, skipped: 'PID reaproveitado por outro processo; nada foi encerrado.' };
    }
    const reason = 'Serviço reiniciado durante a execução. Os efeitos no projeto são incertos: confira os arquivos antes de repetir.';
    if (attempt && ['running', 'starting'].includes(attempt.status)) {
      Object.assign(attempt, { status: 'interrupted', endedAt: now(), failureKind: 'interrupted', error: reason, orphan });
      this.store.put('runs', attempt); this.event(attempt.id, { type: 'status', text: 'interrupted', orphan });
    }
    this.store.release(claim.taskId);
    if (task && ['running', 'cancelling'].includes(task.status)) {
      transition(this.store, task, 'interrupted', { reason });
      settleDependents(this.store, task.id); this.hooks.onFinal?.(task);
    }
  }

  canStart(task, limits) {
    const entries = [...this.active.values()];
    if (entries.length >= limits.global) return false;
    const provider = task.agent.provider;
    if (entries.filter(e => e.task.agent.provider === provider).length >= (limits.provider[provider] ?? 1)) return false;
    const writer = task.agent.mode === 'write';
    // Tarefa isolada em worktree trabalha numa cópia própria: não trava nem é travada pela pasta do projeto.
    if (!task.isolate) for (const e of entries) if (!e.task.isolate && overlap(e.task.project.path, task.project.path) && (writer || e.task.agent.mode === 'write')) return false;
    if (task.agent.capabilities?.includes('video.render') && entries.filter(e => e.task.agent.capabilities?.includes('video.render')).length >= limits.video) return false;
    return true;
  }
  async pump() {
    if (this.pumping) { this.again = true; return; }
    this.pumping = true;
    try {
      do {
        this.again = false;
        if (this.paused() || this.budget().reached) break;
        const limits = this.concurrency();
        const queued = this.store.list('tasks').filter(t => t.status === 'queued').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
        for (const t of queued) if (this.canStart(t, limits)) this.begin(t);
      } while (this.again);
    } finally { this.pumping = false; }
  }

  // Parte síncrona: claim, tentativa e estado "running" ficam registrados antes de qualquer espera.
  begin(task) {
    const attempt = { id: randomUUID(), taskId: task.id, n: task.attemptCount + 1, status: 'starting', executorId: this.executorId, provider: task.agent.provider, modelRequested: task.agent.model || null, modelReported: null, sessionId: null, pid: null, spawnedAt: null, startedAt: now(), endedAt: null, durationMs: null, exitCode: null, failureKind: null, error: null, answer: '', usage: null };
    if (!this.store.claim(task.id, attempt.id, this.executorId)) return;
    this.store.put('runs', attempt);
    transition(this.store, task, 'running', { attempts: [...task.attempts, attempt.id], attemptCount: attempt.n, currentAttemptId: attempt.id, reason: null, error: null });
    const entry = { task, attempt, child: null, cancelled: false, timedOut: false, timer: null, killed: null };
    this.active.set(task.id, entry);
    this.execute(entry).catch(e => this.settle(entry, { error: e }));
  }
  save(attempt) { this.store.put('runs', attempt); }

  async execute(entry) {
    const { task, attempt } = entry;
    let root;
    try { root = await realpath(task.project.path); } catch { throw fail('invalid_directory', 'A pasta do projeto não existe ou não está acessível.'); }
    if (root !== task.project.path) throw fail('invalid_directory', 'O caminho do projeto mudou. Cadastre-o novamente antes de executar.');
    const agent = task.agent;
    if (task.isolate) {
      if (!this.worktreeDir) throw fail('worktree_unavailable', 'Isolamento por worktree não está configurado neste executor.');
      const wt = await createWorktree(root, task.id, this.worktreeDir);
      entry.isolation = { branch: wt.branch, worktree: wt.worktree, repo: wt.repo };
      this.event(attempt.id, { type: 'diagnostic', text: `Executando em worktree isolado, branch ${wt.branch}. Nada é mesclado sozinho; revise e integre a branch.` });
      root = wt.dir;
    }
    // Skills do agente + as que você chamou com "/" nesta missão. Qualquer skill vale para qualquer agente: o texto entra no prompt.
    const wantIds = [...new Set([...(agent.skillIds || []), ...(task.extraSkillIds || [])])];
    const selected = wantIds.length ? (await scanSkills(root, { extraRoots: this.store.get('settings', 'skillRoots')?.roots || [] })).filter(s => wantIds.includes(s.id)) : [];
    if (selected.length !== wantIds.length) throw fail('skill_unavailable', 'Uma skill escolhida não está mais disponível. Edite o agente ou escolha outra.');
    const { prompt, warnings } = await buildPrompt({ task, agent, projectContext: this.store.get('contexts', task.project.id) || emptyContext(task.project.id), skills: selected, handoffs: this.hooks.handoffsFor?.(task) ?? [], workRoot: root });
    this.event(attempt.id, { type: 'context', text: `Prompt de ${prompt.length} caracteres. Skills incluídas: ${selected.map(s => s.name).join(', ') || 'nenhuma'}. Contexto do projeto: ${prompt.includes('# Contexto do projeto') ? 'sim' : 'não'}. Material de outros agentes: ${prompt.includes('# Material recebido') ? 'sim' : 'não'}.${browserNote(task.agent?.browser)}` });
    for (const w of warnings) this.event(attempt.id, { type: 'diagnostic', text: `Aviso de skill: ${w}` });
    if (entry.cancelled) throw fail('cancelled', 'Cancelada antes de iniciar o processo.');
    const cmd = this.buildCommand(agent, prompt, { resumeId: task.resume?.sessionId || null, cwd: root, timeoutMs: task.limits.timeoutMs });
    if (task.resume) this.event(attempt.id, { type: 'diagnostic', text: `Continuando a conversa: sessão ${task.resume.sessionId.slice(0, 8)}… da tarefa ${task.resume.fromTask.slice(0, 8)}… (mesmo provedor).` });
    const before = await snapshot(root);
    attempt.spawnedAt = Date.now();
    const child = this.launch(cmd.file, cmd.args, { cwd: root, env: { ...process.env, ...this.extraEnv }, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    entry.child = child; attempt.pid = child.pid ?? null; attempt.status = 'running'; this.save(attempt);
    this.event(attempt.id, { type: 'status', text: 'running', pid: attempt.pid });
    entry.timer = setTimeout(() => { entry.timedOut = true; this.terminate(entry); }, task.limits.timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let buffer = '', stderr = '', line = 0, errorText = null;
    const consume = text => {
      let raw;
      if (agent.provider.startsWith('x-')) {   // IA conectada pela pessoa: a saída é texto puro, cada linha é parte da resposta
        const t = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trimEnd(); if (!t.trim()) return;
        this.event(attempt.id, { type: 'answer', text: t, eventId: `${attempt.id}:${++line}` }); attempt.answer = (attempt.answer + String.fromCharCode(10) + t).trim().slice(-200000); return;
      }
      try { raw = JSON.parse(text); } catch { return; }
      if (raw.type === 'rate_limit_event' && agent.provider === 'claude') { const v = claudeFromEvent(raw.rate_limit_info); if (v) this.store.put('settings', { id: 'limits:claude', windows: v.windows, observedAt: v.observedAt, source: 'última execução do Claude Code' }); return; }
      for (const e of [].concat(normalize(agent.provider, raw) || [])) {  // um evento do provedor pode virar vários (sessão, resposta, uso)
        this.event(attempt.id, { ...e, eventId: `${attempt.id}:${++line}` });
        if (e.type === 'error') errorText = e.text;
        if (['answer', 'result'].includes(e.type)) attempt.answer = (attempt.answer + '\n' + e.text).trim().slice(-200000);
        if (e.type === 'session') attempt.sessionId = e.text;
        if (e.model) attempt.modelReported = e.model;
        if (e.usage) attempt.usage = labelUsage(agent.provider, e.usage);
        if (['session', 'usage', 'error', 'result'].includes(e.type)) this.save(attempt);
      }
    };
    const finished = new Promise(resolve => {
      child.stdout.on('data', chunk => { buffer += chunk; if (buffer.length > 2000000) { errorText = 'Evento excedeu o limite de tamanho.'; this.terminate(entry); return; } const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(consume); });
      child.stderr.on('data', c => { stderr = (stderr + c).slice(-16000); });
      child.stdin.on('error', () => {});
      child.on('error', error => resolve({ spawnError: error }));
      // "close" espera todos os pipes; um neto de processo pode segurá-los. Encerramos no "exit", com tolerância para drenar a saída.
      const done = (code, signal) => { if (buffer) { const rest = buffer; buffer = ''; consume(rest); } resolve({ code, signal }); };
      child.on('close', done);
      child.on('exit', (code, signal) => setTimeout(() => done(code, signal), 1500));
    });
    child.stdin.end(cmd.input);
    const outcome = await finished;
    await this.settle(entry, { ...outcome, errorText, stderr, root, before });
  }

  // Fecha a tentativa e a tarefa. Falhas ficam com um failureKind que explica o que corrigir.
  async settle(entry, o) {
    const { task, attempt } = entry;
    clearTimeout(entry.timer);
    if (!this.active.has(task.id)) return;
    // Outro executor já recuperou esta tarefa (ex.: serviço reiniciado): não sobrescrever o estado dele.
    if (!['running', 'cancelling'].includes(this.store.get('tasks', task.id)?.status)) { this.active.delete(task.id); return; }
    if (entry.killPromise) await entry.killPromise;
    let status = 'completed', failureKind = null, error = null;
    const stderr = o.stderr || '';
    if (o.error) { status = entry.cancelled ? 'cancelled' : 'failed'; failureKind = o.error.failureKind || 'internal'; error = o.error.message; }
    else if (entry.cancelled && !entry.timedOut) status = 'cancelled';
    else if (entry.timedOut) { status = 'failed'; failureKind = 'timeout'; error = `Tempo máximo de ${Math.round(task.limits.timeoutMs / 1000)} s atingido.`; }
    else if (o.spawnError) { status = 'failed'; failureKind = o.spawnError.code === 'ENOENT' ? 'executable_missing' : 'spawn_error'; error = o.spawnError.message; }
    else if (o.errorText || o.code !== 0) {
      status = 'failed'; error = o.errorText || stderr || `Processo terminou com código ${o.code}.`;
      failureKind = classifyFailure(error) || (o.code == null ? 'killed_unexpectedly' : o.code !== 0 ? 'exit_code' : 'provider_error');
    } else if (!attempt.answer) { status = 'failed'; failureKind = 'no_output'; error = 'O provedor terminou sem devolver resposta.'; }
    if (stderr) this.event(attempt.id, { type: 'diagnostic', text: stderr });
    let deliverables = { available: false, files: [] };
    if (o.root && o.before) {
      try { deliverables = await diffSnapshots(o.root, o.before, await snapshot(o.root)); } catch (e) { deliverables = { available: false, reason: e.message, files: [] }; }
    }
    const violation = task.agent.mode === 'read' && deliverables.files.length ? deliverables.files.map(f => f.path) : null;
    if (violation) this.event(attempt.id, { type: 'diagnostic', text: `Agente somente leitura alterou arquivos: ${violation.join(', ')}` });
    Object.assign(attempt, { status, endedAt: now(), durationMs: Date.parse(now()) - Date.parse(attempt.startedAt), exitCode: o.code ?? null, signal: o.signal ?? null, failureKind, error, killResult: entry.killed, readOnlyViolation: violation });
    this.save(attempt); this.event(attempt.id, { type: 'status', text: status, failureKind });
    const fresh = this.store.get('tasks', task.id);
    const taskStatus = status === 'completed' && fresh.status === 'cancelling' ? 'cancelled' : status;
    transition(this.store, fresh, taskStatus, { error, reason: error, failureKind, usage: attempt.usage, modelReported: attempt.modelReported, result: { summary: attempt.answer.slice(-2000), deliverables, readOnlyViolation: violation, attemptId: attempt.id, ...(entry.isolation ? { isolation: entry.isolation } : {}) } });
    this.store.release(task.id); this.active.delete(task.id);
    settleDependents(this.store, task.id);
    try { this.hooks.onFinal?.(this.store.get('tasks', task.id)); } catch (e) { this.event(task.id, { type: 'diagnostic', text: `Falha na orquestração: ${e.message}` }); }
    queueMicrotask(() => this.pump());
  }

  async terminate(entry) {
    const pid = entry.child?.pid;
    if (!pid || entry.killed) return;
    entry.killed = { pending: true };
    entry.killPromise = killTree(pid, { deadlineMs: this.cancelDeadlineMs });
    const result = entry.killed = await entry.killPromise;
    this.event(entry.attempt.id, { type: 'diagnostic', text: result.ok ? `Árvore de processos encerrada em ${result.ms} ms (${result.tree.length} processo(s)).` : `Falha ao confirmar o encerramento em ${result.ms} ms. Processos ainda vivos: ${result.survivors.join(', ')}.` });
  }

  // Cancelar mexe só nesta tarefa: fila → cancelada; em execução → encerra a árvore deste PID.
  async cancel(id) {
    const task = this.store.get('tasks', id);
    if (!task) throw new Error('Tarefa não encontrada.');
    if (['queued', 'waiting_dependency', 'blocked', 'needs_decision', 'interrupted'].includes(task.status)) {
      transition(this.store, task, 'cancelled', { reason: 'Cancelada pelo usuário.' });
      settleDependents(this.store, id); this.hooks.onFinal?.(task); return task;
    }
    const entry = this.active.get(id);
    if (!entry || task.status !== 'running') return task;
    entry.cancelled = true;
    transition(this.store, task, 'cancelling', { reason: 'Cancelamento solicitado.' });
    await this.terminate(entry);
    return this.store.get('tasks', id);
  }
  status() { return { executorId: this.executorId, paused: this.paused(), budget: this.budget(), concurrency: this.concurrency(), active: [...this.active.values()].map(e => ({ taskId: e.task.id, attemptId: e.attempt.id, provider: e.task.agent.provider, project: e.task.project.name, startedAt: e.attempt.startedAt })) }; }
}
