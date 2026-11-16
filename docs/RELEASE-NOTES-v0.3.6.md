# Code Room 0.3.6

Versão de correções focada em usar o Nico sem travas. Continua gratuita e com código aberto sob MIT.

## O que mudou

- **Montar equipe sem travar:** quando a proposta do Nico esbarra em algo que o Code Room consegue resolver, ele resolve sozinho e avisa no fim da resposta (“Ajustei sozinho para não travar: …”). Agente com nome que já existe é reaproveitado, IA que não está conectada é trocada pela que está, opções que só valem para outra IA saem do agente e equipe com nome repetido ganha “(2)”.
- **Pastas fora do projeto pelo chat:** “organize a minha Área de Trabalho” funciona sem projeto selecionado. Uma janela só mostra o caminho (dá para corrigir) e o que a autorização libera; o Modo Piloto liga junto. Palavras soltas como “documento” ou “app desktop” não pedem mais autorização.
- **Pasta grande não recusa a tarefa:** em pastas com milhares de arquivos ou com arquivos em uso, o Code Room acompanha o primeiro nível e avisa no chat.
- **Área de Trabalho, Downloads e Documentos no lugar certo**, inclusive quando estão no OneDrive.
- **Prints no Nico:** cole ou anexe um print (PNG, JPG ou WebP até 1 MB) e o Nico lê a imagem. Conferido com Codex, Claude Code e Antigravity. Cada print fica numa pasta própria e é apagado quando a resposta chega.
- **Erros mais claros:** o aviso de login só aparece com erro de login de verdade; limite de uso e modelo recusado ganham orientação e botão no chat.
- Caminhos com espaço citados sem aspas são entendidos inteiros.

## Antes de começar

Instale e faça login na CLI da IA que deseja usar. Em **Conexões**, use **Testar resposta**. O instalador ainda não tem assinatura digital.
