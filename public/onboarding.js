// Primeiro uso: (1) triagem para conectar as IAs e criar agentes iniciais; (2) tutorial guiado pelas telas, com opção de pular.
// Funções puras (recebem o contexto da interface e devolvem HTML ou dados): testáveis sem navegador.
import { esc } from './views.js';
import { COMMANDS } from './views2.js';

// ---------- Triagem: conectar as IAs ----------
export const PROVIDERS = ['codex', 'claude', 'agy'];

// Estado de uma IA a partir de /api/connectors/check: undefined = ainda verificando.
export function providerState(check) {
  if (!check) return 'checking';
  if (!check.installed) return 'missing';
  if (check.authenticated === false) return 'login';
  return 'ok';
}
const CHIP = { ok: ['ok', 'Conectado'], login: ['warn', 'Instalado: falta entrar'], missing: ['off', 'Não encontrado'], checking: ['info', 'Verificando…'] };

// Agentes iniciais sugeridos: um por IA conectada (sem repetir os que já existem). Códex edita arquivos; os demais só leem.
const STARTER = {
  codex: { name: 'Desenvolvedor', role: 'Escreve e altera o código', mode: 'write', capabilities: ['code'], team: 'desenvolvedor' },
  claude: { name: 'Revisor', role: 'Revisa e planeja', mode: 'read', capabilities: ['review'], team: 'revisor' },
  agy: { name: 'Pesquisador', role: 'Pesquisa e confere resultados', mode: 'read', capabilities: ['research'] },
};
export function starterPlan(ctx) {
  const checks = ctx.checks || [], have = ctx.state?.agents || [];
  const agents = PROVIDERS.filter(id => providerState(checks.find(c => c.id === id)) === 'ok')
    .filter(id => !have.some(a => a.provider === id && a.name === STARTER[id].name))
    .map(id => ({ provider: id, room: 'Programação', model: '', instructions: '', skillIds: [], ...STARTER[id] }));
  const connected = PROVIDERS.filter(id => providerState(checks.find(c => c.id === id)) === 'ok');
  const team = connected.includes('codex') && connected.includes('claude') && !(ctx.state?.teams || []).some(t => t.name === 'Equipe de Desenvolvimento');
  return { agents, team, connected };
}

function row(ctx, id) {
  const c = ctx.checks?.find(x => x.id === id), st = providerState(c), cmd = COMMANDS[id] || {}, [kind, label] = CHIP[st];
  let help = '';
  if (st === 'missing') help = `<p class="small muted">Instale com:</p><pre>${esc(cmd.install || '')}</pre>${/^npm /.test(cmd.install || '') ? `<button type="button" class="btn ghost sm" data-act="copy" data-id="${esc(cmd.install)}">Copiar comando</button>` : ''}`;
  if (st === 'login') help = `<p class="small muted">Entre na sua conta com:</p><pre>${esc(cmd.login || '')}</pre><button type="button" class="btn ghost sm" data-act="copy" data-id="${esc(cmd.login || '')}">Copiar comando</button>`;
  if (st === 'ok') help = `<p class="small muted">${c.version ? 'Versão ' + esc(String(c.version).slice(0, 40)) + '. ' : ''}Pronto para uso.</p>`;
  return `<li class="onb-row"><div class="onb-head"><b>${esc(cmd.name || id)}</b><span class="pill ${kind}">${label}</span></div><p class="small muted">${esc(cmd.desc || '')}</p>${help}</li>`;
}

