# Roadmap

Legenda: ✅ feito · ⬜ a fazer

Atualizado em 07/11/2026. Para validação e distribuição deste commit, veja [STATUS-2026-11-06.md](STATUS-2026-11-06.md).
Direção do produto e prioridades por fluxo: [VISAO-PRODUTO.md](VISAO-PRODUTO.md).

## Publicado em 07/11/2026
- ✅ **v0.2.0 no ar**: repositório público, Release (zip portátil + Setup.exe + SHA256SUMS) e landing em produção. Checklist e últimas verificações em [ROADMAP-FINAL.md](ROADMAP-FINAL.md).
- ✅ **Assistente × Antigravity**: o "prompt grande demais" vinha das respostas do Assistente gravadas como "entregas" do projeto interno e reinseridas em todo prompt; agora ficam de fora, e o orçamento do prompt do Antigravity é 24 mil caracteres.
- ✅ **Acesso remoto, passo a passo**: botão **Diagnosticar o acesso**, botão **Liberar no firewall do Windows** (regra só para este programa e porta, só para rede local e Tailscale; o Windows pede a permissão), comando **/celular** no Assistente e prompt para Claude Code/Codex em [CELULAR-PROMPT.md](CELULAR-PROMPT.md). O QR prefere o IP do Tailscale. ⚠️ Ainda falta testar com um celular de verdade.
- ✅ Canvas: a tela não é atualizada no meio do toque no cartão. ⚠️ O teste de toque do ponto de saída ainda falha de vez em quando.
- ✅ **Mencionar agente por clique**: clicar em um agente (Sala, Canvas ou gaveta) abre um menu com "@ Mencionar no chat" e "Ver detalhes"; o `@Nome` vai para a barra do chat. Comandos locais (`/status`, `/celular`…) agora funcionam e aparecem antes da apresentação do Assistente. Teste: `scripts/ui_mention.py`.
- ⬜ Pendentes: assinatura digital do Setup.exe (SignPath), domínio da Bytelab na landing (trocar o endereço no SEO), retenção/limpeza de dados antigos, sessão ao vivo por tarefa no chat.

## Estado confirmado nesta atualização
- ✅ Modelo e esforço configuráveis por agente e por missão; testes cobrem validação, isolamento do perfil e argumentos dos três conectores locais.
- ✅ Renomear conversas do Assistente pelo lápis ou duplo clique; Enter salva, Esc cancela. Cobertura de renderização e persistência adicionada.
- ✅ Status ao vivo no contexto do Assistente, com detalhe por projeto, equipe, agente e pasta de entrada; cobertura automatizada adicionada.
- ✅ Painel compacto de Uso por IA usando somente janelas fornecidas pelos provedores; a tabela redundante foi removida, mantendo totais, custos e gráfico de tokens por dia.
- ✅ Checagem opcional do ambiente de vídeo no primeiro uso; leitura local sem instalação silenciosa. O guia de demonstração ainda falta.
- ✅ Histórico de rotinas mostra até 30 execuções recentes e permite abrir tarefas vinculadas; filtros e relatórios completos continuam como melhoria futura.
- ✅ Worktrees para tarefas de escrita isoladas; integração das alterações continua manual.
- ✅ Atualização do app com conferência de SHA-256 e retorno automático já implementada e testada nos testes automatizados.
- ⚠️ Os novos fluxos e o painel de uso ainda precisam de inspeção visual no navegador. O rastreador anterior relatado pelo usuário marcou 160 cliques sem problemas; essa rodada não foi reproduzida nesta sessão.
- ⚠️ O toque para arrastar ligações no Canvas permanece intermitente conforme o relato mais recente; até estabilizar, registrar essa ressalva em vez de marcar como resolvido.

## Feito
- ✅ Backend validado com Codex e Claude Code reais: fila, tentativas, cancelamento da árvore de processos, tempo limite, recuperação após queda.
- ✅ Equipes (desenvolvedor → revisor), supervisor e ligações entre agentes no Canvas.
- ✅ Aprovação antes de sair: `AGUARDANDO_APROVACAO` → `POSTAR_<CANAL>` ou `LIXEIRA`.
- ✅ Rotinas por horário, manuais e por arquivo.
- ✅ Acesso remoto por QR (rede local ou Tailscale), desligado por padrão.
- ✅ Interface em 12 telas, responsiva (360 a 1586 px).
- ✅ Auditoria de segurança automatizada (`npm run audit`).

