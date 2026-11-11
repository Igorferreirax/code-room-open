import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSpec, setCustom, getSpec, findProgram, launcher, buildCustomCommand, testSpec, customConnectors, catalogView, CATALOG, MAX_CUSTOM, isCustom } from '../server/providers.mjs';
import { command, connectors } from '../server/connectors.mjs';
import { splitArgs, joinArgs, formFromCatalog, payloadFromForm, providersCardHtml, providerDialogHtml, testResultHtml, emptyForm } from '../public/providers-ui.js';
import { setup, addProject, tempDir, waitFor, status } from './helpers.mjs';
import { createTask } from '../server/tasks.mjs';

const NODE = process.execPath;
const spec = (o = {}) => validateSpec({ name: 'Minha IA', exe: NODE, promptVia: 'arg', args: ['-e', 'console.log("eco:" + process.argv[1])', '{prompt}'], ...o }, []);

test('cadastro: valida nome, programa, argumentos e o uso de {prompt}; gera id próprio e único', () => {
  const s = spec(); assert.equal(s.id, 'x-minha-ia'); assert.equal(s.promptVia, 'arg'); assert.deepEqual(s.versionArgs, ['--version']); assert.ok(isCustom(s.id));
  assert.throws(() => validateSpec({ name: 'Minha IA', exe: 'gemini', promptVia: 'arg', args: ['-p', '{prompt}'] }, [s]), /Já existe uma IA com esse nome/);
  assert.equal(validateSpec({ name: 'Outra', exe: 'gemini', promptVia: 'arg', args: ['-p', '{prompt}'] }, [s]).id, 'x-outra');
  assert.equal(validateSpec({ name: 'Minha IA', id: s.id, exe: 'gemini', promptVia: 'arg', args: ['-p', '{prompt}'] }, [s]).id, s.id, 'editar mantém o id');
  const bad = (o, re) => assert.throws(() => validateSpec({ name: 'X', exe: 'gemini', promptVia: 'arg', args: ['-p', '{prompt}'], ...o }, []), re);
  bad({ name: '' }, /nome/); bad({ name: 'a'.repeat(61) }, /nome/); bad({ exe: 'a b; rm -rf' }, /Programa/); bad({ exe: 'a|b' }, /Programa/); bad({ exe: '..\\x' }, /Programa/);
  bad({ args: ['-p'] }, /exatamente uma vez/); bad({ args: ['{prompt}', '{prompt}'] }, /exatamente uma vez/); bad({ promptVia: 'stdin', args: ['{prompt}'] }, /não use \{prompt\}/);
  bad({ args: Array(17).fill('-x').concat('{prompt}') }, /até 16/); bad({ args: ['-p', '{prompt}', 'a\nb'] }, /até 16/); bad({ modelFlag: 'model' }, /Opção de modelo/); bad({ writeArgs: ['x{prompt}'] }, /Argumentos extras/);
  const many = Array.from({ length: MAX_CUSTOM }, (_, i) => ({ id: `x-a${i}`, name: `A${i}` })); assert.throws(() => validateSpec({ name: 'Nova', exe: 'g', args: ['{prompt}'] }, many), /Limite/);
});

test('comando: o pedido vai exatamente como está (sem shell), por argumento ou pela entrada padrão, com modelo e argumentos por modo', () => {
  const evil = 'oi"; rm -rf / & echo $(whoami) `x` %PATH% \n linha 2';
  const a = buildCustomCommand(spec({ modelFlag: '--model', readArgs: ['--ro'], writeArgs: ['--rw'] }), { mode: 'read', model: 'm1' }, evil);
  assert.equal(a.file, NODE); assert.equal(a.input, ''); assert.deepEqual(a.args, ['-e', 'console.log("eco:" + process.argv[1])', evil, '--ro', '--model', 'm1']);
  assert.ok(buildCustomCommand(spec({ writeArgs: ['--rw'] }), { mode: 'write' }, 'x').args.includes('--rw'));
  const s = buildCustomCommand(validateSpec({ name: 'Stdin', exe: NODE, promptVia: 'stdin', args: ['-e', '1'] }, []), { mode: 'read' }, evil); assert.equal(s.input, evil); assert.ok(!s.args.includes(evil));
  assert.throws(() => buildCustomCommand(spec(), { mode: 'read' }, 'x'.repeat(24001)), /grande demais/);
  assert.throws(() => buildCustomCommand(validateSpec({ name: 'Nada', exe: 'programa-que-nao-existe-xyz', promptVia: 'arg', args: ['{prompt}'] }, []), { mode: 'read' }, 'x'), /não encontrado/);
});

