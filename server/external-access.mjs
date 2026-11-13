import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { forbiddenRef } from './referencias.mjs';

// A autorização vale só para uma tarefa. Nunca vem do texto gerado pela IA.
export function approvedExtraDir(path, project) {
  if (typeof path !== 'string' || !path.trim() || path.length > 2000 || !isAbsolute(path)) throw new Error('Informe o caminho completo de uma pasta extra.');
  if (project?.area === 'Financeiro') throw new Error('Projetos financeiros não recebem acesso a pastas extras.');
  let real;
  try { real = realpathSync(path.trim()); if (!statSync(real).isDirectory()) throw 0; } catch { throw new Error('A pasta extra não existe ou não está acessível.'); }
  if (forbiddenRef(real)) throw new Error('Esta pasta é protegida. Escolha uma pasta de trabalho específica.');
  if (resolve(real).toLowerCase() === resolve(project.path).toLowerCase()) throw new Error('Esta já é a pasta do projeto em foco.');
  return real;
}
