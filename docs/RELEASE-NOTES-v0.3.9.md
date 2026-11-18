# Code Room 0.3.9

Versão focada em fazer o Code Room **executar de verdade**, como as IAs no seu terminal. Continua gratuita e aberta sob licença MIT.

## O que mudou

- **Aprovação durante a execução.** Quando um agente no Claude precisa de algo que não está liberado (rodar um comando, abrir um programa), aparece um cartão no canto da tela com **Permitir**, **Permitir sempre nesta tarefa** ou **Negar**, e ele espera a sua resposta. Antes, tudo isso era negado em silêncio.
- **Terminal.** O botão **Terminal** no topo abre o Windows Terminal na pasta do projeto com PowerShell puro ou com Claude, Codex ou Gemini rodando na tela, interativos.
- **Modo irrestrito** (opcional, por agente, por terminal e para o Nico): a IA executa tudo sem perguntar. Antes de começar, o Code Room grava um ponto de restauração (Git, ou uma cópia dos arquivos se o projeto não tiver Git), e **Reverter alterações** desfaz. Cada ação feita sem perguntar aparece no detalhe da tarefa. Nunca em projetos Financeiro.
- **“Abre o bloco de notas”, “abre o localhost:3000 no Chrome”.** O próprio Code Room abre programas, arquivos, pastas e sites na hora, sem gastar IA. O navegador interno ganhou **Abrir no Chrome**.
- **Voz em qualquer programa.** **Ctrl+Shift+Espaço** começa a ouvir sem tirar o foco do campo em que você está; uma animação neural reage à sua voz; o segundo toque cola o texto organizado ali. O botão ⧉ deixa o Nico numa mini-janela sempre visível.
- **Nico mais direto.** Começa no Modo Piloto, responde curto e não mostra mais ações como texto cru. O Revisor só entra quando há arquivo para revisar.

## Limites conhecidos

- O cartão de aprovação funciona no Claude. No Codex e no Gemini, o que não está liberado continua negado, a menos que o agente esteja em modo irrestrito.
- A voz depende do ditado do Chrome ou do Edge com o microfone liberado; deixe o Code Room ou a mini-janela do Nico aberta.
- O instalador ainda não tem assinatura digital.
