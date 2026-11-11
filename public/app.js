import { viewRecipes, panelRecipe, panelRecipeRun, readRecipeForm, draftFrom } from './recipes.js';
import { renderPhotoOffice, MAX_STATIONS } from './photo-office.js';
import * as V from './views.js';
import * as W from './views2.js';
const ROUTINE_TEMPLATES = W.ROUTINE_TEMPLATES;
import { icon } from './icons.js';
import { canvasHtml, bindCanvas, canvasBusy } from './canvas.js';
import * as O from './onboarding.js';
import * as U from './updates-ui.js';
import { assistantHtml } from './assistant-ui.js';
import { chatHeaderHtml, targetBodyHtml, bubbleHtml } from './chat-ui.js';
import { screenContext } from './screen-context.js';
import { voiceSupport, stripForSpeech, speak, cancelSpeech, createDictation } from './voice.js';
import { approvalHtml, approvalItems, mediaKind } from './approval-cards.js';
import { liveTaskOf } from './live-ui.js';
import { cleanMini, addMini, miniShellHtml, miniBodyHtml, bubbleLiveHtml } from './minichat.js';
import { sayOf } from './mascot.js';
import { extractProject, projectToken } from './mentions.js';
// Os olhos do mascote acompanham o ponteiro (só com animações ligadas).
addEventListener('pointermove', e => { if (ctx.prefs?.anim === false) return; const r = document.documentElement.style; r.setProperty('--mx', ((e.clientX / innerWidth) * 2 - 1).toFixed(2)); r.setProperty('--my', ((e.clientY / innerHeight) * 2 - 1).toFixed(2)); }, { passive: true });
import { folderJobDialogHtml, noticesBarHtml, emptyJobForm, formFromJob, payloadFromJobForm } from './folderjobs-ui.js';
import { providerDialogHtml, emptyForm, formFromCatalog, formFromSpec, payloadFromForm } from './providers-ui.js';
import { LofiRadio, TRACKS } from './radio.js';

const $ = id => document.getElementById(id);
const { esc } = V;
const FOOTER_TIPS = [
  'Conecte o Obsidian para incluir notas autorizadas como contexto das tarefas.',
  'Equipes com papéis claros facilitam a revisão e a passagem de trabalho entre agentes.',
  'Deixe o modelo em branco para usar o padrão da conta ou escolha um modelo no agente.',
  'Revise arquivos e prévias antes de aprovar uma entrega ou publicar conteúdo.',
  'Conecte uma CLI já autenticada no computador e teste uma resposta antes de criar agentes.',
  'Use skills específicas para dar instruções reutilizáveis a cada agente.',
  'Para tarefas longas, divida o pedido em etapas que possam ser conferidas.',
];
let footerTipTimer = null, footerTipIndex = 0;
// A chave pode vir do endereço (#chave), da sessão ou do token deste aparelho (celular pareado). "#pair=CÓDIGO" é um pareamento, não uma chave.
const hashVal = decodeURIComponent(location.hash.slice(1)), pairFromHash = hashVal.startsWith('pair=') ? hashVal.slice(5).toUpperCase() : '';
const DEVICE_KEY = 'code-room-device', lsGet = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
let key = (!pairFromHash && hashVal) || sessionStorage.getItem('code-room-key') || lsGet(DEVICE_KEY) || '';
if (hashVal) history.replaceState(null, '', location.pathname + location.search); // não deixa chave nem código na barra de endereços
if (location.hash) history.replaceState(null, '', location.pathname);
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const ctx = {
  state: { recipes: [], recipeRuns: [], projects: [], agents: [], teams: [], runs: [], flows: [], plans: [], routines: [], limits: {}, connectors: [], runtime: {} },
  view: 'home', project: store.get('cr.project', ''), room: null, detail: null, execTab: 'resumo', skills: [], skillLibrary: null, audit: null, checks: null, modules: null, storage: null,
  projectContext: null, teamDraft: { id: null, name: 'Minha equipe', members: [] }, flows: {}, connection: 'connecting', maxStations: MAX_STATIONS,
  prefs: { motion: 'auto', list: false, board: true, musicHidden: false, ...store.get('cr.prefs', {}) },
  ui: { target: '', optsOpen: false, panel: null, panelId: null, whoOpen: false }, authed: false
};
const IDLE_MS = 10 * 60 * 1000, DONE_MS = 20 * 1000, FAIL_MS = 30 * 60 * 1000;
const dismissed = new Set(store.get('cr.dismissed', []));
let selectedAgent = null, officeHost = null, lastFocus = null;

// ---------- API ----------
async function api(path, body) {
  const r = await fetch('/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Code-Room-Key': key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => { throw new Error('Sem conexão com o Code Room (ele pode estar reiniciando). Nada foi aplicado; tente de novo em alguns segundos.'); });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401) logout('Chave inválida ou ausente.'); throw new Error(v.error || 'Não foi possível concluir.'); }
  return v;
}
function notify(msg, bad) { const n = $('notice'); n.textContent = msg; n.className = bad ? 'bad' : ''; n.hidden = false; clearTimeout(notify.t); notify.t = setTimeout(() => n.hidden = true, 9000); }
function logout(msg) { key = ''; ctx.authed = false; sessionStorage.removeItem('code-room-key'); try { localStorage.removeItem(DEVICE_KEY); } catch {} ctx.ui.loginError = msg || ''; $('shell').hidden = true; $('login').hidden = false; renderLogin(); }

// ---------- Derivações do estado real ----------
ctx.projectName = () => ctx.state.projects.find(p => p.id === ctx.project)?.name || '';
ctx.projectNameOf = id => ctx.state.projects.find(p => p.id === id)?.name || '';
ctx.rooms = () => { const ids = ctx.project ? ctx.projectAgentIds() : null; return [...new Set(ctx.state.agents.filter(a => !ids || ids.has(a.id)).map(a => a.room || 'Geral'))].sort(); };
ctx.supervisorAgent = () => { const a = ctx.state.agents.find(x => x.id === store.get('cr.sup.' + ctx.project, '')); return a && (!ctx.project || ctx.projectAgentIds().has(a.id)) ? a : null; };
// As 3 estações da cena mostram quem está mais "vivo": executando, decisão, aguardando, falha, concluído, disponível, inativo.
const PRIORITY = { running: 0, decision: 1, waiting: 2, queued: 2, failed: 3, done: 4, available: 5, idle: 6, disconnected: 7 };
ctx.viewMode = () => { const m = ctx.prefs.mode || (ctx.prefs.list ? 'term' : 'scene'); return m === 'list' ? 'term' : m; };   // a antiga “Lista” virou “Terminais”
// Equipes e agentes só entram no projeto por vínculo explícito ou por trabalho que já executaram nele.
ctx.projectTeamIdsFor = projectId => {
  const pj = ctx.state.projects.find(p => p.id === projectId); if (!pj) return new Set();
  // Projetos anteriores à associação explícita recuperam equipes pelo histórico
  // de fluxos. Uma lista explícita (inclusive vazia) sempre tem precedência.
  const ids = Array.isArray(pj.teamIds) ? pj.teamIds : ctx.state.flows.filter(f => f.projectId === projectId && f.teamId).map(f => f.teamId);
  return new Set(ids.filter(id => ctx.state.teams.some(t => t.id === id)));
};
ctx.projectTeamIds = () => ctx.projectTeamIdsFor(ctx.project);
ctx.projectAgentIdsFor = projectId => {
  const pj = ctx.state.projects.find(p => p.id === projectId); if (!pj) return new Set();
  const teamIds = ctx.projectTeamIdsFor(projectId), ids = new Set(pj.agentIds || []);
  for (const team of ctx.state.teams) if (teamIds.has(team.id)) for (const m of team.members || []) ids.add(m.agentId);
  const hidden = new Set(pj.hiddenAgentIds || []);   // quem só está aqui por já ter trabalhado no projeto pode ser escondido
  for (const t of ctx.state.runs) if (t.project?.id === pj.id && t.agent?.id && !hidden.has(t.agent.id)) ids.add(t.agent.id);
  return new Set(ctx.state.agents.filter(a => ids.has(a.id)).map(a => a.id));
};
ctx.projectAgentIds = () => ctx.projectAgentIdsFor(ctx.project);
// Um projeto aberto limita a Sala. Sem projeto selecionado, a pessoa pode ver o workspace inteiro.
ctx.roomMode = () => ctx.room ?? (ctx.project ? '@projeto' : '');
ctx.inRoom = a => { if (ctx.project && !ctx.projectAgentIds().has(a.id)) return false; const m = ctx.roomMode(); return m === '@projeto' || !m || (a.room || 'Geral') === m; };
ctx.roomAgents = () => {
  const sup = ctx.supervisorAgent();
  return ctx.state.agents.filter(a => a.id !== sup?.id && ctx.inRoom(a))
    .map(a => ({ a, p: PRIORITY[ctx.agentStatus(a).status] ?? 9 })).sort((x, y) => x.p - y.p || x.a.name.localeCompare(y.a.name)).map(x => x.a);
};
// Modo “Terminais” da Sala: últimas linhas da tarefa mais recente de cada agente (nunca de outro projeto). Só busca o que está na tela e o que mudou.
ctx.term = {}; const termBusy = new Set();
ctx.termTask = a => ctx.state.runs.find(t => t.agent.id === a.id && (!ctx.project || t.project.id === ctx.project)) || null;
function loadTerms() {
  const inCanvas = ctx.viewMode() === 'canvas' && ctx.prefs.cvTerm;
  if (ctx.view !== 'room' || !(ctx.viewMode() === 'term' || inCanvas)) return;
  const shown = new Set();
  for (const a of (inCanvas ? ctx.state.agents.filter(x => ctx.inRoom(x)).slice(0, 16) : ctx.roomAgents().slice(0, V.TERM_MAX))) {
    const t = ctx.termTask(a); if (!t) continue; shown.add(t.id);
    const c = ctx.term[t.id], live = ['running', 'cancelling'].includes(t.status), stamp = t.status + '|' + t.updatedAt;
    if (termBusy.has(t.id) || (c && c.stamp === stamp && (!live || Date.now() - c.at < 2500))) continue;
    termBusy.add(t.id);
    api('tasks/' + t.id + '/tail').then(tail => {
      ctx.term[t.id] = { stamp, at: Date.now(), html: V.termLinesHtml(tail) };
      document.querySelectorAll('.term-out[data-task="' + t.id + '"]').forEach(el => { const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 40; el.innerHTML = ctx.term[t.id].html; if (stick) el.scrollTop = el.scrollHeight; });
    }).catch(() => {}).finally(() => termBusy.delete(t.id));
  }
  for (const id of Object.keys(ctx.term)) if (!shown.has(id)) delete ctx.term[id];
}
ctx.agentStatus = agent => {
  const label = k => V.AGENT_STATUS[k];
  const c = ctx.state.connectors.find(x => x.id === agent.provider), chk = ctx.checks?.find(x => x.id === agent.provider);
  if (c && !c.available || chk && (!chk.installed || chk.authenticated === false)) return { status: 'disconnected', label: label('disconnected') + (chk?.authenticated === false ? ' (sem login)' : ' (CLI ausente)') };
  // Um mesmo agente pode estar ligado a mais de um projeto: o estado ocupado é global,
  // mas nunca mostramos aqui o prompt ou a tarefa que pertence a outro projeto.
  const all = ctx.state.runs.filter(t => t.agent.id === agent.id), mine = all.filter(t => !ctx.project || t.project.id === ctx.project);
  const by = st => mine.find(t => st.includes(t.status));
  let t;
  if ((t = all.find(x => ['running', 'cancelling'].includes(x.status)))) {
    const own = mine.find(x => x.id === t.id); return { status: 'running', label: own ? label('running') : 'Ocupado em outro projeto', task: own || null };
  }
  const proposed = ctx.state.plans.find(p => p.status === 'proposed' && (!ctx.project || p.projectId === ctx.project));
  if (proposed && agent.id === ctx.supervisorAgent()?.id) return { status: 'decision', label: label('decision') + ' (plano proposto)', task: null };
  if ((t = by(['needs_decision']))) return { status: 'decision', label: label('decision'), task: t };
  if ((t = by(['waiting_dependency']))) return { status: 'waiting', label: label('waiting'), task: t };
  if ((t = by(['queued']))) return { status: 'queued', label: label('queued'), task: t };
  const last = mine[0], age = last ? Date.now() - Date.parse(last.updatedAt) : Infinity;
  if (last && ['failed', 'interrupted', 'blocked'].includes(last.status) && age < FAIL_MS && !dismissed.has(last.id)) return { status: 'failed', label: V.STATUS[last.status], task: last };
  if (last?.status === 'completed' && age < DONE_MS) return { status: 'done', label: label('done'), task: last };
  return age > IDLE_MS ? { status: 'idle', label: label('idle') + ' (sem atividade recente)', task: last } : { status: 'available', label: label('available'), task: last };
};
ctx.usageTotals = runs => {
  const u = { input: 0, output: 0, cost: 0, inCount: 0, outCount: 0, costCount: 0 };
  for (const r of runs) { if (r.usage?.input != null) { u.input += r.usage.input; u.inCount++; } if (r.usage?.output != null) { u.output += r.usage.output; u.outCount++; } if (r.usage?.cost != null) { u.cost += r.usage.cost; u.costCount++; } }
  return u;
};
ctx.currentMission = () => {
  const t = ctx.state.runs.find(x => (!ctx.project || x.project.id === ctx.project) && x.kind === 'work');
  if (!t) return null;
  if (t.flowId) { const f = ctx.flows[t.flowId]; if (!f) { loadFlow(t.flowId); return { kind: 'task', task: t, title: t.prompt.slice(0, 80) }; } return { kind: 'flow', title: f.objective.slice(0, 80), steps: f.steps.map(s => ({ id: s.taskId, agent: s.agent, status: s.status })), verdict: f.review?.verdict }; }
  const byId = new Map(ctx.state.runs.filter(x => x.project?.id === t.project?.id).map(x => [x.id, x])), chain = [], seen = new Set(); let current = t;
  while (current && chain.length < 8 && !seen.has(current.id)) { chain.unshift(current); seen.add(current.id); current = current.linkFrom ? byId.get(current.linkFrom) : null; }
  return { kind: 'task', task: t, title: t.prompt.slice(0, 80), handoffs: chain };
};
ctx.flowPosition = d => { const f = d.flowId && ctx.flows[d.flowId]; if (!f) return null; const i = f.steps.findIndex(s => s.taskId === d.id); return i < 0 ? null : { i: i + 1, n: f.steps.length }; };
async function loadFlow(id) { if (ctx.flows['_' + id]) return; ctx.flows['_' + id] = 1; try { ctx.flows[id] = await api('flows/' + id); } catch {} delete ctx.flows['_' + id]; render(); }

// ---------- Tema, fonte e movimento ----------
function applyPrefs() {
  const r = document.documentElement, p = ctx.prefs;
  if (p.theme && p.theme !== 'noite') r.dataset.theme = p.theme; else delete r.dataset.theme;
  if (p.font && p.font !== 'medium') r.dataset.font = p.font; else delete r.dataset.font;
  const sys = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = p.reduce || p.anim === false || (p.anim === undefined && sys);
  r.dataset.motion = off ? 'off' : 'on'; r.classList.toggle('tab-hidden', document.hidden);
}
const savePrefs = () => { store.set('cr.prefs', ctx.prefs); applyPrefs(); };
ctx.voice = voiceSupport(window);
let dictation = null;

// ---------- Dados e tempo real ----------
let refreshTimer = null;
const scheduleRefresh = (ms = 350) => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, ms); };
async function refresh() {
  try {
    ctx.state = await api('state'); syncProviderNames();
    checkDesktopNotify();
    if (!ctx.state.projects.some(p => p.id === ctx.project) && !(ctx.project === '' && store.get('cr.general', '') === '1' && ctx.state.projects.length)) setProject(ctx.state.projects[0]?.id || '', true);
    for (const f of Object.values(ctx.flows)) if (f?.id) api('flows/' + f.id).then(v => { ctx.flows[f.id] = v; render(); }).catch(() => {});
    if (ctx.detail) ctx.detail = await api('tasks/' + ctx.detail.id).catch(() => ctx.detail);
    await refreshLive();
    render();
  } catch { setConnection('lost'); }
}
// Sessão ao vivo: com o chat aberto em um agente, acompanha a tarefa dele (a que roda agora, ou a última).
async function refreshLive() {
  const tg = ctx.ui.asstOpen ? String(V.targetOf(ctx) || '') : '';
  if (!tg.startsWith('a:')) ctx.live = null;
  else { const t = liveTaskOf(ctx.state?.runs, tg.slice(2)); ctx.live = t ? await api('tasks/' + t.id).catch(() => ctx.live?.id === t.id ? ctx.live : null) : null; }
  // janelas de chat extras (uma tarefa ao vivo por agente aberto)
  ctx.ui.mini = cleanMini(ctx.ui.mini ?? store.get('cr.mini', []), ctx.state?.agents); ctx.liveMini = ctx.liveMini || {};
  await Promise.all(ctx.ui.mini.map(async id => { const t = liveTaskOf(ctx.state?.runs, id); if (!t) { delete ctx.liveMini[id]; return; } ctx.liveMini[id] = await api('tasks/' + t.id).catch(() => ctx.liveMini[id] || null); }));
  for (const id of Object.keys(ctx.liveMini)) if (!ctx.ui.mini.includes(id)) delete ctx.liveMini[id];
  if (ctx.ui.bubble) { const t = liveTaskOf(ctx.state?.runs, ctx.ui.bubble); ctx.liveBubble = t ? await api('tasks/' + t.id).catch(() => ctx.liveBubble || null) : null; } else ctx.liveBubble = null;
}
// Desenha as janelas extras: cria a casca uma vez e só troca o corpo e o estado (não mexe no que está sendo digitado).
function renderMinis() {
  const root = $('mini-chats'); if (!root) return;
  const agents = ctx.authed && ctx.state ? ctx.state.agents : [], ids = ctx.authed ? cleanMini(ctx.ui.mini ?? store.get('cr.mini', []), agents) : [];
  ctx.ui.mini = ids; root.classList.toggle('shift', !!ctx.ui.asstOpen);
  for (const sec of [...root.children]) if (!ids.includes(sec.dataset.mini)) sec.remove();
  for (const id of ids) {
    const ag = agents.find(x => x.id === id); let sec = [...root.children].find(s => s.dataset.mini === id);
    if (!sec) { sec = document.createElement('section'); sec.className = 'mini'; sec.dataset.mini = id; sec.setAttribute('role', 'region'); sec.setAttribute('aria-label', 'Chat com ' + ag.name); sec.innerHTML = miniShellHtml(ctx, ag); root.prepend(sec); }
    const st = sec.querySelector('[data-mini-status]'), label = ctx.agentStatus(ag).label; if (st.textContent !== label) st.textContent = label;
    const body = sec.querySelector('[data-mini-body]'), html = miniBodyHtml(ctx.liveMini?.[id] || null);
    if (sec._html !== html) { const atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 60 || sec._html == null; body.innerHTML = html; sec._html = html; const lg = body.querySelector('.live-log'); if (lg) lg.scrollTop = lg.scrollHeight; if (atEnd) body.scrollTop = body.scrollHeight; }
  }
}
function openMini(id) {
  if (!ctx.state.agents.some(x => x.id === id)) return; closeAgentMenu(); closeDrawer();
  if (innerWidth <= 760) { ctx.ui.target = 'a:' + id; setChatOpen(true); return; }   // no celular só cabe uma janela: usa o chat principal
  ctx.ui.mini = addMini(ctx.ui.mini ?? store.get('cr.mini', []), id); store.set('cr.mini', ctx.ui.mini);
  refreshLive().then(renderMinis); renderMinis(); setTimeout(() => document.getElementById('mini-t-' + id)?.focus(), 60);
}
function closeMini(id) { ctx.ui.mini = (ctx.ui.mini || []).filter(x => x !== id); store.set('cr.mini', ctx.ui.mini); delete ctx.liveMini?.[id]; renderMinis(); }
function setConnection(s) { ctx.connection = s; if (ctx.authed) render(); }
let lastSeq = 0;
async function stream() {
  let wait = 1000;
  for (;;) {
    if (!key) { await new Promise(r => setTimeout(r, 1500)); continue; }
    try {
      const r = await fetch('/api/stream', { headers: { 'X-Code-Room-Key': key, ...(lastSeq ? { 'Last-Event-ID': String(lastSeq) } : {}) } });
      if (r.status === 401) { logout('Chave inválida.'); continue; }
      if (!r.ok) throw new Error('stream');
      setConnection('live'); wait = 1000; refresh();
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); handleSse(block); }
      }
    } catch {}
    setConnection('lost'); await new Promise(r => setTimeout(r, wait)); wait = Math.min(wait * 2, 10000);
  }
}
function handleSse(block) {
  const id = block.match(/^id: (\d+)/m)?.[1]; if (id) lastSeq = Math.max(lastSeq, Number(id));
  if (!/^event: change/m.test(block)) return;
  const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] || '{}');
  scheduleRefresh(); if (ctx.detail && data.taskId === ctx.detail.id) scheduleRefresh(150);
}

