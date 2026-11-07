import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeAction, stateSummary } from '../server/assistant.mjs';
import { createSkillFile } from '../server/myskills.mjs';
import { Store } from '../server/store.mjs';
import { scanSkills, frontmatter } from '../server/skills.mjs';
import { tempDir } from './helpers.mjs';

const agents = [{ id: 'a1', name: 'Diretor', role: 'Dirige', provider: 'claude', mode: 'read' }, { id: 'a2', name: 'Roteirista', role: 'Escreve', provider: 'codex', mode: 'read' }, { id: 'a3', name: 'Montador', role: 'Edita', provider: 'codex', mode: 'write' }];
const world = (over = {}) => ({ agents, teams: [], projects: [{ id: 'p1', name: 'Video X' }], links: [], connected: new Set(['claude', 'codex']), skills: [{ id: 's1', name: 'motion-graphics', description: 'Cria motion graphics em HTML com animação por quadros', recognized: true }, { id: 's2', name: 'copywriting', description: 'Escreve textos de venda', recognized: true }], ...over });

test('ligar_agentes: nomes viram ids, repetida e ligação consigo mesmo são recusadas, voltas ficam entre 1 e 6', () => {
  const l = o => normalizeAction({ acao: 'ligar_agentes', projeto: 'Video X', de: 'Diretor', para: 'Roteirista', ...o }, world());
  assert.deepEqual(l({}).payload, { projectId: 'p1', from: 'a1', to: 'a2', maxHops: 3 }); assert.equal(l({ voltas: 99 }).payload.maxHops, 6); assert.equal(l({ voltas: 0 }).payload.maxHops, 3);
  assert.match(l({ para: 'Diretor' }).error, /ele mesmo/); assert.match(l({ de: 'Fantasma' }).error, /não existe/); assert.match(l({ projeto: 'Nada' }).error, /projeto/);
  assert.match(normalizeAction({ acao: 'ligar_agentes', projeto: 'Video X', de: 'Diretor', para: 'Roteirista' }, world({ links: [{ projectId: 'p1', from: 'a1', to: 'a2' }] })).error, /já existe/);
});

test('cadeia por @menções: ligações e tarefa com agentes que ainda serão criados valem na mesma resposta', () => {
  const planned = { agents: ['Novo'], teams: [], projects: [], skills: [] };
  assert.equal(normalizeAction({ acao: 'ligar_agentes', projeto: 'Video X', de: 'Diretor', para: 'Novo' }, world(), planned).valid, true);
  assert.equal(normalizeAction({ acao: 'ligar_agentes', projeto: 'Video X', de: 'Diretor', para: 'Novo' }, world()).valid, false);
  const t = normalizeAction({ acao: 'iniciar_tarefa', projeto: 'Video X', agente: 'Diretor', objetivo: 'Peça ao Roteirista um roteiro e envie ao Montador' }, world());
  assert.equal(t.valid, true); assert.deepEqual(t.payload, { projectId: 'p1', objective: 'Peça ao Roteirista um roteiro e envie ao Montador', agentId: 'a1' });
});

test('criar_skill: nome seguro, descrição e instruções com tamanho, sem repetir; mostra o texto completo para aprovar', () => {
  const c = o => normalizeAction({ acao: 'criar_skill', nome: 'roteiro-curto', descricao: 'Escreve roteiros de 45 segundos', instrucoes: 'Escreva 9 falas com gancho no início e chamada no fim.', ...o }, world());
  const ok = c({}); assert.equal(ok.valid, true); assert.equal(ok.detail, 'Escreva 9 falas com gancho no início e chamada no fim.'); assert.match(ok.summary, /roteiro-curto/);
  assert.equal(c({ nome: 'Roteiro' }).payload.name, 'roteiro', 'maiúsculas viram minúsculas');
  for (const n of ['../x', 'a', 'x'.repeat(60), 'a b', 'motion-graphics']) assert.equal(c({ nome: n }).valid, false, n);
  assert.match(c({ descricao: 'curta' }).error, /Descreva/); assert.match(c({ instrucoes: 'curto' }).error, /20 a 6000/); assert.match(c({ instrucoes: 'x'.repeat(6001) }).error, /20 a 6000/);
  const w = world(), planned = { agents: [], teams: [], projects: [], skills: ['roteiro-curto'] };
  assert.equal(normalizeAction({ acao: 'definir_skills', agente: 'Roteirista', skills: ['roteiro-curto'] }, w, planned).valid, true); assert.equal(normalizeAction({ acao: 'definir_skills', agente: 'Roteirista', skills: ['roteiro-curto'] }, w).valid, false);
});

