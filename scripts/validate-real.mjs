// Validação com os CLIs reais (consome um pouco da cota das assinaturas). Uso:
//   node scripts/validate-real.mjs auth      → CLIs sem login (config vazia isolada), sem tocar nas suas credenciais
//   node scripts/validate-real.mjs cancel    → cancela o Codex real no meio da execução e confere a árvore de processos
//   node scripts/validate-real.mjs claude    → cancela e estoura o tempo limite com o Claude Code real
//   node scripts/validate-real.mjs codex-timeout → estoura o tempo limite com o Codex real
//   node scripts/validate-real.mjs restart   → derruba o serviço durante uma tarefa real e confere a recuperação
// Usa sempre uma pasta de projeto temporária e um banco temporário.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.mjs';
import { Runner } from '../server/runner.mjs';
import { createTask } from '../server/tasks.mjs';
import { alive, listTree } from '../server/procs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms, label) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('Tempo esgotado: ' + label); await sleep(250); } };
const tmp = name => mkdtempSync(join(tmpdir(), `cr-real-${name}-`));
const cmd = process.argv[2];

async function auth() {
  for (const [provider, envName] of [['codex', 'CODEX_HOME'], ['claude', 'CLAUDE_CONFIG_DIR']]) {
    const store = new Store(':memory:'), project = tmp('proj');
    const runner = new Runner(store, { extraEnv: { [envName]: tmp('semlogin') }, cancelDeadlineMs: 10000 });
    store.put('projects', { id: 'p', name: 'p', path: project, area: 'Geral' });
    store.put('agents', { id: 'a', name: 'a', role: 'r', room: 'x', provider, model: '', instructions: '', mode: 'read', skillIds: [], capabilities: [] });
    const t = createTask(store, { projectId: 'p', agentId: 'a', requestId: 'r', objective: 'Responda apenas: ok' }).task;
    await runner.pump();
    await until(() => ['failed', 'completed'].includes(store.get('tasks', t.id).status), 120000, provider);
    const done = store.get('tasks', t.id);
    console.log(`${provider}: ${done.status} failureKind=${done.failureKind} | erro: ${String(done.error).slice(0, 160)}`);
  }
}

