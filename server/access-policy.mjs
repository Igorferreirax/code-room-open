// Quem pode o quê no Code Room. Três situações:
//  1. No computador: chave principal pedindo de 127.0.0.1 (o painel aberto nesta máquina, a bandeja, o Nico de mesa).
//  2. Chave principal de fora (Tailscale ou rede local liberada): tudo, MENOS o que executa coisas no computador.
//  3. Aparelho pareado (celular): só leitura do essencial e decisões do dia a dia (rotas com masterOnly ficam de fora).
// Regra nova sensível entra aqui primeiro, com teste em test/access-policy.test.mjs.

// Operações que só valem no próprio computador: abrem programas, digitam no terminal, ouvem o teclado/microfone do
// Windows, mudam a rede, instalam atualizações ou pareiam aparelhos.
const LOCAL_ONLY = [
  { re: /^\/api\/term(\/|$)/, all: true, why: 'terminais' },            // abrir, digitar, ler a saída e fechar terminais
  { re: /^\/api\/terminal$/, all: true, why: 'terminal do Windows' },
  { re: /^\/api\/open$/, all: true, why: 'abrir arquivos e programas' },
  { re: /^\/api\/voice\/(native|global)$/, all: true, why: 'voz global do Windows' },
  { re: /^\/api\/voice-hotkey$/, all: true, why: 'atalho de voz' },
  { re: /^\/api\/network(\/|$)/, all: false, why: 'configuração de rede' },
  { re: /^\/api\/updates\/(download|install|settings)$/, all: false, why: 'instalar atualizações' },
  { re: /^\/api\/devices(\/|$)/, all: false, why: 'parear aparelhos' },
];
export function localOnlyReason(method, path) {
  const r = LOCAL_ONLY.find(x => x.re.test(path) && (x.all || method !== 'GET'));
  return r ? r.why : '';
}
export const LOCAL_ONLY_RULES = LOCAL_ONLY.map(x => ({ path: x.re.source, metodos: x.all ? 'todos' : 'só alterações', motivo: x.why }));

// Ações do Nico que o celular pode aprovar (lista do que É permitido: ação nova começa proibida no celular).
export const MOBILE_ACTIONS = new Set(['abrir_tela', 'iniciar_tarefa', 'cancelar_tarefa', 'repetir_tarefa', 'criar_agente', 'criar_equipe', 'vincular_agente', 'ligar_agentes', 'contratar_biblioteca', 'definir_skills', 'criar_rotina', 'gerenciar_rotina', 'guardar_nota', 'contexto_projeto', 'comparar_ias']);
export function mobileActionAllowed(act) {
  if (!act || !MOBILE_ACTIONS.has(act.type)) return false;
  if (act.payload?.unrestricted || act.payload?.irrestrito) return false;   // modo irrestrito só com clique no computador
  return true;
}

// O que o celular recebe do estado: só os campos que a tela do celular usa. Caminhos de pastas, instruções dos
// agentes, ferramentas liberadas e executáveis ficam no computador.
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o?.[k] !== undefined) r[k] = o[k]; return r; };
const PROJECT = ['id', 'name', 'area', 'createdAt', 'teamIds', 'agentIds', 'color', 'icon'];
const AGENT = ['id', 'name', 'role', 'room', 'provider', 'model', 'mode', 'look', 'createdAt', 'status', 'teamIds'];
const CONNECTOR = ['id', 'label', 'name', 'available', 'version', 'ok', 'status'];
export function deviceState(st) {
  return {
    ...st,
    previewOrigin: null,
    projects: (st.projects || []).map(p => pick(p, PROJECT)),
    agents: (st.agents || []).map(a => pick(a, AGENT)),
    connectors: (st.connectors || []).map(c => pick(c, CONNECTOR)),
    runs: (st.runs || []).map(t => ({ ...t, project: t.project ? pick(t.project, ['id', 'name', 'area']) : t.project })),
    folderJobs: [],
    channels: (st.channels || []).map(c => pick(c, ['id', 'name', 'network', 'kind', 'status'])),
  };
}
