# Code Room 0.2.1

Atualização da 0.2.0, com acesso ao celular mais fácil e correções no Assistente. Para Windows 10/11. Se já usa o Code Room, use o botão Atualizar dentro do app.

## Novidades
- **Mencionar um agente por clique:** clique em um agente (Sala, Canvas ou gaveta) e escolha **@ Mencionar no chat**: o `@Nome` vai para a barra do chat e a mensagem segue direto para ele.
- **Abrir no celular, passo a passo:** comando `/celular` no Assistente (responde na hora, sem gastar cota), botão **Diagnosticar o acesso** e botão **Liberar no firewall do Windows** (regra só para o Code Room, só para a rede local e o Tailscale; o Windows pede a sua permissão). O QR de pareamento passa a preferir o endereço do Tailscale.
- **Limpeza de dados antigos, com prévia** (Configurações › Execução): apaga só tarefas internas do Assistente já terminadas e com mais de 7 dias, depois de mostrar quantas são e de você confirmar.
- **Limpar erros** no chat do Assistente: remove mensagens de erro antigas da conversa.
- Comandos locais do chat (`/status`, `/pendencias`, `/celular`, `/ajuda`) funcionam e mostram a resposta mesmo antes de apresentar o Assistente à sua IA.

## Correções
- **Antigravity:** acabou o erro "Prompt grande demais". As respostas do Assistente eram gravadas como "entregas" do projeto interno e voltavam em todo prompt; agora ficam de fora, e o limite do prompt do Antigravity é 24 mil caracteres.
- **Canvas no celular:** a tela não se atualiza mais no meio do toque em um cartão.

## Limites conhecidos
- Só Windows. O instalador ainda não tem assinatura digital: o Windows pode avisar; o zip portátil não tem esse problema.
- O arraste de ligações por toque no Canvas, no celular, ainda falha de vez em quando.
- O acesso pelo celular depende do app do Tailscale ligado no celular (mesma conta) ou do Wi-Fi com a rede local liberada.

Licença MIT. Desenvolvido por Bytelab.
