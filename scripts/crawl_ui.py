"""Rastreador: abre cada tela (desktop e celular), clica em TODOS os botões visíveis (menos os destrutivos) e confere que nada quebra:
sem erro de console, sem erro de página, sem resposta 5xx do servidor, sem rolagem lateral e sem tela em branco. Também procura textos cortados
(elementos cujo conteúdo passa da própria caixa). Usa um serviço temporário com um Codex falso (nenhuma IA real, nenhuma cota).
Uso: python scripts/crawl_ui.py"""
import os, re, sys, time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
from _servico import Servico

problems, clicks = [], 0
SKIP_ACT = re.compile(r'delete|remove|install|download|logout|reset|clean|wipe|revoke|disconnect|exit|stop|quit|archive|reprove|reject|lixeira|empty|publish|post-', re.I)
SKIP_TEXT = re.compile(r'remover|apagar|excluir|sair|instalar|baixar|descartar|reprovar|desconectar|esvaziar|publicar|limpar', re.I)
with Servico(copiar_app=True, nome_projeto='canal', timeout_api=40,
             erro_http='status', env_extra=lambda s: {'CODE_ROOM_RELEASES_URL': s.base + '/x'}) as servico:
    api = servico.api
    key = servico.key
    proj = servico.proj
    P = api('projects', {'name': 'Canal Teste', 'path': proj.replace(chr(92), '/'), 'area': 'Vídeo'})
    ags = [api('agents', {'name': n, 'role': r, 'room': 'Vídeo', 'provider': 'codex', 'model': '', 'instructions': '', 'mode': m, 'skillIds': [], 'capabilities': c}) for n, r, m, c in (('Diretor de Edição', 'Dirige a edição do vídeo', 'read', ['review']), ('Roteirista de Legendas muito longas', 'Escreve o episódio (falas, prompts, post) com texto bem comprido para testar quebra', 'write', ['writing']), ('Montador', 'Monta o vídeo', 'write', ['video.edit']))]
    api('teams', {'name': 'Equipe de Edição de Vídeo', 'members': [{'role': 'desenvolvedor', 'agentId': ags[2]['id']}, {'role': 'revisor', 'agentId': ags[0]['id']}]})
    api('links', {'projectId': P['id'], 'from': ags[0]['id'], 'to': ags[1]['id'], 'maxHops': 2})
    for i, a in enumerate(ags): api('tasks', {'projectId': P['id'], 'agentId': a['id'], 'requestId': f'r{i}', 'objective': f'Tarefa de teste {i} [[fake sleep=100]]'})
    os.makedirs(os.path.join(proj, 'ENTRADA')); api('folderjobs', {'name': 'Cortes', 'projectId': P['id'], 'dir': 'ENTRADA', 'exts': 'mp4', 'agentId': ags[2]['id'], 'instruction': 'Edite {arquivo}', 'parallel': 1})
    api('routines', {'name': 'Rotina diária', 'projectId': P['id'], 'objective': 'Buscar vagas', 'trigger': {'type': 'manual'}, 'target': {'type': 'agent', 'id': ags[1]['id']}})
    time.sleep(3)
    VIEWS = ['room', 'projects', 'tasks', 'teams', 'recipes', 'agents', 'deliveries', 'skills', 'usage', 'routines', 'connections', 'settings']
    URL = f'{servico.base}/#{key}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        for label, size, mobile in (('desktop', {'width': 1440, 'height': 900}, False), ('celular', {'width': 390, 'height': 844}, True)):
            ctx = browser.new_context(viewport=size, has_touch=mobile, is_mobile=mobile); ctx.add_init_script("try { localStorage.setItem('cr.onb', JSON.stringify({setupDone:true,tourDone:true})); } catch (e) {}")
            pg = ctx.new_page(); errs = []; where = ['inicio']
            pg.on('console', lambda m: errs.append(('console', where[0], m.text)) if m.type == 'error' and 'status of 4' not in m.text and 'favicon' not in m.text else None)
            pg.on('pageerror', lambda e: errs.append(('pagina', where[0], str(e))))
            pg.on('response', lambda r: errs.append(('http', where[0], f'{r.status} {r.url}')) if r.status >= 500 else None)
            pg.on('dialog', lambda d: d.dismiss()); pg.goto(URL, wait_until='domcontentloaded', timeout=60000); pg.wait_for_selector('#rail button', timeout=15000); time.sleep(1.0)
            for v in VIEWS:
                print(f'Rastreando {label}/{v}...', flush=True)
                where[0] = f'{label}/{v}'; pg.keyboard.press('Escape'); pg.evaluate('v => crGo(v)', v); time.sleep(0.9)
                if not pg.inner_text('#view').strip(): problems.append(f'{where[0]}: tela em branco')
                if pg.evaluate("document.querySelector('#topbar .project-pill')?.getBoundingClientRect().width || 0") < 100: problems.append(f'{where[0]}: o seletor de projeto ficou espremido na barra do topo')
                if not pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'): problems.append(f'{where[0]}: rolagem lateral na página ({pg.evaluate("document.documentElement.scrollWidth")} > {size["width"]})')
                cut = pg.evaluate("""() => [...document.querySelectorAll('#view *')].filter(e => { const cs = getComputedStyle(e); if (e.closest('svg') || e.classList.contains('sr-only') || cs.display === 'inline' || cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.textOverflow === 'ellipsis') return false; return e.children.length === 0 && e.textContent.trim().length > 3 && e.scrollWidth > e.clientWidth + 3 && e.clientWidth > 0; }).slice(0, 5).map(e => (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 40))""")
                for c in cut: problems.append(f'{where[0]}: texto cortado -> {c}')
                n = pg.locator('#view button:visible, #view [data-act]:visible, #view [data-nav]:visible').count(); seen = 0
                for i in range(min(n, 60)):
                    els = pg.locator('#view button:visible, #view [data-act]:visible, #view [data-nav]:visible')
                    if i >= els.count(): break
                    el = els.nth(i)
                    try: act = el.get_attribute('data-act') or ''; txt = (el.inner_text(timeout=1000) or '').strip()[:30]; tag = el.evaluate('e => e.tagName')
                    except Exception: continue
                    if tag in ('INPUT', 'SELECT', 'TEXTAREA') or SKIP_ACT.search(act) or SKIP_TEXT.search(txt) or el.get_attribute('type') == 'submit' or el.get_attribute('data-nav') in VIEWS and False: continue
                    try: el.click(timeout=2000, no_wait_after=True); clicks += 1; seen += 1; time.sleep(0.25)
                    except Exception: pass
                    pg.keyboard.press('Escape'); time.sleep(0.1)   # fecha janela, gaveta ou painel que o clique abriu
                    if pg.locator('#panel:not([hidden])').count(): pg.evaluate("document.getElementById('panel').hidden = true")
                    if not pg.is_visible('#shell'): problems.append(f'{where[0]}: o app sumiu depois de clicar em "{txt or act}"'); pg.goto('about:blank'); pg.goto(URL, wait_until='domcontentloaded', timeout=60000); pg.wait_for_selector('#rail button', timeout=15000)
                    if pg.evaluate("document.querySelector('#view')?.getAttribute('aria-label')") != pg.evaluate("document.querySelector('#view')?.getAttribute('aria-label')"): pass
                    cur = pg.evaluate("document.querySelector('#rail .on, #rail [aria-current]')?.dataset.nav || ''")
                    if cur and cur != v: pg.keyboard.press('Escape'); pg.evaluate('v => crGo(v)', v); time.sleep(0.5)
                pg.keyboard.press('Escape')
            for kind, w, msg in errs: problems.append(f'{label} [{kind}] {w}: {msg[:160]}')
            ctx.close()
        browser.close()
uniq = list(dict.fromkeys(problems))
print(f'{clicks} cliques em botões, {len(uniq)} problema(s)')
for p in uniq: print('  -', p)
sys.exit(1 if uniq else 0)
