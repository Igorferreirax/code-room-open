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
const toggle = (id, on, label, busy = false) => `<button class="toggle" role="switch" id="${id}" aria-checked="${on}" aria-label="${esc(label)}" data-act="toggle" data-id="${id}" ${busy ? 'disabled aria-busy="true" title="Aplicando alteração…"' : ''}></button>`;
export { tabs, toggle };

// ---------- Casca: barra de ícones e topo ----------
export const NAV = [['home', 'home', 'Início'], ['room', 'sitemap', 'Sala de agentes'], ['projects', 'folder', 'Projetos'], ['tasks', 'check-square', 'Tarefas'], ['teams', 'users', 'Equipes'], ['recipes', 'layers', 'Receitas'], ['agents', 'terminal', 'Agentes e ferramentas'], ['deliveries', 'file', 'Entregas'], ['skills', 'sparkle', 'Skills'], ['usage', 'chart', 'Consumo e limites'], ['routines', 'calendar', 'Rotinas'], ['connections', 'plug', 'Conexões'], ['settings', 'gear', 'Configurações']];
// Menu em 3 grupos (trabalho, equipe e sistema) com separadores finos; os botões e o data-nav são os mesmos de sempre.
export const NAV_GROUPS = [['home', 'room', 'projects', 'tasks', 'deliveries'], ['agents', 'teams', 'recipes', 'skills', 'routines'], ['usage', 'connections', 'settings']];
export function railHtml(cur, badges = {}) {
  const btn = ([id, ic, label]) => { const n = badges[id] || 0; return `<button data-nav="${id}" title="${esc(label)}${n ? ` (${n} pendente${n > 1 ? 's' : ''})` : ''}" aria-label="${esc(label)}${n ? `, ${n} pendente${n > 1 ? 's' : ''}` : ''}" aria-current="${cur === id || (cur === 'exec' && id === 'tasks') ? 'page' : 'false'}">${icon(ic, 22)}${n ? `<span class="rb" aria-hidden="true">${n > 9 ? '9+' : n}</span>` : ''}</button>`; };
  return NAV_GROUPS.map(g => g.map(id => NAV.find(n => n[0] === id)).filter(Boolean).map(btn).join('')).join('<i class="rail-sep" role="separator" aria-hidden="true"></i>');
}
export function topbarHtml(ctx) {
  const online = ctx.state.agents.filter(a => ctx.agentStatus(a).status !== 'disconnected').length;
  return `<div class="brand"><img class="brand-mark" src="/assets/favicon.png" alt="" aria-hidden="true"><span class="brand-name">Code <b>Room</b></span>${ctx.prefs.displayName ? `<span class="workspace-greeting">Olá, ${esc(ctx.prefs.displayName)}. <span>Este é o seu Workspace.</span></span>` : ''}</div>
  <label class="project-pill"><span class="sr-only">Projeto</span><select id="project-select">${ctx.state.projects.length ? `<option value="" ${ctx.project ? '' : 'selected'}>Todos os projetos (geral)</option>` + ctx.state.projects.map(p => `<option value="${esc(p.id)}" ${p.id === ctx.project ? 'selected' : ''}>${esc(p.name)}</option>`).join('') : '<option value="">Nenhum projeto</option>'}</select></label>
  <div class="top-right"><button type="button" class="btn ghost sm asst-btn" data-act="asst-toggle" aria-pressed="${!!ctx.ui.asstOpen}">Assistente</button><span class="online"><span class="dot d-${ctx.connection === 'live' ? 'ok' : ctx.connection === 'lost' ? 'warn' : 'idle'}"></span><span>${online} ${online === 1 ? 'agente conectado' : 'agentes conectados'}</span></span>
  <span class="pill ${ctx.connection === 'live' ? 'ok' : 'warn'}" role="status">${{ live: 'Conectado', connecting: 'Conectando…', lost: 'Reconectando…', off: 'Desconectado' }[ctx.connection]}</span>
  <div class="who"><button data-act="who" aria-haspopup="menu" aria-expanded="${!!ctx.ui.whoOpen}" aria-label="Menu do usuário">${avatar(1, 36)}${icon('down', 16)}</button>${ctx.ui.whoOpen ? `<div class="menu" role="menu"><button role="menuitem" data-nav="settings">${icon('palette', 18)} Aparência</button><button role="menuitem" data-act="onb-open">${icon('sparkle', 18)} Guia de boas-vindas</button><button role="menuitem" data-act="logout">${icon('lock', 18)} Bloquear painel</button></div>` : ''}</div></div>`;
}

