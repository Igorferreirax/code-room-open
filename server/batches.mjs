import { readFile, readdir, stat, mkdir, copyFile, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTask } from './tasks.mjs';

// Modo de lote: vários episódios/vídeos seguem uma esteira, com DOIS pontos de decisão do dono:
//   1) aprovação única dos créditos do lote (voz + Flow), com os números calculados dos arquivos reais;
//   2) aprovação da prévia de cada vídeo antes do render final e da entrega em POSTAR/.
// Nada gasta crédito antes do ponto 1. Cada etapa é uma tarefa normal (histórico, cancelamento, custo reportado).
const now = () => new Date().toISOString();
export const STAGES = ['preparar', 'voz', 'imagens', 'clipes', 'montagem', 'previa', 'final'];
const LABEL = { preparar: 'Preparar a pasta do episódio', voz: 'Gerar a voz', imagens: 'Gerar as imagens', clipes: 'Gerar os clipes', montagem: 'Montar a composição do vídeo', previa: 'Renderizar a prévia (feito pelo Code Room)', final: 'Gerar o vídeo final com volume normalizado (feito pelo Code Room)' };
const GATE = 'previa';      // depois desta etapa o episódio espera a aprovação do dono
const money = new Set(['voz', 'imagens', 'clipes']);   // etapas que gastam crédito: só rodam depois da aprovação do lote
const num = (v, max = 1e6) => { if (v === '' || v == null) return null; const n = Number(v); if (!(n >= 0 && n <= max)) throw new Error('Número inválido.'); return n; };

