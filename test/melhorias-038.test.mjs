import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { buildHomePrompt, syncListIntoPrompt, parseListItems } from '../public/home-prompts.js';
import { organizeSpeechText, insertAtSelection } from '../public/nico-flow.js';
import { acquireInstanceLock } from '../server/single-instance.mjs';
import { buildFolderUndo, undoFolderMoves } from '../server/folder-undo.mjs';
import { getPolicy, savePolicy, quotaHeadroom, aletheCommandReport, startComparison, pickFallbackProvider } from '../server/alethe-playbook.mjs';
import { stripSelfIntro, canAutoApplyInPilot, Assistant, loadManual } from '../server/assistant.mjs';
import { Orchestrator } from '../server/orchestrator.mjs';
import { Updates } from '../server/updates.mjs';
import { isLeadAgent, pendingList } from '../public/views.js';
import { adaptPreviewUrl } from '../public/browser-dock.js';
import { scanProjectPages, liveContentType } from '../server/live-preview.mjs';
import { captureTaskCheckpoint, revertTaskChanges } from '../server/task-checkpoint.mjs';
import { hostAllowed, originAllowed } from '../server/network.mjs';
import { extractSceneNumber, groupStoryboardScenes } from '../public/storyboard-ui.js';
import { validateTaskArtifacts, detectTaskDomain, qaSummaryBadge } from '../server/quality-gates.mjs';
import { extractArtifacts } from '../public/artifacts-studio.js';
import { buildZip, readZipEntries } from '../server/zip-writer.mjs';
import { execFileSync } from 'node:child_process';
import { tempDir } from './helpers.mjs';

test('Início: atalhos geram prompt modelo editável e sincronizam lista interativa', () => {
  for (const id of ['code', 'site', 'video', 'automation', 'research', 'review']) {
    const p = buildHomePrompt(id, { projectName: 'Portal' });
    assert.ok(p.length > 40, `prompt ${id} preenchido`);
    assert.match(p, /\[[^\]]+\]/, `prompt ${id} tem campos entre colchetes`);
  }
  const items = parseListItems('- Criar hero\n2. Ajustar rodapé\nTestar celular', ['Item inicial']);
  assert.deepEqual(items, ['Item inicial', 'Criar hero', 'Ajustar rodapé', 'Testar celular']);
  const synced = syncListIntoPrompt('Quero criar um site.\n\nItens:\n- [item 1]', items);
  assert.match(synced, /- Criar hero/);
  assert.match(synced, /- Testar celular/);
  assert.doesNotMatch(synced, /\[item 1\]/);
});

test('Nico Flutuante (Wispr Flow): organiza fala em texto corrido ou lista e insere no cursor', () => {
  const txt = organizeSpeechText('hum preciso criar a tela de vendas vírgula revisar o checkout e publicar amanhã', { format: 'text' });
  assert.equal(txt, 'Preciso criar a tela de vendas, revisar o checkout e publicar amanhã.');
  const lst = organizeSpeechText('em lista: primeiro cortar silêncios; segundo aplicar legenda dinâmica; terceiro exportar em 9 por 16');
  assert.equal(lst, '- Cortar silêncios\n- Aplicar legenda dinâmica\n- Exportar em 9 por 16');
  const ins = insertAtSelection('Objetivo: revisar entrega', 'hoje à tarde', 10, 10);
  assert.equal(ins.value, 'Objetivo: hoje à tarde revisar entrega');
});

