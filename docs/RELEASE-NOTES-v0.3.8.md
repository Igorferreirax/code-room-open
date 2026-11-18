# Code Room 0.3.8

Versão focada em produtividade completa para **programação, criação de sites, edição de vídeos (incluindo HyperFrames) e automações**, com navegador interno ao vivo, artefatos objetivos de qualidade e mais autonomia para o Nico. Continua gratuita e aberta sob licença MIT.

## O que mudou

- **Navegador interno multi-abas ao vivo.** Visualize composições HyperFrames em **9:16**, sites em **Desktop / Celular (390×844)** e portas locais (`3000`, `3210`, `5173`, `8080`…) lado a lado com os agentes ou dentro da Sala, com recarregamento automático ao salvar e botão **🎯 Ajustar** direto na aba aberta. Servidores locais também podem ser vistos pelo celular via Tailscale sem bloqueio de `iframe`.
- **Estúdio de Artefatos, Storyboard por cenas e controle de qualidade.** Em **Entregas**, alterne entre **Prévia**, **Artefatos** (Cue Sheet de vídeo com minutagem e `[motion]`, blocos copiáveis em 1 clique e checklist), **Storyboard** (pedido de ajuste cirúrgico por cena) e baixe tudo de uma vez em **`.zip`**. Cada entrega passa por checagem automática de sintaxe, segredos expostos, estrutura mobile e vídeo/áudio.
- **Nico Flutuante (estilo Wispr Flow) e mini-janela sempre visível.** Use `Ctrl+Espaço` no app (ou `Ctrl+Shift+Espaço` no Windows) para ditar em texto limpo ou lista direto no campo selecionado, e destaque o Nico numa mini-janela que continua visível mesmo com o Code Room minimizado.
- **Modelos de pedido, lista interativa e padrões de qualidade na tela inicial.** Um clique em *Desenvolver*, *Criar site*, *Editar vídeo*, *Automação*, *Pesquisar* ou *Revisar entrega* monta o briefing estruturado com campos editáveis e itens em lista.
- **Nico mais enxuto, sem travas no Modo Piloto e disponível no celular pareado.** Sem apresentações repetidas, aprendizado permanente com `/aprender`, destaque dourado **`★ Orquestrador`** no agente líder, auto-fallback quando uma IA atinge limite de cota, ponto de restauração Git (**Reverter alterações**) e proteção contra abrir mais de uma instância do Code Room.

## Limites conhecidos

- No Antigravity, mover arquivos em pastas externas ainda não está disponível; para organizar pastas fora do projeto, prefira Claude Code ou Codex.
- Para usar ditado por voz no navegador do celular fora de `localhost`, ative o botão de **HTTPS do Tailscale** em **Configurações › Acesso**.
