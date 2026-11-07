"""Menu ao clicar em um agente (Sala e Canvas): "@ Mencionar no chat" põe @Nome na barra do chat; arrastar não abre o menu.
Também confere os botões novos do Acesso remoto e o comando /celular. Servidor temporário isolado; não chama nenhuma IA.
Uso: python scripts/ui_mention.py"""
import json, os, subprocess, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4796
data = tempfile.mkdtemp(prefix='cr-men-data-'); proj = tempfile.mkdtemp(prefix='cr-men-proj-')
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0

def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(name)
    print(('OK    ' if ok else 'FALHA ') + name + (' ' + str(extra) if extra and not ok else ''))

try:
    for _ in range(50):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        req = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(req))
    api('projects', {'name': 'projeto-ui', 'path': proj.replace(chr(92), '/'), 'area': 'Programação'})
    for n, caps in (('Pesquisador Chefe', ['research']), ('Roteirista', ['writing'])):
        api('agents', {'name': n, 'role': 'teste', 'room': 'Programação', 'provider': 'codex', 'model': '', 'instructions': '', 'mode': 'read', 'skillIds': [], 'capabilities': caps})
    def clear_chat(page):
        if page.is_visible('#chat'): page.click('[data-act=chat-min]'); page.wait_for_timeout(300)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        page = browser.new_context(viewport={'width': 1440, 'height': 900}).new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e))); page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{PORT}/?v=1#{key}'); page.wait_for_selector('#rail button', timeout=8000); page.wait_for_timeout(800)
        # ---- Canvas ----
        page.click('[data-nav=room]'); page.wait_for_timeout(500)
        page.click('[data-act=view-mode][data-id=canvas]'); page.wait_for_selector('.cv-node', timeout=8000); page.wait_for_timeout(500)
        node = page.locator('.cv-node', has_text='Pesquisador'); b = node.bounding_box()
        # arrastar não abre o menu
        page.mouse.move(b['x'] + 20, b['y'] + 20); page.mouse.down(); page.mouse.move(b['x'] + 90, b['y'] + 60, steps=8); page.mouse.up(); page.wait_for_timeout(400)
        check('canvas: arrastar o cartão não abre o menu', page.locator('#agent-menu').count() == 0)
        b = node.bounding_box(); page.mouse.click(b['x'] + 20, b['y'] + 20); page.wait_for_timeout(400)
        check('canvas: clicar sem arrastar abre o menu do agente', page.locator('#agent-menu').count() == 1 and 'Pesquisador Chefe' in page.inner_text('#agent-menu'))
        check('canvas: o menu tem Mencionar e Ver detalhes', page.locator('#agent-menu [data-act=mention-agent]').count() == 1 and page.locator('#agent-menu [data-act=agent]').count() == 1)
        page.click('#agent-menu [data-act=mention-agent]'); page.wait_for_timeout(600)
        v = page.input_value('#mission')
        check('canvas: @Nome vai para a barra do chat e o menu fecha', v == '@Pesquisador_Chefe ' and page.locator('#agent-menu').count() == 0, repr(v))
        check('canvas: o chat abriu com o cursor na barra', page.is_visible('#chat') and page.evaluate("document.activeElement && document.activeElement.id") == 'mission')
        page.fill('#mission', '@Pesquisador_Chefe traga 5 temas'); page.click('[data-act=mention-agent][data-id]') if False else None
        # menção repetida troca o nome em vez de empilhar
        other = [a for a in api('state')['agents'] if a['name'] == 'Roteirista'][0]
        clear_chat(page)
        nb = page.locator(f'.cv-node[data-agent="{other["id"]}"]').bounding_box(); page.mouse.click(nb['x'] + 20, nb['y'] + 20); page.wait_for_timeout(400)
        page.click('#agent-menu [data-act=mention-agent]'); page.wait_for_timeout(600)
        v = page.input_value('#mission')
        check('menção repetida troca o agente e mantém o texto', v == '@Roteirista traga 5 temas', repr(v))
        # Escape fecha o menu
        clear_chat(page)
        nb = page.locator(f'.cv-node[data-agent="{other["id"]}"]').bounding_box(); page.mouse.click(nb['x'] + 20, nb['y'] + 20); page.wait_for_timeout(300)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        check('Esc fecha o menu', page.locator('#agent-menu').count() == 0)
        # Ver detalhes abre a gaveta
        clear_chat(page)
        nb = page.locator(f'.cv-node[data-agent="{other["id"]}"]').bounding_box(); page.mouse.click(nb['x'] + 20, nb['y'] + 20); page.wait_for_timeout(300)
        page.click('#agent-menu [data-act=agent]'); page.wait_for_timeout(400)
        check('Ver detalhes abre a gaveta e fecha o menu', page.is_visible('#drawer') and page.locator('#agent-menu').count() == 0 and page.locator('#drawer [data-act=mention-agent]').count() == 1)
        page.click('#drawer [data-act=mention-agent]'); page.wait_for_timeout(500)
        check('gaveta: o botão Mencionar também põe @Nome no chat', page.input_value('#mission').startswith('@Roteirista '))
        # ---- Sala (escritório) ----
        page.click('[data-act=view-mode][data-id=office]') if page.locator('[data-act=view-mode][data-id=office]').count() else None
        page.wait_for_timeout(600)
        if page.locator('.ps-station').count():
            page.locator('.ps-station').first.click(); page.wait_for_timeout(400)
            check('sala: clicar em um agente abre o menu', page.locator('#agent-menu').count() == 1)
            page.keyboard.press('Escape')
        # ---- Acesso remoto: botões novos ----
        page.click('[data-nav=settings]'); page.wait_for_timeout(400); page.click('[data-act=settings-tab][data-id=acesso]'); page.wait_for_selector('#pref-net-lan', timeout=12000)
        check('acesso: botões Diagnosticar e Liberar no firewall', page.locator('[data-act=net-diagnose]').count() == 1 and page.locator('[data-act=net-firewall]').count() == 1)
        page.click('[data-act=net-diagnose]'); page.wait_for_selector('.diag-list', timeout=15000)
        check('acesso: o diagnóstico lista os itens', page.locator('.diag-list li').count() >= 1)
        # ---- Cartão do MCP ----
        page.on('dialog', lambda d: d.accept())
        check('mcp: o cartão aparece em Acesso com o botão Ativar', page.locator('#mcp-card [data-act=mcp-activate]').count() == 1)
        page.click('[data-act=mcp-activate]'); page.wait_for_selector('#mcp-card [data-act=mcp-deactivate]', timeout=8000)
        txt = page.inner_text('#mcp-card')
        check('mcp: depois de ativar mostra o comando do Claude Code e o modo somente leitura', 'claude mcp add code-room' in txt and 'somente leitura' in txt and '--escrever' not in txt)
        page.click('[data-act=mcp-write]'); page.wait_for_timeout(300); txt = page.inner_text('#mcp-card')
        check('mcp: permitir escrita troca o comando e avisa da cota', '--escrever' in txt and 'cota' in txt)
        check('mcp: o token não aparece na tela', len(__import__('re').findall(r'[0-9a-f]{64}', page.inner_text('#view'))) == 0)
        page.click('[data-act=mcp-write]'); page.wait_for_timeout(200)
        page.click('[data-act=mcp-deactivate]'); page.wait_for_selector('#mcp-card [data-act=mcp-activate]', timeout=8000)
        check('mcp: desativar volta para o botão Ativar', page.locator('#mcp-card [data-act=mcp-activate]').count() == 1)
        # ---- Limpeza de dados antigos (prévia, sem apagar) ----
        page.click('[data-act=settings-tab][data-id=execucao]'); page.wait_for_selector('[data-act=retention-preview]', timeout=8000)
        page.click('[data-act=retention-preview]')
        for _ in range(20):
            if 'Nada para limpar' in page.inner_text('#view') or 'seriam apagadas' in page.inner_text('#view'): break
            page.wait_for_timeout(300)
        check('retenção: a prévia diz o que seria apagado (ou que não há nada)', 'Nada para limpar' in page.inner_text('#view') or 'seriam apagadas' in page.inner_text('#view'))
        # ---- /celular no chat ----
        page.click('[data-nav=room]'); page.wait_for_timeout(500)
        if not page.is_visible('#chat'): page.click('#chat-bubble'); page.wait_for_timeout(400)
        reqs = []; page.on('request', lambda r: reqs.append((r.method, r.url.split('/api/')[-1])) if '/api/assistant' in r.url else None); page.on('response', lambda r: reqs.append(('RESP', r.url.split('/api/')[-1], r.status)) if '/api/assistant/ask' in r.url else None); page.on('requestfailed', lambda r: reqs.append(('FAIL', r.url.split('/api/')[-1], str(r.failure))))
        page.wait_for_timeout(1200); page.fill('#mission', '/celular'); page.wait_for_timeout(300); page.click('#chat [type=submit]') if page.locator('#chat [type=submit]').count() else page.keyboard.press('Enter'); 
        for _ in range(40):
            if 'Abrir o Code Room no celular' in page.inner_text('#chat'): break
            page.wait_for_timeout(500)
        page.fill('#mission', ''); page.focus('#mission'); page.keyboard.type('@Pes'); page.wait_for_timeout(400)
        check('chat: digitar @ lista os agentes', page.locator('#slash-pop [data-pick]').count() >= 1 and 'Pesquisador' in page.inner_text('#slash-pop'))
        page.keyboard.press('Escape'); page.fill('#mission', '')
        txt = page.inner_text('#chat'); srvm = api('assistant')['messages']; check('/celular responde com o passo a passo', 'Abrir o Code Room no celular' in txt, 'msgs no servidor=' + str(len(srvm)) + ' alvo=' + str(page.evaluate("document.getElementById('target') && document.getElementById('target').value")) + ' barra=' + repr(page.input_value('#mission')) + ' reqs=' + str(reqs[-5:]))
        check('sem erro de console', not errors, errors[:3])
        browser.close()
finally:
    srv.kill()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
raise SystemExit(1 if fails else 0)
