import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const MAX_CHAT_IMAGE = 1024 * 1024;

export function decodeChatImage(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_CHAT_IMAGE * 4 / 3) + 100) throw new Error('Print muito grande. Envie PNG, JPG ou WebP de até 1 MB.');
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!m) throw new Error('Formato do print inválido. Use PNG, JPG ou WebP.');
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length || bytes.length > MAX_CHAT_IMAGE || bytes.toString('base64') !== m[2]) throw new Error('Print inválido ou maior que 1 MB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpg = bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!(m[1] === 'png' && png || m[1] === 'jpeg' && jpg || m[1] === 'webp' && webp)) throw new Error('O conteúdo do print não corresponde ao formato informado.');
  return { bytes, ext: m[1] === 'jpeg' ? 'jpg' : m[1] };
}

// Cada print fica numa pasta só dele: a IA recebe acesso a essa pasta e não enxerga prints de outras conversas.
export function saveChatImage(dataDir, value) {
  const { bytes, ext } = decodeChatImage(value), base = join(dataDir, 'assistant-images');
  mkdirSync(base, { recursive: true });
  // Sobras antigas (resposta que nunca chegou, versão anterior) não devem acumular no disco da pessoa.
  for (const name of readdirSync(base)) {
    if (!/^[a-f0-9-]{36}(\.(png|jpg|webp))?$/.test(name)) continue;
    const item = join(base, name);
    try { if (Date.now() - statSync(item).mtimeMs > 86400000) rmSync(item, { recursive: true, force: true }); } catch {}
  }
  const dir = join(base, randomUUID()); mkdirSync(dir);
  const path = join(dir, `print.${ext}`);
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  return path;
}

// Apaga o print (e a pasta dele) assim que a resposta chega. Só mexe dentro de assistant-images.
export function removeChatImage(dataDir, path) {
  if (typeof path !== 'string' || !dataDir) return;
  const base = join(dataDir, 'assistant-images'), dir = dirname(path);
  if (dirname(dir) !== base || !/^[a-f0-9-]{36}$/.test(basename(dir))) return;
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
