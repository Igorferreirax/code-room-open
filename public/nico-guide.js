// Nico guia: no primeiro acesso (ou depois de muitos dias sem abrir), o Nico aparece no meio da tela, pergunta o que a
// pessoa quer fazer e leva até lá: monta o espaço de trabalho, deixa o pedido pronto no chat e, se ela quiser, apresenta a
// ferramenta flutuando ao lado de cada parte. Nada roda sozinho: o pedido fica escrito e a pessoa decide enviar.
import { mascot } from './mascot.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const AWAY_DAYS = 7;

// Caminhos: o que o Nico diz, para onde leva e que pedido deixa pronto no chat.
export const PATHS = [
  { id: 'video', icon: 'film', label: 'Editar um vídeo', sub: 'Reels, cortes, legendas, HyperFrames', say: 'Boa! Vou abrir o espaço de vídeo: eu fico do lado direito e o navegador mostra a sua edição. Deixei um pedido pronto para montarmos a sua equipe de vídeo.', view: 'room', browser: true,
    ask: 'Quero editar vídeos aqui. Monte comigo o espaço de trabalho: escolha (ou crie) o projeto de vídeo, sugira uma equipe enxuta (roteiro, edição e revisão de mídia) com as IAs que tenho instaladas e me diga como acompanhar a edição no navegador interno.' },
  { id: 'code', icon: 'terminal', label: 'Programar um app ou site', sub: 'código, testes, terminal e prévia ao vivo', say: 'Fechado! Vou abrir o espaço de programação: terminal embaixo, prévia ao vivo e eu do lado. Deixei um pedido pronto para escolhermos o projeto e o especialista.', view: 'projects', terminal: true,
    ask: 'Quero programar um app. Me ajude a começar: escolha (ou crie) a pasta do projeto, indique o agente especialista certo com as IAs que tenho e, se fizer sentido, cadastre o comando de teste do projeto.' },
  { id: 'write', icon: 'file', label: 'Pesquisar e escrever', sub: 'roteiros, textos, estudos, relatórios', say: 'Ótimo! Vou te levar para as entregas: é lá que os textos aparecem prontos para ler. Deixei um pedido pronto no chat.', view: 'deliveries',
    ask: 'Quero pesquisar e escrever. Me ajude a configurar um agente de pesquisa e escrita no projeto em foco e me diga como pedir o primeiro texto.' },
  { id: 'auto', icon: 'calendar', label: 'Automatizar uma rotina', sub: 'tarefas por horário ou quando um arquivo chega', say: 'Vamos lá! As rotinas ficam em Automação. Deixei um pedido pronto para criarmos a primeira juntos.', view: 'routines',
    ask: 'Quero automatizar uma rotina. Me pergunte o que repetir e com que frequência e crie a rotina comigo.' },
];

// Tour com o Nico flutuando ao lado de cada parte (alvo = seletor do elemento; view = tela que abre antes).
export const GUIDE_TOUR = [
  { view: 'home', target: '[data-sec=ws]', title: 'Início', text: 'Aqui começa tudo. Diga o que precisa para mim no chat e eu monto, delego ou faço junto com você.' },
  { view: 'room', target: '#sec-tabs [data-nav=room]', title: 'Sala de agentes', text: 'Os seus agentes trabalhando ao vivo. No Canvas, ligue um agente ao outro para o trabalho passar adiante sozinho.' },
  { view: 'projects', target: '[data-sec=dev]', title: 'Desenvolvimento', text: 'Projetos são pastas do seu computador. Em Tarefas você vê cada passo dos agentes; em Entregas, os arquivos prontos.' },
  { view: 'agents', target: '[data-sec=team]', title: 'Equipe', text: 'Crie especialistas (Claude, Codex ou Gemini), junte em equipes e dê skills a eles. Para quase tudo, um especialista só já resolve.' },
  { view: 'recipes', target: '[data-sec=auto]', title: 'Automação', text: 'Receitas prontas e rotinas por horário ou quando um arquivo chega numa pasta.' },
  { view: 'connections', target: '[data-sec=sys]', title: 'Sistema', text: 'Conexões com as IAs, consumo e ajustes. O acesso pelo celular vem desligado até você ligar.' },
  { view: null, target: '[data-act=term-menu]', title: 'Terminal e navegador', text: 'Terminais dentro do app (dá para dividir lado a lado) e um navegador interno para ver o seu site ou o vídeo ao vivo.' },
  { view: null, target: '.chat-bubble, #chat', title: 'Eu fico aqui', text: 'Sempre que precisar, me chame no canto. Ctrl+K abre a paleta de comandos, e segurando Ctrl direito você fala comigo em qualquer programa.' },
];

