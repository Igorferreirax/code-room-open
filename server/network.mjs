import os from 'node:os';
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
