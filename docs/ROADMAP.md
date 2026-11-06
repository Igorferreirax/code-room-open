# Roadmap

Legenda: ✅ feito · ⬜ a fazer

## Feito
- ✅ Backend validado com Codex e Claude Code reais: fila, tentativas, cancelamento da árvore de processos, tempo limite, recuperação após queda.
- ✅ Equipes (desenvolvedor → revisor), supervisor e ligações entre agentes no Canvas.
- ✅ Aprovação antes de sair: `AGUARDANDO_APROVACAO` → `POSTAR_<CANAL>` ou `LIXEIRA`.
- ✅ Rotinas por horário, manuais e por arquivo.
- ✅ Acesso remoto por QR (rede local ou Tailscale), desligado por padrão.
- ✅ Interface em 12 telas, responsiva (360 a 1586 px).
- ✅ Auditoria de segurança automatizada (`npm run audit`).

## Próximos passos
### Empacotamento (Windows)
- ✅ Zip portátil com Node embutido, dados em `%LOCALAPPDATA%\CodeRoom\data`, ícone e atalhos (testado em pasta limpa, sem Node, com Smart App Control ligado e arquivos marcados como baixados da internet).
- ✅ Instalador `.exe` gerado (Inno Setup, assistente em português, ícone opcional na área de trabalho). **Não executado em teste**: o Windows 11 com Smart App Control barra instaladores sem assinatura.
- ⬜ **Assinatura digital** do instalador (necessária para o Smart App Control): [SignPath Foundation](https://signpath.org/) (gratuito para código aberto), Azure Artifact Signing ou certificado pago.
- ⬜ SHA-256 de cada arquivo publicado junto do Release.
- ⬜ Aviso de **versão nova** com botão Atualizar (verificação opcional no GitHub, SHA-256, sem *downgrade*). Plano e testes em [LANCAMENTO-V1.md](LANCAMENTO-V1.md).

### Primeiro uso
- ✅ Triagem para conectar as IAs (Codex, Claude Code, Gemini) com o comando exato de instalar ou entrar, e criação de agentes iniciais.
- ✅ Tutorial guiado pelas 12 telas, com opção de pular e de rever pelo menu do usuário.
- ⬜ Incluir na triagem a verificação do ambiente de vídeo (ffmpeg, Python, HyperFrames) e um projeto de demonstração.

### Biblioteca de skills
- ⬜ Biblioteca inicial de skills genéricas, instalada como pasta extra de skills.

### Generalizar o modo de lote
- ⬜ Hoje o lote de vídeo é uma esteira de exemplo que depende de uma skill e de scripts específicos. Tornar o formato configurável.

### Qualidade
- ⬜ Estabilizar o teste de toque do Canvas (intermitente).
- ⬜ Publicação em outras redes além do YouTube Shorts (Instagram).
- ⬜ Instalação e atualização dos CLIs pelo próprio app.

### Plataformas
- ⬜ macOS e Linux.
