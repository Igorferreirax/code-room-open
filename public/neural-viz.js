// Animação do Nico enquanto ele ouve: uma esfera de partículas que reage à voz (volume e tom). Desenho em canvas,
// roda na janela onde o canvas está (inclusive a mini-janela flutuante), sem bibliotecas.

// Volume (0..1) e tom (0..1) a partir do analisador de áudio.
export function voiceLevels(freq, time) {
  let sum = 0; for (let i = 0; i < time.length; i++) { const v = (time[i] - 128) / 128; sum += v * v; }
  const rms = Math.min(1, Math.sqrt(sum / (time.length || 1)) * 5);
  let num = 0, den = 0; for (let i = 2; i < freq.length; i++) { num += i * freq[i]; den += freq[i]; }
  const centroid = den > 0 ? Math.min(1, (num / den) / (freq.length * 0.45)) : 0;
  return { rms, tone: centroid };
}

// Pseudo-aleatório com semente (a esfera fica sempre igual).
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Esfera de partículas (referência do Igor: "nucleus gif"): milhares de pontos numa esfera que gira devagar em 3D,
// mais brilhante na borda. Com a voz, a esfera cresce e as partículas se afastam e tremem conforme o volume;
// o tom puxa a cor do branco para o ciano. getLevels() devolve { rms, tone } ou null (sem microfone: só gira).
export function makeSphere(n = 2200, seed = 11) {
  const rnd = seeded(seed), pts = new Float32Array(n * 4);
  // Pontos espalhados ao acaso na superfície (aspecto de "poeira"), com leve variação de raio.
  for (let i = 0; i < n; i++) {
    const y = rnd() * 2 - 1, r = Math.sqrt(1 - y * y), th = rnd() * Math.PI * 2, rad = 0.95 + rnd() * 0.08;
    pts[i * 4] = Math.cos(th) * r * rad; pts[i * 4 + 1] = y * rad; pts[i * 4 + 2] = Math.sin(th) * r * rad; pts[i * 4 + 3] = rnd() * Math.PI * 2;
  }
  return pts;
}
export function startNeural(canvas, getLevels) {
  const win = canvas.ownerDocument.defaultView, g = canvas.getContext('2d'), pts = makeSphere(), n = pts.length / 4;
  const reduce = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, level = 0, tone = 0.3, t0 = win.performance.now(), stopped = false;
  const frame = now => {
    if (stopped) return;
    const t = (now - t0) / 1000, L = getLevels?.() || null;
    level += ((L ? L.rms : 0) - level) * (L && L.rms > level ? 0.45 : 0.12);   // sobe rápido com a voz, desce suave
    tone += ((L ? L.tone : 0.3) - tone) * 0.08;
    const dpr = win.devicePixelRatio || 1, w = canvas.clientWidth || 220, h = canvas.clientHeight || 120;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4 * (1 + level * 0.16);
    const ry = reduce ? 0.6 : t * (0.35 + level * 0.9), rx = 0.35 + Math.sin(t * 0.3) * 0.12;
    const cyR = Math.cos(ry), syR = Math.sin(ry), cxR = Math.cos(rx), sxR = Math.sin(rx);
    const hue = 190 + tone * 25, sat = Math.round(tone * 70), light = 82 + level * 10;
    for (let i = 0; i < n; i++) {
      let x = pts[i * 4], y = pts[i * 4 + 1], z = pts[i * 4 + 2]; const ph = pts[i * 4 + 3];
      // voz: cada partícula sai um pouco da superfície, com tremor próprio
      const k = 1 + (reduce ? 0 : level * 0.13 * Math.sin(t * 9 + ph * 3) + level * 0.07 * Math.sin(ph * 7 + t * 2.2));
      x *= k; y *= k; z *= k;
      const x1 = x * cyR + z * syR, z1 = -x * syR + z * cyR, y1 = y * cxR - z1 * sxR, z2 = y * sxR + z1 * cxR;
      const persp = 1 / (1.9 - z2 * 0.6), px = cx + x1 * R * persp * 1.25, py = cy + y1 * R * persp * 1.25;
      const edge = 1 - Math.abs(z2) / Math.max(0.0001, k), front = (z2 + 1) / 2;   // borda e frente mais claras
      const a = Math.min(1, 0.12 + edge * edge * 0.75 + front * 0.18 + level * 0.25);
      g.fillStyle = 'hsla(' + hue + ',' + sat + '%,' + light + '%,' + a.toFixed(3) + ')';
      const sz = (0.6 + front * 0.8) * (1 + level * 0.3);
      g.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }
    canvas.dataset.level = level.toFixed(2);
    raf = win.requestAnimationFrame(frame);
  };
  raf = win.requestAnimationFrame(frame);
  return () => { stopped = true; win.cancelAnimationFrame(raf); };
}

// Faixa de animação dentro do chat enquanto o microfone ouve (o ditado do chat mostra a mesma rede neural).
// Insere um canvas antes de `anchor` e mede o microfone; devolve a função que para tudo e remove a faixa.
export async function showVoiceStrip(anchor, { id = 'chat-neural' } = {}) {
  if (!anchor?.parentNode) return () => {};
  document.getElementById(id)?.remove();
  const box = document.createElement('div'); box.id = id; box.className = 'chat-neural'; box.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas'); box.appendChild(canvas); anchor.parentNode.insertBefore(box, anchor);
  let stream = null, ac = null, an = null, freq = null, time = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ac = new (window.AudioContext || window.webkitAudioContext)(); an = ac.createAnalyser(); an.fftSize = 256;
    ac.createMediaStreamSource(stream).connect(an); freq = new Uint8Array(an.frequencyBinCount); time = new Uint8Array(an.fftSize);
  } catch {}
  const stopViz = startNeural(canvas, () => { if (!an) return null; an.getByteFrequencyData(freq); an.getByteTimeDomainData(time); return voiceLevels(freq, time); });
  return () => { stopViz(); try { stream?.getTracks().forEach(t => t.stop()); } catch {} try { ac?.close(); } catch {} box.remove(); };
}
