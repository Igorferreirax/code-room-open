import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeAction, stateSummary, Assistant } from '../server/assistant.mjs';
import { Store } from '../server/store.mjs';

const world = (over = {}) => ({
  agents: [{ id: 'a1', name: 'Diretor', role: 'dirige', provider: 'claude', mode: 'read' }, { id: 'a2', name: 'Editor', role: 'edita', provider: 'codex', mode: 'write' }],
  teams: [{ id: 't1', name: 'Equipe de Vídeo', members: [] }], projects: [{ id: 'p1', name: 'Canal' }], channels: [{ id: 'c1', name: 'Causo Sombrio', niche: 'terror' }], routines: [],
  connected: new Set(['codex', 'claude']), links: [], skills: [], ...over });
const ok = r => { assert.equal(r.valid, true, r.error); return r; };
const no = (r, re) => { assert.equal(r.valid, false); assert.match(r.error, re); };

test('canal: cria o perfil por nicho com as contas só como @ público; não conecta nem publica', () => {
  const r = ok(normalizeAction({ acao: 'criar_canal', nome: 'Receitas da Vó', nicho: 'culinária brasileira', estilo: 'vhs', youtube: '@receitasdavo', instagram: 'receitasdavo.ig', tiktok: '', por_dia: 3, horarios: '12h e 19h', tom: 'carinhoso' }, world()));
  assert.equal(r.type, 'criar_canal'); assert.deepEqual([r.payload.youtube, r.payload.instagram, r.payload.tiktok], ['receitasdavo', 'receitasdavo.ig', '']);
  assert.equal(r.payload.perDay, 3); assert.equal(r.payload.style, 'vhs'); assert.equal(r.payload.createPostador, true, 'Postador por padrão');
  assert.match(r.summary, /Não conecta contas nem publica nada/); assert.match(r.summary, /youtube @receitasdavo/);
  assert.equal(ok(normalizeAction({ acao: 'criar_canal', nome: 'X', estilo: 'inventado', por_dia: 99, criar_postador: false }, world())).payload.style, 'outro', 'estilo desconhecido vira "outro"');
  assert.equal(ok(normalizeAction({ acao: 'criar_canal', nome: 'X', por_dia: 99 }, world())).payload.perDay, 4, 'limite de 4 por dia');
  assert.equal(ok(normalizeAction({ acao: 'criar_canal', nome: 'X', criar_postador: false }, world())).payload.createPostador, false);
});

test('canal: recusa nome vazio ou repetido, link no lugar do @ e textos grandes demais; senhas nunca viram campo', () => {
  no(normalizeAction({ acao: 'criar_canal', nicho: 'x' }, world()), /precisa de um nome/);
  no(normalizeAction({ acao: 'criar_canal', nome: 'causo sombrio' }, world()), /Já existe o canal/);
  no(normalizeAction({ acao: 'criar_canal', nome: 'Novo', youtube: 'https://youtube.com/@x' }, world()), /Usuário de rede inválido/);
  no(normalizeAction({ acao: 'criar_canal', nome: 'Novo', instagram: 'a b' }, world()), /Usuário de rede inválido/);
  no(normalizeAction({ acao: 'criar_canal', nome: 'Novo', nicho: 'x'.repeat(201) }, world()), /Nicho: máximo de 200/);
  const r = ok(normalizeAction({ acao: 'criar_canal', nome: 'Novo', senha: 'segredo', token: 'abc' }, world()));
  assert.ok(!JSON.stringify(r).includes('segredo') && !JSON.stringify(r).includes('abc'), 'campos de credencial são ignorados');
});

