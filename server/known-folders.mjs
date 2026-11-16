import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Caminho real da Área de Trabalho, Downloads e Documentos. No Windows a pessoa pode ter movido essas pastas
// (ex.: OneDrive\Área de Trabalho). Pergunta ao próprio Windows (PowerShell com saída em UTF-8: o reg.exe devolve
// acentos numa página de código antiga e "Área" chegava estragada) e, se não servir, testa os lugares comuns.
// Guarda o resultado; em qualquer falha usa o primeiro caminho que existir.
const FALLBACK = {
  desktop: ['OneDrive\\Área de Trabalho', 'OneDrive\\Desktop', 'Área de Trabalho', 'Desktop'],
  documents: ['OneDrive\\Documentos', 'OneDrive\\Documents', 'Documentos', 'Documents'],
  downloads: ['Downloads'],
};
const PS = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $d=[Environment]::GetFolderPath('Desktop'); $m=[Environment]::GetFolderPath('MyDocuments'); $w=''; try { $w=(New-Object -ComObject Shell.Application).Namespace('shell:Downloads').Self.Path } catch {}; 'desktop=' + $d; 'documents=' + $m; 'downloads=' + $w";
let cache = null;

export function parseFolders(out) {
  const found = {};
  for (const line of String(out).split(/\r?\n/)) { const m = /^(desktop|documents|downloads)=(.+)$/.exec(line.trim()); if (m && m[2].trim()) found[m[1]] = m[2].trim(); }
  return found;
}

function pick(found, { home, exists, env }) {
  const out = {};
  for (const id of Object.keys(FALLBACK)) {
    const oneDrive = env.OneDrive ? FALLBACK[id].filter(r => r.startsWith('OneDrive\\')).map(r => join(env.OneDrive, r.slice('OneDrive\\'.length))) : [];
    const tries = [found[id], ...oneDrive, ...FALLBACK[id].map(r => join(home, r))].filter(Boolean);
    out[id] = tries.find(p => { try { return exists(p); } catch { return false; } }) || join(home, FALLBACK[id].at(-1));
  }
  return out;
}

// Síncrono e instantâneo: devolve o que o Windows informou (depois de warmKnownFolders) ou os lugares comuns.
export function knownFolders({ home = homedir(), exists = existsSync, env = process.env, found = null } = {}) {
  if (found) return pick(found, { home, exists, env });
  return cache || pick({}, { home, exists, env });
}

// Pergunta ao Windows em segundo plano (leva ~1,5 s), sem travar o servidor. Chamado na abertura do Code Room.
export function warmKnownFolders({ run = execFile, platform = process.platform } = {}) {
  if (platform !== 'win32') return Promise.resolve(knownFolders());
  return new Promise(resolve => {
    try {
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { encoding: 'utf8', windowsHide: true, timeout: 8000 }, (err, stdout) => {
        cache = pick(err ? {} : parseFolders(stdout), { home: homedir(), exists: existsSync, env: process.env }); resolve(cache);
      });
    } catch { resolve(knownFolders()); }
  });
}