test('Instância única: bloqueia segundo Code Room na mesma pasta de dados e limpa PID encerrado', async () => {
  const dir = await tempDir('cr-lock-');
  try {
    await writeFile(join(dir, 'instance.lock'), JSON.stringify({ pid: 99999999, port: 4780 }), 'utf8');
    const lock1 = acquireInstanceLock(dir, { port: 4780, pid: 1001, aliveFn: p => p === 1001 });
    assert.ok(existsSync(lock1.file), 'assume lock órfão de processo encerrado');
    assert.throws(() => acquireInstanceLock(dir, { port: 4781, pid: 1002, aliveFn: p => p === 1001 }), e => e.code === 'EALREADY_RUNNING' && e.holder.pid === 1001);
    lock1.release();
    const lock3 = acquireInstanceLock(dir, { port: 4781, pid: 1002, aliveFn: () => true });
    assert.ok(existsSync(lock3.file), 'libera após release()');
    lock3.release();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Desfazer organização de pasta externa: reverte movimentos registrados e remove pastas vazias criadas', async () => {
  const dir = await tempDir('cr-undo-'), ops = join(dir, '.ops.jsonl');
  try {
    const sub = join(dir, 'PDFs');
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, 'boleto.pdf'), 'conteudo-123', 'utf8');
    const entry = { op: 'move', from: join(dir, 'boleto.pdf'), to: join(sub, 'boleto.pdf'), size: 12, at: new Date().toISOString() };
    const mkEntry = { op: 'mkdir', path: sub, at: new Date().toISOString() };
    await writeFile(ops, JSON.stringify(mkEntry) + '\n' + JSON.stringify(entry) + '\n', 'utf8');
    const undo = buildFolderUndo(dir, null, ops);
    assert.equal(undo.available, true);
    assert.equal(undo.moves.length, 1);
    const r = undoFolderMoves(dir, undo);
    assert.equal(r.restored, 1);
    assert.equal(r.removedDirs, 1);
    assert.equal(await readFile(join(dir, 'boleto.pdf'), 'utf8'), 'conteudo-123');
    assert.ok(!existsSync(sub));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Nico enxuto e sem travas: remove autoapresentação repetida e aplica ações diretas no Modo Piloto', async () => {
  assert.equal(stripSelfIntro('Oi! Eu sou o Nico, assistente do Code Room. Criei a equipe para você.', 'Nico', 'monte uma equipe'), 'Criei a equipe para você.');
  assert.equal(stripSelfIntro('Olá!', 'Nico', 'Qual a senha?'), 'Olá!', 'cumprimento puro sem autoapresentação não some');
  assert.equal(stripSelfIntro('Oi! Eu sou o Nico.', 'Nico', 'Quem é você?'), 'Oi! Eu sou o Nico.', 'preserva quando perguntam quem é');
  assert.equal(canAutoApplyInPilot({ valid: true, type: 'iniciar_tarefa' }), true);
  assert.equal(canAutoApplyInPilot({ valid: false, type: 'iniciar_tarefa' }), false);

  const data = await tempDir('cr-pilot-auto-'), store = new Store(':memory:');
  try {
    let started = 0;
    const pj = store.put('projects', { id: 'p1', name: 'Site', path: data, area: 'Programação' });
    const ag = store.put('agents', { id: 'a1', name: 'Programador', role: 'Dev', room: 'Programação', provider: 'codex', mode: 'write', skillIds: [], commands: [], mcpTools: [], capabilities: ['code'] });
    const world = async () => ({ agents: [ag], teams: [], links: [], projects: [pj], skills: [], connected: new Set(['codex']), runs: [], flows: [], folderJobs: [] });
    const asst = new Assistant({
      store, root: process.cwd(), dataDir: data, world,
      startTask: async () => { started++; return { id: 't99' }; },
      createTaskFn: (_s, input) => {
        const task = { id: 'ta1', ...input, status: 'completed', result: { summary: 'Oi! Eu sou o Nico, assistente do Code Room. Já disparei.\n```code-room-action\n{"acao":"iniciar_tarefa","projeto":"Site","agente":"Programador","objetivo":"Criar index.html"}\n```' } };
        store.put('tasks', task);
        return { task };
      },
    });
    store.put('settings', { id: 'assistant', name: 'Nico', provider: 'codex', autonomy: 'pilot', briefedAt: new Date().toISOString(), manualHash: loadManual(process.cwd()).hash, knowledge: 'ok', messages: [], thread: { id: 't1', title: 'T', projectId: 'p1' }, others: [], order: ['t1'] });
    await asst.ask('Crie a página inicial', { projectId: 'p1' });
    const st = await asst.status(), last = st.messages.at(-1);
    assert.equal(last.text, 'Já disparei.');
    assert.equal(started, 1, 'iniciar_tarefa aplicou automaticamente no Modo Piloto sem trava');
    assert.equal(last.actions[0].status, 'applied');
  } finally {
    store.close?.();
    await rm(data, { recursive: true, force: true }).catch(() => {});
  }
});

