// 0.3.9: o Code Room executa de verdade (aprovação durante a execução, ação "abrir", ações mal formatadas, Revisor só com arquivos).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Approvals, describe, ruleKey } from '../server/approvals.mjs';
import { askAndWait, answer, approvalServer, PROMPT_TOOL, handle } from '../server/permission-mcp.mjs';
import { command } from '../server/connectors.mjs';
import { planOpen, runOpen, browserExe } from '../server/open-local.mjs';
import { parseActions, inferAction, normalizeAction, fixProposal } from '../server/assistant.mjs';
import { setup, addProject, addAgent, waitFor } from './helpers.mjs';

test('aprovações: pedido, Permitir, Negar, "sempre nesta tarefa", fim da tarefa e prazo', () => {
  let t = 1000; const ap = new Approvals({ now: () => t }); ap.taskInfo = id => ({ agent: 'Theo', project: 'Loja' });
  const a = ap.ask({ taskId: 'T1', tool: 'PowerShell', input: { command: 'Start-Process notepad' } });
  assert.equal(a.status, 'pending'); const v = ap.pending()[0];
  assert.equal(v.title, 'Rodar um comando'); assert.equal(v.detail, 'Start-Process notepad'); assert.equal(v.agent, 'Theo');
  ap.decide(a.id, { allow: true, always: true }); assert.equal(ap.get(a.id).status, 'allow');
  assert.equal(ap.ask({ taskId: 'T1', tool: 'PowerShell', input: { command: 'start-process calc' } }).status, 'allow', 'mesmo programa na mesma tarefa: não pergunta de novo');
  assert.equal(ap.ask({ taskId: 'T2', tool: 'PowerShell', input: { command: 'Start-Process notepad' } }).status, 'pending', 'outra tarefa pergunta');
  const b = ap.ask({ taskId: 'T1', tool: 'Bash', input: { command: 'rm -rf x' } }); ap.decide(b.id, { allow: false }); assert.deepEqual([ap.get(b.id).status, ap.get(b.id).message], ['deny', 'A pessoa negou.']);
  const c = ap.ask({ taskId: 'T3', tool: 'WebFetch', input: { url: 'https://x' } }); ap.endTask('T3'); assert.equal(ap.get(c.id).status, 'deny');
  ap.endTask('T1'); assert.equal(ap.ask({ taskId: 'T1', tool: 'PowerShell', input: { command: 'Start-Process x' } }).status, 'pending', '"sempre" some quando a tarefa acaba');
  const d = ap.ask({ taskId: 'T4', tool: 'Read', input: { file_path: 'C:/x' } }); t += 11 * 60 * 1000; assert.equal(ap.get(d.id).status, 'deny', 'sem resposta em 10 min vale Negar');
  assert.equal(ap.get('nao-existe').status, 'deny'); assert.throws(() => ap.decide('nao-existe', { allow: true }), /expirou/);
  assert.ok(!ap.okToken('x') && ap.okToken(ap.token));
  assert.equal(describe('mcp__flow__gerar', {}).title, 'Usar a ferramenta flow › gerar'); assert.equal(ruleKey('Bash', { command: 'NPM run x' }), 'Bash:npm');
});

test('ferramenta de aprovação: pergunta ao Code Room e devolve allow/deny no formato do Claude', async () => {
  const ap = new Approvals(); const calls = [];
  const fetchFn = async (url, opts = {}) => {
    calls.push(url); assert.equal(opts.headers['X-Code-Room-Approval'], ap.token);
    if (url.endsWith('/ask')) { const r = ap.ask(JSON.parse(opts.body)); return { ok: true, json: async () => r }; }
    return { ok: true, json: async () => ap.get(url.split('/').pop()) };
  };
  const sleep = async () => { const p = ap.pending()[0]; if (p) ap.decide(p.id, { allow: p.tool !== 'Bash' }); };
  const ok = JSON.parse(await askAndWait({ base: 'http://x', token: ap.token, taskId: 'T', tool: 'PowerShell', input: { command: 'whoami' }, fetchFn, sleep }));
  assert.deepEqual(ok, { behavior: 'allow', updatedInput: { command: 'whoami' } });
  const no = JSON.parse(await askAndWait({ base: 'http://x', token: ap.token, taskId: 'T', tool: 'Bash', input: { command: 'rm' }, fetchFn, sleep }));
  assert.equal(no.behavior, 'deny');
  const down = JSON.parse(await askAndWait({ base: 'http://x', token: 't', taskId: 'T', tool: 'Bash', input: {}, fetchFn: async () => { throw new Error('ECONNREFUSED'); }, sleep }));
  assert.match(down.message, /Não consegui falar com o Code Room/);
  assert.equal(JSON.parse(answer('deny', {})).behavior, 'deny');
  const list = await handle({ id: 1, method: 'tools/list' }, {}); assert.equal(list.result.tools[0].name, 'aprovar');
  const srv = approvalServer('T9', { port: 4999, token: 'abc' }); assert.equal(srv.env.CODE_ROOM_TASK, 'T9'); assert.equal(srv.env.CODE_ROOM_APPROVAL_URL, 'http://127.0.0.1:4999');
});

