"""Roteiro do Workspace (layout por projeto) e da prévia isolada, na largura de um notebook (1357 px, zoom 100%).
Confere: com Navegador e Nico abertos, nada se cobre e os controles ficam acessíveis; a Sala não espreme o Canvas;
divisória arrastável com a largura salva por projeto (volta igual depois de recarregar); presets Vídeo e Código;
Modo Foco recolhe Atividade/Missão/Supervisor; o terminal não passa por baixo do Nico; e a prévia de um servidor
local roda numa origem própria, em sandbox, sem acesso à sessão do painel nem à API.
Uso: python scripts/ui_workspace.py"""
import json, os, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
from _servico import Servico, porta_livre

fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' and not ok else ''))

# "Servidor de desenvolvimento" do projeto: uma página que tenta alcançar o painel.
site = tempfile.mkdtemp(prefix='cr-ws-site-')
open(os.path.join(site, 'index.html'), 'w', encoding='utf-8').write('<!doctype html><title>Meu site</title><h1>Prévia do meu site</h1><button id="b">Botão do site</button>')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
dev = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=site)); dev_port = dev.server_address[1]
threading.Thread(target=dev.serve_forever, daemon=True).start()

def rect(pg, sel): return pg.evaluate(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return {{ x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }} }})()")
def overlap(a, b): return a and b and not (a['r'] <= b['x'] + 1 or b['r'] <= a['x'] + 1 or a['b'] <= b['y'] + 1 or b['b'] <= a['y'] + 1)
def inview(pg, sel, W, H):
    r = rect(pg, sel); return bool(r) and r['x'] >= 0 and r['r'] <= W + 1 and r['y'] >= 0 and r['b'] <= H + 1 and r['w'] > 0

