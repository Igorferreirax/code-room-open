// Registro e reversão segura de organização em pasta extra autorizada (ex.: Área de Trabalho).
// Princípios de segurança:
// 1) Só opera dentro da pasta extra originalmente autorizada na tarefa (revalidando realpath e links simbólicos).
// 2) Nunca sobrescreve arquivo existente na origem e nunca mexe em arquivo cujo tamanho mudou depois da tarefa.
// 3) Nunca apaga arquivos: subpastas criadas na organização só são removidas se estiverem completamente vazias.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { forbiddenRef } from './referencias.mjs';

const norm = p => resolve(p).toLowerCase();
const insideRoot = (root, p) => { const r = norm(root), full = norm(p); return full === r || full.startsWith(r + sep); };

function safeInside(realRoot, target, { mustExist = false } = {}) {
  if (typeof target !== 'string' || !target.trim()) throw new Error('Caminho inválido.');
  const full = isAbsolute(target) ? resolve(target) : resolve(realRoot, target);
  if (!insideRoot(realRoot, full) || norm(full) === norm(realRoot)) throw new Error('Caminho fora da pasta autorizada.');
  let probe = full;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  if (!insideRoot(realRoot, realpathSync(probe))) throw new Error('Atalho aponta para fora da pasta autorizada.');
  if (existsSync(full) && lstatSync(full).isSymbolicLink()) throw new Error('Links simbólicos não são alterados.');
  if (mustExist && !existsSync(full)) throw new Error('Arquivo não encontrado.');
  return full;
}

// Lê o manifesto gravado pelo servidor MCP "arquivos" (quando o Claude organizou a pasta).
export function readOpsLog(logFile, extraDir) {
  if (!logFile || !extraDir || !existsSync(logFile)) return { moves: [], createdDirs: [] };
  let realRoot;
  try { realRoot = realpathSync(extraDir); } catch { return { moves: [], createdDirs: [] }; }
  const moves = [], dirs = new Set();
  for (const line of readFileSync(logFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row; try { row = JSON.parse(line); } catch { continue; }
    if (row?.op === 'mkdir' && typeof row.path === 'string' && insideRoot(realRoot, row.path) && norm(row.path) !== norm(realRoot)) {
      dirs.add(relative(realRoot, resolve(row.path)).split(sep).join('/'));
    } else if (row?.op === 'move' && typeof row.from === 'string' && typeof row.to === 'string' && insideRoot(realRoot, row.from) && insideRoot(realRoot, row.to)) {
      moves.push({
        from: relative(realRoot, resolve(row.from)).split(sep).join('/'),
        to: relative(realRoot, resolve(row.to)).split(sep).join('/'),
        size: typeof row.size === 'number' ? row.size : null,
        isDir: !!row.isDir,
      });
    }
  }
  return { moves, createdDirs: [...dirs] };
}

// Lista arquivos até profundidade `maxDepth` (usado para achar para onde um arquivo do 1º nível foi movido em pastas grandes).
function scanDepth(root, maxDepth = 2, maxItems = 2500) {
  const files = [], dirs = new Set();
  function walk(dir, depth) {
    if (files.length >= maxItems) return;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.length >= maxItems || e.isSymbolicLink()) continue;
      const full = join(dir, e.name), rel = relative(root, full).split(sep).join('/');
      if (e.isDirectory()) {
        dirs.add(rel);
        if (depth < maxDepth) walk(full, depth + 1);
      } else if (e.isFile()) {
        try { const s = statSync(full); files.push({ path: rel, name: e.name, bytes: s.size }); } catch {}
      }
    }
  }
  walk(root, 1);
  return { files, dirs };
}

