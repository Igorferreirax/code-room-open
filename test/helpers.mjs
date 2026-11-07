import { mkdtemp, realpath, mkdir } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.mjs';
import { Runner } from '../server/runner.mjs';
import { Orchestrator } from '../server/orchestrator.mjs';
import { createTask } from '../server/tasks.mjs';

export const FAKE = resolve('test/fixtures/fake-agent.mjs');
export const fakeCommand = (agent, prompt) => ({ file: process.execPath, args: [FAKE], input: prompt });
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function waitFor(fn, ms = 15000, label = 'condição') {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`Tempo esgotado esperando ${label}`); await sleep(40); }
}
// Pastas temporárias dos testes: apagadas quando o processo de teste termina (antes, ficavam milhares de pastas no TEMP).
const made = new Set(); process.on('exit', () => { for (const d of made) { try { rmSync(d, { recursive: true, force: true, maxRetries: 2 }); } catch {} } });
export async function tempDir(name = 'cr') { const d = await realpath(await mkdtemp(join(tmpdir(), `code-room-${name}-`))); made.add(d); return d; }
export async function setup({ concurrency, runnerOpts = {}, file = ':memory:' } = {}) {
  const store = new Store(file);
  const orchestrator = new Orchestrator(store);
  const runner = new Runner(store, { buildCommand: fakeCommand, cancelDeadlineMs: 8000, hooks: orchestrator.hooks(), ...runnerOpts });
  orchestrator.attach(runner);
  if (concurrency) store.put('settings', { id: 'concurrency', ...concurrency });
  return { store, runner, orchestrator };
}
export async function addProject(store, name, area = 'Geral') {
  const path = await tempDir(name);
  return store.put('projects', { id: `p-${name}`, name, path, area, createdAt: new Date().toISOString() });
}
export function addAgent(store, id, o = {}) {
  return store.put('agents', { id, name: id, role: 'teste', room: 'Programação', provider: 'codex', model: '', instructions: '', mode: 'read', skillIds: [], capabilities: [], revision: 1, ...o });
}
let n = 0;
export const task = (store, project, agent, directive, extra = {}) => createTask(store, { projectId: project.id, agentId: agent.id, requestId: `r${++n}-${Math.random()}`, objective: `tarefa [[fake ${directive}]]`, ...extra }).task;
export const status = (store, id) => store.get('tasks', id).status;
