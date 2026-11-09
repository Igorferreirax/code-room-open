import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { qaVideo } from '../server/qa.mjs';
import { tempDir } from './helpers.mjs';

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0, SKIP = !HAS_FFMPEG && 'ffmpeg não instalado aqui';
const mk = (file, args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, file], { windowsHide: true });
const by = r => Object.fromEntries(r.items.map(i => [i.id, i]));

test('vídeo bom e curto: mede formato, volume e pico; duração fora do alvo é aviso/falha, nunca silêncio', { skip: SKIP }, async () => {
  const d = await tempDir('qa'), f = join(d, 'bom.mp4');
  mk(f, ['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:d=6', '-af', 'volume=0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']);
  const r = by(await qaVideo(f, { kind: 'final' }));
  assert.equal(r.res.status, 'ok'); assert.match(r.res.detail, /1080×1920/); assert.equal(r.fps.status, 'ok');
  assert.equal(r.dur.status, 'falha', '6 s está muito longe de 55-61 s'); assert.match(r.dur.detail, /6\.0 s/);
  assert.match(r.lufs.detail, /LUFS/); assert.ok(['ok', 'aviso', 'falha'].includes(r.lufs.status));
  assert.match(r.peak.detail, /dBTP/); assert.equal(r.silence.status, 'ok');
});

test('formato errado e áudio mudo são pegos; sem áudio vira falha explícita', { skip: SKIP }, async () => {
  const d = await tempDir('qa'), mudo = join(d, 'mudo.mp4'), semAudio = join(d, 'sem.mp4');
  mk(mudo, ['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=8', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac']);
  const m = by(await qaVideo(mudo, { kind: 'final' }));
  assert.equal(m.res.status, 'falha'); assert.match(m.res.detail, /não é 9:16/);
  assert.equal(m.silence.status, 'aviso', 'oito segundos de silêncio no meio'); assert.equal(m.lufs.status === 'ok', false);
  mk(semAudio, ['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
  const s = by(await qaVideo(semAudio, { kind: 'final' })); assert.equal(s.audio.status, 'falha');
});

test('na prévia o volume ainda não normalizado é aviso, não falha; arquivo ilegível é reportado', { skip: SKIP }, async () => {
  const d = await tempDir('qa'), f = join(d, 'previa.mp4');
  mk(f, ['-f', 'lavfi', '-i', 'testsrc2=s=720x1280:r=24:d=5', '-f', 'lavfi', '-i', 'sine=frequency=300:d=5', '-af', 'volume=0.05', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']);
  const p = by(await qaVideo(f, { kind: 'previa' }));
  assert.notEqual(p.lufs.status, 'falha'); assert.equal(p.res.status, 'ok');
  const ruim = join(d, 'ruim.mp4'); (await import('node:fs/promises')).writeFile(ruim, 'isto não é um vídeo');
  await new Promise(r => setTimeout(r, 50));
  const bad = await qaVideo(ruim, { kind: 'final' }); assert.equal(bad.checked, false);
});
