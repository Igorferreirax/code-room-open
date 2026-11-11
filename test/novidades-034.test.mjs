import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AGENT_LIBRARY, AGENT_PACKS, bestProvider, hireLibraryPack, listAgentLibrary, listAgentPacks } from '../server/agents-library.mjs';
import { testResponse, codexConfigModel, configuredModel } from '../server/connector-test.mjs';
import { normalizeAction, aiGuide, persona, cleanName, buildPrompt, DEFAULT_NAME, memoText } from '../server/assistant.mjs';
import { canvasHtml } from '../public/canvas.js';
import { welcomeBack } from '../public/views.js';

const mem = () => { const t = { agents: new Map(), projects: new Map(), teams: new Map() }; return { list: k => [...t[k].values()], get: (k, id) => t[k].get(id) || null, put: (k, v) => { t[k].set(v.id, v); return v; } }; };
const saver = (store, kind) => b => store.put(kind, { id: `${kind}-${store.list(kind).length + 1}`, ...b });

test('biblioteca: a IA sugerida segue o papel e as equipes prontas contratam, reaproveitam e ligam ao projeto', () => {
  assert.equal(bestProvider('programador', new Set(['claude', 'codex'])), 'codex'); assert.equal(bestProvider('revisor', new Set(['claude', 'codex'])), 'claude');
  assert.equal(bestProvider('pesquisador', ['agy', 'claude']), 'agy'); assert.equal(bestProvider('pesquisador', ['codex']), 'codex'); assert.equal(bestProvider('revisor', []), null);
  for (const p of AGENT_PACKS) for (const id of [...p.agents, ...p.team.map(t => t[1])]) assert.ok(AGENT_LIBRARY.some(a => a.id === id), `${p.id}: ${id}`);
  assert.equal(listAgentPacks().length, AGENT_PACKS.length); assert.equal(listAgentLibrary(mem(), new Set(['codex']))[0].suggested, 'codex');
  const store = mem(); store.put('projects', { id: 'p1', name: 'Loja' }); store.put('agents', { id: 'velho', name: 'Revisor de código', provider: 'codex', mode: 'read' });
  const r = hireLibraryPack(store, saver(store, 'agents'), saver(store, 'teams'), { id: 'codigo', projectId: 'p1', connected: new Set(['claude', 'codex']) });
  assert.deepEqual(r.reused, ['Revisor de código']); assert.equal(r.created.length, 3); assert.equal(r.team, 'Equipe de código');
  assert.equal(r.providers['Programador'], 'codex'); assert.equal(r.providers['Arquiteto de software'], 'claude');
  const pj = store.get('projects', 'p1'); assert.equal(pj.agentIds.length, 4); assert.ok(pj.agentIds.includes('velho')); assert.equal(pj.teamIds.length, 1);
  const again = hireLibraryPack(store, saver(store, 'agents'), saver(store, 'teams'), { id: 'codigo', connected: ['codex'] });
  assert.equal(again.created.length, 0); assert.equal(again.team, null, 'não duplica a equipe'); assert.equal(store.list('agents').length, 4);
  assert.throws(() => hireLibraryPack(store, saver(store, 'agents'), saver(store, 'teams'), { id: 'video', connected: [] }), /Conecte uma IA/);
  assert.throws(() => hireLibraryPack(store, saver(store, 'agents'), saver(store, 'teams'), { id: 'nao', connected: ['codex'] }), /não encontrada/);
});

// Processo falso: devolve a saída combinada e fecha com o código pedido.
const fakeLaunch = ({ out = '', err = '', code = 0, hang = false }) => () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdout.setEncoding = c.stderr.setEncoding = () => {}; c.stdin = { on() {}, end() { if (hang) return; setImmediate(() => { if (out) c.stdout.emit('data', out); if (err) c.stderr.emit('data', err); c.emit('close', code); }); } }; c.kill = () => c.emit('close', null); return c; };
const catalog = [{ id: 'agy', name: 'Antigravity', path: 'C:/fake/agy.exe' }];

