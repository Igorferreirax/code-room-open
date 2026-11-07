# Code Room — backlog de requisitos histórico

Este documento registra critérios da primeira versão do produto e **não é o status atual de implementação**. Algumas linhas abaixo ficaram obsoletas quando o produto evoluiu para a v0.2. Consulte [ROADMAP.md](ROADMAP.md) para o estado atual e [STATUS-2026-11-06.md](STATUS-2026-11-06.md) para a última rodada de trabalho e validação.

Atualização original 0.1.0: mantida como registro histórico dos critérios iniciais; não significa que todos foram aceitos.

- CR-01: estrutura e contrato inicial implementados (ver `docs/IMPLEMENTACAO.md`).
- CR-02 e CR-08: adaptadores Codex/Claude implementados e formatos testados com fixtures. Execução real com conta autenticada ainda não validada.
- CR-03 a CR-07: cadastro, SQLite, fila, interface, perfis versionados e uso implementados. Verificação HTTP e unitária passou; inspeção visual automatizada indisponível.
- CR-09 a CR-11: apenas fila serial e passagem manual de contexto prontas. Planejamento automático, mensagens entre agentes e editor de fluxos pendentes.
- CR-13: interface minimalista e player local implementados; cenário e animações ainda pendentes.
- CR-12, CR-14, CR-15 e expansões CR-16: pendentes.
- Novo requisito: ambientes por área implementados como atributo e filtro de agentes. A apresentação visual deverá crescer sem limitar o número de personagens às três estações da referência.

| ID | Entrega | Depende de | Aceite observável |
|---|---|---|---|
| CR-01 | Contratos e estrutura do projeto | — | Tipos de projeto, perfil, execução, capacidades e eventos documentados; versões e scripts definidos |
| CR-02 | Prova do primeiro conector | CR-01 | Uma tarefa pequena real inicia, gera eventos, termina ou é interrompida no Windows; retomada e aprovação identificadas como suportadas ou não |
| CR-03 | Persistência e serviço local | CR-01 | Projetos, agentes nomeados, tarefas e eventos sobrevivem ao reinício; migração versionada; autenticação e validação de origem básicas |
| CR-04 | Interface inicial e execução vertical | CR-02, CR-03 | Selecionar projeto/agente, enviar tarefa, acompanhar saída e abrir entrega; estados de erro e desconexão visíveis |
| CR-05 | Identidade e acompanhamento | CR-04 | Renomear agente preserva histórico; drawer mostra papel, modelo/conta, estado e tarefa; agentes inativos não criam processos |
| CR-06 | Uso por agente e LLM | CR-04 | Filtros por período/projeto/agente/modelo; origem do número visível; parciais e totais sem duplicação; ausência e custo estimado tratados corretamente |
| CR-07 | Perfis de especialistas | CR-05 | Editar instruções, ferramentas, conhecimento e critérios; execução preserva versão do perfil; importação/exportação sem segredos |
| CR-08 | Segundo conector | CR-02, CR-04 | Mesma tarefa pode usar outro provedor; capacidades e autenticação próprias; erros normalizados |
| CR-09 | Motor de orquestração | CR-07 | Executar dependências e fila; concorrência limitada; orçamento/tempo/revisões limitados; reinício não repete efeitos cegamente |
| CR-10 | Comunicação e revisão | CR-08, CR-09 | Agente A entrega, B revisa, A recebe correção; mensagens visíveis e deduplicadas; parada por limite de rodadas |
| CR-11 | Editor de fluxos e equipes | CR-10 | Criar e salvar passos, responsáveis e ligações; validar ciclos; reexecutar template versionado; canvas opcional posterior |
| CR-12 | Obsidian | CR-07 | Ler pasta escolhida e criar relatório; conflito preserva nota original; notas fora do escopo não são enviadas |
| CR-13 | Sala pixel art e lo-fi | CR-04 | Estados reais controlam personagens; player pausa/retoma; aba oculta suspende animações; modo econômico utilizável |
| CR-14 | Acesso remoto privado | CR-04, CR-09 | Celular autenticado acompanha e envia tarefa; autorização por ação; sessão revogável; queda de rede não duplica comandos |
| CR-15 | Executor VPS | CR-14 | Projeto identifica host; tarefa roda no host correto; desconexão reportada; acesso entre projetos isolado |
| CR-16 | Ampliações | Entregas anteriores | Sessões externas, múltiplas contas, terminal interativo, replay e ponte Maestri avaliados individualmente |

## Sequência recomendada

1. CR-01 a CR-06: um projeto real operado pelo Code Room, com identidade e consumo visíveis.
2. CR-07 a CR-11: especialistas, duas integrações e colaboração funcional.
3. CR-12 a CR-14: conhecimento, ambiente visual/sonoro e uso fora de casa.
4. CR-15 e CR-16: distribuir execução e aproximar recursos avançados das referências.

CR-13 pode começar cedo com estados demonstrativos explicitamente identificados. A demonstração não substitui o aceite de execução real. CR-14 pode antecipar uma versão somente leitura após a base autenticada, mas controles remotos exigem o motor de permissões.

## Verificações que importam

- Cada conector: tarefa real mínima, término, erro, cancelamento e capacidades de retomada/aprovação. Chamadas pagas devem respeitar um orçamento definido antes da execução.
- Orquestração: duas tarefas dependentes, revisão com limite, mensagem duplicada, processo que cai durante efeito externo e reconexão do cliente.
- Dados: isolamento de projetos, histórico após reinício, deduplicação de uso, custo indisponível e migrações sem perda.
- Arquivos: impedir escape por caminhos relativos e links para fora do projeto autorizado; conflito de nota e isolamento de worktrees.
- Remoto: negar sessão inválida/revogada e aprovação vencida, validar origem e impedir que visualizar conceda poder de executar.
- Interface: fluxo completo pelo teclado, desktop e celular, erro/vazio/carregamento e modo econômico.
- Desempenho: medir RAM/CPU/disco com app ocioso, uma execução e depois concorrência adicional. Comparar com as metas sem incluir os agentes no consumo do painel.

## Definição de pronto

Critério de aceite demonstrado, limitações declaradas, documentação e contratos atualizados, segredos ausentes do repositório e mudanças revisáveis. Registrar evidências de verificações executadas; nunca marcar como testado algo que foi apenas lido ou simulado.
