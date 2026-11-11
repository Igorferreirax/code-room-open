import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseActions, normalizeAction, stateSummary, liveStatus, buildPrompt, briefingPrompt, checkBriefing, chooseProvider, loadManual, Assistant, ASSISTANT_PROJECT } from '../server/assistant.mjs';
import { setup, addProject, addAgent, waitFor, tempDir } from './helpers.mjs';

const world = (over = {}) => ({
  agents: [{ id: 'a1', name: 'Desenvolvedor', role: 'dev', provider: 'codex', mode: 'write' }, { id: 'a2', name: 'Revisor', role: 'rev', provider: 'claude', mode: 'read' }, { id: 'a3', name: 'Gemini', role: 'x', provider: 'agy', mode: 'read' }, { id: 'a4', name: 'Revisor', role: 'dup', provider: 'agy', mode: 'read' }],
  teams: [{ name: 'Equipe Antiga', members: [] }], connected: new Set(['codex', 'claude']),
  projects: [{ id: 'p1', name: 'Canal' }], skills: [{ id: 's1', name: 'copywriting', recognized: true }, { id: 's2', name: 'quebrada', recognized: true, blocked: 'falta programa' }, { id: 's3', name: 'sem-cabecalho', recognized: false }], ...over });
const FENCE = '```';
const block = j => FENCE + 'code-room-action\n' + JSON.stringify(j) + '\n' + FENCE;

test('ações: extrai só blocos code-room-action válidos, limpa o texto, limita a 10 e ignora JSON quebrado ou grande demais', () => {
  const t = `Vou criar.\n${block({ acao: 'abrir_tela', tela: 'equipes' })}\ntexto no meio\n${FENCE}code-room-action\n{ quebrado\n${FENCE}\n${block({ acao: 'criar_equipe', nome: 'X', membros: [] })}\n${FENCE}json\n{"acao":"abrir_tela"}\n${FENCE}`;
  const r = parseActions(t); assert.equal(r.actions.length, 2, 'o quebrado e o bloco json comum ficam de fora'); assert.ok(!r.text.includes('code-room-action')); assert.match(r.text, /Vou criar\.[\s\S]*texto no meio/); assert.ok(r.text.includes(FENCE + 'json'), 'bloco que não é nosso fica no texto');
  const many = Array.from({ length: 13 }, (_, i) => block({ acao: 'abrir_tela', tela: 'sala', n: i })).join('\n'); assert.equal(parseActions(many).actions.length, 10);
  assert.equal(parseActions(block({ acao: 'x', lixo: 'a'.repeat(5000) })).actions.length, 0, 'bloco grande demais é descartado'); assert.equal(parseActions('\uFEFF' + block({ acao: 'abrir_tela', tela: 'sala' })).actions.length, 1);
  assert.deepEqual(parseActions(null), { text: '', actions: [] }); assert.deepEqual(parseActions(block([1, 2])).actions, [], 'só objetos');
});

test('criar_equipe: nomes viram ids reais; papel, agente inexistente, nome ambíguo e equipe repetida são recusados', () => {
  const ok = normalizeAction({ acao: 'criar_equipe', nome: ' Equipe Dev ', membros: [{ papel: 'desenvolvedor', agente: 'desenvolvedor' }, { papel: 'revisor', agente: 'Gemini' }] }, world());
  assert.equal(ok.valid, true); assert.deepEqual(ok.payload, { name: 'Equipe Dev', members: [{ role: 'desenvolvedor', agentId: 'a1' }, { role: 'revisor', agentId: 'a3' }] }); assert.match(ok.summary, /Criar a equipe “Equipe Dev”: desenvolvedor → Desenvolvedor, revisor → Gemini/);
  const linked = normalizeAction({ acao: 'criar_equipe', nome: 'Equipe do Canal', projeto: 'Canal', membros: [{ papel: 'desenvolvedor', agente: 'Desenvolvedor' }] }, world());
  assert.equal(linked.valid, true); assert.equal(linked.payload.projectId, 'p1'); assert.match(linked.summary, /vinculá-la ao projeto “Canal”/);
  assert.match(normalizeAction({ acao: 'criar_equipe', nome: 'Equipe Perdida', projeto: 'Fantasma', membros: [{ papel: 'desenvolvedor', agente: 'Desenvolvedor' }] }, world()).error, /projeto “Fantasma” não existe/);
  const err = (m, re, n = 'Nova') => { const r = normalizeAction({ acao: 'criar_equipe', nome: n, membros: m }, world()); assert.equal(r.valid, false); assert.match(r.error, re); };
  err([{ papel: 'chefe', agente: 'Gemini' }], /Papel inválido: chefe/); err([{ papel: 'revisor', agente: 'Fantasma' }], /não existe/); err([{ papel: 'revisor', agente: 'Revisor' }], /mais de um agente/); err([], /1 a 12/); err(Array(13).fill({ papel: 'revisor', agente: 'Gemini' }), /1 a 12/);
  err([{ papel: 'revisor', agente: 'Gemini' }], /Já existe uma equipe/, 'equipe antiga'); err([{ papel: 'revisor', agente: 'Gemini' }], /precisa de um nome/, '   ');
});

