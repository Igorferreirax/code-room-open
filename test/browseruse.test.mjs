import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, addProject, addAgent } from './helpers.mjs';
import { createTask } from '../server/tasks.mjs';
import { cleanBrowser, claudeBrowserArgs, codexBrowserArgs, browserNote, PLAYWRIGHT_ARGS, BROWSER_MODES, playwrightServer, findLocalPlaywright } from '../server/browseruse.mjs';
import { command, connectors } from '../server/connectors.mjs';

test('navegador: desligado por padrão; combinações inválidas são recusadas com motivo claro', () => {
  assert.deepEqual(BROWSER_MODES, ['off', 'isolado', 'chrome']);
  for (const v of [undefined, null, '', 'off']) assert.equal(cleanBrowser(v, 'claude'), 'off');
  assert.equal(cleanBrowser('isolado', 'claude'), 'isolado'); assert.equal(cleanBrowser('isolado', 'codex'), 'isolado'); assert.equal(cleanBrowser('chrome', 'claude'), 'chrome');
  assert.throws(() => cleanBrowser('chrome', 'codex'), /só funciona com o Claude Code/);
  assert.throws(() => cleanBrowser('isolado', 'agy'), /Claude Code ou o Codex/); assert.throws(() => cleanBrowser('isolado', 'hermes'), /Claude Code ou o Codex/);
  assert.equal(cleanBrowser('off', 'hermes'), 'off', 'desligado vale para qualquer IA');
  for (const bad of ['sim', 'ISOLADO', 'true', 1, {}, '--chrome']) assert.throws(() => cleanBrowser(bad, 'claude'), /Navegador inválido/);
});

test('navegador: Claude Code — separado usa só o Playwright descartável; "meu Chrome" é explícito; desligado não acrescenta nada', () => {
  assert.deepEqual(claudeBrowserArgs('off'), []); assert.deepEqual(claudeBrowserArgs(undefined), []); assert.deepEqual(claudeBrowserArgs('lixo'), []);
  const NPX = { command: 'npx', args: PLAYWRIGHT_ARGS }, a = claudeBrowserArgs('isolado', NPX);
  assert.ok(a.includes('--strict-mcp-config'), 'as outras ferramentas MCP do seu Claude não vão junto');
  const cfg = JSON.parse(a[a.indexOf('--mcp-config') + 1]);
  assert.deepEqual(cfg.mcpServers.playwright, { command: 'npx', args: PLAYWRIGHT_ARGS }); assert.ok(PLAYWRIGHT_ARGS.includes('--isolated'), 'perfil descartável, sem suas contas');
  assert.equal(a[a.indexOf('--allowedTools') + 1], 'mcp__playwright'); assert.ok(!a.includes('--chrome'));
  const c = claudeBrowserArgs('chrome'); assert.deepEqual(c, ['--chrome', '--allowedTools', 'mcp__claude-in-chrome']);
});

test('navegador: Codex — separado entra por -c só nesta execução; outros modos não acrescentam nada', () => {
  assert.deepEqual(codexBrowserArgs('off'), []); assert.deepEqual(codexBrowserArgs('chrome'), [], 'Chrome real não existe para o Codex'); assert.deepEqual(codexBrowserArgs(undefined), []);
  assert.deepEqual(codexBrowserArgs('isolado', { command: 'npx', args: PLAYWRIGHT_ARGS }), ['-c', 'mcp_servers.playwright.command="npx"', '-c', 'mcp_servers.playwright.args=["-y","@playwright/mcp@latest","--isolated"]']);
});

test('navegador: o aviso no histórico da tarefa diz qual navegador foi liberado', () => {
  assert.equal(browserNote('off'), ''); assert.equal(browserNote(undefined), '');
  assert.match(browserNote('isolado'), /Navegador liberado: navegador separado/); assert.match(browserNote('chrome'), /o seu Chrome/);
});

test('navegador: projeto Financeiro não aceita agente com navegador (página maliciosa poderia levar os dados)', async () => {
  const { store } = await setup(); const fin = await addProject(store, 'fin', 'Financeiro'), geral = await addProject(store, 'geral', 'Geral');
  const com = addAgent(store, 'com', { provider: 'claude', browser: 'isolado' }), sem = addAgent(store, 'sem', { provider: 'claude', browser: 'off' }), antigo = addAgent(store, 'antigo', { provider: 'claude' });
  const mk = (p, a, i) => createTask(store, { projectId: p.id, agentId: a.id, requestId: 'x' + i, objective: 'faça' });
  assert.throws(() => mk(fin, com, 1), /Projeto financeiro: agentes com navegador não são permitidos/);
  assert.ok(mk(fin, sem, 2).task, 'sem navegador continua valendo'); assert.ok(mk(fin, antigo, 3).task, 'agente antigo (sem o campo) continua valendo');
  assert.ok(mk(geral, com, 4).task, 'em outras áreas vale');
});

