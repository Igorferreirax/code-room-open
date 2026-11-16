// Teste manual, fora do CI: node scripts/homologar-programa-real.mjs
// Executa somente um programa local permitido, dentro de um projeto descartável.
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { setup, addAgent, waitFor } from '../test/helpers.mjs';
import { createTask } from '../server/tasks.mjs';
import { command } from '../server/connectors.mjs';

const base = await realpath(join(process.cwd(), 'dist'));
const projectPath = await realpath(await mkdtemp(join(base, 'programa-projeto-')));
const marker = join(projectPath, 'COMANDO_OK.txt');
await writeFile(join(projectPath, 'executar.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('COMANDO_OK.txt', 'EXECUTADO\\n'); console.log('COMANDO_EXECUTADO');\n");
try {
  const { store, runner } = await setup({ runnerOpts: { buildCommand: command } });
  const project = store.put('projects', { id: 'p-programa-real', name: 'Homologação programa', path: projectPath, area: 'Programação', createdAt: new Date().toISOString() });
  const agent = addAgent(store, 'programa-real', { provider: 'claude', mode: 'write', commands: ['node'] });
  const task = createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'programa-real-1', objective: 'Execute o programa local autorizado com o comando exato `node executar.mjs` na pasta do projeto. Depois leia COMANDO_OK.txt e diga o resultado. Não use outro comando nem edite arquivos com ferramentas de edição.', limits: { timeoutMs: 180000 } }).task;
  await runner.pump();
  const result = await waitFor(() => { const t = store.get('tasks', task.id); return ['completed', 'failed', 'cancelled', 'blocked'].includes(t.status) ? t : null; }, 205000, 'programa real');
  const attempt = store.get('runs', result.attempts?.at(-1));
  const events = store.events(attempt?.id || '');
  const activity = events.filter(e => e.type === 'activity').slice(-8).map(e => String(e.text || '').slice(0, 200));
  let markerText = null; try { markerText = (await readFile(marker, 'utf8')).trim(); } catch {}
  console.log(JSON.stringify({ status: result.status, failureKind: result.failureKind || null, reason: String(result.reason || '').slice(0, 300), answer: String(attempt?.answer || '').slice(0, 500), markerText, usedTerminal: activity.some(x => /Ferramentas: (Bash|PowerShell)/.test(x)), activity }));
  if (result.status !== 'completed' || markerText !== 'EXECUTADO' || !activity.some(x => /Ferramentas: (Bash|PowerShell)/.test(x))) process.exitCode = 1;
} finally {
  if (!projectPath.startsWith(base + sep)) throw new Error('Pasta de teste saiu de dist; limpeza abortada.');
  await rm(projectPath, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
}
