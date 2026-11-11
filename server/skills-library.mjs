import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESOURCE_ROOT = fileURLToPath(new URL('../resources/starter-skills/', import.meta.url));
const STARTERS = Object.freeze([
  { id: 'planejar-entrega', name: 'Planejar uma entrega', description: 'Transforma pedidos complexos em etapas curtas e verificáveis.' },
  { id: 'revisar-alteracoes', name: 'Revisar alterações', description: 'Procura bugs, riscos e regressões com evidências concretas.' },
  { id: 'pesquisa-com-fontes', name: 'Pesquisar com fontes', description: 'Organiza pesquisas verificáveis e separa fatos de inferências.' },
]);

const starterPath = (id, resourceRoot) => join(resourceRoot, id, 'SKILL.md');
const installedPath = (id, dataDir) => join(dataDir, 'minhas-skills', id, 'SKILL.md');

export async function listStarterSkills(dataDir, { resourceRoot = RESOURCE_ROOT } = {}) {
  return Promise.all(STARTERS.map(async skill => {
    const source = starterPath(skill.id, resourceRoot);
    try { await readFile(source, 'utf8'); } catch { return { ...skill, installed: false, available: false }; }
    return { ...skill, installed: existsSync(installedPath(skill.id, dataDir)), available: true };
  }));
}

export async function installStarterSkill(store, dataDir, id, { resourceRoot = RESOURCE_ROOT } = {}) {
  const skill = STARTERS.find(item => item.id === id);
  if (!skill) throw new Error('Skill inicial não encontrada.');
  const source = starterPath(skill.id, resourceRoot), content = await readFile(source, 'utf8');
  if (!/^---\r?\nname:\s*[-a-z0-9]+\r?\ndescription:\s*.+\r?\n---(?:\r?\n|$)/.test(content)) throw new Error('O arquivo desta skill está inválido.');

  const base = join(dataDir, 'minhas-skills'), dir = join(base, skill.id), file = join(dir, 'SKILL.md');
  await mkdir(base, { recursive: true });
  const root = await realpath(base), current = store.get('settings', 'skillRoots')?.roots || [];
  if (!current.includes(root) && current.length >= 10) throw new Error('Limite de 10 pastas de skills. Remova uma pasta extra em Configurações e tente de novo.');
  if (existsSync(dir)) throw new Error(`A skill “${skill.name}” já existe no seu computador; ela não foi substituída.`);

  await mkdir(dir); // sem recursive: não substitui nem segue uma pasta existente
  try { await writeFile(file, content, { encoding: 'utf8', flag: 'wx' }); }
  catch (error) { await rmdir(dir).catch(() => {}); throw new Error(`Não foi possível instalar a skill: ${error.message}`); }
  if (!current.includes(root)) store.put('settings', { id: 'skillRoots', roots: [...current, root] });
  return { id: skill.id, name: skill.name, path: dirname(file), installed: true };
}
