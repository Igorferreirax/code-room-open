// Rádio da Sala: lo-fi GERADO no navegador (Web Audio). Música original, sem arquivo de áudio: zero risco de licença e zero MB no pacote.
// Acordes de piano elétrico (Dm9 › G13 › Cmaj9 › Am9 | Fmaj9 › Em9 › Dm9 › G7), baixo, bateria suave com swing, notas esparsas
// com eco, chiado de vinil e leve oscilação de fita. Só toca quando a pessoa clica (o navegador não permite tocar sozinho).
const hz = m => 440 * 2 ** ((m - 69) / 12);                       // nota MIDI -> frequência
const BPM = 74, BEAT = 60 / BPM, BAR = BEAT * 4, SWING = 0.16;     // swing: o contratempo atrasa um pouco
// Cada compasso: acorde (sem a fundamental), nota do baixo e escala para as notas soltas (pentatônica de Dó, que combina com todos).
const FORM = [
  { name: 'Dm9', chord: [53, 57, 60, 64], bass: 38 }, { name: 'G13', chord: [53, 59, 62, 64], bass: 43 }, { name: 'Cmaj9', chord: [52, 55, 59, 62], bass: 36 }, { name: 'Am9', chord: [55, 59, 60, 64], bass: 33 },
  { name: 'Fmaj9', chord: [57, 60, 64, 67], bass: 41 }, { name: 'Em9', chord: [55, 59, 62, 66], bass: 40 }, { name: 'Dm9', chord: [53, 57, 60, 64], bass: 38 }, { name: 'G7', chord: [53, 59, 62, 64], bass: 43 },
];
// Estação: várias faixas no MESMO ritmo e nos mesmos acordes; muda só a melodia solta e os detalhes. Tudo é gerado na hora (0 MB).
export const TRACKS = [{ name: 'Chuva na janela', seed: 7 }, { name: 'Madrugada no café', seed: 21 }, { name: 'Última linha', seed: 42 }, { name: 'Luz de neon', seed: 63 }, { name: 'Domingo sem pressa', seed: 88 }];
const TRACK_BARS = 32;
const PENTA = [69, 72, 74, 76, 79, 81, 84];