test('Claude que edita pergunta na tela; somente leitura e projeto Financeiro continuam negando sozinhos', () => {
  const catalog = [{ id: 'claude', path: 'claude.exe' }];
  const write = command({ provider: 'claude', mode: 'write' }, 'oi', { cwd: process.cwd(), catalog, approvalTask: 'T1' }).args;
  assert.equal(write[write.indexOf('--permission-prompts') + 1], 'host'); assert.equal(write[write.indexOf('--permission-prompt-tool') + 1], PROMPT_TOOL);
  const cfg = JSON.parse(write[write.indexOf('--mcp-config') + 1]); assert.ok(cfg.mcpServers.aprovacao && cfg.mcpServers.arquivos, 'as duas ferramentas vão numa configuração só');
  assert.equal(write.filter(a => a === '--mcp-config').length, 1);
  const read = command({ provider: 'claude', mode: 'read' }, 'oi', { cwd: process.cwd(), catalog, approvalTask: 'T1' }).args;
  assert.equal(read[read.indexOf('--permission-prompts') + 1], 'none'); assert.ok(!read.includes('--permission-prompt-tool'));
  const fin = command({ provider: 'claude', mode: 'write' }, 'oi', { cwd: process.cwd(), catalog, approvalTask: null }).args;
  assert.equal(fin[fin.indexOf('--permission-prompts') + 1], 'none'); assert.ok(!JSON.stringify(fin).includes('aprovacao'));
});

test('abrir: programas da lista, arquivos seguros, pastas e sites; nada de terminal nem executável', async () => {
  assert.equal(planOpen({ alvo: 'Bloco de Notas' }).program, 'notepad');
  assert.equal(planOpen({ alvo: 'http://localhost:3000', navegador: 'interno' }).where, 'interno');
  assert.equal(planOpen({ alvo: 'https://site.com', navegador: 'chrome' }).where, 'chrome');
  for (const bad of ['powershell', 'cmd', 'javascript:alert(1)', 'file:///C:/x', 'ms-settings:', 'C:/nao/existe.txt', '']) assert.ok(planOpen({ alvo: bad }).error, bad);
  const fakeFs = { exists: () => true, stat: () => ({ isDirectory: () => false }) };
  for (const ext of ['.exe', '.bat', '.ps1', '.lnk', '.vbs', '.js', '.msi']) assert.match(planOpen({ alvo: `C:/x/a${ext}` }, fakeFs).error, /segurança/);
  assert.equal(planOpen({ alvo: 'C:/x/nota.pdf' }, fakeFs).kind, 'file');
  const calls = [], launch = async (f, a) => { calls.push([f, a]); };
  assert.match((await runOpen(planOpen({ alvo: 'notepad' }), { launch, platform: 'win32' })).result, /Bloco de Notas/);
  const url = 'https://x.com/?a=1&calc'; await runOpen(planOpen({ alvo: url }), { launch, platform: 'win32' });
  assert.match(calls.at(-1)[0], /explorer\.exe$/i); assert.deepEqual(calls.at(-1)[1], [url], 'o endereço vai como argumento, nunca pelo cmd');
  await runOpen(planOpen({ alvo: url, navegador: 'chrome' }), { launch, platform: 'win32', findExe: p => /chrome\.exe$/.test(p) });
  assert.match(calls.at(-1)[0], /chrome\.exe$/); assert.deepEqual(calls.at(-1)[1], [url]);
  await assert.rejects(runOpen(planOpen({ alvo: url, navegador: 'edge' }), { launch, platform: 'win32', findExe: () => false }), /Não achei/);
  assert.deepEqual(await runOpen(planOpen({ alvo: 'http://localhost:5173', navegador: 'interno' }), { launch, platform: 'win32' }), { result: 'Abri http://localhost:5173/ no navegador do Code Room.', browserUrl: 'http://localhost:5173/' });
  assert.equal(browserExe('chrome', () => false), null);
  const world = { agents: [], teams: [], projects: [], connected: new Set(['claude']), skills: [] };
  assert.equal(normalizeAction({ acao: 'abrir', alvo: 'notepad' }, world).valid, true);
  assert.equal(normalizeAction({ acao: 'abrir', alvo: 'cmd' }, world).valid, false);
});

