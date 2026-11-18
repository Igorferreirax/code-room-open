// Consumo: orquestração inteligente ("planejar grande, executar enxuto"), comparação entre IAs, onde os tokens foram e teto diário.
import { esc } from './views.js';

const n = v => Number(v || 0).toLocaleString('pt-BR');
const KIND = { model: 'modelo mais leve', effort: 'menos esforço', provider: 'outra IA', info: 'dica' };

export function orchestrationCardHtml(ctx) {
  const o = ctx.orchestration; if (!o) return '';
  const pol = o.policy || { goal: 'balanced', careful: false, conserve: [], rules: [] };
  const hr = o.headroom || {}, goals = o.goals || [], playbooks = o.playbooks || [];
  const agents = ctx.state?.agents || [], projects = ctx.state?.projects || [];
  const canCompare = projects.length > 0 && agents.length >= 2;
  return `<section class="card orch-card" id="orchestration-card" style="margin-bottom:14px">
    <div class="card-h">
      <div><h2>Orquestração inteligente e economia</h2><small class="muted">Planejar e revisar com a IA mais forte; delegar execuções enxutas para poupar cota</small></div>
      <span class="pill info">${esc(goals.find(g => g.id === pol.goal)?.label || 'Equilibrado')}</span>
    </div>
    <div class="orch-goals" role="group" aria-label="Perfil de orquestração">
      ${goals.map(g => `<button type="button" class="orch-goal${pol.goal === g.id ? ' on' : ''}" data-act="orch-goal" data-id="${esc(g.id)}" aria-pressed="${pol.goal === g.id}"><b>${esc(g.label)}</b><small>${esc(g.desc)}</small></button>`).join('')}
    </div>
    <div class="orch-bar">
      <label class="check small"><input type="checkbox" data-act="orch-careful" ${pol.careful ? 'checked' : ''}> <span><b>Modo cuidadoso:</b> ler antes de escrever e isolar edições em worktree sempre que possível</span></label>
      <label class="check small"><input type="checkbox" data-act="orch-fallback" ${pol.autoFallback !== false ? 'checked' : ''}> <span><b>Auto-fallback de cota:</b> continuar em outra IA conectada se uma conta atingir o limite</span></label>
      <span class="small muted">Rota sugerida agora: planejar/revisar <b>${esc(hr.bestLead || '—')}</b> · executar <b>${esc(hr.bestExec || '—')}</b></span>
    </div>
    <details class="orch-details"><summary class="small"><b>Playbooks prontos por área</b> (${playbooks.length})</summary>
      <div class="orch-playbooks">${playbooks.map(pb => `<div class="orch-pb"><div><b>${esc(pb.name)}</b><ol class="small muted">${pb.phases.map(p => `<li>${esc(p.replace(/^\d+\.\s*/, ''))}</li>`).join('')}</ol></div><button type="button" class="btn outline sm" data-act="orch-playbook" data-id="${esc(pb.id)}">Usar com o Assistente</button></div>`).join('')}</div>
    </details>
    ${canCompare ? `<details class="orch-details"><summary class="small"><b>Comparar IAs lado a lado</b> (mesmo pedido em 2 ou 3 agentes)</summary>
      <form id="compare-form" class="rt-form" style="margin-top:8px">
        <label class="f small">Projeto<select name="projectId" required>${projects.map(p => `<option value="${esc(p.id)}" ${p.id === ctx.project ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <div class="f small"><span>Marque 2 ou 3 agentes (quem edita roda isolado em worktree)</span><div class="chips" style="margin-top:4px">${agents.map(a => `<label class="check chip"><input type="checkbox" name="cmpAgent" value="${esc(a.id)}"> ${esc(a.name)} <small class="muted">(${esc(a.provider)})</small></label>`).join('')}</div></div>
        <label class="f small">Pedido para comparar<textarea name="objective" rows="2" maxlength="3000" required placeholder="Ex.: Proponha a arquitetura e a landing page deste produto…"></textarea></label>
        <button class="btn sm">Comparar agentes</button>
      </form>
    </details>` : ''}
  </section>`;
}

export function economyCardHtml(ctx) {
  const e = ctx.economy; if (!e) return '';
  const r = e.report, b = e.budget, max = Math.max(1, ...r.agents.map(a => a.tokens)), dmax = Math.max(1, ...r.perDay.map(d => d.tokens));
  const rows = r.agents.length ? `<ul class="plain eco-rows">${r.agents.map(a => `<li><div class="eco-line"><b>${esc(a.name)}</b> <small class="muted">${esc(a.provider)}${a.model ? ' · ' + esc(a.model) : ''} · ${a.runs} execuç${a.runs === 1 ? 'ão' : 'ões'} · média ${n(a.avgInput)} de entrada e ${n(a.avgOutput)} de saída</small><span class="eco-n">${n(a.tokens)}</span></div><div class="api-bar" role="img" aria-label="${Math.round(a.tokens / max * 100)}% do maior consumo"><span style="width:${Math.max(2, Math.round(a.tokens / max * 100))}%"></span></div></li>`).join('')}</ul>` : '<p class="muted small">Ainda não há tarefas com consumo informado no período. Quando o Claude ou o Codex informarem os tokens, eles aparecem aqui.</p>';
  const days = r.perDay.length ? `<div class="eco-days" role="img" aria-label="Tokens por dia">${r.perDay.map(d => `<span title="${esc(d.day)}: ${n(d.tokens)} tokens"><i style="height:${Math.max(4, Math.round(d.tokens / dmax * 100))}%"></i><small>${esc(d.day.slice(8))}</small></span>`).join('')}</div>` : '';
  const sug = e.suggestions.length ? `<ul class="plain eco-sug">${e.suggestions.map(s => `<li><label class="check">${s.patch ? `<input type="checkbox" class="eco-pick" value="${esc(s.id)}" ${s.risky ? '' : 'checked'}>` : ''} <span class="pill ${s.risky ? 'warn' : s.patch ? 'ok' : 'off'}">${esc(KIND[s.kind] || s.kind)}</span> ${esc(s.text)}${s.patch ? ` <small class="muted">→ ${Object.entries(s.patch).map(([k, v]) => `${esc(k === 'model' ? 'modelo' : k === 'effort' ? 'esforço' : 'IA')}: ${esc(v || 'padrão')}`).join(', ')}</small>` : ''}</label></li>`).join('')}</ul>
    <div class="btn-row">${e.suggestions.some(s => s.patch) ? '<button type="button" class="btn sm" data-act="eco-apply">Aplicar as marcadas</button>' : ''}${e.canUndo ? '<button type="button" class="btn ghost sm" data-act="eco-undo">Desfazer a última aplicação</button>' : ''}</div>
    <p class="muted small">Nada muda sozinho. Sugestões “outra IA” vêm desmarcadas porque podem mudar a qualidade: teste nas primeiras tarefas.</p>` : `<p class="muted small">Sem sugestões agora: nenhum agente simples usando modelo caro ou esforço alto sem necessidade.${e.canUndo ? '' : ''}</p>${e.canUndo ? '<div class="btn-row"><button type="button" class="btn ghost sm" data-act="eco-undo">Desfazer a última aplicação</button></div>' : ''}`;
  const pct = b.limit ? Math.min(100, Math.round(b.used / b.limit * 100)) : null;
  const bud = `<form id="token-budget-form" class="form-grid"><label class="f">Teto diário de tokens (entrada + saída)<input name="limit" type="number" min="10000" step="1000" value="${esc(b.limit ?? '')}" placeholder="sem teto"></label><label class="f check" style="align-self:end"><input type="checkbox" name="enabled" ${b.enabled ? 'checked' : ''}> Não iniciar novas tarefas ao atingir o teto</label>
    <div style="grid-column:1/-1"><small class="muted">Hoje: <b>${n(b.used)}</b>${b.limit ? ` de ${n(b.limit)} (${pct}%)` : ''}. O teto vale para <b>iniciar</b> tarefas; a que já está rodando termina. Só conta o que a IA informou.</small>${pct != null ? `<div class="api-bar"><span style="width:${pct}%"></span></div>` : ''}${b.reached ? '<p class="upd-err" role="alert">Teto atingido: novas tarefas estão aguardando. Aumente o teto ou espere o dia virar.</p>' : b.warn ? '<p class="small" style="color:var(--warn,#d9a441)" role="status">Mais de 80% do teto de hoje.</p>' : ''}</div>
    <div class="btn-row" style="grid-column:1/-1"><button class="btn outline sm">Salvar teto</button></div></form>`;
  return `<section class="card" id="economy-card" style="margin-bottom:14px"><div class="card-h"><h2>Onde os tokens foram</h2><span class="pill info">${r.days} dias · ${n(r.total)} tokens</span></div>
    <p class="muted small">Entrada + saída informadas pelas IAs, por agente (cache não entra). Hoje: <b>${n(r.today)}</b>.</p>${days}${rows}
    ${r.projects.length ? `<p class="small muted">Por projeto: ${r.projects.map(p => `${esc(p.name)} ${n(p.tokens)}`).join(' · ')}</p>` : ''}
    <h3 style="margin:14px 0 6px">Sugestões para gastar menos</h3>${sug}<h3 style="margin:14px 0 6px">Teto diário</h3>${bud}</section>`;
}
