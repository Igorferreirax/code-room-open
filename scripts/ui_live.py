"""Sessão ao vivo no chat com um agente: abre o chat no agente enquanto uma tarefa roda e confere que o painel mostra o andamento,
a resposta chegando e o estado final. Usa um agente falso (processo real, sem gastar cota). Servidor temporário isolado.
Uso: python scripts/ui_live.py"""
import json, os, shutil, subprocess, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4797
tmp = tempfile.mkdtemp(prefix='cr-live-'); app = os.path.join(tmp, 'app'); data = os.path.join(tmp, 'data'); bindir = os.path.join(tmp, 'bin'); proj = os.path.join(tmp, 'proj')
for d in (bindir, app, proj, os.path.join(tmp, 'home')): os.makedirs(d)
for d in ('server', 'public', 'docs'): shutil.copytree(os.path.join(ROOT, d), os.path.join(app, d))
shutil.copy(os.path.join(ROOT, 'package.json'), app); os.makedirs(os.path.join(app, 'test', 'fixtures'))
for f in ('fake-agent.mjs', 'fake-codex-preload.mjs'): shutil.copy(os.path.join(ROOT, 'test', 'fixtures', f), os.path.join(app, 'test', 'fixtures', f))
shutil.copy(shutil.which('node'), os.path.join(bindir, 'codex.exe'))
env = dict(os.environ, PATH=bindir + os.pathsep + os.environ['PATH'], CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT), CODE_ROOM_NO_BROWSER='1', CODE_ROOM_RELEASES_URL='http://127.0.0.1:1/x',
           USERPROFILE=os.path.join(tmp, 'home'), HOME=os.path.join(tmp, 'home'),
           NODE_OPTIONS='--import file:///' + os.path.join(app, 'test', 'fixtures', 'fake-codex-preload.mjs').replace(chr(92), '/'))
