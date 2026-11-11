import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceSupport, stripForSpeech, pickVoice, speak, cancelSpeech, createDictation } from '../public/voice.js';
import { composerBar } from '../public/views.js';
import { chatHeaderHtml } from '../public/chat-ui.js';

test('suporte: ditado, leitura e endereço seguro (o microfone só funciona em https ou localhost)', () => {
  assert.deepEqual(voiceSupport({}), { stt: false, tts: false, secure: true });
  assert.deepEqual(voiceSupport({ webkitSpeechRecognition: function () {}, speechSynthesis: {}, SpeechSynthesisUtterance: function () {}, isSecureContext: false }), { stt: true, tts: true, secure: false });
});

test('resumo falado: tira markdown, código, links, tabelas e emojis; no máximo 3 frases curtas; avisa que o resto está na tela', () => {
  const md = '## Resultado\n\n**Feito:** criei o `teste-piloto.txt` ✅. Veja https://exemplo.com/x e [o guia](https://a.b).\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconsole.log(1)\n```\n\n- primeiro item.\n- segundo item. Terceira frase aqui. Quarta frase que não cabe. Quinta.';
  const t = stripForSpeech(md); assert.doesNotMatch(t, /[#*`|]|https?:|console/); assert.match(t, /^Resultado Feito: criei o/); assert.match(t, /O resto está na tela\.$/); assert.ok(t.length <= 360, t);
  assert.equal(stripForSpeech('Tudo certo.'), 'Tudo certo.'); assert.equal(stripForSpeech(''), ''); assert.equal(stripForSpeech('```x```'), '');
  assert.match(stripForSpeech('a'.repeat(900)), /O resto está na tela\.$/);
});

test('voz: prefere "Natural" e online em pt-BR, depois qualquer pt; respeita a escolha da pessoa; sem voz em português devolve null', () => {
  const vs = [{ name: 'Microsoft David', lang: 'en-US' }, { name: 'Microsoft Maria', lang: 'pt-BR', localService: true }, { name: 'Google português do Brasil', lang: 'pt-BR', localService: false }, { name: 'Microsoft Francisca Online (Natural)', lang: 'pt-BR', localService: false }, { name: 'Microsoft Helia', lang: 'pt-PT' }];
  assert.equal(pickVoice(vs).name, 'Microsoft Francisca Online (Natural)'); assert.equal(pickVoice(vs, 'Microsoft Helia').name, 'Microsoft Helia');
  assert.equal(pickVoice(vs.filter(v => !/Natural|Google/.test(v.name))).name, 'Microsoft Maria'); assert.equal(pickVoice([{ name: 'X', lang: 'en-US' }]), null); assert.equal(pickVoice([]), null);
});

test('leitura: cancela a fala anterior, usa a voz escolhida e limita a velocidade', () => {
  const calls = []; const win = { SpeechSynthesisUtterance: function (t) { this.text = t; }, speechSynthesis: { cancel: () => calls.push('cancel'), getVoices: () => [{ name: 'Maria', lang: 'pt-BR' }], speak: u => calls.push(u) }, isSecureContext: true };
  assert.equal(speak(win, 'Olá', { rate: 9 }), true); assert.equal(calls[0], 'cancel'); assert.equal(calls[1].text, 'Olá'); assert.equal(calls[1].rate, 1.5); assert.equal(calls[1].voice.name, 'Maria'); assert.equal(calls[1].lang, 'pt-BR');
  assert.equal(speak({}, 'x'), false); assert.equal(speak(win, ''), false); cancelSpeech({}); cancelSpeech(win);
});

test('ditado: resultado parcial vira texto, erros viram mensagens claras e "sem fala" não incomoda', () => {
  let rec; const SR = function () { rec = this; this.start = () => this.onstart(); this.stop = () => this.onend(); };
  const got = [], states = [], errs = []; const d = createDictation({ SpeechRecognition: SR }, { onText: (t, f) => got.push([t, f]), onState: s => states.push(s), onError: e => errs.push(e) });
  assert.equal(rec.lang, 'pt-BR'); assert.equal(rec.interimResults, true); d.start(); assert.equal(d.listening, true);
  rec.onresult({ results: [[{ transcript: 'crie um ' }], Object.assign([{ transcript: 'projeto' }], { isFinal: true })] }); assert.deepEqual(got.at(-1), ['crie um projeto', true]);
  rec.onerror({ error: 'no-speech' }); rec.onerror({ error: 'not-allowed' }); rec.onerror({ error: 'network' }); assert.equal(errs.length, 2); assert.match(errs[0], /bloqueou o microfone/); assert.match(errs[1], /internet/);
  d.stop(); assert.deepEqual(states, [true, false]); assert.equal(createDictation({}, {}), null);
});

test('telas: microfone no campo de mensagem (desligado com motivo fora de endereço seguro) e interruptor de voz no cabeçalho do Assistente', () => {
  const base = { ui: {}, state: { agents: [], teams: [], runtime: {} }, supervisorAgent: () => null, prefs: {}, asstOk: true, project: 'p' };
  assert.match(composerBar({ ...base, voice: { stt: true, tts: true, secure: true } }), /id="mic" data-act="mic" aria-pressed="false"[^>]*>🎤/); assert.doesNotMatch(composerBar({ ...base, voice: { stt: true, secure: true } }), /id="mic"[^>]*disabled/);
  assert.match(composerBar({ ...base, voice: { stt: true, secure: false } }), /endereço seguro[^>]*disabled>🎤/); assert.match(composerBar({ ...base, voice: { stt: false } }), /não tem ditado por voz[^>]*disabled/); assert.match(composerBar({ ...base, ui: { listening: true }, voice: { stt: true, secure: true } }), /mic on"[^>]*aria-pressed="true"/);
  const ctx = (prefs, tts = true) => ({ ui: { cwMenu: true }, prefs, asstOk: true, voice: { tts }, asst: { briefed: true, provider: 'claude', connected: ['claude'], threads: [], messages: [] }, state: { agents: [], teams: [], runs: [] }, agentStatus: () => ({}), supervisorAgent: () => null });
  assert.match(chatHeaderHtml(ctx({})), /cw-voice" role="switch" aria-checked="false" data-act="voice-toggle"/); assert.match(chatHeaderHtml(ctx({ voiceReply: true })), /cw-voice on" role="switch" aria-checked="true"/); assert.doesNotMatch(chatHeaderHtml(ctx({}, false)), /voice-toggle/);
});
