# Handoff atual — Code Room (18/11/2026)

Leia primeiro `AGENTS.md`, este arquivo e a última seção de `C:\Users\Igor\Documents\Obsidian Vault\SOFTWARE\CODE-ROOM\contexto\retomada-v1-2026-11-07.md`. Handoffs e roadmaps antigos são histórico.

## Git e publicação

- Pasta do app: `C:\Users\Igor\Desktop\Code Room Publico`, branch local `codex/035-public-release`, em dia com o `main` público de `Igorferreirax/code-room-open` (MIT).
- Versão publicada: **0.3.9** (tag `v0.3.9`, commit `b560145`; Release com zip `50a129539d50e863a4e0c29aa80041e0056961ce9ccb3acd692e9b7be3c19caa` e Setup `47bbbac3f17197cb42039362bbcf231a3f35c70f3bfeebdb1364faf2d9181636` conferidos com `SHA256SUMS.txt`; `smoke-package` ok no zip baixado). Antes: 0.3.8 (`f6880dd`, feita com o Gemini).
- Como publicar: `legacy-public` está sem push de propósito e `origin` aponta ao repositório privado vazio `code-room-app`. Envie pelo endereço: `git push https://github.com/Igorferreirax/code-room-open.git HEAD:refs/heads/main` e a tag do mesmo jeito. A tag dispara `release.yml`; não suba arquivos à mão junto. Depois baixe a Release e confira os hashes.
- Landing: `C:\Users\Igor\Desktop\Code Room Landing`, publicada em `94df5af` com a 0.3.9 em `https://code-room-coral.vercel.app`. O checkout local tem mudanças do Igor sem publicar (`mascot.js`, CSS, `main.js`, README, `.gitignore`): publique sempre a partir de uma cópia limpa (`git worktree add --detach <pasta> origin/main`, copie `.vercel/`, mude só `js/config.js`/`index.html`, `npx vercel@65.12.1 deploy --prod --yes`).
- Só publicar com pedido explícito do Igor. Não mudar licença, visibilidade nem remotos por conta própria.
- Fora do Git de propósito: `docs/HANDOFF-CLAUDE-035-2026-11-11.md` (obsoleto) e `scripts/__pycache__/`.

## O que entrou na 0.3.9 (Claude, 18/11)

- **Aprovação durante a execução**: `server/approvals.mjs` (fila em memória, prazo de 10 min, "sempre nesta tarefa", fim da tarefa nega o que sobrou) + `server/permission-mcp.mjs` (ferramenta MCP `aprovar`, ligada ao Claude que edita por `--permission-prompts host --permission-prompt-tool`); rotas `/api/approvals/ask` e `/api/approvals/:id` com chave própria e só 127.0.0.1 (ficam ANTES do bloco de pareamento); cartão `public/run-approvals.js`. Codex e Gemini ainda sem cartão.
- **Abrir e Terminal**: `server/open-local.mjs` (lista de programas, sem terminal; arquivos que executam código recusados; URL vai como argumento, nunca pelo cmd) e `server/terminal.mjs` (wt.exe é atalho de aplicativo: detectar com lstat; sem ele, `conhost.exe powershell`, porque PowerShell direto sem console fecha na hora). Ações `abrir` e `abrir_terminal` do Nico; botão Terminal no topo; Abrir no Chrome no navegador interno.
- **Modo irrestrito** (agente `unrestricted`, Nico `s.unrestricted`, terminal `irrestrito`): Codex `danger-full-access`, agy `--mode auto --dangerously-skip-permissions`, Claude libera pela aprovação e registra em `result.freeActions`. Ponto de restauração obrigatório: Git ou cópia em `.data/restauracao/<tarefa>` (`captureFileBackup`, 300 MB, 7 dias); `revertTaskChanges` aceita `kind: 'copy'`. Nunca em Financeiro.
- **Voz global**: a bandeja só liga/desliga (`/api/voice/global`) e cola com área de transferência + SendKeys depois de soltar Ctrl/Shift; a tela ouve (Web Speech, na mini-janela se aberta) com `public/neural-viz.js`; eventos `_hotkey` levam `action`/`voiceId` (`store.eventsSince`). Não traz o Code Room para a frente.
- **Nico**: Piloto por padrão (Financeiro em foco responde em consulta), persona curta, parser de ações tolerante (`inferAction`), lista da pasta extra no pedido, Antigravity cede a vez ao Claude/Codex com pasta extra. Revisor só roda se o desenvolvedor gerou arquivos.
- Verificações: 507 testes, sintaxe 232/232, auditoria 66/66, 11 roteiros (novo `scripts/ui_execucao.py`), testes reais com Claude (aprovação, irrestrito, reverter) e Codex/PowerShell no Windows Terminal. **Não verificado**: voz com microfone real na máquina do Igor.
- Próximos (0.4.0): cartão de aprovação no Codex/Gemini (ACP), terminal embutido, aprovar pelo Telegram (ou WhatsApp por QR, Igor ainda não escolheu), fotinhas do que o Nico cria, escolher atalho/segure para falar.

