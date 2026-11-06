import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { freemem, totalmem, cpus } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

// Verificação do ambiente ANTES de um lote: acha as brechas que só apareceriam no meio da produção (e depois de gastar crédito).
// Nunca mostra valores de chaves: só se existem. Cada item é ok / aviso / falha, com o motivo e o que fazer.
const run = (cmd, args, timeout = 15000) => new Promise(res => execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4e6 }, (e, so, se) => res({ ok: !e, out: String(so || '') + String(se || '') })));
const it = (id, label, status, detail, fix = '') => ({ id, label, status, detail, fix });
const GB = 1024 ** 3;
const ping = (port, path) => new Promise(res => { const r = http.get({ host: '127.0.0.1', port, path, timeout: 2000 }, x => { x.resume(); res(x.statusCode < 500); }); r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); });

export async function preflight({ workDir = '' } = {}) {
  const items = [];
  for (const [bin, label, args, fix] of [['ffmpeg', 'ffmpeg (render e áudio)', ['-version'], 'Instale o ffmpeg e coloque no PATH.'], ['ffprobe', 'ffprobe (medição)', ['-version'], 'Vem junto com o ffmpeg.'], ['python', 'Python (scripts da esteira)', ['--version'], 'Instale o Python 3.'], ['node', 'Node.js', ['--version'], '']]) {
    const r = await run(bin, args); items.push(it(bin, label, r.ok ? 'ok' : 'falha', r.ok ? r.out.split('\n')[0].slice(0, 60) : 'não encontrado', fix));
  }
  // HyperFrames (render de vídeo): instalado no projeto da esteira ou global
  const hfLocal = workDir && (existsSync(join(workDir, 'node_modules', '.bin', 'hyperframes.cmd')) || existsSync(join(workDir, 'node_modules', 'hyperframes')));
  const hfGlobal = !hfLocal && (await run('where', ['hyperframes'])).ok;
  items.push(it('hyperframes', 'HyperFrames (render dos vídeos)', hfLocal || hfGlobal ? 'ok' : 'aviso', hfLocal ? 'instalado no projeto' : hfGlobal ? 'instalado globalmente' : 'não encontrado; o render pode baixar na hora via npx (mais lento e precisa de internet)', 'Rode npm install na pasta da esteira.'));
  // espaço em disco da pasta de trabalho
  try { const s = await statfs(workDir || process.cwd()), free = Number(s.bavail) * Number(s.bsize) / GB; items.push(it('disk', 'Espaço livre em disco (mín. 10 GB por lote)', free >= 10 ? 'ok' : free >= 5 ? 'aviso' : 'falha', `${free.toFixed(1)} GB livres`, 'Apague prévias e temporários antigos; mova vídeos já postados para outro disco.')); } catch { items.push(it('disk', 'Espaço livre em disco', 'aviso', 'indisponível')); }
  const freeRam = freemem() / GB, totRam = totalmem() / GB;
  items.push(it('ram', 'Memória livre (render pede 3 GB ou mais)', freeRam >= 3 ? 'ok' : freeRam >= 1.5 ? 'aviso' : 'falha', `${freeRam.toFixed(1)} GB livres de ${totRam.toFixed(1)} GB`, 'Feche navegadores e programas pesados antes de renderizar; use o modo de baixa memória do render.'));
  items.push(it('cpu', 'Processador', cpus().length >= 8 ? 'ok' : 'aviso', `${cpus().length} threads (${(cpus()[0]?.model || '').trim().slice(0, 40)}). Render local leva em média mais de 1 h por vídeo com pouca CPU`, 'Considere renderizar na VPS (precisa da sua autorização).'));
  // Chave da voz: só se existe
  const key = !!process.env.ELEVENLABS_API_KEY || (await run('reg', ['query', 'HKCU\\Environment', '/v', 'ELEVENLABS_API_KEY'])).ok;
  items.push(it('voz', 'Chave da voz (ElevenLabs) configurada', key ? 'ok' : 'aviso', key ? 'encontrada (valor não exibido)' : 'não encontrada neste computador', 'Rode o CONFIGURAR-ELEVENLABS.cmd da esteira.'));
  // Navegador do Flow (porta 9333)
  const flow = await ping(9333, '/json/version');
  items.push(it('flow', 'Chrome do Flow (porta 9333)', flow ? 'ok' : 'aviso', flow ? 'respondendo' : 'não está aberto; será aberto quando houver geração no Flow', 'Abra o Flow Studio.'));
  return { at: new Date().toISOString(), summary: items.some(i => i.status === 'falha') ? 'falha' : items.some(i => i.status === 'aviso') ? 'aviso' : 'ok', items };
}
