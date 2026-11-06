"""Roteiro no navegador do aviso de atualização, contra um servidor de Releases DE MENTIRA (nada vai para o GitHub).
Cobre: verificar, faixa de aviso, janela com novidades (HTML malicioso escapado), download com SHA-256, arquivo adulterado recusado,
"Depois" que persiste, interruptor, falha de rede e celular. Esta cópia roda pelo código-fonte, então a instalação em um clique
não aparece (ela é testada à parte, no pacote Windows: installer/test-update.ps1). Uso: python scripts/ui_updates.py"""
import hashlib, json, os, subprocess, sys, tempfile, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT, RPORT = 4792, 4794
ZIPNAME = 'Code-Room-0.9.9-portatil-win-x64.zip'; ZIPDATA = os.urandom(300_000); SHA = hashlib.sha256(ZIPDATA).hexdigest()
state = {'mode': 'ok'}   # ok | bad (zip adulterado) | down (servidor fora do ar)
NOTES = 'Novidade <b>um</b>\n<script>window.__pwned=1</script>\n<img src=x onerror="window.__pwned=2">'

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype='application/octet-stream'):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if state['mode'] == 'down': return self.send(503, b'fora do ar')
        base = f'http://127.0.0.1:{RPORT}'
        if self.path == '/api/latest':
            rel = {'tag_name': 'v0.9.9', 'name': 'Code Room 0.9.9', 'body': NOTES, 'html_url': base + '/release', 'published_at': '2026-11-07T10:00:00Z', 'draft': False, 'prerelease': False,
                   'assets': [{'name': ZIPNAME, 'browser_download_url': f'{base}/dl/{ZIPNAME}', 'size': len(ZIPDATA)}, {'name': 'SHA256SUMS.txt', 'browser_download_url': f'{base}/dl/SHA256SUMS.txt', 'size': 100}]}
            return self.send(200, json.dumps(rel).encode(), 'application/json')
        if self.path == '/dl/SHA256SUMS.txt': return self.send(200, f'{SHA}  {ZIPNAME}\n'.encode(), 'text/plain')
        if self.path == f'/dl/{ZIPNAME}': return self.send(200, (ZIPDATA[:-1] + b'X') if state['mode'] == 'bad' else ZIPDATA)
        self.send(404, b'nao')
fake = ThreadingHTTPServer(('127.0.0.1', RPORT), H); threading.Thread(target=fake.serve_forever, daemon=True).start()

data = tempfile.mkdtemp(prefix='cr-upd-ui-')
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT), CODE_ROOM_RELEASES_URL=f'http://127.0.0.1:{RPORT}/api/latest'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (' ' + str(extra) if extra and not ok else ''))

