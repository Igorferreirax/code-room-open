import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frontmatter, scanSkills, usable } from '../server/skills.mjs';

const MD = '---\nname: minha-skill\ndescription: Faz uma coisa útil.\nuser-invocable: true\n---\n\n# /minha-skill\n';

test('cabeçalho da skill: lê normalmente, com fim de linha do Windows e com BOM (byte invisível do Bloco de Notas / PowerShell 5)', () => {
  for (const [nome, texto] of [['normal', MD], ['CRLF', MD.replace(/\n/g, '\r\n')], ['BOM', '\uFEFF' + MD], ['BOM + CRLF', '\uFEFF' + MD.replace(/\n/g, '\r\n')]]) {
    const fm = frontmatter(texto); assert.ok(fm, nome); assert.equal(fm.name, 'minha-skill', nome); assert.equal(fm.description, 'Faz uma coisa útil.', nome);
  }
  assert.equal(frontmatter('# sem cabeçalho\n'), null); assert.equal(frontmatter('\uFEFF# sem cabeçalho\n'), null);
});

test('varredura: skill com BOM é reconhecida e utilizável (antes era bloqueada como "não reconhecida")', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cr-skill-')), root = join(dir, 'raiz'); mkdirSync(join(root, 'com-bom'), { recursive: true }); mkdirSync(join(root, 'sem-bom'), { recursive: true }); mkdirSync(join(root, 'sem-cabecalho'), { recursive: true });
  writeFileSync(join(root, 'com-bom', 'SKILL.md'), '\uFEFF' + MD.replace('minha-skill', 'com-bom').replace('/minha-skill', '/com-bom')); writeFileSync(join(root, 'sem-bom', 'SKILL.md'), MD.replace('minha-skill', 'sem-bom'));
  writeFileSync(join(root, 'sem-cabecalho', 'SKILL.md'), '# só um título\n');
  const skills = await scanSkills(dir, { extraRoots: [root] }), by = n => skills.find(s => s.name === n);
  assert.ok(by('com-bom')?.recognized, 'com BOM'); assert.ok(by('sem-bom')?.recognized); assert.equal(by('sem-cabecalho')?.recognized, false, 'sem cabeçalho continua não reconhecida');
  assert.equal(usable(by('com-bom'), 'claude').blocked, undefined, 'a skill com BOM pode ser usada'); assert.ok(usable(by('sem-cabecalho'), 'claude').blocked, 'a sem cabeçalho continua bloqueada');
});
