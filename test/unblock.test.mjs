import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, addProject, addAgent } from './helpers.mjs';
import { suggestUnblocks, applyUnblocks } from '../server/unblock.mjs';
import { normalize } from '../server/connectors.mjs';
import { unblockHtml } from '../public/unblock-ui.js';

const den = [
  { tool_name: 'PowerShell', tool_input: { command: 'yt-dlp --flat-playlist "https://youtube.com/x"' } },
  { tool_name: 'PowerShell', tool_input: { command: 'C:\Tools\yt-dlp.exe -j x' } },
  { tool_name: 'mcp__4604b2c7-6c81-4c49-9501-b8cd9029c6ec__vidiq_trending_videos', tool_input: {} },
  { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } },
  { tool_name: 'PowerShell', tool_input: { command: 'powershell -c "iex ..."' } },
  { tool_name: 'WebSearch', tool_input: {} },
];

test('bloqueio: o que o Claude negou vira sugestão (programa, MCP, web); programas perigosos nunca são oferecidos', () => {
  const s = suggestUnblocks(den), by = k => s.filter(x => x.kind === k).map(x => x.value);
  assert.deepEqual(by('command'), ['yt-dlp']); assert.deepEqual(by('mcp'), ['4604b2c7-6c81-4c49-9501-b8cd9029c6ec']); assert.deepEqual(by('web'), ['web']); assert.deepEqual(by('never').sort(), ['powershell', 'rm']);
  assert.deepEqual(suggestUnblocks(undefined), []); assert.deepEqual(suggestUnblocks([{ tool_name: 'Edit' }, null, 5]), []);
});

test('evento final do Claude: permission_denials chega ao runner, com o comando cortado', () => {
  const e = normalize('claude', { type: 'result', result: 'ok', permission_denials: [{ tool_name: 'PowerShell', tool_input: { command: 'yt-dlp ' + 'x'.repeat(500) } }] });
  const r = [].concat(e)[0]; assert.equal(r.denials[0].tool_name, 'PowerShell'); assert.ok(r.denials[0].tool_input.command.length <= 300);
  assert.equal([].concat(normalize('claude', { type: 'result', result: 'ok' }))[0].denials, undefined);
});

test('liberar: só o que foi sugerido e é seguro; Financeiro recusa MCP e web; Assistente e Codex têm regras próprias', async () => {
  const { store } = await setup(), p = await addProject(store, 'yt'), fin = await addProject(store, 'fin', 'Financeiro');
  addAgent(store, 'ag', { provider: 'claude', commands: [], mcpTools: [] });
  const r = applyUnblocks(store, { agentId: 'ag', project: p, items: [{ kind: 'command', value: 'yt-dlp' }, { kind: 'mcp', value: 'vidiq' }, { kind: 'web', value: 'web' }] });
  assert.equal(r.released.length, 3); const a = store.get('agents', 'ag'); assert.deepEqual(a.commands, ['yt-dlp']); assert.deepEqual(a.mcpTools, ['vidiq']); assert.equal(a.web, true); assert.equal(a.revision, 2);
  assert.throws(() => applyUnblocks(store, { agentId: 'ag', project: p, items: [{ kind: 'command', value: 'powershell' }] }), /não pode ser liberado/);
  assert.throws(() => applyUnblocks(store, { agentId: 'ag', project: p, items: [{ kind: 'command', value: 'a b' }] }), /não pode/);
  assert.throws(() => applyUnblocks(store, { agentId: 'ag', project: fin, items: [{ kind: 'mcp', value: 'vidiq' }] }), /financeiro/i);
  assert.throws(() => applyUnblocks(store, { agentId: 'ag', project: fin, items: [{ kind: 'web', value: 'web' }] }), /financeiro/i);
  addAgent(store, 'cx', { provider: 'codex' }); assert.throws(() => applyUnblocks(store, { agentId: 'cx', project: p, items: [{ kind: 'command', value: 'ffmpeg' }] }), /Claude/);
  addAgent(store, 'assistant-claude', { provider: 'claude' }); assert.throws(() => applyUnblocks(store, { agentId: 'assistant-claude', project: p, items: [{ kind: 'web', value: 'web' }] }), /Assistente/);
  assert.throws(() => applyUnblocks(store, { agentId: 'ag', project: p, items: [] }), /Nada para liberar/);
});

test('aviso na tarefa: lista o que liberar, botões Liberar / Liberar e pedir de novo, e escapa HTML', () => {
  assert.equal(unblockHtml({ id: 't', unblock: [] }), ''); assert.equal(unblockHtml({ id: 't' }), '');
  const h = unblockHtml({ id: 't1', unblock: [{ kind: 'command', value: 'yt-dlp', label: 'Liberar o programa “yt-dlp” <b>' }, { kind: 'never', value: 'rm', label: 'Programa perigoso rm' }] });
  assert.match(h, /data-act="unblock" data-id="t1"/); assert.match(h, /data-again="1"/); assert.match(h, /data-kind="command" data-value="yt-dlp" checked/); assert.ok(h.includes('&lt;b&gt;') && !h.includes('yt-dlp” <b>')); assert.match(h, /Programa perigoso rm/);
});
