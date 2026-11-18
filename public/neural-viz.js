// Animação "neural" do Nico enquanto ele ouve: nós e ligações que acendem com o volume da voz e mudam de cor
// com o tom (grave = azul, agudo = violeta/ciano). Desenho em canvas, roda na janela onde o canvas está
// (inclusive a mini-janela flutuante), sem bibliotecas.

// Volume (0..1) e tom (0..1) a partir do analisador de áudio.
export function voiceLevels(freq, time) {
  let sum = 0; for (let i = 0; i < time.length; i++) { const v = (time[i] - 128) / 128; sum += v * v; }
  const rms = Math.min(1, Math.sqrt(sum / (time.length || 1)) * 5);
  let num = 0, den = 0; for (let i = 2; i < freq.length; i++) { num += i * freq[i]; den += freq[i]; }
  const centroid = den > 0 ? Math.min(1, (num / den) / (freq.length * 0.45)) : 0;
  return { rms, tone: centroid };
}

// Rede fixa (mesmas posições sempre): pseudo-aleatório com semente.
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function makeNetwork(n = 34, seed = 7) {
  const rnd = seeded(seed), nodes = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd() * 0.6, r = 0.08 + rnd() * 0.36; nodes.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r * 1.25, ph: rnd() * Math.PI * 2 }); }
  nodes.push({ x: 0.5, y: 0.5, ph: 0, core: true });
  const edges = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y); if (d < 0.17 || (nodes[j].core && rnd() < 0.5)) edges.push([i, j, d]); }
  return { nodes, edges };
}

// Começa a animar. getLevels() devolve { rms, tone } ou null (sem microfone: respira devagar).
export function startNeural(canvas, getLevels) {
  const win = canvas.ownerDocument.defaultView, g = canvas.getContext('2d'), net = makeNetwork();
  const reduce = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, level = 0, tone = 0.3, t0 = win.performance.now(), stopped = false;
  const frame = now => {
    if (stopped) return;
    const t = (now - t0) / 1000, L = getLevels?.() || null;
    level += ((L ? Math.max(0.12, L.rms) : 0.14 + Math.sin(t * 1.6) * 0.05) - level) * 0.25;
    tone += ((L ? L.tone : 0.3) - tone) * 0.08;
    const dpr = win.devicePixelRatio || 1, w = canvas.clientWidth || 220, h = canvas.clientHeight || 120;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const hue = 205 + tone * 85, jitter = reduce ? 0 : 1;
    const pos = net.nodes.map(n => ({ x: n.x * w + Math.sin(t * 1.3 + n.ph) * 3 * jitter * (0.4 + level), y: n.y * h + Math.cos(t * 1.1 + n.ph) * 3 * jitter * (0.4 + level) }));
    for (const [i, j, d] of net.edges) {
      const a = Math.min(0.9, 0.16 + level * 1.1 * (1 - d * 2.2) + (net.nodes[j].core ? 0.08 + level * 0.4 : 0));
      g.strokeStyle = `hsla(${hue}, 95%, 65%, ${a.toFixed(3)})`; g.lineWidth = 0.6 + level * 1.6;
      g.beginPath(); g.moveTo(pos[i].x, pos[i].y); g.lineTo(pos[j].x, pos[j].y); g.stroke();
      if (!reduce && level > 0.15) { const k = (t * (0.6 + level * 2) + i * 0.13) % 1; g.fillStyle = `hsla(${hue + 30}, 100%, 75%, ${(level * 0.9).toFixed(3)})`; g.beginPath(); g.arc(pos[i].x + (pos[j].x - pos[i].x) * k, pos[i].y + (pos[j].y - pos[i].y) * k, 1.4 + level * 1.5, 0, Math.PI * 2); g.fill(); }
    }
    net.nodes.forEach((n, i) => {
      const r = n.core ? 9 + level * 16 : 2.4 + level * 5 * (0.6 + 0.4 * Math.sin(t * 3 + n.ph));
      const grd = g.createRadialGradient(pos[i].x, pos[i].y, 0, pos[i].x, pos[i].y, r * 3);
      grd.addColorStop(0, `hsla(${hue}, 100%, ${n.core ? 80 : 72}%, ${Math.min(1, 0.55 + level).toFixed(3)})`); grd.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(pos[i].x, pos[i].y, r * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = `hsla(${hue}, 100%, 88%, 0.95)`; g.beginPath(); g.arc(pos[i].x, pos[i].y, r * 0.55, 0, Math.PI * 2); g.fill();
    });
    canvas.dataset.level = level.toFixed(2);
    raf = win.requestAnimationFrame(frame);
  };
  raf = win.requestAnimationFrame(frame);
  return () => { stopped = true; win.cancelAnimationFrame(raf); };
}
