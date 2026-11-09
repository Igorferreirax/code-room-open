import os from 'node:os';
import { get as httpGet } from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Acesso remoto: o serviço NUNCA escuta em 0.0.0.0. Ele escuta em 127.0.0.1 e, se você liberar, só nos endereços exatos
// da rede privada do Tailscale (100.64.0.0/10) e/ou da rede local (192.168.x, 10.x, 172.16-31.x). Padrão: Tailscale ligado, rede local desligada.
const DEFAULT = { lan: false, tailscale: false };   // nada escuta fora do 127.0.0.1 até o dono ligar em Configurações › Acesso
export const loadNetwork = dir => { try { return { ...DEFAULT, ...JSON.parse(readFileSync(join(dir, 'network.json'), 'utf8')) }; } catch { return { ...DEFAULT }; } };
export const saveNetwork = (dir, cfg) => { const c = { lan: cfg.lan === true, tailscale: cfg.tailscale === true }; writeFileSync(join(dir, 'network.json'), JSON.stringify(c)); return c; };

const inCgnat = ip => { const [a, b] = ip.split('.').map(Number); return a === 100 && b >= 64 && b <= 127; };
const isPrivate = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const VIRTUAL = /virtual|vethernet|vmware|wsl|docker|loopback|hyper-v|bluetooth|vbox/i;

export function wantedAddresses(cfg, interfaces = null) {
  const out = [];
  try { interfaces ??= os.networkInterfaces(); } catch { return out; }
  for (const [name, list] of Object.entries(interfaces)) for (const i of list || []) {
    if (i.family !== 'IPv4' || i.internal) continue;
    if (inCgnat(i.address)) { if (cfg.tailscale) out.push({ ip: i.address, kind: 'tailscale', name }); }
    else if (cfg.lan && isPrivate(i.address) && !VIRTUAL.test(name)) out.push({ ip: i.address, kind: 'lan', name });
  }
  return out;
}

// Defesa contra DNS rebinding: só aceita o Host que o serviço realmente serve.
export function hostAllowed(hostHeader, port, bound) {
  const h = String(hostHeader || '').toLowerCase();
  if (h === `127.0.0.1:${port}` || h === `localhost:${port}`) return true;
  if (bound.some(b => h === `${b.ip}:${port}`)) return true;
  const m = h.match(/^(?:[a-z0-9-]+\.)+ts\.net:(\d+)$/); // nome MagicDNS do Tailscale
  return !!m && Number(m[1]) === port && bound.some(b => b.kind === 'tailscale');
}
export function originAllowed(origin, port, bound) {
  try { const u = new URL(origin); return u.protocol === 'http:' && hostAllowed(u.host, port, bound); } catch { return false; }
}

const EXES = [process.env.ProgramFiles && join(process.env.ProgramFiles, 'Tailscale', 'tailscale.exe'), 'tailscale'].filter(Boolean);
export function tailscaleStatus() {
  const exe = EXES.find(p => p === 'tailscale' || existsSync(p));
  return new Promise(resolve => {
    if (!exe) return resolve({ installed: false, state: 'não instalado' });
    execFile(exe, ['status', '--json'], { timeout: 4000, windowsHide: true }, (err, stdout) => {
      try {
        const j = JSON.parse(stdout);
        resolve({ installed: true, state: j.BackendState || 'desconhecido', name: (j.Self?.DNSName || '').replace(/\.$/, '') || null, ips: (j.Self?.TailscaleIPs || []).filter(i => i.includes('.')) });
      } catch { resolve({ installed: true, state: err ? 'indisponível' : 'desconhecido' }); }
    });
  });
}

// Limita tentativas erradas por endereço (chave ou código de pareamento).
export class Throttle {
  constructor({ max = 8, windowMs = 10 * 60 * 1000, blockMs = 10 * 60 * 1000 } = {}) { Object.assign(this, { max, windowMs, blockMs }); this.map = new Map(); }
  blocked(ip) { const e = this.map.get(ip); return !!e && e.until > Date.now(); }
  fail(ip) {
    const now = Date.now(), e = this.map.get(ip) || { n: 0, first: now, until: 0 };
    if (now - e.first > this.windowMs) { e.n = 0; e.first = now; }
    e.n++; if (e.n >= this.max) { e.until = now + this.blockMs; e.n = 0; e.first = now; }
    this.map.set(ip, e);
    if (this.map.size > 500) for (const [k, v] of this.map) if (v.until < now && now - v.first > this.windowMs) this.map.delete(k);
  }
  ok(ip) { this.map.delete(ip); }
}