// Quando a CLI moveu sem passar pelo MCP "arquivos" (ex.: Codex), infere pares 1-para-1 seguros (mesmo nome + mesmo tamanho).
export function inferFolderMoves(extraDir, beforeSnap) {
  if (!extraDir || !beforeSnap?.files) return { moves: [], createdDirs: [], movedFiles: [] };
  let realRoot;
  try { realRoot = realpathSync(extraDir); } catch { return { moves: [], createdDirs: [], movedFiles: [] }; }
  const beforeFiles = beforeSnap.files;
  const beforeTopDirs = new Set();
  for (const [p, meta] of beforeFiles) {
    if (meta.dir) beforeTopDirs.add(p);
    else if (p.includes('/')) beforeTopDirs.add(p.split('/')[0]);
  }
  const missing = [];
  for (const [p, meta] of beforeFiles) {
    if (meta.dir) continue;
    if (!existsSync(join(realRoot, p))) missing.push({ path: p, name: basename(p), bytes: meta.bytes, sha256: meta.sha256 || null });
  }
  if (!missing.length) return { moves: [], createdDirs: [], movedFiles: [] };
  const after = scanDepth(realRoot, 3);
  const candidates = after.files.filter(f => !beforeFiles.has(f.path));
  const usedTo = new Set(), moves = [], movedFiles = [];
  for (const m of missing) {
    const hits = candidates.filter(c => !usedTo.has(c.path) && c.name.toLowerCase() === m.name.toLowerCase() && c.bytes === m.bytes);
    if (hits.length === 1) {
      usedTo.add(hits[0].path);
      moves.push({ from: m.path, to: hits[0].path, size: m.bytes, isDir: false });
      movedFiles.push({ path: hits[0].path, change: 'created', bytes: m.bytes });
    }
  }
  const createdDirs = [...after.dirs].filter(d => !beforeTopDirs.has(d.split('/')[0]));
  return { moves, createdDirs, movedFiles };
}

export function buildFolderUndo(extraDir, beforeSnap, logFile = null) {
  const logged = readOpsLog(logFile, extraDir);
  if (logged.moves.length) {
    const movedFiles = [];
    try {
      const realRoot = realpathSync(extraDir);
      for (const m of logged.moves) {
        if (m.isDir) continue;
        const dst = join(realRoot, m.to);
        if (existsSync(dst)) { try { movedFiles.push({ path: m.to, change: 'created', bytes: statSync(dst).size }); } catch {} }
      }
    } catch {}
    return { available: true, moves: logged.moves.slice(0, 300), createdDirs: logged.createdDirs.slice(0, 100), movedFiles, undoneAt: null };
  }
  const inferred = inferFolderMoves(extraDir, beforeSnap);
  if (!inferred.moves.length) return null;
  return { available: true, moves: inferred.moves.slice(0, 300), createdDirs: inferred.createdDirs.slice(0, 100), movedFiles: inferred.movedFiles, undoneAt: null };
}

export function undoFolderMoves(extraDir, folderUndo) {
  if (!extraDir || typeof extraDir !== 'string') throw new Error('Pasta extra não registrada nesta tarefa.');
  if (!folderUndo?.available || !Array.isArray(folderUndo.moves) || !folderUndo.moves.length) throw new Error('Não há movimentações registradas para desfazer.');
  if (folderUndo.undoneAt) throw new Error('Esta organização já foi desfeita.');
  let realRoot;
  try { realRoot = realpathSync(extraDir); if (!statSync(realRoot).isDirectory()) throw 0; } catch { throw new Error('A pasta extra não existe mais ou não está acessível.'); }
  if (forbiddenRef(realRoot)) throw new Error('Esta pasta é protegida pelo sistema.');

  let restored = 0; const skipped = [];
  for (const m of [...folderUndo.moves].reverse()) {
    try {
      const srcNow = safeInside(realRoot, m.to), dstOrig = safeInside(realRoot, m.from);
      if (!existsSync(srcNow)) { skipped.push(`${m.to} (não está mais lá)`); continue; }
      if (existsSync(dstOrig)) { skipped.push(`${m.from} (já existe outro arquivo no lugar)`); continue; }
      const st = statSync(srcNow);
      if (!m.isDir && m.size != null && st.isFile() && st.size !== m.size) { skipped.push(`${m.to} (foi editado depois)`); continue; }
      mkdirSync(dirname(dstOrig), { recursive: true });
      renameSync(srcNow, dstOrig);
      restored++;
    } catch (e) { skipped.push(`${m.to} (${e.message})`); }
  }

  let removedDirs = 0;
  const dirs = [...new Set([...(folderUndo.createdDirs || []), ...folderUndo.moves.map(m => dirname(m.to).split(sep).join('/')).filter(d => d && d !== '.')])];
  dirs.sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length);
  for (const rel of dirs) {
    try {
      const d = safeInside(realRoot, rel);
      if (existsSync(d) && statSync(d).isDirectory() && readdirSync(d).length === 0) { rmdirSync(d); removedDirs++; }
    } catch {}
  }
  return { restored, skipped, removedDirs };
}