// ---------- Entrada ----------
export function viewLogin(ctx) {
  return `<div class="login"><div class="tb"><div class="brand"><img class="brand-mark" src="/assets/favicon.png" alt="" aria-hidden="true"><span class="brand-name">Code <b>Room</b></span></div></div>
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
  const tb = s.runtime?.budget?.tokens; if (tb?.reached) items.push({ kind: 'bad', text: 'Teto diário de tokens atingido: novas tarefas aguardam', nav: 'usage', n: 1 }); else if (tb?.warn) items.push({ kind: 'warn', text: 'Mais de 80% do teto diário de tokens', nav: 'usage', n: 1 });
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
// Boas-vindas do dia: o que ficou esperando por você. Aparece uma vez por dia (até dispensar) e só quando há algo pendente.
export function welcomeBack(ctx, now = new Date()) {
  if (ctx.prefs?.digestSeen === now.toDateString()) return '';
  const runs = ctx.state.runs || [], week = now.getTime() - 7 * 86400000, name = ctx.prefs?.displayName ? `, ${esc(ctx.prefs.displayName)}` : '', asst = esc(ctx.asst?.name || 'Nico');
  const review = runs.filter(t => t.status === 'completed' && !t.review && t.kind !== 'plan' && t.step !== 'review' && (t.deliverables || []).length);
  const failed = runs.filter(t => ['failed', 'interrupted', 'blocked'].includes(t.status) && Date.parse(t.updatedAt || t.createdAt) >= week);
  const approvals = (ctx.state.subtasks || []).length + (ctx.state.plans || []).filter(p => p.status === 'proposed').length + (ctx.state.socialProposals || []).length;
  const last = new Map(); for (const t of runs) { const at = Date.parse(t.updatedAt || t.createdAt) || 0; if (t.project?.id && at > (last.get(t.project.id) || 0)) last.set(t.project.id, at); }
  const stale = (ctx.state.projects || []).filter(p => last.has(p.id) && last.get(p.id) < week).slice(0, 3);
  const items = [];
  if (review.length) items.push(`<button type="button" class="digest-item" data-nav="deliveries"><b>${review.length}</b> entrega${review.length > 1 ? 's' : ''} esperando a sua revisão</button>`);
  if (failed.length) items.push(`<button type="button" class="digest-item bad" data-nav="tasks"><b>${failed.length}</b> tarefa${failed.length > 1 ? 's' : ''} com problema nos últimos 7 dias</button>`);
  if (approvals) items.push(`<button type="button" class="digest-item" data-nav="room"><b>${approvals}</b> pedido${approvals > 1 ? 's' : ''} aguardando a sua aprovação</button>`);
  for (const p of stale) items.push(`<button type="button" class="digest-item" data-act="home-pick-project" data-id="${esc(p.id)}">Projeto <b>${esc(p.name)}</b> parado há ${Math.floor((now.getTime() - last.get(p.id)) / 86400000)} dias</button>`);
  if (!items.length) return '';
  return `<section class="home-digest" aria-label="O que está esperando por você"><div><p class="eyebrow">Bom te ver de volta${name}</p><h2>Algumas coisas ficaram esperando por você</h2></div><div class="digest-list">${items.join('')}</div><div class="btn-row"><button type="button" class="btn sm" data-act="digest-ask" ${ctx.asstOk === false ? 'disabled' : ''}>${icon('sparkle', 16)} Ver com ${asst} por onde começar</button><button type="button" class="btn ghost sm" data-act="digest-dismiss">Agora não</button></div></section>`;
}

export function viewHome(ctx) {
  const projects = ctx.state.projects || [], runs = ctx.state.runs || [], project = projects.find(p => p.id === ctx.project), projectRuns = runs.filter(t => project && t.project?.id === project.id).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const active = projectRuns.filter(t => ['running', 'cancelling', 'queued', 'waiting_dependency'].includes(t.status)).length;
  const toReview = projectRuns.filter(t => t.status === 'completed' && !t.review && t.kind !== 'plan' && t.step !== 'review' && (t.deliverables || []).length).length;
  const activeByProject = new Map();
  for (const t of runs) if (['running', 'cancelling', 'queued', 'waiting_dependency'].includes(t.status) && t.project?.id) activeByProject.set(t.project.id, (activeByProject.get(t.project.id) || 0) + 1);
  const recent = projectRuns.slice(0, 3), memberIds = project ? ctx.projectAgentIds() : new Set(), allMembers = project ? ctx.state.agents.filter(a => memberIds.has(a.id)) : [], members = allMembers.slice(0, 5);
  const hour = new Date().getHours(), salutation = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite', who = ctx.prefs.displayName ? `, ${esc(ctx.prefs.displayName)}` : '';
  const projectRows = projects.slice().sort((a, b) => (a.id === ctx.project ? -1 : b.id === ctx.project ? 1 : String(a.name).localeCompare(String(b.name)))).slice(0, 5).map(p => {
    const count = activeByProject.get(p.id) || 0;
    return `<button type="button" class="home-project${p.id === ctx.project ? ' on' : ''}" data-act="home-pick-project" data-id="${esc(p.id)}" aria-pressed="${p.id === ctx.project}"><span class="home-project-icon">${icon('layers', 18)}</span><span class="home-project-name"><b>${esc(p.name)}</b><small>${count ? `${count} tarefa(s) em andamento` : esc(p.area || 'Projeto')}</small></span>${icon('right', 18)}</button>`;
  }).join('');
  const taskRows = recent.map(t => `<button type="button" class="home-task" data-act="task" data-id="${esc(t.id)}"><span class="home-task-icon">${icon(t.kind === 'work' ? 'file' : 'sitemap', 18)}</span><span class="home-task-main"><b>${esc(t.prompt || 'Tarefa sem título')}</b><small>${esc(t.agent?.name || 'Agente')} · ${esc(PROVIDER[t.agent?.provider] || t.agent?.provider || '')}</small></span>${pill(t.status)}</button>`).join('');
  const teamRows = members.map(a => { const s = ctx.agentStatus(a); return `<button type="button" class="home-member" data-act="agent" data-id="${esc(a.id)}" title="${esc(agentTip(ctx, a))}">${agentAv(a, idx(ctx, a), 34)}<span class="home-member-name"><b>${esc(a.name)}</b><small>${esc(PROVIDER[a.provider] || a.provider)} · ${esc(s.label)}</small></span><span class="dot d-${s.status}"></span></button>`; }).join('');
  const prompts = [['code', 'Desenvolver', 'code'], ['review', 'Revisar entrega', 'check-square'], ['research', 'Pesquisar', 'search'], ['video', 'Criar conteúdo', 'film']];
  return `<div class="page home-page"><div class="home-grid"><section class="home-main">
    <header class="home-welcome"><div class="home-mark">${banner('shelf')}</div><div class="home-welcome-copy"><p class="eyebrow">Seu espaço de trabalho</p><h1>${salutation}${who}.<br>O que vamos fazer hoje?</h1><p class="muted">${project ? `Projeto em foco: <b>${esc(project.name)}</b>.` : 'Escolha um projeto ou comece conversando com o Assistente.'} ${active ? `${active} tarefa(s) ativa(s).` : 'Seu próximo passo começa com uma ideia.'}${toReview ? ` ${toReview} entrega(s) aguardam revisão.` : ''}</p></div></header>
    ${welcomeBack(ctx)}
    <form id="home-composer" class="home-composer"><label class="sr-only" for="home-mission">O que você quer fazer?</label><textarea id="home-mission" name="prompt" rows="3" maxlength="12000" placeholder="Conte a ideia, tarefa ou problema que quer resolver…" required></textarea><div class="home-compose-footer"><label class="home-project-picker"><span>${icon('layers', 17)} Projeto</span><select id="home-project" name="projectId"><option value="">Sem projeto selecionado</option>${projects.map(p => `<option value="${esc(p.id)}" ${p.id === ctx.project ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><span class="home-assistant-note">${icon('sparkle', 16)} O Assistente ajuda a estruturar o próximo passo</span><button class="btn home-send" ${ctx.asstOk === false ? 'disabled title="Conecte uma IA ao Assistente primeiro"' : ''}>${icon('send', 17)} Conversar com o Assistente</button></div></form>
    <div class="home-shortcuts" aria-label="Sugestões de pedido">${prompts.map(([id, label, ic]) => `<button type="button" class="btn outline sm" data-act="home-prompt" data-id="${id}">${icon(ic, 16)} ${label}</button>`).join('')}</div>
    <section class="home-continue"><div class="card-h"><div><p class="eyebrow">Seu espaço, em andamento</p><h2>Continuar de onde parou</h2></div><button type="button" class="btn ghost sm" data-nav="tasks">Ver tarefas ${icon('right', 16)}</button></div>${taskRows || `<div class="home-empty"><span>${icon('sparkle', 20)}</span><p>${project ? 'Ainda não há tarefas neste projeto. Conte sua ideia ao Assistente para começar.' : 'Selecione ou crie um projeto para acompanhar o trabalho dos agentes.'}</p></div>`}</section>
  </section><aside class="home-side"><section class="home-side-section"><div class="card-h"><div><p class="eyebrow">Organização</p><h2>Seus projetos</h2></div><button type="button" class="iconbtn" data-nav="projects" aria-label="Ver projetos">${icon('right', 18)}</button></div>${projectRows || `<div class="home-empty compact"><p>Crie seu primeiro projeto para manter arquivos, agentes e histórico organizados.</p></div>`}<button type="button" class="btn outline block home-create" data-act="new-project">${icon('plus', 17)} Criar projeto</button></section>
    <section class="home-side-section"><div class="card-h"><div><p class="eyebrow">Escopo atual</p><h2>${project ? 'Sua equipe' : 'Equipe do projeto'}</h2></div><button type="button" class="iconbtn" data-nav="teams" aria-label="Ver equipes">${icon('right', 18)}</button></div>${teamRows || `<div class="home-empty compact"><p>${project ? 'Este projeto ainda não tem agentes ligados.' : 'Escolha um projeto para ver apenas os agentes dele.'}</p></div>`}${project && !members.length ? `<button type="button" class="btn ghost sm block" data-act="project-team-suggest" data-id="${esc(project.id)}">${icon('sparkle', 16)} Sugerir equipe</button>` : ''}${allMembers.length > members.length ? `<button type="button" class="btn ghost sm block" data-nav="room">Ver equipe completa (${allMembers.length}) na Sala</button>` : ''}</section>
    <section class="home-tip"><div class="home-tip-art">${banner('equipes')}</div><div><b>Uma equipe, um fluxo claro</b><p>Distribua papéis e revise cada entrega antes de seguir para a próxima etapa.</p><button type="button" class="linkbtn" data-nav="room">Abrir Sala de agentes ${icon('right', 14)}</button></div></section>
  </aside></div></div>`;
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
      <div class="scene-tools"><label class="small muted">Ambiente <select id="room-filter" style="display:inline-block;width:auto;margin-left:6px">${ctx.project ? `<option value="@projeto" ${ctx.roomMode() === '@projeto' ? 'selected' : ''}>Deste projeto (${ctx.projectAgentIds().size})</option>` : `<option value="" ${ctx.roomMode() === '' ? 'selected' : ''}>Todos</option>`}${rooms.map(r => `<option value="${esc(r)}" ${r === ctx.roomMode() ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>${(() => { const inP = new Set(ctx.projectAgentIds?.() || []), inT = new Set(ctx.projectTeamIds?.() || []), freeA = ctx.state.agents.filter(a => !inP.has(a.id)), tms = ctx.state.teams.filter(t => !inT.has(t.id)); return ctx.project && (freeA.length || tms.length) ? `<label class="small muted">Trazer <select id="member-add" aria-label="Trazer agente ou equipe para este projeto" style="display:inline-block;width:auto;margin-left:6px"><option value="">＋ para o projeto…</option>${tms.length ? `<optgroup label="Equipes">${tms.map(t => `<option value="t:${esc(t.id)}">👥 ${esc(t.name)}</option>`).join('')}</optgroup>` : ''}${freeA.length ? `<optgroup label="Agentes">${freeA.map(a => `<option value="a:${esc(a.id)}">🤖 ${esc(a.name)}</option>`).join('')}</optgroup>` : ''}</select></label>` : ''; })()}<span class="seg" role="group" aria-label="Modo de visualização">${[['scene', 'Cenário'], ['term', 'Terminais'], ['canvas', 'Canvas']].map(([k, l]) => `<button type="button" class="${mode === k ? 'on' : ''}" data-act="view-mode" data-id="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</span></div>
      ${mode === 'canvas' ? '<div id="canvas-slot"></div>' : mode === 'list' || mode === 'term' ? `<div class="agent-list${mode === 'term' ? ' term-grid' : ''}" style="padding:0 14px 14px">${agents.slice(0, mode === 'term' ? TERM_MAX : agents.length).map(a => mode === 'term' ? agentTerm(ctx, a) : agentRow(ctx, a)).join('') ||(ctx.project ? `<div class="empty">Este projeto ainda não tem agentes. <button type="button" class="link" data-act="project-team-suggest" data-id="${esc(ctx.project)}">Sugerir uma equipe com o Assistente</button> ou traga alguém no menu acima.</div>` : empty('Crie um agente em Agentes e ferramentas.'))}</div>` : `<div id="office" class="office-host"></div>${ctx.project && !agents.length ? `<div class="empty">Este projeto ainda não tem agentes. <button type="button" class="link" data-act="project-team-suggest" data-id="${esc(ctx.project)}">Sugerir uma equipe com o Assistente</button> ou traga alguém no menu acima.</div>` : ''}${more > 0 ? `<p class="muted small" style="padding:8px 16px 0">+${more} agente(s) fora das ${stations.length} estações. Use a vista em lista ou o filtro de ambiente.</p>` : ''}`}
      <div class="status-strip">${strip}<button class="more" data-nav="deliveries">Ver entregas ${icon('arrow', 16)}</button></div></section>
    <aside>
      ${needsYou(ctx)}
      ${activityCardHtml(ctx)}
      <section class="card"><div class="card-h"><h2>Missão atual</h2></div>${run ? missionCard(ctx, run) : empty('Nenhuma missão neste projeto.')}</section>
      <section class="card"><h2>Supervisor</h2><label class="sr-only" for="sup-select">Escolher supervisor</label><select id="sup-select"><option value="">Escolher modelo</option>${(ctx.project ? ctx.state.agents.filter(a => a.mode === 'read' && ctx.projectAgentIds?.().has(a.id)) : ctx.state.agents.filter(a => a.mode === 'read')).map(a => `<option value="${esc(a.id)}" ${sup?.id === a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(PROVIDER[a.provider])}</option>`).join('')}</select>
        <div class="sup-bubble">${sup ? agentAv(sup, idx(ctx, sup), 40) : avatar(3, 40)}<span>${esc(supText)}</span></div>${planBlock(ctx)}</section>
      <section class="card"><h2>Skills</h2>${caps.length ? `<div class="chips">${caps.map(capChip).join('')}</div>` : '<p class="muted small">Declare capacidades nos agentes para vê-las aqui.</p>'}</section>
      <section class="card"><h2>Consumo reportado</h2><strong style="font-size:1.7rem">${u.costCount ? `US$ ${u.cost.toFixed(2).replace('.', ',')}` : 'indisponível'}</strong><p class="muted small">${u.inCount ? `${num(u.input)} tokens de entrada · ` : ''}dados informados pelo provedor; não é a fatura da assinatura.</p></section>
    </aside></div></div>`;
}
// Modo "Terminais": um painel por agente com as últimas linhas da tarefa mais recente dele NESTE projeto.
// É só leitura (não é um terminal interativo); a saída vem de /api/tasks/:id/tail e é pintada pelo app.js.
export const TERM_MAX = 12;
const TERM_KIND = { activity: 'tl-activity', answer: 'tl-answer', result: 'tl-answer', error: 'tl-error', diagnostic: 'tl-activity' };
export function termLinesHtml(tail) {
  const head = `<span class="tp">$ ${esc(String(tail.prompt || '').replace(/\s+/g, ' ').slice(0, 160))}</span>`;
  const lines = (tail.lines || []).map(l => `<span class="${TERM_KIND[l.type] || 'tl-activity'}">${esc(l.text || '')}</span>`);
  if (!lines.length) lines.push(`<span class="tl-activity">${esc(tail.reason ? String(tail.reason).slice(0, 300) : ['running', 'cancelling'].includes(tail.status) ? 'Aguardando a saída do agente…' : ['queued', 'waiting_dependency'].includes(tail.status) ? 'Na fila.' : 'Sem saída registrada.')}</span>`);
  return [head, ...lines].join('\n');
}
export function agentTerm(ctx, a) {
  const s = ctx.agentStatus(a), t = ctx.termTask?.(a) || null, c = t && ctx.term?.[t.id];
  // Ligações do Canvas neste projeto: de quem este agente recebe o trabalho e para quem ele passa.
  const links = (ctx.state.links || []).filter(l => l.enabled !== false && (!ctx.project || l.projectId === ctx.project)), nameOf = id => ctx.state.agents.find(x => x.id === id)?.name;
  const from = links.filter(l => l.to === a.id).map(l => nameOf(l.from)).filter(Boolean), to = links.filter(l => l.from === a.id).map(l => nameOf(l.to)).filter(Boolean);
  const flow = from.length || to.length ? `<div class="term-flow">${from.length ? `<span title="Recebe o resumo e os arquivos de">← ${esc(from.join(', '))}</span>` : ''}${to.length ? `<span title="Quando termina, passa o trabalho para">→ ${esc(to.join(', '))}</span>` : ''}</div>` : '';
  return `<article class="term"><header><button type="button" class="term-h" data-act="agent" data-id="${esc(a.id)}" title="${esc(agentTip(ctx, a))}"><span class="dot d-${s.status}"></span><b>${esc(a.name)}</b><small>${esc(PROVIDER[a.provider] || a.provider)} · ${esc(s.label)}</small></button>${t ? `<button type="button" class="iconbtn" data-act="task" data-id="${esc(t.id)}" aria-label="Abrir a tarefa de ${esc(a.name)}" title="Abrir a tarefa">${icon('arrow', 16)}</button>` : ''}</header>${flow}<pre class="term-out" ${t ? `data-task="${esc(t.id)}"` : ''} tabindex="0" aria-label="Saída recente de ${esc(a.name)}">${!t ? `<span class="tl-activity">${ctx.project ? 'Nenhuma tarefa deste agente neste projeto ainda.' : 'Nenhuma tarefa deste agente ainda.'}</span>` : c ? c.html : '<span class="tl-activity">Carregando a saída…</span>'}</pre><form class="am-form term-form" data-id="${esc(a.id)}"><label class="sr-only" for="term-t-${esc(a.id)}">Mensagem para ${esc(a.name)}</label><textarea id="term-t-${esc(a.id)}" rows="1" maxlength="8000" title="Enter envia; Shift+Enter quebra a linha" placeholder="${ctx.project ? `Mensagem para ${esc(a.name)}…` : 'Escolha um projeto para enviar'}" ${ctx.project ? '' : 'disabled'}></textarea></form></article>`;
}
export function agentRow(ctx, a) {
  const s = ctx.agentStatus(a);
  return `<button class="row" data-act="agent" data-id="${esc(a.id)}" title="${esc(agentTip(ctx, a))}"><span class="dot d-${s.status}"></span><span><strong>${esc(a.name)}</strong><br><small class="muted">${esc(a.role)} · ${esc(a.room)}</small></span><span class="muted small">${esc(PROVIDER[a.provider])}</span><span class="pill mute">${esc(s.label)}</span></button>`;
}
function missionCard(ctx, run) {
  const items = run.kind === 'flow' ? run.steps.map(s => ({ id: s.id, text: `${s.agent}: ${(STATUS[s.status] || s.status).toLowerCase()}`, st: s.status })) : [{ id: run.task.id, text: `${run.task.agent.name}: ${(STATUS[run.task.status] || run.task.status).toLowerCase()}`, st: run.task.status }];
  const chain = (run.handoffs || []).length > 1 ? `<div class="handoff-chain" role="group" aria-label="Agentes que receberam esta missão">${run.handoffs.map((s, i) => `${i ? '<span class="handoff-arrow" aria-hidden="true">→</span>' : ''}<button type="button" class="handoff-step" data-act="task" data-id="${esc(s.id)}" title="Abrir a etapa de ${esc(s.agent?.name || 'agente')}"><span class="dot d-${dotOf(s.status)}"></span>${esc(s.agent?.name || 'Agente')}</button>`).join('')}</div><p class="small muted handoff-note">A passagem leva o resumo e os arquivos da etapa anterior. <button type="button" class="link" data-act="view-mode" data-id="canvas">Ver mapa no Canvas</button></p>` : '';
  return `<strong>${esc(run.title)}</strong>${chain}<ul class="dots-list">${items.map(i => `<li><span class="dot d-${dotOf(i.st)}"></span><button class="link" data-act="task" data-id="${esc(i.id)}" style="color:var(--text)">${esc(i.text)}</button></li>`).join('')}</ul>${run.verdict ? `<p class="small">Veredito do revisor: <b>${run.verdict === 'approved' ? 'aprovado' : run.verdict === 'rejected' ? 'reprovado' : 'sem veredito claro'}</b></p>` : ''}`;
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
  const sup = ctx.supervisorAgent(), target = targetOf(ctx), asst = target === 'assistant';
  const inP = new Set(ctx.projectAgentIds?.() || []), inT = new Set(ctx.projectTeamIds?.() || []), scoped = !!ctx.project;
  const agents = scoped ? ctx.state.agents.filter(a => inP.has(a.id)) : ctx.state.agents;
  const teams = scoped ? ctx.state.teams.filter(t => inT.has(t.id)) : ctx.state.teams;
  const opts = `${ctx.asstOk === false ? '' : `<option value="assistant" ${asst ? 'selected' : ''}>✨ Assistente · conversar e montar equipes</option>`}${sup ? `<option value="s" ${target === 's' ? 'selected' : ''}>🧭 Supervisor → propor plano</option>` : ''}${teams.map(t => `<option value="t:${esc(t.id)}" ${target === 't:' + t.id ? 'selected' : ''}>👥 ${/^equipe\b/i.test(t.name) ? '' : 'Equipe '}${esc(t.name)}</option>`).join('')}${agents.map(a => `<option value="a:${esc(a.id)}" ${target === 'a:' + a.id ? 'selected' : ''}>🤖 ${esc(a.name)} · ${esc(a.role)}</option>`).join('')}`;
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
const FAILURE_GUIDANCE = {
  auth: 'A CLI pode estar sem login ou com a sessão expirada. Abra Conexões, autentique este provedor e use “Testar resposta” antes de tentar de novo.',
  executable_missing: 'A CLI não foi encontrada nesta máquina. Confira Ferramentas instaladas; depois de instalar ou atualizar, feche e reabra o Code Room para renovar o PATH.',
  timeout: 'O tempo máximo foi atingido. Confira Consumo e limites; considere aumentar a duração ou dividir o pedido em etapas menores.',
  tool_denied: 'O agente tentou usar uma ferramenta que esta execução sem tela não pode aprovar (em geral, rodar um programa). Repita o pedido: o Code Room agora avisa o Antigravity para não rodar comandos. Se a tarefa precisa mesmo de um programa, use um agente do Claude Code e libere o programa nele.',
  no_output: 'A CLI encerrou sem entregar texto reconhecido. Clique em “Testar a IA deste agente” abaixo e confira o modelo escolhido e os eventos da execução; a causa ainda não foi confirmada.',
  rate_limit: 'O provedor pode ter atingido uma cota ou limite temporário. Confira a conta e os limites do provedor em Conexões antes de repetir.',
  prompt_too_long: 'O contexto ultrapassou o limite aceito por esta CLI. Reduza o pedido, as skills ou o contexto enviado.',
  worktree_unavailable: 'A cópia Git isolada não pôde ser preparada. Confira se a pasta é um repositório Git válido e se o Git está instalado.',
  read_only_violation: 'A execução tentou alterar arquivos em modo somente leitura. Confira a permissão do agente e as ferramentas que foram liberadas.',
};
const failureGuidance = kind => FAILURE_GUIDANCE[kind] || 'Abra a aba Eventos desta tarefa para conferir a mensagem da CLI e o código de saída. Depois, teste a conexão do provedor em Conexões. Ainda não é possível concluir a causa só com o tipo registrado.';
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
    ${d.reason || d.error ? `<section class="card" style="border-color:var(--bad)"><h2>Motivo</h2><pre>${esc((d.failureKind ? `[${d.failureKind}] ` : '') + (d.reason || d.error))}</pre><div class="note" role="note" style="margin-top:10px">${icon('info', 18)}<span><b>Verificação sugerida:</b> ${esc(failureGuidance(d.failureKind))}</span></div><div class="btn-row" style="margin-top:10px"><button type="button" class="btn sm" data-act="fix-with-ai" data-id="${esc(d.id)}">${icon('sparkle', 16)} Corrigir com a IA</button>${d.agent?.provider && d.agent.provider !== 'hermes' ? `<button type="button" class="btn ghost sm" data-act="connector-test" data-id="${esc(d.agent.provider)}" data-model="${esc(d.agent.model || '')}" ${ctx.ui.respTest?.[d.agent.provider]?.running ? 'disabled' : ''}>${icon('send', 16)} ${ctx.ui.respTest?.[d.agent.provider]?.running ? 'Testando…' : 'Testar a IA deste agente'}</button>` : ''}<small class="muted">Envia ao Assistente o tipo e o motivo da falha (sem arquivos nem o objetivo completo). Ele propõe ajustar o agente e repetir a tarefa; nada é aplicado sem a sua aprovação.</small></div></section>` : ''}
    ${d.resume ? `<section class="card"><h2>Conversa retomada</h2><p class="small muted">Esta missão continua a mesma sessão do ${esc(PROVIDER[d.agent.provider])} da missão anterior; o agente lembra do que já foi dito e feito.</p></section>` : ''}
    ${final && d.kind === 'work' ? `<section class="card"><h2>Continuar a conversa</h2><form id="followup-form"><input type="hidden" name="id" value="${esc(d.id)}">
      <label class="f">Quem continua<select name="agentId">${(() => { const ids = ctx.projectAgentIdsFor?.(d.project.id); return ids ? ctx.state.agents.filter(a => ids.has(a.id) || a.id === d.agent.id) : ctx.state.agents; })().map(a => `<option value="${esc(a.id)}" ${a.id === d.agent.id ? 'selected' : ''}>${esc(a.name)} · ${esc(PROVIDER[a.provider])}${a.provider === d.agent.provider ? ' — mesma sessão (lembra de tudo)' : ' — começa limpo, recebe resumo e arquivos'}</option>`).join('')}</select></label>
      <label class="f">Mensagem<textarea name="message" rows="3" required maxlength="5000" placeholder="Ex.: agora ajuste o título e rode os testes"></textarea></label>
      <p class="muted small">Mesmo provedor retoma a sessão inteira. Outro provedor não recebe a conversa: só o objetivo, o resumo da entrega e os arquivos produzidos.</p>
      <div class="btn-row" style="margin-top:10px"><button class="btn">${icon('send', 16)} Enviar</button></div></form></section>` : ''}
    ${(() => { const iso = d.result?.isolation; if (!iso && !d.isolate) return ''; if (!iso) return `<section class="card"><h2>Worktree isolado</h2><p class="muted small">Esta tarefa roda numa cópia do Git em branch própria; os detalhes aparecem quando ela começar.</p></section>`; return `<section class="card"><div class="card-h"><h2>Worktree isolado</h2>${iso.removed ? '<span class="chip">Removido</span>' : ''}</div><p class="small">Branch <code>${esc(iso.branch)}</code></p><p class="small muted">Pasta: <code>${esc(iso.worktree)}</code></p><p class="small muted">${iso.removed ? 'A cópia e a branch foram descartadas.' : 'Nada foi mesclado. Para integrar, revise a pasta acima e use o Git (por exemplo, confirme as mudanças na branch e faça o merge). Remover descarta as mudanças que não foram integradas.'}</p>${!iso.removed && final ? `<div class="btn-row" style="margin-top:10px"><button class="btn outline sm" data-act="rm-worktree" data-id="${esc(d.id)}">${icon('x', 16)} Remover worktree e branch</button></div>` : ''}</section>`; })()}
    <div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:14px"><section class="card" style="margin:0"><div class="card-h"><h2>Saída em tempo real</h2><span class="chip"><span class="dot d-${live ? 'running' : 'idle'}"></span>${esc(PROVIDER[d.agent.provider])}</span><button class="btn ghost sm" data-act="full-out">${icon('external', 16)} ${ctx.ui.fullOut ? 'Reduzir' : 'Tela cheia'}</button></div>
      <pre class="out ${ctx.ui.fullOut ? 'full' : ''}">${logs.length ? logs.map(e => `<span class="logline"><span class="t">${hm(e.at)}</span><span>${esc((e.text || JSON.stringify(e.usage || '')).slice(0, 400))}</span></span>`).join('\n') : esc(live ? 'Aguardando eventos do agente…' : (d.reason ? 'Não chegou a rodar: ' + String(d.reason).slice(0, 260) : 'Sem eventos de saída.'))}</pre></section>
      ${unblockHtml(d)}<section class="card" style="margin:0"><div class="card-h"><h2>${final ? 'Resultado' : 'Última saída concluída'}</h2>${d.status === 'completed' ? `<span style="color:var(--ok)">${icon('check', 22)}</span>` : ''}</div>${d.answer ? `<p class="small muted">${esc(new Date(d.updatedAt).toLocaleString('pt-BR'))}</p><pre class="out">${esc(d.answer)}</pre>` : empty(live ? 'Ainda sem resposta do agente.' : (d.reason ? 'Sem resposta porque a tarefa não rodou: ' + String(d.reason).slice(0, 260) : 'Sem resposta registrada.'))}</section></div>` : ''}
  ${tab === 'eventos' ? `<section class="card"><h2>Eventos persistidos</h2><pre class="out full">${esc(logs.map(e => `${time(e.at)} [${e.type}] ${(e.text || JSON.stringify(e.usage || '')).slice(0, 600)}`).join('\n\n') || 'Nenhum evento ainda.')}</pre></section>` : ''}
  ${tab === 'arquivos' ? `<section class="card"><div class="card-h"><h2>Entregas</h2>${files.length ? `<button class="btn ghost sm" data-act="changes" data-id="${esc(d.id)}">Ver diff textual</button>` : ''}</div>${files.length ? files.map(f => `<div class="setting"><span>${icon('file', 20)}</span><span class="grow">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.path)}</a>` : esc(f.path)}<br><small class="muted">${esc({ created: 'criado', modified: 'alterado', deleted: 'removido' }[f.change] || f.change)} · ${kb(f.bytes)}${f.sha256 ? ` · sha256 ${esc(f.sha256.slice(0, 10))}` : ''}</small></span></div>`).join('') + '<p class="muted small" style="margin-top:8px">Abrir uma entrega não a publica nem a aprova.</p>' : empty(live ? 'Ainda não há arquivos registrados; eles aparecem quando a execução terminar.' : 'Nenhum arquivo criado ou alterado.')}</section>` : ''}
  </div>
  <aside class="card side-card"><h3>Agente responsável</h3><div class="agent-head">${agentAv(d.agent, idx(ctx, d.agent), 68)}<div><b>${esc(d.agent.role)}</b><br><span class="small"><span class="dot d-${dotOf(d.status)}"></span> ${esc(live ? 'Executando a tarefa' : STATUS[d.status])}</span></div></div>
    <div class="cols" style="grid-template-columns:1fr 1fr;margin-top:12px"><div><span class="muted small">Ferramenta</span><div class="chip" style="margin-top:6px">${icon('terminal', 16)} ${esc(PROVIDER[d.agent.provider])}</div></div><div><span class="muted small">Tempo decorrido</span><div class="clock" ${live && last ? `data-since="${esc(last.startedAt)}"` : ''}>${last?.durationMs != null ? dur(last.durationMs) : live ? dur(Date.now() - Date.parse(last?.startedAt || d.updatedAt)) : '—'}</div></div></div>
    <h3>Progresso da tarefa</h3><div class="note" style="margin:0">${icon('layers', 18)}<span><b>${esc(STATUS[d.status])}</b>${flowPos ? ` · etapa ${flowPos.i} de ${flowPos.n} do fluxo` : ''}<br><span class="small">${live && logs.at(-1) ? `Último evento: ${esc(logs.at(-1).type)}` : `Tentativa ${d.attemptCount} de ${d.limits?.maxAttempts}`}</span></span></div>
    <dl class="kv"><dt>Modelo solicitado</dt><dd>${esc(d.agent.model || 'padrão da conta')}</dd><dt>Modelo informado pela CLI</dt><dd>${esc(d.actualModel || 'não informado pelo provedor')}</dd><dt>Permissão</dt><dd>${d.agent.mode === 'write' ? 'Edita arquivos' : 'Somente leitura'}</dd><dt>Tokens</dt><dd>${num(d.usage?.input)} / ${num(d.usage?.output)}</dd><dt>Custo</dt><dd>${d.usage?.cost == null ? 'indisponível' : 'US$ ' + Number(d.usage.cost).toFixed(4)}</dd></dl>${d.usage?.cost != null ? '<p class="muted small">Referência de API informada pelo CLI; não é fatura.</p>' : ''}
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
  <label class="f">Trazer equipe inicial para este projeto<select name="team"><option value="">Escolher equipe (opcional)</option>${ctx.state.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>
  ${note('Contexto e arquivos separados por projeto. Projetos da área Financeiro não compartilham dados com agentes de outros ambientes.')}
  <button class="btn block lg" style="margin-top:16px">Criar projeto</button></form>`;
}
// "Equipe deste projeto": quem foi trazido para cá (agentes 🤖 e equipes 👥). Só organiza e filtra a tela; permissões e liberações de cada agente não mudam.
export function projectMembersHtml(ctx, p) {
  const ids = new Set(p.agentIds || []), teamIds = typeof ctx.projectTeamIdsFor === 'function' ? ctx.projectTeamIdsFor(p.id) : new Set(p.teamIds || []), agents = ctx.state.agents, mem = agents.filter(a => ids.has(a.id));
  const teamsIn = ctx.state.teams.filter(t => teamIds.has(t.id)), teamAgents = new Set(teamsIn.flatMap(t => (t.members || []).map(m => m.agentId)));
  const freeA = agents.filter(a => !ids.has(a.id) && !teamAgents.has(a.id)), freeT = ctx.state.teams.filter(t => !teamIds.has(t.id));
  return `<h3 style="margin-top:18px">Equipe deste projeto</h3><p class="muted small">A Sala, o chat e o Canvas mostram agentes adicionados aqui, integrantes das equipes ligadas e quem já trabalhou neste projeto. Equipes de outros projetos ficam fora até você trazê-las.</p>
  ${mem.length ? mem.map(a => `<div class="setting" style="padding:6px 0"><span class="grow">${icon('user', 16)} <b>${esc(a.name)}</b> <small class="muted">${esc(a.role || '')}</small></span><button type="button" class="btn ghost sm" data-act="member-remove" data-id="${esc(a.id)}" data-project="${esc(p.id)}">Tirar</button></div>`).join('') : !teamsIn.length ? '<p class="muted small">Nenhum agente ligado ainda. Traga uma equipe ou um agente abaixo.</p>' : ''}
  ${teamsIn.length ? `<p class="small muted" style="margin-top:6px">Equipes ligadas:</p>${teamsIn.map(t => `<div class="setting" style="padding:6px 0"><span class="grow">${icon('users', 16)} <b>${esc(t.name)}</b><small class="muted" style="display:block">${(t.members || []).map(m => { const a = agents.find(x => x.id === m.agentId); return a ? `${esc(a.name)} · ${esc(m.role || a.role || '')}` : ''; }).filter(Boolean).join(' · ')}</small></span><button type="button" class="btn ghost sm" data-act="team-member-remove" data-id="${esc(t.id)}" data-project="${esc(p.id)}">Desvincular</button></div>`).join('')}` : ''}
  ${freeA.length || freeT.length ? `<label class="f" style="margin-top:8px">Trazer para o projeto<select class="member-add" data-project="${esc(p.id)}" aria-label="Trazer agente ou equipe para ${esc(p.name)}"><option value="">＋ escolher…</option>${freeT.length ? `<optgroup label="Equipes (todos os membros)">${freeT.map(t => `<option value="t:${esc(t.id)}">👥 ${esc(t.name)}</option>`).join('')}</optgroup>` : ''}${freeA.length ? `<optgroup label="Agentes">${freeA.map(a => `<option value="a:${esc(a.id)}">🤖 ${esc(a.name)}</option>`).join('')}</optgroup>` : ''}</select></label>` : ''}`;
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
  <section class="card" style="margin-top:14px"><h3>Sugestão de equipe</h3><p class="muted small">O Assistente lê o README, o arquivo de dependências e a estrutura da pasta (somente leitura, sem abrir arquivos de segredo), pergunta o que faltar e propõe a equipe com a IA e o modelo de cada agente. Nada é criado sem a sua aprovação.</p><button type="button" class="btn outline sm" data-act="project-team-suggest" data-id="${esc(p.id)}">✨ Sugerir equipe com o Assistente</button></section>${projectMembersHtml(ctx, p)}
  ${referencesSectionHtml(ctx)}${gitSectionHtml(ctx)}
  ${(c?.proposed || []).length ? `<h3 style="margin-top:18px">Sugestões de decisão (${c.proposed.length})</h3><p class="muted small">Sugeridas quando você aprovou entregas. Só entram no contexto dos agentes se você aceitar.</p>${c.proposed.map(x => `<div class="prop"><textarea class="prop-text" id="prop-${esc(x.id)}" rows="2" maxlength="500" aria-label="Texto da decisão">${esc(x.text)}</textarea><div class="btn-row"><button type="button" class="btn sm" data-act="ctx-prop-accept" data-id="${esc(x.id)}">Aceitar</button><button type="button" class="btn ghost sm" data-act="ctx-prop-dismiss" data-id="${esc(x.id)}">Descartar</button></div></div>`).join('')}` : ''}
  ${(c?.deliverables || []).length ? `<h3 style="margin-top:18px">Entregas recentes</h3>${c.deliverables.slice().reverse().map(d => `<p class="small">${esc(d.summary.slice(0, 120))}<br><span class="muted">${esc(d.agent)} · ${esc(d.files.join(', '))}</span></p>`).join('')}` : ''}
  <section class="card" style="margin-top:18px;border-color:color-mix(in srgb,var(--bad) 45%,var(--line))"><h3>Excluir projeto</h3><p class="muted small">Tira o projeto do Code Room. A pasta no computador não é apagada e o histórico de tarefas fica guardado.</p><button type="button" class="btn ghost sm" data-act="project-delete" data-id="${esc(p.id)}">${icon('x', 16)} Excluir este projeto</button></section>`;
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
  <div class="btn-row" style="margin-top:12px"><button class="btn" data-act="ask-agent" data-id="${esc(a.id)}">Nova tarefa</button><button class="btn ghost" data-act="mention-agent" data-id="${esc(a.id)}">@ Mencionar no chat</button><button class="btn ghost" data-act="mini-open" data-id="${esc(a.id)}">Abrir em janela própria</button><button class="btn ghost" data-act="edit-agent" data-id="${esc(a.id)}">Editar perfil</button>${String(a.id).startsWith('assistant-') ? '' : `<button class="btn ghost danger" data-act="agent-delete" data-id="${esc(a.id)}">Excluir agente</button>`}</div>`;
}