// Diagnóstico do acesso remoto: lê o estado real (só leitura, nada é alterado) e diz, em frases simples, o que impediria o celular de conectar.
// Cada item: { id, ok: true|false|null (informativo), label, hint }.
export async function diagnoseNetwork({ cfg, port, bound, tailscale, probe = defaultProbe, firewall = windowsFirewall, platform = process.platform }) {
  const out = [];
  if (!cfg.lan && !cfg.tailscale) out.push({ id: 'off', ok: false, label: 'O acesso remoto está desligado', hint: 'Ligue o Tailscale (recomendado) ou a rede local abaixo; sem isso o serviço só atende neste computador.' });
  if (cfg.tailscale) {
    if (!tailscale.installed) out.push({ id: 'ts-install', ok: false, label: 'O Tailscale não está instalado neste computador', hint: 'Instale o Tailscale no computador e no celular e entre com a mesma conta nos dois.' });
    else if (tailscale.state !== 'Running') out.push({ id: 'ts-run', ok: false, label: `O Tailscale está “${tailscale.state}” neste computador`, hint: 'Abra o Tailscale na bandeja do Windows e entre com a sua conta (ou conecte).' });
    else out.push({ id: 'ts-ok', ok: true, label: `Tailscale conectado${tailscale.name ? ` como ${tailscale.name}` : ''}`, hint: 'No celular, o app do Tailscale também precisa estar ligado, com a mesma conta.' });
    if (tailscale.installed && tailscale.state === 'Running' && !bound.some(b => b.kind === 'tailscale')) out.push({ id: 'ts-bind', ok: false, label: 'O Code Room ainda não escuta no endereço do Tailscale', hint: 'Desligue e ligue de novo a chave do Tailscale aqui, ou reinicie o Code Room.' });
  }
  if (!cfg.lan) out.push({ id: 'lan-off', ok: null, label: 'Rede local (Wi-Fi) desligada', hint: 'Normal. Se o celular e o computador estão no mesmo Wi-Fi e você quer usar sem o Tailscale, ligue “Rede local”.' });
  for (const b of bound) {
    const r = await probe(b.ip, port);
    out.push({ id: `probe-${b.ip}`, ok: r.ok, label: `${b.kind === 'tailscale' ? 'Tailscale' : 'Rede local'} (${b.ip}): ${r.ok ? 'o serviço responde' : 'o serviço não respondeu'}`, hint: r.ok ? `No celular, abra http://${b.ip}:${port}/ ou escaneie o QR.` : `O serviço não atendeu em ${b.ip}:${port} (${r.error || 'sem resposta'}). Reinicie o Code Room.` });
  }
  if (platform === 'win32' && bound.length) {
    const fw = await firewall(process.execPath, port, { profile: !!cfg.lan });
    if (fw) {
      if (fw.error) out.push({ id: 'fw', ok: null, label: 'Não consegui ler o Firewall do Windows', hint: 'Sem problema: se o celular não abrir a página, libere o Node.js no Firewall do Windows.' });
      else if (!fw.anyEnabled) out.push({ id: 'fw', ok: true, label: 'Firewall do Windows desligado', hint: 'Ele não bloqueia a conexão do celular.' });
      else if (fw.allowed) out.push({ id: 'fw', ok: true, label: 'O Firewall do Windows tem uma regra liberando o Node.js', hint: '' });
      else out.push({ id: 'fw', ok: false, label: 'O Firewall do Windows pode estar bloqueando o celular', hint: `Não achei regra liberando este programa. Em um PowerShell como administrador: New-NetFirewallRule -DisplayName "Code Room" -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow` });
      if (cfg.lan && fw.publicLan) out.push({ id: 'profile', ok: false, label: 'A rede Wi-Fi está marcada como “Pública” no Windows', hint: 'Em Configurações › Rede e Internet › Wi-Fi › propriedades, troque para “Rede particular”. Redes públicas costumam bloquear conexões de outros aparelhos.' });
    }
  }
  if (!out.some(x => x.ok === false)) out.push({ id: 'summary', ok: true, label: 'Tudo certo deste lado', hint: 'Se o celular ainda não abrir: confirme que ele usa o mesmo Wi-Fi (rede local) ou o Tailscale ligado com a mesma conta, e gere um código novo (vale poucos minutos).' });
  return out;
}
function defaultProbe(ip, port) {
  return new Promise(resolve => { const r = httpGet({ host: ip, port, path: '/', timeout: 2500, agent: false, headers: { Host: `${ip}:${port}` } }, x => { x.resume(); resolve({ ok: x.statusCode === 200 }); }); r.on('error', e => resolve({ ok: false, error: e.code || e.message })); r.on('timeout', () => { r.destroy(); resolve({ ok: false, error: 'tempo esgotado' }); }); });
}
export const FIREWALL_RULE = 'Code Room (celular)';
// Consulta o Firewall do Windows de forma rápida e SEM exigir administrador:
// 1) a regra do próprio Code Room (netsh: código de saída 0 = existe; não depende do idioma do Windows);
// 2) se a rede está marcada como Pública e se somos administrador (um PowerShell só);
// 3) só como administrador, a leitura detalhada de todas as regras. Sem permissão, devolve { error } e o diagnóstico mostra um aviso informativo.
export function windowsFirewall(exe, port, { profile = true, run = execFile } = {}) {
  const cmd = (file, args, timeout, extraEnv = {}) => new Promise(resolve => run(file, args, { timeout, windowsHide: true, env: { ...process.env, ...extraEnv } }, (err, stdout) => resolve({ err, out: String(stdout || '') })));
  // Perfil de rede Público só importa para o Wi-Fi (rede local) e o PowerShell leva ~2 s, então só consulta quando pedido.
  const profilePs = "[bool](Get-NetConnectionProfile -ErrorAction SilentlyContinue|Where-Object NetworkCategory -eq 'Public')";
  return (async () => {
    const [rule, adm, prof] = await Promise.all([
      cmd('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE}`], 4000),
      cmd('fltmc', [], 3000), // só administrador consegue (código de saída 0); rápido e não depende do idioma
      profile ? cmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', profilePs], 8000) : Promise.resolve({ err: null, out: '' })
    ]);
    const publicLan = /true/i.test(prof.out);
    if (!rule.err) return { anyEnabled: true, allowed: true, publicLan, ours: true };
    if (adm.err) return { error: 'Sem permissão de administrador para ler todas as regras do Firewall.', publicLan, ours: false };
    // Administrador: leitura detalhada (filtros por programa e por porta, depois só regras de entrada, permitir e ligadas).
    const ps = "$ErrorActionPreference='Stop';try{$ex=$env:CR_EXE;$pt=$env:CR_PORT;$any=[bool](Get-NetFirewallProfile|Where-Object Enabled);$ok=$false;"
      + "$byApp=@(Get-NetFirewallApplicationFilter|Where-Object{$_.Program -ieq $ex});$byPort=@(Get-NetFirewallPortFilter|Where-Object{$_.LocalPort -contains $pt -and $_.Protocol -eq 'TCP'});"
      + "foreach($f in ($byApp+$byPort)){$r=$f|Get-NetFirewallRule;if($r.Direction -eq 'Inbound' -and $r.Action -eq 'Allow' -and $r.Enabled -eq 'True'){$ok=$true;break}};"
      + "@{anyEnabled=$any;allowed=$ok}|ConvertTo-Json -Compress}catch{@{error=$_.Exception.Message}|ConvertTo-Json -Compress}";
    const det = await cmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], 20000, { CR_EXE: exe, CR_PORT: String(port) });
    try { return { ...JSON.parse(det.out), publicLan, ours: false }; } catch { return { error: det.err?.message || 'sem resposta', publicLan, ours: false }; }
  })();
}
export function firewallScript(action, exe, port) {
  const q = v => "'" + String(v).replace(/'/g, "''") + "'";
  if (action === 'remove') return `Remove-NetFirewallRule -DisplayName ${q(FIREWALL_RULE)} -ErrorAction SilentlyContinue`;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta inválida.');
  return `Remove-NetFirewallRule -DisplayName ${q(FIREWALL_RULE)} -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName ${q(FIREWALL_RULE)} -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port} -Program ${q(exe)} -Profile Any -RemoteAddress LocalSubnet,100.64.0.0/10 | Out-Null`;
}
export function changeFirewall(action, exe, port, run = execFile) {
  const inner = firewallScript(action, exe, port);
  const outer = `$p=Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-Command',$env:CR_FW; exit $p.ExitCode`;
  return new Promise(resolve => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', outer], { timeout: 120000, windowsHide: true, env: { ...process.env, CR_FW: inner } }, err => {
    if (!err) return resolve({ ok: true });
    resolve({ ok: false, error: /cancel|recus|denied|negad|operation was canceled/i.test(String(err.message)) ? 'A permissão do Windows foi recusada. Clique em "Sim" quando ela aparecer.' : 'Não foi possível alterar o Firewall: ' + String(err.message).split(String.fromCharCode(10))[0].slice(0, 160) });
  }));
}

