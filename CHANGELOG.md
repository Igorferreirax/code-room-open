# Novidades

O que entrou em cada versão do Code Room. O texto de cada versão também vira as notas da
[release no GitHub](https://github.com/Igorferreirax/code-room-open/releases).

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e os números seguem o
[versionamento semântico](https://semver.org/lang/pt-BR/): correção sobe o último número (0.2.**1**), novidade sobe o
do meio (0.**3**.0).

## [Não lançado]

### Adicionado
- **Balão de conversa ao lado do agente:** clicar em um agente abre um balão colado nele, com estado, o que faz ao vivo e caixa de missão. **Fixar em janela** leva para uma janela lateral (até 3 agentes lado a lado).
- **Sessão ao vivo no chat com o agente:** a linha do tempo da tarefa (ações, resposta chegando, estado) aparece no chat e atualiza sozinha.
- **Servidor MCP** (`server/mcp.mjs`): o Claude Code, o Codex e outras ferramentas consultam o Code Room. Token próprio e revogável, somente leitura por padrão; aprovar e apagar nunca ficam disponíveis. Guia em [docs/MCP.md](docs/MCP.md).
- **Navegador para agentes (opcional, desligado):** por agente, "navegador separado" (Playwright descartável, Claude Code e Codex) ou "o meu Chrome" (só Claude Code). Não vale para projetos Financeiro.
- **Hermes na VPS configurável no app:** servidor, porta, caminho da chave e programa remoto, com teste de conexão e validação rigorosa.
- **Energia:** aviso de quanto tempo o computador ficou em suspensão e opção de manter acordado enquanto há tarefa rodando.
- **Ícone perto do relógio e "Iniciar com o Windows"**, com ícone próprio na janela de app.
- **Limpeza ampliada, com prévia:** pacotes de atualização já baixados, cópia da versão anterior (depois de 7 dias) e avisos antigos; logs grandes giram no início.
- **Teste do Canvas por toque** que mede a taxa de acerto (`scripts/ui_touch.py`); alvo maior do ponto de saída em telas de toque.

### Corrigido
- **`/celular` e o diagnóstico de acesso respondiam em cerca de 15 segundos** (a leitura do Firewall exigia administrador e terminava em "acesso negado"). Agora levam menos de 1 segundo e não precisam de administrador.
- **"Iniciar com o Windows" desfazia o próprio clique** se você clicasse duas vezes rápido.
- **Bandeja e atalhos não abriam em pastas com espaço no nome** (por exemplo `C:\Users\João Silva`): os caminhos agora vão entre aspas.
- **Um `\v` mal escapado quebrava o caminho do PowerShell** no `start.ps1`; um teste agora impede caracteres de controle nos scripts.

## [0.2.2] - 2026-11-07

### Adicionado
- **Abre como janela de app** (Edge ou Chrome em modo app, sem abas nem barra de endereço). Sem eles, abre no navegador padrão; `CODE_ROOM_JANELA=navegador` força o navegador. Fechar a janela não encerra o serviço (dica no rodapé); para encerrar, use "Fechar o Code Room".
- **Release pelo GitHub:** o workflow `release.yml` gera o zip e o `Setup.exe` e, quando o SignPath estiver configurado, assina o instalador. Guia em [docs/ASSINATURA.md](docs/ASSINATURA.md).

### Corrigido
- **O ícone da área de trabalho não abria quando a porta 4780 já estava em uso** (por exemplo, outro Code Room). Agora o app escolhe a próxima porta livre, lembra qual foi e, se não conseguir abrir, mostra uma caixa explicando o motivo em vez de falhar em silêncio.
- Os scripts de abrir, fechar, atalhos e atualização passam a ter BOM, para o PowerShell 5 não quebrar os acentos das caixas de diálogo.
- **Celular:** o menu lateral vira uma barra embaixo da tela, com rolagem lateral, e o conteúdo usa a largura toda. O cartão de ferramenta, a tabela de Uso e o cabeçalho de Execução não estouram mais a tela.

## [0.2.1] - 2026-11-07

### Adicionado
- **Mencionar um agente por clique** (Sala, Canvas ou gaveta): o `@Nome` vai para a barra do chat.
- **Abrir no celular, passo a passo:** comando `/celular` no Assistente, botão **Diagnosticar o acesso** e botão **Liberar no firewall do Windows**. O QR de pareamento prefere o endereço do Tailscale.
- **Limpeza de dados antigos com prévia** (Configurações › Execução).
- **Limpar erros** no chat do Assistente.

### Corrigido
- **Antigravity:** acabou o erro "Prompt grande demais". Limite do prompt: 24 mil caracteres.
- **Canvas no celular:** a tela não se atualiza mais no meio do toque em um cartão.
- Comandos locais (`/status`, `/pendencias`, `/celular`, `/ajuda`) respondem antes de apresentar o Assistente à sua IA.

## [0.2.0] - 2026-11-06

### Adicionado
- Primeira versão pública: Assistente com mascote, equipes, ligações entre agentes, Canvas ao vivo, aprovação das entregas, pastas de entrada (lotes), rotinas, uso por IA, acesso pelo celular (desligado por padrão), atualização com SHA-256 e volta automática, instalador e zip portátil para Windows.
