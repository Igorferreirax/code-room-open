import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { Assistant, buildPrompt } from '../server/assistant.mjs';
import { assistantHtml } from '../public/assistant-ui.js';
import { command } from '../server/connectors.mjs';
import { decodeChatImage } from '../server/chat-image.mjs';
import { existsSync } from 'node:fs';
import { tempDir } from './helpers.mjs';

const world = async () => ({ agents: [], teams: [], links: [], projects: [], skills: [], connected: new Set(['claude']), runs: [], flows: [], folderJobs: [] });
async function make() {
  const dir = await tempDir('asst-pilot'), store = new Store(':memory:'), tasks = [];
  store.put('projects', { id: 'pj1', name: 'Achadinhos', path: dir, area: 'Vídeo' });
  store.put('projects', { id: 'pjf', name: 'Contas', path: dir, area: 'Financeiro' });
  const asst = new Assistant({ store, root: process.cwd(), dataDir: dir, world, mcpFn: () => ['flow-studio', 'notion'], createTaskFn: (_s, t) => { tasks.push(t); return { task: { id: 't' + tasks.length, ...t } }; } });
  store.put('settings', { id: 'assistant', provider: 'claude', briefedAt: 'x', manualHash: null, knowledge: 'ok', thread: { id: 't1', title: 'Conversa 1' }, order: ['t1'], others: [], messages: [], pending: null });
  return { asst, store, tasks };
}

test('modo piloto: ligado por padrão; em consulta, só leitura; ligado, o agente interno vira escrita com programas, MCP e Chrome; desligado de novo, volta a só leitura', async () => {
  const { asst, store, tasks } = await make();
  assert.equal((await asst.status()).autonomy, 'pilot', 'o Nico executa por padrão');
  await asst.setAutonomy('ask'); await asst.ask('oi');
  let ag = store.get('agents', 'assistant-claude');
  assert.equal(ag.mode, 'read'); assert.deepEqual(ag.mcpTools, []); assert.equal(ag.browser, 'off');
  assert.equal(tasks[0].projectId, 'assistant-internal'); assert.match(tasks[0].objective, /SOMENTE LEITURA/);

  store.put('settings', { ...store.get('settings', 'assistant'), pending: null });
  assert.equal((await asst.setAutonomy('pilot')).autonomy, 'pilot');
  await asst.ask('faça o reel', { projectId: 'pj1' });
  ag = store.get('agents', 'assistant-claude');
  assert.equal(ag.mode, 'write'); assert.deepEqual(ag.mcpTools, ['flow-studio', 'notion']); assert.equal(ag.browser, 'chrome'); assert.ok(ag.commands.includes('node') && ag.commands.includes('ffmpeg'));
  assert.equal(tasks[1].projectId, 'pj1', 'trabalha na pasta do projeto em foco');
  assert.match(tasks[1].objective, /MODO PILOTO/); assert.doesNotMatch(tasks[1].objective, /SOMENTE LEITURA/);
  assert.match(tasks[1].objective, /NUNCA publique/); assert.equal(tasks[1].limits.timeoutMs, 20 * 60 * 1000);

  store.put('settings', { ...store.get('settings', 'assistant'), pending: null });
  await asst.setAutonomy('ask'); await asst.ask('de novo');
  ag = store.get('agents', 'assistant-claude'); assert.equal(ag.mode, 'read'); assert.deepEqual(ag.mcpTools, []); assert.equal(ag.browser, 'off');
});

