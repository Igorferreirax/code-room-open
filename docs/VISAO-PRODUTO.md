# Visão do produto — Code Room

## Objetivo

O Code Room deve ser um espaço único para receber projetos, distribuir trabalho entre agentes de IA, acompanhar o que está acontecendo e revisar os resultados. A pessoa escolhe as CLIs e contas que já usa; o Code Room organiza o trabalho entre elas e mantém o estado, o contexto e as entregas do projeto num lugar só.

A referência de ambição é um orquestrador pessoal como o Maestri, com uma interface própria, mais agradável e adequada ao fluxo do Igor. O produto deve conseguir apoiar trabalho de desenvolvimento, vídeo e outros projetos baseados em arquivos. Em vídeo, isso inclui automações repetíveis e edição em massa, com progresso por arquivo e revisão das entregas.

O diferencial não é oferecer outro modelo de IA. É fazer as CLIs conectadas colaborarem num fluxo de trabalho que a pessoa consegue entender, orientar e controlar.

## Princípios que devem orientar mudanças

1. **Projetos são o centro.** Cada projeto reúne pasta, contexto, agentes, equipe, tarefas, arquivos, rotinas e histórico. Contexto e arquivos de um projeto não atravessam para outro sem uma ação explícita.
2. **As CLIs da pessoa continuam sendo os motores.** Codex, Claude Code, Antigravity e conectores configurados pela pessoa usam suas próprias instalações e autenticações. O Code Room não substitui essas contas nem finge ter uma quota consolidada.
3. **A orquestração precisa ser visível.** Mostrar quem está trabalhando, o que espera, qual etapa vem depois, o que falhou e por quê, quais arquivos mudaram e o que exige decisão.
4. **Automação com limites claros.** Filas, dependências, tentativas, concorrência, orçamento configurado e recuperação após falha devem ter estado persistente e previsível. Uma tarefa não pode ser repetida cegamente depois de um efeito incerto.
5. **A pessoa controla os efeitos externos.** Agentes podem preparar entregas; aprovar, publicar, enviar ou executar uma ação externa deve continuar explícito e revisável.
6. **Segurança legível.** Permissões por agente, leitura/escrita, isolamento de projetos, celular pareado, integrações remotas e dados enviados a provedores precisam ser claros na interface.
7. **Bom primeiro uso, sem esconder a potência.** Um fluxo comum deve ser curto: escolher projeto, escolher agente ou equipe, descrever o resultado, acompanhar e revisar. As telas avançadas continuam acessíveis quando forem necessárias.
8. **Open source sustentável e voluntário.** A ferramenta deve continuar útil sem doação. Doações voluntárias ajudam o projeto e não devem desbloquear funções, comprar prioridade ou alterar o comportamento dos agentes. A licença e os canais de doação devem ser claros.

## Fluxos que devem funcionar muito bem

### Desenvolvimento

Receber um pedido num projeto existente ou novo; planejar com um agente; desenvolver; revisar com outro agente; pedir correções; acompanhar diffs e arquivos; aprovar a entrega. Em tarefas paralelas no mesmo repositório, worktrees isolam alterações e a integração continua explícita.

### Vídeo e trabalho em massa

Configurar uma receita de produção reutilizável; apontar uma pasta de entrada; processar arquivos em fila ou em concorrência limitada; identificar progresso e falhas por arquivo; tentar novamente somente os itens com problema; ver a prévia e os arquivos finais; aprovar antes de publicar. A esteira de vídeo atual é específica e deve evoluir para um fluxo configurável, sem perder os controles de aprovação e custo.

### Acompanhamento de portfólio

Ver projetos ativos, tarefas em curso, bloqueios, próximos passos e decisões pendentes. O Assistente responde sobre status usando o estado real do Code Room e não inventa andamento. Relatórios devem diferenciar dado reportado, estimativa e informação indisponível.

## Sequência recomendada

### 1. Fechar a confiabilidade da versão atual

- Validar os recursos recém-adicionados visualmente em desktop e celular.
- Resolver ou isolar a intermitência do arraste por toque no Canvas.
- Abrir o zip portátil novo em pasta limpa; gerar instalador assinado quando houver Inno Setup e assinatura disponíveis.
- Manter testes de regressão para permissões, filas, aprovações, retomada, projetos isolados e cartões de interface.

### 2. Fazer o fluxo diário ficar claro

- Oferecer um começo guiado que ajude a pessoa a escolher projeto, agente/equipe, pedido e critério de conclusão.
- Permitir acompanhar a tarefa sem caçar informação em várias telas.
- Preservar o chat único para pedidos diretos e o Assistente para planejamento e configuração.
- Confirmar o fluxo com trabalho real de desenvolvimento e com um lote pequeno de vídeo.

### 3. Tornar a orquestração configurável

- Transformar equipes, ligações e receitas em fluxos reutilizáveis e fáceis de revisar.
- Exibir dependências, passagem de contexto, revisão, novas tentativas e limites por etapa.
- Tornar pastas de entrada e lotes adequados a projetos diferentes, não só à esteira de vídeo atual.

### 4. Ampliar vídeo e automação em massa

- Separar etapas genéricas de ferramentas e skills específicas do canal.
- Mostrar entrada, arquivos em andamento, arquivos concluídos, falhas, entregas e estimativas de custo por item.
- Permitir pausar, retomar e repetir falhas sem reprocessar o que já foi aprovado.
- Validar formatos, ferramentas e políticas de saída antes de iniciar lotes caros.

### 5. Preparar a distribuição Open Source

- Release reproduzível com zip e hashes conferidos.
- Teste do pacote numa máquina limpa, instruções claras e limitação conhecida do Windows sem assinatura.
- Landing e social preview mantidos no repositório/site apropriado.
- Doações opcionais, transparentes e sem bloqueio de recursos.

## Critério de excelência

Um projeto comum deve poder ser recebido, dividido, executado por CLIs reais, acompanhado, revisado e entregue sem perder contexto nem esconder falhas. Uma automação em lote deve ser possível de pausar, entender e retomar por arquivo. A pessoa deve conseguir confiar no que o painel mostra porque cada estado vem de dados reais, e deve saber sempre o que ainda depende dela.

Para o ponto de retomada técnico e os resultados verificados, veja [STATUS-2026-11-06.md](STATUS-2026-11-06.md) e [ROADMAP.md](ROADMAP.md).
