#!/usr/bin/env node
// Servidor MCP do Code Room (Model Context Protocol, por entrada/saída padrão, sem dependências).
// Deixa outra ferramenta (Claude Code, Codex, Cursor...) consultar o Code Room e, se você permitir, criar tarefas.
//
// Segurança:
// - Usa um token PRÓPRIO de aparelho (o mesmo mecanismo do celular), nunca a chave principal. Aparece em
//   Configurações › Acesso › Aparelhos pareados e dá para revogar.
// - Por padrão é SÓ LEITURA. Criar e cancelar tarefa exige ligar de propósito (CODE_ROOM_MCP_ESCREVER=1 ou --escrever).
// - Aprovar, reprovar, apagar e mudar configurações NÃO existem aqui, de propósito: isso continua sendo decisão sua.
// - Só fala com 127.0.0.1 (o próprio computador).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

export const NAME = 'code-room';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_TEXT = 12000;
const ID = /^[a-zA-Z0-9-]{1,80}$/;
const clip = (s, n = MAX_TEXT) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + `\n… (cortado, ${s.length - n} caracteres a mais)` : s; };
const json = v => clip(JSON.stringify(v, null, 2));
class Falha extends Error {}

const READ = { readOnlyHint: true, openWorldHint: false };
export const TOOLS = [
  { name: 'status', description: 'Resumo do Code Room: versão, quantos projetos e agentes existem e quantas tarefas estão rodando ou na fila.', inputSchema: { type: 'object', properties: {} }, annotations: READ },
  { name: 'listar_projetos', description: 'Lista os projetos (id, nome e área).', inputSchema: { type: 'object', properties: {} }, annotations: READ },
  { name: 'listar_agentes', description: 'Lista os agentes (id, nome, função, sala, IA e modelo).', inputSchema: { type: 'object', properties: {} }, annotations: READ },
  { name: 'listar_tarefas', description: 'Lista as tarefas mais recentes. Filtros opcionais por projeto e por estado (queued, running, completed, failed, cancelled...).', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, status: { type: 'string' }, limite: { type: 'integer', minimum: 1, maximum: 50 } } }, annotations: READ },
  { name: 'ver_tarefa', description: 'Detalhes de uma tarefa: estado, motivo da falha, resposta do agente e arquivos entregues.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: READ },
  { name: 'listar_entregas', description: 'Tarefas concluídas que geraram arquivos (as 20 mais recentes).', inputSchema: { type: 'object', properties: {} }, annotations: READ }
];
export const WRITE_TOOLS = [
  { name: 'criar_tarefa', description: 'Cria uma tarefa para um agente. Ela entra na fila e roda com a IA e a cota do agente. O resultado ainda passa pela aprovação no Code Room.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, agentId: { type: 'string' }, objetivo: { type: 'string', maxLength: 8000 } }, required: ['projectId', 'agentId', 'objetivo'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'cancelar_tarefa', description: 'Cancela uma tarefa que está na fila ou rodando.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } }
];

const taskLine = t => ({ id: t.id, estado: t.status, projeto: t.project?.name, agente: t.agent?.name, pedido: t.prompt, motivo: t.reason || undefined, criada_em: t.createdAt || undefined });

