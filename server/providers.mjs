// Conectar outras IAs de linha de comando além de Codex, Claude Code e Antigravity.
// A pessoa escolhe uma da lista (ou descreve a sua): programa, como enviar o pedido e argumentos. Nada passa por shell:
// o programa é executado direto, com os argumentos exatos, e o pedido vai por argumento ({prompt}) ou pela entrada padrão.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, delimiter, isAbsolute, extname, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';

export const CUSTOM_PREFIX = 'x-', MAX_CUSTOM = 10, MAX_ARG_PROMPT = 24000;
export const isCustom = id => typeof id === 'string' && id.startsWith(CUSTOM_PREFIX);

// Sugestões das IAs de terminal mais usadas. São PONTOS DE PARTIDA: as opções mudam entre versões, por isso existe o botão Testar.
export const CATALOG = [
  { key: 'gemini', name: 'Gemini CLI', exe: 'gemini', promptVia: 'arg', args: ['-p', '{prompt}'], modelFlag: '--model', install: 'npm install -g @google/gemini-cli', login: 'Rode `gemini` uma vez e entre com a sua conta Google.' },
  { key: 'opencode', name: 'OpenCode', exe: 'opencode', promptVia: 'arg', args: ['run', '{prompt}'], modelFlag: '--model', install: 'npm install -g opencode-ai', login: 'Rode `opencode auth login` e escolha o provedor.' },
  { key: 'qwen', name: 'Qwen Code', exe: 'qwen', promptVia: 'arg', args: ['-p', '{prompt}'], modelFlag: '--model', install: 'npm install -g @qwen-code/qwen-code', login: 'Rode `qwen` uma vez e entre.' },
  { key: 'amp', name: 'Amp', exe: 'amp', promptVia: 'arg', args: ['-x', '{prompt}'], modelFlag: '', install: 'npm install -g @sourcegraph/amp', login: 'Rode `amp login`.' },
  { key: 'copilot', name: 'GitHub Copilot CLI', exe: 'copilot', promptVia: 'arg', args: ['-p', '{prompt}'], modelFlag: '--model', install: 'npm install -g @github/copilot', login: 'Rode `copilot` e use /login.' },
  { key: 'aider', name: 'Aider', exe: 'aider', promptVia: 'arg', args: ['--message', '{prompt}', '--yes-always', '--no-pretty'], modelFlag: '--model', install: 'python -m pip install aider-install  (depois: aider-install)', login: 'Aider usa a chave da API do modelo escolhido, em variável de ambiente.' },
  { key: 'goose', name: 'Goose', exe: 'goose', promptVia: 'arg', args: ['run', '-t', '{prompt}'], modelFlag: '', install: 'Veja as instruções de instalação do projeto Goose.', login: 'Rode `goose configure`.' },
];

// ---------- registro em memória (o servidor carrega do banco e atualiza ao salvar) ----------
let registry = [];
export const setCustom = list => { registry = Array.isArray(list) ? list.filter(s => s && isCustom(s.id)) : []; };
export const customSpecs = () => registry;
export const getSpec = id => registry.find(s => s.id === id) || null;