test('chat: print PNG validado entra como arquivo local na tarefa e nos comandos das IAs', async () => {
  const { asst, store, tasks } = await make();
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRwAAAABJRU5ErkJggg==';
  assert.equal(decodeChatImage(image).ext, 'png');
  await asst.ask('Leia o erro do print', { image });
  const path = tasks[0].imagePath;
  assert.ok(existsSync(path)); assert.match(tasks[0].objective, /PRINT ANEXADO/);
  assert.equal((await asst.status()).messages.find(m => m.role === 'user')?.hasImage, true);
  const catalog = ['codex', 'claude', 'agy'].map(id => ({ id, path: id }));
  const opts = { catalog, cwd: 'C:/projeto', imagePath: path };
  const codex = command({ provider: 'codex', mode: 'read' }, 'oi', opts);
  assert.equal(codex.args[codex.args.indexOf('--image') + 1], path);
  for (const provider of ['claude', 'agy']) {
    const args = command({ provider, mode: 'read' }, 'oi', opts).args;
    assert.ok(args.includes('--add-dir') && args.includes(path.slice(0, path.lastIndexOf('\\'))), provider);
  }
  store.put('settings', { ...store.get('settings', 'assistant'), pending: null });
  await assert.rejects(() => asst.ask('inválido', { image: 'data:image/png;base64,YWJj' }), /conteúdo|formato/i);
});

test('chat geral: Modo Piloto aceita pasta externa por autorização pontual, sem projeto em foco', async () => {
  const { asst, store, tasks } = await make();
  await asst.setAutonomy('pilot');
  const dir = process.cwd();
  await asst.ask('Organize esta pasta', { extraDir: dir });
  assert.equal(tasks[0].projectId, 'assistant-internal');
  assert.equal(tasks[0].extraDir, dir);
});

test('modo piloto: projeto financeiro em foco responde em consulta, valor inválido e troca com resposta em andamento', async () => {
  const { asst, store } = await make();
  await asst.setAutonomy('pilot');
  const local = await asst.ask('/status', { projectId: 'pjf' }); assert.equal(local.messages.at(-1).local, true, 'comandos locais continuam disponíveis em projeto financeiro');
  store.put('settings', { ...store.get('settings', 'assistant'), pending: null });
  await asst.ask('x', { projectId: 'pjf' }); assert.equal(store.get('agents', 'assistant-claude').mode, 'read', 'Financeiro em foco: responde em consulta, sem ferramentas externas');
  store.put('settings', { ...store.get('settings', 'assistant'), pending: null });
  await assert.rejects(() => asst.setAutonomy('tudo'), /inválido/i);
  store.put('settings', { ...store.get('settings', 'assistant'), pending: { kind: 'ask', taskId: 'z' } });
  await assert.rejects(() => asst.setAutonomy('ask'), /Aguarde/);
});

test('modo piloto: o prompt troca as regras e a tela mostra o botão certo', () => {
  const p = buildPrompt({ manual: 'm', knowledge: 'k', summary: 's', question: 'q', pilot: true });
  assert.match(p, /MODO PILOTO/);
  const base = { connected: ['claude'], manual: { available: true }, briefed: true, messages: [], alerts: [], provider: 'claude' };
  assert.doesNotMatch(assistantHtml({ ...base, autonomy: 'ask' }), /as-pilot-note|asst-autonomy/);
  const on = assistantHtml({ ...base, autonomy: 'pilot' }); assert.match(on, /class="as-pilot-note"[^>]*>.*Piloto ligado/); assert.ok(!on.includes('asst-autonomy'), 'o interruptor fica só no cabeçalho do chat');
});

test('modo piloto: o comando do Claude libera escrita, os programas, o MCP e o Chrome', async () => {
  const { asst, store } = await make();
  await asst.setAutonomy('pilot'); await asst.ask('oi');
  const options = { catalog: [{ id: 'claude', path: 'claude-test' }] };
  const args = command(store.get('agents', 'assistant-claude'), 'oi', options).args || [];
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'acceptEdits');
  for (const t of ['Bash(node:*)', 'PowerShell(ffmpeg:*)', 'mcp__flow-studio', 'mcp__notion', 'mcp__claude-in-chrome']) assert.ok(args.includes(t), t);
  assert.ok(args.includes('--chrome')); assert.ok(args.includes('Skill'), 'libera a ferramenta Skill');
  assert.ok(!(command({ provider: 'claude', mode: 'read', commands: [], browser: 'off' }, 'oi', options).args || []).includes('Skill'), 'agente comum não ganha Skill');
  assert.ok(!args.some(a => /Remove-Item|rm:|del:/.test(String(a))), 'não libera apagar');
});
