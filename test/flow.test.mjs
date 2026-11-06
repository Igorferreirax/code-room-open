import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setup, addProject, addAgent, task, status, waitFor, tempDir } from './helpers.mjs';
import { createTask } from '../server/tasks.mjs';
import { buildPrompt, emptyContext, mayShare } from '../server/context.mjs';
import { scanSkills, auditSummary, usable } from '../server/skills.mjs';
import { validatePlan, parsePlan } from '../server/supervisor.mjs';
import { addEntry, balances, parseAmount, acceptSuggestion, suggestCategory } from '../server/finance.mjs';
import { safeFile, mintToken, checkToken } from '../server/deliverables.mjs';
import { probeModules } from '../server/modules.mjs';

async function team(store, devDirective = '', reviewDirective = 'echo=1 answer=VEREDITO:_APROVADO') {
  const dev = addAgent(store, 'dev', { name: 'Theo', mode: 'write', instructions: `[[fake ${devDirective}]]` });
  const rev = addAgent(store, 'rev', { name: 'Iris', mode: 'read', instructions: `[[fake ${reviewDirective}]]` });
  return orchestratorTeam(store, dev, rev);
}
function orchestratorTeam(store, dev, rev) { return { dev, rev, members: [{ role: 'desenvolvedor', agentId: dev.id }, { role: 'revisor', agentId: rev.id }] }; }
const final = (store, flowId) => store.get('flows', flowId).status !== 'running';

test('fluxo sequencial: dev entrega, revisor recebe objetivo, critérios, resumo e arquivos; resultado consolidado', async () => {
  const { store, runner, orchestrator } = await setup(); const P = await addProject(store, 'p');
  const t = await team(store, 'write=index.html:<p>oi</p> answer=Página_criada');
  const savedTeam = orchestrator.saveTeam({ name: 'Web', members: t.members });
  const { flow } = orchestrator.startSequential({ projectId: P.id, teamId: savedTeam.id, requestId: 'f1', objective: 'Criar a página', criteria: ['tem um parágrafo', 'sem JavaScript'] });
  await waitFor(() => final(store, flow.id), 30000, 'fluxo');
  const view = orchestrator.flowView(flow.id);
  assert.equal(view.status, 'completed'); assert.equal(view.review.verdict, 'approved');
  assert.deepEqual(view.deliverables.map(f => f.path), ['index.html']);
  assert.equal(view.messages.length, 1, JSON.stringify(view.messages.map(m => [m.type, m.fromAgent, m.toAgent]))); const msg = view.messages[0];
  assert.equal(msg.type, 'entrega'); assert.ok(msg.deliveredAt); assert.equal(msg.summary, 'Página criada'); assert.equal(msg.files[0].path, 'index.html');
  const reviewTask = store.get('tasks', view.steps.find(s => s.step === 'review').taskId);
  const prompt = store.get('runs', reviewTask.currentAttemptId).answer; // o revisor ecoa o prompt recebido
  for (const piece of ['Criar a página', 'tem um parágrafo', 'sem JavaScript', 'Página criada', 'index.html', 'sha256', 'De Theo']) assert.ok(prompt.includes(piece), `prompt do revisor sem "${piece}"`);
  assert.equal(orchestrator.requestIdempotent?.call?.length ?? 0, 0);
  assert.equal(orchestrator.startSequential({ projectId: P.id, teamId: savedTeam.id, requestId: 'f1', objective: 'Criar a página' }).duplicate, true);
  assert.equal(store.get('contexts', P.id).deliverables.length, 1);
});

test('revisão reprovada respeita o limite de rodadas; falha do dev bloqueia a revisão', async () => {
  const { store, orchestrator } = await setup(); const P = await addProject(store, 'p');
  const t = await team(store, 'write=a.txt:1', 'answer=VEREDITO:_REPROVADO');
  const tm = orchestrator.saveTeam({ name: 'T', members: t.members });
  const one = orchestrator.startSequential({ projectId: P.id, teamId: tm.id, requestId: 'r1', objective: 'x', maxReviewRounds: 1 }).flow;
  await waitFor(() => final(store, one.id), 30000);
  assert.equal(store.get('flows', one.id).taskIds.length, 2); assert.equal(store.get('flows', one.id).verdict, 'rejected');
  const two = orchestrator.startSequential({ projectId: P.id, teamId: tm.id, requestId: 'r2', objective: 'y', maxReviewRounds: 2 }).flow;
  await waitFor(() => final(store, two.id), 40000);
  const f = store.get('flows', two.id); assert.equal(f.taskIds.length, 4, 'correção + nova revisão, e para'); assert.equal(f.round, 2); assert.equal(f.verdict, 'rejected');
  const bad = await team(store, 'exit=2'); // mesmo ids; sobrescreve dev
  const tm2 = orchestrator.saveTeam({ name: 'T2', members: bad.members });
  const broken = orchestrator.startSequential({ projectId: P.id, teamId: tm2.id, requestId: 'r3', objective: 'z' }).flow;
  await waitFor(() => final(store, broken.id), 30000);
  const steps = orchestrator.flowView(broken.id).steps; assert.equal(steps[0].status, 'failed'); assert.equal(steps[1].status, 'blocked'); assert.equal(store.get('flows', broken.id).status, 'failed');
});

