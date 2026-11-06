import { readdir, readFile, realpath, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';

const SOURCES = ['.agents', '.codex', '.claude'];
const PROVIDERS = { '.agents': ['codex', 'claude'], '.codex': ['codex'], '.claude': ['claude'], '.extra': ['codex', 'claude'] };

function onPath(name) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return (process.env.PATH || '').split(delimiter).some(d => exts.some(x => d && existsSync(join(d, name + x))));
}

function frontmatter(body) {
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) { const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/); if (kv) fields[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2'); }
  return fields;
}

function listField(value) {
  return (value || '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

// Devolve uma entrada por arquivo SKILL.md encontrado, com o resultado de cada verificação.
export async function scanSkills(projectPath, { limit = 1200, extraRoots = [] } = {}) {
  const roots = SOURCES.map(s => ({ dir: join(homedir(), s, 'skills'), source: s, scope: 'user' }));
  // Skills de plugins do Claude Code (cache e sincronizados): ficam mais fundo na árvore.
  for (const sub of ['cache', 'synced']) roots.push({ dir: join(homedir(), '.claude', 'plugins', sub), source: '.claude', scope: 'plugin', maxDepth: 8 });
  for (const dir of extraRoots) roots.push({ dir, source: '.extra', scope: 'extra' });
  if (projectPath) roots.push(...SOURCES.map(s => ({ dir: join(projectPath, s, 'skills'), source: s, scope: 'project' })));
  const found = [], seen = new Set();
  async function walk(dir, depth, root) {
    if (depth > (root.maxDepth ?? 4) || found.length >= limit) return;
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const path = join(dir, e.name);
      if (e.isFile() && e.name === 'SKILL.md') {
        const canonical = await realpath(path); if (seen.has(canonical)) continue; seen.add(canonical);
        const body = (await readFile(path, 'utf8')).slice(0, 60000);
        const fm = frontmatter(body);
        const name = fm?.name || body.match(/^name:\s*(.+)$/m)?.[1]?.trim() || dir.split(/[\\/]/).at(-1);
        const missing = [], missingRefs = [], dependencies = [];
        for (const cmd of listField(fm?.requires || fm?.dependencies)) { const found = onPath(cmd); dependencies.push({ name: cmd, found }); if (!found) missing.push(`programa: ${cmd}`); }
        for (const m of body.matchAll(/\]\(((?!https?:|#|mailto:)[^)\s]+)\)/g)) {
          const rel = decodeURIComponent(m[1].split('#')[0]); if (!rel) continue;
          try { await access(resolve(dirname(canonical), rel)); } catch { if (missingRefs.length < 8) missingRefs.push(rel); }
        }
        found.push({
          id: createHash('sha256').update(canonical).digest('hex').slice(0, 24), name, description: fm?.description || '',
          path: canonical, source: root.source, scope: root.scope,
          recognized: !!(fm?.name && fm?.description), contentHash: createHash('sha256').update(body).digest('hex').slice(0, 16),
          providers: PROVIDERS[root.source], missingDependencies: missing, missingReferences: missingRefs, dependencies
        });
      } else if (e.isDirectory()) await walk(path, depth + 1, root);
    }
  }
  for (const root of roots) await walk(root.dir, 0, root);
  const byName = new Map();
  for (const s of found) byName.set(s.name, [...(byName.get(s.name) || []), s.id]);
  // Cópia preferida de cada nome: projeto antes de usuário; depois .agents (vale para os dois provedores), .claude, .codex.
  const rank = s => (s.scope === 'project' ? 0 : 10) + { '.agents': 0, '.claude': 1, '.codex': 2, '.extra': 3 }[s.source];
  for (const s of found) { const group = byName.get(s.name); s.duplicate = group.length > 1; s.duplicateGroup = group.length > 1 ? group.filter(id => id !== s.id) : []; }
  for (const ids of byName.values()) { const members = ids.map(id => found.find(s => s.id === id)); const best = members.reduce((a, b) => rank(b) < rank(a) ? b : a); for (const m of members) m.preferred = m === best; }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

// Resumo para auditoria: cada categoria é contada separadamente para não confundir "encontrada" com "utilizável".
export function auditSummary(skills, enabledIds = new Set()) {
  return {
    files: skills.length,
    recognized: skills.filter(s => s.recognized).length,
    unrecognized: skills.filter(s => !s.recognized).length,
    duplicates: skills.filter(s => s.duplicate).length,
    uniqueNames: new Set(skills.map(s => s.name)).size,
    withMissingDependencies: skills.filter(s => s.missingDependencies.length).length,
    withMissingReferences: skills.filter(s => s.missingReferences?.length).length,
    compatible: { codex: skills.filter(s => s.recognized && s.providers.includes('codex')).length, claude: skills.filter(s => s.recognized && s.providers.includes('claude')).length },
    enabled: skills.filter(s => enabledIds.has(s.id)).length
  };
}

// Uma skill só chega ao executor se estiver reconhecida e sem dependência ausente. Pasta de outro provedor
// não bloqueia (o texto é incluído explicitamente), mas gera aviso: o carregamento nativo não ocorre.
export function usable(skill, provider) {
  if (!skill.recognized) return { blocked: 'não reconhecida (sem name/description no cabeçalho)' };
  if (skill.missingDependencies.length) return { blocked: `dependências ausentes: ${skill.missingDependencies.join(', ')}` };
  // Referências ausentes (links para arquivos que não existem) não bloqueiam: o texto da skill funciona, só faltam documentos de apoio.
  const notes = [];
  if (skill.missingReferences?.length) notes.push(`documentos de apoio ausentes (${skill.missingReferences.slice(0, 3).join(', ')}${skill.missingReferences.length > 3 ? '…' : ''}); o agente não conseguirá abrir esses arquivos`);
  if (!skill.providers.includes(provider)) notes.push(`pasta nativa de outro provedor; o texto é incluído, mas ${provider} não a carrega sozinho`);
  return notes.length ? { warning: notes.join('; ') } : {};
}
