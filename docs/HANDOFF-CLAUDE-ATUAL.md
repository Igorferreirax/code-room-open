# Handoff atual — Code Room (16/11/2026, noite)

Leia primeiro `AGENTS.md`, este arquivo e a última seção de `C:\Users\Igor\Documents\Obsidian Vault\SOFTWARE\CODE-ROOM\contexto\retomada-v1-2026-11-07.md`. Handoffs e roadmaps antigos são histórico.

## Git e publicação

- Pasta do app: `C:\Users\Igor\Desktop\Code Room Publico`, branch local `codex/035-public-release`, em dia com o `main` público de `Igorferreirax/code-room-open` (MIT) até o commit `78a9ac8`. Este handoff foi atualizado depois e pode estar só local (confira `git status`).
- Versão publicada: **0.3.7** (tag `v0.3.7`, commit `acbf398`; Release com zip `151915dc…` e Setup `4b7fcc5f…` conferidos com `SHA256SUMS.txt`). Antes, no mesmo dia: 0.3.6 (`90b1912`).
- Como publicar: `legacy-public` está sem push de propósito e `origin` aponta ao repositório privado vazio `code-room-app`. Envie pelo endereço: `git push https://github.com/Igorferreirax/code-room-open.git HEAD:refs/heads/main` e a tag do mesmo jeito. A tag dispara `release.yml`; não suba arquivos à mão junto. Depois baixe a Release e confira os hashes.
- Landing: `C:\Users\Igor\Desktop\Code Room Landing`, publicada em `9bd334b` com a 0.3.7. O checkout local tem mudanças do Igor sem publicar (`mascot.js`, CSS, `main.js`, README, `.gitignore`): publique a partir de uma cópia limpa (`git worktree add --detach <pasta> origin/main`, copie `.vercel/`, mude só `js/config.js`/`index.html`, `npx vercel@65.12.1 deploy --prod --yes`).
- Só publicar com pedido explícito do Igor. Não mudar licença, visibilidade nem remotos por conta própria.
- Fora do Git de propósito: `docs/HANDOFF-CLAUDE-035-2026-11-11.md` (obsoleto) e `scripts/__pycache__/`.

## O que mudou hoje (0.3.6 e 0.3.7)

- Nico sem travas ao montar equipe (`fixProposal` em `server/assistant.mjs`).
- Pasta fora do projeto: cartão no chat (“Só ver” sem Piloto / “Ver e editar”), lembrado na conversa; detecção por frase de pasta (`public/chat-paths.js`); Área de Trabalho real via PowerShell UTF-8 + OneDrive (`server/known-folders.mjs`); pasta grande acompanhada no primeiro nível.
- **Ferramenta MCP “arquivos”** (`server/files-mcp.mjs`): listar, criar pasta e mover, presa às pastas da tarefa, nunca apaga nem sobrescreve. Ligada ao Claude que edita (`--mcp-config`). Era a causa real de “organizar a Área de Trabalho” falhar: o Claude não tem “mover” e o terminal é bloqueado.
- Seletor de IA, modelo e esforço do Nico no topo do chat.
- Prints no Nico (pasta própria por print, apagada após a resposta).
- Cenário vivo removido.

## Homologação real (16/11, CLIs autenticadas)

- Arquivos no projeto, pasta extra autorizada e recusa sem autorização: Codex, Claude e Antigravity passaram.
- Leitura de print: as três leram certo.
- Organizar Área de Trabalho (OneDrive, acento, 8 arquivos): Claude 93 s e Codex 92 s, nada perdido. **Antigravity não move** (trava pedindo permissão; só aceita MCP global via `agy mcp add`, não alterado).

## Próximos passos sugeridos (0.3.8)

1. Igor testar a 0.3.7 na outra máquina (atualizar pelo botão verde; Nico no Claude ou Codex; “organize a minha Área de Trabalho” › Ver e editar).
2. “Fotinhas”: miniaturas do que o Nico cria, captura no navegador ou move (precisa de rota para servir imagens de pasta autorizada).
3. Andamento ao vivo na bolha do Nico; desfazer a organização de uma pasta extra.
4. IAs conectadas pela pessoa (Kiro etc.) como IA do Nico; Antigravity com a ferramenta de arquivos (avaliar `agy mcp add` com o Igor).
5. Instalação limpa e atualização em outra máquina; assinatura do instalador.

## Verificações da 0.3.7

485 testes (o de cancelamento mede tempo e falha com CPU 100%; passa ao repetir), auditoria 66/66, sintaxe 212/212, os 11 roteiros de interface (`ui_assistant` 55), `smoke-package` ok.
