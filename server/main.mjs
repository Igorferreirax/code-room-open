import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { realpath, stat, readFile } from 'node:fs/promises';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { Runner } from './runner.mjs';
import { Batches, inspectEpisode, findMedia } from './batches.mjs';
import { Publisher } from './publish.mjs';
import { qaVideo } from './qa.mjs';
import { saveChannel, removeChannel, postadorAgent } from './channels.mjs';
import { preflight } from './preflight.mjs';
import { cleanLook } from './looks.mjs';
import { Orchestrator } from './orchestrator.mjs';
import { Routines } from './routines.mjs';
import { Recipes } from './recipes.mjs';
import { connectors, check, REMOTE_PROVIDERS, setHermesDir } from './connectors.mjs';
import { cleanBrowser } from './browseruse.mjs';
import { scanSkills, auditSummary, usable } from './skills.mjs';
import { createTask, retryTask } from './tasks.mjs';
import { safeFile, contentType, mintToken, checkToken } from './deliverables.mjs';
import { emptyContext, cleanContext } from './context.mjs';
import { KNOWN_CAPABILITIES } from './supervisor.mjs';
import { probeModules, capabilityVerified } from './modules.mjs';
import { removeWorktree } from './worktree.mjs';
import { retentionScan, retentionClean } from './retention.mjs';
import { mcpInfo, mcpActivate, mcpDeactivate } from './mcpsetup.mjs';
import { Power } from './power.mjs';
import { AutoClean } from './autoclean.mjs';
import { startupState, setStartup } from './startup.mjs';
import { saveHermesFile, clearHermesFile, loadHermesFile, testHermes, validateHermes, findSsh } from './hermes.mjs';
import { changeFirewall, phoneGuide, diagnoseNetwork, loadNetwork, saveNetwork, wantedAddresses, hostAllowed, originAllowed, tailscaleStatus, Throttle } from './network.mjs';
import { Devices } from './devices.mjs';
import { limitsView, claudeFromEvent } from './usage.mjs';
import { execFile } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { addEntry, balances, suggestCategory, CATEGORIES } from './finance.mjs';
import { Updates, readPackageVersion } from './updates.mjs';
import { Assistant, isInternal, ASSISTANT_PROJECT } from './assistant.mjs';
import { createSkillFile } from './myskills.mjs';
import { FolderJobs } from './folderjobs.mjs';
import { describeFolder, folderLine } from './folderinfo.mjs';
import { cleanModel, cleanEffort, effortsFor, EFFORT_LABEL } from './effort.mjs';
import { setCustom, customSpecs, validateSpec, testSpec, catalogView, getSpec, MAX_CUSTOM, findProgram, launcher } from './providers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = readPackageVersion(join(root, 'package.json'));   // uma só fonte da versão
const data = resolve(process.env.CODE_ROOM_DATA || join(root, '.data'));
setHermesDir(data);
mkdirSync(data, { recursive: true });
const keyFile = join(data, 'access.key');
if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 });
const key = readFileSync(keyFile, 'utf8').trim();
const store = new Store(join(data, 'code-room.sqlite'));
const port = Number(process.env.CODE_ROOM_PORT || 4780);
const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
let netCfg = loadNetwork(data), bound = []; // endereços extras em que o serviço escuta (Tailscale e/ou rede local)
const throttle = new Throttle(), devices = new Devices(store);
// O bloqueio por tentativas erradas vale só para quem vem de fora deste computador (o dono nunca se tranca para fora).
const isLocal = ip => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
const tBlocked = ip => !isLocal(ip) && throttle.blocked(ip), tFail = ip => { if (!isLocal(ip)) throttle.fail(ip); }, tOk = ip => { if (!isLocal(ip)) throttle.ok(ip); };

// Histórico da versão 0.1 guardava cada execução como "run" sem tarefa lógica. Vira tarefa legada, sem reexecução.
for (const r of store.list('runs')) {
  if (r.taskId || !r.project || !r.agent || store.get('tasks', r.id)) continue;
  const status = ['queued', 'running', 'cancelling'].includes(r.status) ? 'interrupted' : r.status;
  store.put('tasks', { id: r.id, requestId: r.requestId || `legacy-${r.id}`, kind: 'work', legacy: true, project: { id: r.project.id, name: r.project.name, path: r.project.path, area: 'Geral' }, agent: r.agent, environment: r.agent.room || 'Geral', objective: r.prompt || '', criteria: [], inputs: [], dependsOn: [], limits: { timeoutMs: 1200000, maxAttempts: 1, maxDelegations: 3 }, parentTaskId: null, depth: 0, flowId: null, step: null, handoffFrom: null, attempts: [], attemptCount: 1, result: { summary: (r.answer || '').slice(-2000), deliverables: { available: false, files: [] } }, usage: r.usage ?? null, modelReported: r.actualModel ?? null, reason: r.error ?? null, status, createdAt: r.createdAt, updatedAt: r.endedAt || r.createdAt });
}

