import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMcp, TOOLS, WRITE_TOOLS, resolveConfig, httpCall } from '../server/mcp.mjs';
import { mcpInfo, mcpActivate, mcpDeactivate } from '../server/mcpsetup.mjs';
import { Devices } from '../server/devices.mjs';
import { Store } from '../server/store.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const req = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });
const text = r => r.result.content[0].text;

const STATE = {
  runtime: { version: '9.9.9' }, projects: [{ id: 'p1', name: 'Site', area: 'Programação', path: 'C:/segredo/caminho' }],
  agents: [{ id: 'a1', name: 'Ana', role: 'dev', room: 'Programação', provider: 'codex', model: '', mode: 'write' }],
  runs: [
    { id: 't1', status: 'running', project: { id: 'p1', name: 'Site' }, agent: { name: 'Ana' }, prompt: 'faça X' },
    { id: 't2', status: 'completed', project: { id: 'p1', name: 'Site' }, agent: { name: 'Ana' }, prompt: 'faça Y', deliverables: [{ path: 'a.md', change: 'created' }] },
    { id: 't3', status: 'failed', project: { id: 'p2', name: 'Outro' }, agent: { name: 'Ana' }, prompt: 'faça Z', reason: 'sem saída' }
  ]
};

test('MCP: handshake, lista de ferramentas e somente leitura por padrão', async () => {
  const calls = [];
  const m = createMcp({ call: async (...a) => { calls.push(a); return STATE; }, version: '1.2.3' });
  const init = await m.handle(req(1, 'initialize', { protocolVersion: '2025-06-18' }));
  assert.equal(init.result.protocolVersion, '2025-06-18'); assert.equal(init.result.serverInfo.name, 'code-room'); assert.match(init.result.instructions, /somente leitura/);
  assert.equal((await m.handle(req(2, 'initialize', { protocolVersion: '1999-01-01' }))).result.protocolVersion, '2025-06-18', 'versão desconhecida cai na mais nova suportada');
  assert.equal(await m.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null, 'notificação não tem resposta');
  assert.deepEqual((await m.handle(req(3, 'ping'))).result, {});
  const names = (await m.handle(req(4, 'tools/list'))).result.tools.map(t => t.name);
  assert.deepEqual(names, TOOLS.map(t => t.name)); assert.ok(!names.includes('criar_tarefa') && !names.includes('cancelar_tarefa'));
  assert.ok(TOOLS.every(t => t.annotations.readOnlyHint === true));
  assert.equal((await m.handle(req(5, 'nao/existe'))).error.code, -32601);
  assert.equal((await m.handle({ foo: 1 })), null); assert.equal((await m.handle({ id: 9, foo: 1 })).error.code, -32600);
  assert.deepEqual(calls, [], 'handshake não chama o Code Room');
});

test('MCP: leitura devolve o que importa e não vaza caminhos do disco', async () => {
  const m = createMcp({ call: async (met, path) => path.startsWith('/api/tasks/t2') ? { id: 't2', status: 'completed', project: { name: 'Site' }, agent: { name: 'Ana' }, prompt: 'faça Y', attemptCount: 1, answer: 'x'.repeat(20000), deliverables: { files: [{ path: 'a.md', change: 'created' }, { path: 'b.md', change: 'deleted' }] } } : STATE });
  const call = (name, args) => m.handle(req(1, 'tools/call', { name, arguments: args }));
  const st = JSON.parse(text(await call('status', {})));
  assert.equal(st.versao, '9.9.9'); assert.equal(st.projetos, 1); assert.equal(st.tarefas.rodando, 1); assert.equal(st.tarefas.falharam, 1); assert.equal(st.modo, 'somente leitura');
  const pr = text(await call('listar_projetos', {})); assert.ok(pr.includes('Site') && !pr.includes('segredo'), 'o caminho do projeto não sai');
  assert.equal(JSON.parse(text(await call('listar_agentes', {})))[0].nome, 'Ana');
  assert.equal(JSON.parse(text(await call('listar_tarefas', { projectId: 'p1' }))).length, 2);
  assert.equal(JSON.parse(text(await call('listar_tarefas', { status: 'failed' })))[0].motivo, 'sem saída');
  assert.equal(JSON.parse(text(await call('listar_tarefas', { limite: 1 }))).length, 1);
  const ent = JSON.parse(text(await call('listar_entregas', {}))); assert.deepEqual(ent[0].arquivos, ['a.md']);
  const vt = await call('ver_tarefa', { id: 't2' });
  assert.ok(vt.result.content[0].text.length <= 13000, 'resposta longa é cortada');
  assert.ok(vt.result.content[0].text.includes('a.md') || vt.result.content[0].text.includes('cortado'));
  const bad = await call('ver_tarefa', { id: '../../x' }); assert.equal(bad.result.isError, true); assert.match(text(bad), /id da tarefa/);
});

