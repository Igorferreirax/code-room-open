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
