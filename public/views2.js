// Telas do Code Room (parte 2).
import { icon } from './icons.js';
import { qrSvg } from './qr.js';
import { heroScene, thumb, themeImg, avatar, agentAv } from './art.js';
import { updatesSettingsHtml } from './updates-ui.js';
import { agentTip } from './activity.js';
export const EFFORT_LABEL = { low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto', max: 'máximo' };
import { providersCardHtml } from './providers-ui.js';
import { hermesCardHtml } from './hermes-ui.js';
import { obsidianCardHtml } from './obsidian-ui.js';
import { auditHtml } from './audit-ui.js';
import { socialCardHtml } from './social-ui.js';
import { apisCardHtml } from './apis-ui.js';
import { syncCardHtml } from './sync-ui.js';
import { economyCardHtml } from './economy-ui.js';
import { outboundCardHtml } from './outbound-ui.js';
import { folderJobsCardHtml } from './folderjobs-ui.js';
import { esc, STATUS, PROVIDER, CAPS, ROLES, AREAS, AREA_DOT, num, hm, dur, kb, dotOf, pill, empty, note, inProject, idx, hero, tabs, toggle } from './views.js';

export const COMMANDS = {
  codex: { name: 'Codex CLI', desc: 'Codificação e automação via terminal', install: 'npm install -g @openai/codex', login: 'codex login', update: 'npm install -g @openai/codex@latest' },
  claude: { name: 'Claude Code', desc: 'Assistente de código da Anthropic', install: 'npm install -g @anthropic-ai/claude-code', login: 'claude auth login', update: 'claude update' },
  agy: { name: 'Antigravity (Gemini)', desc: 'Agente do Google com modelos Gemini', install: 'Instale o Antigravity pelo site oficial do Google', login: 'agy', update: 'agy update' },
  hermes: { name: 'Hermes Agent (remoto)', desc: 'Roda no seu servidor via SSH; não enxerga arquivos deste computador', install: 'Já instalado no servidor; o acesso usa o arquivo bin\hermes.bat', login: 'hermes', update: '' },
  gemini: { name: 'Gemini CLI', desc: 'Agente do Google para desenvolvimento', install: 'npm install -g @google/gemini-cli', login: '', update: '' }
};
const toolInfo = (ctx, id) => ctx.checks?.find(c => c.id === id) || { id, installed: ctx.state.connectors.find(c => c.id === id)?.available ?? false, path: null, version: null, authenticated: null };
const toolLogo = id => id === 'agy' ? `<span class="logo">${icon('sparkle', 34)}</span>` : id === 'hermes' ? `<span class="logo">${icon('globe', 32)}</span>` : id === 'claude' ? `<span class="logo claude">${icon('asterisk', 34)}</span>` : id === 'gemini' ? `<span class="logo">${icon('sparkle', 34)}</span>` : `<span class="logo term">${icon('terminal', 32)}</span>`;

// ---------- Equipes ----------
export function viewTeams(ctx) {
  const st = ctx.state, d = ctx.teamDraft, c = st.runtime.concurrency || { global: 1 };
  const agentOf = id => st.agents.find(a => a.id === id);
  const rows = d.members.map((m, i) => {
    const a = agentOf(m.agentId);
    return `<div class="member"><span class="muted">${icon('grip', 18)}</span>${a ? agentAv(a, idx(ctx, a), 56) : '<span></span>'}
      <div><label class="lab" for="m-role-${i}">Papel</label><select id="m-role-${i}" data-field="role" data-i="${i}">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${m.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="lab" for="m-ag-${i}">Agente</label><select id="m-ag-${i}" data-field="agentId" data-i="${i}">${st.agents.map(x => `<option value="${esc(x.id)}" ${m.agentId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div><span class="lab">Ferramenta</span><span class="chip">${icon('terminal', 16)} ${esc(a ? PROVIDER[a.provider] : '—')}</span></div>
      <div><span class="lab">Modelo e skills</span><div class="chips"><span class="chip">${esc(a?.model || 'modelo padrão')}</span>${(a?.capabilities || []).map(k => `<span class="chip">${esc(CAPS[k] || k)}</span>`).join('')}${a ? `<span class="chip">${a.skillIds.length} skill(s)</span>` : ''}</div></div>
      <button class="iconbtn" data-act="del-member" data-id="${i}" aria-label="Remover papel">${icon('x', 20)}</button></div>`;
  }).join('');
  const dev = d.members.find(m => m.role === 'desenvolvedor'), rev = d.members.find(m => m.role === 'revisor');
  const rounds = ctx.prefs.rounds || 1;
  return `<div class="page">${hero('Monte sua equipe', 'Defina os agentes e configure como eles vão trabalhar na sua missão.', 'window')}
  <div class="cols c-2-1"><section class="card"><label class="f" for="team-name" style="margin:0">Nome da equipe</label><div class="input-icon"><input id="team-name" value="${esc(d.name)}" maxlength="100"><span class="iconbtn" aria-hidden="true">${icon('edit', 18)}</span></div>
    <div style="margin-top:14px">${rows || empty('Adicione papéis à equipe: o papel vem da equipe; ferramenta, modelo, skills e permissões vêm do agente.')}</div>
    <div class="btn-row" style="margin-top:6px"><button class="btn outline" data-act="add-member" ${st.agents.length ? '' : 'disabled'}>${icon('plus', 18)} Adicionar papel</button></div>
    ${st.teams.length ? `<h3 style="margin-top:18px">Equipes salvas</h3>${st.teams.map(t => `<div class="setting"><span class="grow"><b>${esc(t.name)}</b><br><small class="muted">${t.members.map(m => `${esc(ROLES[m.role])}: ${esc(agentOf(m.agentId)?.name || '?')}`).join(' · ')}</small></span><button class="btn ghost sm" data-act="load-team" data-id="${esc(t.id)}">Editar</button></div>`).join('')}<button class="btn ghost sm" data-act="new-team" style="margin-top:8px">${icon('plus', 16)} Nova equipe</button>` : ''}</section>
  <aside><section class="card"><h2>Fluxo da missão</h2><p class="muted small" style="margin-bottom:12px">O fluxo real é sequencial: o desenvolvedor produz a entrega e o revisor a inspeciona.</p>
    ${dev && rev ? `<div class="flow-step"><span class="n">1</span><div class="b"><b>Executar</b><br><span class="small" style="color:var(--accent-h)">${esc(agentOf(dev.agentId)?.name || '—')}</span> <span class="muted small">Produz a entrega e registra os arquivos.</span></div></div><div class="flow-step"><span class="n">2</span><div class="b"><b>Revisar</b><br><span class="small" style="color:var(--accent-h)">${esc(agentOf(rev.agentId)?.name || '—')}</span> <span class="muted small">Depende de: Executar. Valida a entrega.</span></div></div>` : empty('Inclua um desenvolvedor e um revisor para montar o fluxo.')}
    <h2 style="margin-top:16px">Configurações da execução</h2>
    <div class="setting">${icon('layers', 22)}<span class="grow">Execuções simultâneas<br><small class="muted">Limite global de tarefas em paralelo.</small></span><span class="stepper-n"><button data-act="step" data-id="global:-1" aria-label="Diminuir">${icon('minus', 16)}</button><span>${c.global}</span><button data-act="step" data-id="global:1" aria-label="Aumentar">${icon('plus', 16)}</button></span></div>
    <div class="setting">${icon('refresh', 22)}<span class="grow">Limite de revisões<br><small class="muted">Rodadas de correção e revisão por fluxo.</small></span><span class="stepper-n"><button data-act="step" data-id="rounds:-1" aria-label="Diminuir">${icon('minus', 16)}</button><span>${rounds}</span><button data-act="step" data-id="rounds:1" aria-label="Aumentar">${icon('plus', 16)}</button></span></div>
    <div class="setting">${icon('gear', 22)}<span class="grow">Supervisor automático<br><small class="muted">Novas missões vão ao supervisor para propor um plano.</small></span>${toggle('pref-autosup', !!ctx.prefs.autoSupervisor, 'Supervisor automático')}</div>
    <div class="btn-row" style="margin-top:12px"><button class="btn outline" data-act="test-flow" ${dev && rev && ctx.project ? '' : 'disabled'}>${icon('play', 16)} Testar fluxo</button><button class="btn" data-act="save-team" ${st.agents.length ? '' : 'disabled'}>${icon('save', 16)} Salvar equipe</button></div></section>
  <section class="card"><h2>Iniciar fluxo sequencial</h2><form id="flow-form"><label class="f">Equipe<select name="team" required>${st.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>
    <label class="f">Objetivo<textarea name="objective" rows="3" required maxlength="5000"></textarea></label><label class="f">Critérios (um por linha)<textarea name="criteria" rows="3"></textarea></label>
    <button class="btn block" style="margin-top:12px" ${st.teams.length && ctx.project ? '' : 'disabled'}>Iniciar fluxo</button></form>
    ${st.flows.filter(f => !ctx.project || f.projectId === ctx.project).slice(0, 5).map(f => `<div class="setting"><span class="pill ${f.status === 'running' ? 'info' : f.status === 'completed' ? 'ok' : 'bad'}">${esc(f.status === 'running' ? 'Em andamento' : STATUS[f.status] || f.status)}</span><span class="grow small">${esc(f.objective.slice(0, 60))}</span><button class="link" data-act="flow" data-id="${esc(f.id)}">Abrir</button></div>`).join('')}</section></aside></div></div>`;
}

// ---------- Agentes e ferramentas ----------
export function viewAgents(ctx) {
  const tab = ctx.ui.agentsTab || 'mine', st = ctx.state;
  const mine = st.agents.length ? `<div class="agents-grid">${st.agents.map(a => { const s = ctx.agentStatus(a); return `<article class="agent-card" title="${esc(agentTip(ctx, a))}">${agentAv(a, idx(ctx, a), 56)}<div><strong>${esc(a.name)}</strong> <small class="muted">${esc(a.role)}</small><div class="chips" style="margin-top:6px"><span class="chip">${esc(PROVIDER[a.provider])}</span><span class="chip">${esc(a.model || 'modelo padrão')}</span>${a.effort ? `<span class="chip" title="Esforço de raciocínio">esforço ${esc(EFFORT_LABEL[a.effort] || a.effort)}</span>` : ''}<span class="chip">${a.mode === 'write' ? 'edita arquivos' : 'somente leitura'}</span><span class="chip">${esc(a.room)}</span>${(a.capabilities || []).map(k => `<span class="chip c-code">${esc(CAPS[k] || k)}</span>`).join('')}<span class="chip">${a.skillIds.length} skill(s)</span></div></div><div style="text-align:right"><span class="pill mute"><span class="dot d-${s.status}"></span>${esc(s.label)}</span><br> <button class="btn ghost sm" data-act="edit-agent" data-id="${esc(a.id)}" style="margin-top:8px">Editar</button></div></article>`; }).join('')}</div>` : empty('Crie seu primeiro agente.');
  const q = (ctx.ui.toolQ || '').toLowerCase();
  const tools = ['codex', 'claude', 'agy', 'hermes', 'gemini'].filter(id => COMMANDS[id].name.toLowerCase().includes(q));
  const sel = ctx.ui.toolSel || 'codex', cmd = COMMANDS[sel], info = toolInfo(ctx, sel);
  const busy = st.runs.filter(t => ['running', 'cancelling'].includes(t.status) && t.agent.provider === sel).length;
  const list = tools.map(id => {
    const i = toolInfo(ctx, id), c = COMMANDS[id], supported = id !== 'gemini';
    return `<article class="tool ${sel === id ? 'on' : ''}" style="grid-template-columns:auto 1fr auto">${toolLogo(id)}<div><strong style="font-size:1.15rem">${esc(c.name)}</strong><p class="muted">${esc(c.desc)}</p></div><span class="pill ${i.installed ? 'ok' : 'mute'}"><span class="dot d-${i.installed ? 'ok' : 'idle'}"></span>${i.installed ? (supported ? 'Instalado' : 'Instalado (sem conector)') : 'Não instalado'}</span>
      <div class="tool-foot"><div><span class="small">Versão instalada</span><b>${esc(i.version || 'Não detectada')}</b></div><div><span class="small">Origem</span><b>${esc(i.path || '—')}</b></div><span class="grow"></span>
      <button class="btn ghost sm" data-act="test-tool" data-id="${id}" ${i.installed && supported ? '' : 'disabled'}>${icon('terminal', 16)} Testar</button><button class="btn ghost sm" data-act="tool-help" data-id="${id}">${icon('file', 16)} Ver instruções</button></div></article>`;
  }).join('');
  return `<div class="page">${hero('Agentes e ferramentas', 'Gerencie os agentes de IA e as ferramentas CLI disponíveis no seu ambiente.', 'agentes', `<button class="btn" data-act="new-agent">${icon('plus', 18)} Criar agente</button>`)}
  ${tabs([['mine', 'Meus agentes'], ['tools', 'Ferramentas instaladas']], tab, 'agents-tab')}
  ${tab === 'mine' ? mine : `<div class="cols c-2-1"><div><div class="filters"><div class="input-icon">${icon('search', 18)}<input id="tool-q" placeholder="Buscar ferramentas…" aria-label="Buscar ferramentas" value="${esc(ctx.ui.toolQ || '')}"></div></div>${list || empty('Nenhuma ferramenta neste filtro.')}</div>
    <aside class="card"><h2>Instruções oficiais</h2><div class="card-h" style="margin-bottom:10px"><div style="display:flex;gap:12px;align-items:center">${toolLogo(sel)}<div><b>${esc(cmd.name)}</b><br><span class="muted small">${esc(cmd.desc)}</span></div></div></div>
      <div class="note" style="margin-top:0">${icon('layers', 18)}<span>${busy ? `${busy} tarefa(s) em execução usam esta ferramenta.` : 'Nenhuma tarefa em execução usa esta ferramenta.'}</span></div>
      <h3 style="margin:14px 0 6px">Instalar</h3><pre>${esc(cmd.install)}</pre><button class="btn ghost sm" data-act="copy" data-id="${esc(cmd.install)}" style="margin-top:6px">${icon('copy', 16)} Copiar comando</button>
      ${cmd.update ? `<h3 style="margin:14px 0 6px">Atualizar</h3><pre>${esc(cmd.update)}</pre><button class="btn ghost sm" data-act="copy" data-id="${esc(cmd.update)}" style="margin-top:6px">${icon('copy', 16)} Copiar comando</button>` : ''}
      ${cmd.login ? `<h3 style="margin:14px 0 6px">Entrar na conta</h3><pre>${esc(cmd.login)}</pre>` : ''}
      ${note('O Code Room não instala nem atualiza ferramentas sozinho. Confira os comandos no guia oficial do provedor antes de executar; atualize só com o agente livre.')}</aside></div>`}</div>`;
}

// ---------- Conexões ----------
// Canais: identidade, estilo, contas e cadência de cada perfil. O Postador de cada canal prepara os pacotes; quem publica é código, com a sua confirmação.
export function channelsCard(ctx) {
  const chs = ctx.state.channels || [], ST = { vhs: 'VHS / realista', cordel: 'Xilogravura / cordel', outro: 'Outro' }, e = ctx.ui.channelEdit, cur = e === 'new' ? {} : chs.find(c => c.id === e) || null;
  const list = chs.map(c => `<article class="batch"><div class="card-h"><h3>${esc(c.name)}</h3><span class="pill info">${ST[c.style] || ''}</span></div>
    <p class="small muted">${esc(c.niche || 'nicho não definido')} · ${c.perDay} post(s)/dia${c.windows ? ' · ' + esc(c.windows) : ''}</p>
    <p class="small">${['youtube', 'instagram', 'tiktok'].map(n => `<span class="chip">${n === 'youtube' ? 'YouTube' : n === 'instagram' ? 'Instagram' : 'TikTok'}: ${c.networks?.[n] ? '@' + esc(c.networks[n]) : '<i>sem perfil ainda</i>'}</span>`).join(' ')}</p>
    <p class="small muted">${c.postadorId ? 'Postador criado (aba Agentes).' : 'Sem Postador ainda.'}</p>
    <div class="btn-row"><button class="btn outline sm" data-act="channel-edit" data-id="${esc(c.id)}">Editar</button><button class="btn outline sm" data-act="channel-del" data-id="${esc(c.id)}">Remover</button></div></article>`).join('');
  const form = cur ? `<form id="channel-form" class="rt-form"><input type="hidden" name="id" value="${esc(cur.id || '')}">
    <div class="form-grid"><label class="f">Nome do canal<input name="name" required maxlength="60" value="${esc(cur.name || '')}"></label>
    <label class="f">Estilo visual<select name="style">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${cur.style === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <label class="f">Nicho<input name="niche" maxlength="200" value="${esc(cur.niche || '')}" placeholder="Ex.: lendas brasileiras de terror"></label>
    <label class="f">Tom de voz do canal<input name="tone" maxlength="300" value="${esc(cur.tone || '')}" placeholder="Ex.: sussurrado, direto, fala com “você”"></label>
    <label class="f">Voz da narração<input name="voice" maxlength="100" value="${esc(cur.voice || '')}" placeholder="Ex.: nome da voz (ElevenLabs)"></label>
    <label class="f">Identidade visual (paleta, fontes, capa)<input name="palette" maxlength="200" value="${esc(cur.palette || '')}" placeholder="Ex.: preto, vermelho #FF3B30, Consolas, REC"></label>
    <label class="f">Bio do perfil<textarea name="bio" rows="2" maxlength="300">${esc(cur.bio || '')}</textarea></label>
    <div class="form-grid"><label class="f">YouTube (@)<input name="youtube" maxlength="60" value="${esc(cur.networks?.youtube || '')}"></label><label class="f">Instagram (@)<input name="instagram" maxlength="60" value="${esc(cur.networks?.instagram || '')}"></label><label class="f">TikTok (@)<input name="tiktok" maxlength="60" value="${esc(cur.networks?.tiktok || '')}"></label></div>
    <div class="form-grid"><label class="f">Posts por dia (1 a 4)<input name="perDay" type="number" min="1" max="4" value="${cur.perDay || 2}"></label><label class="f">Horários preferidos<input name="windows" maxlength="120" value="${esc(cur.windows || '')}" placeholder="Ex.: 12h, 19h, 21h"></label></div>
    ${cur.postadorId ? '' : '<label class="f" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="createPostador" value="1" checked style="width:auto"> Criar o agente Postador deste canal</label>'}
    <div class="btn-row"><button class="btn">Salvar canal</button><button type="button" class="btn outline" data-act="channel-close">Fechar</button></div></form>` : '';
  return `<section class="card" style="margin-top:16px"><div class="card-h"><h2>Canais</h2>${cur ? '' : `<button class="btn sm" data-act="channel-new">${icon('plus', 16)} Novo canal</button>`}</div>
  <p class="small muted">Cada perfil tem a sua identidade, estilo e cadência. Os links entre os canais e as redes ficam aqui; o login de cada rede é autorizado por você, nunca guardado em texto.</p>
  ${list || '<p class="muted">Nenhum canal ainda.</p>'}${form}</section>`;
}
export function viewConnections(ctx) {
  const sel = ctx.ui.toolSel || 'codex', cmd = COMMANDS[sel], info = toolInfo(ctx, sel);
  const anyAuth = ['codex', 'claude', 'agy'].some(id => toolInfo(ctx, id).installed && toolInfo(ctx, id).authenticated);
  const stepsDone = [anyAuth, ctx.state.teams.length > 0, ctx.state.projects.length > 0], cur = stepsDone.findIndex(x => !x);
  const wiz = ['Conexões', 'Equipe', 'Projeto'].map((l, i) => `<button class="st ${stepsDone[i] ? 'done' : i === cur ? 'on' : ''}" data-nav="${['connections', 'teams', 'projects'][i]}"><span class="n">${stepsDone[i] ? icon('check', 18) : i + 1}</span>${l}</button>${i < 2 ? '<span class="ln"></span>' : ''}`).join('');
  const card = id => {
    const i = toolInfo(ctx, id), ok = i.installed && i.authenticated;
    return `<button class="tool ${sel === id ? 'on' : ''}" data-act="tool-sel" data-id="${id}">${toolLogo(id)}<span><strong style="font-size:1.2rem">${esc(COMMANDS[id].name)}</strong><br><span class="muted">${esc(COMMANDS[id].desc)}</span><span class="st"><span><span class="dot d-${i.installed ? (ok ? 'ok' : 'warn') : 'idle'}"></span> ${i.installed ? (ok ? 'Conectado' : 'Detectado') : 'Não encontrado'}</span><span>${i.installed ? (ok ? `Acesso autorizado${i.method ? ' (' + esc(i.method) + ')' : ''}` : i.authenticated === false ? 'Sem login' : 'Login não verificado') : 'Instale o CLI'}</span></span></span><span class="btn ${ok ? 'ghost' : ''}" style="pointer-events:none">${ok ? 'Testar conexão' : 'Autenticar'}</span></button>`;
  };
  const mods = ctx.modules, s = { verified: ['ok', 'verificado'], unverified: ['warn', 'não verificado'], unavailable: ['bad', 'indisponível'] };
  return `<div class="page">${hero('Conecte suas ferramentas', 'Integre seus provedores e ferramentas para começar a trabalhar com o Code Room.', 'conexoes')}
  <div class="wizard" aria-label="Passos de configuração">${wiz}</div>
  <div class="cols c-2-1" style="grid-template-columns:minmax(0,1fr) 400px"><section class="card"><h2>Ferramentas disponíveis</h2><p class="muted" style="margin-bottom:12px">Conecte as ferramentas que você vai usar neste projeto. Você pode configurar outras depois.</p>${card('codex')}${card('claude')}
    <div class="tool" style="opacity:.75">${`<span class="logo">${icon('cloud', 34)}</span>`}<span><strong style="font-size:1.2rem">API de modelo</strong><br><span class="muted">Use sua própria API de modelos</span><span class="st"><span><span class="dot d-idle"></span> Não configurada</span><span>Ainda não disponível nesta versão</span></span></span><span class="btn ghost" aria-disabled="true" style="opacity:.5">Em breve</span></div></section>
  <aside class="card"><div class="card-h"><div style="display:flex;gap:14px;align-items:center">${toolLogo(sel)}<div><h2 style="font-size:1.3rem">${esc(cmd.name)}</h2><span class="muted small">${esc(cmd.desc)}</span></div></div><span class="pill ${info.installed ? 'ok' : 'bad'}"><span class="dot d-${info.installed ? 'ok' : 'bad'}"></span>${info.installed ? 'Detectado' : 'Não encontrado'}</span></div>
    <label class="f">Tipo de conexão<select disabled><option>CLI local — usa o CLI já instalado no seu computador</option></select></label>
    <label class="f">Local da instalação<div class="input-icon">${icon('folder', 18)}<input readonly value="${esc(info.path || '')}" placeholder="Não encontrado no PATH nem nos locais padrão"></div></label>
    ${info.installed ? `<p class="small" style="margin-top:8px;color:var(--ok)">${icon('check', 16)} CLI encontrado neste local${info.version ? ` (${esc(info.version)})` : ''}.</p>` : ''}
    <h3 style="margin:16px 0 8px">Autenticação</h3><p class="small ${info.authenticated ? '' : 'muted'}">${info.authenticated == null ? 'Login não verificado.' : info.authenticated ? `Login ativo${info.method ? ' (' + esc(info.method) + ')' : ''}.` : 'Login inativo.'}</p>
    <button class="btn block" data-act="copy" data-id="${esc(cmd.login)}" ${cmd.login && info.installed ? '' : 'disabled'} style="margin-top:8px">${icon('copy', 18)} Copiar comando de login</button><p class="muted small" style="text-align:center;margin-top:8px">Rode <code>${esc(cmd.login || '—')}</code> no terminal e conclua o acesso no fluxo oficial do provedor. O Code Room não captura senha.</p>
    <h3 style="margin:16px 0 8px">Recursos disponíveis</h3><div class="chips"><span class="chip">${icon('file', 16)} Arquivos</span><span class="chip">${icon('terminal', 16)} Comandos</span></div></aside></div>
  ${providersCardHtml(ctx)}${hermesCardHtml(ctx)}${obsidianCardHtml(ctx)}${apisCardHtml(ctx)}${socialCardHtml(ctx)}${syncCardHtml(ctx)}${outboundCardHtml(ctx)}
  ${channelsCard(ctx)}
  <section class="card"><h2>Módulos e capacidades</h2>${mods ? mods.map(m => `<div class="module"><strong>${esc(m.name)}</strong> ${Object.entries(m.capabilities).map(([k, v]) => `<span class="pill ${s[v.status][0]}" title="${esc(v.detail)}" style="margin-left:6px">${esc(CAPS[k] || k)}: ${s[v.status][1]}</span>`).join('')}</div>`).join('') : empty('Verificando…')}<p class="muted small" style="margin-top:8px">Uma capacidade só aparece como verificada depois de uma sonda real neste computador.</p></section>
  <div class="composer-bar" style="display:flex;align-items:center;gap:14px;margin:14px -26px 0"><span class="muted" style="flex:1;display:flex;gap:10px;align-items:center">${icon('info', 18)} API e assinatura podem ter cobranças diferentes.</span><button class="btn" data-nav="${cur === 1 ? 'teams' : cur === 2 ? 'projects' : 'room'}">Continuar ${icon('arrow', 18)}</button></div></div>`;
}

// ---------- Skills ----------
const skillIcon = n => /code|review|revis|dev/i.test(n) ? 'code' : /video|film|edi/i.test(n) ? 'film' : /search|pesq|research/i.test(n) ? 'search' : /orch|orquest|team/i.test(n) ? 'sitemap' : 'sparkle';
export const skillState = s => s.missingDependencies.length ? ['bad', 'Programa ausente'] : !s.recognized ? ['warn', 'Não validada'] : ['ok', 'Compatível'];
// Categorias das skills (deduzidas do nome e da descrição, sem depender de metadados).
export const SKILL_CATS = [['video', 'Vídeo e áudio', /v[ií]deo|reel|short|legenda|subtitle|editar|editor|b-?roll|thumbnail|motion|hyperframes|remotion|ffmpeg|clip|narra|podcast|audio|áudio|youtube|tiktok/i],
  ['codigo', 'Código e dev', /c[óo]digo|code|dev(eloper)?\b|git(hub)?|api\b|sdk|debug|test(e|s|ing)?\b|deploy|refactor|typescript|python|react|node|database|sql|firebase|cli\b|review|mcp|orchestr|agent|computer|automa/i],
  ['marketing', 'Marketing e vendas', /marketing|seo|ads?\b|an[úu]ncio|copy(writing)?|cro\b|landing|email|e-mail|social|launch|lan[çc]amento|pricing|pre[çc]o|funil|funnel|sales|vend|lead|brand|marca|influenc|campanha|analytics|strateg|estrat[ée]gia/i],
  ['pesquisa', 'Pesquisa e dados', /pesquis|research|search|busca|competitor|concorrent|dados|data\b|scrap|an[áa]lise|analysis|relat[óo]rio|report|customer|cliente|trend|tend[êe]ncia/i],
  ['texto', 'Texto e documentos', /texto|write|writing|escrev|document|docs?\b|pdf|pptx|xlsx|markdown|notion|obsidian|roteiro|script|article|artigo|blog/i],
  ['design', 'Design e imagem', /design|imagem|image|ui\b|ux\b|figma|logo|visual|art(e|work)?\b|pixel|ilustra|cor(es)?\b|canvas|diagram/i]];
export const skillCategory = s => { const t = `${s.name} ${s.description || ''}`; const hit = SKILL_CATS.find(([, , re]) => re.test(s.name)) || SKILL_CATS.find(([, , re]) => re.test(t)); return hit ? hit[0] : 'outros'; };
export function viewSkills(ctx) {
  const q = (ctx.ui.skillQ || '').toLowerCase(), all = ctx.skills.filter(s => s.preferred !== false);
  const cat = ctx.ui.skillCat || '', catN = Object.fromEntries([...SKILL_CATS.map(c => [c[0], 0]), ['outros', 0]]); all.forEach(s => catN[skillCategory(s)]++);
  const fav = new Set(ctx.skillPrefs?.fav || []), hide = new Set(ctx.skillPrefs?.hide || []), sview = ctx.ui.skillView || '', favN = all.filter(s => fav.has(s.name)).length, hideN = all.filter(s => hide.has(s.name)).length;
  const found = all.filter(s => (!cat || skillCategory(s) === cat) && (s.name + ' ' + s.description + ' ' + s.source).toLowerCase().includes(q) && (sview === 'fav' ? fav.has(s.name) : sview === 'hidden' ? hide.has(s.name) : !hide.has(s.name))).sort((a, b) => fav.has(b.name) - fav.has(a.name));
  const shown = found.slice(0, ctx.ui.skillMore ? 200 : 24), sel = ctx.skills.find(s => s.id === ctx.ui.skillSel) || shown[0];
  const okN = all.filter(s => skillState(s)[0] === 'ok').length, warnN = all.length - okN;
  const enabledBy = id => ctx.state.agents.filter(a => a.skillIds.includes(id));
  const origin = s => s.scope === 'project' ? 'Projeto' : s.scope === 'extra' ? 'Pasta extra' : 'Usuário';
  const rows = shown.map(s => { const [c, l] = skillState(s), n = enabledBy(s.id).length; return `<button class="srow ${sel?.id === s.id ? 'on' : ''}" data-act="skill-sel" data-id="${esc(s.id)}"><span class="nm"><span class="ico">${icon(skillIcon(s.name), 24)}</span><span><b>${fav.has(s.name) ? '<span class="star" aria-label="favorita">★</span> ' : ''}${esc(s.name)}</b><small>${esc(s.description.slice(0, 80))}</small></span></span><span><span class="chip">${origin(s)}</span></span><span><span class="dot d-${c === 'ok' ? 'ok' : c === 'bad' ? 'bad' : 'warn'}"></span> <span style="color:var(--${c === 'ok' ? 'ok' : c === 'bad' ? 'bad' : 'warn'})">${l}</span></span><span><span class="toggle" role="img" aria-label="${n ? `Habilitada em ${n} agente(s)` : 'Não habilitada'}" aria-checked="${n > 0}" style="display:inline-block"></span></span><span class="muted">${icon('dots', 18)}</span></button>`; }).join('');
  const deps = sel ? (sel.dependencies?.length ? sel.dependencies : sel.missingDependencies.map(m => ({ name: m.replace(/^[^:]+: /, ''), found: false }))) : [];
  return `<div class="page">${hero('Skills da equipe', 'Skills que os agentes podem usar para executar tarefas.', 'shelf')}
  <div class="filters"><div class="stat" style="min-width:250px;margin:0"><span><span class="dot d-ok"></span> <strong style="display:inline;font-size:1.8rem">${okN}</strong> reconhecidas<br><small>Compatíveis com o ambiente</small></span></div>
    <div class="stat" style="min-width:250px;margin:0"><span><span class="dot d-warn"></span> <strong style="display:inline;font-size:1.8rem">${warnN}</strong> precisam de atenção<br><small>Com pendências ou não validadas</small></span></div>
    <div class="cat-chips" role="group" aria-label="Categorias" style="flex-basis:100%"><button type="button" class="fchip ${cat ? '' : 'on'}" data-act="skill-cat" data-id="">Todas (${all.length - hideN})</button>${[...SKILL_CATS.map(c => [c[0], c[1]]), ['outros', 'Outras']].filter(([k]) => catN[k]).map(([k, l]) => `<button type="button" class="fchip ${cat === k ? 'on' : ''}" data-act="skill-cat" data-id="${k}">${l} (${catN[k]})</button>`).join('')}</div>
    <div class="cat-chips" role="group" aria-label="Favoritas e escondidas" style="flex-basis:100%"><button type="button" class="fchip ${sview === 'fav' ? 'on' : ''}" data-act="skill-view" data-id="${sview === 'fav' ? '' : 'fav'}">★ Favoritas (${favN})</button><button type="button" class="fchip ${sview === 'hidden' ? 'on' : ''}" data-act="skill-view" data-id="${sview === 'hidden' ? '' : 'hidden'}">Escondidas (${hideN})</button></div>
    <div class="input-icon">${icon('search', 18)}<input id="skill-q" placeholder="Buscar skills, descrições ou origens…" aria-label="Buscar skills" value="${esc(ctx.ui.skillQ || '')}"></div><button class="btn" data-act="add-skill-root">${icon('folder', 18)} Importar pasta de skills</button></div>
  <div class="cols" style="grid-template-columns:minmax(0,1fr) 400px"><section class="card" style="padding:0"><div class="srow" style="background:var(--panel2);color:var(--muted);font-size:.86rem;cursor:default"><span>Skill</span><span>Origem</span><span>Compatibilidade</span><span>Habilitada</span><span></span></div>${rows || `<div style="padding:16px">${empty('Nenhuma skill neste filtro.')}</div>`}${found.length > shown.length ? `<div style="padding:12px;text-align:center"><button class="btn ghost" data-act="skill-more">Mostrar mais (${found.length - shown.length})</button></div>` : ''}<p class="muted small" style="padding:10px 16px">${ctx.skills.length - all.length} cópia(s) duplicada(s) ocultas; a cópia preferida é a do projeto, depois .agents, .claude e .codex.</p></section>
  ${sel ? `<aside class="card"><div class="card-h" style="align-items:flex-start"><div style="display:flex;gap:14px"><span class="bigico">${icon(skillIcon(sel.name), 30)}</span><div><h2 style="font-size:1.3rem">${esc(sel.name)}</h2></div></div><span class="pill ${skillState(sel)[0]}">${skillState(sel)[1]}</span></div><div class="btn-row" style="margin-top:10px"><button type="button" class="btn outline sm" data-act="skill-fav" data-id="${esc(sel.name)}">${fav.has(sel.name) ? '★ Tirar das favoritas' : '☆ Favoritar'}</button><button type="button" class="btn ghost sm" data-act="skill-hide" data-id="${esc(sel.name)}">${hide.has(sel.name) ? 'Mostrar de novo' : 'Esconder da lista'}</button></div><p class="muted" style="margin-top:8px">${esc(sel.description.length > 260 ? sel.description.slice(0, 260) + '…' : sel.description)}</p>
    <h3 style="margin:16px 0 6px">Como funciona</h3><p class="muted small">Arquivo SKILL.md: <code>${esc(sel.path)}</code><br>Carrega nativamente em: ${esc(sel.providers.map(p => PROVIDER[p]).join(', '))}.</p>
    <h3 style="margin:16px 0 6px">Dependências</h3>${deps.length ? deps.map(d => `<div class="setting" style="padding:8px 0"><span class="grow">${esc(d.name)}</span><span class="small" style="color:var(--${d.found ? 'ok' : 'bad'})"><span class="dot d-${d.found ? 'ok' : 'bad'}"></span> ${d.found ? 'Encontrado' : 'Não encontrado'}</span></div>`).join('') : '<p class="muted small">Nenhuma dependência declarada.</p>'}
    <h3 style="margin:16px 0 6px">Acesso dos agentes</h3><p class="muted small">Defina quais agentes podem usar esta skill.</p><div class="tbl" style="margin-top:8px">${ctx.state.agents.map(a => `<label class="setting" style="padding:8px 12px"><span style="display:flex;gap:10px;align-items:center" class="grow">${avatar(idx(ctx, a), 32)}${esc(a.name)}</span><input type="checkbox" data-act="skill-agent" data-id="${esc(sel.id)}" data-agent="${esc(a.id)}" ${a.skillIds.includes(sel.id) ? 'checked' : ''} aria-label="${esc(a.name)} pode usar ${esc(sel.name)}"></label>`).join('') || '<p class="muted small" style="padding:10px">Crie um agente primeiro.</p>'}</div>
    ${sel.missingReferences?.length ? `<h3 style="margin:16px 0 6px">Documentos de apoio ausentes</h3><p class="muted small">Esta skill cita arquivos que não existem ao lado dela (em geral, outras skills do catálogo de onde ela veio). <b>Ela funciona sem eles</b>, mas o agente não consegue abri-los. Para ajustar: copie as pastas citadas para <code>${esc(sel.path.replace(/[\/][^\/]+$/, '').replace(/[\/][^\/]+$/, ''))}</code>, ou edite os links no <code>SKILL.md</code>, ou ignore o aviso.</p>${sel.missingReferences.map(r => `<div class="setting" style="padding:6px 0"><span class="grow"><code>${esc(r)}</code></span><span class="small" style="color:var(--bad)"><span class="dot d-bad"></span> Não encontrado</span></div>`).join('')}` : ''}
    ${note('Selecionar uma skill não instala suas dependências.', 'info', 'warn')}</aside>` : ''}</div></div>`;
}

// ---------- Entregas ----------
const ext = p => (p.split('.').pop() || '').toLowerCase();
const kind = p => ['html', 'htm'].includes(ext(p)) ? 'html' : ['md', 'txt', 'css', 'js', 'json', 'csv', 'mjs'].includes(ext(p)) ? 'text' : ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext(p)) ? 'image' : ['mp4', 'webm', 'mov'].includes(ext(p)) ? 'video' : 'other';
export function deliveryList(ctx) {
  return ctx.state.runs.filter(t => inProject(ctx, t) && t.deliverables?.length).flatMap(t => t.deliverables.map(f => ({ task: t, file: f, key: `${t.id}|${f.path}` }))).sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt));
}
// Entrega = uma tarefa com arquivos. Os arquivos "de trabalho" (logs, scripts, json) ficam recolhidos para o resultado de verdade aparecer primeiro.
const TECH = /\.(log|py|mjs|js|json|ps1|sh|cmd|lock)$/i, techFile = p => TECH.test(p) || /debug/i.test(p);
const RANK = { video: 0, image: 1, html: 2, text: 3, other: 4 };
export const deliveryTitle = t => titleOf(t);
const titleOf = t => { const ask = String(t.prompt || '').split('=== PERGUNTA DA PESSOA ===').pop(), m = /^Lote\s+"([^"]{1,80})"/.exec(ask), raw = m ? m[1] : ask.replace(/\s+/g, ' ').trim(); return raw.length > 72 ? raw.slice(0, 70) + '…' : raw || 'Entrega'; };
const reviewChip = t => t.review ? (t.review.status === 'approved' ? ['ok', 'Aprovada'] : ['warn', 'Ajustes pedidos']) : t.status === 'completed' ? ['info', 'Para revisar'] : ['off', STATUS[t.status] || t.status];
export function deliveryGroups(items) {
  const by = new Map();
  for (const i of items) { if (!by.has(i.task.id)) by.set(i.task.id, { task: i.task, main: [], tech: [] }); by.get(i.task.id)[techFile(i.file.path) ? 'tech' : 'main'].push(i); }
  return [...by.values()].map(g => { g.main.sort((x, y) => RANK[kind(x.file.path)] - RANK[kind(y.file.path)]); if (!g.main.length) { g.main = g.tech; g.tech = []; } return g; });
}
export function viewDeliveries(ctx) {
  const items = deliveryList(ctx), sel = items.find(i => i.key === ctx.ui.delSel) || items[0], groups = deliveryGroups(items);
  const toReview = groups.filter(g => g.task.status === 'completed' && !g.task.review).length, filter = ctx.ui.delFilter === 'review' && toReview ? 'review' : 'all';
  const shown = filter === 'review' ? groups.filter(g => g.task.status === 'completed' && !g.task.review) : groups;
  const live = ctx.state.runs.filter(t => inProject(ctx, t) && ['running', 'cancelling', 'queued'].includes(t.status));
  const fi = p => `<span class="fi ${kind(p) === 'text' ? 'md' : kind(p) === 'video' ? 'vid' : ''}">${icon(kind(p) === 'html' ? 'code' : kind(p) === 'video' ? 'film' : kind(p) === 'image' ? 'image' : 'file', 22)}</span>`;
  const fileBtn = i => `<button type="button" class="dl-file ${sel?.key === i.key ? 'on' : ''}" data-act="del-sel" data-id="${esc(i.key)}" ${sel?.key === i.key ? 'aria-current="true"' : ''}>${icon(kind(i.file.path) === 'video' ? 'film' : kind(i.file.path) === 'image' ? 'image' : 'file', 16)}<span>${esc(i.file.path.split('/').pop())}</span><small>${kb(i.file.bytes)}</small></button>`;
  const card = g => { const on = sel?.task.id === g.task.id, [c, l] = reviewChip(g.task), n = g.main.length + g.tech.length, lead = g.main[0];
    return `<article class="dl-card ${on ? 'on' : ''}"><button type="button" class="dl-head" data-act="del-sel" data-id="${esc(lead.key)}" ${on ? 'aria-current="true"' : ''}>${fi(lead.file.path)}<span class="dl-t"><b>${esc(titleOf(g.task))}</b><small>${esc(g.task.agent.name)} · ${hm(g.task.updatedAt)} · ${n} arquivo${n > 1 ? 's' : ''}</small></span><span class="pill ${c}">${l}</span></button>${on ? `<div class="dl-files">${g.main.map(fileBtn).join('')}${g.tech.length ? `<details class="dl-tech"><summary>Arquivos de trabalho (${g.tech.length})</summary>${g.tech.map(fileBtn).join('')}</details>` : ''}</div>` : ''}</article>`; };
  const list = shown.map(card).join('') + live.map(t => `<div class="dl-live">${icon('clock', 16)}<span><b>${esc(t.agent.name)}</b> <small class="muted">${esc(STATUS[t.status] || t.status)}</small></span></div>`).join('');
  const d = ctx.ui.delDetail, f = sel && d?.id === sel.task.id ? d.deliverables.files.find(x => x.path === sel.file.path) : null, k = sel ? kind(sel.file.path) : '';
  const prev = !sel ? empty('Selecione uma entrega na lista.') : !f?.url ? `<div class="empty">Carregando visualização…</div>` : k === 'html' ? `<iframe sandbox title="Pré-visualização de ${esc(sel.file.path)}" src="${esc(f.url)}"></iframe>` : k === 'image' ? `<img src="${esc(f.url)}" alt="${esc(sel.file.path)}" class="dl-img">` : k === 'video' ? `<video controls src="${esc(f.url)}" class="dl-vid"></video>` : k === 'text' ? `<pre class="pv-text">${esc(ctx.ui.delText ?? 'Carregando…')}</pre>` : `<div class="empty" style="background:var(--panel)">Pré-visualização indisponível para este tipo de arquivo. Use “Abrir pasta”.</div>`;
  const rv = sel?.task.review, can = sel && sel.task.status === 'completed', grp = sel ? groups.find(g => g.task.id === sel.task.id) : null;
  const chips = ['all', 'review'].filter(x => x === 'all' || toReview).map(x => `<button type="button" class="fchip ${filter === x ? 'on' : ''}" data-act="del-filter" data-id="${x}" aria-pressed="${filter === x}">${x === 'all' ? `Todas (${groups.length})` : `Para revisar (${toReview})`}</button>`).join('');
  return `<div class="page">${hero('Entregas', 'Veja o resultado, aprove ou peça ajustes.', 'entregas')}
  <div class="dl-wrap"><section class="card dl-side"><div class="card-h"><div class="cat-chips" role="group" aria-label="Filtro das entregas">${chips}</div><button class="link" data-act="focus-composer">${icon('plus', 16)} Nova</button></div>${list || empty('Nenhuma entrega neste projeto ainda.')}</section>
  <section class="card dl-main">${sel ? `<div class="dl-top"><div><h2>${esc(titleOf(sel.task))}</h2><p class="small muted">${esc(sel.task.agent.name)} · ${esc(new Date(sel.task.updatedAt).toLocaleString('pt-BR'))} · ${esc(sel.file.path.split('/').pop())} (${kb(sel.file.bytes)})</p></div>${f?.url ? `<a class="iconbtn" href="${esc(f.url)}" target="_blank" rel="noopener" aria-label="Abrir em nova aba" title="Abrir em nova aba">${icon('external', 18)}</a>` : ''}</div>
    ${grp && grp.main.length > 1 ? `<div class="tabs">${grp.main.slice(0, 6).map(i => `<button class="tab ${i.key === sel.key ? 'on' : ''}" data-act="del-sel" data-id="${esc(i.key)}">${esc(i.file.path.split('/').pop())}</button>`).join('')}</div>` : ''}
    <div class="dl-prev">${prev}</div>${k === 'html' ? '<p class="muted small">Pré-visualização isolada: scripts e recursos externos são bloqueados de propósito.</p>' : ''}
    <div class="dl-decide"><div class="dl-state">${rv ? (rv.status === 'approved' ? `<span class="pill ok">Aprovada</span>` : `<span class="pill warn">Ajustes pedidos</span>`) : can ? '<span class="pill info">Para revisar</span>' : `<span class="pill off">${esc(STATUS[sel.task.status] || sel.task.status)}</span>`}${rv?.note ? `<small class="muted">${esc(rv.note)}</small>` : ''}</div>
      <label class="sr-only" for="review-note">Descreva o ajuste</label><textarea id="review-note" rows="2" maxlength="500" placeholder="Precisa de ajuste? Descreva aqui (opcional para aprovar)…">${esc(ctx.ui.reviewNote || '')}</textarea><div class="muted small" style="text-align:right">${(ctx.ui.reviewNote || '').length}/500</div>
      <div class="btn-row"><button class="btn" data-act="approve" ${can ? '' : 'disabled'}>${icon('check', 16)} Aprovar</button><button class="btn ghost" data-act="request-changes" ${can ? '' : 'disabled'}>${icon('send', 16)} Pedir ajustes</button>${sel.task.flowId ? `<button class="btn ghost" data-act="review-pull" title="Preenche o campo com os problemas que o revisor listou. Você confere antes de enviar.">${icon('users', 16)} Pontos do revisor</button>` : ''}<span class="grow"></span>${can && ctx.gitInfo?.repo && ctx.gitInfo.projectId === sel.task.project.id ? `<button class="btn ghost sm" data-act="git-commit" data-id="${esc(sel.task.id)}" title="Commit local só dos arquivos desta entrega. Nada é enviado.">Commitar no Git</button>` : ''}${can && ctx.obsidian?.enabled && ctx.obsidian.allowWrite ? `<button class="btn ghost sm" data-act="obs-save" data-id="${esc(sel.task.id)}" title="Cria uma nota nova no seu Obsidian com o resumo desta entrega">Salvar no Obsidian</button>` : ''}<button class="btn ghost sm" data-act="open-folder" data-id="${esc(sel.task.project.id)}">${icon('folder', 16)} Abrir pasta</button><button class="btn ghost sm" data-act="changes" data-id="${esc(sel.task.id)}">${icon('branch', 16)} Alterações</button></div>
      <p class="muted small">Aprovar não publica nada. “Pedir ajustes” cria uma nova tarefa para o mesmo agente com o seu texto.</p></div>` : empty('Nenhuma entrega para mostrar.')}</section></div></div>`;
}
export function changesDialog(ctx, task) {
  const files = task?.deliverables?.files || [];
  return `<div class="card-h"><h2>Alterações da entrega</h2><button class="iconbtn" data-close="changes-dialog" aria-label="Fechar">${icon('x', 22)}</button></div><p class="muted small">Arquivos criados ou alterados por esta tarefa no projeto (sem diff linha a linha; o projeto não é um repositório Git).</p>${files.length ? `<div class="tbl"><table><thead><tr><th>Arquivo</th><th>Mudança</th><th>Tamanho</th><th>sha256</th></tr></thead><tbody>${files.map(f => `<tr><td>${esc(f.path)}</td><td>${esc({ created: 'criado', modified: 'alterado', deleted: 'removido' }[f.change] || f.change)}</td><td>${kb(f.bytes)}</td><td><code>${esc((f.sha256 || '—').slice(0, 12))}</code></td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum arquivo registrado.')}`;
}

// ---------- Consumo e limites ----------
// Estimativa SÓ para tarefas sem custo reportado, usando os preços que o usuário informou (US$ por 1 milhão de tokens). Cache não entra.
export function estimateOf(ctx, runs) {
  const prices = ctx.state.prices || {};
  let usd = 0, counted = 0;
  for (const r of runs) {
    const p = prices[r.agent.provider];
    if (r.usage?.cost != null || r.usage?.input == null || r.usage?.output == null || p?.in == null || p?.out == null) continue;
    usd += r.usage.input / 1e6 * p.in + r.usage.output / 1e6 * p.out; counted++;
  }
  return { usd, counted };
}
export function viewUsage(ctx) {
  const period = ctx.ui.usagePeriod || '30', proj = ctx.ui.usageProject ?? ctx.project, since = new Date();
  if (period === '1') since.setHours(0, 0, 0, 0); else if (period !== 'all') since.setDate(since.getDate() - Number(period));
  const runs = ctx.state.runs.filter(t => (!proj || t.project.id === proj) && (period === 'all' || new Date(t.createdAt) >= since));
  const t = ctx.usageTotals(runs), rt = ctx.state.runtime, c = rt.concurrency || { global: 1, provider: {}, video: 1 }, lim = ctx.state.limits || {}, bud = rt.budget || {};
  const byProj = ctx.state.projects.map(p => ({ p, u: ctx.usageTotals(ctx.state.runs.filter(r => r.project.id === p.id && (period === 'all' || new Date(r.createdAt) >= since))) })).filter(x => x.u.costCount);
  const max = Math.max(0.0001, ...byProj.map(x => x.u.cost));
  const prov = ['codex', 'claude', 'agy', 'hermes'].map(id => ({ id, u: ctx.usageTotals(runs.filter(r => r.agent.provider === id)) }));
  const timeoutMin = Math.round((lim.timeoutMs || 1200000) / 60000), est = estimateOf(ctx, runs), pr = ctx.state.prices || {};
  return `<div class="page">${hero('Consumo e limites', 'Acompanhe o uso de tokens, custos e limites de execução por projeto.', 'consumo')}
  <div class="cols c-2-1" style="grid-template-columns:minmax(0,1fr) 380px"><div>
    ${economyCardHtml(ctx)}
    ${limitsCard(ctx, runs)}
    <div class="filters card" style="margin:0 0 14px;padding:12px"><label style="display:flex;gap:10px;align-items:center">Projeto <select id="usage-project" style="width:220px"><option value="">Todos os projetos</option>${ctx.state.projects.map(p => `<option value="${esc(p.id)}" ${p.id === proj ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label style="display:flex;gap:10px;align-items:center">Período <select id="usage-period" style="width:200px">${[['1', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['all', 'Todo o histórico']].map(([v, l]) => `<option value="${v}" ${period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="stats"><div class="stat"><div><span class="lbl"><span class="dot d-ok"></span>Custo reportado</span><strong>${t.costCount ? 'US$ ' + t.cost.toFixed(2).replace('.', ',') : 'indisponível'}</strong><small>Custos informados pelos provedores (${t.costCount} de ${runs.length} tarefas)</small></div>${icon('coins', 34)}</div>
      <div class="stat"><div><span class="lbl"><span class="dot d-live"></span>Estimativa adicional</span><strong>${est.counted ? 'US$ ' + est.usd.toFixed(2).replace('.', ',') : 'indisponível'}</strong><small>${est.counted ? `Pela sua tabela de preços, em ${est.counted} tarefa(s) sem custo reportado. Não é cobrança.` : 'Informe seus preços abaixo para estimar tarefas sem custo reportado.'}</small></div></div>
      <div class="stat"><div><span class="lbl"><span class="dot" style="background:var(--viol)"></span>Execuções</span><strong>${runs.length}</strong><small>Execuções no período</small></div>${icon('terminal', 34)}</div></div>
    <section class="card"><div class="card-h"><h2>Custo reportado por projeto</h2><span class="muted small"><span class="dot d-ok"></span> Custo reportado (US$)</span></div>${byProj.length ? `<div class="barchart" role="img" aria-label="Custo reportado por projeto">${byProj.map(x => `<div class="b" title="US$ ${x.u.cost.toFixed(4)}"><i data-h="${Math.max(2, Math.round(x.u.cost / max * 100))}"></i></div>`).join('')}</div><div class="barlbl">${byProj.map(x => `<span>${esc(x.p.name)}<br>US$ ${x.u.cost.toFixed(2).replace('.', ',')}</span>`).join('')}</div>` : empty('Nenhum custo reportado no período. O Codex não informa custo.')}</section>
    <section class="card"><h2>Consumo por provedor</h2><div class="tbl"><table><thead><tr><th>Provedor</th><th>Tokens (reportados)</th><th>Custo reportado</th><th>Estimativa adicional</th></tr></thead><tbody>${prov.map(r => `<tr><td><span style="display:inline-flex;gap:10px;align-items:center">${icon(r.id === 'claude' ? 'asterisk' : 'terminal', 20)} ${esc(PROVIDER[r.id])}</span></td><td>${r.u.inCount || r.u.outCount ? num((r.u.input || 0) + (r.u.output || 0)) : 'indisponível'}</td><td>${r.u.costCount ? `<span class="dot d-ok"></span> US$ ${r.u.cost.toFixed(2).replace('.', ',')}` : 'Indisponível'}</td><td>${(() => { const e = estimateOf(ctx, runs.filter(x => x.agent.provider === r.id)); return e.counted ? 'US$ ' + e.usd.toFixed(2).replace('.', ',') : '—'; })()}</td></tr>`).join('')}</tbody></table></div><p class="muted small" style="margin-top:8px">Cache lido não entra nos totais. Ausência de informação nunca é tratada como zero.</p></section></div>
  <aside><section class="card"><h2>Limites da execução</h2>
    <div class="limit">${icon('layers', 30)}<span>Máximo de execuções simultâneas<big>${c.global}</big><small class="muted">Número máximo de tarefas em paralelo.</small></span><span class="stepper-n"><button data-act="step" data-id="global:-1" aria-label="Diminuir">${icon('minus', 16)}</button><button data-act="step" data-id="global:1" aria-label="Aumentar">${icon('plus', 16)}</button></span></div>
    <div class="limit">${icon('clock', 30)}<span>Duração máxima por execução<big>${timeoutMin} min</big><small class="muted">Execuções que excederem esse tempo serão encerradas.</small></span><span class="stepper-n"><button data-act="step" data-id="timeout:-5" aria-label="Diminuir">${icon('minus', 16)}</button><button data-act="step" data-id="timeout:5" aria-label="Aumentar">${icon('plus', 16)}</button></span></div>
    <div class="limit">${icon('wallet', 30)}<span>Orçamento (custo reportado)<big>${lim.budgetUsd != null ? 'US$ ' + Number(lim.budgetUsd).toFixed(2).replace('.', ',') : 'sem limite'}</big><small class="muted">30 dias · gasto: US$ ${(bud.spentUsd ?? 0).toFixed(2).replace('.', ',')}</small></span><span class="stepper-n"><button data-act="step" data-id="budget:-1" aria-label="Diminuir">${icon('minus', 16)}</button><button data-act="step" data-id="budget:1" aria-label="Aumentar">${icon('plus', 16)}</button></span></div>
    <div class="limit">${icon('pause', 30)}<span>Pausar novas tarefas ao atingir o limite<small class="muted" style="display:block">Evita novas execuções quando o custo reportado atingir o orçamento.</small></span>${toggle('pref-budget', !!lim.budgetEnabled, 'Pausar novas tarefas ao atingir o orçamento')}</div>
    ${bud.reached ? note('Orçamento atingido: novas tarefas estão pausadas.', 'info', 'warn') : ''}</section>
  <section class="card"><h2>Tabela de preços (você informa)</h2><p class="muted small" style="margin-bottom:8px">US$ por 1 milhão de tokens. Serve só para estimar tarefas que o provedor não informa custo (como o Codex). Confira os preços no site oficial; o Code Room não busca preços sozinho.</p>
    <form id="prices-form"><div class="form-grid"><label class="f">Codex · entrada<input name="cin" type="number" step="0.01" min="0" value="${pr.codex?.in ?? ''}"></label><label class="f">Codex · saída<input name="cout" type="number" step="0.01" min="0" value="${pr.codex?.out ?? ''}"></label><label class="f">Claude · entrada<input name="lin" type="number" step="0.01" min="0" value="${pr.claude?.in ?? ''}"></label><label class="f">Claude · saída<input name="lout" type="number" step="0.01" min="0" value="${pr.claude?.out ?? ''}"></label></div><button class="btn block" style="margin-top:12px">Salvar preços</button></form></section>
  <section class="card"><h2>${icon('info', 18)} Observação</h2><p class="muted small">Valores informados pelo provedor; custo de CLI de assinatura é uma referência de API e não representa o saldo da assinatura. O orçamento local não garante teto exato de cobrança externa.</p></section></aside></div></div>`;
}

// ---------- Rotinas ----------
const WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const trigText = r => r.trigger.type === 'file' ? ['Ao adicionar arquivo', r.trigger.ext ? '.' + r.trigger.ext : 'qualquer arquivo novo'] : r.trigger.type === 'manual' ? ['Manual', 'Por comando'] : r.trigger.freq === 'daily' ? [`Todos os dias · ${r.trigger.time}`, 'Diária'] : [`${WEEK[r.trigger.day]} · ${r.trigger.time}`, 'Semanal'];
const rstatus = r => r.status === 'active' ? ['ok', 'Ativa', 'play'] : r.status === 'paused' ? ['warn', 'Pausada', 'pause'] : ['info', 'Pronta', 'check'];
function lastRun(ctx, r) {
  const h = r.history?.find(x => x.status === 'started'); if (!h) return null;
  const t = h.taskId ? ctx.state.runs.find(x => x.id === h.taskId) : null;
  return { at: h.at, task: t, text: h.taskId ? t : null };
}
export function routineReportRows(ctx, routines, limit = 30) {
  const history = routines.flatMap(r => (r.history || []).map(h => ({ r, h }))).sort((a, b) => b.h.at.localeCompare(a.h.at)).slice(0, limit);
  return history.map(({ r, h }) => {
    let status, detail, taskId = null;
    if (h.status === 'skipped') { status = '<span class="pill warn">Ignorada</span>'; detail = h.reason; }
    else if (h.status === 'failed_to_start') { status = '<span class="pill bad">Falhou ao iniciar</span>'; detail = h.reason; }
    else {
      const task = h.taskId ? ctx.state.runs.find(x => x.id === h.taskId) : null;
      if (task) { status = pill(task.status); detail = task.reason || (task.status === 'completed' ? `${(task.deliverables || []).length} arquivo(s)` : ''); taskId = task.id; }
      else { status = '<span class="pill info">Iniciada</span>'; detail = h.flowId ? 'Fluxo dev → revisor' : ''; }
    }
    return `<tr><td>${new Date(h.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${esc(r.name)}</td><td>${esc(ctx.projectNameOf(r.projectId))}</td><td>${status}</td><td class="muted small">${esc(String(detail || '').slice(0, 80))}${taskId ? ` <button type="button" class="linkbtn" data-act="task" data-id="${esc(taskId)}">Abrir tarefa</button>` : ''}</td></tr>`;
  }).join('');
}
// Player do episódio dentro do Code Room: prévia (ou final), capa e POST, servidos por link curto só deste episódio.
// Publicar um episódio pronto: rascunho (título, legenda, tags) → confirmação explícita com visibilidade → envio.
function postBlock(ctx, b, ep) {
  const NET = { youtube: 'YouTube Shorts', instagram: 'Instagram Reels', tiktok: 'TikTok' };
  const manual = p => `<div class="post-confirm"><p class="small">Pacote pronto. Pare nesta ordem: <b>1)</b> copie a legenda, <b>2)</b> poste o arquivo da pasta <code>${esc(ep.postar ? ep.postar.replace(/\//g, '\\') : 'POSTAR\\' + (ep.folder || '').split(/[\\/]/).pop())}</code> no app ${NET[p.network]}, <b>3)</b> marque como postado.</p>
      <label class="f">Legenda para copiar<textarea id="cap-${esc(p.id)}" rows="5" readonly>${esc(p.caption || p.description || '')}</textarea></label>
      <div class="btn-row"><button class="btn outline sm" data-act="post-copy" data-id="${esc(p.id)}">Copiar legenda</button></div>
      <label class="f">Link da postagem (opcional)<input id="url-${esc(p.id)}" maxlength="300" placeholder="https://…"></label>
      <div class="btn-row"><button class="btn sm" data-act="post-mark" data-id="${esc(p.id)}">${icon('check', 16)} Marcar como postado</button><button class="btn outline sm" data-act="post-cancel" data-id="${esc(p.id)}">Cancelar rascunho</button></div></div>`;
  const PRIV = { private: 'Privado', unlisted: 'Não listado', public: 'Público' }, mine = (ctx.state.posts || []).filter(p => p.epId === ep.id);
  const list = mine.map(p => `<div class="post-row"><span class="pill ${p.status === 'publicado' ? 'ok' : p.status === 'falhou' ? 'bad' : p.status === 'enviando' ? 'info' : 'warn'}">${{ rascunho: 'Rascunho', enviando: 'Enviando…', publicado: 'Publicado', falhou: 'Falhou', cancelado: 'Cancelado' }[p.status]}</span> <b>${esc(p.title)}</b> <small class="muted">${NET[p.network] || 'YouTube'}${p.mode === 'manual' ? ' · manual' : ' · ' + (PRIV[p.privacy] || '')}</small>
    ${p.url ? ` <a href="${esc(p.url)}" target="_blank" rel="noopener">abrir</a>` : ''}${p.status === 'publicado' ? ` <button class="btn outline sm" data-act="post-metrics" data-id="${esc(p.id)}">Atualizar números</button>${(() => { const m = p.metrics?.at(-1); return m ? `<div class="small muted">Views ${m.views ?? 'indisponível'} · curtidas ${m.likes ?? 'indisponível'} · retenção ${m.avgViewPercentage == null ? 'indisponível' : m.avgViewPercentage.toFixed(1) + '%'}${m.note ? ' (' + esc(m.note) + ')' : ''}</div>` : ''; })()}` : ''}${p.error ? ` <small class="muted">${esc(p.error)}</small>` : ''}
    ${p.status === 'rascunho' && p.mode === 'manual' ? manual(p) : ''}${p.status === 'rascunho' && p.mode !== 'manual' ? `<div class="post-confirm"><label class="f">Visibilidade ao publicar<select id="priv-${esc(p.id)}"><option value="private">Privado (recomendado para conferir)</option><option value="unlisted">Não listado</option><option value="public">Público</option></select></label>
      <div class="btn-row"><button class="btn sm" data-act="post-confirm" data-id="${esc(p.id)}">${icon('check', 16)} Confirmar e publicar agora</button><button class="btn outline sm" data-act="post-cancel" data-id="${esc(p.id)}">Cancelar rascunho</button></div></div>` : ''}</div>`).join('');
  const open = ctx.ui.postFor === ep.id, d = ctx.ui.postDraft || {};
  const form = open ? `<form class="post-form rt-form" data-batch="${esc(b.id)}" data-ep="${esc(ep.id)}" data-net="${esc(ctx.ui.postNet || 'youtube')}" id="post-form"><p class="small"><b>${NET[ctx.ui.postNet || 'youtube']}</b></p><label class="f">Título (máx. 100)<input name="title" required maxlength="100" value="${esc(d.title || ep.title)}"></label>
    <label class="f">Descrição / legenda<textarea name="description" rows="5" maxlength="4900">${esc(d.description || '')}</textarea></label><label class="f">Tags (separadas por vírgula)<input name="tags" maxlength="400" value="${esc(d.tags || '')}"></label>
    <p class="small muted">Vai criar um <b>rascunho</b>. Nada é publicado até você confirmar no passo seguinte.</p><div class="btn-row"><button class="btn sm">Criar rascunho</button><button type="button" class="btn outline sm" data-act="post-close">Fechar</button></div></form>` : '';
  const btn = ep.status === 'pronto' && !open ? ['youtube', 'instagram', 'tiktok'].map(n => `<button class="btn ${n === 'youtube' ? 'sm' : 'outline sm'}" data-act="post-new" data-id="${esc(b.id)}" data-ep="${esc(ep.id)}" data-net="${n}">${icon('cloud', 16)} ${NET[n]}${n === 'youtube' && ctx.publish?.google?.connected ? '' : ' (manual)'}</button>`).join(' ') : '';
  return `${btn}${form}${list ? `<div class="posts">${list}</div>` : ''}`;
}
// Resultado da checagem técnica automática (o que é mensurável): ✔ ok, ⚠ aviso, ✖ falha. Estilo, pronúncia e emoção continuam sendo seus.
function qaBlock(ctx, ep) {
  const q = ctx.ui.qa?.[ep.id]; if (!q) return '';
  if (q.checked === false) return `<p class="small" style="color:var(--bad)">Não foi possível checar: ${esc(q.reason || '')}</p>`;
  const mark = { ok: ['✔', 'ok'], aviso: ['⚠', 'warn'], falha: ['✖', 'bad'] };
  return `<ul class="qa">${q.items.map(i => `<li class="qa-${mark[i.status][1]}"><b>${mark[i.status][0]}</b> ${esc(i.label)}: <span>${esc(i.detail)}</span></li>`).join('')}</ul><p class="small muted">Checagem de ${esc(q.kind === 'final' ? 'versão final' : 'prévia')} (${esc(q.file || '')}). Só mede o que dá para medir; a pronúncia e o clima são com você.</p>`;
}
function mediaBlock(ctx, b, ep) {
  const m = ctx.ui.media?.[ep.id]; if (!m) return '';
  const by = Object.fromEntries(m.files.map(f => [f.kind, f])), v = by.final || by.previa;
  if (!v) return `<div class="ep-media"><p class="small muted">Ainda não há vídeo salvo para este episódio.</p></div>`;
  return `<div class="ep-media"><video controls playsinline preload="metadata" ${by.capa ? `poster="${esc(by.capa.url)}"` : ''} src="${esc(v.url)}" aria-label="Vídeo do episódio"></video>
    ${qaBlock(ctx, ep)}<div class="btn-row"><button class="btn outline sm" data-act="batch-qa" data-id="${esc(b.id)}" data-ep="${esc(ep.id)}" data-kind="${by.final ? 'final' : 'previa'}">${ctx.ui.qa?.[ep.id] ? 'Refazer checagem técnica' : 'Checagem técnica (imagem e áudio)'}</button></div>
    <p class="small muted">${by.final ? 'Versão final' : 'Prévia'}: ${esc(v.name)} (${(v.bytes / 1048576).toFixed(1)} MB)${by.post ? ` · <a href="${esc(by.post.url)}" target="_blank" rel="noopener">ver POST.md</a>` : ''}${by.capa ? ` · <a href="${esc(by.capa.url)}" target="_blank" rel="noopener">ver capa</a>` : ''}</p></div>`;
}
export function batchesCard(ctx) {
  const bs = ctx.state.batches || [], c = ctx.state.batchCosts || {}, ST = { aguardando_creditos: ['warn', 'Aguardando aprovação dos créditos'], em_producao: ['info', 'Em produção'], aguardando_previa: ['warn', 'Aguardando você aprovar a prévia'], concluido: ['ok', 'Concluído'], com_falha: ['bad', 'Com falha'], cancelado: ['off', 'Cancelado'] };
  const EP = { planejado: 'Na fila', em_andamento: 'Produzindo', concluida_etapa: 'Produzindo', aguardando_previa: 'Prévia pronta: aguarda você', previa_aprovada: 'Prévia aprovada', pronto: 'Aprovado: entregue em POSTAR', reprovado: 'Reprovado: foi para a LIXEIRA', falhou: 'Falhou', cancelado: 'Cancelado' };
  const n = v => v == null ? '<b title="Informe os preços em “Preços”">indisponível</b>' : '<b>' + num(v) + '</b>';
  const one = b => {
    const e = b.estimate || {}, waiting = b.status === 'aguardando_creditos', ag = ctx.state.agents.find(a => a.id === b.agentId);
    return `<article class="batch"><div class="card-h"><h3>${esc(b.name)}</h3><span class="pill ${ST[b.status]?.[0] || 'off'}">${ST[b.status]?.[1] || esc(b.status)}</span></div>
    <p class="small muted">Produtor: ${esc(ag?.name || '—')} · ${b.episodes.length} episódio(s) · voz ${n(e.voiceCredits)} créditos · imagens ${n(e.images)} · clipes ${n(e.clips)} · Flow ${n(e.flowCredits)} créditos${b.approval ? ` · aprovado (teto do Flow: ${num(b.approval.flowCap)})` : ''}</p>
    <ul class="batch-eps">${b.episodes.map(ep => `<li><span><b>${esc(ep.title)}</b> <small class="muted">${esc(ep.folder)}</small></span><span class="pill ${ep.status === 'pronto' ? 'ok' : ep.status === 'falhou' ? 'bad' : ep.status === 'reprovado' ? 'off' : ep.status === 'aguardando_previa' ? 'warn' : 'info'}">${EP[ep.status] || esc(ep.status)}</span>${ep.status === 'em_andamento' && ep.render?.last ? ` <small class="muted">${esc(ep.render.last)}</small>` : ''}
      ${['aguardando_previa', 'previa_aprovada', 'pronto'].includes(ep.status) ? `<button class="btn outline sm" data-act="${ctx.ui.media?.[ep.id] ? 'batch-media-close' : 'batch-media'}" data-id="${esc(b.id)}" data-ep="${esc(ep.id)}">${icon('play', 16)} ${ctx.ui.media?.[ep.id] ? 'Fechar vídeo' : 'Ver vídeo'}</button>` : ''}
      ${ep.status === 'aguardando_previa' ? `<button class="btn sm" data-act="batch-preview-ok" data-id="${esc(b.id)}" data-ep="${esc(ep.id)}">${icon('check', 16)} Aprovar prévia</button><button class="btn outline sm" data-act="batch-changes" data-id="${esc(b.id)}" data-ep="${esc(ep.id)}">Pedir ajuste</button>` : ''}
      ${ep.waiting || ep.postar || ep.trash ? `<small class="muted">Pasta: <code>${esc(ep.postar || ep.waiting || ep.trash)}</code></small>` : ''}
      ${['aguardando_previa', 'pronto'].includes(ep.status) ? `<button class="btn outline sm danger" data-act="batch-reject" data-id="${esc(b.id)}" data-ep="${esc(ep.id)}">Reprovar</button>` : ''}
      ${ep.status === 'falhou' ? `<button class="btn outline sm" data-act="batch-retry" data-id="${esc(b.id)}" data-ep="${esc(ep.id)}">Tentar de novo</button><small class="muted">${esc(ep.note || '')}</small>` : ''}${mediaBlock(ctx, b, ep)}${postBlock(ctx, b, ep)}</li>`).join('')}</ul>
    ${waiting ? `<form class="batch-approve" data-batch="${esc(b.id)}" id="batch-approve-${esc(b.id)}"><p class="small">Nada foi gasto ainda. Para liberar, confirme os créditos de <b>voz</b> (calculados dos arquivos) e defina o <b>teto de créditos do Flow</b> que você aceita gastar neste lote.</p>
      <div class="form-grid"><label class="f">Créditos de voz (digite para confirmar)<input name="voiceCredits" type="number" min="0" required placeholder="${e.voiceCredits ?? ''}"></label><label class="f">Teto de créditos do Flow<input name="flowCap" type="number" min="0" required placeholder="${e.flowCredits ?? 'seu limite'}"></label></div>
      <div class="btn-row"><button class="btn">${icon('check', 16)} Aprovar créditos e começar</button><button type="button" class="btn outline" data-act="batch-cancel" data-id="${esc(b.id)}">Cancelar lote</button></div></form>` : (['em_producao', 'aguardando_previa', 'com_falha'].includes(b.status) ? `<div class="btn-row"><button type="button" class="btn outline sm" data-act="batch-cancel" data-id="${esc(b.id)}">Cancelar lote</button></div>` : '')}</article>`;
  };
  const prod = ctx.state.agents.filter(a => a.mode === 'write'), pf = ctx.ui.preflight;
  const pfHtml = pf ? `<ul class="qa">${pf.items.map(i => { const m = { ok: ['✔', 'ok'], aviso: ['⚠', 'warn'], falha: ['✖', 'bad'] }[i.status]; return `<li class="qa-${m[1]}"><b>${m[0]}</b> ${esc(i.label)}: <span>${esc(i.detail)}${i.status !== 'ok' && i.fix ? ' — ' + esc(i.fix) : ''}</span></li>`; }).join('')}</ul>` : '';
  return `<section class="card" style="margin-top:16px"><div class="card-h"><h2>Lotes de produção</h2><button class="btn outline sm" data-act="preflight">Verificar o ambiente</button></div>${pfHtml}
  <p class="small muted">Vários episódios na esteira, com duas decisões suas: aprovar os créditos do lote uma vez e aprovar a prévia de cada vídeo. A prévia fica em AGUARDANDO_APROVACAO/&lt;canal&gt;; ao aprovar, o pacote vai para POSTAR_&lt;CANAL&gt;; ao reprovar, vai para LIXEIRA (nada é apagado de vez).. Nada é publicado.</p>
  ${bs.length ? bs.map(one).join('') : '<p class="muted">Nenhum lote ainda.</p>'}
  <details class="batch-new"><summary>Novo lote</summary><form id="batch-form" class="rt-form"><label class="f">Nome<input name="name" required maxlength="100" placeholder="Ex.: Meu Canal, 2 de hoje"></label>
    <label class="f">Projeto (onde estão as pastas dos episódios)<select name="projectId" required>${ctx.state.projects.map(p => `<option value="${esc(p.id)}" ${ctx.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="f">Agente produtor (precisa poder escrever)<select name="agentId" required>${prod.map(a => `<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.role)}</option>`).join('')}</select></label>
    <label class="f">Pastas dos episódios (uma por linha, relativas ao projeto)<textarea name="folders" rows="3" required placeholder="episodios/EP04-curupira&#10;episodios/EP05-boitata"></textarea></label>
    <label class="f">Começar da etapa (use para não repetir o que já foi feito e pago)<select name="fromStage"><option value="">Do início (preparar)</option><option value="voz">Voz</option><option value="imagens">Imagens</option><option value="clipes">Clipes</option><option value="previa">Prévia</option></select></label>
    <label class="f">Pasta da esteira de produção (opcional)<input name="workDir" maxlength="300" placeholder="C:\Projetos\MeuCanal"></label>
    <button class="btn">${icon('plus', 16)} Calcular custos e criar lote</button></form></details>
  <details class="batch-new"><summary>Preços (para estimar o Flow)</summary><form id="batch-costs-form" class="rt-form"><p class="small muted">O Code Room não inventa preço: informe quanto o Flow cobra por imagem e por clipe. Sem isso, o custo do Flow fica indisponível.</p>
    <div class="form-grid"><label class="f">Créditos por imagem<input name="flowPerImage" type="number" min="0" step="any" value="${c.flowPerImage ?? ''}"></label><label class="f">Créditos por clipe<input name="flowPerClip" type="number" min="0" step="any" value="${c.flowPerClip ?? ''}"></label></div><button class="btn outline">Salvar preços</button></form></details></section>`;
}
export function viewRoutines(ctx) {
  const rs = ctx.state.routines || [], tab = ctx.ui.routineTab || 'all', q = (ctx.ui.routineQ || '').toLowerCase();
  const count = s => rs.filter(r => r.status === s).length;
  const list = rs.filter(r => (tab === 'all' || (tab === 'active' && r.status === 'active') || (tab === 'paused' && r.status === 'paused') || (tab === 'ready' && r.status === 'ready')) && (!ctx.ui.routineProj || r.projectId === ctx.ui.routineProj) && (r.name + ' ' + r.description).toLowerCase().includes(q));
  const pname = id => ctx.projectNameOf(id);
  const rows = list.map(r => { const [c, l, ic] = rstatus(r), [t1, t2] = trigText(r), lr = lastRun(ctx, r); return `<tr><td><div class="nm"><span class="ico">${icon(r.trigger.type === 'manual' ? 'check-square' : 'calendar', 24)}</span><span><b>${esc(r.name)}</b><small>${esc(r.description || r.objective.slice(0, 60))}</small></span></div></td><td><span class="dot" style="background:var(--accent-h)"></span> ${esc(pname(r.projectId))}</td><td>${esc(t1)}<small>${esc(t2)}</small></td><td>${lr ? `${new Date(lr.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}<small>${lr.task ? (lr.task.status === 'completed' ? 'concluída' : (STATUS[lr.task.status] || '').toLowerCase()) : 'iniciada'}</small>` : '<span class="muted">Nunca executou</span>'}</td><td><span class="pill ${c}">${icon(ic, 14)} ${l}</span>${r.running ? ' <span class="pill info">em execução</span>' : ''}</td><td style="position:relative"><button class="iconbtn" data-act="routine-menu" data-id="${esc(r.id)}" aria-label="Ações da rotina ${esc(r.name)}">${icon('dots', 20)}</button>${ctx.ui.routineMenu === r.id ? `<div class="menu" role="menu"><button role="menuitem" data-act="routine-run" data-id="${esc(r.id)}">${icon('play', 16)} Executar agora</button>${r.trigger.type !== 'manual' ? `<button role="menuitem" data-act="routine-toggle" data-id="${esc(r.id)}">${icon(r.status === 'active' ? 'pause' : 'play', 16)} ${r.status === 'active' ? 'Pausar' : 'Retomar'}</button>` : ''}<button role="menuitem" data-act="routine-edit" data-id="${esc(r.id)}">${icon('edit', 16)} Editar</button><button role="menuitem" data-act="routine-del" data-id="${esc(r.id)}">${icon('trash', 16)} Excluir</button></div>` : ''}</td></tr>`; }).join('');
  const reports = routineReportRows(ctx, rs);
  return `<div class="page">${hero('Rotinas', 'Automatize tarefas dos seus projetos e ganhe tempo.', 'clock', `<span class="chip" style="padding:.5em 1em">${icon('globe', 18)} São Paulo (GMT-3)</span>`)}
  ${tabs([['all', 'Todas'], ['active', 'Ativas', null, count('active')], ['paused', 'Pausadas', null, count('paused')], ['ready', 'Prontas', null, count('ready')]], tab, 'routine-tab')}
  <div class="filters"><div class="input-icon">${icon('search', 18)}<input id="routine-q" placeholder="Buscar rotinas por nome ou projeto…" aria-label="Buscar rotinas" value="${esc(ctx.ui.routineQ || '')}"></div><select id="routine-proj" style="width:200px" aria-label="Filtrar por projeto"><option value="">Todos os projetos</option>${ctx.state.projects.map(p => `<option value="${esc(p.id)}" ${ctx.ui.routineProj === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="btn" data-act="new-routine">${icon('plus', 18)} Nova rotina</button></div>
  ${rs.length ? `<div class="tbl rtable"><table><thead><tr><th>Nome da rotina</th><th>Projeto</th><th>Disparo</th><th>Última execução</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">Nenhuma rotina neste filtro.</td></tr>'}</tbody></table></div>` : empty('Nenhuma rotina ainda. Crie uma para executar um agente ou uma equipe em horário fixo.')}
  ${batchesCard(ctx)}
  <div style="margin-top:16px">${folderJobsCardHtml(ctx)}</div>
  <section class="card" style="margin-top:16px"><div class="card-h"><h2>Últimas execuções</h2></div>${reports ? `<div class="tbl"><table><thead><tr><th>Data e hora</th><th>Rotina</th><th>Projeto</th><th>Resultado</th><th>Detalhes</th></tr></thead><tbody>${reports}</tbody></table></div>` : '<p class="muted">Nenhuma execução registrada.</p>'}
  ${note('Rotinas só rodam com o Code Room aberto e o computador ligado. Se a hora marcada passar com o serviço desligado, a execução é registrada como ignorada e não roda com atraso.', 'info')}</section></div>`;
}
// Modelos de rotina: só preenchem o formulário. Nada roda até a pessoa salvar.
export const ROUTINE_TEMPLATES = [
  { id: 'news', label: 'Notícias do dia', name: 'Notícias do dia', objective: 'Pesquise na internet as notícias mais importantes de hoje sobre [TEMA]. Entregue um resumo com no máximo 8 itens: título, 2 linhas do que aconteceu, fonte e link. Não invente nada; se não achar, diga.' },
  { id: 'courses', label: 'Cursos gratuitos', name: 'Cursos gratuitos da semana', objective: 'Pesquise cursos gratuitos novos ou em destaque sobre [ÁREA]. Liste até 10: nome, plataforma, carga horária, se tem certificado, link. Ignore cursos pagos ou vencidos e marque a data da pesquisa.' },
  { id: 'jobs', label: 'Vagas de emprego', name: 'Vagas de emprego', objective: 'Pesquise vagas recentes de [CARGO] em [LOCAL/REMOTO]. Liste até 10 das melhores: empresa, cargo, faixa salarial se houver, requisitos principais e link. Ordene da mais aderente à menos.' },
  { id: 'post', label: 'Post do dia', name: 'Post do dia', objective: 'Escreva o post de hoje sobre [TEMA], com tom [TOM], pronto para publicar, e poste em +[apelido-da-conta]. Varie o ângulo em relação aos posts anteriores.' },
  { id: 'free', label: 'Em branco', name: '', objective: '' },
];
export function panelRoutine(ctx) {
  const r = ctx.state.routines.find(x => x.id === ctx.ui.panelId), dr = r ? null : ctx.ui.routineDraft, t = r?.trigger || { type: 'time', freq: 'daily', time: dr?.time || '08:00' };
  const dt = dr?.target ? { type: { a: 'agent', t: 'team', r: 'recipe' }[dr.target[0]] || 'agent', id: dr.target.slice(2) } : null;
  const tg = r?.target || dt || { type: 'agent', id: ctx.state.agents[0]?.id };
  const tpl = r ? '' : `<div class="rt-tpl"><p class="small muted">Comece por um modelo (você ajusta tudo depois):</p><div class="btn-row">${ROUTINE_TEMPLATES.map(x => `<button type="button" class="btn ghost sm" data-act="routine-tpl" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</div></div>`;
  return `<div class="card-h"><h2>${r ? 'Editar rotina' : dr?.fromTask ? 'Repetir todo dia' : 'Nova rotina'}</h2><button class="iconbtn" data-act="close-panel" aria-label="Fechar">${icon('x', 22)}</button></div>
  ${dr?.fromTask ? '<p class="muted small">Esta rotina repete o pedido abaixo no horário escolhido. Os resultados chegam em Entregas e em “Precisa de você agora”.</p>' : ''}${tpl}
  <form id="routine-form" class="rt-form"><input type="hidden" name="id" value="${esc(r?.id || '')}"><label class="f">Nome da rotina<input name="name" required maxlength="120" value="${esc(r?.name || dr?.name || '')}" placeholder="Ex.: Gerar resumo semanal"></label>
  <label class="f">Disparo (gatilho)<select name="ttype" id="r-ttype"><option value="time" ${t.type === 'time' ? 'selected' : ''}>Horário</option><option value="manual" ${t.type === 'manual' ? 'selected' : ''}>Manual (por comando)</option><option value="file" ${t.type === 'file' ? 'selected' : ''}>Ao adicionar arquivo na pasta do projeto</option></select></label>
  <label class="f g-file">Extensão do arquivo novo (vazio = qualquer arquivo)<input name="ext" value="${esc(t.ext || '')}" maxlength="8" placeholder="mp4 (vazio = qualquer arquivo)"></label>
  <div class="form-grid g-time"><label class="f">Frequência<select name="freq"><option value="daily" ${t.freq === 'daily' ? 'selected' : ''}>Diariamente</option><option value="weekly" ${t.freq === 'weekly' ? 'selected' : ''}>Semanalmente</option></select></label><label class="f">Horário<input type="time" name="time" value="${esc(t.time || '09:00')}"></label></div>
  <label class="f g-time">Dia da semana (semanal)<select name="day">${WEEK.map((d, i) => `<option value="${i}" ${t.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
  <label class="f">Projeto<select name="projectId" required>${ctx.state.projects.map(p => `<option value="${esc(p.id)}" ${(r?.projectId || dr?.projectId || ctx.project) === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
  <label class="f">Quem executa<select name="target" required>${ctx.state.agents.map(a => `<option value="a:${esc(a.id)}" ${tg.type === 'agent' && tg.id === a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.role)}</option>`).join('')}${ctx.state.teams.map(x => `<option value="t:${esc(x.id)}" ${tg.type === 'team' && tg.id === x.id ? 'selected' : ''}>Equipe ${esc(x.name)} (desenvolvedor → revisor)</option>`).join('')}${(ctx.state.recipes || []).map(x => `<option value=\"r:${esc(x.id)}\" ${tg.type === 'recipe' && tg.id === x.id ? 'selected' : ''}>Receita ${esc(x.name)}</option>`).join('')}</select></label>
  <label class="f">Objetivo<textarea name="objective" rows="4" required maxlength="5000">${esc(r?.objective || dr?.objective || '')}</textarea></label><p class="muted small">Dica: para pesquisar na internet, escolha um agente com “Pesquisar na web” ligado. Para postar, cite a conta com <code>+apelido</code>.</p>
  <label class="f">Executor<select disabled><option>PC local</option></select></label><p class="muted small" style="margin-top:6px">${icon('info', 14)} Requer computador ligado.</p>
  <label class="f">Comportamento de execução<select disabled><option>Não iniciar se já estiver em execução</option></select></label>
  <label class="f">Tentativas em caso de falha<select name="attempts">${[1, 2, 3].map(n => `<option ${r?.attempts === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  <div class="btn-row" style="margin-top:16px"><button type="button" class="btn outline" data-act="routine-test">${icon('play', 16)} Testar agora</button><button class="btn">${icon('save', 16)} Salvar rotina</button></div></form>`;
}

// ---------- Configurações ----------
export function viewSettings(ctx) {
  const tab = ctx.ui.settingsTab || 'aparencia', p = ctx.prefs;
  const menu = [['aparencia', 'palette', 'Aparência', 'Temas e preferências visuais'], ['execucao', 'gear', 'Execução', 'Agentes e ambientes'], ['acesso', 'key', 'Acesso', 'Chave local e permissões'], ['armazenamento', 'database', 'Armazenamento', 'Arquivos e dados'], ['atualizacoes', 'refresh', 'Atualizações', 'Versão e novidades'], ['historico', 'clock', 'Histórico', 'Quem fez o quê, e quando']];
  const themes = [['noite', 'Noite Lo-Fi', 'Foco e tranquilidade para longas sessões.'], ['amanhecer', 'Amanhecer', 'Clareza e energia para um novo dia.'], ['minimal', 'Minimal', 'Visual limpo e neutro para máxima concentração.']];
  const rt = ctx.state.runtime, c = rt.concurrency || { global: 1, provider: {}, video: 1 }, lim = ctx.state.limits || {};
  let body;
  if (tab === 'aparencia') body = `<h2 style="font-size:1.5rem">Aparência</h2><p class="muted">Escolha o tema, ajuste a interface e deixe seu espaço do seu jeito.</p>
    <div class="cols" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:14px"><div><section class="card"><h2>Tema visual</h2><p class="muted small" style="margin-bottom:10px">Altere as cores e o clima da interface.</p><div class="themes">${themes.map(([id, n, d]) => `<button class="theme theme-${id} ${p.theme === id || (!p.theme && id === 'noite') ? 'on' : ''}" data-act="theme" data-id="${id}" aria-pressed="${p.theme === id || (!p.theme && id === 'noite')}"><div class="pv">${themeImg(id)}</div>${p.theme === id || (!p.theme && id === 'noite') ? `<span class="ck">${icon('check', 16)}</span>` : ''}<b>${n}</b><br><small class="muted">${d}</small></button>`).join('')}</div></section>
      <section class="card"><h2>Interface</h2><div class="setting">${icon('sparkle', 22)}<span class="grow">Animações<br><small class="muted">Animações do escritório e dos personagens.</small></span>${toggle('pref-anim', p.anim !== false, 'Animações')}</div>
        <div class="setting">${icon('eyeoff', 22)}<span class="grow">Reduzir movimento<br><small class="muted">Diminui animações e transições. Por padrão segue o sistema.</small></span>${toggle('pref-reduce', !!p.reduce, 'Reduzir movimento')}</div>
        <div class="setting">${icon('pause', 22)}<span class="grow">Pausar ao ocultar a janela<br><small class="muted">Pausa o player quando o app estiver em segundo plano. As animações sempre pausam; tarefas continuam.</small></span>${toggle('pref-pausehidden', !p.musicHidden, 'Pausar ao ocultar a janela')}</div>
        <div class="setting">${icon('file', 22)}<span class="grow">Tamanho da fonte<br><small class="muted">Ajuste o tamanho do texto na interface.</small></span><select id="pref-font" style="width:170px">${[['small', 'Pequeno'], ['medium', 'Médio (padrão)'], ['large', 'Grande']].map(([v, l]) => `<option value="${v}" ${(p.font || 'medium') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></section></div>
    <div><section class="card"><h2>Pré-visualização</h2><p class="muted small" style="margin-bottom:10px">Uma amostra do tema selecionado no seu espaço.</p><div style="border-radius:10px;overflow:hidden;border:1px solid var(--line)"><img class="art-img" src="/assets/theme-preview.png" alt="" aria-hidden="true" style="width:100%;display:block"></div></section>
      
      <button class="btn block lg" data-act="save-prefs" style="margin-top:14px">${icon('save', 18)} Salvar preferências</button></div></div>`;
  else if (tab === 'historico') body = auditHtml(ctx);
  else if (tab === 'execucao') body = `<h2 style="font-size:1.5rem">Execução</h2><p class="muted">Limites de agentes e ambientes.</p><div class="cols c-1-1" style="margin-top:14px"><section class="card"><h2>Concorrência</h2><form id="conc-form"><label class="f">Execuções simultâneas (global)<input name="global" type="number" min="1" max="8" value="${c.global}"></label><div class="form-grid"><label class="f">Codex CLI<input name="codex" type="number" min="1" max="8" value="${c.provider?.codex ?? 1}"></label><label class="f">Claude Code<input name="claude" type="number" min="1" max="8" value="${c.provider?.claude ?? 1}"></label></div><label class="f">Renderizações de vídeo simultâneas<input name="video" type="number" min="1" max="8" value="${c.video}"></label><button class="btn block" style="margin-top:12px">Salvar limites</button></form><p class="muted small" style="margin-top:8px">Começa em 1. Mesmo com limite maior, só um agente escreve por pasta de projeto; leitores rodam juntos.</p></section>
    <section class="card"><h2>Fila</h2><div class="setting"><span class="grow">${rt.paused ? 'Novas tarefas pausadas' : 'Fila ativa'}<br><small class="muted">Pausar não cancela execuções em andamento.</small></span><button class="btn ghost" data-act="pause-toggle">${rt.paused ? 'Retomar' : 'Pausar novas tarefas'}</button></div><div class="setting"><span class="grow">Duração máxima: ${Math.round((lim.timeoutMs || 1200000) / 60000)} min<br><small class="muted">Ajuste em Consumo e limites.</small></span><button class="btn ghost" data-nav="usage">Abrir</button></div></section>${powerCard(ctx)}${retentionCard(ctx)}</div>`;
  else if (tab === 'atualizacoes') body = updatesSettingsHtml(ctx);
  else if (tab === 'acesso') body = `<h2 style="font-size:1.5rem">Acesso</h2><p class="muted">Chave local e permissões.</p><section class="card" style="margin-top:14px"><div class="setting">${icon('key', 24)}<span class="grow">Chave de acesso<br><small class="muted">Fica em <code>.data/access.key</code> neste computador. Por padrão o serviço só escuta aqui (127.0.0.1); o acesso remoto abaixo é opcional.</small></span></div><div class="setting">${icon('lock', 24)}<span class="grow">Bloquear painel<br><small class="muted">Esconde o painel neste navegador. Não encerra o serviço nem revoga uma chave já copiada.</small></span><button class="btn ghost" data-act="logout">Bloquear</button></div>${note('A conta online ainda não existe; o acesso é só local, ou pelo celular pareado abaixo.')}</section>${remoteCard(ctx)}${mcpCard(ctx)}`;
  else body = `<h2 style="font-size:1.5rem">Armazenamento</h2><p class="muted">Arquivos e dados locais.</p><section class="card" style="margin-top:14px">${ctx.storage ? `<dl class="kv"><dt>Pasta de dados</dt><dd><code>${esc(ctx.storage.dataDir)}</code></dd><dt>Banco local</dt><dd>${kb(ctx.storage.dbBytes)}</dd>${Object.entries(ctx.storage.counts).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl><p class="muted small">${esc(ctx.storage.note)}</p>` : empty('Carregando…')}${note('Para backup consistente, pare o serviço e copie a pasta .data inteira. Não há limpeza automática de histórico.')}</section>`;
  return `<div class="page" style="padding-top:18px"><div class="set-layout"><div><h1 style="font-size:1.8rem">Configurações</h1><p class="muted" style="margin:6px 0 16px">Personalize sua experiência no Code Room.</p><div class="set-menu" role="tablist">${menu.map(([id, ic, n, d]) => `<button role="tab" aria-selected="${tab === id}" class="${tab === id ? 'on' : ''}" data-act="settings-tab" data-id="${id}">${icon(ic, 22)}<span><b>${n}</b><small>${d}</small></span></button>`).join('')}</div></div><div>${body}</div></div></div>`;
}

// ---------- Acesso remoto (celular) ----------
function mcpCard(ctx) {
  const m = ctx.mcp;
  if (!m) return '';
  const w = ctx.mcpWrite === true, set = w ? m.escrita : m.leitura;
  const block = (key, label) => `<div style="margin:10px 0"><div style="display:flex;align-items:center;gap:10px;justify-content:space-between"><b class="small">${esc(label)}</b><button class="btn sm ghost" data-act="mcp-copy" data-id="${key}">Copiar</button></div><pre class="small" style="margin:6px 0 0;padding:10px;border:1px solid var(--line);border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg2)">${esc(set[key])}</pre></div>`;
  return `<section class="card" style="margin-top:14px" id="mcp-card"><h3 style="margin:0 0 6px;font-size:1.15rem">Conectar outras ferramentas (MCP)</h3>
    <p class="muted small">Deixe o Claude Code, o Codex ou outra ferramenta consultar o Code Room: projetos, agentes e tarefas. Usa um token próprio, que você revoga quando quiser. Aprovar, reprovar e apagar nunca ficam disponíveis por aqui.</p>
    ${m.active ? `<p class="small" style="margin:8px 0"><span class="pill ok"><span class="dot d-ok"></span>Ativo</span> <span class="muted">Modo da ferramenta: <b>${w ? 'leitura e escrita' : 'somente leitura'}</b></span></p>
      <div class="btn-row" style="margin:0 0 6px"><button class="btn ghost" data-act="mcp-write">${w ? 'Voltar para somente leitura' : 'Permitir criar e cancelar tarefas'}</button></div>
      ${w ? '<p class="small" style="margin:0 0 8px;color:var(--warn)">⚠️ Com a escrita ligada, a ferramenta pode criar tarefas que gastam a cota das suas IAs. As entregas continuam esperando a sua aprovação.</p>' : ''}
      ${block('claude', 'Claude Code (cole no terminal)')}${block('codex', 'Codex (cole no config.toml)')}${block('json', 'Outras ferramentas (JSON)')}
      <div class="btn-row" style="margin:10px 0 0"><button class="btn ghost" data-act="mcp-deactivate">Desativar e revogar</button></div>`
    : `<div class="btn-row" style="margin:8px 0 0"><button class="btn" data-act="mcp-activate">Ativar o MCP</button></div>`}
    ${note('Depois de colar o comando, reinicie a ferramenta. Se desativar, o token é revogado na hora.')}</section>`;
}
function remoteCard(ctx) {
  const n = ctx.net, devs = ctx.devices || [], pr = ctx.pairing;
  if (ctx.whoami === 'device') return `<section class="card" style="margin-top:14px"><h2>Acesso remoto</h2><p class="muted">Este aparelho está pareado. Os aparelhos e a rede são gerenciados no computador.</p></section>`;
  if (!n) return `<section class="card" style="margin-top:14px"><h2>Acesso remoto</h2><p class="muted">Carregando…</p></section>`;
  const ts = n.tailscale, running = ts.state === 'Running';
  const tsText = !ts.installed ? 'O Tailscale não está instalado neste computador.' : running ? `Conectado${ts.name ? ' como ' + ts.name : ''}.` : ts.state === 'NeedsLogin' ? 'Instalado, mas falta entrar com a sua conta: abra o Tailscale no computador e faça login.' : `Instalado, mas ainda não conectado (estado: ${ts.state}). Abra o Tailscale e entre com a sua conta.`;
  const addr = (n.addresses.find(a => a.kind === 'tailscale') || n.addresses[0])?.url || n.nameUrl, link = pr && addr ? `${addr.replace(/\/$/, '')}/#pair=${pr.code}` : '';
  return `<section class="card" style="margin-top:14px"><h2>Acesso remoto (celular)</h2>
    <p class="muted small">Controle o Code Room de outro aparelho. A chave principal nunca sai do computador: o celular recebe um token próprio, que você pode revogar.</p>
    <div class="setting">${icon('plug', 24)}<span class="grow">Tailscale (recomendado)<br><small class="muted">Rede privada e criptografada; funciona de qualquer lugar. ${esc(tsText)}</small></span>${toggle('pref-net-ts', !!n.config.tailscale, 'Tailscale')}</div>
    <div class="setting">${icon('globe', 24)}<span class="grow">Rede local (Wi-Fi de casa)<br><small class="muted">Sem criptografia (HTTP). Use só em rede confiável; desligue fora de casa.</small></span>${toggle('pref-net-lan', !!n.config.lan, 'Rede local')}</div>
    <div class="setting"><span class="grow"><b>Endereços ativos</b><br>${n.addresses.length ? n.addresses.map(a => `<small class="muted">${a.kind === 'tailscale' ? 'Tailscale' : 'Rede local'}: <code>${esc(a.url)}</code></small>`).join('<br>') + (n.nameUrl ? `<br><small class="muted">Nome: <code>${esc(n.nameUrl)}</code></small>` : '') : '<small class="muted">Nenhum no momento. Ligue uma das opções acima' + (n.config.tailscale && !running ? ' e conecte o Tailscale' : '') + '.</small>'}</span></div>
    <div class="btn-row" style="margin:6px 0 12px"><button class="btn" data-act="pair-new" ${n.addresses.length ? '' : 'disabled'}>${icon('plus', 18)} Parear um celular</button></div>
    ${pr ? `<div class="pair-box"><div class="pair-qr" aria-hidden="false">${link ? qrSvg(link, { scale: 5 }) : ''}</div><div><p class="small">No celular, escaneie o QR ou abra o endereço e digite o código:</p><p class="pair-code">${esc(pr.code)}</p><p class="small muted">Vale até ${hm(pr.expiresAt)} e só funciona uma vez.</p><p class="small"><code>${esc(link)}</code></p><button class="btn ghost sm" data-act="copy-text" data-id="${esc(link)}">${icon('copy', 16)} Copiar link</button></div></div>` : ''}
    <div class="btn-row" style="margin:0 0 12px"><button class="btn ghost" data-act="net-diagnose" ${ctx.netDiag === 'busy' ? 'disabled' : ''}>${icon('search', 18)} ${ctx.netDiag === 'busy' ? 'Verificando…' : 'Diagnosticar o acesso'}</button> <button class="btn ghost" data-act="net-firewall" title="O Windows vai pedir a sua permissão uma vez">${icon('lock', 18)} Liberar no firewall do Windows</button></div>
    ${n.config.lan ? '<p class="small" style="margin:0 0 10px;color:var(--warn)">⚠️ Rede local ligada: o acesso usa HTTP sem criptografia. Desligue fora de casa.</p>' : ''}
    <p class="small muted" style="margin:0 0 12px">Dica: no chat do Assistente, digite <code>/celular</code> para ver o passo a passo e o endereço.</p>
    ${Array.isArray(ctx.netDiag) ? `<ul class="diag-list" style="list-style:none;padding:0;margin:0 0 12px">${ctx.netDiag.map(c => `<li class="small" style="margin:4px 0">${c.ok === true ? '✅' : c.ok === false ? '⚠️' : 'ℹ️'} <b>${esc(c.label)}</b>${c.hint ? `<br><span class="muted">${esc(c.hint)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    <h3 style="margin:14px 0 6px;font-size:1.05rem">Aparelhos pareados</h3>
    ${devs.length ? `<div class="tbl"><table><thead><tr><th>Aparelho</th><th>Pareado em</th><th>Último acesso</th><th></th></tr></thead><tbody>${devs.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(new Date(d.createdAt).toLocaleString('pt-BR'))}</td><td>${d.lastSeen ? esc(new Date(d.lastSeen).toLocaleString('pt-BR')) : 'nunca'}</td><td><button class="btn ghost sm" data-act="revoke-device" data-id="${esc(d.id)}">${icon('x', 16)} Revogar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nenhum aparelho pareado.</p>'}
    ${note('Quem tem um aparelho pareado controla os agentes deste computador (inclusive os que escrevem em arquivos). Revogue aparelhos perdidos.')}</section>`;
}

// ---------- Janelas de uso por conta + tokens por dia ----------
const left = ms => { const m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60; return d ? `${d} d ${h} h` : h ? `${h} h ${String(mi).padStart(2, '0')} min` : `${mi} min`; };
function dailyBars(runs) {
  const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ key: d.toISOString().slice(0, 10), d, by: {} }); }
  for (const r of runs) { const k = new Date(r.createdAt); k.setHours(0, 0, 0, 0); const day = days.find(x => x.key === k.toISOString().slice(0, 10)); if (!day || r.usage?.input == null) continue; day.by[r.agent.provider] = (day.by[r.agent.provider] || 0) + (r.usage.input || 0) + (r.usage.output || 0); }
  const max = Math.max(1, ...days.map(d => Object.values(d.by).reduce((a, b) => a + b, 0))), W = 14 * 22, H = 64, COLORS = { codex: '#6ea8ff', claude: '#d9664b', agy: '#7ad1a6', hermes: '#b79cff' };
  const bars = days.map((d, i) => { let y = H; return Object.entries(d.by).map(([p, v]) => { const h = Math.max(2, v / max * (H - 6)); y -= h; return `<rect x="${i * 22 + 3}" y="${y.toFixed(1)}" width="16" height="${h.toFixed(1)}" rx="3" fill="${COLORS[p] || '#8a8f99'}"><title>${d.d.toLocaleDateString('pt-BR')}: ${p} ${num(v)} tokens</title></rect>`; }).join(''); }).join('');
  const total = days.reduce((a, d) => a + Object.values(d.by).reduce((x, y) => x + y, 0), 0);
  return total ? `<svg viewBox="0 0 ${W} ${H + 14}" class="spark" role="img" aria-label="Tokens por dia nos últimos 14 dias">${bars}<line x1="0" y1="${H + .5}" x2="${W}" y2="${H + .5}" stroke="var(--line)"/><text x="3" y="${H + 12}" font-size="9" fill="var(--muted)">${days[0].d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</text><text x="${W - 3}" y="${H + 12}" font-size="9" text-anchor="end" fill="var(--muted)">hoje</text></svg>` : '<p class="muted small">Ainda não há tokens reportados nos últimos 14 dias.</p>';
}
function limitsCard(ctx, runs) {
  return `<section class="card" style="margin:0 0 14px"><div class="card-h"><div><h2>Uso por IA</h2><small class="muted">Limites reportados pelas contas conectadas</small></div><button class="btn ghost sm" data-act="refresh-limits" title="Faz uma chamada mínima ao Claude para ler os limites agora">${icon('clock', 16)} Atualizar leitura do Claude</button></div>
    ${usageCards(ctx)}
    <p class="muted small" style="margin-top:8px">Valores informados pelos próprios provedores (o Codex grava nas sessões locais; o Claude, na saída de cada execução). Sem leitura, aparece "indisponível": nada é estimado.</p>
    <h3 style="margin:14px 0 6px;font-size:1rem">Tokens por dia (14 dias)</h3>${dailyBars(runs)}</section>`;
}

// Cartões compactos reaproveitam somente as janelas que os próprios provedores reportaram.
export function usageCards(ctx) {
  const data = ctx.limits?.providers;
  if (!data) return '<div class="quota-board" aria-label="Resumo do uso por IA"><p class="muted">Carregando leituras de uso…</p></div>';
  const now = Date.now();
  const cards = data.map(p => {
    const windows = (p.windows || []).map(w => {
      const valid = Number.isFinite(w.usedPercent), pct = valid ? Math.min(100, Math.max(0, w.usedPercent)) : null;
      const parsedReset = w.resetsAt ? Date.parse(w.resetsAt) : NaN, reset = Number.isFinite(parsedReset) ? parsedReset : null, expired = reset != null && reset <= now;
      const resetLabel = reset == null ? 'Reinício indisponível' : expired ? 'Leitura vencida' : `Reinicia em ${left(reset - now)}`;
      return `<div class="quota-window"><div class="quota-window-head"><span>${esc(w.label)}</span><b>${pct == null || expired ? 'indisponível' : `${pct.toFixed(pct < 10 && pct % 1 ? 1 : 0)}%`}</b></div><div class="quota-track" role="img" aria-label="${esc(w.label)}: ${pct == null || expired ? 'uso indisponível' : `${pct}% usado`}"><i class="${pct >= 80 ? 'hot' : ''}" style="width:${pct == null || expired ? 0 : pct}%"></i></div><small class="muted">${resetLabel}</small></div>`;
    }).join('');
    const observed = p.observedAt ? Date.parse(p.observedAt) : NaN;
    const age = Number.isFinite(observed) ? `Leitura de ${left(Math.max(0, now - observed))}` : 'Leitura sem horário informado';
    const note = p.unavailable || p.note || 'Este provedor não disponibilizou uma janela de uso.';
    return `<article class="quota-card"><div class="quota-card-head"><div><b>${esc(p.name)}</b>${p.plan ? `<small>${esc(p.plan)}</small>` : ''}</div><span class="quota-live"><i></i>${windows ? esc(age) : 'sem leitura'}</span></div>${windows || `<p class="quota-empty">${esc(note)}</p>`}</article>`;
  }).join('');
  return `<div class="quota-board" aria-label="Resumo do uso por IA"><div class="quota-grid">${cards}</div></div>`;
}

// ---------- Limpeza de dados antigos (com prévia) ----------
function powerCard(ctx) {
  const w = ctx.power, s = ctx.startup || { supported: false, on: false }; if (!w) return '';
  const ls = w.lastSleep ? `<p class="small muted" style="margin:8px 0 0">Última suspensão registrada: ${esc(new Date(w.lastSleep.from).toLocaleString('pt-BR'))} até ${esc(new Date(w.lastSleep.to).toLocaleString('pt-BR'))}.</p>` : '';
  return `<section class="card" style="margin-top:14px" id="power-card"><h2>Energia do computador</h2>
    <p class="muted small">Se o computador dormir, o Code Room para: o acesso pelo celular, as rotinas e as tarefas em andamento ficam parados. Quando ele acorda, o app avisa quanto tempo ficou parado.</p>
    <div class="setting">${icon('clock', 24)}<span class="grow">Manter acordado enquanto houver tarefa rodando<br><small class="muted">${w.supported ? 'Pede ao Windows para não suspender só enquanto uma tarefa estiver em andamento; quando termina, o computador volta a dormir normalmente.' : 'Disponível só no Windows.'}${w.holding ? ' <b>Agora: segurando o computador acordado.</b>' : ''}</small></span>${toggle('pref-keepawake', !!w.keepAwake, 'Manter acordado')}</div>
    <div class="setting">${icon('terminal', 24)}<span class="grow">Iniciar com o Windows<br><small class="muted">${s.supported ? 'Abre só o serviço e o ícone perto do relógio quando você entra no Windows, sem janela. Assim o acesso pelo celular já está pronto. Clique com o botão direito no ícone para fechar o Code Room.' : 'Disponível só no Windows.'}</small></span>${toggle('pref-startup', !!s.on, 'Iniciar com o Windows')}</div>
    ${ls}</section>`;
}
function retentionCard(ctx) {
  const r = ctx.retention;
  const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const list = r && r.items ? `<p class="small" style="margin:10px 0 4px"><b>Seriam apagadas:</b></p><ul class="small" id="ret-list" style="margin:0 0 10px;padding-left:18px">${r.items.map(i => `<li><b>${i.count}</b> · ${esc(i.label)}${i.detail ? ` (${esc(i.detail)})` : ''}${i.bytes ? ` — ${fmt(i.bytes)}` : ''}</li>`).join('')}</ul>${r.totalBytes ? `<p class="small">Espaço a liberar: <b>${fmt(r.totalBytes)}</b>.</p>` : ''}<div class="btn-row"><button class="btn danger" data-act="retention-purge">Apagar agora</button></div>` : '';
  const info = r === 'busy' ? '<p class="small muted">Verificando…</p>' : r ? (r.items && r.items.length ? list : '<p class="small muted">Nada para limpar: não há dados antigos que possam ser apagados com segurança.</p>') : '';
  return `<section class="card" style="margin-top:14px" id="retention-card"><h2>Limpeza de dados antigos</h2><p class="muted small">Aqui você vê o que seria apagado antes de confirmar: tarefas internas do Assistente com mais de 7 dias, pacotes de atualização já baixados, a cópia da versão anterior depois de 7 dias da troca e avisos antigos já vistos. Entregas, projetos, suas tarefas, conversas, agentes e a lixeira não são tocados.</p><div class="btn-row"><button class="btn ghost" data-act="retention-preview" ${r === 'busy' ? 'disabled' : ''}>${icon('search', 18)} Ver o que seria apagado</button></div>${info}${ctx.cleanup ? `<div class="setting" style="margin-top:12px">${icon('refresh', 22)}<span class="grow">Limpar automaticamente, uma vez por dia<br><small class="muted">Apaga só o que a lista acima mostraria (nada seu). Desligado por padrão.${ctx.cleanup.lastRun ? ` Última limpeza: ${esc(new Date(ctx.cleanup.lastRun).toLocaleString('pt-BR'))}${ctx.cleanup.last?.items ? `, ${ctx.cleanup.last.items} item(ns)` : ', nada a apagar'}.` : ''}</small></span>${toggle('pref-autoclean', !!ctx.cleanup.auto, 'Limpar automaticamente')}</div>` : ''}</section>`;
}
