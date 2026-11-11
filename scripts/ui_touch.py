"""Arraste por toque no Canvas (celular): repete a ligação entre dois agentes N vezes e conta quantas deram certo.
Mede a firmeza do toque (antes de mexer no código e depois). Servidor temporário isolado, sem chamar IA.
Uso: python scripts/ui_touch.py [repeticoes]  (padrão 10; sai com erro se alguma falhar)"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4795
data = tempfile.mkdtemp(prefix='cr-touch-data-'); proj = tempfile.mkdtemp(prefix='cr-touch-proj-')
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT), CODE_ROOM_ATALHOS_DIR=data), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ok = 0; falhas = []
try:
    for _ in range(60):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        r = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(r, timeout=30))
    pj = api('projects', {'name': 'toque', 'path': proj.replace(chr(92), '/'), 'area': 'Programação'})
    ids = [api('agents', {'name': n, 'role': 'teste', 'room': 'Programação', 'provider': 'codex', 'model': '', 'instructions': '', 'mode': 'read', 'skillIds': [], 'capabilities': ['research']})['id'] for n in ('Ana', 'Caio', 'Dora')]
    api('projects/members', {'projectId': pj['id'], 'add': ids})   # desde a 0.3.4 cada projeto mostra só os agentes ligados a ele
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); page = ctx.new_page()
        page.goto(f'http://127.0.0.1:{PORT}/?v=1#{key}'); page.wait_for_selector('#rail button', timeout=8000); time.sleep(0.8)
        page.evaluate("localStorage.setItem('cr.prefs', JSON.stringify({mode: 'canvas'}))")
        if os.environ.get('CR_TOUCH_DEBUG'):
            page.on('console', lambda m: print('  [console]', m.type, m.text[:160]) if m.type in ('error', 'warning') else None)
            page.on('pageerror', lambda e: print('  [pageerror]', str(e)[:200]))
            page.on('response', lambda r: print('  [api]', r.request.method, r.url.split('/api/')[-1][:40], r.status) if '/api/links' in r.url else None)
        cdp = ctx.new_cdp_session(page)
        touch = lambda kind, x, y: cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y}]})
        def swipe(x0, y0, x1, y1, steps=8):
            touch('touchStart', x0, y0)
            for i in range(1, steps + 1): touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); time.sleep(0.02)
            touch('touchEnd', x1, y1); time.sleep(0.5)
        page.click('[data-nav=room]'); time.sleep(0.5)
        if page.locator('.cv-node').count() == 0: page.click('[data-act=view-mode][data-id=canvas]'); time.sleep(0.8)
        if page.is_visible('#chat'): page.click('[data-act=chat-min]'); time.sleep(0.3)
        for i in range(N):
            for l in api('state')['links']: api(f"links/{l['id']}/delete", {})
            time.sleep(0.8)
            def preparar():
                page.click('[data-cv-zoom=fit]'); time.sleep(0.4)   # cada rodada começa com todos os cartões enquadrados (o Canvas tem câmera: zoom e arrastar o fundo)
                # escolhe dois cartões vizinhos (o Canvas rola para os lados) e centraliza os dois na tela
                pair = page.evaluate("""() => { const cv = document.querySelector('#cv'); const ns = [...document.querySelectorAll('.cv-node')].map(e => { const r = e.getBoundingClientRect(), p = e.querySelector('.cv-port.out').getBoundingClientRect(); return { name: e.textContent.trim().split(' ')[0], px: p.x + cv.scrollLeft, cx: r.x + r.width / 2 + cv.scrollLeft, y: r.y }; });
                  let best = null; for (const a of ns) for (const b of ns) if (a !== b && b.cx > a.px && (!best || b.cx - a.px < best[2])) best = [a, b, b.cx - a.px]; return best && { from: best[0].name, to: best[1].name, mid: (best[0].px + best[1].cx) / 2 }; }""")
                if not pair: return None
                page.locator('#cv').scroll_into_view_if_needed(); time.sleep(0.3)
                o = page.locator('.cv-node', has_text=pair['from']).locator('.cv-port.out').bounding_box(); d = page.locator('.cv-node', has_text=pair['to']).bounding_box()
                cabe = lambda o, d: o and d and 4 < o['x'] < 386 and 0 < d['x'] < 380 and 0 < o['y'] < 800
                if not cabe(o, d): return None
                return o, d
            prep = None
            for _t in range(3):   # a tela pode se atualizar no meio da medição: tenta de novo
                try: prep = preparar()
                except Exception: prep = None   # tempo esgotado esperando o cartão ficar parado (a tela estava se atualizando)
                if prep: break
                time.sleep(0.6)
            if not prep: falhas.append((i, 'não consegui posicionar origem e destino na tela')); continue
            o, d = prep
            swipe(o['x'] + o['width'] / 2, o['y'] + o['height'] / 2, min(d['x'] + d['width'] / 2, (d['x'] + 372) / 2), d['y'] + d['height'] / 2)   # solta na parte visível do cartão
            got = len(api('state')['links'])
            if got >= 1: ok += 1
            else: falhas.append((i, 'ligação não criada'))
        browser.close()
finally:
    srv.kill(); time.sleep(0.4); shutil.rmtree(data, ignore_errors=True); shutil.rmtree(proj, ignore_errors=True)
print(f'toque no Canvas: {ok} de {N} ligações criadas' + (f' | falhas: {falhas}' if falhas else ''))
raise SystemExit(0 if ok == N else 1)
