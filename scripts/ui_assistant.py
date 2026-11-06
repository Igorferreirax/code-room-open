"""Roteiro no navegador do painel do Assistente. Sobe um serviço temporário, confere a rota real (/api/assistant) e simula as respostas
da IA (nenhuma IA é chamada, nada gasta cota) para percorrer: abrir, apresentar, conversar, cartões de ação, aprovar, descartar,
ação inválida, limpar, teclado, celular e erros de console. Uso: python scripts/ui_assistant.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4793
data = tempfile.mkdtemp(prefix='cr-asst-')
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' and not ok else ''))

S = {'manual': {'available': True, 'hash': 'abc'}, 'briefed': False, 'stale': False, 'briefedAt': None, 'knowledge': '', 'provider': 'claude', 'connected': ['claude', 'codex'], 'messages': [], 'error': None, 'pending': None, 'briefing': None}
calls = []
def act(i, valid=True, typ='criar_equipe', summary='Criar a equipe “Dev”: desenvolvedor → A, revisor → B', error=None, status='pending'):
    return {'idx': i, 'type': typ, 'summary': summary, 'payload': {}, 'valid': valid, 'error': error, 'status': status}
try:
    for _ in range(50):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    real = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/assistant', headers={'X-Code-Room-Key': key})))
    check('rota real /api/assistant responde com o estado inicial', real['briefed'] is False and real['manual']['available'] is True and real['messages'] == [] and 'raw' not in json.dumps(real), real)
    st = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/state', headers={'X-Code-Room-Key': key})))
    check('estado público não traz agentes nem projeto internos do Assistente', not [a for a in st['agents'] if a.get('internal')] and not [p for p in st['projects'] if p.get('internal')])
    try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/assistant', timeout=2); anon = 200
    except urllib.error.HTTPError as e: anon = e.code
    check('sem a chave, a rota do Assistente é negada', anon in (401, 403), anon)

    def handle(route):
        req = route.request; path = req.url.split('/api/assistant')[1].lstrip('/'); body = json.loads(req.post_data or '{}'); calls.append((path, body))
        def out(v, code=200): route.fulfill(status=code, headers={'Content-Type': 'application/json'}, body=json.dumps(v))
        if path == '': return out(S)
        if path == 'brief': S['briefing'] = {'status': 'running'}; return out(S, 202)
        if path == 'ask':
            S['messages'].append({'id': 'u%d' % len(S['messages']), 'role': 'user', 'text': body['text'], 'at': '2026-11-07T10:00:00Z'}); S['pending'] = {'kind': 'ask', 'status': 'running'}; return out(S, 202)
        if path == 'reset': S['messages'] = []; return out(S)
        if path == 'apply':
            a = [m for m in S['messages'] if m['id'] == body['messageId']][0]['actions'][body['index']]
            if a['type'] == 'abrir_tela': a['status'] = 'applied'; a['result'] = 'Tela aberta.'; return out({'result': 'Tela aberta.', 'view': 'skills', 'status': S})
            a['status'] = 'applied'; a['result'] = 'Equipe “Dev” criada.'; return out({'result': a['result'], 'view': None, 'status': S})
        if path == 'dismiss': [m for m in S['messages'] if m['id'] == body['messageId']][0]['actions'][body['index']]['status'] = 'dismissed'; return out(S)
        out({'error': 'rota?'}, 404)

    URL = f'http://127.0.0.1:{PORT}/#{key}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/api/assistant**', handle); pg.goto(URL); pg.wait_for_selector('[data-act=asst-toggle]', timeout=15000)
        check('botão Assistente aparece e o painel começa fechado', pg.is_visible('[data-act=asst-toggle]') and not pg.is_visible('#asst'))
        pg.click('[data-act=asst-toggle]'); pg.wait_for_selector('#asst:not([hidden])'); time.sleep(0.4)
        t = pg.inner_text('#asst'); check('1º uso: explica a leitura do manual, a gravação local e que não altera nada', 'ler o manual' in t and 'neste computador' in t and 'não altera nada' in t, t[:200])
        check('antes da apresentação não há campo de pergunta', pg.locator('#asst-input').count() == 0)
        pg.click('[data-act=asst-brief]'); time.sleep(0.5); check('apresentando: mostra "lendo o manual" e chamou a rota com a IA escolhida', 'lendo o manual' in pg.inner_text('#asst') and calls[-1] == ('brief', {'provider': 'claude'}), calls[-1])
        S['briefing'] = None; S['briefed'] = True; S['knowledge'] = 'ok'; time.sleep(3.2)
        try: pg.wait_for_selector('#asst-input', timeout=8000)
        except Exception: pass
        check('ao terminar a leitura, abre a conversa (poll automático)', pg.locator('#asst-input').count() == 1 and pg.is_visible('.as-empty'), pg.inner_text('#asst')[:120])
        pg.click('.as-empty .chip'); check('sugestão preenche o campo sem enviar', 'equipe' in pg.input_value('#asst-input') and not [c for c in calls if c[0] == 'ask'])
        pg.fill('#asst-input', 'Crie uma equipe de desenvolvimento'); pg.keyboard.press('Shift+Enter'); pg.keyboard.type('segunda linha'); check('Shift+Enter quebra a linha sem enviar', '\n' in pg.input_value('#asst-input') and not [c for c in calls if c[0] == 'ask'])
        pg.fill('#asst-input', 'Crie uma equipe de desenvolvimento'); pg.keyboard.press('Enter'); time.sleep(0.6)
        check('Enter envia: a pergunta aparece na hora e mostra "Pensando…" com o campo travado', calls[-1] == ('ask', {'text': 'Crie uma equipe de desenvolvimento'}) and 'Pensando' in pg.inner_text('#asst') and pg.is_disabled('#asst-input') and 'Crie uma equipe' in pg.inner_text('.as-msg.me'))
        S['pending'] = None; S['messages'].append({'id': 'a1', 'role': 'assistant', 'text': 'Sugiro **duas** coisas:\n- criar a equipe\n- abrir as skills <img src=x onerror=alert(1)>', 'at': '2026-11-07T10:00:05Z', 'actions': [act(0), act(1, False, error='O agente “Z” não existe.', summary='Criar a equipe “Fantasma”'), act(2, True, 'abrir_tela', 'Abrir a tela skills')]}); time.sleep(2.2)
        check('resposta aparece formatada (negrito e lista) e HTML da IA fica inofensivo', pg.locator('.as-msg.ai b').first.inner_text() == 'duas' and pg.locator('.as-msg.ai li').count() == 2 and pg.locator('.as-msg.ai img').count() == 0)
        check('três cartões: dois com Criar/Abrir e um com o problema explicado', pg.locator('.as-card').count() == 3 and pg.locator('[data-act=asst-apply]').count() == 2 and 'não existe' in pg.inner_text('.as-card.bad'))
        check('há um botão "Aprovar tudo, na ordem" quando a resposta traz várias propostas', pg.locator('[data-act=asst-apply-all]').count() == 1)
        check('campo volta a ficar livre depois da resposta', not pg.is_disabled('#asst-input'))
        pg.click('.as-card >> nth=0 >> [data-act=asst-apply]'); time.sleep(0.5); check('Criar chama a rota com mensagem e índice e mostra o resultado', calls[-1] == ('apply', {'messageId': 'a1', 'index': 0}) and '✔ Equipe “Dev” criada.' in pg.inner_text('.as-card >> nth=0'))
        pg.click('.as-card >> nth=1 >> [data-act=asst-dismiss]'); time.sleep(0.5); check('Descartar marca a proposta como descartada', 'Descartada' in pg.inner_text('.as-card >> nth=1') and pg.locator('.as-card >> nth=1 >> button').count() == 0)
        pg.click('.as-card >> nth=2 >> [data-act=asst-apply]'); time.sleep(1.0); check('Abrir leva para a tela de Skills', 'Skills' in pg.inner_text('#rail .active, #rail [aria-current]') or pg.evaluate("location.hash").find('skills') >= 0 or 'skill' in pg.inner_text('#view').lower())
        check('painel continua aberto depois de navegar', pg.is_visible('#asst'))
        pg.click('[data-act=asst-reset]'); time.sleep(0.5); check('Limpar conversa esvazia as mensagens e mantém a apresentação', pg.locator('.as-msg').count() == 0 and pg.locator('#asst-input').count() == 1)
        # entrada única: a barra de baixo conversa com o Assistente por padrão
        pg.click('[data-act=asst-toggle]'); time.sleep(0.3)
        check('a barra de baixo vem apontada para o Assistente e o botão Enviar está livre', pg.input_value('#target') == 'assistant' and 'o que você quer fazer' in pg.get_attribute('#mission', 'placeholder') and not pg.is_disabled('#send'))
        n0 = len([c for c in calls if c[0] == 'ask']); pg.fill('#mission', 'quero editar um documentário'); pg.keyboard.press('Enter'); time.sleep(1.0)
        check('texto da barra de baixo abre o painel e vai para o Assistente (um chat só)', pg.is_visible('#asst') and calls[-1] == ('ask', {'text': 'quero editar um documentário'}) and len([c for c in calls if c[0] == 'ask']) == n0 + 1 and pg.input_value('#mission') == '', calls[-1])
        S['pending'] = None; time.sleep(2.2)
        pg.keyboard.press('Escape'); time.sleep(0.2)
        pg.click('[data-act=asst-toggle]'); time.sleep(0.3); check('botão fecha o painel e o conteúdo volta a ocupar a largura', not pg.is_visible('#asst') and pg.evaluate("getComputedStyle(document.querySelector('.main')).marginRight") == '0px')
        # IA desatualizada e erro
        S['stale'] = True; pg.reload(); pg.wait_for_selector('[data-act=asst-toggle]'); pg.click('[data-act=asst-toggle]'); time.sleep(0.6); check('manual mudou: pede para apresentar de novo', 'O manual mudou' in pg.inner_text('#asst') and pg.locator('[data-act=asst-brief]').count() == 1)
        check('sem erro de console (desktop)', not errs, errs[:2]); ctx.close()
        # celular
        S['stale'] = False; S['messages'] = [{'id': 'a2', 'role': 'assistant', 'text': 'Oi', 'at': '2026-11-07T10:00:05Z', 'actions': [act(0)]}]
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); pg.route('**/api/assistant**', handle); pg.goto(URL); pg.wait_for_selector('[data-act=asst-toggle]', timeout=15000); pg.click('[data-act=asst-toggle]'); time.sleep(0.6)
        box = pg.evaluate("(() => { const r = document.getElementById('asst').getBoundingClientRect(); return [r.left, r.right, innerWidth, document.documentElement.scrollWidth]; })()")
        check('celular: painel ocupa a tela inteira sem rolagem lateral', box[0] <= 1 and box[1] >= box[2] - 1 and box[3] <= box[2], box)
        check('celular: botão Enviar e campo visíveis', pg.is_visible('#asst-input') and pg.is_visible('#asst-form .btn'))
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'asst-m.png')); ctx.close(); browser.close()
finally:
    srv.kill()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