test('Orquestração inteligente, destaque do Orquestrador, aprovação enxuta e guarda de atualização', async () => {
  const store = new Store(':memory:'), pkgDir = await tempDir('cr-pkg-');
  try {
    savePolicy(store, { goal: 'save', careful: true, directExec: true, conserve: ['claude'] });
    const pol = getPolicy(store);
    assert.equal(pol.goal, 'save');
    assert.equal(pol.careful, true);
    assert.equal(pol.directExec, true);
    const hr = quotaHeadroom(store, new Set(['claude', 'codex']));
    assert.equal(hr.bestExec, 'codex', 'poupa claude quando marcado em conserve');
    assert.match(aletheCommandReport(store, new Set(['claude', 'codex'])), /Orquestração inteligente/);

    const pj = store.put('projects', { id: 'p1', name: 'App', path: process.cwd(), area: 'Programação' });
    const a1 = store.put('agents', { id: 'a1', name: 'Arquiteto', role: 'Supervisor técnico', room: 'Programação', provider: 'claude', mode: 'read', skillIds: [], capabilities: ['supervise'] });
    const a2 = store.put('agents', { id: 'a2', name: 'Coder', role: 'Implementador', room: 'Programação', provider: 'codex', mode: 'write', skillIds: [], capabilities: ['code'] });
    const cmp = startComparison(store, { projectId: pj.id, agentIds: [a1.id, a2.id], objective: 'Proponha solução', installed: () => true });
    assert.equal(cmp.tasks.length, 2);
    assert.equal(cmp.tasks[1].isolate, true, 'agente que edita roda isolado em worktree na comparação');

    const ctx = { state: { agents: [a1, a2], links: [], runs: [{ id: 'r1', status: 'completed', kind: 'work', project: { id: 'p1' }, deliverables: [{ path: 'src/index.js' }], createdAt: new Date().toISOString() }, { id: 'r2', status: 'completed', kind: 'work', project: { id: 'p1' }, deliverables: [{ path: 'saida/capa.png' }], createdAt: new Date().toISOString() }] }, project: 'p1', prefs: { mediaOnlyReview: true }, supervisorAgent: () => null };
    assert.equal(isLeadAgent(ctx, a1), true);
    assert.equal(isLeadAgent(ctx, a2), false);
    const pend = pendingList(ctx);
    assert.equal(pend.length, 1, 'com mediaOnlyReview ligado, só a entrega com imagem/vídeo entra em Precisa de você');
    assert.match(pend[0].key, /capa\.png/);

    // Equipe de 1 desenvolvedor sem revisor roda direto quando directExec está ligado
    const orch = new Orchestrator(store);
    const team = orch.saveTeam({ name: 'Direta', members: [{ role: 'desenvolvedor', agentId: a2.id }] });
    const fl = orch.startSequential({ requestId: 'req-direct', projectId: pj.id, teamId: team.id, objective: 'Criar rota' });
    assert.equal(fl.flow.taskIds.length, 1, 'sem etapa de revisor desnecessária');

    // Atualização recusa instalar com tarefa em andamento
    await mkdir(join(pkgDir, 'runtime'), { recursive: true });
    await writeFile(join(pkgDir, 'runtime', 'node.exe'), '', 'utf8');
    const upd = new Updates({ store, dataDir: pkgDir, appDir: pkgDir, version: '0.3.7', countRunning: () => 2 });
    assert.throws(() => upd.install(), /tarefa em execução/);
  } finally {
    store.close?.();
    await rm(pkgDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Navegador interno e Porta Viva: detecta composições HyperFrames/HTML e adapta localhost para o IP do celular', async () => {
  assert.equal(adaptPreviewUrl('http://127.0.0.1:3000/preview', '100.96.75.69'), 'http://100.96.75.69:3000/preview');
  assert.equal(adaptPreviewUrl('localhost:5173', '192.168.15.11'), 'http://192.168.15.11:5173/');
  assert.equal(adaptPreviewUrl('/live/p1/tok/index.html', '100.96.75.69'), '/live/p1/tok/index.html');
  assert.equal(liveContentType('cena.html'), 'text/html; charset=utf-8');
  assert.equal(liveContentType('anim.mjs'), 'text/javascript; charset=utf-8');

  const dir = await tempDir('cr-live-');
  try {
    await writeFile(join(dir, 'index.html'), '<!doctype html><html><body>Landing</body></html>', 'utf8');
    await mkdir(join(dir, 'video'), { recursive: true });
    await writeFile(join(dir, 'video', 'reel.html'), '<div data-composition="reel" data-track="main"><script src="gsap.min.js"></script></div>', 'utf8');
    await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(dir, 'node_modules', 'pkg', 'ignore.html'), '<html></html>', 'utf8');

    const pages = await scanProjectPages(dir);
    assert.equal(pages.length, 2);
    assert.equal(pages[0].path, 'index.html');
    assert.equal(pages[0].kind, 'html');
    assert.equal(pages[1].path, 'video/reel.html');
    assert.equal(pages[1].kind, 'hyperframes');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Ponto de restauração Git por tarefa: reverte arquivo modificado e move arquivo novo para .lixeira-coderoom', async () => {
  const repo = await tempDir('cr-ckpt-');
  try {
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@local'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: repo, stdio: 'ignore' });
    await writeFile(join(repo, 'app.js'), 'const versao = 1;\n', 'utf8');
    execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'inicial'], { cwd: repo, stdio: 'ignore' });

    // Mesmo com mudança não-commitada prévia, captureTaskCheckpoint grava o estado exato antes da tarefa!
    await writeFile(join(repo, 'app.js'), 'const versao = 2;\n', 'utf8');
    const ckpt = await captureTaskCheckpoint(repo);
    assert.equal(ckpt?.available, true);
    assert.match(ckpt.tree, /^[0-9a-f]{40}$/);

    // Simula alterações feitas pela tarefa
    await writeFile(join(repo, 'app.js'), 'const versao = 999;\n', 'utf8');
    await writeFile(join(repo, 'novo.txt'), 'gerado-pela-ia', 'utf8');
    const r = await revertTaskChanges(repo, ckpt, {
      files: [
        { path: 'app.js', change: 'modified', bytes: 19 },
        { path: 'novo.txt', change: 'created', bytes: 14 },
      ],
    });
    assert.equal(r.restored, 1);
    assert.equal(r.trashed, 1);
    assert.equal(await readFile(join(repo, 'app.js'), 'utf8'), 'const versao = 2;\n');
    assert.ok(!existsSync(join(repo, 'novo.txt')));
    assert.ok(existsSync(join(repo, '.lixeira-coderoom')));
  } finally {
    await rm(repo, { recursive: true, force: true }).catch(() => {});
  }
});

