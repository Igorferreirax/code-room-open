import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const pub = join(process.cwd(), 'public');
const read = f => readFileSync(join(pub, f), 'utf8');

test('interface: todos os módulos JS têm sintaxe válida', () => {
  for (const f of readdirSync(pub).filter(f => f.endsWith('.js'))) execFileSync(process.execPath, ['--check', join(pub, f)]);
});

test('interface: cada data-act usado nas telas tem ação em app.js', () => {
  const views = ['views.js', 'views2.js', 'photo-office.js', 'index.html'].map(read).join('\n');
  const used = new Set([...views.matchAll(/data-act="([a-z-]+)"/g)].map(m => m[1]));
  const app = read('app.js');
  const block = app.slice(app.indexOf('const actions = {'), app.indexOf('async function saveRoutine'));
  const handledElsewhere = new Set(['skill-agent']); // tratado no evento "change"
  const missing = [...used].filter(a => !handledElsewhere.has(a) && !new RegExp(`(^|[\\s,{])'?${a}'?\\s*:`).test(block));
  assert.deepEqual(missing, [], `ações sem tratamento: ${missing.join(', ')}`);
});

test('interface: todas as telas estão na navegação e ligadas a uma função, e todo formulário tem tratamento', () => {
  const views = read('views.js'), app = read('app.js');
  const screens = ['room', 'projects', 'tasks', 'teams', 'agents', 'deliveries', 'skills', 'usage', 'routines', 'connections', 'settings'];
  for (const s of screens) {
    assert.ok(views.includes(`['${s}', `), `falta item de navegação: ${s}`);
    assert.ok(new RegExp(`${s}: [VW]\\.view`).test(app), `falta a tela: ${s}`);
  }
  const forms = new Set([...(views + read('views2.js') + read('index.html')).matchAll(/<form[^>]*id="([a-z-]+)"/g)].map(m => m[1]));
  for (const f of forms) assert.ok(app.includes(`fid === '${f}'`), `formulário sem tratamento: ${f}`);
});

test('interface: imagens referenciadas existem em public/assets', () => {
  const src = ['art.js', 'views.js', 'views2.js', 'photo-office.js'].map(read).join('\n');
  const names = new Set([...src.matchAll(/\/assets\/([a-z0-9-]+\.(?:png|jpg))/g)].map(m => m[1]));
  const dynamic = ['ban-conexoes', 'ban-agentes', 'ban-projetos', 'ban-equipes', 'ban-execucao', 'ban-skills', 'ban-entregas', 'ban-consumo', 'ban-rotinas', 'thumb-dev', 'thumb-video', 'thumb-finance', 'thumb-research', 'theme-noite', 'theme-amanhecer', 'theme-minimal', 'avatar-dev', 'avatar-revisor', 'avatar-editor', 'avatar-supervisor'].map(n => n + '.png');
  for (const n of [...names, ...dynamic]) assert.ok(existsSync(join(pub, 'assets', n)), `imagem ausente: ${n}`);
});