test('resumo com skills: as ligadas ao pedido vêm com descrição; sem nenhuma ligada, manda dizer a verdade e oferecer criar ou importar', () => {
  const a = stateSummary(world(), [{ name: 'Video X' }], 'quero um vídeo de motion graphics com animação'); assert.match(a, /Mais ligadas ao pedido da pessoa:\n- motion-graphics: Cria motion graphics/); assert.match(a, /Outras \(só nomes\): copywriting/);
  const b = stateSummary(world(), [], 'preciso de uma planilha de impostos'); assert.match(b, /Nenhuma parece ligada ao pedido atual/); assert.match(b, /criar_skill/); assert.match(b, /Ligações entre agentes: \(nenhuma\)/);
  const c = stateSummary(world({ links: [{ from: 'a1', to: 'a2' }] }), [], ''); assert.match(c, /Diretor → Roteirista/);
  const dup = stateSummary(world({ skills: [...world().skills, { id: 's9', name: 'copywriting', description: 'duplicada', recognized: true }] }), [], 'x'); assert.equal((dup.match(/copywriting/g) || []).length, 1, 'skills repetidas em várias pastas aparecem uma vez');
});

test('skill criada pelo Assistente: grava SKILL.md válido, entra como pasta extra, é reconhecida pelo escaneador e não sobrescreve', async () => {
  const data = await tempDir('myskills'), store = new Store(':memory:');
  const r = await createSkillFile(store, data, { name: 'roteiro-curto', description: 'Escreve roteiros: com "aspas" e dois-pontos', instructions: 'Linha 1\r\nLinha 2 com instruções suficientes.' });
  const file = join(r.path, 'SKILL.md'); assert.ok(existsSync(file)); const text = readFileSync(file, 'utf8'); assert.ok(!text.includes('\r'));
  const fm = frontmatter(text); assert.equal(fm.name, 'roteiro-curto'); assert.match(fm.description, /aspas/);
  const roots = store.get('settings', 'skillRoots').roots; assert.equal(roots.length, 1);
  const found = (await scanSkills(undefined, { extraRoots: roots })).find(s => s.name === 'roteiro-curto' && s.scope === 'extra'); assert.ok(found && found.recognized, 'reconhecida');
  await assert.rejects(() => createSkillFile(store, data, { name: 'roteiro-curto', description: 'x'.repeat(12), instructions: 'y'.repeat(30) }), /Já existe/);
  await createSkillFile(store, data, { name: 'outra-skill', description: 'Outra skill de teste', instructions: 'z'.repeat(30) }); assert.equal(store.get('settings', 'skillRoots').roots.length, 1, 'a pasta base entra uma vez só');
  await assert.rejects(() => createSkillFile(store, data, { name: '../fora', description: 'x'.repeat(12), instructions: 'y'.repeat(30) }), /inválido/);
});

test('criar_pasta_entrada: instrução precisa citar {arquivo}, projeto e agente/equipe reais, extensões viram texto, planejados valem na mesma resposta', () => {
  const w = world({ teams: [{ id: 't1', name: 'Vídeo', members: [] }] });
  const p = o => normalizeAction({ acao: 'criar_pasta_entrada', nome: 'Cortes', projeto: 'Video X', agente: 'Montador', extensoes: ['mp4', 'mov'], instrucao: 'Edite {arquivo} com a skill motion-graphics.', ...o }, w);
  const ok = p({}); assert.equal(ok.valid, true); assert.deepEqual(ok.payload, { name: 'Cortes', projectId: 'p1', dir: 'ENTRADA', exts: 'mp4,mov', instruction: 'Edite {arquivo} com a skill motion-graphics.', outputNote: '', parallel: 1, agentId: 'a3' }); assert.match(ok.summary, /cota/); assert.equal(ok.detail, ok.payload.instruction);
  assert.equal(p({ agente: undefined, equipe: 'Vídeo' }).payload.teamId, 't1'); assert.equal(p({ pasta: 'BRUTOS', paralelo: 2, salvar: 'SAIDA/' }).payload.parallel, 2);
  assert.match(p({ instrucao: 'sem marcador' }).error, /\{arquivo\}/); assert.match(p({ projeto: 'Nada' }).error, /projeto/); assert.match(p({ agente: 'Fantasma' }).error, /não existe/); assert.match(p({ equipe: 'Vídeo' }).error, /OU/); assert.match(p({ nome: '' }).error, /nome/);
  assert.equal(normalizeAction({ acao: 'criar_pasta_entrada', nome: 'N', projeto: 'Novo', agente: 'Novo Ag', instrucao: 'x {arquivo}' }, world({ agents, projects: [] }), { agents: ['Novo Ag'], teams: [], projects: ['Novo'], skills: [] }).valid, true);
});