async function service(port, data) {
  mkdirSync(data, { recursive: true });
  const child = spawn(process.execPath, [join(root, 'server', 'main.mjs')], { cwd: root, env: { ...process.env, CODE_ROOM_PORT: String(port), CODE_ROOM_DATA: data }, windowsHide: true, stdio: 'ignore' });
  const key = await until(() => { try { return readFileSync(join(data, 'access.key'), 'utf8').trim(); } catch { return null; } }, 10000, 'chave');
  const api = async (m, p, b) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { method: m, headers: { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return r.json(); };
  await until(async () => { try { await api('GET', '/api/state'); return true; } catch { return false; } }, 10000, 'serviço');
  return { child, api };
}

const LONG = 'Use sua ferramenta de shell para executar exatamente este comando PowerShell: Start-Sleep -Seconds 180. Depois responda apenas: terminei.';

async function cancel() {
  const data = tmp('cancel-data'), project = tmp('cancel-proj');
  const { child, api } = await service(4783, data);
  try {
    const p = await api('POST', '/api/projects', { name: 'p', path: project });
    const a = await api('POST', '/api/agents', { name: 'Theo', role: 'dev', room: 'Programação', provider: 'codex', model: '', instructions: '', mode: 'read', skillIds: [], capabilities: ['code'] });
    const t = await api('POST', '/api/tasks', { projectId: p.id, agentId: a.id, requestId: 'c1', objective: LONG });
    const other = await api('POST', '/api/agents', { name: 'Bystander', role: 'x', room: 'x', provider: 'claude', model: '', instructions: '', mode: 'read', skillIds: [], capabilities: [] });
    // Processo alheio: um node qualquer que NÃO pertence a nenhuma tarefa e deve sobreviver.
    const bystander = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
    const run = await until(async () => { const d = await api('GET', `/api/tasks/${t.id}`); const att = d.attempts?.[0]; return att?.pid && d.events.some(e => e.type === 'activity') ? att : null; }, 180000, 'codex iniciar o comando');
    const tree = await listTree(run.pid);
    console.log(`Codex rodando: pid ${run.pid}, árvore com ${tree.length} processo(s): ${tree.join(', ')}`);
    const t0 = Date.now(); await api('POST', `/api/tasks/${t.id}/cancel`, {});
    const done = await until(async () => { const d = await api('GET', `/api/tasks/${t.id}`); return d.status === 'cancelled' ? d : null; }, 30000, 'cancelamento');
    const ms = Date.now() - t0;
    const kr = done.attempts[0].killResult;
    console.log(`Cancelada em ${ms} ms | kill ok=${kr.ok} (${kr.ms} ms, ${kr.tree.length} processos) | sobreviventes da árvore: ${tree.filter(alive).length} | processo alheio vivo: ${alive(bystander.pid)}`);
    bystander.kill();
  } finally { child.kill(); }
}

async function restart() {
  const data = tmp('restart-data'), project = tmp('restart-proj');
  let svc = await service(4784, data);
  const p = await svc.api('POST', '/api/projects', { name: 'p', path: project });
  const a = await svc.api('POST', '/api/agents', { name: 'Theo', role: 'dev', room: 'Programação', provider: 'codex', model: '', instructions: '', mode: 'read', skillIds: [], capabilities: ['code'] });
  const t = await svc.api('POST', '/api/tasks', { projectId: p.id, agentId: a.id, requestId: 'rs1', objective: LONG });
  const dep = await svc.api('POST', '/api/tasks', { projectId: p.id, agentId: a.id, requestId: 'rs2', objective: 'depende', dependsOn: [t.id] });
  const run = await until(async () => { const d = await svc.api('GET', `/api/tasks/${t.id}`); const att = d.attempts?.[0]; return att?.pid && d.events.some(e => e.type === 'activity') ? att : null; }, 180000, 'codex iniciar');
  console.log(`Codex real rodando (pid ${run.pid}). Derrubando o serviço (taskkill /F, sem limpeza)...`);
  spawn('taskkill.exe', ['/PID', String(svc.child.pid), '/F'], { stdio: 'ignore', windowsHide: true });
  await until(() => !alive(svc.child.pid), 10000, 'serviço cair');
  console.log(`Serviço caiu. Codex órfão ainda vivo: ${alive(run.pid)}`);
  svc = await service(4784, data);
  const rec = await until(async () => { const d = await svc.api('GET', `/api/tasks/${t.id}`); return d.status !== 'running' ? d : null; }, 30000, 'recuperação');
  await until(() => !alive(run.pid), 15000, 'órfão encerrado');
  const d2 = await svc.api('GET', `/api/tasks/${dep.id}`);
  console.log(`Após reinício: tarefa=${rec.status} | tentativa=${rec.attempts[0].status} | órfão encerrado=${!alive(run.pid)} | dependente=${d2.status} | motivo: ${rec.reason?.slice(0, 90)}`);
  svc.child.kill();
}


const WRITE = 'Escreva um ensaio longo, com pelo menos 4000 palavras, sobre a história dos gatos domésticos. Não use ferramentas.';
async function claude() {
  const data = tmp('claude-data'), project = tmp('claude-proj');
  const { child, api } = await service(4785, data);
  try {
    const p = await api('POST', '/api/projects', { name: 'p', path: project });
    const a = await api('POST', '/api/agents', { name: 'Iris', role: 'x', room: 'x', provider: 'claude', model: '', instructions: '', mode: 'read', skillIds: [], capabilities: [] });
    const bystander = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
    // 1) cancelar
    const t = await api('POST', '/api/tasks', { projectId: p.id, agentId: a.id, requestId: 'cl1', objective: WRITE });
    const run = await until(async () => { const d = await api('GET', `/api/tasks/${t.id}`); const att = d.attempts?.[0]; return att?.pid && att.sessionId ? att : null; }, 120000, 'claude iniciar');
    const tree = await listTree(run.pid); await sleep(2000);
    const t0 = Date.now(); await api('POST', `/api/tasks/${t.id}/cancel`, {});
    const done = await until(async () => { const d = await api('GET', `/api/tasks/${t.id}`); return d.status === 'cancelled' ? d : null; }, 30000, 'cancelamento');
    const kr = done.attempts[0].killResult;
    console.log(`Claude cancelado em ${Date.now() - t0} ms | kill ok=${kr.ok} (${kr.ms} ms, ${kr.tree.length} processos) | sobreviventes: ${tree.filter(alive).length} | processo alheio vivo: ${alive(bystander.pid)}`);
    // 2) tempo limite
    const t2 = await api('POST', '/api/tasks', { projectId: p.id, agentId: a.id, requestId: 'cl2', objective: WRITE, limits: { timeoutMs: 8000 } });
    const d2 = await until(async () => { const d = await api('GET', `/api/tasks/${t2.id}`); return ['failed', 'completed', 'cancelled'].includes(d.status) ? d : null; }, 60000, 'tempo limite');
    const k2 = d2.attempts[0].killResult;
    console.log(`Claude tempo limite: ${d2.status} failureKind=${d2.failureKind} | duração ${(d2.attempts[0].durationMs / 1000).toFixed(1)} s | kill ok=${k2?.ok}`);
    bystander.kill();
  } finally { child.kill(); }
}

async function codexTimeout() {
  const data = tmp('cdx-data'), project = tmp('cdx-proj');
  const { child, api } = await service(4786, data);
  try {
    const p = await api('POST', '/api/projects', { name: 'p', path: project });
    const a = await api('POST', '/api/agents', { name: 'Theo', role: 'dev', room: 'Programação', provider: 'codex', model: '', instructions: '', mode: 'read', skillIds: [], capabilities: [] });
    const t = await api('POST', '/api/tasks', { projectId: p.id, agentId: a.id, requestId: 'ct1', objective: LONG, limits: { timeoutMs: 15000 } });
    const d = await until(async () => { const x = await api('GET', `/api/tasks/${t.id}`); return ['failed', 'completed', 'cancelled'].includes(x.status) ? x : null; }, 90000, 'tempo limite');
    const k = d.attempts[0].killResult;
    console.log(`Codex tempo limite: ${d.status} failureKind=${d.failureKind} | duração ${(d.attempts[0].durationMs / 1000).toFixed(1)} s | kill ok=${k?.ok} (${k?.tree?.length} processos, ${k?.ms} ms) | sobreviventes: ${(k?.tree || []).filter(alive).length}`);
  } finally { child.kill(); }
}

// Duas tarefas de ESCRITA com o Codex real na mesma pasta Git, isoladas em worktrees, rodando ao mesmo tempo.
async function worktree() {
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, existsSync } = await import('node:fs');
  const data = tmp('wt-data'), project = tmp('wt-proj');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: project, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q'); writeFileSync(join(project, 'base.txt'), 'base'); git('add', '.'); git('commit', '-q', '-m', 'base');
  const { child, api } = await service(4788, data);
  try {
    await api('POST', '/api/settings/concurrency', { global: 2, provider: { codex: 2, claude: 1 }, video: 1 });
    const p = await api('POST', '/api/projects', { name: 'p', path: project });
    const a = await api('POST', '/api/agents', { name: 'Theo', role: 'dev', room: 'Programação', provider: 'codex', model: '', instructions: '', mode: 'write', skillIds: [], capabilities: ['code'] });
    const ask = (n, rid) => api('POST', '/api/tasks', { projectId: p.id, agentId: a.id, requestId: rid, isolate: true, objective: `Crie um arquivo chamado ${n}.txt na pasta atual contendo exatamente a palavra ${n}. Não crie nem altere nenhum outro arquivo. Responda apenas: pronto.` });
    const [t1, t2] = [await ask('alfa', 'wt1'), await ask('beta', 'wt2')];
    const seen = { both: false };
    const done = await until(async () => {
      const ts = await Promise.all([t1, t2].map(t => api('GET', `/api/tasks/${t.id}`)));
      if (ts.filter(t => t?.status === 'running').length === 2) seen.both = true;
      return ts.every(t => ['completed', 'failed', 'cancelled'].includes(t?.status)) ? ts : null;
    }, 240000, 'duas tarefas');
    for (const [t, n] of [[t1, 'alfa'], [t2, 'beta']]) {
      const d = await api('GET', `/api/tasks/${t.id}`); const iso = d.result?.isolation;
      console.log(`resposta de ${n}: ${String(d.result?.summary).slice(0, 300)}`);
      console.log(`${n}: ${d.status} failureKind=${d.failureKind} | branch=${iso?.branch} | arquivos=${(d.deliverables?.files || []).map(f => f.path).join(',')} | existe no worktree=${iso ? existsSync(join(iso.worktree, n + '.txt')) : '-'} | existe na pasta original=${existsSync(join(project, n + '.txt'))}`);
    }
    console.log(`rodaram ao mesmo tempo: ${seen.both} | branches: ${git('branch', '--list', 'code-room/*').split('\n').length}`);
    for (const t of [t1, t2]) {
      const before = (await api('GET', `/api/tasks/${t.id}`)).result.isolation, r = await api('POST', `/api/tasks/${t.id}/worktree/remove`, {});
      console.log(`remover ${before.branch}: ${r.error || 'ok'} | pasta existe=${existsSync(before.worktree)}`);
    }
    console.log(`branches restantes: ${git('branch', '--list', 'code-room/*') || '(nenhuma)'}`);
  } finally { child.kill(); }
}

