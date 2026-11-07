import { viewRecipes, panelRecipe, panelRecipeRun, readRecipeForm, draftFrom } from './recipes.js';
import { renderPhotoOffice, MAX_STATIONS } from './photo-office.js';
import * as V from './views.js';
import * as W from './views2.js';
import { icon } from './icons.js';
import { canvasHtml, bindCanvas, canvasBusy } from './canvas.js';
import * as O from './onboarding.js';
import * as U from './updates-ui.js';
import { assistantHtml } from './assistant-ui.js';
import { chatHeaderHtml, targetBodyHtml, bubbleHtml } from './chat-ui.js';
import { sayOf } from './mascot.js';
import { extractProject, projectToken } from './mentions.js';
// Os olhos do mascote acompanham o ponteiro (só com animações ligadas).
addEventListener('pointermove', e => { if (ctx.prefs?.anim === false) return; const r = document.documentElement.style; r.setProperty('--mx', ((e.clientX / innerWidth) * 2 - 1).toFixed(2)); r.setProperty('--my', ((e.clientY / innerHeight) * 2 - 1).toFixed(2)); }, { passive: true });
import { folderJobDialogHtml, noticesBarHtml, emptyJobForm, formFromJob, payloadFromJobForm } from './folderjobs-ui.js';
import { providerDialogHtml, emptyForm, formFromCatalog, formFromSpec, payloadFromForm } from './providers-ui.js';
import { LofiRadio, TRACKS } from './radio.js';

const $ = id => document.getElementById(id);
const { esc } = V;
// A chave pode vir do endereço (#chave), da sessão ou do token deste aparelho (celular pareado). "#pair=CÓDIGO" é um pareamento, não uma chave.
const hashVal = decodeURIComponent(location.hash.slice(1)), pairFromHash = hashVal.startsWith('pair=') ? hashVal.slice(5).toUpperCase() : '';
const DEVICE_KEY = 'code-room-device', lsGet = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
let key = (!pairFromHash && hashVal) || sessionStorage.getItem('code-room-key') || lsGet(DEVICE_KEY) || '';
if (hashVal) history.replaceState(null, '', location.pathname + location.search); // não deixa chave nem código na barra de endereços
if (location.hash) history.replaceState(null, '', location.pathname);
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const ctx = {
  state: { recipes: [], recipeRuns: [], projects: [], agents: [], teams: [], runs: [], flows: [], plans: [], routines: [], limits: {}, connectors: [], runtime: {} },
  view: 'room', project: store.get('cr.project', ''), room: '', detail: null, execTab: 'resumo', skills: [], audit: null, checks: null, modules: null, storage: null,
  projectContext: null, teamDraft: { id: null, name: 'Minha equipe', members: [] }, flows: {}, connection: 'connecting', maxStations: MAX_STATIONS,
  prefs: { motion: 'auto', list: false, board: true, musicHidden: false, ...store.get('cr.prefs', {}) },
  ui: { target: '', optsOpen: false, panel: null, panelId: null, whoOpen: false }, authed: false
};
const IDLE_MS = 10 * 60 * 1000, DONE_MS = 20 * 1000, FAIL_MS = 30 * 60 * 1000;
const dismissed = new Set(store.get('cr.dismissed', []));
let selectedAgent = null, officeHost = null, lastFocus = null, audioUrl = null;

// ---------- API ----------
async function api(path, body) {
  const r = await fetch('/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Code-Room-Key': key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401) logout('Chave inválida ou ausente.'); throw new Error(v.error || 'Não foi possível concluir.'); }
  return v;
}
function notify(msg, bad) { const n = $('notice'); n.textContent = msg; n.className = bad ? 'bad' : ''; n.hidden = false; clearTimeout(notify.t); notify.t = setTimeout(() => n.hidden = true, 9000); }
function logout(msg) { key = ''; ctx.authed = false; sessionStorage.removeItem('code-room-key'); try { localStorage.removeItem(DEVICE_KEY); } catch {} ctx.ui.loginError = msg || ''; $('shell').hidden = true; $('login').hidden = false; renderLogin(); }

// ---------- Derivações do estado real ----------
ctx.projectName = () => ctx.state.projects.find(p => p.id === ctx.project)?.name || '';
ctx.projectNameOf = id => ctx.state.projects.find(p => p.id === id)?.name || '';
ctx.rooms = () => [...new Set(ctx.state.agents.map(a => a.room || 'Geral'))].sort();
ctx.supervisorAgent = () => ctx.state.agents.find(a => a.id === store.get('cr.sup.' + ctx.project, ''));
// As 3 estações da cena mostram quem está mais "vivo": executando, decisão, aguardando, falha, concluído, disponível, inativo.
const PRIORITY = { running: 0, decision: 1, waiting: 2, queued: 2, failed: 3, done: 4, available: 5, idle: 6, disconnected: 7 };
ctx.viewMode = () => ctx.prefs.mode || (ctx.prefs.list ? 'list' : 'scene');
ctx.roomAgents = () => {
  const sup = ctx.supervisorAgent();
  return ctx.state.agents.filter(a => a.id !== sup?.id && (!ctx.room || a.room === ctx.room))
    .map(a => ({ a, p: PRIORITY[ctx.agentStatus(a).status] ?? 9 })).sort((x, y) => x.p - y.p || x.a.name.localeCompare(y.a.name)).map(x => x.a);
};
ctx.agentStatus = agent => {
  const label = k => V.AGENT_STATUS[k];
  const c = ctx.state.connectors.find(x => x.id === agent.provider), chk = ctx.checks?.find(x => x.id === agent.provider);
  if (c && !c.available || chk && (!chk.installed || chk.authenticated === false)) return { status: 'disconnected', label: label('disconnected') + (chk?.authenticated === false ? ' (sem login)' : ' (CLI ausente)') };
  // Ocupado em qualquer projeto conta como ocupado; falha, conclusão e inatividade valem só para o projeto atual.
  const all = ctx.state.runs.filter(t => t.agent.id === agent.id), mine = all.filter(t => !ctx.project || t.project.id === ctx.project);
  const by = st => all.find(t => st.includes(t.status));
  let t;
  if ((t = by(['running', 'cancelling']))) return { status: 'running', label: label('running'), task: t };
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
  return { kind: 'task', task: t, title: t.prompt.slice(0, 80) };
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
  const a = $('audio'); if (a) a.volume = p.volume ?? 0.7;
}
const savePrefs = () => { store.set('cr.prefs', ctx.prefs); applyPrefs(); };

