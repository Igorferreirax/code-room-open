import { readdir, stat, mkdir, copyFile, rm, writeFile, realpath, readFile } from 'node:fs/promises';
import { join, resolve, isAbsolute, basename, sep } from 'node:path';

// Pastas de referência: o agente trabalha só dentro da pasta do projeto, então uma pasta de FORA (ex.: o GerouPromo) entra como uma CÓPIA
// SOMENTE LEITURA em <projeto>/.referencias/<rótulo>/, refeita antes de cada tarefa. O original nunca é tocado nem recebe escrita.
// Nada que pareça segredo ou dado pesado é copiado (.env, chaves, bancos de dados, node_modules, logs…) e há limites de tamanho.
export const REF_DIR = '.referencias';
export const LIMITS = { maxFiles: 3000, maxBytes: 25 * 1024 * 1024, maxFile: 1024 * 1024, maxDirs: 5, maxDepth: 10 };
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', '.cache', 'coverage', 'logs', 'log', 'data', 'tmp', 'temp', '.turbo', '.idea', '.vscode', '.referencias', '.code-room', 'target']);
const SKIP_FILE = [/^\.env(\..*)?$/i, /\.(pem|key|p12|pfx|jks|keystore|crt|cer|token)$/i, /^id_(rsa|dsa|ecdsa|ed25519)/i, /\.(sqlite|sqlite3|db|db-wal|db-shm|mdb|bak)$/i, /\.log$/i, /^(secrets?|credentials?)([._-]|$)/i, /^\.(npmrc|netrc|pypirc|git-credentials)$/i, /\.(zip|7z|rar|gz|tgz|exe|dll|iso|mp4|mov|avi|mkv|mp3|wav)$/i];
const slug = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40);

// Pastas que nunca viram referência (sistema, programas, chaves e a raiz do disco).
export const forbiddenRef = p => { const l = resolve(p).toLowerCase().replace(/\//g, '\\'); return /^[a-z]:\\?$/.test(l) || /^[a-z]:\\(windows|program files|program files \(x86\)|programdata)(\\|$)/.test(l) || /\\(\.ssh|\.gnupg)(\\|$)/.test(l) || /\\appdata\\(roaming|local\\(programs|packages|microsoft))(\\|$)/.test(l); };
const inside = (a, b) => (resolve(a).toLowerCase() + sep).startsWith(resolve(b).toLowerCase() + sep);

// Valida a lista: caminhos completos e existentes, fora de pastas do sistema, sem conter o projeto nem estar dentro dele, rótulos únicos.
export async function cleanRefs(input, projectPath) {
  if (!Array.isArray(input)) throw new Error('Informe a lista de pastas de referência.');
  if (input.length > LIMITS.maxDirs) throw new Error(`No máximo ${LIMITS.maxDirs} pastas de referência por projeto.`);
  const out = [], labels = new Set(), seen = new Set();
  for (const item of input) {
    const raw = String(item?.path ?? '').trim().replace(/[\\/]+$/, ''); if (!raw) continue;
    if (!isAbsolute(raw) || raw.length > 400 || /[\0\r\n]/.test(raw)) throw new Error('Cada pasta de referência precisa ser um caminho completo (ex.: C:\\Projetos\\meu-repo).');
    let real; try { real = await realpath(raw); if (!(await stat(real)).isDirectory()) throw 0; } catch { throw new Error(`A pasta não existe: ${raw}`); }
    if (forbiddenRef(real)) throw new Error('Esta pasta é protegida pelo sistema e não pode ser usada como referência.');
    if (inside(real, projectPath) || inside(projectPath, real)) throw new Error('A pasta de referência não pode ser o próprio projeto, nem ficar dentro ou ao redor dele.');
    if (seen.has(real.toLowerCase())) continue; seen.add(real.toLowerCase());
    let label = slug(item?.label) || slug(basename(real)) || 'referencia', n = 2; while (labels.has(label)) label = `${slug(basename(real)) || 'referencia'}-${n++}`; labels.add(label);
    out.push({ path: real, label });
  }
  return out;
}

// Percorre a origem aplicando as exclusões e os limites. Devolve os arquivos que seriam copiados e o que ficou de fora (e por quê).
export async function scanReference(root) {
  const files = [], skipped = { segredo: 0, grande: 0, limite: 0 }; let bytes = 0; const stack = [['', 0]];
  while (stack.length) {
    const [rel, depth] = stack.pop(); let ents; try { ents = await readdir(join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (depth < LIMITS.maxDepth && !SKIP_DIRS.has(e.name.toLowerCase())) stack.push([r, depth + 1]); continue; }
      if (!e.isFile()) continue;
      if (SKIP_FILE.some(re => re.test(e.name))) { skipped.segredo++; continue; }
      let st; try { st = await stat(join(root, r)); } catch { continue; }
      if (st.size > LIMITS.maxFile) { skipped.grande++; continue; }
      if (files.length >= LIMITS.maxFiles || bytes + st.size > LIMITS.maxBytes) { skipped.limite++; continue; }
      files.push({ rel: r, size: st.size, mtime: st.mtimeMs }); bytes += st.size;
    }
  }
  return { files, bytes, skipped };
}

async function listDest(dir) { const out = [], stack = ['']; while (stack.length) { const rel = stack.pop(); let ents; try { ents = await readdir(join(dir, rel), { withFileTypes: true }); } catch { continue; } for (const e of ents) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) stack.push(r); else out.push(r); } } return out; }