// Lê os arquivos reais do episódio e conta o que vai gastar. O que não dá para saber fica null ("indisponível"), nunca zero.
export async function inspectEpisode(root, folder) {
  const dir = resolve(root, folder);
  if (dir !== resolve(root) && !dir.startsWith(resolve(root) + sep)) throw new Error('Pasta fora do projeto.');
  const read = async n => { try { return await readFile(join(dir, n), 'utf8'); } catch { return null; } };
  const falas = await read('falas.txt'), prompts = await read('PROMPTS-FLOW.md'), brief = await read('BRIEF.md');
  const lines = falas ? falas.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  const chars = lines.join(' ').length;
  // Aceita tabela (| c01 | ... e | v01 | ...) ou o formato "**Cena N (fala N) — CLIPE N**". Sem arquivo, fica null (indisponível).
  const uniq = (re, g = 1) => new Set([...prompts.matchAll(re)].map(m => m[g].toLowerCase())).size;
  const images = prompts == null ? null : (uniq(/^\|\s*(c\d+)\s*\|/gmi) || uniq(/^\*\*Cena\s+(\d+)/gmi) || null);
  const clips = prompts == null ? null : (uniq(/^\|\s*(v\d+)\s*\|/gmi) || uniq(/^\*\*Cena[^\n]*?CLIPE\s+(\d+)/gmi));
  const title = (brief?.match(/^#\s*(.+)$/m) || [])[1] || folder;
  return { folder, title: title.slice(0, 120), falas: lines.length, chars: falas ? chars : null, images, clips, ready: !!(falas && prompts && lines.length === 9) };
}

// Localiza, na esteira de produção do projeto, o que o episódio já produziu (prévia, final, capa, POST.md).
// Só olha videos/<pasta do episódio>/saida/; devolve caminhos relativos ao projeto.
const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slugOf = folder => plain(String(folder).split(/[\\/]/).pop().replace(/^ep\d+-?/i, '')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Pastas de produção (videos/<data>_<...>-<lenda>) que combinam com o episódio, da mais nova para a mais antiga.
async function prodNames(projectRoot, folder) {
  const slug = plain(String(folder).split(/[\\/]/).pop().replace(/^ep\d+-?/i, '')), base = join(projectRoot, 'videos');
  if (!slug) return [];
  let dirs; try { dirs = await readdir(base, { withFileTypes: true }); } catch { return []; }
  return dirs.filter(x => x.isDirectory() && plain(x.name).includes(slug)).map(x => x.name).sort().reverse();
}
export async function findProdDir(projectRoot, folder) { const n = (await prodNames(projectRoot, folder))[0]; return n ? join(projectRoot, 'videos', n) : null; }
export async function findMedia(projectRoot, folder) {
  const base = join(projectRoot, 'videos');
  for (const d of await prodNames(projectRoot, folder)) {
    let files; try { files = await readdir(join(base, d, 'saida')); } catch { continue; }
    const pick = re => files.filter(f => re.test(f)).sort().reverse()[0];
    const found = { previa: pick(/^previa.*\.mp4$/i), final: pick(/^(?!previa).*\.mp4$/i), capa: pick(/^capa.*\.(jpg|png)$/i), post: files.find(f => f === 'POST.md') };
    if (found.previa || found.final) return Object.fromEntries(Object.entries(found).filter(([, v]) => v).map(([k, v]) => [k, `videos/${d}/saida/${v}`]));
  }
  return {};
}

// ---------- pastas de aprovação ----------
// Fluxo: AGUARDANDO_APROVACAO/<CANAL>/<ep>  →(você aprova)→  POSTAR_<CANAL>/<ep>   |   →(você reprova)→  LIXEIRA/<CANAL>/<ep>-<data>
// Nada é apagado de vez: reprovar move para a LIXEIRA do projeto (esvaziar é decisão sua).
const slugU = s => plain(String(s)).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
export const channelOf = batch => slugU(batch.channel || String(batch.name || '').split(':')[0]) || 'CANAL';
const epName = ep => (String(ep.folder).split(/[\\/]/).pop().replace(/[^\w.-]+/g, '_') || 'episodio');
const dirs = (project, batch, ep) => { const c = channelOf(batch), n = epName(ep); return { waiting: join(project.path, 'AGUARDANDO_APROVACAO', c, n), post: join(project.path, `POSTAR_${c}`, n), trash: join(project.path, 'LIXEIRA', c, `${n}-${new Date().toISOString().replace(/[:.]/g, '-')}`) }; };
async function copyInto(project, dest, rels) {
  const done = []; await mkdir(dest, { recursive: true });
  for (const rel of rels.filter(Boolean)) { const from = resolve(project.path, rel); if (!from.startsWith(resolve(project.path) + sep) || !existsSync(from)) continue; await copyFile(from, join(dest, from.split(/[\\/]/).pop())); done.push(from.split(/[\\/]/).pop()); }
  return done;
}
async function moveInto(dest, froms) {
  await mkdir(dest, { recursive: true });
  for (const from of froms.filter(f => f && existsSync(f))) { const to = join(dest, from.split(/[\\/]/).pop()); try { await rename(from, to); } catch { await copyFile(from, to).catch(() => {}); await rm(from, { recursive: true, force: true }).catch(() => {}); } }
}

export function killTree(child) { if (!child?.pid) return; if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {}); else { try { child.kill('SIGKILL'); } catch {} } }
// Roda um programa FORA do sandbox dos agentes (o próprio Code Room), com limite de tempo e as últimas linhas de saída. Argumentos são sempre fixos (nada vindo de texto livre).
function execDefault(cmd, args, { cwd, onLine = () => {}, timeoutMs = 3600e3, register = () => {} }) {
  return new Promise(done => {
    const q = a => /[\s"]/.test(a) ? `"${a.replace(/"/g, '')}"` : a;
    const child = process.platform === 'win32' ? spawn([cmd, ...args].map(q).join(' '), { cwd, shell: true, windowsHide: true }) : spawn(cmd, args, { cwd, windowsHide: true });
    register(child); const tail = []; let killed = false;
    const feed = d => { for (const l of String(d).split(/\r?\n|\r/)) { const s = l.trim(); if (s) { tail.push(s); if (tail.length > 30) tail.shift(); onLine(s); } } };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    const timer = setTimeout(() => { killed = true; killTree(child); }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); done({ code: -1, tail: e.message, killed }); });
    child.on('close', code => { clearTimeout(timer); done({ code: killed ? -2 : code, tail: tail.slice(-5).join(' | ').slice(0, 280), killed }); });
  });
}

export class Batches {
  constructor(store, orchestrator, { exec = execDefault } = {}) {
    this.store = store; this.orch = orchestrator; this.exec = exec; this.children = new Map(); this.chain = Promise.resolve();
    this.recover();
  }
  // Se o serviço reiniciou no meio de um render, o processo se perdeu: o episódio vira "falhou" (com "Tentar de novo"), em vez de ficar preso para sempre.
  recover() {
    for (const batch of this.store.list('batches')) {
      let changed = false;
      for (const ep of batch.episodes) if (ep.status === 'em_andamento' && ['previa', 'final'].includes(ep.stage) && ep.render) { ep.status = 'falhou'; ep.note = 'O serviço foi reiniciado durante o render. Use "Tentar de novo".'; changed = true; }
      if (changed) { batch.status = this.summary(batch); this.store.put('batches', batch); }
    }
  }
  costs() { const s = this.store.get('settings', 'batchCosts') || {}; return { flowPerImage: s.flowPerImage ?? null, flowPerClip: s.flowPerClip ?? null, voicePerChar: s.voicePerChar ?? 1 }; }
  saveCosts(b) { return this.store.put('settings', { id: 'batchCosts', flowPerImage: num(b.flowPerImage, 10000), flowPerClip: num(b.flowPerClip, 10000), voicePerChar: num(b.voicePerChar, 100) ?? 1 }); }

  // Só conta o que ainda vai ser feito: um lote que recomeça de "imagens" não cobra a voz de novo.
  estimate(episodes) {
    const c = this.costs(), todo = (e, st) => !e.fromStage || STAGES.indexOf(st) >= STAGES.indexOf(e.fromStage);
    const sum = (k, st) => { const es = episodes.filter(e => todo(e, st)); return es.every(e => e[k] != null) ? es.reduce((a, e) => a + e[k], 0) : null; };
    const chars = sum('chars', 'voz'), images = sum('images', 'imagens'), clips = sum('clips', 'clipes');
    const voice = chars == null ? null : Math.ceil(chars * c.voicePerChar);
    const flow = images == null || clips == null || c.flowPerImage == null || c.flowPerClip == null ? null : Math.ceil(images * c.flowPerImage + clips * c.flowPerClip);
    return { episodes: episodes.length, chars, images, clips, voiceCredits: voice, flowCredits: flow, flowKnown: flow != null };
  }

  async create(b) {
    const project = this.store.get('projects', b.projectId), agent = this.store.get('agents', b.agentId);
    if (!project || !agent) throw new Error('Escolha o projeto e o agente produtor.');
    if (agent.mode !== 'write') throw new Error('O agente produtor precisa poder escrever arquivos.');
    const folders = [...new Set((b.folders || []).map(String))].slice(0, 20);
    if (!folders.length) throw new Error('Escolha ao menos um episódio.');
    const eps = [];
    for (const f of folders) {
      const i = await inspectEpisode(project.path, f);
      if (!i.ready) throw new Error(`Episódio ${f} incompleto: precisa de falas.txt com 9 falas e PROMPTS-FLOW.md.`);
      const from = b.fromStage && STAGES.includes(b.fromStage) && b.fromStage !== 'preparar' ? b.fromStage : null;
      eps.push({ id: randomUUID(), ...i, stage: from ? STAGES[STAGES.indexOf(from) - 1] : 'planejado', fromStage: from, status: 'planejado', tasks: {}, note: '' });
    }
    const batch = { id: randomUUID(), name: String(b.name || 'Lote').slice(0, 100), projectId: project.id, agentId: agent.id, workDir: String(b.workDir || '').slice(0, 300), episodes: eps, status: 'aguardando_creditos', estimate: this.estimate(eps), approval: null, createdAt: now() };
    return this.store.put('batches', batch);
  }

  // Aprovação única: o dono confirma exatamente os créditos de voz calculados e define o TETO de créditos do Flow que aceita gastar.
  approve(id, b) {
    const batch = this.need(id); if (batch.status !== 'aguardando_creditos') throw new Error('Este lote não está aguardando aprovação de créditos.');
    const est = this.estimate(batch.episodes);
    if (est.voiceCredits != null && num(b.voiceCredits) !== est.voiceCredits) throw new Error(`Confirme os créditos de voz calculados: ${est.voiceCredits}.`);
    const cap = num(b.flowCap, 100000); if (cap == null) throw new Error('Defina o teto de créditos do Flow que você aceita gastar neste lote.');
    if (est.flowCredits != null && cap < est.flowCredits) throw new Error(`O teto (${cap}) é menor que a estimativa do Flow (${est.flowCredits}).`);
    batch.approval = { at: now(), voiceCredits: est.voiceCredits, flowCap: cap, flowEstimate: est.flowCredits }; batch.estimate = est; batch.status = 'em_producao';
    this.store.put('batches', batch);
    for (const ep of batch.episodes) this.advance(batch, ep);
    return this.store.put('batches', batch);
  }

  need(id) { const b = this.store.get('batches', id); if (!b) throw new Error('Lote inexistente.'); return b; }
  epOf(batch, epId) { const e = batch.episodes.find(x => x.id === epId); if (!e) throw new Error('Episódio inexistente.'); return e; }

  stageText(batch, ep, stage, note = '') {
    const dir = ep.folder, wd = batch.workDir ? ` A esteira de produção fica em ${batch.workDir}.` : '';
    const base = `Lote "${batch.name}", episódio "${ep.title}" (pasta ${dir}).${wd} Siga as regras do formato (REGRAS-CAUSO-SOMBRIO.md / skill causo-sombrio) para esta etapa: ${LABEL[stage]}.`;
    const extra = {
      preparar: ' Crie/ajuste a pasta de produção do episódio a partir de falas.txt, BRIEF.md e PROMPTS-FLOW.md. Não gaste créditos.',
      voz: ` Gere a voz das 9 falas (cerca de ${ep.chars} caracteres). O orçamento aprovado cobre ${batch.approval?.voiceCredits ?? '?'} créditos de voz para o lote inteiro: não passe disso. Confira se cada arquivo de áudio existe e tem duração.`,
      imagens: ` Gere as imagens com o Nano Banana Pro, uma por vez, e OLHE cada uma (data escrita, faixa preta, horizonte torto). O teto de créditos do Flow aprovado para o LOTE é ${batch.approval?.flowCap}: se estiver perto de estourar, pare e informe.`,
      clipes: ' Gere somente os clipes indicados no PROMPTS-FLOW.md (modo Frames, prompt JSON, um por vez) e use só o trecho bom de cada um. Respeite o teto de créditos do Flow do lote.',
      montagem: ' Use SOMENTE os arquivos já gerados (voz em fonte/voz, imagens em fonte/imagens-flow, clipes em fonte/clipes-flow): NÃO chame ElevenLabs nem Flow. Siga as etapas 3 a 5 da skill causo-sombrio: recorte faixas pretas e bordas escuras das imagens, aplique a cor de fita (preparar-vhs.py) e gere o index.html (gerar.py) em videos/<pasta do episódio>/projeto. NÃO renderize o MP4 e NÃO normalize o volume: depois desta etapa o próprio Code Room roda o check do HyperFrames e o render (se o check falhar aí por permissão de cache do npm, EPERM, ignore). Descreva em saida/ETAPA-MONTAGEM.md o que foi feito e como visualizar.'
    }[stage];
    const gate = money.has(stage) ? ` O DONO APROVOU, para este lote, o gasto de créditos desta etapa (voz: ${batch.approval?.voiceCredits ?? 0}; Flow: teto de ${batch.approval?.flowCap ?? 0} no lote todo). Essa aprovação vale como exceção à regra geral de não usar voz/Flow: use-os SÓ nesta etapa e SÓ dentro desses limites, uma geração por vez, conferindo cada resultado. Se o ambiente não estiver como esperado (ferramenta ausente, projeto errado aberto no Flow, erro repetido), pare e declare BLOQUEADA, sem tentar de novo às cegas.` : '';
    return base + extra + gate + (note ? ` Ajustes pedidos pelo dono: ${note}` : '') + ' Termine a resposta final com UMA linha exata: "ETAPA: CONCLUÍDA" (só se os arquivos desta etapa existem e foram conferidos) ou "ETAPA: BLOQUEADA — motivo".';
  }

  // Cria a tarefa da próxima etapa do episódio. Etapas que gastam crédito só existem depois da aprovação do lote.
  advance(batch, ep, { stage = STAGES[STAGES.indexOf(ep.stage) + 1], note = '' } = {}) {
    if (!stage) return;
    if (money.has(stage) && !batch.approval) return;
    if (stage === 'final' && ep.status !== 'previa_aprovada') return;
    if (stage === 'previa' || stage === 'final') return this.#render(batch, ep, stage);   // etapas de código
    const n = (ep.runs = (ep.runs || 0) + 1);
    const { task } = createTask(this.store, { projectId: batch.projectId, agentId: batch.agentId, requestId: `batch:${batch.id}:${ep.id}:${stage}:${n}`, objective: this.stageText(batch, ep, stage, note), criteria: [`Etapa "${LABEL[stage]}" concluída com os arquivos reais conferidos`], limits: { timeoutMs: 60 * 60 * 1000 } });
    const t = this.store.get('tasks', task.id); t.batchId = batch.id; t.batchEp = ep.id; t.batchStage = stage; this.store.put('tasks', t);
    ep.stage = stage; ep.status = 'em_andamento'; ep.tasks[stage] = task.id;
    this.orch.pump();
  }

  // Chamado quando uma tarefa do lote termina.
  onFinal(task) {
    if (!task.batchId) return;
    const batch = this.store.get('batches', task.batchId); if (!batch || batch.status === 'cancelado') return;
    const ep = batch.episodes.find(e => e.id === task.batchEp); if (!ep || ep.tasks[task.batchStage] !== task.id) return;
    const answer = this.orch.attemptAnswer(task) || task.result?.summary || '';
    if (task.status !== 'completed') { ep.status = 'falhou'; ep.note = (task.reason || task.error || 'A etapa não terminou.').toString().slice(0, 300); }
    else if (!/^\s*ETAPA:\s*CONCLU[ÍI]DA\s*$/im.test(answer)) { ep.status = 'falhou'; ep.note = (answer.match(/^\s*ETAPA:\s*BLOQUEADA\s*[—-]?\s*(.*)$/im)?.[1] || 'O agente não declarou a etapa como concluída.').slice(0, 300); }
    else if (task.batchStage === 'final') ep.status = 'pronto';
    else if (task.batchStage === GATE) ep.status = 'aguardando_previa';
    else { ep.status = 'concluida_etapa'; this.advance(batch, ep); }
    batch.status = this.summary(batch);
    this.store.put('batches', batch);
  }
  // ---------- etapas de CÓDIGO (prévia e final): o Code Room roda, sem depender do agente nem do sandbox ----------
  #patch(batchId, epId, fn, summarize = true) {
    const batch = this.store.get('batches', batchId), ep = batch?.episodes.find(e => e.id === epId); if (!ep) return;
    fn(ep, batch); if (summarize) batch.status = this.summary(batch); this.store.put('batches', batch);
  }
  #render(batch, ep, stage) {
    ep.stage = stage; ep.status = 'em_andamento'; ep.note = ''; ep.render = { stage, startedAt: now(), last: 'na fila do render' };
    const ids = [batch.id, ep.id];
    this.chain = this.chain.then(() => this.#doRender(ids[0], ids[1], stage)).catch(e => this.#patch(ids[0], ids[1], x => { x.status = 'falhou'; x.note = `Erro interno no render: ${e.message}`.slice(0, 300); }));
  }
  async #doRender(batchId, epId, stage) {
    const batch = this.store.get('batches', batchId), ep = batch?.episodes.find(e => e.id === epId);
    if (!batch || batch.status === 'cancelado' || !ep || ep.stage !== stage || ep.status !== 'em_andamento') return;
    const project = this.store.get('projects', batch.projectId);
    const fail = msg => this.#patch(batchId, epId, e => { e.status = 'falhou'; e.note = String(msg).slice(0, 300); });
    let lastWrite = 0; const progress = line => { if (Date.now() - lastWrite > 3000) { lastWrite = Date.now(); this.#patch(batchId, epId, e => { if (e.render) e.render.last = line.slice(0, 160); }, false); } };
    const opts = (timeoutMs, cwd) => ({ cwd, timeoutMs, onLine: progress, register: c => this.children.set(epId, c) });
    const prod = await findProdDir(project.path, ep.folder); if (!prod) return fail('Pasta de produção do episódio não encontrada em videos/.');
    const slug = slugOf(ep.folder);
    try {
      if (stage === 'previa') {
        const proj = join(prod, 'projeto'); if (!existsSync(join(proj, 'index.html'))) return fail('Falta projeto/index.html: a montagem não foi feita.');
        progress('conferindo a composição (check do HyperFrames)');
        let r = await this.exec('hyperframes', ['check', '.'], opts(15 * 60e3, proj));
        if (r.code !== 0) return fail(`O check do HyperFrames falhou (código ${r.code}): ${r.tail}`);
        lastWrite = 0; progress('renderizando a prévia (neste computador pode levar mais de 1 hora)');
        const outRel = `../saida/previa-${slug}.mp4`; await (await import('node:fs/promises')).mkdir(join(prod, 'saida'), { recursive: true });
        r = await this.exec('hyperframes', ['render', '.', '-q', 'draft', '--workers', '1', '--low-memory-mode', '-o', outRel], opts(3 * 3600e3, proj));
        if (r.code !== 0) return fail(r.killed ? 'O render passou do limite de 3 horas e foi encerrado.' : `O render falhou (código ${r.code}): ${r.tail}`);
        const f = join(prod, 'saida', `previa-${slug}.mp4`); if (!existsSync(f) || (await stat(f)).size < 10000) return fail('O render terminou, mas o arquivo da prévia não apareceu.');
        let staged = null; try { const m = await findMedia(project.path, ep.folder); staged = await copyInto(project, dirs(project, batch, ep).waiting, [m.previa, m.capa, m.post]); } catch {}
        return this.#patch(batchId, epId, e => { e.status = 'aguardando_previa'; e.note = ''; if (staged?.length) e.waiting = `AGUARDANDO_APROVACAO/${channelOf(batch)}/${epName(ep)}`; });
      }
      // final: o vídeo de postar sai da prévia aprovada, com o volume normalizado (-14 LUFS, pico -1,5) pela própria skill do canal.
      const media = await findMedia(project.path, ep.folder); if (!media.previa) return fail('Não há prévia para gerar o final.');
      const loud = join(project.path, '.claude', 'skills', 'causo-sombrio', 'scripts', 'loud.py'); if (!existsSync(loud)) return fail('Script de volume (loud.py) da skill causo-sombrio não encontrado.');
      const out = join(prod, 'saida', `final-${slug}.mp4`); progress('normalizando o volume e gerando o vídeo final');
      const r = await this.exec('python', ['-I', loud, join(project.path, media.previa), out, '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-pix_fmt', 'yuv420p'], opts(40 * 60e3, project.path));
      if (r.code !== 0) return fail(`A normalização do volume falhou (código ${r.code}): ${r.tail}`);
      if (!existsSync(out) || (await stat(out)).size < 10000) return fail('O arquivo final não apareceu.');
      // entrega: só agora (prévia aprovada + final gerado) o pacote vai para POSTAR_<CANAL>/; a cópia de espera é removida.
      let delivered = null, why = '';
      try { const d = dirs(project, batch, ep); delivered = await copyInto(project, d.post, [`videos/${prod.split(/[\\/]/).pop()}/saida/final-${slug}.mp4`, media.capa, media.post]); await rm(d.waiting, { recursive: true, force: true }); } catch (e) { why = e.message; }
      if (!delivered?.length) return fail(`O vídeo final foi gerado, mas não consegui copiar para POSTAR_${channelOf(batch)}/${why ? `: ${why}` : '.'} Use "Tentar de novo".`);
      this.#patch(batchId, epId, e => { e.status = 'pronto'; e.note = ''; e.postar = `POSTAR_${channelOf(batch)}/${epName(ep)}`; delete e.waiting; });
    } finally { this.children.delete(epId); }
  }
  summary(batch) {
    if (batch.status === 'cancelado') return 'cancelado';
    const s = batch.episodes.map(e => e.status);
    if (s.every(x => x === 'pronto' || x === 'reprovado')) return 'concluido';
    if (s.some(x => x === 'falhou')) return 'com_falha';
    if (s.some(x => x === 'aguardando_previa') && !s.some(x => x === 'em_andamento' || x === 'concluida_etapa')) return 'aguardando_previa';
    return batch.approval ? 'em_producao' : 'aguardando_creditos';
  }
  approvePreview(id, epId) {
    const batch = this.need(id), ep = this.epOf(batch, epId); if (ep.status !== 'aguardando_previa') throw new Error('Este episódio não está aguardando aprovação da prévia.');
    ep.status = 'previa_aprovada'; this.advance(batch, ep); batch.status = this.summary(batch); return this.store.put('batches', batch);
  }
  requestChanges(id, epId, note) {
    const batch = this.need(id), ep = this.epOf(batch, epId); if (ep.status !== 'aguardando_previa') throw new Error('Este episódio não está aguardando aprovação da prévia.');
    note = String(note || '').trim().slice(0, 1000); if (!note) throw new Error('Diga o que ajustar.');
    if ((ep.revisions = (ep.revisions || 0) + 1) > 3) throw new Error('Limite de 3 rodadas de ajuste da prévia neste episódio.');
    this.advance(batch, ep, { stage: 'montagem', note }); batch.status = this.summary(batch); return this.store.put('batches', batch);   // o agente ajusta a composição; depois o Code Room renderiza de novo
  }
  // Reprovar: tira o episódio do caminho sem apagar de vez. Prévia, final e cópias vão para LIXEIRA/<CANAL>/<ep>-<data>/ do projeto.
  async reject(id, epId) {
    const batch = this.need(id), ep = this.epOf(batch, epId);
    if (!['aguardando_previa', 'previa_aprovada', 'pronto', 'falhou'].includes(ep.status)) throw new Error('Este episódio não está em um ponto que permita reprovar.');
    const project = this.store.get('projects', batch.projectId), d = dirs(project, batch, ep);
    killTree(this.children.get(ep.id));
    const media = await findMedia(project.path, ep.folder), abs = r => r && join(project.path, r);
    await moveInto(d.trash, [d.waiting, d.post, abs(media.previa), abs(media.final), abs(media.capa)]);
    ep.status = 'reprovado'; ep.note = `Reprovado: arquivos em LIXEIRA/${channelOf(batch)}/.`; ep.trash = d.trash.slice(project.path.length + 1).replace(/\\/g, '/'); delete ep.waiting; delete ep.postar; delete ep.render;
    batch.status = this.summary(batch); return this.store.put('batches', batch);
  }
  retry(id, epId) {
    const batch = this.need(id), ep = this.epOf(batch, epId); if (ep.status !== 'falhou') throw new Error('Só dá para repetir uma etapa que falhou.');
    this.advance(batch, ep, { stage: ep.stage }); batch.status = this.summary(batch); return this.store.put('batches', batch);
  }
  cancel(id) {
    const batch = this.need(id); batch.status = 'cancelado';
    for (const ep of batch.episodes) { killTree(this.children.get(ep.id)); const t = this.store.get('tasks', ep.tasks[ep.stage]); if (t && ['queued', 'running', 'waiting_dependency'].includes(t.status)) { this.orch.runner.cancel(t.id).catch(() => {}); } if (ep.status !== 'pronto') ep.status = 'cancelado'; }
    return this.store.put('batches', batch);
  }
}