// ---------- Dados e tempo real ----------
let refreshTimer = null;
const scheduleRefresh = (ms = 350) => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, ms); };
async function refresh() {
  try {
    ctx.state = await api('state'); syncProviderNames();
    if (!ctx.state.projects.some(p => p.id === ctx.project)) setProject(ctx.state.projects[0]?.id || '', true);
    for (const f of Object.values(ctx.flows)) if (f?.id) api('flows/' + f.id).then(v => { ctx.flows[f.id] = v; render(); }).catch(() => {});
    if (ctx.detail) ctx.detail = await api('tasks/' + ctx.detail.id).catch(() => ctx.detail);
    render();
  } catch { setConnection('lost'); }
}
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
const VIEWS = { room: V.viewRoom, tasks: V.viewTasks, exec: V.viewExecution, projects: V.viewProjects, teams: W.viewTeams, recipes: viewRecipes, agents: W.viewAgents, deliveries: W.viewDeliveries, skills: W.viewSkills, usage: W.viewUsage, routines: W.viewRoutines, connections: W.viewConnections, settings: W.viewSettings };
const TITLES = { room: 'Sala', tasks: 'Tarefas', exec: 'Execução', projects: 'Projetos', teams: 'Equipes', recipes: 'Receitas', agents: 'Agentes e ferramentas', deliveries: 'Entregas', skills: 'Skills', usage: 'Consumo e limites', routines: 'Rotinas', connections: 'Conexões', settings: 'Configurações' };
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
async function linkAgents(from, to, maxHops = 3) { try { await api('links', { projectId: ctx.project, from, to, maxHops }); notify('Ligação criada: quando o primeiro terminar, o segundo continua.'); await refresh(); } catch (e) { notify(e.message, true); } }
async function unlinkAgents(id) { if (!confirm('Remover esta ligação entre agentes?')) return; try { await api(`links/${id}/delete`, {}); await refresh(); } catch (e) { notify(e.message, true); } }
function render() {
  if (!ctx.authed) return;
  if (canvasBusy() || [...document.querySelectorAll('.ep-media video')].some(v => !v.paused && !v.ended)) { renderQueued = true; return; }   // não interrompe arrastar nem vídeo tocando   // não redesenha no meio de um arrastar
  const snap = snapshotForm();
  $('topbar').innerHTML = V.topbarHtml(ctx); $('rail').innerHTML = V.railHtml(ctx.view);
  $('view').setAttribute('aria-label', TITLES[ctx.view]);
  $('view').innerHTML = VIEWS[ctx.view](ctx);
  $('composer-root').innerHTML = V.composerBar(ctx);
  setTimeout(updatePop, 0);
  const panel = $('panel');
  const content = ctx.ui.panel === 'new-project' ? V.panelNewProject(ctx) : ctx.ui.panel === 'context' ? V.panelContext(ctx) : ctx.ui.panel === 'routine' ? W.panelRoutine(ctx) : ctx.ui.panel === 'recipe' ? panelRecipe(ctx) : ctx.ui.panel === 'recipe-run' ? panelRecipeRun(ctx) : '';
  panel.hidden = !content; if (content) panel.innerHTML = content;
  $('shell').classList.toggle('panel-open', !!content);
  restoreForm(snap);
  if (ctx.view === 'room' && ctx.viewMode() === 'canvas') { const slot = $('canvas-slot'); if (slot) { slot.innerHTML = canvasHtml(ctx); bindCanvas(slot, ctx, { onOpen: openDrawer, onLink: linkAgents, onUnlink: unlinkAgents, onEnd: () => { if (renderQueued) { renderQueued = false; render(); } } }); } }
  if (ctx.view === 'room' && ctx.viewMode() === 'scene') { const slot = $('office'); if (slot) { officeHost ||= document.createElement('div'); officeHost.id = 'office'; officeHost.className = 'office-host'; slot.replaceWith(officeHost); drawOffice(); } }
  document.querySelectorAll('.barchart i[data-h]').forEach(i => i.style.height = i.dataset.h + '%');
  const rt = ctx.state.runtime; $('runtime-foot').textContent = rt.version ? `v${rt.version} · serviço ${rt.memoryMB} MB${rt.paused ? ' · novas tarefas pausadas' : ''}` : '';
  tickClocks();
  if (selectedAgent) { const a = ctx.state.agents.find(x => x.id === selectedAgent); if (a) $('drawer').innerHTML = V.drawer(ctx, a); }
  $('onb-root').innerHTML = O.onboardingHtml(ctx); O.applyTourHighlight(document, ctx);
  $('update-bar').innerHTML = U.updateBarHtml(ctx) + noticesBarHtml(ctx); if (ctx.ui.updOpen) $('update-body').innerHTML = U.updateDialogHtml(ctx);
  applyPrefs(); renderAsst();
}
function drawOffice() {
  const model = a => { const s = ctx.agentStatus(a); return { agent: a, status: s.status === 'queued' ? 'waiting' : s.status, label: `${a.name}, ${a.role}. ${s.label}${s.task ? '. Tarefa: ' + s.task.prompt.slice(0, 60) : ''}` }; };
  const sup = ctx.supervisorAgent();
  renderPhotoOffice(officeHost, { stations: ctx.roomAgents().slice(0, ctx.maxStations).map(model), supervisor: sup ? model(sup) : null, onSelect: openDrawer });
}
const tickClocks = () => document.querySelectorAll('.clock[data-since]').forEach(el => el.textContent = V.dur(Date.now() - Date.parse(el.dataset.since)));

