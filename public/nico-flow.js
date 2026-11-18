// Nico Flutuante (estilo Wispr Flow + Mini-Agente sempre visível quando minimizado):
// 1) Ctrl+Espaço (ou Alt+Espaço / pílula Voz): fale e o Nico digita organizado onde o cursor estiver.
// 2) Botão ⧉ Destacar: abre mini-janela sempre no topo (Picture-in-Picture / popup) que continua visível mesmo com o Code Room minimizado, mostrando status dos projetos, alertas e recebendo comandos.
import { mascot, moodOf } from './mascot.js';
import { voiceSupport } from './voice.js';
import { startNeural, voiceLevels } from './neural-viz.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Limpa vícios de fala, aplica comandos de pontuação ditados e organiza em texto corrido ou lista de tópicos (0 ms, sem gastar cota).
export function organizeSpeechText(raw, { format = 'text' } = {}) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  let wantList = format === 'list';
  if (/^(?:em\s+lista|lista|itens|t[óo]picos)\s*[:,-]?\s+/i.test(s)) {
    wantList = true;
    s = s.replace(/^(?:em\s+lista|lista|itens|t[óo]picos)\s*[:,-]?\s+/i, '');
  }
  s = s
    .replace(/\b(?:novo|pr[óo]ximo)\s+par[áa]grafo\b/gi, '\n\n')
    .replace(/\b(?:nova|pr[óo]xima)\s+linha\b|\bquebra\s+de\s+linha\b/gi, '\n')
    .replace(/\bponto\s+de\s+interroga[çc][ãa]o\b/gi, '?')
    .replace(/\bponto\s+de\s+exclama[çc][ãa]o\b/gi, '!')
    .replace(/\bponto\s+final\b/gi, '.')
    .replace(/\bponto\s+e\s+v[íi]rgula\b/gi, ';')
    .replace(/\bdois\s+pontos\b/gi, ':')
    .replace(/\bv[íi]rgula\b/gi, ',')
    .replace(/(?:^|\s)(?:é{2,}|hum+|ãh+|ahn+|ehh+)(?=\s|[,.!?;:]|$)/gi, ' ')
    .replace(/\b(o|a|os|as|um|uma|de|do|da|em|no|na|que|para|pra|com|por|se|eu|ele|ela)\s+\1\b/gi, '$1')
    .replace(/[ \t]+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])([^\s\n,.!?;:])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ');

  if (wantList) {
    const rawItems = s
      .replace(/\b(?:primeiro|1º|item\s+1|item\s+um)\s*[:,-]?\s+/gi, '\n')
      .replace(/\b(?:segundo|2º|item\s+2|item\s+dois|terceiro|3º|item\s+3|item\s+tr[êe]s|quarto|4º|item\s+4|quinto|5º|item\s+5|depois\s+disso|al[ée]m\s+disso)\s*[:,-]?\s+/gi, '\n')
      .split(/\n+|;\s+|\.\s+/)
      .map(x => x.replace(/^\s*[-*•]\s*/, '').replace(/[.,;:\s]+$/, '').trim())
      .filter(Boolean);
    return rawItems.map(it => `- ${it.charAt(0).toUpperCase()}${it.slice(1)}`).join('\n');
  }

  const lines = s.split('\n').map(line => {
    let t = line.trim();
    if (!t) return '';
    t = t.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, p1, ch) => p1 + ch.toUpperCase());
    if (t.split(/\s+/).length >= 4 && !/[.!?:;]$/.test(t)) t += '.';
    return t;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function insertAtSelection(value, inserted, selStart = null, selEnd = null) {
  const v = String(value ?? ''), ins = String(inserted ?? '');
  if (!ins) return { value: v, caret: v.length };
  const start = Number.isInteger(selStart) ? Math.max(0, Math.min(v.length, selStart)) : v.length;
  const end = Number.isInteger(selEnd) ? Math.max(start, Math.min(v.length, selEnd)) : start;
  const before = v.slice(0, start), after = v.slice(end);
  const padLeft = before && !/[\s\n(\[{]$/.test(before) && !/^[,.;:!?)\]}]/.test(ins) ? (ins.startsWith('- ') ? '\n' : ' ') : '';
  const padRight = after && !/^[\s\n,.;:!?)\]}]/.test(after) ? ' ' : '';
  const next = before + padLeft + ins + padRight + after;
  return { value: next, caret: (before + padLeft + ins).length };
}

