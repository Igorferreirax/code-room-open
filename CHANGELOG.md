# Novidades

O que entrou em cada versão do Code Room. O texto de cada versão também vira as notas da
[release no GitHub](https://github.com/Igorferreirax/code-room-open/releases).

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e os números seguem o
[versionamento semântico](https://semver.org/lang/pt-BR/): correção sobe o último número (0.2.**1**), novidade sobe o
do meio (0.**3**.0).

## [Não lançado]

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