test('criar_agente: só IA instalada, permissão segura por padrão, capacidades conhecidas e sem repetir', () => {
  const base = { acao: 'criar_agente', nome: 'Pesquisador', funcao: 'Pesquisa', provedor: 'claude', capacidades: ['research'] };
  const ok = normalizeAction(base, world()); assert.equal(ok.valid, true); assert.equal(ok.payload.mode, 'read', 'sem informar, é somente leitura'); assert.deepEqual(ok.payload.capabilities, ['research']); assert.equal(ok.payload.room, 'Geral');
  assert.equal(normalizeAction({ ...base, permissao: 'write' }, world()).payload.mode, 'write'); assert.match(normalizeAction({ ...base, permissao: 'root' }, world()).error, /Permissão inválida/);
  assert.match(normalizeAction({ ...base, provedor: 'agy' }, world()).error, /não está instalada/); assert.match(normalizeAction({ ...base, provedor: 'hermes' }, world()).error, /Provedor inválido/);
  assert.match(normalizeAction({ ...base, capacidades: ['hackear'] }, world()).error, /Capacidades válidas/); assert.match(normalizeAction({ ...base, nome: 'Revisor', provedor: 'claude' }, world()).error, /Já existe/);
  assert.match(normalizeAction({ ...base, nome: '', funcao: '' }, world()).error, /nome e função/);
});

test('definir_skills: só skills reconhecidas e utilizáveis, no máximo 8, para um agente que existe', () => {
  const ok = normalizeAction({ acao: 'definir_skills', agente: 'Desenvolvedor', skills: ['Copywriting'] }, world()); assert.equal(ok.valid, true); assert.deepEqual(ok.payload, { agentId: 'a1', skillIds: ['s1'] });
  assert.match(normalizeAction({ acao: 'definir_skills', agente: 'Desenvolvedor', skills: ['quebrada', 'sem-cabecalho', 'inexistente'] }, world()).error, /indisponíveis ou inexistentes: quebrada, sem-cabecalho, inexistente/);
  assert.match(normalizeAction({ acao: 'definir_skills', agente: 'Fantasma', skills: ['copywriting'] }, world()).error, /não existe/); assert.match(normalizeAction({ acao: 'definir_skills', agente: 'Desenvolvedor', skills: [] }, world()).error, /1 a 8/);
  const w = world({ skills: Array.from({ length: 10 }, (_, i) => ({ id: 's' + i, name: 'k' + i, recognized: true })) }); assert.match(normalizeAction({ acao: 'definir_skills', agente: 'Desenvolvedor', skills: Array.from({ length: 9 }, (_, i) => 'k' + i) }, w).error, /1 a 8/);
});

test('abrir_tela e ação desconhecida: telas conhecidas viram o id interno; o resto é ignorado (nunca executado)', () => {
  assert.deepEqual(normalizeAction({ acao: 'abrir_tela', tela: 'conexoes' }, world()).payload, { view: 'connections' }); assert.equal(normalizeAction({ acao: 'abrir_tela', tela: 'admin' }, world()).valid, false);
  for (const a of ['apagar_tudo', 'executar', 'alterar_configuracao', 'ligar_acesso_remoto', undefined]) assert.equal(normalizeAction({ acao: a }, world()), null, `${a} é ignorada`);
});

test('resumo do estado: nomes, papéis e skills; nunca caminhos, chaves nem dados de projeto', () => {
  const w = world({ teams: [{ name: 'E1', members: [{ role: 'revisor', agentId: 'a2' }] }] }); const s = stateSummary(w, [{ name: 'Canal', path: 'C:/Users/pessoa/segredo' }]);
  assert.match(s, /Desenvolvedor \(dev\) · codex · edita arquivos/); assert.match(s, /E1: revisor=Revisor/); assert.match(s, /Projetos \(só os nomes\): Canal/); assert.match(s, /copywriting/); assert.ok(!/segredo|C:\/Users|access\.key/.test(s)); assert.ok(!/quebrada|sem-cabecalho/.test(s), 'skill bloqueada não é oferecida');
});

test('status ao vivo: resume tarefas, lotes e detalha projeto, equipe e agente citados', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const runs = [
    { id: 'r1', status: 'running', agent: { id: 'a1', name: 'Desenvolvedor' }, project: { id: 'p1', name: 'Canal' }, prompt: 'editar vídeo', createdAt: new Date(now - 120000).toISOString() },
    { id: 'r2', status: 'queued', agent: { id: 'a2', name: 'Revisor' }, project: { id: 'p1', name: 'Canal' }, prompt: 'revisar entrega', createdAt: new Date(now - 60000).toISOString() },
    { id: 'r3', status: 'failed', agent: { id: 'a1', name: 'Desenvolvedor' }, project: { id: 'p1', name: 'Canal' }, prompt: 'renderizar arquivo', reason: 'ffmpeg indisponível', updatedAt: new Date(now - 30000).toISOString() },
    { id: 'r4', status: 'completed', agent: { id: 'a2', name: 'Revisor' }, project: { id: 'p2', name: 'Site' }, prompt: 'revisar página', updatedAt: new Date(now - 10000).toISOString(), files: 2 }
  ];
  const w = { ...world(), runs, projects: [{ id: 'p1', name: 'Canal' }], teams: [{ id: 'team1', name: 'Equipe de Vídeo', members: [{ agentId: 'a1' }, { agentId: 'a2' }] }], flows: [{ teamId: 'team1', status: 'running', objective: 'Produzir vídeo' }], folderJobs: [{ name: 'Vídeos novos', counts: { total: 4, done: 1, failed: 1, running: 1, queued: 1 } }] };
  const status = liveStatus(w, 'Qual o status da Equipe de Vídeo no projeto Canal?', now);
  assert.match(status, /1 em execução, 1 na fila, 4 tarefas no histórico recente/);
  assert.match(status, /Desenvolvedor está trabalhando em/);
  assert.match(status, /Revisor está na fila/);
  assert.match(status, /FALHOU em “renderizar arquivo”.*motivo: ffmpeg indisponível/);
  assert.match(status, /Equipe de Vídeo: running/);
  assert.match(status, /Vídeos novos: 1 de 4 prontos, 1 com problema, 1 processando, 1 na fila/);
  assert.match(status, /Detalhe — projeto Canal:/);
  assert.match(status, /Detalhe — equipe Equipe de Vídeo:/);
  assert.match(stateSummary(w, w.projects, 'status do Canal'), /STATUS AO VIVO[\s\S]*projeto Canal/);
});