let modules = [], modulesAt = 0;
async function moduleList() { if (Date.now() - modulesAt > 5 * 60000) { modules = await probeModules(); modulesAt = Date.now(); } return modules; }
const installed = agent => !!connectors().find(c => c.id === agent.provider)?.path;
const power = new Power({ store, countRunning: () => store.list('tasks').filter(t => ['running', 'starting'].includes(t.status)).length });
power.start();
const autoClean = new AutoClean({ store, dataDir: data, appDir: root });
autoClean.start();
const updates = new Updates({ store, version: VERSION, dataDir: data, appDir: root, port, releasesUrl: process.env.CODE_ROOM_RELEASES_URL || '' });
setCustom(store.get('settings', 'customProviders')?.list || []);   // IAs conectadas pela pessoa
const orchestrator = new Orchestrator(store, { moduleAvailable: name => capabilityVerified(modules, name), agentAvailable: installed });
const runner = new Runner(store, { hooks: orchestrator.hooks(), worktreeDir: join(data, 'worktrees') });
const assistantWorld = async () => {
  const skills = (await scanSkills(undefined, { extraRoots: store.get('settings', 'skillRoots')?.roots || [] })).map(k => ({ id: k.id, name: k.name, description: k.description, recognized: k.recognized, blocked: usable(k, 'claude').blocked || null }));
  const runs = store.list('tasks').filter(t => t.project?.id !== ASSISTANT_PROJECT).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 120).map(t => ({ id: t.id, status: t.status, agent: { id: t.agent.id, name: t.agent.name }, project: { id: t.project.id, name: t.project.name }, prompt: String(t.objective).slice(0, 120), reason: t.reason || '', updatedAt: t.updatedAt, createdAt: t.createdAt, files: (t.result?.deliverables?.files || []).filter(f => f.change !== 'deleted').length }));
  const focusInfo = id => { const pr = store.get('projects', id); return pr && !isInternal(pr) ? folderLine(describeFolder(pr.path)) : ''; };
  return { focusInfo, runs, flows: store.list('flows').slice(-30).map(f => ({ id: f.id, teamId: f.teamId, status: f.status, verdict: f.verdict || null, objective: f.objective })), folderJobs: store.list('folderjobs').map(j => folderJobs.view(j)), agents: store.list('agents').filter(a => !isInternal(a)), teams: store.list('teams'), links: store.list('links'), channels: store.list('channels').map(c => ({ id: c.id, name: c.name, niche: c.niche, networks: ['youtube', 'instagram', 'tiktok'].filter(k => c.networks?.[k]).map(k => `${k} @${c.networks[k]}`).join(' '), postador: !!c.postadorId })), routines: store.list('routines').map(r => ({ id: r.id, name: r.name, status: r.status, when: r.trigger?.type === 'time' ? (r.trigger.freq === 'daily' ? `todo dia às ${r.trigger.time}` : `semanal às ${r.trigger.time}`) : r.trigger?.type === 'file' ? 'quando chega arquivo' : 'manual' })), projects: store.list('projects').filter(p => !isInternal(p)), connected: new Set(connectors().filter(c => c.path && !REMOTE_PROVIDERS.includes(c.id)).map(c => c.id)), skills };
};
// Projetos criados pelo Assistente nascem como pasta nova aqui (nunca em uma pasta existente do computador).
const workspaceDir = () => process.env.CODE_ROOM_WORKSPACE || join(homedir(), 'Documents', 'CodeRoom', 'Projetos');
async function createProjectFolder({ name, area }) {
  const base = workspaceDir(); await mkdir(base, { recursive: true });
  const slug = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 50) || 'projeto';
  let dir = join(base, slug), n = 2; while (existsSync(dir)) dir = join(base, `${slug}-${n++}`);
  await mkdir(dir); const canonical = await realpath(dir);
  return store.put('projects', { id: randomUUID(), name: text(name, 60), path: canonical, area: optional(area, 60) || 'Geral', createdAt: new Date().toISOString() });
}
async function startAssistantTask({ projectId, teamId, agentId, objective }) {
  const requestId = randomUUID();
  if (teamId) { const r = orchestrator.startSequential({ projectId, teamId, requestId, objective, maxReviewRounds: 1 }); void runner.pump(); return r.flow; }
  const agent = store.get('agents', agentId); if (!agent || isInternal(agent)) throw new Error('Agente não encontrado.');
  if (!installed(agent)) throw new Error('A IA deste agente não está instalada.');
  const { task } = createTask(store, { projectId, agentId, requestId, objective }); void runner.pump(); return task;
}
const assistant = new Assistant({ store, root, dataDir: data, world: assistantWorld, pump: () => void runner.pump(), createTaskFn: createTask, saveAgent: b => saveAgent(b), saveTeam: b => orchestrator.saveTeam(b), saveProject: createProjectFolder, startTask: startAssistantTask, saveLink: async p => saveLink(p), saveSkill: spec => createSkillFile(store, data, spec), saveFolderJob: p => createFolderJob(p), importProject: p => registerProject(p), saveChannel: p => createChannel(p), saveRoutine: p => routines.save(p), phoneHelp: async () => phoneGuide(await networkView(), await diagnoseNetwork({ cfg: netCfg, port, bound, tailscale: await tailscaleStatus() })) });
orchestrator.attach(runner);
orchestrator.batches = new Batches(store, orchestrator);
const recipes = new Recipes(store, { pump: () => void runner.pump() });
const publisher = new Publisher(store, { dataDir: data });
// Pasta de entrada: uma tarefa (ou fluxo da equipe) por arquivo novo; {arquivo} na instrução vira o caminho do arquivo.
const folderJobs = new FolderJobs(store, (job, item, nonce) => {
  const objective = job.instruction.split('{arquivo}').join(item.rel) + (job.outputNote ? `

Onde salvar: ${job.outputNote}` : ''), requestId = `folder:${job.id}:${nonce}`;
  if (job.target.type === 'agent') { const { task } = createTask(store, { projectId: job.projectId, agentId: job.target.id, requestId, objective }); void runner.pump(); return { taskId: task.id }; }
  const r = orchestrator.startSequential({ projectId: job.projectId, teamId: job.target.id, requestId, objective, maxReviewRounds: 1 }); void runner.pump(); return { flowId: r.flow.id };
});
// Cadastrar uma pasta que já existe como projeto (tela Projetos e ação "importar_projeto" do Assistente).
async function registerProject(b) {
  const path = text(b.path, 2000); if (!isAbsolute(path)) throw new Error('Informe o caminho completo da pasta.');
  const canonical = await realpath(path); if (!(await stat(canonical)).isDirectory()) throw new Error('Selecione uma pasta.');
  if (store.list('projects').some(x => x.path === canonical)) throw new Error('Esta pasta já está cadastrada.');
  return store.put('projects', { id: randomUUID(), name: text(b.name), path: canonical, area: optional(b.area, 60) || 'Geral', createdAt: new Date().toISOString() });
}
async function createFolderJob(b) { const j = folderJobs.save(b), pr = store.get('projects', j.projectId); await mkdir(join(pr.path, j.dir), { recursive: true }); folderJobs.process(j.id); return j; }
const routines = new Routines(store, (r, slot) => {
  const requestId = `routine:${r.id}:${slot}`;
  if (r.target.type === 'recipe') return { runId: recipes.start(r.target.id, { objective: r.objective }).id };
  if (r.target.type === 'agent') { const { task } = createTask(store, { projectId: r.projectId, agentId: r.target.id, requestId, objective: r.objective, criteria: r.criteria, limits: { maxAttempts: r.attempts } }); void runner.pump(); return { taskId: task.id }; }
  return { flowId: orchestrator.startSequential({ projectId: r.projectId, teamId: r.target.id, requestId, objective: r.objective, criteria: r.criteria }).flow.id };
});

