# Implementação 0.1.0

## Arquivos e responsabilidade

- `server/main.mjs`: HTTP local, autenticação por chave, validação de origem/host, API e arquivos estáticos permitidos.
- `server/store.mjs`: SQLite e persistência de registros/eventos.
- `server/connectors.mjs`: descoberta dos executáveis, argumentos e normalização de saída.
- `server/runner.mjs`: fila serial, construção de contexto, processo, prazo, cancelamento e recuperação após reinício.
- `server/skills.mjs`: catálogo local, caminhos de origem e IDs estáveis.
- `public/`: interface HTML/CSS/JavaScript sem build nem dependências.
- `scripts/start.ps1`: inicialização no Windows e abertura com chave no fragmento da URL.

## Contratos atuais

Project: `id`, `name`, `path` canônico e `createdAt`.

Agent: `id`, `name`, `role`, `room`, `provider` (codex/claude), `model` opcional, `instructions`, `mode` (read/write), `skillIds` e `revision`. Renomear ou mudar ambiente mantém o ID. Ambiente aceita texto livre e não cria processos.

Run: `id`, `requestId` para idempotência, snapshots `project` e `agent`, `prompt`, `status`, `answer`, `usage`, datas e informações de sessão/modelo quando disponíveis. Uma tarefa é uma sessão nova. Resultado repassado é texto contextual, não retomada nativa nem mensagem automática a outro agente.

Event: sequência SQLite, execução, tipo normalizado, texto/uso e data. Tipos: session, activity, answer, result, usage, error, diagnostic, status. Não exibir campos de raciocínio interno como conversa do agente.

Usage: entrada, saída, cache lido, cache escrito quando disponível, custo USD retornado pelo provedor. `null` significa indisponível; não zero. Custos de API retornados por uma ferramenta não são apresentados como fatura de assinatura. O resultado final substitui o uso parcial da mesma tarefa.

Estados: queued → running → completed/failed/cancelled; reinício converte pendências em interrupted. Cancelar tarefa pendente não a inicia. Não retomar nem repetir automaticamente uma execução com efeitos incertos.

## API

Todas as rotas `/api/` exigem `X-Code-Room-Key`. POST exige JSON. Hosts aceitos: localhost e 127.0.0.1 na porta configurada. Origens externas são negadas. HTML/JS/CSS são públicos, dados autenticados. Não há exposição remota nesta versão.

- GET `/api/state`: catálogo, 200 tarefas recentes, conexões e memória do serviço.
- GET `/api/skills?project=<id>`: skills do usuário e projeto.
- GET `/api/runs/<id>`: tarefa completa e até 300 eventos.
- POST `/api/projects`: cadastrar pasta canônica existente.
- POST `/api/agents`: criar/editar perfil com revisão.
- POST `/api/runs`: enfileirar tarefa idempotente.
- POST `/api/runs/<id>/cancel`: cancelar.

Variáveis opcionais: `CODE_ROOM_PORT` e `CODE_ROOM_DATA`. O iniciador Windows usa a porta padrão 4780; instalações customizadas devem usar o terminal e a URL correspondente.

## Skills e permissões

O processo usa a pasta do projeto e ambiente herdado; não substitui diretórios de configuração dos provedores, não ativa modos bare/safe nem desliga skills. A seleção explícita inclui até oito arquivos SKILL.md (24 mil caracteres por arquivo) e informa o caminho para referências relativas. Catálogo nativo de plugins continua a cargo de cada CLI.

As políticas pertencem ao provedor. O modo de leitura é sandbox read-only no Codex e plan no Claude; eles não são garantias idênticas de isolamento. MCP, plugins, skills e hooks instalados podem ter ferramentas externas. Usar projetos e integrações confiáveis, conforme os controles do próprio provedor. O painel ainda não implementa uma política de ferramentas independente nem aprovações interativas.

## Verificações realizadas

Cinco testes passaram sem chamadas pagas: persistência/recuperação, normalização, execução serial e Unicode em chunks, cancelamento de pendência, HTTP com autenticação/origem/validação. Sintaxe do cliente e servidor verificada pelo Node. Serviço real consultado por HTTP: CLIs encontrados, 371 skills e aproximadamente 60 MB RSS.

Pendente: fluxo no navegador (host de automação indisponível), primeira tarefa real em cada provedor, permissão e cancelamento de processos reais, medições de carga, retomada interativa, isolamento de execução remota. Não considerar essas verificações aprovadas apenas porque os testes locais passaram.

## Atualização 0.2.0 (contratos que substituem os acima onde diferem)

- `server/tasks.mjs`: **Task** (`tasks`) = objetivo, critérios, entradas, dependências, limites, tentativas, resultado, motivo. Estados: waiting_dependency, queued, running, cancelling, completed, failed, cancelled, interrupted, blocked, needs_decision; transições em `TRANSITIONS`.
- **Run** (`runs`) agora é a *tentativa*: `taskId`, `n`, `pid`, `modelReported`, `usage` (com `costKind`), `failureKind`, `killResult`, `answer`.
- `server/runner.mjs`: claim atômico (`claims` + heartbeat), limites global/provedor/vídeo, trava de escrita por pasta, tempo limite, cancelamento da árvore de processos, entregas por snapshot, recuperação segura.
- `server/orchestrator.mjs`: equipes, fluxo sequencial, mensagens de passagem (`messages`), rodadas de revisão limitadas, planos do supervisor.
- `server/supervisor.mjs`: prompt, extração de JSON e validação rígida. `server/context.mjs`: precedência e barreira financeira. `server/modules.mjs`, `server/finance.mjs`: módulos e ledger.
- Rotas novas: `/api/tasks`, `/api/flows`, `/api/teams`, `/api/plans`, `/api/stream`, `/api/projects/<id>/context`, `/api/settings/concurrency`, `/api/queue/pause`, `/api/connectors/check`, `/api/modules`, `/api/skills/audit`, `/api/finance/*`, `/d/<tarefa>/<token>/<arquivo>`. `/api/runs` continua como alias de `/api/tasks`.
- Verificações realizadas: ver [VALIDACAO-BACKEND.md](VALIDACAO-BACKEND.md).