test('rotina: manual, diária e semanal viram o disparo certo; exige agente OU equipe e projeto existente', () => {
  const base = { acao: 'criar_rotina', nome: 'Pesquisa de pautas', projeto: 'Canal', objetivo: 'Buscar 5 pautas novas', agente: 'Diretor' };
  assert.deepEqual(ok(normalizeAction({ ...base, quando: { tipo: 'manual' } }, world())).payload.trigger, { type: 'manual' });
  const d = ok(normalizeAction({ ...base, quando: { tipo: 'diario', hora: '09:30' } }, world())); assert.deepEqual(d.payload.trigger, { type: 'time', freq: 'daily', time: '09:30' }); assert.match(d.summary, /todo dia às 09:30/); assert.match(d.summary, /cota da sua IA/);
  assert.deepEqual(ok(normalizeAction({ ...base, quando: { tipo: 'semanal', hora: '18:00', dia: 1 } }, world())).payload.trigger, { type: 'time', freq: 'weekly', time: '18:00', day: 1 });
  assert.deepEqual(ok(normalizeAction({ ...base, agente: undefined, equipe: 'Equipe de Vídeo', quando: { tipo: 'manual' } }, world())).payload.target, { type: 'team', id: 't1' });
  no(normalizeAction({ ...base, quando: { tipo: 'diario', hora: '25:99' } }, world()), /Horário inválido/);
  no(normalizeAction({ ...base, quando: { tipo: 'semanal', hora: '10:00', dia: 9 } }, world()), /Dia da semana inválido/);
  no(normalizeAction({ ...base, quando: { tipo: 'sempre' } }, world()), /Informe quando/);
  no(normalizeAction({ ...base, equipe: 'Equipe de Vídeo', quando: { tipo: 'manual' } }, world()), /OU o agente/);
  no(normalizeAction({ ...base, projeto: 'Fantasma', quando: { tipo: 'manual' } }, world()), /não existe/);
  no(normalizeAction({ ...base, agente: 'Ninguém', quando: { tipo: 'manual' } }, world()), /não existe/);
  no(normalizeAction({ ...base, objetivo: '', quando: { tipo: 'manual' } }, world()), /nome e objetivo/);
});

test('rotina: aceita agente que será criado na mesma resposta (planejado) e revalida na hora de aplicar', () => {
  const planned = { agents: ['Roteirista Novo'], teams: [], projects: [], skills: [] };
  const r = ok(normalizeAction({ acao: 'criar_rotina', nome: 'Roteiros', projeto: 'Canal', objetivo: 'Escrever', agente: 'Roteirista Novo', quando: { tipo: 'manual' } }, world(), planned));
  assert.equal(r.payload.target.id, null, 'na prévia o id ainda não existe');
  no(normalizeAction({ acao: 'criar_rotina', nome: 'Roteiros', projeto: 'Canal', objetivo: 'Escrever', agente: 'Roteirista Novo', quando: { tipo: 'manual' } }, world()), /não existe/);
});

test('agente com navegador: opcional, explícito no cartão e só nas combinações que valem', () => {
  const base = { acao: 'criar_agente', nome: 'Pesquisador Web', funcao: 'pesquisa na internet', provedor: 'claude' };
  assert.equal(ok(normalizeAction(base, world())).payload.browser, 'off', 'sem pedir, nada de navegador');
  const iso = ok(normalizeAction({ ...base, navegador: 'isolado' }, world())); assert.equal(iso.payload.browser, 'isolado'); assert.match(iso.summary, /NAVEGADOR: navegador separado/);
  const chr = ok(normalizeAction({ ...base, navegador: 'chrome' }, world())); assert.match(chr.summary, /age nas suas contas em que você está logado/);
  no(normalizeAction({ ...base, provedor: 'codex', navegador: 'chrome' }, world()), /só funciona com o Claude Code/);
  no(normalizeAction({ ...base, navegador: 'sim' }, world()), /Navegador inválido/);
  assert.equal(ok(normalizeAction({ ...base, provedor: 'codex', navegador: 'isolado' }, world())).payload.browser, 'isolado');
});

test('estado: o Assistente enxerga os canais e as rotinas que já existem', () => {
  const s = stateSummary(world({ channels: [{ id: 'c1', name: 'Causo Sombrio', niche: 'terror', networks: 'youtube @causo', postador: true }], routines: [{ id: 'r1', name: 'Pautas', status: 'paused', when: 'todo dia às 09:00' }] }), ['Canal']);
  assert.match(s, /Canais:\n- Causo Sombrio \(nicho: terror\) · youtube @causo · tem Postador/); assert.match(s, /Rotinas:\n- Pautas \(todo dia às 09:00, pausada\)/);
  assert.match(stateSummary(world({ channels: [], routines: [] }), []), /\(nenhum canal ainda\)[\s\S]*\(nenhuma rotina ainda\)/);
});

