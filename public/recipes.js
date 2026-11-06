// Receitas: passos que se repetem (de agentes ou seus, por fora), com aprovação onde você quiser.
import { icon } from './icons.js';
import { esc, hero, empty, note } from './views.js';

const KIND = { video: 'Vídeo', app: 'App / código', outro: 'Outro' };
const RUN = { running: ['Rodando', 'ok'], waiting: ['Esperando você', 'warn'], done: ['Concluída', 'ok'], failed: ['Falhou', 'bad'], cancelled: ['Cancelada', ''] };
export const ROWS = 8;

// Modelos para começar. `role` escolhe o primeiro agente com esse papel; sem agente com o papel, o passo fica para você escolher.
export const TEMPLATES = {
  'video-fora': { name: 'Vídeo: crio por fora, o Code Room cuida do resto', kind: 'video', description: 'Você monta o vídeo na ferramenta que preferir. Depois o Code Room confere, prepara o texto da postagem e espera a sua aprovação.', outside: 'Pasta onde você guarda o vídeo pronto (ex.: a pasta POSTAR do projeto).', steps: [
    { type: 'agent', role: 'roteirista', title: 'Roteiro', prompt: 'Escreva o roteiro do vídeo: gancho nos primeiros 3 segundos, fala curta e chamada final.' },
    { type: 'manual', title: 'Eu crio o vídeo por fora', prompt: '' },
    { type: 'agent', role: 'revisor', title: 'Conferir o vídeo e a legenda', prompt: 'Confira o vídeo entregue na pasta do projeto (duração, áudio, texto na tela) e escreva título, descrição e hashtags para a postagem.' }] },
  'video-agentes': { name: 'Vídeo: produzido pelos agentes, com prévia para eu aprovar', kind: 'video', description: 'Roteiro, produção e revisão feitos por agentes, parando para você aprovar antes do que gasta crédito e antes de publicar.', outside: '', steps: [
    { type: 'agent', role: 'roteirista', title: 'Roteiro', prompt: 'Escreva o roteiro do vídeo seguindo o formato do canal.' },
    { type: 'agent', role: 'diretor', title: 'Produção do vídeo', prompt: 'Produza o vídeo a partir do roteiro aprovado e entregue a prévia na pasta do projeto.', approval: true },
    { type: 'agent', role: 'revisor', title: 'Revisão e texto da postagem', prompt: 'Revise a prévia e escreva título, descrição e hashtags.', approval: true }] },
  'app-novo': { name: 'App novo: desenvolver, revisar e testar', kind: 'app', description: 'Um agente desenvolve, outro revisa e outro testa. Você aprova a revisão antes de fechar.', outside: 'Se preferir programar por fora, use o passo "Eu faço por fora".', steps: [
    { type: 'agent', role: 'desenvolvedor', title: 'Desenvolver', prompt: 'Implemente o que foi pedido, com testes quando fizer sentido.' },
    { type: 'agent', role: 'revisor', title: 'Revisar o código', prompt: 'Revise o que foi feito: erros, segurança e clareza. Liste o que precisa mudar.', approval: true },
    { type: 'agent', role: 'testador', title: 'Testar', prompt: 'Rode os testes e confira se o que foi pedido realmente funciona. Resuma o que passou e o que falhou.' }] }
};

export function draftFrom(ctx, tpl) {
  const t = TEMPLATES[tpl]; if (!t) return null;
  const by = role => ctx.state.agents.find(a => (a.role || '').toLowerCase().includes(role))?.id || '';
  return { ...t, projectId: ctx.project || ctx.state.projects[0]?.id || '', steps: t.steps.map(s => ({ ...s, agentId: s.type === 'agent' ? by(s.role) : null })) };
}

const stepChip = (s, active) => `<span class="chip${active ? ' on' : ''}" title="${esc(s.title)}">${s.type === 'manual' ? 'Você' : esc(s.title)}${s.approval && s.type !== 'manual' ? ' ✓' : ''}</span>`;

