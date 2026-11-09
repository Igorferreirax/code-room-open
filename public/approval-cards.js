// Cartões de aprovação no chat do Assistente: vídeo, imagens e prévias de lote aparecem ali mesmo, com Aprovar / Pedir ajustes.
// Só usa o que o app já tem (arquivos das entregas e a mídia dos lotes); aprovar uma entrega NUNCA publica nada.
import { icon } from './icons.js';
import { esc, inProject } from './views.js';
import { deliveryTitle } from './views2.js';

const EXT = p => (String(p).split('.').pop() || '').toLowerCase();
export const mediaKind = p => ['mp4', 'webm', 'mov'].includes(EXT(p)) ? 'video' : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(EXT(p)) ? 'image' : '';
const DAY = 86400000;

// Até `max` itens que esperam a pessoa: prévias de lote primeiro, depois entregas concluídas (últimos 14 dias) com vídeo ou imagem e ainda sem revisão.
export function approvalItems(ctx, max = 8) {
  const st = ctx.state || {}, out = [];
  for (const b of st.batches || []) {
    if (ctx.project && b.projectId && b.projectId !== ctx.project) continue;
    for (const ep of b.episodes || []) if (ep.status === 'aguardando_previa') out.push({ type: 'preview', key: `p:${b.id}:${ep.id}`, batchId: b.id, epId: ep.id, title: ep.title || b.name || 'Prévia do lote' });
  }
  for (const pl of st.plans || []) if (pl.status === 'proposed' && (!ctx.project || pl.projectId === ctx.project)) out.push({ type: 'plan', key: `pl:${pl.id}`, id: pl.id, title: `Plano: ${String(pl.request || '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'sem título'}`, rationale: String(pl.plan?.rationale || '').slice(0, 300), steps: (pl.plan?.steps || []).slice(0, 6).map(x => ({ title: String(x.title || x.objective || '').slice(0, 80), agentId: x.agentId })) });
  for (const rr of st.recipeRuns || []) if (rr.status === 'waiting' && (!ctx.project || !rr.projectId || rr.projectId === ctx.project)) out.push({ type: 'recipe', key: `rr:${rr.id}`, id: rr.id, title: `Receita “${String(rr.name || '').slice(0, 70)}” espera a sua aprovação`, objective: String(rr.objective || '').slice(0, 300) });
  for (const sb of st.subtasks || []) if (sb.status === 'proposed' && (!ctx.project || sb.projectId === ctx.project)) out.push({ type: 'subtask', key: `sb:${sb.id}`, id: sb.id, title: `${sb.fromAgent} pede ajuda a ${sb.agentName}`, objective: String(sb.objective || '').slice(0, 400) });
  for (const sp of st.socialProposals || []) out.push({ type: 'post', key: `sp:${sp.id}`, id: sp.id, accountId: sp.accountId, label: sp.label, network: sp.network, accountName: sp.accountName, text: sp.text, media: sp.media || [], suggestedAt: sp.suggestedAt, title: `Postar em +${sp.label}`, agent: sp.agent || '' });
  const recent = r => { const at = Date.parse(r.createdAt || r.updatedAt); return !at || Date.now() - at < 14 * DAY; };
  const tasks = (st.runs || []).filter(r => r.status === 'completed' && !r.review && r.kind !== 'plan' && r.step !== 'review' && inProject(ctx, r) && recent(r) && (r.deliverables || []).some(f => mediaKind(f.path)))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map(r => ({ type: 'task', key: `t:${r.id}`, id: r.id, title: deliveryTitle(r), agent: r.agent?.name || '', file: (r.deliverables.find(f => mediaKind(f.path)) || r.deliverables[0]).path }));
  return [...out, ...tasks].slice(0, max);
}

