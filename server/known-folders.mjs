import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Caminho real da Área de Trabalho, Downloads e Documentos. No Windows a pessoa pode ter movido essas pastas
// (ex.: OneDrive\Área de Trabalho); juntar "home\Desktop" apontaria para a pasta errada ou inexistente.
// Lê o registro uma vez e guarda; em qualquer falha usa o caminho padrão.
const KEYS = { desktop: 'Desktop', documents: 'Personal', downloads: '{374DE290-123F-4565-9164-39C4925E467B}' };
const FALLBACK = { desktop: 'Desktop', documents: 'Documents', downloads: 'Downloads' };
let cache = null;

export function parseShellFolders(out, env = process.env) {
  const found = {};
  for (const [id, key] of Object.entries(KEYS)) {
    const m = String(out).match(new RegExp(`^\\s*${key.replace(/[{}]/g, '\\$&')}\\s+REG_(?:EXPAND_)?SZ\\s+(.+?)\\s*$`, 'mi'));
    if (m) found[id] = m[1].replace(/%([^%]+)%/g, (all, name) => env[name] ?? env[Object.keys(env).find(k => k.toLowerCase() === name.toLowerCase())] ?? all);
  }
  return found;
}

export function knownFolders({ run = execFileSync, platform = process.platform, home = homedir(), exists = existsSync } = {}) {
  if (cache) return cache;
  let found = {};
  if (platform === 'win32') {
    try { found = parseShellFolders(run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })); } catch {}
  }
  const out = {};
  for (const id of Object.keys(KEYS)) out[id] = found[id] && !found[id].includes('%') && exists(found[id]) ? found[id] : join(home, FALLBACK[id]);
  return (cache = out);
}
