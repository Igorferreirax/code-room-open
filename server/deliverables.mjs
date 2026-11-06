import { readdir, stat, readFile, realpath } from 'node:fs/promises';
import { join, relative, sep, extname, resolve } from 'node:path';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SKIP = new Set(['.git', 'node_modules', '.data', '.venv', '__pycache__']);
const MAX_FILES = 5000, MAX_HASH_BYTES = 5 * 1024 * 1024;

// Foto da pasta: caminho relativo → tamanho e mtime. "complete:false" quando a pasta é grande demais.
export async function snapshot(root) {
  const files = new Map();
  let complete = true;
  async function walk(dir) {
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.size >= MAX_FILES) { complete = false; return; }
      if (e.isSymbolicLink()) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) await walk(path); }
      else if (e.isFile()) { try { const s = await stat(path); files.set(relative(root, path).split(sep).join('/'), { size: s.size, mtimeMs: s.mtimeMs }); } catch {} }
    }
  }
  await walk(root);
  return { files, complete };
}

async function sha256(path, size) {
  if (size > MAX_HASH_BYTES) return null;
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

// Compara as fotos e devolve arquivos criados, alterados e removidos pela tentativa.
export async function diffSnapshots(root, before, after) {
  if (!before.complete || !after.complete) return { available: false, reason: 'Pasta grande demais para registrar entregas automaticamente.', files: [] };
  const files = [];
  for (const [path, now] of after.files) {
    const old = before.files.get(path);
    if (!old) files.push({ path, change: 'created', bytes: now.size, sha256: await sha256(join(root, path), now.size) });
    else if (old.size !== now.size || old.mtimeMs !== now.mtimeMs) files.push({ path, change: 'modified', bytes: now.size, sha256: await sha256(join(root, path), now.size) });
  }
  for (const path of before.files.keys()) if (!after.files.has(path)) files.push({ path, change: 'deleted', bytes: null, sha256: null });
  return { available: true, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

// Resolve um caminho relativo dentro do projeto, recusando escapes por ".." ou por links.
export async function safeFile(projectRoot, rel) {
  const root = await realpath(projectRoot);
  const target = resolve(root, rel);
  if (target !== root && !target.startsWith(root + sep)) throw new Error('Caminho fora do projeto.');
  const real = await realpath(target);
  if (!real.startsWith(root + sep)) throw new Error('Caminho fora do projeto.');
  const s = await stat(real);
  if (!s.isFile()) throw new Error('Não é um arquivo.');
  return real;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
export const contentType = path => TYPES[extname(path).toLowerCase()] || 'application/octet-stream';

// Token curto (1 h) que só autoriza ler entregas de uma tarefa. Evita colocar a chave principal em URLs.
export function mintToken(key, taskId, ttlMs = 3600000) {
  const exp = Date.now() + ttlMs;
  return `${exp.toString(36)}.${createHmac('sha256', key).update(`${taskId}:${exp}`).digest('hex').slice(0, 32)}`;
}
export function checkToken(key, taskId, token) {
  const [expText, mac] = String(token).split('.');
  const exp = parseInt(expText, 36);
  if (!exp || exp < Date.now() || !mac) return false;
  const expected = createHmac('sha256', key).update(`${taskId}:${exp}`).digest('hex').slice(0, 32);
  return mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}