test('Testar resposta: reconhece resposta, ferramenta negada, falta de login e demora', async () => {
  const agent = { provider: 'agy', model: '' }, opt = x => ({ cwd: tmpdir(), catalog, launch: fakeLaunch(x) });
  const ok = await testResponse(agent, opt({ out: JSON.stringify({ conversation_id: 'c1', status: 'SUCCESS', response: 'OK' }) + '\n' })); assert.equal(ok.ok, true); assert.equal(ok.answer, 'OK'); assert.equal(ok.hint, null);
  const denied = await testResponse(agent, opt({ err: 'jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied.' })); assert.equal(denied.ok, false); assert.equal(denied.failureKind, 'tool_denied'); assert.match(denied.hint, /sem tela/);
  const empty = await testResponse(agent, opt({})); assert.equal(empty.failureKind, 'no_output'); assert.match(empty.error, /sem responder/);
  const slow = await testResponse(agent, { cwd: tmpdir(), catalog, timeoutMs: 40, launch: fakeLaunch({ hang: true }) }); assert.equal(slow.failureKind, 'timeout'); assert.match(slow.hint, /login ou confirmação/);
  const gone = await testResponse({ provider: 'agy' }, { cwd: tmpdir(), catalog: [{ id: 'agy', path: null }], launch: fakeLaunch({}) }); assert.equal(gone.ok, false);
});

test('modelo do Codex vem do config.toml quando a CLI não informa', async () => {
  const home = await mkdtemp(join(tmpdir(), 'cr-codex-'));
  try {
    assert.equal(codexConfigModel(home), null); await mkdir(join(home, '.codex')); await writeFile(join(home, '.codex', 'config.toml'), 'model_reasoning_effort = "high"\r\nmodel = "gpt-teste"\r\n');
    assert.equal(codexConfigModel(home), 'gpt-teste'); assert.equal(configuredModel({ provider: 'codex', model: '' }, home), 'gpt-teste (padrão do Codex)');
    assert.equal(configuredModel({ provider: 'codex', model: 'o-meu' }, home), 'o-meu'); assert.equal(configuredModel({ provider: 'claude', model: '' }, home), null);
  } finally { await rm(home, { recursive: true, force: true }); }
});

const world = (x = {}) => ({ agents: [{ id: 'a1', name: 'Diretor', provider: 'agy', mode: 'read' }], teams: [], connected: new Set(['claude', 'agy']), skills: [], projects: [], runs: [{ id: '84218881-82e7-4a69-bb2a-c87040b08f7f', status: 'failed', agent: { id: 'a1', name: 'Diretor' }, project: { id: 'p1', name: 'Canal' }, prompt: 'Buscar temas' }, { id: 'ok000000-0000-0000-0000-000000000000', status: 'completed', agent: { id: 'a1', name: 'Diretor' }, project: { id: 'p1', name: 'Canal' }, prompt: 'x' }], ...x });

test('Corrigir com a IA: ajustar_agente e repetir_tarefa são validadas antes de virar cartão', () => {
  const a = normalizeAction({ acao: 'ajustar_agente', agente: 'Diretor', provedor: 'claude', modelo: 'sonnet' }, world());
  assert.equal(a.valid, true); assert.deepEqual(a.payload, { agentId: 'a1', patch: { provider: 'claude', model: 'sonnet' } }); assert.match(a.summary, /IA agy → claude/);
  assert.equal(normalizeAction({ acao: 'ajustar_agente', agente: 'Diretor', provedor: 'claude' }, world()).payload.patch.model, '', 'trocar de IA volta o modelo ao padrão');
  assert.match(normalizeAction({ acao: 'ajustar_agente', agente: 'Diretor', permissao: 'write' }, world()).summary, /EDITAR/);
  assert.equal(normalizeAction({ acao: 'ajustar_agente', agente: 'Diretor', provedor: 'codex' }, world()).valid, false, 'IA não instalada');
  assert.equal(normalizeAction({ acao: 'ajustar_agente', agente: 'Diretor' }, world()).valid, false); assert.equal(normalizeAction({ acao: 'ajustar_agente', agente: 'Ninguém', modelo: 'x' }, world()).valid, false);
  const r = normalizeAction({ acao: 'repetir_tarefa', tarefa: '84218881' }, world()); assert.equal(r.valid, true); assert.equal(r.payload.taskId, '84218881-82e7-4a69-bb2a-c87040b08f7f'); assert.match(r.summary, /podem se repetir/);
  assert.equal(normalizeAction({ acao: 'repetir_tarefa', tarefa: 'ok000000' }, world()).valid, false, 'tarefa concluída não se repete'); assert.equal(normalizeAction({ acao: 'repetir_tarefa', tarefa: 'abc' }, world()).valid, false);
});

