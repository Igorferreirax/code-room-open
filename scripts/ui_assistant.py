"""Roteiro no navegador do chat único (janela estilo mensageiro). Sobe um serviço temporário, confere a rota real (/api/assistant) e simula
as respostas da IA (nenhuma IA é chamada, nada gasta cota) para percorrer: balão minimizado, abrir, apresentar, conversar pela barra do chat,
cartões de ação, aprovar tudo, várias conversas, missão direta a um agente, aviso de resposta nova, celular e erros de console.
Uso: python scripts/ui_assistant.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4793
data = tempfile.mkdtemp(prefix='cr-asst-'); proj = tempfile.mkdtemp(prefix='cr-asst-p-')
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' and not ok else ''))

def nap(sec):   # espera deixando o Playwright atender as rotas simuladas (time.sleep sozinho não faria isso)
    pg.wait_for_timeout(int(sec * 1000))

def until(fn, secs=8):
    end = time.time() + secs
    while time.time() < end:
        try:
            if fn(): return True
        except Exception: pass
        nap(0.15)
    return False

def fresh():
    return {'manual': {'available': True, 'hash': 'abc'}, 'briefed': False, 'stale': False, 'briefedAt': None, 'knowledge': '', 'provider': 'claude', 'connected': ['claude', 'codex'], 'messages': [], 'error': None, 'pending': None, 'briefing': None,
            'thread': 't1', 'threads': [{'id': 't1', 'title': 'Conversa 1', 'active': True, 'count': 0}]}
S = fresh(); OTHER = {}   # OTHER: mensagens das conversas inativas
calls = []
def act(i, valid=True, typ='criar_equipe', summary='Criar a equipe “Dev”: desenvolvedor → A, revisor → B', error=None, status='pending'):
    return {'idx': i, 'type': typ, 'summary': summary, 'payload': {}, 'valid': valid, 'error': error, 'status': status}
try:
    for _ in range(50):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        r = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(r))
    real = api('assistant')
    check('rota real /api/assistant responde com o estado inicial e uma conversa', real['briefed'] is False and real['manual']['available'] is True and real['messages'] == [] and len(real['threads']) == 1 and 'raw' not in json.dumps(real), real)
    st = api('state')
    check('estado público não traz agentes nem projeto internos do Assistente', not [a for a in st['agents'] if a.get('internal')] and not [p for p in st['projects'] if p.get('internal')])
    try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/assistant', timeout=2); anon = 200
    except urllib.error.HTTPError as e: anon = e.code
    check('sem a chave, a rota do Assistente é negada', anon in (401, 403), anon)
    P = api('projects', {'name': 'Canal', 'path': proj.replace(chr(92), '/'), 'area': 'Vídeo'})
    AG = api('agents', {'name': 'Diretor', 'role': 'Dirige o vídeo', 'room': 'Vídeo', 'provider': 'claude', 'model': '', 'instructions': '', 'mode': 'read', 'skillIds': [], 'capabilities': []})
    api('projects/members', {'projectId': P['id'], 'add': [AG['id']]})  # o projeto só mostra quem foi trazido para ele

    def handle(route):
        req = route.request; path = req.url.split('/api/assistant')[1].lstrip('/'); body = json.loads(req.post_data or '{}'); calls.append((path, body))
        def out(v, code=200): route.fulfill(status=code, headers={'Content-Type': 'application/json'}, body=json.dumps(v))
        if path == '': return out(S)
        if path == 'brief': S['briefing'] = {'status': 'running'}; return out(S, 202)
        if path == 'ask':
            S['messages'].append({'id': 'u%d' % len(S['messages']), 'role': 'user', 'text': body['text'], 'at': '2026-11-07T10:00:00Z'}); S['pending'] = {'kind': 'ask', 'status': 'running'}
            if S['threads'][0]['title'].startswith('Conversa'): S['threads'][[t['active'] for t in S['threads']].index(True)]['title'] = body['text'][:28]
            return out(S, 202)
        if path == 'reset': S['messages'] = []; return out(S)
        if path == 'thread/new':
            OTHER[S['thread']] = S['messages']; n = len(S['threads']) + 1; tid = f't{n}'
            for t in S['threads']: t['active'] = False
            S['threads'].append({'id': tid, 'title': f'Conversa {n}', 'active': True, 'count': 0}); S['thread'] = tid; S['messages'] = []; return out(S)
        if path == 'thread/select':
            OTHER[S['thread']] = S['messages']; S['thread'] = body['id']; S['messages'] = OTHER.get(body['id'], [])
            for t in S['threads']: t['active'] = t['id'] == body['id']
            return out(S)
        if path == 'thread/rename':
            for t in S['threads']:
                if t['id'] == body['id']: t['title'] = body['title']
            return out(S)
        if path == 'thread/delete':
            S['threads'] = [t for t in S['threads'] if t['id'] != body['id']]; S['thread'] = S['threads'][0]['id']; S['threads'][0]['active'] = True; S['messages'] = OTHER.get(S['thread'], []); return out(S)
        if path == 'apply':
            a = [m for m in S['messages'] if m['id'] == body['messageId']][0]['actions'][body['index']]
            if a['type'] == 'abrir_tela': a['status'] = 'applied'; a['result'] = 'Tela aberta.'; return out({'result': 'Tela aberta.', 'view': 'skills', 'projectId': None, 'status': S})
            a['status'] = 'applied'; a['result'] = 'Equipe “Dev” criada.'; return out({'result': a['result'], 'view': None, 'projectId': None, 'status': S})
        if path == 'dismiss': [m for m in S['messages'] if m['id'] == body['messageId']][0]['actions'][body['index']]['status'] = 'dismissed'; return out(S)
        out({'error': 'rota?'}, 404)

    URL = f'http://127.0.0.1:{PORT}/#{key}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/api/assistant**', handle); pg.goto(URL); pg.wait_for_selector('#chat-bubble:not([hidden])', timeout=15000)
        check('primeira vez: só o balão aparece (sem janela, sem barra de baixo) e a página fica limpa', pg.is_visible('#chat-bubble') and not pg.is_visible('#chat') and not pg.is_visible('#mission'))
        pg.click('#chat-bubble'); pg.wait_for_selector('#chat:not([hidden])'); nap(0.4)
        t = pg.inner_text('#chat'); check('1º uso: a janela explica a leitura do manual, a gravação local e o Modo Piloto', 'ler o manual' in t and 'neste computador' in t and 'Modo Piloto' in t and pg.is_visible('#chat-bubble') is False, t[:200])
        check('o cabeçalho mostra a foto, o nome e que só propõe', pg.is_visible('.cw-head .cw-face svg.mascot') and 'Assistente' in pg.inner_text('#chat-head'))
        n0 = len([c for c in calls if c[0] == 'ask']); pg.fill('#mission', 'oi'); pg.keyboard.press('Enter'); nap(0.8)
        check('antes da apresentação, escrever na barra não envia: o texto fica e o chat avisa', len([c for c in calls if c[0] == 'ask']) == n0 and pg.input_value('#mission') == 'oi' and pg.is_visible('#notice'), pg.inner_text('#notice'))
        pg.fill('#mission', ''); pg.click('[data-act=asst-brief]'); nap(0.5); check('apresentando: mostra "lendo o manual" e chamou a rota com a IA escolhida', 'lendo o manual' in pg.inner_text('#chat') and calls[-1] == ('brief', {'provider': 'claude'}), calls[-1])
        S['briefing'] = None; S['briefed'] = True; S['knowledge'] = 'ok'
        try: pg.wait_for_selector('.as-empty', timeout=8000)
        except Exception: pass
        check('ao terminar a leitura, abre a conversa sozinho (sem recarregar)', pg.is_visible('.as-empty') and 'Oi! Eu sou' in pg.inner_text('#asst'), pg.inner_text('#asst')[:120])
        def menu_open():
            if not pg.is_visible('#cw-drawer'): pg.click('.cw-menu-btn'); nap(0.3)
        def menu_close():
            if pg.is_visible('#cw-drawer'): pg.click('.cw-scrim', position={'x': 380, 'y': 300}); nap(0.3)
        check('cabeçalho limpo: as conversas não ficam soltas no topo', pg.locator('.cw-dr-list').count() == 0 and pg.is_visible('.cw-menu-btn'))
        menu_open(); check('o menu ☰ mostra as conversas e o botão de nova', pg.is_visible('.cw-dr-list li.on') and pg.is_visible('[data-act=asst-new-thread]') and pg.is_visible('[data-act=asst-autonomy]')); pg.keyboard.press('Escape'); nap(0.3); check('Esc fecha o menu', pg.locator('#cw-drawer').count() == 0)
        pg.click('.as-empty .chip >> nth=2'); check('sugestão preenche a barra do chat sem enviar', 'equipe' in pg.input_value('#mission') and not [c for c in calls if c[0] == 'ask'])
        pg.fill('#mission', 'Crie uma equipe de desenvolvimento'); pg.keyboard.press('Shift+Enter'); pg.keyboard.type('segunda linha'); check('Shift+Enter quebra a linha sem enviar', '\n' in pg.input_value('#mission') and not [c for c in calls if c[0] == 'ask'])
        pg.fill('#mission', 'Crie uma equipe de desenvolvimento'); pg.keyboard.press('Enter'); until(lambda: [c for c in calls if c[0] == 'ask']); nap(0.4)
        check('Enter envia: a pergunta aparece na hora, "Pensando…" e a barra esvazia', calls[-1][0] == 'ask' and calls[-1][1]['text'] == 'Crie uma equipe de desenvolvimento' and calls[-1][1].get('projectId') == P['id'] and 'Pensando' in pg.inner_text('#chat') and pg.input_value('#mission') == '' and 'Crie uma equipe' in pg.inner_text('.as-msg.me'), (calls[-3:], pg.input_value('#mission'), pg.inner_text('#asst')[-160:]))
        menu_open(); check('o título da conversa vira o assunto da primeira pergunta', 'Crie uma equipe' in pg.inner_text('.cw-dr-list li.on'), pg.inner_text('.cw-dr-list')); menu_close()
        # minimiza durante a resposta; chega a resposta: balão mostra aviso
        pg.click('[data-act=chat-min]'); nap(0.3); check('minimizar esconde a janela e mostra o balão em andamento', pg.is_visible('#chat-bubble') and not pg.is_visible('#chat') and pg.locator('.cb-busy').count() == 1)
        S['pending'] = None; S['messages'].append({'id': 'a1', 'role': 'assistant', 'text': 'Sugiro **duas** coisas:\n- criar a equipe\n- abrir as skills <img src=x onerror=alert(1)>', 'at': '2026-11-07T10:00:05Z', 'actions': [act(0), act(1, False, error='O agente “Z” não existe.', summary='Criar a equipe “Fantasma”'), act(2, True, 'abrir_tela', 'Abrir a tela skills')]})
        pg.wait_for_selector('.cb-dot', timeout=10000); check('resposta nova com a janela minimizada: o balão ganha o aviso vermelho', pg.locator('.cb-dot').count() == 1)
        pg.click('#chat-bubble'); pg.wait_for_selector('#chat:not([hidden])'); nap(0.4); check('abrir tira o aviso e volta no ponto da conversa', pg.locator('.cb-dot').count() == 0 and 'Sugiro' in pg.inner_text('#asst') and 'Crie uma equipe' in pg.inner_text('.as-msg.me'))
        check('resposta formatada (negrito e lista) e HTML da IA inofensivo', pg.locator('.as-msg.ai b').first.inner_text() == 'duas' and pg.locator('.as-msg.ai li').count() == 2 and pg.locator('.as-msg.ai .as-bubble img').count() == 0, (pg.locator('.as-msg.ai b').first.inner_text(), pg.locator('.as-msg.ai li').count(), pg.locator('.as-msg.ai .as-bubble img').count()))
        check('mensagens do Assistente têm a foto dele ao lado', pg.locator('.as-msg.ai .as-face svg.mascot').count() >= 1)
        check('três cartões e o botão "Aprovar tudo, na ordem"', pg.locator('.as-card').count() == 3 and pg.locator('[data-act=asst-apply-all]').count() == 1 and pg.locator('[data-act=asst-apply]').count() == 2 and 'não existe' in pg.inner_text('.as-card.bad'))
        pg.click('.as-card >> nth=0 >> [data-act=asst-apply]'); nap(0.5); check('Criar chama a rota com mensagem e índice e mostra o resultado', calls[-1] == ('apply', {'messageId': 'a1', 'index': 0}) and '✔ Equipe “Dev” criada.' in pg.inner_text('.as-card >> nth=0'))
        pg.click('.as-card >> nth=1 >> [data-act=asst-dismiss]'); nap(0.5); check('Descartar marca a proposta como descartada', 'Descartada' in pg.inner_text('.as-card >> nth=1') and pg.locator('.as-card >> nth=1 >> button').count() == 0)
        pg.click('.as-card >> nth=2 >> [data-act=asst-apply]'); nap(1.0); check('Abrir leva para a tela de Skills e a janela continua aberta', pg.is_visible('#chat') and 'skill' in pg.inner_text('#view').lower())
        # várias conversas
        menu_open(); pg.click('[data-act=asst-new-thread]'); nap(0.5); vazia = pg.is_visible('.as-empty') and pg.locator('#cw-drawer').count() == 0; menu_open(); check('Nova conversa: fecha o menu, abre uma conversa vazia e a anterior continua guardada', pg.locator('.cw-dr-list li').count() == 2 and vazia and calls[-1][0] == 'thread/new'); menu_close()
        pg.fill('#mission', 'Revise o código do projeto'); pg.keyboard.press('Enter'); nap(0.6); S['pending'] = None; S['messages'].append({'id': 'a2', 'role': 'assistant', 'text': 'Resposta da conversa 2', 'at': '2026-11-07T10:01:00Z', 'actions': []}); nap(2.0)
        menu_open(); pg.click('.cw-dr-list li >> nth=0 >> .cw-dr-item'); nap(0.6); check('voltar à primeira conversa mostra o histórico dela, não o da segunda', 'Sugiro' in pg.inner_text('#asst') and 'Resposta da conversa 2' not in pg.inner_text('#asst'))
        pg.on('dialog', lambda d: d.accept()); menu_open(); pg.click('.cw-dr-list li.on [data-act=asst-thread-del]'); until(lambda: calls[-1][0] == 'thread/delete'); nap(0.5); menu_open(); check('apagar uma conversa (com confirmação) tira ela do menu', pg.locator('.cw-dr-list li').count() == 1 and calls[-1][0] == 'thread/delete', (pg.locator('.cw-dr-list li').count(), calls[-3:]))
        menu_open(); pg.click('.cw-dr-list li.on [data-act=asst-thread-rename]'); pg.wait_for_selector('.cw-rename'); pg.fill('.cw-rename', 'Equipe de vídeo (teste)'); pg.keyboard.press('Enter'); until(lambda: calls[-1][0] == 'thread/rename'); nap(0.5)
        check('renomear: o lápis abre o campo, Enter grava e a aba mostra o novo nome', calls[-1] == ('thread/rename', {'id': S['thread'], 'title': 'Equipe de vídeo (teste)'}) and 'Equipe de vídeo (teste)' in pg.inner_text('.cw-dr-list li.on') and pg.locator('.cw-rename').count() == 0, calls[-1])
        menu_open(); pg.click('.cw-dr-list li.on [data-act=asst-thread-rename]'); pg.wait_for_selector('.cw-rename'); pg.keyboard.press('Escape'); nap(0.3); check('Esc cancela a troca de nome sem gravar', pg.locator('.cw-rename').count() == 0 and 'Equipe de vídeo (teste)' in pg.inner_text('.cw-dr-list li.on')); menu_close()
        # missão direta: mesma janela, mesma barra
        pg.select_option('#target', 'a:' + AG['id']); nap(0.6)
        check('trocar o destino muda a foto, o nome e o corpo para "missão direta" (sem abas de conversa)', 'Diretor' in pg.inner_text('#chat-head') and 'missão direta' in pg.inner_text('#chat-head') and 'Missão direta' in pg.inner_text('#asst') and pg.locator('.cw-menu-btn').count() == 0)
        pg.fill('#mission', 'Pesquise temas para o próximo vídeo'); pg.keyboard.press('Enter'); nap(1.5)
        tk = api('state')['runs']; check('a missão direta vira uma tarefa de verdade para o agente (mesma barra, mesmo servidor)', any(r['agent']['name'] == 'Diretor' and 'Pesquise temas' in r['prompt'] for r in tk), [r['prompt'] for r in tk])
        pg.select_option('#target', 'assistant'); nap(0.4); check('voltar ao Assistente restaura o menu de conversas', pg.locator('.cw-menu-btn').count() == 1 and 'Assistente' in pg.inner_text('#chat-head'))
        menu_open(); pg.click('[data-act=asst-reset]'); until(lambda: pg.locator('.as-msg').count() == 0); nap(0.3); check('Limpar conversa esvazia só a conversa atual e mantém a apresentação', pg.locator('.as-msg').count() == 0 and pg.is_visible('.as-empty'), (pg.locator('.as-msg').count(), pg.is_visible('.as-empty'), calls[-3:]))
        # lembra o estado
        pg.reload(); pg.wait_for_selector('#rail button', timeout=15000); nap(0.8); check('o chat lembra que estava aberto depois de recarregar', pg.is_visible('#chat') and not pg.is_visible('#chat-bubble'))
        pg.click('[data-act=chat-min]'); pg.reload(); pg.wait_for_selector('#rail button', timeout=15000); nap(0.8); check('e lembra que estava minimizado', pg.is_visible('#chat-bubble') and not pg.is_visible('#chat'))
        pg.click('.asst-btn'); nap(0.3); check('o botão Assistente do topo também abre e fecha a janela', pg.is_visible('#chat') and pg.get_attribute('.asst-btn', 'aria-pressed') == 'true'); pg.click('.asst-btn'); nap(0.3); check('...e fecha', not pg.is_visible('#chat'))
        errs = [e for e in errs if 'status of 400' not in e]; check('sem erro de console (desktop)', not errs, errs[:2]); ctx.close()
        # manual novo não bloqueia
        S = fresh(); S['briefed'] = True; S['stale'] = True; S['messages'] = [{'id': 'a2', 'role': 'assistant', 'text': 'Oi', 'at': '2026-11-07T10:00:05Z', 'actions': [act(0)]}]
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); pg.route('**/api/assistant**', handle); pg.goto(URL); pg.wait_for_selector('#chat-bubble:not([hidden])', timeout=15000)
        check('celular: começa só com o balão e a página sem rolagem lateral', pg.is_visible('#chat-bubble') and not pg.is_visible('#chat') and pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        pg.click('#chat-bubble'); nap(0.6)
        box = pg.evaluate("(() => { const r = document.getElementById('chat').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight, document.documentElement.scrollWidth]; })()")
        check('celular: a janela ocupa a largura toda, entre o topo e a barra de baixo (sem cobri-los), sem rolagem lateral', box[0] <= 1 and box[2] >= box[4] - 1 and 55 <= box[1] <= 65 and box[3] <= box[5] - 55 and box[3] >= box[5] - 70 and box[6] <= box[4], box)
        check('celular: manual novo só avisa e a conversa continua (barra e botão Enviar visíveis)', 'O manual mudou' in pg.inner_text('#asst') and pg.is_visible('#mission') and pg.is_visible('#send'))
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'chat-m.png')); ctx.close(); browser.close()
finally:
    srv.kill()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
