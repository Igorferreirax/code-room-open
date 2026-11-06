import { randomUUID } from 'node:crypto';

// Canal = uma identidade (nome, estilo, voz, tom, paleta) com contas nas redes e uma cadência. O "Postador" de cada canal é um agente
// que só PREPARA o pacote de postagem (título, legenda, hashtags por rede); quem publica é código, com a confirmação do dono.
const now = () => new Date().toISOString();
export const STYLES = ['vhs', 'cordel', 'outro'];
const t = (v, max, label, req = false) => { const s = String(v ?? '').trim(); if (req && !s) throw new Error(`${label} obrigatório.`); if (s.length > max) throw new Error(`${label}: máximo de ${max} caracteres.`); return s; };
const handle = v => String(v ?? '').trim().replace(/^@/, '').replace(/[^\w.\-]/g, '').slice(0, 60);

export function saveChannel(store, b) {
  const old = b.id ? store.get('channels', b.id) : null; if (b.id && !old) throw new Error('Canal inexistente.');
  const ch = {
    id: old?.id || randomUUID(), name: t(b.name, 60, 'Nome', true), niche: t(b.niche, 200, 'Nicho'), style: STYLES.includes(b.style) ? b.style : 'outro',
    voice: t(b.voice, 100, 'Voz'), bio: t(b.bio, 300, 'Bio'), tone: t(b.tone, 300, 'Tom de voz do canal'), palette: t(b.palette, 200, 'Paleta e identidade visual'),
    networks: { youtube: handle(b.youtube), instagram: handle(b.instagram), tiktok: handle(b.tiktok) },
    perDay: Math.min(4, Math.max(1, Math.trunc(Number(b.perDay)) || 2)), windows: t(b.windows, 120, 'Horários preferidos'),
    postadorId: old?.postadorId || null, createdAt: old?.createdAt || now(), updatedAt: now()
  };
  return store.put('channels', ch);
}
export function removeChannel(store, id) { if (!store.get('channels', id)) throw new Error('Canal inexistente.'); store.remove('channels', id); return { ok: true }; }

// Agente Postador do canal: lê o POST.md do episódio e entrega o pacote por rede. Nunca publica e nunca toca em credenciais.
export function postadorAgent(ch) {
  const inst = `Você é o Postador do canal "${ch.name}"${ch.niche ? ` (${ch.niche})` : ''}. Tom do canal: ${ch.tone || 'o do POST.md'}.${ch.bio ? ` Bio: ${ch.bio}.` : ''}
Dado o POST.md de um episódio, prepare para CADA rede um pacote pronto para copiar, respeitando os limites:
- YouTube Shorts: título até 100 caracteres (gancho forte, sem clickbait que o vídeo não entregue), descrição com a legenda e #Shorts, 5 a 12 tags.
- Instagram Reels: legenda até 2200 caracteres começando pelo gancho, uma pergunta para comentários, 3 a 5 hashtags no fim.
- TikTok: legenda curta (até 150 caracteres) com gancho e 3 a 5 hashtags.
Regras: nunca publique nada e nunca peça, guarde ou mostre senhas e chaves; nada de engajamento falso, compra de seguidores ou promessas de resultado; o texto deve ser fiel ao vídeo; indique o melhor horário entre os preferidos do canal (${ch.windows || 'não informados'}); termine com "ETAPA: CONCLUÍDA".
Escreva em português do Brasil.`;
  return { name: `Postador — ${ch.name}`.slice(0, 80), role: `Prepara os pacotes de postagem do canal ${ch.name}`.slice(0, 120), room: 'Vídeo', provider: 'claude', model: 'sonnet', instructions: inst, mode: 'read', skillIds: [], capabilities: ['writing'], commands: [] };
}
