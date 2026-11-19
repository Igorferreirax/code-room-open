import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { ApiLibrary } from '../server/apilib.mjs';
import { transcribeGroq, cleanTranscript, audioExt, GROQ_URL, GROQ_MODEL } from '../server/voice-transcribe.mjs';
import { tempDir } from './helpers.mjs';

const res = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const wav = Buffer.from('RIFF....WAVEfmt ');

test('voz pelo Groq: manda o áudio com o modelo turbo em português e devolve o texto limpo', async () => {
  let seen;
  const fetchFn = async (url, opts) => { seen = { url, opts }; return res({ text: '  abre o terminal   do projeto ' }); };
  const r = await transcribeGroq(wav, 'audio/wav', { key: 'gsk_teste12345', fetchFn });
  assert.equal(r.text, 'abre o terminal do projeto'); assert.equal(r.provider, 'groq');
  assert.equal(seen.url, GROQ_URL); assert.equal(seen.opts.headers.Authorization, 'Bearer gsk_teste12345');
  assert.equal(seen.opts.body.get('model'), GROQ_MODEL); assert.equal(seen.opts.body.get('language'), 'pt');
  assert.equal(seen.opts.body.get('file').name, 'fala.wav');
});

test('voz pelo Groq: sem chave, formato estranho ou chave recusada viram mensagens claras', async () => {
  await assert.rejects(transcribeGroq(wav, 'audio/wav', {}), /Sem chave/);
  await assert.rejects(transcribeGroq(wav, 'text/plain', { key: 'x'.repeat(10), fetchFn: async () => res({}) }), /Formato/);
  await assert.rejects(transcribeGroq(wav, 'audio/webm', { key: 'x'.repeat(10), fetchFn: async () => res({ error: { message: 'bad' } }, 401) }), /recusada/);
  await assert.rejects(transcribeGroq(wav, 'audio/webm', { key: 'x'.repeat(10), fetchFn: async () => res({}, 429) }), e => e.status === 429);
});

test('voz: descarta as frases que o Whisper inventa no silêncio e reconhece os formatos', () => {
  assert.equal(cleanTranscript('Obrigado por assistir.'), ''); assert.equal(cleanTranscript('...'), ''); assert.equal(cleanTranscript('Oi Nico'), 'Oi Nico');
  assert.equal(audioExt('audio/webm;codecs=opus'), 'webm'); assert.equal(audioExt('audio/wav'), 'wav'); assert.equal(audioExt('application/json'), '');
});

test('biblioteca de APIs: keyFor devolve a chave do serviço só para uso interno', async () => {
  const dir = await tempDir('voz'), store = new Store(':memory:'); const lib = new ApiLibrary(store, { dataDir: dir });
  assert.equal(lib.keyFor('groq'), '');
  await lib.save({ service: 'groq', key: 'gsk_primeira123' }); await lib.save({ service: 'openai', key: 'sk-outra123456' });
  assert.equal(lib.keyFor('groq'), 'gsk_primeira123');
  assert.ok(!JSON.stringify(lib.list()).includes('gsk_primeira123'));
});
