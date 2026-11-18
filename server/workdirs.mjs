// Pastas liberadas do projeto: outras pastas do computador que TODA a equipe do projeto pode usar diretamente, como
// quando você chama o Claude, o Codex ou o Gemini no terminal. Diferente das pastas de referência (cópia só leitura),
// aqui o agente trabalha no original: "editar" permite criar e alterar; "ler" só consultar.
// Vão para as CLIs como pastas de trabalho (--add-dir) e para a ferramenta de arquivos do Code Room.
import { realpath, stat } from 'node:fs/promises';
import { resolve, isAbsolute, sep } from 'node:path';
import { forbiddenRef } from './referencias.mjs';

export const MAX_WORKDIRS = 8;
const inside = (a, b) => (resolve(a).toLowerCase() + sep).startsWith(resolve(b).toLowerCase() + sep);

// Valida a lista: caminho completo e existente, fora de pastas do sistema, sem repetir nem ser a pasta do projeto.
export async function cleanWorkDirs(input, projectPath) {
  if (!Array.isArray(input)) throw new Error('Informe a lista de pastas.');
  if (input.length > MAX_WORKDIRS) throw new Error(`No máximo ${MAX_WORKDIRS} pastas liberadas por projeto.`);
  const proj = await realpath(projectPath).catch(() => projectPath), out = [], seen = new Set();
  for (const item of input) {
    const raw = String(item?.path ?? '').trim().replace(/[\\/]+$/, ''); if (!raw) continue;
    if (!isAbsolute(raw) || raw.length > 400 || /[\0\r\n]/.test(raw)) throw new Error('Cada pasta precisa ser um caminho completo (ex.: C:\\Users\\voce\\Desktop).');
    let real; try { real = await realpath(raw); if (!(await stat(real)).isDirectory()) throw 0; } catch { throw new Error(`A pasta não existe: ${raw}`); }
    if (forbiddenRef(real)) throw new Error(`Pasta protegida pelo sistema (raiz do disco, Windows, Arquivos de Programas): ${raw}`);
    if (inside(real, proj) || real.toLowerCase() === resolve(proj).toLowerCase()) throw new Error('Essa pasta já faz parte do projeto.');
    if (seen.has(real.toLowerCase())) continue; seen.add(real.toLowerCase());
    out.push({ path: real, write: item?.write !== false });
  }
  return out;
}

// Na hora da tarefa: só as que ainda existem (uma pasta apagada ou movida não derruba a tarefa, só some da lista).
export async function liveWorkDirs(list = []) {
  const ok = [], missing = [];
  for (const d of Array.isArray(list) ? list : []) { try { if ((await stat(d.path)).isDirectory()) ok.push({ path: d.path, write: d.write !== false }); else missing.push(d.path); } catch { missing.push(d.path); } }
  return { ok, missing };
}

// Texto para o pedido do agente.
export function workDirsBlock(list = []) {
  if (!list.length) return '';
  return `# Pastas liberadas pelo projeto\nAlém da pasta do projeto, você pode usar diretamente estas pastas (caminho completo):\n${list.map(d => `- ${d.path} (${d.write ? 'pode criar e alterar arquivos' : 'só ler, não altere nada'})`).join('\n')}\nFora delas e da pasta do projeto, não mexa em nada sem a pessoa pedir.`;
}