const mediaHtml = (it, files) => {
  if (files === undefined || files === null) return '<div class="ap-media ap-wait" role="status">Carregando a prévia…</div>';
  const vids = files.filter(f => mediaKind(f.name || f.path) === 'video').slice(0, 1), imgs = files.filter(f => mediaKind(f.name || f.path) === 'image').slice(0, 4);
  if (!vids.length && !imgs.length) return '<div class="ap-media ap-wait">Sem prévia visual. Use “Abrir”.</div>';
  return `<div class="ap-media">${vids.map(f => `<video controls preload="metadata" src="${esc(f.url)}" aria-label="Vídeo: ${esc(f.name || '')}"></video>`).join('')}${imgs.length ? `<div class="ap-imgs ${vids.length ? 'sm' : ''}">${imgs.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc(f.name || '')}"><img loading="lazy" src="${esc(f.url)}" alt="${esc(f.name || 'Imagem da entrega')}"></a>`).join('')}</div>` : ''}</div>`;
};

const textBody = (ctx, it) => it.type !== 'plan' ? `<div class="ap-media ap-text"><p>${esc(it.objective || 'Sem descrição.')}</p></div>` : it.type === 'plan'
  ? `<div class="ap-media ap-text">${it.rationale ? `<p>${esc(it.rationale)}</p>` : ''}<ol>${it.steps.map(x => `<li>${esc(x.title)}${(ctx.state?.agents || []).find(a => a.id === x.agentId) ? ` <small class="muted">→ ${esc((ctx.state.agents || []).find(a => a.id === x.agentId).name)}</small>` : ''}</li>`).join('')}</ol></div>`
  : '';

const nowLocal = () => { const d = new Date(Date.now() + 3600e3); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; };
const postBody = (ctx, it) => { const acc = (ctx.social?.accounts || []).find(a => a.id === it.accountId), net = ctx.social?.catalog?.[it.network], api = acc ? acc.mode === 'api' : null, when = ctx.ui?.apWhen?.[it.id], sched = ctx.ui?.apSched?.[it.id] ?? !!it.suggestedAt;
  const val = when || (it.suggestedAt ? localLocal(it.suggestedAt) : nowLocal());
  return `<div class="ap-post"><p class="small"><b>${esc(net?.name || it.network)}</b> · ${esc(it.accountName || '')} <span class="pill ${api ? 'ok' : 'warn'}">${api == null ? 'conferindo…' : api ? 'publica depois de aprovar' : 'pacote pronto'}</span></p>
    <label class="sr-only" for="pt-${esc(it.id)}">Texto da postagem</label><textarea id="pt-${esc(it.id)}" rows="4" maxlength="6000">${esc(it.text)}</textarea><small class="muted"><span id="pc-${esc(it.id)}">${it.text.length}</span>${net ? ` / ${net.text}` : ''} caracteres${it.media.length ? ` · mídia: ${it.media.map(m => esc(m.split('/').pop())).join(', ')}` : ' · sem mídia'}</small>
    ${api === false ? '' : `<div class="ap-when"><label class="check"><input type="checkbox" data-act="ap-post-sched" data-id="${esc(it.id)}" ${sched ? 'checked' : ''}> Agendar</label>${sched ? `<input id="pw-${esc(it.id)}" type="datetime-local" value="${esc(val)}" aria-label="Horário da postagem">` : '<small class="muted">Publica assim que você aprovar.</small>'}</div>`}</div>`; };