// Memória da conversa: palavra secreta gerada agora (o modelo não pode conhecê-la de antes).
// Mesmo provedor deve LEMBRAR (sessão retomada); outro provedor deve NÃO lembrar (só recebe resumo e arquivos).
async function resume() {
  const data = tmp('rs-data'), project = tmp('rs-proj');
  const { child, api } = await service(4789, data);
  const wait = id => until(async () => { const x = await api('GET', `/api/tasks/${id}`); return ['failed', 'completed', 'cancelled'].includes(x.status) ? x : null; }, 180000, 'tarefa ' + id);
  try {
    const p = await api('POST', '/api/projects', { name: 'p', path: project });
    const mk = (provider, name) => api('POST', '/api/agents', { name, role: 'dev', room: 'Programação', provider, model: '', instructions: '', mode: 'read', skillIds: [], capabilities: [] });
    const ag = { codex: await mk('codex', 'Theo'), claude: await mk('claude', 'Clara') };
    for (const provider of ['codex', 'claude']) {
      const other = provider === 'codex' ? 'claude' : 'codex';
      const secret = 'zq' + Math.random().toString(36).slice(2, 8);
      // A palavra só existe dentro de um arquivo que o agente LÊ (fica na conversa dele) e que é apagado antes da continuação.
      const secretFile = join(project, 'secret.txt'); writeFileSync(secretFile, secret);
      const t1 = await api('POST', '/api/tasks', { projectId: p.id, agentId: ag[provider].id, requestId: `rs1-${provider}`, objective: 'Leia o arquivo secret.txt da pasta atual. Não escreva nada. Responda apenas: ok.' });
      const d1 = await wait(t1.id); rmSync(secretFile);
      const f1 = await api('POST', `/api/tasks/${t1.id}/followup`, { agentId: ag[provider].id, message: 'Qual era o conteúdo do arquivo secret.txt que você leu antes? O arquivo foi apagado. Responda apenas a palavra. Se você não souber, responda: DESCONHECIDA.' });
      const d2 = await wait(f1.id);
      const f2 = await api('POST', `/api/tasks/${t1.id}/followup`, { agentId: ag[other].id, message: 'Qual era o conteúdo do arquivo secret.txt que você leu antes? O arquivo foi apagado. Responda apenas a palavra. Se você não souber, responda: DESCONHECIDA.' });
      const d3 = await wait(f2.id);
      const has = d => String(d.result?.summary || '').includes(secret);
      console.log(`${provider}: 1ª=${d1.status} | mesma sessão: resumed=${f1.resumed} ${d2.status} lembrou=${has(d2)} | ${other} (outro provedor): resumed=${f2.resumed} ${d3.status} lembrou=${has(d3)} | resposta: ${String(d3.result?.summary).trim().slice(0, 80)}`);
    }
  } finally { child.kill(); }
}

