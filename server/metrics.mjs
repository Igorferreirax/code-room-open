// Painel de métricas (Conexões › Redes e canais): números do canal do YouTube conectado e das postagens feitas pelo Code Room.
// Leve de propósito: lê o YouTube no máximo a cada 30 minutos (ou quando a pessoa clica em Atualizar) e guarda UMA foto por dia
// para desenhar a evolução. Nada é inventado: número que a rede não informou fica "indisponível", nunca zero.
const KEY = 'metrics:youtube', CACHE_MS = 30 * 60 * 1000;
const day = ms => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export class Metrics {
  constructor(store, { publisher, now = () => Date.now() } = {}) { Object.assign(this, { store, publisher, now }); }

  view(cur, extra = {}) {
    const h = cur.history || [], last = h.at(-1), base = [...h].reverse().find(x => Date.parse(x.date) <= Date.parse(last?.date || 0) - 6 * 864e5);
    const diff = k => last && base && last[k] != null && base[k] != null ? last[k] - base[k] : null;
    return { connected: true, fetchedAt: cur.fetchedAt || null, channel: cur.report?.channel || null, videos: cur.report?.videos || [], history: h.slice(-30), week: { views: diff('views'), subscribers: diff('subscribers') }, ...extra };
  }
  async youtube({ refresh = false } = {}) {
    const st = await this.publisher.status();
    if (!st.google.connected) return { connected: false, configured: st.google.configured };
    const cur = this.store.get('settings', KEY) || { id: KEY, history: [] };
    if (!refresh && cur.report && this.now() - Date.parse(cur.fetchedAt) < CACHE_MS) return this.view(cur);
    try {
      const report = await this.publisher.channelReport(15), d = day(this.now()), c = report.channel;
      cur.history = [...(cur.history || []).filter(x => x.date !== d), { date: d, views: c.views, subscribers: c.subscribers, videos: c.videos }].slice(-120);
      Object.assign(cur, { report, fetchedAt: new Date(this.now()).toISOString() }); this.store.put('settings', cur);
      return this.view(cur);
    } catch (e) {
      if (cur.report) return this.view(cur, { error: `Mostrando a última leitura: ${String(e.message || e).slice(0, 160)}` });
      throw e;
    }
  }
  // Postagens publicadas pelo Code Room nos últimos 30 dias, por rede (todas as redes, inclusive as de pacote manual marcadas como postadas).
  posts() {
    const since = this.now() - 30 * 864e5, by = {};
    for (const p of this.store.list('socialPosts')) { if (p.status !== 'publicado') continue; const at = Date.parse(p.publishedAt || p.postedAt || p.createdAt); if (!(at >= since)) continue; by[p.network] = (by[p.network] || 0) + 1; }
    return by;
  }
}
