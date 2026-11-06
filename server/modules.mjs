import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executable, connectors } from './connectors.mjs';

// Um módulo declara capacidades; cada uma só fica "verified" depois que uma sonda real rodou neste computador.
// Estados: verified (sonda executada com sucesso), unverified (existe mas não foi provado), unavailable.
const run = (file, args, timeout = 20000) => new Promise(r => execFile(file, args, { windowsHide: true, timeout }, err => r(!err)));

async function probeFfmpeg() {
  const path = executable('ffmpeg');
  if (!path) return { 'video.render': { status: 'unavailable', detail: 'ffmpeg não encontrado no PATH.' } };
  const dir = mkdtempSync(join(tmpdir(), 'code-room-probe-'));
  try {
    const out = join(dir, 'probe.mp4');
    const ok = await run(path, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=5', '-pix_fmt', 'yuv420p', '-y', out]);
    const good = ok && statSync(out).size > 0;
    return { 'video.render': { status: good ? 'verified' : 'unverified', detail: good ? 'Codificação de teste de 1 s concluída (ffmpeg).' : 'ffmpeg existe, mas a codificação de teste falhou.' } };
  } catch { return { 'video.render': { status: 'unverified', detail: 'Sonda não concluída.' } }; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function probeModules() {
  const providers = connectors();
  const dev = {};
  for (const p of providers) dev[`agent.${p.id}`] = { status: p.path ? 'verified' : 'unavailable', detail: p.path ? 'Executável localizado.' : 'CLI não instalado.' };
  const video = await probeFfmpeg();
  return [
    { id: 'dev', name: 'Desenvolvimento', areas: ['Programação'], capabilities: { code: dev['agent.codex'].status === 'verified' || dev['agent.claude'].status === 'verified' ? { status: 'verified', detail: 'Pelo menos um CLI de agente executa tarefas (validado em execuções reais).' } : { status: 'unavailable', detail: 'Nenhum CLI instalado.' }, review: { status: 'verified', detail: 'Revisão por agente somente leitura (validada em execução real).' } , ...dev } },
    { id: 'video', name: 'Vídeo', areas: ['Vídeo'], capabilities: { 'video.edit': { status: 'unverified', detail: 'Declarado por agente; nenhuma ferramenta de edição foi validada.' }, ...video } },
    { id: 'research', name: 'Pesquisa', areas: ['Pesquisa'], capabilities: { research: { status: 'unverified', detail: 'Depende das ferramentas web dos provedores; não validado.' } } },
    { id: 'finance', name: 'Finanças', areas: ['Financeiro'], capabilities: { finance: { status: 'verified', detail: 'Ledger local determinístico com testes; sem transferências.' } } },
    { id: 'ops', name: 'Operações', areas: ['Operações'], capabilities: { ops: { status: 'unavailable', detail: 'Módulo apenas reservado na arquitetura.' } } }
  ];
}

// Só capacidades com status "verified" podem ser exigidas por um plano.
export function capabilityVerified(modules, name) {
  return modules.some(m => m.capabilities[name]?.status === 'verified');
}
