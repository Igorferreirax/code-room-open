// Terminal de verdade, como na Alethe: abre o Windows Terminal (ou o PowerShell, se ele não existir) já na pasta do
// projeto, com um shell puro ou com a CLI escolhida (Claude, Codex, Gemini) rodando NA TELA, interativa.
// É a pessoa quem digita ali: nada passa pelo Code Room, e nada roda escondido.
//
// "Irrestrito" liga a opção da própria CLI de não pedir confirmação (a pessoa pediu isso de forma explícita).
// Projeto Financeiro: só o shell puro, nunca IA nem modo irrestrito.
import { spawn } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const CLIS = {
  shell: { label: 'PowerShell', args: [], free: [] },
  claude: { label: 'Claude Code', args: [], free: ['--dangerously-skip-permissions'] },
  codex: { label: 'Codex', args: [], free: ['--dangerously-bypass-approvals-and-sandbox'] },
  agy: { label: 'Gemini (Antigravity)', args: [], free: ['--dangerously-skip-permissions'] },
};

// Aspas simples do PowerShell: dobrar ' é o único escape necessário.
const psq = s => `'${String(s).replace(/'/g, "''")}'`;

// Monta o que será aberto (sem abrir). catalog: [{ id, path }] das CLIs encontradas neste computador.
// O wt.exe do Windows é um atalho de aplicativo (link especial): existsSync diz que não existe, lstat enxerga.
const hasAlias = p => { try { lstatSync(p); return true; } catch { return false; } };

export function terminalPlan({ dir, cli = 'shell', unrestricted = false, area = '', title = '' } = {}, { catalog = [], exists = existsSync, hasWt = hasAlias, env = process.env } = {}) {
  const spec = CLIS[cli]; if (!spec) return { error: 'Escolha: PowerShell, Claude, Codex ou Gemini.' };
  if (area === 'Financeiro' && cli !== 'shell') return { error: 'Projeto Financeiro: só o terminal puro (sem IA).' };
  if (area === 'Financeiro' && unrestricted) return { error: 'Projeto Financeiro não abre em modo irrestrito.' };
  const cwd = dir && exists(dir) ? dir : homedir();
  let exe = null; if (cli !== 'shell') { exe = catalog.find(c => c.id === cli)?.path || null; if (!exe) return { error: `${spec.label} não está instalado neste computador.` }; }
  const sysRoot = env.SystemRoot || 'C:\\Windows', ps = join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const flags = [...spec.args, ...(unrestricted && cli !== 'shell' ? spec.free : [])];
  // Sem ";" no comando: o Windows Terminal usa ";" para separar abas.
  const inner = exe ? ['-NoExit', '-NoLogo', '-Command', `& ${psq(exe)}${flags.length ? ' ' + flags.join(' ') : ''}`] : ['-NoExit', '-NoLogo'];
  const name = title || `Code Room · ${spec.label}${unrestricted && cli !== 'shell' ? ' (irrestrito)' : ''}`;
  const wt = env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe') : '';
  if (wt && hasWt(wt)) return { file: wt, args: ['-w', 'new', 'new-tab', '-d', cwd, '--title', name.replace(/;/g, ','), ps, ...inner], cwd, label: spec.label, via: 'Windows Terminal', unrestricted: !!(unrestricted && cli !== 'shell') };
  // Sem Windows Terminal: o conhost abre uma janela de console própria (o PowerShell direto, sem console, fecharia na hora).
  return { file: join(sysRoot, 'System32', 'conhost.exe'), args: [ps, ...inner], cwd, label: spec.label, via: 'PowerShell', unrestricted: !!(unrestricted && cli !== 'shell') };
}

export function openTerminal(plan, { launch = null, platform = process.platform } = {}) {
  if (!plan || plan.error) throw new Error(plan?.error || 'Nada para abrir.');
  if (platform !== 'win32') throw new Error('O terminal do Code Room abre no Windows.');
  const go = launch || ((file, args, opts) => new Promise((ok, fail) => { const p = spawn(file, args, { cwd: opts.cwd, detached: true, stdio: 'ignore', windowsHide: false }); p.once('error', fail); p.once('spawn', () => { p.unref(); ok(); }); }));
  return go(plan.file, plan.args, { cwd: plan.cwd }).then(() => ({ result: `Abri ${plan.label} em ${plan.cwd}${plan.unrestricted ? ', em modo irrestrito' : ''} (${plan.via}).` }));
}