// Gerador pseudoaleatório com semente: a mesma semente toca a mesma música (testável); sementes diferentes variam as notas soltas.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class LofiRadio {
  constructor({ seed = 7, track = 0, onTrack = null } = {}) { this.track = track; this.onTrack = onTrack; this.skip = false; this.seed = seed; this.ctx = null; this.timer = null; this.vol = 0.7; this.bar = 0; this.next = 0; this.rand = rng(seed); }
  get playing() { return !!this.ctx && !this.stopping; }

  // ---------- grafo de áudio ----------
  build(ctx) {
    this.ctx = ctx; const c = ctx, mk = (t, o = {}) => Object.assign(c[t](), o);
    const filt = (type, f, q = 0.7) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    // saída: soma -> fita (corta agudos) -> saturação suave -> compressor leve -> volume
    const sat = c.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); } sat.curve = curve; sat.oversample = '2x';
    const comp = c.createDynamicsCompressor(); Object.assign(comp.threshold, { value: -20 }); Object.assign(comp.ratio, { value: 3 }); Object.assign(comp.attack, { value: 0.02 }); Object.assign(comp.release, { value: 0.25 });
    this.master = c.createGain(); this.master.gain.value = 0.0001;
    this.sum = c.createGain(); const tape = filt('lowpass', 7200, 0.5); this.sum.connect(tape); tape.connect(sat); sat.connect(comp); comp.connect(this.master); this.master.connect(c.destination);
    // reverb curto (resposta ao impulso gerada: ruído com decaimento exponencial)
    const len = Math.floor(c.sampleRate * 2.2), imp = c.createBuffer(2, len, c.sampleRate), r = rng(this.seed + 99);
    for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.verb = c.createConvolver(); this.verb.buffer = imp; const wet = c.createGain(); wet.gain.value = 0.2; this.verb.connect(wet); wet.connect(this.sum);
    // pianos e notas soltas
    this.keys = c.createGain(); this.keys.gain.value = 0.5; const keyLp = filt('lowpass', 2600, 0.6); this.keys.connect(keyLp); keyLp.connect(this.sum); keyLp.connect(this.verb);
    this.mel = c.createGain(); this.mel.gain.value = 0.32; const delay = c.createDelay(1); delay.delayTime.value = BEAT * 0.75; const fb = c.createGain(); fb.gain.value = 0.36; const dlp = filt('lowpass', 2100);
    this.mel.connect(this.sum); this.mel.connect(delay); delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(this.sum); dlp.connect(this.verb);
    this.bassBus = c.createGain(); this.bassBus.gain.value = 0.75; const bLp = filt('lowpass', 420, 0.5); this.bassBus.connect(bLp); bLp.connect(this.sum);
    this.drums = c.createGain(); this.drums.gain.value = 0.7; const dLp = filt('lowpass', 5200, 0.5); this.drums.connect(dLp); dLp.connect(this.sum);
    // oscilação de fita: um LFO lento mexe de leve na afinação dos pianos
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 0.45; this.wobble = c.createGain(); this.wobble.gain.value = 7; this.lfo.connect(this.wobble); this.lfo.start();
    // ruídos prontos: branco (bateria) e vinil (chiado + estalos esparsos)
    const nl = c.sampleRate, white = c.createBuffer(1, nl, c.sampleRate), wd = white.getChannelData(0), wr = rng(this.seed + 5); for (let i = 0; i < nl; i++) wd[i] = wr() * 2 - 1; this.white = white;
    const vl = c.sampleRate * 4, vin = c.createBuffer(1, vl, c.sampleRate), vd = vin.getChannelData(0), vr = rng(this.seed + 11);
    for (let i = 0; i < vl; i++) vd[i] = (vr() * 2 - 1) * 0.012;
    for (let k = 0; k < 26; k++) { const at = Math.floor(vr() * (vl - 200)), amp = 0.15 + vr() * 0.45; for (let j = 0; j < 120; j++) vd[at + j] += (vr() * 2 - 1) * amp * Math.exp(-j / 18); }
    const vsrc = c.createBufferSource(); vsrc.buffer = vin; vsrc.loop = true; const vbp = filt('bandpass', 3200, 0.5), vg = c.createGain(); vg.gain.value = 0.55; vsrc.connect(vbp); vbp.connect(vg); vg.connect(this.sum); vsrc.start(); this.vinyl = vsrc;
  }

  // ---------- vozes ----------
  #env(g, t, a, peak, hold, rel) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.35), t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); }
  piano(t, midi, vel, dur) {            // piano elétrico: fundamental + triângulo levemente desafinado + "tine" metálico no ataque
    const c = this.ctx, f = hz(midi), g = c.createGain(); this.#env(g, t, 0.008, 0.16 * vel, dur * 0.55, dur * 0.6);
    for (const [type, mult, gain, det] of [['sine', 1, 1, 0], ['triangle', 1, 0.4, 5], ['sine', 4, 0.1, 0]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = f * mult; o.detune.value = det; this.wobble.connect(o.detune); og.gain.value = gain;
      if (mult === 4) { og.gain.setValueAtTime(gain, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); }
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.01 + dur * 1.2 + 0.1);
    }
    g.connect(this.keys);
  }
  pluck(t, midi, vel) {                  // nota solta: seno + oitava em triângulo, decaimento longo (vai para o eco)
    const c = this.ctx, g = c.createGain(); this.#env(g, t, 0.01, 0.12 * vel, 0.5, 1.1);
    for (const [type, mult, gain] of [['sine', 1, 1], ['triangle', 2, 0.25]]) { const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = hz(midi) * mult; og.gain.value = gain; o.connect(og); og.connect(g); o.start(t); o.stop(t + 2); }
    g.connect(this.mel);
  }
  bass(t, midi, vel, dur) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = hz(midi); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.02); g.gain.setValueAtTime(0.5 * vel, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.bassBus); o.start(t); o.stop(t + dur + 0.05); }
  kick(t, vel) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.13); g.gain.setValueAtTime(0.9 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); o.connect(g); g.connect(this.drums); o.start(t); o.stop(t + 0.35); }
  noise(t, vel, dur, type, f, q, gain) { const c = this.ctx, s = c.createBufferSource(), b = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.white; b.type = type; b.frequency.value = f; b.Q.value = q; g.gain.setValueAtTime(gain * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(b); b.connect(g); g.connect(this.drums); s.start(t, this.rand() * 0.5, dur + 0.02); }
  snare(t, vel) { this.noise(t, vel, 0.2, 'bandpass', 1900, 0.8, 0.42); const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 190; g.gain.setValueAtTime(0.25 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); o.connect(g); g.connect(this.drums); o.start(t); o.stop(t + 0.1); }
  hat(t, vel, open = false) { this.noise(t, vel, open ? 0.2 : 0.05, 'highpass', 7200, 0.7, open ? 0.13 : 0.16); }

  // ---------- um compasso ----------
  scheduleBar(i, t0) {
    const R = this.rand, step = FORM[i % FORM.length], at = beat => t0 + beat * BEAT + (beat % 1 ? SWING * BEAT * 0.5 : 0), human = () => (R() - 0.5) * 0.02;
    const loop = Math.floor(i / FORM.length);
    // piano: acorde cheio no tempo 1 e batidas leves no "e" do 2 e no 4
    const hits = [[0, 1, 2.2], [1.5, 0.55, 1.2], R() < 0.7 ? [3, 0.5, 1] : null].filter(Boolean);
    for (const [beat, vel, dur] of hits) step.chord.forEach((m, k) => this.piano(at(beat) + k * 0.011 + human(), m, vel * (0.85 + R() * 0.25), dur * BEAT));
    // baixo
    this.bass(at(0) + human(), step.bass, 1, BEAT * 1.6); if (R() < 0.6) this.bass(at(2) + human(), step.bass + (R() < 0.3 ? 7 : 0), 0.8, BEAT * 1.2); if (R() < 0.35) this.bass(at(3.5) + human(), step.bass + 12, 0.45, BEAT * 0.4);
    // bateria: bumbo no 1 e no "e" do 3; caixa no 2 e no 4; chimbal em colcheias com swing
    this.kick(at(0) + human(), 1); if (R() < 0.85) this.kick(at(2.5) + human(), 0.85); if (R() < 0.35) this.kick(at(1.5) + human(), 0.6);
    this.snare(at(1) + human(), 0.9); this.snare(at(3) + human(), 0.95); if (R() < 0.25) this.snare(at(3.75) + human(), 0.3);
    for (let e = 0; e < 8; e++) { if (R() < 0.12) continue; this.hat(at(e / 2) + human(), (e % 2 ? 0.55 : 0.85) * (0.75 + R() * 0.4), e === 7 && R() < 0.4); }
    // notas soltas (a partir da 2ª volta, e só em parte dos compassos): pentatônica, com pausas
    if (loop > 0 || i % FORM.length >= 2) for (let s = 2; s < 8; s++) if (R() < 0.24) this.pluck(at(s / 2) + human(), PENTA[Math.floor(R() * PENTA.length)], 0.6 + R() * 0.5);
  }

  // ---------- tempo real ----------
  async start() {
    if (this.ctx) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) throw new Error('Este navegador não toca áudio gerado.');
    const c = new AC({ latencyHint: 'playback' }); this.stopping = false; this.build(c); if (c.state === 'suspended') await c.resume();
    this.bar = 0; this.next = c.currentTime + 0.25; this.rand = rng(this.seed); this.setVolume(this.vol, 1.2);
    this.seed = TRACKS[this.track].seed; this.rand = rng(this.seed); this.announce(this.next);
    const pump = () => { while (this.ctx && this.next < this.ctx.currentTime + 1.6) {
      if (this.bar > 0 && (this.skip || this.bar % TRACK_BARS === 0)) { this.skip = false; this.track = (this.track + 1) % TRACKS.length; this.seed = TRACKS[this.track].seed; this.rand = rng(this.seed); this.announce(this.next); }
      this.scheduleBar(this.bar++, this.next); this.next += BAR; } }; pump(); this.timer = setInterval(pump, 250);
  }
  announce(at) { const ctx = this.ctx, tr = TRACKS[this.track]; if (!this.onTrack || !ctx) return; setTimeout(() => { if (this.ctx === ctx) this.onTrack(tr, this.track); }, Math.max(0, (at - ctx.currentTime) * 1000)); }
  nextTrack() { if (this.ctx) this.skip = true; }
  setVolume(v, fade = 0.15) { this.vol = Math.min(1, Math.max(0, v)); if (this.ctx && this.master) { const g = this.master.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(Math.max(0.0001, this.vol * 0.8), t + fade); } }
  pause() { if (this.ctx?.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx?.state === 'suspended' && !this.stopping) this.ctx.resume(); }
  stop() {
    if (!this.ctx || this.stopping) return; this.stopping = true; clearInterval(this.timer); this.timer = null; const c = this.ctx, g = this.master.gain, t = c.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(0.0001, t + 0.5);
    setTimeout(() => { try { c.close(); } catch {} }, 650); this.ctx = null; this.stopping = false;
  }

  // ---------- render sem sair no alto-falante (testes e o arquivo de amostra) ----------
  static async render(seconds = 30, { seed = 7, sampleRate = 44100 } = {}) {
    const off = new OfflineAudioContext(2, Math.floor(sampleRate * seconds), sampleRate), r = new LofiRadio({ seed }); r.build(off); r.master.gain.value = 0.8 * 0.8;
    r.next = 0.1; r.bar = 0; while (r.next < seconds) { r.scheduleBar(r.bar++, r.next); r.next += BAR; }
    return off.startRendering();
  }
}
export const RADIO = { BPM, BAR, FORM };
