// Portões objetivos de qualidade por domínio (Vídeo, Programação, Sites/Design e Automação).
// Somente leitura e 100% local: confere sintaxe real, segredos acidentais, responsividade/ativos HTML e métricas de vídeo/áudio,
// devolvendo um placar claro + prompt cirúrgico caso algo precise ser corrigido pelo agente.
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { qaVideo } from './qa.mjs';

const SECRET_PATTERNS = [
  ['Chave OpenAI / API (sk-…)', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ['Chave Google Cloud / Gemini (AIza…)', /\bAIza[0-9A-Za-z_-]{33,}\b/],
  ['Token GitHub (ghp_/github_pat_)', /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['Chave privada PEM no código', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Token Slack / Bot (xoxb-…)', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
];

const TEXT_CHECK_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.json', '.html', '.htm', '.css', '.md', '.txt', '.ps1', '.sh', '.yml', '.yaml', '.toml']);

function runExec(cmd, args, timeout = 12000) {
  return new Promise(res => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      res({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || err?.message || '').trim() });
    });
  });
}

function insideRoot(rootPath, candidate) {
  const r = resolve(rootPath), c = resolve(candidate);
  return c.toLowerCase() === r.toLowerCase() || c.toLowerCase().startsWith((r + sep).toLowerCase());
}