export function viewRecipes(ctx) {
  const rs = ctx.state.recipes || [], runs = ctx.state.recipeRuns || [], agent = id => ctx.state.agents.find(a => a.id === id);
  const cards = rs.map(r => `<article class="card" style="padding:16px"><div class="card-h"><h2>${esc(r.name)}</h2><span class="pill">${KIND[r.kind] || 'Outro'}</span></div>
    ${r.description ? `<p class="muted small">${esc(r.description)}</p>` : ''}
    <ol class="small" style="margin:8px 0 8px 18px;padding:0">${r.steps.map(s => `<li>${s.type === 'manual' ? `<b>Você, por fora:</b> ${esc(s.title)}` : `${esc(s.title)} <span class="muted">· ${esc(agent(s.agentId)?.name || 'agente removido')}</span>`}${s.approval && s.type !== 'manual' ? ' <span class="muted">(pede sua aprovação antes)</span>' : ''}</li>`).join('')}</ol>
    ${r.outside ? `<p class="small muted">${icon('folder', 14)} Por fora: ${esc(r.outside)}</p>` : ''}
    <div class="btn-row"><button class="btn sm" data-act="recipe-run-open" data-id="${esc(r.id)}">${icon('play', 16)} Rodar</button><button class="btn outline sm" data-act="recipe-edit" data-id="${esc(r.id)}">Editar</button><button class="btn ghost sm" data-act="recipe-del" data-id="${esc(r.id)}" aria-label="Excluir receita ${esc(r.name)}">${icon('trash', 16)}</button></div></article>`).join('');
  const rows = runs.map(x => { const [l, c] = RUN[x.status] || [x.status, '']; const s = x.steps[Math.min(x.i, x.steps.length - 1)];
    return `<div class="card" style="padding:14px;margin-top:10px"><div class="card-h"><h3 style="margin:0">${esc(x.name)} <span class="muted small">· ${esc(x.objective.slice(0, 80))}</span></h3><span class="pill ${c}">${l}</span></div>
    <div class="chips" style="margin:6px 0">${x.steps.map((st, i) => stepChip(st, i === x.i && !['done', 'cancelled'].includes(x.status))).join('')}</div>
    ${x.status === 'waiting' && s ? `<p class="small">${s.type === 'manual' ? `Sua vez: <b>${esc(s.title)}</b>. Faça por fora e marque quando terminar.` : `<b>${esc(s.title)}</b> está pronto para começar. Quer seguir?`}</p><div class="btn-row"><button class="btn sm" data-act="recipe-approve" data-id="${esc(x.id)}">${s.type === 'manual' ? 'Concluí, seguir' : 'Aprovar e seguir'}</button><button class="btn outline sm" data-act="recipe-cancel" data-id="${esc(x.id)}">Cancelar rodada</button></div>` : ''}
    ${x.status === 'failed' && s?.result ? `<p class="small" style="color:var(--bad)">${esc(String(s.result).slice(0, 300))}</p><div class="btn-row"><button class="btn outline sm" data-act="recipe-cancel" data-id="${esc(x.id)}">Encerrar rodada</button></div>` : ''}
    ${x.status === 'running' ? `<div class="btn-row"><button class="btn outline sm" data-act="recipe-cancel" data-id="${esc(x.id)}">Cancelar rodada</button></div>` : ''}
    ${x.status === 'done' ? `<p class="small muted">Resultado do último passo: ${esc(String([...x.steps].reverse().find(t => t.result)?.result || 'sem texto').slice(0, 300))}</p>` : ''}</div>`; }).join('');
  return `<div class="page">${hero('Receitas', 'Transforme o que você faz sempre em passos que o Code Room repete. Você decide o que ele faz sozinho e o que continua sendo seu.', 'agentes', `<button class="btn" data-act="recipe-new">${icon('plus', 18)} Nova receita</button>`)}
  ${rs.length ? `<div class="agents-grid" style="margin-top:16px">${cards}</div>` : `<div class="card" style="padding:18px;margin-top:16px"><h2>Comece por um modelo</h2><p class="muted small">Escolha o que mais se parece com o seu dia a dia. Depois você ajusta os passos.</p><div class="btn-row">${Object.entries(TEMPLATES).map(([k, t]) => `<button class="btn outline" data-act="recipe-tpl" data-id="${k}">${esc(t.name)}</button>`).join('')}</div></div>`}
  <section style="margin-top:20px"><h2>Rodadas</h2>${rows || empty('Nenhuma rodada ainda. Clique em Rodar em uma receita.')}</section>
  ${note('Como usar: crie ou edite o vídeo/app por fora quando quiser; quando o jeito estiver bom, descreva os passos aqui. O passo "Você, por fora" deixa a rodada esperando até você marcar que terminou. Para rodar sozinha em um horário, crie uma Rotina e escolha esta receita.', 'info')}</div>`;
}

