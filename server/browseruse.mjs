// Navegador para agentes (opcional, DESLIGADO por padrão e por agente). O Code Room não tem navegador próprio: ele só libera o que a IA do agente já sabe usar.
//  - "isolado": Playwright MCP com perfil descartável (--isolated). Abre um navegador separado, SEM as suas contas logadas nem cookies. Claude Code e Codex.
//  - "chrome":  o seu Chrome de verdade, pela extensão "Claude no Chrome". Enxerga e age nas contas em que você está logado. Só Claude Code.
// Risco de qualquer navegador: uma página maliciosa pode tentar dar ordens ao agente (injeção de instrução). Por isso não vale para projetos Financeiro.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
export const BROWSER_MODES = ['off', 'isolado', 'chrome'];
export const PLAYWRIGHT_ARGS = ['-y', '@playwright/mcp@latest', '--isolated'];
// "npx @playwright/mcp@latest" leva ~25 s só para subir (consulta o registro toda vez) e estoura o tempo de conexão do MCP ("CONNECT_TIMEOUT").
// Com uma cópia já baixada, o node sobe em ~2 s: usamos essa cópia e deixamos o npx só como reserva.
export function findLocalPlaywright({ env = process.env, home = homedir() } = {}) {
  const roots = [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'npm-cache', '_npx'), join(home, '.npm', '_npx')].filter(Boolean), found = [];
  for (const root of roots) { try { for (const d of readdirSync(root)) { const cli = join(root, d, 'node_modules', '@playwright', 'mcp', 'cli.js'); if (existsSync(cli)) found.push({ cli, at: statSync(cli).mtimeMs }); } } catch {} }
  for (const g of [env.APPDATA && join(env.APPDATA, 'npm', 'node_modules', '@playwright', 'mcp', 'cli.js')].filter(Boolean)) { try { if (existsSync(g)) found.push({ cli: g, at: statSync(g).mtimeMs }); } catch {} }
  return found.sort((x, y) => y.at - x.at)[0]?.cli || null;
}
export function playwrightServer(finder = findLocalPlaywright) { const cli = finder(); return cli ? { command: process.execPath, args: [cli, '--isolated'], local: true } : { command: 'npx', args: PLAYWRIGHT_ARGS, local: false }; }
export const BROWSER_LABEL = { off: 'desligado', isolado: 'navegador separado', chrome: 'o seu Chrome' };

export function cleanBrowser(value, provider) {
  const v = value === undefined || value === null || value === '' ? 'off' : value;
  if (!BROWSER_MODES.includes(v)) throw new Error('Navegador inválido. Use desligado, navegador separado ou o seu Chrome.');
  if (v === 'isolado' && !['claude', 'codex'].includes(provider)) throw new Error('O navegador separado só funciona com o Claude Code ou o Codex.');
  if (v === 'chrome' && provider !== 'claude') throw new Error('“Seu Chrome” só funciona com o Claude Code (extensão Claude no Chrome).');
  return v;
}

// Argumentos extras do Claude Code. strict-mcp-config: só o navegador entra (as outras ferramentas MCP do seu Claude não vão junto).
export function claudeBrowserArgs(mode, server = playwrightServer()) {
  if (mode === 'isolado') return ['--strict-mcp-config', '--mcp-config', JSON.stringify({ mcpServers: { playwright: { command: server.command, args: server.args } } }), '--allowedTools', 'mcp__playwright'];
  if (mode === 'chrome') return ['--chrome', '--allowedTools', 'mcp__claude-in-chrome'];
  return [];
}

// Configuração do Codex por -c (vale só para esta execução, não mexe no seu config.toml).
export function codexBrowserArgs(mode, server = playwrightServer()) {
  if (mode !== 'isolado') return [];
  return ['-c', `mcp_servers.playwright.command=${JSON.stringify(server.command)}`, '-c', `mcp_servers.playwright.args=${JSON.stringify(server.args)}`];
}

export const browserNote = mode => mode && mode !== 'off' ? ` Navegador liberado: ${BROWSER_LABEL[mode] || mode}.` : '';