test('Assistente: nome, personalidade e guia de IAs entram no pedido', () => {
  assert.equal(cleanName('  Luna <b> '), 'Luna b'); assert.equal(cleanName(''), DEFAULT_NAME); assert.equal(cleanName('x'.repeat(60)).length, 24);
  assert.match(persona('Luna'), /Seu nome é Luna/); assert.match(persona('Luna'), /sem emoji/);
  const p = buildPrompt({ manual: 'm', knowledge: '', summary: 's', question: 'oi', name: 'Luna' }); assert.match(p, /Seu nome é Luna/); assert.ok(p.trimEnd().endsWith('oi') || p.includes('oi'));
  const g = aiGuide({ connected: new Set(['claude', 'codex']), models: { codex: ['gpt-teste'] } });
  assert.match(g, /claude \(Claude Code\)/); assert.match(g, /hoje gpt-teste/); assert.doesNotMatch(g, /agy \(/, 'só as instaladas'); assert.match(g, /distribua os papéis/); assert.match(g, /Auditor de segurança/);
  assert.equal(aiGuide({ connected: new Set() }), ''); assert.doesNotMatch(aiGuide({ connected: new Set(['agy']) }), /distribua/);
});

test('boas-vindas do dia: mostra o que está pendente, some depois de dispensada e quando não há nada', () => {
  const now = new Date('2026-11-11T10:00:00'), iso = d => new Date(now.getTime() - d * 86400000).toISOString();
  const run = (x) => ({ id: 't' + Math.random(), kind: 'work', project: { id: 'p1', name: 'Loja' }, agent: { id: 'a1' }, deliverables: [], createdAt: iso(1), updatedAt: iso(1), ...x });
  const ctx = (x = {}) => ({ prefs: { displayName: 'Igor' }, asst: { name: 'Nico' }, state: { projects: [{ id: 'p1', name: 'Loja' }, { id: 'p2', name: 'Parado <x>' }], subtasks: [{}], plans: [], socialProposals: [], runs: [run({ status: 'completed', deliverables: [{ path: 'a.md' }] }), run({ status: 'failed' }), run({ status: 'failed', updatedAt: iso(20), createdAt: iso(20) }), run({ status: 'completed', project: { id: 'p2', name: 'Parado' }, updatedAt: iso(12), createdAt: iso(12), review: { verdict: 'approved' } })] }, ...x });
  const html = welcomeBack(ctx(), now);
  assert.match(html, /Bom te ver de volta, Igor/); assert.match(html, /<b>1<\/b> entrega esperando a sua revisão/); assert.match(html, /<b>1<\/b> tarefa com problema/, 'falha antiga não entra'); assert.match(html, /<b>1<\/b> pedido aguardando/);
  assert.match(html, /Parado &lt;x&gt;<\/b> parado há 12 dias/); assert.match(html, /Ver com Nico por onde começar/); assert.match(html, /data-act="digest-dismiss"/);
  assert.equal(welcomeBack(ctx({ prefs: { digestSeen: now.toDateString() } }), now), ''); assert.equal(welcomeBack({ prefs: {}, state: { projects: [], runs: [] } }, now), '');
});

test('HTTP: excluir projeto preserva a pasta, o Financeiro recusa o Antigravity e o Assistente guarda o nome', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'code-room-034-')), proj = await mkdtemp(join(tmpdir(), 'code-room-034p-')); const port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port), CODE_ROOM_NO_OPEN: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => setTimeout(() => reject(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`, headers = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
    const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
    const p = (await post('/api/projects', { name: 'Apagar', path: proj })).body;
    assert.equal((await post(`/api/projects/${p.id}/delete`, {})).status, 400, 'exige confirmação');
    const del = await post(`/api/projects/${p.id}/delete`, { confirm: true }); assert.equal(del.status, 200); assert.equal(del.body.name, 'Apagar');
    assert.ok((await stat(proj)).isDirectory(), 'a pasta no computador continua lá');
    assert.equal((await (await fetch(base + '/api/state', { headers })).json()).projects.length, 0); assert.equal((await post(`/api/projects/${p.id}/delete`, { confirm: true })).status, 400);
    const lib = await (await fetch(base + '/api/agents/library', { headers })).json(); assert.ok(lib.agents.length >= 10 && lib.packs.length >= 2);
    const name = await post('/api/assistant/name', { name: 'Luna' }); assert.equal(name.status, 200); assert.equal(name.body.name, 'Luna');
    assert.equal((await post('/api/connectors/test', { provider: 'nao-existe' })).status, 400);
    const state = await (await fetch(base + '/api/state', { headers })).json();
    if (state.connectors.some(c => c.id === 'agy')) {
      const fin = (await post('/api/projects', { name: 'Caixa', path: proj, area: 'Financeiro' })).body;
      const ag = (await post('/api/agents', { name: 'Gemini', role: 'x', room: 'Financeiro', provider: 'agy', model: '', mode: 'read', skillIds: [] })).body;
      const t = await post('/api/tasks', { projectId: fin.id, agentId: ag.id, requestId: 'fin-1', objective: 'somar' }); assert.equal(t.status, 400); assert.match(t.body.error, /Antigravity pesquisa na web/);
    }
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); await rm(proj, { recursive: true, force: true }); }
});

test('memória e ida e volta: guardar_nota recusa segredo, a nota local entra no pedido e ligar_agentes aceita ida_e_volta', () => {
  const w = world({ projects: [{ id: 'p1', name: 'Canal' }], agents: [{ id: 'a1', name: 'Diretor', provider: 'agy', mode: 'read' }, { id: 'a2', name: 'Pesquisador', provider: 'agy', mode: 'read' }], links: [] });
  const n = normalizeAction({ acao: 'guardar_nota', titulo: 'Tom do canal', texto: 'O canal fala de lendas brasileiras em tom sombrio.', projeto: 'Canal' }, w);
  assert.equal(n.valid, true); assert.deepEqual(n.payload, { title: 'Tom do canal', text: 'O canal fala de lendas brasileiras em tom sombrio.', projectId: 'p1' });
  assert.equal(normalizeAction({ acao: 'guardar_nota', titulo: 'x', texto: 'curto' }, w).valid, false);
  assert.match(normalizeAction({ acao: 'guardar_nota', titulo: 'Acesso', texto: 'a senha: abc123 do painel de vendas' }, w).error, /Não guardo senhas/);
  assert.match(memoText([{ title: 'Tom', text: 'sombrio' }]), /lembrar:[\s\S]- Tom: sombrio/); assert.equal(memoText([]), '');
  const l = normalizeAction({ acao: 'ligar_agentes', projeto: 'Canal', de: 'Diretor', para: 'Pesquisador', ida_e_volta: true }, w);
  assert.equal(l.payload.both, true); assert.match(l.summary, /responde de volta/);
  assert.equal('both' in normalizeAction({ acao: 'ligar_agentes', projeto: 'Canal', de: 'Diretor', para: 'Pesquisador' }, w).payload, false);
});

test('Canvas com terminais: cada nó mostra a saída do agente, com o botão para ligar e desligar e a opção ida e volta', () => {
  const a = { id: 'a1', name: 'Ana', role: 'Dev', provider: 'codex', room: 'Geral', skillIds: [] }, b = { id: 'a2', name: 'Beto', role: 'Rev', provider: 'claude', room: 'Geral', skillIds: [] };
  const run = { id: 't1', status: 'running', agent: a, project: { id: 'p1' } };
  const ctx = on => ({ project: 'p1', prefs: { cvTerm: on }, ui: {}, term: { t1: { html: '<span class="tp">$ criar a tela</span>' } }, termTask: x => (x.id === 'a1' ? run : null), inRoom: () => true, agentStatus: x => ({ status: x.id === 'a1' ? 'running' : 'idle', label: 'x' }), state: { agents: [a, b], teams: [], runs: [run], links: [{ id: 'l1', projectId: 'p1', from: 'a1', to: 'a2', maxHops: 3 }] } });
  const on = canvasHtml(ctx(true)), off = canvasHtml(ctx(false));
  assert.equal((on.match(/class="cv-node cv-t /g) || []).length, 2); assert.match(on, /class="term-out cv-term" data-task="t1">.*criar a tela/); assert.match(on, /Nenhuma tarefa deste agente neste projeto ainda/);
  assert.match(on, /width:330px;height:232px/); assert.match(on, /aria-pressed="true"[^>]*>Esconder terminais/);
  assert.doesNotMatch(off, /term-out cv-term/); assert.match(off, /width:232px;height:88px/); assert.match(off, />Mostrar terminais</); assert.match(off, /name="both" value="1"> ida e volta/);
});
