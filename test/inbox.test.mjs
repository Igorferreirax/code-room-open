import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewerProblems } from '../server/reviewnotes.mjs';
import { proactiveAlerts } from '../server/assistant.mjs';
import { pendingList, pendingBadges, needsYou, railHtml } from '../public/views.js';

// Trecho real da revisão do teste de vídeo de 07/11 (formato que o revisor usa).
const REAL = `# Revisão técnica, rodada 1

## Critérios de aceite

| Critério | Evidência | Resultado |
|---|---|---|
| Duração 30 s (±1) | ffprobe | OK |

## Problemas (não bloqueiam o aceite)

1. **O \`RELATORIO.md\` descreve o áudio de forma imprecisa.**
- Ele diz "senoide de 220 a 330 Hz", e o resumo do Produtor diz "sobe de 220 para 330 Hz a cada 3 s".
- Em \`filtro.txt\`, a frequência é \`220+110*floor(t/3)\`.
2. **O texto do relatório e do resumo diz que as linhas ficam alinhadas à esquerda dentro do bloco.**
- A imagem confirma isso.
3. **O texto é grande, mas ocupa pouco da tela.**
- A fonte tem 120–130 px em 1080 de largura.
4. **\`filtro.txt\` usa caminhos relativos à raiz do projeto**, então só reproduz a geração se rodado dessa pasta.
5. **O \`POST.md\` está correto**, com título e legenda curtos.

## Conclusão

Os quatro critérios de aceite estão atendidos.

VEREDITO: APROVADO`;

test('pontos do revisor: pega só os problemas numerados, uma frase cada, dentro de 480 caracteres e sem markdown', () => {
  const r = reviewerProblems(REAL);
  assert.ok(r.text.length > 0 && r.text.length <= 480, `tamanho ${r.text.length}`);
  assert.match(r.text, /^Pontos do revisor: 1\) O RELATORIO\.md descreve o áudio de forma imprecisa\./);
  assert.match(r.text, /2\) O texto do relatório/); assert.match(r.text, /3\) O texto é grande/);
  assert.doesNotMatch(r.text, /\*\*|`/, 'sem markdown');
  assert.doesNotMatch(r.text, /senoide/, 'não leva os detalhes das linhas com traço');
  assert.ok(r.count >= 3);
});

test('pontos do revisor: sem seção de problemas, ou com texto vazio, não devolve nada', () => {
  assert.deepEqual(reviewerProblems('Tudo certo.\n\nVEREDITO: APROVADO'), { text: '', count: 0 });
  assert.deepEqual(reviewerProblems(''), { text: '', count: 0 });
  assert.deepEqual(reviewerProblems(undefined), { text: '', count: 0 });
  assert.equal(reviewerProblems('## Problemas\n\nnenhum\n\nVEREDITO: APROVADO').count, 0);
});

test('pontos do revisor: com só marcadores (sem numeração) também funciona; um item gigante é cortado', () => {
  const r = reviewerProblems('## Problemas\n- Falta o arquivo capa.jpg na pasta saida.\n- O áudio está baixo.\n');
  assert.match(r.text, /1\) Falta o arquivo capa\.jpg na pasta saida\./); assert.match(r.text, /2\) O áudio está baixo\./);
  const big = reviewerProblems('## Problemas\n1. ' + 'x'.repeat(2000) + '\n');
  assert.ok(big.text.length <= 480);
});

const run = (over = {}) => ({ id: 'r1', status: 'completed', kind: 'work', review: null, step: null, deliverables: [{ path: 'a.txt' }], ...over });
const ctx = (state = {}) => ({ state, ui: {} });

test('Precisa de você agora: entrega concluída sem revisão, plano proposto e receita esperando entram; o resto não', () => {
  const items = pendingList(ctx({ runs: [run(), run({ id: 'r2' }), run({ id: 'r3', review: { status: 'approved' } }), run({ id: 'r4', step: 'review' }), run({ id: 'r5', status: 'running' }), run({ id: 'r6', deliverables: [] }), run({ id: 'r7', kind: 'plan' })], plans: [{ status: 'proposed' }, { status: 'accepted' }], recipeRuns: [{ name: 'Semanal', status: 'waiting' }, { name: 'Outra', status: 'done' }] }));
  assert.equal(items.find(i => i.deliveries).n, 2, 'duas entregas para revisar (aprovada, revisão, rodando, sem arquivo e plano ficam de fora)');
  assert.equal(items.filter(i => /plano/.test(i.text)).length, 1);
  assert.equal(items.filter(i => /Receita/.test(i.text)).length, 1);
  assert.deepEqual(pendingBadges(ctx({ runs: [run(), run({ id: 'r2' })], plans: [{ status: 'proposed' }] })), { room: 3, deliveries: 2 });
  assert.equal(needsYou(ctx({ runs: [run()] })).includes('1 entrega para revisar'), true);
  assert.equal(needsYou(ctx({})), '', 'sem pendência o cartão some');
  assert.deepEqual(pendingBadges(ctx({})), { room: 0, deliveries: 0 });
});

test('barra lateral: o contador aparece só onde há pendência e fica descrito para leitor de tela', () => {
  const html = railHtml('room', { room: 3, deliveries: 12 });
  assert.match(html, /<span class="rb" aria-hidden="true">3<\/span>/); assert.match(html, /9\+/);
  assert.match(html, /aria-label="Sala de agentes, 3 pendentes"/);
  assert.doesNotMatch(railHtml('room', {}), /class="rb"/);
});

test('Assistente avisa de entregas para revisar e planos para aceitar (resposta local, sem gastar cota)', () => {
  const w = { runs: [{ id: 'a', status: 'completed', review: false, step: null, files: 2, updatedAt: new Date().toISOString() }, { id: 'b', status: 'completed', review: true, files: 1 }, { id: 'c', status: 'completed', review: false, step: 'review', files: 1 }], plansProposed: 2 };
  const al = proactiveAlerts(w);
  const rev = al.find(a => a.id.startsWith('review:')), pl = al.find(a => a.id.startsWith('plans:'));
  assert.ok(rev && /1 entrega para revisar/.test(rev.title)); assert.equal(rev.ask, '/pendencias', 'não manda para a IA');
  assert.ok(pl && /2 planos/.test(pl.title));
  assert.equal(proactiveAlerts({ runs: [{ id: 'z', status: 'completed', review: true, files: 1 }] }).some(a => /^review:|^plans:/.test(a.id)), false);
});

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.mjs';

test('HTTP: GET /api/tasks/:id/reviewer-notes devolve os pontos do revisor da entrega (e vazio para quem não tem revisão)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-revnotes-')), port = 19000 + Math.floor(Math.random() * 10000), now = new Date().toISOString();
  const seed = new Store(join(dir, 'code-room.sqlite'));
  const ag = { id: 'ag1', name: 'Revisor Técnico' }, pj = { id: 'pj1', name: 'P', area: 'Geral' };
  seed.put('tasks', { id: 'dev1', status: 'completed', project: pj, agent: { id: 'ag0', name: 'Produtor' }, objective: 'faça', createdAt: now, updatedAt: now });
  seed.put('tasks', { id: 'rev1', status: 'completed', step: 'review', dependsOn: ['dev1'], project: pj, agent: ag, objective: 'revise', createdAt: now, updatedAt: now, result: { summary: REAL } });
  seed.put('tasks', { id: 'solo', status: 'completed', project: pj, agent: ag, objective: 'x', createdAt: now, updatedAt: now });
  seed.close();
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`, headers = { 'X-Code-Room-Key': key };
    assert.equal((await fetch(`${base}/api/tasks/dev1/reviewer-notes`)).status, 401, 'exige a chave');
    const r = await fetch(`${base}/api/tasks/dev1/reviewer-notes`, { headers }); assert.equal(r.status, 200);
    const j = await r.json(); assert.equal(j.reviewer, 'Revisor Técnico'); assert.match(j.text, /^Pontos do revisor: 1\) /); assert.ok(j.count >= 3);
    assert.deepEqual(await (await fetch(`${base}/api/tasks/solo/reviewer-notes`, { headers })).json(), { reviewer: null, text: '', count: 0 });
    assert.equal((await fetch(`${base}/api/state`, { headers })).status, 200, 'o resto das rotas GET continua respondendo');
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); }
});

