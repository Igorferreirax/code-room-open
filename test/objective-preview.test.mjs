import test from 'node:test';
import assert from 'node:assert/strict';
import { objectivePreview } from '../server/tasks.mjs';

test('telas mostram o pedido da pessoa, não o prompt interno do Nico nem o roteiro do repasse', () => {
  assert.equal(objectivePreview('Você é o ASSISTENTE do Code Room em MODO PILOTO...\n=== PERGUNTA DA PESSOA ===\n  organiza a pasta X '), 'organiza a pasta X');
  assert.equal(objectivePreview('Você recebeu o trabalho de Diretor (Motion) por uma ligação entre agentes. Faça a sua parte como Revisor: leia tudo'), 'Continuar o trabalho de Diretor (Motion) (como Revisor)');
  assert.equal(objectivePreview('Você é o ASSISTENTE do Code Room em MODO PILOTO, rodando'), 'Pedido ao Nico');
  assert.equal(objectivePreview('Criar a página'), 'Criar a página');
  assert.equal(objectivePreview('x'.repeat(300)).length, 200);
});

test('linha do tempo: cada ferramenta do Claude aparece com o alvo (arquivo, comando ou busca)', async () => {
  const { toolLabel } = await import('../server/connectors.mjs');
  assert.equal(toolLabel({ name: 'Edit', input: { file_path: String.raw`C:\proj\src\app.js` } }), 'Edit app.js');
  assert.equal(toolLabel({ name: 'Bash', input: { command: 'npm   test' } }), 'Bash npm test');
  assert.equal(toolLabel({ name: 'Grep', input: { pattern: 'TODO' } }), 'Grep TODO');
  assert.equal(toolLabel({ name: 'mcp__arquivos__mover', input: {} }), 'arquivos/mover');
});

test('segurança: a chave de acesso nunca é escrita no log do serviço', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../server/main.mjs', import.meta.url), 'utf8');
  for (const line of src.split('\n').filter(l => /console\.(log|error|warn)\(/.test(l))) assert.ok(!/\$\{key\}/.test(line), 'console imprime a chave: ' + line.trim().slice(0, 80));
});
