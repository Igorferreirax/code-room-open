#!/usr/bin/env node
// Ferramenta de arquivos do Code Room para as IAs (servidor MCP por entrada/saída padrão, sem dependências).
// Existe porque o Claude Code e o Antigravity não têm "mover arquivo": mover exige terminal, e o Code Room não libera
// terminal. Sem isso, "organize a minha Área de Trabalho" falhava (conferido com o Claude real em 16/11/2026).
//
// Segurança:
// - Só age dentro das pastas autorizadas NESTA tarefa (a do projeto e a pasta extra), recebidas na linha de comando.
// - Nunca apaga nada e nunca sobrescreve: se o destino existe, recusa.
// - Recusa atalhos/links simbólicos e caminhos que escapam com "..".
import { appendFileSync, readdirSync, mkdirSync, renameSync, lstatSync, realpathSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, sep, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

export const NAME = 'arquivos';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const TOOLS = [
  { name: 'listar_pasta', description: 'Lista arquivos e subpastas de uma pasta autorizada (nome, tipo e tamanho).', inputSchema: { type: 'object', properties: { caminho: { type: 'string', description: 'Caminho completo da pasta.' } }, required: ['caminho'] }, annotations: { readOnlyHint: true } },
  { name: 'criar_pasta', description: 'Cria uma pasta (e as pastas do meio) dentro de uma pasta autorizada. Não faz nada se ela já existe.', inputSchema: { type: 'object', properties: { caminho: { type: 'string', description: 'Caminho completo da pasta nova.' } }, required: ['caminho'] }, annotations: { destructiveHint: false } },
  { name: 'mover', description: 'Move ou renomeia um arquivo ou pasta dentro das pastas autorizadas. Cria a pasta de destino se faltar. Nunca sobrescreve: se o destino já existe, recusa. Nunca apaga nada.', inputSchema: { type: 'object', properties: { de: { type: 'string', description: 'Caminho completo de origem.' }, para: { type: 'string', description: 'Caminho completo de destino (incluindo o nome final).' } }, required: ['de', 'para'] }, annotations: { destructiveHint: false } },
  { name: 'mover_para_lixeira', description: 'Para "apagar", "excluir" ou "deletar": manda um arquivo ou pasta de uma pasta autorizada para a Lixeira do Windows (dá para recuperar de lá). Nunca apaga de vez.', inputSchema: { type: 'object', properties: { caminho: { type: 'string', description: 'Caminho completo do arquivo ou pasta.' } }, required: ['caminho'] }, annotations: { destructiveHint: false } },
];

// Lixeira do Windows pelo próprio .NET (sem diálogo): o arquivo some da pasta mas pode ser restaurado.
export function toRecycleBin(path, { run = spawnSync } = {}) {
  const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const q = String(path).replace(/'/g, "''"), dir = statSync(path).isDirectory();
  const cmd = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${dir ? 'DeleteDirectory' : 'DeleteFile'}('${q}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  const r = run(ps, ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 60000, encoding: 'utf8' });
  if (r.status !== 0 || existsSync(path)) throw new Error(`O Windows não mandou para a Lixeira: ${String(r.stderr || r.error?.message || 'erro desconhecido').trim().slice(0, 200)}`);
  return dir;
}

const norm = p => resolve(p).toLowerCase();
export function makeGuard(roots) {
  const real = roots.filter(r => typeof r === 'string' && isAbsolute(r) && existsSync(r)).map(r => realpathSync(r));
  if (!real.length) throw new Error('Nenhuma pasta autorizada.');
  const inside = p => { const n = norm(p); return real.some(r => n === norm(r) || n.startsWith(norm(r) + sep)); };
  const guard = (p, { mustExist = false } = {}) => {
    if (typeof p !== 'string' || !p.trim() || !isAbsolute(p.trim())) throw new Error('Use o caminho completo (ex.: C:\\Users\\voce\\Desktop\\Pasta).');
    const full = resolve(p.trim());
    if (!inside(full)) throw new Error(`Fora das pastas autorizadas nesta tarefa: ${full}`);
    // Confere o pedaço que já existe no disco pelo caminho real (um link não pode levar para fora).
    let probe = full; while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
    if (!inside(realpathSync(probe))) throw new Error('Esse caminho passa por um atalho que leva para fora das pastas autorizadas.');
    if (existsSync(full) && lstatSync(full).isSymbolicLink()) throw new Error('Links simbólicos não são movidos.');
    if (mustExist && !existsSync(full)) throw new Error(`Não existe: ${full}`);
    return full;
  };
  guard.isRoot = p => real.some(r => norm(r) === norm(p));   // a própria pasta autorizada (não vai para a Lixeira inteira)
  return guard;
}

function missingDirs(dir) {
  const out = []; let cur = resolve(dir);
  while (!existsSync(cur) && dirname(cur) !== cur) { out.unshift(cur); cur = dirname(cur); }
  return out;
}

export function callTool(guard, name, args = {}, opts = {}) {
  const { onOp = null } = opts;
  if (name === 'listar_pasta') {
    const dir = guard(args.caminho, { mustExist: true });
    if (!statSync(dir).isDirectory()) throw new Error('Isso não é uma pasta.');
    const items = readdirSync(dir, { withFileTypes: true }).slice(0, 500).map(e => { let size = null; try { if (e.isFile()) size = statSync(join(dir, e.name)).size; } catch {} return `${e.isDirectory() ? '[pasta] ' : ''}${e.name}${size != null ? ` (${size} bytes)` : ''}`; });
    return items.length ? items.join('\n') : '(pasta vazia)';
  }
  if (name === 'criar_pasta') {
    const dir = guard(args.caminho), created = missingDirs(dir);
    mkdirSync(dir, { recursive: true });
    for (const d of created) try { onOp?.({ op: 'mkdir', path: d }); } catch {}
    return `Pasta pronta: ${dir}`;
  }
  if (name === 'mover') {
    const from = guard(args.de, { mustExist: true }), to = guard(args.para);
    if (norm(from) === norm(to)) throw new Error('Origem e destino são o mesmo caminho.');
    if (norm(to).startsWith(norm(from) + sep)) throw new Error('Não dá para mover uma pasta para dentro dela mesma.');
    if (existsSync(to)) throw new Error(`Já existe algo em ${to}. Escolha outro nome; nada foi sobrescrito.`);
    const st = statSync(from), created = missingDirs(dirname(to));
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
    for (const d of created) try { onOp?.({ op: 'mkdir', path: d }); } catch {}
    try { onOp?.({ op: 'move', from, to, size: st.isFile() ? st.size : null, isDir: st.isDirectory() }); } catch {}
    return `Movido: ${from} → ${to}`;
  }
  if (name === 'mover_para_lixeira') {
    const target = guard(args.caminho, { mustExist: true });
    if (norm(target) === norm(dirname(target)) || guard.isRoot?.(target)) throw new Error('Não mando a pasta autorizada inteira para a Lixeira; escolha os arquivos ou subpastas dentro dela.');
    const isDir = (opts.recycle || toRecycleBin)(target);
    try { onOp?.({ op: 'trash', path: target, isDir }); } catch {}
    return `Enviado para a Lixeira do Windows (dá para restaurar de lá): ${target}`;
  }
  throw new Error(`Ferramenta desconhecida: ${name}`);
}

export function handle(guard, msg, opts = {}) {
  const { id, method, params } = msg || {};
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOLS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOLS[0], capabilities: { tools: {} }, serverInfo: { name: NAME, version: '1.0.0' } } };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    try { return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: callTool(guard, params?.name, params?.arguments || {}, opts) }] } }; }
    catch (e) { return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Não fiz: ${e.message}` }], isError: true } }; }
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (id === undefined || id === null) return null;   // notificações não têm resposta
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Método não suportado' } };
}

// Configuração para as CLIs: pastas autorizadas vão como argumentos (nada de variável de ambiente compartilhada).
export function filesServer(roots, { opsLog = null } = {}) {
  return { command: process.execPath, args: [fileURLToPath(import.meta.url), ...roots.filter(Boolean)], ...(opsLog ? { env: { CODE_ROOM_OPS_LOG: opsLog } } : {}) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const rawArgs = process.argv.slice(2), logArg = rawArgs.find(a => a.startsWith('--ops-log='));
  const logFile = logArg ? logArg.slice('--ops-log='.length) : process.env.CODE_ROOM_OPS_LOG || '';
  const guard = makeGuard(rawArgs.filter(a => !a.startsWith('--ops-log=')));
  const onOp = logFile ? entry => { try { mkdirSync(dirname(logFile), { recursive: true }); appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8'); } catch {} } : null;
  const rl = createInterface({ input: process.stdin });
  rl.on('line', line => { let msg; try { msg = JSON.parse(line); } catch { return; } const out = handle(guard, msg, { onOp }); if (out) process.stdout.write(JSON.stringify(out) + '\n'); });
}