// fresh = instalação nova (sem agentes nem projetos). Quem já configurou não vê a apresentação de novo, só a volta após muitos dias.
export function shouldGreet(flags = {}, now = Date.now(), fresh = true) {
  if (!flags.helloSeen && !flags.setupDone && fresh) return 'first';
  const last = Date.parse(flags.lastSeen || ''); if (Number.isFinite(last) && now - last > AWAY_DAYS * 864e5) return 'back';
  return '';
}

export function helloHtml(st, { name = '', icon = () => '' } = {}) {
  const greet = st.reason === 'back' ? `Que bom te ver de volta${name ? ', ' + esc(name) : ''}!` : `Olá${name ? ', ' + esc(name) : ''}! Eu sou o Nico.`;
  const picked = st.path ? PATHS.find(p => p.id === st.path) : null;
  const line = picked ? picked.say : 'O que vamos fazer hoje?';
  return `<div class="ng-stage${st.leaving ? ' leaving' : ''}" role="dialog" aria-modal="true" aria-labelledby="ng-title">
    <div class="ng-scrim"></div>
    <div class="ng-hello${picked ? ' picked' : ''}">
      <div class="ng-orb" aria-hidden="true">${mascot(picked ? 'surpreso' : 'feliz', 132)}<i class="ng-ring"></i></div>
      <div class="ng-talk">
        <p class="ng-kicker">${greet}</p>
        <h2 id="ng-title" class="ng-line">${esc(line)}</h2>
        ${picked ? `<div class="btn-row"><button type="button" class="btn" data-act="ng-go">Vamos lá</button></div>` : `<div class="ng-paths" role="list">${PATHS.map(p => `<button type="button" role="listitem" class="ng-path" data-act="ng-path" data-id="${p.id}"><span class="ng-ic">${icon(p.icon, 20)}</span><span><b>${esc(p.label)}</b><small>${esc(p.sub)}</small></span></button>`).join('')}</div>
        <div class="ng-foot"><button type="button" class="btn ghost sm" data-act="ng-tour">Me mostre a ferramenta</button><span class="grow"></span><button type="button" class="btn ghost sm" data-act="ng-skip">Pular</button></div>`}
      </div>
    </div>
  </div>`;
}

// Balão do tour: o Nico flutua ao lado do elemento destacado.
export function tourBubbleHtml(i) {
  const s = GUIDE_TOUR[i], last = i === GUIDE_TOUR.length - 1;
  return `<div class="ng-float" role="dialog" aria-labelledby="ng-tt"><div class="ng-float-orb" aria-hidden="true">${mascot('feliz', 64)}</div><div class="ng-bubble">
    <p class="ng-kicker">${i + 1} de ${GUIDE_TOUR.length}</p><h3 id="ng-tt">${esc(s.title)}</h3><p>${esc(s.text)}</p>
    <div class="btn-row"><button type="button" class="btn ghost sm" data-act="ng-skip">Encerrar</button><span class="grow"></span>${i > 0 ? '<button type="button" class="btn ghost sm" data-act="ng-back">Voltar</button>' : ''}<button type="button" class="btn sm" data-act="ng-next">${last ? 'Começar' : 'Próximo'}</button></div></div></div>`;
}

// Posição do Nico flutuante: ao lado do alvo, dentro da tela.
export function placeNear(rect, box, view) {
  const gap = 18, w = box.width, h = box.height;
  let x = rect.right + gap, y = rect.top + rect.height / 2 - h / 2;
  if (x + w > view.width - 12) x = rect.left - gap - w;
  if (x < 12) { x = Math.min(Math.max(12, rect.left + rect.width / 2 - w / 2), view.width - w - 12); y = rect.bottom + gap; if (y + h > view.height - 12) y = rect.top - gap - h; }
  return { x: Math.round(Math.max(12, x)), y: Math.round(Math.min(Math.max(12, y), view.height - h - 12)) };
}
