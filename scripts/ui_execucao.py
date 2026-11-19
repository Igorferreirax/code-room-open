"""Roteiro no navegador do que faz o Code Room EXECUTAR: voz em qualquer programa (atalho global, animação neural,
texto devolvido para a bandeja colar), menu Terminal, cartão de aprovação durante a execução e a opção "irrestrito"
do agente. Sobe um serviço temporário; nenhuma IA é chamada e nenhum terminal é aberto (a rota do terminal é simulada).
O microfone é o de teste do Chrome e o reconhecimento de fala é simulado (devolve uma frase fixa).
Uso: python scripts/ui_execucao.py"""
import json, os, sys, time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
from _servico import Servico

fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' and not ok else ''))

# Reconhecimento de fala simulado: ao começar, devolve um trecho parcial e depois o final.
FAKE_SR = """
class FakeSR { constructor(){ this.lang=''; this.continuous=false; this.interimResults=false; }
  start(){ window.__srStarts=(window.__srStarts||0)+1; const me=this; setTimeout(()=>me.onresult&&me.onresult({results:[Object.assign([{transcript:'olá nico'}],{isFinal:false})]}),150);
           setTimeout(()=>me.onresult&&me.onresult({results:[Object.assign([{transcript:'olá nico abre o projeto vírgula por favor'}],{isFinal:true})]}),400); }
  stop(){ setTimeout(()=>this.onend&&this.onend(),50); } abort(){ this.stop(); } }
window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}
"""