const localLocal = iso => { const d = new Date(iso); if (Number.isNaN(+d)) return nowLocal(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export function approvalHtml(ctx) {
  const items = approvalItems(ctx); if (!items.length) return '';
  const i = Math.min(Math.max(Number(ctx.ui?.apIdx) || 0, 0), items.length - 1), it = items[i], collapsed = !!ctx.ui?.apCollapsed;
  const head = `<div class="ap-top"><b>Aguardando você</b><span class="pill warn">${items.length}</span><span class="grow"></span>${items.length > 1 ? `<button type="button" class="iconbtn" data-act="ap-nav" data-id="-1" aria-label="Anterior" ${i === 0 ? 'disabled' : ''}>‹</button><small>${i + 1}/${items.length}</small><button type="button" class="iconbtn" data-act="ap-nav" data-id="1" aria-label="Próxima" ${i === items.length - 1 ? 'disabled' : ''}>›</button>` : ''}<button type="button" class="iconbtn" data-act="ap-toggle" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Mostrar' : 'Recolher'} a aprovação" title="${collapsed ? 'Mostrar' : 'Recolher'}">${collapsed ? '▾' : '▴'}</button></div>`;
  if (collapsed) return `<section class="ap ap-min" aria-label="Aguardando a sua aprovação">${head}<p class="ap-title"><b>${esc(it.title)}</b></p></section>`;
  const asking = ctx.ui?.apChanges === it.key;
  const actions = it.type === 'post'
    ? `<div class="btn-row"><button type="button" class="btn sm" data-act="ap-post-approve" data-id="${esc(it.id)}">${icon('check', 14)} ${(ctx.social?.accounts || []).find(a => a.id === it.accountId)?.mode === 'manual' ? 'Preparar pacote' : 'Aprovar'}</button><button type="button" class="btn ghost sm" data-act="ap-post-dismiss" data-id="${esc(it.id)}">Descartar</button></div><p class="muted small">Só publica o que você aprovar aqui, no horário escolhido.</p>`
    : it.type === 'subtask'
    ? `<div class="btn-row"><button type="button" class="btn sm" data-act="ap-sub-approve" data-id="${esc(it.id)}">${icon('check', 14)} Aprovar pedido</button><button type="button" class="btn ghost sm" data-act="ap-sub-dismiss" data-id="${esc(it.id)}">Descartar</button></div><p class="muted small">Aprovar cria uma tarefa para o outro agente, com o resumo e os arquivos do pedido.</p>`
    : it.type === 'plan'
    ? `<div class="btn-row"><button type="button" class="btn sm" data-act="accept-plan" data-id="${esc(it.id)}">${icon('check', 14)} Aceitar plano</button><button type="button" class="btn ghost sm" data-nav="tasks">Abrir</button></div><p class="muted small">Aceitar cria as tarefas do plano. Nada é publicado.</p>`
    : it.type === 'recipe'
      ? `<div class="btn-row"><button type="button" class="btn sm" data-act="ap-recipe-approve" data-id="${esc(it.id)}">${icon('check', 14)} Aprovar e continuar</button><button type="button" class="btn ghost sm" data-act="ap-recipe-cancel" data-id="${esc(it.id)}">Cancelar receita</button></div>`
      : it.type === 'preview'
    ? `<div class="btn-row"><button type="button" class="btn sm" data-act="batch-preview-ok" data-id="${esc(it.batchId)}" data-ep="${esc(it.epId)}">${icon('check', 14)} Aprovar prévia</button><button type="button" class="btn ghost sm" data-nav="routines">Abrir lote</button></div><p class="muted small">Aprovar a prévia continua o episódio para a montagem final.</p>`
    : asking
      ? `<label class="sr-only" for="ap-note">Descreva o ajuste</label><textarea id="ap-note" rows="2" maxlength="500" placeholder="O que precisa mudar?">${esc(ctx.ui?.apNote || '')}</textarea><div class="btn-row"><button type="button" class="btn sm" data-act="ap-changes-send" data-id="${esc(it.id)}">${icon('send', 14)} Enviar ajustes</button><button type="button" class="btn ghost sm" data-act="ap-changes-cancel">Cancelar</button></div>`
      : `<div class="btn-row"><button type="button" class="btn sm" data-act="ap-approve" data-id="${esc(it.id)}">${icon('check', 14)} Aprovar</button><button type="button" class="btn ghost sm" data-act="ap-changes-open" data-id="${esc(it.key)}">Pedir ajustes</button><button type="button" class="btn ghost sm" data-act="ap-open" data-id="${esc(it.id)}" data-file="${esc(it.file || '')}">Abrir</button></div><p class="muted small">Aprovar não publica nada.</p>`;
  return `<section class="ap" aria-label="Aguardando a sua aprovação">${head}${it.type === 'post' ? postBody(ctx, it) : it.type === 'plan' || it.type === 'recipe' || it.type === 'subtask' ? textBody(ctx, it) : mediaHtml(it, ctx.cardMedia?.[it.key])}<p class="ap-title"><b>${esc(it.title)}</b><small>${it.type === 'preview' ? 'Prévia do lote' : it.type === 'plan' ? 'Plano do Supervisor' : it.type === 'recipe' ? 'Receita' : it.type === 'subtask' ? 'Pedido de ajuda entre agentes' : it.type === 'post' ? `Proposta${it.agent ? ' de ' + esc(it.agent) : ''}` : esc(it.agent)}</small></p>${actions}</section>`;
}