// Antigravity (Gemini) e Hermes (remoto) como agentes do Code Room, pelo executor de verdade.
async function providers() {
  const data = tmp('prov-data'), project = tmp('prov-proj');
  const { child, api } = await service(4796, data);
  const wait = (id, ms = 200000) => until(async () => { const x = await api('GET', `/api/tasks/${id}`); return ['failed', 'completed', 'cancelled'].includes(x.status) ? x : null; }, ms, 'tarefa ' + id);
  try {
    const p = await api('POST', '/api/projects', { name: 'p', path: project });
    const mk = (provider, mode, name) => api('POST', '/api/agents', { name, role: 'teste', room: 'Programação', provider, model: '', instructions: '', mode, skillIds: [], capabilities: [] });
    const w = await api('POST', '/api/agents', { name: 'x', role: 'x', room: 'Programação', provider: 'hermes', model: '', instructions: '', mode: 'write', skillIds: [], capabilities: [] });
    console.log('Hermes com escrita é recusado:', !!w.error, '|', w.error);
    const agyR = await mk('agy', 'read', 'Gemi'), agyW = await mk('agy', 'write', 'GemiW'), her = await mk('hermes', 'read', 'Herm');
    const show = (n, d) => console.log(`${n}: ${d.status} failureKind=${d.failureKind} | modelo=${d.actualModel} | uso=${JSON.stringify(d.usage && { in: d.usage.input, out: d.usage.output })} | resposta: ${String(d.answer).trim().slice(0, 80)} | arquivos: ${(d.deliverables?.files || []).map(f => f.path).join(',')} | erro: ${String(d.error || '').slice(0, 160)}`);
    const t1 = await api('POST', '/api/tasks', { projectId: p.id, agentId: agyR.id, requestId: 'pv1', objective: 'Responda apenas: ok' }); show('agy leitura', await wait(t1.id));
    const t2 = await api('POST', '/api/tasks', { projectId: p.id, agentId: agyW.id, requestId: 'pv2', objective: 'Crie o arquivo gemini.txt na pasta atual contendo exatamente a palavra alfa. Não crie nada além disso. Responda apenas: pronto.' }); const d2 = await wait(t2.id); show('agy escrita', d2);
    const f2 = await api('POST', `/api/tasks/${t1.id}/followup`, { agentId: agyR.id, message: 'Repita apenas a palavra que você respondeu antes.' }); show(`agy continuação (resumed=${f2.resumed})`, await wait(f2.id));
    const t3 = await api('POST', '/api/tasks', { projectId: p.id, agentId: her.id, requestId: 'pv3', objective: 'Responda apenas: ok', limits: { timeoutMs: 90000 } }); show('hermes', await wait(t3.id, 150000));
  } finally { child.kill(); }
}

