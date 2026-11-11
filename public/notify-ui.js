// Avisos (Telegram e Gmail) e painel de métricas das redes. Só HTML: as ações ficam em app.js.
import { esc } from './views.js';
import { icon } from './icons.js';

const fmt = n => n == null ? 'indisponível' : Number(n).toLocaleString('pt-BR');
const signed = n => n == null ? '' : `${n >= 0 ? '+' : ''}${Number(n).toLocaleString('pt-BR')} em 7 dias`;
const when = at => { const d = new Date(at); return Number.isNaN(+d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

export function notifyCardHtml(ctx) {
  const n = ctx.notify; if (!n) return '<section class="card"><p class="muted">Carregando avisos…</p></section>';
  const tg = n.telegram, em = n.email, ok = t => `<span class="pill ok">${icon('check', 14)} ${t}</span>`;
  return `<section class="card" id="notify-card"><div class="card-h"><h2>Avisos no celular e no e-mail</h2></div>
  <p class="muted small">Quando uma rotina terminar, o resultado também chega aqui. Marque “Enviar o resultado por” em cada rotina. As chaves ficam só neste computador; projetos da área Financeiro nunca enviam nada para fora.</p>
  <div class="notify-grid">
    <div class="notify-box"><h3>${icon('send', 18)} Telegram ${tg.configured ? ok('conectado') : ''}</h3>
      ${tg.configured ? `<p class="small">Bot <b>@${esc(tg.bot || '')}</b> falando com <b>${esc(tg.chatName || 'a sua conversa')}</b>.</p>
        <div class="btn-row"><button type="button" class="btn sm" data-act="notify-test" data-id="telegram">${icon('send', 16)} Mandar teste</button><button type="button" class="btn ghost sm" data-act="notify-remove" data-id="telegram">Desconectar</button></div>`
      : `<ol class="small notify-steps"><li>No Telegram, abra o <b>@BotFather</b>, envie <code>/newbot</code> e copie o token.</li><li>Abra a conversa com o seu bot novo e envie <code>/start</code>.</li><li>Cole o token abaixo e clique em Conectar: o Code Room acha a conversa sozinho.</li></ol>
        <form id="notify-tg-form" class="rt-form"><label class="f">Token do bot<input name="botToken" type="password" autocomplete="off" required placeholder="123456:ABC…"></label><button class="btn sm">Conectar Telegram</button></form>`}
    </div>
    <div class="notify-box"><h3>${icon('mail', 18)} Gmail ${em.configured ? ok('conectado') : ''}</h3>
      ${em.configured ? `<p class="small">Envia de <b>${esc(em.user)}</b> para <b>${esc(em.to.join(', '))}</b>.</p>
        <div class="btn-row"><button type="button" class="btn sm" data-act="notify-test" data-id="email">${icon('send', 16)} Mandar teste</button><button type="button" class="btn ghost sm" data-act="notify-remove" data-id="email">Desconectar</button></div>`
      : `<ol class="small notify-steps"><li>Ligue a verificação em duas etapas na sua conta Google.</li><li>Gere uma <b>senha de app</b> em <code>myaccount.google.com/apppasswords</code> (16 letras).</li><li>Preencha abaixo. A senha da sua conta nunca é pedida.</li></ol>
        <form id="notify-email-form" class="rt-form"><label class="f">Seu Gmail<input name="user" type="email" required placeholder="voce@gmail.com"></label><label class="f">Senha de app<input name="pass" type="password" autocomplete="off" required placeholder="abcd efgh ijkl mnop"></label><label class="f">Enviar para (vazio = o próprio Gmail)<input name="to" placeholder="voce@gmail.com, outro@exemplo.com"></label><button class="btn sm">Conectar Gmail</button></form>`}
    </div>
  </div>
  <p class="muted small" style="margin-top:10px">Outlook e WhatsApp ficam para uma próxima versão: o Outlook exige login pela Microsoft, e o WhatsApp só é seguro pela API oficial da Meta.</p></section>`;
}

// Gráfico de linha simples em SVG (sem biblioteca), com a evolução das visualizações do canal.
function spark(points) {
  const v = points.map(p => p.views).filter(x => x != null); if (v.length < 2) return '<p class="muted small">A evolução aparece a partir do segundo dia de leitura.</p>';
  const min = Math.min(...v), max = Math.max(...v), w = 320, h = 70, span = max - min || 1;
  const xy = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 6 - (x - min) / span * (h - 12)).toFixed(1)}`).join(' ');
  return `<svg class="mt-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Visualizações do canal nos últimos ${v.length} dias, de ${fmt(min)} a ${fmt(max)}"><polyline points="${xy}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function metricsCardHtml(ctx) {
  const m = ctx.metrics; if (!m) return '<section class="card" id="metrics-card"><h2>Métricas</h2><p class="muted">Carregando…</p></section>';
  const yt = m.youtube || {}, posts = Object.entries(m.posts || {}), names = ctx.social?.catalog || {};
  const postsHtml = posts.length ? `<div class="chips">${posts.map(([net, c]) => `<span class="chip">${esc(names[net]?.name || net)}: <b>${c}</b></span>`).join('')}</div>` : '<p class="muted small">Nenhuma postagem publicada pelo Code Room nos últimos 30 dias.</p>';
  let body;
  if (!yt.connected) body = `<p class="muted small">Conecte o YouTube logo abaixo, em <b>YouTube e Google</b>, para ver inscritos, visualizações e o desempenho de cada vídeo aqui.</p>`;
  else if (!yt.channel) body = `<p class="upd-err small">${esc(yt.error || 'Não consegui ler o canal agora.')}</p>`;
  else {
    const c = yt.channel, top = [...(yt.videos || [])].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, 10);
    body = `<div class="mt-kpis"><div class="mt-kpi"><small>Inscritos</small><b>${fmt(c.subscribers)}</b><span class="muted small">${esc(signed(yt.week?.subscribers))}</span></div><div class="mt-kpi"><small>Visualizações do canal</small><b>${fmt(c.views)}</b><span class="muted small">${esc(signed(yt.week?.views))}</span></div><div class="mt-kpi"><small>Vídeos</small><b>${fmt(c.videos)}</b><span class="muted small">${esc(c.title)}</span></div></div>
    ${spark(yt.history || [])}
    ${top.length ? `<div class="tbl"><table><thead><tr><th>Vídeo</th><th>Publicado</th><th>Views</th><th>Curtidas</th><th>Comentários</th></tr></thead><tbody>${top.map(v => `<tr><td>${esc(v.title)}</td><td>${v.publishedAt ? new Date(v.publishedAt).toLocaleDateString('pt-BR') : ''}</td><td>${fmt(v.views)}</td><td>${fmt(v.likes)}</td><td>${fmt(v.comments)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${yt.error ? `<p class="small upd-err">${esc(yt.error)}</p>` : ''}`;
  }
  return `<section class="card" id="metrics-card"><div class="card-h"><h2>${icon('chart', 20)} Métricas</h2>${yt.connected ? `<button type="button" class="btn ghost sm" data-act="metrics-refresh">${icon('refresh', 16)} Atualizar</button>` : ''}</div>
  ${yt.fetchedAt ? `<p class="muted small">YouTube lido em ${esc(when(yt.fetchedAt))}. O Code Room lê no máximo a cada 30 minutos.</p>` : ''}${body}
  <h3 style="margin:14px 0 6px">Postagens publicadas pelo Code Room (30 dias)</h3>${postsHtml}
  <p class="muted small" style="margin-top:8px">Instagram e TikTok só liberam métricas para apps aprovados por eles; por isso aparecem aqui só as contagens das postagens.</p></section>`;
}
