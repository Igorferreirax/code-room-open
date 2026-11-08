// Tira da resposta do revisor a lista de problemas, em poucas linhas, para virar o pedido de ajuste ao agente (o usuário revisa antes de enviar).
const strip = s => String(s).replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
const firstSentence = (s, max) => { const t = strip(s); const m = t.match(/^(.{20,}?[.!?])(\s|$)/); const x = m ? m[1] : t; return x.length > max ? x.slice(0, max - 1).trimEnd() + '…' : x; };

export function reviewerProblems(answer, max = 480) {
  const t = String(answer || '').replace(/\r/g, '');
  const m = t.match(/(?:^|\n)#{1,4}[ \t]*Problemas[^\n]*\n([\s\S]*?)(?=\n#{1,4}[ \t]|\nVEREDITO|$)/i);
  if (!m) return { text: '', count: 0 };
  const lines = m[1].split('\n');
  let items = lines.map(l => l.match(/^\d+[.)]\s+(.+)$/)?.[1]).filter(Boolean);
  if (!items.length) items = lines.map(l => l.match(/^[-*•]\s+(.+)$/)?.[1]).filter(Boolean);
  items = items.map(x => firstSentence(x, 160)).filter(Boolean);
  if (!items.length) return { text: '', count: 0 };
  const head = 'Pontos do revisor: ';
  let out = head, n = 0;
  for (const [i, it] of items.entries()) { const piece = `${i + 1}) ${it} `; if ((out + piece).trim().length > max) break; out += piece; n++; }
  if (!n) return { text: (head + items[0]).slice(0, max), count: 1 };
  return { text: out.trim(), count: n };
}