// `call(método, caminho, corpo)` devolve o JSON do Code Room. Separado para dar para testar sem rede.
export function createMcp({ call, escrever = false, version = '0' }) {
  const tools = escrever ? [...TOOLS, ...WRITE_TOOLS] : TOOLS;
  const state = () => call('GET', '/api/state');
  const run = {
    async status() {
      const s = await state(), rs = s.runs || [];
      const por = est => rs.filter(t => t.status === est).length;
      return { versao: s.runtime?.version, projetos: s.projects?.length ?? 0, agentes: s.agents?.length ?? 0, tarefas: { rodando: por('running') + por('starting'), na_fila: por('queued'), esperando_dependencia: por('waiting_dependency'), falharam: por('failed'), concluidas: por('completed') }, modo: escrever ? 'leitura e escrita' : 'somente leitura' };
    },
    async listar_projetos() { const s = await state(); return (s.projects || []).map(p => ({ id: p.id, nome: p.name, area: p.area })); },
    async listar_agentes() { const s = await state(); return (s.agents || []).map(a => ({ id: a.id, nome: a.name, funcao: a.role, sala: a.room, ia: a.provider, modelo: a.model || undefined, modo: a.mode })); },
    async listar_tarefas(a = {}) {
      const s = await state(); let rs = s.runs || [];
      if (a.projectId) rs = rs.filter(t => t.project?.id === a.projectId);
      if (a.status) rs = rs.filter(t => t.status === a.status);
      return rs.slice(0, Math.min(50, Math.max(1, Number(a.limite) || 20))).map(taskLine);
    },
    async ver_tarefa(a = {}) {
      if (!ID.test(a.id || '')) throw new Falha('Informe o id da tarefa.');
      const t = await call('GET', `/api/tasks/${a.id}`);
      return { id: t.id, estado: t.status, projeto: t.project?.name, agente: t.agent?.name, pedido: clip(t.prompt, 2000), motivo: t.reason || undefined, tentativas: t.attemptCount, resposta: clip(t.answer, 8000), arquivos: (t.deliverables?.files || []).filter(f => f.change !== 'deleted').slice(0, 30).map(f => f.path) };
    },
    async listar_entregas() {
      const s = await state();
      return (s.runs || []).filter(t => t.status === 'completed' && t.deliverables?.length).slice(0, 20).map(t => ({ id: t.id, projeto: t.project?.name, agente: t.agent?.name, arquivos: t.deliverables.map(f => f.path) }));
    },
    async criar_tarefa(a = {}) {
      if (!ID.test(a.projectId || '') || !ID.test(a.agentId || '')) throw new Falha('Informe projectId e agentId (use listar_projetos e listar_agentes).');
      const objetivo = String(a.objetivo || '').trim();
      if (!objetivo) throw new Falha('Informe o objetivo da tarefa.');
      if (objetivo.length > 8000) throw new Falha('O objetivo passa de 8000 caracteres.');
      const t = await call('POST', '/api/tasks', { projectId: a.projectId, agentId: a.agentId, objective: objetivo, requestId: `mcp-${randomUUID()}` });
      return { criada: true, ...taskLine(t) };
    },
    async cancelar_tarefa(a = {}) {
      if (!ID.test(a.id || '')) throw new Falha('Informe o id da tarefa.');
      return taskLine(await call('POST', `/api/tasks/${a.id}/cancel`, {}));
    }
  };
  const allowed = new Set(tools.map(t => t.name));

  async function handle(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return msg && 'id' in msg ? { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32600, message: 'Requisição inválida.' } } : null;
    }
    const { id, method, params } = msg, isNote = !('id' in msg);
    const ok = result => ({ jsonrpc: '2.0', id, result }), bad = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (isNote) return null; // notificações (initialized, cancelled...) não têm resposta
    if (method === 'initialize') {
      const want = params?.protocolVersion;
      return ok({ protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: NAME, version }, instructions: 'Code Room: sala local de agentes de IA. Consulte projetos, agentes e tarefas.' + (escrever ? ' Você pode criar e cancelar tarefas; a aprovação das entregas continua no Code Room.' : ' Este servidor está em modo somente leitura.') });
    }
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools });
    if (method === 'tools/call') {
      const name = params?.name;
      if (!allowed.has(name)) return ok({ isError: true, content: [{ type: 'text', text: WRITE_TOOLS.some(t => t.name === name) ? 'Esta ferramenta está desligada: o MCP do Code Room está em modo somente leitura. Ligue a escrita em Configurações › Acesso › Conectar outras ferramentas (MCP).' : `Ferramenta desconhecida: ${name}` }] });
      try { return ok({ content: [{ type: 'text', text: json(await run[name](params.arguments || {})) }] }); }
      catch (e) { return ok({ isError: true, content: [{ type: 'text', text: e instanceof Falha || e.userFacing ? e.message : `Não deu certo: ${e.message}` }] }); }
    }
    return bad(-32601, `Método não suportado: ${method}`);
  }
  return { handle, tools };
}

// ---- configuração local (só roda quando este arquivo é executado, não nos testes) ----
export function resolveConfig(env = process.env, root = join(dirname(fileURLToPath(import.meta.url)), '..')) {
  const packaged = existsSync(join(root, 'runtime', 'node.exe'));
  const dataDir = env.CODE_ROOM_DATA || (packaged && env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'CodeRoom', 'data') : join(root, '.data'));
  let port = Number(env.CODE_ROOM_PORT) || 0;
  if (!port) { try { port = Number(readFileSync(join(dataDir, 'port.txt'), 'utf8').trim()) || 0; } catch {} }
  port ||= 4780;
  let token = env.CODE_ROOM_TOKEN || '';
  if (!token) { try { token = readFileSync(join(dataDir, 'mcp-token'), 'utf8').trim(); } catch {} }
  const version = (() => { try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version; } catch { return '0'; } })();
  return { dataDir, port, token, version };
}

export function httpCall({ port, token }, fetchImpl = globalThis.fetch) {
  return async (method, path, body) => {
    if (!token) throw Object.assign(new Error('O MCP ainda não foi ativado. No Code Room, abra Configurações › Acesso › Conectar outras ferramentas (MCP) e clique em Ativar.'), { userFacing: true });
    let r;
    try { r = await fetchImpl(`http://127.0.0.1:${port}${path}`, { method, headers: { 'X-Code-Room-Key': token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) }); }
    catch { throw Object.assign(new Error(`O Code Room não respondeu na porta ${port}. Abra o Code Room e tente de novo.`), { userFacing: true }); }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('O token do MCP foi recusado ou revogado. Ative o MCP de novo no Code Room.'), { userFacing: true });
    if (!r.ok) throw Object.assign(new Error(data.error || `Erro ${r.status}`), { userFacing: true });
    return data;
  };
}

async function main() {
  const cfg = resolveConfig();
  const escrever = process.env.CODE_ROOM_MCP_ESCREVER === '1' || process.argv.includes('--escrever');
  const mcp = createMcp({ call: httpCall(cfg), escrever, version: cfg.version });
  const send = o => process.stdout.write(JSON.stringify(o) + '\n');
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let pending = 0, closed = false;
  const done = () => { if (closed && pending === 0) process.exit(0); };
  rl.on('line', async line => {
    if (!line.trim()) return;
    pending++;
    try {
      let msg; try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }); return; }
      if (Array.isArray(msg)) { const out = (await Promise.all(msg.map(m => mcp.handle(m)))).filter(Boolean); if (out.length) send(out); }
      else { const r = await mcp.handle(msg); if (r) send(r); }
    } finally { pending--; done(); }
  });
  rl.on('close', () => { closed = true; done(); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
