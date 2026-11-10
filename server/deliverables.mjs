import { readdir, stat, readFile, realpath } from 'node:fs/promises';
import { join, relative, sep, extname, resolve } from 'node:path';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SKIP = new Set(['.git', 'node_modules', '.data', '.venv', '__pycache__']);
const MAX_FILES = 5000, MAX_HASH_BYTES = 5 * 1024 * 1024;
const TEXT_EXT = new Set(['.c', '.cc', '.cpp', '.cs', '.css', '.csv', '.go', '.html', '.java', '.js', '.json', '.jsx', '.md', '.mjs', '.ps1', '.py', '.sh', '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml']);
const MAX_DIFF_FILE = 64 * 1024, MAX_DIFF_SNAPSHOT = 1024 * 1024, MAX_DIFF_LINES = 600, MAX_DIFF_CHARS = 16000, MAX_TASK_DIFF_CHARS = 100000;
const SENSITIVE_NAME = /(^|[._-])(secrets?|tokens?|credentials?|passwords?|passwds?|apikeys?|api-keys?)([._-]|$)|^\.env/i;
const redactDiff = text => text.replace(/((?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|passwd|secret)\s*["']?\s*[:=]\s*["']?)[^"'\s,;}]+/gi, '$1[OCULTO]');

// Foto da pasta: caminho relativo → tamanho e mtime. "complete:false" quando a pasta é grande demais.
export async function snapshot(root) {
  const files = new Map();
  let complete = true, textBytes = 0;
  async function walk(dir) {
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.size >= MAX_FILES) { complete = false; return; }
      if (e.isSymbolicLink()) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) await walk(path); }
      else if (e.isFile()) { try {
        const s = await stat(path), rel = relative(root, path).split(sep).join('/'), item = { size: s.size, mtimeMs: s.mtimeMs };
        if (TEXT_EXT.has(extname(path).toLowerCase()) && !SENSITIVE_NAME.test(e.name) && s.size <= MAX_DIFF_FILE && textBytes + s.size <= MAX_DIFF_SNAPSHOT) {
          const bytes = await readFile(path);
          try { item.text = redactDiff(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); textBytes += s.size; } catch {}
        }
        files.set(rel, item);
      } catch {} }
    }
  }
  await walk(root);
  return { files, complete };
}

async function sha256(path, size) {
  if (size > MAX_HASH_BYTES) return null;
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function unifiedDiff(path, before, after) {
  const a = before == null ? [] : before.replace(/\r\n/g, '\n').split('\n'), b = after == null ? [] : after.replace(/\r\n/g, '\n').split('\n');
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return null;
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { ops.push(' ' + a[i++]); j++; }
    else if (j < b.length && (i === a.length || rows[i][j + 1] >= rows[i + 1][j])) ops.push('+' + b[j++]);
    else ops.push('-' + a[i++]);
  }
  if (!ops.some(line => line[0] === '+' || line[0] === '-')) return null;
  const diff = [`--- ${before == null ? '/dev/null' : 'a/' + path}`, `+++ ${after == null ? '/dev/null' : 'b/' + path}`, `@@ -1,${a.length} +1,${b.length} @@`, ...ops].join('\n');
  return diff.length <= MAX_DIFF_CHARS ? diff : null;
}

// Compara as fotos e devolve arquivos criados, alterados e removidos pela tentativa.
export async function diffSnapshots(root, before, after) {
  if (!before.complete || !after.complete) return { available: false, reason: 'Pasta grande demais para registrar entregas automaticamente.', files: [] };
  const files = []; let diffChars = 0;
  for (const [path, now] of after.files) {
    const old = before.files.get(path);
    if (!old || old.size !== now.size || old.mtimeMs !== now.mtimeMs) {
      const item = { path, change: old ? 'modified' : 'created', bytes: now.size, sha256: await sha256(join(root, path), now.size) };
      if ((old?.text != null || !old) && now.text != null) {
        const diff = unifiedDiff(path, old?.text ?? null, now.text);
        if (diff && diffChars + diff.length <= MAX_TASK_DIFF_CHARS) { item.diff = diff; diffChars += diff.length; }
      }
      files.push(item);
    }
  }
  for (const [path, old] of before.files) if (!after.files.has(path)) {
    const item = { path, change: 'deleted', bytes: null, sha256: null }, diff = old.text != null ? unifiedDiff(path, old.text, null) : null;
    if (diff && diffChars + diff.length <= MAX_TASK_DIFF_CHARS) { item.diff = diff; diffChars += diff.length; }
    files.push(item);
  }
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
