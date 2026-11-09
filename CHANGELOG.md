# Novidades

O que entrou em cada versão do Code Room. O texto de cada versão também vira as notas da
[release no GitHub](https://github.com/Igorferreirax/code-room-open/releases).

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e os números seguem o
[versionamento semântico](https://semver.org/lang/pt-BR/): correção sobe o último número (0.2.**1**), novidade sobe o
do meio (0.**3**.0).

## [Não lançado]

### Adicionado
- **Modo piloto do Assistente (opcional, desligado por padrão).** Com ele ligado, o Assistente trabalha como a sua IA no terminal: cria e edita arquivos na pasta do projeto em foco, roda programas liberados (node, git, ffmpeg…), usa skills, as ferramentas MCP da sua conta e o seu Chrome. Nada é postado, enviado ou pago sem o seu "sim", e ele não roda com projeto financeiro em foco. Liga e desliga na barra do chat.
- **"Precisa de você agora" completo:** além dos lotes, o cartão da Sala mostra entregas para revisar (últimos 14 dias), planos do Supervisor para aceitar e receitas esperando aprovação, cada um com botão Abrir. A barra lateral ganha contador (Sala e Entregas), o título da aba mostra o total e o Assistente avisa no sino, com resposta local que não gasta cota.
- **"Trazer pontos do revisor":** em Entregas, preenche o campo de ajustes com os problemas que o revisor listou. Você confere e clica em Solicitar ajustes.
- **Ferramentas MCP liberadas por agente (só Claude Code):** no formulário do agente, o campo "Ferramentas MCP liberadas" aceita nomes de servidores que já estão no seu Claude (ex.: `flow-studio`). Sem isso o Claude, sem ninguém para aprovar, nega toda ferramenta MCP. Agente de leitura com MCP liberado continua sem editar arquivos. Não vale em projeto Financeiro.
- **Assistente com mais autonomia (sempre com o seu clique):** novas ações `criar_canal` (perfil por nicho, com as contas só como @ público) e `criar_rotina` (manual, diária ou semanal), e `navegador` opcional ao criar agente. Ele enxerga os canais e rotinas que já existem. O manual dele agora explica as capacidades do Code Room e a orquestração. Ele continua sem conectar contas nem publicar.
- **Limpeza automática opcional** (Configurações › Execução, desligada por padrão): uma vez por dia apaga só o que a limpeza com prévia já apagaria e avisa quanto liberou.
- **Player da Rádio Lo-Fi recolhível:** começa como um botãozinho discreto; abre com play, próxima faixa e volume, e se recolhe sozinho. Equalizador animado quando está tocando.
- **Balão de conversa ao lado do agente:** clicar em um agente abre um balão colado nele, com estado, o que faz ao vivo e caixa de missão. **Fixar em janela** leva para uma janela lateral (até 3 agentes lado a lado).
- **Sessão ao vivo no chat com o agente:** a linha do tempo da tarefa (ações, resposta chegando, estado) aparece no chat e atualiza sozinha.
- **Servidor MCP** (`server/mcp.mjs`): o Claude Code, o Codex e outras ferramentas consultam o Code Room. Token próprio e revogável, somente leitura por padrão; aprovar e apagar nunca ficam disponíveis. Guia em [docs/MCP.md](docs/MCP.md).
- **Navegador para agentes (opcional, desligado):** por agente, "navegador separado" (Playwright descartável, Claude Code e Codex) ou "o meu Chrome" (só Claude Code). Não vale para projetos Financeiro.
- **Hermes na VPS configurável no app:** servidor, porta, caminho da chave e programa remoto, com teste de conexão e validação rigorosa.
- **Energia:** aviso de quanto tempo o computador ficou em suspensão e opção de manter acordado enquanto há tarefa rodando.
- **Ícone perto do relógio e "Iniciar com o Windows"**, com ícone próprio na janela de app.
- **Limpeza ampliada, com prévia:** pacotes de atualização já baixados, cópia da versão anterior (depois de 7 dias) e avisos antigos; logs grandes giram no início.
- **Teste do Canvas por toque** que mede a taxa de acerto (`scripts/ui_touch.py`); alvo maior do ponto de saída em telas de toque.

### Alterado
- **Ícone do chat minimalista:** sem o círculo em volta, só o mascote. O humor muda a cor do próprio assistente (verde-água tudo certo, amarelo aviso, vermelho falha, verde novidade) e o rodapé deixa espaço para o "Desenvolvido por Bytelab" nunca ficar coberto.
- **"Atividade recente" compacta:** uma linha por atividade e lista com altura máxima e rolagem própria (guarda 20 em vez de 8), sem esticar a página.

### Removido
- **Player de músicas locais** ("Música de foco"): a Rádio Lo-Fi, gerada no próprio navegador, faz o papel dele.

### Corrigido
- **Chat no celular:** a janela deixava a caixa de mensagem e o menu do projeto atrás da barra de baixo; agora fica entre o topo e a barra.
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
