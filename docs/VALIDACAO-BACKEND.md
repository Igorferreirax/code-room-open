# Code Room — auditoria e validação do backend

Início: 30/10/2026. Este documento é o registro vivo da validação. Nada aqui é marcado como validado sem a evidência indicada.

> **Atualização 06/11/2026:** os registros abaixo preservam rodadas antigas. Estado atual após as melhorias de Uso, onboarding de vídeo e histórico de rotinas: `npm test` passou 167/167 fora da sandbox; `npm run audit` passou 62/62; `npm run check` passou 90/90. Dentro da sandbox, os testes que encerram filhos falharam por restrição de processo; fora dela passaram. Inspeção visual continua pendente. Veja [STATUS-2026-11-06.md](STATUS-2026-11-06.md).

## 1. Auditoria do estado real (antes desta etapa)

Código lido: `server/` (≈270 linhas), `public/`, `test/`, `scripts/`, docs. CLIs instalados: Codex `0.166.0`, Claude Code `2.1.314`, Node `26.7.0`. Codex autenticado por ChatGPT; Claude autenticado por claude.ai (assinatura). Isso é cota de assinatura, não crédito de API.

| Item | Estado | Evidência |
|---|---|---|
| Projetos, agentes, perfil versionado, SQLite, chave local, bloqueio de origem | Implementado e testado | `npm test` (5/5) |
| Execução real Codex (`exec --json`, sandbox `workspace-write`) | **Funciona** | Tarefa A: 57 s, 2 arquivos criados, uso reportado |
| Execução real Claude Code (`--print stream-json`, modo `plan`) | **Funciona** | Tarefa B: 38 s, leu os arquivos reais, modelo reportado |
| Fila | Parcial | Uma tarefa por vez, sem dependências, sem recursos, sem tarefa lógica separada de tentativa |
| Cancelamento | Parcial | `taskkill /T /F` existe mas só foi testado com processo falso; sem prazo nem verificação |
| Reinício | Parcial | Marca `interrupted`, mas não procura processo órfão que continue gravando |
| Entregas | **Ausente** | Só texto da resposta; arquivos criados não são registrados nem servidos |
| Eventos | Parcial | Sequência global, sem `eventId` para deduplicar, sem stream (só polling de 2,5 s) |
| Uso/custo | Parcial | `null` preservado; custo do Claude é equivalente de API (não fatura) e precisa de rótulo; Codex não informa modelo |
| Skills | Parcial | Só "arquivo encontrado"; sem reconhecida/duplicata/compatível/dependências |
| Contexto de projeto, equipes, fluxos, supervisor, paralelismo, módulos | Ausente | — |
| Testes | Fracos | Todos usam processo falso; nenhum cobre árvore de processos real no Windows |

Achados das execuções reais (relevantes para o desenho):

1. A revisão do Claude foi **verificável e correta**: apontou texto com codificação duplicada (`CafÃ©`, BOM). Confirmado por mim nos bytes: 9 ocorrências de `CafÃ©`, 0 de `Café`. O Codex, no Windows, gravou os arquivos com dupla conversão UTF-8. Mitigação: instrução de codificação no prompt base; o defeito permanece como limitação conhecida do executor.
2. O Codex não informa o modelo em `exec --json`: exibir "indisponível".
3. `total_cost_usd` do Claude vem com assinatura: é referência de API, nunca fatura.
4. O Codex emite erro de diagnóstico no stderr mesmo com sucesso (`codex_core::session`), então stderr não pode virar falha por si só.

## 2. Plano executado (ordem)

1. **Contrato**: tarefa lógica (`tasks`) separada de tentativa (`runs`); estados com transições validadas; claim atômico (tabela `claims` com heartbeat); eventos com `eventId`; stream SSE; idempotência por `requestId`.
2. **Executor**: limites global/provedor/recurso; árvore de processos com prazo e verificação; tempo limite; recuperação segura após reinício (verifica identidade do PID antes de encerrar órfão); entregas por snapshot de arquivos (hash, tamanho) servidas com proteção de caminho.
3. **Contexto**: precedência explícita; skills auditadas e habilitadas por agente; contexto por projeto; barreira de dados financeiros.
4. **Equipes e fluxo sequencial** dev → revisor com passagem registrada (`messages`).
5. **Supervisor**: o modelo propõe JSON; o backend valida (agentes, capacidades, ciclos, limites) e cria as tarefas.
6. **Paralelismo** com travas de escrita por projeto e testes de isolamento.
7. **Módulos**: registro de capacidades sondadas; ledger financeiro determinístico como demonstração.
8. Só então a interface pixel art (etapa 9), se os critérios forem atendidos.