export function panelRecipe(ctx) {
  const d = ctx.ui.recipeDraft || ctx.state.recipes.find(x => x.id === ctx.ui.panelId) || { kind: 'video', projectId: ctx.project || '', steps: [] };
  const tpl = Object.keys(TEMPLATES);
  const row = i => { const s = d.steps[i] || { type: 'agent', title: '', agentId: '', prompt: '', approval: false };
    return `<fieldset class="rc-step" style="border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0"><legend class="small muted">Passo ${i + 1}</legend>
    <div class="form-grid"><label class="f">Quem faz<select name="t${i}"><option value="agent" ${s.type !== 'manual' ? 'selected' : ''}>Um agente</option><option value="manual" ${s.type === 'manual' ? 'selected' : ''}>Eu, por fora</option></select></label>
    <label class="f">Agente<select name="a${i}"><option value="">—</option>${ctx.state.agents.map(a => `<option value="${esc(a.id)}" ${s.agentId === a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.role)}</option>`).join('')}</select></label></div>
    <label class="f">Nome do passo<input name="n${i}" maxlength="100" value="${esc(s.title)}" placeholder="${i ? 'Deixe em branco para não usar' : 'Ex.: Roteiro'}"></label>
    <label class="f">Instrução (para o agente)<textarea name="p${i}" rows="2" maxlength="5000">${esc(s.prompt || '')}</textarea></label>
    <label class="small"><input type="checkbox" name="v${i}" ${s.approval ? 'checked' : ''}> Pedir minha aprovação antes deste passo</label></fieldset>`; };
  return `<div class="card-h"><h2>${d.id ? 'Editar receita' : 'Nova receita'}</h2><button class="iconbtn" data-act="close-panel" aria-label="Fechar">${icon('x', 22)}</button></div>
  <form id="recipe-form"><input type="hidden" name="rid" value="${esc(d.id || '')}">
  ${d.id ? '' : `<p class="small muted">Começar de um modelo:</p><div class="chips">${tpl.map(k => `<button type="button" class="chip" data-act="recipe-tpl" data-id="${k}">${esc(TEMPLATES[k].name.split(':')[0])}: ${esc(TEMPLATES[k].name.split(':')[1].trim().slice(0, 28))}…</button>`).join('')}</div>`}
  <label class="f">Nome<input name="name" required maxlength="100" value="${esc(d.name || '')}" placeholder="Ex.: Vídeo semanal do meu canal"></label>
  <div class="form-grid"><label class="f">Tipo<select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
  <label class="f">Projeto<select name="projectId"><option value="">— (só passos seus)</option>${ctx.state.projects.map(p => `<option value="${esc(p.id)}" ${d.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>
  <label class="f">Descrição<input name="description" maxlength="500" value="${esc(d.description || '')}"></label>
  <label class="f">Onde eu trabalho por fora (opcional)<input name="outside" maxlength="500" value="${esc(d.outside || '')}" placeholder="Pasta ou ferramenta que você usa"></label>
  ${Array.from({ length: ROWS }, (_, i) => row(i)).join('')}
  <div class="btn-row" style="margin-top:12px"><button class="btn">${icon('save', 16)} Salvar receita</button></div></form>`;
}

export function panelRecipeRun(ctx) {
  const r = ctx.state.recipes.find(x => x.id === ctx.ui.panelId); if (!r) return '';
  return `<div class="card-h"><h2>Rodar: ${esc(r.name)}</h2><button class="iconbtn" data-act="close-panel" aria-label="Fechar">${icon('x', 22)}</button></div>
  <form id="recipe-run-form"><input type="hidden" name="rid" value="${esc(r.id)}"><label class="f">O que esta rodada precisa entregar?<textarea name="objective" rows="4" required maxlength="5000" placeholder="Ex.: Episódio 05, a lenda do Saci"></textarea></label>
  <div class="btn-row" style="margin-top:12px"><button class="btn">${icon('play', 16)} Começar</button></div></form>`;
}

// Lê o formulário e devolve a receita para a API (linhas sem nome são ignoradas).
export function readRecipeForm(form) {
  const d = Object.fromEntries(new FormData(form)), steps = [];
  for (let i = 0; i < ROWS; i++) { const title = (d['n' + i] || '').trim(); if (!title) continue; steps.push({ type: d['t' + i] === 'manual' ? 'manual' : 'agent', title, agentId: d['a' + i] || null, prompt: d['p' + i] || '', approval: d['v' + i] === 'on' }); }
  return { ...(d.rid ? { id: d.rid } : {}), name: d.name, kind: d.kind, projectId: d.projectId, description: d.description, outside: d.outside, steps };
}
