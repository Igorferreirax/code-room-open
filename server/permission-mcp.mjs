#!/usr/bin/env node
// Ferramenta de aprovação do Code Room (servidor MCP por entrada/saída padrão, sem dependências).
// O Claude Code chama "aprovar" (--permission-prompt-tool) sempre que quer usar algo que não está liberado.
// Em vez de negar sozinho (o que deixava o Code Room "só leitura" na prática), a pergunta vai para a tela
// do Code Room e a IA espera a resposta da pessoa: Permitir ou Negar.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { approvals } from './approvals.mjs';

export const NAME = 'aprovacao', TOOL = 'aprovar';
export const PROMPT_TOOL = `mcp__${NAME}__${TOOL}`;
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const TOOLS = [{ name: TOOL, description: 'Pede à pessoa, na tela do Code Room, permissão para usar uma ferramenta.', inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, required: ['tool_name'] } }];

// Resposta no formato que o Claude Code espera da ferramenta de permissão.
export const answer = (status, input, message = '') => JSON.stringify(status === 'allow' ? { behavior: 'allow', updatedInput: input || {} } : { behavior: 'deny', message: message || 'A pessoa negou no Code Room.' });

export async function askAndWait({ base, token, taskId, tool, input, fetchFn = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), maxWaitMs = 11 * 60 * 1000 }) {
  const headers = { 'Content-Type': 'application/json', 'X-Code-Room-Approval': token };
  try {
    const r = await fetchFn(`${base}/api/approvals/ask`, { method: 'POST', headers, body: JSON.stringify({ taskId, tool, input }) });
    let a = await r.json(); if (!r.ok) return answer('deny', input, a?.error || 'O Code Room recusou o pedido.');
    const start = Date.now();
    while (a.status === 'pending' && Date.now() - start < maxWaitMs) {
      await sleep(1000);
      const g = await fetchFn(`${base}/api/approvals/${encodeURIComponent(a.id)}`, { headers }); a = { ...a, ...(await g.json()) };
    }
    return answer(a.status === 'allow' ? 'allow' : 'deny', input, a.message || (a.status === 'pending' ? 'Ninguém respondeu a tempo.' : ''));
  } catch (e) { return answer('deny', input, `Não consegui falar com o Code Room: ${e.message}`); }
}

export async function handle(msg, ctx) {
  const { id, method, params } = msg || {};
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOLS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOLS[0], capabilities: { tools: {} }, serverInfo: { name: NAME, version: '1.0.0' } } };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    const a = params?.arguments || {};
    const text = await askAndWait({ ...ctx, tool: String(a.tool_name || ''), input: a.input || {} });
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (id === undefined || id === null) return null;
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Método não suportado' } };
}

// Configuração para o Claude: endereço e chave de aprovação vão pelo ambiente do processo da ferramenta.
export function approvalServer(taskId, { port = approvals.port, token = approvals.token } = {}) {
  return { command: process.execPath, args: [fileURLToPath(import.meta.url)], env: { CODE_ROOM_APPROVAL_URL: `http://127.0.0.1:${port}`, CODE_ROOM_APPROVAL_TOKEN: token, CODE_ROOM_TASK: String(taskId || '') } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const ctx = { base: process.env.CODE_ROOM_APPROVAL_URL || 'http://127.0.0.1:4780', token: process.env.CODE_ROOM_APPROVAL_TOKEN || '', taskId: process.env.CODE_ROOM_TASK || '' };
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async line => { let msg; try { msg = JSON.parse(line); } catch { return; } const out = await handle(msg, ctx); if (out) process.stdout.write(JSON.stringify(out) + '\n'); });
}