// ---------- Renderização ----------
const VIEWS = { home: V.viewHome, room: V.viewRoom, tasks: V.viewTasks, exec: V.viewExecution, projects: V.viewProjects, teams: W.viewTeams, recipes: viewRecipes, agents: W.viewAgents, deliveries: W.viewDeliveries, skills: W.viewSkills, usage: W.viewUsage, routines: W.viewRoutines, connections: W.viewConnections, settings: W.viewSettings };
const TITLES = { home: 'Início', room: 'Sala de agentes', tasks: 'Tarefas', exec: 'Execução', projects: 'Projetos', teams: 'Equipes', recipes: 'Receitas', agents: 'Agentes e ferramentas', deliveries: 'Entregas', skills: 'Skills', usage: 'Consumo e limites', routines: 'Rotinas', connections: 'Conexões', settings: 'Configurações' };
function snapshotForm() {
  const out = {}, a = document.activeElement;
  document.querySelectorAll('#view [id], #view [name], #composer-root [id], #panel [name], #panel [id]').forEach(el => { if (!('value' in el)) return; const k = el.id || (el.form?.id || '') + ':' + el.name; out[k] = el.type === 'checkbox' ? el.checked : el.value; });
  return { out, focus: a?.id || (a?.name ? (a.form?.id || '') + ':' + a.name : null), sel: a?.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null };
}
function restoreForm(snap) {
  document.querySelectorAll('#view [id], #view [name], #composer-root [id], #panel [name], #panel [id]').forEach(el => { const k = el.id || (el.form?.id || '') + ':' + el.name; if (!(k in snap.out) || !('value' in el)) return; if (el.type === 'file' || el.type === 'range') return; if (el.type === 'checkbox') el.checked = snap.out[k]; else if (el.tagName === 'SELECT') { if ([...el.options].some(o => o.value === snap.out[k]) && !el.dataset.field) el.value = snap.out[k]; } else el.value = snap.out[k]; });
  if (snap.focus) { const el = document.getElementById(snap.focus) || document.querySelector(`[name="${snap.focus.split(':')[1]}"]`); if (el && el !== document.activeElement) { el.focus(); if (snap.sel && el.setSelectionRange) try { el.setSelectionRange(...snap.sel); } catch {} } }
}
function renderLogin() { $('login').innerHTML = V.viewLogin(ctx); }
let renderQueued = false;
document.addEventListener('pause', e => { if (renderQueued && e.target.matches?.('.ep-media video')) { renderQueued = false; render(); } }, true);
async function linkAgents(from, to, maxHops = 3, when = 'always') { try { await api('links', { projectId: ctx.project, from, to, maxHops, when }); notify('Ligação criada: quando o primeiro terminar, o segundo continua.'); await refresh(); } catch (e) { notify(e.message, true); } }
async function unlinkAgents(id) { if (!confirm('Remover esta ligação entre agentes?')) return; try { await api(`links/${id}/delete`, {}); await refresh(); } catch (e) { notify(e.message, true); } }
function render() {
  if (!ctx.authed) return;
  if (canvasBusy() || [...document.querySelectorAll('.ep-media video')].some(v => !v.paused && !v.ended)) { renderQueued = true; return; }   // não interrompe arrastar nem vídeo tocando   // não redesenha no meio de um arrastar
  const snap = snapshotForm();
  $('topbar').innerHTML = V.topbarHtml(ctx); const pb = V.pendingBadges(ctx); $('rail').innerHTML = V.railHtml(ctx.view, pb); document.title = (pb.room ? `(${pb.room}) ` : '') + 'Code Room';
  $('view').setAttribute('aria-label', TITLES[ctx.view]);
  $('view').innerHTML = VIEWS[ctx.view](ctx);
  $('composer-root').innerHTML = V.composerBar(ctx);
  setTimeout(updatePop, 0);
  const panel = $('panel');
  const content = ctx.ui.panel === 'new-project' ? V.panelNewProject(ctx) : ctx.ui.panel === 'context' ? V.panelContext(ctx) : ctx.ui.panel === 'routine' ? W.panelRoutine(ctx) : ctx.ui.panel === 'recipe' ? panelRecipe(ctx) : ctx.ui.panel === 'recipe-run' ? panelRecipeRun(ctx) : '';
  panel.hidden = !content; if (content) panel.innerHTML = content;
  $('shell').classList.toggle('panel-open', !!content);
  restoreForm(snap);
  if (ctx.view === 'room' && ctx.viewMode() === 'canvas') { const slot = $('canvas-slot'); if (slot) { slot.innerHTML = canvasHtml(ctx); bindCanvas(slot, ctx, { onOpen: openAgentMenu, onLink: linkAgents, onUnlink: unlinkAgents, onEnd: () => { if (renderQueued) { renderQueued = false; render(); } } }); } }
  if (ctx.view === 'room' && (ctx.viewMode() === 'term' || (ctx.viewMode() === 'canvas' && ctx.prefs.cvTerm))) { document.querySelectorAll('.term-out').forEach(el => { el.scrollTop = el.scrollHeight; }); loadTerms(); }
  if (ctx.view === 'room' && ctx.viewMode() === 'scene') { const slot = $('office'); if (slot) { officeHost ||= document.createElement('div'); officeHost.id = 'office'; officeHost.className = 'office-host'; slot.replaceWith(officeHost); drawOffice(); } }
  document.querySelectorAll('.barchart i[data-h]').forEach(i => i.style.height = i.dataset.h + '%');
  const rt = ctx.state.runtime; $('runtime-foot').textContent = rt.version ? `v${rt.version} · serviço ${rt.memoryMB} MB${rt.paused ? ' · novas tarefas pausadas' : ''}` : '';
  $('runtime-foot').title = 'Fechar esta janela não encerra o serviço: os agentes continuam trabalhando. Para encerrar, use "Fechar o Code Room" no menu Iniciar.';
  const tip = $('footer-tip'); if (tip && !footerTipTimer) { tip.textContent = FOOTER_TIPS[footerTipIndex]; footerTipTimer = setInterval(() => { footerTipIndex = (footerTipIndex + 1) % FOOTER_TIPS.length; const el = $('footer-tip'); if (el) el.textContent = FOOTER_TIPS[footerTipIndex]; }, 12000); }
  tickClocks();
  if (selectedAgent) { const a = ctx.state.agents.find(x => x.id === selectedAgent); if (a) $('drawer').innerHTML = V.drawer(ctx, a); }
  $('onb-root').innerHTML = O.onboardingHtml(ctx); O.applyTourHighlight(document, ctx);
  $('update-bar').innerHTML = U.updateBarHtml(ctx) + noticesBarHtml(ctx); if (ctx.ui.updOpen) $('update-body').innerHTML = U.updateDialogHtml(ctx);
  applyPrefs(); renderAsst(); renderMinis(); renderBubble();
}
function drawOffice() {
  const model = a => { const s = ctx.agentStatus(a); return { agent: a, status: s.status === 'queued' ? 'waiting' : s.status, label: `${a.name}, ${a.role}. ${s.label}${s.task ? '. Tarefa: ' + s.task.prompt.slice(0, 60) : ''}` }; };
  const sup = ctx.supervisorAgent();
  renderPhotoOffice(officeHost, { stations: ctx.roomAgents().slice(0, ctx.maxStations).map(model), supervisor: sup ? model(sup) : null, onSelect: openAgentMenu });
}
const tickClocks = () => document.querySelectorAll('.clock[data-since]').forEach(el => el.textContent = V.dur(Date.now() - Date.parse(el.dataset.since)));

// ---------- Rádio da Sala ----------
let radio = null;
let radioArtTimer = null;
let radioControlsExpanded = false;
let radioHover = false;
const radioArtFailed = new Set();
function setRadioArtwork(mode) {
  const img = $('radio-fab')?.querySelector('.rp-img'); if (!img) return;
  const reduced = document.documentElement.dataset.motion !== 'on' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const key = reduced ? 'idle' : mode, attr = ({ idle: 'idleSrc', playing: 'playingSrc', volume: 'volumeSrc', next: 'nextSrc' })[key] || 'idleSrc';
  if (key !== 'idle' && radioArtFailed.has(key)) { img.dataset.art = 'idle'; img.onerror = null; img.src = img.dataset.idleSrc; return; }
  if (img.dataset.art === key) return;
  img.onerror = null; img.dataset.art = key;
  if (key !== 'idle') img.onerror = () => {
    if (img.dataset.art !== key) return;
    radioArtFailed.add(key); img.onerror = null; img.dataset.art = 'idle'; img.src = img.dataset.idleSrc;
  };
  img.src = img.dataset[attr] || img.dataset.idleSrc;
}
function flashRadioArtwork(mode) {
  clearTimeout(radioArtTimer); setRadioArtwork(mode);
  radioArtTimer = setTimeout(() => { radioArtTimer = null; updateRadioUi(); }, 1800);
}
// O radinho é o botão: clicar liga (sobem notinhas), clicar de novo desliga. Enquanto toca, aparece uma barrinha de volume ao lado dele.
function updateRadioUi() {
  const on = !!radio?.playing, w = $('radio-ctl'), f = $('radio-fab'), v = $('radio-vol'), toggle = $('radio-volume-toggle'); if (!f) return;
  const hoverOpen = on && radioHover;
  w.classList.toggle('on', on); w.classList.toggle('expanded', on && radioControlsExpanded); f.setAttribute('aria-pressed', String(on)); $('radio-bar').hidden = !on;
  toggle.hidden = !on; toggle.setAttribute('aria-expanded', String(on && (radioControlsExpanded || hoverOpen))); toggle.setAttribute('aria-label', on && (radioControlsExpanded || hoverOpen) ? 'Recolher controles de volume' : 'Mostrar controles de volume'); toggle.title = toggle.getAttribute('aria-label');
  if (!radioArtTimer) setRadioArtwork(on ? 'playing' : 'idle');
  const faixa = $('radio-track').textContent;
  f.setAttribute('aria-label', on ? 'Parar a rádio lo-fi' : 'Ligar a rádio lo-fi'); f.title = on ? `Rádio Lo-Fi tocando${faixa ? ' (' + faixa + ')' : ''}. Clique para parar.` : 'Rádio Lo-Fi: clique para ligar (lo-fi original gerado no seu navegador, sem internet)';
  if (!on) $('radio-track').textContent = ''; if (on) v.value = Math.round((radio.vol ?? 0.7) * 100);
}
$('radio-vol')?.addEventListener('pointerdown', () => flashRadioArtwork('volume'));
$('radio-vol')?.addEventListener('input', e => { const x = Number(e.target.value) / 100; radio?.setVolume(x); store.set('cr.radio', { ...store.get('cr.radio', {}), volume: x }); flashRadioArtwork('volume'); });
$('radio-ctl')?.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && matchMedia('(hover:hover) and (pointer:fine)').matches) { radioHover = true; updateRadioUi(); } });
$('radio-ctl')?.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { radioHover = false; updateRadioUi(); } });
document.addEventListener('visibilitychange', () => { if (!radio) return; if (document.hidden && ctx.prefs.musicHidden) radio.pause(); else if (!document.hidden) radio.resume(); });

