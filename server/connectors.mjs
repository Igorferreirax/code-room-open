import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { effortsFor } from './effort.mjs';
const effortOf = agent => effortsFor(agent.provider).includes(agent.effort) ? agent.effort : '';   // só níveis conhecidos chegam à linha de comando
import { customConnectors, buildCustomCommand, getSpec, isCustom, findProgram, launcher } from './providers.mjs';
import { loadHermesFile, sshArgs, findSsh } from './hermes.mjs';
import { claudeBrowserArgs, codexBrowserArgs } from './browseruse.mjs';

export function executable(name, candidates = []) {
  return [...candidates, ...(process.env.PATH || '').split(delimiter).map(d => join(d, process.platform === 'win32' ? name + '.exe' : name))].find(p => p && existsSync(p)) || null;
}
// Hermes Agent roda em um servidor remoto (via SSH). Host, chave e caminho vêm do wrapper que você já usa (hermes.bat); nada disso é copiado para o banco.
let hermesDir = null; export const setHermesDir = d => { hermesDir = d; };
function hermesConfig() {
  try {
    const saved = loadHermesFile(hermesDir);   // configuração feita dentro do app (Conexões) tem prioridade sobre o hermes.bat
    if (saved) { const ssh = findSsh() || executable('ssh'); return ssh ? { ssh, ...saved, port: String(saved.port), source: 'app' } : null; }
    const text = readFileSync(join(homedir(), 'bin', 'hermes.bat'), 'utf8'), get = k => text.match(new RegExp(`set "${k}=([^"]+)"`, 'i'))?.[1]?.replace(/%USERPROFILE%/gi, homedir());
    const ssh = [join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe')].find(existsSync) || executable('ssh');
    const key = get('SSH_KEY'), host = get('SSH_HOST'), bin = get('HERMES_BIN'), port = text.match(/ssh [^\r\n]*? -p (\d+)/)?.[1] || '22';
    return ssh && key && host && bin && existsSync(key) ? { ssh, key, host, bin, port } : null;
  } catch { return null; }
}
export const REMOTE_PROVIDERS = ['hermes']; // não enxergam arquivos deste computador
export function connectors() {
  const home = homedir(), hermes = hermesConfig();
  return [
    { id: 'codex', name: 'Codex', path: executable('codex', [join(home, 'AppData', 'Local', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')]), skills: 'Configuração nativa + skills selecionadas', permissions: 'Sandbox somente leitura ou escrita no projeto. Aprovações interativas ainda não disponíveis.', capabilities: { resume: true, interactiveApproval: false, reportsModel: false, reportsCost: false, cancel: 'process-tree' } },
    { id: 'claude', name: 'Claude Code', path: executable('claude', [join(home, 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), join(home, '.local', 'bin', 'claude.exe')]), skills: 'Configuração nativa + skills selecionadas', permissions: 'Políticas nativas; solicitações adicionais são negadas nesta versão.', capabilities: { resume: true, interactiveApproval: false, reportsModel: true, reportsCost: true, cancel: 'process-tree' } },
    { id: 'agy', name: 'Antigravity (Gemini)', path: executable('agy', [join(home, 'AppData', 'Local', 'agy', 'bin', 'agy.exe')]), skills: 'Skills selecionadas entram no prompt', permissions: 'Modo plano (leitura) ou aceitar edições no projeto. Aprovações interativas não estão disponíveis.', capabilities: { resume: true, interactiveApproval: false, reportsModel: false, reportsCost: false, cancel: 'process-tree' } },
    { id: 'hermes', name: 'Hermes Agent (servidor remoto)', path: hermes?.ssh || null, remote: hermes, skills: 'Skills selecionadas entram no prompt (só texto)', permissions: 'Roda isolado em um servidor remoto: NÃO enxerga arquivos deste computador. Só leitura e texto. Não é usado em projetos Financeiro.', capabilities: { resume: false, interactiveApproval: false, reportsModel: true, reportsCost: false, cancel: 'process-tree' } },
    ...customConnectors(),
  ];
}

// resumeId: id da sessão anterior do MESMO provedor. Codex: `exec resume <id>` (não aceita --sandbox, então o modo vai por -c). Claude: --resume <id>.
export function command(agent, prompt, { resumeId = null, cwd = null, timeoutMs = 20 * 60 * 1000 } = {}) {
  const provider = connectors().find(c => c.id === agent.provider);
  if (!provider?.path) throw Object.assign(new Error('CLI indisponível. Instale e autentique o provedor no terminal.'), { failureKind: 'executable_missing' });
  if (isCustom(agent.provider)) { const spec = getSpec(agent.provider); if (!spec) throw Object.assign(new Error('Esta IA foi removida de Conexões.'), { failureKind: 'executable_missing' }); return buildCustomCommand(spec, agent, prompt); }
  const mode = agent.mode === 'write' ? 'workspace-write' : 'read-only';
  let args;
  if (agent.provider === 'codex') {
    args = resumeId ? ['exec', 'resume', '--json', '--skip-git-repo-check', '-c', `sandbox_mode="${mode}"`] : ['exec', '--json', '--color', 'never', '--skip-git-repo-check', '--sandbox', mode];
    if (agent.model) args.push('--model', agent.model);
    { const e = effortOf(agent); if (e) args.push('-c', `model_reasoning_effort="${e}"`); }
    args.push(...codexBrowserArgs(agent.browser));
    if (resumeId) args.push(resumeId);
    args.push('-');
  } else if (agent.provider === 'agy') {
    // O Antigravity recebe o prompt como argumento (não lê da entrada padrão): limite de linha de comando do Windows.
    if (prompt.length > 28000) throw Object.assign(new Error('Prompt grande demais para o Antigravity (limite ~28 mil caracteres). Reduza as skills ou o contexto.'), { failureKind: 'prompt_too_long' });
    args = ['--output-format', 'json', '--mode', agent.mode === 'write' ? 'accept-edits' : 'plan', '--print-timeout', `${Math.max(30, Math.ceil(timeoutMs / 1000))}s`];
    if (cwd) args.push('--add-dir', cwd);
    if (agent.model) args.push('--model', agent.model);
    { const e = effortOf(agent); if (e) args.push('--effort', e); }
    if (resumeId) args.push('--conversation', resumeId);
    args.push(`--print=${prompt}`);
    return { file: provider.path, args, input: '' };
  } else if (agent.provider === 'hermes') {
    // Prompt pela entrada padrão (--query-file -): nada passa pelo shell remoto, então aspas, $(...) e quebras de linha chegam intactas.
    const r = provider.remote; if (!r) throw Object.assign(new Error('Hermes não configurado: o arquivo bin\hermes.bat não foi encontrado.'), { failureKind: 'executable_missing' });
    const budget = Math.max(30, Math.floor(timeoutMs / 1000) - 10), q = `${r.bin} chat --query-file - --oneshot -Q --format stream-json --max-turns 12 --run-budget ${budget}`;
    return { file: r.ssh, args: sshArgs(r, q), input: prompt };
  } else {
    // No modo de planejamento (agente somente leitura) o Claude nega toda ferramenta MCP, mesmo liberada. Com MCP liberado, o agente de leitura roda em acceptEdits e as ferramentas de editar arquivo ficam proibidas.
    const mcpOn = (agent.mcpTools || []).some(s => /^[\w-]{1,40}$/.test(s));
    args = ['--print', '--verbose', '--output-format', 'stream-json', '--permission-mode', agent.mode === 'write' || mcpOn ? 'acceptEdits' : 'plan', '--permission-prompts', 'none'];
    if (mcpOn && agent.mode !== 'write') args.push('--disallowedTools', 'Edit,Write,NotebookEdit');
    // Programas liberados para este agente (lista curta definida por quem cria o agente). Só o prefixo exato, sem encadear comandos.
    for (const prog of agent.commands || []) if (/^[\w.-]{1,40}$/.test(prog)) for (const tool of ['Bash', 'PowerShell']) args.push('--allowedTools', `${tool}(${prog}:*)`);
    // Ferramentas MCP liberadas por servidor (ex.: flow-studio). Sem isso o Claude, sem ninguém para aprovar, nega toda ferramenta MCP.
    for (const srv of agent.mcpTools || []) if (/^[\w-]{1,40}$/.test(srv)) args.push('--allowedTools', `mcp__${srv}`);
    args.push(...claudeBrowserArgs(agent.browser));
    if (agent.model) args.push('--model', agent.model);
    { const e = effortOf(agent); if (e) args.push('--effort', e); }
    if (resumeId) args.push('--resume', resumeId);
  }
  return { file: provider.path, args, input: prompt };
}

// Distingue falha de autenticação e de limite do restante, para o usuário saber o que corrigir.
export function classifyFailure(text = '') {
  if (/not logged in|log ?in|sign ?in|unauthori[sz]ed|\b401\b|authentication|invalid api key|credential/i.test(text)) return 'auth';
  if (/rate.?limit|usage limit|quota|\b429\b|too many requests/i.test(text)) return 'rate_limit';
  return null;
}

export function normalize(provider, e) {
  if (provider === 'agy') {
    // JSON único no fim: { conversation_id, status, response, usage }
    if (!('conversation_id' in e) && !('status' in e)) return null;
    const out = []; if (e.conversation_id) out.push({ type: 'session', text: e.conversation_id });
    if (e.status && e.status !== 'SUCCESS') out.push({ type: 'error', text: String(e.response || e.error || `Antigravity terminou com estado ${e.status}.`).trim() });
    else if (e.response) out.push({ type: 'answer', text: String(e.response).trim() });
    if (e.usage) out.push({ type: 'usage', usage: { input: e.usage.input_tokens ?? null, output: e.usage.output_tokens ?? null, cached: e.usage.cache_read_tokens ?? null, thinking: e.usage.thinking_tokens ?? null, cost: null } });
    return out;
  }
  if (provider === 'hermes') {
    // Confirmado na prática: {"type":"system","subtype":"init","model","session_id"}. O resto segue o formato stream-json e é tratado de forma tolerante.
    if (e.type === 'system' && e.subtype === 'init') return { type: 'session', text: e.session_id || '', model: e.model || null };
    if (e.type === 'result') return e.is_error ? { type: 'error', text: String(e.result || e.error || 'Falha do Hermes') } : { type: 'result', text: String(e.result ?? e.text ?? e.response ?? '').trim(), ...(e.usage ? { usage: { input: e.usage.input_tokens ?? null, output: e.usage.output_tokens ?? null, cached: null, cost: null } } : {}) };
    if (e.type === 'error') return { type: 'error', text: String(e.message || e.error || 'Falha do Hermes') };
    if (e.type === 'assistant' || (e.type === 'message' && e.role === 'assistant')) {
      const c = e.message?.content ?? e.content, text = typeof c === 'string' ? c : (c || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
      return text ? { type: 'answer', text: text.trim() } : null;
    }
    return null;
  }
  if (provider === 'codex') {
    if (e.type === 'thread.started') return { type: 'session', text: e.thread_id };
    if (e.type === 'item.completed' && e.item?.type === 'agent_message') return { type: 'answer', text: e.item.text };
    if (e.type === 'turn.completed') return { type: 'usage', usage: { input: e.usage?.input_tokens ?? null, output: e.usage?.output_tokens ?? null, cached: e.usage?.cached_input_tokens ?? null, cost: null } };
    if (e.type === 'error' || e.type === 'turn.failed') return { type: 'error', text: e.message || e.error?.message || 'Falha do provedor' };
    if (e.item?.type === 'command_execution') return { type: 'activity', text: `${e.item.command || 'Comando'}\n${e.item.aggregated_output || ''}` };
  } else {
    if (e.type === 'system' && e.subtype === 'init') return { type: 'session', text: e.session_id, model: e.model };
    if (e.type === 'assistant') {
      const text = (e.message?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      const tools = (e.message?.content || []).filter(c => c.type === 'tool_use').map(c => c.name).join(', ');
      if (text || tools) return { type: 'activity', text: text || `Ferramentas: ${tools}` };
    }
    if (e.type === 'result') return { type: e.is_error ? 'error' : 'result', text: e.result || e.errors?.join('\n') || '', usage: { input: e.usage?.input_tokens ?? null, output: e.usage?.output_tokens ?? null, cached: e.usage?.cache_read_input_tokens ?? null, cacheWrite: e.usage?.cache_creation_input_tokens ?? null, cost: e.total_cost_usd ?? null } };
  }
  return null;
}

// Rótulo do custo: o valor reportado por um CLI de assinatura é referência de API, não cobrança.
export function labelUsage(provider, usage) {
  if (!usage) return null;
  return { ...usage, source: 'provider', costKind: usage.cost == null ? null : 'api-equivalent-not-billing', provider };
}

function run(file, args, timeout = 10000) {
  return new Promise(resolve => execFile(file, args, { windowsHide: true, timeout, env: process.env }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || '').trim() })));
}

// Verificação sem chamada ao modelo: versão e estado de login pelos comandos oficiais.
export async function check() {
  const result = [];
  for (const c of connectors()) {
    if (!c.path) { result.push({ id: c.id, installed: false, path: null, version: null, authenticated: null, method: null }); continue; }
    if (c.custom) { const l = launcher(c.path), v = l ? await run(l.file, [...l.pre, ...(c.spec.versionArgs || ['--version'])], 15000) : { out: '' }; result.push({ id: c.id, installed: true, path: c.path, version: v.out.split(String.fromCharCode(10))[0] || null, authenticated: null, method: 'conta ou chave da própria IA (o Code Room não guarda credenciais)', custom: true }); continue; }
    const version = c.id === 'hermes' ? await run(c.path, sshArgs(c.remote, `${c.remote.bin} --version`, { connectTimeout: 10 }), 15000) : await run(c.path, ['--version']);
    let authenticated = null, method = null;
    if (c.id === 'codex') {
      const s = await run(c.path, ['login', 'status']);
      const text = s.out + ' ' + s.err;
      authenticated = /logged in/i.test(text) && !/not logged in/i.test(text);
      method = text.match(/using (\w[\w .-]*)/i)?.[1] || null;
    } else if (c.id === 'agy') {
      const s = await run(c.path, ['models'], 20000);   // só lista modelos; exige estar conectado
      authenticated = /gemini|claude|gpt/i.test(s.out) && !/not logged|sign in|login/i.test(s.out + s.err); method = authenticated ? 'conta Google (Antigravity)' : null;
    } else if (c.id === 'hermes') {
      authenticated = null; method = 'SSH para o servidor remoto (a chave fica no seu computador)';
    } else {
      const s = await run(c.path, ['auth', 'status']);
      try { const j = JSON.parse(s.out); authenticated = !!j.loggedIn; method = j.authMethod || null; } catch { authenticated = null; }
    }
    result.push({ id: c.id, installed: true, path: c.path, version: version.out.split('\n')[0] || null, authenticated, method });
  }
  // Detecta (sem conector) outras ferramentas que o usuário possa ter, só para informar na tela.
  const gem = executable('gemini');
  if (gem) { const v = await run(gem, ['--version']); result.push({ id: 'gemini', installed: true, path: gem, version: v.out.split(String.fromCharCode(10))[0] || null, authenticated: null, method: null, supported: false }); }
  else result.push({ id: 'gemini', installed: false, path: null, version: null, authenticated: null, method: null, supported: false });
  return result;
}