// ---------- Rádio da Sala ----------
let radio = null;
function updateRadioUi() {
  const on = !!radio?.playing, b = $('radio-btn'), v = $('radio-vol'); if (!b) return;
  b.textContent = on ? '⏸ Rádio Lo-Fi (tocando)' : '♪ Rádio Lo-Fi'; b.setAttribute('aria-pressed', String(on)); v.hidden = !on; $('radio-next').hidden = !on; if (!on) $('radio-track').textContent = ''; if (on) v.value = Math.round((radio.vol ?? 0.7) * 100);
}
$('radio-vol')?.addEventListener('input', e => { const x = Number(e.target.value) / 100; radio?.setVolume(x); store.set('cr.radio', { ...store.get('cr.radio', {}), volume: x }); });
document.addEventListener('visibilitychange', () => { if (!radio) return; if (document.hidden && ctx.prefs.musicHidden) radio.pause(); else if (!document.hidden) radio.resume(); });

// ---------- Atualização ----------
// ---------- Pastas de entrada (lotes) ----------
function readFjForm() { const f = $('fj-form'); if (!f) return; const d = Object.fromEntries(new FormData(f)); ctx.ui.fjForm = { ...(ctx.ui.fjForm || emptyJobForm(ctx.project)), name: d.name || '', projectId: d.projectId || '', dir: d.dir || '', exts: d.exts || '', who: d.who || '', instruction: d.instruction || '', outputNote: d.outputNote || '', parallel: d.parallel || 1 }; }
function renderFj() { if ($('fj-dialog').open || true) $('fj-body').innerHTML = folderJobDialogHtml(ctx); }
// ---------- Outras IAs (conectadas pela pessoa) ----------
function syncProviderNames() { for (const c of ctx.state.connectors || []) if (c.custom) { V.PROVIDER[c.id] = c.name; PROVIDER_NAMES[c.id] = c.name; } }
async function loadProviders() { try { ctx.providers = await api('providers'); } catch { ctx.providers = { catalog: [], custom: [], max: 10 }; } if (ctx.view === 'connections') render(); renderProv(); }
function readProvForm() { const f = $('prov-form'); if (!f) return; const d = Object.fromEntries(new FormData(f)); ctx.ui.provForm = { ...(ctx.ui.provForm || emptyForm()), name: d.name || '', exe: d.exe || '', promptVia: d.promptVia || 'arg', argsText: d.argsText || '', modelFlag: d.modelFlag || '' }; }
function renderProv() { const d = $('prov-dialog'); if (!d.open) return; $('prov-body').innerHTML = providerDialogHtml(ctx); }
async function testProv(payload, key) {
  ctx.ui.provTest = { ...(ctx.ui.provTest || {}), [key]: { running: true } }; render(); renderProv();
  try { ctx.ui.provTest[key] = await api('providers/test', payload); } catch (e) { ctx.ui.provTest[key] = { ok: false, error: e.message }; }
  render(); renderProv();
}
// ---------- Chat único (estilo mensageiro): janela flutuante com o Assistente e as missões diretas; balão quando minimizado ----------
let asstTimer = null;
if (ctx.ui.asstOpen === undefined) ctx.ui.asstOpen = store.get('cr.chat', {}).open ?? false;
function setChatOpen(v) {
  ctx.ui.asstOpen = !!v; store.set('cr.chat', { open: !!v }); renderAsst();
  if (v) { loadAsst(); setTimeout(() => $('mission')?.focus({ preventScroll: true }), 80); }
}
function renderAsst() {
  const win = $('chat'), bubble = $('chat-bubble'); if (!win) return;
  if (!ctx.authed) { win.hidden = true; bubble.hidden = true; return; }
  const open = !!ctx.ui.asstOpen, nA = (ctx.asst?.messages || []).filter(m => m.role === 'assistant').length;
  if (open || ctx.ui.chatSeen == null) ctx.ui.chatSeen = nA;
  win.hidden = !open; bubble.hidden = open; document.querySelector('.asst-btn')?.setAttribute('aria-pressed', String(open));
  const unread = !open && nA > ctx.ui.chatSeen, busy = !!(ctx.asst?.pending || ctx.asst?.briefing), bh = bubbleHtml(ctx, { unread, busy, alert: !open && (ctx.asst?.alerts || []).some(x => x.level !== 'info'), say: open ? '' : sayOf(ctx.asst, { unread }) });
  if (ctx.ui._bh !== bh) { bubble.innerHTML = bh; ctx.ui._bh = bh; } bubble.setAttribute('aria-label', unread ? 'Abrir o chat: resposta nova' : 'Abrir o chat');
  if (!open) return;
  const who = V.targetOf(ctx), head = chatHeaderHtml(ctx), body = who === 'assistant' ? assistantHtml(ctx.asst) : targetBodyHtml(ctx);
  if (ctx.ui._ch !== head) { $('chat-head').innerHTML = head; ctx.ui._ch = head; }
  if (ctx.ui._cb !== body) {
    const log = $('asst-log'), atEnd = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 60, n = ctx.asst?.messages?.length || 0, keep = $('asst').scrollTop;
    $('asst').innerHTML = body; ctx.ui._cb = body; const nl = $('asst-log');
    if (nl && (atEnd || n !== ctx.ui.asstCount || ctx.ui.asstThread !== ctx.asst?.thread)) nl.scrollTop = nl.scrollHeight; else $('asst').scrollTop = keep;
    ctx.ui.asstCount = n; ctx.ui.asstThread = ctx.asst?.thread;
  }
}
async function loadAsst() {
  try { ctx.asst = await api('assistant'); ctx.asstOk = true; } catch (e) { ctx.asstOk = false; ctx.asst = { connected: [], manual: { available: true }, messages: [], threads: [], error: e.message }; if (ctx.ui.target === 'assistant') ctx.ui.target = ''; render(); }
  renderAsst(); clearTimeout(asstTimer);
  if (ctx.asst?.pending || ctx.asst?.briefing) asstTimer = setTimeout(loadAsst, 1500);
}
// Envia o texto da barra do chat ao Assistente. Devolve true se foi enviado (a barra só esvazia nesse caso).
async function askAssistant(text) {
  if (!ctx.ui.asstOpen) setChatOpen(true);
  await loadAsst();
  if (ctx.asst?.pending) { notify('O Assistente ainda está respondendo. Espere um instante.', true); return false; }
  if (!ctx.asst?.briefed) { notify('Antes, apresente o Code Room à sua IA: use o botão no chat.'); return false; }
  ctx.asst = { ...ctx.asst, messages: [...(ctx.asst.messages || []), { id: 'tmp', role: 'user', text, at: new Date().toISOString() }], pending: { status: 'queued' } }; renderAsst(); asstCall('ask', { text, projectId: ctx.project || undefined }); return true;
}
async function applyAsst(id) {
  const [m, i] = id.split(':'); const r = await api('assistant/apply', { messageId: m, index: Number(i) }); ctx.asst = r.status;
  if (r.projectId) { await refresh(); setProject(r.projectId, true); } else await refresh();
  if (r.view) await go(r.view); renderAsst(); return r;
}
async function asstCall(path, body) { try { ctx.asst = (await api('assistant/' + path, body || {})) ; if (ctx.asst.status) ctx.asst = ctx.asst.status; } catch (e) { notify(e.message, true); } renderAsst(); clearTimeout(asstTimer); if (ctx.asst?.pending || ctx.asst?.briefing) asstTimer = setTimeout(loadAsst, 1500); }
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
  if (view === 'connections') loadProviders();
  if (view === 'connections' || view === 'agents') { loadChecks(true); loadModules(); }
  if (view === 'settings') loadStorage();
  if (view === 'usage') loadLimits();
  if (view === 'connections' || view === 'routines') loadPublish();
  if (view === 'deliveries') { const first = W.deliveryList(ctx)[0]; if (first) selectDelivery(first.key, true); }
  render(); $('view').focus({ preventScroll: true }); window.scrollTo(0, 0);
}
function setProject(id, silent) { ctx.project = id; store.set('cr.project', id); ctx.skills = []; ctx.audit = null; ctx.projectContext = null; if (!silent) { ctx.detail = null; loadSkills(); } }
async function loadSkills(withAudit) {
  if (!ctx.project) return; const id = ctx.project;
  try { const s = await api('skills?project=' + encodeURIComponent(id)); if (id === ctx.project) ctx.skills = s; render(); } catch {}
}
async function loadContext(id) { try { ctx.projectContext = await api(`projects/${id}/context`); render(); } catch {} }
async function loadChecks(force) { if (ctx.checks && !force) return; try { ctx.checks = await api('connectors/check'); render(); } catch {} }
async function loadModules() { try { ctx.modules = await api('modules'); render(); } catch {} }
async function loadPublish() { try { ctx.publish = await api('publish/status'); if (['connections', 'routines'].includes(ctx.view)) render(); } catch {} }
async function loadLimits() { try { ctx.limits = await api('usage/limits'); if (ctx.view === 'usage') render(); } catch {} }
async function loadRemote() {
  try { ctx.whoami = (await api('whoami')).level; if (ctx.whoami === 'master') { ctx.net = await api('network'); ctx.devices = await api('devices'); } } catch (e) { notify(e.message, true); }
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
function openDrawer(id) { lastFocus = document.activeElement; selectedAgent = id; const a = ctx.state.agents.find(x => x.id === id); if (!a) return; const d = $('drawer'); d.innerHTML = V.drawer(ctx, a); d.hidden = false; d.querySelector('button')?.focus(); }
function closeDrawer() { const was = selectedAgent; selectedAgent = null; $('drawer').hidden = true; if (was && lastFocus?.isConnected) lastFocus.focus(); else if (was) document.querySelector(`[data-agent="${was}"]`)?.focus(); }
const lines = v => String(v || '').split('\n').map(s => s.trim()).filter(Boolean);
const concPost = async patch => { const c = ctx.state.runtime.concurrency || { global: 1, provider: {}, video: 1 }; await api('settings/concurrency', { global: c.global, provider: { codex: c.provider?.codex ?? 1, claude: c.provider?.claude ?? 1 }, video: c.video, ...patch }); };
const limitsPost = async patch => { const l = ctx.state.limits || {}; await api('settings/limits', { timeoutMin: Math.round((l.timeoutMs || 1200000) / 60000), budgetUsd: l.budgetUsd ?? null, budgetEnabled: !!l.budgetEnabled, ...patch }); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- Ações ----------
const actions = {
  agent: id => openDrawer(id), task: (id, el) => openTask(id, el?.dataset.tab), tab: id => { ctx.execTab = id; render(); },
  'close-drawer': closeDrawer, dismiss: id => { dismissed.add(id); store.set('cr.dismissed', [...dismissed].slice(-200)); render(); }, who: () => { ctx.ui.whoOpen = !ctx.ui.whoOpen; render(); }, logout: () => logout(), 'show-key': () => { const v = $('access-key')?.value; ctx.ui.showKey = !ctx.ui.showKey; renderLogin(); if ($('access-key')) $('access-key').value = v || ''; $('access-key')?.focus(); },
  'first-access': () => { const v = $('access-key')?.value; ctx.ui.firstAccess = !ctx.ui.firstAccess; renderLogin(); if ($('access-key')) $('access-key').value = v || ''; },
  'toggle-list': () => { ctx.prefs.mode = ctx.viewMode() === 'list' ? 'scene' : 'list'; savePrefs(); render(); }, 'view-mode': id => { ctx.prefs.mode = ['scene', 'list', 'canvas'].includes(id) ? id : 'scene'; savePrefs(); render(); }, 'toggle-board': () => { ctx.prefs.board = ctx.prefs.board === false; savePrefs(); render(); },
  'pause-toggle': async () => { await api('queue/pause', { paused: !ctx.state.runtime.paused }); await refresh(); },
  cancel: async id => { await api(`tasks/${id}/cancel`, {}); notify('Cancelamento solicitado. A árvore de processos desta tarefa será encerrada.'); await refresh(); },
  retry: id => { const d = $('confirm-dialog'); d.dataset.id = id; d.showModal(); },
  'accept-plan': async id => { await api(`plans/${id}/accept`, {}); notify('Plano aceito. As tarefas foram criadas.'); await refresh(); },
  opts: async () => { ctx.ui.optsOpen = !ctx.ui.optsOpen; const tg = V.targetOf(ctx); if (ctx.ui.optsOpen && tg.startsWith('a:')) { const ag = ctx.state.agents.find(x => x.id === tg.slice(2)); if (ag && !ctx.models?.[tg]) { try { const info = await api('models?provider=' + encodeURIComponent(ag.provider)); ctx.models = { ...(ctx.models || {}), [tg]: info.models }; ctx.efforts = { ...(ctx.efforts || {}), [tg]: info.efforts }; } catch {} } } render(); }, 'full-out': () => { ctx.ui.fullOut = !ctx.ui.fullOut; render(); }, 'focus-composer': () => $('mission')?.focus(),
  'new-project': () => { ctx.ui.panel = 'new-project'; render(); $('panel').querySelector('input')?.focus(); },
  'pick-project': id => { setProject(id); go('room'); }, 'proj-filter': id => { ctx.ui.projFilter = id; render(); },
  'open-folder': async id => { await api(`projects/${id}/open`, {}); notify('Pasta aberta no Explorer.'); },
  'proj-context': async id => { ctx.ui.panel = 'context'; ctx.ui.panelId = id; ctx.projectContext = null; render(); await loadContext(id); },
  'close-panel': () => { ctx.ui.panel = null; render(); },
  'new-agent': () => editAgent(), 'edit-agent': id => editAgent(id), 'agents-tab': id => { ctx.ui.agentsTab = id; if (id === 'tools') { loadChecks(true); } render(); },
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
    if (id === 'pref-net-lan' || id === 'pref-net-ts') { const c = ctx.net.config; ctx.net = await api('network', { lan: id === 'pref-net-lan' ? !c.lan : c.lan, tailscale: id === 'pref-net-ts' ? !c.tailscale : c.tailscale }); ctx.pairing = null; render(); return; }
    if (id === 'pref-autosup') { p.autoSupervisor = !p.autoSupervisor; savePrefs(); }
    else if (id === 'pref-anim') { p.anim = p.anim === false; savePrefs(); }
    else if (id === 'pref-reduce') { p.reduce = !p.reduce; savePrefs(); }
    else if (id === 'pref-pausehidden') { p.musicHidden = !p.musicHidden; savePrefs(); }
    else if (id === 'pref-budget') { const l = ctx.state.limits || {}; if (l.budgetUsd == null && !l.budgetEnabled) throw new Error('Defina um orçamento antes de ativar a pausa.'); await limitsPost({ budgetEnabled: !l.budgetEnabled }); await refresh(); }
    render();
  },
  'tool-sel': id => { ctx.ui.toolSel = id; render(); }, 'tool-help': id => { ctx.ui.toolSel = id; ctx.ui.agentsTab = 'tools'; render(); },
  'test-tool': async id => { await loadChecks(true); const i = ctx.checks?.find(c => c.id === id); notify(i?.installed ? `${V.PROVIDER[id]}: ${i.version || 'versão indisponível'} · login ${i.authenticated == null ? 'não verificado' : i.authenticated ? 'ativo' : 'inativo'}.` : `${V.PROVIDER[id]} não encontrado.`, !i?.installed); },
  copy: async id => { try { await navigator.clipboard.writeText(id); notify('Comando copiado. Cole no terminal.'); } catch { notify('Não foi possível copiar: selecione o texto manualmente.', true); } },
  'skill-sel': id => { ctx.ui.skillSel = id; render(); }, 'skill-more': () => { ctx.ui.skillMore = true; render(); },
  // ---- Rádio da Sala: lo-fi gerado no navegador. Desligada por padrão; só toca quando a pessoa clica (o navegador não permite tocar sozinho). ----
  'radio-next': () => radio?.nextTrack(),
  'radio-toggle': async () => {
    if (radio?.playing) { radio.stop(); radio = null; }
    else { radio = new LofiRadio({ track: store.get('cr.radio', {}).track ?? 0, onTrack: (t, i) => { $('radio-track').textContent = `faixa ${i + 1}/${TRACKS.length}: ${t.name}`; store.set('cr.radio', { ...store.get('cr.radio', {}), track: i }); } }); radio.vol = store.get('cr.radio', {}).volume ?? 0.7; try { await radio.start(); } catch (e) { radio = null; notify(e.message, true); } }
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
  'prov-open': async () => { ctx.ui.provForm = emptyForm(); ctx.ui.provTest = {}; if (!ctx.providers) await loadProviders(); $('prov-dialog').showModal(); renderProv(); loadProviders(); },
  'prov-close': () => { $('prov-dialog').close(); },
  'prov-pick': key => { const c = ctx.providers?.catalog?.find(x => x.key === key); if (!c) return; ctx.ui.provForm = formFromCatalog(c); ctx.ui.provTest = { ...(ctx.ui.provTest || {}), form: null }; renderProv(); },
  'prov-edit': async id => { const s = ctx.providers?.custom?.find(x => x.id === id); if (!s) return; ctx.ui.provForm = formFromSpec(s); ctx.ui.provTest = { ...(ctx.ui.provTest || {}), form: null }; $('prov-dialog').showModal(); renderProv(); },
  'prov-delete': async id => { const s = ctx.providers?.custom?.find(x => x.id === id); if (!s || !confirm(`Remover “${s.name}”? Os agentes que usam esta IA precisam ser trocados antes.`)) return; ctx.providers = await api('providers/delete', { id }); await refresh(); notify('IA removida.'); },
  'prov-test': id => testProv({ id }, id),
  'prov-test-form': () => { readProvForm(); testProv(payloadFromForm(ctx.ui.provForm), 'form'); },
  'skill-cat': id => { ctx.ui.skillCat = id || ''; ctx.ui.skillMore = false; render(); },
  'asst-toggle': () => setChatOpen(!ctx.ui.asstOpen),
  'chat-open': () => setChatOpen(true),
  'chat-min': () => setChatOpen(false),
  'asst-thread-rename': id => { ctx.ui.renameId = id; renderAsst(); const i = document.querySelector('.cw-rename'); if (i) { i.focus(); i.select(); } },
  'asst-help': id => { const al = ctx.asst?.alerts?.find(x => x.id === id); if (al) return askAssistant(al.ask); },
  'asst-alert-dismiss': id => asstCall('alerts/dismiss', { id }),
  'asst-new-thread': () => asstCall('thread/new'),
  'asst-thread': id => asstCall('thread/select', { id }),
  'asst-thread-del': id => { if (confirm('Apagar esta conversa? O histórico dela some.')) return asstCall('thread/delete', { id }); },
  'asst-brief': () => asstCall('brief', { provider: $('asst-provider')?.value }),
  'asst-reset': () => asstCall('reset'),
  'asst-suggest': q => { const ta = $('mission'); if (!ta) return; ta.value = q; ta.focus(); ta.setSelectionRange(q.length, q.length); },
  'asst-apply': async id => { try { await applyAsst(id); } catch (e) { notify(e.message, true); try { ctx.asst = await api('assistant'); } catch {} renderAsst(); } },
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
  approve: async () => { const [id] = ctx.ui.delSel.split('|'); await api(`tasks/${id}/approve`, { note: $('review-note')?.value || '' }); ctx.ui.reviewNote = ''; notify('Entrega aprovada. Nada foi publicado.'); await refresh(); },
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
  'routine-tab': id => { ctx.ui.routineTab = id; render(); }, 'new-routine': () => { ctx.ui.panel = 'routine'; ctx.ui.panelId = null; render(); },
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
  theme: id => { ctx.prefs.theme = id; savePrefs(); render(); }, 'save-prefs': () => { savePrefs(); notify('Preferências salvas neste navegador.'); },
  'settings-tab': id => { ctx.ui.settingsTab = id; if (id === 'armazenamento') loadStorage(); if (id === 'acesso') loadRemote(); if (id === 'atualizacoes') loadUpdates(); render(); },
  'pair-submit': async () => { const code = ($('pair-code')?.value || '').trim(); if (!code) { ctx.ui.loginError = 'Digite o código de pareamento.'; renderLogin(); return; } try { await pairWith(code); } catch (e) { ctx.ui.loginError = e.message; renderLogin(); } },
  'refresh-limits': async () => { notify('Lendo os limites do Claude (uma chamada mínima)…'); try { ctx.limits = await api('usage/refresh', {}); notify('Leitura atualizada.'); } catch (e) { notify(e.message, true); } render(); },
  'pair-new': async () => { ctx.pairing = await api('devices/pair-code', {}); render(); },
  'revoke-device': async id => { await api(`devices/${id}/revoke`, {}); notify('Aparelho revogado.'); ctx.devices = await api('devices'); render(); },
  'copy-text': async id => { try { await navigator.clipboard.writeText(id); notify('Link copiado.'); } catch { notify('Não foi possível copiar: selecione o texto manualmente.', true); } },
  recheck: () => { ctx.checks = null; loadChecks(true); loadModules(); },
  'music-toggle': () => { const a = $('audio'); if (a.src) a.paused ? a.play() : a.pause(); else notify('Escolha um arquivo de áudio primeiro.', true); }
};
async function saveRoutine() {
  const f = $('routine-form'), d = Object.fromEntries(new FormData(f)), [tt, tid] = d.target.split(':');
  const trigger = d.ttype === 'manual' ? { type: 'manual' } : d.ttype === 'file' ? { type: 'file', ext: d.ext || '' } : { type: 'time', freq: d.freq, time: d.time, ...(d.freq === 'weekly' ? { day: Number(d.day) } : {}) };
  const r = await api('routines', { ...(d.id ? { id: d.id } : {}), name: d.name, projectId: d.projectId, target: { type: tt === 'a' ? 'agent' : tt === 'r' ? 'recipe' : 'team', id: tid }, objective: d.objective, trigger, attempts: Number(d.attempts) });
  await refresh(); return r;
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
  if (e.target.matches?.('#agent-form [name=provider]')) { fillModelOptions(e.target.value); }
  const t = e.target;
  try {
    if (t.id === 'project-select') { setProject(t.value); render(); }
    else if (t.id === 'room-filter') { ctx.room = t.value; render(); }
    else if (t.id === 'sup-select') { store.set('cr.sup.' + ctx.project, t.value); render(); }
    else if (t.id === 'usage-period') { ctx.ui.usagePeriod = t.value; render(); } else if (t.id === 'usage-project') { ctx.ui.usageProject = t.value; render(); }
    else if (t.id === 'routine-proj') { ctx.ui.routineProj = t.value; render(); }
    else if (t.id === 'pref-font') { ctx.prefs.font = t.value; savePrefs(); render(); }
    else if (t.id === 'pref-volume') { ctx.prefs.volume = Number(t.value) / 100; savePrefs(); render(); }
    else if (t.id === 'target') { ctx.ui.target = t.value; renderAsst(); const ms = $('mission'); if (ms) ms.placeholder = t.value === 'assistant' ? 'Conte o que você quer fazer…' : 'Digite a missão…  /skill  @agente'; $('send').disabled = !(t.value === 'assistant' || (ctx.project && ctx.state.agents.length)); }
    else if (t.dataset?.field && t.dataset.i != null) { ctx.teamDraft.members[Number(t.dataset.i)][t.dataset.field] = t.value; render(); }
    else if (t.id === 'music-file') { const f = t.files[0]; if (!f) return; if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = URL.createObjectURL(f); const a = $('audio'); a.src = audioUrl; a.play().catch(() => {}); notify('Tocando ' + f.name); }
    else if (t.dataset?.act === 'skill-agent') {
      const a = ctx.state.agents.find(x => x.id === t.dataset.agent); const ids = new Set(a.skillIds); if (t.checked) ids.add(t.dataset.id); else ids.delete(t.dataset.id);
      if (ids.size > 8) { t.checked = false; throw new Error('Máximo de 8 skills por agente.'); }
      await api('agents', { ...a, skillIds: [...ids] }); await refresh();
    }
  } catch (err) { notify(err.message, true); }
});
document.addEventListener('input', e => {
  const t = e.target, m = { 'proj-q': 'projQuery', 'tool-q': 'toolQ', 'skill-q': 'skillQ', 'routine-q': 'routineQ', 'review-note': 'reviewNote' }[t.id];
  if (m) { ctx.ui[m] = t.value; if (t.id !== 'review-note') render(); else { const c = t.parentElement.querySelector('.muted.small'); if (c) c.textContent = `${t.value.length}/500`; } }
});

// ---------- Formulários ----------
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, fid = f.getAttribute('id');
  try {
    if (fid === 'composer') {
      let target = $('target').value, text = $('mission').value.trim(); const criteria = lines($('criteria')?.value), requestId = crypto.randomUUID(), skillIds = [];
      // "@Agente" no começo escolhe quem executa; "/skill" em qualquer ponto anexa a skill (vale para qualquer agente)
      const mm = text.match(/^@([\w.:À-ÿ-]+)\s+/), mentioned = mm && ctx.state.agents.find(a => a.name.replace(/\s+/g, '_').toLowerCase() === mm[1].toLowerCase());
      if (mentioned) { target = 'a:' + mentioned.id; text = text.slice(mm[0].length).trim(); }
      if (target === 'assistant') { if (await askAssistant(text)) $('mission').value = ''; return; }
      let projId = ctx.project; const px = extractProject(text, ctx.state.projects); if (px.project) { projId = px.project.id; text = px.text; } else if (px.ambiguous) throw new Error('Mais de um projeto combina com o # que você escreveu. Escreva o nome inteiro.');
      for (const m of text.matchAll(/(?:^|\s)\/([\w.:-]+)/g)) { const s = skillChoices(m[1], true)[0]; if (s && !skillIds.includes(s.id)) skillIds.push(s.id); }
      if (skillIds.length && !target.startsWith('a:')) notify('As skills com "/" valem para agente individual; neste modo elas foram ignoradas.', true);
      if (!projId) throw new Error('Escolha ou cadastre um projeto.'); if (!target) throw new Error('Escolha quem executa.');
      $('send').disabled = true;
      if (target === 's') { await api('plans', { projectId: projId, supervisorId: ctx.supervisorAgent().id, request: text, requestId, autoAccept: false }); notify('O supervisor está planejando. Revise e aceite o plano na Sala.'); await go('room'); }
      else if (target.startsWith('t:')) { await api('flows', { projectId: projId, teamId: target.slice(2), requestId, objective: text, criteria, maxReviewRounds: ctx.prefs.rounds || 1 }); notify('Fluxo iniciado.'); }
      else { if (px.project) notify(`Missão enviada ao projeto “${px.project.name}”.`); const t = await api('tasks', { projectId: projId, agentId: target.slice(2), requestId, objective: text, criteria, skillIds, isolate: $('isolate')?.checked === true, model: $('ov-model')?.value.trim() || undefined, effort: $('ov-effort')?.value || undefined }); $('mission').value = ''; await refresh(); return openTask(t.id); }
      $('mission').value = ''; ctx.ui.optsOpen = false; await refresh();
    } else if (fid === 'link-form') {
      const fd = new FormData(f); if (fd.get('from') === fd.get('to')) throw new Error('Escolha dois agentes diferentes.'); await linkAgents(fd.get('from'), fd.get('to'), Number(fd.get('maxHops')) || 3);
    } else if (fid === 'followup-form') {
      const fd = new FormData(f), t = await api(`tasks/${fd.get('id')}/followup`, { agentId: fd.get('agentId'), message: fd.get('message'), requestId: crypto.randomUUID() });
      notify(t.resumed ? 'Continuando a mesma sessão.' : 'Nova missão iniciada com o resumo e os arquivos da anterior.'); await refresh(); return openTask(t.id);
    } else if (fid === 'login-form') { key = $('access-key').value.trim(); ctx.ui.loginError = ''; start(); }
    else if (fid === 'project-form') { const d = Object.fromEntries(new FormData(f)); const p = await api('projects', { name: d.name, path: d.path, area: d.area }); if (d.team) store.set('cr.team.' + p.id, d.team); ctx.ui.panel = null; setProject(p.id); await refresh(); notify('Projeto criado.'); }
    else if (fid === 'agent-form') { const d = Object.fromEntries(new FormData(f)); d.skillIds = [...pickedSkills]; d.commands = String(d.commands || '').split(/[,\s]+/).filter(Boolean); d.capabilities = [...f.querySelectorAll('[name=cap]:checked')].map(x => x.value); delete d.cap; if (!d.id) delete d.id; await api('agents', d); $('agent-dialog').close(); await refresh(); notify('Agente salvo.'); }
    else if (fid === 'flow-form') { const d = Object.fromEntries(new FormData(f)); await api('flows', { projectId: ctx.project, teamId: d.team, requestId: crypto.randomUUID(), objective: d.objective, criteria: lines(d.criteria), maxReviewRounds: ctx.prefs.rounds || 1 }); f.reset(); notify('Fluxo iniciado.'); await refresh(); }
    else if (fid === 'conc-form') { const d = Object.fromEntries(new FormData(f)), n = v => Number(v); await api('settings/concurrency', { global: n(d.global), provider: { codex: n(d.codex), claude: n(d.claude) }, video: n(d.video) }); notify('Limites salvos.'); await refresh(); }
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
    else if (fid === 'prov-form') { readProvForm(); ctx.providers = await api('providers', payloadFromForm(ctx.ui.provForm)); $('prov-dialog').close(); await refresh(); notify('IA conectada. Agora ela aparece ao criar um agente.'); }
    else if (fid === 'routine-form') { await saveRoutine(); ctx.ui.panel = null; notify('Rotina salva.'); render(); }
  } catch (err) { notify(err.message, true); if (fid === 'login-form') { ctx.ui.loginError = err.message; renderLogin(); } }
  finally { if ($('send')) $('send').disabled = !(V.targetOf(ctx) === 'assistant' || (ctx.project && ctx.state.agents.length)); }
});

