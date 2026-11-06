"""Roteiro no navegador do Canvas "ao vivo": quem trabalha fica verde, quem espera fica âmbar, quem falhou fica vermelho,
e o trabalho viaja pela linha de um agente ao outro. Não chama nenhuma IA: a resposta de /api/state é adulterada no navegador
para simular as tarefas. Uso: python scripts/ui_canvas_live.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4786
data = tempfile.mkdtemp(prefix='cr-cv-'); proj_dir = tempfile.mkdtemp(prefix='cr-cv-proj-')
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=dict(os.environ, CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' and not ok else ''))
try:
    for _ in range(50):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        r = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(r))
    P = api('projects', {'name': 'Canal', 'path': proj_dir.replace('\\', '/'), 'area': 'Programação'})
    mk = lambda n, prov, mode: api('agents', {'name': n, 'role': 'teste', 'room': 'Programação', 'provider': prov, 'model': '', 'instructions': '', 'mode': mode, 'skillIds': [], 'capabilities': []})
    A, B, C = mk('Claude', 'claude', 'read'), mk('Codex', 'codex', 'write'), mk('Gemini', 'agy', 'read')
    api('links', {'projectId': P['id'], 'from': A['id'], 'to': B['id'], 'maxHops': 3})                          # Claude -> Codex (ligação)
    api('teams', {'name': 'Equipe', 'members': [{'role': 'desenvolvedor', 'agentId': B['id']}, {'role': 'revisor', 'agentId': C['id']}]})   # Codex -> Gemini (fluxo da equipe)

    def run(id, agent, status, link=None, dep=None):
        return {'id': id, 'kind': 'work', 'status': status, 'agent': {'id': agent['id'], 'name': agent['name']}, 'project': {'id': P['id'], 'name': 'Canal'}, 'prompt': 'tarefa de teste', 'hops': 0,
                'linkFrom': link, 'dependsOn': dep or [], 'createdAt': '2026-11-07T10:00:00Z', 'updatedAt': '2026-11-07T10:00:05Z', 'usage': {}, 'deliverables': {'files': []}}
    SCEN = {
        '1 Claude trabalhando, Codex ainda não recebeu': [run('r1', A, 'running')],
        '2 Claude entregou, Codex recebeu e trabalha': [run('r1', A, 'completed'), run('r2', B, 'running', link='r1')],
        '3 Codex terminou, Gemini (equipe) revisa': [run('r2', B, 'completed'), run('r3', C, 'running', dep=['r2'])],
        '4 Codex falhou': [run('r1', A, 'completed'), run('r2', B, 'failed', link='r1')],
        '5 Gemini na fila esperando o Codex': [run('r2', B, 'running'), run('r3', C, 'waiting_dependency', dep=['r2'])],
        '6 todos parados': [],
    }
    cur = {'runs': []}
    def handle(route):
        r = route.fetch(); j = r.json(); j['runs'] = cur['runs']; route.fulfill(status=r.status, headers={'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, body=json.dumps(j))

    URL = f'http://127.0.0.1:{PORT}/#{key}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script("try { if (!localStorage.getItem('cr.prefs')) localStorage.setItem('cr.prefs', JSON.stringify({mode: 'canvas', motion: 'on'})); localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('**/api/state', handle)
        def show(name):
            cur['runs'] = SCEN[name]; pg.goto('about:blank'); pg.goto(URL)
            try: pg.wait_for_selector('.cv-node', timeout=15000)
            except Exception: print('   DEBUG erros:', errs[:3], '| texto:', pg.inner_text('body')[-260:].replace(chr(10), ' | ')); raise
            time.sleep(0.8)
            node = lambda n: pg.evaluate("(n) => { const e = [...document.querySelectorAll('.cv-node')].find(x => x.querySelector('b').textContent === n); const cs = getComputedStyle(e); return { cls: e.className, border: cs.borderTopColor, style: cs.borderTopStyle, typing: !!e.querySelector('.cv-typing'), zzz: !!e.querySelector('.cv-zzz') }; }", n)
            live = pg.evaluate("[...document.querySelectorAll('.cv-edge.live')].map(g => [g.dataset.from, g.dataset.to])"); pulses = pg.locator('.cv-edge.live .cv-pulse').count()
            return node('Claude'), node('Codex'), node('Gemini'), live, pulses
        GREEN = 'rgb(95, 227, 176)'; AMBER = 'rgb(245, 183, 59)'; RED = 'rgb(239, 91, 91)'
        a, b, c, live, pulses = show('1 Claude trabalhando, Codex ainda não recebeu')
        check('1: Claude trabalhando fica VERDE e mostra "digitando"', 'st-running' in a['cls'] and a['border'] == GREEN and a['typing'], a)
        check('1: Codex e Gemini parados mostram o zZ, sem verde', b['zzz'] and c['zzz'] and b['border'] != GREEN and c['border'] != GREEN); check('1: nenhuma linha anda ainda', not live)
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'cv-1.png'))
        a, b, c, live, pulses = show('2 Claude entregou, Codex recebeu e trabalha')
        check('2: Codex recebeu o trabalho e fica VERDE', 'st-running' in b['cls'] and b['border'] == GREEN and b['typing'], b); check('2: Claude, que já entregou, deixa de ser verde (fica concluído ou parado)', a['border'] != GREEN and ('st-done' in a['cls'] or a['zzz']), a)
        check('2: a linha Claude -> Codex anda, com bolinhas viajando', live == [[A['id'], B['id']]] and pulses == 2, (live, pulses)); pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'cv-2.png'))
        a, b, c, live, pulses = show('3 Codex terminou, Gemini (equipe) revisa')
        check('3: fluxo de EQUIPE também anda (Codex -> Gemini) e o Gemini fica verde', live == [[B['id'], C['id']]] and 'st-running' in c['cls'] and c['border'] == GREEN and pulses == 2, (live, pulses, c['cls']))
        a, b, c, live, pulses = show('4 Codex falhou')
        check('4: quem falhou fica VERMELHO e nenhuma linha anda', 'st-failed' in b['cls'] and b['border'] == RED and not live, (b, live))
        a, b, c, live, pulses = show('5 Gemini na fila esperando o Codex')
        check('5: quem espera a vez fica ÂMBAR tracejado, quem trabalha fica verde', 'st-waiting' in c['cls'] and c['border'] == AMBER and c['style'] == 'dashed' and b['border'] == GREEN, (c, b['border']))
        check('5: a linha ainda não anda (o Gemini só recebe quando o Codex terminar)', not [l for l in live if l[1] == C['id']], live)
        a, b, c, live, pulses = show('6 todos parados')
        check('6: sem tarefas: todos com zZ, nenhum verde, nenhuma linha andando', a['zzz'] and b['zzz'] and c['zzz'] and not live and pg.locator('.cv-node.st-running').count() == 0)
        check('legenda explica as cores', all(t in pg.inner_text('.cv-legend') for t in ('trabalhando', 'esperando a vez', 'parado', 'falhou', 'linha verde')))
        # movimento desligado: sem animação, mas o verde e a linha continuam
        cur['runs'] = SCEN['2 Claude entregou, Codex recebeu e trabalha']; pg.evaluate("localStorage.setItem('cr.prefs', JSON.stringify({mode: 'canvas', anim: false}))"); pg.goto('about:blank'); pg.goto(URL); pg.wait_for_selector('.cv-node'); time.sleep(0.8)
        anim = pg.evaluate("[getComputedStyle([...document.querySelectorAll('.cv-node.st-running')][0]).animationName, getComputedStyle(document.querySelector('.cv-pulse')).display]")
        check('movimento desligado: continua verde, mas sem animação e sem bolinhas', anim[0] == 'none' and anim[1] == 'none' and pg.locator('.cv-node.st-running').count() == 1, anim)
        check('sem erro de console (desktop)', not errs, errs[:2]); pg.unroute_all(behavior='ignoreErrors'); ctx.close()
        # celular
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); ctx.add_init_script("try { if (!localStorage.getItem('cr.prefs')) localStorage.setItem('cr.prefs', JSON.stringify({mode: 'canvas', motion: 'on'})); localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
        pg = ctx.new_page(); cur['runs'] = SCEN['2 Claude entregou, Codex recebeu e trabalha']; pg.route('**/api/state', handle); pg.goto(URL); pg.wait_for_selector('.cv-node', timeout=15000); time.sleep(0.8)
        check('celular: verde e linha ativa aparecem', pg.locator('.cv-node.st-running').count() == 1 and pg.locator('.cv-edge.live').count() == 1)
        check('celular: sem rolagem lateral na página', pg.evaluate('document.documentElement.scrollWidth <= innerWidth')); pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'cv-m.png')); pg.unroute_all(behavior='ignoreErrors'); ctx.close(); browser.close()
finally:
    srv.kill()
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
