// “Testar resposta” das IAs embutidas (Codex, Claude Code, Antigravity): manda um pedido mínimo, em somente leitura e numa pasta
// temporária vazia, pelo MESMO comando que as tarefas usam. Assim o erro de login, de modelo ou de permissão aparece na hora,
// e não na primeira tarefa. Gasta uma resposta curta da cota da IA; só roda quando a pessoa pede ou ao criar um agente.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { command, normalize, classifyFailure, deniedTool } from './connectors.mjs';

const ASK = 'Responda apenas com a palavra OK.';
const HINT = {
  auth: 'A CLI está sem login ou a sessão expirou. Em Conexões, clique em “Abrir terminal e entrar” e teste de novo.',
  rate_limit: 'O provedor informou limite ou cota atingida. Espere a cota voltar ou use outra IA.',
  tool_denied: 'A CLI tentou usar uma ferramenta que a execução sem tela não pode aprovar.',
  timeout: 'A IA não respondeu a tempo. Ela pode estar esperando login ou confirmação no terminal.',
  model: 'O modelo informado pode não existir nesta conta. Deixe o modelo em branco para usar o padrão.',
};

export function testResponse(agent, { cwd, timeoutMs = 120000, launch = spawn, catalog = null } = {}) {
  return new Promise(resolve => {
    const t0 = Date.now(); let done = false, timer = null;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); resolve({ provider: agent.provider, ms: Date.now() - t0, ...r, hint: r.ok ? null : (HINT[r.failureKind] || (agent.model && /model/i.test(r.error || '') ? HINT.model : null)) }); };
    let cmd; try { cmd = command({ ...agent, mode: 'read' }, ASK, { cwd, timeoutMs, catalog }); } catch (e) { return finish({ ok: false, error: e.message, failureKind: e.failureKind || 'internal' }); }
    if (!cmd?.file) return finish({ ok: false, error: 'CLI não encontrada neste computador.', failureKind: 'executable_missing' });
    let child; try { child = launch(cmd.file, cmd.args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: process.env }); } catch (e) { return finish({ ok: false, error: e.message, failureKind: 'spawn_error' }); }
    timer = setTimeout(() => { finish({ ok: false, error: `Sem resposta em ${Math.round(timeoutMs / 1000)} s.`, failureKind: 'timeout' }); try { child.kill(); } catch {} }, timeoutMs);
    let buffer = '', stderr = '', answer = '', errorText = null, model = null;
    const consume = line => { let raw; try { raw = JSON.parse(line); } catch { return; } for (const e of [].concat(normalize(agent.provider, raw) || [])) { if (e.type === 'error') errorText = e.text; if (['answer', 'result'].includes(e.type) && e.text) answer = e.text; if (e.model) model = e.model; } };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdin.on('error', () => {});
    child.stdout.on('data', c => { buffer = (buffer + c).slice(-400000); const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(consume); });
    child.stderr.on('data', c => { stderr = (stderr + c).slice(-8000); });
    child.on('error', e => finish({ ok: false, error: e.code === 'ENOENT' ? 'CLI não encontrada neste computador.' : e.message, failureKind: e.code === 'ENOENT' ? 'executable_missing' : 'spawn_error' }));
    child.on('close', code => {
      if (buffer) consume(buffer);
      if (answer && !errorText && code === 0) return finish({ ok: true, answer: answer.slice(0, 200), model: model || configuredModel(agent) });
      const denied = deniedTool(stderr), error = (errorText || stderr.trim().replace(/\s+/g, ' ').slice(-400) || (code === 0 ? 'A IA terminou sem responder.' : `O programa terminou com código ${code}.`));
      finish({ ok: false, error, failureKind: denied ? 'tool_denied' : classifyFailure(error) || (code === 0 ? 'no_output' : 'exit_code') });
    });
    child.stdin.end(cmd.input || '');
  });
}

// O Codex não informa o modelo na saída. Quando o agente não escolheu um, o que vale é o `model` do config.toml dele.
export function codexConfigModel(home = homedir()) {
  try { const file = join(home, '.codex', 'config.toml'); if (!existsSync(file)) return null; const m = readFileSync(file, 'utf8').split(/\r?\n/).find(l => /^\s*model\s*=/.test(l)); return m?.match(/=\s*"([^"]{1,80})"/)?.[1] || null; } catch { return null; }
}
export function configuredModel(agent, home) {
  if (agent?.model) return agent.model;
  if (agent?.provider === 'codex') { const m = codexConfigModel(home); return m ? `${m} (padrão do Codex)` : null; }
  return null;
}
