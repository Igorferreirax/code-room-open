import test from 'node:test';
import assert from 'node:assert/strict';
import { command, deniedTool, agyHeadlessNote } from '../server/connectors.mjs';

// Caso real (10/11/2026, máquina limpa): o Pesquisador no Antigravity terminava com “O provedor terminou sem devolver resposta”.
const catalog = [{ id: 'agy', name: 'Antigravity (Gemini)', path: 'C:/fake/agy.exe' }];
const STDERR = 'jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied. Add an allow-rule under permissions.allow in settings.json (e.g. command(<target>)). Alternatively, re-run with --dangerously-skip-permissions to auto-approve all tools.';

test('Antigravity: o pedido leva o aviso de execução sem tela e nunca usa a opção que aprova tudo', () => {
  for (const mode of ['read', 'write']) {
    const c = command({ provider: 'agy', mode, model: '' }, 'Pesquise temas de vídeo.', { cwd: 'C:/proj', catalog });
    const print = JSON.parse(c.input).message.content;
    assert.ok(print.startsWith(agyHeadlessNote(mode)) && print.endsWith('Pesquise temas de vídeo.'));
    assert.match(print, /não crie plano para aprovação/); assert.match(print, /Não rode programas nem comandos de terminal/);
    assert.match(print, mode === 'read' ? /somente leitura: não crie nem altere arquivos/ : /Você pode criar e editar arquivos dentro da pasta do projeto/);
    assert.equal(c.args[c.args.indexOf('--mode') + 1], mode === 'write' ? 'accept-edits' : 'plan');
    assert.equal(c.args[c.args.indexOf('--input-format') + 1], 'stream-json');
    assert.ok(!c.args.join(' ').includes('Pesquise temas'), 'pedido não entra na linha de comando');
    assert.ok(!c.args.some(a => /dangerously/.test(a)), 'nunca aprova todas as ferramentas automaticamente');
  }
});

test('ferramenta negada pelo modo sem tela é reconhecida (e saída comum não é)', () => {
  assert.equal(deniedTool(STDERR), 'command');
  assert.equal(deniedTool('a tool was auto-denied'), 'ferramenta');
  assert.equal(deniedTool('warning: --mode auto is not available for this account'), null); assert.equal(deniedTool(''), null);
});