export function setupHtml(ctx) {
  const o = ctx.ui.onb || {}, plan = starterPlan(ctx), ready = ctx.checks != null;
  const nothing = ready && plan.connected.length === 0;
  // Agentes iniciais são para instalação nova: quem já tem agentes não recebe a oferta.
  const create = (ctx.state?.agents || []).length === 0 && (plan.agents.length || plan.team)
    ? `<button type="button" class="btn" data-act="onb-create"${o.busy ? ' disabled' : ''}>${o.busy ? 'Criando…' : `Criar agentes iniciais (${plan.agents.length}${plan.team ? ' + equipe' : ''})`}</button>` : '';
  const pf = o.videoCheck;
  const videoCheck = pf ? `<section class="onb-note" aria-label="Verificação do ambiente de vídeo"><b>Ambiente de vídeo: ${pf.summary === 'ok' ? 'pronto' : pf.summary === 'falha' ? 'há itens para corrigir' : 'há avisos'}</b><ul class="onb-pf-list">${pf.items.map(i => `<li><span class="pill ${i.status === 'ok' ? 'ok' : i.status === 'falha' ? 'bad' : 'warn'}">${i.status === 'ok' ? 'OK' : i.status === 'falha' ? 'Verificar' : 'Aviso'}</span> <b>${esc(i.label)}</b>: ${esc(i.detail)}${i.fix ? ` <small>${esc(i.fix)}</small>` : ''}</li>`).join('')}</ul></section>` : '';
  return `<div class="onb-backdrop"><section class="onb-card" role="dialog" aria-modal="true" aria-labelledby="onb-title" tabindex="-1">
    <p class="onb-kicker">Boas-vindas</p><h2 id="onb-title">Olá${ctx.prefs?.displayName ? ', ' + esc(ctx.prefs.displayName) : ''}! Este é o seu Workspace</h2>
    <p class="muted">Como quer ser chamado? Esse nome fica salvo neste navegador e não é enviado aos agentes.</p><div class="onb-name"><label class="sr-only" for="workspace-name">Seu nome</label><input id="workspace-name" maxlength="40" autocomplete="nickname" placeholder="Seu nome" value="${esc(ctx.prefs?.displayName || '')}"><button type="button" class="btn sm" data-act="onb-name-save">Salvar nome</button></div>
    <h3>Vamos conectar as suas IAs</h3>
    <p class="muted">O Code Room usa os programas de IA que você já tem no computador. Ele não guarda senha nem chave: só confere se cada um está instalado e conectado.</p>
    <ul class="onb-list">${PROVIDERS.map(id => row(ctx, id)).join('')}</ul>
    ${nothing ? '<p class="onb-note">Nenhuma IA conectada ainda. Instale ou entre em pelo menos uma e clique em “Verificar de novo”. Você também pode pular e voltar depois pelo menu do usuário.</p>' : ''}
    <details class="onb-video"><summary>Vai trabalhar com vídeo? Verifique as ferramentas locais</summary><p class="small muted">A checagem só lê versões, disponibilidade e recursos do computador. Não instala programas nem mostra valores de chaves.</p><button type="button" class="btn ghost sm" data-act="onb-video-check"${o.videoBusy ? ' disabled' : ''}>${o.videoBusy ? 'Verificando…' : 'Verificar ambiente de vídeo'}</button>${videoCheck}</details>
    ${o.msg ? `<p class="onb-note ok" role="status">${esc(o.msg)}</p>` : ''}
    <div class="btn-row onb-actions"><button type="button" class="btn ghost" data-act="onb-recheck">Verificar de novo</button>${create}<span class="grow"></span><button type="button" class="btn ghost" data-act="onb-skip">Pular</button><button type="button" class="btn${create ? ' ghost' : ''}" data-act="onb-tour">Ver o tutorial →</button></div>
  </section></div>`;
}

