import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mdLite, assistantHtml } from '../public/assistant-ui.js';

test('markdown simples: escapa HTML da IA, aplica negrito, código e listas, sem links nem scripts', () => {
  const h = mdLite('Olá <script>alert(1)</script> **forte** e `cod`\n- um\n- dois\n\n```\n<b>x</b>\n```');
  assert.ok(!h.includes('<script>') && h.includes('&lt;script&gt;')); assert.ok(h.includes('<b>forte</b>') && h.includes('<code>cod</code>')); assert.match(h, /<ul><li>um<\/li><li>dois<\/li><\/ul>/); assert.ok(h.includes('<pre class="as-code">&lt;b&gt;x&lt;/b&gt;</pre>'));
  assert.ok(!/<a |onerror|href/.test(mdLite('[x](javascript:alert(1)) <img src=x onerror=alert(1)>')) || !/<img/.test(mdLite('<img src=x onerror=alert(1)>')));
});

const base = { manual: { available: true }, connected: ['claude', 'codex'], provider: 'claude', messages: [], briefed: true, stale: false, error: null, pending: null, briefing: null };
test('painel: cada estado mostra o certo (sem IA, sem apresentação, lendo, desatualizado, conversa, aguardando)', () => {
  assert.match(assistantHtml({ ...base, connected: [] }), /Nenhuma IA instalada/);
  assert.match(assistantHtml({ ...base, briefed: false }), /data-act="asst-brief"[^>]*>Apresentar o Code Room/); assert.match(assistantHtml({ ...base, briefed: false }), /não altera nada/);
  assert.match(assistantHtml({ ...base, briefing: { status: 'running' } }), /está lendo o manual/);
  { const h = assistantHtml({ ...base, stale: true }); assert.match(h, /O manual mudou[\s\S]*Apresentar de novo/); assert.match(h, /id="asst-log"/, 'manual novo não bloqueia a conversa'); assert.ok(!h.includes('asst-input'), 'a entrada fica na barra do chat, não aqui'); }
  assert.match(assistantHtml(base), /asst-suggest/); assert.match(assistantHtml({ ...base, pending: { status: 'running' } }), /Pensando…/);
  assert.match(assistantHtml({ ...base, manual: { available: false } }), /não foi encontrado/);
});

test('chat do Assistente: mostra e escapa quais fontes entraram no pedido', () => {
  const h = assistantHtml({ ...base, messages: [{ role: 'user', text: 'resuma isso', at: '2026-01-01T10:00:00Z', context: { project: '<script>', screen: true, obsidianNotes: 2 } }] });
  assert.match(h, /Contexto enviado: Projeto: &lt;script&gt; · tela aberta · 2 referências do Obsidian/);
  assert.doesNotMatch(h, /<script>/);
  assert.doesNotMatch(assistantHtml({ ...base, messages: [{ role: 'user', text: 'oi', at: '', context: { project: '', screen: false, obsidianNotes: 0 } }] }), /as-context/);
});

test('aviso do Modo Piloto: pode ser ocultado por botão acessível e reaparece apenas quando a preferência não foi salva', () => {
  const h = assistantHtml({ ...base, autonomy: 'pilot' });
  assert.match(h, /class="as-pilot-note"/);
  assert.match(h, /data-act="asst-pilot-note-dismiss" aria-label="Ocultar aviso do Modo Piloto"/);
  assert.doesNotMatch(assistantHtml({ ...base, autonomy: 'pilot', pilotNoticeDismissed: true }), /as-pilot-note/);
  assert.doesNotMatch(assistantHtml({ ...base, autonomy: 'ask' }), /as-pilot-note/);
});

test('chat do Assistente: resposta do piloto permite abrir os arquivos e o diff da execução', () => {
  const h = assistantHtml({ ...base, autonomy: 'pilot', messages: [{ role: 'assistant', text: 'Feito', at: '2026-01-01T10:00:00Z', taskId: 't1' }] });
  assert.match(h, /data-act="asst-task" data-id="t1" data-tab="arquivos">Ver arquivos e diff/);
});

