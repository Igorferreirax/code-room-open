# Novidades

O que entrou em cada versão do Code Room. O texto de cada versão também vira as notas da
[release no GitHub](https://github.com/Igorferreirax/code-room-open/releases).

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e os números seguem o
[versionamento semântico](https://semver.org/lang/pt-BR/): correção sobe o último número (0.2.**1**), novidade sobe o
do meio (0.**3**.0).

## [Não lançado]

## [0.3.4] - 2026-11-11

### Adicionado
- **Cara nova:** logo nova (o personagem pixel com o notebook) no app, no ícone do Windows, no instalador, na landing e no README; banner largo da sala acima da conversa no Início, no lugar do cartão pequeno ao lado do “Bom dia”; e um aviso, uma vez só, para quem atualiza: “O Code Room está de cara nova”, com a lista das novidades.
- **Avisos no Telegram e no Gmail** (Conexões › Avisos): o resultado das rotinas chega no seu celular ou no seu e-mail. O Telegram usa o seu bot e acha a conversa sozinho depois do `/start`; o Gmail usa uma senha de app (a senha da conta nunca é pedida). Cada rotina escolhe onde entregar; o histórico mostra se o envio deu certo. Projetos Financeiro nunca enviam.
- **Painel de métricas** (Conexões › Redes e métricas): inscritos, visualizações, vídeos e o desempenho dos últimos vídeos do YouTube conectado, com a variação da semana e um gráfico da evolução; mais a contagem de postagens publicadas pelo Code Room em cada rede nos últimos 30 dias. Lê o YouTube no máximo a cada 30 minutos.
- **Logos oficiais das IAs** (OpenAI/Codex, Claude, Gemini e Antigravity) em Conexões, Agentes e Consumo.
- **Canvas com zoom e “mãozinha”:** a rodinha do mouse aproxima e afasta no ponto do cursor, arrastar o fundo passeia pelo fluxo, os botões + e − e “Ver tudo” enquadram todos os agentes. Os cartões podem ir para qualquer lado, sem limite de espaço. Zoom e posição ficam guardados por projeto.
- **Terminais do Canvas com campo de mensagem:** “Mostrar terminais” mostra a saída ao vivo de cada agente, com barra de rolagem que funciona e o campo “Mensagem para (agente)” embaixo. O modo “Terminais” separado saiu da barra da Sala (quem usava abre direto no Canvas com os terminais).
- **Botão de atualização no topo:** fica verde com um ponto quando sai versão nova; um clique baixa (com animação e porcentagem) e confere o arquivo; depois vira “Instalar”. Não precisa mais abrir Configurações › Atualizações.
- **Corrigir o modelo e repetir:** quando a IA recusa o nome do modelo (ex.: “Gemini Flash 3.8”), a tarefa mostra esse botão; o Code Room troca pelo modelo aceito mais parecido (`gemini-3.8-flash-medium`) e roda de novo. Nomes aproximados também são convertidos ao salvar o agente.
- **Chat do Assistente mais limpo:** cabeçalho só com o menu ☰, o rosto e o nome; as conversas e os ajustes (Piloto, Voz, Avisos do Windows, IA que responde, Limpar) ficam no menu lateral. Boas-vindas com o Nico grande no centro, bolhas arredondadas (as suas em azul) e campo de mensagem em pílula.
- **“Tirar do projeto (mantém o perfil)”** ao lado de “Excluir agente” no painel do agente; o “x” da equipe explica que só tira da equipe.
- **Biblioteca de agentes** (Agentes › Biblioteca): 12 especialistas prontos, entre eles Auditor de segurança, Programador, Revisor de código, Arquiteto, Testador, Pesquisador, Redator, Diretor de vídeo, Designer de interface, Analista de dados, DevOps e Documentador. **Equipes prontas** (código, vídeo, revisão de segurança) contratam quem falta, montam a equipe e trazem tudo para o projeto. O Code Room sugere a IA de cada um entre as conectadas.
- **Modo Terminais na Sala** (no lugar da Lista): um painel por agente com a saída ao vivo da tarefa dele no projeto, de quem ele recebe e para quem passa o trabalho, e um campo para mandar mensagem direto ao agente.
- **Boas-vindas do dia** no Início: uma vez por dia, mostra entregas esperando revisão, tarefas com problema, pedidos aguardando aprovação e projetos parados, com o atalho para ver com o Assistente por onde começar.
- **Assistente com nome e personalidade:** chama-se Nico por padrão (o lápis no topo do chat troca o nome) e fala de forma cordial e direta, avisando o que está parado.
- **O Assistente escolhe a IA e o modelo de cada agente:** ele recebe as IAs instaladas, os modelos de cada uma e para que cada uma serve (a mais forte orquestra e revisa).
- **Corrigir com a IA aplica a correção:** o Assistente recebe o motivo da falha e propõe `ajustar_agente` (trocar IA, modelo, esforço ou permissão) e `repetir_tarefa`; você aprova cada passo.
- **Testar resposta** das IAs embutidas (Conexões e tela da tarefa com falha) e teste automático ao criar um agente, para o erro aparecer na hora.
- **Terminais dentro do Canvas:** o botão “Mostrar terminais” transforma cada agente do Canvas num painel com a saída ao vivo, ligado aos outros pelas linhas.
- **Ida e volta entre agentes:** a caixa “ida e volta” ao criar a ligação (ou `ida_e_volta` pelo Assistente) cria os dois sentidos de uma vez: um agente passa o trabalho e o outro responde.
- **Memória do Assistente:** peça para ele lembrar de algo e ele propõe `guardar_nota`. Vai para o seu Obsidian quando a escrita está permitida; senão fica só neste computador e entra nas próximas conversas. Senhas e chaves são recusadas.
- **Tirar do projeto** agora vale também para quem só aparecia por já ter trabalhado nele (o histórico continua guardado).
- **Excluir projeto** (painel do projeto): tira do Code Room sem apagar a pasta nem o histórico.
- **Equipe pela leitura da pasta:** ao criar ou importar um projeto, o Assistente pode ler README, dependências e estrutura (somente leitura) e propor a equipe.
- Convite para importar skills ou instalar as iniciais já no primeiro acesso. “Todos os projetos (geral)” no seletor do topo.
- Início, skills iniciais, sugestão de equipe, login das CLIs pelo terminal oficial e suporte ao Kiro CLI.

### Corrigido
- **Repetir uma tarefa usava o agente antigo:** a tarefa guardava a cópia do agente de quando foi criada, então trocar o modelo, a IA ou a permissão (por você ou pelo Assistente) não valia ao repetir. Agora repete com o agente como ele está.
- **Falha de modelo inválido** aparecia como “erro de saída” genérico; agora é reconhecida (“model”) e o “Testar a IA deste agente” explica o que fazer.
- Logo com brilho vazando para fora dos cantos arredondados; cartão de dica do Início com imagem espremida.
- **Antigravity terminava com “O provedor terminou sem devolver resposta”:** em somente leitura devolvia só um plano e, ao tentar rodar um programa, a execução sem tela negava e saía sem resposta. O pedido agora avisa a CLI, e a falha aparece explicada (“ferramenta negada”), com a mensagem da CLI no motivo.
- **Projetos Financeiro recusam o Antigravity**, que pesquisa na web por conta própria.
- “Continuar a conversa” listava os agentes do projeto aberto, e não os do projeto da tarefa.
- Escolher “Sem projeto” no Início era desfeito sozinho na atualização seguinte da tela.
- Agente criado com um projeto em foco não aparecia na Sala; agora já entra no projeto.
- O modelo usado pelo Codex aparecia como “não informado”; agora mostra o padrão do `config.toml`.

### Melhorado
- **Conexões** em cinco abas (IAs, Notas e chaves, Redes e métricas, Avisos, Avançado), sem o cartão “Em breve” e sem o passo a passo depois de configurado.
- Isolamento por projeto na Sala, no chat, no Canvas, nos fluxos e nos planos do Supervisor.
- Foco visível pelo teclado, retorno ao passar o mouse e alvos de toque maiores nos painéis novos.
- Todos os roteiros de interface atualizados; `npm test` com limite de tempo por teste.

## [0.3.3] - 2026-11-10

### Adicionado
- **Diff textual das entregas e do Modo Piloto:** compara arquivos de texto pequenos, lista arquivos criados, alterados ou removidos e oferece o atalho “Ver arquivos e diff” na resposta do Assistente. Arquivos secretos conhecidos são excluídos da prévia e padrões de credenciais em linhas são mascarados; binários e arquivos grandes ficam sem diff.
- **Canais e redes sociais:** ícones próprios por rede e cartões que mostram identidade, perfis e agente Postador.
- **Rádio Lo-Fi:** as animações WebP do radinho indicam reprodução, ajuste de volume e próxima faixa, respeitando redução de movimento.

### Melhorado
- **Contexto do Assistente por projeto:** ao alternar entre projetos, o chat reabre a conversa daquele projeto e não envia ao modelo o histórico de outro. Projetos antigos sem escopo continuam preservados como conversas gerais.
- **Passagem entre agentes na Sala:** a missão mostra a sequência de agentes, abre cada etapa e oferece ir ao mapa do Canvas. O Cenário ganhou movimento de respiração sutil para agentes ociosos, respeitando a preferência de movimento.
- O Assistente reutiliza por 15 segundos o catálogo de skills externas, evitando varrer as mesmas pastas a cada atualização do painel.
- No primeiro acesso, a pessoa pode escolher como quer ser chamada; o nome fica só nas preferências locais do navegador e não entra nos pedidos aos agentes.
- Configurações › Atualizações agora destaca o estado da versão e a ação de verificar/atualizar, mantendo a versão instalada, o horário e a escolha de atualização automática visíveis.
- O player usa caminhos absolutos para as artes locais do rádio; animações WebP são servidas pelo pacote do app.
- A confirmação de encerramento agora considera processos ainda vivos e registra o tempo gasto para confirmar a árvore.
- Repetir uma tarefa interrompida explica que a execução pode ter deixado arquivos ou efeitos externos.
- O build do pacote portátil preserva arquivos independentes já existentes na pasta de saída.
- O roadmap registra as lacunas para canais multi perfil, Google/Gmail e descoberta de skills externas.

## [0.3.2] - 2026-11-09

### Adicionado
- **Equipe do projeto (trazer e tirar):** painel do projeto › “Equipe deste projeto” e o seletor “Trazer” na Sala/Canvas colocam um agente ou uma equipe inteira no projeto. Com agentes trazidos, o Canvas, a Sala e a lista do chat mostram só quem é do projeto, com “Mostrar todas as equipes e agentes (geral)” para ver tudo. Só organiza a tela: permissões e liberações de cada agente não mudam.
- **Excluir agente e equipe** (antes não havia como): pedem confirmação, recusam agente com tarefa em andamento ou que está numa equipe, e limpam ligações e vínculos do projeto. Ficam registrados no histórico de ações.
- **Canvas e Sala por projeto:** ao entrar num projeto com gente (vinculada ou que já rodou tarefa nele), o padrão é mostrar só ela; “Todos” continua a um clique no filtro Ambiente.
- Ícones padronizados: 👥 equipe e 🤖 agente nas listas (o nome “Equipe Equipe de…” deixou de repetir).
- **Corrigir com a IA:** na tarefa com problema, um botão manda o motivo ao Assistente, que diz a causa e propõe a correção (liberar programa ou ferramenta, ajustar o agente) para você aprovar.
- **Skills favoritas e escondidas** (tela Skills): estrela para favoritar (vão para o topo) e “Esconder da lista”, com filtros próprios. É só preferência de exibição deste navegador.
- **YouTube**: o cartão antigo “Publicação” foi para dentro de Redes sociais (“YouTube e Google”), sem duplicar.
- **Redes sociais** (Conexões): cadastre contas de YouTube, Bluesky, Mastodon, Telegram e Discord (publicam) e de Instagram, X, TikTok, Threads, LinkedIn e Facebook (pacote pronto). Cite `+apelido` em qualquer pedido ou rotina: o agente propõe a postagem e você aprova texto e horário no chat. Agendamento, limite diário por conta, nada publica sem aprovação e senhas só no computador. Veja `docs/REDES-SOCIAIS.md`.
- **Repetir todo dia**: botão na tela da tarefa e em “Você pediu” abre a rotina já preenchida; modelos de rotina (notícias, cursos gratuitos, vagas, post do dia).
- **Pesquisar na web** (opção do agente, só Claude Code): busca e leitura de páginas para rotinas de pesquisa; bloqueado em projeto Financeiro; ligado no modo piloto.
- **Rádio lo-fi em pixel art:** o botão da rádio é o radinho (imagem de 5 KB). Clicar liga (ele balança de leve, o visor acende e sobem notinhas) e clicar de novo para o som, sem abrir painel. Enquanto toca, uma barrinha de volume (e a próxima faixa) aparece grudada nele. Sem movimento ligado, fica parado.
- **O que o Code Room enviou** (Conexões): as últimas chamadas para fora das redes sociais, do YouTube (login e upload), da verificação de atualização e da Biblioteca de APIs, com chaves e senhas mascaradas, para você conferir exatamente o que saiu.
- **Privacidade e segurança no padrão de projeto aberto:** [docs/PRIVACIDADE.md](docs/PRIVACIDADE.md) lista o que fica no computador, o que sai, para onde e quando, e um teste falha se o código chamar um endereço que não esteja listado. CI no GitHub (Windows) com permissão mínima e ações presas a um commit, rodando sintaxe, testes e auditoria. Seção de privacidade no README e regra no CONTRIBUTING.
- **Economia de tokens** (Consumo): “Onde os tokens foram” por agente, projeto e dia; sugestões para gastar menos (modelo mais leve, menos esforço, outra IA quando o limite do Claude passa de 80%) que você marca, aplica e pode desfazer; teto diário de tokens que avisa em 80% e impede iniciar novas tarefas no limite.
- **Agente bloqueado vira “Liberar” com um clique**: quando o Claude nega um programa, um MCP ou a pesquisa na web por falta de liberação, a tarefa mostra o que faltou (com “Liberar” e “Liberar e pedir de novo”), o chat avisa e “Precisa de você agora” lista. Programas que dão controle total do computador (PowerShell, cmd, rm…) nunca são oferecidos; Financeiro continua bloqueando MCP e web.
- **Levar para outras IAs** (Conexões): copia skills e servidores MCP do Claude Code para o Codex e o Antigravity (Gemini), sem sobrescrever, com backup e sem mostrar chaves.
- **Canvas expansível** (botão Expandir, Esc recolhe) para ver muitos agentes trabalhando.
- **Efeitos leves** (só CSS e um ouvinte de mouse, sem biblioteca; respeitam “reduzir movimento”): brilho discreto nos botões e foco luminoso no campo de mensagem.
- **Biblioteca de APIs** (Conexões): guarda chaves (GitHub, OpenAI, Anthropic, Gemini, Groq, OpenRouter, ElevenLabs e outras), testa e mostra o consumo quando o serviço informa.
- **Pastas de referência (somente leitura) por projeto:** os agentes só enxergam a pasta do projeto; agora você libera outras pastas (ex.: o repositório de onde vêm as ofertas) como uma **cópia somente leitura** em `.referencias/`, refeita antes de cada tarefa. O original nunca é alterado, segredos (`.env`, chaves, bancos, `node_modules`, logs) e arquivos grandes ficam de fora, com limites de tamanho. Projetos Financeiro não usam.
- **Memória do projeto:** ao aprovar uma entrega, o Code Room sugere uma linha para "Decisões" do projeto (título, primeira frase do resumo e a observação da revisão). Você aceita (e pode editar) ou descarta; só entra no contexto dos agentes se aceitar.
- **Histórico de ações** (Configurações › Histórico): quem iniciou, aprovou, pediu ajustes, cancelou, repetiu, liberou créditos ou confirmou publicação, em qual projeto, por qual agente, por onde (computador ou celular) e quando.
- **Planos, receitas e pedidos de ajuda aprováveis no chat**, ao lado das entregas.
- **Simular antes de rodar:** na conversa com uma equipe, o botão "Simular antes de rodar" confere equipe, agentes, IA instalada, regras do projeto Financeiro e permissões, e mostra o que cada agente poderá fazer, sem criar tarefa nem gastar cota.
- **Condições nas ligações entre agentes:** "sempre", "só se aprovado" ou "só se reprovado" (por exemplo, revisor reprovou → volta ao desenvolvedor).
- **Agentes pedem ajuda a outros agentes, com a sua aprovação:** o agente termina a resposta com um pedido; ele aparece em "Precisa de você agora" e no chat, e só vira tarefa (filha da original, com o resumo e os arquivos) se você aprovar. Limites de profundidade e de pedidos por tarefa valem.
- **Versionamento com Git/GitHub no projeto:** no painel do projeto (Contexto), veja a branch, as alterações ainda sem commit, o remoto e os últimos commits; "Iniciar o Git neste projeto" cria o repositório; se o GitHub CLI (`gh`) estiver logado, aparecem também os pull requests abertos e as últimas verificações. Em Entregas, **"Commitar no Git"** cria um commit local só com os arquivos da entrega, e a opção **"Commitar automaticamente quando eu aprovar uma entrega"** faz isso ao aprovar. Nada é enviado (push) e nenhuma chave é guardada: usa o login que você já tem. Projetos Financeiro nunca commitam sozinhos.
- **Voz no chat (fase 1):** botão de microfone para ditar em vez de digitar (o texto aparece no campo e você revisa antes de enviar) e interruptor **Voz** que lê um resumo curto das respostas do Assistente. Usa só o navegador (sem chave nem servidor); o microfone exige localhost ou https.
- **Novo projeto dentro de uma pasta que você cita:** "crie o projeto X dentro de C:\Trabalho" (Assistente, ação `criar_projeto` com `pasta_pai`) e a caixa "Criar uma subpasta nova com o nome do projeto" no formulário. A pasta precisa existir; pastas do sistema (Windows, Arquivos de Programas, .ssh…) são recusadas.
- O chat do Assistente informa em cada pergunta quais fontes de contexto foram incluídas: projeto, tela aberta e quantidade de referências do Obsidian. Isso não altera o conteúdo enviado; torna o contexto visível no histórico.
- O roadmap foi reconciliado com os recursos das versões 0.3.0 e 0.3.1 e agora separa itens entregues de pendências reais.
- O app usa o mesmo monograma `CR` gerado para o ícone do instalador e aplica uma pilha tipográfica de sistema consistente, sem depender de Poppins ou Century Gothic instaladas.

### Corrigido
- **Navegador separado dos agentes dava `CONNECT_TIMEOUT`:** o `npx @playwright/mcp@latest` levava ~25 s para subir e estourava o tempo de conexão do MCP. Agora o Code Room usa a cópia já baixada (sobe em ~2 s) e deixa o `npx` só como reserva.
- **Mensagem do chat que sumia:** se o envio ao Assistente falhava (ocupado, IA fora, serviço reiniciando), a mensagem aparecia e depois desaparecia, e o texto era apagado. Agora o texto continua na barra e o aviso explica. Com o Code Room fora do ar, a mensagem diz isso em vez de “Failed to fetch”.

## [0.3.1] - 2026-11-09

### Adicionado
- **Obsidian (opcional, em Conexões):** vincule o seu cofre para os agentes usarem as suas notas como referência. A cada tarefa, o Code Room envia à IA só um trecho curto das notas mais parecidas com o pedido (com pasta do cofre por projeto e pastas ignoradas; projetos Financeiro nunca recebem). Escolha entre **"Só ler"** (padrão) e **"Permitir alimentar o Obsidian"**: ao aprovar uma entrega, cria uma nota nova numa pasta de destino sua, sem nunca editar ou apagar as suas notas. Há também "Salvar no Obsidian" em Entregas.
- **Cartões de aprovação no chat do Assistente:** vídeo, imagens e prévias de lote aparecem no chat com Aprovar, Pedir ajustes e Abrir. Aprovar nunca publica.
- **O Assistente sabe o que você está vendo:** a tela, o projeto e a entrega abertos entram no pedido, para "isto" e "esta tela" fazerem sentido.
- **Sala por projeto:** o filtro ganhou "Deste projeto" (abre sozinho quando o ambiente dos agentes combina com o nome do projeto, como "Achadinhos").
- **Interruptor Conversa/Piloto** no cabeçalho do chat.
- **O chat mostra o que você pediu a uma equipe ou agente**, com o andamento ("Em andamento: Desenvolvedor", "Concluída", "Parou") e o botão Abrir. Antes, depois de enviar, o texto sumia da tela.
- **Atividade ao vivo do piloto** no balão "Pensando…" (a última ferramenta que a IA usou) e aviso quando o piloto roda com uma IA que não é o Claude (sem MCP nem Chrome).
- **O Assistente também usa o Obsidian** nas conversas (mesmas regras: só se ligado, só trechos, nunca em projeto Financeiro). O trecho de cada nota inclui o pedaço em que as palavras do pedido aparecem.
- **"Fechar o Code Room" pergunta antes se houver tarefa rodando** (`stop.ps1 -Seguro` recusa em scripts; `-Forcar` fecha mesmo assim).

### Alterado
- **Entregas redesenhadas:** uma entrega por tarefa (não um arquivo por linha), arquivos de trabalho (logs, scripts) recolhidos, filtro "Para revisar" e a decisão (Aprovar / Pedir ajustes) sempre à vista, com bem menos texto.
- **Chat mais limpo:** cabeçalho em duas linhas, avisos compactos e o aviso do piloto como uma linha discreta.
- **Menu lateral em 3 grupos** (trabalho, equipe e sistema) com separadores finos.
- **"Precisa de você agora"** separa o que é do projeto atual do que está em outros projetos e abre direto a entrega mais recente.

### Corrigido
- **Tarefa interrompida por reinício não podia ser retomada** ("Limite de 1 tentativa atingido"): a rota gravava o novo limite só em memória. Agora o "Tentar de novo" confirmado funciona e o revisor que ficou bloqueado por ela volta a esperar.
- **A tela aberta e as notas do Obsidian eram cortadas do pedido ao Assistente** quando o estado era grande; agora têm seção própria e nunca são cortadas.
- **O chat quebrava para uma equipe sem membros** (função `avatar` sem importar).
- **Janelas do Explorer abrindo sozinhas:** testes automáticos clicavam em "Abrir pasta"; servidores de teste nunca abrem janelas.
- **A lista de skills demorava 1 a 2 s (até 20 s com o computador ocupado):** agora fica em cache por 15 s.
- **Testes de processo instáveis sob carga:** a suíte roda com concorrência limitada.

## [0.3.0] - 2026-11-09

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
