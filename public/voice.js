// Voz no chat (fase 1): ditado (falar em vez de digitar) e leitura em voz alta de um resumo da resposta.
// Usa só o que o navegador já tem (Web Speech API): sem chave, sem servidor e sem biblioteca. O áudio do ditado é tratado pelo serviço de voz do
// próprio navegador (no Chrome/Edge, vai para o Google/Microsoft); o Code Room só recebe o TEXTO, e só quando você aperta Enviar.
// Funções puras e testáveis; o que toca o navegador recebe `win` (window) como parâmetro.

export function voiceSupport(win = globalThis) {
  const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
  return { stt: !!SR, tts: !!(win.speechSynthesis && win.SpeechSynthesisUtterance), secure: win.isSecureContext !== false };   // o microfone só funciona em https ou localhost
}

// Texto da resposta -> até 3 frases curtas, sem markdown, código, links nem tabelas (o resto fica para a tela).
export function stripForSpeech(md, max = 320) {
  let t = String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')                       // blocos de código
    .replace(/`[^`]*`/g, ' ')                               // código na linha
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')              // links e imagens
    .replace(/https?:\/\/\S+/g, ' ')                        // endereços soltos
    .replace(/^\s*\|.*\|\s*$/gm, ' ')                       // linhas de tabela
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')                     // títulos
    .replace(/^\s*[-*•]\s+/gm, '')                          // marcadores
    .replace(/^\s*\d+[.)]\s+/gm, '')                        // numeração
    .replace(/[*_~>#]+/g, '')                               // ênfase
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')   // emojis
    .replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const parts = t.match(/[^.!?…]+[.!?…]*/g) || [t]; let out = '';
  for (const p of parts) { const next = (out + ' ' + p).trim(); if (out && (next.length > max || out.split(/[.!?…]/).length > 3)) break; out = next; if (out.length >= max) break; }
  out = out.slice(0, max).trim();
  return out.length < t.length ? out.replace(/[,;:\s]+$/, '') + (/[.!?…]$/.test(out) ? ' ' : '. ') + 'O resto está na tela.' : out;
}

// Escolhe a voz mais natural em português: as "Natural" do Edge, depois as online (Google/Microsoft), depois qualquer pt-BR e por fim qualquer pt.
export function pickVoice(voices = [], preferred = '') {
  const list = (voices || []).filter(v => /^pt([-_]|$)/i.test(v.lang || ''));
  if (!list.length) return null;
  const byName = preferred && list.find(v => v.name === preferred); if (byName) return byName;
  const score = v => (/natural/i.test(v.name) ? 40 : 0) + (/online|google|neural/i.test(v.name) ? 20 : 0) + (/^pt[-_]br$/i.test(v.lang) ? 10 : 0) + (v.localService === false ? 2 : 0);
  return list.slice().sort((a, b) => score(b) - score(a))[0];
}

export function speak(win, text, { voice = '', rate = 1, lang = 'pt-BR' } = {}) {
  const sup = voiceSupport(win); if (!sup.tts || !text) return false;
  win.speechSynthesis.cancel();
  const u = new win.SpeechSynthesisUtterance(text); u.lang = lang; u.rate = Math.min(1.5, Math.max(0.7, rate));
  const v = pickVoice(win.speechSynthesis.getVoices?.() || [], voice); if (v) { u.voice = v; u.lang = v.lang; }
  win.speechSynthesis.speak(u); return true;
}
export const cancelSpeech = win => { try { win.speechSynthesis?.cancel(); } catch {} };

// Ditado: o que a pessoa fala vai aparecendo no campo (resultado parcial) e, ao terminar, o texto fica para ela revisar e enviar.
export function createDictation(win, { lang = 'pt-BR', onText, onState, onError } = {}) {
  const SR = win.SpeechRecognition || win.webkitSpeechRecognition; if (!SR) return null;
  const rec = new SR(); rec.lang = lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1; let on = false;
  const ERR = { 'not-allowed': 'O navegador bloqueou o microfone. Libere o acesso no ícone de cadeado do endereço e tente de novo.', 'service-not-allowed': 'O navegador bloqueou o ditado por voz.', network: 'O ditado do navegador precisa de internet.', 'audio-capture': 'Não encontrei um microfone neste computador.', 'language-not-supported': 'O navegador não tem ditado em português.' };
  rec.onresult = e => { let text = ''; for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript; onText?.(text.trim(), !!e.results[e.results.length - 1]?.isFinal); };
  rec.onstart = () => { on = true; onState?.(true); };
  rec.onend = () => { on = false; onState?.(false); };
  rec.onerror = e => { if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') onError?.(ERR[e.error] || `Não consegui ouvir (${e.error}).`); };
  return { start: () => { try { rec.start(); } catch {} }, stop: () => { try { rec.stop(); } catch {} }, get listening() { return on; } };
}

// Gravação para o ditado rápido (Groq): grava o microfone e, ao parar, manda o áudio ao Code Room, que transcreve.
// stop() devolve { text } ou { fallback: true } quando não há chave do Groq (aí o chamador usa o ditado do navegador).
export function createRecorder(win, { getKey, onState, onError } = {}) {
  const md = win.navigator?.mediaDevices; if (!md?.getUserMedia || !win.MediaRecorder) return null;
  let rec = null, stream = null, chunks = [], on = false, cancelled = false, starting = null;
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => win.MediaRecorder.isTypeSupported?.(t)) || '';
  const release = () => { try { stream?.getTracks().forEach(t => t.stop()); } catch {} stream = null; rec = null; if (on) { on = false; onState?.(false); } };
  return {
    get listening() { return on; },
    async start() {
      if (on || starting) return; cancelled = false; chunks = [];
      starting = (async () => {
        try { stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
        catch { onError?.('O navegador bloqueou o microfone. Libere o acesso no ícone de cadeado do endereço e tente de novo.'); return; }
        if (cancelled) { release(); return; }
        rec = new win.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
        rec.start(250); on = true; onState?.(true, stream);
      })();
      await starting; starting = null;
    },
    cancel() { cancelled = true; try { rec?.stop(); } catch {} release(); },
    async stop() {
      if (starting) await starting;
      if (!rec) { release(); return { text: '' }; }
      const done = new Promise(r => { rec.onstop = r; }); try { rec.stop(); } catch {} await done;
      const type = (rec?.mimeType || mime || 'audio/webm').split(';')[0]; release();
      const blob = new win.Blob(chunks, { type }); chunks = [];
      if (blob.size < 1500) return { text: '' };
      const r = await win.fetch('/api/voice/transcribe', { method: 'POST', headers: { 'X-Code-Room-Key': getKey?.() || '', 'Content-Type': type }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && j.fallback) return { fallback: true };
      if (!r.ok) throw new Error(j.error || 'Não consegui transcrever.');
      return { text: j.text || '' };
    },
  };
}
