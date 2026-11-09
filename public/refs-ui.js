// Pastas de referência no painel do projeto: cópias SOMENTE LEITURA de pastas de fora, para os agentes poderem ler (ex.: outro repositório).
import { esc } from './views.js';

const mb = n => n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function referencesSectionHtml(ctx) {
  const r = ctx.refs, head = '<h3 style="margin-top:18px">Pastas de referência (somente leitura)</h3>';
  if (!r) return `${head}<p class="muted small">Carregando…</p>`;
  if (r.financeiro) return `${head}<p class="muted small">Projetos financeiros não usam pastas de referência, para os dados não se misturarem.</p>`;
  const list = r.dirs.length ? `<ul class="plain refs-list">${r.dirs.map(d => `<li><b>${esc(d.label)}</b> <code>${esc(d.path)}</code><br><small class="muted">${d.stats ? `${esc(d.stats.files)} arquivo(s) · ${mb(d.stats.bytes)}${d.stats.skipped?.segredo ? ` · ${esc(d.stats.skipped.segredo)} de fora (segredos, bancos, chaves)` : ''}${d.stats.skipped?.grande ? ` · ${esc(d.stats.skipped.grande)} grande(s) demais` : ''}${d.stats.skipped?.limite ? ` · ${esc(d.stats.skipped.limite)} acima do limite` : ''}` : 'não foi possível ler a pasta agora'}</small></li>`).join('')}</ul>` : '<p class="muted small">Nenhuma pasta de referência ainda.</p>';
  return `${head}<p class="muted small">Os agentes só enxergam a pasta do projeto. Aqui você libera outras pastas (ex.: o repositório de onde as ofertas vêm) como uma <b>cópia somente leitura</b> em <code>.referencias/</code>, refeita antes de cada tarefa. O original nunca é alterado e segredos (<code>.env</code>, chaves, bancos de dados, <code>node_modules</code>) ficam de fora.</p>${list}
    <form id="refs-form"><label class="f">Uma pasta por linha (opcional: <code>rótulo=caminho</code>)<textarea id="refs-dirs" rows="3" placeholder="gerou=C:\\Projetos\\GerouPromo" spellcheck="false">${esc(r.dirs.map(d => `${d.label}=${d.path}`).join('\n'))}</textarea></label><div class="btn-row"><button class="btn ghost sm">Salvar pastas de referência</button></div></form>`;
}