test('ações mal formatadas viram cartão (json comum, "tipo", agente+objetivo); código comum fica no texto', () => {
  const f = '```';
  const r = parseActions(`Encaminhei.\n${f}json\n{"agente": "Kiro", "objetivo": "Organizar"}\n${f}\nCódigo:\n${f}js\nconst a = 1\n${f}\n${f}json\n{"nome": "x"}\n${f}\n${f}\n{"tipo": "abrir", "alvo": "notepad"}\n${f}`);
  assert.deepEqual(r.actions.map(a => a.acao), ['iniciar_tarefa', 'abrir']);
  assert.match(r.text, /const a = 1/); assert.match(r.text, /"nome": "x"/); assert.doesNotMatch(r.text, /Kiro/);
  assert.equal(inferAction({ alvo: 'calc' }).acao, 'abrir'); assert.equal(inferAction({ foo: 1 }), null); assert.equal(inferAction([1]), null);
  const world = { agents: [{ id: 'k', name: 'Kiro', provider: 'x-kiro', mode: 'write' }], teams: [], projects: [{ id: 'p1', name: 'Olos', agentIds: ['k'] }], connected: new Set(['x-kiro']), skills: [] };
  const fx = fixProposal({ acao: 'iniciar_tarefa', agente: 'Kiro', objetivo: 'Organizar' }, world, undefined, { focusProject: 'Olos' });
  assert.equal(fx.n.valid, true, 'sem projeto: usa o projeto em foco');
});

test('equipe: pedido que não gera arquivo termina no desenvolvedor, sem rodar o Revisor', async () => {
  const { store, orchestrator } = await setup(); const P = await addProject(store, 'acao');
  const dev = addAgent(store, 'dev', { name: 'Theo', mode: 'write', instructions: '[[fake answer=Abri_o_programa]]' });
  const rev = addAgent(store, 'rev', { name: 'Iris', mode: 'read', instructions: '[[fake answer=VEREDITO:_APROVADO]]' });
  const tm = orchestrator.saveTeam({ name: 'Ação', members: [{ role: 'desenvolvedor', agentId: dev.id }, { role: 'revisor', agentId: rev.id }] });
  const { flow } = orchestrator.startSequential({ projectId: P.id, teamId: tm.id, requestId: 'sem-arquivo', objective: 'Abrir o bloco de notas' });
  await waitFor(() => store.get('flows', flow.id).status !== 'running', 30000, 'fluxo');
  const f = store.get('flows', flow.id); assert.equal(f.status, 'completed'); assert.equal(f.reviewSkipped, true); assert.equal(f.taskIds.length, 1);
  const review = store.list('tasks').find(t => t.flowId === flow.id && t.step === 'review'); assert.equal(review.status, 'cancelled'); assert.match(review.reason, /Sem arquivos/);
});

test('terminal: shell puro ou CLI na pasta do projeto, Windows Terminal ou conhost; irrestrito só quando pedido; Financeiro só shell', async () => {
  const { terminalPlan, openTerminal } = await import('../server/terminal.mjs');
  const catalog = [{ id: 'claude', path: 'C:/x/claude.exe' }, { id: 'codex', path: "C:/it's/codex.exe" }];
  const env = { SystemRoot: 'C:\Windows', LOCALAPPDATA: 'C:\L' }, base = { catalog, exists: () => true, env };
  const wt = terminalPlan({ dir: 'C:/proj', cli: 'claude' }, { ...base, hasWt: () => true });
  assert.match(wt.file, /wt\.exe$/); assert.equal(wt.args[wt.args.indexOf('-d') + 1], 'C:/proj'); assert.ok(!wt.args.join(' ').includes('--dangerously'));
  assert.ok(!wt.args.some(a => a.includes(';')), 'sem ";" (o Windows Terminal separa abas por ;)');
  const free = terminalPlan({ dir: 'C:/proj', cli: 'codex', unrestricted: true }, { ...base, hasWt: () => true });
  assert.ok(free.args.at(-1).includes('--dangerously-bypass-approvals-and-sandbox') && free.unrestricted);
  assert.ok(free.args.at(-1).includes("'C:/it''s/codex.exe'"), 'aspas do PowerShell escapadas');
  const shell = terminalPlan({ dir: 'C:/proj', cli: 'shell', unrestricted: true }, { ...base, hasWt: () => false });
  assert.match(shell.file, /conhost\.exe$/); assert.deepEqual(shell.args.slice(1), ['-NoExit', '-NoLogo']); assert.equal(shell.unrestricted, false);
  assert.match(terminalPlan({ cli: 'claude', area: 'Financeiro' }, base).error, /Financeiro/);
  assert.equal(terminalPlan({ cli: 'shell', area: 'Financeiro' }, base).error, undefined);
  assert.match(terminalPlan({ cli: 'agy' }, base).error, /não está instalado/); assert.match(terminalPlan({ cli: 'cmd' }, base).error, /Escolha/);
  const calls = []; const r = await openTerminal(wt, { launch: async (f, a, o) => calls.push([f, o.cwd]), platform: 'win32' });
  assert.match(r.result, /Claude Code em C:\/proj/); assert.equal(calls[0][1], 'C:/proj');
});

