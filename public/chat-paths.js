// Descobre se a mensagem do chat cita uma pasta de verdade fora do projeto.
// Só reage a caminho escrito (C:\...) ou a frases claras de pasta ("na Área de Trabalho",
// "pasta Downloads", "meus Documentos"). Palavras soltas como "documento" ou "app desktop" não contam.
// O resultado só pré-preenche a confirmação: a pessoa sempre revisa o caminho antes de autorizar.

// Palavras que costumam vir logo depois de um caminho sem aspas e não fazem parte do nome da pasta.
const AFTER_PATH = new Set('e ou para pra com no na nos nas num numa que se onde aí ai lá la por pelo pela então depois and to or with crie criar cria organize organizar organiza edite editar edita leia ler lê veja ver mova mover move apague apagar apaga coloque colocar coloca salve salvar salva abra abrir abre faça fazer faz use usar usa copie copiar copia renomeie renomear renomeia liste listar lista analise analisar analisa arrume arrumar arruma tem tenho há'.split(' '));

function trimPath(raw) {
  let p = raw.replace(/[\s.,;:!?)\]]+$/, '');
  const cut = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  if (cut < 0) return p;
  const head = p.slice(0, cut + 1), words = p.slice(cut + 1).split(/\s+/);
  const keep = [];
  for (const w of words) { if (keep.length && AFTER_PATH.has(w.toLowerCase())) break; keep.push(w); }
  return (head + keep.join(' ')).replace(/[\s.,;:!?)\]]+$/, '');
}

const DESKTOP = /(?:área|area) de trabalho|\b(?:pasta|n[oa]|d[oa]|para o|pro|meu|minha)\s+desktop\b/i;
const DOWNLOADS = /\b(?:pasta\s+(?:de\s+|d[oa]s?\s+)?|n[oa]s?\s+|em\s+|meus?\s+|minha\s+pasta\s+(?:de\s+)?)downloads?\b/i;
const DOCUMENTS = /\b(?:pasta\s+(?:de\s+|d[oa]s?\s+)?|nos\s+|em\s+|meus\s+|minha\s+pasta\s+(?:de\s+)?)documentos\b/i;

export function mentionedFolder(text = '', known = {}) {
  const s = String(text);
  const quoted = s.match(/["“]([A-Za-z]:[\\/][^"”]+)["”]/)?.[1];
  if (quoted) return quoted.trim();
  const bare = s.match(/(?:^|[\s(])([A-Za-z]:[\\/][^\n"“”<>|?*;,]*)/)?.[1];
  if (bare) return trimPath(bare);
  if (known.desktop && DESKTOP.test(s)) return known.desktop;
  if (known.downloads && DOWNLOADS.test(s)) return known.downloads;
  if (known.documents && DOCUMENTS.test(s)) return known.documents;
  return '';
}
