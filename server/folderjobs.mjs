import { randomUUID, createHash } from 'node:crypto';
import { readdirSync, statSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep, extname, isAbsolute } from 'node:path';

// Pasta de entrada: o Code Room olha uma pasta do projeto, cria UMA tarefa por arquivo novo (com a instrução que você escreveu, onde {arquivo}
// vira o caminho do arquivo) e avisa quando o lote termina. Serve para editar 15 vídeos, renomear fotos, resumir PDFs… com o agente e a skill que você escolher.
export const MAX_ITEMS = 500, MAX_SCAN = 2000, STABLE_MS = 5000, IGNORE = new Set(['.git', 'node_modules', '.data']);
const DONE = new Set(['completed']), FAIL = new Set(['failed', 'cancelled', 'interrupted', 'timeout', 'blocked']), LIVE = new Set(['queued', 'running', 'waiting_dependency', 'cancelling']);

const text = (v, max, label, req = true) => { if (v == null || v === '') { if (req) throw new Error(`${label}: obrigatório.`); return ''; } if (typeof v !== 'string' || v.length > max) throw new Error(`${label}: texto de até ${max} caracteres.`); return v.trim(); };

// Valida o que a pessoa cadastra. A pasta é SEMPRE relativa ao projeto e não pode sair dele.
export function validateJob(input, store, old = null) {
  const name = text(input.name, 100, 'Nome'), instruction = text(input.instruction, 3000, 'Instrução');
  if (!instruction.includes('{arquivo}')) throw new Error('A instrução precisa citar {arquivo}, que vira o caminho de cada arquivo (ex.: “Edite o vídeo {arquivo} com a skill X”).');
  const project = store.get('projects', text(input.projectId, 100, 'Projeto')); if (!project || project.internal) throw new Error('Projeto não encontrado.');
  const rawDir = text(input.dir ?? 'ENTRADA', 200, 'Pasta de entrada');
  if (/^[\\/]/.test(rawDir)) throw new Error('Pasta de entrada: use um caminho relativo ao projeto (ex.: ENTRADA), sem barra no começo.');
  const dir = rawDir.replace(/[\\]+/g, '/').replace(/\/+$/g, '');
  if (!dir || isAbsolute(dir) || /(^|\/)\.\.(\/|$)/.test(dir) || /[<>:"|?*\0]/.test(dir)) throw new Error('Pasta de entrada: use um caminho relativo ao projeto (ex.: ENTRADA), sem “..”.');
  const exts = [...new Set(String(input.exts ?? '').toLowerCase().split(/[\s,;]+/).map(s => s.replace(/^[.]/, '')).filter(Boolean))];
  if (exts.length > 12 || exts.some(e => !/^[a-z0-9]{1,8}$/.test(e))) throw new Error('Extensões: até 12, com letras e números, separadas por vírgula (ex.: mp4, mov).');
  const target = input.agentId ? { type: 'agent', id: String(input.agentId) } : input.teamId ? { type: 'team', id: String(input.teamId) } : null; if (!target) throw new Error('Escolha o agente (ou a equipe) que vai processar cada arquivo.');
  if (target.type === 'agent') { const a = store.get('agents', target.id); if (!a || a.internal) throw new Error('Agente não encontrado.'); } else if (!store.get('teams', target.id)) throw new Error('Equipe não encontrada.');
  const parallel = Math.min(3, Math.max(1, Math.trunc(Number(input.parallel)) || 1)), outputNote = text(input.outputNote, 300, 'Onde salvar', false);
  return { id: old?.id || randomUUID(), name, projectId: project.id, dir, exts, target, instruction, outputNote, parallel, status: input.status === 'paused' ? 'paused' : (old?.status || 'active'),
    items: old?.items || [], history: old?.history || [], createdAt: old?.createdAt || new Date().toISOString() };
}

export const itemKey = (rel, size, mtimeMs) => `${rel}|${size}|${Math.floor(mtimeMs)}`;
const idOf = key => createHash('sha1').update(key).digest('hex').slice(0, 12);

// Arquivos candidatos na pasta (até 2 níveis), já estáveis (não estão sendo gravados agora).
export function scanFolder(root, job, now = Date.now()) {
  const base = resolve(root, job.dir), out = []; let seen = 0;
  let real; try { real = realpathSync(base); } catch { return { files: [], missing: true }; }
  const rootReal = (() => { try { return realpathSync(root); } catch { return resolve(root); } })();
  if (real !== rootReal && !real.startsWith(rootReal + sep)) return { files: [], missing: true, escaped: true };   // atalho que sai do projeto
  const walk = (dir, depth) => {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++seen > MAX_SCAN) return; if (IGNORE.has(e.name) || e.name.startsWith('.')) continue; const p = join(dir, e.name);
      if (e.isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
      if (!e.isFile()) continue; if (job.exts.length && !job.exts.includes(extname(e.name).slice(1).toLowerCase())) continue;
      let st; try { st = statSync(p); } catch { continue; } if (now - st.mtimeMs < STABLE_MS) continue;
      out.push({ rel: relative(rootReal, p).split(sep).join('/'), size: st.size, mtimeMs: st.mtimeMs });
    }
  };
  walk(real, 0); return { files: out.sort((a, b) => a.rel.localeCompare(b.rel)) };
}

export const counts = job => { const c = { total: job.items.length, queued: 0, running: 0, done: 0, failed: 0 }; for (const i of job.items) { if (i.status === 'queued') c.queued++; else if (i.status === 'running') c.running++; else if (i.status === 'done') c.done++; else if (i.status === 'failed') c.failed++; } return c; };

export class FolderJobs {
  // launch(job, item) cria a tarefa (ou o fluxo) e devolve { taskId } ou { flowId }; a idempotência vem do requestId.
  constructor(store, launch, { intervalMs = 15000, now = () => Date.now(), onDone = () => {} } = {}) { Object.assign(this, { store, launch, intervalMs, now, onDone }); this.timer = null; }
  start() { this.timer = setInterval(() => { try { this.tick(); } catch {} }, this.intervalMs); this.timer.unref?.(); }
  stop() { clearInterval(this.timer); }
  save(input) {
    const old = input.id ? this.store.get('folderjobs', input.id) : null; if (input.id && !old) throw new Error('Pasta de entrada inexistente.');
    return this.store.put('folderjobs', validateJob(input, this.store, old));
  }
  setStatus(id, status) { const j = this.store.get('folderjobs', id); if (!j) throw new Error('Pasta de entrada inexistente.'); j.status = status; return this.store.put('folderjobs', j); }
  remove(id) { if (!this.store.get('folderjobs', id)) throw new Error('Pasta de entrada inexistente.'); this.store.remove('folderjobs', id); }
  retryFailed(id) { const j = this.store.get('folderjobs', id); if (!j) throw new Error('Pasta de entrada inexistente.'); let n = 0; for (const i of j.items) if (i.status === 'failed') { i.status = 'queued'; i.attempt = (i.attempt || 0) + 1; i.taskId = null; i.flowId = null; i.reason = ''; n++; } j.finished = false; this.store.put('folderjobs', j); this.step(j); return { retried: n }; }
  tick() { for (const j of this.store.list('folderjobs')) this.process(j.id); }
  runNow(id) { return this.process(id, { force: true }); }

  // 1) acha arquivos novos, 2) atualiza o estado das tarefas, 3) lança mais tarefas até o limite, 4) avisa ao terminar.
  process(id, { force = false } = {}) {
    let j = this.store.get('folderjobs', id); if (!j) throw new Error('Pasta de entrada inexistente.'); if (j.status !== 'active' && !force) return counts(j);
    const project = this.store.get('projects', j.projectId); if (!project) { j.problem = 'O projeto foi removido.'; this.store.put('folderjobs', j); return counts(j); }
    this.syncItems(j);
    const sc = scanFolder(project.path, j, this.now()); j.problem = sc.escaped ? 'A pasta de entrada aponta para fora do projeto e foi ignorada.' : sc.missing ? 'A pasta de entrada ainda não existe. Crie a pasta e ponha os arquivos nela.' : '';
    const known = new Set(j.items.map(i => i.key)); let added = 0;
    for (const f of sc.files) { const key = itemKey(f.rel, f.size, f.mtimeMs); if (known.has(key) || j.items.length >= MAX_ITEMS) continue; j.items.push({ key, rel: f.rel, size: f.size, status: 'queued', attempt: 0, addedAt: new Date(this.now()).toISOString() }); added++; }
    if (added) j.finished = false;
    this.store.put('folderjobs', j); this.step(j); return counts(this.store.get('folderjobs', id));
  }
  step(j) {
    j = this.store.get('folderjobs', j.id) || j; this.syncItems(j);
    let live = j.items.filter(i => i.status === 'running').length;
    for (const it of j.items) {
      if (live >= j.parallel) break; if (it.status !== 'queued') continue;
      try { const out = this.launch(j, it, `${idOf(it.key)}-${it.attempt || 0}`); it.status = 'running'; it.taskId = out.taskId || null; it.flowId = out.flowId || null; it.startedAt = new Date(this.now()).toISOString(); live++; }
      catch (e) { it.status = 'failed'; it.reason = e.message; }
    }
    this.finishIfDone(j); this.store.put('folderjobs', j);
  }
  syncItems(j) {
    for (const it of j.items) {
      if (it.status !== 'running') continue;
      const t = it.taskId ? this.store.get('tasks', it.taskId) : null, f = it.flowId ? this.store.get('flows', it.flowId) : null;
      const st = t ? t.status : f ? (f.status === 'completed' || f.verdict === 'approved' ? 'completed' : ['failed', 'blocked', 'cancelled'].includes(f.status) ? 'failed' : 'running') : null;
      if (!st) { it.status = 'failed'; it.reason = 'A tarefa deste arquivo não foi encontrada.'; continue; }
      if (DONE.has(st)) { it.status = 'done'; it.endedAt = new Date(this.now()).toISOString(); it.files = (t?.result?.deliverables?.files || []).filter(x => x.change !== 'deleted').length; }
      else if (FAIL.has(st) || st === 'failed') { it.status = 'failed'; it.endedAt = new Date(this.now()).toISOString(); it.reason = String(t?.reason || f?.reason || `Terminou como “${st}”.`).slice(0, 300); }
    }
  }
  finishIfDone(j) {
    const c = counts(j); if (!c.total || j.finished || c.queued || c.running) return;
    j.finished = true; const at = new Date(this.now()).toISOString(); j.lastResult = { at, total: c.total, done: c.done, failed: c.failed };
    j.history = [{ at, total: c.total, done: c.done, failed: c.failed }, ...(j.history || [])].slice(0, 20);
    const nid = randomUUID(); this.store.put('notices', { id: nid, kind: 'folder_done', jobId: j.id, title: `Lote “${j.name}” terminou`, text: `${c.done} de ${c.total} arquivo(s) prontos${c.failed ? `, ${c.failed} com problema` : ''}.`, at, seen: false });
    try { this.onDone(j, c); } catch {}
  }
  view(j) { return { id: j.id, name: j.name, projectId: j.projectId, dir: j.dir, exts: j.exts, target: j.target, instruction: j.instruction, outputNote: j.outputNote, parallel: j.parallel, status: j.status, problem: j.problem || '', counts: counts(j), lastResult: j.lastResult || null, finished: !!j.finished, items: j.items.slice(-40).reverse().map(({ key, ...i }) => i) }; }
}
