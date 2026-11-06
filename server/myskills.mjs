import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

// Skills criadas pelo Assistente (com aprovação) ficam em <dados>/minhas-skills/<nome>/SKILL.md e entram como pasta extra de skills.
export async function createSkillFile(store, dataDir, { name, description, instructions }) {
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(name)) throw new Error('Nome de skill inválido.');
  const base = join(dataDir, 'minhas-skills'), dir = join(base, name);
  if (existsSync(dir)) throw new Error(`Já existe a pasta da skill “${name}”.`);
  await mkdir(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${JSON.stringify(String(description).replace(/\s+/g, ' ').trim())}\n---\n\n${String(instructions).replace(/\r\n/g, '\n')}\n`, 'utf8');
  const cur = store.get('settings', 'skillRoots')?.roots || [], root = await realpath(base);
  if (!cur.includes(root)) store.put('settings', { id: 'skillRoots', roots: [...cur, root].slice(0, 10) });
  return { name, path: dir };
}
