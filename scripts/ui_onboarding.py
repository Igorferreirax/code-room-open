"""Roteiro no navegador da triagem das IAs e do tutorial guiado (primeiro uso).
Sobe um serviço temporário VAZIO (instalação nova), simula o resultado da verificação dos CLIs (não chama nenhum provedor
de IA nem gasta cota) e percorre: triagem, criação dos agentes iniciais, tutorial inteiro, atalhos de teclado, pular,
reabrir pelo menu do usuário e o celular. Uso: python scripts/ui_onboarding.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4791
data = tempfile.mkdtemp(prefix='cr-onb-data-')
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0

def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (' ' + str(extra) if extra and not ok else ''))

# O que "o computador" responde: Codex conectado, Claude instalado sem login, Gemini ausente.
CHECKS = [
    {'id': 'codex', 'installed': True, 'path': 'x', 'version': 'codex-cli 0.0.0', 'authenticated': True, 'method': 'ChatGPT'},
    {'id': 'claude', 'installed': True, 'path': 'x', 'version': '0.0.0', 'authenticated': False, 'method': None},
    {'id': 'agy', 'installed': False, 'path': None, 'version': None, 'authenticated': None, 'method': None},
    {'id': 'hermes', 'installed': False, 'path': None, 'version': None, 'authenticated': None, 'method': None},
]

try:
    for _ in range(50):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        req = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(req))
    URL = f'http://127.0.0.1:{PORT}/#{key}'

    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)

        def new_page(size, mobile=False):
            ctx = browser.new_context(viewport=size, has_touch=mobile, is_mobile=mobile); pg = ctx.new_page(); errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route('**/api/connectors/check', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(CHECKS)))
            return ctx, pg, errs

        # ---------- desktop: instalação nova ----------
        ctx, pg, errs = new_page({'width': 1440, 'height': 900})
        pg.goto(URL); pg.wait_for_selector('.onb-card', timeout=10000); time.sleep(0.6)
        check('triagem abre sozinha na instalação nova (sem projetos nem agentes)', pg.locator('.onb-card #onb-title').inner_text() == 'Vamos conectar as suas IAs')
        rows = pg.locator('.onb-row').all_inner_texts()
        check('triagem: Codex aparece Conectado', 'Conectado' in rows[0] and 'Codex' in rows[0], rows[0])
        check('triagem: Claude mostra "falta entrar" e o comando de login', 'Instalado: falta entrar' in rows[1] and 'claude auth login' in rows[1], rows[1])
        check('triagem: Gemini mostra "não encontrado" e como instalar', 'Não encontrado' in rows[2] and 'site oficial' in rows[2], rows[2])
        check('triagem: botão Pular e Ver o tutorial presentes', pg.locator('[data-act=onb-skip]').count() == 1 and pg.locator('[data-act=onb-tour]').count() == 1)
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'onb-setup.png'))
        check('criar agentes: botão oferece 1 agente (só o Codex está conectado)', 'Criar agentes iniciais (1)' in pg.locator('[data-act=onb-create]').inner_text())
        pg.click('[data-act=onb-create]'); pg.wait_for_selector('.onb-note.ok', timeout=10000)
        agents = api('state')['agents']
        check('criar agentes: o servidor criou o Desenvolvedor (Codex, edita arquivos)', len(agents) == 1 and agents[0]['name'] == 'Desenvolvedor' and agents[0]['provider'] == 'codex' and agents[0]['mode'] == 'write', agents)
        check('criar agentes: botão some depois (não duplica)', pg.locator('[data-act=onb-create]').count() == 0)

        # tutorial inteiro
        pg.click('[data-act=onb-tour]'); pg.wait_for_selector('.tour', timeout=5000); time.sleep(0.4)
        TITLES = ['A Sala', 'Projetos', 'Tarefas', 'Equipes', 'Receitas', 'Agentes e ferramentas', 'Entregas', 'Skills', 'Consumo e limites', 'Rotinas', 'Conexões', 'Configurações']
        NAV = ['room', 'projects', 'tasks', 'teams', 'recipes', 'agents', 'deliveries', 'skills', 'usage', 'routines', 'connections', 'settings']
        seen_ok = True
        for i, (title, nav) in enumerate(zip(TITLES, NAV)):
            t = pg.locator('.tour h2').inner_text(); hl = pg.evaluate("[...document.querySelectorAll('.tour-hl')].map(e => e.dataset.nav)")
            cur = pg.evaluate("document.querySelector('#rail [aria-current=page]')?.dataset.nav")
            if not (t == title and hl == [nav] and cur == nav and f'passo {i + 1} de 12' in pg.locator('.tour').inner_text().lower()): seen_ok = False; print('   passo', i + 1, t, hl, cur)
            if i == 2:   # volta um passo e avança de novo
                pg.click('[data-act=onb-back]'); time.sleep(0.3); check('tutorial: Voltar leva ao passo anterior', pg.locator('.tour h2').inner_text() == 'Projetos')
                pg.click('[data-act=onb-next]'); time.sleep(0.3)
            if i == 5:   # setas do teclado
                pg.keyboard.press('ArrowRight'); time.sleep(0.3); check('tutorial: seta direita avança', pg.locator('.tour h2').inner_text() == 'Entregas')
                pg.keyboard.press('ArrowLeft'); time.sleep(0.3); check('tutorial: seta esquerda volta', pg.locator('.tour h2').inner_text() == 'Agentes e ferramentas')
            if i < 11: pg.click('[data-act=onb-next]'); time.sleep(0.35)
        check('tutorial: 12 passos, cada um abre a tela e destaca o botão certo do menu', seen_ok)
        check('tutorial: o último passo oferece Concluir', pg.locator('[data-act=onb-next]').inner_text() == 'Concluir')
        pg.click('[data-act=onb-next]'); time.sleep(0.4)
        flags = pg.evaluate("JSON.parse(localStorage.getItem('cr.onb') || '{}')")
        check('tutorial: Concluir fecha tudo e grava que já foi feito', pg.locator('.tour').count() == 0 and pg.locator('.onb-card').count() == 0 and flags.get('setupDone') and flags.get('tourDone'), flags)
        check('tutorial: nenhum destaque sobra na tela', pg.locator('.tour-hl').count() == 0)
        pg.reload(); time.sleep(1.5)
        check('depois de concluído, não abre de novo ao recarregar', pg.locator('.onb-card').count() == 0 and pg.locator('.tour').count() == 0)

        # reabrir pelo menu do usuário e pular com Esc
        pg.click('[data-act=who]'); pg.click('[data-act=onb-open]'); pg.wait_for_selector('.onb-card', timeout=5000)
        check('menu do usuário › Guia de boas-vindas reabre a triagem', pg.locator('#onb-title').inner_text() == 'Vamos conectar as suas IAs')
        pg.keyboard.press('Escape'); time.sleep(0.4)
        check('Esc pula a triagem', pg.locator('.onb-card').count() == 0)
        check('sem erro de console no fluxo completo (desktop)', not errs, errs[:2])
        ctx.close()

        # ---------- pular desde o início ----------
        ctx, pg, errs = new_page({'width': 1440, 'height': 900})
        pg.add_init_script("localStorage.removeItem('cr.onb')")
        pg.goto(URL); time.sleep(1.2)
        pg.click('[data-act=who]'); pg.click('[data-act=onb-open]'); pg.wait_for_selector('.onb-card', timeout=5000)
        pg.click('[data-act=onb-skip]'); time.sleep(0.4)
        check('Pular: fecha e grava que não precisa mostrar de novo', pg.locator('.onb-card').count() == 0 and pg.evaluate("JSON.parse(localStorage.getItem('cr.onb') || '{}').tourDone") is True)
        ctx.close()

        # ---------- celular ----------
        ctx, pg, errs = new_page({'width': 390, 'height': 844}, True)
        pg.goto(URL); time.sleep(1.2)
        pg.click('[data-act=who]'); pg.click('[data-act=onb-open]'); pg.wait_for_selector('.onb-card', timeout=5000); time.sleep(0.5)
        check('celular: triagem sem rolagem lateral', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        box = pg.locator('.onb-card').bounding_box(); check('celular: a janela cabe na tela', box['x'] >= 0 and box['x'] + box['width'] <= 391, box)
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'onb-setup-m.png'))
        pg.click('[data-act=onb-tour]'); pg.wait_for_selector('.tour', timeout=5000); time.sleep(0.4)
        tb = pg.locator('.tour').bounding_box(); check('celular: cartão do tutorial cabe e fica acima do campo de missão', tb['x'] >= 0 and tb['x'] + tb['width'] <= 391 and tb['y'] + tb['height'] <= 844, tb)
        check('celular: o botão do passo continua destacado e visível', pg.evaluate("(() => { const e = document.querySelector('.tour-hl'); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()"))
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'onb-tour-m.png'))
        check('celular: tutorial sem rolagem lateral', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        pg.click('[data-act=onb-skip]'); time.sleep(0.3)
        check('celular: pular funciona', pg.locator('.tour').count() == 0)
        check('sem erro de console (celular)', not errs, errs[:2])
        ctx.close(); browser.close()
finally:
    srv.kill()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