test('entregas antigas (mais de 14 dias) sem revisão não contam como pendência, nem na tela nem no aviso do Assistente', () => {
  const old = new Date(Date.now() - 20 * 86400000).toISOString(), fresh = new Date().toISOString();
  assert.equal(pendingList(ctx({ runs: [run({ createdAt: old }), run({ id: 'n', createdAt: fresh })] })).find(i => i.deliveries).n, 1);
  assert.equal(pendingList(ctx({ runs: [run({ createdAt: old })] })).length, 0);
  assert.equal(proactiveAlerts({ runs: [{ id: 'o', status: 'completed', review: false, files: 1, createdAt: old, updatedAt: old }] }).some(a => /^review:/.test(a.id)), false);
});

import { NAV_GROUPS } from '../public/views.js';
test('menu lateral: 3 grupos com separadores, todos os 13 destinos continuam acessíveis e o contador segue no botão', () => {
  const html = railHtml('room', { room: 2, deliveries: 1 }), ids = [...html.matchAll(/data-nav="(\w+)"/g)].map(m => m[1]);
  assert.equal((html.match(/class="rail-sep"/g) || []).length, 2); assert.equal(ids.length, 13); assert.equal(new Set(ids).size, 13);
  assert.deepEqual(NAV_GROUPS.flat().sort(), ['agents', 'connections', 'deliveries', 'home', 'projects', 'recipes', 'room', 'routines', 'settings', 'skills', 'tasks', 'teams', 'usage']);
  assert.match(html, /aria-label="Entregas, 1 pendente"/); assert.match(html, /aria-current="page"/);
});

test('pendência de entrega abre direto a mais recente (arquivo de resultado antes de logs e scripts)', () => {
  const mk = (id, at, files) => run({ id, updatedAt: at, deliverables: files.map(path => ({ path })) });
  const items = pendingList(ctx({ runs: [mk('velha', '2026-11-01T10:00:00Z', ['a.md']), mk('nova', '2026-11-09T10:00:00Z', ['debug.log', 'gerar.py', 'final.mp4'])] }));
  const it = items.find(i => i.deliveries); assert.equal(it.key, 'nova|final.mp4');
  assert.match(needsYou(ctx({ runs: [mk('nova', '2026-11-09T10:00:00Z', ['final.mp4'])] })), /data-act="pend-open" data-id="nova\|final\.mp4"/);
});