W, H = 1357, 760
with Servico(falsos=['codex.exe'], env_extra={'CODE_ROOM_PREVIEW_PORT': str(porta_livre())}) as servico:
    api = servico.api
    pa = api('projects', {'name': 'Site A', 'path': servico.proj.replace(chr(92), '/'), 'area': 'Programação'})
    pb_dir = tempfile.mkdtemp(prefix='cr-ws-b-'); pb = api('projects', {'name': 'Vídeo B', 'path': pb_dir.replace(chr(92), '/'), 'area': 'Programação'})
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': W, 'height': H})
        ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true,helloSeen:true})); localStorage.setItem('cr.project', %s); } catch (e) {}" % json.dumps(pa['id']))
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 4' not in m.text and 'CORS policy' not in m.text and 'ERR_FAILED' not in m.text else None)   # o bloqueio da prévia tentando a API é o esperado
        pg.goto(f'{servico.base}/#{servico.key}'); pg.wait_for_selector('.top-right', timeout=15000); pg.wait_for_timeout(1500)
        pg.evaluate("crGo('room')"); pg.wait_for_timeout(600)

        # 1) Navegador + Nico abertos, padrão: o Nico encaixa ao lado (não cobre a prévia)
        pg.click('[data-act=browser-toggle]'); pg.wait_for_selector('#browser-dock:not([hidden])'); pg.click('[data-act=asst-toggle]'); pg.wait_for_selector('#chat:not([hidden])'); pg.wait_for_timeout(700)
        rc, rb, rm = rect(pg, '#chat'), rect(pg, '#browser-dock'), rect(pg, '.main')
        check('Navegador e Nico abertos: o Nico encaixa ao lado e não cobre o Navegador', rc and rb and not overlap(rc, rb) and rc['r'] >= W - 2, (rc, rb))
        check('o Navegador tem largura útil e seus controles ficam visíveis', rb and rb['w'] >= 360 and inview(pg, '#browser-dock .bd-url', W, H) and inview(pg, '#browser-dock [data-bd=reload]', W, H), rb)
        check('o campo do Nico e o Enviar ficam visíveis', inview(pg, '#mission', W, H) and inview(pg, '#send', W, H))
        check('a página não fica por baixo do Navegador nem do Nico', rm and rm['r'] <= rb['x'] + 2, (rm, rb))
        cols = pg.evaluate("(() => { const c = document.querySelector('.cols.c-2-1'); return c ? getComputedStyle(c).gridTemplateColumns.split(' ').length : 0 })()")
        check('Sala estreita: a coluna lateral vai para baixo em vez de espremer o Canvas', cols == 1, cols)
        check('sem rolagem lateral', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))

        # 2) Prévia de um servidor local: origem própria, sandbox, sem sessão nem API do painel
        pg.fill('#browser-dock .bd-url', f'http://localhost:{dev_port}/'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
        ifr = pg.locator('#browser-dock iframe.bd-iframe').first
        src, sb = ifr.get_attribute('src') or '', ifr.get_attribute('sandbox') or ''
        check('a prévia abre pela origem dedicada (outra porta), não pela do painel', src.startswith(f'http://127.0.0.1:') and f':{servico.port}/' not in src and '/lp/' in src, src[:80])
        check('o iframe da prévia tem sandbox', 'allow-scripts' in sb and 'allow-top-navigation' not in sb, sb)
        fr = next((f for f in pg.frames if '/lp/' in (f.url or '')), None)
        if fr:
            fr.wait_for_selector('h1', timeout=8000)
            probe = fr.evaluate("""async () => {
              const out = { title: document.title, keys: Object.keys(sessionStorage), parent: 'bloqueado', api: 'bloqueado' };
              try { out.parent = window.parent.document.title; } catch (e) {}
              try { const r = await fetch(%s + '/api/state'); out.api = r.status; } catch (e) {}
              return out; }""" % json.dumps(servico.base))
            check('a prévia mostra o site do projeto', probe['title'] == 'Meu site', probe)
            check('de dentro da prévia: não lê a sessão do painel nem o painel', probe['keys'] == [] and probe['parent'] == 'bloqueado', probe)
            check('de dentro da prévia: a API do painel recusa', probe['api'] in ('bloqueado', 401, 403), probe)
        else: check('a prévia carregou no iframe', False, [f.url for f in pg.frames])

        # 3) Divisória: arrastar o Navegador, recarregar e voltar igual (salvo por projeto)
        g = rect(pg, '#browser-dock > .ws-grip'); w0 = rect(pg, '#browser-dock')['w']
        pg.mouse.move(g['x'] + 4, g['y'] + g['h'] / 2); pg.mouse.down(); pg.mouse.move(g['x'] + 60, g['y'] + g['h'] / 2, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
        w1 = rect(pg, '#browser-dock')['w']
        check('arrastar a divisória muda a largura do Navegador', w1 < w0 - 30, (w0, w1))
        pg.reload(); pg.wait_for_selector('.top-right', timeout=15000); pg.wait_for_timeout(1200)
        if pg.locator('#browser-dock:not([hidden])').count() == 0: pg.click('[data-act=browser-toggle]')
        if pg.locator('#chat:not([hidden])').count() == 0: pg.click('[data-act=asst-toggle]')
        pg.wait_for_timeout(800); w2 = rect(pg, '#browser-dock')['w']
        check('depois de recarregar, o layout volta como deixei', abs(w2 - w1) < 4, (w1, w2))
        g = rect(pg, '#browser-dock > .ws-grip'); pg.focus('#browser-dock > .ws-grip'); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
        check('a divisória também funciona pelo teclado (setas)', rect(pg, '#browser-dock')['w'] < w2 - 10, rect(pg, '#browser-dock'))

        # 4) Modo Foco e presets
        pg.click('[data-act=ws-menu]'); pg.click('[data-act=ws-focus]'); pg.wait_for_timeout(400)
        check('Modo Foco recolhe Atividade, Missão e Supervisor', pg.locator('.activity-card:visible').count() == 0)
        pg.click('[data-act=ws-menu]'); pg.click('[data-act=ws-preset][data-id=video]'); pg.wait_for_timeout(800)
        rb, rc = rect(pg, '#browser-dock'), rect(pg, '#chat')
        check('Espaço Vídeo: a prévia ocupa o centro e o Nico fica ao lado', rb and rc and rb['w'] > W * 0.5 and not overlap(rb, rc) and 'Vídeo' in pg.inner_text('[data-act=ws-menu]'), (rb, rc))
        n_ifr = pg.locator('#browser-dock iframe').count()
        pg.click('#ws-tabs [data-peek=page]'); pg.wait_for_timeout(300)
        check('com a prévia no centro, a aba Página mostra a página sem fechar a prévia', pg.is_visible('#view') and pg.evaluate("getComputedStyle(document.getElementById('browser-dock')).visibility") == 'hidden' and pg.locator('#browser-dock iframe').count() == n_ifr, (pg.is_visible('#view'), pg.evaluate("[getComputedStyle(document.getElementById('browser-dock')).visibility, document.getElementById('shell').className, !!document.getElementById('ws-tabs')]"), pg.locator('#browser-dock iframe').count()))
        pg.click('#ws-tabs [data-peek=browser]'); pg.wait_for_timeout(300)
        check('a aba Prévia traz a prévia de volta', pg.evaluate("getComputedStyle(document.getElementById('browser-dock')).visibility") == 'visible')
        pg.click('[data-act=ws-menu]'); pg.click('[data-act=ws-preset][data-id=codigo]'); pg.wait_for_selector('#term-dock:not([hidden])', timeout=30000); pg.wait_for_timeout(800)
        rt, rc = rect(pg, '#term-dock'), rect(pg, '#chat')
        check('Espaço Código: terminal aberto e sem passar por baixo do Nico', rt and rc and rt['r'] <= rc['x'] + 2, (rt, rc))

        # 5) Por projeto: o outro projeto tem o próprio layout
        atual = pg.input_value('#project-select'); outro = pa['id'] if atual == pb['id'] else pb['id']
        pg.select_option('#project-select', outro); pg.wait_for_timeout(700)
        check('outro projeto abre com o layout dele (Padrão)', 'Padrão' in pg.inner_text('[data-act=ws-menu]'), pg.inner_text('[data-act=ws-menu]'))
        pg.select_option('#project-select', atual); pg.wait_for_timeout(700)
        check('voltar ao projeto traz o layout salvo dele', 'Código' in pg.inner_text('[data-act=ws-menu]'))
        # 6) Ctrl+K: “Espaço Vídeo”
        pg.wait_for_timeout(600); pg.evaluate("document.activeElement?.blur()"); pg.keyboard.press('Control+k')   # dentro do terminal o Ctrl+K é do shell
        pg.wait_for_selector('.pal-q', state='visible', timeout=5000); pg.fill('.pal-q', 'espaço vídeo'); pg.wait_for_timeout(200); pg.keyboard.press('Enter')
        try: pg.wait_for_function("document.querySelector('[data-act=ws-menu]')?.innerText.includes('Vídeo')", timeout=6000)
        except Exception: pass
        check('Ctrl+K aplica o Espaço Vídeo', 'Vídeo' in pg.inner_text('[data-act=ws-menu]'), (pg.inner_text('[data-act=ws-menu]'), pg.evaluate("[window.crWorkspace?.state?.preset, document.querySelector('.pal-box') ? 'paleta aberta' : 'paleta fechada', document.activeElement?.className]")))
        pg.click('[data-act=ws-menu]'); pg.click('[data-act=ws-reset]'); pg.wait_for_timeout(400)
        check('Restaurar o padrão volta ao layout padrão', 'Padrão' in pg.inner_text('[data-act=ws-menu]'))
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'ws-final.png'))
        check('sem erro de console', not errs, errs[:3])
        browser.close()
dev.shutdown()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
