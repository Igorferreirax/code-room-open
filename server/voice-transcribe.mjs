// Transcrição rápida pelo Groq (Whisper): usada quando há uma chave do Groq na Biblioteca de APIs.
// O áudio sai da máquina só nesse caso (ver docs/PRIVACIDADE.md); sem chave, o ditado continua pelo navegador.
export const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
export const GROQ_MODEL = 'whisper-large-v3-turbo';
export const MAX_AUDIO = 20 * 1024 * 1024;   // o Groq aceita até 25 MB no plano gratuito
const EXT = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' };

export function audioExt(mime) { return EXT[String(mime || '').split(';')[0].trim().toLowerCase()] || ''; }

// Junta o pedaço de "obrigado por assistir" e afins que o Whisper inventa em silêncio.
const HALLUCINATIONS = /^(obrigad[oa] por assistir\.?|legendas pela comunidade amara\.org|tchau\.?|\.+|)$/i;
export function cleanTranscript(t) { const s = String(t || '').replace(/\s+/g, ' ').trim(); return HALLUCINATIONS.test(s) ? '' : s; }

export async function transcribeGroq(audio, mime, { key, fetchFn = fetch, lang = 'pt', prompt = '' } = {}) {
  if (!key) throw Object.assign(new Error('Sem chave do Groq.'), { status: 409 });
  const ext = audioExt(mime); if (!ext) throw new Error('Formato de áudio não aceito.');
  if (!audio?.length) throw new Error('Áudio vazio.');
  if (audio.length > MAX_AUDIO) throw Object.assign(new Error('Áudio muito longo.'), { status: 413 });
  const form = new FormData();
  form.append('file', new Blob([audio], { type: String(mime).split(';')[0] }), `fala.${ext}`);
  form.append('model', GROQ_MODEL); form.append('language', lang); form.append('response_format', 'json'); form.append('temperature', '0');
  if (prompt) form.append('prompt', String(prompt).slice(0, 400));
  const t0 = Date.now();
  const r = await fetchFn(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(30000) });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) {
    const why = r.status === 401 ? 'A chave do Groq foi recusada. Confira em Conexões › Biblioteca de APIs.' : r.status === 429 ? 'O Groq pediu uma pausa (limite de uso). Tente de novo em instantes.' : `O Groq respondeu ${r.status}${j?.error?.message ? ': ' + String(j.error.message).slice(0, 160) : ''}.`;
    throw Object.assign(new Error(why), { status: r.status === 429 ? 429 : 502 });
  }
  return { text: cleanTranscript(j.text), provider: 'groq', ms: Date.now() - t0 };
}

// Lê o corpo cru (áudio) com teto de tamanho.
export async function rawBody(req, limit = MAX_AUDIO) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Áudio muito longo.'), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}
