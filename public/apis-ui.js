// Biblioteca de APIs em Conexões: chaves guardadas só neste computador; a chave nunca volta para a tela (só os 4 últimos caracteres).
import { esc } from './views.js';

const num = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const usageHtml = u => {
  if (!u) return '';
  const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : null;
  return `<div class="api-usage"><small>${esc(u.label)}: <b>${num(u.used)}</b>${u.limit != null ? ` de ${num(u.limit)}` : ''}${u.remaining != null ? ` · restam <b>${num(u.remaining)}</b>` : ''}${u.resetAt ? ` · renova ${esc(new Date(u.resetAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}` : ''}</small>${pct != null ? `<div class="api-bar" role="img" aria-label="${pct}% usado"><span style="width:${pct}%"></span></div>` : ''}</div>`;
};

export function apisCardHtml(ctx) {
  const a = ctx.apis; if (!a) return '';
  const cat = a.catalog, edit = ctx.ui?.apiForm?.id ? a.keys.find(k => k.id === ctx.ui.apiForm.id) : null, svc = ctx.ui?.apiForm?.service || edit?.service || '';
  const rows = a.keys.length ? `<ul class="plain api-list">${a.keys.map(k => `<li><b>${esc(cat[k.service]?.name || k.service)}</b>${k.name && k.name !== cat[k.service]?.name ? ` · ${esc(k.name)}` : ''} <code>${esc(k.tail)}</code>${k.last ? ` <span class="pill ${k.last.ok ? 'ok' : 'bad'}">${k.last.ok ? 'funcionando' : 'com problema'}</span>` : ' <span class="pill off">não testada</span>'}
      <span class="soc-act"><button type="button" class="link" data-act="api-check" data-id="${esc(k.id)}">Testar e ver consumo</button><button type="button" class="link" data-act="api-edit" data-id="${esc(k.id)}">Trocar chave</button><button type="button" class="link" data-act="api-del" data-id="${esc(k.id)}">Remover</button></span>
      ${k.last ? `<br><small class="${k.last.ok ? 'muted' : 'upd-err'}" role="status">${esc(k.last.detail)}</small>${usageHtml(k.last.usage)}` : ''}${k.note ? `<br><small class="muted">${esc(k.note)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Nenhuma chave ainda. Guarde aqui as chaves das APIs que você usa.</p>';
  const form = `<form id="api-form" class="form-grid" autocomplete="off"><input type="hidden" name="id" value="${esc(edit?.id || '')}">
    <label class="f">Serviço<select id="api-service" name="service" ${edit ? 'disabled' : ''}><option value="">Escolha…</option>${Object.entries(cat).map(([k, v]) => `<option value="${esc(k)}" ${k === svc ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <label class="f">Apelido (opcional)<input name="name" maxlength="80" value="${esc(edit?.name || '')}" placeholder="Chave do canal de terror"></label>
    <label class="f" style="grid-column:1/-1">Chave ou token<input name="key" type="password" autocomplete="new-password" maxlength="500" spellcheck="false" ${svc ? '' : 'disabled'} placeholder="${edit ? 'deixe vazio para manter a atual' : 'cole aqui'}"></label>
    ${svc ? `<p class="muted small" style="grid-column:1/-1">Onde pegar: ${esc(cat[svc].where)}. ${esc(cat[svc].usageNote)}</p>` : ''}
    <label class="f" style="grid-column:1/-1">Anotação (opcional)<input name="note" maxlength="200" value="${esc(edit?.note || '')}" placeholder="Para que serve esta chave"></label>
    <div class="btn-row" style="grid-column:1/-1"><button class="btn" ${svc ? '' : 'disabled'}>${edit ? 'Salvar' : 'Guardar chave'}</button>${edit ? '<button type="button" class="btn ghost" data-act="api-edit" data-id="">Cancelar</button>' : ''}</div></form>`;
  return `<section class="card" style="margin-top:16px" id="apis-card"><div class="card-h"><h2>Biblioteca de APIs</h2><span class="pill ${a.keys.length ? 'ok' : 'off'}">${a.keys.length} chave${a.keys.length === 1 ? '' : 's'}</span></div>
    <p class="muted small">Todas as suas chaves num lugar só, guardadas apenas neste computador (a chave não volta para a tela). Use <b>Testar e ver consumo</b> para saber se a chave funciona e, nos serviços que informam, quanto ainda resta. Serviços que não informam saldo mostram onde conferir. Login por OAuth, sem colar chave, exige que você registre um aplicativo em cada serviço; por enquanto o Code Room usa tokens.</p>
    ${rows}<h3 style="margin:14px 0 6px">${edit ? 'Trocar chave' : 'Adicionar chave'}</h3>${form}</section>`;
}