// Copia (só o que mudou) e apaga da cópia o que não existe mais na origem. Nunca escreve na origem.
export async function syncReference(projectRoot, ref) {
  if (!(await stat(ref.path)).isDirectory()) throw new Error('A pasta de referência não existe mais.');   // origem sumiu: não apaga a cópia que já existe
  const dest = join(projectRoot, REF_DIR, ref.label), scan = await scanReference(ref.path); await mkdir(dest, { recursive: true });
  const want = new Set(scan.files.map(f => f.rel)); let copied = 0;
  for (const f of scan.files) {
    const to = join(dest, ...f.rel.split('/'));
    let same = false; try { const s = await stat(to); same = s.size === f.size && Math.abs(s.mtimeMs - f.mtime) < 2000; } catch {}
    if (same) continue;
    await mkdir(join(to, '..'), { recursive: true }); await copyFile(join(ref.path, ...f.rel.split('/')), to); copied++;
  }
  for (const r of await listDest(dest)) if (!want.has(r)) await rm(join(dest, ...r.split('/')), { force: true });
  return { label: ref.label, files: scan.files.length, bytes: scan.bytes, copied, skipped: scan.skipped };
}

async function excludeFromGit(projectRoot) {   // a cópia não aparece como "alteração" no Git do projeto
  try { const f = join(projectRoot, '.git', 'info', 'exclude'); const cur = await readFile(f, 'utf8').catch(() => ''); if (!cur.split(/\r?\n/).includes(REF_DIR + '/')) { await mkdir(join(projectRoot, '.git', 'info'), { recursive: true }); await writeFile(f, cur.replace(/\s*$/, '\n') + REF_DIR + '/\n', 'utf8'); } } catch {}
}

export function referenceBlock(results) {
  if (!results.length) return '';
  const rows = results.map(r => `- ${REF_DIR}/${r.label}/ — ${r.files} arquivo(s)${r.skipped.segredo ? `; ${r.skipped.segredo} que parecem segredo ou dado pesado ficaram de fora` : ''}`).join('\n');
  return `# Pastas de referência do projeto (CÓPIA SOMENTE LEITURA)\nSão cópias de pastas de fora do projeto. Leia à vontade, mas NÃO edite nada aqui: o que você mudar nesta cópia não chega ao original e é refeito antes de cada tarefa. Para usar algo, copie para fora de ${REF_DIR}/ ou descreva a alteração na sua resposta.\n${rows}`;
}

// Chamado antes de cada tarefa. Nunca derruba a tarefa: erro vira "sem referências".
export async function prepareReferences(store, task, root) {
  try {
    const pj = store.get('projects', task.project?.id); const refs = pj?.referenceDirs || [];
    if (!refs.length || task.project?.id === 'assistant-internal' || task.project?.area === 'Financeiro') return { text: '', n: 0 };
    const results = []; for (const r of refs.slice(0, LIMITS.maxDirs)) { try { results.push(await syncReference(root, r)); } catch {} }
    await writeFile(join(root, REF_DIR, 'LEIA-ME.txt'), 'Cópias SOMENTE LEITURA de pastas de fora do projeto, refeitas antes de cada tarefa pelo Code Room.\nNão edite aqui: nada volta para o original.\n', 'utf8').catch(() => {});
    await excludeFromGit(root);
    return { text: referenceBlock(results), n: results.length };
  } catch { return { text: '', n: 0 }; }
}