test('prompt: tem as regras, o manual, o que a IA entendeu, o estado e a pergunta por último; histórico é cortado, tamanho limitado', () => {
  const p = buildPrompt({ manual: 'MANUAL-X', knowledge: 'ENTENDI-Y', summary: 'ESTADO-Z', history: [{ role: 'user', text: 'oi' }, { role: 'assistant', text: 'olá' }], question: 'PERGUNTA-W' });
  for (const t of ['SOMENTE LEITURA', 'MANUAL-X', 'ENTENDI-Y', 'ESTADO-Z', 'Pessoa: oi', 'Assistente: olá']) assert.ok(p.includes(t), t); assert.ok(p.trim().endsWith('PERGUNTA-W'));
  for (const t of ['tela e no projeto atuais', 'skills somente quando constarem como disponíveis', 'Não prometa ferramenta', 'respostas curtas e acionáveis']) assert.ok(p.includes(t), t);
  assert.match(buildPrompt({ manual: 'm', knowledge: '', summary: 's', question: 'q', pilot: true }), /Use somente as ferramentas que esta execução realmente expõe/);
  const big = buildPrompt({ manual: 'M'.repeat(14000), knowledge: 'K'.repeat(3000), summary: 'S'.repeat(3000), history: Array.from({ length: 30 }, (_, i) => ({ role: 'user', text: ('h' + i).repeat(600) })), question: 'Q'.repeat(2000) });
  assert.ok(big.length <= 28000, `${big.length}`); assert.ok(!big.includes('h0h0'), 'o histórico mais antigo saiu primeiro'); assert.match(big, /Q{50}$/, 'a pergunta nunca é cortada');
  assert.match(buildPrompt({ manual: 'm', knowledge: '', summary: 's', question: 'q' }), /ainda não houve apresentação/);
});

test('briefing: só vale se a IA respondeu o pedido, confirmou somente leitura e aprovação, e terminou com BRIEFING: PRONTO', () => {
  const good = 'RESUMO: o Code Room é uma sala local onde várias IAs trabalham juntas e nada sai sem aprovação. '.repeat(3) + '\nREGRAS: eu rodo em somente leitura, não altero a ferramenta e só proponho ações que a pessoa aprova com um clique.\nEXEMPLOS: como criar uma equipe? por que a tarefa falhou?\nBRIEFING: PRONTO';
  const r = checkBriefing(good); assert.equal(r.ok, true); assert.ok(!r.text.includes('BRIEFING: PRONTO'));
  assert.match(checkBriefing(good.replace('BRIEFING: PRONTO', '')).error, /faltou a linha/); assert.match(checkBriefing('curto\nBRIEFING: PRONTO').error, /curta demais/);
  assert.match(checkBriefing('x'.repeat(300) + '\nBRIEFING: PRONTO').error, /regras de segurança/); assert.equal(checkBriefing(null).ok, false);
  assert.match(briefingPrompt('MANUAL'), /BRIEFING: PRONTO/);
});

test('escolha da IA: a preferida se estiver instalada; senão claude, codex, agy; nenhuma = null', () => {
  assert.equal(chooseProvider('codex', new Set(['codex', 'claude'])), 'codex'); assert.equal(chooseProvider('agy', new Set(['codex', 'claude'])), 'claude'); assert.equal(chooseProvider(null, new Set(['agy', 'codex'])), 'codex'); assert.equal(chooseProvider('claude', new Set()), null);
});

// ---------- fluxo completo com uma IA simulada (processo real, sem gastar cota) ----------
async function rig() {
  const { store, runner, orchestrator } = await setup(), root = await tempDir('asst-root'), data = await tempDir('asst-data'), answers = join(root, 'resposta.txt');
  const docs = join(root, 'docs'); mkdirSync(docs, { recursive: true });
  const setManual = (extra = '', directive = `[[fake answerfile=${answers.replace(/\\/g, '/')}]]`) => writeFileSync(join(docs, 'ASSISTENTE.md'), `# Manual de teste ${extra}\n${directive}\n`);
  setManual();
  const proj = await addProject(store, 'canal'); store.put('projects', { ...proj, path: 'C:/segredo/da/pessoa' });
  const dev = addAgent(store, 'dev', { name: 'Desenvolvedor', provider: 'codex', mode: 'write' }), rev = addAgent(store, 'rev', { name: 'Revisor', provider: 'claude' });
  const w = async () => ({ agents: store.list('agents').filter(a => !a.internal), teams: store.list('teams'), connected: new Set(['codex', 'claude']), skills: [{ id: 's1', name: 'copywriting', recognized: true }], projects: store.list('projects').filter(p => !p.internal) });
  const saveAgent = b => store.put('agents', { id: b.id || randomUUID(), ...b }), asst = new Assistant({ store, root, dataDir: data, world: w, pump: () => void runner.pump(), saveTeam: b => orchestrator.saveTeam(b), saveAgent });
  const say = text => writeFileSync(answers, text);
  const done = async () => waitFor(async () => { const s = await asst.status(); return !s.pending && !s.briefing ? s : null; }, 20000, 'resposta do assistente');
  return { store, asst, say, done, root, data, setManual, dev, rev };
}
const GOOD_BRIEF = 'RESUMO: o Code Room é uma sala local onde várias IAs trabalham juntas e nada sai sem a sua aprovação. '.repeat(3) + '\nREGRAS: eu rodo em somente leitura, não altero a ferramenta e só proponho ações que a pessoa aprova com um clique.\nEXEMPLOS: como criar uma equipe?\nBRIEFING: PRONTO';