## 3. Registro de evidências

Ambiente: Windows 11, Node 26.7.0, Codex 0.166.0 (login ChatGPT), Claude Code 2.1.314 (login claude.ai). Projetos e bancos de teste isolados em uma pasta temporária de testes (nunca nas suas pastas). O custo mostrado pelo Claude é equivalente de API reportado pelo CLI, **não** fatura da assinatura. O Codex não informa custo nem modelo (aparece "indisponível").

### 3.1 Execuções reais (serviço HTTP → tarefa persistida → CLI → arquivos → histórico → entrega)

| # | O quê | Resultado |
|---|---|---|
| A | Codex cria `index.html` + `style.css` a partir de uma tarefa do painel | Concluída em 57 s; 2 arquivos criados; uso 98.715 in / 5.593 out reportado; modelo e custo indisponíveis |
| B | Claude Code revisa a entrega lendo os arquivos reais | Concluída em 38 s; modelo `claude-sonnet-5-5` reportado; veredito REPROVADO por mojibake (`CafÃ©`, BOM), **confirmado nos bytes** |
| C | Fluxo sequencial real Codex → Claude (`POST /api/flows`), já com a instrução de codificação | Codex 50 s + Claude 26 s; veredito `approved`; 0 ocorrências de `CafÃ`, 7 de `Café`, sem BOM; passagem Theo→Iris registrada (2 arquivos com hash, `deliveredAt` preenchido); o revisor conferiu os sha256 e apontou um `@import` de fonte externa |
| D | Supervisor real (Claude propõe JSON) com `autoAccept` | Plano `plan` de 2 passos aceito em 15 s (dependência s2→s1, capacidades `code`/`review`); execução concluída, 1 mensagem de passagem |
| E | Skill de teste com código gerado na hora | Codex **com** a skill terminou com o código; **sem** a skill, não. O evento `context` registra "Skills incluídas: code-room-teste2" |
| F | Duas tarefas reais em projetos independentes (concorrência 2) | Claude 10 s e Codex 11 s com 10,3 s de sobreposição; cada resposta citou só a meta/tema do próprio projeto |
| G | Autenticação ausente (config vazia isolada via `CODEX_HOME`/`CLAUDE_CONFIG_DIR`; credenciais reais intactas) | Codex: `failureKind=auth` (401 Missing bearer); Claude: `failureKind=auth` ("Not logged in · Please run /login") |
| H | Cancelar o Codex real no meio de um comando de shell | Árvore de 21 processos encerrada e confirmada em 1,5 s; sobreviventes 0; processo alheio continuou vivo |
| I | Derrubar o serviço (`taskkill /F`) durante tarefa real e reiniciar | Tarefa e tentativa `interrupted`, dependente `blocked`, motivo explícito, claim liberado. O Codex real já havia encerrado sozinho |
| J | Claude Code real: cancelar durante a geração e estourar tempo limite de 8 s | Cancelado em 1,7 s (árvore de 9 processos, 0 sobreviventes, processo alheio vivo); tempo limite: `failed` com `failureKind=timeout` em 8,9 s, encerramento confirmado |

Reproduzir: `node scripts/validate-real.mjs auth|cancel|claude|restart` (consome um pouco de cota).

### 3.2 Entregas e API

Token curto por tarefa (1 h, HMAC): arquivo registrado → 200 com CSP `sandbox` (sem scripts) e CSS relativo carrega; token adulterado → 403; arquivo não registrado e `..` → 404; sem chave → 401. SSE `/api/stream`: replay em ordem crescente e reconexão com `Last-Event-ID` sem repetir eventos. O login dos CLIs é verificado por `/api/connectors/check` sem expor e-mail. O histórico da v0.1 foi migrado (2 tarefas legadas preservadas).

### 3.3 Testes automatizados (`npm test`, 24 testes, ~20 s, processos reais de agente falso no Windows)

