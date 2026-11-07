# Code Room 0.2.2

Atualização da 0.2.1. Para Windows 10/11. Se já usa o Code Room, use o botão Atualizar dentro do app.

## Novidades
- **Abre como janela de app:** sem abas nem barra de endereço, usando o Edge ou o Chrome que já estão no seu PC. Sem eles, abre no navegador padrão. Fechar a janela **não** encerra o serviço (os agentes continuam trabalhando); para encerrar, use "Fechar o Code Room" no menu Iniciar.
- **Celular:** o menu vira uma barra embaixo da tela e o conteúdo usa a largura toda.

## Correções
- **O ícone da área de trabalho não abria** quando a porta 4780 já estava em uso (por exemplo, outro Code Room). Agora o app escolhe a próxima porta livre e, se não conseguir abrir, mostra uma caixa explicando o motivo.
- As caixas de diálogo do app não quebram mais os acentos no PowerShell 5.
- No celular, o cartão de ferramenta, a tabela de Uso e a tela de Execução não estouram mais a largura.

## Limites conhecidos
- Só Windows. O instalador ainda não tem assinatura digital: o Windows 11 com o Controle Inteligente de Aplicativos bloqueia o `Setup.exe`. **Use o zip portátil**; o guia para assinar está em `docs/ASSINATURA.md`.
- A janela de app usa o ícone do Edge/Chrome na barra de tarefas.
- O arraste de ligações por toque no Canvas, no celular, ainda falha de vez em quando.

Licença MIT. Desenvolvido por Bytelab.
