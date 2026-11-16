import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionedFolder } from '../public/chat-paths.js';
import { classifyFailure } from '../server/connectors.mjs';

const known = { desktop: 'C:\\Users\\X\\Desktop', downloads: 'C:\\Users\\X\\Downloads', documents: 'C:\\Users\\X\\Documents' };

test('chat: palavras soltas não pedem autorização de pasta', () => {
  for (const t of ['Crie um documento de requisitos', 'No app desktop quando atualiza, a logo não aparece', 'Arrume a página de downloads da landing', 'Escreva os documentos do projeto', 'Gere a versão desktop'])
    assert.equal(mentionedFolder(t, known), '', t);
});

test('chat: frases de pasta de verdade apontam a pasta certa', () => {
  assert.equal(mentionedFolder('Organize os arquivos da minha Área de Trabalho', known), known.desktop);
  assert.equal(mentionedFolder('salve no desktop', known), known.desktop);
  assert.equal(mentionedFolder('Mova o PDF da pasta Downloads', known), known.downloads);
  assert.equal(mentionedFolder('procure nos downloads', known), known.downloads);
  assert.equal(mentionedFolder('Leia o contrato em meus documentos', known), known.documents);
});

test('chat: caminho com espaço sem aspas vem inteiro, sem as palavras do pedido', () => {
  assert.equal(mentionedFolder('Organize C:\\Users\\Igor\\Desktop\\Code Room e crie um README', known), 'C:\\Users\\Igor\\Desktop\\Code Room');
  assert.equal(mentionedFolder('Veja C:\\Projetos\\Meu App.', known), 'C:\\Projetos\\Meu App');
  assert.equal(mentionedFolder('Use "D:\\Fotos e Vídeos\\2026" para o álbum', known), 'D:\\Fotos e Vídeos\\2026');
  assert.equal(mentionedFolder('abra C:/dados/relatorios, depois resuma', known), 'C:/dados/relatorios');
});

test('falhas: só erro de login de verdade vira "auth"', () => {
  for (const t of ['not logged in', 'Not logged in · Please run /login', 'Error: 401 Unauthorized', 'Invalid API key', 'authentication failed', 'Your session has expired'])
    assert.equal(classifyFailure(t), 'auth', t);
  for (const t of ['Criei a página de login com o formulário', 'O botão Sign in ficou alinhado', 'Salvei as credentials no .env.example'])
    assert.equal(classifyFailure(t), null, t);
});
