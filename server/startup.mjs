import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';

// "Iniciar com o Windows": um atalho na pasta Inicializar do usuário (não precisa de administrador).
// Quem cria e remove o atalho é scripts/iniciar-com-windows.ps1; aqui só lemos o estado e chamamos o script.
export const startupLink = (env = process.env) =>
  join(env.CODE_ROOM_ATALHOS_DIR ? join(env.CODE_ROOM_ATALHOS_DIR, 'Startup') : join(env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), 'Code Room.lnk');

export const startupState = (env = process.env, platform = process.platform) => ({ supported: platform === 'win32', on: platform === 'win32' && existsSync(startupLink(env)) });

export function setStartup(on, { root, run = execFile, env = process.env, platform = process.platform }) {
  if (platform !== 'win32') return Promise.reject(Object.assign(new Error('Iniciar com o Windows só existe no Windows.'), { status: 400 }));
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'iniciar-com-windows.ps1'), ...(on ? [] : ['-Remover'])];
  return new Promise((resolve, reject) => run('powershell.exe', args, { timeout: 20000, windowsHide: true, env }, err => {
    if (err) return reject(new Error('Não consegui mudar o início automático: ' + err.message));
    resolve(startupState(env, platform));
  }));
}
