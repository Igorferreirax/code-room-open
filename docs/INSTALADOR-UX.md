# UX do instalador do Code Room

Estado em 06/11/2026: referências analisadas; implementação visual e compilação ainda pendentes. Este arquivo é o handoff para retomar com Claude Code.

## Referências fornecidas

As imagens originais estão na pasta `Tela de Instalação/`:

1. `Tela de boas-vindas do Code Room-1.png` — apresentação e botão para começar.
2. `Configuração do instalador Code Room-4.png` — local, atalhos e preferências iniciais.
3. `Progresso da instalação do Code Room-2.png` — etapas e andamento.
4. `Code Room pronto para começar-3.png` — conclusão e próximo passo.

Elas são referências visuais, não telas finais funcionais. Manter o estilo escuro, azul como cor de ação, ilustrações pixel art e textos em português. Não achatar as imagens como páginas do instalador: controles, foco de teclado, progresso e acessibilidade precisam continuar funcionais.

## Fluxo proposto

| Etapa | Conteúdo | Comportamento esperado |
|---|---|---|
| Boas-vindas | O que é o Code Room e que ele instala localmente para o usuário atual. | Avançar inicia a configuração. Cancelar fecha sem modificar dados existentes. |
| Configuração | Pasta de instalação, atalho na área de trabalho e nota de que a conexão de agentes é feita no primeiro uso. | Manter instalação por usuário, sem elevação. Pasta de dados fica separada e é preservada em atualização e desinstalação. |
| Instalação | Progresso real do Inno Setup, estado/arquivo atual quando disponível e opção de cancelar oferecida pelo próprio instalador. | Não inventar percentuais nem afirmar etapas que o instalador não executa. Atualização deve encerrar somente o serviço desta instalação, como hoje. |
| Conclusão | Instalação concluída e instruções para conectar CLIs, criar equipe e abrir projeto. | Preservar a ação atual “Abrir o Code Room agora”. O guia inicial já existe no app; não criar um segundo fluxo de onboarding. |

## Limites para preservar

- Instalação somente para o usuário atual (`PrivilegesRequired=lowest`) em `{localappdata}\Programs\CodeRoom`.
- Dados em `%LOCALAPPDATA%\CodeRoom\data`, sem exclusão em atualização ou desinstalação.
- Não adicionar opção “Todos os usuários” sem desenhar e revisar primeiro permissões, localização dos dados e desinstalação.
- Não adicionar inicialização automática com o Windows; isso não existe hoje e muda o comportamento em segundo plano.
- “Configurar agentes após instalação” significa abrir o onboarding existente do app, sem instalar CLIs silenciosamente.
- Não substituir o ZIP portátil por mudanças no instalador.

## Arquivos e validação para implementação

- Script Inno Setup: `installer/code-room.iss`.
- Build e empacotamento: `installer/build.ps1` (recria a pasta `dist`; verificar antes de rodar).
- O ambiente da revisão não tem Inno Setup 6, portanto não foi possível compilar nem conferir o wizard real. Não distribuir um `.exe` até compilar, instalar/atualizar/desinstalar numa máquina de teste e conferir que os dados permanecem.
- Após implementar, validar teclado (Tab, Shift+Tab, Enter, Esc), leitor de tela/nomes dos controles, escala de tela, pasta existente, cancelamento e atualização sobre instalação anterior.

## Ponto de retomada

Primeiro escolher e implementar a composição no wizard nativo do Inno Setup, mantendo o instalador funcional e os limites acima. Depois compilar com Inno Setup 6, inspecionar as quatro etapas, exercitar instalação limpa e atualização e registrar os resultados em `docs/STATUS-2026-11-06.md` e `docs/LANCAMENTO-V1.md`. Só então gerar o novo instalador.
