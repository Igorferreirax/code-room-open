# Guia para agentes de código (Codex, Claude Code e outros)

Code Room: orquestrador local de agentes de IA para Windows. Node ESM **sem dependências**, `node:sqlite`, front em JavaScript puro, serviço em `127.0.0.1:4780`, acesso por `X-Code-Room-Key`. Responda e escreva textos de interface em **português do Brasil**.

## Comandos
- Testes: `node --test test/*.test.mjs` (última suíte completa: 479). Auditoria de segurança: `node scripts/audit-security.mjs` (66). Sintaxe: `node scripts/check.mjs`.
- Interface (Playwright do Python): `python scripts/ui_smoke.py` (156), `crawl_ui.py`, `ui_assistant.py`, `ui_onboarding.py`, `ui_mention.py`, `ui_providers.py`, `test_radio.py`, `ui_updates.py`, `ui_touch.py`, `ui_live.py`, `ui_canvas_live.py`. **Não edite arquivos enquanto eles rodam.**
- Pacote Windows: `powershell -File installer\build.ps1`, depois `scripts\smoke-package.ps1`.
- Reiniciar o serviço: `scripts\stop.ps1 -Seguro` (recusa se há tarefa rodando) e `scripts\start.ps1 -Silencioso`. Nunca reinicie com o usuário no meio de uma aprovação.

## Regras do projeto
- Sem dependências novas, sem telemetria, nada sai do computador que não esteja em `docs/PRIVACIDADE.md` (um teste falha se o código chamar endereço não listado). Mudou algo que sai da máquina? Atualize essa lista no mesmo commit.
- Segredos só em arquivos próprios na pasta de dados (`social-secrets.json`, `api-secrets.json`, `publish*.json`, `access.key`); nunca voltam para a tela nem para logs.
- Nada é publicado em rede social sem aprovação por postagem. Projetos da área **Financeiro** nunca recebem MCP, web, navegador nem IA remota.
- Funções que agem (modo piloto, navegador, programas, MCP, web) vêm **desligadas** e por agente. PowerShell, cmd e `rm` nunca são oferecidos para liberar.
- Não publique release, não envie ao GitHub e não crie tag sem o dono pedir. As skills pessoais do dono não são distribuídas.

## Armadilhas já vividas
- Arquivos do repositório podem ter CRLF. Ao editar por script, normalize `\r\n`; cuidado com `\n` e `\r` dentro de strings em scripts (já quebraram sintaxe). Rode `node --check` nos arquivos tocados.
- O manual do Assistente (`docs/ASSISTENTE.md`) tem teto de 20000 bytes: enxugue antes de crescer.
- Testes devem funcionar em máquina sem ffmpeg, Claude ou Codex (use `skip` ou catálogo de CLI simulado) e comparar caminhos canônicos (nome curto 8.3 do Windows).
- O servidor só serve `/assets/*.png|jpg` por padrão; webp exige rota própria.
- `npx @playwright/mcp@latest` leva ~25 s e estoura o tempo do MCP; o código usa a cópia local (`findLocalPlaywright`).
- Reiniciar o serviço derruba a página aberta (“Failed to fetch”): avise antes.
- Mudou uma tela? Rode **todos** os roteiros de interface, não só o `ui_smoke.py`: em 10/11/2026 quatro deles ficaram quebrados sem ninguém notar.
- Antigravity sem tela: em `--mode plan` só devolve um plano, e ferramenta que pede permissão é negada e sai sem resposta. O aviso `agyHeadlessNote` no começo do pedido resolve; nunca use `--dangerously-skip-permissions`.
- Um projeto só mostra agentes e equipes trazidos para ele (ou que já rodaram tarefa nele). Em testes, chame `projects/members` depois de criar o agente.
- Publicação: `code-room-open` continua público e MIT. A tag `vX.Y.Z` dispara `.github/workflows/release.yml`, que gera e sobe os pacotes; não envie arquivos à mão ao mesmo tempo. Antes de qualquer tag ou Release, rode testes e confira o instalador. Depois, baixe os arquivos publicados e compare os hashes antes de atualizar os links da landing. Não publique sem pedido explícito de Igor.
- Testes não podem depender do Codex, Claude ou Antigravity instalados: no CI do GitHub eles não existem (use um executável falso no PATH, como em `test/terminais.test.mjs`).

## Estado atual (16/11/2026)

- **0.3.6 pronta localmente, ainda NÃO publicada:** `package.json` 0.3.6, `CHANGELOG.md` e `docs/RELEASE-NOTES-v0.3.6.md` escritos; pacote gerado em `dist/` e `smoke-package` ok. Inclui: `fixProposal` (Nico sem travas ao montar equipe), pasta grande acompanhada no primeiro nível (`snapshot({ shallow })`), `server/known-folders.mjs` (OneDrive), `public/chat-paths.js` (pasta citada no chat), uma janela só para autorizar pasta, prints em pasta própria apagada após a resposta, `AUTH_ERROR` mais preciso. Homologação real em 16/11 com Codex, Claude e Antigravity: arquivos, pasta extra, recusa sem autorização e leitura de print passaram.

- A 0.3.5 foi publicada em `Igorferreirax/code-room-open` (público, MIT). O commit da tag e do `main` remoto é `7a495884902c536e8a4a6afd9ee5f0abf88fc0d5`; a landing publicada aponta para essa versão. O repositório privado `code-room-app` existe, mas está vazio. Não confundir `"private": true` do `package.json` (publicação no npm) com a visibilidade do GitHub.
- O checkout ativo está na branch `codex/035-public-release`, no commit publicado, com mudanças locais **sem commit** após a 0.3.5. Entre elas: print colado/anexado no Nico, autorização de pasta citada no chat geral, reaproveitamento de agente no projeto em foco, testes e documentação de privacidade. Não afirmar que essas mudanças já estão no instalador, na landing ou no GitHub.
- O `main` local aponta para um commit antigo. `origin` aponta ao repositório privado vazio; `legacy-public` busca o repositório público e está configurado sem push. Antes de qualquer publicação futura, conferir branch, remoto e canal de atualização (`DEFAULT_REPO` em `server/updates.mjs`). **Não mudar visibilidade ou remoto por inferência.**
- A decisão atual do Igor é manter o projeto aberto e gratuito enquanto a autonomia e a confiabilidade são corrigidas. Uma eventual venda futura de pacotes não altera a licença MIT da 0.3.5.
- Fonte de retomada: [HANDOFF-CLAUDE-ATUAL.md](docs/HANDOFF-CLAUDE-ATUAL.md) e a última seção de `C:\Users\Igor\Documents\Obsidian Vault\SOFTWARE\CODE-ROOM\contexto\retomada-v1-2026-11-07.md`. `docs/ROADMAP.md`, `docs/ROADMAP-FINAL.md`, `docs/BACKLOG.md` e o handoff datado de 11/11 contêm histórico e não são o estado de publicação atual.
- Prioridade de produto: validar tarefas reais por CLI e o fluxo de aprovação/retomada em instalação independente; depois imagem com IAs autenticadas, instalação/atualização em outra máquina e celular real. Testes simulados e CI não provam esses cenários.
