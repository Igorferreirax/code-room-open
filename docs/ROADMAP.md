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
- ⬜ Zip portátil com Node dentro, dados fora da pasta do programa.
- ⬜ Instalador `.exe` (atalho e menu Iniciar). Sem assinatura digital aparece o aviso do SmartScreen.
- ⬜ SHA-256 de cada arquivo publicado junto do Release.
- ⬜ Aviso de versão nova em Configurações.

### Primeiro uso
- ⬜ Tela de boas-vindas com a verificação do ambiente em linguagem simples.
- ⬜ Projeto e agentes de demonstração.

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
