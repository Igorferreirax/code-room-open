# Code Room 0.2.0

Sala de trabalho **local** para agentes de IA (Codex, Claude Code, Gemini/Antigravity e outras IAs de terminal). Usa as contas que você já tem; nada sai sem a sua aprovação.

## Para Windows 10/11
- **Zip portátil (recomendado):** descompacte e abra `Iniciar-Code-Room.cmd`. Leva o Node dentro; não precisa instalar nada.
- **Instalador (`Setup.exe`):** instala só para o seu usuário, sem administrador. **Ainda não tem assinatura digital**: o Windows pode avisar (SmartScreen). Se o Controle de Aplicativo (Smart App Control) bloquear, use o zip portátil.
- Confira o arquivo: compare o SHA-256 com o do `SHA256SUMS.txt` (`Get-FileHash .\arquivo -Algorithm SHA256`).

## O que tem
- **Assistente** em chat com mascote: cria projeto, agentes, equipe, skills, ligações e pastas de entrada; só age depois do seu clique. Comandos `/status`, `/pendencias`, `/ajuda` e avisos quando algo falha.
- Equipes (desenvolvedor → revisor), ligações entre agentes, Canvas ao vivo e aprovação das entregas.
- **Pastas de entrada (lotes):** um agente processa cada arquivo e avisa quando termina.
- **Conectar outras IAs** (Gemini CLI, OpenCode, Aider…) por Conexões; modelo e esforço por agente ou por missão.
- Rotinas, uso por IA, acesso pelo celular (desligado por padrão), atualização com SHA-256 e volta automática, Rádio Lo-Fi.

## Limites conhecidos
- Só Windows por enquanto. O instalador não é assinado.
- O Assistente usa a sua própria IA (gasta a sua cota); `/status` e `/pendencias` não gastam.
- O arraste por toque no Canvas, no celular, falha de vez em quando.

Licença MIT. Desenvolvido por Bytelab.
