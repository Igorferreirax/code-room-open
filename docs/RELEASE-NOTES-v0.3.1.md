# Code Room 0.3.1

Atualização da 0.3.0. Para Windows 10/11. Se já usa o Code Room, use o botão Atualizar dentro do app.

## Novidades
- **Obsidian (opcional, em Conexões):** vincule o seu cofre para os agentes e o Assistente usarem as suas notas como referência, sem você explicar tudo de novo. A cada pedido, o Code Room escolhe as notas mais parecidas e envia à IA só um trecho curto delas. Escolha entre **"Só ler"** (padrão) e **"Permitir alimentar o Obsidian"**: ao aprovar uma entrega, cria uma nota nova numa pasta de destino sua, sem nunca editar ou apagar as suas notas. Projetos Financeiro nunca recebem nem gravam notas.
- **Aprove sem sair do chat:** vídeo, imagens e prévias de lote aparecem no chat do Assistente, com Aprovar, Pedir ajustes e Abrir. Aprovar nunca publica nada.
- **O Assistente sabe o que você está vendo:** a tela, o projeto e a entrega abertos entram no pedido, então "isto" e "esta tela" fazem sentido.
- **O chat mostra o que você pediu a uma equipe ou agente**, com o andamento (em andamento, concluída, parou) e o botão Abrir.
- **Modo piloto mais claro:** interruptor Conversa/Piloto no cabeçalho do chat, atividade ao vivo ("Ferramentas: Read…") enquanto ele trabalha e aviso quando a IA escolhida não é o Claude (sem MCP nem Chrome).
- **Entregas redesenhadas:** uma entrega por tarefa, arquivos de trabalho (logs, scripts) recolhidos, filtro "Para revisar" e a decisão sempre à vista.
- **Sala por projeto:** o filtro ganhou "Deste projeto" (abre sozinho quando o ambiente dos agentes combina com o nome do projeto).
- **Menu lateral em 3 grupos** e "Precisa de você agora" separando o projeto atual dos outros, com link direto para a entrega mais recente.
- **"Fechar o Code Room" pergunta antes** se houver tarefa rodando.

## Correções
- **Tarefa interrompida por reinício não podia ser retomada** ("Limite de 1 tentativa atingido"). Agora o "Tentar de novo" confirmado funciona, e o revisor bloqueado por ela volta a esperar.
- **Janelas do Explorer abrindo sozinhas** durante testes automáticos: servidores de teste nunca abrem janelas.
- **A lista de skills demorava de 1 a 20 s:** agora fica em cache por 15 s.
- **A tela aberta e as notas do Obsidian eram cortadas** do pedido ao Assistente quando o estado era grande.
- **O chat quebrava para uma equipe sem membros.**

## Limites conhecidos
- Só Windows. O instalador ainda não tem assinatura digital: o Windows 11 com o Controle Inteligente de Aplicativos bloqueia o `Setup.exe`. **Use o zip portátil** (`docs/ASSINATURA.md`).
- O Code Room não publica no Instagram: ele entrega o pacote (vídeo, legenda, relatório) e você posta. O YouTube precisa das suas credenciais do Google.
- Os agentes trabalham só dentro da pasta do projeto; pastas de fora (como outro repositório) não são alcançadas.
- O modo piloto usa uma lista fixa de programas e MCP/Chrome só no Claude.

Licença MIT. Desenvolvido por Bytelab.