try:
    for _ in range(50):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        r = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(r))
    proj = tempfile.mkdtemp(prefix='cr-upd-proj-'); api('projects', {'name': 'p', 'path': proj.replace('\\', '/'), 'area': 'Geral'})   # evita a triagem de primeiro uso
    api('agents', {'name': 'Ana', 'role': 'x', 'room': 'Programação', 'provider': 'codex', 'model': '', 'instructions': '', 'mode': 'read', 'skillIds': [], 'capabilities': []})
    URL = f'http://127.0.0.1:{PORT}/#{key}'; tab = lambda pg, n: (pg.click('[data-nav=settings]'), time.sleep(0.4), pg.click(f'[data-act=settings-tab][data-id={n}]'), time.sleep(0.5))

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); errs = []; dialogs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))
        pg.goto(URL); pg.wait_for_selector('#rail button', timeout=10000); time.sleep(1.0)
        check('sem versão nova conhecida: nenhuma faixa de aviso', pg.locator('.update-bar').count() == 0)
        tab(pg, 'atualizacoes')
        txt = pg.inner_text('#view'); check('Configurações › Atualizações mostra a versão e "nunca" verificado', '0.2.0' in txt and 'nunca' in txt, txt[:200])
        check('o aviso de privacidade está na tela', 'nenhum dado seu, projeto ou chave é enviado' in txt)
        pg.click('[data-act=upd-check]'); pg.wait_for_selector('.update-bar', timeout=10000); time.sleep(0.4)
        check('Verificar agora acha a 0.9.9 e mostra a faixa de aviso', '0.9.9' in pg.inner_text('.update-bar') and '0.2.0' in pg.inner_text('.update-bar'))

        pg.click('.update-bar [data-act=upd-open]'); pg.wait_for_selector('#update-dialog[open]', timeout=5000); time.sleep(0.4)
        dtxt = pg.inner_text('#update-dialog')
        check('janela mostra as novidades como TEXTO (HTML malicioso escapado)', '<script>window.__pwned=1</script>' in dtxt and '<img src=x' in dtxt, dtxt[:300])
        check('nada da nota foi executado (sem XSS)', pg.evaluate('window.__pwned') is None and not dialogs)
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'upd-dialog.png'))

        state['mode'] = 'bad'; pg.click('[data-act=upd-download]'); pg.wait_for_selector('#update-dialog .upd-err', timeout=15000); time.sleep(0.3)
        check('arquivo ADULTERADO é recusado com aviso claro', 'NÃO confere' in pg.inner_text('#update-dialog .upd-err'))
        check('e o arquivo ruim não fica no disco', not os.path.exists(os.path.join(data, 'updates', ZIPNAME)) and not os.path.exists(os.path.join(data, 'updates', ZIPNAME + '.part')))
        state['mode'] = 'ok'; pg.click('[data-act=upd-download]'); pg.wait_for_selector('#update-dialog .upd-ok', timeout=15000); time.sleep(0.3)
        check('arquivo íntegro: SHA-256 conferido', 'SHA-256 bate' in pg.inner_text('#update-dialog') and SHA[:16] in pg.inner_text('#update-dialog'))
        check('o arquivo foi gravado e é idêntico', os.path.exists(os.path.join(data, 'updates', ZIPNAME)) and hashlib.sha256(open(os.path.join(data, 'updates', ZIPNAME), 'rb').read()).hexdigest() == SHA)
        check('cópia do código-fonte: sem botão de instalar, com orientação de git pull', pg.locator('[data-act=upd-install]').count() == 0 and 'git pull' in pg.inner_text('#update-dialog'))
        try: api('updates/install', {}); inst = 'aceitou'
        except urllib.error.HTTPError as e: inst = json.load(e).get('error', '')
        check('API também recusa instalar fora do pacote Windows', 'código-fonte' in inst, inst)

        pg.click('[data-act=upd-close]'); time.sleep(0.3); check('Fechar fecha a janela', not pg.evaluate("document.getElementById('update-dialog').open"))
        pg.click('.update-bar [data-act=upd-later]'); time.sleep(0.5); check('"Depois" esconde a faixa', pg.locator('.update-bar').count() == 0)
        pg.reload(); time.sleep(1.5); check('e continua escondida depois de recarregar', pg.locator('.update-bar').count() == 0)
        tab(pg, 'atualizacoes'); check('Configurações ainda mostra que há a versão 0.9.9', 'Versão 0.9.9 disponível' in pg.inner_text('#view'))

        pg.click('[data-act=upd-toggle]'); time.sleep(0.5); t2 = pg.inner_text('#view'); check('Desligar a verificação: aparece "desligada" e "Verificar uma vez"', 'desligada' in t2 and 'Verificar uma vez' in t2)
        pg.click('[data-act=upd-toggle]'); time.sleep(0.5); check('Ligar de novo funciona', 'ligada' in pg.inner_text('#view') and 'Verificar agora' in pg.inner_text('#view'))

        state['mode'] = 'down'; pg.click('[data-act=upd-check]'); pg.wait_for_selector('.upd-err', timeout=10000)
        check('servidor de atualização fora do ar: erro claro, sem quebrar o app', 'Não foi possível consultar' in pg.inner_text('.upd-err') and pg.locator('#rail button').count() == 12)
        state['mode'] = 'ok'
        check('sem erro de console no fluxo (desktop)', not errs, errs[:2]); ctx.close()

        # celular
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); pg = ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        api('updates/dismiss', {'version': ''}); pg.goto(URL); pg.wait_for_selector('#rail button', timeout=10000); time.sleep(1.0)
        pg.click('[data-nav=settings]'); time.sleep(0.4); pg.click('[data-act=settings-tab][data-id=atualizacoes]'); time.sleep(0.4); pg.click('[data-act=upd-check]'); pg.wait_for_selector('.update-bar', timeout=10000); time.sleep(0.4)
        bar = pg.locator('.update-bar').bounding_box(); check('celular: faixa cabe na tela', bar['x'] >= 0 and bar['x'] + bar['width'] <= 391, bar)
        pg.click('.update-bar [data-act=upd-open]'); pg.wait_for_selector('#update-dialog[open]'); time.sleep(0.4); db = pg.locator('#update-dialog').bounding_box()
        check('celular: janela cabe na tela', db['x'] >= 0 and db['x'] + db['width'] <= 391, db); check('celular: sem rolagem lateral', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'upd-dialog-m.png')); check('sem erro de console (celular)', not errs, errs[:2]); ctx.close(); browser.close()
finally:
    srv.kill(); fake.shutdown()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
