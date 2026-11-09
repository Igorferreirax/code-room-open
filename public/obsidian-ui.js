// Cartão "Obsidian" em Conexões (opcional). Funções puras: recebem o estado de /api/obsidian e devolvem HTML.
// Só leitura por padrão. A escrita ("Permitir alimentar o Obsidian") é uma escolha explícita e só cria notas novas numa pasta de destino.
import { esc } from './views.js';

export function obsidianCardHtml(ctx) {
  const o = ctx.obsidian; if (!o) return '';
  const c = o.check, pv = ctx.obsPreview, projects = (ctx.state?.projects || []).filter(p => p.area !== 'Financeiro');
  const state = !o.enabled ? ['mute', 'Desligado'] : c?.ok ? ['ok', o.allowWrite ? 'Ligado · lê e alimenta' : 'Ligado · só lê'] : ['bad', 'Com problema'];
  const check = !c ? '' : c.ok ? `<p class="small" role="status" style="color:var(--ok)">✅ Cofre encontrado: ${esc(c.notes)}${c.truncated ? '+' : ''} notas.${c.sample?.length ? ` Mais recentes: ${c.sample.slice(0, 3).map(x => `<code>${esc(x)}</code>`).join(', ')}.` : ''}</p>` : `<p class="upd-err small" role="alert">${esc(c.error || 'Não foi possível ler o cofre.')}</p>`;
  const prev = !pv ? '' : pv === 'busy' ? '<p class="small muted" role="status">Procurando…</p>' : pv.error ? `<p class="upd-err small" role="alert">${esc(pv.error)}</p>`
    : pv.notes.length ? `<div class="obs-prev"><p class="small muted">Isto é o que um agente receberia neste projeto (${esc(pv.chars)} caracteres):</p><ul class="plain">${pv.notes.map(n => `<li><b>${esc(n.title)}</b> <small class="muted">${esc(n.rel)}</small><br><small>${esc(n.excerpt.slice(0, 220))}${n.excerpt.length > 220 ? '…' : ''}</small></li>`).join('')}</ul></div>`
      : '<p class="small muted">Nenhuma nota combinou com esse texto. Sem coincidência, o agente não recebe nada do Obsidian.</p>';
  return `<section class="card" style="margin-top:14px" id="obsidian-card"><div class="card-h"><h2>Obsidian (opcional)</h2><span class="pill ${state[0]}"><span class="dot d-${state[0] === 'ok' ? 'ok' : state[0] === 'bad' ? 'bad' : 'idle'}"></span>${esc(state[1])}</span></div>
    <p class="muted small">Vincule o seu cofre para os agentes consultarem as suas notas e você não precisar explicar tudo de novo. A cada tarefa, o Code Room escolhe as notas mais parecidas com o pedido e envia só um trecho curto delas à IA que você conectou. Projetos <b>Financeiro</b> nunca recebem notas. Pastas ignoradas ficam de fora.</p>
    <form id="obs-form" class="form-grid" autocomplete="off">
      <label class="f check" style="grid-column:1/-1"><input id="obs-enabled" type="checkbox" ${o.enabled ? 'checked' : ''}> Usar o meu cofre do Obsidian como referência</label>
      <label class="f" style="grid-column:1/-1">Pasta do cofre<input id="obs-vault" value="${esc(o.vault)}" placeholder="C:\\Users\\voce\\Documents\\Obsidian Vault" maxlength="500" spellcheck="false"></label>
      <label class="f" style="grid-column:1/-1">Pastas que nunca entram (nomes, separados por vírgula)<input id="obs-exclude" value="${esc((o.exclude || []).join(', '))}" maxlength="400" spellcheck="false"></label>
      <fieldset class="obs-mode" style="grid-column:1/-1"><legend class="small">O que o Code Room pode fazer no cofre</legend>
        <label class="check"><input type="radio" name="obs-mode" value="read" ${o.allowWrite ? '' : 'checked'}> <b>Só ler</b> <span class="muted small">(padrão: nunca grava nada no cofre)</span></label>
        <label class="check"><input type="radio" name="obs-mode" value="write" ${o.allowWrite ? 'checked' : ''}> <b>Permitir alimentar o Obsidian</b> <span class="muted small">(ao aprovar uma entrega, cria uma nota nova com o resumo; nunca edita nem apaga as suas notas)</span></label>
        <label class="f" style="margin-top:6px">Pasta de destino das notas novas (dentro do cofre)<input id="obs-wfolder" value="${esc(o.writeFolder || 'Code Room')}" maxlength="80" spellcheck="false"></label>
      </fieldset>
      ${projects.length ? `<details class="batch-new" style="grid-column:1/-1"><summary>Pasta do cofre por projeto (opcional)</summary><p class="small muted">Se um projeto tem uma pasta própria no cofre (ex.: <code>SOFTWARE/CODE-ROOM</code>), só ela é consultada para ele.</p><div class="obs-proj">${projects.map(p => `<label class="f small">${esc(p.name)}<input data-obs-proj="${esc(p.id)}" value="${esc(o.byProject?.[p.id] || '')}" placeholder="(o cofre inteiro)" maxlength="200" spellcheck="false"></label>`).join('')}</div></details>` : ''}
      <div class="btn-row" style="grid-column:1/-1"><button type="submit" class="btn">Salvar e verificar</button></div>
    </form>
    ${check}
    <div class="obs-test"><label class="f">Testar: o que um agente deste projeto receberia para o pedido…<input id="obs-q" placeholder="ex.: legenda do Reel do suporte de peito" maxlength="300" value="${esc(ctx.ui?.obsQ || '')}"></label><button type="button" class="btn ghost sm" data-act="obs-preview" ${o.vault ? '' : 'disabled'}>Testar busca</button></div>
    ${prev}</section>`;
}