test('fluxo: sem apresentação não conversa; o briefing é gravado na máquina; manual novo marca como desatualizado', async () => {
  const { asst, say, done, data, setManual } = await rig();
  assert.equal((await asst.status()).briefed, false); await assert.rejects(() => asst.ask('oi'), /apresente o Code Room/i);
  say('resposta curta sem a linha final'); await asst.brief({ provider: 'codex' }); let s = await done(); assert.equal(s.briefed, false); assert.match(s.error, /faltou a linha/, 'apresentação ruim não vale');
  say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); s = await done(); assert.equal(s.briefed, true); assert.equal(s.error, null); assert.equal(s.stale, false); assert.match(s.knowledge, /somente leitura/);
  const file = join(data, 'assistente', 'CONHECIMENTO.md'); assert.ok(existsSync(file), 'gravado na máquina da pessoa'); const md = readFileSync(file, 'utf8'); assert.match(md, /^---\nprovedor: codex\nmanual: [0-9a-f]{16}\n/); assert.match(md, /O que o Assistente entendeu/);
  setManual('versão 2'); assert.equal((await asst.status()).stale, true, 'o manual mudou: precisa apresentar de novo');
});

test('fluxo: pergunta → resposta com ação válida → aprovar cria a equipe de verdade; segunda vez, descartar e ação inválida', async () => {
  const { asst, say, done, store } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  say(`Sugiro uma equipe com os dois.\n${block({ acao: 'criar_equipe', nome: 'Equipe Dev', membros: [{ papel: 'desenvolvedor', agente: 'Desenvolvedor' }, { papel: 'revisor', agente: 'Revisor' }] })}\n${block({ acao: 'criar_equipe', nome: 'Fantasma', membros: [{ papel: 'revisor', agente: 'Nao Existe' }] })}\n${block({ acao: 'apagar_tudo' })}`);
  await asst.ask('Crie uma equipe de desenvolvimento'); await assert.rejects(() => asst.ask('outra'), /Aguarde/); const s = await done();
  const reply = s.messages.at(-1); assert.equal(s.messages.length, 2); assert.equal(reply.role, 'assistant'); assert.equal(reply.text, 'Sugiro uma equipe com os dois.'); assert.equal(reply.actions.length, 2, 'a ação desconhecida não aparece');
  assert.equal(reply.actions[0].valid, true); assert.equal(reply.actions[1].valid, false); assert.match(reply.actions[1].error, /não existe/); assert.ok(!('raw' in reply.actions[0]), 'a tela não recebe o JSON cru');
  assert.equal(store.list('teams').length, 0, 'nada foi criado só porque a IA pediu');
  await assert.rejects(() => asst.apply(reply.id, 1), /não existe/);
  const r = await asst.apply(reply.id, 0); assert.match(r.result, /Equipe “Equipe Dev” criada/); const team = store.list('teams')[0]; assert.equal(team.name, 'Equipe Dev'); assert.deepEqual(team.members.map(m => m.role), ['desenvolvedor', 'revisor']);
  await assert.rejects(() => asst.apply(reply.id, 0), /já foi tratada/); assert.equal((await asst.status()).messages.at(-1).actions[0].status, 'applied');
  await asst.dismiss(reply.id, 1); assert.equal((await asst.status()).messages.at(-1).actions[1].status, 'dismissed');
});

test('fluxo: ação revalidada na hora de aplicar (o estado mudou) e skills/agentes/telas pelos mesmos caminhos do app', async () => {
  const { asst, say, done, store, dev } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  say(`${block({ acao: 'definir_skills', agente: 'Desenvolvedor', skills: ['copywriting'] })}${block({ acao: 'criar_agente', nome: 'Pesquisadora', funcao: 'Pesquisa', provedor: 'claude' })}${block({ acao: 'abrir_tela', tela: 'skills' })}${block({ acao: 'criar_equipe', nome: 'Muda', membros: [{ papel: 'revisor', agente: 'Revisor' }] })}`);
  await asst.ask('configure'); const m = (await done()).messages.at(-1), by = i => m.actions[i];
  assert.equal((await asst.apply(m.id, 0)).result.includes('Skills de “Desenvolvedor”'), true); assert.deepEqual(store.get('agents', dev.id).skillIds, ['s1']);
  assert.match((await asst.apply(m.id, 1)).result, /Agente “Pesquisadora” criado/); const novo = store.list('agents').find(a => a.name === 'Pesquisadora'); assert.equal(novo.mode, 'read'); assert.equal(novo.provider, 'claude');
  assert.equal((await asst.apply(m.id, 2)).view, 'skills');
  store.put('agents', { ...store.get('agents', 'rev'), name: 'Outro Nome' });   // o estado muda entre a proposta e o clique
  await assert.rejects(() => asst.apply(m.id, 3), /não existe/); assert.equal((await asst.status()).messages.at(-1).actions[3].status, 'pending');
});