Migração v1→v2, deduplicação por `eventId`, claim atômico; transições inválidas; execução com entregas e uso rotulado; falhas classificadas (código de saída, erro do provedor, auth, pasta inválida, executável ausente); tempo limite com neto de processo; cancelamento sem afetar a tarefa vizinha; reinício com órfão vivo encerrado só após conferir a identidade do PID; heartbeat vencido; concorrência (global, por provedor, escrita exclusiva por projeto, leitores simultâneos, vídeo); dependências e pausa; fluxo sequencial, rodadas limitadas, falha do dev bloqueando a revisão; barreira financeira; precedência do prompt; auditoria de skills; validação do supervisor (agente/capacidade inexistente, campo proibido, ciclo, limite de passos, capacidade não validada); supervisor ponta a ponta; subtarefas com limites; ledger financeiro; token e caminho de entregas; módulos; HTTP.

### 3.4 Skill /alethe

Disponível em `~/.claude/skills/alethe` e lida. É uma skill para a sessão do Claude Code orquestrar CLIs externos com scripts Python (`orchestrate.py`), pasta de estado própria e playbooks. Lacunas para o Code Room: não conhece a API do serviço, exige Python e grava o estado fora do SQLite. Decisão: o núcleo do Code Room **não depende dela**. Ela serve de inspiração (playbooks, perfis, orçamento por onda). Uma skill própria "code-room-supervisor" (prompt do supervisor e exemplos de planos) só vale a pena depois de o supervisor ser usado por um tempo.

### 3.5 Descobertas relevantes

- A auditoria real das skills mostrou **372 arquivos, 366 reconhecidos, 6 sem cabeçalho, 348 duplicados e 69 com dependência ausente**. O "371 skills" da v0.1 contava arquivos, não skills utilizáveis.
- Codex e Claude descobrem `.agents/skills` do projeto sozinhos, e o Codex lembra de sessões anteriores (`~/.codex/state_5.sqlite`). Um teste de skill baseado em fato fixo fica contaminado; o teste válido usa um código novo a cada execução.
- No Windows, um processo neto herda o pipe de saída e atrasava o evento `close`; a tentativa agora fecha no `exit`, com 1,5 s de tolerância.
- O Codex grava arquivos de texto com dupla conversão UTF-8 se não for avisado; o prompt base agora exige UTF-8 sem BOM.

### 3.6 Não validado / pendente

- Tempo limite com o **Codex real** (provado com o Claude real e com processos de teste; o código é o mesmo).
- Worktrees estão implementadas e têm testes de isolamento; falta validação de uso prolongado em repositórios reais. A integração das alterações entre worktrees continua manual.
- Pedido de ajuda entre agentes existe só como subtarefa registrada pela API; os CLIs ainda não têm ferramenta para pedi-la sozinhos.
- Vídeo: só a sonda de codificação do ffmpeg foi validada; nenhuma ferramenta de edição foi.
- Pesquisa e Operações: reservados na arquitetura, sem execução própria.
- Aprovações interativas dentro dos CLIs não são suportadas. A continuação de sessão (`resume`) está implementada para Codex e Claude Code e coberta por testes; Antigravity usa o id de conversa do CLI.
- Medições de RAM/CPU do serviço, do navegador e dos agentes: pendentes (etapa 10).

## 4. Interface pixel art conectada (etapas 9 e 10)

Implementada em `public/` (HTML/CSS/JS sem build): `app.js` (estado, SSE, ações), `views.js` (telas), `office.js` + `sprites.js` (cenário SVG em camadas: fundo, estações com cadeira/pessoa/monitor, mesa e chão, mãos, supervisor e gato). Segue o guia `code-room-referencias/LEIA-ME.md`: sem dados de demonstração, sem porcentagens inventadas, "indisponível" no lugar de zero, custo rotulado como referência de API. Rotinas agendadas **não** foram implementadas (sem backend). Capturas em `docs/evidencias-ui/`.

### 4.1 Validado no navegador (Chromium automatizado, serviço de teste com Codex e Claude reais)