// Modelos e níveis de esforço que a IA escolhida aceita (lista vem do servidor; a pessoa ainda pode digitar outro modelo).
async function fillModelOptions(provider, current = {}) {
  const f = $('agent-form'), sel = f.elements.effort, dl = $('agent-models'); let info = { models: [], efforts: [] };
  try { info = await api('models?provider=' + encodeURIComponent(provider)); } catch {}
  dl.innerHTML = (info.models || []).map(m => `<option value="${V.esc(m.id)}">${V.esc(m.label)}</option>`).join('');
  const keep = current.effort ?? sel.value; sel.innerHTML = '<option value="">Padrão da IA</option>' + (info.efforts || []).map(e => `<option value="${e.id}">${V.esc(e.label)}</option>`).join(''); sel.value = (info.efforts || []).some(e => e.id === keep) ? keep : '';
  sel.disabled = !(info.efforts || []).length; $('effort-hint').textContent = sel.disabled ? 'Esta IA não tem ajuste de esforço.' : 'Mais esforço pensa mais e gasta mais cota. “Padrão da IA” usa o que ela já está configurada.';
}
let pickedSkills = new Set();
function editAgent(id) {
  const f = $('agent-form'); f.reset();
  const sel = f.elements.provider; [...sel.querySelectorAll('[data-custom]')].forEach(o => o.remove()); for (const c of ctx.state.connectors || []) if (c.custom) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name + (c.available ? '' : ' (não encontrada)'); o.dataset.custom = '1'; sel.append(o); } const a = ctx.state.agents.find(x => x.id === id);
  for (const k of ['id', 'name', 'role', 'room', 'provider', 'model', 'mode', 'instructions', 'effort']) f.elements[k].value = a?.[k] ?? (k === 'provider' ? 'codex' : k === 'mode' ? 'read' : '');
  f.elements.commands.value = (a?.commands || []).join(', '); fillModelOptions(f.elements.provider.value, { effort: a?.effort || '' });
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
  applyPrefs(); const au = $('audio'); if (!au) return;
  if (document.hidden && !ctx.prefs.musicHidden && !au.paused) { au.pause(); au.dataset.resume = '1'; }
  else if (!document.hidden && au.dataset.resume) { delete au.dataset.resume; au.play().catch(() => {}); }
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
    : ctx.state.agents.filter(a => !t.q || a.name.toLowerCase().includes(t.q)).slice(0, 8).map(a => ({ label: '@' + a.name, hint: `${PROVIDER_NAMES[a.provider] || a.provider} · ${a.role}`, insert: '@' + a.name.replace(/\s+/g, '_') + ' ' }));
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
document.addEventListener('input', e => { if (e.target.id === 'mission') { if (pop) pop.sel = 0; updatePop(); } });
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
    if (!ctx.state.projects.some(p => p.id === ctx.project)) setProject(ctx.state.projects[0]?.id || '', true);
    loadSkills(); loadChecks(); applyPrefs(); render(); loadAsst(); maybeStartOnboarding(); loadUpdates(); setInterval(() => { if (!document.hidden) loadUpdates(); }, 30 * 60000);
    if (!started) { started = true; setInterval(tickClocks, 1000); setInterval(() => { if (!document.hidden && ctx.view === 'room') render(); }, 60000); setInterval(() => loadChecks(true), 120000); setInterval(() => { if (!document.hidden) refresh(); }, 15000); stream(); }
  } catch (e) { console.error('Code Room: falha ao iniciar:', e); ctx.authed = false; $('login').hidden = false; $('shell').hidden = true; ctx.ui.loginError = e.message; renderLogin(); }
}
applyPrefs();
if (pairFromHash) pairWith(pairFromHash).catch(e => { ctx.ui.loginError = e.message; $('login').hidden = false; renderLogin(); });
else if (key) start(); else { $('login').hidden = false; renderLogin(); }
