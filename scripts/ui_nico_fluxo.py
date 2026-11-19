"""Roteiro do envio ao Nico sem travar a tela. Simula as respostas da rota /api/assistant (nenhuma IA é chamada) e confere:
a mensagem aparece na hora do Enter com "Enviando…" (antes do servidor aceitar); falha deixa o texto na bolha com
"Tentar de novo"; enquanto o Nico responde, o campo aceita rascunho, o Enviar fica desligado e há "Cancelar resposta";
o andamento mostra fila com o motivo, IA iniciando, aprovação e o texto parcial; trocar de fase não recria a conversa
(só a bolha de andamento muda) e não apaga o rascunho nem tira o foco.
Uso: python scripts/ui_nico_fluxo.py"""
import json, sys, time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
from _servico import Servico

fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' and not ok else ''))

S = {'manual': {'available': True, 'hash': 'abc'}, 'briefed': True, 'stale': False, 'briefedAt': '2026-11-18T10:00:00Z', 'knowledge': 'ok', 'provider': 'claude', 'connected': ['claude'],
     'autonomy': 'ask', 'messages': [{'id': 'm0', 'role': 'assistant', 'text': 'Oi! Em que posso ajudar?', 'at': '2026-11-18T10:00:01Z', 'actions': []}], 'error': None, 'pending': None, 'briefing': None,
     'thread': 't1', 'threads': [{'id': 't1', 'title': 'Conversa 1', 'active': True, 'count': 1}], 'alerts': []}
held = []; mode = {'ask': 'hold'}
def now_iso(): return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()) + 'Z'