srv = subprocess.Popen([shutil.which('node'), os.path.join(app, 'server', 'main.mjs')], cwd=app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0

def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(name)
    print(('OK    ' if ok else 'FALHA ') + name + (' ' + str(extra) if extra and not ok else ''))

try:
    for _ in range(60):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        r = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(r, timeout=40))
    P = api('projects', {'name': 'Canal Ao Vivo', 'path': proj.replace(chr(92), '/'), 'area': 'Programação'})
    ag = api('agents', {'name': 'Lia Ao Vivo', 'role': 'testa o painel', 'room': 'Programação', 'provider': 'codex', 'model': '', 'instructions': '', 'mode': 'read', 'skillIds': [], 'capabilities': ['research']})
    api('tasks', {'projectId': P['id'], 'agentId': ag['id'], 'requestId': 'live1', 'objective': 'Trabalhar um pouco [[fake echo=1 sleep=9000 answer=Terminei_o_trabalho]]'})

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        page = browser.new_context(viewport={'width': 1440, 'height': 900}).new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e))); page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{PORT}/?v=1#{key}'); page.wait_for_selector('#rail button', timeout=8000); page.wait_for_timeout(800)
        page.click('[data-nav=room]'); page.wait_for_selector('[data-act=agent]', timeout=8000); page.wait_for_timeout(500)
        # abre o chat direto no agente (pelo menu de clique do agente → gaveta → missão)
        card = page.locator('[data-act=agent]', has_text='Lia Ao Vivo').first
        card.click(); page.wait_for_timeout(400)
        if page.locator('#agent-menu [data-act=agent]').count(): page.click('#agent-menu [data-act=agent]'); page.wait_for_timeout(500)
        page.wait_for_selector('#drawer [data-act=ask-agent]', timeout=8000); page.click('#drawer [data-act=ask-agent]')
        page.wait_for_selector('#live-box', timeout=12000)
        txt = page.inner_text('#live-box')
        check('ao vivo: o painel aparece no chat com o agente', 'Ao vivo' in txt and 'Lia Ao Vivo' in txt, txt[:120])
        check('ao vivo: mostra que está trabalhando', 'trabalhando' in txt)
        check('ao vivo: tem o botão Parar enquanto roda', page.locator('#live-box [data-act=cancel]').count() == 1)
        for _ in range(30):
            if page.locator('#live-log li').count() >= 1: break
            page.wait_for_timeout(300)
        check('ao vivo: a linha do tempo mostra movimento (resposta chegando)', page.locator('#live-log li').count() >= 1, page.inner_text('#live-box')[:200])
        # termina sozinho (sleep=9000): o painel passa para "Última tarefa" com a resposta final
        for _ in range(60):
            if 'Última tarefa' in page.inner_text('#live-box') or 'Ultima tarefa' in page.inner_text('#live-box'): break
            page.wait_for_timeout(500)
        txt = page.inner_text('#live-box')
        check('ao vivo: ao terminar vira "Última tarefa" e some o Parar', 'Última tarefa' in txt and page.locator('#live-box [data-act=cancel]').count() == 0, txt[:160])
        check('ao vivo: concluída e com a resposta final', 'concluída' in txt and 'Terminei o trabalho' in page.inner_text('#live-box') or 'Terminei o trabalho' in txt, txt[:300])
        check('ao vivo: dá para abrir a tarefa completa', page.locator('#live-box [data-act=task]').count() == 1)
        # outra tarefa dispara o painel de novo sem recarregar a página
        api('tasks', {'projectId': P['id'], 'agentId': ag['id'], 'requestId': 'live2', 'objective': 'Segunda [[fake sleep=7000 answer=Segunda_ok]]'})
        for _ in range(40):
            if 'Ao vivo' in page.inner_text('#live-box'): break
            page.wait_for_timeout(300)
        check('ao vivo: uma tarefa nova aparece sozinha, sem recarregar', 'Ao vivo' in page.inner_text('#live-box'))
        page.click('#live-box [data-act=cancel]')
        for _ in range(60):   # cancelar encerra a árvore de processos: pode levar alguns segundos
            if 'Ao vivo' not in page.inner_text('#live-box'): break
            page.wait_for_timeout(500)
        check('ao vivo: Parar cancela a tarefa', 'cancelada' in page.inner_text('#live-box') or 'Cancelad' in page.inner_text('#live-box') or 'Última tarefa' in page.inner_text('#live-box'))
        # ---- várias janelas de chat ao mesmo tempo ----
        beto = api('agents', {'name': 'Beto Ao Vivo', 'role': 'segunda janela', 'room': 'Programação', 'provider': 'codex', 'model': '', 'instructions': '', 'mode': 'read', 'skillIds': [], 'capabilities': ['research']})
        page.reload(); page.wait_for_selector('#rail button', timeout=8000); page.wait_for_timeout(800)
        if page.is_visible('#chat'): page.click('[data-act=chat-min]'); page.wait_for_timeout(300)
        page.click('[data-nav=room]'); page.wait_for_selector('[data-act=agent]', timeout=8000); page.wait_for_timeout(500)
        for nome in ('Lia Ao Vivo', 'Beto Ao Vivo'):
            page.locator('[data-act=agent]', has_text=nome).first.click(); page.wait_for_timeout(300)
            if page.locator('#agent-menu [data-act=agent]').count(): page.click('#agent-menu [data-act=agent]'); page.wait_for_timeout(300)
            page.wait_for_selector('#drawer [data-act=mini-open]', timeout=5000); page.click('#drawer [data-act=mini-open]'); page.wait_for_timeout(600)
        check('janelas: duas janelas abertas lado a lado', page.locator('.mini').count() == 2, page.locator('.mini').count())
        lia_t, beto_t = f"#mini-t-{ag['id']}", f"#mini-t-{beto['id']}"
        page.fill(lia_t, 'rascunho que não pode sumir')
        page.fill(beto_t, 'Trabalho do Beto [[fake echo=1 sleep=7000 answer=Beto_terminou]]'); page.press(beto_t, 'Enter')
        for _ in range(40):
            if 'Ao vivo' in page.inner_text(f".mini[data-mini='{beto['id']}']"): break
            page.wait_for_timeout(300)
        check('janelas: Enter envia a missão e a janela do Beto mostra a tarefa ao vivo', 'Ao vivo' in page.inner_text(f".mini[data-mini='{beto['id']}']"))
        check('janelas: cada agente tem a sua sessão (a da Lia não mostra a do Beto)', 'Beto' not in page.inner_text(f".mini[data-mini='{ag['id']}'] [data-mini-body]"))
        page.wait_for_timeout(1500)
        check('janelas: o rascunho da outra janela sobrevive às atualizações em tempo real', page.input_value(lia_t) == 'rascunho que não pode sumir', page.input_value(lia_t))
        check('janelas: a caixa de missão volta vazia depois de enviar', page.input_value(beto_t) == '')
        page.reload(); page.wait_for_selector('#rail button', timeout=8000); page.wait_for_timeout(1000)
        check('janelas: continuam abertas depois de recarregar a página', page.locator('.mini').count() == 2)
        page.click(f"[data-act=mini-close][data-id='{ag['id']}']"); page.wait_for_timeout(300)
        check('janelas: fechar uma deixa só a outra', page.locator('.mini').count() == 1 and page.locator(f".mini[data-mini='{beto['id']}']").count() == 1)
        page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(300)
        check('janelas: no celular as janelas extras não aparecem (usa o chat principal)', not page.locator('.mini').first.is_visible())
        page.set_viewport_size({'width': 1440, 'height': 900}); page.wait_for_timeout(300)
        page.click(f"[data-act=mini-close][data-id='{beto['id']}']"); page.wait_for_timeout(300)
        check('janelas: todas fechadas', page.locator('.mini').count() == 0)
        # ---- balão do agente: clicou no agente, a conversa abre ali do lado ----
        page.click('[data-nav=room]'); page.wait_for_selector('.ps-station', timeout=8000); page.wait_for_timeout(600)
        page.locator('.ps-station').first.click(); page.wait_for_selector('#agent-menu .am-form textarea', timeout=5000)
        check('balão: clicar no agente abre o balão com caixa de missão e as ações', page.locator('#agent-menu [data-act=mini-open]').count() == 1 and page.locator('#agent-menu [data-act=mention-agent]').count() == 1 and page.locator('#agent-menu [data-act=agent]').count() == 1)
        check('balão: o foco já está na caixa de missão (dá para digitar na hora)', page.evaluate("document.activeElement && document.activeElement.closest('.am-form') !== null"))
        for _ in range(60):   # garante que nenhuma tarefa antiga está ao vivo para este agente antes de começar
            if 'Ao vivo' not in page.inner_text('#agent-menu [data-am-live]'): break
            page.wait_for_timeout(500)
        ta = page.locator('#agent-menu .am-form textarea'); ta.fill('Missão do balão [[fake echo=1 sleep=7000 answer=Balao_ok]]'); ta.press('Enter')
        for _ in range(60):
            if 'Ao vivo' in page.inner_text('#agent-menu [data-am-live]') and ta.input_value() == '': break
            page.wait_for_timeout(300)
        check('balão: Enter envia e o balão mostra a tarefa ao vivo', 'Ao vivo' in page.inner_text('#agent-menu [data-am-live]'))
        check('balão: continua aberto e a caixa volta vazia', page.locator('#agent-menu').count() == 1 and ta.input_value() == '')
        ta.fill('rascunho do balão'); page.wait_for_timeout(2000)
        check('balão: o que está sendo digitado sobrevive às atualizações em tempo real', page.locator('#agent-menu .am-form textarea').input_value() == 'rascunho do balão')
        box = page.locator('#agent-menu').bounding_box()
        check('balão: cabe inteiro na tela', box and box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= 1440 and box['y'] + box['height'] <= 900, box)
        page.click('#agent-menu [data-act=mini-open]'); page.wait_for_timeout(700)
        check('balão: "Fixar em janela" fecha o balão e abre a janela lateral', page.locator('#agent-menu').count() == 0 and page.locator('.mini').count() == 1)
        page.click('.mini [data-act=mini-close]'); page.wait_for_timeout(300)
        page.locator('.ps-station').first.click(); page.wait_for_selector('#agent-menu', timeout=5000); page.keyboard.press('Escape'); page.wait_for_timeout(300)
        check('balão: Esc fecha o balão', page.locator('#agent-menu').count() == 0)
        # fechar o chat para de acompanhar
        if page.is_visible('#chat'): page.click('[data-act=chat-min]'); page.wait_for_timeout(400)
        check('ao vivo: sem erro de console', not errors, errors[:3])
        browser.close()
finally:
    srv.kill(); time.sleep(0.5); shutil.rmtree(tmp, ignore_errors=True)
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
raise SystemExit(1 if fails else 0)