test('atalho .cmd do npm vira "node script.js" sem shell; .cmd desconhecido não é executado', async () => {
  const dir = await tempDir('shim'); mkdirSync(join(dir, 'node_modules', 'pkg', 'dist'), { recursive: true }); writeFileSync(join(dir, 'node_modules', 'pkg', 'dist', 'index.js'), 'console.log(1)');
  writeFileSync(join(dir, 'ia.cmd'), '@ECHO off\r\nSETLOCAL\r\nSET dp0=%~dp0\r\n"%_prog%"  "%dp0%\\node_modules\\pkg\\dist\\index.js" %*\r\n'); writeFileSync(join(dir, 'estranho.cmd'), '@echo off\r\ncalc.exe\r\n');
  const l = launcher(join(dir, 'ia.cmd')); assert.equal(l.file, NODE); assert.equal(l.pre.length, 1); assert.match(l.pre[0].replace(/\\/g, '/'), /node_modules\/pkg\/dist\/index\.js$/);
  assert.equal(launcher(join(dir, 'estranho.cmd')), null); assert.deepEqual(launcher('C:/x/y.exe'), { file: 'C:/x/y.exe', pre: [] }); assert.equal(launcher(null), null);
  assert.equal(findProgram(join(dir, 'nao-existe.exe')), null); assert.equal(findProgram(join(dir, 'ia.cmd')), join(dir, 'ia.cmd'));
});

