import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

// Versionamento do projeto com o Git que a pessoa já tem. Sem guardar chave nem senha: usa o login do próprio Git/GitHub CLI.
// O Code Room só LÊ (branch, alterações, commits, PRs) e, se a pessoa pedir, FAZ COMMITS LOCAIS dos arquivos de uma entrega.
// Nunca faz push, nunca mexe em remoto, nunca apaga nada.
const run = (cmd, cwd, args, timeout = 15000) => new Promise((ok, no) => execFile(cmd, args, { cwd, windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } },
  (e, out, err) => e ? no(Object.assign(new Error(String(err || e.message).trim().slice(0, 300)), { code: e.code })) : ok(String(out))));
const git = (cwd, args, timeout) => run('git', cwd, args, timeout);
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

// Tira usuário e senha de um endereço de remoto e devolve o link da página no GitHub, quando for de lá.
export function cleanRemote(raw) {
  let u = String(raw || '').trim(); if (!u) return null;
  const ssh = /^(?:ssh:\/\/)?git@([^:\/]+)[:\/](.+?)(?:\.git)?\/?$/.exec(u);
  if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;
  u = u.replace(/^(https?:\/\/)[^\/@]+@/i, '$1').replace(/\.git\/?$/i, '');
  if (!/^https?:\/\//i.test(u)) return { url: u.slice(0, 200), web: null };
  return { url: u.slice(0, 200), web: /^https:\/\/github\.com\//i.test(u) ? u : null };
}

export async function gitAvailable() { try { await git(process.cwd(), ['--version'], 5000); return true; } catch { return false; } }

// Estado do repositório DA PASTA DO PROJETO. Se a pasta está dentro de um repositório maior (ex.: a pasta do usuário inteira), não conta como repositório do projeto.
export async function gitInfo(path, limit = 15) {
  if (!(await gitAvailable())) return { available: false, repo: false };
  let top; try { top = (await git(path, ['rev-parse', '--show-toplevel'], 8000)).trim(); } catch { return { available: true, repo: false }; }
  if (!same(await realpath(path), top)) return { available: true, repo: false, parent: true };
  const info = { available: true, repo: true, branch: null, dirty: 0, files: [], ahead: null, behind: null, remote: null, commits: [] };
  try { info.branch = (await git(path, ['symbolic-ref', '--short', 'HEAD'], 8000)).trim(); } catch { info.branch = null; }
  try { const lines = (await git(path, ['status', '--porcelain=v1', '--untracked-files=normal'], 15000)).split(/\r?\n/).filter(Boolean); info.dirty = lines.length; info.files = lines.slice(0, 20).map(l => ({ state: l.slice(0, 2).trim() || '?', path: l.slice(3).replace(/^"|"$/g, '') })); } catch {}
  try { const [b, a] = (await git(path, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], 8000)).trim().split(/\s+/).map(Number); info.behind = b; info.ahead = a; } catch {}
  try { info.remote = cleanRemote(await git(path, ['remote', 'get-url', 'origin'], 8000)); } catch {}
  try { info.commits = (await git(path, ['log', '-n', String(Math.min(30, Math.max(1, limit))), '--pretty=format:%h%x1f%s%x1f%an%x1f%aI'], 15000)).split(/\r?\n/).filter(Boolean).map(l => { const [hash, subject, author, at] = l.split('\x1f'); return { hash, subject: (subject || '').slice(0, 160), author: (author || '').slice(0, 60), at }; }); } catch { info.commits = []; }
  return info;
}

export async function gitInit(path) {
  if (!(await gitAvailable())) throw new Error('O Git não está instalado neste computador.');
  const cur = await gitInfo(path); if (cur.repo) throw new Error('Esta pasta já é um repositório Git.');
  await git(path, ['init'], 15000); return gitInfo(path);
}

const safeMsg = m => String(m ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, 1000);
// Commita SOMENTE os arquivos indicados (os da entrega), com a identidade que o Git da pessoa já tem. Local: nada é enviado.
export async function commitFiles(path, files, message) {
  const info = await gitInfo(path); if (!info.repo) throw new Error('A pasta deste projeto não é um repositório Git. Inicie o Git no projeto primeiro.');
  const root = await realpath(path), list = [...new Set((files || []).map(f => String(f).split('\\').join('/')))].filter(Boolean);
  if (!list.length) throw new Error('Esta entrega não tem arquivos para commitar.');
  const ok = [];
  for (const f of list.slice(0, 200)) {
    if (isAbsolute(f) || f.split('/').some(p => p === '..' || p === '.git') || /[\0]/.test(f) || f.startsWith('-')) continue;   // nada fora da pasta nem dentro de .git
    const full = resolve(root, f); if (!(full + sep).startsWith(root + sep) && full !== root) continue;
    try { if ((await stat(full)).isFile()) ok.push(f); } catch {}
  }
  if (!ok.length) throw new Error('Nenhum dos arquivos da entrega existe mais na pasta do projeto.');
  const msg = safeMsg(message) || 'Entrega aprovada no Code Room';
  await git(path, ['add', '--', ...ok], 30000);
  const staged = (await git(path, ['diff', '--cached', '--name-only', '--', ...ok], 15000)).trim();
  if (!staged) throw new Error('Nada para commitar: os arquivos não mudaram ou estão no .gitignore.');
  await git(path, ['commit', '-m', msg, '--', ...ok], 30000);
  const hash = (await git(path, ['rev-parse', '--short', 'HEAD'], 8000)).trim();
  return { hash, files: staged.split(/\r?\n/).filter(Boolean) };
}

// Pull requests e verificações do GitHub (somente leitura), se o GitHub CLI (`gh`) estiver instalado e logado.
export async function githubInfo(path) {
  let list, runs = [];
  try { list = JSON.parse(await run('gh', path, ['pr', 'list', '--limit', '5', '--json', 'number,title,state,url,headRefName'], 20000)); }
  catch (e) { return { available: false, reason: /ENOENT/.test(e.code || '') || /not recognized|n[aã]o [ée] reconhecido/i.test(e.message) ? 'O GitHub CLI (gh) não está instalado.' : /auth|login/i.test(e.message) ? 'O GitHub CLI não está logado (rode "gh auth login").' : /repo|remote|GraphQL|not a git/i.test(e.message) ? 'Este projeto não tem um repositório no GitHub vinculado.' : 'Não foi possível consultar o GitHub agora.' }; }
  try { runs = JSON.parse(await run('gh', path, ['run', 'list', '--limit', '3', '--json', 'name,status,conclusion,url,headBranch'], 20000)); } catch {}
  const clip = (s, n) => String(s ?? '').slice(0, n);
  return { available: true, prs: list.map(p => ({ number: p.number, title: clip(p.title, 120), state: p.state, url: clip(p.url, 200), branch: clip(p.headRefName, 60) })), runs: runs.map(r => ({ name: clip(r.name, 80), status: r.status, conclusion: r.conclusion || null, url: clip(r.url, 200), branch: clip(r.headBranch, 60) })) };
}
