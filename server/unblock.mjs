// Quando um agente do Claude Code é bloqueado (não há ninguém para aprovar no meio do trabalho), o Claude informa o que foi negado.
// Aqui isso vira uma sugestão clara: "liberar o programa yt-dlp", "liberar o servidor MCP vidiq", "liberar a pesquisa na web".
// A pessoa decide com um clique; nada é liberado sozinho. Programas que dão controle total do computador não são oferecidos.

// Interpretadores e comandos que apagam, mudam o sistema ou executam qualquer coisa: liberar um deles anularia a proteção.
export const NEVER = new Set(['powershell', 'pwsh', 'cmd', 'bash', 'sh', 'zsh', 'wsl', 'wscript', 'cscript', 'mshta', 'rundll32', 'regsvr32', 'reg', 'regedit', 'format', 'diskpart', 'del', 'erase', 'rd', 'rmdir', 'rm', 'shutdown', 'taskkill', 'schtasks', 'sc', 'net', 'netsh', 'certutil', 'bitsadmin', 'icacls', 'takeown', 'runas', 'sudo', 'eval', 'invoke-expression', 'iex', 'start-process', 'sudo']);
const SHELLS = new Set(['Bash', 'PowerShell']);

const firstProgram = cmd => {
  const m = String(cmd ?? '').trim().match(/^(?:&\s*)?(?:"([^"]+)"|'([^']+)'|(\S+))/); if (!m) return '';
  let p = (m[1] || m[2] || m[3] || '').replace(/\\/g, '/').split('/').pop().replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
  return p;
};

// denials: [{ tool_name, tool_input }] como vem no evento final do Claude.
export function suggestUnblocks(denials) {
  const out = [], seen = new Set();
  const add = o => { const k = o.kind + ':' + o.value; if (!seen.has(k)) { seen.add(k); out.push(o); } };
  for (const d of Array.isArray(denials) ? denials.slice(0, 40) : []) {
    const tool = String(d?.tool_name ?? d?.tool ?? ''), input = d?.tool_input ?? d?.input ?? {};
    if (SHELLS.has(tool)) {
      const prog = firstProgram(input.command);
      if (!prog) continue;
      if (!/^[\w.-]{1,40}$/.test(prog)) continue;
      if (NEVER.has(prog)) add({ kind: 'never', value: prog, label: `O programa “${prog}” dá controle total do computador; o Code Room não oferece liberá-lo. Peça de outro jeito.` });
      else add({ kind: 'command', value: prog, label: `Liberar o programa “${prog}” para este agente rodar no terminal` });
    } else if (/^mcp__[\w-]{1,40}__/.test(tool)) {
      const srv = tool.match(/^mcp__([\w-]{1,40})__/)[1]; add({ kind: 'mcp', value: srv, label: `Liberar as ferramentas do servidor MCP “${srv}” para este agente` });
    } else if (tool === 'WebSearch' || tool === 'WebFetch') add({ kind: 'web', value: 'web', label: 'Liberar a pesquisa na web (buscar e ler páginas) para este agente' });
  }
  return out;
}

// Aplica as liberações escolhidas ao agente. Valida de novo no servidor (a tela não é confiável) e respeita o projeto Financeiro.
export function applyUnblocks(store, { agentId, project, items }) {
  const agent = store.get('agents', agentId); if (!agent) throw new Error('Agente não encontrado.');
  if (agent.id.startsWith('assistant-')) throw new Error('O Assistente tem as próprias liberações (modo piloto).');
  const next = { ...agent, commands: [...(agent.commands || [])], mcpTools: [...(agent.mcpTools || [])] }, done = [];
  for (const it of Array.isArray(items) ? items.slice(0, 10) : []) {
    const kind = String(it?.kind), value = String(it?.value ?? '');
    if (kind === 'command') {
      if (!/^[\w.-]{1,40}$/.test(value) || NEVER.has(value.toLowerCase())) throw new Error(`O programa “${value}” não pode ser liberado.`);
      if (agent.provider !== 'claude') throw new Error('A lista de programas só vale para o Claude Code.');
      if (next.commands.length >= 10) throw new Error('Este agente já tem 10 programas liberados.');
      if (!next.commands.includes(value)) next.commands.push(value); done.push(`programa ${value}`);
    } else if (kind === 'mcp') {
      if (!/^[\w-]{1,40}$/.test(value)) throw new Error('Nome de servidor MCP inválido.');
      if (agent.provider !== 'claude') throw new Error('Ferramentas MCP só valem para o Claude Code.');
      if (project?.area === 'Financeiro') throw new Error('Projeto financeiro: ferramentas MCP externas não são permitidas.');
      if (!next.mcpTools.includes(value)) next.mcpTools.push(value); done.push(`MCP ${value}`);
    } else if (kind === 'web') {
      if (agent.provider !== 'claude') throw new Error('Pesquisar na web só vale para o Claude Code.');
      if (project?.area === 'Financeiro') throw new Error('Projeto financeiro: pesquisa na web não é permitida.');
      next.web = true; done.push('pesquisa na web');
    } else throw new Error('Liberação desconhecida.');
  }
  if (!done.length) throw new Error('Nada para liberar.');
  store.put('agents', { ...next, revision: (agent.revision || 0) + 1 });
  return { ok: true, released: done };
}
