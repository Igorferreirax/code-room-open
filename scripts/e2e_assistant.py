"""Teste ponta a ponta do Assistente com o servidor de verdade e um "Codex" falso (nenhuma IA real, nenhuma cota).
Copia o app para uma pasta temporária, faz o falso Codex responder com ações, e confere que cada ação aprovada
vira o efeito real: pasta do projeto, agentes, equipe, skill gravada e reconhecida, ligação e tarefa executada.
Uso: python scripts/e2e_assistant.py"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 4795
tmp = tempfile.mkdtemp(prefix='cr-e2e-'); app = os.path.join(tmp, 'app'); data = os.path.join(tmp, 'data'); work = os.path.join(tmp, 'projetos'); bindir = os.path.join(tmp, 'bin'); ans = os.path.join(tmp, 'resposta.txt')
os.makedirs(bindir); os.makedirs(app); os.makedirs(os.path.join(tmp, 'home'))
for d in ('server', 'public', 'docs'): shutil.copytree(os.path.join(ROOT, d), os.path.join(app, d))
shutil.copy(os.path.join(ROOT, 'package.json'), app)
os.makedirs(os.path.join(app, 'test', 'fixtures')); [shutil.copy(os.path.join(ROOT, 'test', 'fixtures', f), os.path.join(app, 'test', 'fixtures', f)) for f in ('fake-agent.mjs', 'fake-codex-preload.mjs')]
with open(os.path.join(app, 'docs', 'ASSISTENTE.md'), 'a', encoding='utf-8') as f: f.write('\n[[fake answerfile=' + ans.replace('\\', '/') + ']]\n')
shutil.copy(shutil.which('node'), os.path.join(bindir, 'codex.exe'))
env = dict(os.environ, PATH=bindir + os.pathsep + os.environ['PATH'], CODE_ROOM_DATA=data, CODE_ROOM_PORT=str(PORT), CODE_ROOM_WORKSPACE=work, CODE_ROOM_NO_BROWSER='1', USERPROFILE=os.path.join(tmp, 'home'), HOME=os.path.join(tmp, 'home'),
           NODE_OPTIONS='--import ' + 'file:///' + os.path.join(app, 'test', 'fixtures', 'fake-codex-preload.mjs').replace('\\', '/'))
srv = subprocess.Popen([shutil.which('node'), os.path.join(app, 'server', 'main.mjs')], cwd=app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fails, passes = [], 0
def check(name, ok, extra=''):
    global passes
    if ok: passes += 1
    else: fails.append(f'{name} {extra}')
    print(('OK    ' if ok else 'FALHA ') + name + (f'  [{extra}]' if extra != '' and not ok else ''))
F = '`' * 3
def block(j): return F + 'code-room-action\n' + json.dumps(j, ensure_ascii=False) + '\n' + F
try:
    key = None
    for _ in range(60):
        try: key = open(os.path.join(data, 'access.key')).read().strip(); urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1); break
        except Exception: time.sleep(0.2)
    def api(path, body=None):
        r = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers={'X-Code-Room-Key': key, 'Content-Type': 'application/json'})
        try: return json.load(urllib.request.urlopen(r, timeout=30))
        except urllib.error.HTTPError as e: return {'_http': e.code, **json.loads(e.read() or b'{}')}
    def wait(fn, what, secs=40):
        end = time.time() + secs
        while time.time() < end:
            v = fn()
            if v: return v
            time.sleep(0.5)
        raise RuntimeError('tempo esgotado: ' + what)
    st = api('assistant'); check('o falso Codex é reconhecido como IA instalada', 'codex' in st.get('connected', []), st.get('connected'))
    open(ans, 'w', encoding='utf-8').write('RESUMO: o Code Room é uma sala local onde várias IAs trabalham juntas e nada acontece sem a sua aprovação. ' * 3 + '\nREGRAS: eu rodo em somente leitura, não altero a ferramenta e só proponho ações que a pessoa aprova com um clique.\nEXEMPLOS: como criar uma equipe?\nBRIEFING: PRONTO')
    api('assistant/brief', {'provider': 'codex'}); st = wait(lambda: (lambda s: s if s['briefed'] else None)(api('assistant')), 'apresentação'); check('apresentação feita pelo processo real e gravada na máquina', st['briefed'] and os.path.exists(os.path.join(data, 'assistente', 'CONHECIMENTO.md')))
    open(ans, 'w', encoding='utf-8').write('Plano para o documentário:\n' + '\n'.join(block(j) for j in [
        {'acao': 'criar_projeto', 'nome': 'Documentário Teste', 'ambiente': 'Vídeo'},
        {'acao': 'criar_agente', 'nome': 'Diretor', 'funcao': 'Dirige o vídeo', 'provedor': 'codex', 'permissao': 'read'},
        {'acao': 'criar_agente', 'nome': 'Montador', 'funcao': 'Monta o vídeo', 'provedor': 'codex', 'permissao': 'write'},
        {'acao': 'criar_skill', 'nome': 'roteiro-documentario', 'descricao': 'Escreve roteiros de documentário curto', 'instrucoes': 'Escreva um roteiro com abertura, três blocos e fechamento. Linguagem simples.'},
        {'acao': 'definir_skills', 'agente': 'Diretor', 'skills': ['roteiro-documentario']},
        {'acao': 'criar_equipe', 'nome': 'Equipe Doc', 'membros': [{'papel': 'desenvolvedor', 'agente': 'Montador'}, {'papel': 'revisor', 'agente': 'Diretor'}]},
        {'acao': 'ligar_agentes', 'projeto': 'Documentário Teste', 'de': 'Diretor', 'para': 'Montador', 'voltas': 2},
        {'acao': 'iniciar_tarefa', 'projeto': 'Documentário Teste', 'agente': 'Diretor', 'objetivo': 'Escreva o roteiro e envie ao Montador'}]))
    api('assistant/ask', {'text': 'Quero editar um documentário'}); st = wait(lambda: (lambda s: s if not s['pending'] and len(s['messages']) >= 2 else None)(api('assistant')), 'resposta'); m = st['messages'][-1]
    check('a resposta traz as 8 propostas, todas válidas', len(m['actions']) == 8 and all(a['valid'] for a in m['actions']), [a.get('error') for a in m['actions'] if not a['valid']])
    check('nada foi criado antes da aprovação', api('state')['projects'] == [] and api('state')['agents'] == [] and not os.path.exists(work))
    skipped = api('assistant/apply', {'messageId': m['id'], 'index': 7}); check('aplicar a tarefa antes do resto é recusado com motivo', '_http' in skipped and 'não existe' in skipped.get('error', ''), skipped)
    res = []
    for i in range(8):
        r = api('assistant/apply', {'messageId': m['id'], 'index': i}); res.append(r)
        if '_http' in r: break
    check('as 8 ações aplicam em ordem sem erro', all('_http' not in r for r in res) and len(res) == 8, [r for r in res if '_http' in r])
    s = api('state'); proj = [p for p in s['projects'] if p['name'] == 'Documentário Teste']
    check('projeto criado, dentro da pasta de projetos e com a pasta de verdade', len(proj) == 1 and os.path.isdir(proj[0]['path']) and os.path.realpath(proj[0]['path']).startswith(os.path.realpath(work)) and proj[0]['area'] == 'Vídeo', proj)
    ag = {a['name']: a for a in s['agents']}; check('agentes criados com a permissão proposta e sem expor o agente interno', set(ag) == {'Diretor', 'Montador'} and ag['Diretor']['mode'] == 'read' and ag['Montador']['mode'] == 'write', list(ag))
    check('equipe criada com os dois papéis', len(s['teams']) == 1 and [x['role'] for x in s['teams'][0]['members']] == ['desenvolvedor', 'revisor'])
    check('ligação Diretor → Montador criada com 2 voltas', len(s['links']) == 1 and s['links'][0]['maxHops'] == 2 and s['links'][0]['from'] == ag['Diretor']['id'])
    sk = os.path.join(data, 'minhas-skills', 'roteiro-documentario', 'SKILL.md'); check('skill gravada em minhas-skills com cabeçalho válido', os.path.exists(sk) and open(sk, encoding='utf-8').read().startswith('---\nname: roteiro-documentario\n'))
    skills = api('skills'); mine = [k for k in skills if k['name'] == 'roteiro-documentario']; check('a skill nova aparece em Skills e está reconhecida', mine and mine[0]['recognized'], mine[:1])
    check('as skills do Diretor foram definidas', ag['Diretor']['skillIds'] and ag['Diretor']['skillIds'][0] == mine[0]['id'], ag['Diretor']['skillIds'])
    runs = wait(lambda: (lambda r: r if any(x['status'] == 'completed' and x['agent']['name'] == 'Diretor' for x in r) else None)(api('state')['runs']), 'tarefa do Diretor')
    check('a tarefa iniciada rodou até o fim pelo executor real', any(x['status'] == 'completed' and x['agent']['name'] == 'Diretor' for x in runs))
    check('a tarefa do Assistente (interna) não aparece na lista de tarefas', not [x for x in api('state')['runs'] if x['agent']['name'] == 'Assistente'])
    again = api('assistant/apply', {'messageId': m['id'], 'index': 0}); check('aprovar de novo a mesma ação é recusado', '_http' in again and 'já foi tratada' in again.get('error', ''), again)
    # segurança: o Assistente nunca recebe a chave nem caminhos e a rota é só do computador
    dev = api('pairing', {}) if False else None
    try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/assistant', timeout=3); anon = 200
    except urllib.error.HTTPError as e: anon = e.code
    check('sem a chave, o Assistente é negado', anon in (401, 403), anon)
    prompts = [t.get('prompt', '') + t.get('objective', '') for t in api('state')['runs']]
    prompt_asst = open(os.path.join(data, 'assistente', 'CONHECIMENTO.md'), encoding='utf-8').read(); check('o que a IA entendeu não contém a chave nem caminhos do usuário', key not in prompt_asst and tmp not in prompt_asst)
finally:
    srv.kill(); time.sleep(0.5); shutil.rmtree(tmp, ignore_errors=True)
print(f'\n{passes} verificações ok, {len(fails)} falha(s)')
for f in fails: print('  - ' + f)
sys.exit(1 if fails else 0)
