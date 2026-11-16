# Handoff atual para Claude — Code Room (16/11/2026)

Leia primeiro `AGENTS.md`, este arquivo e a última seção de `C:\Users\Igor\Documents\Obsidian Vault\SOFTWARE\CODE-ROOM\contexto\retomada-v1-2026-11-07.md`. Este arquivo descreve o checkout de hoje; os handoffs e roadmaps antigos guardam histórico.

## Git e publicação

- Pasta do app: `C:\Users\Igor\Desktop\Code Room Publico`. Branch ativa: `codex/035-public-release`. HEAD: `7a495884902c536e8a4a6afd9ee5f0abf88fc0d5`, commit da tag `v0.3.5` e do `main` no GitHub público `Igorferreirax/code-room-open`. A 0.3.5 publicada é gratuita e MIT.
- Há alterações locais após a 0.3.5 **sem commit**. Não fazer checkout de `main`, reset, limpeza de não rastreados, commit ou push sem conferir o diff e a intenção atual de Igor. O `main` local está atrasado em relação ao remoto público.
- `origin` aponta a `Igorferreirax/code-room-app`, repositório **privado e vazio**. `legacy-public` aponta ao repositório público e está sem push. A atualização dos apps instalados continua em `code-room-open` (`DEFAULT_REPO` em `server/updates.mjs`). O `"private": true` do `package.json` apenas impede publicação no npm.
- Landing: `C:\Users\Igor\Desktop\Code Room Landing`, `main` no commit `5595a57dab553d0c2f9904f5ad8e6fc8626be015`, publicado com links da 0.3.5. Também tem alterações locais não commitadas (`.gitignore`, `README.md`, `css/style.css`, `js/main.js`, `js/mascot.js`); conferir antes de mexer. Não presumir que mudanças locais do app ou landing estão em produção.
- O dono pediu para não publicar, criar tag, release ou alterar visibilidade sem pedido explícito. Não migrar automaticamente para o repositório privado.

## Trabalho local após a 0.3.5

- Nico aceita colar/anexar PNG, JPG ou WebP de até 1 MB. `public/app.js`/`views.js` fazem a prévia e o envio; `server/chat-image.mjs` valida e grava o print temporário na pasta de dados. `assistant.mjs` envia o caminho no pedido. Codex recebe `--image`; Claude Code e Antigravity recebem `--add-dir` para a pasta da imagem. `docs/PRIVACIDADE.md` registra o envio à IA escolhida.
- Pedidos que citam Área de Trabalho, Downloads, Documentos ou caminho absoluto fora do projeto pedem confirmação da pasta e do acesso para aquela execução. O chat geral consegue trabalhar com pasta extra sem projeto em foco após ligar o Modo Piloto. Pastas protegidas e projetos Financeiro continuam recusados.
- Se Nico propõe criar agente que já existe, a ação é convertida em vínculo ao projeto citado ou em foco. Se já vinculado, o cartão redundante não aparece. A rota genérica de tarefas recusa executar o agente interno do Assistente.
- Não rastreados preexistentes: `docs/HANDOFF-CLAUDE-035-2026-11-11.md`, `scripts/__pycache__/` e quatro `scripts/homologar-*-real.mjs`. Preservar até revisar o propósito de cada um.

## Evidência e limites

- Suíte Node completa: 469/469 após a implementação principal; em seguida houve apenas um guarda de rota e ampliação da detecção de caminhos, com 52/52 testes focados. Sintaxe 207/207, auditoria 66/66, teste de privacidade 2/2 e `git diff --check` sem erro. Os testes HTTP precisam de localhost permitido: no sandbox houve `EACCES`; com acesso local passaram.
- Os 11 roteiros de interface passaram depois das mudanças visuais. `ui_smoke.py` passou 156/156 na repetição; `ui_assistant.py` passou 44/44 depois do teste de colar/enviar print. Uma sobreposição CSS do botão de imagem apareceu no primeiro smoke e foi corrigida. Houve uma falha intermitente isolada no smoke; a repetição passou.
- **Ainda não comprovado:** uma IA real interpretando o print em cada CLI, sobretudo Antigravity. A tentativa local do Antigravity parou sem login e sem poder gravar arquivos temporários no sandbox. Também falta validar instalação/atualização real do Setup 0.3.5 e execução de ponta a ponta na outra máquina, celular real, contas Telegram/Gmail/YouTube e assinatura digital. Testes simulados não substituem esses cenários.

## Próxima rodada recomendada

1. Ler `git status`, `git diff` e este handoff. Revisar os novos arquivos e evitar misturar alterações da landing com o app.
2. Com uma pasta descartável e CLI autenticada, validar um pedido pequeno no Nico: ler print, criar arquivo dentro do projeto, editar/mover arquivo numa pasta extra autorizada, conferir o diff, aprovar e repetir após reinício. Registrar arquivos efetivamente criados e o erro exato se falhar.
3. Só depois considerar refinamentos de UX e uma versão nova. Antes de publicar: testes, auditoria, 11 roteiros de interface se alguma tela mudou, empacotamento, instalação/atualização em Windows e verificação de segredos/hashes.
