// O que a pessoa está vendo agora, em uma frase curta para o Assistente entender "isto", "esta tela", "essa entrega".
// Só texto de leitura (sem caminhos fora do projeto, chaves ou conteúdo de arquivos). Até 600 caracteres.
import { deliveryList, deliveryTitle } from './views2.js';
import { pendingList } from './views.js';

const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export function screenContext(ctx, titles = {}) {
  const out = [`Tela: ${titles[ctx.view] || ctx.view || 'Sala'}`], st = ctx.state || {};
  const pj = (st.projects || []).find(p => p.id === ctx.project); if (pj) out.push(`Projeto: ${cut(pj.name, 60)}`);
  if (ctx.view === 'deliveries') {
    const items = deliveryList(ctx), sel = items.find(i => i.key === ctx.ui?.delSel) || items[0];
    if (sel) { const rv = sel.task.review; out.push(`Entrega aberta: “${cut(deliveryTitle(sel.task), 70)}” (arquivo ${cut(sel.file.path.split('/').pop(), 50)}), ${sel.task.status === 'completed' ? (rv ? (rv.status === 'approved' ? 'aprovada' : 'ajustes pedidos') : 'ainda não revisada') : sel.task.status}`); }
    out.push(`${new Set(items.filter(i => i.task.status === 'completed' && !i.task.review).map(i => i.task.id)).size} entrega(s) ainda sem revisão neste projeto`);
  } else if ((ctx.view === 'exec' || ctx.view === 'tasks') && ctx.detail?.id) {
    out.push(`Tarefa aberta: “${cut(deliveryTitle(ctx.detail), 70)}” (${ctx.detail.agent?.name || 'agente'}, ${ctx.detail.status})`);
  } else if (ctx.view === 'room') {
    const mode = ctx.roomMode?.(); out.push(`Sala: mostrando ${mode === '@projeto' ? 'só a equipe deste projeto' : mode ? 'o ambiente ' + cut(mode, 30) : 'todos os agentes'}${ctx.roomAgents ? ` (${ctx.roomAgents().length})` : ''}`);
  }
  const p = pendingList(ctx).slice(0, 3).map(x => cut(x.text, 80)); if (p.length) out.push(`Pendências que ele vê: ${p.join('; ')}`);
  return out.join(' · ').slice(0, 600);
}
