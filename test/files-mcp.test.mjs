import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeGuard, callTool, handle, TOOLS, filesServer } from '../server/files-mcp.mjs';
import { command } from '../server/connectors.mjs';
import { tempDir } from './helpers.mjs';

test('arquivos: cria pasta e move dentro das pastas autorizadas, sem apagar nem sobrescrever', async () => {
  const root = await tempDir('cr-arq-'), fora = await tempDir('cr-fora-');
  try {
    const desk = join(root, 'Área de Trabalho'); await mkdir(desk);
    await writeFile(join(desk, 'boleto.pdf'), 'pdf'); await writeFile(join(desk, 'foto.jpg'), 'jpg'); await writeFile(join(fora, 'segredo.txt'), 's');
    const g = makeGuard([desk]);
    callTool(g, 'criar_pasta', { caminho: join(desk, 'Documentos') });
    assert.match(callTool(g, 'mover', { de: join(desk, 'boleto.pdf'), para: join(desk, 'Documentos', 'boleto.pdf') }), /Movido/);
    assert.ok(existsSync(join(desk, 'Documentos', 'boleto.pdf')) && !existsSync(join(desk, 'boleto.pdf')));
    callTool(g, 'mover', { de: join(desk, 'foto.jpg'), para: join(desk, 'Imagens', 'foto.jpg') });   // cria a pasta de destino que falta
    assert.ok(existsSync(join(desk, 'Imagens', 'foto.jpg')));
    await writeFile(join(desk, 'boleto.pdf'), 'outro');
    assert.throws(() => callTool(g, 'mover', { de: join(desk, 'boleto.pdf'), para: join(desk, 'Documentos', 'boleto.pdf') }), /nada foi sobrescrito/);
    assert.equal(await readFile(join(desk, 'Documentos', 'boleto.pdf'), 'utf8'), 'pdf', 'o arquivo que já estava lá continua igual');
    assert.throws(() => callTool(g, 'mover', { de: join(fora, 'segredo.txt'), para: join(desk, 'segredo.txt') }), /Fora das pastas autorizadas/);
    assert.throws(() => callTool(g, 'mover', { de: join(desk, 'boleto.pdf'), para: join(fora, 'boleto.pdf') }), /Fora das pastas autorizadas/);
    assert.throws(() => callTool(g, 'criar_pasta', { caminho: join(desk, '..', 'escapou') }), /Fora das pastas autorizadas/);
    assert.throws(() => callTool(g, 'criar_pasta', { caminho: 'relativo' }), /caminho completo/);
    assert.throws(() => callTool(g, 'mover', { de: join(desk, 'Documentos'), para: join(desk, 'Documentos', 'dentro') }), /dentro dela mesma/);
    assert.match(callTool(g, 'listar_pasta', { caminho: desk }), /\[pasta\] Documentos/);
    assert.ok(!TOOLS.some(t => /apagar|excluir|delete|remover/i.test(t.name)), 'não existe ferramenta de apagar');
  } finally { await rm(root, { recursive: true, force: true }); await rm(fora, { recursive: true, force: true }); }
});

test('arquivos: fala MCP (initialize, tools/list, tools/call) e erro vira texto sem derrubar o servidor', async () => {
  const root = await tempDir('cr-arq2-');
  try {
    const g = makeGuard([root]);
    assert.equal(handle(g, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }).result.serverInfo.name, 'arquivos');
    assert.deepEqual(handle(g, { jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools.map(t => t.name), ['listar_pasta', 'criar_pasta', 'mover', 'mover_para_lixeira']);
    const bad = handle(g, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mover', arguments: { de: 'C:\\Windows\\win.ini', para: join(root, 'x') } } });
    assert.equal(bad.result.isError, true); assert.match(bad.result.content[0].text, /Não fiz/);
    assert.equal(handle(g, { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('arquivos: o Claude que edita recebe a ferramenta presa às pastas da tarefa; o de leitura não recebe', () => {
  const catalog = [{ id: 'claude', path: 'claude' }];
  const w = command({ provider: 'claude', mode: 'write' }, 'oi', { catalog, cwd: 'C:\\proj', extraDir: 'C:\\Users\\X\\Desktop' }).args;
  const cfg = JSON.parse(w[w.indexOf('--mcp-config') + 1]).mcpServers.arquivos;
  assert.deepEqual(cfg.args.slice(1), ['C:\\proj', 'C:\\Users\\X\\Desktop']); assert.ok(w.includes('mcp__arquivos'));
  const r = command({ provider: 'claude', mode: 'read' }, 'oi', { catalog, cwd: 'C:\\proj', extraDir: 'C:\\Users\\X\\Desktop' }).args;
  assert.ok(!r.includes('mcp__arquivos'));
  assert.deepEqual(filesServer(['A', null, 'B']).args.slice(1), ['A', 'B']);
});

test('diagnóstico: ruído do Codex (stdin e skills com cabeçalho inválido) vira observação; erro real continua', async () => {
  const { quietStderr } = await import('../server/connectors.mjs');
  const b = String.fromCharCode(92), skill = n => `2026-11-16 ERROR codex_core::session: failed to load skill C:${b}Users${b}Ana${b}.codex${b}skills${b}${n}${b}SKILL.md: missing YAML frontmatter`;
  const out = quietStderr(['Reading prompt from stdin...', skill('editar-igor'), skill('outra'), 'Error: quota exceeded'].join('\n'));
  assert.match(out, /Observação \(não é erro desta tarefa\): 2 skill\(s\).*editar-igor, outra/);
  assert.match(out, /quota exceeded/); assert.ok(!/ERROR codex_core|Reading prompt/.test(out));
  assert.equal(quietStderr('Reading prompt from stdin...'), '', 'só ruído: diagnóstico vazio');
});