// ---------- Tutorial guiado ----------
// view = tela aberta; target = elemento destacado (botão da barra lateral). Todos os textos descrevem recursos que existem.
export const TOUR = [
  { view: 'room', target: '[data-nav=room]', title: 'A Sala', text: 'Aqui moram os seus agentes. Cada um tem nome, função e estado em tempo real. Alterne entre Cenário, Lista e Canvas: no Canvas, arraste de um agente a outro para o trabalho de um virar a tarefa do próximo.' },
  { view: 'projects', target: '[data-nav=projects]', title: 'Projetos', text: 'Um projeto é uma pasta do seu computador. Cadastre a pasta e os agentes trabalham ali, sem se misturar com os outros projetos.' },
  { view: 'tasks', target: '[data-nav=tasks]', title: 'Tarefas', text: 'Dê missões pelo chat (o balão no canto direito): converse com o Assistente ou escolha uma equipe ou um agente, e use @agente e /skill. Nesta tela você acompanha cada tarefa e o que ela produziu.' },
  { view: 'teams', target: '[data-nav=teams]', title: 'Equipes', text: 'Junte agentes em fluxos, como desenvolvedor → revisor. Um supervisor pode propor o plano, e o próprio sistema valida antes de executar.' },
  { view: 'recipes', target: '[data-nav=recipes]', title: 'Receitas', text: 'Modelos prontos para começar, como “App novo: desenvolver, revisar e testar” e fluxos de vídeo com prévia para você aprovar.' },
  { view: 'agents', target: '[data-nav=agents]', title: 'Agentes e ferramentas', text: 'Crie e ajuste agentes: nome, função, a IA por trás (Codex, Claude Code ou Gemini), o modelo, a permissão (somente leitura ou edita arquivos) e as skills.' },
  { view: 'deliveries', target: '[data-nav=deliveries]', title: 'Entregas', text: 'O que os agentes produzem espera aqui. Você aprova, pede ajuste ou reprova. Nada é publicado sozinho.' },
  { view: 'skills', target: '[data-nav=skills]', title: 'Skills', text: 'Instruções reutilizáveis que os agentes podem usar. Qualquer skill instalada vale para qualquer agente.' },
  { view: 'usage', target: '[data-nav=usage]', title: 'Consumo e limites', text: 'Veja quanto cada agente consumiu. O que o provedor não informa aparece como “indisponível”, nunca como zero ou número inventado.' },
  { view: 'routines', target: '[data-nav=routines]', title: 'Rotinas', text: 'Programe tarefas por horário, manualmente ou quando um arquivo aparece. É aqui também que ficam os lotes de produção.' },
  { view: 'connections', target: '[data-nav=connections]', title: 'Conexões', text: 'Confira quais IAs estão instaladas e conectadas e veja como instalar, entrar ou atualizar cada uma. Você pode refazer a triagem quando quiser.' },
  { view: 'settings', target: '[data-nav=settings]', title: 'Configurações', text: 'Temas, movimento e limites. O Acesso remoto (para usar pelo celular) vem desligado e só liga quando você quiser. Para rever este guia: menu do usuário › Guia de boas-vindas.' },
];

export function tourHtml(ctx) {
  const o = ctx.ui.onb || {}, i = Math.min(Math.max(o.step || 0, 0), TOUR.length - 1), s = TOUR[i], last = i === TOUR.length - 1;
  const dots = TOUR.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('');
  return `<section class="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title" tabindex="-1">
    <p class="onb-kicker">Passo ${i + 1} de ${TOUR.length}</p><h2 id="tour-title">${esc(s.title)}</h2><p>${esc(s.text)}</p>
    <div class="tour-dots" aria-hidden="true">${dots}</div>
    <div class="btn-row"><button type="button" class="btn ghost sm" data-act="onb-skip">Pular tutorial</button><span class="grow"></span>${i > 0 ? '<button type="button" class="btn ghost sm" data-act="onb-back">Voltar</button>' : ''}<button type="button" class="btn sm" data-act="onb-next">${last ? 'Concluir' : 'Próximo'}</button></div>
  </section>`;
}

export const onboardingHtml = ctx => ctx.ui?.onb?.mode === 'setup' ? setupHtml(ctx) : ctx.ui?.onb?.mode === 'tour' ? tourHtml(ctx) : '';

// Destaca o botão do passo atual (a barra é redesenhada a cada render, então isto roda no fim de cada render).
export function applyTourHighlight(doc, ctx) {
  doc.querySelectorAll('.tour-hl').forEach(e => e.classList.remove('tour-hl'));
  const o = ctx.ui?.onb; if (o?.mode !== 'tour') return;
  const el = doc.querySelector(TOUR[Math.min(Math.max(o.step || 0, 0), TOUR.length - 1)].target);
  if (el) el.classList.add('tour-hl');
}
