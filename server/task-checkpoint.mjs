// Ponto de restauração automático antes de tarefas que escrevem em projetos com Git ("Reverter alterações desta tarefa").
// Usa um GIT_INDEX_FILE temporário para gravar um objeto tree no Git sem alterar o index real, commits nem stash da pessoa.
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rename, rm, stat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';

function runGit(cwd, args, extraEnv = {}) {
  return new Promise(res => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 12000, env: { ...process.env, ...extraEnv } }, (err, stdout, stderr) => {
      res({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || err?.message || '').trim() });
    });
  });
}

export async function captureTaskCheckpoint(projectPath) {
  if (!projectPath || !existsSync(join(projectPath, '.git'))) return null;
  let tmp = null;
  try {
    tmp = await mkdtemp(join(tmpdir(), 'cr-gitidx-'));
    const tempIndex = join(tmp, 'index'), realIndex = join(projectPath, '.git', 'index');
    if (existsSync(realIndex)) await copyFile(realIndex, tempIndex);
    const env = { GIT_INDEX_FILE: tempIndex };
    const add = await runGit(projectPath, ['-c', 'core.autocrlf=false', 'add', '-A'], env);
    if (!add.ok) return null;
    const wt = await runGit(projectPath, ['write-tree'], env);
    if (!wt.ok || !/^[0-9a-f]{40}$/i.test(wt.out)) return null;
    return { available: true, tree: wt.out.toLowerCase(), capturedAt: new Date().toISOString(), revertedAt: null };
  } catch {
    return null;
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function safeRel(projectPath, rel) {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  const norm = normalize(rel).replace(/\\/g, '/');
  if (isAbsolute(norm) || norm.startsWith('..') || norm.includes('/../') || norm.includes(':')) return null;
  const full = resolve(projectPath, norm), root = resolve(projectPath);
  if (full.toLowerCase() === root.toLowerCase() || !full.toLowerCase().startsWith((root + sep).toLowerCase())) return null;
  return { rel: norm, full };
}

// Projeto SEM Git e agente em modo irrestrito: cópia dos arquivos antes da tarefa (sem node_modules, .git e afins), para
// "Reverter alterações" funcionar mesmo assim. Projeto grande demais fica sem cópia (e a tarefa avisa).
const SKIP_DIRS = new Set(['node_modules', '.git', '.lixeira-coderoom', '.venv', 'venv', '__pycache__', '.next', '.cache', 'dist', 'build', '.turbo']);
export async function captureFileBackup(projectPath, backupDir, { maxBytes = 300 * 1024 * 1024, maxFiles = 20000 } = {}) {
  if (!projectPath || !backupDir) return null;
  const list = []; let bytes = 0;
  const walk = async (dir, rel) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const r = rel ? `${rel}/${e.name}` : e.name, full = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(full, r); continue; }
      if (!e.isFile()) continue;
      const st = await stat(full); bytes += st.size; list.push(r);
      if (bytes > maxBytes || list.length > maxFiles) throw Object.assign(new Error('grande'), { tooBig: true });
    }
  };
  try { await walk(projectPath, ''); } catch (e) { return e.tooBig ? { available: false, kind: 'copy', reason: `projeto grande demais para a cópia de segurança (mais de ${Math.round(maxBytes / 1048576)} MB ou ${maxFiles} arquivos); use Git para ter o ponto de restauração` } : null; }
  await mkdir(backupDir, { recursive: true });
  for (const r of list) { const dst = join(backupDir, ...r.split('/')); await mkdir(dirname(dst), { recursive: true }); await copyFile(join(projectPath, ...r.split('/')), dst); }
  return { available: true, kind: 'copy', dir: backupDir, files: list.length, bytes, capturedAt: new Date().toISOString(), revertedAt: null };
}

// Conteúdo anterior de um arquivo, em bytes, sem tocar no índice do Git nem na pasta (cat-file só lê o objeto gravado).
function gitBlob(cwd, tree, rel) {
  return new Promise(res => {
    execFile('git', ['cat-file', 'blob', `${tree}:${rel}`], { cwd, windowsHide: true, timeout: 20000, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }, (err, stdout) => res(err ? null : stdout));
  });
}

async function hashOf(full) {
  try { return createHash('sha256').update(await readFile(full)).digest('hex'); } catch { return null; }
}

function checkpointUsable(projectPath, checkpoint) {
  const copy = checkpoint?.kind === 'copy';
  if (!copy && (!projectPath || !existsSync(join(projectPath, '.git')))) throw new Error('Este projeto não tem repositório Git para restaurar.');
  if (!checkpoint?.available || (copy ? !checkpoint.dir || !existsSync(checkpoint.dir) : !/^[0-9a-f]{40}$/i.test(checkpoint.tree || ''))) throw new Error('Não há ponto de restauração registrado nesta tarefa.');
  if (checkpoint.revertedAt) throw new Error('As alterações desta tarefa já foram revertidas.');
  return copy;
}