// ---------- Atualização ----------
// ---------- Pastas de entrada (lotes) ----------
function readFjForm() { const f = $('fj-form'); if (!f) return; const d = Object.fromEntries(new FormData(f)); ctx.ui.fjForm = { ...(ctx.ui.fjForm || emptyJobForm(ctx.project)), name: d.name || '', projectId: d.projectId || '', dir: d.dir || '', exts: d.exts || '', who: d.who || '', instruction: d.instruction || '', outputNote: d.outputNote || '', parallel: d.parallel || 1 }; }
function renderFj() { if ($('fj-dialog').open || true) $('fj-body').innerHTML = folderJobDialogHtml(ctx); }
// ---------- Outras IAs (conectadas pela pessoa) ----------
function syncProviderNames() { for (const c of ctx.state.connectors || []) if (c.custom) { V.PROVIDER[c.id] = c.name; PROVIDER_NAMES[c.id] = c.name; } }
const approvedMsg = r => approvedBase(r) + (r?.proposal ? ' Sugeri uma decisão para o contexto do projeto (Projetos › Contexto).' : '');
const approvedBase = r => r?.gitCommit ? `Entrega aprovada e commit ${r.gitCommit} criado (local). Nada foi publicado.` : r?.gitError ? `Entrega aprovada, mas o commit não foi criado: ${r.gitError}` : r?.obsidian ? `Entrega aprovada. Nota nova no Obsidian: ${r.obsidian}. Nada foi publicado.` : r?.obsidianError ? `Entrega aprovada, mas a nota do Obsidian não foi criada: ${r.obsidianError}` : 'Entrega aprovada. Nada foi publicado.';
async function loadObsidian() { try { ctx.obsidian = await api('obsidian'); } catch { ctx.obsidian = null; } if (ctx.view === 'connections' || ctx.view === 'deliveries') render(); }
async function loadAudit() { try { ctx.audit = await api('audit'); } catch { ctx.audit = { entries: [] }; } if (ctx.view === 'settings') render(); }
async function loadSocial() { try { ctx.social = await api('social'); } catch { ctx.social = null; } if (ctx.view === 'connections' || ctx.ui.asstOpen) render(); }
async function loadEconomy() { try { ctx.economy = await api('economy'); } catch { ctx.economy = null; } if (ctx.view === 'usage') render(); }
async function loadOutbound() { try { ctx.outbound = await api('outbound'); } catch { ctx.outbound = null; } if (ctx.view === 'connections') render(); }
async function loadSync() { try { ctx.sync = await api('sync-ias'); } catch { ctx.sync = null; } if (ctx.view === 'connections') render(); }
async function loadApis() { try { ctx.apis = await api('apis'); } catch { ctx.apis = null; } if (ctx.view === 'connections') render(); }
async function loadHermes() { try { ctx.hermes = await api('hermes'); } catch { ctx.hermes = null; } if (ctx.view === 'connections') render(); }
async function loadProviders() { try { ctx.providers = await api('providers'); } catch { ctx.providers = { catalog: [], custom: [], max: 10 }; } if (ctx.view === 'connections') render(); renderProv(); }
function readProvForm() { const f = $('prov-form'); if (!f) return; const d = Object.fromEntries(new FormData(f)); ctx.ui.provForm = { ...(ctx.ui.provForm || emptyForm()), name: d.name || '', exe: d.exe || '', promptVia: d.promptVia || 'arg', argsText: d.argsText || '', modelFlag: d.modelFlag || '' }; }
function renderProv() { const d = $('prov-dialog'); if (!d.open) return; $('prov-body').innerHTML = providerDialogHtml(ctx); }
async function testProv(payload, key) {
  ctx.ui.provTest = { ...(ctx.ui.provTest || {}), [key]: { running: true } }; render(); renderProv();
  try { ctx.ui.provTest[key] = await api('providers/test', payload); } catch (e) { ctx.ui.provTest[key] = { ok: false, error: e.message }; }
  render(); renderProv();
}
// ---------- Avisos do sistema (opcional): só quando a aba está em segundo plano ----------
const seenNotify = new Set(store.get('cr.notified', []));
function desktopNotify(id, title, body) {
  if (!ctx.prefs?.desktopNotify || typeof Notification === 'undefined' || Notification.permission !== 'granted' || seenNotify.has(id)) return;
  seenNotify.add(id); store.set('cr.notified', [...seenNotify].slice(-100)); if (!document.hidden) return;
  try { const n = new Notification(title, { body, tag: id, icon: '/assets/favicon.png' }); n.onclick = () => { focus(); n.close(); }; } catch {}
}
function checkDesktopNotify() {
  for (const n of ctx.state?.notices || []) desktopNotify('n:' + n.id, n.title, n.text);
  for (const a of ctx.asst?.alerts || []) if (a.level === 'bad') desktopNotify('a:' + a.id, 'Code Room: ' + a.title, a.text);
  const last = (ctx.asst?.messages || []).filter(m => m.role === 'assistant').at(-1); if (last && ctx.asst?.pending == null) desktopNotify('m:' + last.id, 'Code Room: o Assistente respondeu', String(last.text || '').slice(0, 120));
}
// ---------- Chat único (estilo mensageiro): janela flutuante com o Assistente e as missões diretas; balão quando minimizado ----------
let asstTimer = null;
if (ctx.ui.asstOpen === undefined) ctx.ui.asstOpen = store.get('cr.chat', {}).open ?? false;
function setChatOpen(v) {
  ctx.ui.asstOpen = !!v; store.set('cr.chat', { open: !!v }); renderAsst(); renderMinis();
  if (v) { loadAsst(); setTimeout(() => $('mission')?.focus({ preventScroll: true }), 80); }
}
function renderAsst() {
  const win = $('chat'), bubble = $('chat-bubble'); if (!win) return;
  if (!ctx.authed) { win.hidden = true; bubble.hidden = true; return; }
  ctx.ui.sent ??= store.get('cr.sent', {});
  const open = !!ctx.ui.asstOpen, nA = (ctx.asst?.messages || []).filter(m => m.role === 'assistant').length;
  if (open || ctx.ui.chatSeen == null) ctx.ui.chatSeen = nA;
  win.hidden = !open; bubble.hidden = open; document.querySelector('.asst-btn')?.setAttribute('aria-pressed', String(open));
  const unread = !open && nA > ctx.ui.chatSeen, busy = !!(ctx.asst?.pending || ctx.asst?.briefing), bh = bubbleHtml(ctx, { unread, busy, alert: !open && (ctx.asst?.alerts || []).some(x => x.level !== 'info'), say: open ? '' : sayOf(ctx.asst, { unread }) });
  if (ctx.ui._bh !== bh) { bubble.innerHTML = bh; ctx.ui._bh = bh; } bubble.setAttribute('aria-label', unread ? 'Abrir o chat: resposta nova' : 'Abrir o chat');
  if (!open) { ctx.ui._liveFor = null; return; }
  const tgNow = String(V.targetOf(ctx) || '');
  if (ctx.ui._liveFor !== tgNow) { ctx.ui._liveFor = tgNow; ctx.live = null; refreshLive().then(renderAsst); }   // trocou de agente: busca a tarefa dele
  const who = V.targetOf(ctx), head = chatHeaderHtml(ctx), body = who === 'assistant' ? approvalHtml(ctx) + assistantHtml({ ...ctx.asst, pilotNoticeDismissed: store.get('cr.pilot-note-dismissed', false) }) : targetBodyHtml(ctx);
  if (ctx.ui._ch !== head) { $('chat-head').innerHTML = head; ctx.ui._ch = head; }
  if (ctx.ui._cb !== body) {
    const log = $('asst-log'), atEnd = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 60, n = ctx.asst?.messages?.length || 0, keep = $('asst').scrollTop;
    $('asst').innerHTML = body; ctx.ui._cb = body; const nl = $('asst-log');
    if (nl && (atEnd || n !== ctx.ui.asstCount || ctx.ui.asstThread !== ctx.asst?.thread)) nl.scrollTop = nl.scrollHeight; else $('asst').scrollTop = keep;
    ctx.ui.asstCount = n; ctx.ui.asstThread = ctx.asst?.thread;
    const lv = $('live-log'); if (lv) lv.scrollTop = lv.scrollHeight;
  }
  loadApprovalMedia();
}
// Vídeo e imagens dos cartões de aprovação: busca uma vez por item (e de novo depois de 8 min, porque o endereço do arquivo é temporário).
const cardAt = {};
function loadApprovalMedia() {
  if (!ctx.ui.asstOpen || V.targetOf(ctx) !== 'assistant') return;
  ctx.cardMedia = ctx.cardMedia || {};
  for (const it of approvalItems(ctx)) {
    if (it.type === 'post' && !ctx.social && !cardAt.__social) { cardAt.__social = Date.now(); loadSocial(); }
    if (it.type === 'plan' || it.type === 'recipe' || it.type === 'subtask' || it.type === 'post') continue;   // sem mídia para buscar
    if (cardAt[it.key] && Date.now() - cardAt[it.key] < 8 * 60000) continue; cardAt[it.key] = Date.now();
    (async () => {
      try {
        ctx.cardMedia[it.key] = it.type === 'preview'
          ? ((await api(`batches/${it.batchId}/episodes/${it.epId}/media`)).files || []).map(f => ({ name: f.name, url: f.url }))
          : ((await api('tasks/' + it.id)).deliverables?.files || []).filter(f => mediaKind(f.path)).map(f => ({ name: f.path.split('/').pop(), url: f.url }));
      } catch { ctx.cardMedia[it.key] = []; }
      renderAsst();
    })();
  }
}
// Voz ligada: lê em voz alta um resumo curto da resposta nova do Assistente (a primeira carga só marca o que já existia, para não ler o histórico).
function speakNewReply() {
  const last = [...(ctx.asst?.messages || [])].reverse().find(m => m.role === 'assistant' && m.text && !m.error);
  if (!ctx.ui.spokenInit) { ctx.ui.lastSpoken = last?.id || null; ctx.ui.spokenInit = true; return; }
  if (!last || last.id === ctx.ui.lastSpoken) return; ctx.ui.lastSpoken = last.id;
  if (ctx.prefs.voiceReply) { const t = stripForSpeech(last.text); if (t) speak(window, t, { rate: ctx.prefs.voiceRate || 1 }); }
}
// Skills favoritas e escondidas: só preferência de exibição deste navegador (não muda nada nos agentes nem nas skills).
ctx.skillPrefs = store.get('cr.skillPrefs', { fav: [], hide: [] });
function skillPref(kind, name) { const p = ctx.skillPrefs, other = kind === 'fav' ? 'hide' : 'fav', has = (p[kind] || []).includes(name); p[kind] = has ? p[kind].filter(x => x !== name) : [...(p[kind] || []), name]; if (!has && kind === 'hide') p.fav = (p.fav || []).filter(x => x !== name); store.set('cr.skillPrefs', p); render(); }
async function loadAsst() {
  try { ctx.asst = await api('assistant'); ctx.asstOk = true; } catch (e) { ctx.asstOk = false; ctx.asst = { connected: [], manual: { available: true }, messages: [], threads: [], error: e.message }; if (ctx.ui.target === 'assistant') ctx.ui.target = ''; render(); }
  speakNewReply(); renderAsst(); checkDesktopNotify(); clearTimeout(asstTimer);
  if (ctx.asst?.pending || ctx.asst?.briefing) asstTimer = setTimeout(loadAsst, 1500);
}
// Envia o texto da barra do chat ao Assistente. Devolve true se foi enviado (a barra só esvazia nesse caso).
// Guarda (até 3 por destino) o que foi pedido a uma equipe ou agente pelo chat, para o chat mostrar o pedido e o andamento.
function rememberSent(target, text, ref) { const all = ctx.ui.sent ?? (ctx.ui.sent = store.get('cr.sent', {})); all[target] = [{ text: String(text).slice(0, 400), at: new Date().toISOString(), ...ref }, ...(all[target] || [])].slice(0, 3); store.set('cr.sent', all); renderAsst(); }
async function askAssistant(text, { includeContext = true } = {}) {
  if (!ctx.ui.asstOpen) setChatOpen(true);
  await loadAsst();
  if (ctx.asst?.pending) { notify('O Assistente ainda está respondendo. Espere um instante.', true); return false; }
  const local = /^\/(status|pendencias|pendências|celular|ajuda)\s*$/i.test(text.trim());   // comandos locais não usam a IA: valem antes da apresentação
  if (!ctx.asst?.briefed && !local) { notify('Antes, apresente o Code Room à sua IA: use o botão no chat.'); return false; }
  ctx.asst = { ...ctx.asst, messages: [...(ctx.asst.messages || []), { id: 'tmp', role: 'user', text, at: new Date().toISOString() }], pending: { status: 'queued' } }; renderAsst();
  const ok = await asstCall('ask', { text, ...(includeContext ? { projectId: ctx.project || undefined, screen: (() => { try { return screenContext(ctx, TITLES); } catch { return undefined; } })() } : {}) });
  if (!ok) { await loadAsst(); notify('A mensagem não foi enviada. Seu texto continua na barra: tente de novo.', true); }   // antes: a mensagem aparecia e sumia, e o texto era apagado
  return ok;
}
async function applyAsst(id) {
  const [m, i] = id.split(':'); const r = await api('assistant/apply', { messageId: m, index: Number(i) }); ctx.asst = r.status;
  if (r.projectId) { await refresh(); setProject(r.projectId, true); } else await refresh();
  if (r.view) await go(r.view); renderAsst(); return r;
}
async function asstCall(path, body) { let ok = true; try { ctx.asst = (await api('assistant/' + path, body || {})) ; if (ctx.asst.status) ctx.asst = ctx.asst.status; } catch (e) { ok = false; notify(e.message, true); } renderAsst(); clearTimeout(asstTimer); if (ctx.asst?.pending || ctx.asst?.briefing) asstTimer = setTimeout(loadAsst, 1500); return ok; }
async function loadUpdates() { try { ctx.updates = await api('updates'); render(); } catch {} }
function watchDownload() {
  const t = setInterval(async () => { await loadUpdates(); if (ctx.updates?.download?.state !== 'downloading') clearInterval(t); }, 1000);
}
// Depois de "Instalar": o serviço fecha e reabre; quando responder com a versão nova, recarrega a página para usar a interface nova.
function watchInstall(version) {
  const started = Date.now();
  const t = setInterval(async () => {
    if (Date.now() - started > 180000) { clearInterval(t); ctx.ui.updOpen = false; const d = $('update-dialog'); if (d.open) d.close(); notify('A atualização está demorando. Abra o Code Room de novo; se continuar assim, veja o arquivo update.log na pasta de dados.', true); return; }
    try { const s = await (await fetch('/api/state', { headers: { 'X-Code-Room-Key': key } })).json(); if (s?.runtime?.version === version) { clearInterval(t); location.reload(); } } catch {}
  }, 2000);
}

// ---------- Primeiro uso ----------
const onbFlags = () => store.get('cr.onb', {});
const setOnb = patch => store.set('cr.onb', { ...onbFlags(), ...patch });
function openSetup() { ctx.ui.onb = { mode: 'setup' }; ctx.checks = null; render(); loadChecks(true); }
function finishOnboarding(completed) {
  setOnb({ setupDone: true, tourDone: true }); ctx.ui.onb = null; render();
  notify(completed ? 'Tutorial concluído. Para rever: menu do usuário › Guia de boas-vindas.' : 'Tudo bem. Para rever o guia: menu do usuário › Guia de boas-vindas.');
}
// Só abre sozinho em instalação nova (sem projetos nem agentes) e uma única vez.
function maybeStartOnboarding() { if (!onbFlags().setupDone && ctx.state.agents.length === 0 && ctx.state.projects.length === 0) openSetup(); }

