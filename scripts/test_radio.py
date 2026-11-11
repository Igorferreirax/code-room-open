"""Teste técnico do motor da Rádio da Sala (public/radio.js), sem alto-falante: renderiza áudio no navegador (OfflineAudioContext) e mede
volume, estouro, graves/agudos, andamento e determinismo. Não julga se "soa bem": isso é gosto, quem decide é quem ouve.
Uso: python scripts/test_radio.py [saida.wav]   (grava uma amostra de 48 s em WAV; padrão: não grava)"""
import base64, hashlib, os, subprocess, sys, tempfile, time, urllib.request, wave
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4788
data = tempfile.mkdtemp(prefix='cr-radio-')
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' else ''))

JS = """async ({seed, seconds}) => {
  const { LofiRadio } = await import('/radio.js'); const t0 = performance.now(); const buf = await LofiRadio.render(seconds, { seed });
  const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)], i16 = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { i16[2 * i] = Math.max(-32768, Math.min(32767, Math.round(ch[0][i] * 32767))); i16[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(ch[1][i] * 32767))); }
  let peak = 0, over = 0; for (const c of ch) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; if (a >= 0.999) over++; }
  const u8 = new Uint8Array(i16.buffer); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return { b64: btoa(s), sr: buf.sampleRate, ms: performance.now() - t0, peak, over, nan: ch.some(c => c.some(x => !Number.isFinite(x))) }; }"""