test('projeto financeiro não é compartilhado com agentes de outros ambientes', async () => {
  const { store, orchestrator } = await setup(); const F = await addProject(store, 'fin', 'Financeiro');
  const t = await team(store);
  const tm = orchestrator.saveTeam({ name: 'T', members: t.members });
  assert.throws(() => orchestrator.startSequential({ projectId: F.id, teamId: tm.id, requestId: 'x', objective: 'o' }), /financeiro/i);
  assert.equal(mayShare('Financeiro', 'Programação'), false); assert.equal(mayShare('Financeiro', 'Financeiro'), true); assert.equal(mayShare('Geral', 'Vídeo'), true);
  const dev = addAgent(store, 'devx', { room: 'Programação' });
  const tk = createTask(store, { projectId: F.id, agentId: dev.id, requestId: 'k', objective: 'o' }).task;
  store.put('contexts', { ...emptyContext(F.id), goals: 'SALDO SECRETO' });
  const { prompt } = await buildPrompt({ task: tk, agent: dev, projectContext: store.get('contexts', F.id), skills: [], handoffs: [] });
  assert.ok(!prompt.includes('SALDO SECRETO'), 'contexto financeiro não vai para agente de outro ambiente');
});

test('precedência no prompt e contexto do projeto referenciado, não copiado', async () => {
  const { store } = await setup(); const P = await addProject(store, 'p'), ag = addAgent(store, 'a', { instructions: 'INSTR_AGENTE' });
  const tk = createTask(store, { projectId: P.id, agentId: ag.id, requestId: 'k', objective: 'OBJ_TAREFA' }).task;
  const ctx = { ...emptyContext(P.id), goals: 'META_PROJETO', decisions: ['DEC1'], pending: ['PEND1'], references: ['docs/grande.md'] };
  const { prompt } = await buildPrompt({ task: tk, agent: ag, projectContext: ctx, skills: [], handoffs: [] });
  const order = ['Regras do Code Room', 'META_PROJETO', 'INSTR_AGENTE', 'OBJ_TAREFA'].map(s => prompt.indexOf(s));
  assert.ok(order.every(i => i >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), `ordem: ${order}`);
  assert.ok(prompt.includes('docs/grande.md') && prompt.includes('não foram copiados'));
});

