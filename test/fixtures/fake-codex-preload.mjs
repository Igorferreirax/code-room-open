// Pré-carregado (NODE_OPTIONS=--import) só quando o programa se chama "codex.exe": vira um Codex falso para testes ponta a ponta.
// O servidor roda com o node.exe de verdade e não é afetado.
import { basename } from 'node:path';
if (basename(process.execPath).toLowerCase() === 'codex.exe') {
  await import('./fake-agent.mjs');
  process.exit(0);
}