// ---------- achar e iniciar o programa (Windows: .exe direto; atalhos .cmd do npm viram "node script.js") ----------
export function findProgram(name) {
  if (!name) return null;
  if (isAbsolute(name)) return existsSync(name) && statSync(name).isFile() ? name : null;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.com'] : [''];
  for (const dir of (process.env.PATH || '').split(delimiter)) for (const e of exts) { const p = join(dir, name + e); if (dir && existsSync(p)) return p; }
  return null;
}
// Devolve { file, pre } para executar sem shell; null se o formato não for suportado com segurança.
export function launcher(path) {
  if (!path) return null; const ext = extname(path).toLowerCase();
  if (ext !== '.cmd' && ext !== '.bat') return { file: path, pre: [] };
  let text = ''; try { text = readFileSync(path, 'utf8'); } catch { return null; }
  const m = text.match(/"%~?dp0%?\\?([^"\r\n]+?\.(?:c|m)?js)"/i); if (!m) return null;
  const script = join(dirname(path), m[1].replace(/\\/g, '/').replace(/^\//, '')); return existsSync(script) ? { file: process.execPath, pre: [script] } : null;
}

// ---------- validação do que a pessoa cadastra ----------
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
export function validateSpec(b, existing = []) {
  const name = String(b?.name ?? '').trim(); if (!name || name.length > 60) throw new Error('Dê um nome de até 60 caracteres.');
  const exe = String(b?.exe ?? '').trim();
  if (!(/^[\w.-]{1,60}$/.test(exe) || (isAbsolute(exe) && exe.length < 500 && !/[\0"<>|*?]/.test(exe)))) throw new Error('Programa: informe o nome do comando (ex.: gemini) ou o caminho completo do .exe.');
  const promptVia = b?.promptVia === 'stdin' ? 'stdin' : 'arg';
  const args = Array.isArray(b?.args) ? b.args.map(a => String(a)) : []; if (args.length > 16 || args.some(a => !a.length || a.length > 200 || a.includes('\0') || /[\r\n]/.test(a))) throw new Error('Argumentos: até 16, cada um com até 200 caracteres e sem quebra de linha.');
  const uses = args.filter(a => a.includes('{prompt}')).length;
  if (promptVia === 'arg' && uses !== 1) throw new Error('Em “pedido por argumento”, use {prompt} exatamente uma vez nos argumentos (ex.: -p {prompt}).');
  if (promptVia === 'stdin' && uses) throw new Error('Em “pedido pela entrada padrão”, não use {prompt} nos argumentos.');
  const modelFlag = String(b?.modelFlag ?? '').trim(); if (modelFlag && !/^-{1,2}[\w-]{1,30}$/.test(modelFlag)) throw new Error('Opção de modelo inválida (ex.: --model).');
  const list = k => { const v = Array.isArray(b?.[k]) ? b[k].map(String) : []; if (v.length > 8 || v.some(a => !a.length || a.length > 100 || a.includes('{prompt}') || /[\r\n\0]/.test(a))) throw new Error('Argumentos extras: até 8, curtos e sem {prompt}.'); return v; };
  const id = b?.id && isCustom(b.id) && existing.some(s => s.id === b.id) ? b.id : (() => { const base = CUSTOM_PREFIX + (slug(name) || 'ia'); let id = base, n = 2; while (existing.some(s => s.id === id)) id = `${base}-${n++}`; return id; })();
  if (!existing.some(s => s.id === id) && existing.length >= MAX_CUSTOM) throw new Error(`Limite de ${MAX_CUSTOM} IAs próprias.`);
  if (existing.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe uma IA com esse nome.');
  return { id, name, exe, promptVia, args, modelFlag, readArgs: list('readArgs'), writeArgs: list('writeArgs'), versionArgs: list('versionArgs').length ? list('versionArgs') : ['--version'], createdAt: existing.find(s => s.id === id)?.createdAt || new Date().toISOString() };
}

// ---------- entrada para connectors() e comando de execução ----------
export function customConnectors() {
  return registry.map(s => { const found = findProgram(s.exe), l = found ? launcher(found) : null;
    return { id: s.id, name: s.name, path: l ? found : null, custom: true, unsupported: found && !l ? 'O programa é um atalho .cmd que o Code Room não sabe iniciar com segurança. Aponte para o .exe ou ajuste.' : null,
      skills: 'Skills selecionadas entram no prompt (só texto)', permissions: 'IA conectada por você. O Code Room não consegue forçar o modo somente leitura nela: ele confere os arquivos depois e avisa se algo foi alterado.',
      capabilities: { resume: false, structuredOutput: false, usage: false, planMode: false, jsonStream: false }, spec: s }; });
}
export function buildCustomCommand(spec, agent, prompt) {
  const found = findProgram(spec.exe), l = found ? launcher(found) : null;
  if (!l) throw Object.assign(new Error(found ? 'O programa é um atalho .cmd não suportado. Aponte para o .exe.' : `Programa “${spec.exe}” não encontrado. Instale e confira em Conexões.`), { failureKind: 'executable_missing' });
  if (spec.promptVia === 'arg' && prompt.length > MAX_ARG_PROMPT) throw Object.assign(new Error('Pedido grande demais para enviar por argumento (limite do Windows). Use “pedido pela entrada padrão” ou reduza as skills e o contexto.'), { failureKind: 'prompt_too_long' });
  const extra = agent.mode === 'write' ? spec.writeArgs : spec.readArgs;
  const args = [...l.pre, ...spec.args.map(a => a.replace('{prompt}', () => prompt)), ...(extra || [])];
  if (agent.model && spec.modelFlag) args.push(spec.modelFlag, agent.model);
  return { file: l.file, args, input: spec.promptVia === 'stdin' ? prompt : '' };
}

// Testa de verdade: manda um pedido mínimo e devolve o que a IA respondeu (ou o erro). Usa uma pasta vazia e tempo curto.
export function testSpec(spec, cwd, { timeoutMs = 60000, launch = spawn } = {}) {
  return new Promise(resolve => {
    let cmd; try { cmd = buildCustomCommand(spec, { mode: 'read', model: '' }, 'Responda apenas com a palavra OK.'); } catch (e) { return resolve({ ok: false, error: e.message, output: '', ms: 0 }); }
    const t0 = Date.now(); let out = '', err = '', done = false;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); resolve({ ...r, ms: Date.now() - t0 }); };
    let child; try { child = launch(cmd.file, cmd.args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: process.env }); } catch (e) { return resolve({ ok: false, error: e.message, output: '', ms: 0 }); }
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish({ ok: false, error: `Sem resposta em ${Math.round(timeoutMs / 1000)} s (a IA pode estar esperando login ou confirmação).`, output: out.trim().slice(-600) }); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdout.on('data', c => { out = (out + c).slice(-20000); }); child.stderr.on('data', c => { err = (err + c).slice(-4000); }); child.stdin.on('error', () => {});
    child.on('error', e => finish({ ok: false, error: e.message, output: '' }));
    child.on('close', code => finish(code === 0 && out.trim() ? { ok: true, output: out.trim().slice(-600) } : { ok: false, error: code === 0 ? 'A IA terminou sem responder.' : (err.trim().slice(-300) || `O programa terminou com código ${code}.`), output: out.trim().slice(-600) }));
    child.stdin.end(cmd.input);
  });
}

// Catálogo com o estado de instalação (para a tela).
export function catalogView() {
  return CATALOG.map(c => { const found = findProgram(c.exe); return { ...c, installed: !!found, supported: !!(found && launcher(found)), added: registry.some(s => s.exe === c.exe) }; });
}
export const basenameOf = p => p ? basename(p) : null;