with Servico(falsos=()) as servico:
    api = servico.api
    key = servico.key
    proj = servico.proj
    P = api('projects', {'path': proj, 'name': 'Projeto Exec', 'area': 'Geral'})
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script(FAKE_SR); ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true,helloSeen:true})); } catch (e) {}")   # 0.4.0: sem isso o bem-vindo do Nico cobre os botões
        pg = ctx.new_page(); errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'{servico.base}/#{key}'); pg.wait_for_selector('.top-right', timeout=15000); pg.wait_for_timeout(3500)   # espera o canal de eventos da tela conectar

        # --- voz em qualquer programa: o que a bandeja faz (liga, desliga, busca o texto) ---
        r = api('voice/global', {'action': 'toggle'}); check('atalho (1º toque): começa a ouvir e devolve um id', r.get('listening') is True and len(r.get('id', '')) == 36, r)
        ok = pg.wait_for_selector('#nico-voice-overlay canvas', timeout=6000) is not None
        check('a tela mostra o Nico ouvindo com a animação neural (sem trazer o Code Room para a frente)', ok)
        pg.wait_for_timeout(1200)
        lvl = pg.evaluate("Number(document.querySelector('#nico-voice-overlay canvas')?.dataset.level || -1)")
        check('a animação reage ao som do microfone (nível medido)', lvl >= 0, lvl)
        if os.environ.get('CR_SHOTS'): pg.locator('#nico-voice-overlay').screenshot(path=os.path.join(os.environ['CR_SHOTS'], 'voz-neural.png'))
        check('o texto aparece organizado enquanto ouve', 'Olá nico abre o projeto, por favor' in pg.inner_text('#nico-voice-overlay') or 'abre o projeto' in pg.inner_text('#nico-voice-overlay'), pg.inner_text('#nico-voice-overlay'))
        s = api('voice/global', {'action': 'toggle'}); check('atalho (2º toque): para de ouvir', s.get('listening') is False and s.get('id') == r['id'], s)
        res = {}
        for _ in range(30):
            res = api(f"voice/result?id={r['id']}")
            if res.get('ready'): break
            time.sleep(0.2)
        check('o texto final chega para a bandeja colar (organizado, com pontuação)', res.get('ready') and res.get('text', '').startswith('Olá nico abre o projeto, por favor'), res)
        pg.wait_for_timeout(1800); check('a janela de escuta some depois de entregar', pg.locator('#nico-voice-overlay').count() == 0)
        check('sem pedido aberto, o resultado responde "ainda não"', api('voice/result?id=00000000-0000-0000-0000-000000000000').get('ready') is False)

        # --- terminal DENTRO do Code Room (pseudo-console de verdade + xterm.js) ---
        pg.click('[data-act=term-menu]')
        try: ok = pg.wait_for_selector('#term-dock:not([hidden]) .xterm', timeout=30000) is not None
        except Exception:
            print('[diag] painel do terminal:', pg.evaluate("(() => { const d = document.querySelector('#term-dock'); return d ? { hidden: d.hidden, abas: d.querySelectorAll('.td-tab').length, texto: d.innerText.slice(0, 300) } : 'sem #term-dock' })()"), '| aviso:', pg.evaluate("document.querySelector('#notice')?.textContent || ''"), '| erros:', errs[:4], '| sobreposto:', pg.evaluate("(() => { const b = document.querySelector('[data-act=term-menu]'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e ? (e.id || e.className || e.tagName) : null })()"))
            raise
        check('Terminal: o botão abre o painel dentro do Code Room com um PowerShell', ok and 'PowerShell' in pg.inner_text('.td-tabs'))
        pg.wait_for_timeout(2500); pg.click('#term-dock .td-term:not([hidden]) .xterm'); pg.keyboard.type('Write-Output "cr-$((40+2))-ação"'); pg.keyboard.press('Enter')
        ok = False
        for _ in range(40):
            if 'cr-42-ação' in pg.inner_text('#term-dock .xterm-rows'): ok = True; break
            pg.wait_for_timeout(250)
        check('Terminal: o que você digita roda no PowerShell e a resposta aparece (com acento)', ok, pg.inner_text('#term-dock .xterm-rows')[-300:])
        if os.environ.get('CR_SHOTS'): pg.screenshot(path=os.path.join(os.environ['CR_SHOTS'], 'terminal-dentro.png'))
        check('Terminal: o servidor lista a sessão aberta', len(api('term')['items']) == 1)
        pg.click('[data-td=menu]'); pg.wait_for_selector('.td-menu')
        items = pg.locator('.td-menu .term-item').all_inner_texts()
        check('Terminal: "+ Novo terminal" oferece o shell puro, as CLIs e a opção de abrir fora', any('PowerShell' in x for x in items) and any('fora' in x for x in items) and pg.locator('#td-free').count() == 1, items)
        pg.click('[data-td=menu]')
        pg.click('.td-tab.on .td-x'); pg.wait_for_timeout(1500)
        check('Terminal: fechar a aba encerra a sessão e esconde o painel', len(api('term')['items']) == 0 and pg.locator('#term-dock[hidden]').count() == 1)

        # --- cartão de aprovação (o pedido entra como a ferramenta de aprovação faria) ---
        tok = None
        # A chave de aprovação não sai do servidor; o cartão é testado pela rota da tela, com um pedido simulado.
        pend = {'items': [{'id': '11111111-1111-1111-1111-111111111111', 'taskId': 't', 'title': 'Rodar um comando', 'detail': 'npm install', 'kind': 'comando', 'tool': 'PowerShell', 'agent': 'Executor', 'project': 'Projeto Exec', 'assistant': False, 'at': '2026-11-18T12:00:00Z', 'status': 'pending'}]}
        decided = []
        def appr(route):
            if route.request.method == 'POST': decided.append(route.request.url.rsplit('/', 1)[-1]); pend['items'] = []; return route.fulfill(status=200, content_type='application/json', body='{}')
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(pend))
        pg.route('**/api/approvals**', appr)
        ok = pg.wait_for_selector('.run-appr', timeout=6000) is not None
        check('aprovação: o cartão aparece em qualquer tela com o que o agente quer fazer', ok and 'npm install' in pg.inner_text('.run-appr') and 'Executor' in pg.inner_text('.run-appr'))
        pg.click('.run-appr [data-appr=always]'); pg.wait_for_timeout(800)
        check('aprovação: "Permitir sempre nesta tarefa" responde e o cartão some', decided == ['always'] and pg.locator('.run-appr').count() == 0, decided)

        # --- opção irrestrito no agente ---
        check('agente: o formulário tem a opção de modo irrestrito', pg.locator('input[name=unrestricted]').count() == 1)
        check('sem erro de console', not [e for e in errs if 'favicon' not in e], errs[:3])
        browser.close()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
