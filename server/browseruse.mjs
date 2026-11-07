// Navegador para agentes (opcional, DESLIGADO por padrão e por agente). O Code Room não tem navegador próprio: ele só libera o que a IA do agente já sabe usar.
//  - "isolado": Playwright MCP com perfil descartável (--isolated). Abre um navegador separado, SEM as suas contas logadas nem cookies. Claude Code e Codex.
//  - "chrome":  o seu Chrome de verdade, pela extensão "Claude no Chrome". Enxerga e age nas contas em que você está logado. Só Claude Code.
// Risco de qualquer navegador: uma página maliciosa pode tentar dar ordens ao agente (injeção de instrução). Por isso não vale para projetos Financeiro.
export const BROWSER_MODES = ['off', 'isolado', 'chrome'];
export const PLAYWRIGHT_ARGS = ['-y', '@playwright/mcp@latest', '--isolated'];
export const BROWSER_LABEL = { off: 'desligado', isolado: 'navegador separado', chrome: 'o seu Chrome' };

export function cleanBrowser(value, provider) {
  const v = value === undefined || value === null || value === '' ? 'off' : value;
  if (!BROWSER_MODES.includes(v)) throw new Error('Navegador inválido. Use desligado, navegador separado ou o seu Chrome.');
  if (v === 'isolado' && !['claude', 'codex'].includes(provider)) throw new Error('O navegador separado só funciona com o Claude Code ou o Codex.');
  if (v === 'chrome' && provider !== 'claude') throw new Error('“Seu Chrome” só funciona com o Claude Code (extensão Claude no Chrome).');
  return v;
}

// Argumentos extras do Claude Code. strict-mcp-config: só o navegador entra (as outras ferramentas MCP do seu Claude não vão junto).
export function claudeBrowserArgs(mode) {
  if (mode === 'isolado') return ['--strict-mcp-config', '--mcp-config', JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: PLAYWRIGHT_ARGS } } }), '--allowedTools', 'mcp__playwright'];
  if (mode === 'chrome') return ['--chrome', '--allowedTools', 'mcp__claude-in-chrome'];
  return [];
}

// Configuração do Codex por -c (vale só para esta execução, não mexe no seu config.toml).
export function codexBrowserArgs(mode) {
  if (mode !== 'isolado') return [];
  return ['-c', 'mcp_servers.playwright.command="npx"', '-c', `mcp_servers.playwright.args=${JSON.stringify(PLAYWRIGHT_ARGS)}`];
}

export const browserNote = mode => mode && mode !== 'off' ? ` Navegador liberado: ${BROWSER_LABEL[mode] || mode}.` : '';