- ✅ Identidade visual (gato no monitor, letreiro pixel), Rádio Lo-Fi (estação com 5 faixas geradas no navegador, 0 MB) e Canvas ao vivo (verde = trabalhando, linha com o trabalho viajando).
- ✅ **Assistente**: um chat só (janela estilo mensageiro). A IA da pessoa lê o manual, e o que entendeu fica gravado na máquina. Propõe projeto, agentes, equipe, skills (inclusive criar uma), ligações e tarefa; cada passo só roda com aprovação.

- ✅ **Instalador com o visual do Code Room**: assistente do Inno Setup em modo escuro, com a arte pixel das referências (boas-vindas e conclusão), selo do "R", textos em português e arte na tela de progresso. Compilado e conferido na tela (boas-vindas, licença, escolhas e resumo); as telas de progresso e conclusão não foram capturadas porque exigem instalar de verdade. Fica de fora, de propósito: "Todos os usuários" e "Abrir ao entrar no Windows" (ver INSTALADOR-UX.md).
- ✅ **Marca padronizada**: só o nome "Code Room" (texto) no app, na landing e no instalador, com ícone simples "CR" (favicon, atalho e selo do instalador; `installer/make-brand-icons.py`). O gato segue só como rosto do Assistente. ⬜ Um logotipo definitivo fica para depois (o Igor tem uma versão com "R" e porta em branco; falta o arquivo).

- ✅ **Mascote do Assistente**: cabecinha de robô com olhos de LED que muda de humor (feliz, pensando, dormindo, preocupado, alerta, surpreso), acompanha o ponteiro e "fala" um balão ao lado do ícone do chat quando nota algo (ideia vinda do vídeo de referência "Meet every mood"). Comandos `/status`, `/pendencias`, `/ajuda` e avisos proativos com "Me ajude com isso".

## Próximos passos
### Fase 2: ver o trabalho acontecendo
- ✅ **Atividade por agente**: ao passar o mouse no agente (Sala, Canvas, lista e Agentes) a dica mostra o que ele faz agora ou a última coisa que fez, com o motivo da falha.
- ✅ Cartão **Atividade recente** na Sala (últimas 8 atividades do projeto, clicáveis). ⬜ Página própria da linha do tempo, com filtro por agente e por dia.
- ⬜ **Relatórios das rotinas dentro do app** (os lotes já têm progresso e aviso; faltam as rotinas por horário): cada rotina grava o resultado em uma pasta do projeto e aparece em uma aba “Resultados” (ex.: vagas e cursos do dia), com histórico e botão de abrir a pasta.

### Fase 2: um chat só, estilo mensageiro
- ✅ O manual novo não bloqueia mais o Assistente: ele só avisa que dá para reapresentar (o manual vai inteiro em cada resposta).
- ✅ **Chat único estilo Messenger**: janela flutuante com a foto de quem responde, que minimiza para um balão no canto (com aviso de resposta nova) e volta no ponto em que parou. Substitui o painel lateral e a barra de baixo; a missão direta é uma conversa com o agente ou a equipe escolhidos na própria janela.
- ✅ **Várias conversas** com o Assistente (até 8), em abas, cada uma com seu histórico; a resposta volta para a conversa que perguntou. ⬜ Várias janelas abertas ao mesmo tempo e uma conversa por equipe com histórico próprio.

### Fase 2: conectar o Code Room ao mundo
- ⬜ **Servidor MCP do Code Room**: ainda não implementado. Para a IA da pessoa (Claude, Codex…) controlar o Code Room por conexão MCP quando o terminal não for opção. Somente leitura por padrão; criar e iniciar exigem aprovação.
- ⬜ **Ferramentas locais** (ex.: HyperFrames aberto no navegador, ffmpeg, scripts): cadastrar nome, comando ou endereço local e pasta de saída; o agente recebe a ferramenta liberada e a pessoa vê o que ele rodou.
- ⬜ **Configuração guiada do Hermes na VPS**: o conector remoto de leitura já existe e usa `~/bin/hermes.bat`; falta o assistente de configuração/teste por SSH e a apresentação dele na triagem inicial.
- ✅ **Conectar outra IA** (Conexões › Outras IAs): lista com Gemini CLI, OpenCode, Qwen Code, Amp, Copilot CLI, Aider e Goose, ou uma IA própria (programa, argumentos, `{prompt}` ou entrada padrão), com botão **Testar** que roda de verdade. Roda sem shell. Os argumentos de cada IA da lista são sugestões a confirmar com o Testar.
- ⬜ Triagem do primeiro uso com cartões grandes por IA (logo, estado, botão Conectar), incluindo o Hermes e as outras IAs.

