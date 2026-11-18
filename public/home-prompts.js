// Modelos de pedido e construtor de lista da tela inicial (Início). Funções puras + seleção de campos [entre colchetes].
import { icon } from './icons.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const HOME_SHORTCUTS = [
  ['code', 'Desenvolver', 'code'],
  ['site', 'Criar site', 'globe'],
  ['video', 'Editar vídeo', 'film'],
  ['automation', 'Automação', 'refresh'],
  ['research', 'Pesquisar', 'search'],
  ['review', 'Revisar entrega', 'check-square'],
];

// Artefatos e padrões de qualidade clicáveis por domínio para já entrar com briefing completo:
export const QUALITY_PRESETS = {
  code: [
    'Validar sintaxe e rodar testes antes de concluir',
    'Zero dependências externas desnecessárias',
    'Tratar erros e casos de borda sem quebrar o que já funciona',
    'Entregar resumo objetivo dos arquivos alterados',
  ],
  site: [
    'Mobile-first impecável (390px sem barra lateral)',
    'CTA claro acima da dobra e textos naturais de conversão',
    'Meta tags de SEO, viewport e contraste acessível',
    'Entregar arquivo .html pronto para abrir ao vivo no Navegador Interno',
  ],
  video: [
    'Formato vertical 9:16 (1080×1920) para Reels/Shorts',
    'Gancho forte nos primeiros 3 segundos + CTA final',
    'Entregar Cue Sheet com minutagem, cenas e sugestões de [motion]',
    'Legendas dinâmicas curtas e sincronizadas à fala',
  ],
  automation: [
    'Execução idempotente (rodar duas vezes não duplica efeito)',
    'Modo seguro: nunca apagar originais sem backup/lixeira',
    'Registrar log claro do que foi processado e falhas',
  ],
  research: [
    'Separar fatos confirmados de estimativas',
    'Entregar tabela comparativa + plano de ação prático',
  ],
  review: [
    'Classificar achados em Crítico, Importante e Sugestão',
    'Conferir segurança, regressões e responsividade mobile',
  ],
};

export function buildHomePrompt(kind, { projectName = '', items = [] } = {}) {
  const scope = projectName ? ` no projeto “${projectName}”` : '';
  const templates = {
    code: `Quero desenvolver [funcionalidade, ajuste ou sistema]${scope}.\nObjetivo: [resultado esperado]\nCuidados: [não quebrar o que já funciona / manter o padrão atual]\nCritério de pronto: [testes passando e revisão concluída]`,
    site: `Quero criar ou evoluir um site / landing page para [produto, marca ou oferta]${scope}.\nPúblico e objetivo: [quem acessa e qual ação principal deve fazer]\nVisual e seções: [identidade, cores, hero, benefícios, prova social, FAQ e chamada final]\nRequisitos: responsivo no computador e no celular, rápido e sem texto genérico.`,
    video: `Quero produzir / editar um vídeo sobre [tema, produto ou história]${scope}.\nFormato: [Reel / Shorts / documentário / corte] · Duração: [ex.: 45s] · Tom: [direto e natural]\nEtapas desejadas: [gancho nos 3s iniciais, roteiro sincronizado, cenas/B-rolls, legendas dinâmicas e revisão da prévia]`,
    automation: `Quero criar uma automação para [tarefa recorrente ou lote de arquivos]${scope}.\nEntrada: [de onde vêm os dados ou arquivos] · Saída: [onde salvar ou avisar]\nQuando rodar: [manual / diário às HH:MM / pasta de entrada]\nSegurança: nunca apagar arquivos originais e parar se houver erro.`,
    research: `Pesquise sobre [tema, mercado, tendências ou dúvida técnica]${scope}.\nRecorte: [público, período ou comparação desejada]\nEntregue um resumo direto com fontes verificáveis e próximos passos.`,
    review: `Revise [a entrega mais recente / os arquivos alterados]${scope}.\nFoco da revisão: [bugs, segurança, visual mobile, regressões e clareza]\nAponte os problemas por prioridade antes de sugerir alterações.`,
  };
  const base = templates[kind] || templates.code;
  return syncListIntoPrompt(base, items);
}

const LIST_RE = /\n*\bItens:\n(?:- .*(?:\n|$))+$/;

