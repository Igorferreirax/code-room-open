// Uso manual, fora do CI: node scripts/homologar-assistente-real.mjs
// Confere o Modo Piloto com Claude Code numa pasta descartável, sem tocar projetos reais.
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { setup, waitFor } from '../test/helpers.mjs';
import { Assistant, loadManual } from '../server/assistant.mjs';
import { command } from '../server/connectors.mjs';

const root = process.cwd(), base = await realpath(join(root, 'dist'));
const work = await realpath(await mkdtemp(join(base, 'nico-piloto-')));
const projectPath = join(work, 'projeto'), extraDir = join(work, 'extra');
await mkdir(projectPath); await mkdir(extraDir);
await writeFile(join(projectPath, 'solto.txt'), 'ORGANIZAR\n');
await writeFile(join(projectPath, 'rascunho.txt'), 'ANTIGO\n');
try {
  const { store, runner } = await setup({ runnerOpts: { buildCommand: command } });
  const project = store.put('projects', { id: 'p-nico-real', name: 'Homologação Nico', path: projectPath, area: 'Programação', createdAt: new Date().toISOString() });
  const world = async () => ({ agents: store.list('agents').filter(a => !a.internal), teams: [], projects: [project], connected: new Set(['claude']), skills: [], runs: [] });
  const assistant = new Assistant({ store, root, dataDir: join(work, 'data'), world, pump: () => void runner.pump(), mcpFn: () => [] });
  store.put('settings', { id: 'assistant', provider: 'claude', briefedAt: new Date().toISOString(), manualHash: loadManual(root).hash, knowledge: 'O Code Room coordena agentes locais. No Modo Piloto trabalho com as ferramentas liberadas e confiro arquivos.', messages: [], thread: { id: 't1', title: 'Homologação' }, others: [], order: ['t1'] });
  await assistant.setAutonomy('pilot');
  await assistant.ask(`Organize os arquivos soltos do projeto: crie a pasta docs e mova solto.txt para docs/solto.txt. Edite o arquivo existente rascunho.txt, trocando ANTIGO por REVISADO. Crie o arquivo ${join(extraDir, 'AUTORIZADO.txt')} com AUTORIZADO. Esta pasta extra foi autorizada para este pedido. Confira os três arquivos no disco e responda de forma curta.`, { projectId: project.id, extraDir });
  const state = await waitFor(async () => { const s = await assistant.status(); return s.pending ? null : s; }, 240000, 'Nico piloto real');
  const last = state.messages.at(-1), task = store.get('tasks', last?.taskId);
  const content = async file => { try { return (await readFile(file, 'utf8')).trim(); } catch { return null; } };
  const moved = await content(join(projectPath, 'docs', 'solto.txt')) === 'ORGANIZAR';
  const edited = await content(join(projectPath, 'rascunho.txt')) === 'REVISADO';
  const external = await content(join(extraDir, 'AUTORIZADO.txt')) === 'AUTORIZADO';
  const original = await content(join(projectPath, 'solto.txt'));
  const attempt = store.get('runs', task?.attempts?.at(-1));
  const diagnostics = store.events(attempt?.id || '').filter(e => ['diagnostic', 'error'].includes(e.type)).slice(-3).map(e => String(e.text || '').slice(0, 240));
  console.log(JSON.stringify({ status: task?.status, moved, edited, external, originalRemoved: original === null, answer: String(last?.text || last?.error || '').slice(0, 1800), diagnostics }));
  if (task?.status !== 'completed' || !moved || !edited || !external || original !== null) process.exitCode = 1;
} finally {
  if (!work.startsWith(base + sep)) throw new Error('Pasta de homologação saiu de dist; limpeza abortada.');
  await rm(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
}