test('MCP por agente: projeto Financeiro recusa agente com ferramentas MCP; sem MCP e em outras áreas continua valendo', async () => {
  const { store } = await setup(); const fin = await addProject(store, 'fin', 'Financeiro'), geral = await addProject(store, 'geral', 'Geral');
  const mcp = addAgent(store, 'mcp', { provider: 'claude', mcpTools: ['flow-studio'] }), sem = addAgent(store, 'sem', { provider: 'claude', mcpTools: [] });
  const mk = (p, a, i) => createTask(store, { projectId: p.id, agentId: a.id, requestId: 'm' + i, objective: 'faça' });
  assert.throws(() => mk(fin, mcp, 1), /Projeto financeiro: agentes com ferramentas MCP externas não são permitidos/);
  assert.ok(mk(fin, sem, 2).task); assert.ok(mk(geral, mcp, 3).task);
});

// Integração com o comando real: só roda onde o Claude Code e o Codex estão instalados.
const has = id => !!connectors().find(c => c.id === id)?.path;
test('navegador: comando do Claude Code leva os argumentos certos e nunca o navegador por padrão', { skip: !has('claude') && 'Claude Code não instalado aqui' }, () => {
  const base = command({ provider: 'claude', mode: 'read' }, 'oi');
  assert.ok(!base.args.includes('--chrome') && !base.args.includes('--mcp-config') && !base.args.some(a => /playwright/.test(a)), 'padrão: nenhum navegador');
  const iso = command({ provider: 'claude', mode: 'read', browser: 'isolado' }, 'oi'); assert.ok(iso.args.includes('--strict-mcp-config') && iso.args.includes('mcp__playwright'));
  assert.equal(iso.args[iso.args.indexOf('--permission-mode') + 1], 'acceptEdits', 'o navegador precisa funcionar sem aprovações durante a tarefa');
  assert.equal(iso.args[iso.args.indexOf('--disallowedTools') + 1], 'Edit,Write,NotebookEdit,Bash,PowerShell', 'um agente de leitura não ganha edição de arquivos ou terminal');
  const chr = command({ provider: 'claude', mode: 'read', browser: 'chrome' }, 'oi'); assert.ok(chr.args.includes('--chrome'));
  assert.equal(chr.args[chr.args.indexOf('--permission-mode') + 1], 'acceptEdits');
});
test('navegador: comando do Codex leva o Playwright só quando liberado', { skip: !has('codex') && 'Codex não instalado aqui' }, () => {
  const base = command({ provider: 'codex', mode: 'read' }, 'oi'); assert.ok(!base.args.some(a => /mcp_servers/.test(a)));
  const iso = command({ provider: 'codex', mode: 'read', browser: 'isolado' }, 'oi'); assert.ok(iso.args.some(a => /^mcp_servers\.playwright\.command="/.test(a)), 'o servidor do Playwright entra (node com cópia local, ou npx)');
  assert.equal(iso.args.at(-1), '-', 'o prompt continua vindo pela entrada padrão');
});

test('navegador: usa a cópia local do Playwright MCP (sobe em segundos); sem cópia, cai no npx; o caminho vai citado ao Codex', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'pw-')); try {
    assert.equal(findLocalPlaywright({ env: { LOCALAPPDATA: dir, APPDATA: dir }, home: dir }), null);
    assert.deepEqual(playwrightServer(() => null), { command: 'npx', args: PLAYWRIGHT_ARGS, local: false });
    const cli = join(dir, 'npm-cache', '_npx', 'abc', 'node_modules', '@playwright', 'mcp', 'cli.js'); await mkdir(join(cli, '..'), { recursive: true }); await writeFile(cli, '// x');
    assert.equal(findLocalPlaywright({ env: { LOCALAPPDATA: dir }, home: dir }), cli);
    const srv = playwrightServer(() => cli); assert.equal(srv.command, process.execPath); assert.deepEqual(srv.args, [cli, '--isolated']); assert.equal(srv.local, true);
    const a = claudeBrowserArgs('isolado', srv); assert.deepEqual(JSON.parse(a[a.indexOf('--mcp-config') + 1]).mcpServers.playwright, { command: process.execPath, args: [cli, '--isolated'] });
    const c = codexBrowserArgs('isolado', srv); assert.equal(c[1], 'mcp_servers.playwright.command=' + JSON.stringify(process.execPath)); assert.equal(JSON.parse(c[3].split('args=')[1])[1], '--isolated');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