test('aplicar: criar_canal e criar_rotina passam pelos mesmos caminhos do app e ficam registrados como aplicados', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-act2-')), store = new Store(':memory:'), calls = [];
  try {
    const asst = new Assistant({ store, root: process.cwd(), dataDir: dir, world: async () => world(), saveChannel: async p => { calls.push(['canal', p]); return { channel: { name: p.name }, agent: p.createPostador ? { id: 'ag' } : null }; }, saveRoutine: async p => { calls.push(['rotina', p]); return { name: p.name }; } });
    store.put('settings', { id: 'assistant', provider: 'claude', messages: [{ id: 'm1', role: 'assistant', text: 'ok', actions: [
      { idx: 0, status: 'pending', raw: { acao: 'criar_canal', nome: 'Novo Canal', nicho: 'humor', youtube: 'novocanal' } },
      { idx: 1, status: 'pending', raw: { acao: 'criar_rotina', nome: 'Diária', projeto: 'Canal', objetivo: 'Pesquisar', agente: 'Diretor', quando: { tipo: 'diario', hora: '08:00' } } }] }], thread: { id: 't1', title: 'Conversa 1' }, others: [], order: ['t1'] });
    const a = await asst.apply('m1', 0); assert.match(a.result, /Canal “Novo Canal” criado com o agente Postador.*Conexões.*confirmação/); assert.equal(a.view, 'connections');
    const b = await asst.apply('m1', 1); assert.match(b.result, /Rotina “Diária” criada/); assert.equal(b.view, 'routines'); assert.equal(b.projectId, 'p1');
    assert.deepEqual(calls.map(c => c[0]), ['canal', 'rotina']); assert.equal(calls[1][1].target.id, 'a1'); assert.equal(calls[0][1].youtube, 'novocanal');
    await assert.rejects(() => asst.apply('m1', 0), /já foi tratada/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('manual do Assistente: descreve as novas ações e continua dentro do limite de tamanho', () => {
  const m = readFileSync(new URL('../docs/ASSISTENTE.md', import.meta.url), 'utf8');
  for (const k of ['criar_canal', 'criar_rotina', '`navegador`', 'Orquestração', 'Agentes não criam tarefas para outros agentes por conta própria']) assert.ok(m.includes(k), `falta: ${k}`);
  assert.ok(Buffer.byteLength(m) <= 20000, `manual com ${Buffer.byteLength(m)} bytes (limite 20000)`);
});

test('agente com programas liberados: só Claude, nomes simples e no máximo 10; aparece no cartão', () => {
  const base = { acao: 'criar_agente', nome: 'Produtor', funcao: 'renderiza vídeo', provedor: 'claude', permissao: 'write' };
  const r = ok(normalizeAction({ ...base, programas: ['ffmpeg', 'node', 'ffmpeg'] }, world()));
  assert.deepEqual(r.payload.commands, ['ffmpeg', 'node'], 'sem repetir'); assert.match(r.summary, /PODE RODAR no terminal: ffmpeg, node/);
  assert.deepEqual(ok(normalizeAction(base, world())).payload.commands, [], 'sem pedir, nenhum programa liberado');
  no(normalizeAction({ ...base, programas: ['C:/Windows/system32/cmd.exe'] }, world()), /nomes simples/);
  no(normalizeAction({ ...base, programas: ['ffmpeg; calc'] }, world()), /nomes simples/);
  no(normalizeAction({ ...base, programas: Array.from({ length: 11 }, (_, i) => 'p' + i) }, world()), /até 10 nomes/);
  no(normalizeAction({ ...base, programas: 'ffmpeg' }, world()), /lista de nomes/);
  no(normalizeAction({ ...base, provedor: 'codex', programas: ['ffmpeg'] }, world()), /só vale para o Claude Code/);
  assert.ok(readFileSync(new URL('../docs/ASSISTENTE.md', import.meta.url), 'utf8').includes('`programas`'), 'manual explica');
});

test('o prompt do Assistente nunca passa do limite de 30000 caracteres de uma tarefa (conversa longa, estado grande, pergunta de 2000)', async () => {
  const { buildPrompt, loadManual, TASK_BUDGET } = await import('../server/assistant.mjs');
  const manual = loadManual(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')).text;
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'x'.repeat(1500) }));
  const out = buildPrompt({ manual: manual || 'M'.repeat(20000), knowledge: 'K'.repeat(5000), summary: 'S'.repeat(4200), history, memory: 'm'.repeat(3000), question: 'Q'.repeat(2000), max: TASK_BUDGET });
  assert.ok(out.length <= 30000, `prompt com ${out.length} caracteres`);
  assert.ok(out.endsWith('Q'.repeat(2000)), 'a pergunta nunca é cortada');
});

import { command } from '../server/connectors.mjs';
test('agente Claude com ferramentas MCP liberadas: vira --allowedTools mcp__<servidor>; sem lista, nada é liberado', () => {
  const base = { provider: 'claude', mode: 'read', commands: [], browser: 'off' };
  const options = { catalog: [{ id: 'claude', path: 'claude-test' }] };
  const withMcp = command({ ...base, mcpTools: ['flow-studio', 'elevenlabs'] }, 'oi', options);
  const args = withMcp.args || [];
  assert.ok(args.includes('mcp__flow-studio') && args.includes('mcp__elevenlabs'), 'libera os servidores pedidos');
  assert.ok(!(command(base, 'oi', options).args || []).some(a => String(a).startsWith('mcp__')), 'sem lista, nenhuma ferramenta MCP');
  assert.ok(!args.some(a => /^mcp__.*[;&| ]/.test(String(a))), 'nome simples');
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'acceptEdits', 'com MCP, o agente de leitura sai do modo de planejamento (que nega MCP)');
  assert.equal(args[args.indexOf('--disallowedTools') + 1], 'Edit,Write,NotebookEdit', 'mas continua sem editar arquivos');
  assert.equal((command(base, 'oi', options).args || [])[(command(base, 'oi', options).args || []).indexOf('--permission-mode') + 1], 'plan', 'sem MCP, segue em planejamento');
});

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access } from 'node:fs/promises';
test('criar_projeto aceita pasta_pai (caminho completo citado pela pessoa) e mostra o destino no cartão', () => {
  const w = world(), ok = normalizeAction({ acao: 'criar_projeto', nome: 'Achadinhos Novos', pasta_pai: 'C:/Trabalho' }, w);
  assert.equal(ok.valid, true); assert.equal(ok.payload.parent, 'C:/Trabalho'); assert.match(ok.summary, /subpasta nova dentro de C:\/Trabalho/);
  assert.equal(normalizeAction({ acao: 'criar_projeto', nome: 'X' }, w).payload.parent, undefined); assert.match(normalizeAction({ acao: 'criar_projeto', nome: 'X' }, w).summary, /Documentos\/CodeRoom\/Projetos/);
  assert.equal(normalizeAction({ acao: 'criar_projeto', nome: 'X', pasta_pai: 'relativa/pasta' }, w).valid, false);
});