import { proactiveAlerts, localCommand } from '../server/assistant.mjs';
test('assistente proativo: falhas recentes, fila parada, lote com problema, IA indisponível e começo; nada quando está tudo bem', () => {
  const NOW = Date.parse('2026-11-07T12:00:00Z'), iso = m => new Date(NOW - m * 60000).toISOString();
  const run = (id, status, min, extra = {}) => ({ id, status, agent: { id: 'a1', name: 'Montador' }, project: { id: 'p1', name: 'Doc' }, prompt: 'Editar vídeos', reason: '', createdAt: iso(min + 1), updatedAt: iso(min), ...extra });
  const w = over => ({ agents, connected: new Set(['claude', 'codex']), runs: [], folderJobs: [], ...over });
  assert.deepEqual(proactiveAlerts(w({ runs: [run('a', 'completed', 5)] }), NOW), [], 'tudo bem: nenhum aviso');
  const f = proactiveAlerts(w({ runs: [run('x', 'failed', 20, { reason: 'sem login' }), run('old', 'failed', 3000)] }), NOW); assert.equal(f.length, 1, 'falha de mais de 24 h não aparece'); assert.equal(f[0].level, 'bad'); assert.match(f[0].text, /sem login/); assert.match(f[0].ask, /Montador/);
  assert.equal(proactiveAlerts(w({ runs: [run('q', 'queued', 30)] }), NOW)[0].id, 'queue-stuck'); assert.deepEqual(proactiveAlerts(w({ runs: [run('q', 'queued', 30), run('r', 'running', 2)] }), NOW), [], 'com algo rodando a fila não está parada');
  assert.match(proactiveAlerts(w({ folderJobs: [{ id: 'j', name: 'Cortes', counts: { failed: 2, done: 3, total: 5 } }] }), NOW)[0].title, /2 com problema/); assert.match(proactiveAlerts(w({ folderJobs: [{ id: 'j', name: 'Cortes', counts: {}, problem: 'A pasta de entrada ainda não existe.' }] }), NOW)[0].text, /não existe/);
  assert.equal(proactiveAlerts(w({ connected: new Set(['claude']) }), NOW).find(a => a.id === 'provider:codex').level, 'warn'); assert.equal(proactiveAlerts(w({ agents: [] }), NOW)[0].id, 'start');
  assert.ok(proactiveAlerts(w({ runs: Array.from({ length: 9 }, (_, i) => run('f' + i, 'failed', i + 1)) }), NOW).length <= 5);
});

test('comandos locais: /status, /pendencias e /ajuda respondem na hora; outras mensagens vão para a IA', () => {
  const w = { agents, projects: [], teams: [], runs: [{ id: 'r', status: 'running', agent: { id: 'a1', name: 'Montador' }, project: { id: 'p1', name: 'Doc' }, prompt: 'Editar vídeos', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] };
  assert.match(localCommand('/status', w), /Status agora[\s\S]*Montador está trabalhando em “Editar vídeos”/); assert.match(localCommand('/pendencias', w, []), /Nada pendente agora/); assert.match(localCommand('/PENDÊNCIAS', w, [{ title: 'T', text: 'x' }]), /\*\*T\.\*\* x/);
  assert.match(localCommand(' /ajuda ', w), /\/status[\s\S]*\/pendencias/); for (const t of ['status', '/status do projeto', 'oi /status', '/outra']) assert.equal(localCommand(t, w), null, t);
});

test('projeto em foco: o resumo diz qual projeto está aberto quando a pessoa fala "este projeto"; sem projeto, nada é dito', () => {
  const w = { agents, teams: [], projects: [{ id: 'p1', name: 'Canal' }], connected: new Set(['codex']), skills: [], runs: [] };
  assert.match(stateSummary(w, w.projects, 'traga ideias', 'Canal YouTube'), /Projeto em foco[^\n]*: Canal YouTube/); assert.ok(!stateSummary(w, w.projects, 'x', '').includes('Projeto em foco'));
});

import { memoryOf, buildPrompt as promptOf } from '../server/assistant.mjs';
test('memória da conversa: só o que veio antes das últimas 8 mensagens, como "pediu" e "feito"; entra no prompt e é cortada antes da pergunta', () => {
  const msgs = []; for (let i = 0; i < 12; i++) { msgs.push({ role: 'user', text: `pedido número ${i}` }); msgs.push({ role: 'assistant', text: 'ok', actions: i === 1 ? [{ status: 'applied', result: 'Equipe “Doc” criada.' }, { status: 'dismissed', summary: 'Criar agente X' }, { status: 'pending', summary: 'não conta' }] : [] }); }
  const m = memoryOf(msgs); assert.match(m, /- Pessoa pediu: pedido número 0/); assert.match(m, /- Feito: Equipe “Doc” criada\./); assert.match(m, /- Descartado: Criar agente X/); assert.ok(!m.includes('não conta')); assert.ok(!m.includes('pedido número 11'), 'o recente vai inteiro no histórico, não na memória'); assert.equal(memoryOf(msgs.slice(-6)), '', 'conversa curta não tem memória');
  const p = promptOf({ manual: 'M', knowledge: 'K', summary: 'S', history: [{ role: 'user', text: 'oi' }], memory: m, question: 'Q' }); assert.match(p, /MEMÓRIA DA CONVERSA[\s\S]*Pessoa pediu: pedido número 0[\s\S]*CONVERSA ATÉ AGORA[\s\S]*Pessoa: oi/); assert.ok(p.endsWith('Q'));
  assert.match(promptOf({ manual: 'M', knowledge: '', summary: 'S', question: 'Q' }), /\(nada antes\)/);
  const tight = promptOf({ manual: 'M'.repeat(6000), knowledge: '', summary: 'S'.repeat(3000), history: [], memory: 'x'.repeat(2400), question: 'Q', max: 8000 }); assert.ok(tight.length <= 8000 + 400, `${tight.length}`); assert.ok(tight.endsWith('Q'));
});
