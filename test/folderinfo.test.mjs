import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeFolder, folderLine } from '../server/folderinfo.mjs';
import { normalizeAction, stateSummary } from '../server/assistant.mjs';
import { tempDir } from './helpers.mjs';

test('resumo da pasta: só nomes e sinais, sem ler conteúdo; ignora ocultos e pesados; conta por tipo', async () => {
  const d = await tempDir('info'); mkdirSync(join(d, 'src')); mkdirSync(join(d, 'videos')); mkdirSync(join(d, 'node_modules', 'x'), { recursive: true }); mkdirSync(join(d, '.git')); mkdirSync(join(d, '.segredo'));
  writeFileSync(join(d, 'package.json'), '{"segredo":"abc"}'); writeFileSync(join(d, 'README.md'), 'x'); writeFileSync(join(d, 'src', 'a.ts'), 'x'); writeFileSync(join(d, 'videos', 'a.mp4'), 'x'); writeFileSync(join(d, 'videos', 'b.mov'), 'x'); writeFileSync(join(d, 'node_modules', 'x', 'm.js'), 'x'); writeFileSync(join(d, '.env'), 'TOKEN=1');
  const i = describeFolder(d); assert.equal(i.ok, true); assert.deepEqual(i.entries.sort(), ['README.md', 'package.json', 'src/', 'videos/']); assert.ok(i.signals.includes('Git') && i.signals.includes('Node/JavaScript (package.json)')); assert.equal(i.counts.video, 2); assert.equal(i.counts['código'], 1, 'node_modules não conta');
  const line = folderLine(i); assert.match(line, /Pasta: .*videos\//); assert.ok(!/segredo|TOKEN|\.env/.test(line), 'nada de conteúdo nem de ocultos');
  assert.equal(describeFolder(join(d, 'nao-existe')).ok, false); assert.equal(folderLine({ ok: false }), '');
});

test('importar_projeto: nome simples, caminho completo sem "..", sem repetir; o cartão mostra a pasta inteira', () => {
  const w = { agents: [], teams: [], projects: [{ id: 'p', name: 'Existente' }], connected: new Set(), skills: [] };
  const i = o => normalizeAction({ acao: 'importar_projeto', nome: 'Meu App', pasta: 'C:\\Projetos\\meu-app', ...o }, w);
  const ok = i({}); assert.equal(ok.valid, true); assert.deepEqual(ok.payload, { name: 'Meu App', path: 'C:\\Projetos\\meu-app', area: 'Geral' }); assert.ok(ok.summary.includes('C:\\Projetos\\meu-app'));
  assert.equal(i({ pasta: 'D:/dados/video' }).valid, true); assert.equal(i({ pasta: '\\\\servidor\\pasta' }).valid, true);
  for (const bad of ['meu-app', 'C:\\a\\..\\b', 'relativa/pasta', '', 'C:\\a|b', '/etc']) assert.equal(i({ pasta: bad }).valid, false, bad);
  assert.equal(i({ nome: 'a/b' }).valid, false); assert.equal(i({ nome: 'existente' }).valid, false);
  assert.match(stateSummary(w, w.projects, 'x', 'Meu App', 'Pasta: src/. Sinais: Git.'), /Projeto em foco[^\n]*Meu App\nPasta: src\/\. Sinais: Git\./);
});
