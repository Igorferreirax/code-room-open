import { execFile } from 'node:child_process';
import { mkdir, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

// Isolamento opcional por tarefa: o agente trabalha numa cópia do Git (worktree) em uma branch própria,
// então duas tarefas de escrita podem rodar na mesma pasta de projeto ao mesmo tempo.
// Nada é mesclado sozinho: a branch fica pronta para você revisar e integrar.
// Alterações ainda não commitadas na pasta original NÃO aparecem na cópia (ela nasce do último commit).
const git = (cwd, args) => new Promise((ok, no) => execFile('git', args, { cwd, windowsHide: true, timeout: 30000 }, (e, stdout, stderr) => e ? no(Object.assign(new Error((stderr || e.message).trim()), { code: e.code })) : ok(stdout.trim())));
const fail = message => Object.assign(new Error(message), { failureKind: 'worktree_unavailable' });

export async function createWorktree(projectPath, taskId, baseDir) {
  let top;
  try { top = await realpath(await git(projectPath, ['rev-parse', '--show-toplevel'])); } catch { throw fail('A pasta do projeto não é um repositório Git; não dá para isolar em worktree.'); }
  try { await git(top, ['rev-parse', '--verify', 'HEAD']); } catch { throw fail('O repositório ainda não tem nenhum commit; o worktree nasce do último commit.'); }
  const dir = resolve(baseDir, taskId), branch = `code-room/${taskId.slice(0, 8)}`;
  await mkdir(baseDir, { recursive: true });
  try { await git(top, ['worktree', 'add', '-b', branch, dir, 'HEAD']); } catch (e) { throw fail(`Não foi possível criar o worktree: ${e.message}`); }
  const sub = relative(top, await realpath(projectPath));
  return { dir: sub ? join(dir, sub) : dir, worktree: dir, branch, repo: top };
}

export async function removeWorktree({ repo, worktree, branch }) {
  await git(repo, ['worktree', 'remove', '--force', worktree]);
  try { await git(repo, ['branch', '-D', branch]); } catch { /* branch já removida */ }
}