test('irrestrito: Codex sem caixa de areia, Gemini sem confirmação, Claude libera e registra; padrão continua pedindo', async () => {
  const catalog = [{ id: 'claude', path: 'c' }, { id: 'codex', path: 'x' }, { id: 'agy', path: 'a' }];
  const cx = (u, mode = 'write') => command({ provider: 'codex', mode }, 'oi', { cwd: process.cwd(), catalog, unrestricted: u }).args;
  assert.equal(cx(false)[cx(false).indexOf('--sandbox') + 1], 'workspace-write'); assert.equal(cx(true)[cx(true).indexOf('--sandbox') + 1], 'danger-full-access');
  const ag = command({ provider: 'agy', mode: 'write' }, 'oi', { cwd: process.cwd(), catalog, unrestricted: true });
  assert.ok(ag.args.includes('--dangerously-skip-permissions')); assert.equal(ag.args[ag.args.indexOf('--mode') + 1], 'auto'); assert.match(ag.input, /MODO IRRESTRITO/);
  const agNo = command({ provider: 'agy', mode: 'write' }, 'oi', { cwd: process.cwd(), catalog }); assert.ok(!agNo.args.includes('--dangerously-skip-permissions'));
  const ap = new Approvals(); ap.taskInfo = id => ({ agent: 'Livre', unrestricted: id === 'L' });
  assert.deepEqual(ap.ask({ taskId: 'L', tool: 'PowerShell', input: { command: 'Start-Process notepad' } }), { id: null, status: 'allow', auto: true });
  assert.equal(ap.log.at(-1).detail, 'Start-Process notepad'); assert.equal(ap.pending().length, 0, 'irrestrito não abre cartão');
  assert.equal(ap.ask({ taskId: 'N', tool: 'PowerShell', input: { command: 'x' } }).status, 'pending', 'agente comum continua perguntando');
});

test('voz global: eventos levam ação e id do pedido para a tela', async () => {
  const { Store } = await import('../server/store.mjs'); const s = new Store(':memory:');
  s.event('_hotkey', { type: 'voice_global', action: 'start', id: 'abc', at: 'x' }); s.event('t1', { type: 'tool', text: 'segredo' });
  const ev = s.eventsSince(0); assert.equal(ev[0].action, 'start'); assert.equal(ev[0].voiceId, 'abc'); assert.equal(ev[1].text, undefined, 'outros eventos continuam só com o tipo');
});

test('irrestrito sem Git: cópia de segurança antes e "Reverter alterações" desfaz pela cópia; projeto grande fica sem cópia', async () => {
  const { captureFileBackup, revertTaskChanges } = await import('../server/task-checkpoint.mjs');
  const { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs'); const { tmpdir } = await import('node:os');
  const proj = mkdtempSync(join(tmpdir(), 'cr-bk-p-')), bk = join(mkdtempSync(join(tmpdir(), 'cr-bk-')), 'T1');
  mkdirSync(join(proj, 'src')); mkdirSync(join(proj, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(proj, 'src', 'app.js'), 'original'); writeFileSync(join(proj, 'leia.txt'), 'oi'); writeFileSync(join(proj, 'node_modules', 'x', 'big.js'), 'lib');
  const cp = await captureFileBackup(proj, bk); assert.equal(cp.available, true); assert.equal(cp.files, 2, 'node_modules fica de fora');
  // a IA "irrestrita" muda um arquivo, apaga outro e cria um novo
  writeFileSync(join(proj, 'src', 'app.js'), 'estragado'); (await import('node:fs')).rmSync(join(proj, 'leia.txt')); writeFileSync(join(proj, 'novo.txt'), 'abc');
  const r = await revertTaskChanges(proj, cp, { files: [{ path: 'src/app.js', change: 'modified' }, { path: 'leia.txt', change: 'deleted' }, { path: 'novo.txt', change: 'created', bytes: 3 }] });
  assert.equal(readFileSync(join(proj, 'src', 'app.js'), 'utf8'), 'original'); assert.equal(readFileSync(join(proj, 'leia.txt'), 'utf8'), 'oi'); assert.ok(!existsSync(join(proj, 'novo.txt')), 'arquivo novo vai para a lixeira do Code Room');
  assert.equal(r.restored, 2); assert.equal(r.trashed, 1);
  const big = await captureFileBackup(proj, join(bk, '..', 'T2'), { maxBytes: 3 }); assert.equal(big.available, false); assert.match(big.reason, /grande demais/);
  await assert.rejects(revertTaskChanges(proj, { available: true, kind: 'copy', dir: join(bk, 'nao-existe') }, { files: [{ path: 'a', change: 'modified' }] }), /ponto de restauração/);
});