| Verificação | Resultado |
|---|---|
| Entrada | Antes de autenticar só aparece o campo de chave; chave errada mostra erro; chave certa abre o painel |
| Estado vazio | Estações "livres", consumo "indisponível", Enviar desabilitado sem projeto/agente |
| Criar projeto e configurar agente | Pelos diálogos; editar o perfil preserva as capacidades |
| Enviar missão e acompanhar execução real | Codex criou a página; a tela mostrou Executando, tempo decorrido ao vivo, consumo "indisponível" até o provedor informar e, no fim, tokens reportados |
| Abrir entrega | Link temporário abre a página real com CSS e acentos corretos |
| Cancelar | Claude real: Executando → Cancelando → Cancelada em ~1 s, pela interface |
| Consultar erro | Pasta removida: falha `invalid_directory` com motivo, linha do tempo e "Tentar de novo…" com confirmação |
| Trocar de projeto | A missão e o contexto do outro projeto não aparecem |
| Reconexão | Serviço derrubado: indicador "Reconectando…"; ao voltar, "Conectado", com a mesma tarefa e estado |
| Estados dos personagens | Inativo (ZzZ), Executando (linhas de código e mãos animadas), Aguardando dependência (ampulheta), Concluído (check verde), Falhou (alerta), Desconectado e Aguardando decisão implementados; os dois últimos não foram exercitados no navegador |
| Movimento | Ligado: animações rodam; desligado: `animation: none`; aba oculta: `paused`; ao voltar: retomam |
| Teclado e acessibilidade | Estações focáveis com rótulo ("Theo, Desenvolvedor front-end. Falhou. Tarefa: …"), Enter abre a gaveta e move o foco, Esc fecha e devolve o foco; vista em lista e quadro como alternativa ao cenário |
| Telas | As 9 telas renderizam sem erros de console |

### 4.2 Medições (Windows 11, i7-7500U, método: WorkingSet do Windows por processo; soma de processos conta páginas compartilhadas mais de uma vez, então superestima)

| Componente | Condição | Leitura |
|---|---|---|
| Serviço Code Room (node) | ocioso | ≈ 77 MB |
| Serviço Code Room (node) | com Codex ou Claude rodando | ≈ 74 MB (não cresce) |
| Navegador de teste (10 processos Chromium) | painel aberto, cenário animado | ≈ 680 MB somados; heap JS da página ≈ 6 MB, ≈ 570 nós no DOM |
| Codex real em execução | árvore de 21 processos, 12 s após iniciar | ≈ 785 MB somados |
| Claude Code real em execução | árvore de 9 processos, 12 s após iniciar | ≈ 570 MB somados |

São leituras pontuais de uma máquina com outros programas abertos, não garantia de desempenho. O custo dominante são os próprios agentes e o navegador, não o serviço. Ferramentas pesadas (render de vídeo) não foram medidas.

### 4.3 Pendente na interface

- Rotinas (tela 11 de referência) e instalação/atualização de CLIs: não implementadas, de propósito.
- Estados "Desconectado" e "Aguardando decisão" nos personagens: lógica pronta, sem cenário de teste no navegador.
- Fluxo sequencial e plano do supervisor pela interface: telas prontas; o fluxo foi validado antes pela API com provedores reais, e a aceitação de plano pela interface não foi exercitada no navegador.
- Sprites: arte própria simples gerada em código; uma arte final feita por ilustrador pode substituir `sprites.js` sem mudar o resto.
- Nenhuma medição em celular; o layout tem pontos de quebra, mas não foi testado em tela pequena.

## 5. Interface v2 (refeita a partir das 11 telas de referência)

Reconstruída em 30/10/2026: `public/` com `app.js`, `views.js`, `views2.js`, `office.js`, `sprites.js`, `art.js`, `icons.js` e `assets/` (recortes das referências, gerados por `scripts/extract-art.py`). Telas: Entrada, Sala, Projetos, Tarefas, Execução, Equipes, Agentes e ferramentas, Entregas, Skills, Consumo e limites, Rotinas, Conexões e Configurações (3 temas). O escritório interativo continua em SVG por camadas, com estados vindos do backend; as ilustrações decorativas são recortes das referências.

Backend acrescentado para sustentar as telas: aprovar entrega e pedir ajuste (`/api/tasks/:id/approve|request-changes`), limites de duração e orçamento sobre custo **reportado** (`/api/settings/limits`), rotinas por horário ou manuais em America/Sao_Paulo (`/api/routines`, com tarefas perdidas registradas como ignoradas e sem sobreposição), abrir pasta no Explorer, armazenamento, pastas extras de skills e detecção do Gemini CLI (sem conector).

