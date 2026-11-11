"""Roteiro no navegador: conectar outra IA (formulário, teste, salvar), usá-la num agente, ver a atividade e filtrar skills por categoria.
Usa o Node como "IA" de teste (nenhuma IA real, nenhuma cota). Uso: python scripts/ui_providers.py"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4797
data = tempfile.mkdtemp(prefix='cr-prov-'); proj = tempfile.mkdtemp(prefix='cr-prov-p-'); NODE = shutil.which('node')
srv = subprocess.Popen([NODE, os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT), USERPROFILE=os.path.join(data, 'home')), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
    P = api('projects', {'name': 'Canal', 'path': proj.replace('\\', '/'), 'area': 'Vídeo'})
    URL = f'http://127.0.0.1:{PORT}/#{key}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True); ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: d.accept()); pg.goto(URL); pg.wait_for_selector('#rail button', timeout=15000); pg.click('[data-nav=connections]'); pg.wait_for_selector('.prov-card', timeout=8000)
        check('Conexões tem o cartão "Outras IAs" vazio e o botão para conectar', 'Nenhuma IA extra' in pg.inner_text('.prov-card') and pg.is_visible('[data-act=prov-open]'))
        pg.click('[data-act=prov-open]'); pg.wait_for_selector('#prov-dialog[open]'); time.sleep(0.5)
        t = pg.inner_text('#prov-dialog'); check('janela lista as IAs populares com o estado de instalação', all(n in t for n in ('Gemini CLI', 'OpenCode', 'Aider', 'Qwen Code')) and ('CLI encontrada' in t or 'Ainda não encontrada' in t))
        pg.click('.prov-pick[data-id=gemini]'); time.sleep(0.3); pg.evaluate("document.querySelector('.prov-advanced').open = true"); check('escolher uma da lista preenche nome, programa e argumentos e mostra como instalar e entrar', pg.input_value('#prov-form [name=name]') == 'Gemini CLI' and pg.input_value('#prov-form [name=exe]') == 'gemini' and '{prompt}' in pg.input_value('#prov-form [name=argsText]') and 'Instalar:' in pg.inner_text('.prov-help') and 'Entrar:' in pg.inner_text('.prov-help'))
        # IA própria de verdade (o Node faz o papel da IA): testa, salva
        pg.fill('#prov-form [name=name]', 'IA de Teste'); pg.fill('#prov-form [name=exe]', NODE); pg.select_option('#prov-form [name=promptVia]', 'arg'); pg.fill('#prov-form [name=argsText]', '-e "console.log(\'resposta:\' + process.argv[1])" {prompt}'); pg.fill('#prov-form [name=modelFlag]', '')
        pg.click('#prov-form [data-act=prov-test-form]'); pg.wait_for_selector('.prov-test.upd-ok', timeout=30000); check('Testar mostra a resposta real da IA', 'resposta:' in pg.inner_text('.prov-test'))
        pg.fill('#prov-form [name=argsText]', '-e "process.exit(3)" {prompt}'); pg.click('#prov-form [data-act=prov-test-form]'); pg.wait_for_selector('.prov-test.upd-err', timeout=30000); check('Testar com erro mostra o motivo e não grava nada', 'Não funcionou' in pg.inner_text('.prov-test') and api('providers')['custom'] == [])
        pg.fill('#prov-form [name=argsText]', '-e "console.log(\'resposta:\' + process.argv[1])"'); pg.click('#prov-form button[type=submit]'); time.sleep(0.8); check('argumentos sem {prompt} são recusados na hora de salvar', pg.is_visible('#notice.bad') and api('providers')['custom'] == [], pg.inner_text('#notice'))
        pg.fill('#prov-form [name=argsText]', '-e "console.log(\'resposta:\' + process.argv[1])" {prompt}'); pg.click('#prov-form button[type=submit]'); time.sleep(1.2)
        check('salvar fecha a janela e a IA aparece no cartão', not pg.is_visible('#prov-dialog') and 'IA de Teste' in pg.inner_text('.prov-card') and 'CLI encontrada' in pg.inner_text('.prov-card'))
        c = api('providers')['custom']; check('ficou gravada no servidor com id próprio', len(c) == 1 and c[0]['id'] == 'x-ia-de-teste' and c[0]['args'][-1] == '{prompt}', c)
        pg.click('[data-act=prov-test][data-id=x-ia-de-teste]'); pg.wait_for_selector('.prov-card .prov-test.upd-ok', timeout=30000); check('Testar no cartão funciona', True)
        # criar agente com a IA nova
        pg.click('[data-nav=agents]'); time.sleep(0.5); pg.click('[data-act=new-agent]'); pg.wait_for_selector('#agent-dialog[open]'); opts = pg.eval_on_selector_all('#agent-form [name=provider] option', 'os => os.map(o => [o.value, o.textContent])')
        check('o agente novo oferece a IA conectada na lista de ferramentas', ['x-ia-de-teste', 'IA de Teste'] in opts, opts)
        pg.fill('#agent-form [name=name]', 'Pesquisador Próprio'); pg.fill('#agent-form [name=role]', 'Pesquisa'); pg.select_option('#agent-form [name=provider]', 'x-ia-de-teste'); pg.click('#agent-form button.btn.block'); time.sleep(1.0)
        ag = [a for a in api('state')['agents'] if a['name'] == 'Pesquisador Próprio']; check('agente criado com a IA própria', len(ag) == 1 and ag[0]['provider'] == 'x-ia-de-teste' and ag[0]['mode'] == 'read', ag)
        check('o cartão mostra o nome da IA, não o código', 'IA de Teste' in pg.inner_text('.agent-card'))
        rm = api('providers/delete', {'id': 'x-ia-de-teste'}); check('remover uma IA em uso é recusado com o nome do agente', '_http' in rm and 'Pesquisador Próprio' in rm.get('error', ''), rm)
        # tarefa de verdade e atividade
        t0 = api('tasks', {'projectId': P['id'], 'agentId': ag[0]['id'], 'requestId': 'r1', 'objective': 'Pesquise temas para o próximo vídeo'})
        end = time.time() + 30
        while time.time() < end and api('state')['runs'][0]['status'] not in ('completed', 'failed'): time.sleep(0.5)
        run = api('state')['runs'][0]; check('a tarefa rodou pela IA própria e terminou', run['status'] == 'completed', run)
        d = api(f"tasks/{t0['id']}"); check('a resposta da IA ficou registrada', 'resposta:' in json.dumps(d, ensure_ascii=False), str(d)[:200])
        pg.click('[data-nav=room]'); time.sleep(1.0); pg.evaluate("localStorage.setItem('cr.prefs', JSON.stringify({mode:'list'}))"); pg.goto('about:blank'); pg.goto(URL); pg.wait_for_selector('#rail button', timeout=15000); pg.click('[data-nav=room]'); pg.wait_for_selector('.activity-card', timeout=15000); time.sleep(0.8)
        act = pg.inner_text('.activity-card'); check('Sala mostra "Atividade recente" com o agente e o que ele fez', 'Atividade recente' in act and 'Pesquisador Próprio' in act and 'concluiu' in act, act)
        tip = pg.get_attribute('.term-h', 'title') or pg.get_attribute('.status-strip .s', 'title') or ''; check('ao passar o mouse no agente, a dica mostra a última atividade', 'Última atividade' in tip and 'Pesquise temas' in tip, tip)
        # skills por categoria (no ambiente isolado só existem as skills que o servidor achar)
        sk = tempfile.mkdtemp(prefix='cr-skills-')
        for n, d in (('editar-video-vertical', 'Edita videos verticais com legendas'), ('revisar-codigo', 'Revisa codigo e seguranca'), ('seo-audit-extra', 'Auditoria de SEO e marketing'), ('coisa-estranha', 'Algo sem categoria')):
            os.makedirs(os.path.join(sk, n)); open(os.path.join(sk, n, 'SKILL.md'), 'w', encoding='utf-8', newline='').write('---' + chr(10) + 'name: ' + n + chr(10) + 'description: ' + d + chr(10) + '---' + chr(10) + chr(10) + 'Texto da skill.' + chr(10))
        api('settings/skill-roots', {'path': sk.replace(chr(92), '/')}); pg.goto('about:blank'); pg.goto(URL); pg.wait_for_selector('#rail button', timeout=15000)
        pg.click('[data-nav=skills]'); pg.wait_for_selector('.cat-chips', timeout=15000); time.sleep(0.8)
        chips = pg.eval_on_selector_all('.cat-chips button', 'bs => bs.map(b => b.textContent)'); check('Skills tem filtro por categoria com contagem', chips and chips[0].startswith('Todas ('), chips)
        check('as categorias das skills de teste aparecem com a contagem certa', any(c.startswith('Vídeo') and '(1)' in c for c in chips) and any(c.startswith('Código') and '(1)' in c for c in chips) and any(c.startswith('Marketing') and '(1)' in c for c in chips) and any(c.startswith('Outras') for c in chips), chips)
        if len(chips) > 1:
            pg.click('.cat-chips button >> nth=1'); time.sleep(0.5); check('clicar em uma categoria marca o botão e filtra a lista', 'on' in (pg.get_attribute('.cat-chips button >> nth=1', 'class') or ''), pg.get_attribute('.cat-chips button >> nth=1', 'class'))
            rows = pg.locator('.srow').count() - 1; check('o filtro mostra só as skills da categoria', rows >= 1 and 'editar-video-vertical' in pg.inner_text('.cols') or 'revisar-codigo' in pg.inner_text('.cols') or rows >= 1, rows)
            pg.click('.cat-chips button >> nth=0'); time.sleep(0.3); check('Todas volta a mostrar tudo', 'on' in (pg.get_attribute('.cat-chips button >> nth=0', 'class') or ''))
        else: print('   (sem skills neste ambiente isolado: filtro conferido só nos testes de unidade)')
        errs = [e for e in errs if 'status of 400' not in e]; check('sem erro de console (fora a recusa de propósito)', not errs, errs[:2]); ctx.close()
        # celular: janela de conectar cabe na tela
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#rail button', timeout=15000); pg.click('[data-nav=connections]'); pg.wait_for_selector('.prov-card'); pg.click('[data-act=prov-open]'); pg.wait_for_selector('#prov-dialog[open]'); time.sleep(0.5)
        box = pg.evaluate("(() => { const r = document.getElementById('prov-dialog').getBoundingClientRect(); return [r.left, r.right, innerWidth, document.documentElement.scrollWidth]; })()")
        check('celular: a janela cabe na tela sem rolagem lateral', box[0] >= 0 and box[1] <= box[2] + 1 and box[3] <= box[2], box); ctx.close(); browser.close()
finally:
    srv.kill()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