test('botão Testar: uma IA que responde passa; que falha, não responde ou demora, mostra o motivo', async () => {
  const dir = await tempDir('t');
  const ok = await testSpec(spec(), dir); assert.equal(ok.ok, true); assert.match(ok.output, /eco:Responda apenas com a palavra OK\./);
  const stdin = await testSpec(validateSpec({ name: 'S', exe: NODE, promptVia: 'stdin', args: ['-e', 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log("leu:"+d))'] }, []), dir); assert.equal(stdin.ok, true); assert.match(stdin.output, /leu:Responda/);
  const fail = await testSpec(validateSpec({ name: 'F', exe: NODE, promptVia: 'arg', args: ['-e', 'console.error("sem login"); process.exit(3)', '{prompt}'] }, []), dir); assert.equal(fail.ok, false); assert.match(fail.error, /sem login/);
  const mute = await testSpec(validateSpec({ name: 'M', exe: NODE, promptVia: 'arg', args: ['-e', '1', '{prompt}'] }, []), dir); assert.equal(mute.ok, false); assert.match(mute.error, /sem responder/);
  const slow = await testSpec(validateSpec({ name: 'L', exe: NODE, promptVia: 'arg', args: ['-e', 'setTimeout(()=>{},20000)', '{prompt}'] }, []), dir, { timeoutMs: 700 }); assert.equal(slow.ok, false); assert.match(slow.error, /Sem resposta em/);
  const gone = await testSpec(validateSpec({ name: 'G', exe: 'programa-que-nao-existe-xyz', promptVia: 'arg', args: ['{prompt}'] }, []), dir); assert.equal(gone.ok, false); assert.match(gone.error, /não encontrado/);
});

test('integração: a IA própria aparece em connectors(), o comando sai do conector e o Runner executa e guarda a resposta em texto puro', async () => {
  const s = spec(); setCustom([s]);
  try {
    const c = connectors().find(x => x.id === s.id); assert.ok(c && c.custom && c.path, 'conector custom com o programa achado'); assert.equal(getSpec(s.id).name, 'Minha IA'); assert.ok(customConnectors().length >= 1);
    const cmd = command({ provider: s.id, mode: 'read', model: '' }, 'olá mundo'); assert.equal(cmd.args.at(-1), 'olá mundo');
    const { store, runner } = await setup({ runnerOpts: { buildCommand: command } }); const project = await addProject(store, 'p');
    store.put('agents', { id: 'x1', name: 'Própria', role: 'teste', room: 'Geral', provider: s.id, model: '', instructions: '', mode: 'read', skillIds: [], commands: [], capabilities: [], revision: 1 });
    const { task } = createTask(store, { projectId: project.id, agentId: 'x1', requestId: 'r-custom', objective: 'primeira linha\nsegunda' }); void runner.pump();
    await waitFor(() => ['completed', 'failed'].includes(status(store, task.id)), 20000, 'tarefa da IA própria'); const t = store.get('tasks', task.id); assert.equal(t.status, 'completed', JSON.stringify(t.reason));
    const att = store.get('runs', t.result.attemptId); assert.match(att.answer, /eco:/);
  } finally { setCustom([]); }
  assert.equal(connectors().some(x => x.custom), false, 'removida do registro some dos conectores');
});

test('catálogo: cada sugestão tem programa, argumentos válidos com {prompt}, comando de instalar e de entrar; o estado de instalação é calculado', () => {
  assert.ok(CATALOG.length >= 6); const seen = new Set();
  for (const c of CATALOG) { assert.ok(!seen.has(c.key) && !seen.has(c.exe), c.key); seen.add(c.key); seen.add(c.exe); assert.ok(c.install && c.login, c.key); assert.doesNotThrow(() => validateSpec({ name: c.name, exe: c.exe, promptVia: c.promptVia, args: c.args, modelFlag: c.modelFlag }, []), c.key); }
  const v = catalogView(); assert.equal(v.length, CATALOG.length); assert.ok(v.every(x => typeof x.installed === 'boolean' && typeof x.added === 'boolean'));
});

test('tela: separar argumentos respeita aspas; formulário vira o corpo da requisição; cartão e janela escapam HTML e mostram o resultado do teste', () => {
  assert.deepEqual(splitArgs('-p {prompt} --nome "a b" \'c d\''), ['-p', '{prompt}', '--nome', 'a b', 'c d']); assert.equal(joinArgs(['-p', '{prompt}', 'a b']), '-p {prompt} "a b"'); assert.deepEqual(splitArgs(''), []);
  const gemini = CATALOG.find(c => c.key === 'gemini'), f = formFromCatalog(gemini); assert.equal(f.exe, 'gemini'); assert.deepEqual(payloadFromForm(f).args, ['-p', '{prompt}']); assert.ok(!('id' in payloadFromForm(f)));
  const ctx = { providers: { catalog: [{ ...gemini, installed: true, supported: true, added: false }], custom: [{ id: 'x-a', name: '<b>Nome</b>', exe: 'a', installed: false, usedBy: 2, args: [], promptVia: 'arg' }] }, ui: { provForm: f, provTest: { 'x-a': { ok: false, error: '<img src=x>' } } } };
  const card = providersCardHtml(ctx); assert.ok(!card.includes('<b>Nome</b>') && !card.includes('<img src=x>')); assert.match(card, /data-act="prov-test" data-id="x-a"/); assert.match(card, /2 agente\(s\) usam/); assert.match(card, /CLI não encontrada/);
  const dlg = providerDialogHtml(ctx); assert.match(dlg, /CLI encontrada/); assert.match(dlg, /npm install -g @google\/gemini-cli/); assert.match(dlg, /não consegue impedir/); assert.match(dlg, /data-act="prov-test-form"/); assert.match(dlg, /provider-search/);
  const kiro = CATALOG.find(c => c.key === 'kiro'), kf = formFromCatalog(kiro), kd = providerDialogHtml({ providers: { catalog: [{ ...kiro, installed: true, supported: true, added: false }], custom: [] }, ui: { provForm: kf, provCli: { kiro: { authenticated: true, message: 'Login confirmado.' } } } });
  assert.match(kd, /Entrar no Kiro/); assert.match(kd, /Verificar login/); assert.match(kd, /Atualizar CLI/); assert.match(kd, /Adicionar ao Code Room/); assert.match(kd, /Windows 11/); assert.match(kd, /Configuração avançada/);
  assert.match(providersCardHtml({ providers: { custom: [{ id: 'x-gone', name: 'CLI ausente', exe: 'gone', installed: false }] }, ui: {} }), /Pedir ajuda ao Assistente/);
  assert.match(testResultHtml({ ok: true, output: 'OK', ms: 1500 }), /Respondeu em 1[.,]5 s/); assert.match(testResultHtml({ running: true }), /Testando/); assert.match(providersCardHtml({ providers: { custom: [] }, ui: {} }), /Nenhuma IA extra/);
  assert.equal(emptyForm().promptVia, 'arg');
});
