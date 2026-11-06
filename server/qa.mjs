import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';

// Checagem técnica de um vídeo (a parte MEDIÁVEL da régua de qualidade). Não julga estilo, pronúncia nem emoção: isso é com o dono.
// Cada item é "ok", "aviso" ou "falha", com o valor medido; o que não dá para medir fica "indisponível" (nunca vira zero).
const run = (cmd, args, timeout = 120000) => new Promise(res => execFile(cmd, args, { timeout, maxBuffer: 32e6, windowsHide: true }, (e, so, se) => res({ ok: !e, out: String(so || ''), err: String(se || '') })));
const cache = new Map();
const item = (id, label, status, detail) => ({ id, label, status, detail });
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

export async function qaVideo(file, { kind = 'previa' } = {}) {
  const st = await stat(file), key = `${file}|${st.size}|${st.mtimeMs}|${kind}`;
  if (cache.has(key)) return cache.get(key);
  const probe = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  if (!probe.ok) return { checked: false, reason: 'ffprobe não conseguiu abrir o arquivo.', items: [] };
  const info = JSON.parse(probe.out), v = info.streams.find(s => s.codec_type === 'video'), a = info.streams.find(s => s.codec_type === 'audio');
  const items = [], final = kind === 'final';
  // Na prévia o volume ainda não foi normalizado: desvio vira aviso, não falha.
  const soft = s => (!final && s === 'falha' ? 'aviso' : s);

  if (!v) items.push(item('video', 'Faixa de vídeo', 'falha', 'não há imagem no arquivo'));
  else {
    const w = v.width, h = v.height, ratio = w / h, [fn, fd] = String(v.avg_frame_rate || '0/1').split('/').map(Number), fps = fd ? fn / fd : null;
    const vertical = Math.abs(ratio - 9 / 16) < 0.01, big = final ? h >= 1920 : h >= 1280;
    items.push(item('res', 'Formato e resolução', vertical ? (big ? 'ok' : 'aviso') : 'falha', `${w}×${h}${vertical ? '' : ' (não é 9:16)'}${vertical && !big ? ` (o final deve ser 1080×1920)` : ''}`));
    items.push(item('fps', 'Quadros por segundo', fps && fps >= 24 ? 'ok' : 'aviso', fps ? `${fps.toFixed(1)} fps` : 'indisponível'));
  }
  const dur = num(info.format?.duration);
  items.push(item('dur', 'Duração (alvo 55 a 61 s)', dur == null ? 'aviso' : dur >= 50 && dur <= 62 ? 'ok' : dur >= 40 && dur <= 75 ? 'aviso' : 'falha', dur == null ? 'indisponível' : `${dur.toFixed(1)} s`));

  if (!a) items.push(item('audio', 'Faixa de áudio', 'falha', 'o vídeo não tem áudio'));
  else {
    const r = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
    const summary = r.err.slice(r.err.lastIndexOf('Summary:')), lufs = num((summary.match(/I:\s+(-?[\d.]+)\s+LUFS/) || [])[1]), peak = num((summary.match(/Peak:\s+(-?[\d.]+)\s+dBFS/) || [])[1]);
    items.push(item('lufs', 'Volume (alvo −14 LUFS)', lufs == null ? 'aviso' : Math.abs(lufs + 14) <= 1 ? 'ok' : Math.abs(lufs + 14) <= 2.5 ? 'aviso' : soft('falha'), lufs == null ? 'indisponível' : `${lufs.toFixed(1)} LUFS${!final && Math.abs(lufs + 14) > 1 ? ' (a prévia ainda não foi normalizada)' : ''}`));
    items.push(item('peak', 'Pico real (máx. −1,5 dB)', peak == null ? 'aviso' : peak <= -1.5 ? 'ok' : peak <= -0.5 ? 'aviso' : soft('falha'), peak == null ? 'indisponível' : `${peak.toFixed(1)} dBTP`));
    const s = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'silencedetect=noise=-45dB:d=1.5', '-f', 'null', '-']);
    const starts = [...s.err.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => num(m[1])), mid = starts.filter(t => dur == null || t < dur - 2);
    items.push(item('silence', 'Silêncios longos no meio (mais de 1,5 s)', mid.length === 0 ? 'ok' : 'aviso', mid.length === 0 ? 'nenhum' : `${mid.length} (em ${mid.slice(0, 3).map(t => t.toFixed(1) + ' s').join(', ')})`));
  }
  if (v) {
    const b = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', 'blackdetect=d=0.5:pix_th=0.08,freezedetect=n=-55dB:d=2.5', '-f', 'null', '-']);
    const black = [...b.err.matchAll(/black_start:([\d.]+)/g)].map(m => num(m[1])).filter(t => dur == null || t < dur - 3), freeze = [...b.err.matchAll(/freeze_start:\s*([\d.]+)/g)].map(m => num(m[1]));
    items.push(item('black', 'Quadros pretos no meio', black.length === 0 ? 'ok' : 'aviso', black.length === 0 ? 'nenhum' : `${black.length} (em ${black.slice(0, 3).map(t => t.toFixed(1) + ' s').join(', ')})`));
    items.push(item('freeze', 'Imagem congelada (mais de 2,5 s)', freeze.length === 0 ? 'ok' : 'aviso', freeze.length === 0 ? 'nenhuma' : `${freeze.length} (em ${freeze.slice(0, 3).map(t => t.toFixed(1) + ' s').join(', ')})`));
  }
  const out = { checked: true, kind, at: new Date().toISOString(), items, summary: items.some(i => i.status === 'falha') ? 'falha' : items.some(i => i.status === 'aviso') ? 'aviso' : 'ok' };
  cache.set(key, out); if (cache.size > 50) cache.delete(cache.keys().next().value);
  return out;
}