test('cartões de ação: válida tem Criar e Descartar; inválida só explica; aplicada mostra o resultado', () => {
  const m = (a) => ({ ...base, messages: [{ id: 'm1', role: 'assistant', text: 'ok', at: '2026-01-01T10:00:00Z', actions: [a] }] });
  const ok = assistantHtml(m({ idx: 0, type: 'criar_equipe', valid: true, status: 'pending', summary: 'Criar a equipe “X”' }));
  assert.match(ok, /data-act="asst-apply" data-id="m1:0"[^>]*>Criar/); assert.match(ok, /asst-dismiss/);
  const bad = assistantHtml(m({ idx: 0, type: 'criar_equipe', valid: false, status: 'pending', summary: 'x', error: 'O agente “Y” não existe.' }));
  assert.ok(!bad.includes('asst-apply')); assert.match(bad, /não existe/);
  const done = assistantHtml(m({ idx: 0, type: 'criar_equipe', valid: true, status: 'applied', summary: 'x', result: 'Equipe criada.' }));
  assert.ok(!done.includes('asst-apply')); assert.match(done, /✔ Equipe criada/); assert.match(done, /Quer ajuda para conectar a equipe\?/); assert.match(done, /data-act="asst-team-help"/);
  assert.ok(!assistantHtml(m({ idx: 0, type: 'abrir_tela', valid: true, status: 'pending', summary: '<img src=x>' })).includes('<img src=x>'), 'resumo escapado');
});

import { whoIs, chatHeaderHtml, targetBodyHtml, bubbleHtml } from '../public/chat-ui.js';
import { composerBar } from '../public/views.js';
const cctx = (over = {}) => ({ ui: {}, prefs: {}, asstOk: true, project: 'p1', asst: { briefed: true, provider: 'claude', threads: [{ id: 't1', title: 'Conversa 1', active: true, count: 0 }], messages: [] },
  state: { agents: [{ id: 'a1', name: 'Diretor', role: 'Dirige', provider: 'claude' }], teams: [{ id: 't9', name: 'Doc', members: [{ role: 'desenvolvedor', agentId: 'a1' }] }], runs: [{ id: 'r1', status: 'completed', agent: { id: 'a1', name: 'Diretor' }, project: { id: 'p1', name: 'Canal' }, prompt: 'roteiro', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), deliverables: [] }] },
  agentStatus: () => ({ status: 'idle', label: 'Inativo' }), supervisorAgent: () => null, ...over });

test('janela do chat: interruptor Conversa/Piloto no cabeçalho do Assistente (aria, rótulo e destino do clique)', () => {
  assert.ok(!chatHeaderHtml(cctx()).includes('asst-autonomy'), 'com o menu fechado o cabeçalho fica limpo'); assert.match(chatHeaderHtml(cctx()), /data-act="cw-menu" aria-expanded="false"/);
  const off = chatHeaderHtml(cctx({ ui: { cwMenu: true } })); assert.match(off, /class="cw-mode" role="switch" aria-checked="false" data-act="asst-autonomy" data-id="pilot"/); assert.match(off, /<span>Conversa<\/span>/); assert.match(off, /Claude Code · conversa/);
  const c = cctx({ ui: { cwMenu: true } }); c.asst.autonomy = 'pilot'; const on = chatHeaderHtml(c); assert.match(on, /class="cw-mode on" role="switch" aria-checked="true" data-act="asst-autonomy" data-id="ask"/); assert.match(on, /<span>Piloto<\/span>/); assert.match(on, /· piloto/);
  c.asst.pending = { kind: 'ask' }; assert.match(chatHeaderHtml(c), /data-id="ask"[^>]*disabled/, 'trocar de modo espera a resposta em andamento');
  assert.ok(!chatHeaderHtml(cctx({ ui: { target: 'a:a1', cwMenu: true } })).includes('asst-autonomy'), 'só no Assistente');
});

