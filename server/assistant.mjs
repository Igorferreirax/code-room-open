import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTask } from './tasks.mjs';
import { KNOWN_CAPABILITIES } from './supervisor.mjs';
import { ROLES } from './orchestrator.mjs';

// Assistente: a IA que a PESSOA conectou (Claude Code, Codex ou Gemini) vira o suporte dentro do Code Room.
// 1) Briefing: na primeira conexão a IA lê o manual (docs/ASSISTENTE.md), diz o que entendeu e isso é GRAVADO na máquina da pessoa.
// 2) Conversa: cada pergunta vira uma tarefa SOMENTE LEITURA que recebe o manual, o que a IA entendeu e um resumo do estado (sem caminhos nem chaves).
// 3) Ações: a IA só PROPÕE (bloco `code-room-action`); o Code Room valida e a pessoa aprova com um clique. A IA nunca altera a ferramenta.
export const ASSISTANT_PROJECT = 'assistant-internal', PROVIDER_ORDER = ['claude', 'codex', 'agy'];
const AREAS = ['Programação', 'Vídeo', 'Financeiro', 'Pesquisa', 'Operações', 'Geral'];
const VIEWS = { sala: 'room', projetos: 'projects', tarefas: 'tasks', equipes: 'teams', receitas: 'recipes', agentes: 'agents', entregas: 'deliveries', skills: 'skills', consumo: 'usage', rotinas: 'routines', conexoes: 'connections', configuracoes: 'settings' };
const MAX_MANUAL = 14000, MAX_HISTORY = 8, MAX_MSG_IN_PROMPT = 1200, MAX_MESSAGES = 40, MAX_QUESTION = 2000, MAX_PROMPT = 28000, MAX_ACTIONS = 10;
const noBom = s => String(s || '').replace(/^﻿/, '');
const short = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export const isInternal = x => !!x?.internal;

// ---------- manual ----------
export function loadManual(root) {
  const file = join(root, 'docs', 'ASSISTENTE.md'); let text = '';
  try { text = noBom(readFileSync(file, 'utf8')); } catch { return { text: '', hash: '', missing: true }; }
  return { text: text.slice(0, MAX_MANUAL), hash: createHash('sha256').update(text).digest('hex').slice(0, 16), missing: false };
}

// ---------- ações propostas pela IA ----------
// Extrai blocos ```code-room-action {json}``` do texto. Devolve o texto SEM os blocos e as ações cruas (no máximo 5, cada uma com até 4 KB).
export function parseActions(text) {
  const raws = [], re = /```code-room-action[^\n]*\n([\s\S]*?)```/g;
  const clean = String(text || '').replace(re, (_, body) => { if (raws.length < MAX_ACTIONS && body.length <= 4000) { try { const j = JSON.parse(noBom(body)); if (j && typeof j === 'object' && !Array.isArray(j)) raws.push(j); } catch {} } return ''; }).replace(/\n{3,}/g, '\n\n').trim();
  return { text: clean, actions: raws };
}

