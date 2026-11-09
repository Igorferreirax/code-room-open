// Histórico de ações: quem fez o quê, em qual projeto e quando. Função pura: recebe a lista de /api/audit e devolve HTML.
import { esc } from './views.js';

const hm = at => { const d = new Date(at); return Number.isNaN(+d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const KIND = { aprovou: 'ok', liberou: 'warn', commitou: 'ok', salvou: 'ok', pediu: 'info', cancelou: 'bad', repetiu: 'warn', iniciou: 'info', aceitou: 'ok', mudou: 'mute' };

export function auditHtml(ctx) {
  const a = ctx.audit, head = '<h2 style="font-size:1.5rem">Histórico de ações</h2><p class="muted">O que foi iniciado, aprovado, ajustado ou cancelado, por onde e quando. Guarda as últimas 300 ações; não registra o conteúdo dos arquivos.</p>';
  if (!a) return `${head}<p class="muted">Carregando…</p>`;
  if (!a.entries.length) return `${head}<p class="muted">Nenhuma ação registrada ainda. As próximas aparecem aqui.</p>`;
  return `${head}<div class="tbl"><ul class="plain audit-list">${a.entries.map(e => `<li><span class="pill ${KIND[String(e.what).split(' ')[0]] || 'mute'}">${esc(String(e.what).split(' ')[0])}</span> <b>${esc(e.who)}</b> ${esc(e.what)}${e.title ? ` <span class="muted">“${esc(e.title)}”</span>` : ''}<br><small class="muted">${esc(hm(e.at))}${e.project ? ` · ${esc(e.project)}` : ''}${e.agent ? ` · ${esc(e.agent)}` : ''}${e.via ? ` · pelo ${esc(e.via)}` : ''}${e.detail ? ` · ${esc(e.detail)}` : ''}</small></li>`).join('')}</ul></div>`;
}
