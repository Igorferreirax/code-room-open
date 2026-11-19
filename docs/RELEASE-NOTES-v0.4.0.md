# Code Room 0.4.0

Versão que deixa o Code Room mais leve de usar no dia a dia: o Nico responde sem travar, cada projeto guarda o seu jeito de trabalhar (Workspace), a prévia dos seus projetos roda isolada do painel e desfazer o trabalho de uma IA não apaga mais o que você editou depois.

## O que mudou

- **Nico sem trava.** A mensagem aparece na hora do Enter. O Nico tem uma fila própria: não espera mais as tarefas dos agentes nem ocupa a vaga delas. Enquanto ele responde, você escreve o próximo pedido; dá para cancelar a resposta. O andamento mostra a fase real (na fila e por quê, iniciando a IA, aguardando sua aprovação, respondendo, com o texto que já chegou) e quanto tempo cada etapa levou.
- **Toda tarefa diz por que está esperando.** Limite de tarefas ao mesmo tempo, mesma pasta, fila pausada ou orçamento: o motivo aparece no cartão da tarefa.
- **Workspace por projeto.** O Nico encaixa à direita quando o Navegador abre, sem cobrir nada. Divisórias arrastáveis, Modo Foco e os Espaços **Vídeo** (prévia no centro, Nico ao lado) e **Código** (terminal aberto). Cada projeto guarda o próprio layout. Menu **Espaço** no topo, no Ctrl+K e no Nico (“prepare meu espaço de vídeo”).
- **Reverter sem perder o seu trabalho.** “Reverter alterações” mostra antes, arquivo por arquivo, o que vai voltar. Só desfaz o que continua exatamente como a IA deixou: o que você editou depois fica, e o que estava preparado no Git não muda.
- **Modo irrestrito com ponto de restauração obrigatório.** Se o ponto de restauração não puder ser criado, a IA não começa e a tarefa explica o motivo. Botão “Repetir em worktree isolado” e aviso quando outra tarefa já está editando o mesmo projeto.
- **Segurança.** A prévia dos seus projetos (Navegador interno) roda numa origem própria, em sandbox, sem acesso ao painel. Terminais, abrir programas, voz global, rede, atualização e pareamento só funcionam no próprio computador. O celular recebe só o que a tela dele usa e só aprova ações de uma lista fechada.
- **Chat do Nico mais claro.** Seletor compacto de modo, “Mais ferramentas” no compositor, decisões pendentes acima da resposta longa e detalhes técnicos recolhíveis.
- **Voz segurando o Ctrl direito** em qualquer programa (transcrição pelo Groq com a sua chave, ou pelo ditado do navegador), **Nico de mesa** no Windows, **Ctrl+K**, terminais lado a lado, barra com 5 seções, apresentação do Nico com o app desfocado atrás, e **Configurações › Contribuir**.
- **Correções.** Esc na apresentação do Nico fechava a configuração inicial; o terminal perdia teclas digitadas rápido; o primeiro terminal numa instalação nova podia falhar logo após ser preparado.

## Limites conhecidos

- A voz pelo Ctrl direito e o Nico de mesa ainda não foram testados com microfone real em outra máquina.
- O instalador ainda não tem assinatura digital.
