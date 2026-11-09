# Code Room 0.3.0

Atualização da 0.2.2. Para Windows 10/11. Se já usa o Code Room, use o botão Atualizar dentro do app.

## Novidades
- **Modo piloto do Assistente (opcional, desligado por padrão):** com ele ligado, o Assistente trabalha como a sua IA no terminal: cria e edita arquivos na pasta do projeto em foco, roda programas liberados (node, git, ffmpeg…), usa skills, as ferramentas MCP da sua conta e o seu Chrome. Nada é postado, enviado ou pago sem o seu "sim", e ele não roda com projeto financeiro em foco. Liga e desliga na barra do chat.
- **"Precisa de você agora":** a Sala mostra o que espera por você (entregas para revisar, planos para aceitar, receitas e lotes), com contador na barra lateral e no título da aba. O Assistente avisa no sino, sem gastar cota. Em Entregas, **"Trazer pontos do revisor"** preenche o pedido de ajustes com os problemas que o revisor listou.
- **Ferramentas MCP por agente (só Claude Code):** libere, por agente, servidores que já estão no seu Claude (por exemplo `flow-studio`). Sem isso, o Claude sem ninguém para aprovar nega toda ferramenta MCP.
- **Conversa direta com o agente:** clique em um agente na Sala ou no Canvas e abre um balão ali do lado dele, com o estado, o que ele está fazendo ao vivo e uma caixa de missão. **Fixar em janela** leva para uma janela lateral (até 3 agentes lado a lado). A linha do tempo ao vivo também aparece no chat com o agente.
- **Assistente mais capaz:** propõe a criação de **canais** por nicho e de **rotinas** (manual, diária, semanal), e pode propor agentes com navegador. Você aprova cada coisa com um clique, e ele nunca conecta contas nem publica.
- **Servidor MCP:** o Claude Code, o Codex e outras ferramentas consultam o Code Room (e, se você liberar, criam tarefas) com um token próprio e revogável. Veja `docs/MCP.md`.
- **Navegador para agentes (opcional, desligado):** por agente, um navegador separado e descartável (Claude Code e Codex) ou o seu Chrome (só Claude Code). Não vale para projetos Financeiro.
- **Hermes em um servidor seu:** configure servidor, porta e chave em Conexões e teste a conexão.
- **Fica no Windows como um app:** ícone próprio na janela, ícone perto do relógio, "Iniciar com o Windows" e, se quiser, manter o computador acordado enquanto há tarefa rodando. O app avisa se o computador dormiu.
- **Rádio Lo-Fi recolhível** no canto da tela (substitui o player de músicas locais).
- **Limpeza:** prévia ampliada (pacotes de atualização, versão anterior, avisos) e limpeza automática opcional uma vez por dia.
- **Visual:** ícone do chat minimalista (o humor muda a cor do mascote), "Atividade recente" compacta e no celular o menu vai para uma barra embaixo.

## Correções
- No celular, a janela do chat não deixa mais a caixa de mensagem atrás da barra de baixo.
- `/celular` e o diagnóstico de acesso passaram de cerca de 15 segundos para menos de 1 segundo, sem precisar de administrador.
- "Iniciar com o Windows" não desfaz mais o próprio clique em cliques rápidos.
- Bandeja e atalhos funcionam em pastas com espaço no nome.

## Limites conhecidos
- Só Windows. O instalador ainda não tem assinatura digital: o Windows 11 com o Controle Inteligente de Aplicativos bloqueia o `Setup.exe`. **Use o zip portátil** (`docs/ASSINATURA.md`).
- O modo piloto usa uma lista fixa de programas; qualquer outro é negado, porque o app roda a IA sem ninguém para aprovar comandos na hora.
- Os agentes não criam tarefas para outros agentes por conta própria: o trabalho passa por ligações, equipes ou plano do Supervisor, e o Assistente propõe ações que você aprova.
- O arraste de ligações por toque no Canvas funciona em cerca de 98% das tentativas automáticas.

Licença MIT. Desenvolvido por Bytelab.