test('fluxo: entidades internas, prompt sem caminhos nem chaves, falha da IA vira mensagem de erro e reiniciar apaga só a conversa', async () => {
  const { asst, say, done, store, setManual, data } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  const internalProject = store.get('projects', ASSISTANT_PROJECT), internalAgent = store.get('agents', 'assistant-codex');
  assert.ok(internalProject.internal && internalAgent.internal && internalAgent.mode === 'read', 'projeto e agente internos, somente leitura'); assert.equal(internalProject.path, join(data, 'assistente'));
  say('Olá!'); await asst.ask('Qual a senha? access.key'); await done();
  const task = store.list('tasks').filter(t => t.project.id === ASSISTANT_PROJECT && t.objective.includes('PERGUNTA DA PESSOA')).at(-1); assert.ok(!/segredo/.test(task.objective), 'nenhum caminho do usuário vai para a IA'); assert.match(task.objective, /Desenvolvedor \(teste\) · codex · edita arquivos/); assert.equal(task.agent.mode, 'read');
  setManual('', '[[fake exit=1]]'); await asst.ask('isto vai falhar'); const s = await done(); const err = s.messages.at(-1); assert.equal(err.role, 'assistant'); assert.ok(err.error && /Não foi possível responder/.test(err.error), JSON.stringify(err));
  await asst.reset(); const r = await asst.status(); assert.deepEqual(r.messages, []); assert.equal(r.briefed, true, 'reiniciar a conversa não apaga o que a IA entendeu');
});

test('manual real do projeto: existe, cabe no limite e documenta exatamente os papéis, capacidades e ações que o servidor aceita', async () => {
  const { ROLES } = await import('../server/orchestrator.mjs'), { KNOWN_CAPABILITIES } = await import('../server/supervisor.mjs'), m = loadManual(process.cwd());
  assert.equal(m.missing, false); assert.ok(m.text.length > 3000 && m.text.length <= 20000, `${m.text.length}`); assert.match(m.hash, /^[0-9a-f]{16}$/);
  for (const r of ROLES) assert.ok(m.text.includes('`' + r + '`'), `papel ${r}`); for (const c of KNOWN_CAPABILITIES) assert.ok(m.text.includes('`' + c + '`'), `capacidade ${c}`);
  for (const a of ['criar_equipe', 'criar_agente', 'definir_skills', 'abrir_tela', 'criar_projeto', 'iniciar_tarefa', 'ligar_agentes', 'criar_skill', 'criar_pasta_entrada', 'importar_projeto']) assert.ok(m.text.includes(a), a); assert.match(m.text, /NÃO pode/); assert.match(m.text, /somente leitura/i);
  assert.equal(loadManual('C:/pasta/que/nao/existe').missing, true);
});

test('criar_projeto e iniciar_tarefa: nome seguro, projeto/equipe/agente reais, equipe com dev+revisor, nunca equipe e agente juntos', () => {
  const w = world({ teams: [{ id: 't1', name: 'Completa', members: [{ role: 'desenvolvedor', agentId: 'a1' }, { role: 'revisor', agentId: 'a2' }] }, { id: 't2', name: 'Só dev', members: [{ role: 'desenvolvedor', agentId: 'a1' }] }] });
  assert.deepEqual(normalizeAction({ acao: 'criar_projeto', nome: ' Documentário ', ambiente: 'Vídeo' }, w).payload, { name: 'Documentário', area: 'Vídeo' });
  for (const n of ['', 'a/b', 'a\\b', 'a:b', 'canal']) assert.equal(normalizeAction({ acao: 'criar_projeto', nome: n }, w).valid, false, n);
  const t = o => normalizeAction({ acao: 'iniciar_tarefa', projeto: 'Canal', objetivo: 'Fazer X', ...o }, w);
  assert.deepEqual(t({ equipe: 'Completa' }).payload, { projectId: 'p1', objective: 'Fazer X', teamId: 't1' }); assert.deepEqual(t({ agente: 'Desenvolvedor' }).payload, { projectId: 'p1', objective: 'Fazer X', agentId: 'a1' });
  assert.match(t({ equipe: 'Só dev' }).error, /desenvolvedor e um revisor/); assert.match(t({ equipe: 'Completa', agente: 'Revisor' }).error, /OU/); assert.match(t({}).error, /OU/);
  assert.match(t({ projeto: 'Fantasma', agente: 'Revisor' }).error, /projeto/); assert.match(t({ objetivo: '', agente: 'Revisor' }).error, /objetivo/); assert.match(t({ objetivo: 'x'.repeat(3001), agente: 'Revisor' }).error, /3000/);
  assert.match(t({ agente: 'Gemini' }).summary, /cota/);
});