export function detectTaskDomain(area = '', filePaths = []) {
  const exts = filePaths.map(p => extname(String(p || '')).toLowerCase());
  if (area === 'Vídeo' || exts.some(e => ['.mp4', '.webm', '.mov', '.srt', '.vtt'].includes(e))) return 'video';
  if (exts.some(e => ['.html', '.htm'].includes(e)) || area === 'Design' || area === 'Marketing') return 'web';
  if (area === 'Automação' || exts.some(e => ['.ps1', '.sh'].includes(e))) return 'automation';
  if (exts.some(e => ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.json', '.css'].includes(e)) || area === 'Programação') return 'code';
  return 'content';
}

export function qaSummaryBadge(qa) {
  if (!qa || qa.score == null) return '';
  if (qa.status === 'ok') return `✔ Qualidade validada (${qa.score}%)`;
  const bad = (qa.checks || []).filter(c => c.status !== 'ok').map(c => c.label).slice(0, 2).join(', ');
  return `${qa.status === 'bad' ? '✖' : '⚠'} Qualidade ${qa.score}%${bad ? ` (${bad})` : ''}`;
}

export async function validateTaskArtifacts(projectPath, task, { quick = false } = {}) {
  const rawFiles = (task?.result?.deliverables?.files || task?.deliverables?.files || []).filter(f => f?.path && f.change !== 'deleted');
  const domain = detectTaskDomain(task?.project?.area || '', rawFiles.map(f => f.path));
  const checks = [];

  if (!projectPath || !existsSync(projectPath)) {
    return { checkedAt: new Date().toISOString(), domain, status: 'aviso', score: null, checks: [{ id: 'proj', status: 'aviso', label: 'Pasta do projeto não encontrada no disco', detail: 'Confira o caminho do projeto.' }], fixPrompt: '' };
  }
  if (!rawFiles.length) {
    return { checkedAt: new Date().toISOString(), domain, status: 'ok', score: 100, checks: [{ id: 'text-only', status: 'ok', label: 'Entrega em texto / análise', detail: 'Nenhum arquivo de código ou mídia alterado para inspecionar.' }], fixPrompt: '' };
  }

  const secretHits = [];
  const syntaxErrors = [];
  let syntaxCount = 0;
  const htmlIssues = [];
  let htmlCount = 0, hyperframesCount = 0;
  const videoChecks = [];

  for (const f of rawFiles.slice(0, 30)) {
    const full = resolve(projectPath, f.path);
    if (!insideRoot(projectPath, full) || !existsSync(full)) continue;
    const ext = extname(f.path).toLowerCase();

    if (TEXT_CHECK_EXTS.has(ext)) {
      let content = '';
      try {
        const st = await stat(full);
        if (st.size <= 1_500_000) content = await readFile(full, 'utf8');
      } catch {}
      if (content) {
        for (const [label, re] of SECRET_PATTERNS) {
          if (re.test(content)) secretHits.push(`${f.path} (${label})`);
        }
      }

      if (['.js', '.mjs', '.cjs'].includes(ext)) {
        syntaxCount++;
        const r = await runExec(process.execPath, ['--check', full]);
        if (!r.ok) syntaxErrors.push(`${f.path}: ${r.err.split(/\r?\n/).slice(0, 2).join(' ').slice(0, 180)}`);
      } else if (ext === '.json') {
        syntaxCount++;
        try { JSON.parse(content || await readFile(full, 'utf8')); }
        catch (e) { syntaxErrors.push(`${f.path}: JSON inválido (${e.message.slice(0, 120)})`); }
      } else if (ext === '.py') {
        const py = await runExec('python', ['-m', 'py_compile', full]);
        if (py.ok) syntaxCount++;
        else if (!/not found|não reconhecido|ENOENT/i.test(py.err)) {
          syntaxCount++;
          syntaxErrors.push(`${f.path}: ${py.err.split(/\r?\n/).slice(-2).join(' ').slice(0, 180)}`);
        }
      }

      if (['.html', '.htm'].includes(ext) && content) {
        htmlCount++;
        const isHf = /hyperframes|data-composition|data-track/i.test(content);
        if (isHf) hyperframesCount++;
        if (!isHf && !/<meta[^>]+name=["']viewport["']/i.test(content)) {
          htmlIssues.push(`${f.path}: sem <meta name="viewport"> (pode quebrar no celular)`);
        }
        if (!/<title>[^<]+<\/title>/i.test(content) && !isHf) {
          htmlIssues.push(`${f.path}: sem <title> preenchido`);
        }
        // Confere referências locais src="..." e href="..." quebradas
        const refs = [...content.matchAll(/\b(?:src|href)=["']([^"'#?]+)["']/gi)].map(m => m[1]);
        for (const ref of refs.slice(0, 25)) {
          if (/^(?:https?:|data:|blob:|mailto:|tel:|javascript:|\/\/|\/live\/|\/lp\/)/i.test(ref)) continue;
          const refPath = ref.startsWith('/') ? resolve(projectPath, ref.slice(1)) : resolve(dirname(full), ref);
          if (insideRoot(projectPath, refPath) && !existsSync(refPath)) {
            htmlIssues.push(`${f.path}: referência local não encontrada (${ref})`);
          }
        }
      }
    } else if (['.mp4', '.webm', '.mov'].includes(ext)) {
      const qa = quick ? null : await qaVideo(full, { kind: /final/i.test(f.path) ? 'final' : 'previa' }).catch(() => null);
      if (qa?.checked) {
        for (const it of qa.items) {
          videoChecks.push({
            id: `vid-${f.path}-${it.id}`,
            status: it.status === 'falha' ? 'bad' : it.status === 'aviso' ? 'aviso' : 'ok',
            label: `${f.path.split('/').pop()} · ${it.label}`,
            detail: it.detail,
          });
        }
      } else {
        const st = await stat(full).catch(() => null);
        videoChecks.push({
          id: `vid-size-${f.path}`,
          status: st?.size > 1024 ? 'ok' : 'bad',
          label: `Arquivo de vídeo (${f.path.split('/').pop()})`,
          detail: st ? `${Math.round(st.size / 1024)} KB gravados${qa?.reason ? ' · ' + qa.reason : ''}` : 'arquivo vazio',
        });
      }
    }
  }

  checks.push({
    id: 'secrets',
    status: secretHits.length ? 'bad' : 'ok',
    label: 'Segurança (chaves e tokens expostos)',
    detail: secretHits.length ? `Encontrado em: ${secretHits.join(', ')}` : 'Nenhum segredo exposto nos arquivos da entrega',
  });

  if (syntaxCount > 0) {
    checks.push({
      id: 'syntax',
      status: syntaxErrors.length ? 'bad' : 'ok',
      label: `Sintaxe de código (${syntaxCount} arquivo${syntaxCount > 1 ? 's' : ''})`,
      detail: syntaxErrors.length ? syntaxErrors.slice(0, 3).join(' | ') : 'Todos os scripts/JSON passaram na checagem de sintaxe',
    });
  }

  if (htmlCount > 0) {
    checks.push({
      id: 'web',
      status: htmlIssues.some(x => x.includes('não encontrada')) ? 'bad' : htmlIssues.length ? 'aviso' : 'ok',
      label: hyperframesCount ? `Composição HyperFrames / HTML (${htmlCount})` : `Estrutura Web & Mobile (${htmlCount} página${htmlCount > 1 ? 's' : ''})`,
      detail: htmlIssues.length ? htmlIssues.slice(0, 3).join(' · ') : (hyperframesCount ? 'Marcação HyperFrames e ativos locais conferidos' : 'Viewport mobile, título e referências locais conferidos'),
    });
  }

  checks.push(...videoChecks);

  if (domain === 'video' && !videoChecks.length && !hyperframesCount) {
    const hasScript = rawFiles.some(f => /\.(md|txt|srt|vtt|json)$/i.test(f.path));
    checks.push({
      id: 'video-prep',
      status: hasScript ? 'ok' : 'aviso',
      label: 'Artefatos de pré-produção de vídeo',
      detail: hasScript ? 'Roteiro / legendas / estrutura entregues' : 'Ainda sem clipe renderizado ou roteiro em arquivo',
    });
  }

  const bads = checks.filter(c => c.status === 'bad'), warns = checks.filter(c => c.status === 'aviso');
  const okCount = checks.filter(c => c.status === 'ok').length;
  const score = checks.length ? Math.round(((okCount + warns.length * 0.5) / checks.length) * 100) : 100;
  const status = bads.length ? 'bad' : warns.length ? 'aviso' : 'ok';

  const issues = [...bads, ...warns];
  const fixPrompt = issues.length
    ? `Corrija de forma objetiva os seguintes pontos detectados na validação automática de qualidade:\n${issues.map(i => `- ${i.label}: ${i.detail}`).join('\n')}\nMantenha intacto tudo o que já passou na validação.`
    : '';

  return { checkedAt: new Date().toISOString(), domain, status, score, checks, fixPrompt };
}