function isEditableText(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.id === 'nico-flow-draft') return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const t = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'url', 'email'].includes(t) && el.id !== 'access-key' && el.id !== 'pair-code';
  }
  return false;
}

function labelForTarget(el) {
  if (!el || !el.isConnected) return 'Área de transferência';
  if (el.id === 'home-mission') return 'Pedido inicial';
  if (el.id === 'mission') return 'Barra do chat';
  if (el.id === 'home-list-input') return 'Lista de itens';
  if (el.id === 'review-note') return 'Nota de revisão';
  const lbl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
  const txt = (lbl?.childNodes?.[0]?.textContent || el.getAttribute('aria-label') || el.placeholder || el.name || 'Caixa de texto').trim();
  return txt.replace(/[…:]+$/, '').slice(0, 32) || 'Caixa de texto';
}

export function initNicoFlow({ getName = () => 'Nico', getCtx = () => null, askFn = null, polishFn = null, notify = () => {}, isAuthed = () => true, sendGlobalText = null } = {}) {
  let root = null, targetEl = null, sel = [null, null];
  let state = 'idle'; // idle | listening | polishing | done
  let format = 'text', useAi = false, finalParts = [], interim = '', errMsg = '';
  let rec = null, audioCtx = null, mediaStream = null, rafId = 0, undoSnap = null, doneTimer = null;
  let pipWin = null, pipRec = null, pipListening = false, pipNote = '';

  const rememberTarget = el => {
    if (!isEditableText(el)) return;
    targetEl = el;
    try { sel = [el.selectionStart, el.selectionEnd]; } catch { sel = [null, null]; }
    if (state !== 'idle') paint();
  };

  document.addEventListener('focusin', e => rememberTarget(e.target), true);
  document.addEventListener('keyup', e => { if (e.target === targetEl) rememberTarget(e.target); }, true);
  document.addEventListener('mouseup', e => { if (e.target === targetEl) rememberTarget(e.target); }, true);

  function stopAudioMeter() {
    cancelAnimationFrame(rafId); rafId = 0;
    try { mediaStream?.getTracks()?.forEach(t => t.stop()); } catch {}
    try { audioCtx?.close(); } catch {}
    mediaStream = null; audioCtx = null;
  }

  async function startAudioMeter() {
    stopAudioMeter();
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      audioCtx = new Ctx();
      const src = audioCtx.createMediaStreamSource(mediaStream), an = audioCtx.createAnalyser();
      an.fftSize = 64; src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        if (state !== 'listening') return;
        an.getByteFrequencyData(data);
        const bars = root?.querySelectorAll('.nf-wave i');
        if (bars?.length === 5) {
          for (let i = 0; i < 5; i++) {
            const v = (data[i * 3 + 1] || 0) / 255;
            bars[i].style.height = `${Math.round(6 + v * 22)}px`;
          }
        }
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    } catch {}
  }

  function stopRec() {
    try { rec?.stop(); } catch {}
    rec = null;
    stopAudioMeter();
  }

  function startListening() {
    if (!isAuthed()) return;
    clearTimeout(doneTimer);
    if (isEditableText(document.activeElement)) rememberTarget(document.activeElement);
    else if (!targetEl?.isConnected) targetEl = document.getElementById('home-mission') || document.getElementById('mission') || null;
    const sup = voiceSupport(window);
    finalParts = []; interim = ''; errMsg = ''; state = 'listening';
    paint(true);
    if (!sup.stt) {
      errMsg = 'Este navegador não tem ditado nativo; digite ou cole abaixo e o Nico organiza.';
      paint();
      root?.querySelector('#nico-flow-draft')?.focus();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = 'pt-BR'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = e => {
      const finals = []; let curInterim = '';
      for (let i = 0; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) finals.push(tr); else curInterim += (curInterim ? ' ' : '') + tr;
      }
      finalParts = finals; interim = curInterim;
      const draft = root?.querySelector('#nico-flow-draft');
      if (draft && document.activeElement !== draft) draft.value = combinedRaw();
      const pv = root?.querySelector('.nf-preview');
      if (pv) pv.textContent = organizeSpeechText(combinedRaw(), { format }) || 'Ouvindo você… fale naturalmente.';
    };
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      rec = null; stopAudioMeter();
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') errMsg = 'Microfone bloqueado no navegador. Libere no cadeado do endereço ou digite abaixo.';
      else errMsg = `Aviso do microfone (${e.error || 'indisponível'}). Você também pode digitar ou colar abaixo.`;
      paint();
    };
    r.onend = () => { if (state === 'listening' && rec === r) { try { r.start(); } catch { rec = null; } } };
    rec = r;
    try { r.start(); startAudioMeter(); } catch { rec = null; errMsg = 'Não consegui abrir o microfone agora; digite abaixo.'; paint(); }
  }

  const combinedRaw = () => {
    const draft = root?.querySelector('#nico-flow-draft');
    if (draft && document.activeElement === draft) return draft.value.trim();
    return [...finalParts, interim].filter(Boolean).join(' ').trim() || (draft?.value || '').trim();
  };

  async function applyText() {
    const raw = combinedRaw();
    stopRec();
    if (!raw) { state = 'idle'; paint(true); return; }
    let text = organizeSpeechText(raw, { format });
    if (useAi && polishFn) {
      state = 'polishing'; paint(true);
      try { const r = await polishFn(raw, format); if (r?.text) text = r.text; } catch {}
    }
    if (targetEl?.isConnected && isEditableText(targetEl)) {
      const prevVal = targetEl.value, prevSel = [...sel];
      const res = insertAtSelection(prevVal, text, sel[0], sel[1]);
      undoSnap = { el: targetEl, value: prevVal, sel: prevSel, label: labelForTarget(targetEl) };
      targetEl.value = res.value;
      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
      targetEl.focus();
      try { targetEl.setSelectionRange(res.caret, res.caret); sel = [res.caret, res.caret]; } catch {}
      state = 'done'; paint(true);
      doneTimer = setTimeout(() => { if (state === 'done') { state = 'idle'; paint(true); } }, 6000);
    } else {
      try { await navigator.clipboard.writeText(text); notify(`${getName()} copiou o texto organizado para a área de transferência.`); }
      catch { notify(text); }
      state = 'idle'; paint(true);
    }
  }

  function undoLast() {
    if (!undoSnap?.el?.isConnected) return;
    const { el, value, sel: s0 } = undoSnap;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    if (Number.isInteger(s0[0])) try { el.setSelectionRange(s0[0], s0[1] ?? s0[0]); } catch {}
    undoSnap = null; state = 'idle'; clearTimeout(doneTimer); paint(true);
  }

  function cancel() {
    stopRec(); clearTimeout(doneTimer); state = 'idle'; errMsg = ''; paint(true);
    if (targetEl?.isConnected) targetEl.focus();
  }

  function toggle() {
    if (state === 'listening') return applyText();
    if (state === 'polishing') return;
    startListening();
  }


  // ---------- Voz em qualquer programa (atalho global Ctrl+Shift+Espaço da bandeja) ----------
  // O atalho NÃO traz o Code Room para a frente: o foco continua no campo que a pessoa escolheu. O Code Room (ou a
  // mini-janela flutuante, se aberta) ouve e transcreve com a animação neural; ao apertar de novo, o texto vai para a
  // bandeja, que cola no campo onde o cursor está.
  let gv = null;   // { id, win, rec, finals, interim, stream, ctx, stopViz, el }
  function overlayHost(win) {
    const doc = win.document; let el = doc.getElementById('nico-voice-overlay');
    if (!el) {
      el = doc.createElement('div'); el.id = 'nico-voice-overlay'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      el.style.cssText = win === window ? 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9500;width:min(440px,calc(100vw - 32px));' : 'position:fixed;inset:auto 8px 8px 8px;z-index:50;';
      doc.body.appendChild(el);
    }
    el.innerHTML = '<div style="background:#0b1426;border:1px solid #2b5bb5;border-radius:16px;padding:10px 12px;box-shadow:0 12px 34px rgba(0,0,0,.45);color:#e8eefc;font:13px/1.4 system-ui,Segoe UI,sans-serif">'
      + '<canvas class="nv-canvas" style="display:block;width:100%;height:118px"></canvas>'
      + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:4px"><b class="nv-title">' + esc(getName() || 'Nico') + ' está ouvindo…</b><small style="color:#8fa3c7">Ctrl+Shift+Espaço para colar</small></div>'
      + '<div class="nv-text" style="margin-top:4px;max-height:66px;overflow:auto;color:#cfe0ff;white-space:pre-wrap"></div></div>';
    return el;
  }
  async function globalStart(id) {
    if (gv) globalCancel();
    const win = pipWin && !pipWin.closed ? pipWin : window, SR = win.SpeechRecognition || win.webkitSpeechRecognition || window.SpeechRecognition || window.webkitSpeechRecognition;
    const el = overlayHost(win), out = el.querySelector('.nv-text');
    const g0 = gv = { id, win, rec: null, finals: [], interim: '', stream: null, ctx: null, an: null, stopViz: null, el };
    let freq = null, time = null;
    try {
      const md = win.navigator.mediaDevices || navigator.mediaDevices;
      g0.stream = await md.getUserMedia({ audio: true });
      const AC = win.AudioContext || win.webkitAudioContext; g0.ctx = new AC(); g0.an = g0.ctx.createAnalyser(); g0.an.fftSize = 256;
      g0.ctx.createMediaStreamSource(g0.stream).connect(g0.an); freq = new Uint8Array(gv.an.frequencyBinCount); time = new Uint8Array(gv.an.fftSize);
    } catch {}
    if (gv !== g0) { globalTeardown(g0); return; }   // cancelado enquanto pedia o microfone
    g0.stopViz = startNeural(el.querySelector('canvas'), () => { if (!g0.an) return null; g0.an.getByteFrequencyData(freq); g0.an.getByteTimeDomainData(time); return voiceLevels(freq, time); });
    if (!SR) { out.textContent = 'Este navegador não tem ditado. Use o Chrome ou o Edge.'; return; }
    const r = new SR(); r.lang = 'pt-BR'; r.interimResults = true; r.continuous = true;
    r.onresult = e => { const fin = []; let it = ''; for (let i = 0; i < e.results.length; i++) { const tr = e.results[i][0].transcript.trim(); if (e.results[i].isFinal) fin.push(tr); else it += (it ? ' ' : '') + tr; } g0.finals = fin; g0.interim = it; out.textContent = organizeSpeechText([...fin, it].join(' ')); };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') out.textContent = 'Microfone bloqueado: libere no cadeado do endereço do Code Room.'; };
    r.onend = () => { if (gv === g0 && !g0.stopping) { try { r.start(); } catch {} } else g0.ended?.(); };
    g0.rec = r; try { r.start(); } catch { out.textContent = 'Não consegui abrir o microfone agora.'; }
  }
  function globalTeardown(g) {
    try { g.stopViz?.(); } catch {} try { g.stream?.getTracks().forEach(t => t.stop()); } catch {} try { g.ctx?.close(); } catch {}
  }
  function globalCancel() { if (!gv) return; const g = gv; gv = null; g.stopping = true; try { g.rec?.abort(); } catch {} globalTeardown(g); g.el?.remove(); }
  async function globalStop(id) {
    const g = gv; if (!g || (id && g.id !== id)) return;
    g.stopping = true;
    // Espera o reconhecimento entregar o último trecho (até 1,5 s).
    await new Promise(res => { g.ended = res; try { g.rec?.stop(); } catch { res(); } setTimeout(res, 1500); });
    const text = organizeSpeechText([...g.finals, g.interim].filter(Boolean).join(' '));
    gv = null; globalTeardown(g);
    const title = g.el.querySelector('.nv-title'); if (title) title.textContent = text ? '✔ Colando onde está o cursor…' : 'Não ouvi nada.';
    setTimeout(() => g.el.remove(), 1400);
    try { await sendGlobalText?.(g.id, text); } catch (e) { notify(e.message, true); }
  }
  const globalVoice = { start: globalStart, stop: globalStop, cancel: globalCancel, active: () => !!gv };

  // ---------- Mini-janela flutuante sempre no topo (funciona com o Code Room minimizado) ----------
  function paintPip() {
    if (!pipWin || pipWin.closed) { pipWin = null; return; }
    const doc = pipWin.document, box = doc.getElementById('pip-status');
    if (!box) return;
    const ctx = getCtx?.() || {}, runs = ctx.state?.runs || [], asst = ctx.asst || {};
    const running = runs.filter(r => ['running', 'cancelling'].includes(r.status));
    const queued = runs.filter(r => ['queued', 'waiting_dependency'].includes(r.status));
    const proj = (ctx.state?.projects || []).find(p => p.id === ctx.project)?.name || 'Todos os projetos';
    const mood = running.length || asst.pending ? 'pensando' : (asst.alerts || []).some(a => a.level !== 'info') ? 'alerta' : 'feliz';
    const lastReply = [...(asst.messages || [])].reverse().find(m => m.role === 'assistant' && (m.text || m.error));
    const lastQa = runs.find(r => r.status === 'completed' && r.qaScore != null);
    const alert = (asst.alerts || [])[0];
    const html = `
      <div class="pip-head">
        <span class="pip-face ${running.length || asst.pending ? 'pulse' : ''}">${mascot(mood, 40)}</span>
        <div class="pip-who">
          <b>${esc(asst.name || getName() || 'Nico')} <span class="pip-badge">${asst.autonomy === 'pilot' ? 'Piloto' : 'Consulta'}</span></b>
          <small>${esc(proj)} · ${running.length} rodando${queued.length ? ` · ${queued.length} na fila` : ''}</small>
        </div>
        <button type="button" class="pip-open" data-pip="focus" title="Trazer o Code Room para a frente">Abrir painel</button>
      </div>
      ${running.length ? `<div class="pip-live">${running.slice(0, 2).map(r => `<div><span class="pip-dot"></span><b>${esc(r.agent?.name || 'Agente')}</b>: ${esc(String(r.prompt || '').slice(0, 65))}</div>`).join('')}</div>` : lastQa ? `<div class="pip-live"><span>${lastQa.qaStatus === 'ok' ? '✔' : '⚠'} Última entrega: <b>Qualidade ${lastQa.qaScore}%</b> (${esc(lastQa.agent?.name || 'Agente')})</span></div>` : ''}
      ${asst.pending ? `<div class="pip-msg wait">⏳ Pensando… ${asst.pending.activity ? `<small>⚙ ${esc(asst.pending.activity)}</small>` : ''}</div>` : lastReply ? `<div class="pip-msg">${esc(String(lastReply.error || lastReply.text || '').slice(0, 220))}</div>` : '<div class="pip-msg muted">Pronto por aqui. Mande uma tarefa ou use o ditado para colar em qualquer janela.</div>'}
      ${alert ? `<div class="pip-alert">⚠ <b>${esc(alert.title)}:</b> ${esc(String(alert.text || '').slice(0, 110))}</div>` : ''}
      ${pipNote ? `<div class="pip-note">${esc(pipNote)}</div>` : ''}
    `;
    if (box._sig !== html) { box._sig = html; box.innerHTML = html; }
    const micBtn = doc.getElementById('pip-mic');
    if (micBtn) { micBtn.textContent = pipListening ? '⏹ Inserir/Copiar voz' : '🎤 Voz (Ctrl+V)'; micBtn.classList.toggle('on', pipListening); }
  }

  async function openPip() {
    if (!isAuthed()) return;
    if (pipWin && !pipWin.closed) { pipWin.focus(); paintPip(); return; }
    let w = null;
    try {
      if (window.documentPictureInPicture?.requestWindow) w = await window.documentPictureInPicture.requestWindow({ width: 360, height: 370 });
    } catch {}
    if (!w) w = window.open('', 'code-room-nico-float', 'popup=yes,width=360,height=390');
    if (!w) { notify('O navegador bloqueou a mini-janela flutuante. Permita pop-ups para 127.0.0.1.', true); return; }
    pipWin = w; pipNote = '';
    const doc = w.document;
    doc.title = `${getName() || 'Nico'} · Code Room`;
    doc.head.innerHTML = `<meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;padding:12px;font:13px/1.42 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b1426;color:#e8eefc;display:flex;flex-direction:column;gap:8px;height:100vh;overflow:hidden}
      #pip-status{display:flex;flex-direction:column;gap:7px;flex:1;overflow:auto;padding-right:2px}
      .pip-head{display:flex;align-items:center;gap:9px}.pip-face{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,rgba(89,224,255,.24),transparent 70%);flex:none}
      .pip-face.pulse{box-shadow:0 0 0 2px rgba(89,224,255,.5)}.pip-face svg{max-width:100%;max-height:100%}
      .pip-who{flex:1;min-width:0;display:grid}.pip-who b{font-size:14px;display:flex;align-items:center;gap:6px}.pip-who small{color:#8fa3c7;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pip-badge{font-size:10px;padding:1px 6px;border-radius:99px;background:rgba(43,123,255,.22);border:1px solid rgba(90,155,255,.45);color:#9ec5ff}
      .pip-open{background:#132342;color:#cfe0ff;border:1px solid #243b67;border-radius:8px;padding:5px 8px;font-size:11.5px;cursor:pointer;white-space:nowrap}.pip-open:hover{border-color:#59e0ff}
      .pip-live{padding:6px 8px;border-radius:9px;background:#101e38;border:1px solid #1e355e;font-size:11.5px;display:grid;gap:3px}
      .pip-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#3ddc84;margin-right:5px}
      .pip-msg{padding:8px 10px;border-radius:11px;background:#12213d;border:1px solid #1d3055;font-size:12.5px;white-space:pre-wrap;overflow-wrap:anywhere}
      .pip-msg.muted{color:#8fa3c7}.pip-msg.wait{border-color:#f5b73b;color:#ffe2a4}.pip-msg small{display:block;color:#8fa3c7;margin-top:3px}
      .pip-alert{padding:6px 8px;border-radius:9px;background:rgba(245,183,59,.12);border:1px solid rgba(245,183,59,.42);color:#ffd98a;font-size:11.5px}
      .pip-note{font-size:11.5px;color:#5fe3b0}
      form{display:grid;gap:6px;border-top:1px solid #1d3055;padding-top:8px}
      textarea{width:100%;resize:none;border-radius:10px;border:1px solid #243b67;background:#101d36;color:#e8eefc;padding:7px 9px;font:inherit}textarea:focus{outline:1px solid #59e0ff}
      .pip-btns{display:flex;gap:6px;justify-content:space-between}.btn{border:1px solid #2b7bff;background:#2b7bff;color:#fff;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer}
      .btn.ghost{background:#132342;border-color:#243b67;color:#cfe0ff}.btn.on{background:#d94848;border-color:#ff6b6b}
    </style>`;
    doc.body.innerHTML = `<div id="pip-status" aria-live="polite"></div>
      <form id="pip-form">
        <textarea id="pip-input" rows="2" maxlength="2000" placeholder="Fale com o Nico ou mande executar… (Enter envia)"></textarea>
        <div class="pip-btns">
          <button type="button" class="btn ghost" id="pip-mic">🎤 Voz (Ctrl+V)</button>
          <button type="submit" class="btn">Enviar ao Nico ↵</button>
        </div>
      </form>`;
    paintPip();
    doc.addEventListener('click', e => {
      if (e.target.closest('[data-pip="focus"]')) { window.focus(); }
      if (e.target.id === 'pip-mic') togglePipVoice();
    });
    doc.getElementById('pip-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doc.getElementById('pip-form')?.requestSubmit(); }
    });
    doc.getElementById('pip-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const inp = doc.getElementById('pip-input'), txt = (inp?.value || '').trim();
      if (!txt || !askFn) return;
      inp.disabled = true;
      try {
        const ok = await askFn(txt);
        if (ok) { inp.value = ''; pipNote = 'Pedido enviado ao Nico.'; }
      } finally { inp.disabled = false; inp.focus(); paintPip(); }
    });
    w.addEventListener('pagehide', () => { try { pipRec?.stop(); } catch {} pipListening = false; pipWin = null; });
  }

  function togglePipVoice() {
    if (!pipWin || pipWin.closed) return;
    const inp = pipWin.document.getElementById('pip-input');
    if (pipListening) {
      try { pipRec?.stop(); } catch {}
      pipListening = false;
      const clean = organizeSpeechText(inp?.value || '');
      if (clean && inp) {
        inp.value = clean;
        pipWin.navigator?.clipboard?.writeText(clean).catch(() => {});
        pipNote = 'Texto organizado e copiado (Ctrl+V em qualquer programa, ou Enter para enviar ao Nico).';
      }
      paintPip();
      return;
    }
    const SR = pipWin.SpeechRecognition || pipWin.webkitSpeechRecognition || window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { pipNote = 'Ditado não suportado neste navegador; digite no campo abaixo.'; paintPip(); return; }
    const r = new SR();
    r.lang = 'pt-BR'; r.interimResults = true; r.continuous = true;
    const base = inp?.value?.trim() ? inp.value.trim() + ' ' : '';
    r.onresult = ev => {
      let acc = '';
      for (let i = 0; i < ev.results.length; i++) acc += (acc ? ' ' : '') + ev.results[i][0].transcript.trim();
      if (inp) inp.value = base + acc;
    };
    r.onerror = () => { pipListening = false; pipRec = null; paintPip(); };
    pipRec = r; pipListening = true; pipNote = 'Ouvindo… clique de novo para organizar e copiar.';
    try { r.start(); } catch { pipListening = false; pipRec = null; pipNote = 'Não consegui abrir o microfone.'; }
    paintPip();
  }

  function paint(force = false) {
    paintPip();
    root ||= document.getElementById('nico-flow-root');
    if (!root) return;
    if (!isAuthed()) { root.innerHTML = ''; return; }
    const name = esc(getName() || 'Nico'), dest = esc(labelForTarget(targetEl));
    if (state === 'idle') {
      const existingPill = root.querySelector('#nico-voice-pill');
      if (existingPill && !force) return;
      root.innerHTML = `<button type="button" id="nico-voice-pill" class="nf-pill" data-nf="toggle" aria-label="${name} por voz (Ctrl+Espaço)" title="Falar e digitar organizado onde o cursor estiver (Ctrl+Espaço)">
        <span class="nf-pill-face">${mascot('feliz', 26)}</span>
        <span class="nf-pill-mic" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8"/></svg></span>
        <span class="nf-pill-lbl">Voz</span>
      </button><button type="button" class="nf-pip-btn" data-nf="pip-open" title="Deixar o ${name} sempre visível numa mini-janela por cima dos programas. Com ela aberta, Ctrl+Shift+Espaço ouve e cola em qualquer programa." aria-label="Abrir a mini-janela do ${name}">⧉</button>`;
      return;
    }
    if (state === 'done' && undoSnap) {
      root.innerHTML = `<div id="nico-flow" class="nf-card nf-done" role="status">
        <span class="nf-avatar">${mascot('feliz', 32)}</span>
        <span class="small">✔ <b>${name}</b> digitou em <b>${esc(undoSnap.label)}</b></span>
        <button type="button" class="btn ghost sm" data-nf="undo">Desfazer</button>
        <button type="button" class="iconbtn sm" data-nf="close-done" aria-label="Fechar">×</button>
      </div>`;
      return;
    }
    const raw = combinedRaw(), preview = organizeSpeechText(raw, { format });
    const existingCard = !force && state === 'listening' ? root.querySelector('#nico-flow.listening') : null;
    if (existingCard) {
      const destEl = existingCard.querySelector('.nf-dest'); if (destEl) destEl.textContent = labelForTarget(targetEl);
      const errEl = existingCard.querySelector('.nf-err');
      if (errEl) { errEl.hidden = !errMsg; errEl.textContent = errMsg; }
      const pvEl = existingCard.querySelector('.nf-preview');
      if (pvEl) pvEl.textContent = preview || 'Ouvindo você… fale naturalmente.';
      const fmtBtn = existingCard.querySelector('[data-nf="format"]');
      if (fmtBtn) { fmtBtn.classList.toggle('on', format === 'list'); fmtBtn.setAttribute('aria-pressed', String(format === 'list')); fmtBtn.textContent = format === 'list' ? '✓ Em lista' : 'Texto / Lista'; }
      const aiBtn = existingCard.querySelector('[data-nf="ai"]');
      if (aiBtn) { aiBtn.classList.toggle('on', useAi); aiBtn.setAttribute('aria-pressed', String(useAi)); aiBtn.textContent = useAi ? '✓ Polir com IA' : 'Polir com IA'; }
      return;
    }
    root.innerHTML = `<section id="nico-flow" class="nf-card ${state === 'polishing' ? 'polishing' : 'listening'}" role="dialog" aria-label="${name} ditado inteligente">
      <div class="nf-top">
        <span class="nf-avatar ${state === 'listening' ? 'pulse' : ''}">${mascot(state === 'polishing' ? 'pensando' : 'surpreso', 38)}</span>
        <div class="nf-meta">
          <b>${name} · ${state === 'polishing' ? 'Organizando com IA…' : 'Ouvindo você…'}</b>
          <small>Destino: <span class="nf-dest">${dest}</span> (clique em qualquer campo para mudar)</small>
        </div>
        <div class="nf-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <button type="button" class="btn ghost sm" data-nf="pip" title="Destacar mini-janela flutuante (continua visível com o Code Room minimizado)">⧉ Flutuante</button>
        <button type="button" class="iconbtn sm" data-nf="cancel" aria-label="Cancelar ditado (Esc)" title="Cancelar (Esc)">×</button>
      </div>
      <p class="small upd-err nf-err" style="margin:4px 0" ${errMsg ? '' : 'hidden'}>${esc(errMsg)}</p>
      <textarea id="nico-flow-draft" class="nf-draft" rows="2" placeholder="Fale naturalmente (ex.: “nova linha”, “em lista: item 1…”), ou ajuste aqui…">${esc(raw)}</textarea>
      <div class="nf-preview-wrap"><small class="muted">Prévia organizada:</small><div class="nf-preview">${esc(preview || 'Ouvindo você… fale naturalmente.')}</div></div>
      <div class="nf-foot">
        <div class="nf-toggles">
          <button type="button" class="chip ${format === 'list' ? 'on' : ''}" data-nf="format" aria-pressed="${format === 'list'}" title="Formatar automaticamente em lista de tópicos">${format === 'list' ? '✓ Em lista' : 'Texto / Lista'}</button>
          <button type="button" class="chip ${useAi ? 'on' : ''}" data-nf="ai" aria-pressed="${useAi}" title="Usar sua IA conectada para reescrever sem vícios de fala">${useAi ? '✓ Polir com IA' : 'Polir com IA'}</button>
        </div>
        <div class="nf-actions">
          <small class="muted">Ctrl+Espaço ou Enter insere</small>
          <button type="button" class="btn sm" data-nf="apply" ${state === 'polishing' ? 'disabled' : ''}>Inserir texto ↵</button>
        </div>
      </div>
    </section>`;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-nf]'); if (!b) return;
    const act = b.dataset.nf;
    if (act === 'toggle') toggle();
    else if (act === 'apply') void applyText();
    else if (act === 'cancel') cancel();
    else if (act === 'undo') undoLast();
    else if (act === 'close-done') { state = 'idle'; paint(true); }
    else if (act === 'format') { format = format === 'list' ? 'text' : 'list'; paint(); }
    else if (act === 'ai') { useAi = !useAi; paint(); }
    else if (act === 'pip') { cancel(); void openPip(); }
    else if (act === 'pip-open') void openPip();
  });

  document.addEventListener('input', e => {
    if (e.target?.id !== 'nico-flow-draft') return;
    const pv = root?.querySelector('.nf-preview');
    if (pv) pv.textContent = organizeSpeechText(e.target.value, { format }) || 'Digite ou fale para organizar…';
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.altKey) && !e.shiftKey && e.code === 'Space') {
      e.preventDefault(); e.stopPropagation();
      toggle();
      return;
    }
    if (state === 'listening') {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      else if (e.key === 'Enter' && !e.shiftKey && e.target?.id === 'nico-flow-draft') { e.preventDefault(); void applyText(); }
    }
  }, true);

  return { render: paint, toggle, cancel, openPip, hasPip: () => Boolean(pipWin && !pipWin.closed), globalVoice };
}
