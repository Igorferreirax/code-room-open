// Menção de projeto na barra do chat: "@Pesquisador #Canal_YouTube traga ideias de vídeo" manda a missão do Pesquisador para o projeto
// "Canal YouTube", mesmo que outro projeto esteja aberto. O # funciona com o nome do projeto, sem acentos e com _ no lugar de espaço.
export const fold = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

// Procura "#nome" no texto (em qualquer lugar). Devolve o texto sem a menção e o projeto achado; "#" que não bate com nenhum projeto fica no texto.
export function extractProject(text, projects = []) {
  const list = (projects || []).filter(p => !p.internal), re = /(^|\s)#([^\s#]+)/g; let project = null, ambiguous = false, out = String(text ?? '');
  for (const m of String(text ?? '').matchAll(re)) {
    const key = fold(m[2]), hit = list.filter(p => fold(p.name) === key); const found = hit.length === 1 ? hit[0] : list.filter(p => fold(p.name).startsWith(key) && key.length >= 3);
    const one = Array.isArray(found) ? (found.length === 1 ? found[0] : null) : found; if (Array.isArray(found) && found.length > 1) ambiguous = true;
    if (one && !project) { project = one; out = out.replace(m[0], m[1]); }
  }
  return { text: out.replace(/\s{2,}/g, ' ').trim(), project, ambiguous };
}
export const projectToken = name => '#' + String(name).trim().replace(/\s+/g, '_');