try:
    for _ in range(50):
        try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True); pg = browser.new_context().new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{PORT}/'); time.sleep(0.8)
        def render(seed, seconds=48):
            r = pg.evaluate(JS, {'seed': seed, 'seconds': seconds}); raw = np.frombuffer(base64.b64decode(r['b64']), dtype='<i2').reshape(-1, 2); return raw, r
        a, ra = render(7); b, rb = render(7); c, rc = render(8)
        x = a.astype(np.float64) / 32768; L, R = x[:, 0], x[:, 1]; sr = ra['sr']; mono = (L + R) / 2
        check('renderizou 48 s sem erro (sem NaN/infinito)', not ra['nan'] and len(a) == int(sr * 48), f'{len(a) / sr:.1f} s')
        check('não estoura (nenhuma amostra em 0 dBFS)', ra['over'] == 0, f"{ra['over']} amostras")
        pk = 20 * np.log10(ra['peak'] + 1e-12); check('pico abaixo de -1,5 dBFS (sobra folga)', pk < -1.5, f'{pk:.1f} dBFS')
        rms = 20 * np.log10(np.sqrt(np.mean(mono ** 2)) + 1e-12); check('volume médio confortável (RMS entre -28 e -14 dBFS)', -28 < rms < -14, f'{rms:.1f} dBFS')
        check('sem deslocamento de DC', abs(mono.mean()) < 0.002, f'{mono.mean():.5f}')
        check('os dois canais têm som', np.std(L) > 1e-3 and np.std(R) > 1e-3 and np.corrcoef(L, R)[0, 1] < 0.9999, f'correlação {np.corrcoef(L, R)[0, 1]:.3f}')
        spec = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2; fr = np.fft.rfftfreq(len(mono), 1 / sr); tot = spec.sum()
        check('tem graves (energia abaixo de 150 Hz)', spec[fr < 150].sum() / tot > 0.08, f'{100 * spec[fr < 150].sum() / tot:.0f}%')
        check('agudos cortados como fita (acima de 9 kHz < 1,5% da energia)', spec[fr > 9000].sum() / tot < 0.015, f'{100 * spec[fr > 9000].sum() / tot:.2f}%')
        win = int(sr); wr = [20 * np.log10(np.sqrt(np.mean(mono[i:i + win] ** 2)) + 1e-12) for i in range(0, len(mono) - win, win)]
        check('sem silêncio nem buracos (cada segundo acima de -60 dBFS)', min(wr) > -60, f'mínimo {min(wr):.0f} dBFS')
        bar = int(sr * 60 / 74 * 4); br_ = [20 * np.log10(np.sqrt(np.mean(mono[i:i + bar] ** 2)) + 1e-12) for i in range(int(sr * 0.5), len(mono) - bar, bar)]   # RMS por compasso (a música tem batida: por segundo varia naturalmente)
        check('dinâmica estável (compasso mais alto e mais baixo dentro de 8 dB)', max(br_) - min(br_) < 8, f'{max(br_) - min(br_):.1f} dB')
        # andamento: autocorrelação do envelope de energia (esperado: batida a cada 60/74 s = 0,811 s, ou a metade)
        hop = int(sr * 0.01); env = np.array([np.sqrt(np.mean(mono[i:i + hop] ** 2)) for i in range(0, len(mono) - hop, hop)]); on = np.maximum(0, np.diff(env)); on -= on.mean()
        ac = np.correlate(on, on, 'full')[len(on) - 1:]; lags = np.arange(len(ac)) * 0.01
        cand = [(ac[k], lags[k]) for k in range(len(ac)) if 0.30 < lags[k] < 1.7]; best = max(cand)[1]
        check('andamento ~74 BPM (batida a cada ~0,81 s)', any(abs(best - m * 60 / 74) < 0.04 for m in (0.5, 1, 2)), f'pico em {best:.2f} s')
        d = np.abs(a.astype(np.int32) - b.astype(np.int32)); nd = int((d > 0).sum())
        print(f'   [diag] amostras diferentes entre as duas renderizações: {nd} de {d.size}; maior diferença: {int(d.max())} (de 32768); primeiro índice: {int(np.argmax(d > 0)) if nd else -1}')
        print('   [diag] RMS por segundo (dBFS):', ' '.join(f'{v:.0f}' for v in wr))
        check('determinístico: mesma semente toca (quase) exatamente o mesmo (diferença máxima abaixo de 0,3% do fundo de escala)', int(d.max()) < 100, f'maior diferença {int(d.max())}')
        check('sementes diferentes variam as notas soltas', hashlib.sha256(a.tobytes()).hexdigest() != hashlib.sha256(c.tobytes()).hexdigest())
        check('renderiza mais rápido que o tempo real (48 s em menos de 60 s, mesmo com o computador ocupado)', ra['ms'] < 60000, f"{ra['ms'] / 1000:.1f} s")
        for sd in (21, 42, 63, 88):   # as outras faixas da estação: mesmo padrão de volume, sem estourar
            z, rz = render(sd, 24); xz = z.astype(np.float64) / 32768; mz = (xz[:, 0] + xz[:, 1]) / 2; rmz = 20 * np.log10(np.sqrt(np.mean(mz ** 2)) + 1e-12)
            check(f'faixa com semente {sd}: sem estouro, sem NaN e volume parecido', not rz['nan'] and rz['over'] == 0 and abs(rmz - rms) < 3, f'RMS {rmz:.1f} dBFS (faixa 1: {rms:.1f})')
        check('sem erro de console', not errs, errs[:2])
        # ---- botão no app: liga de verdade, mostra o volume e desliga ----
        key = open(os.path.join(data, 'access.key')).read().strip(); ctx2 = browser.new_context(viewport={'width': 1440, 'height': 900}); errs2 = []
        ctx2.add_init_script("window.__ctxs = []; const AC = window.AudioContext; window.AudioContext = class extends AC { constructor(o) { super(o); window.__ctxs.push(this); } }; try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        p2 = ctx2.new_page(); p2.on('console', lambda m: errs2.append(m.text) if m.type == 'error' else None); p2.on('pageerror', lambda e: errs2.append(str(e)))
        p2.goto(f'http://127.0.0.1:{PORT}/#{key}'); p2.wait_for_selector('#rail button', timeout=15000); time.sleep(0.6)
        pr = lambda: p2.get_attribute('#radio-fab', 'aria-pressed')
        check('rádio desligada por padrão: só o radinho aparece, sem barra e sem áudio criado sozinho', p2.is_visible('#radio-fab') and pr() == 'false' and not p2.is_visible('#radio-vol') and p2.evaluate('window.__ctxs.length') == 0)
        check('não existe mais o painel com botão de play', p2.locator('#radio-btn').count() == 0 and p2.locator('#radio-min').count() == 0)
        p2.click('#radio-fab'); time.sleep(2.0)
        st = p2.evaluate('window.__ctxs.map(c => [c.state, c.currentTime])'); check('clicar no radinho liga o áudio: contexto rodando e o relógio avança', len(st) == 1 and st[0][0] == 'running' and st[0][1] > 1.0, st)
        check('tocando: radinho marcado como ligado, barra de volume aparece e não abre nenhum painel', pr() == 'true' and p2.evaluate("document.getElementById('radio-ctl').classList.contains('on')") and p2.is_visible('#radio-vol') and p2.get_attribute('#radio-fab', 'aria-label') == 'Parar a rádio lo-fi')
        p2.fill('#radio-vol', '30'); time.sleep(0.4); check('mexer no volume funciona e é lembrado', p2.evaluate("JSON.parse(localStorage.getItem('cr.radio')).volume") == 0.3)
        t1 = p2.evaluate("document.getElementById('radio-track').textContent"); check('o nome da faixa fica no título do radinho e a próxima faixa está na barra', t1.startswith('faixa 1/5:') and t1 in p2.get_attribute('#radio-fab', 'title') and p2.is_visible('#radio-next'), t1)
        p2.click('#radio-next'); pending = p2.evaluate("document.getElementById('radio-track').textContent"); check('próxima faixa dá retorno imediato e informa a troca solicitada', pending.startswith('próxima faixa: Madrugada no café'), pending)
        time.sleep(5.0); t2 = p2.evaluate("document.getElementById('radio-track').textContent"); check('próxima faixa muda o andamento e a harmonia da estação', t2.startswith('faixa 2/5:') and t2 != t1, t2)
        check('a faixa e o volume ficam lembrados para a próxima vez', p2.evaluate("JSON.parse(localStorage.getItem('cr.radio')).track") == 1 and p2.evaluate("JSON.parse(localStorage.getItem('cr.radio')).volume") == 0.3)
        p2.click('#radio-fab'); time.sleep(1.2); st2 = p2.evaluate('window.__ctxs.map(c => c.state)')
        check('clicar no radinho de novo para o som (áudio fechado, barra some)', st2 == ['closed'] and pr() == 'false' and not p2.is_visible('#radio-vol'), st2)
        p2.click('#radio-fab'); time.sleep(1.0); check('dá para ligar de novo (novo contexto de áudio)', p2.evaluate('window.__ctxs.length') == 2 and p2.evaluate('window.__ctxs[1].state') == 'running'); p2.click('#radio-fab'); time.sleep(0.8)
        check('sem erro de console no app', not errs2, errs2[:2]); ctx2.close()
        if len(sys.argv) > 1:
            with wave.open(sys.argv[1], 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(a.tobytes())
            print('amostra gravada em', sys.argv[1], f'({os.path.getsize(sys.argv[1]) / 1048576:.1f} MB)')
        browser.close()
finally:
    srv.kill()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