test('Auto-fallback de cota, HTTPS do Tailscale e Storyboard por cenas', () => {
  const store = new Store(':memory:');
  try {
    assert.equal(pickFallbackProvider(store, 'claude', new Set(['claude', 'codex', 'agy'])), 'codex');
    assert.equal(pickFallbackProvider(store, 'codex', new Set(['codex', 'agy']), { hasExtraDir: true }), null, 'não cai para Antigravity quando há pasta extra');
    assert.equal(pickFallbackProvider(store, 'claude', new Set(['claude', 'codex']), { isFinance: true }), null, 'projeto Financeiro nunca troca de IA sozinho');
  } finally {
    store.close?.();
  }

  const tsBound = [{ ip: '100.96.75.69', kind: 'tailscale' }];
  assert.equal(hostAllowed('ferreira-desktop.taila9eef3.ts.net', 4788, tsBound), true);
  assert.equal(originAllowed('https://ferreira-desktop.taila9eef3.ts.net', 4788, tsBound), true);
  assert.equal(hostAllowed('ferreira-desktop.taila9eef3.ts.net', 4788, []), false, 'rejeita ts.net se Tailscale estiver desligado');
  assert.equal(originAllowed('https://evil.example.com', 4788, tsBound), false);

  assert.equal(extractSceneNumber('cenas/cena-01.png'), 1);
  assert.equal(extractSceneNumber('renders/scene_03.mp4'), 3);
  assert.equal(extractSceneNumber('saida/final.mp4'), null);
  const grouped = groupStoryboardScenes(
    [
      { path: 'cenas/cena-02.mp4', change: 'created', url: '/f/2' },
      { path: 'cenas/cena-01.png', change: 'created', url: '/f/1' },
      { path: 'saida/final.mp4', change: 'created', url: '/f/final' },
      { path: 'roteiro.md', change: 'created', url: '/f/rot' },
    ],
    '# Cena 1\nGancho rápido mostrando o preço.\n# Cena 2\nDemonstração em close-up.',
  );
  assert.equal(grouped.scenes.length, 2);
  assert.equal(grouped.scenes[0].num, 1);
  assert.match(grouped.scenes[0].note, /Gancho rápido/);
  assert.equal(grouped.finals.length, 1);
});