// Prévia por arquivo do que "Reverter alterações" vai fazer. Só desfaz o que continua EXATAMENTE como a tarefa deixou
// (sha256 gravado nas entregas ao fim da tarefa). Arquivo que você editou depois, recriou ou apagou fica como está.
// action: restore (volta ao conteúdo anterior), trash (arquivo criado pela tarefa vai para .lixeira-coderoom),
//         recreate (arquivo apagado pela tarefa volta), keep (preservado, com o motivo), none (nada a fazer).
export async function planRevert(projectPath, checkpoint, deliverables) {
  const copy = checkpointUsable(projectPath, checkpoint);
  const files = deliverables?.files || [];
  if (!files.length) throw new Error('Esta tarefa não registrou arquivos alterados.');
  let staged = new Set();
  if (!copy) {
    const st = await runGit(projectPath, ['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only']);
    if (st.ok) staged = new Set(st.out.split(/\r?\n/).filter(Boolean));
  }
  const items = [];
  for (const f of files) {
    const target = safeRel(projectPath, f.path);
    const item = { path: f.path, change: f.change, action: 'keep', reason: '' };
    items.push(item);
    if (!target) { item.reason = 'caminho inválido'; continue; }
    if (String(f.path).endsWith('/')) { item.reason = 'pasta (só arquivos são revertidos)'; continue; }
    if (staged.has(target.rel)) item.staged = true;
    const exists = existsSync(target.full);
    const now = exists ? await hashOf(target.full) : null;
    const sameAsTask = !!f.sha256 && now === String(f.sha256).toLowerCase();
    const before = async () => copy ? (existsSync(join(checkpoint.dir, ...target.rel.split('/'))) || null) : await gitBlob(projectPath, checkpoint.tree, target.rel);
    if (f.change === 'created') {
      if (!exists) { item.action = 'none'; item.reason = 'já não existe'; }
      else if (!f.sha256) item.reason = 'sem registro do conteúdo final para conferir (arquivo grande ou tarefa antiga)';
      else if (!sameAsTask) item.reason = 'editado depois da tarefa';
      else { item.action = 'trash'; item.reason = 'criado pela tarefa'; }
    } else if (f.change === 'deleted') {
      if (exists) item.reason = 'recriado depois da tarefa';
      else if (!(await before())) item.reason = copy ? 'não estava na cópia de segurança' : 'não constava no ponto de restauração';
      else { item.action = 'recreate'; item.reason = 'apagado pela tarefa'; }
    } else {
      if (!exists) item.reason = 'apagado depois da tarefa';
      else if (!f.sha256) item.reason = 'sem registro do conteúdo final para conferir (arquivo grande ou tarefa antiga)';
      else if (!sameAsTask) item.reason = 'editado depois da tarefa';
      else if (!(await before())) item.reason = copy ? 'não estava na cópia de segurança' : 'não constava no ponto de restauração';
      else { item.action = 'restore'; item.reason = 'alterado pela tarefa'; }
    }
    if (item.staged && item.action !== 'keep' && item.action !== 'none') item.reason += ' · as alterações preparadas no Git (índice) ficam como estão';
  }
  return { kind: copy ? 'copy' : 'git', items, actionable: items.filter(i => ['restore', 'trash', 'recreate'].includes(i.action)).length };
}

// Desfaz só o que a prévia marcou para desfazer (e, se "paths" vier, só esses arquivos). Confere o conteúdo de novo
// logo antes de mexer: se você editou entre a prévia e o clique, o arquivo é preservado. Nunca altera o índice do Git.
export async function revertTaskChanges(projectPath, checkpoint, deliverables, { paths = null } = {}) {
  const plan = await planRevert(projectPath, checkpoint, deliverables);
  const copy = plan.kind === 'copy', want = Array.isArray(paths) ? new Set(paths.map(String)) : null;
  const byPath = new Map((deliverables?.files || []).map(f => [f.path, f]));
  let restored = 0, trashed = 0; const skipped = [];
  const trashBase = join(projectPath, '.lixeira-coderoom', `reverter-${Date.now()}`);
  for (const item of plan.items) {
    if (want && !want.has(item.path)) { if (item.action !== 'none') skipped.push(`${item.path} (você deixou de fora)`); continue; }
    if (item.action === 'keep') { skipped.push(`${item.path} (${item.reason})`); continue; }
    if (item.action === 'none') continue;
    const target = safeRel(projectPath, item.path), f = byPath.get(item.path);
    try {
      if (item.action === 'recreate' ? existsSync(target.full) : (await hashOf(target.full)) !== String(f.sha256).toLowerCase()) { skipped.push(`${item.path} (mudou depois da prévia)`); continue; }
      if (item.action === 'trash') {
        const dst = join(trashBase, target.rel);
        await mkdir(dirname(dst), { recursive: true }); await rm(dst, { force: true }).catch(() => {});
        await rename(target.full, dst); trashed++; continue;
      }
      await mkdir(dirname(target.full), { recursive: true });
      if (copy) await copyFile(join(checkpoint.dir, ...target.rel.split('/')), target.full);
      else { const buf = await gitBlob(projectPath, checkpoint.tree, target.rel); if (!buf) { skipped.push(`${item.path} (não constava no ponto de restauração)`); continue; } await writeFile(target.full, buf); }
      restored++;
    } catch (e) { skipped.push(`${item.path} (${e.message})`); }
  }
  if (!restored && !trashed) throw new Error(`Nada foi revertido: ${skipped.length ? skipped.slice(0, 5).join('; ') : 'nenhum arquivo continua como a tarefa deixou'}.`);
  const parts = [];
  if (restored) parts.push(`${restored} arquivo(s) restaurado(s)`);
  if (trashed) parts.push(`${trashed} arquivo(s) novo(s) movido(s) para .lixeira-coderoom`);
  if (skipped.length) parts.push(`${skipped.length} preservado(s)`);
  return { restored, trashed, skipped, partial: skipped.length > 0, summary: parts.join(' · ') + '.' };
}
