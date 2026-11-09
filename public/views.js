// Telas do Code Room (parte 1). Cada função recebe o contexto e devolve HTML.
// Guia visual: sem dados de demonstração, sem porcentagem inventada, ausência de dado ≠ zero.
import { icon } from './icons.js';
import { gitSectionHtml } from './git-ui.js';
import { referencesSectionHtml } from './refs-ui.js';
import { banner, heroScene, thumb, avatar, agentAv } from './art.js';
import { activityCardHtml, agentTip } from './activity.js';
import { unblockHtml } from './unblock-ui.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const STATUS = { queued: 'Na fila', waiting_dependency: 'Aguardando dependência', running: 'Em execução', cancelling: 'Cancelando', completed: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada', interrupted: 'Interrompida', blocked: 'Bloqueada', needs_decision: 'Aguardando decisão' };
export const AGENT_STATUS = { running: 'Executando', available: 'Disponível', idle: 'Inativo', waiting: 'Aguardando dependência', queued: 'Na fila', decision: 'Aguardando decisão', failed: 'Falhou', disconnected: 'Desconectado', done: 'Concluído' };
export const PROVIDER = { codex: 'Codex CLI', claude: 'Claude Code', agy: 'Antigravity (Gemini)', hermes: 'Hermes (remoto)' };
export const CAPS = { code: 'Código', review: 'Revisão', research: 'Pesquisa', writing: 'Texto', 'video.edit': 'Edição de vídeo', 'video.render': 'Render de vídeo', finance: 'Finanças', ops: 'Operações', supervise: 'Supervisão' };
export const ROLES = { desenvolvedor: 'Desenvolvedor', revisor: 'Revisor', editor: 'Editor', pesquisador: 'Pesquisador', financeiro: 'Financeiro', operacoes: 'Operações', supervisor: 'Supervisor' };
export const AREAS = ['Programação', 'Vídeo', 'Financeiro', 'Pesquisa', 'Operações', 'Geral'];
export const AREA_DOT = { Programação: 'var(--viol)', Vídeo: 'var(--accent-h)', Financeiro: '#f08a3c', Pesquisa: 'var(--ok)', Operações: 'var(--warn)', Geral: '#6b7280' };
export const num = v => v == null ? 'indisponível' : Number(v).toLocaleString('pt-BR');
export const time = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
export const hm = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
export const dur = ms => { if (ms == null || ms < 0) return '—'; const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const kb = b => b == null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1).replace('.', ',')} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
export const dotOf = s => ({ completed: 'ok', running: 'live', cancelling: 'warn', failed: 'bad', interrupted: 'bad', blocked: 'bad', queued: 'warn', waiting_dependency: 'warn', cancelled: 'idle', needs_decision: 'warn' }[s] || 'idle');
export const pillOf = s => ({ completed: 'ok', running: 'info', failed: 'bad', interrupted: 'bad', blocked: 'bad', queued: 'warn', waiting_dependency: 'warn', cancelling: 'warn', needs_decision: 'warn' }[s] || 'mute');
export const pill = (s, label) => `<span class="pill ${pillOf(s)}">${esc(label ?? STATUS[s] ?? s)}</span>`;
export const empty = t => `<div class="empty">${esc(t)}</div>`;
export const note = (t, ic = 'info', cls = '') => `<div class="note ${cls}">${icon(ic, 18)}<span>${t}</span></div>`;
export const inProject = (ctx, t) => !ctx.project || t.project.id === ctx.project;
// Retrato pelo papel: supervisor, revisor, editor e desenvolvedor; sem capacidade declarada, segue a ordem do agente.
export const idx = (ctx, a) => {
  const c = a.capabilities || [];
  if (c.includes('supervise')) return 3; if (c.includes('review')) return 1; if (c.some(k => k.startsWith('video') || k === 'writing')) return 2; if (c.includes('code')) return 0;
  return Math.max(0, ctx.state.agents.findIndex(x => x.id === a.id));
};
export function hero(title, sub, art = 'shelf', extra = '') {
  return `<div class="hero"><div class="copy"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>${extra ? `<div class="hero-actions">${extra}</div>` : ''}<div class="art-wrap">${banner(art)}</div></div>`;
}
const tabs = (items, cur, act) => `<div class="tabs" role="tablist">${items.map(([id, label, ic, n]) => `<button role="tab" aria-selected="${cur === id}" class="tab${cur === id ? ' on' : ''}" data-act="${act}" data-id="${id}">${ic ? icon(ic, 18) : ''}${esc(label)}${n != null ? ` <span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
const toggle = (id, on, label) => `<button class="toggle" role="switch" id="${id}" aria-checked="${on}" aria-label="${esc(label)}" data-act="toggle" data-id="${id}"></button>`;
export { tabs, toggle };

// ---------- Casca: barra de ícones e topo ----------
export const NAV = [['room', 'home', 'Sala'], ['projects', 'folder', 'Projetos'], ['tasks', 'check-square', 'Tarefas'], ['teams', 'users', 'Equipes'], ['recipes', 'layers', 'Receitas'], ['agents', 'terminal', 'Agentes e ferramentas'], ['deliveries', 'file', 'Entregas'], ['skills', 'sparkle', 'Skills'], ['usage', 'chart', 'Consumo e limites'], ['routines', 'calendar', 'Rotinas'], ['connections', 'plug', 'Conexões'], ['settings', 'gear', 'Configurações']];
// Menu em 3 grupos (trabalho, equipe e sistema) com separadores finos; os botões e o data-nav são os mesmos de sempre.
export const NAV_GROUPS = [['room', 'projects', 'tasks', 'deliveries'], ['agents', 'teams', 'recipes', 'skills', 'routines'], ['usage', 'connections', 'settings']];
export function railHtml(cur, badges = {}) {
  const btn = ([id, ic, label]) => { const n = badges[id] || 0; return `<button data-nav="${id}" title="${esc(label)}${n ? ` (${n} pendente${n > 1 ? 's' : ''})` : ''}" aria-label="${esc(label)}${n ? `, ${n} pendente${n > 1 ? 's' : ''}` : ''}" aria-current="${cur === id || (cur === 'exec' && id === 'tasks') ? 'page' : 'false'}">${icon(ic, 22)}${n ? `<span class="rb" aria-hidden="true">${n > 9 ? '9+' : n}</span>` : ''}</button>`; };
  return NAV_GROUPS.map(g => g.map(id => NAV.find(n => n[0] === id)).filter(Boolean).map(btn).join('')).join('<i class="rail-sep" role="separator" aria-hidden="true"></i>');
}
export function topbarHtml(ctx) {
  const online = ctx.state.agents.filter(a => ctx.agentStatus(a).status !== 'disconnected').length;
  return `<div class="brand"><span class="brand-name">Code <b>Room</b></span></div>
  <label class="project-pill"><span class="sr-only">Projeto</span><select id="project-select">${ctx.state.projects.length ? ctx.state.projects.map(p => `<option value="${esc(p.id)}" ${p.id === ctx.project ? 'selected' : ''}>${esc(p.name)}</option>`).join('') : '<option value="">Nenhum projeto</option>'}</select></label>
  <div class="top-right"><button type="button" class="btn ghost sm asst-btn" data-act="asst-toggle" aria-pressed="${!!ctx.ui.asstOpen}">Assistente</button><span class="online"><span class="dot d-${ctx.connection === 'live' ? 'ok' : ctx.connection === 'lost' ? 'warn' : 'idle'}"></span><span>${online} ${online === 1 ? 'agente conectado' : 'agentes conectados'}</span></span>
  <span class="pill ${ctx.connection === 'live' ? 'ok' : 'warn'}" role="status">${{ live: 'Conectado', connecting: 'Conectando…', lost: 'Reconectando…', off: 'Desconectado' }[ctx.connection]}</span>
  <div class="who"><button data-act="who" aria-haspopup="menu" aria-expanded="${!!ctx.ui.whoOpen}" aria-label="Menu do usuário">${avatar(1, 36)}${icon('down', 16)}</button>${ctx.ui.whoOpen ? `<div class="menu" role="menu"><button role="menuitem" data-nav="settings">${icon('palette', 18)} Aparência</button><button role="menuitem" data-act="onb-open">${icon('sparkle', 18)} Guia de boas-vindas</button><button role="menuitem" data-act="logout">${icon('lock', 18)} Bloquear painel</button></div>` : ''}</div></div>`;
}

// ---------- Entrada ----------
export function viewLogin(ctx) {
  return `<div class="login"><div class="tb"><div class="brand"><span class="brand-name">Code <b>Room</b></span></div></div>
  <div class="body"><div class="hero-side">${heroScene()}</div>
  <form class="box" id="login-form" autocomplete="off"><h1>Seu espaço de trabalho,<br><b>conectado.</b></h1><p class="sub">Projetos, agentes e ideias em um só lugar.</p>
    <div class="tabs" role="tablist"><span class="tab on" role="tab" aria-selected="true">${icon('terminal', 18)} Acesso local</span></div>
    <label class="f" for="access-key">Chave de acesso</label>
    <div class="input-icon"><input id="access-key" type="${ctx.ui.showKey ? 'text' : 'password'}" required autocomplete="off" placeholder="Cole a chave do arquivo .data/access.key"><button type="button" class="iconbtn" data-act="show-key" aria-label="${ctx.ui.showKey ? 'Ocultar chave' : 'Mostrar chave'}">${icon(ctx.ui.showKey ? 'eyeoff' : 'eye', 20)}</button></div>
    <button class="btn lg block" style="margin-top:16px">Entrar no Code Room ${icon('arrow', 18)}</button>
    <div class="or-line"><span>ou, pelo celular</span></div>
    <label class="f" for="pair-code">Código de pareamento</label>
    <div class="input-icon"><input id="pair-code" type="text" inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="12" placeholder="Gerado em Configurações › Acesso, no computador"></div>
    <button type="button" class="btn lg block outline" style="margin-top:10px" data-act="pair-submit">${icon('plug', 18)} Parear este aparelho</button>
    <p id="login-error" role="alert" class="small" style="margin-top:8px;color:var(--bad);min-height:1.2em">${esc(ctx.ui.loginError || '')}</p>
    <p style="text-align:center;margin-top:6px"><button type="button" class="link" data-act="first-access">${icon('gear', 18)} Configurar primeiro acesso</button></p>
    ${ctx.ui.firstAccess ? `<ol class="help-steps"><li>Abra o Code Room pelo arquivo <code>Iniciar-Code-Room.cmd</code>: ele já entra com a chave.</li><li>Ou abra o arquivo <code>.data\\access.key</code> na pasta do aplicativo e cole o conteúdo acima.</li><li>A chave fica só neste computador. Não compartilhe a pasta <code>.data</code>.</li></ol>` : ''}
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><p class="muted small" style="text-align:center">${icon('lock', 16)} A chave protege o acesso a esta instalação.</p></form></div>
  <div class="foot" style="display:flex"><span>Code Room local</span><span class="credit">Desenvolvido por <a href="https://www.agenciabytelab.com.br" target="_blank" rel="noopener noreferrer">Bytelab</a></span></div></div>`;
}

// ---------- Sala ----------
// "Precisa de você agora": só o que espera uma decisão sua (créditos, prévias, falhas dos lotes). Sem pendência, o cartão some.
export function pendingList(ctx) {
  const s = ctx.state || {}, items = [];
  const blocked = (s.runs || []).filter(r => r.status === 'completed' && (r.unblock || []).some(u => u.kind !== 'never') && Date.now() - Date.parse(r.updatedAt || 0) < 3 * 864e5);
  if (blocked.length) items.push({ kind: 'warn', text: `${blocked.length} agente${blocked.length > 1 ? 's foram bloqueados' : ' foi bloqueado'} por falta de liberação (abra a tarefa e libere)`, nav: 'tasks', n: blocked.length });
  for (const b of s.batches || []) {
    if (b.status === 'aguardando_creditos') items.push({ kind: 'warn', text: `Liberar créditos do lote “${b.name}”`, nav: 'routines', n: 1, batch: true });
    for (const ep of b.episodes || []) {
      if (ep.status === 'aguardando_previa') items.push({ kind: 'warn', text: `Aprovar a prévia: ${ep.title}`, nav: 'routines', n: 1, batch: true });
      else if (ep.status === 'falhou') items.push({ kind: 'bad', text: `Falhou: ${ep.title}${ep.note ? ' — ' + ep.note.slice(0, 70) : ''}`, nav: 'routines', n: 1, batch: true });
    }
  }
  const recent = r => { const at = Date.parse(r.createdAt); return !at || Date.now() - at < 14 * 86400000; };   // só as dos últimos 14 dias: o que ficou antigo não vira ruído
  const open = (s.runs || []).filter(r => r.status === 'completed' && !r.review && r.kind !== 'plan' && r.step !== 'review' && (r.deliverables || []).length && recent(r)), dels = open.filter(r => inProject(ctx, r)).length, others = open.length - dels;
  const first = open.filter(r => inProject(ctx, r)).sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')))[0], firstFile = first && ((first.deliverables || []).find(f => !/\.(log|py|mjs|js|json|ps1|sh|cmd|lock)$/i.test(f.path)) || first.deliverables[0]);
  if (dels) items.push({ kind: 'info', text: `${dels} entrega${dels > 1 ? 's' : ''} para revisar (aprovar ou pedir ajustes)`, nav: 'deliveries', n: dels, deliveries: true, key: firstFile ? `${first.id}|${firstFile.path}` : '' });
  if (others) items.push({ kind: 'info', text: `${others} entrega${others > 1 ? 's' : ''} para revisar em outros projetos (troque o projeto no topo)`, nav: '', n: others });
  const helps = (s.subtasks || []).filter(x => x.status === 'proposed' && (!ctx.project || x.projectId === ctx.project)).length;
  if (helps) items.push({ kind: 'warn', text: `${helps} pedido${helps > 1 ? 's' : ''} de ajuda entre agentes para aprovar`, nav: 'tasks', n: helps });
  const posts = (s.socialProposals || []).length;
  if (posts) items.push({ kind: 'warn', text: `${posts} postagem${posts > 1 ? 's' : ''} em redes sociais para aprovar`, nav: 'connections', n: posts });
  const plans = (s.plans || []).filter(p => p.status === 'proposed').length;
  if (plans) items.push({ kind: 'warn', text: `${plans} plano${plans > 1 ? 's' : ''} do Supervisor para aceitar`, nav: 'tasks', n: plans });
  for (const r of s.recipeRuns || []) if (r.status === 'waiting') items.push({ kind: 'warn', text: `Receita “${r.name}” espera a sua aprovação`, nav: 'recipes', n: 1 });
  return items;
}
export const pendingBadges = ctx => { const it = pendingList(ctx); return { room: it.reduce((a, x) => a + x.n, 0), deliveries: it.filter(x => x.deliveries).reduce((a, x) => a + x.n, 0) }; };
// "Precisa de você agora": só o que espera uma decisão sua (créditos, prévias, falhas dos lotes, entregas, planos e receitas). Sem pendência, o cartão some.
export function needsYou(ctx) {
  const items = pendingList(ctx); if (!items.length) return '';
  const total = items.reduce((a, x) => a + x.n, 0);
  return `<section class="card" id="needs-you"><div class="card-h"><h2>Precisa de você agora</h2><span class="pill warn">${total}</span></div><ul class="plain">${items.slice(0, 6).map(x => `<li class="ny-row"><span class="pill ${x.kind}">${esc(x.text)}</span>${x.key ? ` <button class="link" data-act="pend-open" data-id="${esc(x.key)}">Abrir a mais recente</button>` : x.nav ? ` <button class="link" data-nav="${x.nav}">Abrir</button>` : ''}</li>`).join('')}</ul></section>`;
}
export function viewRoom(ctx) {
  const agents = ctx.roomAgents(), sup = ctx.supervisorAgent(), rooms = ctx.rooms(), run = ctx.currentMission(), mode = ctx.viewMode();
  const stations = agents.slice(0, ctx.maxStations), more = agents.length - stations.length;
  const strip = agents.slice(0, 3).map(a => { const s = ctx.agentStatus(a); return `<button class="s" data-act="agent" data-id="${esc(a.id)}" title="${esc(agentTip(ctx, a))}"><span class="dot d-${s.status}"></span><b>${esc(a.name)}</b> · ${esc(s.label)}</button>`; }).join('') || '<span class="muted">Nenhum agente neste ambiente.</span>';
  const caps = [...new Set(agents.flatMap(a => a.capabilities || []))].filter(c => c !== 'supervise');
  const capChip = c => `<span class="chip ${c === 'code' ? 'c-code' : c.startsWith('video') ? 'c-video' : c === 'research' ? 'c-res' : ''}">${icon(c === 'code' ? 'code' : c.startsWith('video') ? 'film' : c === 'research' ? 'search' : 'sparkle', 16)} ${esc(CAPS[c] || c)}</span>`;
  const u = ctx.usageTotals(ctx.state.runs.filter(t => inProject(ctx, t)));
  const supText = !sup ? 'Escolha um agente somente leitura para planejar missões.' : ctx.agentStatus(sup).status === 'running' ? 'Estou planejando a missão.' : ctx.state.runs.some(t => inProject(ctx, t) && ['running', 'queued', 'waiting_dependency'].includes(t.status)) ? 'Estou acompanhando a execução.' : 'Aguardando uma missão.';
  return `<div class="page" style="padding-top:16px"><div class="cols c-2-1">
    <section class="card scene-card" aria-label="Escritório">
      <div class="scene-tools"><label class="small muted">Ambiente <select id="room-filter" style="display:inline-block;width:auto;margin-left:6px">${ctx.projectAgentIds?.().size ? `<option value="@projeto" ${ctx.roomMode() === '@projeto' ? 'selected' : ''}>Deste projeto (${ctx.projectAgentIds().size})</option>` : ''}<option value="" ${ctx.roomMode() === '' ? 'selected' : ''}>Todos</option>${rooms.map(r => `<option ${r === ctx.roomMode() ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label><span class="seg" role="group" aria-label="Modo de visualização">${[['scene', 'Cenário'], ['list', 'Lista'], ['canvas', 'Canvas']].map(([k, l]) => `<button type="button" class="${mode === k ? 'on' : ''}" data-act="view-mode" data-id="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</span></div>
      ${mode === 'canvas' ? '<div id="canvas-slot"></div>' : mode === 'list' ? `<div class="agent-list" style="padding:0 14px 14px">${agents.map(a => agentRow(ctx, a)).join('') || empty('Crie um agente em Agentes e ferramentas.')}</div>` : `<div id="office" class="office-host"></div>${more > 0 ? `<p class="muted small" style="padding:8px 16px 0">+${more} agente(s) fora das ${stations.length} estações. Use a vista em lista ou o filtro de ambiente.</p>` : ''}`}
      <div class="status-strip">${strip}<button class="more" data-nav="deliveries">Ver entregas ${icon('arrow', 16)}</button></div></section>
    <aside>
      ${needsYou(ctx)}
      ${activityCardHtml(ctx)}
      <section class="card"><div class="card-h"><h2>Missão atual</h2></div>${run ? missionCard(ctx, run) : empty('Nenhuma missão neste projeto.')}</section>
      <section class="card"><h2>Supervisor</h2><label class="sr-only" for="sup-select">Escolher supervisor</label><select id="sup-select"><option value="">Escolher modelo</option>${ctx.state.agents.filter(a => a.mode === 'read').map(a => `<option value="${esc(a.id)}" ${sup?.id === a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(PROVIDER[a.provider])}</option>`).join('')}</select>
        <div class="sup-bubble">${sup ? agentAv(sup, idx(ctx, sup), 40) : avatar(3, 40)}<span>${esc(supText)}</span></div>${planBlock(ctx)}</section>
      <section class="card"><h2>Skills</h2>${caps.length ? `<div class="chips">${caps.map(capChip).join('')}</div>` : '<p class="muted small">Declare capacidades nos agentes para vê-las aqui.</p>'}</section>
      <section class="card"><h2>Consumo reportado</h2><strong style="font-size:1.7rem">${u.costCount ? `US$ ${u.cost.toFixed(2).replace('.', ',')}` : 'indisponível'}</strong><p class="muted small">${u.inCount ? `${num(u.input)} tokens de entrada · ` : ''}dados informados pelo provedor; não é a fatura da assinatura.</p></section>
    </aside></div></div>`;
}
export function agentRow(ctx, a) {
  const s = ctx.agentStatus(a);
  return `<button class="row" data-act="agent" data-id="${esc(a.id)}" title="${esc(agentTip(ctx, a))}"><span class="dot d-${s.status}"></span><span><strong>${esc(a.name)}</strong><br><small class="muted">${esc(a.role)} · ${esc(a.room)}</small></span><span class="muted small">${esc(PROVIDER[a.provider])}</span><span class="pill mute">${esc(s.label)}</span></button>`;
}
function missionCard(ctx, run) {
  const items = run.kind === 'flow' ? run.steps.map(s => ({ id: s.id, text: `${s.agent}: ${(STATUS[s.status] || s.status).toLowerCase()}`, st: s.status })) : [{ id: run.task.id, text: `${run.task.agent.name}: ${(STATUS[run.task.status] || run.task.status).toLowerCase()}`, st: run.task.status }];
  return `<strong>${esc(run.title)}</strong><ul class="dots-list">${items.map(i => `<li><span class="dot d-${dotOf(i.st)}"></span><button class="link" data-act="task" data-id="${esc(i.id)}" style="color:var(--text)">${esc(i.text)}</button></li>`).join('')}</ul>${run.verdict ? `<p class="small">Veredito do revisor: <b>${run.verdict === 'approved' ? 'aprovado' : run.verdict === 'rejected' ? 'reprovado' : 'sem veredito claro'}</b></p>` : ''}`;
}
function planBlock(ctx) {
  const p = ctx.state.plans.filter(x => !ctx.project || x.projectId === ctx.project)[0];
  if (!p) return '';
  const names = id => ctx.state.agents.find(a => a.id === id)?.name || id;
  const body = p.status === 'planning' ? '<p class="muted small">O supervisor está planejando…</p>'
    : p.status === 'rejected' ? `<p class="small" style="color:var(--bad)">Plano recusado pelo backend:</p><ul class="small">${(p.errors || []).map(e => `<li>${esc(e)}</li>`).join('')}</ul>`
    : p.status === 'failed' ? `<p class="small" style="color:var(--bad)">${esc((p.errors || [])[0] || 'O supervisor falhou.')}</p>`
    : `<p class="muted small">${esc(p.plan?.rationale || '')}</p><ol class="small" style="padding-left:1.2em">${(p.plan?.steps || []).map(s => `<li><b>${esc(s.title)}</b> → ${esc(names(s.agentId))}${s.dependsOn.length ? ` <span class="muted">(depende de ${esc(s.dependsOn.join(', '))})</span>` : ''}</li>`).join('')}</ol>${p.status === 'proposed' ? `<button class="btn sm block" data-act="accept-plan" data-id="${esc(p.id)}">Aceitar plano e executar</button>` : '<p class="muted small">Plano aceito.</p>'}`;
  return `<div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px"><h3>Último plano <small class="muted">${esc(p.status)}</small></h3>${body}</div>`;
}

// ---------- Compositor global ----------
// Com quem a barra de mensagem fala: o Assistente por padrão (ou o Supervisor, se a pessoa escolheu assim).
export function targetOf(ctx) { return ctx.ui.target || (ctx.prefs.autoSupervisor && ctx.supervisorAgent?.() ? 's' : ctx.asstOk === false ? '' : 'assistant'); }
export function composerBar(ctx) {
  const agents = ctx.state.agents, teams = ctx.state.teams, sup = ctx.supervisorAgent();
  const target = targetOf(ctx), asst = target === 'assistant';
  const opts = `${ctx.asstOk === false ? '' : `<option value="assistant" ${asst ? 'selected' : ''}>Assistente · conversar e montar equipes</option>`}${sup ? `<option value="s" ${target === 's' ? 'selected' : ''}>Supervisor → propor plano</option>` : ''}${teams.map(t => `<option value="t:${esc(t.id)}" ${target === 't:' + t.id ? 'selected' : ''}>Equipe ${esc(t.name)}</option>`).join('')}${agents.map(a => `<option value="a:${esc(a.id)}" ${target === 'a:' + a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.role)}</option>`).join('')}`;
  return `<form id="composer" class="composer-bar" aria-label="Enviar missão"><div class="composer">
    <button type="button" class="iconbtn" data-act="opts" aria-label="Critérios de conclusão" aria-expanded="${!!ctx.ui.optsOpen}">${icon('clip', 22)}</button>
    <button type="button" class="iconbtn mic${ctx.ui.listening ? ' on' : ''}" id="mic" data-act="mic" aria-pressed="${!!ctx.ui.listening}" aria-label="${ctx.ui.listening ? 'Parar de ouvir' : 'Falar em vez de digitar (ditado)'}" title="${!ctx.voice?.stt ? 'Este navegador não tem ditado por voz (use o Chrome ou o Edge).' : !ctx.voice.secure ? 'O microfone só funciona em endereço seguro (https ou localhost). No celular pelo Tailscale, ative o HTTPS.' : ctx.ui.listening ? 'Ouvindo… clique para parar' : 'Falar em vez de digitar. O texto aparece no campo e você revisa antes de enviar.'}" ${ctx.voice?.stt && ctx.voice.secure ? '' : 'disabled'}>🎤</button>
    <label class="sr-only" for="target">Quem executa</label><select id="target" class="target">${opts}</select>
    <label class="sr-only" for="mission">Missão</label><textarea id="mission" rows="1" maxlength="30000" placeholder="${asst ? 'Conte o que você quer fazer…' : 'Digite a missão…  /skill  @agente'}" required spellcheck="false"></textarea>
    <span class="hint">Enter para enviar · Shift + Enter nova linha</span>
    <button class="sendbtn" id="send" aria-label="Enviar" ${asst || (ctx.project && agents.length) ? '' : 'disabled'}>${icon('send', 22)}</button>
    ${ctx.ui.optsOpen ? `<div class="opts-pop"><h3>Critérios de conclusão</h3><textarea id="criteria" rows="3" placeholder="Um critério por linha (opcional)"></textarea><p class="muted small" style="margin-top:6px">Os critérios vão junto com a missão e são usados pelo revisor.</p>${target.startsWith('a:') ? `<h3 style="margin-top:12px">Só desta missão</h3><div class="form-grid"><label class="f">Modelo<input id="ov-model" maxlength="80" list="ov-models" autocomplete="off" placeholder="usar o do agente"><datalist id="ov-models">${(ctx.models?.[target] || []).map(m => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('')}</datalist></label><label class="f">Esforço<select id="ov-effort"><option value="">usar o do agente</option>${(ctx.efforts?.[target] || []).map(e => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join('')}</select></label></div><p class="muted small">Vale só para esta missão; o agente continua como está.</p>` : ''}<label class="check" style="margin-top:12px"><input type="checkbox" id="isolate"> Isolar em worktree (Git)</label><p class="muted small" style="margin-top:4px">O agente trabalha numa cópia do último commit, em uma branch própria, e pode rodar ao mesmo tempo que outra tarefa na mesma pasta. Nada é mesclado sozinho. Só vale para agentes individuais.</p></div>` : ''}</div></form>
  <div class="foot"><span>${ctx.state.runtime.paused ? 'Novas tarefas pausadas.' : ''}</span></div>`;
}

// ---------- Tarefas ----------
export function viewTasks(ctx) {
  const tasks = ctx.state.runs.filter(t => inProject(ctx, t));
  const groups = [['Aguardando', ['queued', 'waiting_dependency']], ['Em execução', ['running', 'cancelling', 'needs_decision']], ['Concluídas', ['completed']], ['Com problema', ['failed', 'interrupted', 'blocked', 'cancelled']]];
  const card = t => `<button class="agent-card" style="width:100%;text-align:left;grid-template-columns:1fr" data-act="task" data-id="${esc(t.id)}"><span><strong>${esc(t.prompt)}</strong><br><small class="muted">${esc(t.agent.name)} · ${esc(PROVIDER[t.agent.provider])}</small></span>${pill(t.status)}${t.reason ? `<small class="muted">${esc(t.reason).slice(0, 90)}</small>` : ''}</button>`;
  return `<div class="page">${hero('Tarefas', 'O estado real de cada tarefa do projeto.', 'equipes', `<button class="btn ghost" data-act="pause-toggle">${ctx.state.runtime.paused ? icon('play', 16) + ' Retomar novas tarefas' : icon('pause', 16) + ' Pausar novas tarefas'}</button>`)}
  <div class="filters"><button class="btn ghost sm" data-act="toggle-board">${ctx.prefs.board === false ? 'Ver em quadro' : 'Ver em lista'}</button><span class="muted small">${ctx.state.runtime.paused ? 'Novas tarefas não iniciam; as em execução continuam.' : 'Pausar não cancela execuções em andamento.'}</span></div>
  ${!tasks.length ? empty('As tarefas deste projeto aparecerão aqui.') : ctx.prefs.board === false ? `<div style="display:grid;gap:10px">${tasks.map(card).join('')}</div>`
    : `<div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr))">${groups.map(([n, st]) => `<section class="card" aria-label="${esc(n)}" style="margin:0"><h2>${esc(n)} <small class="muted">${tasks.filter(t => st.includes(t.status)).length}</small></h2><div style="display:grid;gap:10px;margin-top:10px">${tasks.filter(t => st.includes(t.status)).map(card).join('') || '<div class="empty">—</div>'}</div></section>`).join('')}</div>`}</div>`;
}