// ---------- Navegação ----------
async function go(view) {
  ctx.view = view; closeDrawer(); ctx.ui.panel = null; ctx.ui.whoOpen = false; ctx.ui.routineMenu = null;
  if (view === 'skills') loadSkills(true);
  if (view === 'usage') loadEconomy();
  if (view === 'routines' || view === 'tasks') refresh();   // lotes e tarefas criados por fora (Assistente, outro aparelho) aparecem ao abrir a tela, sem esperar os 15 s do relógio
  if (view === 'connections') { loadProviders(); loadHermes(); loadObsidian(); loadSocial(); loadApis(); loadSync(); loadOutbound(); }
  if (view === 'deliveries' && !ctx.obsidian) loadObsidian();
  if (view === 'deliveries' && ctx.project && ctx.gitInfo?.projectId !== ctx.project) loadGit(ctx.project, false);
  if (view === 'connections' || view === 'agents') { loadChecks(true); loadModules(); }
  if (view === 'settings') loadStorage();
  if (view === 'usage') loadLimits();
  if (view === 'connections' || view === 'routines') loadPublish();
  if (view === 'deliveries') { const first = W.deliveryList(ctx)[0]; if (first) selectDelivery(first.key, true); }
  render(); $('view').focus({ preventScroll: true }); window.scrollTo(0, 0);
}
function setProject(id, silent) {
  ctx.project = id; ctx.room = null; ctx.ui.chatAll = false; store.set('cr.project', id); ctx.skills = []; ctx.audit = null; ctx.projectContext = null;
  if (!silent) store.set('cr.general', id ? '' : '1');   // “Todos os projetos (geral)” é uma escolha da pessoa: a atualização da tela não a troca pelo primeiro projeto
  const target = ctx.ui.target || '';
  if (id && ((target.startsWith('a:') && !ctx.projectAgentIds().has(target.slice(2))) || (target.startsWith('t:') && !ctx.projectTeamIds().has(target.slice(2))) || (target === 's' && !ctx.supervisorAgent()))) ctx.ui.target = 'assistant';
  if (!silent) { ctx.detail = null; loadSkills(); }
}
async function loadAgentLibrary() { try { ctx.agentLibrary = await api('agents/library'); render(); } catch {} }
async function loadSkills(withAudit) {
  const id = ctx.project, query = id ? '?project=' + encodeURIComponent(id) : '';
  await Promise.all([
    api('skills' + query).then(skills => { if (id === ctx.project) { ctx.skills = skills; render(); } }).catch(() => {}),
    api('skills/library').then(library => { if (id === ctx.project) { ctx.skillLibrary = library; render(); } }).catch(() => {}),
  ]);
}
async function loadRefs(id) { try { ctx.refs = await api(`projects/${id}/references`); } catch { ctx.refs = null; } if (ctx.ui.panel === 'context') render(); }
async function loadContext(id) { ctx.refs = null; loadRefs(id); ctx.gitInfo = null; ctx.githubInfo = null; loadGit(id, true); try { ctx.projectContext = await api(`projects/${id}/context`); render(); } catch {} }
// Git do projeto: carrega o estado do repositório (e, se o GitHub CLI estiver logado, PRs e verificações) ao abrir o painel do projeto ou as Entregas.
async function loadGit(id, withHub) { if (!id) return; try { ctx.gitInfo = await api(`projects/${id}/git`); } catch { ctx.gitInfo = { available: false, repo: false }; } if (withHub && ctx.gitInfo?.repo) { try { ctx.githubInfo = await api(`projects/${id}/github`); } catch { ctx.githubInfo = null; } } else if (withHub) ctx.githubInfo = null; if (ctx.ui.panel === 'context' || ctx.view === 'deliveries') render(); }
async function loadChecks(force) { if (ctx.checks && !force) return true; try { ctx.checks = await api('connectors/check'); render(); return true; } catch { return false; } }
async function loadModules() { try { ctx.modules = await api('modules'); render(); } catch {} }
async function loadPublish() { try { ctx.publish = await api('publish/status'); if (['connections', 'routines'].includes(ctx.view)) render(); } catch {} }
async function loadLimits() { try { ctx.limits = await api('usage/limits'); if (ctx.view === 'usage') render(); } catch {} }
async function loadRemote() {
  try { ctx.whoami = (await api('whoami')).level; if (ctx.whoami === 'master') { ctx.net = await api('network'); ctx.devices = await api('devices'); try { ctx.mcp = await api('mcp'); } catch {} try { ctx.power = await api('power'); } catch {} try { ctx.startup = await api('startup'); } catch {} try { ctx.cleanup = await api('cleanup'); } catch {} } } catch (e) { notify(e.message, true); }
  render();
}
const deviceName = () => { const ua = navigator.userAgent; return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Celular Android' : /Windows/.test(ua) ? 'Computador Windows' : /Mac/.test(ua) ? 'Mac' : 'Aparelho'; };
async function pairWith(code) {
  const r = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: deviceName() }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Não foi possível parear.');
  key = j.token; try { localStorage.setItem(DEVICE_KEY, key); } catch {}
  ctx.ui.loginError = ''; await start();
}
async function loadStorage() { try { ctx.storage = await api('storage'); render(); } catch {} }
async function openTask(id, tab) { ctx.execTab = tab || 'resumo'; ctx.detail = await api('tasks/' + id); await go('exec'); }
async function selectDelivery(k, silent) {
  ctx.ui.delSel = k; ctx.ui.delText = null; const [id, path] = k.split('|');
  try { ctx.ui.delDetail = await api('tasks/' + id); const f = ctx.ui.delDetail.deliverables.files.find(x => x.path === path); if (f?.url && ['md', 'txt', 'css', 'js', 'json', 'csv', 'mjs'].includes(path.split('.').pop().toLowerCase())) fetch(f.url).then(r => r.text()).then(t => { ctx.ui.delText = t.slice(0, 60000); render(); }).catch(() => {}); } catch {}
  if (!silent) render(); else render();
}
// Clicar em um agente (sem arrastar) abre um menu pequeno: mencionar no chat (@Nome) ou ver os detalhes.
function closeAgentMenu() { const m = $('agent-menu'); if (m) m.remove(); ctx.ui.bubble = null; ctx.liveBubble = null; }
function placeAgentMenu(m) {
  const r = m._r, w = m.offsetWidth, h = m.offsetHeight; let x = Math.round((r.left + r.right) / 2 - w / 2), y = Math.round(r.bottom + 8);
  if (y + h > innerHeight - 8) y = Math.max(8, Math.round(r.top - h - 8)); x = Math.min(innerWidth - w - 8, Math.max(8, x));
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
// Clicou no agente: abre um balão ali do lado dele, com o estado, o que ele faz agora e uma caixa para dar a missão na hora.
function openAgentMenu(id) {
  const a = ctx.state.agents.find(x => x.id === id); if (!a) return; closeAgentMenu();
  const el = [...document.querySelectorAll('[data-agent]')].find(n => n.dataset.agent === id && n.offsetParent !== null) || null, r = el?.getBoundingClientRect() || { left: innerWidth / 2 - 90, right: innerWidth / 2 + 90, bottom: 120, top: 80 };
  const m = document.createElement('div'); m.id = 'agent-menu'; m.className = 'agent-menu'; m.setAttribute('role', 'menu'); m._r = r;
  m.innerHTML = `<b class="am-name">${V.esc(a.name)}</b><span class="am-role">${V.esc(a.role || '')}</span><span class="am-status small muted" data-am-status></span>
    <div class="am-live" data-am-live aria-live="polite"></div>
    <form class="am-form" data-id="${V.esc(a.id)}"><label class="sr-only" for="am-t-${V.esc(a.id)}">Missão para ${V.esc(a.name)}</label><textarea id="am-t-${V.esc(a.id)}" rows="2" maxlength="8000" placeholder="Missão para ${V.esc(a.name)}… (Enter envia)"></textarea><button type="submit" class="btn sm">Enviar</button></form>
    <div class="am-actions"><button type="button" role="menuitem" class="ghost" data-act="mini-open" data-id="${V.esc(a.id)}">Fixar em janela</button><button type="button" role="menuitem" class="ghost" data-act="mention-agent" data-id="${V.esc(a.id)}">@ Mencionar</button>${ctx.project && ctx.projectAgentIds().has(a.id) ? `<button type="button" role="menuitem" class="ghost" data-act="member-remove" data-id="${V.esc(a.id)}">Tirar do projeto</button>` : ''}<button type="button" role="menuitem" class="ghost" data-act="agent" data-id="${V.esc(a.id)}">Ver detalhes</button></div>`;
  document.body.appendChild(m); ctx.ui.bubble = id; renderBubble(); placeAgentMenu(m); refreshLive().then(renderBubble);
  m.querySelector('textarea')?.focus();
}
// Atualiza só o conteúdo do balão (nunca a caixa de texto, para não perder o que está sendo digitado).
function renderBubble() {
  const m = $('agent-menu'); if (!m || !ctx.ui.bubble) return;
  const a = ctx.state.agents.find(x => x.id === ctx.ui.bubble); if (!a) { closeAgentMenu(); return; }
  const st = m.querySelector('[data-am-status]'), label = ctx.agentStatus(a).label; if (st.textContent !== label) st.textContent = label;
  const html = bubbleLiveHtml(ctx.liveBubble || null);
  if (m._html !== html) { m.querySelector('[data-am-live]').innerHTML = html; m._html = html; placeAgentMenu(m); }
}
// "@Nome " vai para a barra do chat; ao enviar, a mensagem segue direto para esse agente (o "@" no começo escolhe quem executa).
function mentionAgent(id) {
  const a = ctx.state.agents.find(x => x.id === id); if (!a) return; closeAgentMenu(); closeDrawer();
  const token = '@' + a.name.trim().replace(/\s+/g, '_') + ' ';
  const put = () => { const ta = $('mission'); if (!ta) return; const rest = ta.value.replace(/^@[^\s]+\s*/, ''); ta.value = token + rest; ta.focus(); ta.setSelectionRange(token.length, token.length); };
  go('room').then(() => { setChatOpen(true); setTimeout(put, 120); });
}
function openDrawer(id) { closeAgentMenu(); lastFocus = document.activeElement; selectedAgent = id; const a = ctx.state.agents.find(x => x.id === id); if (!a) return; const d = $('drawer'); d.innerHTML = V.drawer(ctx, a); d.hidden = false; d.querySelector('button')?.focus(); }
function closeDrawer() { const was = selectedAgent; selectedAgent = null; $('drawer').hidden = true; if (was && lastFocus?.isConnected) lastFocus.focus(); else if (was) document.querySelector(`[data-agent="${was}"]`)?.focus(); }
const lines = v => String(v || '').split('\n').map(s => s.trim()).filter(Boolean);
const concPost = async patch => { const c = ctx.state.runtime.concurrency || { global: 1, provider: {}, video: 1 }; await api('settings/concurrency', { global: c.global, provider: { codex: c.provider?.codex ?? 1, claude: c.provider?.claude ?? 1 }, video: c.video, ...patch }); };
const limitsPost = async patch => { const l = ctx.state.limits || {}; await api('settings/limits', { timeoutMin: Math.round((l.timeoutMs || 1200000) / 60000), budgetUsd: l.budgetUsd ?? null, budgetEnabled: !!l.budgetEnabled, ...patch }); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- Ações ----------
const actions = {
  agent: id => openDrawer(id), task: (id, el) => openTask(id, el?.dataset.tab), tab: id => { ctx.execTab = id; render(); },
  'asst-task': (id, el) => openTask(id, el?.dataset.tab || 'arquivos'),
  'close-drawer': closeDrawer, dismiss: id => { dismissed.add(id); store.set('cr.dismissed', [...dismissed].slice(-200)); render(); }, who: () => { ctx.ui.whoOpen = !ctx.ui.whoOpen; render(); }, logout: () => logout(), 'show-key': () => { const v = $('access-key')?.value; ctx.ui.showKey = !ctx.ui.showKey; renderLogin(); if ($('access-key')) $('access-key').value = v || ''; $('access-key')?.focus(); },
  'first-access': () => { const v = $('access-key')?.value; ctx.ui.firstAccess = !ctx.ui.firstAccess; renderLogin(); if ($('access-key')) $('access-key').value = v || ''; },
  'toggle-list': () => { ctx.prefs.mode = ctx.viewMode() === 'term' ? 'scene' : 'term'; savePrefs(); render(); }, 'view-mode': id => { ctx.prefs.mode = ['scene', 'term', 'canvas'].includes(id) ? id : 'scene'; savePrefs(); render(); }, 'toggle-board': () => { ctx.prefs.board = ctx.prefs.board === false; savePrefs(); render(); },
  'pause-toggle': async () => { await api('queue/pause', { paused: !ctx.state.runtime.paused }); await refresh(); },
  cancel: async id => { await api(`tasks/${id}/cancel`, {}); notify('Cancelamento solicitado. A árvore de processos desta tarefa será encerrada.'); await refresh(); },
  retry: id => {
    const d = $('confirm-dialog'), task = ctx.state.runs.find(x => x.id === id), interrupted = task?.status === 'interrupted';
    d.dataset.id = id;
    $('retry-title').textContent = interrupted ? 'Execução interrompida' : 'Tentar de novo?';
    $('retry-warning').textContent = interrupted
      ? 'A tarefa parou sem confirmar o que chegou a fazer. Confira os arquivos do projeto e qualquer efeito externo antes de repetir; a nova tentativa começa do zero e pode duplicar trabalho.'
      : 'A tentativa anterior pode ter deixado arquivos no projeto. Confira a pasta antes de repetir: repetir pode duplicar efeitos.';
    $('retry-confirm').textContent = interrupted ? 'Conferi, iniciar nova tentativa' : 'Entendi, tentar de novo';
    d.showModal();
  },
  'accept-plan': async id => { await api(`plans/${id}/accept`, {}); notify('Plano aceito. As tarefas foram criadas.'); await refresh(); renderAsst(); },
  opts: async () => { ctx.ui.optsOpen = !ctx.ui.optsOpen; const tg = V.targetOf(ctx); if (ctx.ui.optsOpen && tg.startsWith('a:')) { const ag = ctx.state.agents.find(x => x.id === tg.slice(2)); if (ag && !ctx.models?.[tg]) { try { const info = await api('models?provider=' + encodeURIComponent(ag.provider)); ctx.models = { ...(ctx.models || {}), [tg]: info.models }; ctx.efforts = { ...(ctx.efforts || {}), [tg]: info.efforts }; } catch {} } } render(); }, 'full-out': () => { ctx.ui.fullOut = !ctx.ui.fullOut; render(); }, 'focus-composer': () => $('mission')?.focus(),
  'new-project': () => { ctx.ui.panel = 'new-project'; render(); $('panel').querySelector('input')?.focus(); },
  'home-pick-project': id => { setProject(id); render(); },
  'home-prompt': id => { const text = { code: 'Quero desenvolver uma melhoria neste projeto. Primeiro entenda o contexto e proponha um plano curto para eu revisar.', review: 'Revise a entrega mais recente deste projeto. Aponte problemas e riscos antes de sugerir qualquer alteração.', research: 'Quero pesquisar um tema e organizar os achados em uma entrega clara, com fontes para eu conferir.', video: 'Quero criar um conteúdo em vídeo. Ajude a estruturar a ideia, o roteiro e as etapas para revisão.' }[id]; const ta = $('home-mission'); if (ta && text) { ta.value = text; ta.focus(); ta.setSelectionRange(text.length, text.length); } },
  'project-team-suggest': async id => { const p = ctx.state.projects.find(x => x.id === id); if (!p) throw new Error('Projeto não encontrado.'); if (ctx.project !== p.id) setProject(p.id); ctx.ui.target = 'assistant'; ctx.ui.chatAll = false; await go('room'); setChatOpen(true); await askAssistant(`Monte uma equipe para o projeto “${p.name}”, que está em foco. Antes de propor, conheça o projeto em somente leitura: leia o README (se houver), o arquivo de dependências (package.json, requirements.txt ou equivalente) e a estrutura de pastas. Não abra arquivos de segredo (.env, chaves) e não altere nada. Diga em poucas linhas o que o projeto é e em que estado está. Se o material não bastar, faça até 3 perguntas objetivas antes de propor. Com base suficiente, proponha uma equipe pequena (2 a 5 agentes), reaproveitando agentes existentes e os especialistas da Biblioteca quando fizer sentido, e escolha a IA e o modelo de cada um conforme o guia de IAs instaladas (modelo mais forte para orquestrar e revisar). Proponha as ações criar_agente necessárias (somente leitura por padrão; edição só para quem precisa) e criar_equipe com o campo “projeto” igual ao nome exato “${p.name}”. Não inicie tarefas; aguarde minha aprovação de cada ação.`); },
  'pick-project': id => { setProject(id); go('room'); }, 'proj-filter': id => { ctx.ui.projFilter = id; render(); },
  'open-folder': async id => { await api(`projects/${id}/open`, {}); notify('Pasta aberta no Explorer.'); },
  'proj-context': async id => { ctx.ui.panel = 'context'; ctx.ui.panelId = id; ctx.projectContext = null; render(); await loadContext(id); },
  'close-panel': () => { ctx.ui.panel = null; render(); },
  'new-agent': () => editAgent(), 'edit-agent': id => editAgent(id), 'conn-tab': id => { ctx.ui.connTab = id; render(); window.scrollTo(0, 0); }, 'agents-tab': id => { ctx.ui.agentsTab = id; if (id === 'tools') { loadChecks(true); } if (id === 'library') loadAgentLibrary(); render(); },
  'agent-hire-pack': async id => { const r = await api('agents/library/hire-pack', { id, projectId: ctx.project || undefined }); await refresh(); await loadAgentLibrary(); notify(`${r.created.length ? `Contratados: ${r.created.join(', ')}.` : 'Todos os especialistas desta equipe já estavam na sua lista.'}${r.reused.length ? ` Reaproveitados: ${r.reused.join(', ')}.` : ''}${r.team ? ` Equipe “${r.team}” criada.` : ''}${r.projectId ? ' Tudo já está neste projeto.' : ''}`); },
  'digest-dismiss': () => { ctx.prefs.digestSeen = new Date().toDateString(); savePrefs(); render(); },
  'digest-ask': async () => { ctx.prefs.digestSeen = new Date().toDateString(); savePrefs(); ctx.ui.target = 'assistant'; setChatOpen(true); render(); await askAssistant('Acabei de voltar. Olhe o estado atual e me diga, em poucas linhas, o que está pendente (entregas para revisar, tarefas que falharam, pedidos aguardando aprovação, projetos parados) e por onde vale começar. Se alguma falha tiver correção, proponha.'); },
  'agent-hire': async (id, el) => { const provider = el?.closest('.lib-card')?.querySelector('.lib-provider')?.value; if (!provider) throw new Error('Conecte uma IA em Conexões antes de contratar.'); const r = await api('agents/library/hire', { id, provider, projectId: ctx.project || undefined }); await refresh(); await loadAgentLibrary(); notify(`“${r.agent.name}” contratado${r.projectId ? ' e trazido para este projeto' : ''}. Ele começa ${r.agent.mode === 'write' ? 'podendo editar arquivos do projeto' : 'em somente leitura'}; ajuste em Meus agentes quando quiser.`); },
  'asst-rename': async () => { const cur = ctx.asst?.name || 'Nico', n = prompt('Como o Assistente deve se chamar? (até 24 letras)', cur); if (n == null) return; ctx.asst = { ...ctx.asst, ...(await api('assistant/name', { name: n })) }; render(); renderAsst(); notify(`Pronto: o Assistente agora se chama ${ctx.asst.name}.`); },
  'asst-autonomy': id => { if (id === 'pilot' && !confirm('Ligar o modo piloto?\n\nO Assistente passa a agir como a sua IA no terminal: cria e edita arquivos na pasta do projeto em foco, roda programas liberados (node, git, ffmpeg…), usa skills, ferramentas MCP e o seu Chrome.\n\nNada é postado, enviado ou pago sem o seu “sim”, mas ele pode mexer nos seus arquivos. Use só em pastas que você aceita que sejam alteradas. Você pode voltar ao modo consulta quando quiser.')) return; return asstCall('autonomy', { mode: id }); },
  'asst-pilot-note-dismiss': () => { store.set('cr.pilot-note-dismissed', true); renderAsst(); },
  'asst-clear-errors': async () => { try { const r = await api('assistant/errors/clear', {}); ctx.asst = r.status; renderAsst(); notify(r.removed ? 'Mensagens de erro removidas.' : 'Não havia erros.'); } catch (e) { notify(e.message, true); } },
  'retention-preview': async () => { ctx.retention = 'busy'; render(); try { ctx.retention = await api('retention?days=7'); } catch (e) { ctx.retention = null; notify(e.message, true); } render(); },
  'retention-purge': async () => { if (!confirm('Apagar de vez os itens da lista? Isso não pode ser desfeito. Suas entregas, projetos e conversas não são afetados.')) return; try { const r = await api('retention/purge', { days: 7 }); ctx.retention = null; const mb = r.freedBytes ? ` ${(r.freedBytes / 1048576).toFixed(1).replace('.', ',')} MB liberados.` : ''; notify('Limpeza concluída.' + mb); } catch (e) { notify(e.message, true); } render(); },
  'hermes-test': async () => {
    const body = { host: $('hermes-host')?.value, port: $('hermes-port')?.value, key: $('hermes-key')?.value, bin: $('hermes-bin')?.value, trustNew: $('hermes-trust')?.checked === true };
    ctx.hermesTest = 'busy'; render();
    try { ctx.hermesTest = await api('hermes/test', body.host || body.key ? body : {}); } catch (e) { ctx.hermesTest = { ok: false, error: e.message }; }
    render();
  },
  'hermes-delete': async () => { if (!confirm('Remover a configuração do servidor Hermes? A chave e o servidor não são tocados, só o registro aqui no Code Room.')) return; try { ctx.hermes = await api('hermes/delete', {}); ctx.hermesTest = null; await refresh(); loadChecks(true); notify('Configuração do Hermes removida.'); } catch (e) { notify(e.message, true); } render(); },
  'mini-open': id => openMini(id),
  'mini-close': id => closeMini(id),
  'mention-agent': id => mentionAgent(id),
  'ask-agent': id => { ctx.ui.target = 'a:' + id; ctx.ui.asstOpen = true; store.set('cr.chat', { open: true }); closeDrawer(); go('room').then(() => { renderAsst(); $('mission')?.focus(); }); },
  'add-member': () => { ctx.teamDraft.members.push({ role: ctx.teamDraft.members.length ? 'revisor' : 'desenvolvedor', agentId: ctx.state.agents[0]?.id }); render(); },
  'del-member': i => { ctx.teamDraft.members.splice(Number(i), 1); render(); },
  'load-team': id => { const t = ctx.state.teams.find(x => x.id === id); ctx.teamDraft = { id: t.id, name: t.name, members: t.members.map(m => ({ ...m })) }; if ($('team-name')) $('team-name').value = t.name; render(); },
  'new-team': () => { ctx.teamDraft = { id: null, name: 'Minha equipe', members: [] }; if ($('team-name')) $('team-name').value = 'Minha equipe'; render(); },
  'save-team': async () => { ctx.teamDraft.name = $('team-name').value; await api('teams', ctx.teamDraft); ctx.teamDraft = { id: null, name: 'Minha equipe', members: [] }; notify('Equipe salva.'); await refresh(); },
  'test-flow': () => $('flowtest-dialog').showModal(),
  flow: async id => { const f = await api('flows/' + id); const t = f.steps.find(s => s.status === 'completed') || f.steps[0]; if (t) openTask(t.taskId); },
  step: async id => {
    const [k, d] = id.split(':'), n = Number(d), rt = ctx.state.runtime, l = ctx.state.limits || {};
    if (k === 'global') await concPost({ global: clamp((rt.concurrency?.global || 1) + n, 1, 8) });
    else if (k === 'rounds') { ctx.prefs.rounds = clamp((ctx.prefs.rounds || 1) + n, 1, 3); savePrefs(); }
    else if (k === 'timeout') await limitsPost({ timeoutMin: clamp(Math.round((l.timeoutMs || 1200000) / 60000) + n, 1, 60) });
    else if (k === 'budget') await limitsPost({ budgetUsd: Math.max(0, (l.budgetUsd ?? 0) + n) });
    await refresh();
  },
  toggle: async id => {
    const p = ctx.prefs;
    if (id === 'pref-net-lan' || id === 'pref-net-ts') {
      if (ctx.ui.networkBusy) return;
      const c = ctx.net.config; ctx.ui.networkBusy = true; render();
      try { ctx.net = await api('network', { lan: id === 'pref-net-lan' ? !c.lan : c.lan, tailscale: id === 'pref-net-ts' ? !c.tailscale : c.tailscale }); ctx.pairing = null; }
      catch (e) { notify(e.message, true); }
      finally { ctx.ui.networkBusy = false; render(); }
      return;
    }
    if (id === 'pref-startup') {   // um clique de cada vez: o segundo só vale depois que o primeiro terminou (senão o estado antigo desfaz o clique)
      if (ctx.ui.startupBusy) return; ctx.ui.startupBusy = true;
      try { ctx.startup = await api('startup', { on: !ctx.startup?.on }); notify(ctx.startup.on ? 'O Code Room vai abrir com o Windows.' : 'O Code Room não abre mais com o Windows.'); } catch (e) { notify(e.message, true); } finally { ctx.ui.startupBusy = false; }
      render(); return;
    }
    if (id === 'pref-autoclean') { try { ctx.cleanup = await api('cleanup', { auto: !ctx.cleanup?.auto }); notify(ctx.cleanup.auto ? 'Limpeza automática ligada: uma vez por dia, só o que é seguro apagar.' : 'Limpeza automática desligada.'); } catch (e) { notify(e.message, true); } render(); return; }
    if (id === 'pref-keepawake') { try { ctx.power = await api('power', { keepAwake: !ctx.power?.keepAwake }); } catch (e) { notify(e.message, true); } render(); return; }
    if (id === 'pref-autosup') { p.autoSupervisor = !p.autoSupervisor; savePrefs(); }
    else if (id === 'pref-anim') { p.anim = p.anim === false; savePrefs(); }
    else if (id === 'pref-reduce') { p.reduce = !p.reduce; savePrefs(); }
    else if (id === 'pref-pausehidden') { p.musicHidden = !p.musicHidden; savePrefs(); }
    else if (id === 'pref-budget') { const l = ctx.state.limits || {}; if (l.budgetUsd == null && !l.budgetEnabled) throw new Error('Defina um orçamento antes de ativar a pausa.'); await limitsPost({ budgetEnabled: !l.budgetEnabled }); await refresh(); }
    render();
  },
  'tool-sel': id => { ctx.ui.toolSel = id; render(); }, 'tool-help': id => { ctx.ui.toolSel = id; ctx.ui.agentsTab = 'tools'; render(); },
  'test-tool': async id => { await loadChecks(true); const i = ctx.checks?.find(c => c.id === id); notify(i?.installed ? `${V.PROVIDER[id]}: ${i.version || 'versão indisponível'} · login ${i.authenticated == null ? 'não verificado' : i.authenticated ? 'ativo' : 'inativo'}.` : `${V.PROVIDER[id]} não encontrado.`, !i?.installed); },
  'connector-login': async id => { const r = await api('connectors/login', { provider: id }); notify(`Terminal aberto para entrar no ${V.PROVIDER[id] || id}. Conclua o login no fluxo oficial e depois verifique a conexão.`); return r; },
  // Testar resposta: pedido mínimo à IA (gasta uma resposta curta). O resultado fica na tela até o próximo teste.
  'connector-test': async (id, el) => { const model = el?.dataset?.model || ''; ctx.ui.respTest = { ...(ctx.ui.respTest || {}), [id]: { running: true } }; render(); let r; try { r = await api('connectors/test', { provider: id, model }); } catch (e) { r = { ok: false, error: e.message }; } ctx.ui.respTest[id] = r; render(); notify(r.ok ? `${V.PROVIDER[id] || id} respondeu em ${Math.round((r.ms || 0) / 1000)} s${r.model ? ` (modelo ${r.model})` : ''}.` : `${V.PROVIDER[id] || id} não respondeu: ${r.error}${r.hint ? ' ' + r.hint : ''}`, !r.ok); return r; },
  'connector-check': async () => { ctx.ui.toolChecking = true; render(); ctx.checks = null; const ok = await loadChecks(true); ctx.ui.toolChecking = false; render(); notify(ok ? 'Detecção de ferramentas atualizada.' : 'Não foi possível atualizar a detecção. Verifique se o Code Room está conectado.', !ok); },
  copy: async id => { try { await navigator.clipboard.writeText(id); notify('Comando copiado. Cole no terminal.'); } catch { notify('Não foi possível copiar: selecione o texto manualmente.', true); } },
  'project-delete': async id => { const p = ctx.state.projects.find(x => x.id === id); if (!p || !confirm(`Excluir o projeto “${p.name}” do Code Room?

A pasta no computador NÃO é apagada e o histórico de tarefas continua guardado. Ligações do Canvas e o contexto deste projeto são removidos.`)) return; const r = await api(`projects/${id}/delete`, { confirm: true }); ctx.ui.panel = null; if (ctx.project === id) setProject('', true); await refresh(); notify(`Projeto “${r.name}” excluído do Code Room. A pasta continua em ${r.path}.`); },
  'agent-delete': async id => { const a = ctx.state.agents.find(x => x.id === id); if (!a || !confirm(`Excluir o agente “${a.name}”?

Isso apaga o perfil dele (nome, instruções, liberações). As tarefas e entregas antigas continuam no histórico. Não dá para desfazer.`)) return; try { await api(`agents/${id}/delete`, { confirm: true }); ctx.ui.panel = null; await refresh(); notify(`Agente “${a.name}” excluído.`); } catch (e) { notify(e.message, true); } },
  'team-delete': async id => { const t = ctx.state.teams.find(x => x.id === id); if (!t || !confirm(`Excluir a equipe “${t.name}”?

Os agentes dela continuam existindo; só a equipe (papéis e ordem) é apagada. Não dá para desfazer.`)) return; try { await api(`teams/${id}/delete`, { confirm: true }); await refresh(); notify(`Equipe “${t.name}” excluída.`); } catch (e) { notify(e.message, true); } },
  'member-remove': async (id, el) => { const pid = el?.dataset?.project || ctx.project; if (!pid) return; closeAgentMenu(); const linked = ctx.projectTeamIdsFor(pid), teams = ctx.state.teams.filter(t => linked.has(t.id) && (t.members || []).some(m => m.agentId === id)).map(t => t.name), worked = ctx.state.runs.some(t => t.project?.id === pid && t.agent?.id === id); await api('projects/members', { projectId: pid, remove: [id], hide: [id] }); await refresh(); notify('Agente tirado do projeto (ele continua existindo e pode voltar quando quiser).' + (teams.length ? ` A equipe “${teams.join('”, “')}” também foi desvinculada, porque ele faz parte dela.` : '') + (worked ? ' O histórico das tarefas dele neste projeto continua guardado.' : '')); },
  'team-member-remove': async (id, el) => { const pid = el?.dataset?.project || ctx.project; if (!pid) return; await api('projects/members', { projectId: pid, removeTeams: [id] }); await refresh(); notify('Equipe desvinculada do projeto. Os agentes que também foram trazidos individualmente continuam ligados.'); },
  'skill-view': id => { ctx.ui.skillView = id || ''; ctx.ui.skillMore = false; render(); },
  'skill-fav': id => skillPref('fav', id), 'skill-hide': id => skillPref('hide', id),
  'skill-sel': id => { ctx.ui.skillSel = id; render(); }, 'skill-more': () => { ctx.ui.skillMore = true; render(); },
  // ---- Rádio da Sala: lo-fi gerado no navegador. Desligada por padrão; só toca quando a pessoa clica (o navegador não permite tocar sozinho). ----
  'radio-next': () => { if (!radio?.playing) return; const next = radio.nextTrack(); $('radio-track').textContent = `próxima faixa: ${TRACKS[next].name}`; updateRadioUi(); flashRadioArtwork('next'); },
  'radio-volume-toggle': () => { if (!radio?.playing) return; radioControlsExpanded = !radioControlsExpanded; updateRadioUi(); },
  'radio-toggle': async () => {
    if (radio?.playing) { radio.stop(); radio = null; radioControlsExpanded = false; }
    else { radio = new LofiRadio({ track: store.get('cr.radio', {}).track ?? 0, onTrack: (t, i) => { $('radio-track').textContent = `faixa ${i + 1}/${TRACKS.length}: ${t.name}`; updateRadioUi(); store.set('cr.radio', { ...store.get('cr.radio', {}), track: i }); } }); radio.vol = store.get('cr.radio', {}).volume ?? 0.7; try { await radio.start(); } catch (e) { radio = null; notify(e.message, true); } }
    updateRadioUi();
  },
  // ---- Atualização: verificar, adiar, baixar com SHA-256 e instalar (só o computador) ----
  'fj-new': () => { ctx.ui.fjForm = emptyJobForm(ctx.project); renderFj(); $('fj-dialog').showModal(); },
  'fj-edit': id => { const j = ctx.state.folderJobs.find(x => x.id === id); if (!j) return; ctx.ui.fjForm = formFromJob(j); renderFj(); $('fj-dialog').showModal(); },
  'fj-close': () => $('fj-dialog').close(),
  'fj-toggle': id => { ctx.ui.fjOpen = ctx.ui.fjOpen === id ? null : id; render(); },
  'fj-run': async id => { await api(`folderjobs/${id}/run`, {}); notify('Procurando arquivos novos…'); await refresh(); },
  'fj-pause': async id => { await api(`folderjobs/${id}/pause`, {}); await refresh(); },
  'fj-resume': async id => { await api(`folderjobs/${id}/resume`, {}); await refresh(); },
  'fj-retry': async id => { const r = await api(`folderjobs/${id}/retry`, {}); notify(`${r.retried} arquivo(s) voltaram para a fila.`); await refresh(); },
  'fj-delete': async id => { const j = ctx.state.folderJobs.find(x => x.id === id); if (!j || !confirm(`Remover a pasta de entrada “${j.name}”? Os arquivos e as tarefas ficam como estão.`)) return; await api(`folderjobs/${id}/delete`, {}); await refresh(); },
  'notice-seen': async id => { await api('notices/seen', { id }); await refresh(); },
  'notice-open': async (id, b) => { await api('notices/seen', { id }); ctx.ui.fjOpen = b?.dataset.job || null; await refresh(); await go('routines'); },
  'prov-open': async () => { ctx.ui.provForm = emptyForm(); ctx.ui.provTest = {}; ctx.ui.provCli = {}; if (!ctx.providers) await loadProviders(); $('prov-dialog').showModal(); renderProv(); loadProviders(); },
  'prov-close': () => { $('prov-dialog').close(); },
  'prov-pick': key => { const c = ctx.providers?.catalog?.find(x => x.key === key); if (!c) return; ctx.ui.provForm = formFromCatalog(c); ctx.ui.provTest = { ...(ctx.ui.provTest || {}), form: null }; renderProv(); },
  'prov-add-catalog': async key => { const c = ctx.providers?.catalog?.find(x => x.key === key); if (!c || c.added) return; ctx.providers = await api('providers', payloadFromForm(formFromCatalog(c))); await refresh(); renderProv(); notify(`${c.name} foi adicionada. Agora entre na conta da CLI e teste uma resposta antes de usá-la em agentes.`); },
  'provider-cli-action': async (id, b) => { const action = b?.dataset.action; if (action === 'update' && !confirm('Abrir o Kiro CLI e executar o comando oficial de atualização agora? O Code Room não usa a opção de forçar downgrade.')) return; const r = action === 'login' ? await api('connectors/login', { provider: id }) : await api('connectors/cli-action', { provider: id, action }); notify(action === 'update' ? 'Terminal aberto com o comando oficial de atualização do Kiro CLI.' : `Terminal aberto para entrar no ${V.PROVIDER[id] || 'Kiro CLI'}. Depois, clique em “Verificar login”.`); return r; },
  'provider-cli-check': async id => { const r = await api('connectors/kiro/check', {}); ctx.ui.provCli = { ...(ctx.ui.provCli || {}), [id]: r }; renderProv(); notify(r.message, r.authenticated === false || r.status === 'error' || r.status === 'timeout'); },
  'provider-help': async (id, b) => { const name = b?.dataset.name || id; const prompt = `Me ajude, passo a passo, a conectar ${name} no Code Room. Primeiro descubra se a CLI está instalada e acessível no PATH, se a autenticação já foi feita e qual comando/formato precisa ser configurado. Se faltar informação, peça apenas o dado necessário. Não repita nenhuma tarefa com erro.`; ctx.ui.target = 'assistant'; await go('room'); setChatOpen(true); setTimeout(() => { const ta = $('mission'); if (ta) { ta.value = prompt; ta.focus(); ta.setSelectionRange(prompt.length, prompt.length); } }, 140); },
  'prov-edit': async id => { const s = ctx.providers?.custom?.find(x => x.id === id); if (!s) return; ctx.ui.provForm = formFromSpec(s); ctx.ui.provTest = { ...(ctx.ui.provTest || {}), form: null }; $('prov-dialog').showModal(); renderProv(); },
  'prov-delete': async id => { const s = ctx.providers?.custom?.find(x => x.id === id); if (!s || !confirm(`Remover “${s.name}”? Os agentes que usam esta IA precisam ser trocados antes.`)) return; ctx.providers = await api('providers/delete', { id }); await refresh(); notify('IA removida.'); },
  'prov-test': id => testProv({ id }, id),
  'prov-test-form': () => { readProvForm(); testProv(payloadFromForm(ctx.ui.provForm), 'form'); },
  'skill-cat': id => { ctx.ui.skillCat = id || ''; ctx.ui.skillMore = false; render(); },
  'skill-library-install': async id => { await api('skills/library/install', { id }); await loadSkills(); notify('Skill inicial adicionada. Revise-a e escolha os agentes que poderão usá-la.'); },
  'asst-toggle': () => setChatOpen(!ctx.ui.asstOpen),
  'chat-open': () => setChatOpen(true),
  'chat-min': () => setChatOpen(false),
  'asst-thread-rename': id => { ctx.ui.renameId = id; renderAsst(); const i = document.querySelector('.cw-rename'); if (i) { i.focus(); i.select(); } },
  'fix-with-ai': async id => {
    let t = (ctx.detail?.id === id ? ctx.detail : null) || ctx.state.runs.find(x => x.id === id); if (!t) return;
    try { t = await api('tasks/' + id); } catch {}
    const kind = t.failureKind || 'não classificado', model = t.agent?.model || 'padrão da conta', actual = t.actualModel || t.modelReported || 'não informado pela CLI';
    const why = String(t.reason || t.error || '').replace(/\s+/g, ' ').slice(0, 700);
    return askAssistant(`Corrija a falha da tarefa ${t.id} no Code Room.
Dados: tipo=${kind}; agente=${t.agent?.name || 'desconhecido'}; provedor=${t.agent?.provider || 'desconhecido'}; modelo pedido=${model}; modelo informado=${actual}; tentativas=${t.attemptCount ?? 'indisponível'}.
Motivo registrado: ${why || '(vazio)'}
Diga a causa em uma ou duas frases. Se a causa tiver correção dentro do Code Room, proponha as ações para eu aprovar: ajustar_agente (trocar modelo, esforço, permissão ou a IA do agente) e, em seguida, repetir_tarefa com o id ${t.id}. Se a correção depender de mim fora do Code Room (entrar na conta da CLI, instalar um programa, esperar a cota voltar), diga exatamente o que fazer e onde, e não proponha repetir. Se não der para saber a causa só com isto, diga o que falta e peça que eu copie o trecho da aba Eventos. Não invente causa.`, { includeContext: false });
  },
  'asst-help': id => { const al = ctx.asst?.alerts?.find(x => x.id === id); if (al) return askAssistant(al.ask); },
  'asst-alert-dismiss': id => asstCall('alerts/dismiss', { id }),
  'notify-toggle': async () => {
    if (ctx.prefs.desktopNotify) { ctx.prefs.desktopNotify = false; savePrefs(); renderAsst(); return notify('Avisos do Windows desligados.'); }
    if (typeof Notification === 'undefined') return notify('Este navegador não oferece avisos do sistema.', true);
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return notify('O navegador não liberou os avisos. Libere nas permissões do site (ícone ao lado do endereço) e tente de novo.', true);
    ctx.prefs.desktopNotify = true; savePrefs(); for (const n of ctx.state?.notices || []) seenNotify.add('n:' + n.id); renderAsst(); notify('Avisos do Windows ligados: você será avisado de lote concluído, falha e resposta do Assistente quando o app estiver em segundo plano.');
  },
  'asst-new-thread': () => asstCall('thread/new', { projectId: ctx.project || undefined }),
  'asst-thread': id => asstCall('thread/select', { id }),
  'asst-thread-del': id => { if (confirm('Apagar esta conversa? O histórico dela some.')) return asstCall('thread/delete', { id }); },
  'asst-brief': () => asstCall('brief', { provider: $('asst-provider')?.value }),
  'asst-reset': () => asstCall('reset'),
  'asst-suggest': q => { const ta = $('mission'); if (!ta) return; ta.value = q; ta.focus(); ta.setSelectionRange(q.length, q.length); },
  'asst-apply': async id => { try { await applyAsst(id); } catch (e) { notify(e.message, true); try { ctx.asst = await api('assistant'); } catch {} renderAsst(); } },
  'asst-team-help': async () => { await askAssistant('A equipe que acabei de criar ainda não está ligada a um projeto. Ajude-me a escolher o projeto atual ou pergunte qual devo usar, confira a equipe disponível e proponha um fluxo para eu aprovar. Não inicie tarefas nem aplique outras ações sem minha aprovação.'); },
  'asst-apply-all': async mid => {
    const msg = ctx.asst?.messages?.find(x => x.id === mid); const todo = (msg?.actions || []).filter(a => a.status === 'pending');
    for (const a of todo) { if (!a.valid) { notify(`Parei antes de “${a.summary || 'uma proposta'}”: ${a.error || 'inválida'}.`, true); break; } try { await applyAsst(`${mid}:${a.idx}`); } catch (e) { notify(`Parei em “${a.summary}”: ${e.message}`, true); try { ctx.asst = await api('assistant'); } catch {} renderAsst(); break; } }
  },
  'asst-dismiss': async id => { const [m, i] = id.split(':'); await asstCall('dismiss', { messageId: m, index: Number(i) }); },
  'upd-open': () => { ctx.ui.updOpen = true; render(); const d = $('update-dialog'); if (!d.open) d.showModal(); },
  'upd-close': () => { ctx.ui.updOpen = false; const d = $('update-dialog'); if (d.open) d.close(); },
  'upd-later': async () => { try { ctx.updates = await api('updates/dismiss', { version: ctx.updates.latest.version }); render(); } catch (e) { notify(e.message, true); } },
  'upd-check': async () => { notify('Verificando atualizações…'); try { ctx.updates = await api('updates/check', {}); render(); notify(ctx.updates.error || (ctx.updates.hasUpdate ? `Versão ${ctx.updates.latest.version} disponível.` : 'Você está na versão mais recente.'), !!ctx.updates.error); } catch (e) { notify(e.message, true); } },
  'upd-toggle': async () => { try { ctx.updates = await api('updates/settings', { enabled: !ctx.updates.enabled }); render(); } catch (e) { notify(e.message, true); } },
  'upd-download': async () => { try { ctx.updates = await api('updates/download', {}); render(); watchDownload(); } catch (e) { notify(e.message, true); } },
  'upd-install': async () => {
    if (!confirm('Instalar a atualização agora? O Code Room vai fechar e abrir sozinho em cerca de 30 segundos. Seus projetos e agentes não são tocados.')) return;
    try { const v = ctx.updates.download.version; ctx.updates = await api('updates/install', {}); render(); watchInstall(v); } catch (e) { notify(e.message, true); }
  },
  // ---- Primeiro uso: triagem das IAs e tutorial guiado (pode ser pulado; o guia reabre pelo menu do usuário) ----
  'onb-open': () => { ctx.ui.whoOpen = false; openSetup(); },
  'onb-recheck': async () => { ctx.ui.onb = { ...ctx.ui.onb, msg: '' }; ctx.checks = null; render(); await loadChecks(true); },
  'onb-video-check': async () => { ctx.ui.onb = { ...ctx.ui.onb, videoBusy: true, videoCheck: null }; render(); try { ctx.ui.onb.videoCheck = await api('preflight?projectId=' + encodeURIComponent(ctx.project || '')); } catch (e) { ctx.ui.onb.videoCheck = { summary: 'falha', items: [{ label: 'Verificação', status: 'falha', detail: e.message }] }; } finally { ctx.ui.onb.videoBusy = false; render(); } },
  'onb-name-save': () => { ctx.prefs.displayName = String($('workspace-name')?.value || '').trim().slice(0, 40); savePrefs(); render(); notify(ctx.prefs.displayName ? `Prazer, ${ctx.prefs.displayName}!` : 'Nome removido.'); },
  'onb-create': async () => {
    const plan = O.starterPlan(ctx); if (!plan.agents.length && !plan.team) return;
    ctx.ui.onb = { ...ctx.ui.onb, busy: true, msg: '' }; render();
    try {
      const made = {}; for (const a of plan.agents) made[a.provider] = await api('agents', a);
      const find = p => made[p]?.id || ctx.state.agents.find(a => a.provider === p && a.name === ({ codex: 'Desenvolvedor', claude: 'Revisor' })[p])?.id;
      if (plan.team && find('codex') && find('claude')) await api('teams', { name: 'Equipe de Desenvolvimento', members: [{ role: 'desenvolvedor', agentId: find('codex') }, { role: 'revisor', agentId: find('claude') }] });
      await refresh(); ctx.ui.onb = { ...ctx.ui.onb, busy: false, msg: `Pronto: ${plan.agents.length} agente(s)${plan.team ? ' e a Equipe de Desenvolvimento' : ''} criados. Você ajusta tudo em Agentes e ferramentas.` }; render();
    } catch (e) { ctx.ui.onb = { ...ctx.ui.onb, busy: false, msg: '' }; render(); notify(e.message, true); }
  },
  'onb-tour': () => { setOnb({ setupDone: true }); ctx.ui.onb = { mode: 'tour', step: 0 }; go(O.TOUR[0].view); },
  'onb-next': () => { const o = ctx.ui.onb; if (o.step >= O.TOUR.length - 1) return finishOnboarding(true); o.step++; go(O.TOUR[o.step].view); },
  'onb-back': () => { const o = ctx.ui.onb; if (o.step > 0) { o.step--; go(O.TOUR[o.step].view); } },
  'onb-skip': () => finishOnboarding(false),
  'add-skill-root': () => $('skillroot-dialog').showModal(),
  'del-sel': k => selectDelivery(k),
  'ap-recipe-approve': async id => { await api(`recipe-runs/${id}/approve`, {}); notify('Receita aprovada. Ela continua.'); await refresh(); renderAsst(); },
  'ap-recipe-cancel': async id => { if (!confirm('Cancelar esta receita?')) return; await api(`recipe-runs/${id}/cancel`, {}); notify('Receita cancelada.'); await refresh(); renderAsst(); },
  'sim-flow': async () => { const t = V.targetOf(ctx); if (!t.startsWith('t:')) return; const text = ($('mission')?.value || '').trim(); ctx.sim = 'busy'; renderAsst();
    try { ctx.sim = await api('flows/simulate', { projectId: ctx.project, teamId: t.slice(2), objective: text, maxReviewRounds: ctx.prefs.rounds || 1 }); } catch (e) { ctx.sim = { error: e.message }; } renderAsst(); },
  'ap-sub-approve': async id => { await api(`subtasks/${id}/approve`, {}); notify('Pedido aprovado. O outro agente começou.'); await refresh(); renderAsst(); },
  'ap-sub-dismiss': async id => { await api(`subtasks/${id}/dismiss`, {}); await refresh(); renderAsst(); },
  'social-edit': id => { ctx.ui.socialForm = id ? { id, network: ctx.social.accounts.find(a => a.id === id)?.network } : null; render(); },
  'social-del': async id => { if (!confirm('Remover esta conta? As senhas guardadas dela também são apagadas.')) return; await api(`social/accounts/${id}/delete`, {}); ctx.ui.socialForm = null; await loadSocial(); notify('Conta removida.'); },
  'social-test': async id => { ctx.ui.socialTest = { ...(ctx.ui.socialTest || {}), [id]: { ok: true, detail: 'Testando…' } }; render(); try { ctx.ui.socialTest[id] = await api(`social/accounts/${id}/test`, {}); } catch (e) { ctx.ui.socialTest[id] = { ok: false, detail: e.message }; } render(); },
  'social-copy': async id => { const p = ctx.social.posts.find(x => x.id === id); try { await navigator.clipboard.writeText(p.text); notify('Texto copiado. Cole no app da rede.'); } catch { notify('Não consegui copiar. Selecione o texto na fila.', true); } },
  'social-mark': async id => { await api(`social/posts/${id}/mark`, { url: $('mk-' + id)?.value || '' }); await loadSocial(); notify('Marcada como postada.'); },
  'social-dismiss': async id => { await api(`social/posts/${id}/dismiss`, {}); await loadSocial(); await refresh(); },
  'ap-post-sched': (id, el) => { ctx.ui.apSched = { ...(ctx.ui.apSched || {}), [id]: !!el.checked }; renderAsst(); },
  'ap-post-approve': async id => {
    const text = $('pt-' + id)?.value || '', sched = $('pw-' + id)?.value, body = { confirm: true, text }; if (sched) { const t = new Date(sched); if (Number.isNaN(+t)) throw new Error('Escolha um horário válido.'); body.when = t.toISOString(); }
    const r = await api(`social/posts/${id}/approve`, body); await Promise.all([refresh(), loadSocial(), loadOutbound()]);
    notify(r.status === 'agendado' ? `Agendada para ${new Date(r.scheduledAt).toLocaleString('pt-BR')}. O Code Room publica nesse horário (com o computador ligado).` : r.status === 'publicado' ? 'Publicada.' : r.status === 'manual' ? 'Pacote pronto: veja em Conexões › Redes sociais para copiar e postar.' : r.status === 'falhou' ? `Não foi possível publicar: ${r.error}` : 'Aprovada.', r.status === 'falhou'); renderAsst();
  },
  'ap-post-dismiss': async id => { await api(`social/posts/${id}/dismiss`, {}); await Promise.all([refresh(), loadSocial()]); renderAsst(); },
  'api-edit': id => { ctx.ui.apiForm = id ? { id } : null; render(); },
  'api-del': async id => { if (!confirm('Remover esta chave? Ela é apagada deste computador.')) return; await api(`apis/${id}/delete`, {}); ctx.ui.apiForm = null; await loadApis(); notify('Chave removida.'); },
  'api-check': async id => { notify('Testando…'); const r = await api(`apis/${id}/check`, {}); await Promise.all([loadApis(), loadOutbound()]); notify(r.ok ? 'Chave funcionando.' : 'A chave tem problema: ' + r.detail, !r.ok); },
  unblock: async (id, el) => {
    const box = el.closest('.unblock-box'), items = [...box.querySelectorAll('.unb:checked')].map(x => ({ kind: x.dataset.kind, value: x.dataset.value })); if (!items.length) return notify('Marque o que liberar.', true);
    const t = ctx.state.runs.find(x => x.id === id) || (ctx.detail?.id === id ? ctx.detail : null), r = await api(`tasks/${id}/unblock`, { items }); notify('Liberado: ' + r.released.join(', ') + '.');
    if (el.dataset.again && t) { await api('tasks', { projectId: t.project.id, agentId: t.agent.id, requestId: crypto.randomUUID(), objective: t.objective }); notify('Liberado e pedido de novo. Acompanhe em Tarefas.'); }
    await refresh(); if (ctx.view === 'exec') await openTask(id, ctx.execTab);
  },
  'cv-expand': () => { ctx.ui.cvBig = !ctx.ui.cvBig; render(); }, 'cv-term': () => { ctx.prefs.cvTerm = !ctx.prefs.cvTerm; savePrefs(); render(); },
  'sync-apply': async () => {
    const pick = c => [...document.querySelectorAll('.' + c + ':checked')].map(x => x.value), targets = pick('sync-ai'), skills = pick('sync-skill'), mcps = pick('sync-mcp');
    if (!targets.length) return notify('Marque pelo menos uma IA.', true); if (!skills.length && !mcps.length) return notify('Marque o que copiar (skills ou MCP).', true);
    notify('Instalando…'); const r = await api('sync-ias/apply', { targets, skills, mcps }); ctx.syncResult = r.results; await loadSync(); notify(r.results.every(x => x.ok) ? 'Pronto. Reinicie a IA de destino para ver as novidades.' : 'Terminou, com avisos. Veja o resultado.', !r.results.some(x => x.ok));
  },
  'eco-apply': async () => { const ids = [...document.querySelectorAll('.eco-pick:checked')].map(x => x.value); if (!ids.length) return notify('Marque o que aplicar.', true); const r = await api('economy/apply', { ids }); notify(`Aplicado em ${r.applied} agente(s): ${r.agents.join(', ')}. Dá para desfazer.`); await Promise.all([refresh(), loadEconomy()]); },
  'eco-undo': async () => { const r = await api('economy/undo', {}); notify(`Desfeito em ${r.restored} agente(s).`); await Promise.all([refresh(), loadEconomy()]); },
  'outbound-clear': async () => { await api('outbound/clear', {}); await loadOutbound(); notify('Lista limpa.'); },
  'ap-nav': id => { ctx.ui.apIdx = Math.max(0, (Number(ctx.ui.apIdx) || 0) + Number(id)); ctx.ui.apChanges = null; renderAsst(); },
  'ap-toggle': () => { ctx.ui.apCollapsed = !ctx.ui.apCollapsed; renderAsst(); },
  'ap-approve': async id => { const r = await api(`tasks/${id}/approve`, { note: '' }); notify(approvedMsg(r)); await refresh(); renderAsst(); },
  'ap-changes-open': k => { ctx.ui.apChanges = k; renderAsst(); $('ap-note')?.focus(); },
  'ap-changes-cancel': () => { ctx.ui.apChanges = null; renderAsst(); },
  'ap-changes-send': async id => { const fb = ($('ap-note')?.value || '').trim(); if (!fb) throw new Error('Descreva o ajuste.'); await api(`tasks/${id}/request-changes`, { feedback: fb, requestId: crypto.randomUUID() }); ctx.ui.apChanges = null; notify('Pedido de ajuste enviado como nova tarefa.'); await refresh(); renderAsst(); },
  'ap-open': async (id, el) => { ctx.ui.delFilter = 'review'; await go('deliveries'); await selectDelivery(`${id}|${el.dataset.file}`); },
  'obs-preview': async () => { ctx.ui.obsQ = $('obs-q')?.value || ''; ctx.obsPreview = 'busy'; render(); try { ctx.obsPreview = await api('obsidian/preview', { q: ctx.ui.obsQ, projectId: ctx.project || undefined }); } catch (e) { ctx.obsPreview = { error: e.message }; } render(); },
  'obs-save': async id => { const r = await api('obsidian/save', { taskId: id }); notify(`Nota criada no Obsidian: ${r.rel}`); },
  'git-init': async () => { if (!confirm('Iniciar o Git nesta pasta? Cria só a pasta oculta .git; nada é enviado para lugar nenhum.')) return; ctx.gitInfo = await api(`projects/${ctx.ui.panelId}/git/init`, {}); notify('Git iniciado no projeto.'); render(); },
  'git-refresh': () => loadGit(ctx.ui.panelId, true),
  'git-commit': async id => { const r = await api(`projects/${ctx.project}/git/commit`, { taskId: id }); notify(`Commit ${r.hash} criado com ${r.files.length} arquivo(s). Nada foi enviado.`); loadGit(ctx.project, false); },
  mic: () => {
    if (dictation?.listening) { dictation.stop(); return; }
    const box = $('mission'); if (!box) return; cancelSpeech(window);
    const base = box.value.trim() ? box.value.trim() + ' ' : '';
    dictation = createDictation(window, { onText: txt => { box.value = (base + txt).slice(0, 30000); box.dispatchEvent(new Event('input', { bubbles: true })); }, onState: on => { ctx.ui.listening = on; $('mic')?.classList.toggle('on', on); $('mic')?.setAttribute('aria-pressed', String(on)); if (!on) box.focus(); }, onError: msg => notify(msg, true) });
    if (!dictation) return notify('Este navegador não tem ditado por voz.', true);
    if (!ctx.ui.micWarned) { ctx.ui.micWarned = true; notify('Ditado ligado. O áudio é tratado pelo serviço de voz do seu navegador; o Code Room só recebe o texto quando você apertar Enviar.'); }
    dictation.start();
  },
  'voice-toggle': () => { ctx.prefs.voiceReply = !ctx.prefs.voiceReply; savePrefs(); if (ctx.prefs.voiceReply) speak(window, 'Voz ligada. Vou ler um resumo das respostas.', { rate: ctx.prefs.voiceRate || 1 }); else cancelSpeech(window); renderAsst(); },
  'ctx-prop-accept': async id => { const text = $('prop-' + id)?.value; ctx.projectContext = await api(`projects/${ctx.ui.panelId}/context/proposals/${id}/accept`, { text }); notify('Decisão adicionada ao contexto do projeto.'); render(); },
  'ctx-prop-dismiss': async id => { ctx.projectContext = await api(`projects/${ctx.ui.panelId}/context/proposals/${id}/dismiss`, {}); render(); },
  'pend-open': async k => { ctx.ui.delFilter = 'review'; await go('deliveries'); await selectDelivery(k); },
  'del-filter': id => { ctx.ui.delFilter = id === 'review' ? 'review' : 'all'; render(); },
  approve: async () => { const [id] = ctx.ui.delSel.split('|'); const r = await api(`tasks/${id}/approve`, { note: $('review-note')?.value || '' }); ctx.ui.reviewNote = ''; notify(approvedMsg(r)); await refresh(); },
  'review-pull': async () => { const [id] = ctx.ui.delSel.split('|'); const r = await api(`tasks/${id}/reviewer-notes`); if (!r.text) { notify('O revisor não listou problemas para esta entrega.'); return; } ctx.ui.reviewNote = r.text; const ta = $('review-note'); if (ta) { ta.value = r.text; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.scrollIntoView({ block: 'center' }); } notify(`Pontos de ${r.reviewer || 'o revisor'} colocados no campo. Confira e clique em Solicitar ajustes.`); },
  'request-changes': async () => { const [id] = ctx.ui.delSel.split('|'), fb = ($('review-note')?.value || '').trim(); if (!fb) throw new Error('Descreva o ajuste.'); const t = await api(`tasks/${id}/request-changes`, { feedback: fb, requestId: crypto.randomUUID() }); ctx.ui.reviewNote = ''; notify('Pedido de ajuste enviado como nova tarefa.'); await refresh(); await openTask(t.id); },
  'rm-worktree': async id => { if (!confirm('Remover o worktree e a branch desta tarefa? As mudanças que não foram integradas serão perdidas.')) return; await api('tasks/' + id + '/worktree/remove', {}); notify('Worktree removido.'); ctx.detail = await api('tasks/' + id); render(); },
  changes: async id => { const t = await api('tasks/' + id); $('changes-body').innerHTML = W.changesDialog(ctx, t); $('changes-dialog').showModal(); },
  'yt-connect': async () => { try { const r = await api('publish/google/connect', {}); window.open(r.url, '_blank', 'noopener'); notify('Autorize no navegador e volte para cá. Esta tela atualiza sozinha.'); const t0 = Date.now(), poll = setInterval(async () => { await loadPublish(); if (ctx.publish?.google?.connected || Date.now() - t0 > 180000) clearInterval(poll); }, 3000); } catch (e) { notify(e.message, true); } },
  'yt-disconnect': async () => { if (!confirm('Desconectar o YouTube? Você precisará autorizar de novo para publicar.')) return; ctx.publish = await api('publish/google/disconnect', {}); render(); },
  'post-new': async (id, el) => { ctx.ui.postFor = el.dataset.ep; ctx.ui.postNet = el.dataset.net || 'youtube'; ctx.ui.postDraft = {}; try { const m = await api(`batches/${id}/episodes/${el.dataset.ep}/media`), po = m.files.find(x => x.kind === 'post'); if (po) { const txt = await (await fetch(po.url)).text(); const t = txt.match(/T[íi]tulo do Shorts:\*{0,2}\s*(.+)/i); ctx.ui.postDraft = { title: t ? t[1].trim().slice(0, 100) : '', description: txt.replace(/^#.*\n+/, '').trim().slice(0, 4800), tags: (txt.match(/#[\p{L}\d]+/gu) || []).slice(0, 12).join(', ') }; } } catch {} render(); },
  'post-metrics': async id => { try { await api(`posts/${id}/metrics`, {}); notify('Números atualizados (e salvos em DESEMPENHO.md no projeto).'); await refresh(); } catch (e) { notify(e.message, true); } },
  'post-copy': async id => { const t = document.getElementById('cap-' + id); try { await navigator.clipboard.writeText(t.value); notify('Legenda copiada.'); } catch { t.select(); notify('Selecione e copie com Ctrl+C.', true); } },
  'post-mark': async id => { const url = document.getElementById('url-' + id)?.value.trim() || ''; if (!confirm('Você já postou este vídeo na rede? Isso registra como publicado e conta no limite do dia.')) return; try { await api(`posts/${id}/mark`, { url }); notify('Registrado como postado.'); await refresh(); } catch (e) { notify(e.message, true); } },
  'channel-new': () => { ctx.ui.channelEdit = 'new'; render(); }, 'channel-edit': id => { ctx.ui.channelEdit = id; render(); }, 'channel-close': () => { ctx.ui.channelEdit = null; render(); },
  'channel-del': async id => { if (!confirm('Remover este canal? Os vídeos e posts já feitos não são apagados.')) return; await api(`channels/${id}/delete`, {}); await refresh(); },
  'post-close': () => { ctx.ui.postFor = null; render(); },
  'post-cancel': async id => { await api(`posts/${id}/cancel`, {}); await refresh(); },
  'post-confirm': async id => { const sel = document.getElementById('priv-' + id), vis = sel?.value || 'private', nome = { private: 'PRIVADO', unlisted: 'NÃO LISTADO', public: 'PÚBLICO' }[vis]; if (!confirm(`Publicar este vídeo no YouTube agora como ${nome}?${vis === 'public' ? '\n\nQualquer pessoa poderá ver.' : ''}`)) return; try { await api(`posts/${id}/confirm`, { privacy: vis, confirm: true }); notify('Enviando para o YouTube…'); await refresh(); } catch (e) { notify(e.message, true); } },
  'batch-media': async (id, el) => { try { const m = await api(`batches/${id}/episodes/${el.dataset.ep}/media`); (ctx.ui.media ||= {})[el.dataset.ep] = m; render(); } catch (e) { notify(e.message, true); } },
  'preflight': async () => { notify('Verificando o ambiente…'); try { ctx.ui.preflight = await api('preflight?projectId=' + encodeURIComponent(ctx.project || '')); render(); } catch (e) { notify(e.message, true); } },
  'batch-qa': async (id, el) => { notify('Medindo imagem e áudio… (uns 10 a 20 s)'); try { (ctx.ui.qa ||= {})[el.dataset.ep] = await api(`batches/${id}/episodes/${el.dataset.ep}/qa?kind=${el.dataset.kind}`); render(); } catch (e) { notify(e.message, true); } },
  'batch-media-close': (id, el) => { delete ctx.ui.media?.[el.dataset.ep]; render(); },
  'batch-preview-ok': async (id, el) => { await api(`batches/${id}/episodes/${el.dataset.ep}/approve-preview`, {}); notify('Prévia aprovada. Gerando o final.'); await refresh(); },
  'batch-reject': async (id, el) => { if (!confirm('Reprovar este episódio? Prévia, final e cópias vão para a pasta LIXEIRA do projeto (nada é apagado de vez).')) return; await api(`batches/${id}/episodes/${el.dataset.ep}/reject`, {}); notify('Reprovado. Os arquivos foram para a LIXEIRA.'); await refresh(); },
  'batch-changes': async (id, el) => { const note = prompt('O que ajustar na prévia?'); if (!note) return; await api(`batches/${id}/episodes/${el.dataset.ep}/request-changes`, { note }); notify('Ajuste pedido. Só a prévia será refeita (sem gastar créditos).'); await refresh(); },
  'batch-retry': async (id, el) => { await api(`batches/${id}/episodes/${el.dataset.ep}/retry`, {}); await refresh(); },
  'batch-cancel': async id => { if (!confirm('Cancelar este lote? O que já foi gasto não volta.')) return; await api(`batches/${id}/cancel`, {}); await refresh(); },
  'routine-tpl': id => { const x = ROUTINE_TEMPLATES.find(t => t.id === id); if (!x) return; const f = $('routine-form'); ctx.ui.routineDraft = { ...(ctx.ui.routineDraft || {}), ...(f ? { projectId: f.projectId.value, target: f.target.value, time: f.time.value } : {}), name: x.name, objective: x.objective }; render(); },
  'routine-from-task': id => { const t = ctx.state.runs.find(x => x.id === id); if (!t) return; openRoutineDraft({ task: t }); },
  'routine-from-sent': (key, el) => { const m = (ctx.ui.sent?.[key] || [])[Number(el.dataset.i)]; if (!m) return; const t = m.taskId ? ctx.state.runs.find(x => x.id === m.taskId) : ctx.state.runs.find(x => x.flowId === m.flowId); openRoutineDraft({ task: t, key, text: m.text }); },
  'routine-tab': id => { ctx.ui.routineTab = id; render(); }, 'new-routine': () => { ctx.ui.routineDraft = null; ctx.ui.panel = 'routine'; ctx.ui.panelId = null; render(); },
  'routine-menu': id => { ctx.ui.routineMenu = ctx.ui.routineMenu === id ? null : id; render(); },
  'routine-edit': id => { ctx.ui.panel = 'routine'; ctx.ui.panelId = id; ctx.ui.routineMenu = null; render(); },
  'recipe-new': () => { ctx.ui.recipeDraft = null; ctx.ui.panel = 'recipe'; ctx.ui.panelId = null; render(); },
  'recipe-edit': id => { ctx.ui.recipeDraft = null; ctx.ui.panel = 'recipe'; ctx.ui.panelId = id; render(); },
  'recipe-tpl': id => { document.getElementById('recipe-form')?.remove(); ctx.ui.recipeDraft = draftFrom(ctx, id); ctx.ui.panel = 'recipe'; ctx.ui.panelId = null; render(); },
  'recipe-run-open': id => { ctx.ui.panel = 'recipe-run'; ctx.ui.panelId = id; render(); },
  'recipe-approve': async id => { await api(`recipe-runs/${id}/approve`, {}); await refresh(); },
  'recipe-cancel': async id => { await api(`recipe-runs/${id}/cancel`, {}); await refresh(); },
  'recipe-del': async id => { if (!confirm('Excluir esta receita?')) return; await api(`recipes/${id}/delete`, {}); notify('Receita excluída.'); await refresh(); },
  'routine-run': async id => { ctx.ui.routineMenu = null; await api(`routines/${id}/run`, {}); notify('Rotina iniciada.'); await refresh(); },
  'routine-toggle': async id => { const r = ctx.state.routines.find(x => x.id === id); await api(`routines/${id}/${r.status === 'active' ? 'pause' : 'resume'}`, {}); ctx.ui.routineMenu = null; await refresh(); },
  'routine-del': async id => { ctx.ui.routineMenu = null; await api(`routines/${id}/delete`, {}); notify('Rotina excluída.'); await refresh(); },
  'routine-test': async () => { const r = await saveRoutine(); await api(`routines/${r.id}/run`, {}); notify('Rotina salva e iniciada.'); ctx.ui.panel = null; await refresh(); },
  theme: id => { ctx.prefs.theme = id; savePrefs(); render(); }, 'save-prefs': () => { const n = $('workspace-name'); if (n) ctx.prefs.displayName = n.value.trim().slice(0, 40); savePrefs(); render(); notify('Preferências salvas neste navegador.'); },
  'settings-tab': id => { ctx.ui.settingsTab = id; if (id === 'historico') loadAudit(); if (id === 'armazenamento') loadStorage(); if (id === 'acesso') loadRemote(); if (id === 'atualizacoes') loadUpdates(); render(); },
  'pair-submit': async () => { const code = ($('pair-code')?.value || '').trim(); if (!code) { ctx.ui.loginError = 'Digite o código de pareamento.'; renderLogin(); return; } try { await pairWith(code); } catch (e) { ctx.ui.loginError = e.message; renderLogin(); } },
  'refresh-limits': async () => { notify('Lendo os limites do Claude (uma chamada mínima)…'); try { ctx.limits = await api('usage/refresh', {}); notify('Leitura atualizada.'); } catch (e) { notify(e.message, true); } render(); },
  'net-diagnose': async () => { ctx.netDiag = 'busy'; render(); try { ctx.netDiag = (await api('network/diagnose')).checks; } catch (e) { ctx.netDiag = null; notify(e.message, true); } render(); },
  'net-firewall': async () => { if (!confirm('Criar uma regra no Firewall do Windows só para o Code Room (esta porta, e só para a rede local e o Tailscale)? O Windows vai pedir a sua permissão.')) return; try { await api('network/firewall', {}); notify('Firewall liberado para o Code Room. Se o celular ainda não abrir, rode o diagnóstico.'); } catch (e) { notify(e.message, true); } },
  'mcp-activate': async () => { try { ctx.mcp = await api('mcp/activate', {}); ctx.devices = await api('devices'); notify('MCP ativado. Copie o comando abaixo.'); } catch (e) { notify(e.message, true); } render(); },
  'mcp-deactivate': async () => { if (!confirm('Desativar o MCP e revogar o token? As ferramentas conectadas perdem o acesso.')) return; try { ctx.mcp = await api('mcp/deactivate', {}); ctx.devices = await api('devices'); ctx.mcpWrite = false; notify('MCP desativado.'); } catch (e) { notify(e.message, true); } render(); },
  'mcp-write': () => { ctx.mcpWrite = ctx.mcpWrite !== true; render(); },
  'mcp-copy': async key => { const set = ctx.mcpWrite ? ctx.mcp.escrita : ctx.mcp.leitura; try { await navigator.clipboard.writeText(set[key]); notify('Copiado.'); } catch { notify('Não foi possível copiar: selecione o texto manualmente.', true); } },
  'pair-new': async () => { ctx.pairing = await api('devices/pair-code', {}); render(); },
  'revoke-device': async id => { await api(`devices/${id}/revoke`, {}); notify('Aparelho revogado.'); ctx.devices = await api('devices'); render(); },
  'copy-text': async id => { try { await navigator.clipboard.writeText(id); notify('Link copiado.'); } catch { notify('Não foi possível copiar: selecione o texto manualmente.', true); } },
  recheck: () => { ctx.checks = null; loadChecks(true); loadModules(); },
};
// Abre o painel de rotina já preenchido a partir de uma missão, fluxo ou tarefa que a pessoa quer repetir todo dia.
function openRoutineDraft({ task, key, text }) {
  const flow = task?.flowId ? (ctx.state.flows || []).find(f => f.id === task.flowId) : null;
  const target = key || (flow?.teamId ? 't:' + flow.teamId : task?.agent ? 'a:' + task.agent.id : '');
  const objective = String(text || flow?.objective || task?.objective || '').replace(/^Corrija a entrega conforme a revisão recebida[^.]*\. Objetivo original: /, '');
  ctx.ui.routineDraft = { fromTask: true, name: objective.replace(/\s+/g, ' ').slice(0, 60) || 'Rotina diária', objective, projectId: task?.project?.id || ctx.project || '', target, time: '08:00' };
  ctx.ui.panel = 'routine'; ctx.ui.panelId = null; render();
}
async function saveRoutine() {
  const f = $('routine-form'), d = Object.fromEntries(new FormData(f)), [tt, tid] = d.target.split(':');
  if (/\[(TEMA|ÁREA|CARGO|LOCAL|TOM|apelido)[^\]]*\]/i.test(d.objective)) throw new Error('Troque os trechos entre [colchetes] do objetivo pelo que você quer.');
  const trigger = d.ttype === 'manual' ? { type: 'manual' } : d.ttype === 'file' ? { type: 'file', ext: d.ext || '' } : { type: 'time', freq: d.freq, time: d.time, ...(d.freq === 'weekly' ? { day: Number(d.day) } : {}) };
  const r = await api('routines', { ...(d.id ? { id: d.id } : {}), name: d.name, projectId: d.projectId, target: { type: tt === 'a' ? 'agent' : tt === 'r' ? 'recipe' : 'team', id: tid }, objective: d.objective, trigger, attempts: Number(d.attempts) });
  ctx.ui.routineDraft = null; await refresh(); return r;
}
document.addEventListener('click', async e => {
  if (ctx.ui.whoOpen && !e.target.closest('.who')) { ctx.ui.whoOpen = false; render(); }
  if (ctx.ui.routineMenu && !e.target.closest('[data-act^=routine-]')) { ctx.ui.routineMenu = null; render(); }
  const b = e.target.closest('[data-act], [data-nav], [data-close]'); if (!b) return;
  if (b.tagName === 'INPUT') return;
  try {
    if (b.dataset.nav) return go(b.dataset.nav);
    if (b.dataset.close) return $(b.dataset.close).close();
    await actions[b.dataset.act]?.(b.dataset.id, b);
  } catch (err) { notify(err.message, true); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ctx.ui.cvBig) { ctx.ui.cvBig = false; render(); return; }
  if (ctx.ui.onb && !e.target.closest?.('input,textarea,select')) {
    if (e.key === 'Escape') { e.preventDefault(); return finishOnboarding(false); }
    if (ctx.ui.onb.mode === 'tour' && e.key === 'ArrowRight') { e.preventDefault(); return actions['onb-next'](); }
    if (ctx.ui.onb.mode === 'tour' && e.key === 'ArrowLeft') { e.preventDefault(); return actions['onb-back'](); }
  }
  if (e.key === 'Escape') { if (!$('drawer').hidden) closeDrawer(); else if (ctx.ui.panel) { ctx.ui.panel = null; render(); } else if (ctx.ui.whoOpen) { ctx.ui.whoOpen = false; render(); } }
  if (e.target.id === 'mission' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.pcard[role=button]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('change', async e => {
  if (e.target.matches?.('#agent-form [name=provider]')) { fillModelOptions(e.target.value); syncBrowserOptions(); }
  const t = e.target;
  try {
    if (t.id === 'project-select') { setProject(t.value); render(); }
    else if (t.id === 'api-service') { ctx.ui.apiForm = { ...(ctx.ui.apiForm || {}), service: t.value }; render(); }
    else if (t.id === 'social-net') { ctx.ui.socialForm = { ...(ctx.ui.socialForm || {}), network: t.value }; render(); }
    else if (t.id === 'git-auto') { api('git/config', { autoCommit: t.checked }).then(c => { if (ctx.gitInfo) ctx.gitInfo.config = c; notify(c.autoCommit ? 'Ao aprovar uma entrega, o Code Room cria um commit local com os arquivos dela.' : 'Commit automático desligado.'); }).catch(e => { t.checked = !t.checked; notify(e.message, true); }); }
    else if (t.id === 'room-filter') { ctx.room = t.value; render(); }
    else if (t.id === 'member-add' || t.classList?.contains('member-add')) { const [k, id] = [t.value.slice(0, 1), t.value.slice(2)], pid = t.dataset.project || ctx.project; if (!id || !pid) return; await api('projects/members', { projectId: pid, ...(k === 't' ? { addTeams: [id] } : { add: [id] }) }); if (pid === ctx.project) ctx.room = '@projeto'; await refresh(); notify(k === 't' ? 'Equipe trazida para o projeto.' : 'Agente trazido para o projeto.'); }
    else if (t.id === 'sup-select') { store.set('cr.sup.' + ctx.project, t.value); render(); }
    else if (t.id === 'usage-period') { ctx.ui.usagePeriod = t.value; render(); } else if (t.id === 'usage-project') { ctx.ui.usageProject = t.value; render(); }
    else if (t.id === 'routine-proj') { ctx.ui.routineProj = t.value; render(); }
    else if (t.id === 'pref-font') { ctx.prefs.font = t.value; savePrefs(); render(); }
    else if (t.id === 'target') { ctx.sim = null; ctx.ui.target = t.value; renderAsst(); const ms = $('mission'); if (ms) ms.placeholder = t.value === 'assistant' ? 'Conte o que você quer fazer…' : 'Digite a missão…  /skill  @agente'; $('send').disabled = !(t.value === 'assistant' || (ctx.project && ctx.state.agents.length)); }
    else if (t.dataset?.field && t.dataset.i != null) { ctx.teamDraft.members[Number(t.dataset.i)][t.dataset.field] = t.value; render(); }
    else if (t.dataset?.act === 'skill-agent') {
      const a = ctx.state.agents.find(x => x.id === t.dataset.agent); const ids = new Set(a.skillIds); if (t.checked) ids.add(t.dataset.id); else ids.delete(t.dataset.id);
      if (ids.size > 8) { t.checked = false; throw new Error('Máximo de 8 skills por agente.'); }
      await api('agents', { ...a, skillIds: [...ids] }); await refresh();
    }
  } catch (err) { notify(err.message, true); }
});
document.addEventListener('input', e => {
  const t = e.target, m = { 'proj-q': 'projQuery', 'tool-q': 'toolQ', 'skill-q': 'skillQ', 'routine-q': 'routineQ', 'review-note': 'reviewNote' }[t.id];
  if (t.id === 'workspace-name') return;
  if (m) { ctx.ui[m] = t.value; if (t.id !== 'review-note') render(); else { const c = t.parentElement.querySelector('.muted.small'); if (c) c.textContent = `${t.value.length}/500`; } }
});

document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.matches?.('.mini-form textarea, .am-form textarea, .term-form textarea')) { e.preventDefault(); e.target.form.requestSubmit(); } });

// ---------- Formulários ----------
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, fid = f.getAttribute('id');
  try {
    if (fid === 'home-composer') {
      const text = String(new FormData(f).get('prompt') || '').trim(), projectId = String(new FormData(f).get('projectId') || ''); if (!text) return;
      if (projectId !== ctx.project) { setProject(projectId); render(); }
      ctx.ui.target = 'assistant'; if (await askAssistant(text)) { const ta = $('home-mission'); if (ta) ta.value = ''; }
      return;
    }
    if (fid === 'hermes-form') {   // servidor do Hermes: o servidor valida de novo tudo o que chega
      ctx.hermes = await api('hermes', { host: $('hermes-host').value, port: $('hermes-port').value, key: $('hermes-key').value, bin: $('hermes-bin').value, trustNew: $('hermes-trust').checked });
      ctx.hermesTest = null; await refresh(); loadChecks(true); notify('Servidor do Hermes salvo. Clique em “Testar a conexão”.'); render(); return;
    }
    if (f.classList.contains('mini-form') || f.classList.contains('am-form')) {   // janela de chat extra: missão direta ao agente daquela janela
      const ta = f.querySelector('textarea'), text = ta.value.trim(); if (!text) return;
      if (!ctx.project) throw new Error('Escolha ou cadastre um projeto.');
      ta.disabled = true;
      try { await api('tasks', { projectId: ctx.project, agentId: f.dataset.id, requestId: crypto.randomUUID(), objective: text }); ta.value = ''; await refresh(); }
      finally { ta.disabled = false; ta.focus(); }
      return;
    }
    if (fid === 'composer') {
      if (dictation?.listening) dictation.stop(); cancelSpeech(window);   // ao enviar, para de ouvir e de falar
      let target = $('target').value, text = $('mission').value.trim(); const criteria = lines($('criteria')?.value), requestId = crypto.randomUUID(), skillIds = [];
      // "@Agente" no começo escolhe quem executa; "/skill" em qualquer ponto anexa a skill (vale para qualquer agente)
      const mm = text.match(/^@([\w.:À-ÿ-]+)\s+/), mentioned = mm && ctx.state.agents.find(a => a.name.replace(/\s+/g, '_').toLowerCase() === mm[1].toLowerCase() && (!ctx.project || ctx.projectAgentIds().has(a.id)));
      if (mentioned) { target = 'a:' + mentioned.id; text = text.slice(mm[0].length).trim(); }
      if (target === 'assistant') { if (await askAssistant(text)) $('mission').value = ''; return; }
      let projId = ctx.project; const px = extractProject(text, ctx.state.projects); if (px.project) { projId = px.project.id; text = px.text; } else if (px.ambiguous) throw new Error('Mais de um projeto combina com o # que você escreveu. Escreva o nome inteiro.');
      for (const m of text.matchAll(/(?:^|\s)\/([\w.:-]+)/g)) { const s = skillChoices(m[1], true)[0]; if (s && !skillIds.includes(s.id)) skillIds.push(s.id); }
      if (skillIds.length && !target.startsWith('a:')) notify('As skills com "/" valem para agente individual; neste modo elas foram ignoradas.', true);
      if (!projId) throw new Error('Escolha ou cadastre um projeto.'); if (!target) throw new Error('Escolha quem executa.');
      if (projId !== ctx.project) {
        const members = ctx.projectAgentIdsFor(projId), teams = ctx.projectTeamIdsFor(projId);
        if (target.startsWith('a:') && !members.has(target.slice(2))) throw new Error('Este agente não está ligado ao projeto citado. Traga-o pelo menu de contexto do projeto primeiro.');
        if (target.startsWith('t:') && !teams.has(target.slice(2))) throw new Error('Esta equipe não está ligada ao projeto citado. Traga-a pelo menu de contexto do projeto primeiro.');
        if (target === 's') throw new Error('Para usar o Supervisor, selecione o projeto desejado no topo antes de enviar.');
      }
      $('send').disabled = true;
      if (target === 's') { await api('plans', { projectId: projId, supervisorId: ctx.supervisorAgent().id, request: text, requestId, autoAccept: false }); notify('O supervisor está planejando. Revise e aceite o plano na Sala.'); await go('room'); }
      else if (target.startsWith('t:')) { const fl = await api('flows', { projectId: projId, teamId: target.slice(2), requestId, objective: text, criteria, maxReviewRounds: ctx.prefs.rounds || 1 }); rememberSent(target, text, { flowId: fl.id }); notify('Fluxo iniciado. O andamento aparece no chat.'); }
      else { if (px.project) notify(`Missão enviada ao projeto “${px.project.name}”.`); const t = await api('tasks', { projectId: projId, agentId: target.slice(2), requestId, objective: text, criteria, skillIds, isolate: $('isolate')?.checked === true, model: $('ov-model')?.value.trim() || undefined, effort: $('ov-effort')?.value || undefined }); $('mission').value = ''; rememberSent(target, text, { taskId: t.id }); await refresh(); return openTask(t.id); }
      $('mission').value = ''; ctx.ui.optsOpen = false; await refresh();
    } else if (fid === 'link-form') {
      const fd = new FormData(f); if (fd.get('from') === fd.get('to')) throw new Error('Escolha dois agentes diferentes.'); await linkAgents(fd.get('from'), fd.get('to'), Number(fd.get('maxHops')) || 3, fd.get('when') || 'always'); if (fd.get('both') && !ctx.state.links.some(l => l.projectId === ctx.project && l.from === fd.get('to') && l.to === fd.get('from'))) await linkAgents(fd.get('to'), fd.get('from'), Number(fd.get('maxHops')) || 3, 'always');
    } else if (fid === 'followup-form') {
      const fd = new FormData(f), t = await api(`tasks/${fd.get('id')}/followup`, { agentId: fd.get('agentId'), message: fd.get('message'), requestId: crypto.randomUUID() });
      notify(t.resumed ? 'Continuando a mesma sessão.' : 'Nova missão iniciada com o resumo e os arquivos da anterior.'); await refresh(); return openTask(t.id);
    } else if (fid === 'login-form') { key = $('access-key').value.trim(); ctx.ui.loginError = ''; start(); }
    else if (fid === 'project-form') { const d = Object.fromEntries(new FormData(f)); const p = await api('projects', { name: d.name, path: d.path, area: d.area, createSub: d.createSub === '1' }); if (d.team) await api('projects/members', { projectId: p.id, addTeams: [d.team] }); ctx.ui.panel = null; setProject(p.id); await refresh(); notify(d.team ? 'Projeto criado com a equipe inicial ligada.' : 'Projeto criado.'); if (!d.team && d.area !== 'Financeiro' && ctx.asstOk !== false && confirm(`Projeto “${p.name}” criado.\n\nQuer que o Assistente leia a pasta (README, dependências e estrutura) e sugira uma equipe para tocar este projeto? Nada é criado sem a sua aprovação.`)) await actions['project-team-suggest'](p.id); }
    else if (fid === 'agent-form') { const d = Object.fromEntries(new FormData(f)); d.browser = f.elements.browser.value; d.web = f.elements.web.checked; d.skillIds = [...pickedSkills]; d.commands = String(d.commands || '').split(/[,\s]+/).filter(Boolean); d.mcpTools = String(d.mcpTools || '').split(/[,\s]+/).filter(Boolean); d.capabilities = [...f.querySelectorAll('[name=cap]:checked')].map(x => x.value); delete d.cap; const isNew = !d.id; if (isNew) delete d.id; const saved = await api('agents', d); const joined = isNew && ctx.project && saved?.id; if (joined) await api('projects/members', { projectId: ctx.project, add: [saved.id] }); $('agent-dialog').close(); await refresh(); notify((joined ? `Agente salvo e trazido para o projeto “${ctx.projectNameOf(ctx.project)}”.` : 'Agente salvo.') + (isNew && saved?.provider !== 'hermes' ? ' Testando a resposta da IA em segundo plano…' : ''));
      // Agente novo: confere logo se a IA dele responde, para o erro não aparecer só na primeira tarefa. Uma vez por IA e modelo nesta sessão.
      if (isNew && saved?.provider && saved.provider !== 'hermes') { const k = saved.provider + '|' + (saved.model || ''); ctx.ui.respSeen ??= new Set(); if (!ctx.ui.respSeen.has(k)) { ctx.ui.respSeen.add(k); api('connectors/test', { provider: saved.provider, model: saved.model || '' }).then(r => { ctx.ui.respTest = { ...(ctx.ui.respTest || {}), [saved.provider]: r }; notify(r.ok ? `“${saved.name}” está pronto: ${V.PROVIDER[saved.provider] || saved.provider} respondeu ao teste.` : `Atenção: a IA de “${saved.name}” não respondeu ao teste. ${r.error || ''} ${r.hint || 'Confira o login em Conexões.'}`, !r.ok); render(); }).catch(() => {}); } }
    }
    else if (fid === 'flow-form') { const d = Object.fromEntries(new FormData(f)); await api('flows', { projectId: ctx.project, teamId: d.team, requestId: crypto.randomUUID(), objective: d.objective, criteria: lines(d.criteria), maxReviewRounds: ctx.prefs.rounds || 1 }); f.reset(); notify('Fluxo iniciado.'); await refresh(); }
    else if (fid === 'conc-form') { const d = Object.fromEntries(new FormData(f)), n = v => Number(v); await api('settings/concurrency', { global: n(d.global), provider: { codex: n(d.codex), claude: n(d.claude) }, video: n(d.video) }); notify('Limites salvos.'); await refresh(); }
    else if (fid === 'token-budget-form') { const fd = new FormData(f); await api('settings/token-budget', { limit: fd.get('limit'), enabled: fd.get('enabled') === 'on' }); await Promise.all([refresh(), loadEconomy()]); notify('Teto salvo.'); }
    else if (fid === 'api-form') { const fd = new FormData(f); await api('apis', { id: fd.get('id') || undefined, service: ctx.ui.apiForm?.service || fd.get('service'), name: fd.get('name'), key: fd.get('key'), note: fd.get('note') }); ctx.ui.apiForm = null; await loadApis(); notify('Chave guardada. Use “Testar e ver consumo”.'); }
    else if (fid === 'social-form') {
      const fd = new FormData(f), network = ctx.ui.socialForm?.network || fd.get('network'), fields = {}; for (const [k, v] of fd.entries()) if (k.startsWith('f_')) fields[k.slice(2)] = v;
      await api('social/accounts', { id: fd.get('id') || undefined, network, name: fd.get('name'), label: fd.get('label') || undefined, niche: fd.get('niche'), maxPerDay: Number(fd.get('maxPerDay')) || undefined, fields }); ctx.ui.socialForm = null; await loadSocial(); notify('Conta salva.');
    }
    else if (fid === 'social-post-form') { const fd = new FormData(f), w = fd.get('when'); await api('social/posts', { accountId: fd.get('accountId'), text: fd.get('text'), when: w ? new Date(w).toISOString() : undefined }); await Promise.all([refresh(), loadSocial()]); notify('Postagem criada. Aprove no chat (cartão “Aguardando você”).'); render(); }
    else if (fid === 'refs-form') {   // pastas de referência: o servidor valida de novo (caminho, sistema, o próprio projeto, rótulos)
      const dirs = $('refs-dirs').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^([^=\\/:]{1,40})=(.+)$/); return m ? { label: m[1].trim(), path: m[2].trim() } : { path: l }; });
      ctx.refs = await api(`projects/${ctx.ui.panelId}/references`, { dirs }); notify(ctx.refs.dirs.length ? 'Pastas de referência salvas. A cópia é refeita antes de cada tarefa.' : 'Pastas de referência removidas.'); loadRefs(ctx.ui.panelId);
    }
    else if (fid === 'context-form') { const d = Object.fromEntries(new FormData(f)); ctx.projectContext = await api(`projects/${ctx.ui.panelId}/context`, { goals: d.goals, decisions: lines(d.decisions), pending: lines(d.pending), references: lines(d.references) }); notify('Contexto salvo.'); render(); }
    else if (fid === 'confirm-form') { const id = $('confirm-dialog').dataset.id; $('confirm-dialog').close(); await api(`tasks/${id}/retry`, { confirm: true }); notify('Nova tentativa na fila.'); await refresh(); }
    else if (fid === 'flowtest-form') { $('flowtest-dialog').close(); const team = ctx.teamDraft.id || ctx.state.teams[0]?.id; if (!team) throw new Error('Salve a equipe antes de testar o fluxo.'); await api('flows', { projectId: ctx.project, teamId: team, requestId: crypto.randomUUID(), objective: 'Teste do fluxo: crie um arquivo teste.txt com a palavra "ok" (UTF-8) e informe o nome do arquivo.', criteria: ['O arquivo teste.txt existe e contém "ok"'], maxReviewRounds: 1 }); notify('Fluxo de teste iniciado.'); await refresh(); }
    else if (fid === 'skillroot-form') { await api('settings/skill-roots', { path: new FormData(f).get('path') }); $('skillroot-dialog').close(); notify('Pasta de skills adicionada.'); await loadSkills(); }
    else if (fid === 'prices-form') { const d = Object.fromEntries(new FormData(f)); await api('settings/prices', { codex: { in: d.cin, out: d.cout }, claude: { in: d.lin, out: d.lout } }); notify('Preços salvos. A estimativa usa só tarefas sem custo reportado.'); await refresh(); }
    else if (fid === 'channel-form') { const d = Object.fromEntries(new FormData(f)); const r = await api('channels', { ...d, createPostador: d.createPostador === '1' }); ctx.ui.channelEdit = null; notify(r.agent ? `Canal salvo e agente “${r.agent.name}” criado.` : 'Canal salvo.'); await refresh(); }
    else if (fid === 'yt-form') { const d = Object.fromEntries(new FormData(f)); ctx.publish = await api('publish/google/config', d); notify('Credenciais salvas. Agora clique em Conectar YouTube.'); render(); }
    else if (fid === 'post-form') { const d = Object.fromEntries(new FormData(f)); await api('posts', { batchId: f.dataset.batch, epId: f.dataset.ep, network: f.dataset.net || 'youtube', title: d.title, description: d.description, tags: d.tags }); ctx.ui.postFor = null; ctx.ui.postDraft = null; notify('Rascunho criado. Escolha a visibilidade e confirme para publicar.'); await refresh(); }
    else if (fid === 'batch-form') { const d = Object.fromEntries(new FormData(f)); await api('batches', { name: d.name, projectId: d.projectId, agentId: d.agentId, workDir: d.workDir, fromStage: d.fromStage || undefined, folders: d.folders.split(/\r?\n/).map(s => s.trim()).filter(Boolean) }); notify('Lote criado. Confira os custos e aprove os créditos para começar.'); await refresh(); }
    else if (fid === 'batch-costs-form') { const d = Object.fromEntries(new FormData(f)); await api('batches/costs', d); notify('Preços salvos.'); await refresh(); }
    else if (fid.startsWith('batch-approve-')) { const d = Object.fromEntries(new FormData(f)); await api(`batches/${f.dataset.batch}/approve`, { voiceCredits: Number(d.voiceCredits), flowCap: Number(d.flowCap) }); notify('Créditos aprovados. A produção começou.'); await refresh(); }
    else if (fid === 'recipe-form') { await api('recipes', readRecipeForm(f)); ctx.ui.panel = null; ctx.ui.recipeDraft = null; notify('Receita salva.'); await refresh(); }
    else if (fid === 'recipe-run-form') { const d = Object.fromEntries(new FormData(f)); await api(`recipes/${d.rid}/run`, { objective: d.objective }); ctx.ui.panel = null; notify('Rodada iniciada.'); await refresh(); }
    else if (fid === 'fj-form') { readFjForm(); const j = await api('folderjobs', payloadFromJobForm(ctx.ui.fjForm)); $('fj-dialog').close(); ctx.ui.fjOpen = j.id; await refresh(); notify(j.counts.total ? `${j.counts.total} arquivo(s) encontrados. O lote começou.` : 'Pasta de entrada criada. Ponha os arquivos nela.'); }
    else if (fid === 'prov-form') { readProvForm(); ctx.providers = await api('providers', payloadFromForm(ctx.ui.provForm)); $('prov-dialog').close(); await refresh(); notify('Configuração da CLI salva. Entre na conta e teste a resposta antes de usar em um agente.'); }
    else if (fid === 'obs-form') {   // vínculo com o Obsidian: o servidor valida de novo tudo (cofre, pastas e caminhos)
      const byProject = {}; for (const el of f.querySelectorAll('[data-obs-proj]')) if (el.value.trim()) byProject[el.dataset.obsProj] = el.value.trim();
      ctx.obsidian = await api('obsidian/config', { enabled: $('obs-enabled').checked, vault: $('obs-vault').value, exclude: $('obs-exclude').value.split(',').map(x => x.trim()).filter(Boolean), allowWrite: f.querySelector('input[name=obs-mode]:checked')?.value === 'write', writeFolder: $('obs-wfolder').value, byProject });
      ctx.obsPreview = null; notify(ctx.obsidian.enabled ? (ctx.obsidian.allowWrite ? 'Obsidian ligado: lê as suas notas e cria notas novas ao aprovar entregas.' : 'Obsidian ligado em modo “Só ler”.') : 'Vínculo com o Obsidian desligado.'); render();
    }
    else if (fid === 'routine-form') { await saveRoutine(); ctx.ui.panel = null; notify('Rotina salva.'); render(); }
  } catch (err) { notify(err.message, true); if (fid === 'login-form') { ctx.ui.loginError = err.message; renderLogin(); } }
  finally { if ($('send')) $('send').disabled = !(V.targetOf(ctx) === 'assistant' || (ctx.project && ctx.state.agents.length)); }
});

// Modelos e níveis de esforço que a IA escolhida aceita (lista vem do servidor; a pessoa ainda pode digitar outro modelo).
async function fillModelOptions(provider, current = {}) {
  const f = $('agent-form'), sel = f.elements.effort, dl = $('agent-models'); let info = { models: [], efforts: [] };
  try { info = await api('models?provider=' + encodeURIComponent(provider)); } catch {}
  dl.innerHTML = (info.models || []).map(m => `<option value="${V.esc(m.id)}">${V.esc(m.label)}</option>`).join('');
  const hint = $('model-hint'); if (hint) hint.textContent = info.models?.length ? 'Escolha uma sugestão ou digite o ID de modelo aceito pela CLI. Em cada tarefa, o Code Room mostra o modelo reportado pelo provedor quando disponível.' : 'Não há catálogo disponível para esta IA nesta máquina. Você ainda pode digitar o ID aceito pela CLI; vazio usa o padrão da conta.';
  const keep = current.effort ?? sel.value; sel.innerHTML = '<option value="">Padrão da IA</option>' + (info.efforts || []).map(e => `<option value="${e.id}">${V.esc(e.label)}</option>`).join(''); sel.value = (info.efforts || []).some(e => e.id === keep) ? keep : '';
  sel.disabled = !(info.efforts || []).length; $('effort-hint').textContent = sel.disabled ? 'Esta IA não tem ajuste de esforço.' : 'Mais esforço pensa mais e gasta mais cota. “Padrão da IA” usa o que ela já está configurada.';
}
let pickedSkills = new Set();
// Navegador do agente: "separado" só para Claude Code e Codex; "meu Chrome" só para Claude Code. Opção que não vale para a IA escolhida fica desligada.
function syncBrowserOptions() {
  const f = $('agent-form'), p = f.elements.provider.value, sel = f.elements.browser;
  const okIso = p === 'claude' || p === 'codex', okChrome = p === 'claude';
  sel.querySelector('[value=isolado]').disabled = !okIso; sel.querySelector('[value=chrome]').disabled = !okChrome;
  if ((sel.value === 'isolado' && !okIso) || (sel.value === 'chrome' && !okChrome)) sel.value = 'off';
  sel.disabled = !okIso;
}
function editAgent(id) {
  const f = $('agent-form'); f.reset();
  const sel = f.elements.provider; [...sel.querySelectorAll('[data-custom]')].forEach(o => o.remove()); for (const c of ctx.state.connectors || []) if (c.custom) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name + (c.available ? '' : ' (não encontrada)'); o.dataset.custom = '1'; sel.append(o); } const a = ctx.state.agents.find(x => x.id === id);
  for (const k of ['id', 'name', 'role', 'room', 'provider', 'model', 'mode', 'instructions', 'effort']) f.elements[k].value = a?.[k] ?? (k === 'provider' ? 'codex' : k === 'mode' ? 'read' : '');
  f.elements.commands.value = (a?.commands || []).join(', '); f.elements.mcpTools.value = (a?.mcpTools || []).join(', '); f.elements.browser.value = a?.browser || 'off'; f.elements.web.checked = !!a?.web; fillModelOptions(f.elements.provider.value, { effort: a?.effort || '' }); syncBrowserOptions();
  f.querySelectorAll('[name=cap]').forEach(c => c.checked = !!a?.capabilities?.includes(c.value));
  pickedSkills = new Set(a?.skillIds || []); $('agent-skill-q').value = ''; $('agent-title').textContent = a ? 'Editar agente' : 'Novo agente'; renderPicker(); $('agent-dialog').showModal();
  if (!ctx.skills.length) loadSkills().then(renderPicker);
}
function renderPicker() {
  const q = $('agent-skill-q').value.toLowerCase(), list = ctx.skills.filter(s => s.recognized && s.preferred !== false && (pickedSkills.has(s.id) || s.name.toLowerCase().includes(q)));
  $('agent-skills').innerHTML = list.slice(0, 80).map(s => `<label class="check"><input type="checkbox" value="${esc(s.id)}" ${pickedSkills.has(s.id) ? 'checked' : ''}><span>${esc(s.name)} <small class="muted">${esc(s.source)}${s.missingDependencies.length ? ' · dependência ausente (bloqueia a execução)' : ''}</small></span></label>`).join('') || '<p class="muted small">Nenhuma skill reconhecida neste filtro.</p>';
}
$('agent-skill-q').oninput = renderPicker;
$('agent-skills').onchange = e => { if (e.target.checked) { if (pickedSkills.size >= 8) { e.target.checked = false; notify('Máximo de 8 skills por agente.', true); return; } pickedSkills.add(e.target.value); } else pickedSkills.delete(e.target.value); };
$('agent-caps').innerHTML = Object.entries(V.CAPS).map(([k, v]) => `<label class="check"><input type="checkbox" name="cap" value="${k}"> ${esc(v)}</label>`).join('');
for (const [id, d] of [['retry-cancel', 'confirm-dialog'], ['flowtest-cancel', 'flowtest-dialog']]) $(id).onclick = () => $(d).close();