// Ligação entre agentes de verdade: o Codex cria um arquivo; o Claude, ligado a ele, recebe o repasse sozinho e revisa.
async function links() {
  const data = tmp('lk-data'), project = tmp('lk-proj');
  const { child, api } = await service(4797, data);
  try {
    await api('POST', '/api/settings/concurrency', { global: 2, provider: { codex: 1, claude: 1 }, video: 1 });
    const p = await api('POST', '/api/projects', { name: 'p', path: project });
    const mk = (provider, mode, name, role) => api('POST', '/api/agents', { name, role, room: 'Programação', provider, model: '', instructions: '', mode, skillIds: [], capabilities: [] });
    const dev = await mk('codex', 'write', 'Theo', 'Montador'), rev = await mk('claude', 'read', 'Clara', 'Revisor');
    const l = await api('POST', '/api/links', { projectId: p.id, from: dev.id, to: rev.id, maxHops: 2 }); console.log('ligação criada:', !!l.id);
    const t1 = await api('POST', '/api/tasks', { projectId: p.id, agentId: dev.id, requestId: 'lk1', objective: 'Crie o arquivo ola.txt na pasta atual contendo exatamente a palavra alfa. Não crie nada além disso. Responda apenas: pronto.' });
    const all = async () => (await api('GET', '/api/state')).runs;
    const done = await until(async () => { const r = await all(); return r.length >= 2 && r.every(x => ['completed', 'failed', 'cancelled', 'blocked'].includes(x.status)) ? r : null; }, 240000, 'cadeia');
    for (const r of done.sort((a, b) => a.hops - b.hops)) { const d = await api('GET', `/api/tasks/${r.id}`); console.log(`repasse ${d.hops} | ${d.agent.name} (${d.agent.provider}) ${d.status} | arquivos: ${(d.deliverables.files || []).map(f => f.path).join(',') || '-'} | resposta: ${String(d.answer).trim().slice(0, 200).replaceAll(String.fromCharCode(10), ' ')}`); }
    console.log('tarefas na cadeia:', done.length);
  } finally { child.kill(); }
}

const run = { auth, cancel, restart, claude, 'codex-timeout': codexTimeout, worktree, resume, providers, links }[cmd];
if (!run) { console.error('Use: auth | cancel | restart | claude | codex-timeout | worktree | resume | providers | links'); process.exit(2); }
await run(); process.exit(0);
