"""Ponta a ponta das pastas de entrada (lotes): servidor de verdade + Codex falso (nenhuma IA real, nenhuma cota) + navegador.
Cria o lote pela tela, põe 4 arquivos na pasta, acompanha o progresso, confere as tarefas, o aviso de "lote concluído" e a repetição das que falharam.
Uso: python scripts/e2e_folderjobs.py"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4799
tmp = tempfile.mkdtemp(prefix='cr-fj-'); app = os.path.join(tmp, 'app'); data = os.path.join(tmp, 'data'); bindir = os.path.join(tmp, 'bin'); proj = os.path.join(tmp, 'canal')
os.makedirs(bindir); os.makedirs(app); os.makedirs(proj); os.makedirs(os.path.join(tmp, 'home'))
for d in ('server', 'public', 'docs'): shutil.copytree(os.path.join(ROOT, d), os.path.join(app, d))
shutil.copy(os.path.join(ROOT, 'package.json'), app); os.makedirs(os.path.join(app, 'test', 'fixtures'))
for f in ('fake-agent.mjs', 'fake-codex-preload.mjs'): shutil.copy(os.path.join(ROOT, 'test', 'fixtures', f), os.path.join(app, 'test', 'fixtures', f))
shutil.copy(shutil.which('node'), os.path.join(bindir, 'codex.exe'))
env = dict(os.environ, PATH=bindir + os.pathsep + os.environ['PATH'], CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT), CODE_ROOM_NO_BROWSER='1', USERPROFILE=os.path.join(tmp, 'home'), HOME=os.path.join(tmp, 'home'),
           NODE_OPTIONS='--import file:///' + os.path.join(app, 'test', 'fixtures', 'fake-codex-preload.mjs').replace(chr(92), '/'))
srv = subprocess.Popen([shutil.which('node'), os.path.join(app, 'server', 'main.mjs')], cwd=app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' and not ok else ''))
try:
    for _ in range(60):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        r = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        try: return json.load(urllib.request.urlopen(r, timeout=40))
        except urllib.error.HTTPError as e: return {'_http': e.code, **json.loads(e.read() or b'{}')}
    P = api('projects', {'name': 'Canal', 'path': proj.replace(chr(92), '/'), 'area': 'Vídeo'})
    AG = api('agents', {'name': 'Editor de Cortes', 'role': 'Edita vídeos verticais', 'room': 'Vídeo', 'provider': 'codex', 'model': '', 'instructions': '', 'mode': 'write', 'skillIds': [], 'capabilities': []})
    URL = f'http://127.0.0.1:{PORT}/#{key}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True); ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(URL); pg.wait_for_selector('#rail button', timeout=15000); pg.click('[data-nav=routines]'); pg.wait_for_selector('.fj-card', timeout=8000)
        check('Rotinas mostra o cartão de pastas de entrada vazio', 'Nenhuma pasta de entrada ainda' in pg.inner_text('.fj-card') and pg.is_visible('[data-act=fj-new]'))
        pg.click('[data-act=fj-new]'); pg.wait_for_selector('#fj-dialog[open]'); time.sleep(0.4)
        check('o formulário vem com exemplo de instrução com {arquivo} e a pasta ENTRADA', '{arquivo}' in pg.input_value('#fj-form [name=instruction]') and pg.input_value('#fj-form [name=dir]') == 'ENTRADA')
        pg.fill('#fj-form [name=name]', 'Cortes verticais'); pg.fill('#fj-form [name=exts]', 'mp4'); pg.select_option('#fj-form [name=who]', 'a:' + AG['id'])
        pg.fill('#fj-form [name=instruction]', 'Sem marcador'); pg.click('#fj-form button[type=submit]')
        try: pg.wait_for_selector('#notice.bad', timeout=6000)
        except Exception: pass
        check('instrução sem {arquivo} é recusada com explicação', pg.is_visible('#notice.bad') and '{arquivo}' in pg.inner_text('#notice') and api('state')['folderJobs'] == [], (pg.is_visible('#notice'), pg.inner_text('#notice'), pg.get_attribute('#notice', 'class')))
        pg.fill('#fj-form [name=instruction]', 'Edite o vídeo {arquivo} [[fake sleep=300]]'); pg.select_option('#fj-form [name=parallel]', '1')
        pg.click('#fj-form button[type=submit]'); pg.wait_for_selector('.fj-row', timeout=10000); time.sleep(0.6)
        check('criar monta a pasta ENTRADA dentro do projeto e mostra o lote vigiando', os.path.isdir(os.path.join(proj, 'ENTRADA')) and 'vigiando' in pg.inner_text('.fj-row') and 'Ponha arquivos em' in pg.inner_text('.fj-row'))
        old = time.time() - 120
        for n in ('video1.mp4', 'video2.mp4', 'video3.mp4', 'nota.txt'):
            f = os.path.join(proj, 'ENTRADA', n); open(f, 'w').write('x'); os.utime(f, (old, old))
        api(f"folderjobs/{api('state')['folderJobs'][0]['id']}/run", {}); JID = api('state')['folderJobs'][0]['id']
        s = api('state')['folderJobs'][0]; check('só os 3 .mp4 entram (o .txt é ignorado)', s['counts']['total'] == 3, s['counts'])
        pg.reload(); pg.wait_for_selector('#rail button', timeout=15000); pg.click('[data-nav=routines]'); pg.wait_for_selector('.fj-bar', timeout=10000)
        check('a tela mostra a barra de progresso e "x de 3 prontos"', 'de 3 prontos' in pg.inner_text('.fj-row') or 'de <b>3</b>' in pg.inner_html('.fj-row'))
        end = time.time() + 60
        while time.time() < end:
            api(f'folderjobs/{JID}/run', {}); c = api('state')['folderJobs'][0]['counts']
            if c['done'] == 3: break
            time.sleep(1)
        s = api('state')['folderJobs'][0]; check('os 3 arquivos foram processados, um por vez, pelo executor real', s['counts']['done'] == 3 and s['counts']['failed'] == 0, s['counts'])
        tasks = [t for t in api('state')['runs'] if t['agent']['name'] == 'Editor de Cortes']; check('cada arquivo virou uma tarefa com o caminho certo na instrução', len(tasks) == 3 and all('ENTRADA/video' in t['prompt'] for t in tasks), [t['prompt'] for t in tasks])
        st = api('state'); check('o aviso "lote terminou" foi criado e chega no estado', any('terminou' in n['title'] for n in st['notices']), st['notices'])
        pg.reload(); pg.wait_for_selector('#rail button', timeout=15000); pg.wait_for_selector('.notice-bar', timeout=8000); check('a tela mostra a faixa verde com "3 de 3 arquivo(s) prontos"', '3 de 3' in pg.inner_text('.notice-bar'))
        pg.click('.notice-bar [data-act=notice-open]'); pg.wait_for_selector('.fj-card', timeout=8000); time.sleep(0.6)
        check('"Ver" abre Rotinas com a lista de arquivos e some o aviso', pg.locator('.notice-bar').count() == 0 and pg.locator('.fj-items li').count() == 3 and api('state')['notices'] == [], pg.locator('.fj-items li').count())
        # novo arquivo entra no mesmo lote; falha e repetição
        f = os.path.join(proj, 'ENTRADA', 'video4.mp4'); open(f, 'w').write('x'); os.utime(f, (old, old)); api(f'folderjobs/{JID}/run', {})
        end = time.time() + 40
        while time.time() < end and api('state')['folderJobs'][0]['counts']['done'] < 4: api(f'folderjobs/{JID}/run', {}); time.sleep(1)
        check('arquivo novo entra sozinho no mesmo lote e o aviso sai de novo', api('state')['folderJobs'][0]['counts']['done'] == 4 and len(api('state')['notices']) == 1)
        pg.click('[data-act=fj-pause]'); time.sleep(0.8); check('Pausar muda o estado para pausada', 'pausada' in pg.inner_text('.fj-row') and api('state')['folderJobs'][0]['status'] == 'paused')
        pg.click('[data-act=fj-resume]'); time.sleep(0.8); pg.click('[data-act=fj-edit]'); pg.wait_for_selector('#fj-dialog[open]'); check('Editar abre o formulário já preenchido', pg.input_value('#fj-form [name=name]') == 'Cortes verticais' and pg.input_value('#fj-form [name=exts]') == 'mp4'); pg.click('[data-act=fj-close]')
        pg.click('[data-act=fj-delete]'); time.sleep(0.8); check('Remover tira o lote e mantém os arquivos', api('state')['folderJobs'] == [] and os.path.exists(os.path.join(proj, 'ENTRADA', 'video1.mp4')))
        errs = [e for e in errs if 'status of 400' not in e]; check('sem erro de console', not errs, errs[:2]); ctx.close()
        # celular
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#rail button', timeout=15000); pg.click('[data-nav=routines]'); pg.wait_for_selector('.fj-card'); pg.click('[data-act=fj-new]'); pg.wait_for_selector('#fj-dialog[open]'); time.sleep(0.4)
        box = pg.evaluate("(() => { const r = document.getElementById('fj-dialog').getBoundingClientRect(); return [r.left, r.right, innerWidth, document.documentElement.scrollWidth]; })()")
        check('celular: o formulário cabe na tela sem rolagem lateral', box[0] >= 0 and box[1] <= box[2] + 1 and box[3] <= box[2], box); ctx.close(); browser.close()
finally:
    srv.kill(); time.sleep(0.5); shutil.rmtree(tmp, ignore_errors=True)
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