// ---------- Execução ----------
export function viewExecution(ctx) {
  const d = ctx.detail;
  if (!d) return `<div class="page">${hero('Execução', 'Selecione uma tarefa para acompanhar.', 'desk')}${empty('Escolha uma tarefa no quadro para ver linha do tempo, eventos, arquivos e consumo.')}</div>`;
  const live = ['running', 'cancelling'].includes(d.status), last = d.attempts?.at(-1), tab = ctx.execTab || 'resumo';
  const tev = d.events.filter(e => e.type === 'task');
  const at = to => tev.find(e => e.to === to)?.at;
  const final = ['completed', 'failed', 'cancelled', 'interrupted', 'blocked'].includes(d.status);
  const steps = [{ label: 'Pedido recebido', at: d.createdAt, note: `${d.environment} · ${d.agent.name}` }];
  if (d.dependsOn?.length) steps.push({ label: 'Dependências liberadas', at: tev.find(e => e.from === 'waiting_dependency' && e.to === 'queued')?.at, note: `${d.dependsOn.length} dependência(s)` });
  steps.push({ label: 'Execução iniciada', at: at('running'), note: PROVIDER[d.agent.provider] });
  steps.push({ label: final ? STATUS[d.status] : 'Resultado', at: final ? d.updatedAt : null, note: final ? (d.reason ? String(d.reason).slice(0, 60) : `${(d.deliverables?.files || []).length} arquivo(s)`) : 'Aguardando', bad: ['failed', 'interrupted', 'blocked'].includes(d.status) });
  const cur = steps.findIndex(s => !s.at);
  const stepper = steps.map((s, i) => `<div class="step ${s.bad ? 'bad' : s.at ? 'done' : i === cur ? 'now' : ''}"><span class="n">${s.at ? icon(s.bad ? 'x' : 'check', 18) : i + 1}</span><b>${esc(s.label)}</b><small>${s.at ? hm(s.at) : (i === cur && live ? 'Em andamento' : '')}</small><small>${esc(s.note || '')}</small></div>`).join('');
  const logs = d.events.filter(e => ['activity', 'answer', 'result', 'error', 'diagnostic', 'context'].includes(e.type));
  const files = d.deliverables?.files || [];
  const flowPos = ctx.flowPosition(d);
  const deps = (d.dependsOn || []).map(id => ctx.state.runs.find(t => t.id === id));
  return `<div class="page"><div class="hero" style="min-height:150px"><div class="copy" style="max-width:62%"><div class="crumb">${esc(ctx.projectNameOf(d.project.id))} / <b>Missões</b></div><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><h1 style="font-size:1.9rem">${esc(d.objective.slice(0, 44))}${d.objective.length > 44 ? '…' : ''}</h1><span class="status-badge ${d.status === 'completed' ? 'ok' : ['failed', 'interrupted', 'blocked'].includes(d.status) ? 'bad' : ['queued', 'waiting_dependency', 'cancelling'].includes(d.status) ? 'warn' : ''}"><span class="dot d-${dotOf(d.status)}"></span>${esc(STATUS[d.status] || d.status)}</span></div><p style="margin-top:6px">${esc(d.objective.slice(0, 220))}</p></div><div class="art-wrap">${banner('execucao')}</div></div>
  ${tabs([['resumo', 'Resumo', 'file'], ['eventos', 'Eventos', 'clock'], ['arquivos', 'Arquivos', 'folder', files.length]], tab, 'tab')}
  <div class="cols c-2-1"><div>
  ${tab === 'resumo' ? `<section class="card"><h2>Linha do tempo da execução</h2><div class="stepper">${stepper}</div></section>
    ${d.reason || d.error ? `<section class="card" style="border-color:var(--bad)"><h2>Motivo</h2><pre>${esc((d.failureKind ? `[${d.failureKind}] ` : '') + (d.reason || d.error))}</pre>${d.failureKind === 'auth' ? '<p class="muted small" style="margin-top:8px">Autentique o provedor no terminal (veja Conexões).</p>' : ''}</section>` : ''}
    ${d.resume ? `<section class="card"><h2>Conversa retomada</h2><p class="small muted">Esta missão continua a mesma sessão do ${esc(PROVIDER[d.agent.provider])} da missão anterior; o agente lembra do que já foi dito e feito.</p></section>` : ''}
    ${final && d.kind === 'work' ? `<section class="card"><h2>Continuar a conversa</h2><form id="followup-form"><input type="hidden" name="id" value="${esc(d.id)}">
      <label class="f">Quem continua<select name="agentId">${ctx.state.agents.map(a => `<option value="${esc(a.id)}" ${a.id === d.agent.id ? 'selected' : ''}>${esc(a.name)} · ${esc(PROVIDER[a.provider])}${a.provider === d.agent.provider ? ' — mesma sessão (lembra de tudo)' : ' — começa limpo, recebe resumo e arquivos'}</option>`).join('')}</select></label>
      <label class="f">Mensagem<textarea name="message" rows="3" required maxlength="5000" placeholder="Ex.: agora ajuste o título e rode os testes"></textarea></label>
      <p class="muted small">Mesmo provedor retoma a sessão inteira. Outro provedor não recebe a conversa: só o objetivo, o resumo da entrega e os arquivos produzidos.</p>
      <div class="btn-row" style="margin-top:10px"><button class="btn">${icon('send', 16)} Enviar</button></div></form></section>` : ''}
    ${(() => { const iso = d.result?.isolation; if (!iso && !d.isolate) return ''; if (!iso) return `<section class="card"><h2>Worktree isolado</h2><p class="muted small">Esta tarefa roda numa cópia do Git em branch própria; os detalhes aparecem quando ela começar.</p></section>`; return `<section class="card"><div class="card-h"><h2>Worktree isolado</h2>${iso.removed ? '<span class="chip">Removido</span>' : ''}</div><p class="small">Branch <code>${esc(iso.branch)}</code></p><p class="small muted">Pasta: <code>${esc(iso.worktree)}</code></p><p class="small muted">${iso.removed ? 'A cópia e a branch foram descartadas.' : 'Nada foi mesclado. Para integrar, revise a pasta acima e use o Git (por exemplo, confirme as mudanças na branch e faça o merge). Remover descarta as mudanças que não foram integradas.'}</p>${!iso.removed && final ? `<div class="btn-row" style="margin-top:10px"><button class="btn outline sm" data-act="rm-worktree" data-id="${esc(d.id)}">${icon('x', 16)} Remover worktree e branch</button></div>` : ''}</section>`; })()}
    <div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:14px"><section class="card" style="margin:0"><div class="card-h"><h2>Saída em tempo real</h2><span class="chip"><span class="dot d-${live ? 'running' : 'idle'}"></span>${esc(PROVIDER[d.agent.provider])}</span><button class="btn ghost sm" data-act="full-out">${icon('external', 16)} ${ctx.ui.fullOut ? 'Reduzir' : 'Tela cheia'}</button></div>
      <pre class="out ${ctx.ui.fullOut ? 'full' : ''}">${logs.length ? logs.map(e => `<span class="logline"><span class="t">${hm(e.at)}</span><span>${esc((e.text || JSON.stringify(e.usage || '')).slice(0, 400))}</span></span>`).join('\n') : esc(live ? 'Aguardando eventos do agente…' : (d.reason ? 'Não chegou a rodar: ' + String(d.reason).slice(0, 260) : 'Sem eventos de saída.'))}</pre></section>
      ${unblockHtml(d)}<section class="card" style="margin:0"><div class="card-h"><h2>${final ? 'Resultado' : 'Última saída concluída'}</h2>${d.status === 'completed' ? `<span style="color:var(--ok)">${icon('check', 22)}</span>` : ''}</div>${d.answer ? `<p class="small muted">${esc(new Date(d.updatedAt).toLocaleString('pt-BR'))}</p><pre class="out">${esc(d.answer)}</pre>` : empty(live ? 'Ainda sem resposta do agente.' : (d.reason ? 'Sem resposta porque a tarefa não rodou: ' + String(d.reason).slice(0, 260) : 'Sem resposta registrada.'))}</section></div>` : ''}
  ${tab === 'eventos' ? `<section class="card"><h2>Eventos persistidos</h2><pre class="out full">${esc(logs.map(e => `${time(e.at)} [${e.type}] ${(e.text || JSON.stringify(e.usage || '')).slice(0, 600)}`).join('\n\n') || 'Nenhum evento ainda.')}</pre></section>` : ''}
  ${tab === 'arquivos' ? `<section class="card"><h2>Entregas</h2>${files.length ? files.map(f => `<div class="setting"><span>${icon('file', 20)}</span><span class="grow">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.path)}</a>` : esc(f.path)}<br><small class="muted">${esc({ created: 'criado', modified: 'alterado', deleted: 'removido' }[f.change] || f.change)} · ${kb(f.bytes)}${f.sha256 ? ` · sha256 ${esc(f.sha256.slice(0, 10))}` : ''}</small></span></div>`).join('') + '<p class="muted small" style="margin-top:8px">Abrir uma entrega não a publica nem a aprova.</p>' : empty(live ? 'Ainda não há arquivos registrados; eles aparecem quando a execução terminar.' : 'Nenhum arquivo criado ou alterado.')}</section>` : ''}
  </div>
  <aside class="card side-card"><h3>Agente responsável</h3><div class="agent-head">${agentAv(d.agent, idx(ctx, d.agent), 68)}<div><b>${esc(d.agent.role)}</b><br><span class="small"><span class="dot d-${dotOf(d.status)}"></span> ${esc(live ? 'Executando a tarefa' : STATUS[d.status])}</span></div></div>
    <div class="cols" style="grid-template-columns:1fr 1fr;margin-top:12px"><div><span class="muted small">Ferramenta</span><div class="chip" style="margin-top:6px">${icon('terminal', 16)} ${esc(PROVIDER[d.agent.provider])}</div></div><div><span class="muted small">Tempo decorrido</span><div class="clock" ${live && last ? `data-since="${esc(last.startedAt)}"` : ''}>${last?.durationMs != null ? dur(last.durationMs) : live ? dur(Date.now() - Date.parse(last?.startedAt || d.updatedAt)) : '—'}</div></div></div>
    <h3>Progresso da tarefa</h3><div class="note" style="margin:0">${icon('layers', 18)}<span><b>${esc(STATUS[d.status])}</b>${flowPos ? ` · etapa ${flowPos.i} de ${flowPos.n} do fluxo` : ''}<br><span class="small">${live && logs.at(-1) ? `Último evento: ${esc(logs.at(-1).type)}` : `Tentativa ${d.attemptCount} de ${d.limits?.maxAttempts}`}</span></span></div>
    <dl class="kv"><dt>Modelo</dt><dd>${esc(d.actualModel || 'indisponível')}</dd><dt>Permissão</dt><dd>${d.agent.mode === 'write' ? 'Edita arquivos' : 'Somente leitura'}</dd><dt>Tokens</dt><dd>${num(d.usage?.input)} / ${num(d.usage?.output)}</dd><dt>Custo</dt><dd>${d.usage?.cost == null ? 'indisponível' : 'US$ ' + Number(d.usage.cost).toFixed(4)}</dd></dl>${d.usage?.cost != null ? '<p class="muted small">Referência de API informada pelo CLI; não é fatura.</p>' : ''}
    <h3>Dependências</h3>${deps.length ? deps.map(t => t ? `<div class="setting" style="padding:8px 0"><span class="dot d-${dotOf(t.status)}"></span><button class="link grow" data-act="task" data-id="${esc(t.id)}">${esc(t.prompt.slice(0, 40))}</button>${pill(t.status)}</div>` : '').join('') : '<p class="muted small">Nenhuma.</p>'}
    <h3>Ações</h3><div class="btn-row"><button class="btn outline" data-act="pause-toggle">${icon(ctx.state.runtime.paused ? 'play' : 'pause', 16)} ${ctx.state.runtime.paused ? 'Retomar novas' : 'Pausar novas tarefas'}</button>${live || ['queued', 'waiting_dependency'].includes(d.status) ? `<button class="btn danger" data-act="cancel" data-id="${esc(d.id)}">${icon('trash', 16)} Cancelar execução</button>` : ''}${d.agent?.id && d.agent.id !== 'assistant-internal' && !String(d.agent.id).startsWith('assistant-') ? `<button class="btn outline" data-act="routine-from-task" data-id="${esc(d.id)}">${icon('clock', 16)} Repetir todo dia</button>` : ''}${['failed', 'interrupted'].includes(d.status) ? `<button class="btn outline" data-act="retry" data-id="${esc(d.id)}">${icon('refresh', 16)} Tentar de novo…</button>` : ''}</div><p class="muted small" style="margin-top:8px">Pausar impede novas tarefas; cancelar encerra só esta execução.</p></aside></div></div>`;
}

// ---------- Projetos ----------
export function viewProjects(ctx) {
  const q = (ctx.ui.projQuery || '').toLowerCase(), f = ctx.ui.projFilter || '';
  const list = ctx.state.projects.filter(p => (!f || p.area === f) && (p.name + ' ' + p.path).toLowerCase().includes(q));
  const areas = [...new Set(ctx.state.projects.map(p => p.area || 'Geral'))];
  const card = p => {
    const tasks = ctx.state.runs.filter(t => t.project.id === p.id), active = tasks.filter(t => ['running', 'cancelling'].includes(t.status)).length, queued = tasks.filter(t => ['queued', 'waiting_dependency'].includes(t.status)).length;
    const agents = [...new Map(tasks.map(t => [t.agent.id, t.agent])).values()].slice(0, 3);
    const stat = p.area === 'Financeiro' ? `${icon('lock', 18)} Projeto privado` : active ? `${icon('layers', 18)} ${active} ${active === 1 ? 'tarefa ativa' : 'tarefas ativas'}` : queued ? `${icon('layers', 18)} ${queued} ${queued === 1 ? 'tarefa na fila' : 'tarefas na fila'}` : tasks.length && tasks.every(t => t.status === 'completed') ? `<span style="color:var(--ok)">${icon('check', 18)} Concluído</span>` : `${icon('layers', 18)} ${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`;
    return `<article class="pcard ${p.id === ctx.project ? 'on' : ''}" data-act="pick-project" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="Abrir projeto ${esc(p.name)}"><div class="th">${thumb(p.area)}</div><div class="meta"><span class="dot" style="background:${AREA_DOT[p.area] || AREA_DOT.Geral}"></span>${esc(p.area || 'Geral')}<span style="margin-left:auto"><button class="iconbtn" data-act="open-folder" data-id="${esc(p.id)}" title="Abrir pasta" aria-label="Abrir pasta de ${esc(p.name)}">${icon('folder', 18)}</button><button class="iconbtn" data-act="proj-context" data-id="${esc(p.id)}" title="Contexto do projeto" aria-label="Contexto de ${esc(p.name)}">${icon('edit', 18)}</button></span></div><h3>${esc(p.name)}</h3><p class="muted small">${esc(p.path)}</p><div class="foot2"><span>${stat}</span><span class="avatars">${agents.map(a => avatar(idx(ctx, a), 30)).join('')}</span></div></article>`;
  };
  return `<div class="page">${hero('Seus projetos', 'Organize seus trabalhos por ambiente, com arquivos, contexto e agentes.', 'projetos')}
  <div class="filters"><div class="input-icon">${icon('search', 18)}<input id="proj-q" placeholder="Buscar projetos…" aria-label="Buscar projetos" value="${esc(ctx.ui.projQuery || '')}"></div>
    <button class="fchip ${!f ? 'on' : ''}" data-act="proj-filter" data-id="">Todos</button>${areas.map(a => `<button class="fchip ${f === a ? 'on' : ''}" data-act="proj-filter" data-id="${esc(a)}"><span class="dot" style="background:${AREA_DOT[a] || AREA_DOT.Geral}"></span>${esc(a)}</button>`).join('')}
    <button class="btn" data-act="new-project">${icon('plus', 18)} Novo projeto</button></div>
  ${list.length ? `<div class="pgrid">${list.map(card).join('')}</div>` : empty(ctx.state.projects.length ? 'Nenhum projeto neste filtro.' : 'Cadastre uma pasta de projeto confiável para começar.')}</div>`;
}
export function panelNewProject(ctx) {
  return `<div class="card-h"><h2>Novo projeto</h2><button class="iconbtn" data-act="close-panel" aria-label="Fechar">${icon('x', 22)}</button></div><p class="muted">Crie um novo projeto para organizar seus arquivos, contexto e agentes.</p>
  <form id="project-form"><label class="f">Nome do projeto<input name="name" required maxlength="200" placeholder="Digite um nome…"></label>
  <label class="f">Ambiente<select name="area">${AREAS.map(a => `<option>${esc(a)}</option>`).join('')}</select></label>
  <label class="f">Pasta local<div class="input-icon">${icon('folder', 18)}<input name="path" required placeholder="C:\\Projetos\\meu-projeto"></div></label>
  <label class="f check"><input type="checkbox" name="createSub" value="1"> Criar uma subpasta nova com o nome do projeto dentro dessa pasta <span class="muted small">(marque se a pasta é onde você guarda os projetos)</span></label>
  <label class="f">Equipe padrão<select name="team"><option value="">Escolher equipe (opcional)</option>${ctx.state.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>
  ${note('Contexto e arquivos separados por projeto. Projetos da área Financeiro não compartilham dados com agentes de outros ambientes.')}
  <button class="btn block lg" style="margin-top:16px">Criar projeto</button></form>`;
}
export function panelContext(ctx) {
  const p = ctx.state.projects.find(x => x.id === ctx.ui.panelId), c = ctx.projectContext;
  if (!p) return '';
  return `<div class="card-h"><h2>Contexto</h2><button class="iconbtn" data-act="close-panel" aria-label="Fechar">${icon('x', 22)}</button></div><p class="muted">${esc(p.name)}</p>
  <form id="context-form"><label class="f">Objetivos<textarea name="goals" rows="3" maxlength="2000">${esc(c?.goals)}</textarea></label>
  <label class="f">Decisões (uma por linha)<textarea name="decisions" rows="4">${esc((c?.decisions || []).join('\n'))}</textarea></label>
  <label class="f">Pendências<textarea name="pending" rows="3">${esc((c?.pending || []).join('\n'))}</textarea></label>
  <label class="f">Referências (arquivos; não são copiados para o prompt)<textarea name="references" rows="3">${esc((c?.references || []).join('\n'))}</textarea></label>
  ${p.area === 'Financeiro' ? note('Projeto financeiro: o contexto só é enviado a agentes do ambiente Financeiro.', 'lock', 'warn') : ''}
  <button class="btn block lg" style="margin-top:16px">Salvar contexto</button></form>
  ${referencesSectionHtml(ctx)}${gitSectionHtml(ctx)}
  ${(c?.proposed || []).length ? `<h3 style="margin-top:18px">Sugestões de decisão (${c.proposed.length})</h3><p class="muted small">Sugeridas quando você aprovou entregas. Só entram no contexto dos agentes se você aceitar.</p>${c.proposed.map(x => `<div class="prop"><textarea class="prop-text" id="prop-${esc(x.id)}" rows="2" maxlength="500" aria-label="Texto da decisão">${esc(x.text)}</textarea><div class="btn-row"><button type="button" class="btn sm" data-act="ctx-prop-accept" data-id="${esc(x.id)}">Aceitar</button><button type="button" class="btn ghost sm" data-act="ctx-prop-dismiss" data-id="${esc(x.id)}">Descartar</button></div></div>`).join('')}` : ''}
  ${(c?.deliverables || []).length ? `<h3 style="margin-top:18px">Entregas recentes</h3>${c.deliverables.slice().reverse().map(d => `<p class="small">${esc(d.summary.slice(0, 120))}<br><span class="muted">${esc(d.agent)} · ${esc(d.files.join(', '))}</span></p>`).join('')}` : ''}`;
}

// ---------- Gaveta do agente ----------
export function drawer(ctx, a) {
  const s = ctx.agentStatus(a), tasks = ctx.state.runs.filter(t => t.agent.id === a.id).slice(0, 5);
  return `<div class="card-h"><h2 id="drawer-title">${esc(a.name)}</h2><button class="iconbtn" data-act="close-drawer" aria-label="Fechar">${icon('x', 22)}</button></div>
  <div class="agent-head">${agentAv(a, idx(ctx, a), 52)}<div><b>${esc(a.role)}</b><br><span class="small"><span class="dot d-${s.status}"></span> ${esc(s.label)}</span></div></div>
  <dl class="kv"><dt>Ambiente</dt><dd>${esc(a.room)}</dd><dt>Ferramenta</dt><dd>${esc(PROVIDER[a.provider])}</dd><dt>Modelo</dt><dd>${esc(a.model || 'padrão da conta')}</dd><dt>Permissão</dt><dd>${a.mode === 'write' ? 'Edita arquivos' : 'Somente leitura'}</dd><dt>Skills</dt><dd>${a.skillIds.length}</dd></dl>
  ${s.task && s.status !== 'idle' ? `<p>Tarefa: <button class="link" data-act="task" data-id="${esc(s.task.id)}">${esc(s.task.prompt.slice(0, 60))}</button> ${s.status === 'running' ? `<span class="clock" style="font-size:1rem" data-since="${esc(s.task.updatedAt)}"></span>` : ''}</p>` : ''}
  ${s.status === 'failed' ? `<p><button class="btn outline sm" data-act="dismiss" data-id="${esc(s.task.id)}">Dispensar alerta de falha</button><br><small class="muted">Só some do cenário; o histórico permanece.</small></p>` : ''}
  ${s.status === 'done' && s.task?.deliverables?.length ? `<p><button class="btn outline sm" data-act="task" data-id="${esc(s.task.id)}" data-tab="arquivos">Ver entrega</button></p>` : ''}
  <h3 style="margin-top:14px">Últimas tarefas</h3>${tasks.map(t => `<button class="agent-card" style="width:100%;margin-bottom:8px;grid-template-columns:1fr auto;text-align:left" data-act="task" data-id="${esc(t.id)}"><span>${esc(t.prompt.slice(0, 60))}</span>${pill(t.status)}</button>`).join('') || '<p class="muted small">Nenhuma ainda.</p>'}
  <div class="btn-row" style="margin-top:12px"><button class="btn" data-act="ask-agent" data-id="${esc(a.id)}">Nova tarefa</button><button class="btn ghost" data-act="mention-agent" data-id="${esc(a.id)}">@ Mencionar no chat</button><button class="btn ghost" data-act="mini-open" data-id="${esc(a.id)}">Abrir em janela própria</button><button class="btn ghost" data-act="edit-agent" data-id="${esc(a.id)}">Editar perfil</button></div>`;
}
