import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { composerBar } from '../public/views.js';
import { canvasHtml } from '../public/canvas.js';

test('projeto: trazer agente e equipe para o projeto, tirar, e ignorar ids inventados', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'code-room-members-')), port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, rej) => setTimeout(() => rej(new Error('Servidor não iniciou')), 5000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`, headers = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
    const post = async (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const pj = await (await post('/api/projects', { name: 'Meu projeto', path: dir })).json();
    const mk = async name => (await (await post('/api/agents', { name, role: 'x', room: 'Geral', provider: 'codex', model: '', mode: 'read', skillIds: [] })).json());
    const [a, b, c] = [await mk('Arquiteto'), await mk('Dev'), await mk('QA')];
    const team = await (await post('/api/teams', { name: 'Time', members: [{ role: 'desenvolvedor', agentId: b.id }, { role: 'revisor', agentId: c.id }] })).json();
    let r = await (await post('/api/projects/members', { projectId: pj.id, add: [a.id, 'inventado'] })).json(); assert.deepEqual(r.agentIds, [a.id]);
    r = await (await post('/api/projects/members', { projectId: pj.id, addTeams: [team.id] })).json(); assert.deepEqual(r.agentIds, [a.id], 'membros da equipe não viram vínculos individuais'); assert.deepEqual(r.teamIds, [team.id]);
    r = await (await post('/api/projects/members', { projectId: pj.id, remove: [b.id] })).json(); assert.deepEqual(r.agentIds, [a.id]); assert.deepEqual(r.teamIds, [], 'tirar membro desvincula o fluxo incompleto');
    r = await (await post('/api/projects/members', { projectId: pj.id, addTeams: [team.id] })).json(); assert.deepEqual(r.teamIds, [team.id]);
    r = await (await post('/api/projects/members', { projectId: pj.id, removeTeams: [team.id] })).json(); assert.deepEqual(r.agentIds, [a.id]); assert.deepEqual(r.teamIds, []);
    const outsider = await mk('Fora');
    assert.equal((await post('/api/links', { projectId: pj.id, from: a.id, to: outsider.id })).status, 400, 'não cria conexão com agente de outro projeto');
    await post('/api/projects/members', { projectId: pj.id, add: [outsider.id] });
    assert.equal((await post('/api/links', { projectId: pj.id, from: a.id, to: outsider.id })).status, 201, 'depois de trazer o agente, a conexão é permitida');
    assert.equal((await post('/api/projects/members', { projectId: 'nao-existe', add: [a.id] })).status, 400);
    const st = await (await fetch(base + '/api/state', { headers })).json(); assert.deepEqual(st.projects.find(p => p.id === pj.id).agentIds, [a.id, outsider.id]); assert.deepEqual(st.projects.find(p => p.id === pj.id).teamIds, []);
  } finally { const done = once(child, 'close'); child.kill(); await done; await rm(dir, { recursive: true, force: true }); }
});

test('chat: projeto vazio e projeto com membros escondem equipe global; só equipe explicitamente ligada aparece', () => {
  const ag = (id, name) => ({ id, name, role: 'r', room: 'Geral', provider: 'codex' }), agents = [ag('1', 'Arquiteto'), ag('2', 'Dev'), ag('3', 'Outro')];
  const teams = [{ id: 't1', name: 'Do Projeto', members: [{ agentId: '1' }] }, { id: 't2', name: 'De Fora', members: [{ agentId: '3' }] }];
  const ctx = { project: 'p1', asstOk: true, state: { agents, teams, projects: [{ id: 'p1', agentIds: ['1'], teamIds: ['t1'] }], runtime: { paused: false }, runs: [], batches: [], connectors: [], limits: {}, prices: [] }, ui: {}, prefs: {}, projectAgentIds: () => new Set(['1']), projectTeamIds: () => new Set(['t1']), supervisorAgent: () => null };
  const h = composerBar(ctx); assert.match(h, /Equipe Do Projeto/); assert.doesNotMatch(h, /De Fora/); assert.match(h, /Arquiteto/); assert.doesNotMatch(h, /Outro/); assert.doesNotMatch(h, /Mostrar todas/);
  const emptyProject = composerBar({ ...ctx, project: 'p2', projectAgentIds: () => new Set(), projectTeamIds: () => new Set(), ui: { chatAll: true } }); assert.match(emptyProject, /Assistente/); assert.doesNotMatch(emptyProject, /De Fora|Outro|Mostrar todas/);
  const workspace = composerBar({ ...ctx, project: '', projectAgentIds: () => new Set(), projectTeamIds: () => new Set() }); assert.match(workspace, /De Fora/); assert.match(workspace, /Outro/);
});

test('Canvas: mostra os nós do projeto e desenha apenas os fluxos de equipe ligados a ele', () => {
  const ag = (id, name) => ({ id, name, role: 'dev', provider: 'codex', mode: 'write', room: 'Geral', capabilities: [], skillIds: [] });
  const agents = [ag('a1', 'Dev'), ag('a2', 'Revisor'), ag('a3', 'Outro')], team = name => ({ name, members: [{ role: 'desenvolvedor', agentId: 'a1' }, { role: 'revisor', agentId: 'a2' }] });
  const ctx = { project: 'p1', ui: {}, room: null, state: { agents, teams: [{ id: 't1', ...team('Time do Projeto') }, { id: 't2', ...team('Time de Fora') }], links: [], runs: [], projects: [{ id: 'p1', agentIds: ['a1', 'a2'], teamIds: ['t1'] }] }, projectTeamIds: () => new Set(['t1']), inRoom: a => a.id !== 'a3', agentStatus: () => ({ status: 'idle', label: 'Inativo' }) };
  const html = canvasHtml(ctx); assert.match(html, /Time do Projeto/); assert.doesNotMatch(html, /Time de Fora/); assert.doesNotMatch(html, /data-agent="a3"/);
});

test('painel do projeto: lista quem foi trazido (com Tirar), as equipes com gente dali e o seletor de trazer; HTML escapado', async () => {
  const { projectMembersHtml } = await import('../public/views.js');
  const a = [{ id: '1', name: '<b>Arq</b>', role: 'Arquiteto' }, { id: '2', name: 'Dev', role: 'Dev' }, { id: '3', name: 'Livre', role: 'Dev' }], t = [{ id: 't1', name: 'Time', members: [{ agentId: '1' }, { agentId: '2' }] }];
  const h = projectMembersHtml({ state: { agents: a, teams: t } }, { id: 'p1', name: 'P', agentIds: ['1'], teamIds: ['t1'] });
  assert.ok(!h.includes('<b>Arq</b>')); assert.match(h, /data-act="member-remove" data-id="1" data-project="p1"/); assert.match(h, /<\/svg> <b>Time<\/b>/); assert.match(h, /data-act="team-member-remove"/); assert.match(h, /Dev · Dev/); assert.match(h, /class="member-add"/);
  assert.match(projectMembersHtml({ state: { agents: a, teams: t } }, { id: 'p2', name: 'Q' }), /Nenhum agente ligado ainda/);
});

test('excluir agente e equipe: exige confirmação, recusa agente que está em equipe, e limpa ligações e vínculos do projeto', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'code-room-del-')), port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, rej) => setTimeout(() => rej(new Error('Servidor não iniciou')), 5000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`, headers = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
    const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
    const pj = await (await post('/api/projects', { name: 'P', path: dir })).json();
    const mk = async name => (await (await post('/api/agents', { name, role: 'x', room: 'Geral', provider: 'codex', model: '', mode: 'read', skillIds: [] })).json());
    const [a, b] = [await mk('A'), await mk('B')];
    const team = await (await post('/api/teams', { name: 'Equipe T', members: [{ role: 'desenvolvedor', agentId: a.id }, { role: 'revisor', agentId: b.id }] })).json();
    await post('/api/projects/members', { projectId: pj.id, addTeams: [team.id] });
    assert.equal((await post(`/api/agents/${a.id}/delete`, {})).status, 400, 'sem confirmação');
    const r = await post(`/api/agents/${a.id}/delete`, { confirm: true }); assert.equal(r.status, 400); assert.match((await r.json()).error, /faz parte de: Equipe T/);
    assert.equal((await post(`/api/teams/${team.id}/delete`, {})).status, 400);
    assert.equal((await post(`/api/teams/${team.id}/delete`, { confirm: true })).status, 200);
    assert.equal((await post(`/api/agents/${a.id}/delete`, { confirm: true })).status, 200);
    const st = await (await fetch(base + '/api/state', { headers })).json();
    assert.ok(!st.agents.some(x => x.id === a.id) && st.agents.some(x => x.id === b.id) && !st.teams.length); assert.deepEqual(st.projects.find(p => p.id === pj.id).agentIds, [], 'membros de equipe não viram vínculos individuais'); assert.deepEqual(st.projects.find(p => p.id === pj.id).teamIds, [], 'excluir equipe limpa o vínculo');
    assert.equal((await post('/api/agents/inexistente/delete', { confirm: true })).status, 400);
  } finally { const done = once(child, 'close'); child.kill(); await done; await rm(dir, { recursive: true, force: true }); }
});
