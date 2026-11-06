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

- ✅ Identidade visual (gato no monitor, letreiro pixel), Rádio Lo-Fi (estação com 5 faixas geradas no navegador, 0 MB) e Canvas ao vivo (verde = trabalhando, linha com o trabalho viajando).
- ✅ **Assistente**: um chat só (janela estilo mensageiro). A IA da pessoa lê o manual, e o que entendeu fica gravado na máquina. Propõe projeto, agentes, equipe, skills (inclusive criar uma), ligações e tarefa; cada passo só roda com aprovação.

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
- ⬜ **Servidor MCP do Code Room**: para a IA da pessoa (Claude, Codex…) controlar o Code Room por conexão MCP quando o terminal não for opção. Somente leitura por padrão; criar e iniciar exigem aprovação.
- ⬜ **Ferramentas locais** (ex.: HyperFrames aberto no navegador, ffmpeg, scripts): cadastrar nome, comando ou endereço local e pasta de saída; o agente recebe a ferramenta liberada e a pessoa vê o que ele rodou.
- ⬜ **Hermes na VPS**: assistente de conexão por SSH (host, chave, comando), com teste na hora, e o Hermes aparecendo na triagem do primeiro uso junto com Claude, Codex e Gemini.
- ✅ **Conectar outra IA** (Conexões › Outras IAs): lista com Gemini CLI, OpenCode, Qwen Code, Amp, Copilot CLI, Aider e Goose, ou uma IA própria (programa, argumentos, `{prompt}` ou entrada padrão), com botão **Testar** que roda de verdade. Roda sem shell. Os argumentos de cada IA da lista são sugestões a confirmar com o Testar.
- ⬜ Triagem do primeiro uso com cartões grandes por IA (logo, estado, botão Conectar), incluindo o Hermes e as outras IAs.

### Fase 2: organização e manutenção
- ⬜ **Retenção e limpeza**: política por tipo de dado (histórico de tarefas, saídas, entregas aprovadas, lixeira, worktrees), com limite por tela, botão “Limpar o que é antigo” com prévia do que será apagado e nada apagado sem confirmação. Entregas aprovadas ficam; lixeira esvazia só por ação da pessoa.
- ✅ **Skills por categoria** (vídeo, código, marketing, pesquisa, texto, design), com filtro e contagem. ⬜ Favoritas e escondidas.
- ⬜ **Orquestrações próprias**: salvar um arranjo de agentes, ligações e tarefa como “receita” reutilizável, criado pelo Assistente.
- ✅ Skills que só citam documentos de apoio ausentes (pasta `tools/`) deixam de aparecer como aviso: funcionam sem eles.
- ✅ **Pastas de entrada (lotes)**, em Rotinas: uma pasta do projeto, um agente ou equipe e uma instrução com `{arquivo}`; cada arquivo novo vira uma tarefa, com barra de progresso, tentar de novo as que falharam e faixa de aviso quando o lote termina. O Assistente cria isso pelo chat (`criar_pasta_entrada`). ⬜ Aviso do Windows fora do navegador e aba de resultados com os arquivos gerados.

### Empacotamento (Windows)
- ✅ Zip portátil com Node embutido, dados em `%LOCALAPPDATA%\CodeRoom\data`, ícone e atalhos (testado em pasta limpa, sem Node, com Smart App Control ligado e arquivos marcados como baixados da internet).
- ✅ Instalador `.exe` gerado (Inno Setup, assistente em português, ícone opcional na área de trabalho). **Não executado em teste**: o Windows 11 com Smart App Control barra instaladores sem assinatura.
- ⬜ **Assinatura digital** do instalador (necessária para o Smart App Control): [SignPath Foundation](https://signpath.org/) (gratuito para código aberto), Azure Artifact Signing ou certificado pago.
- ⬜ SHA-256 de cada arquivo publicado junto do Release.
- ✅ **Atualização em um clique** (verificação opcional no GitHub, SHA-256, volta sozinha se a versão nova não abrir). Testada de ponta a ponta. Plano em [LANCAMENTO-V1.md](LANCAMENTO-V1.md).

### Primeiro uso
- ✅ Triagem para conectar as IAs (Codex, Claude Code, Gemini) com o comando exato de instalar ou entrar, e criação de agentes iniciais.
- ✅ Tutorial guiado pelas 12 telas, com opção de pular e de rever pelo menu do usuário.
- ⬜ Incluir na triagem a verificação do ambiente de vídeo (ffmpeg, Python, HyperFrames) e um projeto de demonstração.

### Biblioteca de skills
- ⬜ Biblioteca inicial de skills genéricas, instalada como pasta extra de skills.

### Generalizar o modo de lote
- ⬜ Hoje o lote de vídeo é uma esteira de exemplo que depende de uma skill e de scripts específicos. Tornar o formato configurável.

### Qualidade
- ✅ Teste de toque do Canvas estabilizado (a falha era do teste: escolhia um cartão fora da tela).
- ⬜ Publicação em outras redes além do YouTube Shorts (Instagram).
- ⬜ Instalação e atualização dos CLIs pelo próprio app.

### Plataformas
- ⬜ macOS e Linux.