test('HTTP: criar projeto dentro de uma pasta existente cria subpasta nova; pastas do sistema e inexistentes são recusadas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-newproj-')), pai = await mkdtemp(join(tmpdir(), 'cr-pai-')), port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: process.cwd(), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = readFileSync(join(dir, 'access.key'), 'utf8').trim(), post = b => fetch(`http://127.0.0.1:${port}/api/projects`, { method: 'POST', headers: { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const r = await post({ name: 'Meu Projeto Novo', path: pai, area: 'Vídeo', createSub: true }); assert.equal(r.status, 201); const pj = await r.json();
    assert.ok(pj.path.toLowerCase().startsWith(pai.toLowerCase()) && /Meu-Projeto-Novo$/.test(pj.path), pj.path); await access(pj.path);
    const r2 = await post({ name: 'Meu Projeto Novo', path: pai, createSub: true }); assert.equal(r2.status, 201); assert.match((await r2.json()).path, /Meu-Projeto-Novo-2$/, 'não reaproveita pasta existente');
    for (const bad of ['C:\\Windows', 'C:\\Program Files', 'C:\\']) { const rb = await post({ name: 'X', path: bad, createSub: true }); assert.equal(rb.status, 400, bad); assert.match((await rb.json()).error, /protegida/); }
    const rn = await post({ name: 'X', path: join(pai, 'nao-existe'), createSub: true }); assert.equal(rn.status, 400); assert.match((await rn.json()).error, /não existe/);
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); await rm(pai, { recursive: true, force: true }); }
});
