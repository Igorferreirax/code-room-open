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

export function wantedAddresses(cfg) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const i of list || []) {
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
export async function diagnoseNetwork({ cfg, port, bound, tailscale, probe = defaultProbe, firewall = windowsFirewall }) {
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
  if (process.platform === 'win32' && bound.length) {
    const fw = await firewall(process.execPath, port);
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
export function windowsFirewall(exe, port) {
  // Consulta em lote (rápido): filtros por programa e por porta, depois só as regras de entrada, permitir e ligadas. O caminho vai por variável de ambiente (sem aspas).
  const ps = "$ErrorActionPreference='Stop';try{$ex=$env:CR_EXE;$pt=$env:CR_PORT;$any=[bool](Get-NetFirewallProfile|Where-Object Enabled);$ok=$false;"
    + "$byApp=@(Get-NetFirewallApplicationFilter|Where-Object{$_.Program -ieq $ex});$byPort=@(Get-NetFirewallPortFilter|Where-Object{$_.LocalPort -contains $pt -and $_.Protocol -eq 'TCP'});"
    + "foreach($f in ($byApp+$byPort)){$r=$f|Get-NetFirewallRule;if($r.Direction -eq 'Inbound' -and $r.Action -eq 'Allow' -and $r.Enabled -eq 'True'){$ok=$true;break}};"
    + "$pub=[bool](Get-NetConnectionProfile|Where-Object NetworkCategory -eq 'Public');@{anyEnabled=$any;allowed=$ok;publicLan=$pub}|ConvertTo-Json -Compress}catch{@{error=$_.Exception.Message}|ConvertTo-Json -Compress}";
  return new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 20000, windowsHide: true, env: { ...process.env, CR_EXE: exe, CR_PORT: String(port) } }, (err, stdout) => { try { resolve(JSON.parse(stdout)); } catch { resolve({ error: err?.message || 'sem resposta' }); } }));
}