// Texto do comando /celular do Assistente: lido da própria ferramenta (sem gastar cota). Não altera nada.
export function phoneGuide(view, checks = []) {
  const addr = view.addresses || [], lines = ['**Abrir o Code Room no celular** (só leitura; nada foi alterado):'];
  if (!addr.length) lines.push('- ⚠️ O acesso remoto está desligado. Em **Configurações › Acesso**, ligue o **Tailscale** (recomendado, funciona de qualquer lugar) ou a **Rede local** (mesmo Wi-Fi).');
  else lines.push(...addr.map(a => `- ✅ ${a.kind === 'tailscale' ? 'Tailscale' : 'Rede local'}: \`${a.url}\``));
  for (const c of checks) if (c.ok === false && c.id !== 'off') lines.push(`- ⚠️ ${c.label}${c.hint ? '. ' + c.hint : ''}`);
  lines.push('', '**Passo a passo:**', '1. Em **Configurações › Acesso**, ligue Tailscale ou Rede local.', '2. Se o celular não abrir a página, clique em **Liberar no firewall do Windows** (o Windows pede a sua permissão uma vez).', '3. Clique em **Parear um celular** e escaneie o QR (ou abra o endereço e digite o código).', '4. Tailscale: o app precisa estar instalado e ligado no celular, na mesma conta do computador.');
  lines.push('', '⚠️ A Rede local usa HTTP sem criptografia: desligue fora de casa. O celular pareado recebe um token próprio que você revoga em Acesso.');
  return lines.join(String.fromCharCode(10));
}
