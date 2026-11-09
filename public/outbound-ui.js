// "O que o Code Room enviou": as últimas chamadas para fora (redes sociais e Biblioteca de APIs), com chaves mascaradas.
import { esc } from './views.js';

const when = at => { const d = new Date(at); return Number.isNaN(+d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); };

export function outboundCardHtml(ctx) {
  const o = ctx.outbound; if (!o) return '';
  const rows = o.length ? `<ul class="plain out-list">${o.slice(0, 20).map(e => `<li><span class="pill ${e.error || (e.status != null && e.status >= 400) ? 'bad' : 'ok'}">${e.error ? 'falhou' : esc(e.status ?? '—')}</span> <b>${esc(e.method)}</b> <code>${esc(e.host)}${esc(e.path)}</code> <small class="muted">${esc(e.label)} · ${esc(when(e.at))}</small>
      <details class="batch-new"><summary>Ver o que foi enviado</summary><p class="small muted">Cabeçalhos</p><pre class="out">${esc(Object.entries(e.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n') || '(nenhum)')}</pre><p class="small muted">Conteúdo</p><pre class="out">${esc(e.body || '(vazio)')}</pre>${e.error ? `<p class="upd-err">${esc(e.error)}</p>` : ''}</details></li>`).join('')}</ul>` : '<p class="muted small">Ainda não houve nenhum envio para fora. Quando você publicar uma postagem ou testar uma chave, o resumo aparece aqui.</p>';
  return `<section class="card" style="margin-top:16px" id="outbound-card"><div class="card-h"><h2>O que o Code Room enviou</h2>${o.length ? '<button type="button" class="link" data-act="outbound-clear">Limpar</button>' : ''}</div>
    <p class="muted small">Confira exatamente o que saiu do seu computador nas redes sociais e nos testes da Biblioteca de APIs. Senhas, tokens e chaves aparecem como <code>***</code>. A resposta do serviço não é guardada, só o código. Pedidos às IAs e o upload de vídeo do YouTube ainda não aparecem aqui; veja <b>docs/PRIVACIDADE.md</b>.</p>${rows}</section>`;
}
