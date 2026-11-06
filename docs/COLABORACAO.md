# Desenvolver o Code Room com várias LLMs

Este guia organiza o desenvolvimento humano/assistido por LLM. Não inicia agentes nem concede autorização para enviar mensagens, executar comandos externos ou gastar créditos.

## Contexto comum

Leia `README.md`, `docs/ROADMAP.md` e `docs/BACKLOG.md` antes de propor mudanças. Nome do produto: Code Room. Plataforma inicial: Windows nativo, navegador + serviço local. Máquina de referência: 4 threads, 8 GB de RAM. Leveza, agentes nomeados, uso visível, orquestração, Obsidian e acesso remoto são requisitos do produto.

Os arquivos visuais são referências. Não considerar um mockup uma integração pronta. Não introduzir Docker, WSL, Electron, modelos locais, serviços distribuídos ou banco vetorial como requisito sem uma decisão técnica registrada.

## Papéis de desenvolvimento sugeridos

| Papel | Responsabilidade | Entrega |
|---|---|---|
| Coordenador | Dividir backlog, resolver decisões e integrar | Contratos coerentes e etapas aceitas |
| Interface | Sala, painéis, formulários e acessibilidade | Fluxos utilizáveis e modo econômico |
| Execução | Conectores, eventos e ciclo de vida | Tarefas reais com erros e cancelamento |
| Orquestração | Fila, dependências e comunicação | Fluxos com limites e recuperação |
| Conhecimento | Obsidian e contexto | Notas e relatórios sem perda ou vazamento entre projetos |
| Revisão | Segurança, correção, recursos e critérios | Achados reproduzíveis e verificações relevantes |

São papéis que podem ser ocupados sequencialmente pela mesma LLM. No PC atual, começar com um implementador ativo e revisão em seguida. Quando houver paralelismo, cada tarefa terá arquivos atribuídos ou worktree própria; um integrador cuida de arquivos compartilhados, contratos, dependências e lockfile.

## Modelo de passagem de tarefa

```text
Projeto: Code Room
Item do backlog: CR-XX
Objetivo e critério de aceite:
Arquivos/área sob sua responsabilidade:
Contratos e versões que deve respeitar:
Pré-requisitos já concluídos:
Permissões concedidas e limites de custo:
Fora do escopo desta tarefa:
Verificações relevantes:

Ao concluir, entregue:
1. Resumo do resultado.
2. Arquivos alterados e decisões.
3. Verificações executadas e evidências.
4. Limitações, pendências e próximo passo.
5. Commit/branch ou patch, quando existir Git.
```

## Processo de colaboração

1. Escolher um item com dependências concluídas e registrar responsável/arquivos antes de editar.
2. Acordar mudanças de contrato com o coordenador antes de outros módulos dependerem delas.
3. Implementar uma entrega pequena e completa; não substituir funções reais por simulação silenciosa.
4. Revisar efeitos e critérios; executar verificações proporcionais ao risco.
5. Integrar, atualizar status do backlog e registrar decisões que mudem a arquitetura.
6. Passar adiante resultado, evidências e pendências, sem credenciais ou transcrições privadas desnecessárias.

Ainda não existe Git ou aplicação nesta pasta conforme inventário inicial. A primeira implementação deve conferir novamente o estado do diretório antes de inicializar estrutura, preservando os dois arquivos de referência.

## Prompt inicial para a próxima sessão

> Desenvolva o primeiro marco do Code Room conforme README.md e docs/ROADMAP.md. Comece pelos contratos e pela prova do conector, depois implemente o fluxo de um projeto, um agente com nome próprio, uma tarefa real, acompanhamento e uso disponível. Respeite Windows nativo e baixo consumo. Detecte as capacidades da versão instalada antes de escolher comandos ou SDK. Identifique claramente demonstrações e funções ainda indisponíveis. Atualize o backlog com evidências. Para testes reais com provedor pago, estabeleça antes o limite de gasto. Não implemente todas as expansões de uma vez.