function okKey(value) { const a = Buffer.from(value || ''), b = Buffer.from(key); return a.length === b.length && timingSafeEqual(a, b); }
// 'master' = chave do PC; 'device' = token de um celular pareado (revogável, sem acesso a rede, aparelhos e registro de projetos).
function authLevel(req) { const v = req.headers['x-code-room-key']; if (okKey(v)) return 'master'; return devices.verify(v, req.socket.remoteAddress) ? 'device' : null; }
const hermesView = () => {
  const saved = loadHermesFile(data), cur = saved || connectors().find(c => c.id === 'hermes')?.remote || null;
  return { configured: !!cur, source: saved ? 'app' : cur ? 'hermes.bat' : null, host: cur?.host || '', port: Number(cur?.port) || 22, key: cur?.key || '', bin: cur?.bin || 'hermes', trustNew: !!saved?.trustNew, sshInstalled: !!findSsh() };
};
const mcpCtx = () => ({ dataDir: data, devices, node: process.execPath, script: join(root, 'server', 'mcp.mjs') });
const masterOnly = auth => { if (auth !== 'master') throw Object.assign(new Error('Esta ação só pode ser feita no computador (chave principal).'), { status: 403 }); };
function text(value, max = 200) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Texto obrigatório (até ${max} caracteres).`); return value.trim(); }
function optional(value, max = 10000) { if (value == null) return ''; if (typeof value !== 'string' || value.length > max) throw new Error('Texto inválido ou muito longo.'); return value.trim(); }
function saveAgent(b) {
          if (!connectors().some(c => c.id === b.provider)) throw new Error('Provedor inválido');
          if (REMOTE_PROVIDERS.includes(b.provider) && b.mode !== 'read') throw new Error('Agentes remotos (Hermes) são somente leitura: eles não enxergam os arquivos deste computador.');
          if (!['read', 'write'].includes(b.mode)) throw new Error('Permissão inválida');
          if (!Array.isArray(b.skillIds) || b.skillIds.length > 8 || b.skillIds.some(s => typeof s !== 'string')) throw new Error('Escolha até 8 skills.');
          const prev = b.id ? store.get('agents', b.id) : null;
          const commands = [...new Set((b.commands ?? prev?.commands ?? []).map(c => String(c).trim()).filter(Boolean))]; if (commands.length > 10 || commands.some(c => !/^[\w.-]{1,40}$/.test(c))) throw new Error('Programas liberados: até 10 nomes simples (ex.: yt-dlp, ffmpeg), sem caminhos nem espaços.');
          const caps = b.capabilities ?? prev?.capabilities ?? []; if (!Array.isArray(caps) || caps.some(c => !KNOWN_CAPABILITIES.includes(c))) throw new Error(`Capacidades válidas: ${KNOWN_CAPABILITIES.join(', ')}.`);
          const old = b.id ? store.get('agents', b.id) : null; if (b.id && !old) throw new Error('Agente inexistente');
          return store.put('agents', { id: old?.id || randomUUID(), name: text(b.name), role: text(b.role), room: optional(b.room, 100) || 'Geral', provider: b.provider, model: cleanModel(b.model), effort: b.effort === undefined ? (effortsFor(b.provider).includes(old?.effort) ? old.effort : '') : cleanEffort(b.provider, b.effort), instructions: optional(b.instructions), mode: b.mode, skillIds: [...new Set(b.skillIds)], commands, browser: b.browser !== undefined ? cleanBrowser(b.browser, b.provider) : (() => { try { return cleanBrowser(old?.browser, b.provider); } catch { return 'off'; } })(), capabilities: [...new Set(caps)], look: b.look !== undefined ? cleanLook(b.look) : old?.look ?? null, revision: (old?.revision || 0) + 1 });
}
// Sugestões de modelo para o formulário (a pessoa pode digitar qualquer outro): aliases do Claude, lista real do Antigravity e o padrão do Codex.
const modelCache = new Map();
async function modelSuggestions(provider) {
  const efforts = effortsFor(provider).map(id => ({ id, label: EFFORT_LABEL[id] || id })), used = [...new Set(store.list('agents').filter(a => a.provider === provider && a.model).map(a => a.model))];
  const hit = modelCache.get(provider); if (hit && Date.now() - hit.at < 10 * 60000) return { models: hit.models, efforts };
  let models = [];
  if (provider === 'claude') models = [{ id: 'sonnet', label: 'Sonnet (equilibrado)' }, { id: 'opus', label: 'Opus (o mais capaz)' }, { id: 'haiku', label: 'Haiku (rápido e barato)' }];
  else if (provider === 'agy') { const c = connectors().find(x => x.id === 'agy'); if (c?.path) models = await new Promise(r => execFile(c.path, ['models'], { windowsHide: true, timeout: 20000 }, (err, out) => r(err ? [] : String(out).split(String.fromCharCode(10)).map(l => l.split(String.fromCharCode(9))).filter(p => p[0] && /^[A-Za-z0-9][\w.:/-]*$/.test(p[0].trim()) && p[1]).map(p => ({ id: p[0].trim(), label: p[1].trim() })).slice(0, 40)))); }
  else if (provider === 'codex') { try { const m = readFileSync(join(homedir(), '.codex', 'config.toml'), 'utf8').match(/^model\s*=\s*"([^"]+)"/m); if (m) models = [{ id: m[1], label: `${m[1]} (o seu padrão no Codex)` }]; } catch {} }
  for (const id of used) if (!models.some(m => m.id === id)) models.push({ id, label: `${id} (já usado)` });
  if (models.length) modelCache.set(provider, { at: Date.now(), models }); return { models, efforts };
}
function providersView() {
  return { max: MAX_CUSTOM, catalog: catalogView(), custom: customSpecs().map(s => { const f = findProgram(s.exe), l = f ? launcher(f) : null; return { ...s, installed: !!l, unsupported: f && !l ? 'atalho .cmd não suportado' : null, usedBy: store.list('agents').filter(a => a.provider === s.id).length }; }) };
}
function createChannel(b) {
  const ch = saveChannel(store, b); let agent = null;
  if (b.createPostador && !ch.postadorId) { agent = store.put('agents', { id: randomUUID(), ...postadorAgent(ch), revision: 1 }); ch.postadorId = agent.id; store.put('channels', ch); }
  return { channel: ch, agent };
}
function saveLink(b) {
  const project = store.get('projects', b.projectId), from = store.get('agents', b.from), to = store.get('agents', b.to);
  if (!project || !from || !to) throw new Error('Escolha o projeto e os dois agentes.');
  if (b.from === b.to) throw new Error('Um agente não pode se ligar a ele mesmo.');
  if (store.list('links').some(l => l.projectId === project.id && l.from === from.id && l.to === to.id)) throw new Error('Essa ligação já existe.');
  const maxHops = Math.min(6, Math.max(1, Math.trunc(Number(b.maxHops)) || 3));
  return store.put('links', { id: randomUUID(), projectId: project.id, from: from.id, to: to.id, maxHops, enabled: true, createdAt: new Date().toISOString() });
}
async function body(req) { let size = 0, chunks = []; for await (const chunk of req) { size += chunk.length; if (size > 100000) throw new Error('Requisição muito grande'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }

const brief = t => ({ hops: t.hops || 0, linkFrom: t.linkFrom || null, id: t.id, kind: t.kind, status: t.status, project: { id: t.project.id, name: t.project.name, area: t.project.area }, agent: { id: t.agent.id, name: t.agent.name, room: t.agent.room, role: t.agent.role, provider: t.agent.provider, model: t.agent.model, mode: t.agent.mode },
  environment: t.environment, prompt: t.objective.slice(0, 200), usage: t.usage ?? null, actualModel: t.modelReported ?? null, reason: t.reason ?? null, failureKind: t.failureKind ?? null, attemptCount: t.attemptCount, review: t.review ?? null, deliverables: (t.result?.deliverables?.files || []).filter(f => f.change !== 'deleted').slice(0, 20).map(f => ({ path: f.path, change: f.change, bytes: f.bytes })), flowId: t.flowId, step: t.step, dependsOn: t.dependsOn, parentTaskId: t.parentTaskId, createdAt: t.createdAt, updatedAt: t.updatedAt });
function detail(t) {
  const attempts = t.attempts.map(id => store.get('runs', id)).filter(Boolean);
  const last = attempts.at(-1);
  const events = [...store.events(t.id), ...attempts.flatMap(a => store.events(a.id))].sort((a, b) => a.seq - b.seq).slice(-300);
  const token = mintToken(key, t.id);
  const files = (t.result?.deliverables?.files || []).map(f => ({ ...f, url: f.change === 'deleted' ? null : `/d/${t.id}/${token}/${f.path.split('/').map(encodeURIComponent).join('/')}` }));
  return { ...t, prompt: t.objective, answer: last?.answer || '', actualModel: t.modelReported ?? null, attempts, events, deliverables: { ...(t.result?.deliverables || { available: false, files: [] }), files }, events_note: 'Eventos ordenados por seq; eventId deduplica repetições.' };
}
const taskOfRun = run => store.get('tasks', run) ? run : store.get('runs', run)?.taskId ?? null;

// Entrega um arquivo com suporte a Range (avançar/voltar no player). Só é chamado depois de validar token e caminho.
const doneHtml = (ok, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code Room</title><body style="font-family:system-ui;background:#0b1426;color:#e6edf7;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:28px;text-align:center"><h1 style="font-size:1.4rem">${ok ? 'YouTube conectado' : 'Não foi possível conectar'}</h1><p>${msg.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p><p style="opacity:.7">Pode fechar esta aba e voltar ao Code Room.</p></div></body>`;
async function serveRange(req, res, file, type) {
  const size = (await stat(file)).size, range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'; media-src 'self'; img-src 'self'" };
  if (!range) { res.writeHead(200, { ...head, 'Content-Length': size }); return createReadStream(file).pipe(res); }
  let start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]), end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (!(start <= end) || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  createReadStream(file, { start, end }).pipe(res);
}
const handle = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (!hostAllowed(req.headers.host, port, bound)) return send(res, 403, { error: 'Host não permitido' });
  if (req.headers.origin && !originAllowed(req.headers.origin, port, bound)) return send(res, 403, { error: 'Origem não permitida' });
  const ip = req.socket.remoteAddress;
  const url = new URL(req.url, origins[0]);
  try {
    // Pré-visualização de entregas: token curto por tarefa, só arquivos registrados, sem scripts (sandbox).
    const d = url.pathname.match(/^\/d\/([a-zA-Z0-9-]+)\/([a-z0-9.]+)\/(.+)$/);
    if (d && req.method === 'GET') {
      const task = store.get('tasks', d[1]);
      if (!task || !checkToken(key, d[1], d[2])) return send(res, 403, { error: 'Link de entrega inválido ou expirado.' });
      const rel = d[3].split('/').map(decodeURIComponent).join('/');
      if (!task.result?.deliverables?.files?.some(f => f.path === rel && f.change !== 'deleted')) return send(res, 404, { error: 'Arquivo não é uma entrega desta tarefa.' });
      const file = await safeFile(task.project.path, rel);
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:");
      res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
      return res.end(await readFile(file));
    }
    // Vídeo/capa de um episódio de lote: token curto (1 h) por episódio, só dentro de videos/*/saida/ do projeto.
    const mm = url.pathname.match(/^\/m\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)\/([a-z0-9.]+)\/(previa|final|capa|post)$/);
    if (mm && req.method === 'GET') {
      const batch = store.get('batches', mm[1]);
      if (!batch || !checkToken(key, `m:${mm[1]}:${mm[2]}`, mm[3])) return send(res, 403, { error: 'Link inválido ou expirado.' });
      const ep = batch.episodes.find(e => e.id === mm[2]), project = store.get('projects', batch.projectId);
      const rel = ep && project ? (await findMedia(project.path, ep.folder))[mm[4]] : null;
      if (!rel) return send(res, 404, { error: 'Arquivo ainda não existe.' });
      const file = await safeFile(project.path, rel);
      return serveRange(req, res, file, contentType(file));
    }
    if (url.pathname.startsWith('/api/')) {
      const get = req.method === 'GET', p = url.pathname;
      // Pareamento de celular: único endpoint sem chave. Código de uso único + limite de tentativas por endereço.
      if (p === '/api/pair' && req.method === 'POST') {
        if (tBlocked(ip)) return send(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'Envie JSON' });
        const b = await body(req);
        try { const r = devices.redeem(b.code, b.name, ip); tOk(ip); return send(res, 200, r); } catch (e) { tFail(ip); throw e; }
      }
      if (get && p === '/api/publish/google/callback') {
        const html = (code, ok, msg) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }); res.end(doneHtml(ok, msg)); };
        if (!isLocal(ip)) return html(403, false, 'A conexão só pode ser concluída no próprio computador.');
        if (url.searchParams.get('error')) return html(400, false, 'Você não autorizou o acesso. Nada foi conectado.');
        try { await publisher.callback(url.searchParams.get('code'), url.searchParams.get('state')); return html(200, true, 'A conta foi autorizada para enviar vídeos.'); } catch (e) { return html(400, false, e.message); }
      }
      if (tBlocked(ip)) return send(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      const auth = authLevel(req);
      if (!auth) { tFail(ip); return send(res, 401, { error: 'Abra o Code Room pelo iniciador ou informe a chave local.' }); }
      tOk(ip);
      if (get && p === '/api/updates') return send(res, 200, updates.status());
      if (get && p === '/api/retention') { masterOnly(auth); return send(res, 200, await retentionScan({ store, dataDir: data, appDir: root, days: Number(new URL(req.url, 'http://x').searchParams.get('days')) || 7 })); }
      if (get && p === '/api/startup') { masterOnly(auth); return send(res, 200, startupState()); }
      if (get && p === '/api/cleanup') { masterOnly(auth); return send(res, 200, autoClean.status()); }
      if (get && p === '/api/power') { masterOnly(auth); return send(res, 200, power.status()); }
      if (get && p === '/api/hermes') { masterOnly(auth); return send(res, 200, hermesView()); }
      if (get && p === '/api/mcp') { masterOnly(auth); return send(res, 200, mcpInfo(mcpCtx())); }
      if (get && p === '/api/network/diagnose') { masterOnly(auth); return send(res, 200, { checks: await diagnoseNetwork({ cfg: netCfg, port, bound, tailscale: await tailscaleStatus() }) }); }
      if (get && p === '/api/network') { masterOnly(auth); return send(res, 200, await networkView()); }
      if (get && p === '/api/devices') { masterOnly(auth); return send(res, 200, devices.list().map(d => devices.view(d))); }
      if (get && p === '/api/usage/limits') return send(res, 200, { providers: limitsView(store), now: new Date().toISOString() });
      if (get && p === '/api/whoami') return send(res, 200, { level: auth });
      if (get && p === '/api/preflight') { masterOnly(auth); const pr = store.get('projects', url.searchParams.get('projectId')); return send(res, 200, await preflight({ workDir: pr?.path || '' })); }
      if (get && p === '/api/publish/status') return send(res, 200, await publisher.status());
      const qm = get ? p.match(/^\/api\/batches\/([a-zA-Z0-9-]+)\/episodes\/([a-zA-Z0-9-]+)\/qa$/) : null;
      if (qm) {
        const batch = store.get('batches', qm[1]), ep = batch?.episodes.find(e => e.id === qm[2]), project = batch && store.get('projects', batch.projectId);
        if (!ep || !project) return send(res, 404, { error: 'Episódio inexistente.' });
        const media = await findMedia(project.path, ep.folder), kind = url.searchParams.get('kind') === 'final' && media.final ? 'final' : 'previa', rel = media[kind];
        if (!rel) return send(res, 404, { error: 'Ainda não há vídeo deste episódio para checar.' });
        return send(res, 200, { kind, file: rel.split('/').pop(), ...(await qaVideo(await safeFile(project.path, rel), { kind })) });
      }
      const bm = get ? p.match(/^\/api\/batches\/([a-zA-Z0-9-]+)\/episodes\/([a-zA-Z0-9-]+)\/media$/) : null;
      if (bm) {
        const batch = store.get('batches', bm[1]), ep = batch?.episodes.find(e => e.id === bm[2]), project = batch && store.get('projects', batch.projectId);
        if (!ep || !project) return send(res, 404, { error: 'Episódio inexistente.' });
        const token = mintToken(key, `m:${bm[1]}:${bm[2]}`), out = [];
        for (const [kind, rel] of Object.entries(await findMedia(project.path, ep.folder))) { try { const f = await safeFile(project.path, rel); out.push({ kind, name: rel.split('/').pop(), bytes: (await stat(f)).size, url: `/m/${bm[1]}/${bm[2]}/${token}/${kind}` }); } catch {} }
        return send(res, 200, { files: out });
      }
      if (get && p === '/api/state') {
        const tasks = store.list('tasks').filter(t => t.project?.id !== ASSISTANT_PROJECT).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200).map(brief);
        return send(res, 200, { folderJobs: store.list('folderjobs').map(j => folderJobs.view(j)), notices: store.list('notices').filter(n => !n.seen).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5), projects: store.list('projects').filter(x => !isInternal(x)), agents: store.list('agents').filter(x => !isInternal(x)), teams: store.list('teams'), links: store.list('links'), channels: store.list('channels'), recipes: store.list('recipes').sort((x, y) => x.name.localeCompare(y.name)), recipeRuns: store.list('recipeRuns').sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 30), batches: store.list('batches').sort((x, y) => y.createdAt.localeCompare(x.createdAt)), posts: store.list('posts').sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 100), batchCosts: orchestrator.batches.costs(), runs: tasks, plans: store.list('plans').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map(p => ({ id: p.id, status: p.status, errors: p.errors, request: p.request.slice(0, 200), projectId: p.projectId, flowId: p.flowId, plan: p.plan, createdAt: p.createdAt })), flows: store.list('flows').map(f => ({ id: f.id, kind: f.kind, status: f.status, verdict: f.verdict, objective: f.objective.slice(0, 200), projectId: f.projectId })), routines: store.list('routines').map(r => ({ ...r, running: routines.isRunning(r) })), limits: store.get('settings', 'limits') || {}, prices: store.get('settings', 'prices') || {}, connectors: connectors().map(({ path, ...c }) => ({ ...c, available: !!path })), runtime: { memoryMB: Math.round(process.memoryUsage().rss / 1048576), version: VERSION, ...runner.status(), lastSeq: store.lastSeq() } });
      }
      if (get && p === '/api/models') { masterOnly(auth); return send(res, 200, await modelSuggestions(url.searchParams.get('provider') || '')); }
      if (get && p === '/api/providers') { masterOnly(auth); return send(res, 200, providersView()); }
      if (get && p === '/api/assistant') { masterOnly(auth); return send(res, 200, await assistant.status()); }
      if (get && p === '/api/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        let last = Number(req.headers['last-event-id'] || url.searchParams.get('since') || store.lastSeq());
        const flush = () => { for (const e of store.eventsSince(last)) { last = e.seq; res.write(`id: ${e.seq}\nevent: change\ndata: ${JSON.stringify({ ...e, taskId: taskOfRun(e.run) })}\n\n`); } };
        res.write(`event: hello\ndata: ${JSON.stringify({ lastSeq: store.lastSeq(), version: VERSION })}\n\n`);
        flush(); store.bus.on('event', flush);
        const beat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
        req.on('close', () => { clearInterval(beat); store.bus.off('event', flush); });
        return;
      }
      if (get && p === '/api/skills') {
        const project = store.get('projects', url.searchParams.get('project') || '');
        const skills = await scanSkills(project?.path, { extraRoots: store.get('settings', 'skillRoots')?.roots || [] });
        const enabled = new Set(store.list('agents').flatMap(a => a.skillIds));
        return send(res, 200, skills.map(s => ({ ...s, enabled: enabled.has(s.id) })));
      }
      if (get && p === '/api/skills/audit') {
        const project = store.get('projects', url.searchParams.get('project') || '');
        return send(res, 200, auditSummary(await scanSkills(project?.path, { extraRoots: store.get('settings', 'skillRoots')?.roots || [] }), new Set(store.list('agents').flatMap(a => a.skillIds))));
      }
      if (get && p === '/api/storage') {
        const file = join(data, 'code-room.sqlite'), size = f => { try { return statSync(f).size; } catch { return 0; } };
        return send(res, 200, { dataDir: data, dbBytes: size(file) + size(file + '-wal'), counts: { projetos: store.list('projects').length, agentes: store.list('agents').length, tarefas: store.list('tasks').length, tentativas: store.list('runs').length, rotinas: store.list('routines').length }, note: 'O banco guarda histórico, eventos e entregas registradas. Os arquivos dos projetos ficam nas pastas originais.' });
      }
      if (get && p === '/api/connectors/check') return send(res, 200, await check());
      if (get && p === '/api/modules') return send(res, 200, await moduleList());
      if (get && p === '/api/messages') return send(res, 200, store.list('messages').filter(m => !url.searchParams.get('flow') || m.flowId === url.searchParams.get('flow')));
      let m;
      if (get && (m = p.match(/^\/api\/(?:runs|tasks)\/([a-zA-Z0-9-]+)$/))) { const t = store.get('tasks', m[1]); return t ? send(res, 200, detail(t)) : send(res, 404, { error: 'Tarefa não encontrada' }); }
      if (get && (m = p.match(/^\/api\/flows\/([a-zA-Z0-9-]+)$/))) { const v = orchestrator.flowView(m[1]); return v ? send(res, 200, v) : send(res, 404, { error: 'Fluxo não encontrado' }); }
      if (get && (m = p.match(/^\/api\/plans\/([a-zA-Z0-9-]+)$/))) { const v = store.get('plans', m[1]); return v ? send(res, 200, v) : send(res, 404, { error: 'Plano não encontrado' }); }
      if (get && (m = p.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/context$/))) return send(res, 200, store.get('contexts', m[1]) || emptyContext(m[1]));
      if (get && p === '/api/finance/balance') { const project = store.get('projects', url.searchParams.get('project') || ''); if (!project || project.area !== 'Financeiro') throw new Error('Projeto financeiro não encontrado.'); return send(res, 200, balances(store, project.id)); }
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'Envie JSON' });
        const b = await body(req);
        // Atualização (só o computador, com a chave principal): consultar, ligar/desligar, adiar, baixar com conferência de SHA-256 e instalar.
        if (p === '/api/updates/check') { masterOnly(auth); return send(res, 200, await updates.check({ force: true })); }
        if (p === '/api/updates/settings') { masterOnly(auth); return send(res, 200, updates.setEnabled(b.enabled === true)); }
        if (p === '/api/updates/dismiss') { masterOnly(auth); return send(res, 200, updates.dismiss(b.version)); }
        if (p === '/api/updates/download') { masterOnly(auth); return send(res, 200, await updates.download()); }
        if (p === '/api/updates/install') { masterOnly(auth); return send(res, 202, updates.install()); }
        if (p === '/api/startup') { masterOnly(auth); return send(res, 200, await setStartup(b.on === true, { root })); }
        if (p === '/api/cleanup') { masterOnly(auth); return send(res, 200, autoClean.setEnabled(b.auto === true)); }
        if (p === '/api/power') { masterOnly(auth); return send(res, 200, power.setKeepAwake(b.keepAwake === true)); }
        if (p === '/api/hermes') { masterOnly(auth); saveHermesFile(data, b); return send(res, 200, hermesView()); }
        if (p === '/api/hermes/test') { masterOnly(auth); const cfg = Object.keys(b).length ? validateHermes(b) : loadHermesFile(data); if (!cfg) throw new Error('Preencha e salve a configuração do servidor antes de testar.'); return send(res, 200, await testHermes(cfg)); }
        if (p === '/api/hermes/delete') { masterOnly(auth); clearHermesFile(data); return send(res, 200, hermesView()); }
        if (p === '/api/mcp/activate') { masterOnly(auth); return send(res, 200, mcpActivate(mcpCtx())); }
        if (p === '/api/mcp/deactivate') { masterOnly(auth); return send(res, 200, mcpDeactivate(mcpCtx())); }
        if (p === '/api/retention/purge') { masterOnly(auth); return send(res, 200, await retentionClean({ store, dataDir: data, appDir: root, days: Number(b.days) || 7 })); }
        if (p === '/api/network/firewall') { masterOnly(auth); const r = await changeFirewall(b.remove === true ? 'remove' : 'add', process.execPath, port); return send(res, r.ok ? 200 : 502, r.ok ? { ok: true } : { error: r.error }); }
        if (p === '/api/network') { masterOnly(auth); netCfg = saveNetwork(data, { lan: b.lan === true, tailscale: b.tailscale === true }); await syncListeners(); return send(res, 200, await networkView()); }
        if (p === '/api/usage/refresh') {
          // Leitura sob demanda dos limites do Claude: uma chamada mínima (usa um pouco da sua cota). Só quando você pede.
          const c = connectors().find(x => x.id === 'claude'); if (!c?.path) throw new Error('Claude Code não encontrado.');
          const out = await new Promise(r => execFile(c.path, ['--print', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'plan', '--model', 'sonnet', 'Responda apenas: ok'], { cwd: tmpdir(), timeout: 90000, windowsHide: true, maxBuffer: 8e6 }, (e, so) => r(String(so || ''))));
          let v = null; for (const line of out.split(String.fromCharCode(10))) { if (!line.includes('rate_limit_event')) continue; try { v = claudeFromEvent(JSON.parse(line).rate_limit_info) || v; } catch {} }
          if (!v) throw new Error('O Claude não devolveu a leitura de limites agora. Tente de novo em instantes.');
          store.put('settings', { id: 'limits:claude', windows: v.windows, observedAt: v.observedAt, source: 'leitura sob demanda' });
          return send(res, 200, { providers: limitsView(store), now: new Date().toISOString() });
        }
        if (p === '/api/publish/google/config') { masterOnly(auth); return send(res, 200, await publisher.saveGoogle(b)); }
        if (p === '/api/publish/google/connect') { masterOnly(auth); return send(res, 200, { url: await publisher.connectUrl(`${origins[0]}/api/publish/google/callback`) }); }
        if (p === '/api/publish/google/disconnect') { masterOnly(auth); return send(res, 200, await publisher.disconnect()); }
        if (p === '/api/posts') { const bt = store.get('batches', b.batchId), pr = bt && store.get('projects', bt.projectId); if (!pr) throw new Error('Lote inexistente.'); return send(res, 201, await publisher.draft(b, { project: pr })); }
        if (p === '/api/channels') {
          masterOnly(auth); return send(res, 200, createChannel(b));
        }
        if ((m = p.match(/^\/api\/channels\/([a-zA-Z0-9-]+)\/delete$/))) { masterOnly(auth); return send(res, 200, removeChannel(store, m[1])); }
        if ((m = p.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/mark$/))) return send(res, 200, await publisher.markPosted(m[1], b, { by: auth }));
        if ((m = p.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/metrics$/))) { const po = store.get('posts', m[1]), bt = po && store.get('batches', po.batchId), pr = bt && store.get('projects', bt.projectId); if (!pr) throw new Error('Post inexistente.'); return send(res, 200, await publisher.metrics(m[1], { project: pr })); }
        if ((m = p.match(/^\/api\/posts\/([a-zA-Z0-9-]+)\/(confirm|cancel)$/))) {
          if (m[2] === 'cancel') return send(res, 200, publisher.cancel(m[1]));
          const po = store.get('posts', m[1]), bt = po && store.get('batches', po.batchId), pr = bt && store.get('projects', bt.projectId); if (!pr) throw new Error('Post inexistente.');
          return send(res, 200, await publisher.confirm(m[1], b, { project: pr, by: auth }));
        }
        if (p === '/api/batches') return send(res, 201, await orchestrator.batches.create(b));
        if (p === '/api/batches/costs') { masterOnly(auth); return send(res, 200, orchestrator.batches.saveCosts(b)); }
        if ((m = p.match(/^\/api\/batches\/([a-zA-Z0-9-]+)\/(approve|cancel)$/))) return send(res, 200, m[2] === 'approve' ? orchestrator.batches.approve(m[1], b) : orchestrator.batches.cancel(m[1]));
        if ((m = p.match(/^\/api\/batches\/([a-zA-Z0-9-]+)\/episodes\/([a-zA-Z0-9-]+)\/(approve-preview|request-changes|retry|reject)$/))) { const B = orchestrator.batches; return send(res, 200, m[3] === 'reject' ? await B.reject(m[1], m[2]) : m[3] === 'approve-preview' ? B.approvePreview(m[1], m[2]) : m[3] === 'retry' ? B.retry(m[1], m[2]) : B.requestChanges(m[1], m[2], b.note)); }
        if (p === '/api/batches/inspect') { const pr = store.get('projects', b.projectId); if (!pr) throw new Error('Projeto inexistente.'); return send(res, 200, await Promise.all((b.folders || []).slice(0, 20).map(f => inspectEpisode(pr.path, String(f))))); }
        if (p === '/api/links') return send(res, 201, saveLink(b));
        if ((m = p.match(/^\/api\/links\/([a-f0-9-]+)\/(delete|toggle)$/))) {
          const l = store.get('links', m[1]); if (!l) throw new Error('Ligação não encontrada.');
          if (m[2] === 'delete') { store.remove('links', l.id); store.event('_records', { type: 'record', kind: 'links', id: l.id, at: new Date().toISOString() }); return send(res, 200, { ok: true }); }
          return send(res, 200, store.put('links', { ...l, enabled: b.enabled !== false }));
        }
        if (p === '/api/devices/pair-code') { masterOnly(auth); return send(res, 200, devices.createCode()); }
        if ((m = p.match(/^\/api\/devices\/([a-f0-9]+)\/revoke$/))) { masterOnly(auth); devices.revoke(m[1]); return send(res, 200, { ok: true }); }
        if (p === '/api/projects') { masterOnly(auth); return send(res, 201, await registerProject(b)); }
        if (p === '/api/providers') { masterOnly(auth); const list = customSpecs(), spec = validateSpec(b, list), next = [...list.filter(x => x.id !== spec.id), spec]; store.put('settings', { id: 'customProviders', list: next }); setCustom(next); return send(res, 201, providersView()); }
        if (p === '/api/providers/delete') {
          masterOnly(auth); const id = text(b.id, 80); if (!getSpec(id)) throw new Error('IA não encontrada.');
          const used = store.list('agents').filter(a => a.provider === id); if (used.length) throw new Error(`Há agentes usando esta IA: ${used.slice(0, 3).map(a => a.name).join(', ')}. Troque a IA deles antes de remover.`);
          const next = customSpecs().filter(x => x.id !== id); store.put('settings', { id: 'customProviders', list: next }); setCustom(next); return send(res, 200, providersView());
        }
        if (p === '/api/providers/test') {
          masterOnly(auth); const spec = b.id ? getSpec(text(b.id, 80)) : validateSpec(b, customSpecs().filter(x => x.id !== b.id)); if (!spec) throw new Error('IA não encontrada.');
          const dir = await mkdtemp(join(tmpdir(), 'code-room-test-')); try { return send(res, 200, await testSpec(spec, dir)); } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
        }
        if (p.startsWith('/api/assistant/')) {
          masterOnly(auth); const a = p.slice('/api/assistant/'.length);
          if (a === 'brief') return send(res, 202, await assistant.brief({ provider: b.provider }));
          if (a === 'ask') return send(res, 202, await assistant.ask(text(b.text, 4000), { projectId: typeof b.projectId === 'string' ? b.projectId : null }));
          if (a === 'reset') return send(res, 200, await assistant.reset());
          if (a === 'thread/new') return send(res, 200, await assistant.newThread());
          if (a === 'thread/select') return send(res, 200, await assistant.selectThread(text(b.id, 40)));
          if (a === 'errors/clear') return send(res, 200, await assistant.clearErrors());
          if (a === 'alerts/dismiss') return send(res, 200, await assistant.dismissAlert(text(b.id, 100)));
          if (a === 'thread/rename') return send(res, 200, await assistant.renameThread(text(b.id, 40), text(b.title, 60)));
          if (a === 'thread/delete') return send(res, 200, await assistant.deleteThread(text(b.id, 40)));
          if (a === 'provider') return send(res, 200, await assistant.setProvider(b.provider));
          if (a === 'apply') return send(res, 200, await assistant.apply(text(b.messageId, 80), Number(b.index)));
          if (a === 'dismiss') return send(res, 200, await assistant.dismiss(text(b.messageId, 80), Number(b.index)));
        }
        if (p === '/api/agents') return send(res, 200, saveAgent(b));
        if (p === '/api/runs' || p === '/api/tasks') {
          const agent = store.get('agents', b.agentId);
          if (agent && !installed(agent)) throw Object.assign(new Error('Provedor não instalado.'), { failureKind: 'executable_missing' });
          const { task, duplicate } = createTask(store, { ...b, objective: b.objective ?? b.prompt });
          send(res, duplicate ? 200 : 201, brief(task)); void runner.pump(); return;
        }
        if ((m = p.match(/^\/api\/(?:runs|tasks)\/([a-zA-Z0-9-]+)\/cancel$/))) { const t = await runner.cancel(m[1]); return send(res, 200, brief(t)); }
        if ((m = p.match(/^\/api\/tasks\/([a-zA-Z0-9-]+)\/retry$/))) {
          if (b.confirm !== true) throw new Error('Repetir pode duplicar efeitos já produzidos. Confirme com { "confirm": true } depois de conferir os arquivos.');
          const t = store.get('tasks', m[1]); if (!t) throw new Error('Tarefa não encontrada.');
          t.limits.maxAttempts = Math.min(5, Math.max(t.limits.maxAttempts, t.attemptCount + 1));
          const r = retryTask(store, m[1]); void runner.pump(); return send(res, 200, brief(r));
        }
        if (p === '/api/settings/limits') {
          const timeoutMin = Number(b.timeoutMin), budgetUsd = b.budgetUsd === '' || b.budgetUsd == null ? null : Number(b.budgetUsd);
          if (!(timeoutMin >= 1 && timeoutMin <= 60)) throw new Error('Duração máxima: de 1 a 60 minutos.');
          if (budgetUsd != null && !(budgetUsd >= 0)) throw new Error('Orçamento inválido.');
          store.put('settings', { id: 'limits', timeoutMs: Math.round(timeoutMin * 60000), budgetUsd, budgetEnabled: b.budgetEnabled === true && budgetUsd != null, budgetDays: 30 });
          void runner.pump(); return send(res, 200, { limits: store.get('settings', 'limits'), budget: runner.budget() });
        }
        if (p === '/api/settings/skill-roots') {
          masterOnly(auth);
          const path = text(b.path, 2000); if (!isAbsolute(path)) throw new Error('Informe o caminho completo da pasta.');
          const canonical = await realpath(path); if (!(await stat(canonical)).isDirectory()) throw new Error('Selecione uma pasta.');
          const cur = store.get('settings', 'skillRoots')?.roots || [];
          return send(res, 200, store.put('settings', { id: 'skillRoots', roots: [...new Set([...cur, canonical])].slice(0, 10) }));
        }
        if (p === '/api/settings/prices') {
          const num = v => { if (v === '' || v == null) return null; const n = Number(v); if (!(n >= 0 && n <= 1000)) throw new Error('Preço inválido (US$ por 1 milhão de tokens, de 0 a 1000).'); return n; };
          const row = o => ({ in: num(o?.in), out: num(o?.out) });
          return send(res, 200, store.put('settings', { id: 'prices', codex: row(b.codex), claude: row(b.claude), note: 'Informado pelo usuário; usado só para ESTIMATIVA quando o provedor não informa custo.' }));
        }
        if (p === '/api/recipes') return send(res, 200, recipes.save(b));
        if ((m = p.match(/^\/api\/recipes\/([a-zA-Z0-9-]+)\/(run|delete)$/))) {
          if (m[2] === 'delete') { recipes.remove(m[1]); return send(res, 200, { ok: true }); }
          return send(res, 201, recipes.start(m[1], b));
        }
        if ((m = p.match(/^\/api\/recipe-runs\/([a-zA-Z0-9-]+)\/(approve|cancel)$/))) return send(res, 200, m[2] === 'approve' ? recipes.approve(m[1]) : recipes.cancel(m[1]));
        if (p === '/api/folderjobs') { masterOnly(auth); const j = await createFolderJob(b); return send(res, 201, folderJobs.view(store.get('folderjobs', j.id))); }
        if ((m = p.match(/^\/api\/folderjobs\/([a-zA-Z0-9-]+)\/(run|pause|resume|retry|delete)$/))) {
          masterOnly(auth);
          if (m[2] === 'delete') { folderJobs.remove(m[1]); return send(res, 200, { ok: true }); }
          if (m[2] === 'run') { folderJobs.runNow(m[1]); return send(res, 200, folderJobs.view(store.get('folderjobs', m[1]))); }
          if (m[2] === 'retry') { const r = folderJobs.retryFailed(m[1]); return send(res, 200, { ...r, job: folderJobs.view(store.get('folderjobs', m[1])) }); }
          folderJobs.setStatus(m[1], m[2] === 'pause' ? 'paused' : 'active'); return send(res, 200, folderJobs.view(store.get('folderjobs', m[1])));
        }
        if (p === '/api/notices/seen') { masterOnly(auth); for (const n of store.list('notices')) if (b.all === true || n.id === b.id) store.put('notices', { ...n, seen: true }); return send(res, 200, { ok: true }); }
        if (p === '/api/routines') return send(res, 200, routines.save(b));
        if ((m = p.match(/^\/api\/routines\/([a-zA-Z0-9-]+)\/(pause|resume|run|delete)$/))) {
          if (m[2] === 'run') { const r = store.get('routines', m[1]); if (!r) throw new Error('Rotina inexistente.'); return send(res, 200, routines.run(r)); }
          if (m[2] === 'delete') { routines.remove(m[1]); return send(res, 200, { ok: true }); }
          return send(res, 200, routines.setStatus(m[1], m[2] === 'pause' ? 'paused' : 'active'));
        }
        if ((m = p.match(/^\/api\/tasks\/([a-zA-Z0-9-]+)\/approve$/))) {
          const t = store.get('tasks', m[1]); if (!t || t.status !== 'completed') throw new Error('Só tarefas concluídas podem ser aprovadas.');
          t.review = { status: 'approved', note: optional(b.note, 500), at: new Date().toISOString() }; store.put('tasks', t); store.event(t.id, { type: 'review', text: 'approved', at: t.review.at });
          return send(res, 200, brief(t)); // aprovar não publica nada
        }
        if ((m = p.match(/^\/api\/tasks\/([a-zA-Z0-9-]+)\/worktree\/remove$/))) {
          // Descarta a cópia isolada e a branch da tarefa. Só para tarefas já finalizadas; o caminho precisa estar dentro de .data/worktrees.
          const t = store.get('tasks', m[1]), iso = t?.result?.isolation;
          if (!iso || iso.removed) throw new Error('Esta tarefa não tem worktree para remover.');
          if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(t.status)) throw new Error('Aguarde a tarefa terminar antes de remover o worktree.');
          const base = resolve(data, 'worktrees');
          if (!resolve(iso.worktree).startsWith(base + '\\') && !resolve(iso.worktree).startsWith(base + '/')) throw new Error('Caminho de worktree fora da pasta do Code Room; nada foi removido.');
          await removeWorktree(iso);
          t.result = { ...t.result, isolation: { ...iso, removed: true, removedAt: new Date().toISOString() } }; store.put('tasks', t);
          store.event(t.id, { type: 'diagnostic', text: `Worktree e branch ${iso.branch} removidos.` });
          return send(res, 200, brief(t));
        }
        if ((m = p.match(/^\/api\/tasks\/([a-zA-Z0-9-]+)\/followup$/))) {
          // Continua o trabalho de uma tarefa. Mesmo provedor → retoma a MESMA sessão (memória completa da conversa).
          // Outro provedor → começa limpo e recebe objetivo, resumo e arquivos da tarefa anterior (passagem de contexto, não a conversa inteira).
          const src = store.get('tasks', m[1]); if (!src) throw new Error('Tarefa não encontrada.');
          if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(src.status)) throw new Error('Aguarde a tarefa terminar para continuar a conversa.');
          const msg = text(b.message, 5000), agentId = b.agentId || src.agent.id, agent = store.get('agents', agentId);
          if (!agent) throw new Error('Agente não encontrado.'); if (!installed(agent)) throw Object.assign(new Error('Provedor não instalado.'), { failureKind: 'executable_missing' });
          const { task: next, duplicate } = createTask(store, { projectId: src.project.id, agentId, requestId: b.requestId || crypto.randomUUID(), objective: msg, criteria: [], resumeFrom: src.id, isolate: b.isolate === true });
          if (!duplicate && !next.resume) {
            const h = orchestrator.createHandoff({ from: src, to: next, type: 'followup', summary: orchestrator.attemptAnswer(src) || src.result?.summary || '', files: (src.result?.deliverables?.files || []).filter(f => f.change !== 'deleted') });
            if (h.blocked) throw new Error(h.blocked);
          }
          void runner.pump(); return send(res, duplicate ? 200 : 201, { ...brief(next), resumed: !!next.resume });
        }
        if ((m = p.match(/^\/api\/tasks\/([a-zA-Z0-9-]+)\/request-changes$/))) {
          const t = store.get('tasks', m[1]); if (!t || t.status !== 'completed') throw new Error('Só tarefas concluídas aceitam pedido de ajuste.');
          const feedback = text(b.feedback, 500), files = (t.result?.deliverables?.files || []).filter(f => f.change !== 'deleted');
          const { task: next } = createTask(store, { projectId: t.project.id, agentId: t.agent.id, requestId: b.requestId || crypto.randomUUID(), objective: `Ajuste solicitado na entrega anterior.
Objetivo original: ${t.objective}
Feedback do usuário: ${feedback}`, criteria: t.criteria, inputs: files.map(f => ({ path: f.path })), flowId: null, resumeFrom: t.id });
          t.review = { status: 'changes_requested', note: feedback, followUpTaskId: next.id, at: new Date().toISOString() }; store.put('tasks', t); void runner.pump();
          return send(res, 201, brief(next));
        }
        if ((m = p.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/open$/))) {
          const pr = store.get('projects', m[1]); if (!pr) throw new Error('Projeto não encontrado.');
          if (process.platform !== 'win32') throw new Error('Abrir pasta só está disponível no Windows.');
          spawn('explorer.exe', [pr.path], { detached: true, stdio: 'ignore', windowsHide: false }).unref(); return send(res, 200, { ok: true });
        }
        if (p === '/api/teams') return send(res, 200, orchestrator.saveTeam(b));
        if (p === '/api/flows') { const r = orchestrator.startSequential(b); return send(res, r.duplicate ? 200 : 201, r.flow); }
        if (p === '/api/plans') { const r = orchestrator.requestPlan(b); return send(res, r.duplicate ? 200 : 201, r.plan); }
        if ((m = p.match(/^\/api\/plans\/([a-zA-Z0-9-]+)\/accept$/))) return send(res, 200, orchestrator.acceptPlan(m[1]));
        if ((m = p.match(/^\/api\/projects\/([a-zA-Z0-9-]+)\/context$/))) {
          if (!store.get('projects', m[1])) throw new Error('Projeto não encontrado.');
          return send(res, 200, store.put('contexts', cleanContext(b, store.get('contexts', m[1]) || emptyContext(m[1]))));
        }
        if (p === '/api/settings/concurrency') {
          const n = (v, d) => Number.isInteger(v) && v >= 1 && v <= 8 ? v : d;
          const cur = runner.concurrency();
          store.put('settings', { id: 'concurrency', global: n(b.global, cur.global), provider: { codex: n(b.provider?.codex, cur.provider.codex), claude: n(b.provider?.claude, cur.provider.claude) }, video: n(b.video, cur.video) });
          void runner.pump(); return send(res, 200, runner.concurrency());
        }
        if (p === '/api/queue/pause') { store.put('settings', { id: 'queue', paused: b.paused === true }); void runner.pump(); return send(res, 200, { paused: runner.paused() }); }
        if (p === '/api/finance/entries') { const project = store.get('projects', b.projectId); if (!project) throw new Error('Projeto não encontrado.'); const r = addEntry(store, project, b); return send(res, r.duplicate ? 200 : 201, r); }
        if (p === '/api/finance/suggest') return send(res, 200, { category: suggestCategory(text(b.description, 200)), categories: CATEGORIES, note: 'Sugestão determinística; precisa de confirmação ao lançar.' });
      }
      return send(res, 404, { error: 'Rota não encontrada' });
    }
    if (req.method === 'GET' && url.pathname === '/manifest.webmanifest') { res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); return res.end(await readFile(join(root, 'public', 'manifest.webmanifest'))); }
    if (req.method === 'GET' && /^\/assets\/[a-z0-9-]+\.(png|jpg)$/.test(url.pathname)) { res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'image/png', 'Cache-Control': 'public, max-age=3600' }); return res.end(await readFile(join(root, 'public', url.pathname.slice(1)))); }
    // Só nomes simples de arquivo (sem barras nem pontos duplos) dentro de public/.
    const name = url.pathname === '/' ? 'index.html' : /^\/[a-z0-9-]+\.(js|css)$/.test(url.pathname) ? url.pathname.slice(1) : null;
    const files = { [url.pathname]: name };
    if (req.method !== 'GET' || !files[url.pathname]) return send(res, 404, { error: 'Não encontrado' });
    const file = files[url.pathname]; res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(await readFile(join(root, 'public', file)));
  } catch (e) { send(res, e.status === 403 ? 403 : 400, { error: e.code === 'ENOENT' ? 'Pasta ou arquivo não encontrado.' : e.message, failureKind: e.failureKind || null }); }
};
const server = http.createServer(handle);
const extra = new Map(); // ip → servidor
async function syncListeners() {
  const wanted = wantedAddresses(netCfg);
  for (const [ip, srv] of extra) if (!wanted.some(w => w.ip === ip)) { srv.closeAllConnections?.(); srv.close(); extra.delete(ip); }
  for (const w of wanted) if (!extra.has(w.ip)) {
    const srv = http.createServer(handle);
    srv.on('error', e => { console.error(`Rede ${w.ip}: ${e.message}`); extra.delete(w.ip); bound = bound.filter(b => b.ip !== w.ip); });
    await new Promise(r => srv.listen(port, w.ip, r)); extra.set(w.ip, srv);
  }
  bound = wanted.filter(w => extra.has(w.ip));
}
async function networkView() {
  const ts = await tailscaleStatus();
  return { config: netCfg, port, tailscale: ts, addresses: bound.map(b => ({ ...b, url: `http://${b.ip}:${port}/` })), nameUrl: ts.name && bound.some(b => b.kind === 'tailscale') ? `http://${ts.name}:${port}/` : null,
    note: 'O serviço nunca escuta em todas as interfaces: só no computador, e nos endereços do Tailscale e/ou da rede local que você liberar. Rede local usa HTTP sem criptografia; fora de casa use o Tailscale.' };
}
// O executor só assume o trabalho depois de ocupar a porta: assim, qualquer claim antigo pertence a um serviço morto.
server.listen(port, '127.0.0.1', async () => {
  updates.start();
  console.log(`Code Room → http://127.0.0.1:${port}/#${key}`);
  try { await runner.start(); routines.start(); folderJobs.start(); moduleList().catch(() => {}); } catch (e) { console.error('Falha ao iniciar o executor:', e.message); }
  try { await syncListeners(); for (const b of bound) console.log(`Acesso remoto (${b.kind}): http://${b.ip}:${port}/`); } catch (e) { console.error('Rede:', e.message); }
  const t = setInterval(() => syncListeners().catch(() => {}), 20000); t.unref?.(); // o Tailscale pode conectar depois do serviço
});
server.on('error', e => { console.error(e.message); process.exitCode = 1; store.close(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { power.stop(); autoClean.stop(); process.exit(0); });
process.on('exit', () => power.stop());