with Servico(falsos=['claude.exe']) as servico:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
        ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true,helloSeen:true})); } catch (e) {}")
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 4' not in m.text and 'status of 5' not in m.text else None)
        def route(r):
            req = r.request; path = req.url.split('/api/')[1].split('?')[0]
            if path == 'assistant' and req.method == 'GET': return r.fulfill(status=200, content_type='application/json', body=json.dumps(S))
            if path == 'assistant/ask':
                if mode['ask'] == 'hold': held.append(r); return   # o servidor "demora": a resposta sai quando o roteiro quiser
                if mode['ask'] == 'fail': return r.fulfill(status=400, content_type='application/json', body=json.dumps({'error': 'IA desconectada'}))
                body = json.loads(req.post_data or '{}')
                S['messages'] = S['messages'] + [{'id': 'u' + str(len(S['messages'])), 'role': 'user', 'text': body.get('text', ''), 'at': now_iso()}]
                S['pending'] = {'kind': 'ask', 'status': 'queued', 'since': now_iso(), 'phase': 'queued', 'waitReason': 'O Nico ainda está terminando a resposta anterior.', 'timing': {}}
                return r.fulfill(status=200, content_type='application/json', body=json.dumps(S))
            if path == 'assistant/cancel':
                S['pending'] = None; return r.fulfill(status=200, content_type='application/json', body=json.dumps(S))
            return r.continue_()
        pg.route('**/api/assistant**', route)
        pg.goto(f'{servico.base}/#{servico.key}'); pg.wait_for_selector('.top-right', timeout=15000); pg.wait_for_timeout(1500)
        pg.click('#chat-bubble'); pg.wait_for_selector('#mission', state='visible'); pg.wait_for_timeout(400)
        if pg.input_value('#target') != 'assistant': pg.select_option('#target', 'assistant'); pg.wait_for_timeout(300)

        # 1) Enter: aparece na hora, antes do servidor aceitar
        pg.fill('#mission', 'Monte uma equipe de vídeo'); t0 = time.time(); pg.keyboard.press('Enter')
        pg.wait_for_selector('.as-out.sending', timeout=3000); dt = time.time() - t0
        check('Enter: a mensagem aparece na hora com “Enviando…” (antes do servidor responder)', dt < 1.0 and 'Enviando' in pg.inner_text('.as-out.sending') and len(held) == 1, round(dt, 2))
        check('a barra esvazia ao enviar (o texto está na bolha)', pg.input_value('#mission') == '')
        # o servidor aceita: a bolha "a caminho" some e a mensagem fica na conversa
        mode['ask'] = 'ok'; r = held.pop(); body = json.loads(r.request.post_data or '{}')
        S['messages'] = S['messages'] + [{'id': 'u1', 'role': 'user', 'text': body['text'], 'at': now_iso()}]
        S['pending'] = {'kind': 'ask', 'status': 'queued', 'since': now_iso(), 'phase': 'queued', 'waitReason': 'Limite de 1 tarefa(s) ao mesmo tempo: esperando “Render” (Editor) terminar.', 'timing': {}}
        r.fulfill(status=200, content_type='application/json', body=json.dumps(S)); pg.wait_for_timeout(500)
        check('aceita: some o “Enviando…” e a mensagem fica na conversa', pg.locator('.as-out').count() == 0 and 'Monte uma equipe de vídeo' in pg.inner_text('#asst-log'))
        check('andamento: “Na fila” com o motivo real', 'Na fila' in pg.inner_text('#asst-wait-slot') and 'esperando “Render”' in pg.inner_text('#asst-wait-slot'), pg.inner_text('#asst-wait-slot')[:200])
        check('há “Cancelar resposta” e o Enviar fica desligado', pg.locator('#asst-wait-slot [data-act=asst-cancel]').inner_text().strip() == 'Cancelar resposta' and pg.eval_on_selector('#send', 'b => b.disabled') is True, (pg.locator('#asst-wait-slot [data-act=asst-cancel]').count(), pg.eval_on_selector('#send', 'b => [b.disabled, b.className]')))

        # 2) rascunho enquanto responde: o campo aceita texto, foco e texto continuam com as atualizações
        pg.click('#mission'); pg.keyboard.type('rascunho da próxima')
        pg.evaluate("document.getElementById('asst-log').dataset.marca = '1'")
        for ph, extra in [('starting', {}), ('approval', {}), ('responding', {'partial': 'Primeira parte da resposta…', 'timing': {'cliStartMs': 2100, 'firstChunkMs': 5300}})]:
            S['pending'] = {**S['pending'], 'phase': ph, 'status': 'running', 'waitReason': '', **extra}
            pg.wait_for_timeout(1900)   # a tela relê o estado a cada 1,5 s enquanto há resposta pendente
            txt = pg.inner_text('#asst-wait-slot')
            want = {'starting': 'Iniciando a IA', 'approval': 'Aguardando sua aprovação', 'responding': 'Respondendo'}[ph]
            check(f'andamento: fase “{want}” aparece', want in txt, txt[:160])
        check('respondendo: o texto parcial aparece conforme chega, com os tempos', 'Primeira parte da resposta' in pg.inner_text('#asst-wait-slot') and 'IA iniciou em 2,1 s' in pg.inner_text('#asst-wait-slot'))
        check('trocar de fase só atualiza a bolha de andamento (a conversa não é recriada)', pg.evaluate("document.getElementById('asst-log')?.dataset.marca") == '1', pg.evaluate("[!!document.getElementById('asst-log'), document.getElementById('asst-log')?.dataset.marca]"))
        check('o rascunho continua na barra e com o foco', pg.input_value('#mission') == 'rascunho da próxima' and pg.evaluate("document.activeElement?.id") == 'mission')
        pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        check('Enter durante a resposta não envia nem apaga o rascunho', pg.input_value('#mission') == 'rascunho da próxima' and pg.locator('.as-out').count() == 0)

        # 3) cancelar a resposta libera o envio
        pg.click('#asst-wait-slot [data-act=asst-cancel]'); pg.wait_for_timeout(500)
        check('Cancelar resposta: some o andamento e o Enviar volta', pg.locator('#asst-wait-slot .as-wait').count() == 0 and pg.eval_on_selector('#send', 'b => b.disabled') is False)

        # 4) falha: o texto fica na bolha com “Tentar de novo” e “Voltar para a barra”
        mode['ask'] = 'fail'; pg.fill('#mission', 'Pergunta que vai falhar'); pg.keyboard.press('Enter')
        pg.wait_for_selector('.as-out.failed', timeout=4000)
        check('falha: a bolha mostra o motivo e “Tentar de novo”', 'IA desconectada' in pg.inner_text('.as-out.failed') and pg.locator('.as-out.failed [data-act=asst-out-retry]').count() == 1)
        mode['ask'] = 'ok'; pg.click('.as-out.failed [data-act=asst-out-retry]'); pg.wait_for_timeout(700)
        check('Tentar de novo envia o mesmo texto', pg.locator('.as-out').count() == 0 and 'Pergunta que vai falhar' in pg.inner_text('#asst-log'))
        S['pending'] = None; pg.wait_for_timeout(1700)
        mode['ask'] = 'fail'; pg.fill('#mission', 'Texto para editar'); pg.keyboard.press('Enter'); pg.wait_for_selector('.as-out.failed', timeout=4000)
        pg.click('.as-out.failed [data-act=asst-out-edit]'); pg.wait_for_timeout(300)
        check('Voltar para a barra devolve o texto para editar', pg.input_value('#mission').startswith('Texto para editar') and pg.locator('.as-out').count() == 0)
        check('sem erro de console', not errs, errs[:3])
        browser.close()

print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
