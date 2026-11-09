// "Levar para outras IAs": marque as IAs e o que copiar (skills e servidores MCP que você já tem no Claude Code).
import { esc } from './views.js';

export function syncCardHtml(ctx) {
  const s = ctx.sync; if (!s) return '';
  const ais = s.targets, one = (list, kind) => list.length ? `<div class="sync-list" role="group" aria-label="${kind === 'skill' ? 'Skills' : 'Servidores MCP'}">${list.map(x => {
    const have = ais.filter(a => x.in?.[a.id]).map(a => a.name);
    return `<label class="check sync-row"><input type="checkbox" class="sync-${kind}" value="${esc(x.name)}"> <b>${esc(x.name)}</b>${kind === 'mcp' ? ` <small class="muted">(${x.kind === 'http' ? 'remoto' : 'local'})</small>` : ''}${x.description ? ` <small class="muted">${esc(x.description)}</small>` : ''}${have.length ? ` <span class="pill ok">já em ${esc(have.join(', '))}</span>` : ''}</label>`; }).join('')}</div>` : '<p class="muted small">Nada encontrado.</p>';
  const res = ctx.syncResult ? `<div role="status" class="sync-res"><h3 style="margin:12px 0 6px">Resultado</h3><ul class="plain">${ctx.syncResult.map(r => `<li><span class="pill ${r.ok ? (r.skipped ? 'off' : 'ok') : 'bad'}">${r.ok ? (r.skipped ? 'já existia' : 'feito') : 'não foi'}</span> <b>${esc(r.item)}</b> em ${esc(r.ai)} <small class="muted">${esc(r.note || '')}</small></li>`).join('')}</ul></div>` : '';
  return `<section class="card" style="margin-top:16px" id="sync-card"><div class="card-h"><h2>Levar para outras IAs</h2></div>
    <p class="muted small">Instalou uma skill ou um MCP no Claude Code e quer que o Codex ou o Antigravity também tenham? Marque as IAs e o que copiar. O Code Room <b>nunca sobrescreve</b> o que já existe, faz backup antes de mexer em arquivo de configuração e não mostra chaves. Reinicie a IA de destino depois.</p>
    <div class="btn-row sync-ias">${ais.map(a => `<label class="check"><input type="checkbox" class="sync-ai" value="${esc(a.id)}" ${a.available ? '' : 'disabled'}> ${esc(a.name)}${a.available ? '' : ' <small class="muted">(não encontrada)</small>'}</label>`).join('')}</div>
    <details class="batch-new"><summary>Servidores MCP (${s.mcps.length})</summary>${one(s.mcps, 'mcp')}</details>
    <details class="batch-new"><summary>Skills (${s.skills.length})</summary>${one(s.skills, 'skill')}</details>
    <div class="btn-row" style="margin-top:10px"><button type="button" class="btn" data-act="sync-apply">Instalar nos marcados</button></div>${res}</section>`;
}