test('encadeamento: itens propostos na mesma resposta valem como existentes (projeto, agente, equipe) e a ordem é conferida na hora de aplicar', () => {
  const w = world({ agents: [], teams: [], projects: [] }), planned = { agents: ['Montador', 'Revisor X'], teams: ['Equipe Doc'], projects: ['Doc'] };
  const eq = normalizeAction({ acao: 'criar_equipe', nome: 'Equipe Doc', membros: [{ papel: 'desenvolvedor', agente: 'Montador' }, { papel: 'revisor', agente: 'Revisor X' }] }, w, { ...planned, teams: [] }); assert.equal(eq.valid, true);
  assert.equal(normalizeAction({ acao: 'iniciar_tarefa', projeto: 'Doc', equipe: 'Equipe Doc', objetivo: 'Editar' }, w, planned).valid, true);
  assert.equal(normalizeAction({ acao: 'iniciar_tarefa', projeto: 'Doc', equipe: 'Equipe Doc', objetivo: 'Editar' }, w).valid, false, 'sem o planejado, não existe');
});

test('Assistente: equipe aprovada com projeto é vinculada sem transformar membros em vínculos individuais', async () => {
  const { asst, say, done, store, dev, rev } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  say(block({ acao: 'criar_equipe', nome: 'Equipe Canal', projeto: 'canal', membros: [{ papel: 'desenvolvedor', agente: 'Desenvolvedor' }, { papel: 'revisor', agente: 'Revisor' }] }));
  await asst.ask('Monte uma equipe para o projeto canal'); const msg = (await done()).messages.at(-1); assert.equal(msg.actions[0].valid, true);
  const out = await asst.apply(msg.id, 0), project = store.get('projects', 'p-canal'), team = store.list('teams')[0];
  assert.match(out.result, /vinculada ao projeto/); assert.equal(out.projectId, project.id); assert.deepEqual(project.teamIds, [team.id]); assert.deepEqual(project.agentIds || [], []);
});

test('fluxo: documentário do zero: 1 resposta com projeto, agentes, equipe e tarefa; aplicar em ordem executa tudo; fora de ordem é recusado', async () => {
  const { asst, say, done, store } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  const calls = []; asst.saveProject = async p => { calls.push(['projeto', p]); return store.put('projects', { id: 'pn', name: p.name, path: 'X', area: p.area }); }; asst.startTask = async p => { calls.push(['tarefa', p]); return { id: 'tk' }; };
  say(['Plano:', block({ acao: 'criar_projeto', nome: 'Documentário', ambiente: 'Vídeo' }), block({ acao: 'criar_agente', nome: 'Montador', funcao: 'Edita o vídeo', provedor: 'codex', permissao: 'write' }), block({ acao: 'criar_agente', nome: 'Conferente', funcao: 'Confere', provedor: 'claude' }),
    block({ acao: 'criar_equipe', nome: 'Equipe Doc', membros: [{ papel: 'desenvolvedor', agente: 'Montador' }, { papel: 'revisor', agente: 'Conferente' }] }), block({ acao: 'iniciar_tarefa', projeto: 'Documentário', equipe: 'Equipe Doc', objetivo: 'Editar o documentário' })].join('\n'));
  await asst.ask('quero editar um documentário'); const m = (await done()).messages.at(-1); assert.equal(m.actions.length, 5); assert.ok(m.actions.every(a => a.valid), JSON.stringify(m.actions.map(a => a.error)));
  await assert.rejects(() => asst.apply(m.id, 4), /não existe/, 'tarefa antes do projeto e da equipe');
  const out = []; for (let i = 0; i < 5; i++) out.push(await asst.apply(m.id, i));
  assert.equal(out[0].projectId, 'pn'); assert.deepEqual(calls[0], ['projeto', { name: 'Documentário', area: 'Vídeo' }]); assert.equal(store.list('teams')[0].name, 'Equipe Doc'); assert.deepEqual(store.list('agents').filter(a => !a.internal && ['Montador', 'Conferente'].includes(a.name)).map(a => a.mode).sort(), ['read', 'write']);
  assert.equal(calls[1][0], 'tarefa'); assert.equal(calls[1][1].projectId, 'pn'); assert.ok(calls[1][1].teamId); assert.equal(out[4].view, 'tasks'); assert.match(out[4].result, /Fluxo da equipe iniciado/);
});

test('fluxo: cadeia por @menções com skill nova: criar_skill, definir_skills, ligar_agentes e iniciar_tarefa aplicam em ordem pelos mesmos caminhos do app', async () => {
  const { asst, say, done, store, dev, rev } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  const made = []; asst.saveSkill = async s => { made.push(s); return s; }; asst.saveLink = async p => store.put('links', { id: 'l1', ...p }); asst.startTask = async p => ({ id: 'tk', ...p });
  asst.worldFn = (orig => async () => ({ ...(await orig()), links: store.list('links'), skills: made.map(m => ({ id: 'sk-' + m.name, name: m.name, recognized: true })).concat([{ id: 's1', name: 'copywriting', recognized: true }]) }))(asst.worldFn);
  say([block({ acao: 'criar_skill', nome: 'roteiro-curto', descricao: 'Escreve roteiros de 45 segundos', instrucoes: 'Escreva nove falas com gancho e chamada final.' }), block({ acao: 'definir_skills', agente: 'Desenvolvedor', skills: ['roteiro-curto'] }), block({ acao: 'ligar_agentes', projeto: 'canal', de: 'Desenvolvedor', para: 'Revisor', voltas: 2 }), block({ acao: 'iniciar_tarefa', projeto: 'canal', agente: 'Desenvolvedor', objetivo: 'Faça um roteiro e envie ao revisor' })].join('\n'));
  await asst.ask('crie uma skill de roteiro e peça ao Desenvolvedor para mandar ao Revisor'); const m = (await done()).messages.at(-1); assert.equal(m.actions.length, 4); assert.ok(m.actions.every(a => a.valid), JSON.stringify(m.actions.map(a => a.error)));
  assert.equal(m.actions[0].detail, 'Escreva nove falas com gancho e chamada final.');
  await assert.rejects(() => asst.apply(m.id, 1), /indisponíveis ou inexistentes/, 'definir_skills antes de a skill existir');
  await asst.apply(m.id, 0); assert.equal(made[0].name, 'roteiro-curto'); await asst.apply(m.id, 1); assert.deepEqual(store.get('agents', dev.id).skillIds, ['sk-roteiro-curto']);
  await asst.apply(m.id, 2); const l = store.list('links')[0]; assert.equal(l.from, dev.id); assert.equal(l.to, rev.id); assert.equal(l.maxHops, 2);
  const r = await asst.apply(m.id, 3); assert.match(r.result, /Tarefa iniciada/); assert.equal(r.view, 'tasks');
});

