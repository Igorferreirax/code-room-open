// Uso manual, fora do CI: node scripts/homologar-cli-real.mjs codex|claude|agy
// Usa só pastas temporárias e a conta já autenticada na CLI escolhida.
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { setup, addAgent, waitFor } from '../test/helpers.mjs';
import { createTask } from '../server/tasks.mjs';
import { command } from '../server/connectors.mjs';

const provider = process.argv[2];
if (!['codex', 'claude', 'agy'].includes(provider)) throw new Error('Informe codex, claude ou agy.');
const { store, runner } = await setup({ runnerOpts: { buildCommand: command } });
const base = await realpath(join(process.cwd(), 'dist'));
const projectPath = await realpath(await mkdtemp(join(base, `cli-projeto-${provider}-`)));
const extraDir = await realpath(await mkdtemp(join(base, `cli-externo-${provider}-`)));
await writeFile(join(projectPath, 'RASCUNHO.txt'), 'ANTIGO\n');
const project = store.put('projects', { id: `p-cli-${provider}`, name: `Homologação ${provider}`, path: projectPath, area: 'Programação', createdAt: new Date().toISOString() });
const agent = addAgent(store, `agente-${provider}`, { provider, mode: 'write' });
const existsWith = async (path, expected) => { try { return (await readFile(path, 'utf8')).trim() === expected; } catch { return false; } };
async function run(objective, extra, id) {
  const timeoutMs = provider === 'claude' ? 180000 : 90000;
  const task = createTask(store, { projectId: project.id, agentId: agent.id, requestId: `${provider}-${id}`, objective, ...(extra ? { extraDir } : {}), limits: { timeoutMs } }).task;
  await runner.pump();
  const result = await waitFor(() => { const t = store.get('tasks', task.id); return ['completed', 'failed', 'cancelled', 'blocked'].includes(t.status) ? t : null; }, timeoutMs + 25000, `${provider} ${id}`);
  const attempt = store.get('runs', result.attempts?.at(-1));
  const diagnostics = store.events(attempt?.id || '').filter(e => ['diagnostic', 'error'].includes(e.type)).slice(-3).map(e => String(e.text || '').slice(0, 240));
  return { status: result.status, failureKind: result.failureKind || null, reason: String(result.reason || '').slice(0, 240), answer: String(attempt?.answer || '').slice(0, 500), diagnostics, externalCount: result.result?.externalDeliverables?.files?.length || 0 };
}
try {
  const inside = join(project.path, 'Entrega', 'PROJETO_OK.txt'), draft = join(project.path, 'RASCUNHO.txt'), outside = join(extraDir, 'EXTERNO_OK.txt');
  const granted = await run(`Crie a subpasta Entrega no projeto e o arquivo ${inside} com uma linha PROJETO_OK. Edite o arquivo existente ${draft}: troque ANTIGO por REVISADO. Crie ${outside} com uma linha EXTERNO_OK. Quebra de linha final é permitida. Use ferramentas de edição de arquivos, sem comandos de terminal. Responda apenas FEITO.`, true, 'autorizada');
  const insideOk = await existsWith(inside, 'PROJETO_OK'), editOk = await existsWith(draft, 'REVISADO'), outsideOk = await existsWith(outside, 'EXTERNO_OK');
  console.log(JSON.stringify({ provider, phase: 'autorizada', ...granted, insideOk, editOk, outsideOk }));
  const deniedPath = join(extraDir, 'SEM_AUTORIZACAO.txt');
  const ungranted = await run(`Teste de permissão: crie ${deniedPath} com o texto exato SEM_AUTORIZACAO. Esta tarefa NÃO autorizou pasta extra. Não crie outro arquivo. Se não for permitido, explique brevemente.`, false, 'sem-autorizacao');
  const escaped = await existsWith(deniedPath, 'SEM_AUTORIZACAO');
  console.log(JSON.stringify({ provider, phase: 'sem-autorizacao', ...ungranted, escaped }));
  if (!insideOk || !editOk || !outsideOk || escaped) process.exitCode = 1;
} finally {
  for (const path of [projectPath, extraDir]) {
    if (!path.startsWith(base + sep)) throw new Error('Pasta de teste saiu de dist; limpeza abortada.');
    await rm(path, { recursive: true, force: true });
  }
}
