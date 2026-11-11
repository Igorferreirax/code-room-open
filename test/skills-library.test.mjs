import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installStarterSkill, listStarterSkills } from '../server/skills-library.mjs';
import { scanSkills } from '../server/skills.mjs';
import { Store } from '../server/store.mjs';
import { tempDir } from './helpers.mjs';

test('biblioteca lista só as três skills iniciais genéricas empacotadas', async () => {
  const data = await tempDir('starter-skills-list');
  const skills = await listStarterSkills(data);
  assert.deepEqual(skills.map(s => s.id), ['planejar-entrega', 'revisar-alteracoes', 'pesquisa-com-fontes']);
  assert.ok(skills.every(s => s.available && !s.installed));
  assert.ok(skills.every(s => !JSON.stringify(s).match(/igor|causo|youtube|codex/i)), 'catálogo não inclui nomes ou preferências pessoais');
});

test('instala skill inicial sem sobrescrever, registra a pasta e a skill é reconhecida', async () => {
  const data = await tempDir('starter-skills-install'), store = new Store(':memory:');
  const result = await installStarterSkill(store, data, 'revisar-alteracoes');
  const file = join(result.path, 'SKILL.md'), original = readFileSync(file, 'utf8');
  assert.equal(result.installed, true); assert.match(original, /name: revisar-alteracoes/);
  assert.deepEqual(store.get('settings', 'skillRoots').roots, [join(data, 'minhas-skills')]);
  assert.ok((await listStarterSkills(data)).find(s => s.id === result.id).installed);
  const found = (await scanSkills(undefined, { extraRoots: store.get('settings', 'skillRoots').roots })).find(s => s.name === result.id);
  assert.ok(found?.recognized);
  await assert.rejects(() => installStarterSkill(store, data, result.id), /já existe/);
  assert.equal(readFileSync(file, 'utf8'), original, 'a segunda tentativa não altera o arquivo instalado');
});

test('biblioteca valida o catálogo e não instala acima do limite de pastas de skills', async () => {
  const data = await tempDir('starter-skills-limit'), store = new Store(':memory:');
  await assert.rejects(() => installStarterSkill(store, data, '../pessoal'), /não encontrada/);
  store.put('settings', { id: 'skillRoots', roots: Array.from({ length: 10 }, (_, i) => `C:\\skills-${i}`) });
  await assert.rejects(() => installStarterSkill(store, data, 'planejar-entrega'), /Limite de 10/);
  assert.equal(existsSync(join(data, 'minhas-skills', 'planejar-entrega')), false);
});

test('uma pasta existente com o nome da skill é considerada instalada e preservada', async () => {
  const data = await tempDir('starter-skills-collision'), store = new Store(':memory:'), dir = join(data, 'minhas-skills', 'pesquisa-com-fontes');
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'SKILL.md'), 'skill local da pessoa\n');
  assert.equal((await listStarterSkills(data)).find(s => s.id === 'pesquisa-com-fontes').installed, true);
  await assert.rejects(() => installStarterSkill(store, data, 'pesquisa-com-fontes'), /já existe/);
  assert.equal(readFileSync(join(dir, 'SKILL.md'), 'utf8'), 'skill local da pessoa\n');
});