test('conversas: cada uma tem o seu histórico e título; a resposta volta para a conversa que perguntou mesmo se você trocou; apagar e limites funcionam', async () => {
  const { asst, say, done } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  let s = await asst.status(); assert.equal(s.threads.length, 1); assert.equal(s.threads[0].title, 'Conversa 1'); const first = s.thread;
  s = await asst.renameThread(first, 'Planejamento de vídeo'); assert.equal(s.threads[0].title, 'Planejamento de vídeo');
  say('Resposta da conversa 1'); await asst.ask('Monte uma equipe de edição de vídeo para o documentário'); s = await done();
  assert.equal(s.threads[0].title, 'Planejamento de vídeo', 'o título escolhido permanece'); assert.equal(s.messages.length, 2);
  s = await asst.newThread(); assert.equal(s.threads.length, 2); assert.equal(s.messages.length, 0, 'conversa nova começa vazia'); assert.notEqual(s.thread, first); const second = s.thread; assert.equal(s.threads[1].title, 'Conversa 2');
  say('Resposta da conversa 2'); await asst.ask('Revise o código do projeto'); s = await done(); assert.match(s.messages.at(-1).text, /conversa 2/); assert.equal(s.threads[1].title, 'Revise o código do projeto');
  s = await asst.renameThread(first, 'Ideias de roteiro'); assert.equal(s.threads.find(t => t.id === first).title, 'Ideias de roteiro', 'também renomeia conversa inativa');
  s = await asst.selectThread(first); assert.equal(s.messages.length, 2); assert.match(s.messages.at(-1).text, /conversa 1/, 'histórico da primeira intacto'); assert.deepEqual(s.threads.map(t => t.id), [first, second], 'a ordem das abas não muda ao trocar');
  // pergunta na 1, troca para a 2 antes da resposta: a resposta cai na 1
  say('Chegou depois'); await asst.ask('Outra pergunta'); s = await asst.selectThread(second); assert.equal(s.threads.find(t => t.id === first).waiting, true); await assert.rejects(() => asst.deleteThread(first), /esperando uma resposta/);
  s = await done(); assert.equal(s.messages.length, 2, 'a conversa 2 não recebeu a resposta da 1'); s = await asst.selectThread(first); assert.equal(s.messages.length, 4); assert.match(s.messages.at(-1).text, /Chegou depois/);
  await assert.rejects(() => asst.selectThread('nao-existe'), /não encontrada/);
  await assert.rejects(() => asst.renameThread('nao-existe', 'Título'), /não encontrada/);
  await assert.rejects(() => asst.renameThread(first, '   '), /Dê um nome/);
  s = await asst.deleteThread(second); assert.equal(s.threads.length, 1); assert.equal(s.thread, first); s = await asst.deleteThread(first); assert.equal(s.threads.length, 1); assert.equal(s.messages.length, 0, 'apagar a última deixa uma vazia');
  for (let i = 0; i < 31; i++) await asst.newThread(); await assert.rejects(() => asst.newThread(), /Limite de 32/);
});

test('Assistente: ao alternar projetos, troca de conversa e não leva o histórico de outro projeto ao prompt', async () => {
  const { asst, say, done, store } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  const other = await addProject(store, 'produto'); store.put('projects', { ...other, path: 'C:/projetos/produto' });
  const promptFor = marker => store.list('tasks').find(t => t.agent?.id === 'assistant-codex' && t.objective.includes(marker))?.objective || '';
  await asst.ask('MARCADOR-EXCLUSIVO-DO-CANAL', { projectId: 'p-canal' });
  let s = await asst.status(), canalThread = s.thread, firstPrompt = promptFor('MARCADOR-EXCLUSIVO-DO-CANAL');
  assert.equal(s.threads.find(t => t.id === canalThread).projectName, 'canal'); assert.match(firstPrompt, /MARCADOR-EXCLUSIVO-DO-CANAL/);
  say('Resumo do canal.'); await done();
  await asst.ask('MARCADOR-EXCLUSIVO-DO-PRODUTO', { projectId: other.id });
  s = await asst.status(); const produtoThread = s.thread, secondPrompt = promptFor('MARCADOR-EXCLUSIVO-DO-PRODUTO');
  assert.notEqual(produtoThread, canalThread); assert.match(secondPrompt, /MARCADOR-EXCLUSIVO-DO-PRODUTO/); assert.doesNotMatch(secondPrompt, /MARCADOR-EXCLUSIVO-DO-CANAL/);
  say('Resumo do produto.'); await done();
  await asst.ask('Continue daqui', { projectId: 'p-canal' });
  s = await asst.status(); const resumedPrompt = promptFor('Continue daqui');
  assert.equal(s.thread, canalThread, 'voltar ao projeto reabre a conversa correta'); assert.match(resumedPrompt, /MARCADOR-EXCLUSIVO-DO-CANAL/); assert.doesNotMatch(resumedPrompt, /MARCADOR-EXCLUSIVO-DO-PRODUTO/);
  assert.equal(s.messages.find(m => m.text === 'Continue daqui').context.projectId, 'p-canal');
  say('Contexto retomado.'); await done();
});