### Fase 2: organização e manutenção
- ⬜ **Retenção e limpeza**: política por tipo de dado (histórico de tarefas, saídas, entregas aprovadas, lixeira, worktrees), com limite por tela, botão “Limpar o que é antigo” com prévia do que será apagado e nada apagado sem confirmação. Entregas aprovadas ficam; lixeira esvazia só por ação da pessoa.
- ✅ **Skills por categoria** (vídeo, código, marketing, pesquisa, texto, design), com filtro e contagem. ⬜ Favoritas e escondidas.
- ⬜ **Orquestrações próprias**: salvar um arranjo de agentes, ligações e tarefa como “receita” reutilizável, criado pelo Assistente.
- ✅ Skills que só citam documentos de apoio ausentes (pasta `tools/`) deixam de aparecer como aviso: funcionam sem eles.
- ✅ **Pastas de entrada (lotes)**, em Rotinas: uma pasta do projeto, um agente ou equipe e uma instrução com `{arquivo}`; cada arquivo novo vira uma tarefa, com barra de progresso, tentar de novo as que falharam e faixa de aviso quando o lote termina. O Assistente cria isso pelo chat (`criar_pasta_entrada`). ⬜ Aviso do Windows fora do navegador e aba de resultados com os arquivos gerados.

### Empacotamento (Windows)
- ✅ Zip portátil com Node embutido, dados em `%LOCALAPPDATA%\CodeRoom\data`, ícone e atalhos; rebuilt e smoke-tested em pasta temporária isolada em 06/11/2026 (SHA-256 no checklist de lançamento). Teste em outro computador, sem Node, com Smart App Control continua pendente.
- ⬜ Instalador `.exe`: não foi reconstruído em 06/11/2026 porque Inno Setup 6 não está instalado neste ambiente. A busca por `ISCC.exe` foi ajustada para ignorar caminhos sem acesso.
- ⬜ UX do instalador baseada nas quatro telas de `Tela de Instalação/`; especificação e decisões de segurança em [INSTALADOR-UX.md](INSTALADOR-UX.md). A implementação e compilação ainda estão pendentes.
- ⬜ **Assinatura digital** do instalador (necessária para o Smart App Control): [SignPath Foundation](https://signpath.org/) (gratuito para código aberto), Azure Artifact Signing ou certificado pago.
- ⬜ SHA-256 de cada arquivo publicado junto do Release.
- ✅ **Atualização em um clique** (verificação opcional no GitHub, SHA-256, volta sozinha se a versão nova não abrir). Testes automatizados cobrem consulta, download e instalação; veja [LANCAMENTO-V1.md](LANCAMENTO-V1.md).

### Primeiro uso
- ✅ Triagem para conectar as IAs (Codex, Claude Code, Gemini) com o comando exato de instalar ou entrar, e criação de agentes iniciais.
- ✅ Tutorial guiado pelas 12 telas, com opção de pular e de rever pelo menu do usuário.
- ✅ Checagem opcional do ambiente de vídeo no primeiro uso (ffmpeg, ffprobe, Python, HyperFrames, disco, memória, CPU e integrações da esteira); apenas leitura, sem instalar ferramentas. Projeto de demonstração continua pendente.

### Biblioteca de skills
- ⬜ Biblioteca inicial de skills genéricas, instalada como pasta extra de skills.

### Generalizar o modo de lote
- ⬜ Hoje o lote de vídeo é uma esteira de exemplo que depende de uma skill e de scripts específicos. Tornar o formato configurável.

### Qualidade
- ⬜ Estabilizar o teste de toque do Canvas no celular; o relato mais recente ainda indica falha intermitente.
- ⬜ Publicação em outras redes além do YouTube Shorts (Instagram).
- ⬜ Instalação e atualização dos CLIs pelo próprio app.

### Plataformas
- ⬜ macOS e Linux.
