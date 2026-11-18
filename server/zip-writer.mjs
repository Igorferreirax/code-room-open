// Gerador de pacote .zip em Node puro (zero dependências externas), usando node:zlib.
// Permite baixar em 1 toque no celular ou computador todos os arquivos finais de uma entrega (vídeo + capa + legenda/roteiro ou site).
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { extname } from 'node:path';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const STORE_EXTS = new Set(['.mp4', '.webm', '.mov', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.m4a', '.ogg', '.woff2', '.zip']);

function dosDateTime(date = new Date()) {
  const y = Math.max(1980, date.getFullYear()) - 1980;
  const dosDate = (y << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { dosDate, dosTime };
}

export function buildZip(entries = [], now = new Date()) {
  const localParts = [], centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime(now);

  for (const e of entries) {
    const cleanName = String(e.name || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\.(\/|$)/g, '');
    if (!cleanName) continue;
    const nameBuf = Buffer.from(cleanName, 'utf8');
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data ?? ''), 'utf8');
    const crc = crc32(raw);
    const shouldStore = raw.length < 64 || STORE_EXTS.has(extname(cleanName).toLowerCase());
    const comp = shouldStore ? raw : deflateRawSync(raw, { level: 6 });
    const useStore = shouldStore || comp.length >= raw.length;
    const payload = useStore ? raw : comp;
    const method = useStore ? 0 : 8;
    const flags = 0x0800; // UTF-8 filename

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);

    localParts.push(lh, nameBuf, payload);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(dosTime, 12);
    ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);

    centralParts.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const count = centralParts.length / 2;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// Leitor leve usado em testes automatizados para validar integridade do .zip gerado.
export function readZipEntries(zipBuf) {
  const out = [];
  let pos = 0;
  while (pos + 30 <= zipBuf.length && zipBuf.readUInt32LE(pos) === 0x04034b50) {
    const method = zipBuf.readUInt16LE(pos + 8);
    const compSize = zipBuf.readUInt32LE(pos + 18);
    const nameLen = zipBuf.readUInt16LE(pos + 26);
    const extraLen = zipBuf.readUInt16LE(pos + 28);
    const name = zipBuf.subarray(pos + 30, pos + 30 + nameLen).toString('utf8');
    const dataStart = pos + 30 + nameLen + extraLen;
    const comp = zipBuf.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? inflateRawSync(comp) : Buffer.from(comp);
    out.push({ name, data });
    pos = dataStart + compSize;
  }
  return out;
}