## O que entrou na 0.3.8

- **Navegador interno multi-abas ao vivo** (`public/browser-dock.js`, `server/live-preview.mjs`): Split-View lateral (`🌐 Navegador`) e 3ª vista na Sala (`Cenário | Canvas | Navegador`), modos Desktop, Celular (390×844) e Vertical 9:16 (HyperFrames/Reels), recarregamento automático via SSE ao salvar, botão `🎯 Ajustar` direto na aba aberta e proxy reverso local (`/lp/:porta/:token/`) sem bloqueio `X-Frame-Options` e compatível com celular via Tailscale.
- **Estúdio de Artefatos, Storyboard e Qualidade** (`public/artifacts-studio.js`, `public/storyboard-ui.js`, `server/quality-gates.mjs`, `server/zip-writer.mjs`): abas `Prévia | Artefatos | Storyboard` em Entregas (Cue Sheet de vídeo, blocos copiáveis em 1 clique, checklist, ajuste cirúrgico por cena), validador técnico automático (sintaxe JS/JSON/Python, chaves expostas, HTML mobile/ativos locais e vídeo/áudio) com selo nos avisos e botão de download em `.zip`.
- **Nico Flutuante** (`public/nico-flow.js`, `scripts/bandeja.ps1`): ditado organizado estilo Wispr Flow (`Ctrl+Espaço` no app e `Ctrl+Shift+Espaço` global no Windows) + mini-janela PiP sempre visível mesmo com o Code Room minimizado.
- **Tela inicial multi-domínio** (`public/home-prompts.js`): modelos de prompt com `[campos selecionáveis]`, padrões rápidos de qualidade por área e construtor de lista interativo.
- **Autonomia, resiliência e destaque visual**: selo âmbar-dourado `★ Orquestrador` no agente líder; `stripSelfIntro` + `/aprender` + Modo Piloto aplicando ações direto sem travas; perfis de orquestração estilo Alethe + `/alethe` + auto-fallback em `rate_limit` + comparação em paralelo com worktree (`server/alethe-playbook.mjs`); ponto de restauração Git por tarefa (`server/task-checkpoint.mjs`); desfazer organização de pasta externa (`server/folder-undo.mjs`); Nico seguro no celular pareado (`/api/mobile/assistant`); HTTPS do Tailscale em 1 clique e trava de instância única (`server/single-instance.mjs`).

## Verificações da 0.3.8

497 testes unitários e de integração (0 falhas), auditoria de segurança 66/66, sintaxe 225/225, os 11 roteiros de interface (`crawl_ui` 188 cliques e 0 problemas, `ui_smoke` 154/154, `ui_assistant` 55/55, `test_radio` 32/32, etc.), `smoke-package` v0.3.8 aprovado e instância local `4780` atualizada para `0.3.8`.