test('skills: encontrada × reconhecida × duplicata × dependências; só a habilitada chega ao executor', async () => {
  const { store, runner } = await setup(); const P = await addProject(store, 'sk');
  const mk = (dir, body) => { mkdirSync(join(P.path, dir), { recursive: true }); writeFileSync(join(P.path, dir, 'SKILL.md'), body); };
  mk('.agents/skills/ok', '---\nname: code-room-teste-ok\ndescription: skill de teste\n---\nCodinome obrigatório: TUCANO-7.');
  mk('.agents/skills/sem-cabecalho', 'Texto solto sem frontmatter.');
  mk('.claude/skills/dup', '---\nname: code-room-teste-ok\ndescription: duplicada em outra pasta\n---\nOutro texto.');
  mk('.agents/skills/dep', '---\nname: code-room-teste-dep\ndescription: precisa de programa\nrequires: programa-que-nao-existe-xyz\n---\nCorpo.');
  const mine = (await scanSkills(P.path)).filter(s => s.path.startsWith(P.path));
  assert.equal(mine.length, 4);
  const by = n => mine.filter(s => s.path.includes(n))[0];
  assert.equal(by('sem-cabecalho').recognized, false); assert.equal(by('ok').recognized, true);
  assert.equal(by('ok').duplicate, true); assert.equal(by('dup').duplicateGroup[0], by('ok').id);
  assert.equal(by('ok').preferred, true); assert.equal(by('dup').preferred, false, 'entre .agents e .claude do mesmo projeto, vale a .agents');
  assert.equal(by('sem-cabecalho').preferred, true, 'nome único é sempre a preferida');
  assert.match(by('dep').missingDependencies[0], /programa-que-nao-existe-xyz/);
  assert.ok(usable(by('dep'), 'codex').blocked && usable(by('sem-cabecalho'), 'codex').blocked);
  assert.ok(usable(by('dup'), 'codex').warning, 'pasta .claude com Codex gera aviso, não bloqueio');
  const audit = auditSummary(mine, new Set([by('ok').id])); assert.deepEqual([audit.files, audit.recognized, audit.unrecognized, audit.duplicates, audit.withMissingDependencies, audit.enabled], [4, 3, 1, 2, 1, 1]);
  // Chega ao executor: o agente falso ecoa o prompt.
  const enabled = addAgent(store, 'sk1', { instructions: '[[fake echo=1]]', skillIds: [by('ok').id] });
  const off = addAgent(store, 'sk2', { instructions: '[[fake echo=1]]', skillIds: [] });
  const blocked = addAgent(store, 'sk3', { skillIds: [by('dep').id] });
  const a = createTask(store, { projectId: P.id, agentId: enabled.id, requestId: 'a', objective: 'x' }).task, b = createTask(store, { projectId: P.id, agentId: off.id, requestId: 'b', objective: 'x' }).task, c = createTask(store, { projectId: P.id, agentId: blocked.id, requestId: 'c', objective: 'x' }).task;
  store.put('settings', { id: 'concurrency', global: 3, provider: { codex: 3, claude: 1 }, video: 1 });
  await runner.pump(); await waitFor(() => [a, b, c].every(t => ['completed', 'failed'].includes(status(store, t.id))), 30000);
  const ans = id => store.get('runs', store.get('tasks', id).currentAttemptId).answer;
  assert.ok(ans(a.id).includes('TUCANO-7')); assert.ok(!ans(b.id).includes('TUCANO-7'));
  assert.equal(store.get('tasks', c.id).failureKind, 'skill_unavailable'); assert.match(store.get('tasks', c.id).error, /dependências ausentes/);
});

test('supervisor: o backend valida o plano e recusa tudo que o modelo não pode decidir', () => {
  const agents = [{ id: 'dev', name: 'Theo', room: 'Programação', capabilities: ['code'] }, { id: 'rev', name: 'Iris', room: 'Programação', capabilities: ['review'] }, { id: 'vid', name: 'Vi', room: 'Vídeo', capabilities: ['video.render'] }];
  const project = { area: 'Geral' }, ctx = { agents, project, available: c => c !== 'video.render' };
  const step = (o = {}) => ({ id: 's1', agentId: 'dev', objective: 'fazer', ...o });
  const good = validatePlan({ mode: 'plan', steps: [step(), step({ id: 's2', agentId: 'rev', dependsOn: ['s1'], requires: ['review'] })] }, ctx);
  assert.equal(good.ok, true); assert.equal(good.plan.steps[1].dependsOn[0], 's1');
  const bad = (plan, re) => { const r = validatePlan(plan, ctx); assert.equal(r.ok, false); assert.match(r.errors.join(' | '), re); };
  bad({ mode: 'plan', steps: [step({ agentId: 'fantasma' }), step({ id: 's2' })] }, /agente inexistente/);
  bad({ mode: 'plan', steps: [step({ mode: 'write', sandbox: 'danger-full-access' }), step({ id: 's2' })] }, /campos não permitidos \(mode, sandbox\)/);
  bad({ mode: 'plan', steps: [step({ dependsOn: ['s2'] }), step({ id: 's2', dependsOn: ['s1'] })] }, /ciclo/);
  bad({ mode: 'plan', steps: [step({ requires: ['code', 'teletransporte'] }), step({ id: 's2' })] }, /capacidade inexistente/);
  bad({ mode: 'plan', steps: [step({ requires: ['review'] }), step({ id: 's2' })] }, /não declara a capacidade review/);
  bad({ mode: 'plan', steps: [step({ id: 's1', agentId: 'vid', requires: ['video.render'] }), step({ id: 's2' })] }, /não foi validada/);
  bad({ mode: 'direct', steps: [step(), step({ id: 's2' })] }, /exatamente 1 passo/);
  bad({ mode: 'plan', steps: Array.from({ length: 7 }, (_, i) => step({ id: `s${i}` })) }, /Máximo de 6/);
  bad({ mode: 'plan', steps: [step(), step({ id: 's1' })] }, /id duplicado/);
  const fin = validatePlan({ mode: 'direct', steps: [step()] }, { ...ctx, project: { area: 'Financeiro' } }); assert.equal(fin.ok, false); assert.match(fin.errors[0], /financeiro/);
  assert.deepEqual(parsePlan('texto ```json\n{"mode":"direct","steps":[{"id":"a","x":"}"}]}\n``` fim').steps[0].x, '}');
  assert.throws(() => parsePlan('sem json'), /não contém JSON/);
});