// Valida UMA ação contra o estado atual. Nunca confia no texto da IA: nomes viram ids reais, papéis e permissões são conferidos.
// world = { agents: [{id,name,provider,mode}], teams: [{name}], connected: Set(ids de IAs instaladas), skills: [{id,name,recognized,blocked}] }
export function normalizeAction(raw, world, planned = { agents: [], teams: [], projects: [], skills: [] }) {
  const lc = x => String(x ?? '').trim().toLowerCase(); planned = { agents: [], teams: [], projects: [], skills: [], ...planned };
  const find = name => { const n = lc(name), hit = world.agents.filter(a => a.name.trim().toLowerCase() === n); if (hit.length === 1) return { agent: hit[0] }; if (hit.length > 1) return { error: `Há mais de um agente chamado “${short(name, 60)}”. Use um nome único.` }; if (planned.agents.some(x => lc(x) === n)) return { agent: { id: null, name: short(name, 100), planned: true } }; return { error: `O agente “${short(name, 60)}” não existe.` }; };
  const findProject = name => { const n = lc(name), hit = (world.projects || []).filter(p => p.name.trim().toLowerCase() === n); if (hit.length === 1) return { project: hit[0] }; if (hit.length > 1) return { error: `Há mais de um projeto chamado “${short(name, 60)}”.` }; if (planned.projects.some(x => lc(x) === n)) return { project: { id: null, name: short(name, 100), planned: true } }; return { error: `O projeto “${short(name, 60)}” não existe.` }; };
  const findTeam = name => { const n = lc(name), hit = world.teams.filter(t => t.name.trim().toLowerCase() === n); if (hit.length === 1) return { team: hit[0] }; if (planned.teams.some(x => lc(x) === n)) return { team: { id: null, name: short(name, 100), planned: true } }; return { error: `A equipe “${short(name, 60)}” não existe.` }; };
  const bad = (type, error) => ({ type, summary: '', payload: null, valid: false, error });
  switch (raw.acao) {
    case 'criar_equipe': {
      const nome = short(raw.nome, 100); if (!nome) return bad('criar_equipe', 'A equipe precisa de um nome.');
      if (!Array.isArray(raw.membros) || !raw.membros.length || raw.membros.length > 12) return bad('criar_equipe', 'Uma equipe precisa de 1 a 12 membros.');
      if (world.teams.some(t => t.name.trim().toLowerCase() === nome.toLowerCase())) return bad('criar_equipe', `Já existe uma equipe chamada “${nome}”.`);
      const members = [], desc = [];
      for (const m of raw.membros) {
        if (!ROLES.includes(m?.papel)) return bad('criar_equipe', `Papel inválido: ${short(m?.papel, 30)}. Use ${ROLES.join(', ')}.`);
        const r = find(m.agente); if (r.error) return bad('criar_equipe', r.error);
        members.push({ role: m.papel, agentId: r.agent.id }); desc.push(`${m.papel} → ${r.agent.name}`);
      }
      return { type: 'criar_equipe', summary: `Criar a equipe “${nome}”: ${desc.join(', ')}`, payload: { name: nome, members }, valid: true };
    }
    case 'criar_agente': {
      const nome = short(raw.nome, 100), funcao = short(raw.funcao, 200); if (!nome || !funcao) return bad('criar_agente', 'O agente precisa de nome e função.');
      if (!['codex', 'claude', 'agy'].includes(raw.provedor)) return bad('criar_agente', 'Provedor inválido. Use codex, claude ou agy.');
      if (!world.connected.has(raw.provedor)) return bad('criar_agente', `A IA “${raw.provedor}” não está instalada neste computador.`);
      const mode = raw.permissao === 'write' ? 'write' : 'read'; if (raw.permissao && !['read', 'write'].includes(raw.permissao)) return bad('criar_agente', 'Permissão inválida. Use read ou write.');
      const caps = Array.isArray(raw.capacidades) ? [...new Set(raw.capacidades)] : []; if (caps.some(c => !KNOWN_CAPABILITIES.includes(c))) return bad('criar_agente', `Capacidades válidas: ${KNOWN_CAPABILITIES.join(', ')}.`);
      const room = raw.ambiente && AREAS.includes(raw.ambiente) ? raw.ambiente : 'Geral';
      if (world.agents.some(a => a.name.trim().toLowerCase() === nome.toLowerCase() && a.provider === raw.provedor)) return bad('criar_agente', `Já existe o agente “${nome}” nessa IA.`);
      return { type: 'criar_agente', summary: `Criar o agente “${nome}” (${funcao}) com ${raw.provedor}, ${mode === 'write' ? 'EDITA arquivos' : 'somente leitura'}`, payload: { name: nome, role: funcao, room, provider: raw.provedor, model: '', instructions: '', mode, skillIds: [], commands: [], capabilities: caps }, valid: true };
    }
    case 'definir_skills': {
      const r = find(raw.agente); if (r.error) return bad('definir_skills', r.error);
      const names = Array.isArray(raw.skills) ? [...new Set(raw.skills.map(s => String(s).trim()))].filter(Boolean) : [];
      if (!names.length || names.length > 8) return bad('definir_skills', 'Informe de 1 a 8 skills.');
      const ids = [], missing = [];
      for (const n of names) { const s = world.skills.find(x => x.name.toLowerCase() === n.toLowerCase()); if (s && s.recognized && !s.blocked) ids.push(s.id); else if (!s && planned.skills.some(x => lc(x) === n.toLowerCase())) ids.push(null); else missing.push(n); }
      if (missing.length) return bad('definir_skills', `Skills indisponíveis ou inexistentes: ${missing.slice(0, 4).join(', ')}.`);
      return { type: 'definir_skills', summary: `Definir as skills de “${r.agent.name}”: ${names.join(', ')} (substitui as atuais)`, payload: { agentId: r.agent.id, skillIds: ids }, valid: true };
    }
    case 'criar_projeto': {
      const nome = short(raw.nome, 60); if (!nome || /[\\/:*?"<>|]/.test(nome)) return bad('criar_projeto', 'O projeto precisa de um nome simples (sem barras, dois-pontos, asterisco, interrogação, aspas, < > ou |).');
      if ((world.projects || []).some(p => lc(p.name) === lc(nome)) || planned.projects.some(x => lc(x) === lc(nome))) return bad('criar_projeto', `Já existe um projeto chamado “${nome}”.`);
      const area = raw.ambiente && AREAS.includes(raw.ambiente) ? raw.ambiente : 'Geral';
      return { type: 'criar_projeto', summary: `Criar o projeto “${nome}” (ambiente ${area}) em uma pasta nova dentro de Documentos/CodeRoom/Projetos`, payload: { name: nome, area }, valid: true };
    }
    case 'iniciar_tarefa': {
      const objetivo = String(raw.objetivo ?? '').trim(); if (!objetivo || objetivo.length > 3000) return bad('iniciar_tarefa', 'Descreva o objetivo da tarefa (até 3000 caracteres).');
      const pr = findProject(raw.projeto); if (pr.error) return bad('iniciar_tarefa', pr.error);
      if (!!raw.equipe === !!raw.agente) return bad('iniciar_tarefa', 'Informe a equipe OU o agente que vai executar, não os dois.');
      let who, payload = { projectId: pr.project.id, objective: objetivo };
      if (raw.equipe) {
        const t = findTeam(raw.equipe); if (t.error) return bad('iniciar_tarefa', t.error);
        if (!t.team.planned && !(['desenvolvedor', 'revisor'].every(r => (t.team.members || []).some(m => m.role === r)))) return bad('iniciar_tarefa', 'Para iniciar por equipe, ela precisa de um desenvolvedor e um revisor. Use um agente avulso ou ajuste a equipe.');
        payload.teamId = t.team.id; who = `a equipe “${t.team.name}”`;
      } else { const a = find(raw.agente); if (a.error) return bad('iniciar_tarefa', a.error); payload.agentId = a.agent.id; who = `o agente “${a.agent.name}”`; }
      return { type: 'iniciar_tarefa', summary: `Iniciar uma tarefa com ${who} no projeto “${pr.project.name}”: ${short(objetivo, 160)}. Isso usa a cota da sua IA.`, payload, valid: true };
    }
    case 'ligar_agentes': {
      const pr = findProject(raw.projeto); if (pr.error) return bad('ligar_agentes', pr.error);
      const de = find(raw.de), para = find(raw.para); if (de.error) return bad('ligar_agentes', de.error); if (para.error) return bad('ligar_agentes', para.error);
      if (lc(raw.de) === lc(raw.para)) return bad('ligar_agentes', 'Um agente não pode se ligar a ele mesmo.');
      if (!pr.project.planned && !de.agent.planned && !para.agent.planned && (world.links || []).some(l => l.projectId === pr.project.id && l.from === de.agent.id && l.to === para.agent.id)) return bad('ligar_agentes', 'Essa ligação já existe.');
      const voltas = Math.min(6, Math.max(1, Math.trunc(Number(raw.voltas)) || 3));
      return { type: 'ligar_agentes', summary: `Ligar “${de.agent.name}” → “${para.agent.name}” no projeto “${pr.project.name}”: quando o primeiro terminar, o segundo recebe o trabalho (até ${voltas} voltas)`, payload: { projectId: pr.project.id, from: de.agent.id, to: para.agent.id, maxHops: voltas }, valid: true };
    }
    case 'criar_skill': {
      const nome = String(raw.nome ?? '').trim().toLowerCase(), desc = short(raw.descricao, 300), instr = String(raw.instrucoes ?? '').trim();
      if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(nome)) return bad('criar_skill', 'O nome da skill usa só letras minúsculas, números e hífen (2 a 49 caracteres).');
      if (desc.length < 10) return bad('criar_skill', 'Descreva, em uma frase, quando a skill deve ser usada (mínimo 10 caracteres).');
      if (instr.length < 20 || instr.length > 6000) return bad('criar_skill', 'As instruções da skill precisam ter de 20 a 6000 caracteres.');
      if (world.skills.some(k => lc(k.name) === nome) || planned.skills.some(x => lc(x) === nome)) return bad('criar_skill', `Já existe uma skill chamada “${nome}”.`);
      return { type: 'criar_skill', summary: `Criar a skill “${nome}”: ${desc}. Fica em uma pasta do Code Room (minhas-skills) e vale para qualquer agente.`, detail: instr, payload: { name: nome, description: desc, instructions: instr }, valid: true };
    }
    case 'abrir_tela': { const v = VIEWS[raw.tela]; return v ? { type: 'abrir_tela', summary: `Abrir a tela ${raw.tela}`, payload: { view: v }, valid: true } : bad('abrir_tela', 'Tela desconhecida.'); }
    default: return null;   // ação desconhecida é ignorada
  }
}

// ---------- prompts ----------
const fold = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function stateSummary(world, projects = [], question = '') {
  const ag = world.agents.map(a => `- ${a.name} (${short(a.role, 60)}) · ${a.provider} · ${a.mode === 'write' ? 'edita arquivos' : 'somente leitura'}`).join('\n') || '(nenhum agente ainda)';
  const tm = world.teams.map(t => `- ${t.name}: ${(t.members || []).map(m => `${m.role}=${world.agents.find(a => a.id === m.agentId)?.name || '?'}`).join(', ')}`).join('\n') || '(nenhuma equipe ainda)';
  const seen = new Set(), usable = world.skills.filter(s => s.recognized && !s.blocked && !seen.has(s.name) && seen.add(s.name));
  // As skills mais ligadas ao pedido vão com a descrição; o resto, só os nomes (para caber no prompt).
  const words = [...new Set(fold(question).split(/[^a-z0-9]+/).filter(w => w.length >= 4))];
  const scored = usable.map(s => ({ s, n: words.filter(w => fold(s.name + ' ' + (s.description || '')).includes(w)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 12);
  const top = scored.map(x => `- ${x.s.name}: ${short(x.s.description, 110)}`).join('\n'), rest = usable.filter(s => !scored.some(x => x.s === s)).map(s => s.name).slice(0, 60).join(', ');
  const sk = `${usable.length} no total.${top ? `\nMais ligadas ao pedido da pessoa:\n${top}` : '\nNenhuma parece ligada ao pedido atual (se for sobre skills, diga isso e ofereça criar uma com criar_skill ou importar uma pasta).'}\nOutras (só nomes): ${rest || '(nenhuma)'}`;
  const ln = (world.links || []).map(l => `${world.agents.find(a => a.id === l.from)?.name || '?'} → ${world.agents.find(a => a.id === l.to)?.name || '?'}`).slice(0, 20).join('; ') || '(nenhuma)';
  return `IAs instaladas: ${[...world.connected].join(', ') || 'nenhuma'}\nAgentes:\n${ag}\nEquipes:\n${tm}\nLigações entre agentes: ${ln}\nProjetos (só os nomes): ${projects.map(p => p.name).slice(0, 30).join('; ') || '(nenhum)'}\nSkills disponíveis: ${sk}`;
}
const RULES = `Você é o ASSISTENTE do Code Room, rodando DENTRO da ferramenta, usando a IA que a própria pessoa conectou. Regras absolutas: você está em SOMENTE LEITURA; NÃO execute comandos, NÃO escreva arquivos e NÃO altere o Code Room. Você só conversa e PROPÕE ações no formato do manual (bloco code-room-action), que a pessoa aprova com um clique. Nunca peça nem repita chaves, senhas ou tokens. Responda em português do Brasil, direto, e use apenas os nomes de agentes, equipes e skills do ESTADO ATUAL. Se não souber, diga que não sabe.`;
export function buildPrompt({ manual, knowledge, summary, history = [], question }) {
  const hist = history.slice(-MAX_HISTORY).map(m => `${m.role === 'user' ? 'Pessoa' : 'Assistente'}: ${short(m.text, MAX_MSG_IN_PROMPT)}`);
  const parts = (h) => `${RULES}\n\n=== MANUAL DO CODE ROOM ===\n${manual}\n\n=== O QUE VOCÊ ENTENDEU NA APRESENTAÇÃO (gravado nesta máquina) ===\n${knowledge || '(ainda não houve apresentação)'}\n\n=== ESTADO ATUAL ===\n${summary}\n\n=== CONVERSA ATÉ AGORA ===\n${h.join('\n') || '(início)'}\n\n=== PERGUNTA DA PESSOA ===\n${question}`;
  let h = hist; let out = parts(h); while (out.length > MAX_PROMPT && h.length) { h = h.slice(1); out = parts(h); }
  return out.length > MAX_PROMPT ? out.slice(0, MAX_PROMPT) : out;
}
export const briefingPrompt = manual => `${RULES}\n\nVocê está sendo APRESENTADO ao Code Room. Leia o manual abaixo com atenção.\n\n=== MANUAL DO CODE ROOM ===\n${manual}\n\n=== O QUE FAZER AGORA ===\nResponda em português SOMENTE com:\n1) RESUMO: o que é o Code Room, com as suas palavras (até 8 linhas).\n2) REGRAS: as regras que você vai seguir (até 6 itens), incluindo que você NÃO altera a ferramenta, roda em somente leitura e só propõe ações que a pessoa aprova.\n3) EXEMPLOS: três perguntas que você sabe ajudar a responder.\nTermine com uma última linha exata: BRIEFING: PRONTO`;
// A apresentação só vale se a IA realmente respondeu o que foi pedido (e entendeu as regras de segurança).
export function checkBriefing(answer) {
  const text = String(answer || '').trim(), has = /^\s*BRIEFING:\s*PRONTO\s*$/im.test(text), body = text.replace(/^\s*BRIEFING:\s*PRONTO\s*$/im, '').trim();
  if (!has) return { ok: false, error: 'A IA não concluiu a apresentação (faltou a linha “BRIEFING: PRONTO”).' };
  if (body.length < 200) return { ok: false, error: 'A resposta da IA ficou curta demais para valer como apresentação.' };
  if (!/(somente leitura|n[aã]o alter|n[aã]o posso alterar|n[aã]o modific)/i.test(body) || !/(aprov|clique|confirma)/i.test(body)) return { ok: false, error: 'A IA não confirmou as regras de segurança (somente leitura e aprovação da pessoa).' };
  return { ok: true, text: body.slice(0, 6000) };
}

// Escolha da IA: a preferida se estiver instalada; senão a primeira instalada na ordem claude, codex, agy.
export const chooseProvider = (preferred, connected) => connected.has(preferred) ? preferred : PROVIDER_ORDER.find(p => connected.has(p)) || null;

export class Assistant {
  constructor({ store, root, dataDir, world, pump = () => {}, now = () => Date.now(), createTaskFn = createTask, saveAgent, saveTeam, saveProject, startTask, saveLink, saveSkill }) {
    Object.assign(this, { store, root, dataDir, worldFn: world, pump, now, createTaskFn, saveAgent, saveTeam, saveProject, startTask, saveLink, saveSkill });
    this.dir = join(dataDir, 'assistente');
  }
  get s() { return this.store.get('settings', 'assistant') || { id: 'assistant', provider: null, briefedAt: null, manualHash: null, knowledge: '', messages: [], pending: null, briefing: null, error: null }; }
  #save(patch) { const next = { ...this.s, id: 'assistant', ...patch }; next.messages = (next.messages || []).slice(-MAX_MESSAGES); this.store.put('settings', next); return next; }

  // Entidades internas (projeto e agente do assistente): não aparecem nas telas do app.
  #ensure(provider) {
    mkdirSync(this.dir, { recursive: true });
    if (!this.store.get('projects', ASSISTANT_PROJECT)) this.store.put('projects', { id: ASSISTANT_PROJECT, name: 'Assistente (interno)', path: this.dir, area: 'Geral', internal: true, createdAt: new Date(this.now()).toISOString() });
    const id = `assistant-${provider}`;
    if (!this.store.get('agents', id)) this.store.put('agents', { id, name: 'Assistente', role: 'Ajuda dentro do Code Room', room: 'Assistente', provider, model: '', instructions: '', mode: 'read', skillIds: [], commands: [], capabilities: [], internal: true, revision: 1 });
    return id;
  }
  #task(provider, objective, tag) {
    const agentId = this.#ensure(provider), { task } = this.createTaskFn(this.store, { projectId: ASSISTANT_PROJECT, agentId, requestId: `assistant:${tag}:${randomUUID()}`, objective, criteria: [], limits: { timeoutMs: 4 * 60 * 1000 } });
    this.pump(); return task;
  }

  // ---------- estado para a tela ----------
  async status() {
    await this.#sync(); const s = this.s, manual = loadManual(this.root), w = await this.worldFn();
    const taskOf = id => id ? this.store.get('tasks', id) : null, pt = taskOf(s.pending?.taskId), bt = taskOf(s.briefing?.taskId);
    return {
      manual: { available: !manual.missing, hash: manual.hash }, briefed: !!s.briefedAt, stale: !!s.briefedAt && !!manual.hash && s.manualHash !== manual.hash,
      briefedAt: s.briefedAt, knowledge: s.knowledge || '', provider: s.provider, connected: [...w.connected], messages: (s.messages || []).map(m => ({ ...m, actions: (m.actions || []).map(({ raw, ...a }) => a) })), error: s.error || null,
      pending: s.pending ? { kind: s.pending.kind, status: pt?.status || 'queued', since: s.pending.at } : null, briefing: s.briefing ? { status: bt?.status || 'queued', since: s.briefing.at } : null,
    };
  }
  // Fecha as tarefas pendentes que já terminaram (sem depender de eventos): vira mensagem do assistente, erro ou conhecimento gravado.
  async #sync() {
    const s = this.s, ended = t => t && ['completed', 'failed', 'cancelled', 'blocked', 'interrupted', 'timeout'].includes(t.status), answerOf = t => this.#answer(t);
    if (s.briefing) {
      const t = this.store.get('tasks', s.briefing.taskId);
      if (ended(t) || !t) {
        if (t?.status === 'completed') {
          const chk = checkBriefing(answerOf(t));
          if (chk.ok) { const man = loadManual(this.root); this.#writeKnowledge(chk.text, s.briefing.provider, man.hash); this.#save({ briefing: null, briefedAt: new Date(this.now()).toISOString(), manualHash: man.hash, knowledge: chk.text, provider: s.briefing.provider, error: null }); }
          else this.#save({ briefing: null, error: chk.error });
        } else this.#save({ briefing: null, error: `A apresentação não foi concluída: ${short(t?.reason || t?.status || 'tarefa não encontrada', 200)}` });
      }
    }
    const p = this.s.pending;
    if (p) {
      const t = this.store.get('tasks', p.taskId);
      if (ended(t) || !t) {
        const msgs = [...(this.s.messages || [])];
        if (t?.status === 'completed') {
          const { text, actions } = parseActions(answerOf(t)), w = await this.worldFn();
          const planned = { agents: [], teams: [], projects: [], skills: [] }, acts = actions.map(raw => { const n = normalizeAction(raw, w, planned); if (n?.valid) { if (n.type === 'criar_agente') planned.agents.push(n.payload.name); else if (n.type === 'criar_equipe') planned.teams.push(n.payload.name); else if (n.type === 'criar_projeto') planned.projects.push(n.payload.name); else if (n.type === 'criar_skill') planned.skills.push(n.payload.name); } return { raw, n }; }).filter(x => x.n).map((x, idx) => ({ idx, ...x.n, raw: x.raw, status: 'pending' }));
          msgs.push({ id: randomUUID(), role: 'assistant', text: text || '(a IA não escreveu uma resposta)', at: new Date(this.now()).toISOString(), taskId: t.id, actions: acts });
          this.#save({ pending: null, messages: msgs, error: null });
        } else { msgs.push({ id: randomUUID(), role: 'assistant', text: '', error: `Não foi possível responder: ${short(t?.reason || t?.status || 'tarefa não encontrada', 300)}`, at: new Date(this.now()).toISOString(), taskId: p.taskId }); this.#save({ pending: null, messages: msgs }); }
      }
    }
  }
  #answer(task) { const att = task?.result?.attemptId ? this.store.get('runs', task.result.attemptId) : null; return att?.answer || task?.result?.summary || ''; }
  #writeKnowledge(text, provider, hash) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, 'CONHECIMENTO.md'), `---\nprovedor: ${provider}\nmanual: ${hash}\ngravado: ${new Date(this.now()).toISOString()}\n---\n\n# O que o Assistente entendeu sobre o Code Room\n\n${text}\n`, 'utf8');
  }

  // ---------- ações do usuário ----------
  async #pickProvider(preferred) { const w = await this.worldFn(), p = chooseProvider(preferred || this.s.provider, w.connected); if (!p) throw new Error('Nenhuma IA instalada. Instale e conecte uma (menu do usuário › Guia de boas-vindas).'); return p; }
  async brief({ provider } = {}) {
    await this.#sync(); if (this.s.briefing) throw new Error('A apresentação já está em andamento.');
    const manual = loadManual(this.root); if (manual.missing) throw new Error('O manual (docs/ASSISTENTE.md) não foi encontrado nesta instalação.');
    const p = await this.#pickProvider(provider), task = this.#task(p, briefingPrompt(manual.text), 'brief');
    this.#save({ briefing: { taskId: task.id, provider: p, at: new Date(this.now()).toISOString() }, error: null }); return this.status();
  }
  async ask(text) {
    await this.#sync(); const s = this.s, q = String(text ?? '').trim(); if (!q) throw new Error('Escreva a sua pergunta.'); if (q.length > MAX_QUESTION) throw new Error(`A pergunta passou de ${MAX_QUESTION} caracteres.`);
    if (!s.briefedAt) throw new Error('Antes, apresente o Code Room à sua IA (botão “Apresentar”).'); if (s.pending) throw new Error('Aguarde a resposta anterior.');
    const w = await this.worldFn(), manual = loadManual(this.root), p = await this.#pickProvider(s.provider);
    const prompt = buildPrompt({ manual: manual.text, knowledge: s.knowledge, summary: stateSummary(w, w.projects || [], q), history: (s.messages || []).filter(m => m.text), question: q }), task = this.#task(p, prompt, 'ask');
    this.#save({ pending: { kind: 'ask', taskId: task.id, at: new Date(this.now()).toISOString() }, messages: [...(s.messages || []), { id: randomUUID(), role: 'user', text: q, at: new Date(this.now()).toISOString() }], error: null });
    return this.status();
  }
  reset() { this.#save({ messages: [], error: null }); return this.status(); }
  async setProvider(p) { if (!PROVIDER_ORDER.includes(p)) throw new Error('IA inválida.'); const w = await this.worldFn(); if (!w.connected.has(p)) throw new Error('Essa IA não está instalada.'); this.#save({ provider: p }); return this.status(); }

  // Aplica UMA ação aprovada: valida de novo (o estado pode ter mudado) e só então executa, pelos mesmos caminhos do resto do app.
  async apply(msgId, idx) {
    const s = this.s, msgs = (s.messages || []).map(m => ({ ...m, actions: (m.actions || []).map(a => ({ ...a })) })), m = msgs.find(x => x.id === msgId), a = m?.actions?.find(x => x.idx === Number(idx));
    if (!a) throw new Error('Ação não encontrada.'); if (a.status !== 'pending') throw new Error('Esta ação já foi tratada.');
    const w = await this.worldFn(), r = normalizeAction(a.raw || {}, w); if (!r || !r.valid) throw new Error(r?.error || 'A ação deixou de ser válida.');
    let result = '', projectId = null, taskView = null;
    if (r.type === 'criar_equipe') { const t = this.saveTeam(r.payload); result = `Equipe “${t.name}” criada.`; }
    else if (r.type === 'criar_agente') { const ag = this.saveAgent(r.payload); result = `Agente “${ag.name}” criado.`; }
    else if (r.type === 'definir_skills') { const old = this.store.get('agents', r.payload.agentId); const ag = this.saveAgent({ ...old, skillIds: r.payload.skillIds }); result = `Skills de “${ag.name}” atualizadas.`; }
    else if (r.type === 'criar_projeto') { const pr = await this.saveProject(r.payload); result = `Projeto “${pr.name}” criado.`; projectId = pr.id; }
    else if (r.type === 'ligar_agentes') { await this.saveLink(r.payload); result = 'Ligação criada: o trabalho passa de um agente ao outro.'; projectId = r.payload.projectId; }
    else if (r.type === 'criar_skill') { await this.saveSkill(r.payload); result = `Skill “${r.payload.name}” criada. Já aparece em Skills.`; }
    else if (r.type === 'iniciar_tarefa') { const o = await this.startTask(r.payload); result = r.payload.teamId ? 'Fluxo da equipe iniciado. Acompanhe em Tarefas.' : 'Tarefa iniciada. Acompanhe em Tarefas.'; projectId = r.payload.projectId; taskView = o?.id ? 'tasks' : null; }
    else if (r.type === 'abrir_tela') result = 'Tela aberta.';
    a.status = 'applied'; a.result = result; this.#save({ messages: msgs }); return { result, view: r.type === 'abrir_tela' ? r.payload.view : taskView, projectId, status: await this.status() };
  }
  dismiss(msgId, idx) {
    const msgs = (this.s.messages || []).map(m => ({ ...m, actions: (m.actions || []).map(a => ({ ...a })) })), a = msgs.find(x => x.id === msgId)?.actions?.find(x => x.idx === Number(idx)); if (!a) throw new Error('Ação não encontrada.');
    if (a.status === 'pending') { a.status = 'dismissed'; this.#save({ messages: msgs }); } return this.status();
  }
}
