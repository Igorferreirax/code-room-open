"""Roteiro de interface no Chromium instalado pelo Playwright do Python.
Sobe um serviço temporário com dados e pastas isolados, percorre as 11 telas em desktop e celular e confere:
sem erro de console, sem imagem quebrada, sem rolagem horizontal, painéis, gaveta por teclado, temas e formulário de preços.
Não chama nenhum provedor (não gasta cota). Uso: python scripts/ui_smoke.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, shutil
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4790
data = tempfile.mkdtemp(prefix='cr-ui-data-'); proj = tempfile.mkdtemp(prefix='cr-ui-proj-')
# O CI não tem Codex instalado. O executável falso só habilita a criação da
# tarefa de fixture; a pasta apagada faz a execução falhar antes de chamar IA.
bindir = os.path.join(data, 'bin'); os.makedirs(bindir)
shutil.copy(shutil.which('node'), os.path.join(bindir, 'codex.exe'))
env = dict(os.environ, PATH=bindir + os.pathsep + os.environ['PATH'], CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT))
srv = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'main.mjs')], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0

def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (' ' + str(extra) if extra and not ok else ''))

try:
    for _ in range(50):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        req = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(req))
    api('skills/library/install', {'id': 'planejar-entrega'})  # fixa o autocomplete sem depender das skills pessoais do computador de teste
    p = api('projects', {'name': 'projeto-ui', 'path': proj.replace('\\', '/'), 'area': 'Programação'})
    fixture_skills = api(f"skills?project={p['id']}")
    check('fixture: skill inicial instalada aparece reconhecida no projeto', any(s['name'] == 'planejar-entrega' and s.get('recognized') for s in fixture_skills), [s['name'] for s in fixture_skills])
    ag = lambda n, prov, mode, caps: api('agents', {'name': n, 'role': 'teste', 'room': 'Programação', 'provider': prov, 'model': '', 'instructions': '', 'mode': mode, 'skillIds': [], 'capabilities': caps})
    a1, a2, a3, a4 = ag('Ana', 'codex', 'write', ['code']), ag('Beto', 'claude', 'read', ['review']), ag('Caio', 'codex', 'read', []), ag('Duda', 'claude', 'read', ['supervise'])
    outsider = ag('Eli', 'codex', 'read', [])
    api('teams', {'name': 'Equipe UI', 'members': [{'role': 'desenvolvedor', 'agentId': a1['id']}, {'role': 'revisor', 'agentId': a2['id']}]})
    long_team = api('teams', {'name': 'Equipe de produção e revisão com nome propositalmente longo', 'members': [{'role': 'desenvolvedor', 'agentId': a1['id']}, {'role': 'revisor', 'agentId': a2['id']}, {'role': 'editor', 'agentId': a3['id']}, {'role': 'pesquisador', 'agentId': a4['id']}]})
    api('teams', {'name': 'Equipe de outro projeto', 'members': [{'role': 'pesquisador', 'agentId': outsider['id']}]})
    api('projects/members', {'projectId': p['id'], 'addTeams': [long_team['id']]})  # o fixture também testa que a equipe não vazada foi explicitamente ligada
    seeded = api('state'); seeded_project = next(x for x in seeded['projects'] if x['id'] == p['id'])
    check('fixture: projeto de teste tem só a equipe criada para ele', seeded_project.get('teamIds') == [long_team['id']], seeded_project.get('teamIds'))
    api('recipes', {'name': 'Receita de apresentação com várias etapas e título longo', 'kind': 'video', 'projectId': p['id'], 'description': 'Reunir pesquisa, roteiro, revisão e preparação do material em etapas claras para uso diário no celular. ' * 3, 'outside': 'Pasta de edição e ferramentas externas do projeto, com um caminho descritivo que deve quebrar linha sem alargar a tela. ' * 2, 'steps': [{'type': 'agent', 'title': f'Etapa {i + 1}: preparar e revisar cuidadosamente o material para o canal', 'agentId': a1['id'], 'prompt': 'Preparar a próxima etapa do fluxo.'} for i in range(4)]})
    # tarefa que falha na hora (pasta do projeto apagada) para exibir o detalhe de uma tarefa finalizada, sem chamar nenhum provedor
    gone = tempfile.mkdtemp(prefix='cr-ui-gone-'); pg = api('projects', {'name': 'projeto-sumiu', 'path': gone.replace(chr(92), '/'), 'area': 'Programação'}); shutil.rmtree(gone)
    done_task = api('tasks', {'projectId': pg['id'], 'agentId': a3['id'], 'requestId': 'ui-final', 'objective': 'tarefa de teste da interface'})
    api('routines', {'name': 'Rotina UI', 'projectId': p['id'], 'target': {'type': 'agent', 'id': a2['id']}, 'objective': 'x', 'trigger': {'type': 'file', 'ext': 'mp4'}})

    with sync_playwright() as pw:
        try: browser = pw.chromium.launch(channel='chrome', headless=True)
        except Exception: browser = pw.chromium.launch(headless=True)
        for label, size in (('desktop', {'width': 1586, 'height': 992}), ('celular', {'width': 390, 'height': 844})):
            ctx = browser.new_context(viewport=size)
            ctx.add_init_script(f"localStorage.setItem('cr.project', JSON.stringify({json.dumps(p['id'])})); localStorage.setItem('cr.sup.{p['id']}', JSON.stringify({json.dumps(a4['id'])}));")
            page = ctx.new_page(); errors = []
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text and 'status of 400' not in m.text else None)
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('response', lambda r: errors.append(f'404: {r.url}') if r.status == 404 and 'favicon' not in r.url else None)
            page.goto(f'http://127.0.0.1:{PORT}/?v=1#{key}'); page.wait_for_selector('#rail button', timeout=8000); time.sleep(0.8)
            for s in ['home', 'room', 'projects', 'tasks', 'teams', 'recipes', 'agents', 'deliveries', 'skills', 'usage', 'routines', 'connections', 'settings']:
                page.click(f'[data-nav={s}]'); time.sleep(0.7)
                broken = page.evaluate("[...document.images].filter(i => i.complete && i.naturalWidth === 0).length")
                overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                check(f'{label}: tela {s} renderiza', page.locator('#view h1').count() > 0 or s == 'room')
                check(f'{label}: tela {s} sem imagem quebrada', broken == 0, broken)
                if s == 'connections':
                    try: page.wait_for_selector('#hermes-card', timeout=8000)   # o cartão do Hermes chega depois da primeira pintura
                    except Exception: pass
                    check(f'{label}: Conexões abre na aba IAs, com os outros blocos guardados em abas', page.locator('.conn-pane:not([hidden])').count() == 1 and page.locator('#social-card').is_hidden() and page.locator('#hermes-card').is_visible())
                    page.click('[data-act=conn-tab][data-id=redes]')
                    try: page.wait_for_selector('#yt-form', timeout=6000)
                    except Exception: pass
                    check(f'{label}: Conexões tem Redes sociais com a conexão do YouTube/Google (formulário de credenciais) e a Biblioteca de APIs; sem o cartão antigo "Publicação"', page.locator('#yt-form').count() == 1 and page.locator('#social-card').count() == 1 and page.locator('#apis-card').count() == 1 and 'Instagram' in page.inner_text('#social-card') and 'YouTube Shorts' not in page.inner_text('#view'))
                    page.click('[data-act=conn-tab][data-id=ias]'); page.click('[data-act=prov-open]'); page.wait_for_selector('#prov-dialog[open] #provider-search', timeout=15000); page.click('#prov-dialog [data-act=prov-pick][data-id=kiro]')
                    check(f'{label}: conexão do Kiro mostra login, verificação e atualização sem executar comandos', page.locator('#prov-dialog [data-action=login]').count() == 1 and page.locator('#prov-dialog [data-act=provider-cli-check]').count() == 1 and page.locator('#prov-dialog [data-action=update]').is_disabled() and 'Windows 11' in page.inner_text('#prov-dialog'))
                    page.fill('#provider-search', 'gemini')
                    try: page.wait_for_function("() => document.querySelector('#prov-dialog [data-id=gemini].prov-pick')?.hidden === false && document.querySelector('#prov-dialog [data-id=kiro].prov-pick')?.hidden === true", timeout=2000)
                    except Exception: pass
                    check(f'{label}: busca do catálogo filtra as CLIs pelo nome', page.locator('#prov-dialog [data-id=gemini].prov-pick').is_visible() and not page.locator('#prov-dialog [data-id=kiro].prov-pick').is_visible())
                    page.click('#prov-dialog [data-act=prov-close]')
                if s == 'skills':
                    try: page.wait_for_function("document.querySelectorAll('[data-act=skill-library-install]').length === 3", timeout=5000)
                    except Exception: pass
                    check(f'{label}: biblioteca oferece três skills iniciais genéricas', page.locator('[data-act="skill-library-install"]').count() == 3 and 'Importar minhas skills' in page.inner_text('#view'))
                culprit = page.evaluate("(() => { const w = document.documentElement.clientWidth; let worst = null; for (const e of document.querySelectorAll('#view *, #composer-root *')) { let clipped = false; for (let a = e.parentElement; a && a.id !== 'view'; a = a.parentElement) if (['auto', 'hidden', 'scroll'].includes(getComputedStyle(a).overflowX)) { clipped = true; break; } if (clipped) continue; const r = e.getBoundingClientRect(); if (r.right > w + 1 && r.width > 0 && (!worst || r.right > worst.r)) worst = { r: r.right, s: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') }; } return worst ? worst.s + ' até ' + Math.round(worst.r) : ''; })()") if overflow > 1 else ''
                check(f'{label}: tela {s} sem rolagem horizontal', overflow <= 1, f'{overflow}px {culprit}')
                if s == 'home':
                    check(f'{label}: Início integra o chat do Assistente e o seletor de projeto', page.locator('#home-composer').count() == 1 and page.locator('#home-mission').count() == 1 and page.locator('#home-project').count() == 1 and 'Continuar de onde parou' in page.inner_text('#view'))
                if label == 'celular' and s == 'teams':
                    team_layout = page.evaluate("""(name) => { const row = [...document.querySelectorAll('.team-saved')].find(e => e.textContent.includes(name)); if (!row) return null; const r = row.getBoundingClientRect(), v = document.querySelector('#view').getBoundingClientRect(), text = row.querySelector('.grow'); const buttons = [...row.querySelectorAll('button')].map(x => { const b=x.getBoundingClientRect(); return b.width >= 40 && b.height >= 40 && b.left >= r.left - 1 && b.right <= r.right + 1; }); return { inside: r.left >= v.left - 1 && r.right <= v.right + 1, textFits: text.scrollWidth <= text.clientWidth + 1, buttons: buttons.length === 2 && buttons.every(Boolean) }; }""", long_team['name'])
                    check('celular: cartão de equipe quebra os integrantes em linhas e mantém ações tocáveis', bool(team_layout and team_layout['inside'] and team_layout['textFits'] and team_layout['buttons']), team_layout)
                if label == 'celular' and s == 'agents':
                    agent_layout = page.evaluate("""() => { const v=document.querySelector('#view').getBoundingClientRect(); const cards=[...document.querySelectorAll('.agents-grid>.agent-card')]; return cards.length > 0 && cards.every(e => { const r=e.getBoundingClientRect(); return r.left >= v.left - 1 && r.right <= v.right + 1 && e.scrollWidth <= e.clientWidth + 1; }); }""")
                    check('celular: cartões de agentes cabem sem cortar descrição ou chips', agent_layout)
                if label == 'celular' and s == 'recipes':
                    recipe_layout = page.evaluate("""() => { const v=document.querySelector('#view').getBoundingClientRect(); const cards=[...document.querySelectorAll('.agents-grid>.card')]; return cards.length > 0 && cards.every(e => { const r=e.getBoundingClientRect(); return r.left >= v.left - 1 && r.right <= v.right + 1 && e.scrollWidth <= e.clientWidth + 1; }); }""")
                    check('celular: cartões de receitas e etapas cabem na tela', recipe_layout)
            if label == 'desktop':
                page.locator('#radio-fab').click(); page.wait_for_function("() => document.querySelector('#radio-fab').getAttribute('aria-pressed') === 'true'")
                page.mouse.move(500, 400); time.sleep(0.5)
                closed = page.evaluate("getComputedStyle(document.querySelector('#radio-bar')).visibility")
                page.hover('#radio-volume-toggle'); time.sleep(0.25)
                opened = page.evaluate("document.querySelector('#radio-vol').getBoundingClientRect().width")
                check('rádio no computador: volume recolhe fora do player e abre ao passar o mouse', closed == 'hidden' and opened >= 40, (closed, opened))
                page.mouse.move(500, 400); time.sleep(0.5)
                check('rádio no computador: controle volta a recolher ao afastar o mouse', page.evaluate("getComputedStyle(document.querySelector('#radio-bar')).visibility === 'hidden'"))
                page.locator('#radio-fab').click(); time.sleep(0.2)
                page.click('[data-nav=room]'); time.sleep(0.6)
                room_members = page.evaluate("outsideId => { const stations=[...document.querySelectorAll('.ps-station[data-agent]')].map(e=>({id:e.dataset.agent, supervisor:e.classList.contains('ps-sup')})); return {workers:stations.filter(x=>!x.supervisor).length, supervisors:stations.filter(x=>x.supervisor).length, leaked:stations.some(x=>x.id===outsideId), stations}; }", outsider['id'])
                check('sala: mostra a equipe do projeto, supervisor separado e oculta agente externo', room_members['workers'] == 3 and room_members['supervisors'] == 1 and not room_members['leaked'], room_members)
                check('sala: agentes inativos mostram a pose cochilando (uma imagem por estação inativa)', page.evaluate("(() => { const ok = [...document.querySelectorAll('.ps-sleep')].filter(i => i.complete && i.naturalWidth > 0).length; return ok > 0 && ok === document.querySelectorAll('.ps-station.st-idle:not(.ps-sup)').length; })()"))
                check('sala: respiração discreta dos agentes ociosos acompanha a preferência de movimento', page.evaluate("(() => { const i = document.querySelector('.ps-sleep'); return !!i && getComputedStyle(i).animationName === 'ps-breathe'; })()"))
                page.click('[data-act=view-mode][data-id=live]'); time.sleep(0.4)
                check('cenário vivo: três agentes do projeto aparecem sem vazar o agente externo', page.evaluate("id => { const slots=[...document.querySelectorAll('.living-station[data-agent],.living-station[data-id]')]; return slots.length === 3 && slots.every(s => s.dataset.id !== id); }", outsider['id']))
                check('cenário vivo: os retratos carregam e as poses seguem o estado', page.evaluate("() => [...document.querySelectorAll('.living-label img')].length === 3 && [...document.querySelectorAll('.living-label img')].every(i => i.complete && i.naturalWidth > 0) && !!document.querySelector('.living-cat')"))
                page.click('[data-act=view-mode][data-id=scene]'); time.sleep(0.3)
                page.screenshot(path=os.path.join(data, 'v6-sala-cochilando.png'))
                page.locator('.ps-station[data-agent]').first.focus(); page.keyboard.press('Enter'); time.sleep(0.4)
                check('sala: Enter na estação abre o menu do agente (Mencionar / Ver detalhes)', page.locator('#agent-menu').count() == 1)
                page.click('#agent-menu [data-act=agent]'); time.sleep(0.4)
                check('sala: Ver detalhes abre a gaveta do agente', page.locator('#drawer:not([hidden])').count() == 1)
                page.keyboard.press('Escape'); time.sleep(0.2)
                check('sala: Esc fecha a gaveta', page.locator('#drawer[hidden]').count() == 1)
                page.select_option('#project-select', pg['id']); time.sleep(0.3); page.click('[data-nav=tasks]'); time.sleep(0.5)
                page.locator(f'[data-act=task][data-id="{done_task["id"]}"]').first.click(); time.sleep(0.8)
                check('execução: tarefa finalizada mostra "Continuar a conversa" com escolha de agente', page.locator('#followup-form select[name=agentId] option').count() == 1 and 'mesma sessão' in page.inner_text('#followup-form'))
                page.select_option('#project-select', p['id']); page.wait_for_function("id => document.querySelector('#project-select')?.value === id", arg=p['id'], timeout=5000); time.sleep(0.6)
                page.click('[data-nav=room]'); time.sleep(1.0)
                page.click('#chat-bubble'); page.wait_for_selector('#mission', state='visible'); check('chat: o chat nasce minimizado e o balão abre a janela com a barra de mensagem', page.is_visible('#chat') and page.is_visible('#target'))
                check('chat no celular: a caixa de mensagem não fica atrás da barra de baixo e o topo continua visível', page.evaluate("() => { const r = document.querySelector('#mission').getBoundingClientRect(), n = document.querySelector('.rail').getBoundingClientRect(); return innerWidth > 760 || (r.bottom <= n.top + 1 && document.querySelector('#chat').getBoundingClientRect().top >= 59); }"))
                page.click('#mission'); page.keyboard.type('/planejar')
                try: page.wait_for_selector('#slash-pop [data-pick]', timeout=30000)  # a leitura inicial de centenas de skills pode levar alguns segundos no primeiro acesso
                except Exception: pass
                time.sleep(0.3)
                check('chat: "/" mostra a skill genérica instalada no fixture', page.locator('#slash-pop [data-pick]').count() >= 1 and 'planejar-entrega' in page.inner_text('#slash-pop').lower(), page.evaluate("() => ({project: document.querySelector('#project-select')?.value, active: document.activeElement?.id, value: document.querySelector('#mission')?.value, popup: document.querySelector('#slash-pop')?.innerText || ''})"))
                page.keyboard.press('Enter'); time.sleep(0.2)
                check('chat: Enter escolhe a skill sem enviar a missão', page.input_value('#mission').startswith('/planejar-entrega') and page.locator('#slash-pop').count() == 0)
                page.fill('#mission', ''); page.keyboard.type('@')
                try: page.wait_for_selector('#slash-pop [data-pick]', timeout=3000)
                except Exception: pass
                check('chat: "@" mostra os agentes', page.locator('#slash-pop [data-pick]').count() >= 3 and 'Ana' in page.inner_text('#slash-pop'), page.evaluate("() => ({project: document.querySelector('#project-select')?.value, active: document.activeElement?.id, value: document.querySelector('#mission')?.value, popup: document.querySelector('#slash-pop')?.innerText || ''})"))
                page.keyboard.press('Escape'); page.fill('#mission', ''); time.sleep(0.2)
                page.click('[data-act=opts]'); time.sleep(0.3)
                check('compositor: opção "Isolar em worktree" disponível', page.locator('#isolate').count() == 1)
                page.click('[data-act=opts]'); time.sleep(0.2)
                page.click('[data-act=chat-min]'); time.sleep(0.2); check('chat: minimizar devolve o balão e esconde a janela', page.is_visible('#chat-bubble') and not page.is_visible('#chat'))
                # ---- Canvas (terceira vista da Sala) ----
                page.on('dialog', lambda d: d.accept())
                page.click('[data-act=view-mode][data-id=canvas]'); time.sleep(0.8)
                check('canvas: um cartão por agente', page.locator('.cv-node').count() == 4, page.locator('.cv-node').count())
                page.wait_for_selector('.cv-node .cv-port.out', timeout=8000); time.sleep(0.5); sb = page.locator('.cv-node', has_text='Ana').locator('.cv-port.out').bounding_box(); db = page.locator('.cv-node', has_text='Beto').bounding_box()
                page.mouse.move(sb['x'] + 7, sb['y'] + 7); page.mouse.down(); page.mouse.move(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2, steps=10); page.mouse.up(); time.sleep(1.0)
                links = api('state')['links']
                check('canvas: arrastar do ponto de saída cria a ligação Ana para Beto no servidor', len(links) == 1 and links[0]['maxHops'] == 3, links)
                try: page.wait_for_selector('.cv-edge.link', timeout=6000)
                except Exception: pass
                time.sleep(0.8)
                check('canvas: a ligação aparece desenhada', page.locator('.cv-edge.link').count() == 1)
                n = page.locator('.cv-node', has_text='Caio'); before = n.bounding_box(); page.mouse.move(before['x'] + 90, before['y'] + 30); page.mouse.down(); page.mouse.move(before['x'] + 190, before['y'] + 90, steps=6); page.mouse.up(); time.sleep(0.3)
                n.wait_for(state='visible', timeout=8000); after = n.bounding_box()
                check('canvas: arrastar um cartão move e guarda a posição', bool(after and abs(after['x'] - before['x'] - 100) <= 4 and page.evaluate("Object.keys(localStorage).some(k => k.startsWith('cr.canvas.'))")), (before, after))
                page.select_option('#lf-from', label='Beto'); page.select_option('#lf-to', label='Ana'); page.click('#link-form button'); time.sleep(0.9)
                check('canvas: o formulário cria a ligação de volta (eles se respondem)', len(api('state')['links']) == 2)
                page.locator('.chip-x').first.click(); time.sleep(0.9)
                check('canvas: remover ligação pelo chip', len(api('state')['links']) == 1)
                ms = page.evaluate("(() => { const t = performance.now(); for (let i = 0; i < 5; i++) { document.querySelector('[data-act=view-mode][data-id=scene]').click(); document.querySelector('[data-act=view-mode][data-id=canvas]').click(); } return (performance.now() - t) / 10; })()")
                dom = page.evaluate("document.querySelectorAll('#canvas-slot *').length")
                check(f'canvas: troca de vista leve ({ms:.0f} ms por troca, {dom} elementos)', ms < 120 and dom < 400, (ms, dom))
                page.screenshot(path=os.path.join(data, 'v8-canvas.png'))
                for l in api('state')['links']: api(f"links/{l['id']}/delete", {})
                page.click('[data-act=view-mode][data-id=scene]'); time.sleep(0.5)
                # ---- Lotes de produção (só confere a tela; não aprova créditos, para não chamar nenhum provedor) ----
                ep_dir = os.path.join(proj, 'episodios', 'EP01-teste'); os.makedirs(ep_dir, exist_ok=True)
                open(os.path.join(ep_dir, 'falas.txt'), 'w', encoding='utf-8').write(chr(10).join(f'Fala {i} do episódio de teste.' for i in range(1, 10)))
                open(os.path.join(ep_dir, 'PROMPTS-FLOW.md'), 'w', encoding='utf-8').write('| Arquivo | Fala | Prompt |' + chr(10) + '|---|---|---|' + chr(10) + '| c01 | 1 | a |' + chr(10) + '| c02 | 2 | b |' + chr(10) + '| v01 | 3 | c |' + chr(10))
                bt = api('batches', {'name': 'Lote UI', 'projectId': p['id'], 'agentId': a1['id'], 'folders': ['episodios/EP01-teste']})
                check('lote: estimativa calculada dos arquivos (voz, imagens, clipes)', bt['estimate']['images'] == 2 and bt['estimate']['clips'] == 1 and bt['estimate']['voiceCredits'] > 0 and bt['estimate']['flowCredits'] is None, bt['estimate'])
                page.click('[data-nav=routines]'); time.sleep(0.8); page.wait_for_selector('.batch', timeout=8000); time.sleep(0.4)
                check('lote: cartão aparece na tela Rotinas, aguardando créditos', page.locator('.batch').count() == 1 and 'Aguardando aprovação dos créditos' in page.inner_text('.batch'))
                check('lote: Flow aparece como indisponível até informar os preços (nunca zero)', 'indisponível' in page.inner_text('.batch'))
                check('lote: formulário exige confirmar os créditos de voz e o teto do Flow', page.locator('.batch-approve input[name=voiceCredits]').count() == 1 and page.locator('.batch-approve input[name=flowCap]').count() == 1)
                page.fill('.batch-approve input[name=voiceCredits]', '1'); page.fill('.batch-approve input[name=flowCap]', '100'); page.click('.batch-approve button.btn'); time.sleep(0.8)
                check('lote: números errados não liberam nada (continua aguardando, sem tarefas)', api('state')['batches'][0]['status'] == 'aguardando_creditos' and not [r for r in api('state')['runs'] if r.get('prompt', '').startswith('Lote ')])
                # ---- player do episódio: link curto, Range (206) e token inválido recusado ----
                sd = os.path.join(proj, 'videos', '2026-01-01_cordel-teste', 'saida'); os.makedirs(sd, exist_ok=True)
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=180x320:d=2', '-pix_fmt', 'yuv420p', os.path.join(sd, 'previa-teste.mp4')], check=True)
                open(os.path.join(sd, 'POST.md'), 'w', encoding='utf-8').write('# post')
                ep0 = api('state')['batches'][0]['episodes'][0]['id']; media = api(f"batches/{bt['id']}/episodes/{ep0}/media")
                kinds = {f['kind']: f for f in media['files']}
                check('player: o servidor acha a prévia e o POST do episódio', 'previa' in kinds and 'post' in kinds and kinds['previa']['bytes'] > 1000, media)
                rq = urllib.request.Request(f"http://127.0.0.1:{PORT}{kinds['previa']['url']}", headers={'Range': 'bytes=0-99'})
                with urllib.request.urlopen(rq, timeout=5) as r: ok206 = (r.status, r.headers.get('Content-Type'), len(r.read()))
                check('player: avançar no vídeo funciona (206, video/mp4, 100 bytes)', ok206 == (206, 'video/mp4', 100), ok206)
                try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}{kinds['previa']['url'][:-8]}x.0000/previa", timeout=5); bad = 200
                except urllib.error.HTTPError as e: bad = e.code
                check('player: token inválido é recusado (403)', bad == 403, bad)
                qa = api(f"batches/{bt['id']}/episodes/{ep0}/qa?kind=previa")
                st_qa = {i['id']: i['status'] for i in qa.get('items', [])}
                check('checagem técnica: mede o vídeo e acusa falta de áudio e formato', qa.get('checked') and st_qa.get('audio') == 'falha' and st_qa.get('res') in ('aviso', 'falha'), qa)
                api(f"batches/{bt['id']}/cancel", {})
                page.click('[data-nav=projects]'); page.click('[data-act=new-project]'); time.sleep(0.3)
                check('projetos: painel Novo projeto abre', page.locator('#project-form').count() == 1)
                page.keyboard.press('Escape'); time.sleep(0.2)
                page.click('[data-nav=routines]'); time.sleep(0.5)
                check('rotinas: rotina por arquivo aparece na tabela', 'Ao adicionar arquivo' in page.inner_text('#view'))
                page.click('[data-act=new-routine]'); time.sleep(0.4)
                check('rotinas: gatilho Horário mostra horário e esconde extensão', page.locator('#routine-form [name=time]').is_visible() and not page.locator('#routine-form [name=ext]').is_visible())
                page.select_option('#r-ttype', 'file'); time.sleep(0.2)
                check('rotinas: gatilho por arquivo mostra extensão e esconde horário', page.locator('#routine-form [name=ext]').is_visible() and not page.locator('#routine-form [name=time]').is_visible())
                page.select_option('#r-ttype', 'manual'); time.sleep(0.2)
                check('rotinas: gatilho manual esconde horário e extensão', not page.locator('#routine-form [name=time]').is_visible() and not page.locator('#routine-form [name=ext]').is_visible())
                page.keyboard.press('Escape'); time.sleep(0.2)
                page.click('[data-nav=usage]'); time.sleep(0.5)
                page.fill('#prices-form [name=cin]', '1.5'); page.fill('#prices-form [name=cout]', '6'); page.click('#prices-form button'); time.sleep(0.8)
                check('consumo: preços salvos no servidor', api('state')['prices'].get('codex', {}).get('in') == 1.5)
                page.click('[data-nav=settings]'); time.sleep(0.4)
                page.click('[data-act=settings-tab][data-id=acesso]')
                try: page.wait_for_selector('#pref-net-lan', timeout=12000)
                except Exception: pass
                check('acesso: cartão de acesso remoto com Tailscale e rede local', 'Tailscale' in page.inner_text('#view') and page.locator('#pref-net-lan').count() == 1)
                page.click('#pref-net-lan')
                lan_enabled = False
                for _ in range(60):
                    time.sleep(0.2)
                    if api('network')['config']['lan'] is True: lan_enabled = True; break
                check('acesso: rede local confirma a ativação antes de aceitar outra mudança', lan_enabled)
                if page.locator('[data-act=pair-new]:not([disabled])').count():
                    page.click('[data-act=pair-new]'); time.sleep(0.6)
                    check('acesso: pareamento mostra QR e código de 8 caracteres', page.locator('.pair-qr svg').count() == 1 and len(page.inner_text('.pair-code').strip()) == 8)
                    page.screenshot(path=os.path.join(data, 'v7-acesso-remoto.png'))
                else: print('AVISO sem endereço de rede local nesta máquina: QR não exercitado')
                if lan_enabled: page.click('#pref-net-lan')
                for _ in range(60):
                    time.sleep(0.2)
                    if api('network')['config']['lan'] is False: break   # espera ativa: sob carga o serviço demora mais que 0,8 s
                check('acesso: rede local volta a ficar desligada', api('network')['config']['lan'] is False)
                page.click('[data-act=settings-tab][data-id=aparencia]'); time.sleep(0.3)
                check('sem Spotify: a configuração e o botão foram retirados (a rádio é a Rádio Lo-Fi)', page.locator('#spotify-url').count() == 0 and page.locator('.spot-btn').count() == 0)
                for t in ('amanhecer', 'minimal', 'noite'):
                    page.click(f'[data-act=theme][data-id={t}]'); time.sleep(0.15)
                check('configurações: tema volta para Noite', page.evaluate("document.documentElement.dataset.theme") in (None, ''))
            check(f'{label}: nenhum erro de console', not errors, errors[:2])
            ctx.close()
        # ---- Canvas com toque real (celular): arrastar cartão e ligar agentes sem rolar a página ----
        tctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        tctx.add_init_script(f"localStorage.setItem('cr.project', JSON.stringify({json.dumps(p['id'])})); localStorage.setItem('cr.sup.{p['id']}', JSON.stringify({json.dumps(a4['id'])}));")
        tp = tctx.new_page()
        tp.goto(f'http://127.0.0.1:{PORT}/?v=1#{key}'); tp.wait_for_selector('#rail button', timeout=8000); time.sleep(0.8)
        tp.click('#chat-bubble'); tp.wait_for_selector('#mission', state='visible'); time.sleep(0.4)
        check('chat no celular (toque): a caixa de mensagem não fica atrás da barra de baixo e o topo continua visível', tp.evaluate("() => { const r = document.querySelector('#mission').getBoundingClientRect(), n = document.querySelector('.rail').getBoundingClientRect(); return r.bottom <= n.top + 1 && document.querySelector('#chat').getBoundingClientRect().top >= 59; }"))
        tp.click('[data-act=chat-min]'); time.sleep(0.3)
        tp.evaluate("localStorage.setItem('cr.prefs', JSON.stringify({mode: 'canvas'}))")
        cdp = tctx.new_cdp_session(tp)
        def touch(kind, x, y): cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y}]})
        def swipe(x0, y0, x1, y1, n=8):
            touch('touchStart', x0, y0)
            for i in range(1, n + 1): touch('touchMove', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); time.sleep(0.02)
            touch('touchEnd', x1, y1); time.sleep(0.6)
        tp.click('[data-nav=room]'); time.sleep(0.5)
        if tp.locator('.cv-node').count() == 0: tp.click('[data-act=view-mode][data-id=canvas]'); time.sleep(0.8)
        check('toque: Canvas mostra os cartões no celular', tp.locator('.cv-node').count() == 4)
        team_edges = tp.locator('.cv-edges').evaluate('(el) => el.textContent')
        check('Canvas: só desenha o fluxo da equipe ligada ao projeto', long_team['name'] in team_edges and 'Equipe UI' not in team_edges, team_edges)
        mobile_layout = tp.evaluate("""() => {
          const card = document.querySelector('.scene-card').getBoundingClientRect();
          const controls = [...document.querySelectorAll('.scene-tools>label,.scene-tools>.seg')].map(e => e.getBoundingClientRect());
          const button = document.querySelector('.cv-expand').getBoundingClientRect();
          const nodes = [...document.querySelectorAll('.cv-node')].map(e => e.getBoundingClientRect());
          const inside = r => r.left >= card.left - 1 && r.right <= card.right + 1;
          const overlaps = a => nodes.some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
          return { controlsInside: controls.every(inside), expandClear: !overlaps(button), pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        }""")
        check('celular: filtros e modos cabem no cartão da sala, e Expandir não cobre agente', mobile_layout['controlsInside'] and mobile_layout['expandClear'] and mobile_layout['pageOverflow'] <= 1, mobile_layout)
        tp.evaluate("document.documentElement.dataset.motion='on'")
        tp.route('**/assets/radio-tocando.webp', lambda route: route.fulfill(status=404, body='imagem ausente'))
        tp.locator('#radio-fab').click(); tp.wait_for_function("() => { const i=document.querySelector('.rp-img'); return i.complete && i.naturalWidth>0 && i.dataset.art==='idle'; }", timeout=6000)
        check('rádio: imagem animada ausente mantém a arte original sem ícone quebrado', tp.evaluate("() => { const i=document.querySelector('.rp-img'); return i.naturalWidth>0 && i.currentSrc.endsWith('/assets/radio.png') && document.querySelector('#radio-fab').getAttribute('aria-pressed')==='true'; }"))
        time.sleep(0.25)
        check('rádio no celular: controle começa recolhido e a seta está acessível por toque', tp.evaluate("() => getComputedStyle(document.querySelector('#radio-bar')).visibility === 'hidden' && document.querySelector('#radio-volume-toggle').getAttribute('aria-expanded') === 'false'"))
        tp.locator('#radio-volume-toggle').click(); time.sleep(0.25)
        check('rádio no celular: seta alterna o controle e o deixa acessível ao toque', tp.evaluate("() => document.querySelector('#radio-vol').getBoundingClientRect().width >= 40 && document.querySelector('#radio-volume-toggle').getAttribute('aria-expanded') === 'true'"))
        tp.locator('#radio-volume-toggle').click(); time.sleep(0.25)
        check('rádio no celular: segunda pressão recolhe novamente a barra', tp.evaluate("() => getComputedStyle(document.querySelector('#radio-bar')).visibility === 'hidden' && document.querySelector('#radio-volume-toggle').getAttribute('aria-expanded') === 'false'"))
        tp.locator('#radio-fab').click(); tp.unroute('**/assets/radio-tocando.webp')
        def scroll_node(name):
            for attempt in range(4):
                node = tp.locator('.cv-node').filter(has_text=name).first
                try:
                    node.wait_for(state='attached', timeout=3000); node.scroll_into_view_if_needed(timeout=3000); return node
                except Exception:
                    if attempt == 3: raise
                    time.sleep(0.4)
        n = scroll_node('Caio'); time.sleep(0.3); b0 = n.bounding_box()
        if not b0 or b0['x'] < 0 or b0['x'] + b0['width'] > 390:
            tp.evaluate("name => { const cv=document.querySelector('#cv'), node=[...document.querySelectorAll('.cv-node')].find(e=>e.textContent.includes(name)); if(node){ cv.scrollLeft=Math.max(0,node.offsetLeft+node.offsetWidth/2-cv.clientWidth/2); } }", 'Caio'); time.sleep(0.5); b0 = n.bounding_box()
        y0 = tp.evaluate('scrollY'); w0 = tp.evaluate("(() => { const e = [...document.querySelectorAll('.cv-node')].find(x => x.textContent.includes('Caio')); return e ? [parseInt(e.style.left), parseInt(e.style.top)] : null; })()")
        if b0 and w0:
            swipe(b0['x'] + 100, b0['y'] + 30, b0['x'] + 150, b0['y'] + 70)
            b1 = n.bounding_box(); w1 = tp.evaluate("(() => { const e = [...document.querySelectorAll('.cv-node')].find(x => x.textContent.includes('Caio')); return e ? [parseInt(e.style.left), parseInt(e.style.top)] : null; })()")
            check('toque: arrastar o cartão com o dedo move o cartão', bool(w1 and abs((w1[0] - w0[0]) - 50) <= 6 and abs((w1[1] - w0[1]) - 40) <= 6), (w0, w1, b0, b1))
            check('toque: a página não rolou junto', abs(tp.evaluate('scrollY') - y0) < 3)
        else:
            diag = n.evaluate("e => ({display:getComputedStyle(e).display, visibility:getComputedStyle(e).visibility, rect:e.getBoundingClientRect().toJSON(), scroll:document.querySelector('#cv')?.scrollLeft})")
            check('toque: arrastar o cartão com o dedo move o cartão', False, diag); check('toque: a página não rolou junto', False, diag)
        for l in api('state')['links']: api(f"links/{l['id']}/delete", {}); time.sleep(1.5)
        scroll_node('Ana'); time.sleep(0.3)
        for _try in range(4):
            time.sleep(1.2)   # deixa a tela terminar de atualizar (renovação de estado) antes de mexer
            tp.evaluate("document.querySelector('#cv').scrollLeft = 0"); time.sleep(0.3)
            pair = tp.evaluate("""() => { const cv = document.querySelector('#cv'); const ns = [...document.querySelectorAll('.cv-node')].map(e => { const r = e.getBoundingClientRect(), p = e.querySelector('.cv-port.out').getBoundingClientRect(); return { name: e.textContent.trim().split(' ')[0], px: p.x + cv.scrollLeft, cx: r.x + r.width / 2 + cv.scrollLeft, y: r.y }; });
                  let best = null; for (const a of ns) for (const b of ns) if (a !== b && b.cx > a.px && (!best || b.cx - a.px < best[2])) best = [a, b, b.cx - a.px]; return best && { from: best[0].name, to: best[1].name, mid: (best[0].px + best[1].cx) / 2 }; }""")   # escolhe dois cartões vizinhos (o Canvas rola para os lados), como em scripts/ui_touch.py
            if not pair: continue
            try:
                scroll_node(pair['from']); time.sleep(0.2)
                tp.evaluate("(mid) => { document.querySelector('#cv').scrollLeft = mid - 195; }", pair['mid']); time.sleep(0.5)
                o = tp.locator('.cv-node', has_text=pair['from']).locator('.cv-port.out').bounding_box(); d = tp.locator('.cv-node', has_text=pair['to']).bounding_box()
            except Exception: continue
            if not (o and d and 10 < o['x'] < 370 and d['x'] < 330 and o['y'] < 700): continue
            swipe(o['x'] + o['width'] / 2, o['y'] + o['height'] / 2, min(d['x'] + d['width'] / 2, (d['x'] + 372) / 2), d['y'] + d['height'] / 2, 14); time.sleep(0.6)
            if api('state')['links']: break
        check('toque: arrastar do ponto de saída com o dedo cria a ligação', len(api('state')['links']) == 1, api('state')['links'])
        for l in api('state')['links']: api(f"links/{l['id']}/delete", {})
        tctx.close()
        anon = browser.new_context(viewport={'width': 390, 'height': 844}).new_page(); anon.goto(f'http://127.0.0.1:{PORT}/'); anon.wait_for_selector('#login-form', timeout=8000)
        check('login: campo de código de pareamento no celular', anon.locator('#pair-code').count() == 1 and anon.locator('[data-act=pair-submit]').is_visible())
        anon.fill('#pair-code', 'ERRADO12'); anon.click('[data-act=pair-submit]'); time.sleep(0.6)
        check('login: código errado mostra erro, sem entrar', 'inválido' in anon.inner_text('#login-error').lower() or 'expirado' in anon.inner_text('#login-error').lower())
        browser.close()
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
    shutil.rmtree(data, ignore_errors=True); shutil.rmtree(proj, ignore_errors=True)
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
sys.exit(1 if fails else 0)
