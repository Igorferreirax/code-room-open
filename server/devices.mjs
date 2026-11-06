import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Pareamento de celulares: a chave principal nunca sai do PC. O PC gera um código de uso único (5 min); o celular troca o código
// por um token PRÓPRIO, guardado só como hash aqui. Dá para ver os aparelhos e revogar cada um.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I/L para ler sem erro
const TTL_MS = 5 * 60 * 1000;
const sha = s => createHash('sha256').update(s).digest();

export class Devices {
  constructor(store) { this.store = store; this.codes = new Map(); this.lastTouch = new Map(); }
  createCode() {
    const now = Date.now();
    for (const [c, e] of this.codes) if (e.exp < now) this.codes.delete(c);
    if (this.codes.size >= 3) throw new Error('Já existem 3 códigos ativos. Use um deles ou aguarde expirar.');
    let code = ''; for (const b of randomBytes(8)) code += ALPHABET[b % ALPHABET.length];
    this.codes.set(code, { exp: now + TTL_MS }); return { code, expiresAt: new Date(now + TTL_MS).toISOString(), ttlSeconds: TTL_MS / 1000 };
  }
  redeem(code, name, ip) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), e = this.codes.get(c);
    if (!e || e.exp < Date.now()) { this.codes.delete(c); throw Object.assign(new Error('Código inválido ou expirado. Gere outro no computador.'), { pairFail: true }); }
    this.codes.delete(c); // uso único
    const token = randomBytes(32).toString('hex'), id = randomBytes(6).toString('hex');
    const dev = { id: `device:${id}`, name: String(name || 'Celular').slice(0, 60) || 'Celular', hash: sha(token).toString('hex'), createdAt: new Date().toISOString(), lastSeen: null, lastIp: ip || null };
    this.store.put('settings', dev); return { token, device: this.view(dev) };
  }
  list() { return this.store.list('settings').filter(s => String(s.id).startsWith('device:')); }
  view(d) { return { id: d.id.slice(7), name: d.name, createdAt: d.createdAt, lastSeen: d.lastSeen, lastIp: d.lastIp }; }
  verify(token, ip) {
    if (typeof token !== 'string' || token.length !== 64) return null;
    const h = sha(token);
    for (const d of this.list()) {
      if (timingSafeEqual(h, Buffer.from(d.hash, 'hex'))) {
        const now = Date.now(); if (now - (this.lastTouch.get(d.id) || 0) > 60000) { this.lastTouch.set(d.id, now); this.store.put('settings', { ...d, lastSeen: new Date(now).toISOString(), lastIp: ip || d.lastIp }); }
        return d;
      }
    }
    return null;
  }
  revoke(id) { const d = this.list().find(x => x.id === `device:${id}`); if (!d) throw new Error('Aparelho não encontrado.'); this.store.remove('settings', d.id); }
}
