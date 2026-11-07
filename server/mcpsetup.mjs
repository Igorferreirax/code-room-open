import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Ativação do MCP: cria um token PRÓPRIO de aparelho (não a chave principal) e grava em <dados>/mcp-token,
// onde o servidor MCP (server/mcp.mjs) o lê. Aparece em "Aparelhos pareados" e pode ser revogado.
export const MCP_PREFIX = 'MCP · ';
const mcpDevices = devices => devices.list().filter(d => String(d.name).startsWith(MCP_PREFIX));

export function mcpInfo({ dataDir, devices, node, script }) {
  const tokenFile = join(dataDir, 'mcp-token');
  const active = existsSync(tokenFile) && mcpDevices(devices).length > 0;
  const q = s => `"${s}"`;
  const snip = escrever => ({
    claude: `claude mcp add code-room -- ${q(node)} ${q(script)}${escrever ? ' --escrever' : ''}`,
    json: JSON.stringify({ mcpServers: { 'code-room': { command: node, args: escrever ? [script, '--escrever'] : [script] } } }, null, 2),
    codex: `[mcp_servers.code-room]\ncommand = '${node}'\nargs = [${escrever ? `'${script}', '--escrever'` : `'${script}'`}]`
  });
  return { active, device: active ? devices.view(mcpDevices(devices)[0]) : null, node, script, leitura: snip(false), escrita: snip(true) };
}

export function mcpActivate({ dataDir, devices, node, script }) {
  for (const d of mcpDevices(devices)) devices.revoke(d.id.slice(7)); // um só MCP ativo por vez
  const { code } = devices.createCode();
  const { token } = devices.redeem(code, `${MCP_PREFIX}Claude Code, Codex e outras ferramentas`, '127.0.0.1');
  writeFileSync(join(dataDir, 'mcp-token'), token + '\n', { encoding: 'utf8', mode: 0o600 });
  return mcpInfo({ dataDir, devices, node, script });
}

export function mcpDeactivate({ dataDir, devices, node, script }) {
  for (const d of mcpDevices(devices)) devices.revoke(d.id.slice(7));
  rmSync(join(dataDir, 'mcp-token'), { force: true });
  return mcpInfo({ dataDir, devices, node, script });
}