// Atualiza ou remove o bloco "Itens:" no fim do pedido sem apagar o que a pessoa já editou acima.
export function syncListIntoPrompt(text, items = []) {
  const clean = (items || []).map(x => String(x ?? '').trim()).filter(Boolean);
  const body = String(text ?? '').replace(/\r\n/g, '\n').replace(LIST_RE, '').trimEnd();
  if (!clean.length) return body;
  const block = `Itens:\n${clean.map(x => `- ${x}`).join('\n')}`;
  return body ? `${body}\n\n${block}` : block;
}

export function parseListItems(raw, existing = [], maxItems = 30) {
  const parts = String(raw ?? '').split(/\r?\n/).map(s => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const out = [...(existing || [])];
  for (const p of parts) {
    const clipped = p.slice(0, 240);
    if (clipped && out.length < maxItems && !out.includes(clipped)) out.push(clipped);
  }
  return out;
}

// Seleciona o próximo trecho [entre colchetes] no textarea para a pessoa só digitar por cima.
export function findNextPlaceholder(text, afterIndex = 0) {
  const s = String(text ?? ''), re = /\[[^\[\]\n]{2,120}\]/g;
  let first = null, m;
  while ((m = re.exec(s))) {
    if (!first) first = [m.index, m.index + m[0].length];
    if (m.index >= afterIndex) return [m.index, m.index + m[0].length];
  }
  return first;
}

export function selectNextPlaceholder(ta, fromCurrent = false) {
  if (!ta) return false;
  const start = fromCurrent ? Math.max(0, (ta.selectionEnd ?? 0)) : 0;
  const hit = findNextPlaceholder(ta.value, start);
  ta.focus();
  if (!hit) { ta.setSelectionRange(ta.value.length, ta.value.length); return false; }
  ta.setSelectionRange(hit[0], hit[1]);
  return true;
}

export function homeListHtml(ctx) {
  const open = !!ctx.ui?.homeListOpen, items = ctx.ui?.homeList || [], tpl = ctx.ui?.homeTpl || '';
  if (!open && !tpl && !items.length) return '';
  const presets = QUALITY_PRESETS[tpl] || [];
  return `<div class="home-list-box" role="region" aria-label="Modelo e lista do pedido">
    <div class="home-list-head">
      <span class="small"><b>${open ? 'Itens & Padrão de Qualidade' : 'Modelo preenchido'}</b> <span class="muted">${open ? '— clique nos padrões ou adicione itens próprios' : '— troque só os campos entre [colchetes]'}</span></span>
      <div class="home-list-tools">
        ${tpl ? `<button type="button" class="btn ghost sm" data-act="home-next-slot">Próximo [campo]</button>` : ''}
        <button type="button" class="btn ghost sm" data-act="home-list-toggle" aria-expanded="${open}">${open ? 'Ocultar lista' : `${icon('plus', 14)} Adicionar em lista${items.length ? ` (${items.length})` : ''}`}</button>
      </div>
    </div>
    ${presets.length ? `<div class="home-presets" aria-label="Padrões rápidos de qualidade">${presets.map(p => {
      const active = items.includes(p);
      return `<button type="button" class="chip home-preset${active ? ' on' : ''}" data-act="home-preset-toggle" data-text="${esc(p)}" aria-pressed="${active}">${active ? '✓ ' : '+ '}${esc(p)}</button>`;
    }).join('')}</div>` : ''}
    ${open ? `<div class="home-list-entry">
      <label class="sr-only" for="home-list-input">Novo item da lista</label>
      <input id="home-list-input" type="text" maxlength="240" autocomplete="off" placeholder="Digite um item e aperte Enter (ou cole várias linhas)…">
      <button type="button" class="btn outline sm" data-act="home-list-add">${icon('plus', 16)} Adicionar</button>
    </div>` : ''}
    ${items.length ? `<ul class="home-list-items">${items.map((it, i) => `<li><span>${esc(it)}</span><button type="button" class="iconbtn sm" data-act="home-list-del" data-id="${i}" aria-label="Tirar item ${esc(it)}" title="Tirar item">${icon('x', 15)}</button></li>`).join('')}</ul>` : ''}
  </div>`;
}