Verificação: 30 testes automatizados (inclui rotinas: fuso, atraso, sobreposição, idempotência por horário); 24 verificações de API em instância real (limites, aprovação, rotinas, pastas de skills, eventos SSE de cadastro, arquivos estáticos); no navegador, as 11 telas renderizam sem erro de script e sem imagem quebrada, e foram exercitados criar rotina, alterar limite, trocar os 3 temas e abrir entrega com pré-visualização.

Pendente: refinamento visual (a interface ainda difere da referência em detalhes; o escritório interativo é mais simples que a arte ilustrada), teste em celular, rotinas por evento de arquivo, estimativa de custo por tabela de preços.

Flow Studio: duas tentativas de gerar sprites falharam (erro "media_id vazio" e depois uma imagem que não correspondia ao pedido, de outro projeto do Flow). Nenhum arquivo do Flow foi incorporado.

### 5.1 Passada de refinamento (30/10/2026, noite)

Comparação tela a tela com as referências em 1586×992 (capturas `docs/evidencias-ui/v4-*.png`). Ajustado: tipografia dos títulos (Century Gothic, fonte geométrica disponível no Windows), cena da Sala de ponta a ponta, faixas de cabeçalho com a arte da referência ancoradas à direita, colunas da tela de Entregas (400/1fr/360), painel lateral que empurra o conteúdo (Rotinas e Projetos), barra "Continuar" de Conexões, título da Execução em uma linha, retratos por papel (supervisor, revisor, editor, desenvolvedor) e a correção do nome da equipe carregada. Telas de Entrada, Configurações, Conexões, Entregas, Consumo, Rotinas e Execução ficaram muito próximas das referências; o escritório interativo da Sala continua mais simples que a ilustração.

### 5.2 Escritório com a arte original (30/10/2026, madrugada)

A Sala agora usa como fundo um quadro do **vídeo de referência** (`scripts/extract-scene.py` gera `public/assets/scene.jpg` e `sup-sit.jpg`): os mesmos bonecos, cadeiras, monitores, gato e supervisor da arte aprovada. Em cima ficam camadas HTML ligadas ao backend (`public/photo-office.js`): brilho no monitor e selo de terminal (executando), véu escuro e ZzZ (inativo), cinza com plugue (desconectado), anel vermelho (falhou), anel verde e check (concluído), âmbar (aguardando). O supervisor aparece em pé no quadro quando está planejando e sentado fazendo carinho no gato nos demais estados (as duas poses vêm do vídeo). Os textos gravados na imagem (Dev/Vídeo/Pesquisa, "nexus", data) são cobertos por plaquinhas com o nome do agente, "code room" e a data de hoje. Limite: a imagem mostra 3 estações fixas com os personagens sempre sentados; mais agentes ficam na vista em lista, e os bonecos não trocam de pose (o estado é indicado pelas camadas).

Testes: `test/ui.test.mjs` (4 testes estáticos: sintaxe dos módulos, toda ação `data-act` tem tratamento, toda tela e formulário está ligado, toda imagem existe). Ele achou um defeito real (botão "Dispensar alerta" sem ação). Pela interface, com provedores reais: plano proposto pelo supervisor (Claude) e aceito no botão; Theo criou `notas.txt` e Iris revisou; "Solicitar ajustes" gerou nova tarefa do Theo que atualizou o arquivo, e a entrega original ficou marcada como "ajustes solicitados".

### 5.3 Rodada de pendências (31/10/2026)

Rotinas por evento de arquivo (`server/routines.mjs`: `fs.watch` recursivo, extensão opcional, ignora `.git/node_modules/.data`, intervalo mínimo de 60 s, não dispara enquanto a rotina executa; teste com pasta real). Tabela de preços informada pelo usuário em Consumo (`/api/settings/prices`): a "estimativa adicional" só cobre tarefas sem custo reportado e nunca é apresentada como cobrança. Estações da Sala ordenadas por atividade. `scripts/ui_smoke.py` (`npm run test:ui`): Chrome instalado + Playwright do Python, 75 verificações (sem erro de console, sem imagem quebrada, sem rolagem horizontal, painéis, gaveta por teclado, temas, preços); achou 8 estouros de largura no celular, corrigidos. Testes: 35 de Node + roteiro de navegador.