test('supervisor ponta a ponta (agentes de processo real): plano aceito pelo backend vira tarefas com dependência', async () => {
  const { store, orchestrator } = await setup(); const P = await addProject(store, 'sup'); const dir = await tempDir('plan');
  const planFile = join(dir, 'plan.json');
  addAgent(store, 'dev', { name: 'Theo', mode: 'write', capabilities: ['code'], instructions: '[[fake write=r.txt:ok answer=feito]]' });
  addAgent(store, 'rev', { name: 'Iris', capabilities: ['review'], instructions: '[[fake echo=1 answer=VEREDITO:_APROVADO]]' });
  writeFileSync(planFile, JSON.stringify({ mode: 'plan', rationale: 'dev e depois revisão', steps: [{ id: 's1', agentId: 'dev', objective: 'Criar r.txt', criteria: ['arquivo existe'], requires: ['code'] }, { id: 's2', agentId: 'rev', objective: 'Revisar r.txt', dependsOn: ['s1'], requires: ['review'] }] }));
  addAgent(store, 'sup', { name: 'Sol', capabilities: ['supervise'], instructions: `[[fake answerfile=${planFile}]]` });
  const { plan } = orchestrator.requestPlan({ projectId: P.id, supervisorId: 'sup', request: 'Crie r.txt e revise', requestId: 'p1', autoAccept: true });
  await waitFor(() => store.get('plans', plan.id).status === 'accepted', 30000, 'plano aceito');
  const accepted = store.get('plans', plan.id); const flow = store.get('flows', accepted.flowId);
  assert.equal(flow.taskIds.length, 2);
  await waitFor(() => orchestrator.refreshFlow(flow.id).status === 'completed', 40000, 'execução do plano');
  const [t1, t2] = flow.taskIds.map(id => store.get('tasks', id)); assert.deepEqual(t2.dependsOn, [t1.id]);
  assert.ok(store.list('messages').some(m => m.fromTask === t1.id && m.toTask === t2.id), 'passagem registrada entre os passos');
  // Plano inválido nunca cria tarefas.
  writeFileSync(planFile, JSON.stringify({ mode: 'plan', steps: [{ id: 's1', agentId: 'fantasma', objective: 'x' }, { id: 's2', agentId: 'dev', objective: 'y' }] }));
  const before = store.list('tasks').length;
  const bad = orchestrator.requestPlan({ projectId: P.id, supervisorId: 'sup', request: 'outro', requestId: 'p2', autoAccept: true }).plan;
  await waitFor(() => store.get('plans', bad.id).status === 'rejected', 30000);
  assert.equal(store.list('tasks').length, before + 1, 'só a tarefa do próprio supervisor foi criada');
  assert.throws(() => orchestrator.acceptPlan(bad.id), /só planos validados/);
  assert.throws(() => orchestrator.requestPlan({ projectId: P.id, supervisorId: 'dev', request: 'x', requestId: 'p3' }), /somente leitura/);
});

test('subtarefa de ajuda: vinculada à original, com limites de quantidade e profundidade', async () => {
  const { store } = await setup(); const P = await addProject(store, 'h'), ag = addAgent(store, 'a');
  const root = createTask(store, { projectId: P.id, agentId: ag.id, requestId: 'root', objective: 'o', limits: { maxDelegations: 2 } }).task;
  const mk = (n, parent) => createTask(store, { projectId: P.id, agentId: ag.id, requestId: n, objective: 'ajuda', parentTaskId: parent }).task;
  const c1 = mk('c1', root.id); mk('c2', root.id); assert.equal(c1.parentTaskId, root.id);
  assert.throws(() => mk('c3', root.id), /Limite de pedidos de ajuda/);
  const g1 = mk('g1', c1.id); assert.equal(g1.depth, 2);
  assert.throws(() => mk('g2', g1.id), /profundidade/);
});