test('janela do chat: cabeçalho muda com quem se fala (Assistente, agente, equipe) e mostra as conversas só no Assistente', () => {
  const menu = cctx({ ui: { cwMenu: true } });
  assert.equal(whoIs(cctx()).kind, 'assistant'); assert.match(chatHeaderHtml(cctx()), /Assistente[\s\S]*Claude Code · conversa/); assert.match(chatHeaderHtml(menu), /data-act="asst-new-thread"/); assert.match(chatHeaderHtml(cctx()), /data-act="chat-min"/);
  assert.ok(!chatHeaderHtml(cctx()).includes('asst-new-thread'), 'as conversas ficam dentro do menu ☰');
  const scoped = cctx(); scoped.asst.threads[0].projectName = 'Canal de vídeo'; assert.match(whoIs(scoped).sub, /Canal de vídeo/, 'o projeto da conversa ativa fica visível');
  const two = cctx({ ui: { cwMenu: true } }); two.asst.threads = [{ id: 't1', title: 'Equipe de vídeo', active: false, waiting: true }, { id: 't2', title: '<b>Código</b>', active: true }];
  const h = chatHeaderHtml(two); assert.match(h, /data-id="t2" aria-current="true"/); assert.match(h, /esperando resposta/); assert.match(h, /asst-thread-del" data-id="t2"/); assert.ok(!h.includes('<b>Código</b>'));
  assert.match(chatHeaderHtml({ ...two, ui: {} }), /cw-menu-btn[\s\S]*cw-wait/, 'conversa esperando resposta marca o botão do menu');
  const ag = chatHeaderHtml(cctx({ ui: { target: 'a:a1', cwMenu: true } })); assert.match(ag, /Diretor[\s\S]*missão direta/); assert.ok(!ag.includes('asst-new-thread'), 'conversas só no Assistente'); assert.ok(!ag.includes('cw-menu-btn'));
  assert.match(chatHeaderHtml(cctx({ ui: { target: 't:t9' } })), /Equipe Doc/); assert.equal(whoIs(cctx({ ui: { target: 'a:inexistente' } })).kind, 'none');
});

test('renomear conversa: lápis em cada conversa do menu; campo inline limita tamanho e escapa o título', () => {
  const two = cctx({ ui: { cwMenu: true } }); two.asst.threads = [{ id: 't1', title: 'Equipe de vídeo', active: false }, { id: 't2', title: '<b>Código</b>', active: true }];
  const html = chatHeaderHtml(two);
  assert.match(html, /asst-thread-rename" data-id="t2" aria-label="Renomear a conversa &lt;b&gt;Código&lt;\/b&gt;"/);
  assert.match(html, /asst-thread-rename" data-id="t1/);
  const editing = chatHeaderHtml(cctx({ ui: { renameId: 't2', cwMenu: true }, asst: { ...two.asst, threads: two.asst.threads } }));
  assert.match(editing, /<input class="cw-rename" data-rename="t2" value="&lt;b&gt;Código&lt;\/b&gt;" maxlength="40" aria-label="Nome da conversa">/);
  assert.doesNotMatch(editing, /asst-thread-rename" data-id="t2/);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /e\.key === 'Enter'.{0,120}saveRename\(e\.target, true\)/s);
  assert.match(app, /e\.key === 'Escape'.{0,160}saveRename\(e\.target, false\)/s);
  assert.match(app, /\.cw-dr-list li\.on \[data-act=asst-thread\]/, 'duplo clique só edita a conversa ativa');
});

test('clipe de missão individual: oferece modelo e esforço opcionais sem afetar equipes ou Assistente', () => {
  const missionCtx = { ...cctx({ ui: { target: 'a:a1', optsOpen: true }, models: { 'a:a1': [{ id: 'claude-sonnet-4-5', label: 'Sonnet' }] }, efforts: { 'a:a1': [{ id: 'high', label: 'alto' }] } }), state: { ...cctx().state, runtime: {}, projects: [{ id: 'p1', name: 'Canal' }] } };
  const html = composerBar(missionCtx);
  assert.match(html, /id="ov-model"[^>]*list="ov-models"/);
  assert.match(html, /<option value="claude-sonnet-4-5">Sonnet<\/option>/);
  assert.match(html, /id="ov-effort"/);
  assert.match(html, /<option value="high">alto<\/option>/);
  assert.match(html, /Vale só para esta missão/);
  const teamHtml = composerBar({ ...missionCtx, ui: { target: 't:t9', optsOpen: true } });
  assert.doesNotMatch(teamHtml, /ov-model|ov-effort/);
});

test('janela do chat: missão direta mostra a atividade do agente ou da equipe; sem agente, orienta; balão mostra aviso e atividade', () => {
  const b = targetBodyHtml(cctx({ ui: { target: 'a:a1' } })); assert.match(b, /Missão direta/); assert.match(b, /Diretor<\/b> concluiu/); assert.match(b, /data-act="task" data-id="r1"/);
  assert.match(targetBodyHtml(cctx({ ui: { target: 't:t9' } })), /a equipe deve fazer/); assert.match(targetBodyHtml(cctx({ ui: { target: 'a:zzz' } })), /Crie um agente/);
  assert.match(bubbleHtml(cctx(), { unread: true, busy: true }), /cb-dot[\s\S]*|cb-busy/); assert.ok(!bubbleHtml(cctx()).includes('cb-dot')); assert.match(bubbleHtml(cctx(), { busy: true }), /cb-busy/);
});

test('avisos do Assistente: cartões com "Me ajude" e "Dispensar", HTML escapado, balão com marca de aviso e comandos nas sugestões', () => {
  const a = { ...base, alerts: [{ id: 'fail:1', level: 'bad', title: '<b>Montador</b> falhou', text: 'sem login <img src=x>', ask: 'ajuda' }] };
  const h = assistantHtml(a); assert.ok(!h.includes('<b>Montador</b>') && !h.includes('<img src=x>')); assert.match(h, /as-alert bad/); assert.match(h, /data-act="asst-help" data-id="fail:1"/); assert.match(h, /data-act="asst-alert-dismiss" data-id="fail:1"/);
  assert.ok(!assistantHtml(base).includes('as-alerts')); assert.match(assistantHtml(base), /data-id="\/status"/); assert.match(assistantHtml(base), /data-id="\/pendencias"/);
  const ctx = cctx(); assert.match(bubbleHtml(ctx, { alert: true }), /cb-dot cb-alert/); assert.ok(!bubbleHtml(ctx, { alert: false }).includes('cb-alert')); assert.ok(!bubbleHtml(ctx, { unread: true, alert: true }).includes('cb-alert'), 'resposta nova tem prioridade sobre o aviso');
  assert.match(bubbleHtml(ctx), /class="mascot mc-feliz"/, 'o rosto é o mascote de LED, não o gato nem a logo');
});

import { mascot, moodOf, sayOf, MOODS } from '../public/mascot.js';
test('mascote: um rosto por humor, com nome acessível; o humor segue o estado (pensando > falha > aviso > novidade > dormindo > ok)', () => {
  for (const m of Object.keys(MOODS)) { const h = mascot(m, 40); assert.match(h, new RegExp(`class="mascot mc-${m}"`)); assert.match(h, /role="img" aria-label="Assistente: /); assert.match(h, /width="40"/); }
  assert.match(mascot('inexistente'), /mc-feliz/, 'humor desconhecido volta ao padrão');
  const a = { briefed: true, alerts: [], pending: null };
  assert.equal(moodOf(a), 'feliz'); assert.equal(moodOf({ ...a, briefed: false }), 'dormindo'); assert.equal(moodOf(a, { unread: true }), 'surpreso'); assert.equal(moodOf(null), 'feliz');
  assert.equal(moodOf({ ...a, alerts: [{ level: 'warn' }] }), 'alerta'); assert.equal(moodOf({ ...a, alerts: [{ level: 'warn' }, { level: 'bad' }] }), 'preocupado'); assert.equal(moodOf({ ...a, alerts: [{ level: 'info' }] }), 'feliz', 'aviso só informativo não muda o humor');
  assert.equal(moodOf({ ...a, pending: { status: 'running' }, alerts: [{ level: 'bad' }] }), 'pensando'); assert.equal(moodOf({ ...a, briefing: { status: 'running' } }), 'pensando');
  assert.equal(sayOf({ ...a, alerts: [{ level: 'bad', title: 'Montador não conseguiu terminar' }] }), 'Montador não conseguiu terminar'); assert.equal(sayOf(a, { unread: true }), 'Respondi! Toque para ver.'); assert.equal(sayOf(a), ''); assert.equal(sayOf({ ...a, pending: {} }, { unread: true }), '');
  assert.match(bubbleHtml(cctx(), { say: '<b>x</b>' }), /cb-say[^>]*>&lt;b&gt;x&lt;\/b&gt;/, 'a fala é escapada');
});