test('MCP: escrever só existe quando é ligado de propósito; criar usa requestId e valida; aprovar/apagar nunca existem', async () => {
  const sent = [];
  const off = createMcp({ call: async () => STATE });
  const blocked = await off.handle(req(1, 'tools/call', { name: 'criar_tarefa', arguments: { projectId: 'p1', agentId: 'a1', objetivo: 'x' } }));
  assert.equal(blocked.result.isError, true); assert.match(text(blocked), /somente leitura/);
  const on = createMcp({ escrever: true, call: async (met, path, body) => { sent.push([met, path, body]); return { id: 'novo', status: 'queued', project: { name: 'Site' }, agent: { name: 'Ana' }, prompt: body?.objective }; } });
  const names = (await on.handle(req(2, 'tools/list'))).result.tools.map(t => t.name);
  assert.deepEqual(names, [...TOOLS, ...WRITE_TOOLS].map(t => t.name));
  assert.ok(!names.some(n => /aprovar|reprovar|apagar|excluir|deletar|configur/.test(n)), 'decisões ficam com a pessoa');
  const ok = await on.handle(req(3, 'tools/call', { name: 'criar_tarefa', arguments: { projectId: 'p1', agentId: 'a1', objetivo: '  faça isso  ' } }));
  assert.match(text(ok), /"criada": true/);
  assert.equal(sent[0][1], '/api/tasks'); assert.equal(sent[0][2].objective, 'faça isso'); assert.match(sent[0][2].requestId, /^mcp-[0-9a-f-]{36}$/);
  for (const a of [{ projectId: '../x', agentId: 'a1', objetivo: 'x' }, { projectId: 'p1', agentId: 'a1', objetivo: '   ' }, { projectId: 'p1', agentId: 'a1', objetivo: 'x'.repeat(8001) }]) {
    assert.equal((await on.handle(req(4, 'tools/call', { name: 'criar_tarefa', arguments: a }))).result.isError, true);
  }
  assert.equal(sent.length, 1, 'entradas inválidas nem chegam ao Code Room');
  await on.handle(req(5, 'tools/call', { name: 'cancelar_tarefa', arguments: { id: 'novo' } }));
  assert.deepEqual(sent[1].slice(0, 2), ['POST', '/api/tasks/novo/cancel']);
});

test('MCP: falhas de rede, token e servidor viram mensagens claras', async () => {
  const mk = (fetchImpl, token = 'x'.repeat(64)) => createMcp({ call: httpCall({ port: 4780, token }, fetchImpl) });
  const run = m => m.handle(req(1, 'tools/call', { name: 'status', arguments: {} }));
  assert.match(text(await run(mk(async () => { throw new Error('ECONNREFUSED'); }))), /não respondeu na porta 4780/);
  assert.match(text(await run(mk(async () => ({ status: 401, ok: false, json: async () => ({}) })))), /recusado ou revogado/);
  assert.match(text(await run(mk(async () => ({ status: 500, ok: false, json: async () => ({ error: 'quebrou' }) })))), /quebrou/);
  assert.match(text(await run(mk(async () => ({}), ''))), /ainda não foi ativado/);
  let seen; await run(mk(async (url, o) => { seen = [url, o.headers['X-Code-Room-Key']]; return { status: 200, ok: true, json: async () => STATE }; }, 'k'.repeat(64)));
  assert.equal(seen[0], 'http://127.0.0.1:4780/api/state', 'só fala com o próprio computador'); assert.equal(seen[1], 'k'.repeat(64));
});

