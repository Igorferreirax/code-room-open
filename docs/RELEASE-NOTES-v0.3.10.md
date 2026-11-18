# Code Room 0.3.10

Versão que traz os terminais para dentro do Code Room, como na Alethe: você conecta suas CLIs e faz lá dentro tudo o que faria num terminal, com a orquestração do Code Room funcionando junto. Continua gratuita e aberta sob licença MIT.

## O que mudou

- **Terminais dentro do Code Room.** O botão **Terminal** abre um painel com abas: PowerShell puro ou Claude, Codex e Gemini rodando de verdade, interativos, na pasta do projeto. Dá para redimensionar, ter várias abas e abrir fora, no Windows Terminal, se preferir.
- **Terminais interligados com o Nico.** O Nico vê os terminais abertos e o que apareceu neles, abre terminais quando você pede e digita pedidos na IA certa (“manda pro Claude que está aberto…”).
- **Assumir no terminal.** No detalhe de uma tarefa, entre na mesma conversa daquele agente num terminal interativo e continue de onde ele parou.
- **Pastas liberadas por projeto.** Outras pastas do computador que toda a equipe do projeto pode usar diretamente, como no terminal: para editar ou só para ler.
- **Apagar vai para a Lixeira.** Pedidos de apagar arquivos mandam para a Lixeira do Windows, de onde dá para recuperar.
- **Voz com a esfera de partículas.** Ao ouvir, o Nico mostra uma esfera de partículas que reage ao volume e ao tom da sua voz, e transcreve organizado. A voz fica dentro do chat (Ctrl+Espaço) e funciona em qualquer programa (Ctrl+Shift+Espaço).
- **Nico flutuante ao minimizar.** Com o Code Room minimizado, o Nico fica no topo da tela, sempre por cima, com o microfone e o que está rodando. Clique nele para voltar.
- **Correções.** A mini-janela flutuante abria sem estilos; IAs que recebem o pedido por argumento (Kiro e outras) passavam do limite do Windows.

## Limites conhecidos

- O terminal embutido é preparado pelo próprio Windows na primeira vez que você abre um (leva alguns segundos).
- A voz depende do ditado do Chrome ou do Edge com o microfone liberado.
- O instalador ainda não tem assinatura digital.
