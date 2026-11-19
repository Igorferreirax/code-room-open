"""Gera as capturas de tela da landing a partir do app de verdade (servidor temporário com Codex falso: nenhuma IA real, nenhuma cota).
Monta um projeto de exemplo (documentário), quatro agentes, uma equipe, ligações, uma pasta de entrada em andamento e uma conversa do Assistente
simulada, e grava os PNG em ../Code Room Landing/assets/telas (ou no destino passado como argumento).
Uso: python scripts/capturas-landing.py [pasta-de-destino]"""
import json, os, sys, time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
from _servico import ROOT, Servico

DEST = sys.argv[1] if len(sys.argv) > 1 else os.path.normpath(os.path.join(ROOT, '..', 'Code Room Landing', 'assets', 'telas'))
with Servico(copiar_app=True, nome_projeto='Documentário', timeout_api=40,
             erro_http='status', env_extra=lambda s: {'CODE_ROOM_RELEASES_URL': s.base + '/x'}) as servico:
    api = servico.api
    key = servico.key
    proj = servico.proj
    P = api('projects', {'name': 'Documentário', 'path': proj.replace(chr(92), '/'), 'area': 'Vídeo'})
    mk = lambda n, r, m, c: api('agents', {'name': n, 'role': r, 'room': 'Vídeo', 'provider': 'codex', 'model': '', 'instructions': '', 'mode': m, 'skillIds': [], 'capabilities': c})
    dire, rot, mon, rev = mk('Diretor', 'Dirige o documentário', 'read', ['review']), mk('Roteirista', 'Escreve o roteiro', 'write', ['writing']), mk('Montador', 'Edita os vídeos', 'write', ['video.edit']), mk('Revisor', 'Confere a edição', 'read', ['review'])
    api('projects/members', {'projectId': P['id'], 'add': [dire['id'], rot['id'], mon['id'], rev['id']]})   # desde a 0.3.4 cada projeto mostra só os agentes ligados a ele
    api('teams', {'name': 'Equipe de Vídeo', 'members': [{'role': 'desenvolvedor', 'agentId': mon['id']}, {'role': 'revisor', 'agentId': rev['id']}]})
    api('links', {'projectId': P['id'], 'from': dire['id'], 'to': rot['id'], 'maxHops': 2}); api('links', {'projectId': P['id'], 'from': rot['id'], 'to': mon['id'], 'maxHops': 2})
    api('tasks', {'projectId': P['id'], 'agentId': rot['id'], 'requestId': 'c1', 'objective': 'Escrever o roteiro do episódio 3 com gancho nos primeiros segundos, três blocos e chamada final, seguindo o briefing do projeto. [[fake sleep=60000]]'})
    api('tasks', {'projectId': P['id'], 'agentId': mon['id'], 'requestId': 'c2', 'objective': 'Editar os cortes verticais do episódio 3 com legendas dinâmicas e salvar na pasta SAIDA mantendo o mesmo nome. [[fake sleep=60000]]'})
    api('routines', {'name': 'Pesquisar temas todo dia', 'projectId': P['id'], 'objective': 'Buscar temas em alta', 'trigger': {'type': 'time', 'freq': 'daily', 'time': '08:00'}, 'target': {'type': 'agent', 'id': dire['id']}})
    os.makedirs(os.path.join(proj, 'ENTRADA')); old = time.time() - 120
    for i in range(1, 7): f = os.path.join(proj, 'ENTRADA', f'corte{i}.mp4'); open(f, 'w').write('x'); os.utime(f, (old, old))
    api('folderjobs', {'name': 'Cortes verticais', 'projectId': P['id'], 'dir': 'ENTRADA', 'exts': 'mp4', 'agentId': mon['id'], 'instruction': 'Edite o vídeo {arquivo} com a skill de cortes verticais, adicione as legendas e salve o resultado em SAIDA mantendo o mesmo nome. [[fake sleep=60000]]', 'parallel': 1})
    time.sleep(4)
    ALERTS = []
    ASSIST = {'manual': {'available': True}, 'briefed': True, 'name': 'Nico', 'stale': False, 'provider': 'claude', 'connected': ['claude', 'codex'], 'error': None, 'pending': None, 'briefing': None, 'alerts': ALERTS, 'thread': 't1', 'threads': [{'id': 't1', 'title': 'Documentário', 'active': True, 'count': 2}, {'id': 't2', 'title': 'Revisão de legendas', 'active': False, 'count': 0}],
      'messages': [{'id': 'u1', 'role': 'user', 'text': 'Quero editar um documentário com cortes verticais. O que você sugere?', 'at': '2026-11-07T10:00:00Z'},
        {'id': 'a1', 'role': 'assistant', 'text': 'Sugiro uma equipe com **4 agentes** e uma pasta de entrada para os cortes:\n- Diretor, Roteirista, Montador e Revisor\n- cada vídeo da pasta vira uma tarefa, e eu aviso quando todos terminarem', 'at': '2026-11-07T10:00:06Z', 'actions': [
          {'idx': 0, 'type': 'criar_equipe', 'summary': 'Criar a equipe “Equipe de Vídeo”: desenvolvedor → Montador, revisor → Revisor', 'valid': True, 'status': 'pending'},
          {'idx': 1, 'type': 'criar_pasta_entrada', 'summary': 'Criar a pasta de entrada “Cortes verticais” (tipos mp4): cada arquivo vira uma tarefa. Gasta a cota da sua IA.', 'valid': True, 'status': 'pending'}]}]}
    URL = f'{servico.base}/#{key}'; os.makedirs(DEST, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel='chrome', headless=True)
        def page(w, h, mobile, mode='scene', chat=False):
            c = b.new_context(viewport={'width': w, 'height': h}, has_touch=mobile, is_mobile=mobile, device_scale_factor=1)
            c.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); localStorage.setItem('cr.prefs', JSON.stringify({mode:'%s', cvTerm:true, newLookSeen:'0.3.4'})); localStorage.setItem('cr.chat', JSON.stringify({open:%s})); } catch (e) {}" % (mode, 'true' if chat else 'false'))
            p = c.new_page(); p.route('**/api/assistant', lambda r: r.fulfill(status=200, headers={'Content-Type': 'application/json'}, body=json.dumps(ASSIST)))
            p.goto(URL); p.wait_for_selector('#rail button', timeout=15000); time.sleep(2.2); p.evaluate("document.querySelectorAll('.cb-dot').forEach(e => e.remove())"); return c, p
        c, p = page(1440, 900, False, 'scene', False); p.screenshot(path=os.path.join(DEST, 'desktop-home.png')); c.close()
        c, p = page(1440, 900, False, 'scene', True); p.evaluate("crGo('room')"); time.sleep(1.5); p.screenshot(path=os.path.join(DEST, 'desktop-room.png')); c.close()
        c, p = page(1440, 900, False, 'scene', False); p.evaluate("crGo('agents')"); time.sleep(0.6); p.click('[data-act=agents-tab][data-id=library]'); p.wait_for_selector('.lib-card', timeout=8000); time.sleep(0.8); p.screenshot(path=os.path.join(DEST, 'desktop-library.png')); c.close()
        c, p = page(1440, 900, False, 'canvas', False); p.evaluate("crGo('room')"); p.wait_for_selector('.cv-node', timeout=8000); time.sleep(1.5); p.click('[data-cv-zoom=fit]'); time.sleep(1.0); p.screenshot(path=os.path.join(DEST, 'desktop-canvas.png')); c.close()
        c, p = page(1440, 900, False, 'scene', False); p.evaluate("crGo('routines')"); p.wait_for_selector('.fj-card'); time.sleep(1.0); p.evaluate("document.querySelector('.fj-card').scrollIntoView({block:'center'})"); time.sleep(0.6); p.screenshot(path=os.path.join(DEST, 'desktop-routines.png')); c.close()
        ALERTS.append({'id': 'fail:1', 'level': 'bad', 'title': 'Montador não conseguiu terminar', 'text': 'x', 'ask': 'x'})
        c, p = page(390, 844, True, 'scene', False); p.evaluate("crGo('room')"); time.sleep(1.5); p.screenshot(path=os.path.join(DEST, 'celular-room.png')); c.close(); ALERTS.clear()
        c, p = page(390, 844, True, 'scene', False); p.evaluate("crGo('routines')"); p.wait_for_selector('.fj-card'); time.sleep(0.8); p.evaluate("document.querySelector('.fj-card').scrollIntoView(); window.scrollBy(0, -80)"); time.sleep(0.6); p.screenshot(path=os.path.join(DEST, 'celular-routines.png')); c.close()
        b.close()
    print('capturas gravadas em', DEST)
