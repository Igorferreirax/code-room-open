// Ponto de restauração automático antes de tarefas que escrevem em projetos com Git ("Reverter alterações desta tarefa").
// Usa um GIT_INDEX_FILE temporário para gravar um objeto tree no Git sem alterar o index real, commits nem stash da pessoa.
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rename, rm, stat } from 'node:fs/promises';
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

export async function revertTaskChanges(projectPath, checkpoint, deliverables) {
  if (!projectPath || !existsSync(join(projectPath, '.git'))) throw new Error('Este projeto não tem repositório Git para restaurar.');
  if (!checkpoint?.available || !/^[0-9a-f]{40}$/i.test(checkpoint.tree || '')) throw new Error('Não há ponto de restauração registrado nesta tarefa.');
  if (checkpoint.revertedAt) throw new Error('As alterações desta tarefa já foram revertidas.');
  const files = deliverables?.files || [];
  if (!files.length) throw new Error('Esta tarefa não registrou arquivos alterados.');

  let restored = 0, trashed = 0; const skipped = [];
  const trashBase = join(projectPath, '.lixeira-coderoom', `reverter-${Date.now()}`);

  for (const f of files) {
    const target = safeRel(projectPath, f.path);
    if (!target) { skipped.push(`${f.path} (caminho inválido)`); continue; }
    if (f.change === 'created') {
      if (!existsSync(target.full)) continue;
      try {
        const st = await stat(target.full);
        if (f.bytes != null && st.size !== f.bytes) { skipped.push(`${target.rel} (editado depois da tarefa)`); continue; }
        const dst = join(trashBase, target.rel);
        await rm(dst, { force: true }).catch(() => {});
        await import('node:fs/promises').then(m => m.mkdir(dirname(dst), { recursive: true }));
        await rename(target.full, dst);
        trashed++;
      } catch (e) { skipped.push(`${target.rel} (${e.message})`); }
    } else {
      const co = await runGit(projectPath, ['-c', 'core.autocrlf=false', 'checkout', checkpoint.tree, '--', target.rel]);
      if (co.ok) restored++;
      else skipped.push(`${target.rel} (não constava na árvore anterior)`);
    }
  }
  if (!restored && !trashed) throw new Error('Nenhum arquivo pôde ser revertido (já foram movidos ou editados manualmente depois).');
  const parts = [];
  if (restored) parts.push(`${restored} arquivo(s) restaurado(s)`);
  if (trashed) parts.push(`${trashed} arquivo(s) novo(s) movido(s) para .lixeira-coderoom`);
  if (skipped.length) parts.push(`${skipped.length} preservado(s)`);
  return { restored, trashed, skipped, summary: parts.join(' · ') + '.' };
}