test('contexto do Assistente: registra projeto, tela aberta e número de notas do Obsidian que realmente entraram no pedido', async () => {
  const { asst, say, done, store } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  const vault = await tempDir('asst-obsidian'); mkdirSync(join(vault, '.obsidian'), { recursive: true });
  writeFileSync(join(vault, 'Contexto do Code Room.md'), 'Checklist de contexto do Code Room para desenvolvimento, vídeo e rotinas.', 'utf8');
  store.put('settings', { id: 'obsidian', enabled: true, vault, exclude: ['.obsidian'], byProject: {}, maxNotes: 5 });
  await asst.ask('Resuma o checklist de contexto do Code Room', { projectId: 'p-canal', screen: 'Tela: Entregas · Projeto: canal' });
  const user = (await asst.status()).messages.at(-1);
  assert.deepEqual(user.context, { projectId: 'p-canal', project: 'canal', screen: true, obsidianNotes: 1 });
  say('Contexto recebido.'); await done();
});

test('fluxo: a pasta de entrada proposta no chat é criada pelo mesmo caminho do app, depois do projeto e do agente', async () => {
  const { asst, say, done, store } = await rig(); say(GOOD_BRIEF); await asst.brief({ provider: 'codex' }); await done();
  const made = []; asst.saveFolderJob = async p => { made.push(p); return { ...p, id: 'fj1', dir: p.dir }; };
  say([block({ acao: 'criar_pasta_entrada', nome: 'Cortes', projeto: 'canal', agente: 'Desenvolvedor', extensoes: ['mp4'], instrucao: 'Corte {arquivo} e salve em SAIDA/.' })].join('\n'));
  await asst.ask('tenho 15 vídeos para cortar'); const m = (await done()).messages.at(-1); assert.equal(m.actions.length, 1); assert.equal(m.actions[0].valid, true, m.actions[0].error); assert.equal(m.actions[0].detail, 'Corte {arquivo} e salve em SAIDA/.');
  const r = await asst.apply(m.id, 0); assert.match(r.result, /Pasta de entrada criada.*ENTRADA/); assert.equal(r.view, 'routines'); assert.equal(made[0].exts, 'mp4'); assert.equal(made[0].agentId, store.list('agents').find(a => a.name === 'Desenvolvedor').id);
});

test('fluxo: /status responde na hora, sem apresentação e sem tarefa; avisos aparecem e podem ser dispensados', async () => {
  const { asst, store } = await rig(); const before = store.list('tasks').length;
  let s = await asst.status(); assert.equal(s.briefed, false);
  s = await asst.ask('/status'); assert.equal(s.messages.length, 2); assert.equal(s.messages.at(-1).local, true); assert.match(s.messages.at(-1).text, /Status agora/); assert.equal(s.pending, null); assert.equal(store.list('tasks').length, before, 'nenhuma tarefa de IA foi criada');
  s = await asst.ask('/ajuda'); assert.match(s.messages.at(-1).text, /Comandos rápidos/);
  const s2 = await asst.status(); assert.ok(Array.isArray(s2.alerts)); const id = 'start'; s = await asst.dismissAlert(id); assert.ok(!s.alerts.some(a => a.id === id)); await asst.dismissAlert(id); assert.equal((await asst.status()).alerts.filter(a => a.id === id).length, 0);
});

test('Antigravity: o pedido do Assistente nunca passa do limite da linha de comando, mesmo com manual, estado e histórico enormes', async () => {
  const { AGY_BUDGET } = await import('../server/assistant.mjs'); const { buildPrompt: runnerPrompt, emptyContext } = await import('../server/context.mjs');
  const q = 'P'.repeat(2000), p = buildPrompt({ manual: 'M'.repeat(20000), knowledge: 'K'.repeat(6000), summary: 'S'.repeat(12000), history: Array.from({ length: 8 }, () => ({ role: 'user', text: 'h'.repeat(1200) })), question: q, max: AGY_BUDGET });
  assert.ok(p.length <= AGY_BUDGET, `${p.length}`); assert.ok(p.endsWith(q), 'a pergunta continua inteira no fim');
  const task = { objective: p, criteria: [], inputs: [], project: { id: 'assistant-internal', name: 'Assistente (interno)', path: process.cwd(), area: 'Geral' }, agent: { name: 'Assistente', role: 'Ajuda', instructions: '', mode: 'read', commands: [], skillIds: [] }, dependsOn: [] };
  const final = await runnerPrompt({ task, agent: task.agent, projectContext: emptyContext('assistant-internal'), skills: [], handoffs: [], workRoot: process.cwd() }); assert.ok(final.prompt.length <= 28000, `o prompt final do Antigravity tem ${final.prompt.length} caracteres`);
});