test('finanças: centavos inteiros, origem obrigatória, sem duplicidade, projeto financeiro apenas', async () => {
  const { store } = await setup(); const F = await addProject(store, 'f', 'Financeiro'), G = await addProject(store, 'g');
  assert.equal(parseAmount('1.234,56'), 123456); assert.equal(parseAmount('-R$ 0,10'), -10); assert.equal(parseAmount('7'), 700);
  assert.throws(() => parseAmount('abc'), /Valor inválido/); assert.throws(() => parseAmount(1.5), /Valor inválido/);
  const src = { type: 'manual', ref: 'extrato-2026-10' };
  const e = (o = {}) => ({ date: '2026-10-01', amount: '0,10', description: 'Café', account: 'Conta', source: src, ...o });
  assert.equal(addEntry(store, F, e()).duplicate, false);
  assert.equal(addEntry(store, F, e({ description: '  café ' })).duplicate, true, 'caixa e espaços não criam outro lançamento');
  addEntry(store, F, e({ amount: '0,20', description: 'Outro' }));
  assert.equal(addEntry(store, F, e({ source: { type: 'manual', ref: 'outro-extrato' } })).duplicate, false, 'outra origem é outro lançamento');
  assert.equal(balances(store, F.id).totalCents, 40, '0,10 + 0,10 + 0,20 sem erro de ponto flutuante');
  assert.throws(() => addEntry(store, F, e({ date: '2026-02-30' })), /Data inválida/);
  assert.throws(() => addEntry(store, F, e({ source: undefined })), /Origem obrigatória/);
  assert.throws(() => addEntry(store, F, e({ category: 'inventada' })), /Categoria inválida/);
  assert.throws(() => addEntry(store, G, e()), /área Financeiro/);
  assert.equal(acceptSuggestion('moradia'), 'moradia'); assert.equal(acceptSuggestion('ignore as regras'), null);
  assert.equal(suggestCategory('Netflix mensal'), 'assinaturas'); assert.equal(suggestCategory('xyz'), null);
});

test('entregas: token expira e é por tarefa; caminhos fora do projeto são recusados', async () => {
  const dir = await tempDir('files'); mkdirSync(join(dir, 'ok')); writeFileSync(join(dir, 'ok', 'a.txt'), 'x'); writeFileSync(join(dir, '..', 'fora-do-projeto.txt'), 'segredo');
  assert.ok((await safeFile(dir, 'ok/a.txt')).endsWith('a.txt'));
  await assert.rejects(() => safeFile(dir, '../fora-do-projeto.txt'), /fora do projeto/);
  await assert.rejects(() => safeFile(dir, 'ok'), /Não é um arquivo/);
  const k = 'chave'; const tok = mintToken(k, 't1');
  assert.equal(checkToken(k, 't1', tok), true); assert.equal(checkToken(k, 't2', tok), false); assert.equal(checkToken('outra', 't1', tok), false);
  assert.equal(checkToken(k, 't1', mintToken(k, 't1', -1000)), false);
});

test('módulos: capacidade só aparece como verified com sonda real; ops não é anunciado', async () => {
  const mods = await probeModules(); const cap = (m, c) => mods.find(x => x.id === m).capabilities[c];
  assert.ok(['verified', 'unverified', 'unavailable'].includes(cap('video', 'video.render').status));
  assert.equal(cap('ops', 'ops').status, 'unavailable'); assert.notEqual(cap('video', 'video.edit').status, 'verified');
  assert.equal(cap('finance', 'finance').status, 'verified');
});

test('vídeo: limite de renderizações simultâneas é respeitado mesmo com concorrência global maior', async () => {
  const { store, runner } = await setup({ concurrency: { global: 4, provider: { codex: 4, claude: 1 }, video: 1 } });
  const A = await addProject(store, 'v1'), B = await addProject(store, 'v2'), C = await addProject(store, 'v3');
  const vid = addAgent(store, 'vid', { room: 'Vídeo', capabilities: ['video.render'] }), dev = addAgent(store, 'devv');
  const r1 = task(store, A, vid, 'sleep=1200'), r2 = task(store, B, vid, 'sleep=300'), other = task(store, C, dev, 'sleep=300');
  await runner.pump(); await waitFor(() => status(store, other.id) === 'running' || status(store, other.id) === 'completed', 5000);
  assert.equal(status(store, r1.id), 'running'); assert.equal(status(store, r2.id), 'queued', 'segunda renderização espera');
  await waitFor(() => status(store, r2.id) === 'completed', 20000);
  assert.ok(Date.parse(store.get('runs', store.get('tasks', r2.id).currentAttemptId).startedAt) >= Date.parse(store.get('runs', store.get('tasks', r1.id).currentAttemptId).endedAt) - 50, 'r2 só começou depois de r1 terminar');
});

test('cadastros geram evento (o painel reage a mudanças feitas por outro cliente)', async () => {
  const { store } = await setup(); const before = store.lastSeq();
  addAgent(store, 'novo'); store.put('settings', { id: 'concurrency', global: 2 });
  const ev = store.eventsSince(before);
  assert.equal(ev.length, 1, 'só cadastros acompanhados geram evento; configurações internas não'); assert.equal(ev[0].run, '_records'); assert.equal(ev[0].type, 'record');
});