test('Portões de qualidade e Estúdio de Artefatos: valida sintaxe, segredos, HTML mobile e extrai Cue Sheet/blocos', async () => {
  assert.equal(detectTaskDomain('Vídeo', ['roteiro.md']), 'video');
  assert.equal(detectTaskDomain('Geral', ['landing.html']), 'web');

  const art = extractArtifacts(
    '## Roteiro\n[00:00 - 00:03] Você ainda edita na mão? [motion: zoom-impacto]\nCena 2: Mostrando o painel ao vivo\n- [x] Gancho validado\n- [ ] Exportar 9:16\n```js\nconsole.log("ok");\n```',
    [{ path: 'reel.html', change: 'created' }],
  );
  assert.equal(art.cues.length, 2);
  assert.equal(art.cues[0].motion, 'zoom-impacto');
  assert.equal(art.checklist.length, 2);
  assert.equal(art.codeBlocks.length, 1);
  assert.equal(art.htmlFiles.length, 1);

  const dir = await tempDir('cr-qa-');
  try {
    await writeFile(join(dir, 'ok.mjs'), 'export const soma = (a, b) => a + b;\n', 'utf8');
    await writeFile(join(dir, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ok</title></head><body><h1>Oi</h1></body></html>', 'utf8');
    const qaOk = await validateTaskArtifacts(dir, {
      project: { area: 'Programação' },
      result: { deliverables: { files: [{ path: 'ok.mjs', change: 'created' }, { path: 'index.html', change: 'created' }] } },
    });
    assert.equal(qaOk.status, 'ok');
    assert.equal(qaOk.score, 100);

    // Detecta erro de sintaxe + chave exposta + gera fixPrompt objetivo
    await writeFile(join(dir, 'quebrado.mjs'), 'const api = "sk-proj-1234567890abcdefghijklmnop";\nfunction ( {\n', 'utf8');
    const qaBad = await validateTaskArtifacts(dir, {
      project: { area: 'Programação' },
      result: { deliverables: { files: [{ path: 'quebrado.mjs', change: 'modified' }] } },
    });
    assert.equal(qaBad.status, 'bad');
    assert.match(qaBad.fixPrompt, /Segurança/);
    assert.match(qaBad.fixPrompt, /Sintaxe/);
    assert.match(qaSummaryBadge(qaOk), /100%/);
    assert.match(qaSummaryBadge(qaBad), /Qualidade/);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('Pacote .zip em Node puro: compacta textos e mídias com nomes UTF-8 e recupera byte a byte', () => {
  const txt = 'Roteiro com acentuação: introdução e conclusão!\n'.repeat(20);
  const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const zip = buildZip([
    { name: 'roteiro-introdução.md', data: Buffer.from(txt, 'utf8') },
    { name: 'cenas/capa.png', data: bin },
  ]);
  assert.ok(zip.length > 40);
  const parsed = readZipEntries(zip);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'roteiro-introdução.md');
  assert.equal(parsed[0].data.toString('utf8'), txt);
  assert.equal(parsed[1].name, 'cenas/capa.png');
  assert.deepEqual(parsed[1].data, bin);
});
