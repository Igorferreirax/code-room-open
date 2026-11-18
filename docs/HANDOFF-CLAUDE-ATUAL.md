# Handoff atual — Code Room (18/11/2026)

Leia primeiro `AGENTS.md`, este arquivo e a última seção de `C:\Users\Igor\Documents\Obsidian Vault\SOFTWARE\CODE-ROOM\contexto\retomada-v1-2026-11-07.md`. Handoffs e roadmaps antigos são histórico.

## Git e publicação

- Pasta do app: `C:\Users\Igor\Desktop\Code Room Publico`, branch local `codex/035-public-release`, em dia com o `main` público de `Igorferreirax/code-room-open` (MIT).
- Versão publicada: **0.3.8** (tag `v0.3.8`, commit `f6880dd`; Release com zip `073df7e0b72a361d35db78f22d6019800951f082949b2fb569458240d8ff5d07` e Setup `2b76789b7610dd809c2bacda5725bf4b1615393632164346a962c4761016144a` conferidos com `SHA256SUMS.txt`). Antes: 0.3.7 (`acbf398`) e 0.3.6 (`90b1912`).
- Como publicar: `legacy-public` está sem push de propósito e `origin` aponta ao repositório privado vazio `code-room-app`. Envie pelo endereço: `git push https://github.com/Igorferreirax/code-room-open.git HEAD:refs/heads/main` e a tag do mesmo jeito. A tag dispara `release.yml`; não suba arquivos à mão junto. Depois baixe a Release e confira os hashes.
- Landing: `C:\Users\Igor\Desktop\Code Room Landing`, publicada em `70cc59d` com a 0.3.8 em `https://code-room-coral.vercel.app`. O checkout local tem mudanças do Igor sem publicar (`mascot.js`, CSS, `main.js`, README, `.gitignore`): publique sempre a partir de uma cópia limpa (`git worktree add --detach <pasta> origin/main`, copie `.vercel/`, mude só `js/config.js`/`index.html`, `npx vercel@65.12.1 deploy --prod --yes`).
- Só publicar com pedido explícito do Igor. Não mudar licença, visibilidade nem remotos por conta própria.
- Fora do Git de propósito: `docs/HANDOFF-CLAUDE-035-2026-11-11.md` (obsoleto) e `scripts/__pycache__/`.

## O que entrou na 0.3.8

- **Navegador interno multi-abas ao vivo** (`public/browser-dock.js`, `server/live-preview.mjs`): Split-View lateral (`🌐 Navegador`) e 3ª vista na Sala (`Cenário | Canvas | Navegador`), modos Desktop, Celular (390×844) e Vertical 9:16 (HyperFrames/Reels), recarregamento automático via SSE ao salvar, botão `🎯 Ajustar` direto na aba aberta e proxy reverso local (`/lp/:porta/:token/`) sem bloqueio `X-Frame-Options` e compatível com celular via Tailscale.
- **Estúdio de Artefatos, Storyboard e Qualidade** (`public/artifacts-studio.js`, `public/storyboard-ui.js`, `server/quality-gates.mjs`, `server/zip-writer.mjs`): abas `Prévia | Artefatos | Storyboard` em Entregas (Cue Sheet de vídeo, blocos copiáveis em 1 clique, checklist, ajuste cirúrgico por cena), validador técnico automático (sintaxe JS/JSON/Python, chaves expostas, HTML mobile/ativos locais e vídeo/áudio) com selo nos avisos e botão de download em `.zip`.
- **Nico Flutuante** (`public/nico-flow.js`, `scripts/bandeja.ps1`): ditado organizado estilo Wispr Flow (`Ctrl+Espaço` no app e `Ctrl+Shift+Espaço` global no Windows) + mini-janela PiP sempre visível mesmo com o Code Room minimizado.
- **Tela inicial multi-domínio** (`public/home-prompts.js`): modelos de prompt com `[campos selecionáveis]`, padrões rápidos de qualidade por área e construtor de lista interativo.
- **Autonomia, resiliência e destaque visual**: selo âmbar-dourado `★ Orquestrador` no agente líder; `stripSelfIntro` + `/aprender` + Modo Piloto aplicando ações direto sem travas; perfis de orquestração estilo Alethe + `/alethe` + auto-fallback em `rate_limit` + comparação em paralelo com worktree (`server/alethe-playbook.mjs`); ponto de restauração Git por tarefa (`server/task-checkpoint.mjs`); desfazer organização de pasta externa (`server/folder-undo.mjs`); Nico seguro no celular pareado (`/api/mobile/assistant`); HTTPS do Tailscale em 1 clique e trava de instância única (`server/single-instance.mjs`).

## Verificações da 0.3.8

497 testes unitários e de integração (0 falhas), auditoria de segurança 66/66, sintaxe 225/225, os 11 roteiros de interface (`crawl_ui` 188 cliques e 0 problemas, `ui_smoke` 154/154, `ui_assistant` 55/55, `test_radio` 32/32, etc.), `smoke-package` v0.3.8 aprovado e instância local `4780` atualizada para `0.3.8`.