// ---------- Ciclo de vida ----------
document.addEventListener('visibilitychange', () => {
  applyPrefs();
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyPrefs);

// ---------- Autocompletar do chat: "/" lista as skills instaladas, "@" lista os agentes ----------
let pop = null;
const PROVIDER_NAMES = { codex: 'Codex', claude: 'Claude Code', agy: 'Antigravity', hermes: 'Hermes' };
const esc2 = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function skillChoices(q = '', exact = false) {
  const seen = new Map();
  for (const s of ctx.skills || []) { if (!s.recognized) continue; const cur = seen.get(s.name); if (!cur || (s.preferred && !cur.preferred)) seen.set(s.name, s); }
  q = q.toLowerCase();
  const all = [...seen.values()];
  if (exact) return all.filter(s => s.name.toLowerCase() === q);
  return all.filter(s => !q || s.name.toLowerCase().includes(q)).sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1) || a.name.localeCompare(b.name)).slice(0, 8);
}
function tokenAtCaret() {
  const ta = $('mission'); if (!ta || document.activeElement !== ta) return null;
  const pos = ta.selectionStart, m = ta.value.slice(0, pos).match(/(^|\s)([\/@#])([\w.:À-ÿ-]*)$/);
  return m ? { ch: m[2], q: m[3].toLowerCase(), from: pos - m[3].length - 1, to: pos } : null;
}
function updatePop() {
  const t = tokenAtCaret(), old = $('slash-pop'), box = document.querySelector('#composer-root .composer');
  if (!t || !box) { old?.remove(); pop = null; return; }
  const items = t.ch === '/'
    ? skillChoices(t.q).map(s => ({ label: '/' + s.name, hint: s.description.slice(0, 90), insert: '/' + s.name + ' ' }))
    : t.ch === '#' ? ctx.state.projects.filter(p => !t.q || p.name.toLowerCase().includes(t.q.replace(/_/g, ' '))).slice(0, 8).map(p => ({ label: '#' + p.name, hint: p.area || 'Projeto', insert: projectToken(p.name) + ' ' }))
    : ctx.state.agents.filter(a => (!ctx.project || ctx.projectAgentIds().has(a.id)) && (!t.q || a.name.toLowerCase().includes(t.q))).slice(0, 8).map(a => ({ label: '@' + a.name, hint: `${PROVIDER_NAMES[a.provider] || a.provider} · ${a.role}`, insert: '@' + a.name.replace(/\s+/g, '_') + ' ' }));
  if (!items.length) { old?.remove(); pop = { items: [], t, sel: 0 }; return; }
  const sel = Math.min(pop?.sel || 0, items.length - 1); pop = { items, t, sel };
  const html = `<div id="slash-pop" class="slash-pop" role="listbox" aria-label="${({ '/': 'Skills', '#': 'Projetos' })[t.ch] || 'Agentes'}"><div class="slash-h">${({ '/': 'Skills instaladas (valem para qualquer agente)', '#': 'Projetos (a missão vai para o projeto escolhido)' })[t.ch] || 'Agentes'}</div>${items.map((it, i) => `<button type="button" role="option" aria-selected="${i === sel}" class="${i === sel ? 'on' : ''}" data-pick="${i}"><b>${esc2(it.label)}</b><small>${esc2(it.hint)}</small></button>`).join('')}</div>`;
  if (old) old.outerHTML = html; else box.insertAdjacentHTML('beforeend', html);
}
function pickItem(i) {
  if (!pop?.items[i]) return; const ta = $('mission'), { t, items } = pop;
  ta.value = ta.value.slice(0, t.from) + items[i].insert + ta.value.slice(t.to); const c = t.from + items[i].insert.length; ta.setSelectionRange(c, c); ta.focus();
  $('slash-pop')?.remove(); pop = null;
}
document.addEventListener('input', e => { if (e.target.id === 'mission') { if (pop) pop.sel = 0; updatePop(); } if (e.target.id === 'provider-search') { const q = e.target.value.trim().toLocaleLowerCase(); document.querySelectorAll('.prov-pick').forEach(b => { b.hidden = !b.textContent.toLocaleLowerCase().includes(q); }); } });
document.addEventListener('keyup', e => { if (e.target.id === 'mission' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updatePop(); });
document.addEventListener('mousedown', e => { const b = e.target.closest?.('#slash-pop [data-pick]'); if (b) { e.preventDefault(); pickItem(Number(b.dataset.pick)); } });
document.addEventListener('keydown', e => {   // captura: roda antes do Enter que envia a missão
  if (e.target.id !== 'mission' || !pop?.items.length) return;
  const n = pop.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); pop.sel = (pop.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; updatePop(); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pickItem(pop.sel); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); $('slash-pop')?.remove(); pop = null; }
}, true);

const saveRename = async (input, save) => { const id = ctx.ui.renameId; if (!id) return; ctx.ui.renameId = null; const t = input.value.trim(); if (save && t) await asstCall('thread/rename', { id, title: t }); else renderAsst(); };
document.addEventListener('keydown', e => { if (!e.target.matches?.('.cw-rename')) return; if (e.key === 'Enter') { e.preventDefault(); saveRename(e.target, true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); saveRename(e.target, false); } }, true);
document.addEventListener('focusout', e => { if (e.target.matches?.('.cw-rename')) saveRename(e.target, true); });
document.addEventListener('dblclick', e => { const b = e.target.closest?.('.cw-th.on [data-act=asst-thread]'); if (b) actions['asst-thread-rename'](b.dataset.id); });
document.addEventListener('change', e => { if (e.target.id === 'asst-provider' && ctx.asst?.briefed) asstCall('provider', { provider: e.target.value }); });
$('update-dialog').addEventListener('cancel', e => { if (ctx.updates?.download?.state === 'installing') e.preventDefault(); });
$('update-dialog').addEventListener('close', () => { ctx.ui.updOpen = false; });
let started = false;
async function start() {
  try {
    ctx.state = await api('state'); ctx.authed = true;
    sessionStorage.setItem('code-room-key', key); $('login').hidden = true; $('shell').hidden = false;
    if (!ctx.state.projects.some(p => p.id === ctx.project) && !(ctx.project === '' && store.get('cr.general', '') === '1' && ctx.state.projects.length)) setProject(ctx.state.projects[0]?.id || '', true);
    loadSkills(); loadChecks(); applyPrefs(); render(); loadAsst(); setInterval(() => { if (ctx.authed && !document.hidden === false) loadAsst(); else if (ctx.authed) loadAsst(); }, 60000); maybeStartOnboarding(); loadUpdates(); setInterval(() => { if (!document.hidden) loadUpdates(); }, 30 * 60000);
    if (!started) { started = true; setInterval(tickClocks, 1000); setInterval(() => { if (!document.hidden && ctx.view === 'room') render(); }, 60000); setInterval(() => loadChecks(true), 120000); setInterval(() => { if (!document.hidden) refresh(); }, 15000); stream(); }
  } catch (e) { console.error('Code Room: falha ao iniciar:', e); ctx.authed = false; $('login').hidden = false; $('shell').hidden = true; ctx.ui.loginError = e.message; renderLogin(); }
}
applyPrefs();
if (pairFromHash) pairWith(pairFromHash).catch(e => { ctx.ui.loginError = e.message; $('login').hidden = false; renderLogin(); });
else if (key) start(); else { $('login').hidden = false; renderLogin(); }

document.addEventListener('pointerdown', e => { const m = $('agent-menu'); if (m && !m.contains(e.target)) closeAgentMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('agent-menu')) { const id = $('agent-menu').querySelector('[data-id]')?.dataset.id; closeAgentMenu(); document.querySelector(`[data-agent="${id}"]`)?.focus(); } });
