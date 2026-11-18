// Aprovação durante a execução: quando a IA quer usar algo fora do que já está liberado (abrir um programa,
// rodar um comando, mexer fora da pasta), ela PERGUNTA e espera. O pedido aparece no Code Room com
// "Permitir" / "Negar", como no terminal. Sem resposta em 10 minutos, vale "Negar".
//
// Quem pergunta é a ferramenta permission-mcp.mjs (ligada ao Claude por --permission-prompt-tool).
// Ela fala com este servidor por 127.0.0.1 com uma chave própria, gerada a cada início do Code Room,
// que só serve para pedir e consultar aprovações (não abre o resto da API).
import { randomUUID, randomBytes } from 'node:crypto';

const WAIT_MS = 10 * 60 * 1000, KEEP_DONE_MS = 5 * 60 * 1000, MAX_PENDING = 30;
const short = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Descrição em português do que a IA quer fazer (o que aparece no cartão).
export function describe(tool, input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  if (/^(Bash|PowerShell)$/.test(tool)) return { title: 'Rodar um comando', detail: short(i.command || '', 600), kind: 'comando' };
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return { title: 'Alterar um arquivo', detail: short(i.file_path || i.notebook_path || '', 400), kind: 'arquivo' };
  if (tool === 'Read') return { title: 'Ler um arquivo', detail: short(i.file_path || '', 400), kind: 'leitura' };
  if (/^(WebFetch|WebSearch)$/.test(tool)) return { title: 'Acessar a internet', detail: short(i.url || i.query || '', 400), kind: 'web' };
  if (tool.startsWith('mcp__')) return { title: `Usar a ferramenta ${short(tool.replace(/^mcp__/, '').replace(/__/g, ' › '), 80)}`, detail: short(JSON.stringify(i), 400), kind: 'mcp' };
  return { title: `Usar ${short(tool, 60)}`, detail: short(JSON.stringify(i), 400), kind: 'outro' };
}

// "Permitir sempre neste pedido": mesmo programa (1ª palavra do comando) ou mesma ferramenta, na mesma tarefa.
export const ruleKey = (tool, input = {}) => /^(Bash|PowerShell)$/.test(tool) ? `${tool}:${String(input?.command || '').trim().split(/\s+/)[0].toLowerCase()}` : tool;

export class Approvals {
  constructor({ now = () => Date.now(), onChange = () => {} } = {}) {
    this.now = now; this.onChange = onChange; this.token = randomBytes(24).toString('hex'); this.port = 4780;
    this.items = new Map(); this.always = new Map(); this.log = [];   // always: taskId -> Set(ruleKey); log: o que o modo irrestrito liberou sozinho
    this.taskInfo = () => null;                          // (taskId) -> { agent, project } para o cartão
  }
  okToken(v) { return typeof v === 'string' && v.length === this.token.length && v === this.token; }
  #sweep() {
    const t = this.now();
    for (const [id, a] of this.items) {
      if (a.status === 'pending' && t - a.at > WAIT_MS) { a.status = 'deny'; a.message = 'Ninguém respondeu em 10 minutos.'; a.doneAt = t; this.onChange(); }
      else if (a.status !== 'pending' && t - (a.doneAt || a.at) > KEEP_DONE_MS) this.items.delete(id);
    }
  }
  ask({ taskId = '', tool = '', input = {} } = {}) {
    this.#sweep(); tool = String(tool || '').slice(0, 120);
    if (!tool) throw Object.assign(new Error('Falta a ferramenta.'), { status: 400 });
    if (taskId && this.always.get(taskId)?.has(ruleKey(tool, input))) return { id: null, status: 'allow', auto: true };
    if ([...this.items.values()].filter(a => a.status === 'pending').length >= MAX_PENDING) return { id: null, status: 'deny', message: 'Muitos pedidos esperando resposta.' };
    const info = (taskId && this.taskInfo(taskId)) || {};
    // Agente em modo irrestrito: libera na hora, mas fica registrado (a pessoa vê o que foi feito sem perguntar).
    if (info.unrestricted) { const d = describe(tool, input); this.log.push({ taskId: String(taskId), agent: info.agent || '', title: d.title, detail: d.detail, at: new Date(this.now()).toISOString() }); this.log = this.log.slice(-100); return { id: null, status: 'allow', auto: true }; }
    const a = { id: randomUUID(), taskId: String(taskId || ''), tool, input, ...describe(tool, input), agent: info.agent || '', project: info.project || '', assistant: !!info.assistant, at: this.now(), status: 'pending', message: '' };
    this.items.set(a.id, a); this.onChange(); return { id: a.id, status: 'pending' };
  }
  get(id) { this.#sweep(); const a = this.items.get(String(id)); return a ? { id: a.id, status: a.status, message: a.message } : { id, status: 'deny', message: 'Pedido não encontrado (o Code Room reiniciou?).' }; }
  decide(id, { allow = false, always = false } = {}) {
    const a = this.items.get(String(id)); if (!a) throw Object.assign(new Error('Esse pedido já expirou.'), { status: 404 });
    if (a.status !== 'pending') return this.view(a);
    a.status = allow ? 'allow' : 'deny'; a.message = allow ? '' : 'A pessoa negou.'; a.doneAt = this.now();
    if (allow && always && a.taskId) { const set = this.always.get(a.taskId) || new Set(); set.add(ruleKey(a.tool, a.input)); this.always.set(a.taskId, set); }
    this.onChange(); return this.view(a);
  }
  // Tarefa acabou: o que ela deixou pendente cai (a IA já não espera) e as regras "sempre" somem.
  endTask(taskId) { let changed = false; for (const a of this.items.values()) if (a.taskId === taskId && a.status === 'pending') { a.status = 'deny'; a.message = 'A tarefa terminou.'; a.doneAt = this.now(); changed = true; } this.always.delete(taskId); if (changed) this.onChange(); }
  view(a) { return { id: a.id, taskId: a.taskId, title: a.title, detail: a.detail, kind: a.kind, tool: a.tool, agent: a.agent, project: a.project, assistant: a.assistant, at: new Date(a.at).toISOString(), status: a.status }; }
  pending() { this.#sweep(); return [...this.items.values()].filter(a => a.status === 'pending').map(a => this.view(a)); }
}

export const approvals = new Approvals();
