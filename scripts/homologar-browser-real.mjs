// Teste manual, fora do CI: node scripts/homologar-browser-real.mjs
// Usa Claude Code com navegador isolado, uma página local e uma pasta descartável.
import { createServer } from 'node:http';
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { setup, addAgent, waitFor } from '../test/helpers.mjs';
import { createTask } from '../server/tasks.mjs';
import { command } from '../server/connectors.mjs';

const base = await realpath(join(process.cwd(), 'dist'));
const browserMode = process.argv[2] || 'isolado';
if (!['isolado', 'chrome'].includes(browserMode)) throw new Error('Informe isolado ou chrome.');
const projectPath = await realpath(await mkdtemp(join(base, 'browser-projeto-')));
let opened = 0, clicked = 0;
const page = '<!doctype html><html lang="pt-BR"><title>Teste do Code Room</title><button id="acao">Testar navegador</button><p id="resultado">Aguardando</p><script>document.getElementById("acao").onclick=async()=>{await fetch("/feito",{method:"POST"});document.getElementById("resultado").textContent="VALIDADO"}</script></html>';
const server = createServer((req, res) => {
  if (req.url === '/feito' && req.method === 'POST') { clicked++; console.log('Navegador: botão clicado.'); res.writeHead(200); res.end('ok'); return; }
  if (req.url === '/' && req.method === 'GET') { opened++; console.log('Navegador: página aberta.'); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); return; }
  res.writeHead(404); res.end();
});
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const { store, runner } = await setup({ runnerOpts: { buildCommand: command } });
  const project = store.put('projects', { id: 'p-browser-real', name: 'Homologação navegador', path: projectPath, area: 'Programação', createdAt: new Date().toISOString() });
  const agent = addAgent(store, 'browser-real', { provider: 'claude', mode: 'read', browser: browserMode });
  const task = createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'browser-real-1', objective: `Abra ${url} com a ferramenta de navegador, clique no botão "Testar navegador", leia o texto que aparece e responda com ele. Não edite arquivos nem use comandos de terminal.`, limits: { timeoutMs: 180000 } }).task;
  await runner.pump();
  const result = await waitFor(() => { const t = store.get('tasks', task.id); return ['completed', 'failed', 'cancelled', 'blocked'].includes(t.status) ? t : null; }, 205000, 'navegador real');
  const attempt = store.get('runs', result.attempts?.at(-1));
  const answer = String(attempt?.answer || '').slice(0, 500);
  const diagnostics = store.events(attempt?.id || '').filter(e => ['diagnostic', 'error'].includes(e.type)).slice(-4).map(e => String(e.text || '').slice(0, 300));
  const activity = store.events(attempt?.id || '').filter(e => e.type === 'activity').slice(-5).map(e => String(e.text || '').slice(0, 180));
  const projectFiles = await readdir(projectPath);
  console.log(JSON.stringify({ browserMode, status: result.status, failureKind: result.failureKind || null, reason: String(result.reason || '').slice(0, 300), answer, opened, clicked, projectFiles, activity, diagnostics }));
  if (result.status !== 'completed' || !clicked || !answer.includes('VALIDADO') || projectFiles.length) process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
  if (!projectPath.startsWith(base + sep)) throw new Error('Pasta de teste saiu de dist; limpeza abortada.');
  try { await rm(projectPath, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 }); }
  catch (e) { console.error(`Pasta descartável ficou em uso e precisa ser removida depois: ${e.message}`); process.exitCode = 1; }
}
