// Ação rápida "abrir": o PRÓPRIO Code Room abre um programa, um arquivo, uma pasta ou um site neste computador.
// Antes isso virava tarefa de agente (gastava cota, passava por Revisor e não abria nada, porque a IA roda sem tela).
//
// Segurança:
// - Programas: só os da lista abaixo (sem terminal, PowerShell, cmd nem nada que dê controle amplo).
// - Arquivos: só os que existem e não executam código ao abrir (.exe, .bat, .ps1, .lnk, .js… são recusados).
// - Sites: só http/https. Nada de file:, javascript:, ms-settings: etc.
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve, extname, join } from 'node:path';

export const PROGRAMS = {
  notepad: { exe: 'notepad.exe', label: 'Bloco de Notas', aliases: ['bloco de notas', 'bloco-de-notas', 'notepad'] },
  calc: { exe: 'calc.exe', label: 'Calculadora', aliases: ['calculadora', 'calculator', 'calc'] },
  paint: { exe: 'mspaint.exe', label: 'Paint', aliases: ['paint', 'mspaint'] },
  explorer: { exe: 'explorer.exe', label: 'Explorador de Arquivos', aliases: ['explorer', 'explorador', 'explorador de arquivos'] },
  vscode: { exe: 'code', label: 'VS Code', aliases: ['vscode', 'vs code', 'code', 'visual studio code'], shell: true },
  chrome: { exe: 'chrome.exe', label: 'Google Chrome', aliases: ['chrome', 'google chrome'], start: true },
  edge: { exe: 'msedge.exe', label: 'Microsoft Edge', aliases: ['edge', 'msedge', 'microsoft edge'], start: true },
  snip: { exe: 'snippingtool.exe', label: 'Ferramenta de Captura', aliases: ['ferramenta de captura', 'snipping tool', 'captura'] },
};
// Abrir estes tipos = executar código. Ficam de fora.
const RISKY = new Set(['.exe', '.com', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta', '.msi', '.msp', '.scr', '.pif', '.lnk', '.url', '.reg', '.cpl', '.jar', '.appref-ms', '.application', '.gadget', '.msc', '.inf', '.sct', '.settingcontent-ms', '.library-ms', '.search-ms']);

const findProgram = name => { const n = String(name || '').trim().toLowerCase(); return Object.entries(PROGRAMS).find(([k, p]) => k === n || p.aliases.includes(n)); };

// Entende o pedido e diz o que vai abrir (sem abrir nada ainda). Usado na validação do cartão e na hora de abrir.
export function planOpen({ alvo, navegador = '' } = {}, { exists = existsSync, stat = statSync } = {}) {
  const raw = String(alvo ?? '').trim(); if (!raw) return { error: 'Diga o que abrir: um programa (ex.: notepad), um arquivo, uma pasta ou um endereço http(s).' };
  if (raw.length > 1000) return { error: 'Endereço ou caminho longo demais.' };
  const nav = String(navegador || '').toLowerCase();
  if (/^https?:\/\//i.test(raw)) {
    let u; try { u = new URL(raw); } catch { return { error: 'Endereço inválido.' }; }
    const where = nav === 'interno' ? 'interno' : nav === 'chrome' || nav === 'edge' ? nav : 'padrao';
    return { kind: 'url', url: u.href, where, summary: where === 'interno' ? `Abrir ${u.href} no navegador do Code Room` : `Abrir ${u.href} no ${where === 'padrao' ? 'navegador padrão' : PROGRAMS[where].label}` };
  }
  if (/^[a-z][\w+.-]*:(?![\\/])/i.test(raw) && !/^[a-z]:/i.test(raw)) return { error: 'Só abro endereços http(s), programas da lista, arquivos e pastas.' };
  const prog = findProgram(raw); if (prog) return { kind: 'program', program: prog[0], summary: `Abrir ${prog[1].label}` };
  if (!isAbsolute(raw)) return { error: `Não conheço o programa “${raw.slice(0, 40)}”. Posso abrir: ${Object.values(PROGRAMS).map(p => p.label).join(', ')}; ou um arquivo/pasta pelo caminho completo.` };
  const full = resolve(raw); if (!exists(full)) return { error: `Não existe: ${full}` };
  let st; try { st = stat(full); } catch (e) { return { error: e.message }; }
  if (st.isDirectory()) return { kind: 'folder', path: full, summary: `Abrir a pasta ${full}` };
  if (RISKY.has(extname(full).toLowerCase())) return { error: `Por segurança não abro arquivos ${extname(full)} (eles executam código). Abra pelo Explorador se for de confiança.` };
  return { kind: 'file', path: full, summary: `Abrir o arquivo ${full}` };
}

const quiet = (file, args, opts = {}) => new Promise((ok, fail) => { const p = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false, ...opts }); p.once('error', fail); p.once('spawn', () => { p.unref(); ok(); }); });

// Abre de fato. "interno" não abre nada aqui: a tela do Code Room abre a aba do navegador interno.
export function browserExe(which, exists = existsSync, env = process.env) {
  const pf = env.ProgramFiles || 'C:\Program Files', pf86 = env['ProgramFiles(x86)'] || 'C:\Program Files (x86)', local = env.LOCALAPPDATA || '';
  const tries = which === 'chrome' ? [join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'), local && join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')]
    : [join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')];
  return tries.filter(Boolean).find(p => exists(p)) || null;
}

export async function runOpen(plan, { launch = quiet, platform = process.platform, findExe = existsSync } = {}) {
  if (!plan || plan.error) throw new Error(plan?.error || 'Nada para abrir.');
  if (platform !== 'win32') throw new Error('Abrir programas pelo Code Room funciona no Windows.');
  const sysRoot = process.env.SystemRoot || 'C:\\Windows', explorer = join(sysRoot, 'explorer.exe');
  if (plan.kind === 'url') {
    if (plan.where === 'interno') return { result: `Abri ${plan.url} no navegador do Code Room.`, browserUrl: plan.url };
    // O endereço vai como argumento direto do programa (nunca passa pelo cmd, onde & e | virariam comandos).
    const exe = plan.where === 'padrao' ? null : browserExe(plan.where, findExe);
    if (plan.where !== 'padrao' && !exe) throw new Error(`Não achei o ${PROGRAMS[plan.where].label} instalado. Use o navegador padrão.`);
    await launch(exe || explorer, [plan.url]);
    return { result: `Abri ${plan.url}${exe ? ` no ${PROGRAMS[plan.where].label}` : ''}.` };
  }
  if (plan.kind === 'program') {
    const p = PROGRAMS[plan.program];
    if (p.start) { const exe = browserExe(plan.program, findExe); if (!exe) throw new Error(`Não achei o ${p.label} instalado.`); await launch(exe, []); }
    else if (p.shell) await launch(join(sysRoot, 'System32', 'cmd.exe'), ['/d', '/c', p.exe]);
    else await launch(p.exe === 'explorer.exe' ? explorer : p.exe, []);
    return { result: `Abri o ${p.label}.` };
  }
  await launch(explorer, [plan.path]);
  return { result: plan.kind === 'folder' ? `Abri a pasta ${plan.path}.` : `Abri ${plan.path}.` };
}