test('MCP: configuração local — dados, porta e token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-mcpcfg-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'port.txt'), '4783\n'); await writeFile(join(dir, 'mcp-token'), 'abc\n');
    const c = resolveConfig({ CODE_ROOM_DATA: dir }, ROOT); assert.equal(c.port, 4783); assert.equal(c.token, 'abc'); assert.equal(c.dataDir, dir);
    assert.equal(resolveConfig({ CODE_ROOM_DATA: dir, CODE_ROOM_PORT: '5000', CODE_ROOM_TOKEN: 'zzz' }, ROOT).port, 5000);
    assert.equal(resolveConfig({ CODE_ROOM_DATA: dir, CODE_ROOM_PORT: '5000', CODE_ROOM_TOKEN: 'zzz' }, ROOT).token, 'zzz');
    assert.equal(resolveConfig({ CODE_ROOM_DATA: join(dir, 'vazio') }, ROOT).port, 4780, 'sem port.txt cai na 4780');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('MCP: ativar cria token próprio (não a chave principal), um só ativo, desativar revoga e apaga', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-mcpact-')), store = new Store(':memory:'), devices = new Devices(store);
  const ctx = { dataDir: dir, devices, node: 'C:/Arquivos/node.exe', script: 'C:/cr/server/mcp.mjs' };
  try {
    assert.equal(mcpInfo(ctx).active, false);
    const a = mcpActivate(ctx); assert.equal(a.active, true); assert.match(a.device.name, /^MCP · /);
    const tok = (await readFile(join(dir, 'mcp-token'), 'utf8')).trim(); assert.equal(tok.length, 64);
    assert.ok(devices.verify(tok, '127.0.0.1'), 'o token vale como aparelho');
    assert.ok(!JSON.stringify(a).includes(tok), 'o token nunca volta na resposta da API');
    assert.match(a.leitura.claude, /^claude mcp add code-room -- "C:\/Arquivos\/node\.exe" "C:\/cr\/server\/mcp\.mjs"$/); assert.match(a.escrita.claude, / --escrever$/);
    assert.deepEqual(JSON.parse(a.leitura.json).mcpServers['code-room'].args, ['C:/cr/server/mcp.mjs']); assert.deepEqual(JSON.parse(a.escrita.json).mcpServers['code-room'].args, ['C:/cr/server/mcp.mjs', '--escrever']);
    assert.match(a.leitura.codex, /\[mcp_servers\.code-room\]/);
    const b = mcpActivate(ctx); const tok2 = (await readFile(join(dir, 'mcp-token'), 'utf8')).trim();
    assert.notEqual(tok2, tok); assert.equal(devices.verify(tok, '127.0.0.1'), null, 'o token antigo foi revogado'); assert.equal(devices.list().length, 1);
    devices.createCode(); const outro = devices.redeem(devices.createCode().code, 'iPhone da Maria', '1.1.1.1'); assert.ok(outro.token);
    mcpDeactivate(ctx); assert.equal(mcpInfo(ctx).active, false); assert.equal(devices.verify(tok2, '127.0.0.1'), null);
    assert.ok(devices.verify(outro.token, '1.1.1.1'), 'outros aparelhos não são afetados');
    await assert.rejects(access(join(dir, 'mcp-token')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---- de ponta a ponta: servidor real + processo MCP real conversando por stdio ----
async function startServer() {
  const dir = await mkdtemp(join(tmpdir(), 'cr-mcpe2e-')), port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [join(ROOT, 'server', 'main.mjs')], { cwd: ROOT, env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, stdio: 'ignore' });
  let key = '';
  for (let i = 0; i < 80; i++) { try { key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(); if ((await fetch(`http://127.0.0.1:${port}/api/whoami`, { headers: { 'X-Code-Room-Key': key } })).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
  const api = async (path, body) => { const r = await fetch(`http://127.0.0.1:${port}/api/${path}`, { method: body ? 'POST' : 'GET', headers: { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  return { dir, port, child, key, api, stop: async () => { child.kill(); await new Promise(r => setTimeout(r, 300)); await rm(dir, { recursive: true, force: true }).catch(() => {}); } };
}
function talk(srv, args, msgs) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [join(ROOT, 'server', 'mcp.mjs'), ...args], { env: { ...process.env, CODE_ROOM_DATA: srv.dir, CODE_ROOM_PORT: String(srv.port) }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    const t = setTimeout(() => { p.kill(); rej(new Error('MCP travou: ' + err)); }, 20000);
    p.on('close', () => { clearTimeout(t); res({ lines: out.split('\n').filter(Boolean).map(l => JSON.parse(l)), err }); });
    for (const m of msgs) p.stdin.write(JSON.stringify(m) + '\n'); p.stdin.end();
  });
}

test('MCP de ponta a ponta: ativar pela API, conversar por stdio, token sem poder de dono, revogação', async () => {
  const srv = await startServer();
  try {
    const info = await srv.api('mcp'); assert.equal(info.body.active, false); assert.ok(info.body.script.endsWith('mcp.mjs'));
    const sem = await talk(srv, [], [req(1, 'tools/call', { name: 'status', arguments: {} })]);
    assert.match(sem.lines[0].result.content[0].text, /ainda não foi ativado/);
    const act = await srv.api('mcp/activate', {}); assert.equal(act.body.active, true);
    await srv.api('projects', { name: 'proj-mcp', path: srv.dir.replace(/\\/g, '/'), area: 'Programação' });
    await srv.api('agents', { name: 'Agente MCP', role: 'teste', room: 'Programação', provider: 'codex', model: '', instructions: '', mode: 'read', skillIds: [], capabilities: ['research'] });
    const r = await talk(srv, [], [req(1, 'initialize', { protocolVersion: '2025-06-18' }), { jsonrpc: '2.0', method: 'notifications/initialized' }, req(2, 'tools/list'), req(3, 'tools/call', { name: 'listar_projetos', arguments: {} }), req(4, 'tools/call', { name: 'listar_agentes', arguments: {} }), req(5, 'tools/call', { name: 'criar_tarefa', arguments: { projectId: 'x', agentId: 'y', objetivo: 'z' } })]);
    assert.equal(r.lines.length, 5, 'a notificação não gera resposta');
    const por = id => r.lines.find(l => l.id === id); // as respostas podem chegar fora de ordem
    assert.equal(por(1).result.serverInfo.name, 'code-room');
    assert.equal(por(2).result.tools.length, TOOLS.length, 'sem --escrever só há leitura');
    assert.match(por(3).result.content[0].text, /proj-mcp/); assert.match(por(4).result.content[0].text, /Agente MCP/);
    assert.equal(por(5).result.isError, true); assert.match(por(5).result.content[0].text, /somente leitura/);
    const w = await talk(srv, ['--escrever'], [req(1, 'tools/list')]); assert.equal(w.lines[0].result.tools.length, TOOLS.length + WRITE_TOOLS.length);
    // o token do MCP é de aparelho: não alcança o que é só do dono
    const tok = (await readFile(join(srv.dir, 'mcp-token'), 'utf8')).trim();
    const dono = await fetch(`http://127.0.0.1:${srv.port}/api/mcp`, { headers: { 'X-Code-Room-Key': tok } }); assert.equal(dono.status, 403);
    const ativ = await fetch(`http://127.0.0.1:${srv.port}/api/mcp/activate`, { method: 'POST', headers: { 'X-Code-Room-Key': tok, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(ativ.status, 403);
    await srv.api('mcp/deactivate', {});
    const depois = await talk(srv, [], [req(1, 'tools/call', { name: 'status', arguments: {} })]);
    assert.match(depois.lines[0].result.content[0].text, /ainda não foi ativado/);
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/api/state`, { headers: { 'X-Code-Room-Key': tok } })).status, 401, 'token revogado');
  } finally { await srv.stop(); }
});
