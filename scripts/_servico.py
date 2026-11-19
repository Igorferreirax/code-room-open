"""Instância temporária do Code Room para os roteiros de interface."""

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
_HTTP_LOCAL = build_opener(ProxyHandler({}))


def porta_livre():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class Servico:
    def __init__(self, *, falsos=('codex.exe',), env_extra=None, copiar_app=False,
                 nome_projeto='projeto', timeout=20, timeout_api=None, erro_http=None):
        """env_extra aceita um dicionário ou uma função que recebe a instância."""
        self._falsos = falsos
        self._env_extra = env_extra
        self._copiar_app = copiar_app
        self._nome_projeto = nome_projeto
        self._timeout = timeout
        self._timeout_api = timeout_api
        self._erro_http = erro_http

    def __enter__(self):
        node = shutil.which('node')
        if node is None:
            raise RuntimeError('Node.js não encontrado no PATH.')
        porta_configurada = os.environ.get('CODE_ROOM_UI_PORT')
        if porta_configurada is not None:
            try:
                self.port = int(porta_configurada)
                if not 1 <= self.port <= 65535:
                    raise ValueError()
            except ValueError:
                raise ValueError('CODE_ROOM_UI_PORT deve ser uma porta de 1 a 65535.') from None

        self.processo = None
        self.key = ''
        self._guardar_log = os.environ.get('CODE_ROOM_UI_LOG') == '1'
        self.tmp = tempfile.mkdtemp(prefix='cr-ui-')
        self.data = os.path.join(self.tmp, 'data')
        self.proj = os.path.join(self.tmp, self._nome_projeto)
        self.log = Path(self.data, 'server.log')
        try:
            os.mkdir(self.data)
            os.mkdir(self.proj)
            env = os.environ.copy()
            self.app = Path(self.tmp, 'app') if self._copiar_app else ROOT
            if self._copiar_app:
                self._preparar_copia(env)
            if self._falsos:
                bindir = Path(self.data, 'bin')
                bindir.mkdir()
                for nome in self._falsos:
                    shutil.copy(node, bindir / nome)
            if porta_configurada is None:
                self.port = porta_livre()
            self.base = f'http://127.0.0.1:{self.port}'
            extra = self._env_extra(self) if callable(self._env_extra) else self._env_extra
            env.update(extra or {}, CODE_ROOM_DATA=self.data, CODE_ROOM_PORT=str(self.port))
            if self._falsos:
                env['PATH'] = os.pathsep.join((str(bindir), env.get('PATH', '')))
            with self.log.open('wb') as log:
                self.processo = subprocess.Popen(
                    [node, str(self.app / 'server' / 'main.mjs')], cwd=self.app,
                    env=env, stdout=log, stderr=subprocess.STDOUT,
                )
            self._esperar()
            return self
        except BaseException:
            self._encerrar()
            raise

    def _preparar_copia(self, env):
        for nome in ('server', 'public', 'docs'):
            shutil.copytree(ROOT / nome, self.app / nome)
        shutil.copy(ROOT / 'package.json', self.app)
        fixtures = self.app / 'test' / 'fixtures'
        fixtures.mkdir(parents=True)
        for nome in ('fake-agent.mjs', 'fake-codex-preload.mjs'):
            shutil.copy(ROOT / 'test' / 'fixtures' / nome, fixtures)
        home = Path(self.tmp, 'home')
        home.mkdir()
        env.update(CODE_ROOM_NO_BROWSER='1', USERPROFILE=str(home), HOME=str(home),
                   NODE_OPTIONS='--import=' + (fixtures / 'fake-codex-preload.mjs').as_uri())

    def _esperar(self):
        prazo = time.monotonic() + self._timeout
        chave = Path(self.data, 'access.key')
        while time.monotonic() < prazo:
            codigo = self.processo.poll()
            if codigo is not None:
                raise RuntimeError(f'O serviço encerrou antes de iniciar (código {codigo}).\n{self.saida()}')
            try:
                self.key = chave.read_text(encoding='utf-8').strip()
                if self.key:
                    # A chave confirma que a porta pertence a esta instância.
                    with self.raw('/api/updates', timeout=1):
                        return
            except OSError:
                pass
            time.sleep(0.2)
        raise TimeoutError(f'O serviço em {self.base} não iniciou em {self._timeout} s.\n{self.saida()}')

    def raw(self, path, body=None, method=None, *, autenticar=True, headers=None, timeout=None):
        cabecalhos = {'Content-Type': 'application/json'}
        if autenticar:
            cabecalhos['X-Code-Room-Key'] = self.key
        cabecalhos.update(headers or {})
        dados = json.dumps(body).encode() if body is not None else None
        req = Request(self.base + path, data=dados, headers=cabecalhos, method=method)
        return _HTTP_LOCAL.open(req, timeout=timeout)

    def api(self, path, body=None, method=None):
        try:
            with self.raw('/api/' + path, body, method, timeout=self._timeout_api) as resposta:
                return json.load(resposta)
        except HTTPError as erro:
            if self._erro_http is None:
                raise
            with erro:
                resultado = {'_http': erro.code}
                if self._erro_http == 'json':
                    resultado.update(json.loads(erro.read() or b'{}'))
                return resultado

    def saida(self, limite=3000):
        with self.log.open('rb') as log:
            tamanho = log.seek(0, os.SEEK_END)
            log.seek(max(0, tamanho - limite))
            texto = log.read().decode('utf-8', errors='replace').replace('\r\n', '\n')
        chave = Path(self.data, 'access.key')
        segredo = self.key or (chave.read_text(encoding='utf-8').strip() if chave.is_file() else '')
        return texto.replace(segredo, '<chave-oculta>') if segredo else texto

    def __exit__(self, exc_type, exc, traceback):
        self._encerrar()

    def _encerrar(self):
        try:
            if self.processo is not None and self.processo.poll() is None:
                self.processo.terminate()
                try:
                    self.processo.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.processo.kill()
                    self.processo.wait()
        finally:
            if self._guardar_log and self.log.is_file():
                for pasta, preservar in ((Path(self.tmp), Path(self.data)), (Path(self.data), self.log)):
                    for item in pasta.iterdir():
                        if item != preservar:
                            if item.is_dir() and not item.is_symlink():
                                shutil.rmtree(item, ignore_errors=True)
                            else:
                                try:
                                    item.unlink(missing_ok=True)
                                except OSError:
                                    pass
                print(f'Log do serviço em {self.log}', file=sys.stderr)
            else:
                shutil.rmtree(self.tmp, ignore_errors=True)
