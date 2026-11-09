import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SyncIas } from '../server/sync-ias.mjs';
import { tempDir } from './helpers.mjs';

async function fakeHome() {
  const h = await tempDir('syncias');
  await mkdir(join(h, '.claude', 'skills', 'minha-skill', 'refs'), { recursive: true }); await writeFile(join(h, '.claude', 'skills', 'minha-skill', 'SKILL.md'), '---\nname: minha-skill\ndescription: Faz coisas úteis\n---\ncorpo'); await writeFile(join(h, '.claude', 'skills', 'minha-skill', 'refs', 'a.md'), 'x');
  await mkdir(join(h, '.claude', 'skills', 'ja-existe'), { recursive: true }); await writeFile(join(h, '.claude', 'skills', 'ja-existe', 'SKILL.md'), '---\nname: ja-existe\ndescription: d\n---');
  await mkdir(join(h, '.codex', 'skills', 'ja-existe'), { recursive: true }); await writeFile(join(h, '.codex', 'skills', 'ja-existe', 'SKILL.md'), 'ORIGINAL');
  await mkdir(join(h, '.gemini', 'config'), { recursive: true }); await writeFile(join(h, '.gemini', 'config', 'mcp_config.json'), JSON.stringify({ mcpServers: { velho: { command: 'x' } } }));
  await writeFile(join(h, '.claude.json'), JSON.stringify({ mcpServers: { 'flow-studio': { command: 'python', args: ['s.py'], env: { TOKEN: 'segredo-123' } }, remoto: { type: 'http', url: 'https://x.dev/mcp', headers: { Authorization: 'Bearer abc' } } } }));
  return h;
}

test('visão geral: skills e MCP do Claude, onde já estão, sem vazar env nem cabeçalhos', async () => {
  const h = await fakeHome(), s = new SyncIas({ home: h, codexPath: 'codex.exe', run: async () => ({ ok: false, out: '', err: '' }) }), o = await s.overview();
  assert.deepEqual(o.targets.map(t => [t.id, t.available]), [['codex', true], ['agy', true]]);
  assert.deepEqual(o.skills.map(x => x.name), ['ja-existe', 'minha-skill']); assert.equal(o.skills[1].description, 'Faz coisas úteis'); assert.equal(o.skills[0].in.codex, true); assert.equal(o.skills[1].in.codex, false);
  assert.deepEqual(o.mcps.map(x => [x.name, x.kind]), [['flow-studio', 'stdio'], ['remoto', 'http']]); assert.ok(!JSON.stringify(o).includes('segredo-123') && !JSON.stringify(o).includes('Bearer'));
});

test('instalar skill: copia a pasta, nunca sobrescreve, recusa nome inválido', async () => {
  const h = await fakeHome(), s = new SyncIas({ home: h }), r = (await s.apply({ targets: ['codex', 'agy'], skills: ['minha-skill', 'ja-existe', '../x'] })).results;
  const f = (ai, item) => r.find(x => x.ai === ai && x.item === item);
  assert.equal(f('Codex', 'minha-skill').ok, true); assert.equal(await readFile(join(h, '.codex', 'skills', 'minha-skill', 'refs', 'a.md'), 'utf8'), 'x'); assert.ok(existsSync(join(h, '.gemini', 'config', 'skills', 'minha-skill', 'SKILL.md')));
  assert.equal(f('Codex', 'ja-existe').skipped, true); assert.equal(await readFile(join(h, '.codex', 'skills', 'ja-existe', 'SKILL.md'), 'utf8'), 'ORIGINAL'); assert.equal(f('Codex', '../x').ok, false);
  await assert.rejects(s.apply({ targets: [], skills: ['a'] }), /pelo menos uma IA/); await assert.rejects(s.apply({ targets: ['codex'] }), /skill ou servidor/);
});

test('instalar MCP: Codex pelo comando (env sem aparecer na tela), Antigravity pelo arquivo com backup; remoto com token não é copiado às cegas', async () => {
  const h = await fakeHome(), calls = [], have = new Set();
  const run = async (f, a) => { calls.push(a); if (a[1] === 'get') return { ok: have.has(a[2]), out: '', err: '' }; have.add(a[2]); return { ok: true, out: '', err: '' }; };
  const s = new SyncIas({ home: h, codexPath: 'codex.exe', run }), r = (await s.apply({ targets: ['codex', 'agy'], mcps: ['flow-studio', 'remoto'] })).results, f = (ai, item) => r.find(x => x.ai === ai && x.item === item);
  assert.equal(f('Codex', 'flow-studio').ok, true); const add = calls.find(a => a[1] === 'add'); assert.deepEqual(add.slice(0, 6), ['mcp', 'add', 'flow-studio', '--env', 'TOKEN=segredo-123', '--']); assert.deepEqual(add.slice(6), ['python', 's.py']);
  assert.equal(f('Codex', 'remoto').ok, false); assert.match(f('Codex', 'remoto').note, /token/);
  assert.equal(f('Antigravity (Gemini)', 'flow-studio').ok, true); const cfg = JSON.parse(await readFile(join(h, '.gemini', 'config', 'mcp_config.json'), 'utf8')); assert.equal(cfg.mcpServers.velho.command, 'x'); assert.equal(cfg.mcpServers['flow-studio'].command, 'python');
  assert.ok((await readdir(join(h, '.gemini', 'config'))).some(n => n.includes('.code-room-backup-')), 'backup feito');
  assert.equal(f('Antigravity (Gemini)', 'remoto').ok, false);
  const again = (await s.apply({ targets: ['agy'], mcps: ['flow-studio'] })).results[0]; assert.equal(again.skipped, true);
});
